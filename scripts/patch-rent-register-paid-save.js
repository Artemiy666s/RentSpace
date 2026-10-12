/**
 * Rent register edit modal: save/edit rent «Опл.» (paid), not only utilityPaid.
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

function replaceOnce(js, oldStr, newStr, label) {
  if (js.includes(newStr)) {
    console.log('skip', label, '(already)');
    return js;
  }
  if (!js.includes(oldStr)) throw new Error(`${label} needle missing`);
  console.log('apply', label);
  return js.replace(oldStr, newStr);
}

function patchJs(js) {
  js = replaceOnce(
    js,
    'function Nj(e){return{rent:e!=null&&e.rent?String(e.rent):"0",utility:e!=null&&e.utility?String(e.utility):"0",utilityPaid:e!=null&&e.utilityPaid?String(e.utilityPaid):"0"}}',
    'function Nj(e){return{rent:e!=null&&e.rent?String(e.rent):"0",paid:e!=null&&e.paid?String(e.paid):"0",utility:e!=null&&e.utility?String(e.utility):"0",utilityPaid:e!=null&&e.utilityPaid?String(e.utilityPaid):"0"}}',
    'Nj'
  );

  js = replaceOnce(
    js,
    'd=oc(c,"rent",(s==null?void 0:s.rent)??0),f=oc(c,"utility",(s==null?void 0:s.utility)??0),p=oc(c,"utilityPaid",(s==null?void 0:s.utilityPaid)??0),m=(s==null?void 0:s.paid)??0;a+=Aj(d,m,f,p)',
    'd=oc(c,"rent",(s==null?void 0:s.rent)??0),m=oc(c,"paid",(s==null?void 0:s.paid)??0),f=oc(c,"utility",(s==null?void 0:s.utility)??0),p=oc(c,"utilityPaid",(s==null?void 0:s.utilityPaid)??0);a+=Aj(d,m,f,p)',
    'UM'
  );

  js = replaceOnce(
    js,
    'd=oc(c,"rent",(s==null?void 0:s.rent)??0),f=oc(c,"utility",(s==null?void 0:s.utility)??0),p=oc(c,"utilityPaid",(s==null?void 0:s.utilityPaid)??0),m=(s==null?void 0:s.paid)??0,g=Aj(d,m,f,p)',
    'd=oc(c,"rent",(s==null?void 0:s.rent)??0),m=oc(c,"paid",(s==null?void 0:s.paid)??0),f=oc(c,"utility",(s==null?void 0:s.utility)??0),p=oc(c,"utilityPaid",(s==null?void 0:s.utilityPaid)??0),g=Aj(d,m,f,p)',
    'Cge'
  );

  js = replaceOnce(
    js,
    'const W=Rn(N.utilityPaid);if(W==null)throw new Error(`${s("rentRegister.utilPaidAmount")} (${or(s,L)}): ${s("planFact.invalidNumber")}`);F[String(L)]={rent:q,utility:U,utilityPaid:W}',
    'const W=Rn(N.utilityPaid);if(W==null)throw new Error(`${s("rentRegister.utilPaidAmount")} (${or(s,L)}): ${s("planFact.invalidNumber")}`);const H=Rn(N.paid);if(H==null)throw new Error(`${s("rentRegister.paidAmount")} (${or(s,L)}): ${s("planFact.invalidNumber")}`);F[String(L)]={rent:q,paid:H,utility:U,utilityPaid:W}',
    'save'
  );

  js = replaceOnce(
    js,
    'u.jsx(Ve,{label:s("rentRegister.rentWithVat"),inputMode:"decimal",value:((f.months[me]||{}).rent)??"0",onChange:z=>P(me,"rent",z.target.value)}),u.jsx(Ve,{label:s("rentRegister.utilAmount"),inputMode:"decimal",value:((f.months[me]||{}).utility)??"0",onChange:z=>P(me,"utility",z.target.value)}),u.jsx(Ve,{label:s("rentRegister.utilPaidAmount"),inputMode:"decimal",value:((f.months[me]||{}).utilityPaid)??"0",onChange:z=>P(me,"utilityPaid",z.target.value)})',
    'u.jsx(Ve,{label:s("rentRegister.rentWithVat"),inputMode:"decimal",value:((f.months[me]||{}).rent)??"0",onChange:z=>P(me,"rent",z.target.value)}),u.jsx(Ve,{label:s("rentRegister.paidAmount"),inputMode:"decimal",value:((f.months[me]||{}).paid)??"0",onChange:z=>P(me,"paid",z.target.value)}),u.jsx(Ve,{label:s("rentRegister.utilAmount"),inputMode:"decimal",value:((f.months[me]||{}).utility)??"0",onChange:z=>P(me,"utility",z.target.value)}),u.jsx(Ve,{label:s("rentRegister.utilPaidAmount"),inputMode:"decimal",value:((f.months[me]||{}).utilityPaid)??"0",onChange:z=>P(me,"utilityPaid",z.target.value)})',
    'fields'
  );

  if (!js.includes('paidAmount:"')) {
    const i18n = [
      [
        'utilPaidAmount:"Камунальная аплата",addPayment:',
        'utilPaidAmount:"Камунальная аплата",paidAmount:"Апл. арэнда",addPayment:',
      ],
      [
        'utilPaidAmount:"Utility payment",addPayment:',
        'utilPaidAmount:"Utility payment",paidAmount:"Rent paid",addPayment:',
      ],
      [
        'utilPaidAmount:"Коммунальная оплата",addPayment:',
        'utilPaidAmount:"Коммунальная оплата",paidAmount:"Опл. аренда",addPayment:',
      ],
    ];
    for (const [a, b] of i18n) {
      js = replaceOnce(js, a, b, 'i18n');
    }
  } else {
    console.log('skip i18n (already)');
  }

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
