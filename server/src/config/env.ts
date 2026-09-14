import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const boolean = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  PORT: z.string().default('5000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  COOKIE_MAX_AGE_DAYS: z.coerce.number().default(7),

  CLIENT_URL: z.string().default('http://localhost:5173'),

  AWS_REGION: z.string().optional().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().optional().default(''),
  AWS_S3_BUCKET_NAME: z.string().optional().default(''),
  S3_ENABLED: boolean,

  SUPER_ADMIN_USERNAME: z.string().default('amradmin'),
  SUPER_ADMIN_PASSWORD: z.string().default('amrelection2026'),

  // Email verification (Resend)
  RESEND_API_KEY: z.string().optional().default(''),
  EMAIL_FROM: z.string().default('AMR IEC Elections <elections@contact.usetamreen.com>'),
  VERIFICATION_TOKEN_EXPIRES_MINUTES: z.coerce.number().default(30),
  SEND_REAL_EMAILS: boolean.default('false'),

  // Supabase Storage (Phase 20 - candidate photos)
  SUPABASE_PROJECT_URL: z.string().url().default('https://nrtpaukiruadndjjwhuj.supabase.co'),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional().default(''),
  SUPABASE_SECRET_KEY: z.string().optional().default(''),
  SUPABASE_STORAGE_BUCKET: z.string().default('candidate-photos'),

  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().default(15),
  RATE_LIMIT_MAX_GENERAL: z.coerce.number().default(300),
  RATE_LIMIT_MAX_AUTH: z.coerce.number().default(10),
  RATE_LIMIT_MAX_VOTE: z.coerce.number().default(20),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:');
  // eslint-disable-next-line no-console
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProd: raw.NODE_ENV === 'production',
  port: Number(raw.PORT),
  // S3 is only truly usable when explicitly enabled AND credentials/bucket exist.
  s3Usable:
    raw.S3_ENABLED &&
    !!raw.AWS_ACCESS_KEY_ID &&
    !!raw.AWS_SECRET_ACCESS_KEY &&
    !!raw.AWS_S3_BUCKET_NAME,
  supabaseStorageUsable:
    !!raw.SUPABASE_PROJECT_URL &&
    !!raw.SUPABASE_SECRET_KEY &&
    !!raw.SUPABASE_STORAGE_BUCKET,
};

export type Env = typeof env;
