import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '../config/constants';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';

const extFromMime: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), 'uploads');

export interface UploadPhotoResult {
  imageUrl: string;
  storageKey: string;
}

/**
 * Validates image MIME type and file size server-side.
 */
export function validateImage(file: Express.Multer.File): void {
  if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    throw ApiError.badRequest('Only JPG, PNG, or WEBP images are allowed');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw ApiError.badRequest(
      `Image must be ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))}MB or less`,
    );
  }
}

/**
 * Generates an unguessable, safe server-side storage path.
 * Ignores client-supplied filenames completely to prevent path traversal or collisions.
 */
export function buildCandidateStorageKey(candidateId: string, mime: string): string {
  const ext = extFromMime[mime] || 'jpg';
  const uniqueId = crypto.randomUUID();
  return `candidates/${candidateId}/${uniqueId}.${ext}`;
}

/**
 * Ensures the candidate-photos storage bucket exists and is configured for public read.
 */
export async function ensureCandidateBucket(): Promise<void> {
  if (!env.supabaseStorageUsable) return;

  const bucketUrl = `${env.SUPABASE_PROJECT_URL}/storage/v1/bucket/${env.SUPABASE_STORAGE_BUCKET}`;
  const secretKey = env.SUPABASE_SECRET_KEY.trim();

  try {
    const checkRes = await fetch(bucketUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        apikey: secretKey,
      },
    });

    if (checkRes.status === 404) {
      // Bucket doesn't exist, create it with public: true
      const createRes = await fetch(`${env.SUPABASE_PROJECT_URL}/storage/v1/bucket`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          apikey: secretKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: env.SUPABASE_STORAGE_BUCKET,
          name: env.SUPABASE_STORAGE_BUCKET,
          public: true,
          file_size_limit: MAX_IMAGE_BYTES,
          allowed_mime_types: ALLOWED_IMAGE_TYPES,
        }),
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        logger.error(`Failed to create Supabase storage bucket: ${errText}`);
      } else {
        logger.info(`Supabase storage bucket "${env.SUPABASE_STORAGE_BUCKET}" created successfully.`);
      }
    }
  } catch (err) {
    logger.warn('Could not verify Supabase bucket existence (network or offline mode)', err);
  }
}

/**
 * Uploads a candidate photo to Supabase Storage using backend-mediated secret credentials.
 */
export async function uploadCandidatePhoto(
  file: Express.Multer.File,
  candidateId: string,
): Promise<UploadPhotoResult> {
  validateImage(file);
  const storageKey = buildCandidateStorageKey(candidateId, file.mimetype);

  if (env.supabaseStorageUsable) {
    const uploadUrl = `${env.SUPABASE_PROJECT_URL}/storage/v1/object/${env.SUPABASE_STORAGE_BUCKET}/${storageKey}`;
    const secretKey = env.SUPABASE_SECRET_KEY.trim();

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        apikey: secretKey,
        'Content-Type': file.mimetype,
        'x-upsert': 'true',
      },
      body: file.buffer,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Supabase storage upload failed (${response.status}): ${errorText}`);
      throw ApiError.badRequest('Failed to upload image to storage service. Please try again.');
    }

    const publicUrl = `${env.SUPABASE_PROJECT_URL}/storage/v1/object/public/${env.SUPABASE_STORAGE_BUCKET}/${storageKey}`;
    return { imageUrl: publicUrl, storageKey };
  }

  // Local fallback (offline development or tests without Supabase credentials)
  fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
  const dest = path.join(LOCAL_UPLOAD_DIR, storageKey);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, file.buffer);
  return { imageUrl: `/uploads/${storageKey}`, storageKey };
}

/**
 * Deletes an old candidate photo from Supabase Storage.
 * Non-blocking: logs any error without aborting surrounding candidate updates.
 */
export async function deleteCandidatePhoto(storageKey?: string | null): Promise<void> {
  if (!storageKey) return;

  if (env.supabaseStorageUsable) {
    try {
      const deleteUrl = `${env.SUPABASE_PROJECT_URL}/storage/v1/object/${env.SUPABASE_STORAGE_BUCKET}/${storageKey}`;
      const secretKey = env.SUPABASE_SECRET_KEY.trim();

      const response = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          apikey: secretKey,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.warn(`Could not delete old Supabase storage object (${response.status}): ${errorText}`);
      } else {
        logger.info(`Deleted obsolete candidate photo object from Supabase: ${storageKey}`);
      }
    } catch (err) {
      logger.warn(`Failed to delete Supabase photo ${storageKey}`, err);
    }
    return;
  }

  // Local cleanup fallback
  try {
    const p = path.join(LOCAL_UPLOAD_DIR, storageKey);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (err) {
    logger.warn(`Failed to delete local candidate image file ${storageKey}`, err);
  }
}
