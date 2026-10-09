/**
 * Dashboard: debt-dynamics titles + utility debt columns (like rent).
 * Patches frozen production frontend + updates SHA hash.
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

const YE_NEW =
  'ye=()=>u.jsx("div",{className:xe.kpiWideSlot,children:u.jsxs(kn,{className:`${xe.kpiCard} ${xe.kpiCardWide}`,children:[u.jsxs("div",{className:xe.kpiDebtHead,children:[u.jsx("div",{className:xe.kpiIcon,children:u.jsx(RC,{size:22})}),u.jsx("button",{type:"button",className:xe.kpiWideTitleBtn,onClick:()=>K(),children:e("dashboard.utilities")})]}),u.jsxs("div",{className:xe.kpiDebtColumns,children:[u.jsxs("button",{type:"button",className:xe.kpiDebtColBtn,onClick:()=>K(),"aria-label":e("common.debt"),children:[u.jsx("span",{className:xe.kpiLabel,children:e("common.debt")}),u.jsxs("strong",{className:xe.kpiValue,children:[qe(he==null?void 0:he.debt)," ",u.jsx("small",{children:e("common.currencyByn")})]})]}),((he==null?void 0:he.debtMonths)||[]).map(fe=>u.jsxs("button",{type:"button",className:xe.kpiDebtColBtn,onClick:()=>K(fe),"aria-label":Xn(e,fe.month),children:[u.jsx("span",{className:xe.kpiLabel,children:Xn(e,fe.month)}),u.jsxs("strong",{className:xe.kpiValue,children:[qe(fe.amount)," ",u.jsx("small",{children:e("common.currencyByn")})]})]},"u-"+fe.year+"-"+fe.month))]})]})})';

const MOBILE_UTIL_NEW =
  'u.jsxs("button",{type:"button",className:xe.mobileDebtAlert,onClick:()=>K(),"aria-label":e("dashboard.utilities"),children:[u.jsx("div",{className:xe.mobileDebtIcon,children:u.jsx(RC,{size:20})}),u.jsxs("div",{className:xe.mobileDebtText,children:[u.jsx("span",{className:xe.mobileDebtLabel,children:e("dashboard.utilities")}),u.jsxs("strong",{className:xe.mobileDebtAmount,children:[(he==null?void 0:he.debt)!=null?Number(he.debt).toFixed(0):e("common.dash")," ",u.jsx("small",{children:e("common.currencyByn")})]}),((he==null?void 0:he.debtMonths)||[]).length>0?u.jsx("span",{className:xe.mobileDebtMonths,children:((he==null?void 0:he.debtMonths)||[]).map(fe=>Xn(e,fe.month)+": "+qe(fe.amount)+" "+e("common.currencyByn")).join(" · ")}):null]}),u.jsx(bm,{size:20,className:xe.mobileDebtChevron})]})';

function patchJs(js) {
  if (js.includes('Динамика задолженности арендных платежей') && js.includes('he.debtMonths)||[]).map')) {
    console.log('Already patched');
    return js;
  }

  const i18n = [
    ['rentPayments:"Динамика арендных платежей"', 'rentPayments:"Динамика задолженности арендных платежей"'],
    ['utilities:"Динамика коммунальных платежей"', 'utilities:"Динамика задолженности коммунальных платежей"'],
    ['rentPayments:"Дынаміка арэндных плацяжоў"', 'rentPayments:"Дынаміка запазычанасці арэндных плацяжоў"'],
    ['utilities:"Дынаміка камунальных плацяжоў"', 'utilities:"Дынаміка запазычанасці камунальных плацяжоў"'],
    ['rentPayments:"Rent payment dynamics"', 'rentPayments:"Rent payment debt dynamics"'],
    ['utilities:"Utility payment dynamics"', 'utilities:"Utility payment debt dynamics"'],
  ];
  for (const [a, b] of i18n) {
    if (!js.includes(a)) throw new Error('i18n needle missing: ' + a);
    js = js.replace(a, b);
  }

  const yeStart = js.indexOf('ye=()=>u.jsx("div",{className:xe.kpiWideSlot');
  const yeEnd = js.indexOf(',ze=[', yeStart);
  if (yeStart < 0 || yeEnd < 0) throw new Error('desktop ye card bounds not found');
  js = js.slice(0, yeStart) + YE_NEW + js.slice(yeEnd);

  js = js.replace(
    'aria-label":e("dashboard.currentDebt"),children:[u.jsx("div",{className:xe.mobileDebtIcon,children:u.jsx(NC,{size:20})}),u.jsxs("div",{className:xe.mobileDebtText,children:[u.jsx("span",{className:xe.mobileDebtLabel,children:e("dashboard.currentDebt")})',
    'aria-label":e("dashboard.rentPayments"),children:[u.jsx("div",{className:xe.mobileDebtIcon,children:u.jsx(NC,{size:20})}),u.jsxs("div",{className:xe.mobileDebtText,children:[u.jsx("span",{className:xe.mobileDebtLabel,children:e("dashboard.rentPayments")})'
  );

  const muStart = js.indexOf(
    'u.jsxs("button",{type:"button",className:xe.mobileDebtAlert,onClick:()=>K(),"aria-label":e("dashboard.utilities")'
  );
  const muEnd = js.indexOf(',u.jsxs("section",{className:xe.mobileAnalytics', muStart);
  if (muStart < 0 || muEnd < 0) throw new Error('mobile util card bounds not found');
  js = js.slice(0, muStart) + MOBILE_UTIL_NEW + js.slice(muEnd);

  return js;
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
}

function main() {
  let js = fs.readFileSync(path.join(targets[0], jsName), 'utf8');
  js = patchJs(js);
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

  try {
    new Function(js);
    console.log('parse OK');
  } catch (e) {
    console.error('parse FAIL', e.message);
    process.exit(1);
  }
  console.log('New SHA-256:', hash);
}

main();
