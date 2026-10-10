/**
 * Persist rent-register view mode (classic / split) in localStorage.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const jsName = 'index-DGrUP6as.js';
const targets = [
  path.join(root, 'server', 'public', 'assets'),
  path.join(root, 'backups', 'production-current', 'assets'),
];

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
}

function mustReplace(js, from, to, label) {
  if (js.includes(to)) {
    console.log('already:', label);
    return js;
  }
  if (!js.includes(from)) throw new Error(`missing: ${label}`);
  return js.replace(from, to);
}

function patch(js) {
  js = mustReplace(
    js,
    '[Gl,Yl]=A.useState("classic")',
    '[Gl,Yl]=A.useState(()=>{try{const v=localStorage.getItem("rr-view-mode");if(v==="split"||v==="classic")return v}catch{}return"classic"})',
    'viewMode useState init'
  );

  js = mustReplace(
    js,
    'onClick:()=>Yl("classic")',
    'onClick:()=>{Yl("classic");try{localStorage.setItem("rr-view-mode","classic")}catch{}}',
    'classic click persist'
  );

  js = mustReplace(
    js,
    'onClick:()=>Yl("split")',
    'onClick:()=>{Yl("split");try{localStorage.setItem("rr-view-mode","split")}catch{}}',
    'split click persist'
  );

  return js;
}

function main() {
  let js = fs.readFileSync(path.join(targets[0], jsName), 'utf8');
  js = patch(js);
  try {
    new Function(js);
    console.log('parse OK');
  } catch (e) {
    console.error('parse FAIL', e.message);
    process.exit(1);
  }
  const hash = sha256(Buffer.from(js, 'utf8'));
  for (const dir of targets) {
    fs.writeFileSync(path.join(dir, jsName), js);
    console.log('Wrote', dir);
  }

  const restorePath = path.join(root, 'scripts', 'restore-production-frontend.js');
  let restore = fs.readFileSync(restorePath, 'utf8');
  restore = restore.replace(/const expectedSha256 =\s*'[A-F0-9]+'/, `const expectedSha256 =\n  '${hash}'`);
  fs.writeFileSync(restorePath, restore);

  const docPath = path.join(root, 'docs', 'PRODUCTION_BUILD.md');
  if (fs.existsSync(docPath)) {
    let doc = fs.readFileSync(docPath, 'utf8');
    doc = doc.replace(/SHA-256: `[A-F0-9]+`/, `SHA-256: \`${hash}\``);
    fs.writeFileSync(docPath, doc);
  }

  console.log('SHA-256', hash);
}

main();
