const fs = require('fs');
const p = '/root/farewell_work/index.html';
let html = fs.readFileSync(p, 'utf8');
const anchor = '<div class="stats" id="stats"></div>';
const card = [
'<div style="margin:18px auto 0;max-width:760px;padding:14px 20px;border:1px solid rgba(125,211,252,.35);border-radius:14px;background:rgba(125,211,252,.07);display:flex;align-items:center;gap:14px;justify-content:space-between;flex-wrap:wrap;text-align:left">',
'  <div>',
'    <b style="font-size:15px">iOS26 苹果风格应用图标 · 独立分区</b>',
'    <div style="font-size:12px;color:#98a0c8;margin-top:4px">797 个应用图标（PNG），Apple iOS 圆角风格，支持搜索 · 预览 · 下载</div>',
'  </div>',
'  <a href="app-icons/index.html" style="white-space:nowrap;font-size:13px;padding:8px 18px;border-radius:999px;background:linear-gradient(92deg,rgba(125,211,252,.25),rgba(167,139,250,.25));border:1px solid rgba(125,211,252,.55);color:#fff">进入分区 &#8594;</a>',
'</div>'
].join('\n');
if (html.indexOf(anchor) < 0) { console.log('anchor missing'); process.exit(1); }
if (html.indexOf('app-icons/index.html') > -1) { console.log('already added'); process.exit(0); }
html = html.replace(anchor, anchor + '\n' + card);
fs.writeFileSync(p, html);
console.log('index updated');
const rp = '/root/farewell_work/README.md';
if (fs.existsSync(rp)) {
  let rd = fs.readFileSync(rp, 'utf8');
  if (rd.indexOf('iOS26') < 0) {
    const add = '\n---\n\n## 独立分区\n\n- [iOS26 苹果风格应用图标](app-icons/index.html) - 797 个 PNG 应用图标，Apple iOS 圆角风格，来自 iOS26 图标包应用\n';
    fs.writeFileSync(rp, rd + add);
    console.log('readme updated');
  } else { console.log('readme already has iOS26'); }
}
