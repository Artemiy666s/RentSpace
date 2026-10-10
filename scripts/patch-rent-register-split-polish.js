/**
 * Polish rent-register split view: compact layout, column/row resize, clickable headers.
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
  '._splitWrap_ogxkk_903{width:100%;overflow:hidden;border:1px solid var(--color-border);border-radius:12px;background:var(--color-surface-solid,#fff);position:relative}',
  '._splitTable_ogxkk_904{width:100%;max-width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;line-height:1.25}',
  '._splitTableFixed_ogxkk_913{table-layout:fixed;width:100%;max-width:100%;border-collapse:separate}',
  '._splitTable_ogxkk_904 th,._splitTable_ogxkk_904 td{border-bottom:1px solid var(--color-border);border-right:1px solid rgba(6,27,51,.06);padding:4px 8px;vertical-align:middle;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:var(--rr-row-h,28px);height:auto;box-sizing:border-box}',
  '._splitTable_ogxkk_904 tbody td:not([rowspan]){height:var(--rr-row-h,28px)}',
  '._splitTable_ogxkk_904 thead th{background:var(--color-table-head,#f7f9fc);font-weight:700;color:var(--color-navy,var(--color-text));position:relative;z-index:1}',
  '._splitTable_ogxkk_904 thead tr:nth-child(2) th{font-size:11px;background:var(--color-table-head,#f7f9fc)}',
  '._monthGroup_ogxkk_905{text-align:center!important;border-left:1px solid var(--color-border);background:rgba(18,103,232,.04)}',
  '._subCol_ogxkk_906{text-align:right!important;font-weight:600;color:var(--color-muted);border-left:1px solid var(--color-border);font-size:11px}',
  '._indicatorCell_ogxkk_908{font-weight:600;color:var(--color-navy,var(--color-text));background:rgba(18,103,232,.05);font-size:12px}',
  '._splitRow_ogxkk_909{cursor:pointer}',
  '._splitRow_ogxkk_909:hover td{background:rgba(18,103,232,.08)!important}',
  '._splitRowAlt_ogxkk_910 td:not(._indicatorCell_ogxkk_908){background:rgba(6,27,51,.015)}',
  '._splitPairAlt_ogxkk_914 td{background:rgba(6,27,51,.03)}',
  '._totalRowSplit_ogxkk_911 td{font-weight:700;background:var(--color-table-head,#f0f4fa);position:relative;z-index:0}',
  '._numCell_ogxkk_912{text-align:right!important;font-variant-numeric:tabular-nums}',
  '._tenantCell_ogxkk_915{overflow:hidden;text-overflow:ellipsis;font-weight:600}',
  '._contractCell_ogxkk_916{overflow:hidden;text-overflow:ellipsis;color:var(--color-muted);font-size:12px}',
  '._debtCell_ogxkk_917{font-weight:700;border-left:1px solid var(--color-border)}',
  '._thResizable_ogxkk_918{position:relative}',
  '._colResizeHandle_ogxkk_919{position:absolute;top:0;right:-5px;width:10px;height:100%;cursor:col-resize;touch-action:none;z-index:4}',
  '._colResizeHandle_ogxkk_919:after{content:"";position:absolute;top:15%;bottom:15%;left:4px;width:2px;border-radius:1px;background:transparent}',
  '._colResizeHandle_ogxkk_919:hover:after,._colResizeHandle_ogxkk_919:active:after{background:var(--color-blue,#1267e8)}',
  '._splitSortBtn_ogxkk_920{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:4px;width:100%;box-sizing:border-box;font:inherit;font-weight:700;color:inherit}',
  '._splitSortBtn_ogxkk_920:hover{color:var(--color-blue,#1267e8)}',
  '._rowResizeBar_ogxkk_921{height:8px;cursor:row-resize;touch-action:none;position:relative}',
  '._rowResizeBar_ogxkk_921:after{content:"";position:absolute;left:20%;right:20%;top:3px;height:2px;border-radius:1px;background:transparent}',
  '._rowResizeBar_ogxkk_921:hover:after{background:var(--color-blue,#1267e8)}',
  '._emptyCell_ogxkk_922{text-align:center!important;color:var(--color-muted);padding:20px 12px!important;height:auto!important}',
  '._numCol_ogxkk_923{text-align:center!important}',
  '._totalLabel_ogxkk_924{font-weight:800}',
].join('');

// Accept either first polish map or already-polished map when re-running.
const STYLE_OLD_VARIANTS = [
  'mobileSearch:fve,viewToggle:"_viewToggle_ogxkk_900",viewBtn:"_viewBtn_ogxkk_901",viewBtnActive:"_viewBtnActive_ogxkk_902",splitWrap:"_splitWrap_ogxkk_903",splitTable:"_splitTable_ogxkk_904",monthGroup:"_monthGroup_ogxkk_905",subCol:"_subCol_ogxkk_906",indicatorCol:"_indicatorCol_ogxkk_907",indicatorCell:"_indicatorCell_ogxkk_908",splitRow:"_splitRow_ogxkk_909",splitRowAlt:"_splitRowAlt_ogxkk_910",totalRow:"_totalRowSplit_ogxkk_911",numCell:"_numCell_ogxkk_912"}',
  'mobileSearch:fve,viewToggle:"_viewToggle_ogxkk_900",viewBtn:"_viewBtn_ogxkk_901",viewBtnActive:"_viewBtnActive_ogxkk_902",splitWrap:"_splitWrap_ogxkk_903",splitTable:"_splitTable_ogxkk_904",monthGroup:"_monthGroup_ogxkk_905",subCol:"_subCol_ogxkk_906",indicatorCol:"_indicatorCol_ogxkk_907",indicatorCell:"_indicatorCell_ogxkk_908",splitRow:"_splitRow_ogxkk_909",splitRowAlt:"_splitRowAlt_ogxkk_910",totalRow:"_totalRowSplit_ogxkk_911",numCell:"_numCell_ogxkk_912",splitTableFixed:"_splitTableFixed_ogxkk_913",splitPairAlt:"_splitPairAlt_ogxkk_914",tenantCell:"_tenantCell_ogxkk_915",contractCell:"_contractCell_ogxkk_916",debtCell:"_debtCell_ogxkk_917",thResizable:"_thResizable_ogxkk_918",colResizeHandle:"_colResizeHandle_ogxkk_919",splitSortBtn:"_splitSortBtn_ogxkk_920",rowResizeBar:"_rowResizeBar_ogxkk_921",emptyCell:"_emptyCell_ogxkk_922"}',
];

const STYLE_NEW =
  'mobileSearch:fve,viewToggle:"_viewToggle_ogxkk_900",viewBtn:"_viewBtn_ogxkk_901",viewBtnActive:"_viewBtnActive_ogxkk_902",splitWrap:"_splitWrap_ogxkk_903",splitTable:"_splitTable_ogxkk_904",monthGroup:"_monthGroup_ogxkk_905",subCol:"_subCol_ogxkk_906",indicatorCol:"_indicatorCol_ogxkk_907",indicatorCell:"_indicatorCell_ogxkk_908",splitRow:"_splitRow_ogxkk_909",splitRowAlt:"_splitRowAlt_ogxkk_910",totalRow:"_totalRowSplit_ogxkk_911",numCell:"_numCell_ogxkk_912",splitTableFixed:"_splitTableFixed_ogxkk_913",splitPairAlt:"_splitPairAlt_ogxkk_914",tenantCell:"_tenantCell_ogxkk_915",contractCell:"_contractCell_ogxkk_916",debtCell:"_debtCell_ogxkk_917",thResizable:"_thResizable_ogxkk_918",colResizeHandle:"_colResizeHandle_ogxkk_919",splitSortBtn:"_splitSortBtn_ogxkk_920",rowResizeBar:"_rowResizeBar_ogxkk_921",emptyCell:"_emptyCell_ogxkk_922",numCol:"_numCol_ogxkk_923",totalLabel:"_totalLabel_ogxkk_924"}';

function minifyFragment(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .map((line) => {
      // Strip line comments carefully (not inside strings).
      let out = '';
      let inStr = null;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        const prev = line[i - 1];
        if (inStr) {
          out += ch;
          if (ch === inStr && prev !== '\\') inStr = null;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
          inStr = ch;
          out += ch;
          continue;
        }
        if (ch === '/' && line[i + 1] === '/') break;
        out += ch;
      }
      return out.trim();
    })
    .filter(Boolean)
    .join('\n')
    .replace(/\s+/g, ' ')
    .replace(/ ?([{}();,\[\]]) ?/g, '$1')
    .trim();
}

function patchJs(js) {
  const frag = minifyFragment(
    fs.readFileSync(path.join(__dirname, '_split-renderer.fragment.js'), 'utf8')
  );
  if (!frag.startsWith('function rrSplitRender')) throw new Error('bad fragment');

  const fnStart = js.indexOf('function rrSplitRender');
  if (fnStart < 0) throw new Error('rrSplitRender not found');
  const fnEnd = js.indexOf('function pve()', fnStart);
  if (fnEnd < 0) throw new Error('pve after rrSplitRender not found');
  js = js.slice(0, fnStart) + frag + js.slice(fnEnd);

  // Call site: function call -> React element (or refresh props if already converted)
  const callNew =
    'Gl==="split"?u.jsx(rrSplitRender,{t:e,months:m,rows:X,onRowClick:v,emptyText:S.trim()?e("rentRegister.noSearchResults"):e("common.noData"),totals:le,styles:pt,onSort:G}):';
  const callOldFn =
    'Gl==="split"?rrSplitRender(e,m,X,v,S.trim()?e("rentRegister.noSearchResults"):e("common.noData"),le,pt):';
  if (js.includes(callOldFn)) {
    js = js.replace(callOldFn, callNew);
  } else if (!js.includes('u.jsx(rrSplitRender,{t:e,months:m')) {
    throw new Error('split call site not found');
  }

  if (js.includes(STYLE_NEW)) {
    // already fully mapped
  } else {
    const old = STYLE_OLD_VARIANTS.find((s) => js.includes(s));
    if (!old) throw new Error('style map needle not found');
    js = js.replace(old, STYLE_NEW);
  }

  const i18n = [
    [
      'viewLabel:"Вид таблицы",totalRow:"ИТОГО"',
      'viewLabel:"Вид таблицы",resizeRows:"Потяните, чтобы изменить высоту строк",totalRow:"ИТОГО"',
    ],
    [
      'viewLabel:"Выгляд табліцы",totalRow:"РАЗАМ"',
      'viewLabel:"Выгляд табліцы",resizeRows:"Пацягніце, каб змяніць вышыню радкоў",totalRow:"РАЗАМ"',
    ],
    [
      'viewLabel:"Table view",totalRow:"TOTAL"',
      'viewLabel:"Table view",resizeRows:"Drag to resize row height",totalRow:"TOTAL"',
    ],
  ];
  for (const [a, b] of i18n) {
    if (js.includes(a)) js = js.replace(a, b);
  }

  return js;
}

function patchCss(css) {
  // Restore base CSS from last good commit extras boundary, then append polished suite
  const { execSync } = require('child_process');
  const good = execSync('git show 3a1c83a:server/public/assets/index-DVDS88w4.css', {
    maxBuffer: 20 * 1024 * 1024,
  }).toString('utf8');
  const marker = '._viewToggle_ogxkk_900';
  const idx = good.indexOf(marker);
  if (idx < 0) throw new Error('good css missing viewToggle marker');
  css = good.slice(0, idx);
  const TOGGLE = [
    '._viewToggle_ogxkk_900{display:inline-flex;border:1.5px solid var(--color-border);border-radius:10px;overflow:hidden;background:var(--color-surface-solid,#fff)}',
    '._viewBtn_ogxkk_901{border:none;background:transparent;padding:9px 12px;font-size:13px;font-weight:600;font-family:inherit;color:var(--color-muted);cursor:pointer}',
    '._viewBtnActive_ogxkk_902{background:var(--selection-bg,var(--btn-gradient));color:var(--selection-color,#fff)}',
    '@media(max-width:900px){._viewToggle_ogxkk_900{display:none!important}}',
  ].join('');
  return css + TOGGLE + SPLIT_CSS;
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
}

function main() {
  let js = fs.readFileSync(path.join(targets[0], jsName), 'utf8');
  let css = fs.readFileSync(path.join(targets[0], cssName), 'utf8');

  js = patchJs(js);
  css = patchCss(css);

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
    fs.writeFileSync(path.join(dir, cssName), css);
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
