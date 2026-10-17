/**
 * Select menuPortal was z-index 1100, Modal overlay is 1200 — lists render under the dimmer.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const cssFiles = [
  path.join(root, 'backups', 'production-current', 'assets', 'index-DVDS88w4.css'),
  path.join(root, 'server', 'public', 'assets', 'index-DVDS88w4.css'),
];

const OLD = '_menuPortal_ceatg_107{position:fixed;z-index:1100;';
const NEW = '_menuPortal_ceatg_107{position:fixed;z-index:1400;';

for (const file of cssFiles) {
  let s = fs.readFileSync(file, 'utf8');
  if (s.includes(NEW)) {
    console.log('already patched', file);
    continue;
  }
  if (!s.includes(OLD)) throw new Error('menuPortal pattern missing in ' + file);
  s = s.replace(OLD, NEW);
  fs.writeFileSync(file, s);
  console.log('patched', file);
}

require('./restore-production-frontend.js');
