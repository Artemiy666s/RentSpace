/**
 * Production UI: vacate modal — prefill date, show pending/error, raise modal z-index.
 * Server hang fixed separately in roomService.vacateRoom.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const jsFiles = [
  path.join(root, 'backups', 'production-current', 'assets', 'index-DGrUP6as.js'),
  path.join(root, 'server', 'public', 'assets', 'index-DGrUP6as.js'),
];
const cssFiles = [
  path.join(root, 'backups', 'production-current', 'assets', 'index-DVDS88w4.css'),
  path.join(root, 'server', 'public', 'assets', 'index-DVDS88w4.css'),
];

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
}

const OLD_OPEN = 'onVacate:()=>te(!0)';
const NEW_OPEN =
  'onVacate:()=>{var oe=new Date().toISOString().slice(0,10);ge(R=>({...R,endDate:R.endDate||oe})),te(!0)}';

const OLD_MUT =
  'Rt=Nt({mutationFn:()=>Re.post(`/rooms/${S}/vacate`,{endDate:me.endDate,reason:me.reason,newStatus:me.newStatus,comment:me.comment}),onSuccess:()=>{a.invalidateQueries({queryKey:["floorPlan"]}),a.invalidateQueries({queryKey:["room",S]}),te(!1)}})';

const NEW_MUT =
  'Rt=Nt({mutationFn:()=>Re.post(`/rooms/${S}/vacate`,{endDate:me.endDate,reason:me.reason,newStatus:me.newStatus,comment:me.comment}),onSuccess:()=>{a.invalidateQueries({queryKey:["floorPlan"]}),a.invalidateQueries({queryKey:["room",S]}),a.invalidateQueries({queryKey:["dashboard-home"]}),te(!1)},onError:oe=>{var _n,Dn,zn,Ln;const Rn=oe;window.alert(((Dn=(_n=Rn.response)==null?void 0:_n.data)==null?void 0:Dn.error)||((Ln=(zn=Rn.response)==null?void 0:zn.data)==null?void 0:Ln.message)||Rn.message||"Не удалось освободить помещение")}})';

const OLD_BTN =
  'footer:u.jsx(Me,{variant:"primary",fullWidth:!0,onClick:()=>Rt.mutate(),children:e("common.vacate")})';

const NEW_BTN =
  'footer:u.jsx(Me,{variant:"primary",fullWidth:!0,disabled:!!Rt.isPending||!me.endDate,onClick:()=>Rt.mutate(),children:Rt.isPending?e("common.saving")||"Сохранение…":e("common.vacate")})';

let jsOut = null;
for (const file of jsFiles) {
  let s = fs.readFileSync(file, 'utf8');
  if (s.includes('onVacate:()=>{var oe=new Date()')) {
    console.log('js already patched', file);
    jsOut = s;
    continue;
  }
  if (!s.includes(OLD_OPEN)) throw new Error('OLD_OPEN missing in ' + file);
  if (!s.includes(OLD_MUT)) throw new Error('OLD_MUT missing in ' + file);
  if (!s.includes(OLD_BTN)) throw new Error('OLD_BTN missing in ' + file);
  s = s.replace(OLD_OPEN, NEW_OPEN).replace(OLD_MUT, NEW_MUT).replace(OLD_BTN, NEW_BTN);
  try {
    new Function(s);
  } catch (err) {
    console.error('SYNTAX', err.message);
    process.exit(1);
  }
  fs.writeFileSync(file, s);
  console.log('patched js', file);
  jsOut = s;
}

for (const file of cssFiles) {
  let s = fs.readFileSync(file, 'utf8');
  const before = s;
  s = s.replace(
    '._overlay_n5b1o_1{position:fixed;top:0;right:0;bottom:0;left:0;z-index:400;',
    '._overlay_n5b1o_1{position:fixed;top:0;right:0;bottom:0;left:0;z-index:1200;'
  );
  if (s === before) {
    if (s.includes('z-index:1200;display:flex;align-items:center;justify-content:center;padding:max(16px,var(--safe-to')) {
      console.log('css already patched', file);
    } else {
      throw new Error('overlay z-index pattern not found in ' + file);
    }
  } else {
    fs.writeFileSync(file, s);
    console.log('patched css', file);
  }
}

const hash = sha256(Buffer.from(jsOut, 'utf8'));
const restorePath = path.join(root, 'scripts', 'restore-production-frontend.js');
let restore = fs.readFileSync(restorePath, 'utf8');
restore = restore.replace(
  /const expectedSha256 =\s*'[A-F0-9]+'/,
  `const expectedSha256 =\n  '${hash}'`
);
fs.writeFileSync(restorePath, restore);
require('./restore-production-frontend.js');
console.log('NEW_SHA256', hash);
