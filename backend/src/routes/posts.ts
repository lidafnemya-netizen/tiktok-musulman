import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { getUnseenStorySet } from '../lib/stories';
import { z } from 'zod';

const createPostSchema = z.object({
  caption: z.string().max(500).optional(),
  video_url: z.string(),
  thumbnail_url: z.string().optional(),
  media_urls: z.array(z.string().url()).max(10).optional(),
  duration: z.number().min(0),
  sound_id: z.string().uuid().optional(),
  category_ids: z.array(z.string().uuid()).optional(),
  is_public: z.boolean().default(true),
  visibility: z.enum(['PUBLIC', 'FOLLOWERS', 'FRIENDS']).default('PUBLIC'),
  is_draft: z.boolean().default(false),
});

const POST_INCLUDE = {
  user: {
    select: { id: true, username: true, display_name: true, avatar_url: true, is_verified: true },
  },
  sound: {
    select: {
      id: true, title: true, artist: true, url: true,
      origin_user: { select: { id: true, username: true, avatar_url: true } },
    },
  },
  post_categories: { include: { category: { select: { id: true, name: true, slug: true } } } },
} as const;

// TikTok-style engagement score with watch time
function engagementScore(post: {
  like_count: number;
  comment_count: number;
  share_count: number;
  view_count: number;
  created_at: Date;
  avg_watch_ms?: number;
  duration?: number;
}, categoryBoost = 1.0): number {
  const ageHours = (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60);
  const decayFactor = Math.pow(0.97, ageHours);

  // Watch time completion rate bonus (0 to 25 points)
  const durationMs = (post.duration ?? 15) * 1000;
  const completionRate = post.avg_watch_ms ? Math.min(post.avg_watch_ms / durationMs, 1) : 0;
  const watchBonus = completionRate * 25;

  const base =
    post.like_count * 10 +
    post.comment_count * 15 +
    post.share_count * 8 +
    Math.min(post.view_count, 10000) * 0.5 +
    watchBonus * Math.min(post.view_count, 1000);

  return base * decayFactor * categoryBoost;
}

async function getUserPreferredCategories(userId: string): Promise<Set<string>> {
  const recentLikes = await prisma.like.findMany({
    where: { user_id: userId, post_id: { not: null } },
    orderBy: { created_at: 'desc' },
    take: 50,
    include: {
      post: {
        include: { post_categories: { select: { category_id: true } } },
      },
    },
  });

  const cats = new Set<string>();
  for (const like of recentLikes) {
    like.post?.post_categories.forEach(pc => cats.add(pc.category_id));
  }
  return cats;
}

