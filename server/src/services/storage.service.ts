import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
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

export interface UploadPhotoResult {
  imageUrl: string;
  storageKey: string;
}

let supabaseClient: SupabaseClient | null = null;

/**
 * Returns a server-side Supabase client initialized with privileged credentials.
 * The service role key is strictly server-side and never exposed to clients.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    if (!env.supabaseStorageUsable) {
      throw ApiError.internal('Supabase storage credentials are not configured');
    }
    supabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseClient;
}

/**
 * Validates image content by inspecting magic bytes / binary file signature.
 * Returns the detected MIME type if valid, or null if unsupported/spoofed.
 */
export function detectImageMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Validates image MIME type, file size, and file signature server-side.
 */
export function validateImage(file: Express.Multer.File): void {
  if (!file || !file.buffer) {
    throw ApiError.badRequest('No image file provided');
  }

  // Size limit check
  if (file.size > MAX_IMAGE_BYTES || file.buffer.length > MAX_IMAGE_BYTES) {
    throw ApiError.badRequest(
      `Image must be ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))}MB or less`,
    );
  }

  // Client-declared MIME type check
  if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    throw ApiError.badRequest('Only JPG, PNG, or WEBP images are allowed');
  }

  // Magic bytes / file signature validation to prevent file spoofing
  const detectedMime = detectImageMimeType(file.buffer);
  if (!detectedMime || !ALLOWED_IMAGE_TYPES.includes(detectedMime)) {
    throw ApiError.badRequest('File content does not match a supported image format (JPG, PNG, or WEBP)');
  }
}

/**
 * Generates an unguessable, collision-safe server-side storage path.
 * Ignores client-supplied filenames completely to prevent path traversal or collisions.
 */
export function buildCandidateStorageKey(candidateId: string, mime: string): string {
  const ext = extFromMime[mime] || 'jpg';
  const uniqueId = crypto.randomUUID();
  return `candidates/${candidateId}/${uniqueId}.${ext}`;
}

/**
 * Ensures the candidate-photos storage bucket exists and is configured for public read.
 * Fails safely without throwing if offline or during local testing.
 */
export async function ensureCandidateBucket(): Promise<void> {
  if (!env.supabaseStorageUsable) return;

  try {
    const supabase = getSupabaseClient();
    const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
    if (listErr) {
      logger.warn(`Could not verify Supabase bucket existence: ${listErr.message}`);
      return;
    }

    const bucketExists = buckets?.some((b) => b.name === env.SUPABASE_BUCKET_NAME);
    if (!bucketExists) {
      const { error: createErr } = await supabase.storage.createBucket(env.SUPABASE_BUCKET_NAME, {
        public: true,
        fileSizeLimit: MAX_IMAGE_BYTES,
        allowedMimeTypes: ALLOWED_IMAGE_TYPES,
      });

      if (createErr) {
        logger.error(`Failed to create Supabase storage bucket: ${createErr.message}`);
      } else {
        logger.info(`Supabase storage bucket "${env.SUPABASE_BUCKET_NAME}" created successfully.`);
      }
    }
  } catch (err: any) {
    logger.warn('Could not verify Supabase bucket existence (network or offline mode)', err?.message || err);
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

  if (!env.supabaseStorageUsable) {
    throw ApiError.internal('Storage service is not configured. Media uploads are unavailable.');
  }

  const storageKey = buildCandidateStorageKey(candidateId, file.mimetype);
  const supabase = getSupabaseClient();

  const { error: uploadError } = await supabase.storage
    .from(env.SUPABASE_BUCKET_NAME)
    .upload(storageKey, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (uploadError) {
    logger.error(`Supabase storage upload failed: ${uploadError.message}`);
    throw ApiError.badRequest('Failed to upload image to storage service. Please try again.');
  }

  const { data: urlData } = supabase.storage
    .from(env.SUPABASE_BUCKET_NAME)
    .getPublicUrl(storageKey);

  return {
    imageUrl: urlData.publicUrl,
    storageKey,
  };
}

/**
 * Deletes a candidate photo from Supabase Storage.
 * Non-blocking: logs any error without aborting surrounding candidate operations.
 */
export async function deleteCandidatePhoto(storageKey?: string | null): Promise<void> {
  if (!storageKey) return;
  if (!env.supabaseStorageUsable) return;

  try {
    const supabase = getSupabaseClient();
    const { error: deleteError } = await supabase.storage
      .from(env.SUPABASE_BUCKET_NAME)
      .remove([storageKey]);

    if (deleteError) {
      logger.warn(`Could not delete Supabase storage object: ${deleteError.message}`);
    } else {
      logger.info(`Deleted obsolete candidate photo object from Supabase: ${storageKey}`);
    }
  } catch (err: any) {
    logger.warn(`Failed to delete Supabase photo ${storageKey}`, err?.message || err);
  }
}
