/**
 * Patches the frozen production frontend to add rent-register split view
 * (аренда / коммун. rows with нач./опл. per month), without rebuilding from outdated client/src.
 *
 * Updates:
 * - server/public/assets/index-DGrUP6as.js
 * - server/public/assets/index-DVDS88w4.css
 * - backups/production-current (same files)
 * - scripts/restore-production-frontend.js (SHA-256)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const jsName = 'index-DGrUP6as.js';
const cssName = 'index-DVDS88w4.css';

const targets = [
  path.join(root, 'server', 'public', 'assets'),
  path.join(root, 'backups', 'production-current', 'assets'),
];

const SPLIT_CSS = [
  '._viewToggle_ogxkk_900{display:inline-flex;border:1.5px solid var(--color-border);border-radius:10px;overflow:hidden;background:var(--color-surface-solid,#fff)}',
  '._viewBtn_ogxkk_901{border:none;background:transparent;padding:9px 12px;font-size:13px;font-weight:600;font-family:inherit;color:var(--color-muted);cursor:pointer}',
  '._viewBtnActive_ogxkk_902{background:var(--selection-bg,var(--btn-gradient));color:var(--selection-color,#fff)}',
  '._splitWrap_ogxkk_903{width:100%;overflow:auto;border:1px solid var(--color-border);border-radius:12px;background:var(--color-surface-solid,#fff)}',
  '._splitTable_ogxkk_904{width:100%;border-collapse:collapse;font-size:13px;min-width:720px}',
  '._splitTable_ogxkk_904 th,._splitTable_ogxkk_904 td{border-bottom:1px solid var(--color-border);padding:8px 10px;vertical-align:middle;text-align:left;white-space:nowrap}',
  '._splitTable_ogxkk_904 thead th{background:var(--color-table-head,#f7f9fc);font-weight:700;color:var(--color-navy,var(--color-text));position:sticky;top:0;z-index:1}',
  '._monthGroup_ogxkk_905{text-align:center!important;border-left:1px solid var(--color-border)}',
  '._subCol_ogxkk_906{text-align:right!important;font-weight:600;color:var(--color-muted);border-left:1px solid var(--color-border);min-width:72px}',
  '._indicatorCol_ogxkk_907{min-width:88px}',
  '._indicatorCell_ogxkk_908{font-weight:600;color:var(--color-navy,var(--color-text));background:rgba(18,103,232,.04)}',
  '._splitRow_ogxkk_909{cursor:pointer}',
  '._splitRow_ogxkk_909:hover td{background:rgba(18,103,232,.06)}',
  '._splitRowAlt_ogxkk_910 td:not(._indicatorCell_ogxkk_908){background:rgba(6,27,51,.02)}',
  '._totalRowSplit_ogxkk_911 td{font-weight:700;background:var(--color-table-head,#f0f4fa)}',
  '._numCell_ogxkk_912{text-align:right!important;font-variant-numeric:tabular-nums}',
  '@media(max-width:900px){._viewToggle_ogxkk_900{display:none!important}}',
].join('');

const SPLIT_RENDERER = fs
  .readFileSync(path.join(__dirname, '_split-renderer.fragment.js'), 'utf8')
  .replace(/\r?\n/g, '')
  .trim();

function patchJs(js) {
  if (js.includes('rentRegister.viewSplit') && js.includes('function rrSplitRender(')) {
    console.log('JS already patched');
    return js;
  }

  // 1) Style map extensions
  const styleNeedle = 'mobileSearch:fve}';
  if (!js.includes(styleNeedle)) throw new Error('style map needle not found');
  js = js.replace(
    styleNeedle,
    'mobileSearch:fve,viewToggle:"_viewToggle_ogxkk_900",viewBtn:"_viewBtn_ogxkk_901",viewBtnActive:"_viewBtnActive_ogxkk_902",splitWrap:"_splitWrap_ogxkk_903",splitTable:"_splitTable_ogxkk_904",monthGroup:"_monthGroup_ogxkk_905",subCol:"_subCol_ogxkk_906",indicatorCol:"_indicatorCol_ogxkk_907",indicatorCell:"_indicatorCell_ogxkk_908",splitRow:"_splitRow_ogxkk_909",splitRowAlt:"_splitRowAlt_ogxkk_910",totalRow:"_totalRowSplit_ogxkk_911",numCell:"_numCell_ogxkk_912"}'
  );

  // 2) Inject renderer before pve
  const pveNeedle = 'function pve(){';
  if (!js.includes(pveNeedle)) throw new Error('pve not found');
  js = js.replace(pveNeedle, `${SPLIT_RENDERER}function pve(){`);

  // 3) View mode state (unique to rent-register page)
  const stateNeedle = '[x,v]=A.useState(null),[S,k]=A.useState(""),j=t?[b]:m';
  if (!js.includes(stateNeedle)) throw new Error('search state needle not found');
  js = js.replace(
    stateNeedle,
    '[x,v]=A.useState(null),[S,k]=A.useState(""),[Gl,Yl]=A.useState("classic"),j=t?[b]:m'
  );

  // 4) View toggle UI (desktop) next to sort bar
  const sortNeedle =
    'u.jsx("div",{className:pt.desktopOnly,children:u.jsx(Cy,{value:Se,onChange:te,showDatePresets:!1})})';
  if (!js.includes(sortNeedle)) throw new Error('sort bar needle not found');
  js = js.replace(
    sortNeedle,
    'u.jsxs("div",{className:`${pt.viewToggle} ${pt.desktopOnly}`,role:"group","aria-label":e("rentRegister.viewLabel"),children:[u.jsx("button",{type:"button",className:`${pt.viewBtn} ${Gl==="classic"?pt.viewBtnActive:""}`,onClick:()=>Yl("classic"),children:e("rentRegister.viewClassic")}),u.jsx("button",{type:"button",className:`${pt.viewBtn} ${Gl==="split"?pt.viewBtnActive:""}`,onClick:()=>Yl("split"),children:e("rentRegister.viewSplit")})]}),u.jsx("div",{className:pt.desktopOnly,children:u.jsx(Cy,{value:Se,onChange:te,showDatePresets:!1})})'
  );

  // 5) Swap desktop DataTable for split/classic
  const tableNeedle =
    'u.jsx(kj,{tableId:"rent-register",columns:q,rows:X,rowKey:K=>K.rowNum,onRowClick:v,sortKey:V,sortDirection:B,onSort:G,footerCells:me,emptyText:S.trim()?e("rentRegister.noSearchResults"):e("common.noData"),wide:!0})';
  if (!js.includes(tableNeedle)) throw new Error('DataTable needle not found');
  js = js.replace(
    tableNeedle,
    'Gl==="split"?rrSplitRender(e,m,X,v,S.trim()?e("rentRegister.noSearchResults"):e("common.noData"),le,pt):u.jsx(kj,{tableId:"rent-register",columns:q,rows:X,rowKey:K=>K.rowNum,onRowClick:v,sortKey:V,sortDirection:B,onSort:G,footerCells:me,emptyText:S.trim()?e("rentRegister.noSearchResults"):e("common.noData"),wide:!0})'
  );

  // 6) i18n keys (ru / be / en) — insert before totalRow in rentRegister blocks
  const i18nPatches = [
    {
      find: 'colRate:"Арендная ставка без НДС",totalRow:"ИТОГО"',
      replace:
        'colRate:"Арендная ставка без НДС",colIndicator:"Показатели",indicatorRent:"Аренда",indicatorUtil:"Коммун.",chargedShort:"Нач.",paidShort:"Опл.",viewClassic:"Обычная таблица",viewSplit:"Аренда / коммун.",viewLabel:"Вид таблицы",totalRow:"ИТОГО"',
    },
    {
      find: 'colRate:"Арандная стаўка без ПДВ",totalRow:"РАЗАМ"',
      replace:
        'colRate:"Арандная стаўка без ПДВ",colIndicator:"Паказчыкі",indicatorRent:"Арэнда",indicatorUtil:"Камун.",chargedShort:"Нал.",paidShort:"Апл.",viewClassic:"Звычайная табліца",viewSplit:"Арэнда / камун.",viewLabel:"Выгляд табліцы",totalRow:"РАЗАМ"',
    },
    {
      find: 'colRate:"Rent rate excl. VAT",totalRow:"TOTAL"',
      replace:
        'colRate:"Rent rate excl. VAT",colIndicator:"Indicators",indicatorRent:"Rent",indicatorUtil:"Utilities",chargedShort:"Chg.",paidShort:"Paid",viewClassic:"Classic table",viewSplit:"Rent / utilities",viewLabel:"Table view",totalRow:"TOTAL"',
    },
  ];
  for (const { find, replace } of i18nPatches) {
    if (!js.includes(find)) throw new Error(`i18n needle not found: ${find}`);
    js = js.replace(find, replace);
  }

  return js;
}

function patchCss(css) {
  if (css.includes('_viewToggle_ogxkk_900')) {
    console.log('CSS already patched');
    return css;
  }
  // Append after ogxkk block — safest: append at end of file
  return css + SPLIT_CSS;
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
}

function main() {
  let js = fs.readFileSync(path.join(targets[0], jsName), 'utf8');
  let css = fs.readFileSync(path.join(targets[0], cssName), 'utf8');

  js = patchJs(js);
  css = patchCss(css);

  const hash = sha256(Buffer.from(js, 'utf8'));

  for (const dir of targets) {
    fs.writeFileSync(path.join(dir, jsName), js);
    fs.writeFileSync(path.join(dir, cssName), css);
    console.log('Wrote', dir);
  }

  const restorePath = path.join(root, 'scripts', 'restore-production-frontend.js');
  let restore = fs.readFileSync(restorePath, 'utf8');
  const hashRe = /const expectedSha256 =\s*'[A-F0-9]+'/;
  if (!hashRe.test(restore)) throw new Error('restore hash pattern not found');
  restore = restore.replace(hashRe, `const expectedSha256 =\n  '${hash}'`);
  fs.writeFileSync(restorePath, restore);

  // Also update PRODUCTION_BUILD.md hash if present
  const docPath = path.join(root, 'docs', 'PRODUCTION_BUILD.md');
  if (fs.existsSync(docPath)) {
    let doc = fs.readFileSync(docPath, 'utf8');
    doc = doc.replace(/SHA-256: `[A-F0-9]+`/, `SHA-256: \`${hash}\``);
    fs.writeFileSync(docPath, doc);
  }

  console.log('Patched rent-register split view');
  console.log('New SHA-256:', hash);
}

main();
