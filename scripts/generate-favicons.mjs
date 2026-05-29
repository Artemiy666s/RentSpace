import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'client', 'public');
const src = path.join(publicDir, 'images', 'logo-mark.png');

if (!fs.existsSync(src)) {
  console.error('logo-mark.png not found:', src);
  process.exit(1);
}

const png = fs.readFileSync(src);
for (const name of ['favicon.png', 'favicon-16.png', 'favicon-32.png', 'favicon-48.png', 'favicon-192.png']) {
  fs.writeFileSync(path.join(publicDir, name), png);
  console.log('wrote', name);
}
