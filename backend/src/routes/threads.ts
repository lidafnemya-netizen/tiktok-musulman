import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';

const createThreadSchema = z.object({
  content: z.string().min(1).max(500),
  reply_to_id: z.string().uuid().optional(),
  media_url: z.string().url().optional(),
  media_type: z.enum(['image', 'video']).optional(),
  media_urls: z.array(z.string().url()).max(10).optional(),
});

export async function threadRoutes(app: FastifyInstance) {
  // GET /threads — paginated feed
  app.get('/', { preHandler: authenticate }, async (req, reply) => {
    const { cursor, limit = '15', user_id } = req.query as { cursor?: string; limit?: string; user_id?: string };
    const lim = parseInt(limit);

    const threads = await prisma.post.findMany({
      where: {
        status: 'ACTIVE',
        is_public: true,
        is_thread: true,
        ...(user_id ? { user_id } : {}),
      },
      take: lim + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ like_count: 'desc' }, { created_at: 'desc' }],
      include: {
        user: {
          select: { id: true, username: true, display_name: true, avatar_url: true, is_verified: true },
        },
        _count: { select: { likes: true, comments: true } },
      },
    });

    const hasMore = threads.length > lim;
    const items = hasMore ? threads.slice(0, -1) : threads;

    const [likedIds, repostedIds] = await Promise.all([
      prisma.like.findMany({
        where: { user_id: req.currentUser!.id, post_id: { in: items.map(t => t.id) } },
        select: { post_id: true },
      }),
      prisma.repost.findMany({
        where: { user_id: req.currentUser!.id, post_id: { in: items.map(t => t.id) } },
        select: { post_id: true },
      }),
    ]);
    const likedSet = new Set(likedIds.map(l => l.post_id));
    const repostedSet = new Set(repostedIds.map(r => r.post_id));

    const result = items.map(t => ({
      id: t.id,
      content: t.caption ?? '',
      like_count: t.like_count,
      reply_count: t._count.comments,
      repost_count: t.share_count,
      is_liked: likedSet.has(t.id),
      is_reposted: repostedSet.has(t.id),
      created_at: t.created_at,
      user: t.user,
      thumbnail_url: t.thumbnail_url,
      media_urls: t.media_urls,
    }));

    return reply.send({ items: result, next_cursor: hasMore ? items[items.length - 1].id : null });
  });

  // POST /threads — create a text thread
  app.post('/', { preHandler: authenticate }, async (req, reply) => {
    const parsed = createThreadSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const thread = await prisma.$transaction(async (tx) => {
      const extras = parsed.data.media_urls ?? [];
      const primaryImage = parsed.data.media_type === 'image' ? parsed.data.media_url : (extras[0] ?? null);
      const t = await tx.post.create({
        data: {
          user_id: req.currentUser!.id,
          video_url: parsed.data.media_type === 'video' ? (parsed.data.media_url ?? '') : '',
          thumbnail_url: primaryImage,
          media_urls: extras,
          caption: parsed.data.content,
          duration: 0,
          is_public: true,
          status: 'ACTIVE',
          is_thread: true,
        },
      });
      await tx.user.update({
        where: { id: req.currentUser!.id },
        data: { post_count: { increment: 1 } },
      });
      return t;
    });

    return reply.status(201).send({
      id: thread.id,
      content: thread.caption,
      like_count: 0,
      reply_count: 0,
      repost_count: 0,
      is_liked: false,
      created_at: thread.created_at,
    });
  });

  // GET /threads/:id — single thread
  app.get('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = req.currentUser!.id;
    const thread = await prisma.post.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, username: true, display_name: true, avatar_url: true, is_verified: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });
    if (!thread) return reply.status(404).send({ error: 'Not found' });
    const isLiked = await prisma.like.findUnique({ where: { user_id_post_id: { user_id: userId, post_id: id } } });
    return reply.send({
      id: thread.id, content: thread.caption ?? '',
      like_count: thread.like_count, reply_count: thread._count.comments,
      is_liked: !!isLiked, created_at: thread.created_at, user: thread.user,
    });
  });

  // GET /threads/:id/replies
  app.get('/:id/replies', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = req.currentUser!.id;
    const replies = await prisma.post.findMany({
      where: { reply_to_id: id, status: 'ACTIVE' },
      orderBy: { created_at: 'asc' },
      take: 50,
      include: {
        user: { select: { id: true, username: true, display_name: true, avatar_url: true, is_verified: true } },
      },
    });
    const likedIds = await prisma.like.findMany({ where: { user_id: userId, post_id: { in: replies.map(r => r.id) } }, select: { post_id: true } });
    const likedSet = new Set(likedIds.map(l => l.post_id));
    return reply.send({
      items: replies.map(r => ({
        id: r.id, content: r.caption ?? '', like_count: r.like_count,
        reply_count: 0, is_liked: likedSet.has(r.id), created_at: r.created_at, user: r.user,
      })),
    });
  });

  // GET /threads/liked — threads liked by the current user
  app.get('/liked', { preHandler: authenticate }, async (req, reply) => {
    const userId = req.currentUser!.id;
    const { cursor, limit = '15' } = req.query as { cursor?: string; limit?: string };
    const lim = parseInt(limit);

    const likes = await prisma.like.findMany({
      where: {
        user_id: userId,
        post: { is_thread: true, status: 'ACTIVE' },
      },
      take: lim + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { created_at: 'desc' },
      include: {
        post: {
          include: {
            user: { select: { id: true, username: true, display_name: true, avatar_url: true, is_verified: true } },
            _count: { select: { comments: true } },
          },
        },
      },
    });

    const hasMore = likes.length > lim;
    const items = hasMore ? likes.slice(0, -1) : likes;

    return reply.send({
      items: items
        .filter(l => l.post)
        .map(l => ({
          id: l.post!.id,
          content: l.post!.caption ?? '',
          like_count: l.post!.like_count,
          reply_count: l.post!._count.comments,
          is_liked: true,
          created_at: l.post!.created_at,
          user: l.post!.user,
        })),
      next_cursor: hasMore ? items[items.length - 1].id : null,
    });
  });

  // POST /threads/:id/like
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

    await prisma.$transaction([
      prisma.like.create({ data: { user_id: userId, post_id: id } }),
      prisma.post.update({ where: { id }, data: { like_count: { increment: 1 } } }),
    ]);
    return reply.send({ liked: true });
  });
}
