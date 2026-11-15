// AI Game Studio 공통 스모크 테스트
// 사용법: node tests/smoke.js [게임-slug ...] [--out <스크린샷 폴더>]
//  - 인자가 없으면 index.html 목록에 있는 모든 게임을 검사합니다.
//  - PC(1280x800)와 iPad(gen 7, 터치) 환경을 Chromium으로 에뮬레이션합니다.
//    실제 iPad Safari(WebKit) 테스트는 이 환경에서 불가능합니다.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : null;
const only = args.filter((a, i) => outIdx < 0 || (i !== outIdx && i !== outIdx + 1));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.webp': 'image/webp', '.woff2': 'font/woff2' };

// GitHub Pages와 같은 경로(/My-first-studio/...)로 서비스해 상대 경로 문제를 잡아냅니다.
const BASE = '/My-first-studio/';
function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let u = decodeURIComponent(req.url.split('?')[0]);
      if (!u.startsWith(BASE)) { res.writeHead(404); return res.end(); }
      let f = path.join(ROOT, u.slice(BASE.length));
      if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      if (!fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    }).listen(0, () => resolve(srv));
  });
}

// 순위표 백엔드(Supabase)는 기본 차단: 실서버를 절대 건드리지 않고, "백엔드 불통이어도 게임 정상"도 함께 확인
const isBackend = u => /^https?:\/\/[^/]*\.supabase\.co\//.test(u || '');
async function blockBackend(ctx) { await ctx.route('**/*.supabase.co/**', r => r.abort()); }
// 닉네임 게이트 우회: 등록된 방문자처럼 닉네임·상태·기기 번호를 미리 넣는다 (게이트 자체는 아래 별도 검사)
async function seedVisitor(ctx) {
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('studio-nickname', '테스트');
      localStorage.setItem('studio-nick-state', 'ok');
      if (!localStorage.getItem('studio-device-id')) localStorage.setItem('studio-device-id', '00000000-0000-4000-8000-00000000c0de');
    } catch (e) {}
  });
}

(async () => {
  const srv = await serve();
  const origin = `http://localhost:${srv.address().port}${BASE}`;
  const browser = await chromium.launch();
  const profiles = [
    { name: 'pc', opts: { viewport: { width: 1280, height: 800 } } },
    { name: 'ipad', opts: { ...devices['iPad (gen 7)'] } },
    { name: 'ipad-landscape', opts: { ...devices['iPad (gen 7) landscape'] } },
  ];
  let failed = 0;
  const report = [];

  // 1) 게임 목록 페이지
  const listCtx = await browser.newContext(profiles[0].opts);
  await blockBackend(listCtx);
  await seedVisitor(listCtx);
  const list = await listCtx.newPage();
  const listErrs = [];
  list.on('pageerror', e => listErrs.push(e.message));
  await list.goto(origin);
  const links = await list.$$eval('a.game', as => as.map(a => a.getAttribute('href')));
  const slugs = links.map(h => (h.match(/games\/([^/]+)/) || [])[1]).filter(Boolean);
  report.push(`[목록] 게임 ${slugs.length}개: ${slugs.join(', ')}${listErrs.length ? ' / 오류: ' + listErrs.join(' | ') : ''}`);
  if (listErrs.length) failed++;
  for (const s of slugs) {
    if (!fs.existsSync(path.join(ROOT, 'games', s, 'index.html'))) { report.push(`  ✗ 목록의 ${s} 폴더가 없음`); failed++; }
  }
  await listCtx.close();

  // 2) 닉네임 게이트 (처음 방문, 백엔드 불통): 게이트가 뜨고, 닉네임 + PIN 2번 → 임시 등록으로 닫혀야 함
  if (!only.length) {
    const gctx = await browser.newContext(profiles[0].opts);
    await blockBackend(gctx);
    const gp = await gctx.newPage();
    const gerrs = [];
    gp.on('pageerror', e => gerrs.push('pageerror: ' + e.message));
    gp.on('console', m => m.type() === 'error' && !isBackend((m.location() || {}).url) && gerrs.push('console: ' + m.text()));
    const gprob = [];
    try {
      await gp.goto(origin);
      await gp.waitForSelector('.lb-gate #lb-gate-nick', { timeout: 5000 });
      if (!(await gp.evaluate(() => window.Leaderboard && Leaderboard.isOpen()))) gprob.push('isOpen() false');
      await gp.keyboard.press('Escape');
      if (!(await gp.$('.lb-gate'))) gprob.push('Esc로 닫힘');
      await gp.fill('#lb-gate-nick', '스모크');
      await gp.keyboard.press('Enter');
      await gp.waitForSelector('#lb-gate-pin:visible', { timeout: 3000 });
      await gp.keyboard.type('1234'); await gp.keyboard.press('Enter');
      await gp.waitForFunction(() => window.__lb.gateStep() === 'set2', null, { timeout: 3000 });
      await gp.keyboard.type('1234'); await gp.keyboard.press('Enter');
      await gp.waitForFunction(() => !document.querySelector('.lb-gate'), null, { timeout: 9000 });
      const st = await gp.evaluate(() => window.__lb.state());
      if (st.nickState !== 'pending' || st.nickname !== '스모크') gprob.push('상태 ' + JSON.stringify(st));
    } catch (e) { gprob.push(String(e.message || e).split('\n')[0]); }
    gprob.push(...gerrs);
    report.push(`${gprob.length ? '✗' : '✓'} 닉네임 게이트 [pc]${gprob.length ? ' → ' + gprob.join(' | ') : ''}`);
    if (gprob.length) failed++;
    await gctx.close();
  }

  const targets = only.length ? only : slugs;
  for (const slug of targets) {
    for (const prof of profiles) {
      const ctx = await browser.newContext(prof.opts);
      await blockBackend(ctx);
      await seedVisitor(ctx);
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push('pageerror: ' + e.message));
      page.on('console', m => m.type() === 'error' && !isBackend((m.location() || {}).url) && errs.push('console: ' + m.text()));
      page.on('requestfailed', r => !isBackend(r.url()) && errs.push('request failed: ' + r.url()));
      page.on('response', r => r.status() >= 400 && errs.push(`HTTP ${r.status()}: ${r.url()}`));
      await page.goto(origin + `games/${slug}/`);
      await page.waitForTimeout(800);
      const info = await page.evaluate(() => ({
        title: document.title,
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        back: !!document.querySelector('a[href="../../"]'),
      }));
      const problems = [...errs];
      if (info.overflowX) problems.push('가로 스크롤 발생');
      if (!info.back) problems.push('← 게임 목록 링크 없음');
      if (OUT) {
        fs.mkdirSync(OUT, { recursive: true });
        await page.screenshot({ path: path.join(OUT, `${slug}-${prof.name}.png`) });
      }
      report.push(`${problems.length ? '✗' : '✓'} ${slug} [${prof.name}] "${info.title}"${problems.length ? ' → ' + problems.join(' | ') : ''}`);
      if (problems.length) failed++;
      await ctx.close();
    }
  }
  await browser.close();
  srv.close();
  console.log(report.join('\n'));
  console.log(failed ? `\n실패 ${failed}건` : '\n모든 스모크 테스트 통과');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
