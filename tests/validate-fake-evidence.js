// 증거 조작범(fake-evidence) 사건 데이터 검증
// 사용법: node tests/validate-fake-evidence.js
//  1) docs/games/fake-evidence/cases.json 정적 검사 (스키마, 6개 증거, fake 인덱스, 이유 4개·정답 1, link, 글자 수)
//  2) games/fake-evidence/index.html 안 #cases JSON이 문서와 같은지
//  3) Playwright로 게임의 window.__evidence.validate()와 점수 시뮬레이션(완벽 1800, 전부 오답 → 3번째에서 종료, 증거만 → 시간 보너스 0)
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const DOC = path.join(ROOT, 'docs/games/fake-evidence/cases.json');
const HTML = path.join(ROOT, 'games/fake-evidence/index.html');
const errors = [], warnings = [];
const err = m => errors.push(m), warn = m => warnings.push(m);

// ---- 1) 정적 검사 ----
const LIMIT = { story: 40, fact: 50, name: 12, detail: 45, reason: 35, explain: 60 }; // design.md 「문장 길이 기준」(내외 → 초과는 경고)
const SLACK = { reason: 10, explain: 40 };
const doc = JSON.parse(fs.readFileSync(DOC, 'utf8'));
const cases = doc.cases;
if (!Array.isArray(cases)) { console.error('cases 배열 없음'); process.exit(1); }
const ids = new Set();
const len = s => Array.from(String(s)).length;
function chkLen(what, s, id) { const n = len(s), max = LIMIT[what] + (SLACK[what] || 0); if (n > max) warn(`${id} ${what} ${n}자 > ${LIMIT[what]} : ${s}`); }
for (const c of cases) {
  const id = c.id || '(id 없음)';
  if (ids.has(c.id)) err(`${id} id 중복`); ids.add(c.id);
  if (![1, 2, 3].includes(c.tier)) err(`${id} tier ${c.tier}`);
  for (const f of ['title', 'icon', 'story', 'explain']) if (typeof c[f] !== 'string' || !c[f].trim()) err(`${id} ${f} 비어 있음`);
  // facts
  if (!Array.isArray(c.facts) || c.facts.length < 2 || c.facts.length > 4) err(`${id} facts 2~4개 아님`);
  const fids = new Set();
  for (const f of c.facts || []) {
    if (!f.id || !f.text || !f.text.trim()) err(`${id} fact 비어 있음`);
    if (fids.has(f.id)) err(`${id} fact id 중복 ${f.id}`); fids.add(f.id);
    chkLen('fact', f.text || '', id);
  }
  // evidence
  if (!Array.isArray(c.evidence) || c.evidence.length !== 6) err(`${id} evidence ${c.evidence && c.evidence.length}개 (6개여야 함)`);
  const names = new Set();
  (c.evidence || []).forEach((e, i) => {
    for (const f of ['name', 'icon', 'detail', 'note']) if (typeof e[f] !== 'string' || !e[f].trim()) err(`${id} evidence[${i}].${f} 비어 있음`);
    if (names.has(e.name)) err(`${id} 증거 이름 중복 ${e.name}`); names.add(e.name);
    chkLen('name', e.name || '', id); chkLen('detail', e.detail || '', id);
  });
  if (!(Number.isInteger(c.fake) && c.fake >= 0 && c.fake <= 5)) err(`${id} fake 범위 ${c.fake}`);
  else if (!/^조작/.test(c.evidence[c.fake].note)) warn(`${id} 가짜 증거 note가 "조작"으로 시작하지 않음`);
  (c.evidence || []).forEach((e, i) => { if (i !== c.fake && /^조작/.test(e.note)) err(`${id} 진짜 증거[${i}] note가 "조작"으로 시작`); });
  // reasons
  if (!Array.isArray(c.reasons) || c.reasons.length !== 4) err(`${id} reasons 4개 아님`);
  const rs = c.reasons || [];
  if (rs.filter(r => r.correct === true).length !== 1) err(`${id} 정답 이유가 정확히 1개가 아님`);
  rs.forEach((r, i) => {
    if (typeof r.correct !== 'boolean') err(`${id} reasons[${i}].correct 불리언 아님`);
    if (!r.text || !r.text.trim()) err(`${id} reasons[${i}] text 없음`);
    if (!r.correct && !(r.why && r.why.trim())) err(`${id} reasons[${i}] 오답인데 why 없음`);
    chkLen('reason', r.text || '', id);
  });
  if (new Set(rs.map(r => r.text)).size !== rs.length) err(`${id} 이유 문장 중복`);
  // link: 근거 정보·증거가 실제로 존재하고, 해당 문구가 비어 있지 않아야 화면(사건 파일·연결 그림)에 그대로 표시된다
  const L = c.link;
  if (!L || !Array.isArray(L.facts) || !Array.isArray(L.evidence)) err(`${id} link 형식`);
  else {
    if (!L.facts.length) err(`${id} link.facts 비어 있음`);
    for (const f of L.facts) { const ff = (c.facts || []).find(x => x.id === f); if (!ff) err(`${id} link.facts에 없는 id ${f}`); else if (!ff.text.trim()) err(`${id} link fact ${f} 문구 없음`); }
    for (const d of L.evidence) {
      if (!(Number.isInteger(d) && d >= 0 && d <= 5)) err(`${id} link.evidence 범위 ${d}`);
      else if (d === c.fake) err(`${id} link.evidence에 가짜 증거 포함`);
    }
  }
  chkLen('story', c.story, id); chkLen('explain', c.explain, id);
}
for (const t of [1, 2, 3]) { const n = cases.filter(c => c.tier === t).length; const need = t === 1 ? 1 : 2; if (n < Math.max(5, need)) err(`tier ${t} 사건 ${n}건 (5건 이상 필요)`); }
if (!ids.has('c01')) err('c01 없음');
else if (cases.find(c => c.id === 'c01').tier !== 1) err('c01이 쉬움(tier 1)이 아님');

