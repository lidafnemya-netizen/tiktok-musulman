import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';

export async function soundRoutes(app: FastifyInstance) {
  // GET /sounds — app sounds, ranked by trending/use_count
  app.get('/', { preHandler: authenticate }, async (req, reply) => {
    const { search, limit = '30' } = req.query as { search?: string; limit?: string };
    const sounds = await prisma.sound.findMany({
      where: search ? { title: { contains: search, mode: 'insensitive' } } : {},
      orderBy: [{ is_trending: 'desc' }, { use_count: 'desc' }],
      take: parseInt(limit),
    });
    return reply.send({ items: sounds });
  });

  // GET /sounds/:id — sound detail + originating creator + posts using it
  app.get('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const sound = await prisma.sound.findUnique({
      where: { id },
      include: {
        origin_user: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        posts: {
          where: { status: 'ACTIVE', is_thread: false },
          orderBy: { created_at: 'desc' },
          take: 30,
          select: {
            id: true, thumbnail_url: true, like_count: true, view_count: true,
            user: { select: { username: true } },
          },
        },
      },
    });
    if (!sound) return reply.status(404).send({ error: 'Son introuvable' });
    return reply.send(sound);
  });

  app.get('/favorites', { preHandler: authenticate }, async (req, reply) => {
    const favs = await prisma.soundFavorite.findMany({
      where: { user_id: req.currentUser!.id },
      orderBy: { created_at: 'desc' },
      include: { sound: true },
    });
    return reply.send({ items: favs.map((f) => f.sound) });
  });

  app.get('/recent', { preHandler: authenticate }, async (req, reply) => {
    const recents = await prisma.soundRecent.findMany({
      where: { user_id: req.currentUser!.id },
      orderBy: { used_at: 'desc' },
      take: 20,
      include: { sound: true },
    });
    return reply.send({ items: recents.map((r) => r.sound) });
  });

  app.post('/:id/favorite', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = req.currentUser!.id;
    const existing = await prisma.soundFavorite.findUnique({
      where: { user_id_sound_id: { user_id: userId, sound_id: id } },
    });
    if (existing) {
      await prisma.soundFavorite.delete({ where: { id: existing.id } });
      return reply.send({ favorited: false });
    }
    await prisma.soundFavorite.create({ data: { user_id: userId, sound_id: id } });
    return reply.send({ favorited: true });
  });

  app.post('/:id/use', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = req.currentUser!.id;
    await Promise.all([
      prisma.soundRecent.upsert({
        where: { user_id_sound_id: { user_id: userId, sound_id: id } },
        create: { user_id: userId, sound_id: id },
        update: { used_at: new Date() },
      }),
      prisma.sound.update({ where: { id }, data: { use_count: { increment: 1 } } }),
    ]);
    return reply.send({ success: true });
  });
}
