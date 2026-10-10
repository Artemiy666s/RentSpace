/**
 * Add debt high/low sort presets to production rent-register (and shared sort helpers).
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
  if (js.includes(to)) return js;
  if (!js.includes(from)) throw new Error(`missing: ${label}`);
  const next = js.replace(from, to);
  if (next === js) throw new Error(`replace failed: ${label}`);
  return next;
}

function patch(js) {
  // 1) i18n tableSort keys
  js = mustReplace(
    js,
    'nameAsc:"По названию А→Я",nameDesc:"По названию Я→А",columnHint:',
    'nameAsc:"По названию А→Я",nameDesc:"По названию Я→А",debtHigh:"По задолженности выше → ниже",debtLow:"По задолженности ниже → выше",columnHint:',
    'ru tableSort'
  );
  js = mustReplace(
    js,
    'nameAsc:"Па назве А→Я",nameDesc:"Па назве Я→А",columnHint:',
    'nameAsc:"Па назве А→Я",nameDesc:"Па назве Я→А",debtHigh:"Па запазычанасці вышэй → ніжэй",debtLow:"Па запазычанасці ніжэй → вышэй",columnHint:',
    'be tableSort'
  );
  js = mustReplace(
    js,
    'nameAsc:"Name A→Z",nameDesc:"Name Z→A",columnHint:',
    'nameAsc:"Name A→Z",nameDesc:"Name Z→A",debtHigh:"By debt high → low",debtLow:"By debt low → high",columnHint:',
    'en tableSort'
  );

  // 2) useTableSort (Oy)
  const oyOld =
    'd=A.useCallback(m=>{const g=n.dateKey,b=n.nameKey;switch(m){case"default":a(null),s("asc");break;case"newest":g&&t[g]&&(a(g),s("desc"));break;case"oldest":g&&t[g]&&(a(g),s("asc"));break;case"nameAsc":b&&t[b]&&(a(b),s("asc"));break;case"nameDesc":b&&t[b]&&(a(b),s("desc"));break}},[t,n.dateKey,n.nameKey]),f=A.useMemo(()=>lhe(e??[],r,i,t),[e,r,i,t]),p=A.useMemo(()=>{if(!r)return"default";const m=n.dateKey,g=n.nameKey;return m&&r===m&&i==="desc"?"newest":m&&r===m&&i==="asc"?"oldest":g&&r===g&&i==="asc"?"nameAsc":g&&r===g&&i==="desc"?"nameDesc":"default"},[r,i,n.dateKey,n.nameKey]);';

  const oyNew =
    'd=A.useCallback(m=>{const g=n.dateKey,b=n.nameKey,x=n.debtKey;switch(m){case"default":a(null),s("asc");break;case"newest":g&&t[g]&&(a(g),s("desc"));break;case"oldest":g&&t[g]&&(a(g),s("asc"));break;case"nameAsc":b&&t[b]&&(a(b),s("asc"));break;case"nameDesc":b&&t[b]&&(a(b),s("desc"));break;case"debtHigh":x&&t[x]&&(a(x),s("desc"));break;case"debtLow":x&&t[x]&&(a(x),s("asc"));break}},[t,n.dateKey,n.nameKey,n.debtKey]),f=A.useMemo(()=>lhe(e??[],r,i,t),[e,r,i,t]),p=A.useMemo(()=>{if(!r)return"default";const m=n.dateKey,g=n.nameKey,b=n.debtKey;return m&&r===m&&i==="desc"?"newest":m&&r===m&&i==="asc"?"oldest":g&&r===g&&i==="asc"?"nameAsc":g&&r===g&&i==="desc"?"nameDesc":b&&r===b&&i==="desc"?"debtHigh":b&&r===b&&i==="asc"?"debtLow":"default"},[r,i,n.dateKey,n.nameKey,n.debtKey]);';

  if (js.includes(oyNew)) {
    console.log('Oy already patched');
  } else {
    js = mustReplace(js, oyOld, oyNew, 'Oy useTableSort');
  }

  // 3) TableSortBar (Cy)
  const cyOld =
    'function Cy({value:e,onChange:t,className:n="",showNamePresets:r=!0,showDatePresets:a=!0,inline:i=!1}){const{t:s}=Xt(),c=A.useMemo(()=>{const d=[{value:"default",label:s("tableSort.default")}];return a&&d.push({value:"newest",label:s("tableSort.newest")},{value:"oldest",label:s("tableSort.oldest")}),r&&d.push({value:"nameAsc",label:s("tableSort.nameAsc")},{value:"nameDesc",label:s("tableSort.nameDesc")}),d},[s,a,r]);';

  const cyNew =
    'function Cy({value:e,onChange:t,className:n="",showNamePresets:r=!0,showDatePresets:a=!0,showDebtPresets:y=!1,inline:i=!1}){const{t:s}=Xt(),c=A.useMemo(()=>{const d=[{value:"default",label:s("tableSort.default")}];return a&&d.push({value:"newest",label:s("tableSort.newest")},{value:"oldest",label:s("tableSort.oldest")}),r&&d.push({value:"nameAsc",label:s("tableSort.nameAsc")},{value:"nameDesc",label:s("tableSort.nameDesc")}),y&&d.push({value:"debtHigh",label:s("tableSort.debtHigh")},{value:"debtLow",label:s("tableSort.debtLow")}),d},[s,a,r,y]);';

  if (js.includes(cyNew)) {
    console.log('Cy already patched');
  } else {
    js = mustReplace(js, cyOld, cyNew, 'Cy TableSortBar');
  }

  // 4) Rent register: enable debt presets + debtKey
  js = mustReplace(
    js,
    'Oy(U,W,{nameKey:"tenant"})',
    'Oy(U,W,{nameKey:"tenant",debtKey:"debt"})',
    'rent register Oy options'
  );
  js = mustReplace(
    js,
    'u.jsx(Cy,{value:Se,onChange:te,showDatePresets:!1})',
    'u.jsx(Cy,{value:Se,onChange:te,showDatePresets:!1,showDebtPresets:!0})',
    'rent register Cy props'
  );

  // 5) Keep debt sortValue = API rent debt (same as classic column)
  const debtCombined =
    'key:"debt",title:e("common.debt"),minWidth:"88px",sortable:!0,sortType:"number",sortValue:Q=>Math.round((Number(Q.debt||0)+Object.values(Q.months||{}).reduce((s,m)=>s+Math.max(0,Number((m==null?void 0:m.utility)||0)-Number((m==null?void 0:m.utilityPaid)||0)),0))*100)/100,render:Q=>(Q.debt??0).toFixed(2)}';
  const debtSimple =
    'key:"debt",title:e("common.debt"),minWidth:"88px",sortable:!0,sortType:"number",sortValue:Q=>Q.debt??0,render:Q=>(Q.debt??0).toFixed(2)}';
  if (js.includes(debtCombined)) {
    js = mustReplace(js, debtCombined, debtSimple, 'debt sortValue revert to API debt');
  }

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