// ---- 2) HTML 임베드 비교 ----
const html = fs.readFileSync(HTML, 'utf8');
const m = html.match(/<script type="application\/json" id="cases">([\s\S]*?)<\/script>/);
if (!m) err('HTML에 #cases JSON 없음');
else {
  try { if (JSON.stringify(JSON.parse(m[1])) !== JSON.stringify(doc)) err('HTML #cases JSON이 docs/games/fake-evidence/cases.json과 다름'); }
  catch (e) { err('HTML #cases JSON 파싱 실패: ' + e.message); }
}

// ---- 3) 게임 안 검증 + 점수 시뮬레이션 (Playwright) ----
async function runtime() {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { warn('playwright 없음 → 실행 검사 생략'); return; }
  const srv = http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]);
    let f = path.join(ROOT, u);
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route('**/*.supabase.co/**', r => r.abort());
  await ctx.addInitScript(() => { try { localStorage.setItem('studio-nickname', '테스트'); localStorage.setItem('studio-nick-state', 'ok'); } catch (e) {} });
  const page = await ctx.newPage();
  const pageErrs = [];
  page.on('pageerror', e => pageErrs.push(e.message));
  await page.goto(`http://localhost:${srv.address().port}/games/fake-evidence/`);
  await page.waitForFunction(() => window.__evidence);
  const v = await page.evaluate(() => window.__evidence.validate());
  v.forEach(x => err('게임 validate(): ' + x));
  const sim = await page.evaluate(() => {
    const H = window.__evidence, out = {};
    const tiers = { 1: [], 2: [], 3: [] };
    H.cases.forEach(c => tiers[c.tier].push(c.id));
    // 완벽 플레이: 모든 사건 조합(단계별 순환)으로 5건 × 3판
    out.perfect = [];
    for (let k = 0; k < 5; k++) {
      const ids = [tiers[1][k % tiers[1].length], tiers[2][(2 * k) % tiers[2].length], tiers[2][(2 * k + 1) % tiers[2].length], tiers[3][(2 * k) % tiers[3].length], tiers[3][(2 * k + 1) % tiers[3].length]];
      H.start(ids);
      for (let i = 0; i < 5; i++) { const a = H.answer(); H.setElapsed(0); H.pick(a.evidenceSlot); H.reason(a.reasonSlot); H.submit(); H.next(); }
      const s = H.state(); out.perfect.push({ ids, score: s.score, screen: s.screen, bonus: s.bonus, eligible: s.eligible });
    }
    // 전부 오답 → 3번째 사건에서 종료
    H.start([tiers[1][0], tiers[2][0], tiers[2][1], tiers[3][0], tiers[3][1]]);
    let endedAt = -1;
    for (let i = 0; i < 5; i++) {
      const a = H.answer(); H.pick((a.evidenceSlot + 1) % 6); H.reason(0); H.submit();
      const st = H.state();
      if (st.lives === 0) { endedAt = i; H.next(); break; }
      H.next();
    }
    const sw = H.state(); out.wrong = { endedAt, screen: sw.screen, score: sw.score, lives: sw.lives, results: sw.results.length };
    // 증거만 정답 (이유 오답) → 시간 보너스 없음: 100 × 배수
    H.start([tiers[1][0], tiers[2][0], tiers[2][1], tiers[3][0], tiers[3][1]]);
    const partial = [];
    for (let i = 0; i < 5; i++) {
      const a = H.answer(); H.setElapsed(0); H.pick(a.evidenceSlot); H.reason((a.reasonSlot + 1) % 4); H.submit();
      partial.push(H.state().results[i].pts); H.next();
    }
    out.partial = { pts: partial, total: H.state().score };
    // 시간 보너스 경계
    out.tb = [0, 40, 80, 119, 120, 200].map(t => H.scoreFor(1, true, true, t));
    return out;
  });
  sim.perfect.forEach(p => { if (p.score !== 1800 || p.screen !== 'result' || p.bonus !== 200) err(`완벽 플레이 ${p.ids.join(',')} → ${p.score}점 (${p.screen}, 보너스 ${p.bonus}), 1800 기대`); if (p.eligible) err('테스트 훅 판이 eligible=true'); });
  if (sim.wrong.endedAt !== 2 || sim.wrong.screen !== 'result' || sim.wrong.score !== 0 || sim.wrong.results !== 3) err('전부 오답 시뮬레이션: ' + JSON.stringify(sim.wrong));
  if (JSON.stringify(sim.partial.pts) !== JSON.stringify([100, 150, 150, 200, 200]) || sim.partial.total !== 800) err('증거만 정답 시뮬레이션: ' + JSON.stringify(sim.partial));
  if (JSON.stringify(sim.tb) !== JSON.stringify([200, 200, 180, 161, 160, 160])) err('시간 보너스 경계: ' + JSON.stringify(sim.tb));
  pageErrs.forEach(e => err('페이지 오류: ' + e));
  console.log(`실행 검사: 완벽 ${sim.perfect.map(p => p.score).join('/')}, 전부 오답 → ${sim.wrong.endedAt + 1}번째 사건에서 종료, 증거만 ${sim.partial.pts.join('+')}=${sim.partial.total}, 시간 보너스 ${sim.tb.join(',')}`);
  await browser.close();
  srv.close();
}

runtime().catch(e => err('실행 검사 실패: ' + e.message)).then(() => {
  console.log(`사건 ${cases.length}건 (쉬움 ${cases.filter(c => c.tier === 1).length} / 복합 ${cases.filter(c => c.tier === 2).length} / 함정 ${cases.filter(c => c.tier === 3).length})`);
  if (warnings.length) console.log('경고 ' + warnings.length + '건:\n  ' + warnings.join('\n  '));
  if (errors.length) { console.log('오류 ' + errors.length + '건:\n  ' + errors.join('\n  ')); process.exit(1); }
  console.log('데이터 검증 통과');
});
