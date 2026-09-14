import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '../config/constants';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), 'uploads');

let s3: S3Client | null = null;
if (env.s3Usable) {
  s3 = new S3Client({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });
  logger.info('S3 storage enabled for candidate images.');
} else {
  fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
  logger.warn('S3 disabled. Candidate images will be stored locally under /uploads.');
}

const extFromMime: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface UploadResult {
  imageUrl: string;
  s3Key: string;
}

export function validateImage(file: Express.Multer.File): void {
  if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    throw ApiError.badRequest('Only JPG, JPEG, PNG, or WEBP images are allowed');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw ApiError.badRequest(`Image must be ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB or less`);
  }
}

function buildKey(electionSlug: string, candidateId: string, mime: string): string {
  const unique = crypto.randomBytes(8).toString('hex');
  const ext = extFromMime[mime] || 'jpg';
  return `elections/${electionSlug}/candidates/${candidateId}/${unique}.${ext}`;
}

/** Uploads a candidate image and returns a public/served URL + storage key. */
export async function uploadCandidateImage(
  file: Express.Multer.File,
  electionSlug: string,
  candidateId: string,
): Promise<UploadResult> {
  validateImage(file);
  const key = buildKey(electionSlug, candidateId, file.mimetype);

  if (s3) {
    await s3.send(
      new PutObjectCommand({
        Bucket: env.AWS_S3_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );
    // Bucket is expected to be private; serve via presigned URL on read.
    // const imageUrl = await getPresignedGetUrl(key);

    // if bucket is expected to be public
    const imageUrl =
      `https://${env.AWS_S3_BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;


    return { imageUrl, s3Key: key };
  }

  // Local fallback
  const dest = path.join(LOCAL_UPLOAD_DIR, key);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, file.buffer);
  return { imageUrl: `/uploads/${key}`, s3Key: key };
}

export async function getPresignedGetUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  if (!s3) return `/uploads/${key}`;
  const command = new GetObjectCommand({ Bucket: env.AWS_S3_BUCKET_NAME, Key: key });
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

export async function deleteCandidateImage(key?: string | null): Promise<void> {
  if (!key) return;
  try {
    if (s3) {
      await s3.send(new DeleteObjectCommand({ Bucket: env.AWS_S3_BUCKET_NAME, Key: key }));
    } else {
      const p = path.join(LOCAL_UPLOAD_DIR, key);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  } catch (err) {
    logger.error('Failed to delete image', { key, err });
  }
}

export const storageMode = env.s3Usable ? 's3' : 'local';
export const localUploadDir = LOCAL_UPLOAD_DIR;
