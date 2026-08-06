import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate } from '../middleware/auth';
import { env } from '../config/env';
import { v2 as cloudinary } from 'cloudinary';
import path from 'path';
import fs from 'fs';

const ALLOWED_VIDEO_TYPES = [
  'video/mp4', 'video/quicktime', 'video/x-msvideo',
  'video/mpeg', 'video/webm', 'application/octet-stream',
];
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_VIDEO_BYTES = env.UPLOAD_MAX_SIZE_MB * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

if (env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
}

function getBaseUrl(req: FastifyRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
  const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? 'localhost:3001';
  return `${proto}://${host}`;
}

const SUPABASE_ENABLED = !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

async function uploadToSupabase(buffer: Buffer, filename: string, contentType: string, folder: string): Promise<string> {
  const objectPath = `${folder}/${filename}`;
  const res = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/${env.SUPABASE_STORAGE_BUCKET}/${objectPath}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY as string,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: buffer,
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase upload failed: ${res.status} ${text}`);
  }
  return `${env.SUPABASE_URL}/storage/v1/object/public/${env.SUPABASE_STORAGE_BUCKET}/${objectPath}`;
}

export async function uploadRoutes(app: FastifyInstance) {
  app.post('/video', { preHandler: authenticate }, async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'Aucun fichier fourni' });

    // Accept any video-ish mimetype (iOS sends various types)
    const isVideo =
      ALLOWED_VIDEO_TYPES.includes(data.mimetype) ||
      data.mimetype.startsWith('video/') ||
      data.filename.match(/\.(mp4|mov|avi|mkv|webm)$/i);

    if (!isVideo) {
      return reply.status(400).send({ error: 'Format invalide. Utilisez MP4 ou MOV.' });
    }

    const buffer = await data.toBuffer();
    if (buffer.length > MAX_VIDEO_BYTES) {
      return reply.status(400).send({ error: `Vidéo trop volumineuse (max ${env.UPLOAD_MAX_SIZE_MB}MB)` });
    }

    if (SUPABASE_ENABLED) {
      const ext = path.extname(data.filename || 'video.mp4') || '.mp4';
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      const url = await uploadToSupabase(buffer, filename, data.mimetype || 'video/mp4', 'videos');
      return reply.send({ url });
    }

    if (!env.CLOUDINARY_CLOUD_NAME) {
      const ext = path.extname(data.filename || 'video.mp4') || '.mp4';
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      const uploadDir = path.join(process.cwd(), 'uploads');
      fs.mkdirSync(uploadDir, { recursive: true });
      fs.writeFileSync(path.join(uploadDir, filename), buffer);
      const base = getBaseUrl(req);
      return reply.send({ url: `${base}/uploads/${filename}` });
    }

    const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ resource_type: 'video', folder: 'nour/videos' }, (err, res) => {
          if (err || !res) return reject(err ?? new Error('Upload failed'));
          resolve(res as { secure_url: string; public_id: string });
        })
        .end(buffer);
    });

    // Derive thumbnail URL from Cloudinary video (first frame, portrait crop)
    const thumbnailUrl = result.secure_url
      .replace('/video/upload/', '/video/upload/so_0,q_auto,f_jpg,w_720,h_1280,c_fill/')
      .replace(/\.(mp4|mov|avi|webm|mkv)$/i, '.jpg');

    return reply.send({ url: result.secure_url, thumbnail_url: thumbnailUrl });
  });

  app.post('/image', { preHandler: authenticate }, async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'Aucun fichier fourni' });

    const isImage =
      ALLOWED_IMAGE_TYPES.includes(data.mimetype) ||
      data.mimetype.startsWith('image/');

    if (!isImage) {
      return reply.status(400).send({ error: 'Format invalide. Utilisez JPEG, PNG ou WebP.' });
    }

    const buffer = await data.toBuffer();
    if (buffer.length > MAX_IMAGE_BYTES) {
      return reply.status(400).send({ error: 'Image trop volumineuse (max 10MB)' });
    }

    if (SUPABASE_ENABLED) {
      const ext = path.extname(data.filename || 'image.jpg') || '.jpg';
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      const url = await uploadToSupabase(buffer, filename, data.mimetype || 'image/jpeg', 'images');
      return reply.send({ url });
    }

    if (!env.CLOUDINARY_CLOUD_NAME) {
      const ext = path.extname(data.filename || 'image.jpg') || '.jpg';
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      const uploadDir = path.join(process.cwd(), 'uploads');
      fs.mkdirSync(uploadDir, { recursive: true });
      fs.writeFileSync(path.join(uploadDir, filename), buffer);
      const base = getBaseUrl(req);
      return reply.send({ url: `${base}/uploads/${filename}` });
    }

    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ resource_type: 'image', folder: 'nour/images' }, (err, res) => {
          if (err || !res) return reject(err ?? new Error('Upload failed'));
          resolve(res as { secure_url: string });
        })
        .end(buffer);
    });

    return reply.send({ url: result.secure_url });
  });
}
