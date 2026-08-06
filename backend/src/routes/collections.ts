import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';

const createSchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(300).optional(),
  cover_url: z.string().url().optional(),
  is_private: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

export async function collectionRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: authenticate }, async (req, reply) => {
    const userId = req.currentUser!.id;
    const collections = await prisma.collection.findMany({
      where: { user_id: userId },
      orderBy: { updated_at: 'desc' },
      include: { _count: { select: { items: true } } },
    });
    return reply.send({
      items: collections.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        cover_url: c.cover_url,
        is_private: c.is_private,
        item_count: c._count.items,
        created_at: c.created_at,
        updated_at: c.updated_at,
      })),
    });
  });

  app.post('/', { preHandler: authenticate }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const collection = await prisma.collection.create({
      data: { user_id: req.currentUser!.id, ...parsed.data },
    });
    return reply.status(201).send(collection);
  });

  app.patch('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.collection.findUnique({ where: { id } });
    if (!existing || existing.user_id !== req.currentUser!.id) {
      return reply.status(404).send({ error: 'Not found' });
    }
    const updated = await prisma.collection.update({ where: { id }, data: parsed.data });
    return reply.send(updated);
  });

  app.delete('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.collection.findUnique({ where: { id } });
    if (!existing || existing.user_id !== req.currentUser!.id) {
      return reply.status(404).send({ error: 'Not found' });
    }
    await prisma.collection.delete({ where: { id } });
    return reply.send({ success: true });
  });

  app.get('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const collection = await prisma.collection.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { added_at: 'desc' },
          include: {
            post: {
              include: {
                user: { select: { id: true, username: true, display_name: true, avatar_url: true } },
              },
            },
          },
        },
      },
    });
    if (!collection) return reply.status(404).send({ error: 'Not found' });
    if (collection.is_private && collection.user_id !== req.currentUser!.id) {
      return reply.status(403).send({ error: 'Private' });
    }
    return reply.send({
      id: collection.id,
      name: collection.name,
      description: collection.description,
      cover_url: collection.cover_url,
      is_private: collection.is_private,
      user_id: collection.user_id,
      items: collection.items.map((it) => it.post),
    });
  });

  app.post('/:id/items', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { post_id } = req.body as { post_id: string };
    if (!post_id) return reply.status(400).send({ error: 'post_id required' });

    const collection = await prisma.collection.findUnique({ where: { id } });
    if (!collection || collection.user_id !== req.currentUser!.id) {
      return reply.status(404).send({ error: 'Not found' });
    }

    await prisma.collectionItem.upsert({
      where: { collection_id_post_id: { collection_id: id, post_id } },
      update: {},
      create: { collection_id: id, post_id },
    });
    await prisma.collection.update({ where: { id }, data: { updated_at: new Date() } });
    return reply.send({ success: true });
  });

  app.delete('/:id/items/:postId', { preHandler: authenticate }, async (req, reply) => {
    const { id, postId } = req.params as { id: string; postId: string };
    const collection = await prisma.collection.findUnique({ where: { id } });
    if (!collection || collection.user_id !== req.currentUser!.id) {
      return reply.status(404).send({ error: 'Not found' });
    }
    await prisma.collectionItem.delete({
      where: { collection_id_post_id: { collection_id: id, post_id: postId } },
    }).catch(() => {});
    return reply.send({ success: true });
  });
}
