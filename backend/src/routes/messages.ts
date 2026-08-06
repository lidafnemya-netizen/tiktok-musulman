import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { getUnseenStorySet } from '../lib/stories';
import { z } from 'zod';

const requestSchema = z.object({ recipient_id: z.string().uuid() });
const messageSchema = z.object({
  content: z.string().min(1).max(2000),
  media_url: z.string().url().optional(),
});

export async function messageRoutes(app: FastifyInstance) {
  // ── Direct conversation (same gender = no restriction) ──────────────────────
  app.post('/direct', { preHandler: authenticate }, async (req, reply) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const requesterId = req.currentUser!.id;
    const { recipient_id } = parsed.data;
    if (requesterId === recipient_id) return reply.status(400).send({ error: 'Cannot message yourself' });

    const [requester, recipient] = await Promise.all([
      prisma.user.findUnique({ where: { id: requesterId } }),
      prisma.user.findUnique({ where: { id: recipient_id } }),
    ]);
    if (!requester || !recipient) return reply.status(404).send({ error: 'User not found' });

    // Cross-gender: block (use request system)
    if (requester.gender !== recipient.gender) {
      return reply.status(403).send({ error: 'cross_gender', message: 'Messagerie entre hommes et femmes non mahrams non autorisée sur Nour.' });
    }

    // Same gender: find or create conversation (handle all existing request states)
    const existingAny = await prisma.conversationRequest.findFirst({
      where: {
        OR: [
          { requester_id: requesterId, recipient_id },
          { requester_id: recipient_id, recipient_id: requesterId },
        ],
      },
      include: { conversation: true },
    });

    if (existingAny) {
      // Already has a conversation → return it
      if (existingAny.conversation) {
        return reply.send({ conversation_id: existingAny.conversation.id });
      }
      // Request exists but no conversation yet → accept it and create one
      const conversation = await prisma.$transaction(async (tx) => {
        await tx.conversationRequest.update({
          where: { id: existingAny.id },
          data: { status: 'ACCEPTED' },
        });
        return tx.conversation.create({ data: { request_id: existingAny.id } });
      });
      return reply.send({ conversation_id: conversation.id });
    }

    const conversation = await prisma.$transaction(async (tx) => {
      const createdReq = await tx.conversationRequest.create({
        data: { requester_id: requesterId, recipient_id, status: 'ACCEPTED' },
      });
      return tx.conversation.create({ data: { request_id: createdReq.id } });
    });

    return reply.status(201).send({ conversation_id: conversation.id });
  });

  // ── Request system (cross-gender) ───────────────────────────────────────────
  app.post('/request', { preHandler: authenticate }, async (req, reply) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const requesterId = req.currentUser!.id;
    const { recipient_id } = parsed.data;
    if (requesterId === recipient_id) return reply.status(400).send({ error: 'Cannot message yourself' });

    const [requester, recipient] = await Promise.all([
      prisma.user.findUnique({ where: { id: requesterId } }),
      prisma.user.findUnique({ where: { id: recipient_id } }),
    ]);
    if (!requester || !recipient) return reply.status(404).send({ error: 'User not found' });

    // Same gender → use /direct instead
    if (requester.gender === recipient.gender) {
      return reply.status(400).send({ error: 'Use /messages/direct for same-gender messaging' });
    }

    const existing = await prisma.conversationRequest.findUnique({
      where: { requester_id_recipient_id: { requester_id: requesterId, recipient_id } },
    });
    if (existing) return reply.status(409).send({ error: 'Request already exists', request: existing });

    const request = await prisma.conversationRequest.create({
      data: { requester_id: requesterId, recipient_id },
    });

    await prisma.notification.create({
      data: {
        user_id: recipient_id,
        type: 'MESSAGE_REQUEST',
        title: 'Demande de contact',
        body: `${requester.display_name} souhaite vous envoyer un message`,
        data: { request_id: request.id, requester_id: requesterId },
      },
    });

    return reply.status(201).send(request);
  });

  app.post('/request/:id/accept', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const request = await prisma.conversationRequest.findUnique({ where: { id } });
    if (!request) return reply.status(404).send({ error: 'Request not found' });
    if (request.recipient_id !== req.currentUser!.id) return reply.status(403).send({ error: 'Forbidden' });

    const conversation = await prisma.$transaction(async (tx) => {
      await tx.conversationRequest.update({ where: { id }, data: { status: 'ACCEPTED' } });
      return tx.conversation.create({ data: { request_id: id } });
    });

    await prisma.notification.create({
      data: {
        user_id: request.requester_id,
        type: 'MESSAGE_REQUEST_ACCEPTED',
        title: 'Request accepted',
        body: 'Your message request was accepted',
        data: { conversation_id: conversation.id },
      },
    });

    return reply.send(conversation);
  });

  app.post('/request/:id/reject', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const request = await prisma.conversationRequest.findUnique({ where: { id } });
    if (!request) return reply.status(404).send({ error: 'Not found' });
    if (request.recipient_id !== req.currentUser!.id) return reply.status(403).send({ error: 'Forbidden' });

    await prisma.conversationRequest.update({ where: { id }, data: { status: 'REJECTED' } });
    return reply.send({ success: true });
  });

  app.get('/conversations', { preHandler: authenticate }, async (req, reply) => {
    const userId = req.currentUser!.id;
    const conversations = await prisma.conversation.findMany({
      where: {
        request: {
          OR: [{ requester_id: userId }, { recipient_id: userId }],
          status: 'ACCEPTED',
        },
      },
      include: {
        request: {
          include: {
            requester: { select: { id: true, username: true, display_name: true, avatar_url: true } },
            recipient: { select: { id: true, username: true, display_name: true, avatar_url: true } },
          },
        },
        messages: {
          take: 1,
          orderBy: { created_at: 'desc' },
          select: { content: true, created_at: true, sender_id: true },
        },
      },
      orderBy: { updated_at: 'desc' },
    });

    const otherUserIds = conversations.map((c) =>
      c.request.requester_id === userId ? c.request.recipient_id : c.request.requester_id
    );
    const unseenStories = await getUnseenStorySet(userId, otherUserIds);

    const result = conversations.map((c) => {
      const other = c.request.requester_id === userId ? c.request.recipient : c.request.requester;
      return {
        id: c.id,
        other_user: { ...other, has_unseen_story: unseenStories.has(other.id) },
        last_message: c.messages[0] ?? null,
        updated_at: c.updated_at,
      };
    });

    return reply.send(result);
  });

  app.get('/conversations/:id/messages', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { cursor, limit = '30' } = req.query as { cursor?: string; limit?: string };
    const userId = req.currentUser!.id;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { request: true },
    });
    if (!conversation) return reply.status(404).send({ error: 'Not found' });

    const { requester_id, recipient_id } = conversation.request;
    if (userId !== requester_id && userId !== recipient_id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const messages = await prisma.message.findMany({
      where: { conversation_id: id },
      take: parseInt(limit) + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { created_at: 'desc' },
      include: {
        sender: { select: { id: true, username: true, display_name: true, avatar_url: true } },
      },
    });

    const hasMore = messages.length > parseInt(limit);
    const items = hasMore ? messages.slice(0, -1) : messages;

    await prisma.message.updateMany({
      where: { conversation_id: id, sender_id: { not: userId }, is_read: false },
      data: { is_read: true },
    });

    return reply.send({ items, next_cursor: hasMore ? items[items.length - 1].id : null });
  });

  app.post('/conversations/:id/messages', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { request: true },
    });
    if (!conversation) return reply.status(404).send({ error: 'Not found' });

    const { requester_id, recipient_id } = conversation.request;
    const userId = req.currentUser!.id;
    if (userId !== requester_id && userId !== recipient_id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const message = await prisma.$transaction(async (tx) => {
      const m = await tx.message.create({
        data: { conversation_id: id, sender_id: userId, ...parsed.data },
        include: {
          sender: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        },
      });
      await tx.conversation.update({ where: { id }, data: { updated_at: new Date() } });
      return m;
    });

    return reply.status(201).send(message);
  });

  // ── Message reaction (toggle) ───────────────────────────────────────────────
  app.post('/conversations/:id/messages/:msgId/react', { preHandler: authenticate }, async (req, reply) => {
    const { id, msgId } = req.params as { id: string; msgId: string };
    const { emoji } = req.body as { emoji: string };
    const userId = req.currentUser!.id;

    const message = await prisma.message.findUnique({ where: { id: msgId } });
    if (!message || message.conversation_id !== id) return reply.status(404).send({ error: 'Not found' });

    // reactions stored as JSON in message.metadata field or just log reaction
    // For now: store in a separate field — use metadata JSON
    const meta = (message as any).metadata as Record<string, unknown> ?? {};
    const reactions = (meta.reactions as Record<string, string>) ?? {};

    if (emoji) reactions[userId] = emoji;
    else delete reactions[userId];

    await prisma.message.update({
      where: { id: msgId },
      data: { metadata: { ...meta, reactions } } as any,
    });

    return reply.send({ ok: true, reactions });
  });

  // ── Delete a message ────────────────────────────────────────────────────────
  app.delete('/conversations/:id/messages/:msgId', { preHandler: authenticate }, async (req, reply) => {
    const { id, msgId } = req.params as { id: string; msgId: string };
    const userId = req.currentUser!.id;
    const message = await prisma.message.findUnique({ where: { id: msgId } });
    if (!message || message.conversation_id !== id) return reply.status(404).send({ error: 'Not found' });
    if (message.sender_id !== userId) return reply.status(403).send({ error: 'Forbidden' });
    await prisma.message.update({ where: { id: msgId }, data: { content: '[DELETED]' } });
    return reply.send({ ok: true });
  });

  app.get('/requests/pending', { preHandler: authenticate }, async (req, reply) => {
    const requests = await prisma.conversationRequest.findMany({
      where: { recipient_id: req.currentUser!.id, status: 'PENDING' },
      include: {
        requester: { select: { id: true, username: true, display_name: true, avatar_url: true } },
      },
      orderBy: { created_at: 'desc' },
    });
    return reply.send(requests);
  });
}
