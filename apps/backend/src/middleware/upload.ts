import multer from 'multer';
import { config } from '../config';

export const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploadMaxSize },
});

export const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploadMaxSize },
});

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const allowed = ['image/png', 'image/jpeg', 'image/svg+xml'];
    cb(null, allowed.includes(file.mimetype));
  },
});

export const sqlUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    cb(null, file.originalname.endsWith('.sql') || file.originalname.endsWith('.tar.gz'));
  },
});
