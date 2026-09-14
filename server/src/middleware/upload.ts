import multer from 'multer';
import { ALLOWED_IMAGE_TYPES, MAX_CSV_BYTES, MAX_IMAGE_BYTES } from '../config/constants';
import { ApiError } from '../utils/ApiError';

// Files are held in memory then streamed to S3/local — never written to a temp path.
const memory = multer.memoryStorage();

export const uploadImage = multer({
  storage: memory,
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new (ApiError as any)(400, 'Only JPG, PNG, or WEBP images are allowed', 'BAD_REQUEST'));
  },
}).single('image');

export const uploadCsv = multer({
  storage: memory,
  limits: { fileSize: MAX_CSV_BYTES },
  fileFilter: (_req, file, cb) => {
    const okType =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'application/csv' ||
      file.originalname.toLowerCase().endsWith('.csv');
    if (okType) cb(null, true);
    else cb(new (ApiError as any)(400, 'Please upload a .csv file', 'BAD_REQUEST'));
  },
}).single('file');
