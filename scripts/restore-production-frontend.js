/**
 * Restores the canonical production frontend into server/public.
 * Source of truth: backups/production-current (exact snapshot from rentspace.site).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const src = path.join(root, 'backups', 'production-current');
const dest = path.join(root, 'server', 'public');
const expectedJs = 'index-DGrUP6as.js';
const expectedCss = 'index-DVDS88w4.css';
const expectedSha256 =
  'DC04D9D434BBA6F9F5D5D4BE344A02EFA88E6000CC05B60212BF0304B92CB05A';

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex').toUpperCase();
}

function main() {
  const jsPath = path.join(src, 'assets', expectedJs);
  if (!fs.existsSync(jsPath)) {
    console.error('Missing production frontend snapshot:', jsPath);
    process.exit(1);
  }

  const actual = sha256File(jsPath);
  if (actual !== expectedSha256) {
    console.error('Production JS hash mismatch.');
    console.error(' expected:', expectedSha256);
    console.error(' actual:  ', actual);
    process.exit(1);
  }

  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });

  const indexPath = path.join(dest, 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');
  if (!indexHtml.includes(expectedJs) || !indexHtml.includes(expectedCss)) {
    console.error('index.html does not reference the production assets');
    process.exit(1);
  }

  console.log('Restored production frontend -> server/public');
  console.log(`Verified ${expectedJs} sha256=${actual}`);
}

main();