async function buildFeedItems(userId: string, seenIds: string[], poolSize = 80) {
  const preferredCats = await getUserPreferredCategories(userId);

  const posts = await prisma.post.findMany({
    where: {
      is_thread: false,
      user_id: { not: userId },
      status: 'ACTIVE',
      NOT: [
        ...(seenIds.length > 0 ? [{ id: { in: seenIds } }] : []),
        { not_interested: { some: { user_id: userId } } },
        { post_views: { some: { user_id: userId } } },
      ],
    },
    take: poolSize,
    orderBy: { created_at: 'desc' },
    include: {
      ...POST_INCLUDE,
      _count: { select: { likes: true, comments: true } },
    },
  });

  // Restricted-visibility posts (FOLLOWERS/FRIENDS) only show to eligible viewers
  const restrictedAuthorIds = [...new Set(posts.filter(p => p.visibility !== 'PUBLIC').map(p => p.user_id))];
  let followingSet = new Set<string>();
  let friendSet = new Set<string>();
  if (restrictedAuthorIds.length > 0) {
    const [viewerFollows, authorFollowsBack] = await Promise.all([
      prisma.follow.findMany({ where: { follower_id: userId, following_id: { in: restrictedAuthorIds } }, select: { following_id: true } }),
      prisma.follow.findMany({ where: { follower_id: { in: restrictedAuthorIds }, following_id: userId }, select: { follower_id: true } }),
    ]);
    followingSet = new Set(viewerFollows.map(f => f.following_id));
    const followsBackSet = new Set(authorFollowsBack.map(f => f.follower_id));
    friendSet = new Set([...followingSet].filter(id => followsBackSet.has(id)));
  }
  const visiblePosts = posts.filter(p => {
    if (p.visibility === 'PUBLIC') return true;
    if (p.visibility === 'FOLLOWERS') return followingSet.has(p.user_id);
    if (p.visibility === 'FRIENDS') return friendSet.has(p.user_id);
    return true;
  });

  const scored = visiblePosts.map(p => {
    const postCats = new Set(p.post_categories.map(pc => pc.category_id));
    const boost = preferredCats.size > 0 && [...postCats].some(c => preferredCats.has(c)) ? 1.5 : 1.0;
    return { post: p, score: engagementScore(p, boost) };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.post);
}

export async function postRoutes(app: FastifyInstance) {
  // ── FOLLOWING FEED ──────────────────────────────────────────────────
  app.get('/following', { preHandler: authenticate }, async (req, reply) => {
    const userId = req.currentUser!.id;
    const { cursor, limit = '10' } = req.query as { cursor?: string; limit?: string };
    const lim = Math.min(parseInt(limit), 20);

    const follows = await prisma.follow.findMany({
      where: { follower_id: userId },
      select: { following_id: true },
    });
    const ids = follows.map(f => f.following_id);
    if (ids.length === 0) return reply.send({ items: [], next_cursor: null });

    const posts = await prisma.post.findMany({
      where: {
        user_id: { in: ids },
        is_thread: false,
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      take: lim + 1,
      orderBy: { created_at: 'desc' },
      include: {
        ...POST_INCLUDE,
        _count: { select: { likes: true, comments: true } },
      },
    });

    const hasMore = posts.length > lim;
    const items = hasMore ? posts.slice(0, lim) : posts;

    const [likedIds, savedIds, unseenStories] = await Promise.all([
      prisma.like.findMany({
        where: { user_id: userId, post_id: { in: items.map(p => p.id) } },
        select: { post_id: true },
      }),
      prisma.favorite.findMany({
        where: { user_id: userId, post_id: { in: items.map(p => p.id) } },
        select: { post_id: true },
      }),
      getUnseenStorySet(userId, items.map(p => p.user.id)),
    ]);
    const likedSet = new Set(likedIds.map(l => l.post_id));
    const savedSet = new Set(savedIds.map(s => s.post_id));

    return reply.send({
      items: items.map(p => ({
        ...p, is_liked: likedSet.has(p.id), is_saved: savedSet.has(p.id),
        like_count: p.like_count, comment_count: p.comment_count,
        user: { ...p.user, is_following: true, has_unseen_story: unseenStories.has(p.user.id) },
      })),
      next_cursor: hasMore ? items[items.length - 1].id : null,
    });
  });

  // ── FEED (TikTok algorithm) ─────────────────────────────────────────
  app.get('/feed', { preHandler: authenticate }, async (req, reply) => {
    const { cursor, limit = '10', seen } = req.query as {
      cursor?: string; limit?: string; seen?: string;
    };
    const lim = Math.min(parseInt(limit), 20);
    const seenIds = seen ? seen.split(',').filter(Boolean) : [];

    const allScored = await buildFeedItems(req.currentUser!.id, seenIds);

    // Cursor: find index of cursor post, skip forward
    let startIdx = 0;
    if (cursor) {
      const idx = allScored.findIndex(p => p.id === cursor);
      startIdx = idx >= 0 ? idx + 1 : 0;
    }

    const page = allScored.slice(startIdx, startIdx + lim + 1);
    const hasMore = page.length > lim;
    const items = hasMore ? page.slice(0, lim) : page;

    const userIds = [...new Set(items.map(p => p.user.id))];
    const [likedIds, savedIds, followedIds, unseenStories] = await Promise.all([
      prisma.like.findMany({
        where: { user_id: req.currentUser!.id, post_id: { in: items.map(p => p.id) } },
        select: { post_id: true },
      }),
      prisma.favorite.findMany({
        where: { user_id: req.currentUser!.id, post_id: { in: items.map(p => p.id) } },
        select: { post_id: true },
      }),
      prisma.follow.findMany({
        where: { follower_id: req.currentUser!.id, following_id: { in: userIds } },
        select: { following_id: true },
      }),
      getUnseenStorySet(req.currentUser!.id, userIds),
    ]);
    const likedSet = new Set(likedIds.map(l => l.post_id));
    const savedSet = new Set(savedIds.map(s => s.post_id));
    const followedSet = new Set(followedIds.map(f => f.following_id));

    const result = items.map(p => ({
      ...p,
      like_count: p.like_count,
      comment_count: p.comment_count,
      is_liked: likedSet.has(p.id),
      is_saved: savedSet.has(p.id),
      categories: p.post_categories.map(pc => pc.category),
      post_categories: undefined,
      user: { ...p.user, is_following: followedSet.has(p.user.id), has_unseen_story: unseenStories.has(p.user.id) },
    }));

    return reply.send({ items: result, next_cursor: hasMore ? items[items.length - 1].id : null });
  });

  // ── TRENDING ────────────────────────────────────────────────────────
  app.get('/trending', { preHandler: authenticate }, async (req, reply) => {
    const { category, limit = '10', cursor } = req.query as { category?: string; limit?: string; cursor?: string };
    const lim = parseInt(limit);
    const userId = req.currentUser!.id;

    const where: Record<string, unknown> = {
      is_thread: false, status: 'ACTIVE', is_public: true,
      NOT: { not_interested: { some: { user_id: userId } } },
    };

    if (category && category !== 'all') {
      const cat = await prisma.category.findFirst({ where: { slug: category } });
      if (cat) where.post_categories = { some: { category_id: cat.id } };
    }

    const posts = await prisma.post.findMany({
      where,
      take: lim * 5,
      orderBy: { view_count: 'desc' },
      include: { ...POST_INCLUDE, _count: { select: { likes: true, comments: true } } },
    });

    const scored = posts
      .map(p => ({ post: p, score: engagementScore(p) }))
      .sort((a, b) => b.score - a.score);

    // Apply cursor-based pagination on scored list
    let startIdx = 0;
    if (cursor) {
      const idx = scored.findIndex(s => s.post.id === cursor);
      startIdx = idx >= 0 ? idx + 1 : 0;
    }
    const page = scored.slice(startIdx, startIdx + lim + 1);
    const hasMore = page.length > lim;
    const items = hasMore ? page.slice(0, lim) : page;

    const itemPosts = items.map(s => s.post);
    const userIds = [...new Set(itemPosts.map(p => p.user.id))];
    const [likedIds, savedIds, followedIds, unseenStories] = await Promise.all([
      prisma.like.findMany({ where: { user_id: userId, post_id: { in: itemPosts.map(p => p.id) } }, select: { post_id: true } }),
      prisma.favorite.findMany({ where: { user_id: userId, post_id: { in: itemPosts.map(p => p.id) } }, select: { post_id: true } }),
      prisma.follow.findMany({ where: { follower_id: userId, following_id: { in: userIds } }, select: { following_id: true } }),
      getUnseenStorySet(userId, userIds),
    ]);
    const likedSet = new Set(likedIds.map(l => l.post_id));
    const savedSet = new Set(savedIds.map(s => s.post_id));
    const followedSet = new Set(followedIds.map(f => f.following_id));

    return reply.send({
      items: itemPosts.map(p => ({
        ...p,
        is_liked: likedSet.has(p.id),
        is_saved: savedSet.has(p.id),
        categories: p.post_categories.map(pc => pc.category),
        post_categories: undefined,
        user: { ...p.user, is_following: followedSet.has(p.user.id), has_unseen_story: unseenStories.has(p.user.id) },
      })),
      next_cursor: hasMore ? items[items.length - 1].post.id : null,
    });
  });

  // ── VIEW TRACKING + WATCH TIME ─────────────────────────────────────
  app.post('/:id/view', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { watch_time = 0, completed = false } = req.body as { watch_time?: number; completed?: boolean };
    const userId = req.currentUser!.id;

    const existingView = await prisma.postView.findUnique({
      where: { user_id_post_id: { user_id: userId, post_id: id } },
    });

    await prisma.postView.upsert({
      where: { user_id_post_id: { user_id: userId, post_id: id } },
      create: { user_id: userId, post_id: id, watch_time_ms: Math.round(watch_time * 1000), completed },
      update: { watch_time_ms: { increment: Math.round(watch_time * 1000) }, completed: completed || undefined },
    }).catch(() => {});

    if (!existingView) {
      await prisma.post.update({
        where: { id },
        data: { view_count: { increment: 1 } },
      }).catch(() => {});
    }

    return reply.send({ ok: true });
  });

  // ── CREATE POST ─────────────────────────────────────────────────────
  app.post('/', { preHandler: authenticate }, async (req, reply) => {
    const parsed = createPostSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const { category_ids, is_draft, ...data } = parsed.data;

    const post = await prisma.$transaction(async (tx) => {
      const p = await tx.post.create({
        data: { ...data, status: is_draft ? 'DRAFT' : 'ACTIVE', user_id: req.currentUser!.id },
      });
      if (category_ids?.length) {
        await tx.postCategory.createMany({
          data: category_ids.map((cid) => ({ post_id: p.id, category_id: cid })),
          skipDuplicates: true,
        });
      }
      if (!is_draft) {
        await tx.user.update({
          where: { id: req.currentUser!.id },
          data: { post_count: { increment: 1 } },
        });
      }
      // First post to use this sound claims it as the sound's origin.
      if (data.sound_id) {
        await tx.sound.updateMany({
          where: { id: data.sound_id, origin_user_id: null },
          data: { origin_user_id: req.currentUser!.id },
        });
      }
      return p;
    });

    return reply.status(201).send(post);
  });

  // ── GET ONE ─────────────────────────────────────────────────────────
  app.get('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const post = await prisma.post.findUnique({
      where: { id, status: 'ACTIVE' },
      include: { ...POST_INCLUDE, _count: { select: { likes: true, comments: true } } },
    });
    if (!post) return reply.status(404).send({ error: 'Post not found' });

    const [isLiked, isSaved] = await Promise.all([
      prisma.like.findUnique({
        where: { user_id_post_id: { user_id: req.currentUser!.id, post_id: id } },
      }),
      prisma.favorite.findUnique({
        where: { user_id_post_id: { user_id: req.currentUser!.id, post_id: id } },
      }),
    ]);

    return reply.send({
      ...post,
      is_liked: !!isLiked,
      is_saved: !!isSaved,
      categories: post.post_categories.map(pc => pc.category),
      post_categories: undefined,
    });
  });

  // ── DELETE ──────────────────────────────────────────────────────────
  app.delete('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) return reply.status(404).send({ error: 'Not found' });
    if (post.user_id !== req.currentUser!.id && req.currentUser!.role === 'USER') {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    await prisma.$transaction([
      prisma.post.delete({ where: { id } }),
      prisma.user.update({ where: { id: post.user_id }, data: { post_count: { decrement: 1 } } }),
    ]);
    return reply.send({ success: true });
  });

  // ── EDIT (caption/visibility only, owner-only) ───────────────────────
  const editPostSchema = z.object({
    caption: z.string().max(500).optional(),
    visibility: z.enum(['PUBLIC', 'FOLLOWERS', 'FRIENDS']).optional(),
  });
  app.patch('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = editPostSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const post = await prisma.post.findUnique({ where: { id }, select: { user_id: true } });
    if (!post) return reply.status(404).send({ error: 'Not found' });
    if (post.user_id !== req.currentUser!.id) return reply.status(403).send({ error: 'Forbidden' });

    const updated = await prisma.post.update({ where: { id }, data: parsed.data });
    return reply.send(updated);
  });

  // ── PIN / UNPIN (max 3 pinned posts, owner-only) ─────────────────────
  app.post('/:id/pin', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = req.currentUser!.id;
    const post = await prisma.post.findUnique({ where: { id }, select: { user_id: true, is_pinned: true } });
    if (!post) return reply.status(404).send({ error: 'Not found' });
    if (post.user_id !== userId) return reply.status(403).send({ error: 'Forbidden' });

    if (post.is_pinned) {
      await prisma.post.update({ where: { id }, data: { is_pinned: false, pinned_at: null } });
      return reply.send({ pinned: false });
    }

    const pinnedCount = await prisma.post.count({ where: { user_id: userId, is_pinned: true } });
    if (pinnedCount >= 3) {
      return reply.status(400).send({ error: 'Tu ne peux épingler que 3 publications maximum.' });
    }
    await prisma.post.update({ where: { id }, data: { is_pinned: true, pinned_at: new Date() } });
    return reply.send({ pinned: true });
  });

  // ── LIKE / UNLIKE ───────────────────────────────────────────────────
  app.post('/:id/like', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = req.currentUser!.id;

    const existing = await prisma.like.findUnique({
      where: { user_id_post_id: { user_id: userId, post_id: id } },
    });

    if (existing) {
      await prisma.$transaction([
        prisma.like.delete({ where: { user_id_post_id: { user_id: userId, post_id: id } } }),
        prisma.post.update({ where: { id }, data: { like_count: { decrement: 1 } } }),
      ]);
      return reply.send({ liked: false });
    }

    const post = await prisma.post.findUnique({ where: { id }, select: { user_id: true } });
    if (!post) return reply.status(404).send({ error: 'Post not found' });

    await prisma.$transaction([
      prisma.like.create({ data: { user_id: userId, post_id: id } }),
      prisma.post.update({ where: { id }, data: { like_count: { increment: 1 } } }),
    ]);

    if (post.user_id !== userId) {
      const liker = await prisma.user.findUnique({ where: { id: userId }, select: { display_name: true, username: true } });
      const name = liker?.display_name ?? liker?.username ?? 'Quelqu\'un';
      await prisma.notification.create({
        data: {
          user_id: post.user_id,
          type: 'LIKE',
          title: `${name} a aimé ta vidéo`,
          body: `${name} a aimé ta publication`,
          data: { post_id: id, user_id: userId },
        },
      }).catch(() => {});
    }

    return reply.send({ liked: true });
  });

  // ── LIKED POSTS ─────────────────────────────────────────────────────
  app.get('/liked', { preHandler: authenticate }, async (req, reply) => {
    const userId = req.currentUser!.id;
    const { cursor, limit = '12' } = req.query as { cursor?: string; limit?: string };

    // Only real posts, exclude threads
    const likes = await prisma.like.findMany({
      where: {
        user_id: userId,
        post_id: { not: null },
        post: { is_thread: false },
      },
      take: parseInt(limit) + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { created_at: 'desc' },
      include: {
        post: {
          select: { id: true, thumbnail_url: true, video_url: true, view_count: true, like_count: true },
        },
      },
    });

    const hasMore = likes.length > parseInt(limit);
    const items = hasMore ? likes.slice(0, -1) : likes;
    return reply.send({
      items: items.map((l) => l.post).filter(Boolean),
      next_cursor: hasMore ? items[items.length - 1].id : null,
    });
  });

  // ── HASHTAG POSTS ──────────────────────────────────────────────────────
  app.get('/hashtag/:tag', { preHandler: authenticate }, async (req, reply) => {
    const { tag } = req.params as { tag: string };
    const { cursor, limit = '18' } = req.query as { cursor?: string; limit?: string };
    const lim = parseInt(limit);

    const category = await prisma.category.findFirst({ where: { name: { equals: tag, mode: 'insensitive' } } });
    const categoryId = category?.id;

    const where = categoryId
      ? { status: 'ACTIVE' as const, is_public: true, post_categories: { some: { category_id: categoryId } } }
      : { status: 'ACTIVE' as const, is_public: true, caption: { contains: `#${tag}`, mode: 'insensitive' as const } };

    const posts = await prisma.post.findMany({
      where,
      take: lim + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { view_count: 'desc' },
      select: {
        id: true, thumbnail_url: true, video_url: true,
        view_count: true, like_count: true, comment_count: true, caption: true,
        user: { select: { id: true, username: true, display_name: true, avatar_url: true } },
      },
    });

    const hasMore = posts.length > lim;
    const items = hasMore ? posts.slice(0, -1) : posts;
    return reply.send({ items, total: category?.post_count ?? items.length, next_cursor: hasMore ? items[items.length - 1].id : null });
  });

  // ── USER POSTS ──────────────────────────────────────────────────────
  app.get('/user/:userId', { preHandler: authenticate }, async (req, reply) => {
    const { userId } = req.params as { userId: string };
    const { cursor, limit = '12', drafts_only } = req.query as { cursor?: string; limit?: string; drafts_only?: string };

    const viewerId = req.currentUser!.id;
    const isOwner = viewerId === userId;
    const postSelect = {
      id: true, thumbnail_url: true, video_url: true, media_urls: true,
      caption: true, duration: true, view_count: true, visibility: true,
      like_count: true, comment_count: true, created_at: true, status: true, is_pinned: true,
      user: { select: { id: true, username: true, display_name: true, avatar_url: true, is_verified: true } },
      sound: {
        select: {
          id: true, title: true, artist: true, url: true,
          origin_user: { select: { id: true, username: true, avatar_url: true } },
        },
      },
    } as const;

    // Drafts browsing mode — swipe through just the drafts (owner only)
    if (drafts_only === '1') {
      if (!isOwner) return reply.send({ items: [], next_cursor: null });
      const draftItems = await prisma.post.findMany({
        where: { user_id: userId, is_thread: false, status: 'DRAFT' },
        orderBy: { created_at: 'desc' },
        select: postSelect,
      });
      return reply.send({
        items: draftItems.map(p => ({ ...p, is_draft: true, user: { ...p.user, is_following: false } })),
        next_cursor: null,
      });
    }

    const draftCount = isOwner
      ? await prisma.post.count({ where: { user_id: userId, is_thread: false, status: 'DRAFT' } })
      : 0;

    // Pinned posts (max 3) occupy the next slots on the first page only —
    // excluded from the regular chronological list so they don't repeat.
    const pinned = !cursor
      ? await prisma.post.findMany({
          where: { user_id: userId, is_thread: false, status: 'ACTIVE', is_pinned: true },
          orderBy: { pinned_at: 'desc' },
          take: 3,
          select: postSelect,
        })
      : [];

    const posts = await prisma.post.findMany({
      where: { user_id: userId, is_thread: false, status: 'ACTIVE', is_pinned: false },
      take: parseInt(limit) + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { created_at: 'desc' },
      select: postSelect,
    });

    const hasMore = posts.length > parseInt(limit);
    const items = hasMore ? posts.slice(0, -1) : posts;
    const allItems = [...pinned, ...items];

    const [likedIds, savedIds, isFollowing, unseenStories] = await Promise.all([
      prisma.like.findMany({ where: { user_id: viewerId, post_id: { in: allItems.map(p => p.id) } }, select: { post_id: true } }),
      prisma.favorite.findMany({ where: { user_id: viewerId, post_id: { in: allItems.map(p => p.id) } }, select: { post_id: true } }),
      isOwner ? Promise.resolve(false) : prisma.follow.findUnique({ where: { follower_id_following_id: { follower_id: viewerId, following_id: userId } } }).then(Boolean),
      getUnseenStorySet(viewerId, [userId]),
    ]);
    const likedSet = new Set(likedIds.map(l => l.post_id));
    const savedSet = new Set(savedIds.map(s => s.post_id));
    const hasUnseenStory = unseenStories.has(userId);

    return reply.send({
      items: allItems.map(p => ({
        ...p,
        is_draft: false,
        is_liked: likedSet.has(p.id),
        is_saved: savedSet.has(p.id),
        user: { ...p.user, is_following: isFollowing, has_unseen_story: hasUnseenStory },
      })),
      draft_count: draftCount,
      next_cursor: hasMore ? items[items.length - 1].id : null,
    });
  });

  // ── REPOST ──────────────────────────────────────────────────────────
  app.post('/:id/repost', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = req.currentUser!.id;
    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) return reply.status(404).send({ error: 'Not found' });

    const existing = await prisma.repost.findUnique({ where: { user_id_post_id: { user_id: userId, post_id: id } } });
    if (existing) {
      await prisma.repost.delete({ where: { id: existing.id } });
      await prisma.post.update({ where: { id }, data: { share_count: { decrement: 1 } } });
      return reply.send({ reposted: false });
    }
    await prisma.repost.create({ data: { user_id: userId, post_id: id } });
    await prisma.post.update({ where: { id }, data: { share_count: { increment: 1 } } });
    return reply.send({ reposted: true });
  });

  app.get('/user/:userId/reposts', { preHandler: authenticate }, async (req, reply) => {
    const { userId } = req.params as { userId: string };
    const { cursor, limit = '12' } = req.query as { cursor?: string; limit?: string };
    const reposts = await prisma.repost.findMany({
      where: { user_id: userId },
      take: parseInt(limit) + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { created_at: 'desc' },
      include: {
        post: {
          select: { id: true, thumbnail_url: true, video_url: true, view_count: true, like_count: true, comment_count: true },
        },
        user: { select: { id: true, username: true, display_name: true, avatar_url: true } },
      },
    });
    const hasMore = reposts.length > parseInt(limit);
    const items = hasMore ? reposts.slice(0, -1) : reposts;
    return reply.send({ items, next_cursor: hasMore ? items[items.length - 1].id : null });
  });

  // ── NOT INTERESTED ──────────────────────────────────────────────────
  app.post('/:id/not-interested', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = req.currentUser!.id;
    await prisma.notInterested.upsert({
      where: { user_id_post_id: { user_id: userId, post_id: id } },
      create: { user_id: userId, post_id: id },
      update: {},
    });
    return reply.send({ success: true });
  });

  // ── SHARE CONTACTS ──────────────────────────────────────────────────
  app.get('/share-contacts', { preHandler: authenticate }, async (req, reply) => {
    const userId = req.currentUser!.id;
    const requests = await prisma.conversationRequest.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ requester_id: userId }, { recipient_id: userId }],
      },
      orderBy: { updated_at: 'desc' },
      take: 20,
      include: {
        requester: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        recipient: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        conversation: { select: { id: true } },
      },
    });
    const contacts = requests.map(r => {
      const other = r.requester_id === userId ? r.recipient : r.requester;
      return { ...other, conversation_id: r.conversation?.id ?? null };
    });
    return reply.send({ items: contacts });
  });
}
