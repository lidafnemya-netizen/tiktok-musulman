import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';

const startLiveSchema = z.object({
  title: z.string().min(1).max(100),
  category: z.string().default('general'),
  thumbnail_url: z.string().optional(),
  is_public: z.boolean().default(true),
});

const U = { id: true, username: true, display_name: true, avatar_url: true, is_verified: true } as const;

export async function liveRoutes(app: FastifyInstance) {
  app.post('/start', { preHandler: authenticate }, async (req, reply) => {
    const parsed = startLiveSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    await prisma.liveSession.updateMany({
      where: { user_id: req.currentUser!.id, is_active: true },
      data: { is_active: false, ended_at: new Date() },
    });

    const session = await prisma.liveSession.create({
      data: { user_id: req.currentUser!.id, ...parsed.data },
      include: { user: { select: U } },
    });

    const followers = await prisma.follow.findMany({ where: { following_id: req.currentUser!.id, notify_live: true }, select: { follower_id: true } });
    if (followers.length > 0) {
      await prisma.notification.createMany({
        data: followers.map(f => ({
          user_id: f.follower_id, type: 'LIVE_START',
          title: 'Live en cours',
          body: `${session.user.display_name} est en direct — rejoignez maintenant !`,
          data: { session_id: session.id },
        })),
        skipDuplicates: true,
      });
    }
    return reply.status(201).send(session);
  });

  app.post('/:id/end', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await prisma.liveSession.findUnique({ where: { id } });
    if (!session || session.user_id !== req.currentUser!.id) return reply.status(403).send({ error: 'Forbidden' });
    await prisma.liveSession.update({ where: { id }, data: { is_active: false, ended_at: new Date() } });
    return reply.send({ success: true });
  });

  app.get('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await prisma.liveSession.findUnique({ where: { id }, include: { user: { select: U } } });
    if (!session) return reply.status(404).send({ error: 'Not found' });
    return reply.send(session);
  });

  app.get('/active', { preHandler: authenticate }, async (req, reply) => {
    const { cursor, limit = '10' } = req.query as { cursor?: string; limit?: string };
    const sessions = await prisma.liveSession.findMany({
      where: { is_active: true, is_public: true },
      take: parseInt(limit) + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { viewer_count: 'desc' },
      include: { user: { select: U } },
    });
    const hasMore = sessions.length > parseInt(limit);
    const items = hasMore ? sessions.slice(0, -1) : sessions;
    return reply.send({ items, next_cursor: hasMore ? items[items.length - 1].id : null });
  });

  app.get('/:id/messages', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const msgs = await prisma.liveMessage.findMany({
      where: { session_id: id, is_deleted: false },
      take: 60, orderBy: { created_at: 'asc' },
      include: { user: { select: U } },
    });
    return reply.send({ items: msgs });
  });

  app.patch('/:id/chat', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { enabled } = req.body as { enabled: boolean };
    const s = await prisma.liveSession.findUnique({ where: { id } });
    if (!s || s.user_id !== req.currentUser!.id) return reply.status(403).send({ error: 'Forbidden' });
    await prisma.liveSession.update({ where: { id }, data: { chat_enabled: enabled } });
    return reply.send({ chat_enabled: enabled });
  });

  app.delete('/:id/messages/:msgId', { preHandler: authenticate }, async (req, reply) => {
    const { id, msgId } = req.params as { id: string; msgId: string };
    const s = await prisma.liveSession.findUnique({ where: { id } });
    if (!s || s.user_id !== req.currentUser!.id) return reply.status(403).send({ error: 'Forbidden' });
    await prisma.liveMessage.update({ where: { id: msgId }, data: { is_deleted: true } });
    return reply.send({ success: true });
  });
}
