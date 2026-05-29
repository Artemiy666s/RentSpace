const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const config = require('./config');
const apiRoutes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// Ensure upload directories exist
const uploadDirs = [
  config.upload.dir,
  path.join(config.upload.dir, 'floor-plans'),
  path.join(config.upload.dir, 'contracts'),
  path.join(config.upload.dir, 'payments'),
  path.join(config.upload.dir, 'expenses'),
  path.join(config.upload.dir, 'rooms'),
];
uploadDirs.forEach((dir) => {
  const full = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
  fs.mkdirSync(full, { recursive: true });
});

app.use(helmet({ contentSecurityPolicy: config.isProduction ? undefined : false }));
app.use(morgan(config.isProduction ? 'combined' : 'dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

if (!config.isProduction) {
  app.use(cors({ origin: true, credentials: true }));
}

// Uploaded files
const uploadStaticRoot = path.isAbsolute(config.upload.dir)
  ? config.upload.dir
  : path.join(process.cwd(), config.upload.dir);
app.use('/uploads', express.static(uploadStaticRoot));

// API
app.use('/api', apiRoutes);

// Production: serve React build
const publicPath = path.join(__dirname, 'public');
if (config.isProduction || fs.existsSync(path.join(publicPath, 'index.html'))) {
  app.use(express.static(publicPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(publicPath, 'index.html'));
  });
}

app.use(errorHandler);

module.exports = app;

if (!process.env.VERCEL) {
  const port = config.port;
  app.listen(port, () => {
    console.log(`${config.appName} listening on port ${port} (${config.env})`);
  });
}
