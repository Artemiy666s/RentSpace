/**
 * Fail CI/local if production frontend calls API paths the Express server does not expose.
 *
 * Usage: node scripts/audit-api-contract.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const jsPath = path.join(root, 'server', 'public', 'assets', 'index-DGrUP6as.js');

if (!fs.existsSync(jsPath)) {
  console.error('Missing production bundle:', jsPath);
  process.exit(1);
}

const js = fs.readFileSync(jsPath, 'utf8');

function normalize(p) {
  return (
    String(p)
      .replace(/\$\{[^}]+\}/g, ':param')
      .replace(/\/+/g, '/')
      .replace(/\?.*$/, '')
      .replace(/\/$/, '') || '/'
  );
}

function pathMatches(fePath, bePath) {
  const fe = normalize(fePath).split('/').filter(Boolean);
  const be = normalize(bePath).split('/').filter(Boolean);
  if (fe.length !== be.length) return false;
  for (let i = 0; i < fe.length; i++) {
    const a = fe[i];
    const b = be[i];
    if (b.startsWith(':') || a === ':param') continue;
    if (a !== b) return false;
  }
  return true;
}

const frontend = new Map();
const callRe = /\bRe\.(get|post|put|patch|delete)\(([^)]{0,260})\)/g;
let m;
while ((m = callRe.exec(js))) {
  const method = m[1].toUpperCase();
  const arg = m[2];
  for (const sm of arg.matchAll(/[`'"](\/[^`'"]+)[`'"]/g)) {
    frontend.set(`${method} ${normalize(sm[1])}`, { method, path: normalize(sm[1]) });
  }
}
// download helper kd("/path", ...)
const kdRe = /\bkd\(\s*[`'"](\/[^`'"]+)[`'"]/g;
while ((m = kdRe.exec(js))) {
  frontend.set(`GET ${normalize(m[1])}`, { method: 'GET', path: normalize(m[1]) });
}

const indexSrc = fs.readFileSync(path.join(root, 'server', 'routes', 'index.js'), 'utf8');
const fileByVar = {};
const reqRe = /const\s+(\w+)\s*=\s*require\(['"]\.\/([^'"]+)['"]\)/g;
while ((m = reqRe.exec(indexSrc))) fileByVar[m[1]] = m[2];

const mounts = [];
const useRe = /router\.use\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)/g;
while ((m = useRe.exec(indexSrc))) {
  mounts.push({ prefix: m[1], file: fileByVar[m[2]] });
}
const bareUse = /router\.use\(\s*(\w+)\s*\)/g;
while ((m = bareUse.exec(indexSrc))) {
  mounts.push({ prefix: '', file: fileByVar[m[1]] });
}
// publicRouter is also mounted at /
mounts.push({ prefix: '', file: 'map' });

const backend = [];
function extractRoutes(fileRel, prefix) {
  if (!fileRel) return;
  const full = path.join(
    root,
    'server',
    'routes',
    fileRel.endsWith('.js') ? fileRel : `${fileRel}.js`
  );
  if (!fs.existsSync(full)) return;
  const src = fs.readFileSync(full, 'utf8');
  for (const rName of ['router', 'publicRouter']) {
    const rr = new RegExp(
      `${rName}\\.(get|post|put|patch|delete)\\(\\s*['\\\`]([^'\\\`]+)['\\\`]`,
      'g'
    );
    let mm;
    while ((mm = rr.exec(src))) {
      const method = mm[1].toUpperCase();
      const p = mm[2];
      if (p.includes('${')) continue;
      const joined = normalize(`${prefix || ''}${p.startsWith('/') ? p : `/${p}`}`);
      backend.push({ method, path: joined });
    }
  }
}

for (const mount of mounts) extractRoutes(mount.file, mount.prefix);

const missing = [];
for (const fe of frontend.values()) {
  const ok = backend.some((be) => be.method === fe.method && pathMatches(fe.path, be.path));
  if (!ok) missing.push(fe);
}

missing.sort((a, b) => `${a.method}${a.path}`.localeCompare(`${b.method}${b.path}`));

console.log(`Frontend API calls: ${frontend.size}`);
console.log(`Backend routes scanned: ${backend.length}`);
if (missing.length) {
  console.error('\nAPI CONTRACT DRIFT — frontend calls missing on server:');
  for (const c of missing) console.error(`  ${c.method.padEnd(6)} ${c.path}`);
  process.exit(1);
}

console.log('\nOK: production frontend API calls are covered by Express routes.');
