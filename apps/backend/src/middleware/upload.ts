import multer from 'multer';
import { Request } from 'express';
import { config } from '../config';

export const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploadMaxSize },
  fileFilter(_req: Request, file, cb) {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('errors.invalid_file_type'));
    }
  },
});

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req: Request, file, cb) {
    const allowed = ['image/png', 'image/jpeg', 'image/svg+xml'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('errors.invalid_file_type'));
    }
  },
});
