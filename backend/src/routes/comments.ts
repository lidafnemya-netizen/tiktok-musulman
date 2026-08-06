import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';

const commentSchema = z.object({
  content: z.string().min(1).max(500),
  parent_id: z.string().uuid().optional(),
});

export async function commentRoutes(app: FastifyInstance) {
  app.get('/post/:postId', { preHandler: authenticate }, async (req, reply) => {
    const { postId } = req.params as { postId: string };
    const { cursor, limit = '20' } = req.query as { cursor?: string; limit?: string };

    const comments = await prisma.comment.findMany({
      where: { post_id: postId, parent_id: null },
      take: parseInt(limit) + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { created_at: 'desc' },
      include: {
        user: {
          select: { id: true, username: true, display_name: true, avatar_url: true },
        },
        _count: { select: { replies: true, likes: true } },
      },
    });

    const hasMore = comments.length > parseInt(limit);
    const items = hasMore ? comments.slice(0, -1) : comments;

    const likedIds = await prisma.like.findMany({
      where: { user_id: req.currentUser!.id, comment_id: { in: items.map(c => c.id) } },
      select: { comment_id: true },
    });
    const likedSet = new Set(likedIds.map(l => l.comment_id));

    return reply.send({
      items: items.map(c => ({
        ...c, is_liked: likedSet.has(c.id),
        like_count: c.like_count, reply_count: c._count.replies,
      })),
      next_cursor: hasMore ? items[items.length - 1].id : null,
    });
  });

  app.post('/post/:postId', { preHandler: authenticate }, async (req, reply) => {
    const { postId } = req.params as { postId: string };
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) return reply.status(404).send({ error: 'Post not found' });

    const comment = await prisma.$transaction(async (tx) => {
      const c = await tx.comment.create({
        data: {
          post_id: postId,
          user_id: req.currentUser!.id,
          content: parsed.data.content,
          parent_id: parsed.data.parent_id,
        },
        include: {
          user: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        },
      });
      await tx.post.update({ where: { id: postId }, data: { comment_count: { increment: 1 } } });
      return c;
    });

    if (post.user_id !== req.currentUser!.id) {
      await prisma.notification.create({
        data: {
          user_id: post.user_id,
          type: 'COMMENT',
          title: `${comment.user.display_name} a commenté`,
          body: `${comment.user.display_name} : ${parsed.data.content.slice(0, 70)}`,
          data: { post_id: postId, comment_id: comment.id },
        },
      });
    }

    return reply.status(201).send(comment);
  });

  // GET replies for a comment
  app.get('/:id/replies', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const replies = await prisma.comment.findMany({
      where: { parent_id: id },
      orderBy: { created_at: 'asc' },
      include: {
        user: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        _count: { select: { likes: true } },
      },
    });
    const likedIds = await prisma.like.findMany({
      where: { user_id: req.currentUser!.id, comment_id: { in: replies.map(r => r.id) } },
      select: { comment_id: true },
    });
    const likedSet = new Set(likedIds.map(l => l.comment_id));
    return reply.send({
      items: replies.map(r => ({
        ...r, is_liked: likedSet.has(r.id),
        like_count: r.like_count, reply_count: 0,
      })),
    });
  });

  // Like / unlike a comment
  app.post('/:id/like', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = req.currentUser!.id;
    const existing = await prisma.like.findUnique({
      where: { user_id_comment_id: { user_id: userId, comment_id: id } },
    });
    if (existing) {
      await prisma.$transaction([
        prisma.like.delete({ where: { user_id_comment_id: { user_id: userId, comment_id: id } } }),
        prisma.comment.update({ where: { id }, data: { like_count: { decrement: 1 } } }),
      ]);
      return reply.send({ liked: false });
    }
    await prisma.$transaction([
      prisma.like.create({ data: { user_id: userId, comment_id: id } }),
      prisma.comment.update({ where: { id }, data: { like_count: { increment: 1 } } }),
    ]);
    return reply.send({ liked: true });
  });

  app.delete('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment) return reply.status(404).send({ error: 'Not found' });
    if (comment.user_id !== req.currentUser!.id && req.currentUser!.role === 'USER') {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    await prisma.$transaction([
      prisma.comment.delete({ where: { id } }),
      prisma.post.update({ where: { id: comment.post_id }, data: { comment_count: { decrement: 1 } } }),
    ]);

    return reply.send({ success: true });
  });
}
