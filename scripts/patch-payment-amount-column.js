const fs = require('fs');
const crypto = require('crypto');

const files = [
  'D:/RentSpace.by/server/public/assets/index-DGrUP6as.js',
  'D:/RentSpace.by/backups/production-current/assets/index-DGrUP6as.js',
];

const oldSnippet =
  'u.jsxs("span",{className:Pt.paymentMeta,children:[Age(D.payment_date)," · ",Number(D.amount).toFixed(2)," ",i("common.currencyByn")]})';

const newSnippet =
  'u.jsxs("span",{className:Pt.paymentMeta,children:[u.jsx("span",{className:Pt.paymentDate,children:Age(D.payment_date)}),u.jsxs("span",{className:Pt.paymentAmount,children:[Number(D.amount).toFixed(2)," ",i("common.currencyByn")]})]})';

const oldCss =
  '._paymentMeta_166ng_239{font-size:.8125rem}';

const newCss =
  '._paymentMeta_166ng_239{flex:1;min-width:0;display:flex;align-items:center;justify-content:space-between;gap:.75rem;font-size:.8125rem}._paymentDate_166ng_240{color:var(--text-muted,#64748b);flex-shrink:0}._paymentAmount_166ng_241{margin-left:auto;font-weight:700;font-variant-numeric:tabular-nums;font-size:.9375rem;color:var(--text,#0f172a);text-align:right;white-space:nowrap}';

const cssFiles = [
  'D:/RentSpace.by/server/public/assets/index-DVDS88w4.css',
  'D:/RentSpace.by/backups/production-current/assets/index-DVDS88w4.css',
];

for (const file of files) {
  let js = fs.readFileSync(file, 'utf8');
  const count = js.split(oldSnippet).length - 1;
  if (count !== 1) {
    console.error('JS match count', count, 'in', file);
    process.exit(1);
  }
  js = js.replace(oldSnippet, newSnippet);
  fs.writeFileSync(file, js);
  console.log('patched', file);
}

for (const file of cssFiles) {
  let css = fs.readFileSync(file, 'utf8');
  const count = css.split(oldCss).length - 1;
  if (count !== 1) {
    console.error('CSS match count', count, 'in', file);
    process.exit(1);
  }
  css = css.replace(oldCss, newCss);
  fs.writeFileSync(file, css);
  console.log('patched', file);
}

const jsPath = 'D:/RentSpace.by/backups/production-current/assets/index-DGrUP6as.js';
const hash = crypto.createHash('sha256').update(fs.readFileSync(jsPath)).digest('hex').toUpperCase();
console.log('NEW_SHA256', hash);
