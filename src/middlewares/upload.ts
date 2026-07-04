import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';
import { AppError } from '../utils/AppError';

/**
 * Basic in-memory multer upload stub for later image-upload work
 * (product images, avatars, review images, etc.). Stores files in memory
 * so a later stage can stream them to disk/S3/Cloudinary as needed.
 */
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

function fileFilter(_req: Request, file: Express.Multer.File, callback: FileFilterCallback): void {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    callback(new AppError('Only JPEG, PNG, WEBP, or AVIF images are allowed', 400));
    return;
  }
  callback(null, true);
}

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter,
});

export default upload;
