import 'dotenv/config';
import './config/env';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { env } from './config/env';
import { prisma } from './config/database';
import { createSocketServer } from './websocket/server';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { postRoutes } from './routes/posts';
import { commentRoutes } from './routes/comments';
import { messageRoutes } from './routes/messages';
import { notificationRoutes } from './routes/notifications';
import { storyRoutes } from './routes/stories';
import { searchRoutes } from './routes/search';
import { favoriteRoutes } from './routes/favorites';
import { collectionRoutes } from './routes/collections';
import { soundRoutes } from './routes/sounds';
import { liveRoutes } from './routes/live';
import { uploadRoutes } from './routes/upload';
import { adminRoutes } from './routes/admin';
import { supportRoutes } from './routes/support';
import { threadRoutes } from './routes/threads';
import { bookRoutes } from './routes/books';

process.stdout.write(`[STARTUP] Node ${process.version}\n`);

process.on('uncaughtException', (err) => {
  process.stdout.write(`[FATAL] ${err.message}\n`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  process.stdout.write(`[FATAL] ${String(reason)}\n`);
  process.exit(1);
});

const app = Fastify({
  logger: env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty' } }
    : true,
  ignoreTrailingSlash: true,
  bodyLimit: 200 * 1024 * 1024, // 200MB — video uploads
});

async function bootstrap() {
  await app.register(cors, { origin: true, credentials: true });
  await app.register(jwt, { secret: env.JWT_ACCESS_SECRET });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: env.UPLOAD_MAX_SIZE_MB * 1024 * 1024 } });

  const uploadsDir = path.join(process.cwd(), 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  await app.register(staticFiles, { root: uploadsDir, prefix: '/uploads/' });

  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(postRoutes, { prefix: '/api/posts' });
  await app.register(commentRoutes, { prefix: '/api/comments' });
  await app.register(messageRoutes, { prefix: '/api/messages' });
  await app.register(notificationRoutes, { prefix: '/api/notifications' });
  await app.register(storyRoutes, { prefix: '/api/stories' });
  await app.register(searchRoutes, { prefix: '/api/search' });
  await app.register(favoriteRoutes, { prefix: '/api/favorites' });
  await app.register(collectionRoutes, { prefix: '/api/collections' });
  await app.register(soundRoutes, { prefix: '/api/sounds' });
  await app.register(liveRoutes, { prefix: '/api/live' });
  await app.register(uploadRoutes, { prefix: '/api/upload' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(supportRoutes, { prefix: '/api/support' });
  await app.register(threadRoutes, { prefix: '/api/threads' });
  await app.register(bookRoutes, { prefix: '/api/books' });

  app.setErrorHandler((error, _req, reply) => {
    app.log.error(error);
    if (error.statusCode) return reply.status(error.statusCode).send({ error: error.message });
    return reply.status(500).send({ error: 'Internal server error' });
  });

  // Attach Socket.io to Fastify's actual HTTP server (NOT a new server)
  createSocketServer(app.server);

  // Let Fastify handle listen — routes are on app.server
  await app.listen({ port: env.PORT, host: '0.0.0.0' });

  process.stdout.write(`[OK] Backend running on port ${env.PORT}\n`);

  // ── Keep-alive self-ping (Railway free tier prevention) ──────────────────────
  const SELF_URL = process.env.RAILWAY_STATIC_URL
    ? `https://${process.env.RAILWAY_STATIC_URL}/health`
    : `http://localhost:${env.PORT}/health`;
  setInterval(async () => {
    try {
      const res = await fetch(SELF_URL);
      if (!res.ok) process.stdout.write(`[PING] Health check failed: ${res.status}\n`);
    } catch (e: any) {
      process.stdout.write(`[PING] Self-ping error: ${e.message}\n`);
    }
  }, 4 * 60 * 1000); // toutes les 4 minutes

  const shutdown = async () => {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch((err) => {
  process.stdout.write(`[FATAL] ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
