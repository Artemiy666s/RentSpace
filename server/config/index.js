const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const isVercel = !!process.env.VERCEL;
const vercelUploadDir = path.join('/tmp', 'rentspace-uploads');
const defaultUploadDir = isVercel ? vercelUploadDir : 'server/uploads';
const uploadDir = isVercel
  ? vercelUploadDir
  : process.env.UPLOAD_DIR || defaultUploadDir;

module.exports = {
  env: process.env.NODE_ENV || 'development',
  appName: process.env.APP_NAME || 'RentSpace.by',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  port: parseInt(process.env.PORT || '3000', 10),
  db: {
    // Prefer DB_*, fall back to TIDB_* (used on Vercel production)
    host: process.env.DB_HOST || process.env.TIDB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || process.env.TIDB_PORT || '3306', 10),
    database: process.env.DB_NAME || process.env.TIDB_DATABASE || 'rent_space',
    user: process.env.DB_USER || process.env.TIDB_USER || 'root',
    password: process.env.DB_PASSWORD || process.env.TIDB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true' || !!process.env.TIDB_HOST,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev_secret_change_me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  upload: {
    dir: uploadDir,
    maxSizeMb: parseInt(process.env.MAX_UPLOAD_SIZE_MB || '25', 10),
  },
  isProduction: process.env.NODE_ENV === 'production',
  isVercel,
};
