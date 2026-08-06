import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';

const createStorySchema = z.object({
  media_url: z.string().url(),
  media_type: z.enum(['image', 'video']).default('image'),
  duration: z.number().int().min(1).max(60).default(5),
  linked_post_id: z.string().uuid().optional(),
});

export async function storyRoutes(app: FastifyInstance) {
  app.get('/feed', { preHandler: authenticate }, async (req, reply) => {
    const userId = req.currentUser!.id;
    const following = await prisma.follow.findMany({
      where: { follower_id: userId },
      select: { following_id: true },
    });
    const followingIds = following.map((f) => f.following_id);

    const stories = await prisma.story.findMany({
      where: {
        user_id: { in: [...followingIds, userId] },
        expires_at: { gt: new Date() },
      },
      include: {
        user: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        views: { where: { viewer_id: userId }, select: { id: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return reply.send(stories.map((s) => ({ ...s, is_viewed: s.views.length > 0, views: undefined })));
  });

  app.post('/', { preHandler: authenticate }, async (req, reply) => {
    const parsed = createStorySchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const story = await prisma.story.create({
      data: { user_id: req.currentUser!.id, expires_at, ...parsed.data },
    });

    // Notify followers who have story notifications enabled
    const author = await prisma.user.findUnique({
      where: { id: req.currentUser!.id },
      select: { display_name: true, username: true },
    });
    const followers = await prisma.follow.findMany({
      where: { following_id: req.currentUser!.id, notify_story: true },
      select: { follower_id: true },
    });
    if (followers.length > 0) {
      const name = author?.display_name ?? author?.username ?? 'Quelqu\'un';
      await prisma.notification.createMany({
        data: followers.map((f) => ({
          user_id: f.follower_id,
          type: 'STORY',
          title: `${name} a publié une story`,
          body: `${name} vient de publier une nouvelle story`,
          data: { user_id: req.currentUser!.id, story_id: story.id },
        })),
      }).catch(() => {});
    }

    return reply.status(201).send(story);
  });

  app.post('/:id/view', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const viewerId = req.currentUser!.id;
    const existing = await prisma.storyView.findUnique({
      where: { story_id_viewer_id: { story_id: id, viewer_id: viewerId } },
    });
    if (!existing) {
      await prisma.storyView.create({ data: { story_id: id, viewer_id: viewerId } });
      await prisma.story.update({ where: { id }, data: { view_count: { increment: 1 } } });
    }
    return reply.send({ success: true });
  });

  // ── LIKE / UNLIKE — one like per account ────────────────────────────────
  app.post('/:id/like', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = req.currentUser!.id;
    const existing = await prisma.storyLike.findUnique({
      where: { story_id_user_id: { story_id: id, user_id: userId } },
    });
    if (existing) {
      await prisma.$transaction([
        prisma.storyLike.delete({ where: { id: existing.id } }),
        prisma.story.update({ where: { id }, data: { like_count: { decrement: 1 } } }),
      ]);
      return reply.send({ liked: false });
    }
    const story = await prisma.story.findUnique({ where: { id }, select: { user_id: true } });
    if (!story) return reply.status(404).send({ error: 'Not found' });
    await prisma.$transaction([
      prisma.storyLike.create({ data: { story_id: id, user_id: userId } }),
      prisma.story.update({ where: { id }, data: { like_count: { increment: 1 } } }),
    ]);
    if (story.user_id !== userId) {
      const liker = await prisma.user.findUnique({ where: { id: userId }, select: { display_name: true, username: true } });
      const name = liker?.display_name ?? liker?.username ?? 'Quelqu\'un';
      await prisma.notification.create({
        data: {
          user_id: story.user_id,
          type: 'LIKE',
          title: `${name} a aimé ta story`,
          body: `${name} a aimé ta story`,
          data: { story_id: id, user_id: userId },
        },
      }).catch(() => {});
    }
    return reply.send({ liked: true });
  });

  // ── REPLY — sends a direct message referencing the story ───────────────
  app.post('/:id/reply', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { text } = req.body as { text?: string };
    if (!text?.trim()) return reply.status(400).send({ error: 'Texte requis' });

    const senderId = req.currentUser!.id;
    const story = await prisma.story.findUnique({ where: { id } });
    if (!story) return reply.status(404).send({ error: 'Story introuvable' });
    if (story.user_id === senderId) return reply.status(400).send({ error: 'Impossible de répondre à sa propre story' });

    const [sender, recipient] = await Promise.all([
      prisma.user.findUnique({ where: { id: senderId } }),
      prisma.user.findUnique({ where: { id: story.user_id } }),
    ]);
    if (!sender || !recipient) return reply.status(404).send({ error: 'User not found' });

    // Same gender-messaging rule as /messages/direct — cross-gender needs an accepted request first
    let conversationId: string;
    const existingAny = await prisma.conversationRequest.findFirst({
      where: {
        OR: [
          { requester_id: senderId, recipient_id: story.user_id },
          { requester_id: story.user_id, recipient_id: senderId },
        ],
      },
      include: { conversation: true },
    });

    if (existingAny?.conversation) {
      conversationId = existingAny.conversation.id;
    } else if (existingAny) {
      if (sender.gender !== recipient.gender) {
        return reply.status(403).send({ error: 'cross_gender', message: 'Messagerie entre hommes et femmes non mahrams non autorisée sur Nour.' });
      }
      const conversation = await prisma.$transaction(async (tx) => {
        await tx.conversationRequest.update({ where: { id: existingAny.id }, data: { status: 'ACCEPTED' } });
        return tx.conversation.create({ data: { request_id: existingAny.id } });
      });
      conversationId = conversation.id;
    } else if (sender.gender === recipient.gender) {
      const conversation = await prisma.$transaction(async (tx) => {
        const createdReq = await tx.conversationRequest.create({
          data: { requester_id: senderId, recipient_id: story.user_id, status: 'ACCEPTED' },
        });
        return tx.conversation.create({ data: { request_id: createdReq.id } });
      });
      conversationId = conversation.id;
    } else {
      return reply.status(403).send({ error: 'cross_gender', message: 'Messagerie entre hommes et femmes non mahrams non autorisée sur Nour.' });
    }

    const message = await prisma.message.create({
      data: {
        conversation_id: conversationId,
        sender_id: senderId,
        content: text.trim(),
        media_url: story.media_url,
      },
    });

    return reply.status(201).send({ conversation_id: conversationId, message });
  });

  // ── UNSEEN STATUS — which of the given users have an unseen active story ──
  app.get('/unseen-status', { preHandler: authenticate }, async (req, reply) => {
    const { user_ids } = req.query as { user_ids?: string };
    const ids = (user_ids ?? '').split(',').filter(Boolean);
    if (ids.length === 0) return reply.send({ ids: [] });

    const stories = await prisma.story.findMany({
      where: {
        user_id: { in: ids },
        expires_at: { gt: new Date() },
        views: { none: { viewer_id: req.currentUser!.id } },
      },
      select: { user_id: true },
      distinct: ['user_id'],
    });
    return reply.send({ ids: stories.map((s) => s.user_id) });
  });

  // Get stories for a specific user (for StoriesScreen viewer)
  app.get('/', { preHandler: authenticate }, async (req, reply) => {
    const { user_id } = req.query as { user_id?: string };
    const targetId = user_id ?? req.currentUser!.id;
    const stories = await prisma.story.findMany({
      where: { user_id: targetId, expires_at: { gt: new Date() } },
      include: {
        user: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        views: { where: { viewer_id: req.currentUser!.id }, select: { id: true } },
        likes: { where: { user_id: req.currentUser!.id }, select: { id: true } },
        linked_post: { select: { id: true, thumbnail_url: true, caption: true } },
      },
      orderBy: { created_at: 'asc' },
    });
    return reply.send(stories.map((s) => ({
      ...s, is_viewed: s.views.length > 0, is_liked: s.likes.length > 0, views: undefined, likes: undefined,
    })));
  });

  app.delete('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const story = await prisma.story.findUnique({ where: { id } });
    if (!story || story.user_id !== req.currentUser!.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    await prisma.story.delete({ where: { id } });
    return reply.send({ success: true });
  });
}
