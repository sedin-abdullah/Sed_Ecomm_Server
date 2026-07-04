import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Compiled to dist/utils/saveUpload.js -> project root is two levels up.
const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Persists an in-memory multer file to local disk under /uploads and
 * returns the public URL path the frontend can use directly (the server
 * serves /uploads as a static directory — see src/app.ts).
 */
export function saveUploadedFile(file: Express.Multer.File, subdir = ''): string {
  const dir = path.join(UPLOAD_ROOT, subdir);
  ensureDir(dir);

  const ext = path.extname(file.originalname) || '.jpg';
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(dir, filename), file.buffer);

  return `/uploads/${subdir ? `${subdir}/` : ''}${filename}`;
}

export default saveUploadedFile;
