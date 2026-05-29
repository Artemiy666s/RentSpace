const path = require('path');
const fs = require('fs');
const multer = require('multer');
const config = require('../config');

const ALLOWED_DOC = ['.pdf', '.docx', '.xlsx', '.xls'];
const ALLOWED_IMG = ['.jpg', '.jpeg', '.png', '.webp'];

function resolveUploadSubdir(subdir) {
  const base = path.isAbsolute(config.upload.dir)
    ? config.upload.dir
    : path.join(process.cwd(), config.upload.dir);
  return path.join(base, subdir);
}

function createStorage(subdir) {
  const dir = resolveUploadSubdir(subdir);
  fs.mkdirSync(dir, { recursive: true });
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  });
}

function fileFilter(allowed) {
  return (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error('Тип файла не разрешён'));
    }
    cb(null, true);
  };
}

const maxSize = (config.upload.maxSizeMb || 25) * 1024 * 1024;

const floorPlanUpload = multer({
  storage: createStorage('floor-plans'),
  limits: { fileSize: maxSize },
  fileFilter: fileFilter(ALLOWED_IMG),
});

const excelUpload = multer({
  storage: createStorage('imports'),
  limits: { fileSize: maxSize },
  fileFilter: fileFilter([...ALLOWED_DOC, '.xlsx', '.xls']),
});

const fileUpload = multer({
  storage: createStorage('files'),
  limits: { fileSize: maxSize },
  fileFilter: fileFilter([...ALLOWED_DOC, ...ALLOWED_IMG]),
});

module.exports = { floorPlanUpload, excelUpload, fileUpload };
