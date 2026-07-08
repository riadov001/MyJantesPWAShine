import multer from "multer";
import type { Request } from "express";

const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const ALLOWED_DOCUMENT_MIMES = [
  ...ALLOWED_IMAGE_MIMES,
  "application/pdf",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 Mo
const MAX_FILES = 10;

function createFileFilter(allowedMimes: string[]) {
  return (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Type de fichier non autorisé: ${file.mimetype}. Types acceptés: ${allowedMimes.join(", ")}`));
    }
  };
}

export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter: createFileFilter(ALLOWED_IMAGE_MIMES),
});

export const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter: createFileFilter(ALLOWED_DOCUMENT_MIMES),
});

export const uploadAny = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
});
