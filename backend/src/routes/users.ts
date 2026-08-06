import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { getUnseenStorySet } from '../lib/stories';
import { z } from 'zod';

// Only fields that exist in the User DB model
const updateProfileSchema = z.object({
  display_name: z.string().min(1).max(50).optional(),
  bio: z.string().max(300).optional().nullable(),
  avatar_url: z.string().optional().nullable(),
  cover_url: z.string().optional().nullable(),
}).passthrough(); // allow extra keys from mobile settings

export async function userRoutes(app: FastifyInstance) {
  app.get('/search', { preHandler: authenticate }, async (req, reply) => {
    const { q, cursor, limit = '20' } = req.query as { q: string; cursor?: string; limit?: string };
    if (!q) return reply.status(400).send({ error: 'Query required' });

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { display_name: { contains: q, mode: 'insensitive' } },
        ],
        is_banned: false,
      },
      take: parseInt(limit) + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, username: true, display_name: true,
        avatar_url: true, is_verified: true, follower_count: true,
      },
    });

    const hasMore = users.length > parseInt(limit);
    const items = hasMore ? users.slice(0, -1) : users;
    return reply.send({ items, next_cursor: hasMore ? items[items.length - 1].id : null });
  });

  app.get('/:username', { preHandler: authenticate }, async (req, reply) => {
    const { username } = req.params as { username: string };
    const viewerId = req.currentUser!.id;
    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true, username: true, display_name: true, bio: true,
        avatar_url: true, cover_url: true, is_verified: true, gender: true,
        follower_count: true, following_count: true, post_count: true,
        created_at: true,
      },
    });
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const [isFollowing, activeLive, unseenStories, likeSum, viewer] = await Promise.all([
      prisma.follow.findUnique({
        where: { follower_id_following_id: { follower_id: viewerId, following_id: user.id } },
      }),
      prisma.liveSession.findFirst({
        where: { user_id: user.id, is_active: true },
        select: { id: true },
      }),
      getUnseenStorySet(viewerId, [user.id]),
      prisma.post.aggregate({ where: { user_id: user.id, status: 'ACTIVE', is_thread: false }, _sum: { like_count: true } }),
      prisma.user.findUnique({ where: { id: viewerId }, select: { profile_view_enabled: true } }),
    ]);

    // Record the visit only if the viewer opted into profile-view tracking (reciprocal privacy).
    if (viewerId !== user.id && viewer?.profile_view_enabled) {
      prisma.profileView.create({ data: { viewer_id: viewerId, viewed_id: user.id } }).catch(() => {});
    }

    return reply.send({
      ...user,
      like_count: likeSum._sum.like_count ?? 0,
      is_following: !!isFollowing,
      active_live_session_id: activeLive?.id ?? null,
      has_unseen_story: unseenStories.has(user.id),
    });
  });

  // ── PROFILE VIEW TRACKING ────────────────────────────────────────────────────
  app.patch('/me/profile-view-setting', { preHandler: authenticate }, async (req, reply) => {
    const { enabled } = req.body as { enabled: boolean };
    await prisma.user.update({ where: { id: req.currentUser!.id }, data: { profile_view_enabled: !!enabled } });
    return reply.send({ enabled: !!enabled });
  });

  app.get('/me/profile-views', { preHandler: authenticate }, async (req, reply) => {
    const userId = req.currentUser!.id;
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { profile_view_enabled: true, profile_views_checked_at: true } });
    if (!me?.profile_view_enabled) {
      return reply.send({ enabled: false, count: 0, items: [] });
    }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const lastCheckedAt = me.profile_views_checked_at;

    const views = await prisma.profileView.findMany({
      where: { viewed_id: userId, created_at: { gte: since } },
      orderBy: { created_at: 'desc' },
      distinct: ['viewer_id'],
      take: 100,
      include: { viewer: { select: { id: true, username: true, display_name: true, avatar_url: true, is_verified: true } } },
    });

    await prisma.user.update({ where: { id: userId }, data: { profile_views_checked_at: new Date() } });

    return reply.send({
      enabled: true,
      count: views.length,
      items: views.map((v) => ({
        ...v.viewer,
        viewed_at: v.created_at,
        is_new: !lastCheckedAt || v.created_at > lastCheckedAt,
      })),
    });
  });

  // ── CREATOR NOTIFICATION SUBSCRIPTION ───────────────────────────────────────
  app.patch('/:id/follow-notifications', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { notify_post, notify_live, notify_story } = req.body as { notify_post?: boolean; notify_live?: boolean; notify_story?: boolean };
    const follow = await prisma.follow.findUnique({
      where: { follower_id_following_id: { follower_id: req.currentUser!.id, following_id: id } },
    });
    if (!follow) return reply.status(403).send({ error: 'Vous devez être abonné pour gérer ces notifications.' });

    const data: Record<string, boolean> = {};
    if (notify_post !== undefined) data.notify_post = notify_post;
    if (notify_live !== undefined) data.notify_live = notify_live;
    if (notify_story !== undefined) data.notify_story = notify_story;

    const updated = await prisma.follow.update({
      where: { follower_id_following_id: { follower_id: req.currentUser!.id, following_id: id } },
      data,
    });
    return reply.send({
      notify_post: updated.notify_post, notify_live: updated.notify_live, notify_story: updated.notify_story,
    });
  });

  app.get('/:id/follow-notifications', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const follow = await prisma.follow.findUnique({
      where: { follower_id_following_id: { follower_id: req.currentUser!.id, following_id: id } },
    });
    if (!follow) return reply.status(403).send({ error: 'Not following' });
    return reply.send({
      notify_post: follow.notify_post, notify_live: follow.notify_live, notify_story: follow.notify_story,
    });
  });

  app.patch('/me', { preHandler: authenticate }, async (req, reply) => {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    // Only update fields that exist in User model
    const { display_name, bio, avatar_url, cover_url } = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (display_name !== undefined) updateData.display_name = display_name;
    if (bio !== undefined) updateData.bio = bio;
    if (avatar_url !== undefined) updateData.avatar_url = avatar_url;
    if (cover_url !== undefined) updateData.cover_url = cover_url;

    if (Object.keys(updateData).length === 0) {
      // Nothing to update in DB (e.g. settings-only patch)
      const me = await prisma.user.findUnique({ where: { id: req.currentUser!.id }, select: { id: true, username: true, display_name: true, bio: true, avatar_url: true, cover_url: true, is_verified: true } });
      return reply.send(me);
    }

    const user = await prisma.user.update({
      where: { id: req.currentUser!.id },
      data: updateData,
      select: { id: true, username: true, display_name: true, bio: true, avatar_url: true, cover_url: true, is_verified: true },
    });
    return reply.send(user);
  });

  app.post('/:id/follow', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const currentId = req.currentUser!.id;

    if (id === currentId) return reply.status(400).send({ error: 'Cannot follow yourself' });

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return reply.status(404).send({ error: 'User not found' });

    const existing = await prisma.follow.findUnique({
      where: { follower_id_following_id: { follower_id: currentId, following_id: id } },
    });

    if (existing) {
      await prisma.$transaction([
        prisma.follow.delete({
          where: { follower_id_following_id: { follower_id: currentId, following_id: id } },
        }),
        prisma.user.update({ where: { id: currentId }, data: { following_count: { decrement: 1 } } }),
        prisma.user.update({ where: { id }, data: { follower_count: { decrement: 1 } } }),
      ]);
      return reply.send({ following: false });
    }

    await prisma.$transaction([
      prisma.follow.create({ data: { follower_id: currentId, following_id: id } }),
      prisma.user.update({ where: { id: currentId }, data: { following_count: { increment: 1 } } }),
      prisma.user.update({ where: { id }, data: { follower_count: { increment: 1 } } }),
    ]);

    const follower = await prisma.user.findUnique({ where: { id: currentId }, select: { display_name: true, username: true } });
    await prisma.notification.create({
      data: {
        user_id: id,
        type: 'FOLLOW',
        title: `${follower?.display_name ?? follower?.username ?? 'Quelqu\'un'} s'est abonné à toi`,
        body: `${follower?.display_name} (@${follower?.username}) s'est abonné à toi`,
        data: { user_id: currentId },
      },
    }).catch(() => {});

    return reply.send({ following: true });
  });

  app.get('/:id/followers', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { cursor, limit = '20' } = req.query as { cursor?: string; limit?: string };

    const follows = await prisma.follow.findMany({
      where: { following_id: id },
      take: parseInt(limit) + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        follower: {
          select: { id: true, username: true, display_name: true, avatar_url: true, is_verified: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const hasMore = follows.length > parseInt(limit);
    const items = hasMore ? follows.slice(0, -1) : follows;
    return reply.send({
      items: items.map((f) => f.follower),
      next_cursor: hasMore ? items[items.length - 1].id : null,
    });
  });

  app.get('/:id/following', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { cursor, limit = '20' } = req.query as { cursor?: string; limit?: string };

    const follows = await prisma.follow.findMany({
      where: { follower_id: id },
      take: parseInt(limit) + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        following: {
          select: { id: true, username: true, display_name: true, avatar_url: true, is_verified: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const hasMore = follows.length > parseInt(limit);
    const items = hasMore ? follows.slice(0, -1) : follows;
    return reply.send({
      items: items.map((f) => f.following),
      next_cursor: hasMore ? items[items.length - 1].id : null,
    });
  });

  // ── CREATOR STATS ────────────────────────────────────────────────────────────
  app.get('/me/stats', { preHandler: authenticate }, async (req, reply) => {
    const userId = req.currentUser!.id;
    const [posts, views] = await Promise.all([
      prisma.post.findMany({
        where: { user_id: userId },
        select: { id: true, caption: true, view_count: true, like_count: true, comment_count: true, share_count: true, thumbnail_url: true, created_at: true },
        orderBy: { view_count: 'desc' },
        take: 20,
      }),
      prisma.postView.aggregate({
        where: { post: { user_id: userId } },
        _count: { id: true },
        _sum: { watch_time_ms: true },
      }),
    ]);

    const completedViews = await prisma.postView.count({
      where: { post: { user_id: userId }, completed: true },
    });

    const totalViews = views._count.id;
    const completionRate = totalViews > 0 ? Math.round((completedViews / totalViews) * 100) : 0;
    const totalWatchMs = views._sum.watch_time_ms ?? 0;

    return reply.send({
      total_views: posts.reduce((s, p) => s + p.view_count, 0),
      total_likes: posts.reduce((s, p) => s + p.like_count, 0),
      total_comments: posts.reduce((s, p) => s + p.comment_count, 0),
      completion_rate: completionRate,
      total_watch_ms: totalWatchMs,
      top_posts: posts.slice(0, 10),
    });
  });

  // ── BLOCK / UNBLOCK ─────────────────────────────────────────────────────────
  app.post('/:id/block', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const blockerId = req.currentUser!.id;
    if (id === blockerId) return reply.status(400).send({ error: 'Cannot block yourself' });

    const existing = await prisma.blockedUser.findUnique({
      where: { blocker_id_blocked_id: { blocker_id: blockerId, blocked_id: id } },
    });
    if (existing) {
      await prisma.blockedUser.delete({ where: { blocker_id_blocked_id: { blocker_id: blockerId, blocked_id: id } } });
      return reply.send({ blocked: false });
    }
    await prisma.blockedUser.create({ data: { blocker_id: blockerId, blocked_id: id } });
    return reply.send({ blocked: true });
  });

  // ── HIDE FROM FEED ───────────────────────────────────────────────────────────
  app.post('/:id/hide', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = req.currentUser!.id;
    await prisma.hiddenUser.upsert({
      where: { user_id_hidden_id: { user_id: userId, hidden_id: id } },
      create: { user_id: userId, hidden_id: id },
      update: {},
    });
    return reply.send({ hidden: true });
  });

  // ── REPORTS ──────────────────────────────────────────────────────────────────
  app.post('/reports', { preHandler: authenticate }, async (req, reply) => {
    const { target_type, target_id, reason } = req.body as { target_type: string; target_id: string; reason: string };
    if (!target_type || !target_id || !reason) return reply.status(400).send({ error: 'Champs manquants' });

    await prisma.report.create({
      data: {
        reporter_id: req.currentUser!.id,
        [target_type === 'user' ? 'reported_user_id' : 'post_id']: target_id,
        reason,
      },
    }).catch(() => {});
    return reply.send({ success: true });
  });

  app.delete('/me/account', { preHandler: authenticate }, async (req, reply) => {
    await prisma.user.delete({ where: { id: req.currentUser!.id } });
    await prisma.auditLog.create({
      data: { user_id: req.currentUser!.id, action: 'DELETE_ACCOUNT', entity: 'User' },
    });
    return reply.send({ success: true });
  });
}
