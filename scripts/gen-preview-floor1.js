const fs = require('fs');
const path = require('path');
const b64 = fs
  .readFileSync(path.join(__dirname, '..', 'server', 'uploads', 'floor-plans', '56e-floor-1.png'))
  .toString('base64');
const shapes = [
  '184,336 346,336 346,582 184,582',
  '366,336 452,336 452,582 366,582',
  '472,336 558,336 558,582 472,582',
  '126,54 294,54 294,220 220,220 220,246 126,246',
  '306,54 504,54 504,246 306,246',
  '520,54 594,54 594,246 520,246',
  '56,54 118,54 118,168 56,168',
  '126,254 558,254 558,324 126,324',
  '566,54 970,54 970,582 566,582',
];
const colors = ['#8FD4A8', '#B8E8C8', '#8FD4A8', '#8FD4A8', '#E8EDF3', '#FFE08A', '#ddd', '#ccc', '#ddd'];
const polys = shapes.map((pts, i) => `<polygon fill="${colors[i]}" points="${pts}" />`).join('\n    ');
const html = `<!DOCTYPE html><html><body style="margin:0;background:#111">
<svg viewBox="0 0 1024 630" xmlns="http://www.w3.org/2000/svg" style="max-width:100vw;max-height:100vh;display:block;margin:auto">
  <image href="data:image/jpeg;base64,${b64}" width="1024" height="630"/>
  <g fill-opacity="0.55" stroke="#333" stroke-width="1.2">${polys}</g>
</svg></body></html>`;
fs.writeFileSync(path.join(__dirname, 'preview-56e-floor1.html'), html);
console.log('written preview-56e-floor1.html');
