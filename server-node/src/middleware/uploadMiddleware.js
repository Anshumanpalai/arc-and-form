import multer from 'multer';
import { ApiError } from '../utils/errors.js';

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1,
  },
});

export function handleImageUpload(req, res, next) {
  const single = upload.single('file');
  single(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(ApiError.badRequest('File size exceeds the 5MB limit'));
        }
        return next(ApiError.badRequest(`Upload error: ${err.message}`));
      }
      return next(err);
    }
    if (!req.file) {
      return next(ApiError.badRequest('No image file provided'));
    }
    next();
  });
}

