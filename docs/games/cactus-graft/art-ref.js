/* 선인장 키우기2 (cactus-graft) — 그리기 참고 코드. art-ui.md의 일부(배포 안 됨).
 * 게임은 이 파일을 불러오지 않는다. 개발자는 함수 구조·수치를 게임 안으로 옮긴다(이름은 바꿔도 됨).
 *
 * 각도: 이 파일의 함수는 design.md와 같은 "도(°), + = 오른쪽 끝이 올라감(화면 시계 반대)"을 받는다.
 *   Canvas로 넘길 때만 cv(deg) = −deg·π/180 로 바꾼다(ctx.rotate는 시계 방향 +).
 * 길이: 세계 mm × L.mm = 화면 px.
 * 접수 기하: 접수 축은 항상 칼 중심 K를 지난다(K를 중심으로 α만큼 흔들림). 칼선(K를 지남)과 축의 교점 = K,
 *   K에서 축을 따라 갈색 경계까지 = u(mm). 칼선 양끝(축에서 ±18mm)의 축 방향 처짐 = 18·tan(φ−α) = design.md의 s.
 *   → 화면에 보이는 "갈색으로 물든 칼선 구간"과 엔진의 무름 판정(u − s ≤ 0)이 항상 일치한다.
 * 확인용 렌더: Chromium에서 배우기 미리보기·보통 미리보기·갈색 경고·완벽·어긋남·무름·말라 버림·해설 카드·
 *   완주(축소)·쓰러짐, 라이트/다크/흑백, iPad 세로·가로·PC·폰을 그려 검토함(작업용 PNG, 저장소에 넣지 않음). */
var PAL = {
  light: {
    sky: { noon: ['#e9d3a6', '#f6ebd3'], dusk: ['#a994c6', '#ecd3d8'], night: ['#4a5585', '#9a94bd'] }, star: '#fff6d8',
    sand: '#e4cc9c', dune: '#c4a46a', zoneLine: '#b89559', zoneInk: '#6e5530', zoneDot: 'rgba(110,85,48,.16)',
    pot: '#c8643c', potEdge: '#7e3a1f', potRim: '#d97a4e', soil: '#5a3d26',
    body: '#7cc35a', edge: '#3f7f2c', rib: '#3f7f2c', spine: '#fbf6e6', bud: '#a6dd7c',
    flesh: '#eef6cf', core: '#c4df8c', seam: '#f4fbe6', crumb: '#c4df8c',
    rot: '#8a5a2b', rotEdge: '#4e3016', rotHatch: '#5e3a1a', rotSpot: '#3a2410', mush: '#6b4a2a',
    dry: '#b59a62', dryEdge: '#7d6538',
    clamp: '#8b93a1', clampEdge: '#4b5260', rod: '#6b7280',
    knife: '#1f2430', knifeHalo: '#ffffff', blade: '#d5dbe3', bladeEdge: '#5b6472', handle: '#6b4a2e',
    guide: '#2f6f22', guideGlow: 'rgba(255,246,160,.85)', answer: '#1f2430',
    perfect: '#f2b134', perfectCore: '#fffbe6', good: '#d9b26a',
    warn: '#c0392b', warnFill: 'rgba(192,57,43,.28)', ok: '#3f7a4f',
    ruler: '#6b5a3e', rulerTxt: '#5c4a2e', mark: '#2f7fc4', ink: '#1f2430', muted: '#6b7280',
    level: '#fbfaf7', levelEdge: '#6b5a3e',
    bloom: '#ef8aa6', bloomC: '#f2b134', finger: '#6e5530', fingerFill: '#fbe3c8', card: '#fbfaf7'
  },
  dark: {
    sky: { noon: ['#2b2518', '#3d3424'], dusk: ['#1f1a32', '#3b2a40'], night: ['#0c1020', '#1c2140'] }, star: '#fff2c4',
    sand: '#3a3125', dune: '#55462f', zoneLine: '#7a6544', zoneInk: '#d9c39a', zoneDot: 'rgba(217,195,154,.14)',
    pot: '#9c4a2c', potEdge: '#e09a72', potRim: '#b65a36', soil: '#2a1d12',
    body: '#8fd46a', edge: '#cdeeb4', rib: '#2f6a20', spine: '#e8e0c8', bud: '#b8eb8c',
    flesh: '#e3f0b8', core: '#a9c873', seam: '#f4fbe6', crumb: '#a9c873',
    rot: '#9a6634', rotEdge: '#e0b07a', rotHatch: '#5a3416', rotSpot: '#2e1a0a', mush: '#7a5432',
    dry: '#9c8455', dryEdge: '#d2bb8a',
    clamp: '#9aa3b2', clampEdge: '#d0d6df', rod: '#9aa1ae',
    knife: '#eceef3', knifeHalo: '#12141a', blade: '#c9d1db', bladeEdge: '#eceef3', handle: '#a47a52',
    guide: '#d4f59a', guideGlow: 'rgba(212,245,154,.30)', answer: '#eceef3',
    perfect: '#ffc94d', perfectCore: '#fffbe6', good: '#c9a45e',
    warn: '#ff6b6b', warnFill: 'rgba(255,107,107,.28)', ok: '#8fd09d',
    ruler: '#b9a77f', rulerTxt: '#cbb98f', mark: '#7cc0f2', ink: '#eceef3', muted: '#9aa1ae',
    level: '#1b1e27', levelEdge: '#b9a77f',
    bloom: '#f39ab3', bloomC: '#ffc94d', finger: '#d9c39a', fingerFill: '#e8d2b6', card: '#161921'
  }
};
var D = Math.PI / 180, SCION_W = 36, GREEN = 80, K_TO_STOCK = 105, BASE_MM = 30;   // BASE_MM: 시작 대목(화분 위 길이, 키 0) — 세로 화면에서 화분 바닥이 끄는 곳 위에 오게
function cv(deg) { return -deg * D; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function hex(h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
function mixHex(a, b, t) { var x = hex(a), y = hex(b); return '#' + [0, 1, 2].map(function (i) { return ('0' + Math.round(lerp(x[i], y[i], t)).toString(16)).slice(-2); }).join(''); }
function hash(i, k) { var s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); }

/* ---------- 배치 ---------- */
// SW×SH = 무대(.stage) CSS px.
function layout(SW, SH) {
  var land = SW > SH * 1.15, L = { SW: SW, SH: SH, land: land };
  if (land) {                                   // 가로: 오른쪽 1/3 = 끄는 곳
    var zw = Math.round(SW / 3);
    L.scene = { x: 0, y: 0, w: SW - zw, h: SH };
    L.zone = { x: SW - zw + 6, y: 10, w: zw - 16, h: SH - 20 };
  } else {                                      // 세로: 아래 30% = 끄는 곳
    var zh = Math.round(SH * 0.30);
    L.scene = { x: 0, y: 0, w: SW, h: SH - zh };
    L.zone = { x: 10, y: SH - zh + 6, w: SW - 20, h: zh - 16 };
  }
  var low = SH < 420;                           // 폰 가로 등 낮은 무대: K를 조금 올리고 면을 내려 접수를 키움
  L.Ky = Math.round(SH * (low ? 0.31 : 0.34));  // 칼 중심 K 높이 (design.md: 약 34%)
  L.Sy = Math.round(SH * (low ? 0.62 : 0.55));  // 대목 윗면 가운데 (약 55%)
  L.mm = (L.Sy - L.Ky) / K_TO_STOCK;            // K → 대목 면 = 105mm
  L.Kx = Math.round(L.scene.x + L.scene.w * 0.5);
  L.r = SCION_W / 2 * L.mm;                     // 접수·탑 반폭 px
  L.rulerX = Math.round(L.scene.x + L.scene.w - (L.scene.w < 500 ? 34 : 50)); // 눈금자: 장면 오른쪽
  L.guideExt = Math.round(Math.min(L.rulerX - L.Kx - 34, L.r * 5)); // 대목 보조선 반길이
  L.levelR = Math.round(clamp(L.r * 0.9, 20, 34));
  L.levelX = Math.round(L.scene.x + L.levelR + 16);
  return L;
}

/* ---------- 하늘: 키에 따라 한낮 → 해질녘(100cm) → 밤(200cm, 별 160cm~) ---------- */
function skyFor(P, cm) {
  var a, b, k;
  if (cm < 100) { a = P.sky.noon; b = P.sky.dusk; k = cm / 100; } else { a = P.sky.dusk; b = P.sky.night; k = clamp((cm - 100) / 100, 0, 1); }
  k = k * k * (3 - 2 * k);
  return [mixHex(a[0], b[0], k), mixHex(a[1], b[1], k), clamp((cm - 160) / 40, 0, 1)];
}
function drawSky(ctx, P, L, cm) {
  var s = skyFor(P, cm), g = ctx.createLinearGradient(0, 0, 0, L.SH);
  g.addColorStop(0, s[0]); g.addColorStop(1, s[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, L.SW, L.SH);
  if (s[2] > 0) { ctx.fillStyle = P.star; for (var i = 0; i < 40; i++) { ctx.globalAlpha = s[2] * (0.4 + 0.6 * hash(i, 9)); ctx.beginPath(); ctx.arc(L.scene.x + hash(i, 1) * L.scene.w, hash(i, 2) * L.Ky * 1.6, 1 + hash(i, 3) * 1.2, 0, 7); ctx.fill(); } ctx.globalAlpha = 1; }
}

/* ---------- 선인장 마디(기둥) ---------- */
// 로컬 Canvas 좌표: 축 = 위(−y), 아랫면 가운데 = (0,0). b, t = 아랫면/윗면 각도(축 기준, Canvas rad = cv(deg)).
function segPath(ctx, r, len, b, t, dome) {
  var tb = Math.tan(b), tt = Math.tan(t);
  ctx.beginPath();
  ctx.moveTo(-r, -r * tb);                      // 아랫면: y = x·tan b
  if (dome) { ctx.lineTo(-r, -len + r * 0.55); ctx.quadraticCurveTo(-r, -len, 0, -len); ctx.quadraticCurveTo(r, -len, r, -len + r * 0.55); }
  else { ctx.lineTo(-r, -len - r * tt); ctx.lineTo(r, -len + r * tt); } // 윗면: y = −len + x·tan t
  ctx.lineTo(r, r * tb);
  ctx.closePath();
}
// opt: {dome(다듬기 전 둥근 머리), dryTip(좋음: 끝 시든 딱지), bud(새순), color, edge}
function drawSeg(ctx, P, r, len, b, t, opt) {
  opt = opt || {};
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  segPath(ctx, r, len, b, t, opt.dome);
  ctx.fillStyle = opt.color || P.body; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = P.rib; ctx.globalAlpha = 0.32; ctx.lineWidth = Math.max(1.5, r * 0.07);
  [-0.5, 0, 0.5].forEach(function (k) { ctx.beginPath(); ctx.moveTo(k * r, r + 4); ctx.lineTo(k * r * 0.96, -len - r); ctx.stroke(); });
  ctx.globalAlpha = 1; ctx.fillStyle = P.spine;
  for (var y = -8; y > -len + 4; y -= 13) [-0.75, -0.25, 0.25, 0.75].forEach(function (k, i) { ctx.beginPath(); ctx.arc(k * r, y - (i % 2) * 6, Math.max(1.1, r * 0.05), 0, 7); ctx.fill(); });
  if (opt.dryTip) { ctx.fillStyle = P.dry; ctx.fillRect(-r - 2, -len - r - 4, r * 2 + 4, r + 4 + Math.max(6, len * 0.12)); }
  ctx.restore();
  segPath(ctx, r, len, b, t, opt.dome);
  ctx.strokeStyle = opt.edge || P.edge; ctx.lineWidth = Math.max(1.8, r * 0.08); ctx.stroke();
  ctx.strokeStyle = P.spine; ctx.lineWidth = 1.4;
  for (var sy = -7; sy > -len + 5; sy -= 12) [-1, 1].forEach(function (sd) { ctx.beginPath(); ctx.moveTo(sd * r, sy); ctx.lineTo(sd * (r + 3.5), sy - 2.5); ctx.stroke(); });
  if (opt.bud) { ctx.fillStyle = P.bud; ctx.strokeStyle = P.edge; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(r + 2, -len * 0.5, r * 0.24, r * 0.32, -0.5, 0, 7); ctx.fill(); ctx.stroke(); }
  ctx.restore();
}
// 접합선(아랫면). kind 'perfect' | 'good'. glow 0..1(붙는 순간 빛)
function drawSeam(ctx, P, r, b, kind, glow) {
  var tb = Math.tan(b);
  ctx.save(); ctx.lineCap = 'round';
  ctx.strokeStyle = P.seam; ctx.lineWidth = 2.2; ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.moveTo(-r + 2, (-r + 2) * tb); ctx.lineTo(r - 2, (r - 2) * tb); ctx.stroke();
  ctx.globalAlpha = 1;
  if (kind === 'perfect') { ctx.fillStyle = P.perfect; [-1, 1].forEach(function (s) { ctx.beginPath(); ctx.arc(s * (r + 4), s * (r + 4) * tb, 2.8, 0, 7); ctx.fill(); }); }
  if (glow) {   // 완벽: 접합선 전체 + 양옆으로 넘쳐 한 줄 / 좋음: 닿은 쪽 절반만
    var x0 = kind === 'perfect' ? -r * 2 : -r, x1 = kind === 'perfect' ? r * 2 : 0;
    ctx.globalAlpha = glow; ctx.strokeStyle = P.perfect; ctx.lineWidth = 9; ctx.shadowColor = P.perfect; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(x0, x0 * tb); ctx.lineTo(x1, x1 * tb); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = P.perfectCore; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* ---------- 화분 ---------- */
function drawPot(ctx, P, x, y, r) {   // y = 흙 높이, r = 탑 반폭
  var w = r * 4.2, h = r * 2.3;
  ctx.save(); ctx.lineJoin = 'round';
  ctx.fillStyle = P.pot; ctx.strokeStyle = P.potEdge; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w * 0.38, y + h); ctx.lineTo(x - w * 0.38, y + h); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = P.potRim; ctx.beginPath(); ctx.rect(x - w / 2 - 5, y - 4, w + 10, h * 0.24); ctx.fill(); ctx.stroke();
  ctx.fillStyle = P.soil; ctx.fillRect(x - w / 2 + 2, y - 6, w - 4, 3);
  ctx.restore();
  return y + h;
}

/* ---------- 탑 ---------- */
// tower = { tilt(°), segs:[{len(mm, 붙은 길이), rel(°, 그 마디 윗면의 축 기준 각 = 다듬을 때 d), kind, bud, glow, dome}] }
// 꼭대기(현재 대목 면 가운데)를 (L.Kx, L.Sy)에 둔다. opt = {scale, topX, topY, camShift(px, 자람 연출 중 아래로 밀림)}
function drawTower(ctx, P, L, tower, opt) {
  opt = opt || {};
  var sc = opt.scale || 1, mm = L.mm * sc, r = L.r * sc, tl = cv(tower.tilt);
  var total = BASE_MM; tower.segs.forEach(function (s) { total += s.len; });
  var topX = opt.topX != null ? opt.topX : L.Kx, topY = (opt.topY != null ? opt.topY : L.Sy) + (opt.camShift || 0);
  var H = total * mm;
  var bx = topX - Math.sin(tl) * H, by = topY + Math.cos(tl) * H;   // 축 아래 끝 = 흙 (tilt + 이면 꼭대기가 왼쪽 → 밑은 오른쪽)
  ctx.save(); ctx.translate(bx, by); ctx.rotate(tl);
  var y = 0, prevRel = 0;
  var all = [{ len: BASE_MM, rel: tower.baseRel || 0, kind: 'base' }].concat(tower.segs);
  for (var i = 0; i < all.length; i++) {
    var s = all[i], len = s.len * mm, bRel = i === 0 ? 0 : cv(prevRel), tRel = cv(s.rel);
    if (sc < 1 || (by - (y + len) * Math.cos(tl) < L.SH + 40 && by - y * Math.cos(tl) > -40)) {  // 화면 밖 마디는 그리지 않음
      ctx.save(); ctx.translate(0, -y);
      drawSeg(ctx, P, r, len, bRel, tRel, { dryTip: s.kind === 'good', bud: s.bud, dome: s.dome });
      if (i > 0) drawSeam(ctx, P, r, bRel, s.kind, s.glow || 0);
      ctx.restore();
    }
    y += len; prevRel = s.rel;
  }
  ctx.restore();
  var potBottom = drawPot(ctx, P, bx, by, r);
  return { bx: bx, by: by, potBottom: potBottom, H: H };
}

/* ---------- 대목 윗면: 빛나는 면 + 보조선 ---------- */
// theta = θs(°). opt.pulse = 빛 세기(다듬은 직후 1 → 0.7 유지), opt.parallel = 1~3마디 평행 빛(금색으로 칼선과 함께 맥박)
function drawFace(ctx, P, L, x, y, theta, opt) {
  opt = opt || {};
  var a = cv(theta), c = Math.cos(a), s = Math.sin(a), r = L.r, ext = L.guideExt;
  ctx.save(); ctx.lineCap = 'round';
  ctx.strokeStyle = P.flesh; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x - c * r, y - s * r); ctx.lineTo(x + c * r, y + s * r); ctx.stroke();
  ctx.strokeStyle = P.core; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - c * r * 0.45, y - s * r * 0.45); ctx.lineTo(x + c * r * 0.45, y + s * r * 0.45); ctx.stroke();
  var pulse = opt.pulse != null ? opt.pulse : 0.7;
  ctx.globalAlpha = pulse; ctx.strokeStyle = opt.parallel ? P.perfect : P.guideGlow; ctx.lineWidth = 11; if (opt.parallel) { ctx.shadowColor = P.perfect; ctx.shadowBlur = 12; }
  ctx.beginPath(); ctx.moveTo(x - c * r * 1.15, y - s * r * 1.15); ctx.lineTo(x + c * r * 1.15, y + s * r * 1.15); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  // 연장 보조선: 면과 같은 각도, 점선, 양끝에 면에 수직인 짧은 눈금
  // 밑 테(밤하늘·연보라 위에서도 비텍스트 대비 3:1 이상): knifeHalo 5px α .55, 끊김 없는 선
  ctx.strokeStyle = P.knifeHalo; ctx.lineWidth = 5; ctx.globalAlpha = 0.55;
  [-1, 1].forEach(function (sd) { ctx.beginPath(); ctx.moveTo(x + sd * c * (r + 8), y + sd * s * (r + 8)); ctx.lineTo(x + sd * c * ext, y + sd * s * ext); ctx.stroke(); });
  ctx.strokeStyle = opt.parallel ? P.perfect : P.guide; ctx.lineWidth = 2.5; ctx.setLineDash([10, 7]); ctx.globalAlpha = 0.85;
  [-1, 1].forEach(function (sd) { ctx.beginPath(); ctx.moveTo(x + sd * c * (r + 8), y + sd * s * (r + 8)); ctx.lineTo(x + sd * c * ext, y + sd * s * ext); ctx.stroke(); });
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  [-1, 1].forEach(function (sd) { var px = x + sd * c * ext, py = y + sd * s * ext; ctx.beginPath(); ctx.moveTo(px + s * 7, py - c * 7); ctx.lineTo(px - s * 7, py + c * 7); ctx.stroke(); });
  ctx.restore();
}
// 1·2마디 정답 점선: K를 지나는 θs 각도의 흐린 점선(칼선보다 김)
function drawAnswer(ctx, P, L, theta) {
  var a = cv(theta), c = Math.cos(a), s = Math.sin(a), e = L.r * 3.2;
  ctx.save(); ctx.strokeStyle = P.answer; ctx.globalAlpha = 0.4; ctx.lineWidth = 2; ctx.setLineDash([3, 6]); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(L.Kx - c * e, L.Ky - s * e); ctx.lineTo(L.Kx + c * e, L.Ky + s * e); ctx.stroke(); ctx.restore();
}

/* ---------- 접수 + 집게 ---------- */
// sc = { u(mm), alpha(°), B(mm), fade 0..1, droop 0..1, ghost(true면 α 0.45), pulse 0..1(4마디 갈색 맥박) }
// 로컬 좌표: 원점 = K, 아래(+y) = 축. 경계 y = u, 초록 꼭대기 y = u − 80, 갈색 끝 y = u + B (mm×L.mm)
// L 대신 {Kx, Ky, mm, r}만 있는 객체를 넘겨 해설 카드에서도 쓴다.
// opt.noClamp = 집게·막대 생략 / opt.stub = 잘려 나간 아래 토막(초록은 칼선 아래 u mm만, 위는 평평한 잘린 면)
function drawScion(ctx, P, L, sc, opt) {
  opt = opt || {};
  var m = L.mm, r = L.r, u = sc.u * m, G0 = opt.stub ? 0 : (sc.u - GREEN) * m, Bp = sc.B * m, dome = opt.stub ? 0 : r * 0.6;
  if (opt.stub) opt.noClamp = true;
  var f = sc.fade || 0, body = mixHex(P.body, P.dry, f * 0.85), edge = mixHex(P.edge, P.dryEdge, f * 0.85);
  ctx.save(); ctx.translate(L.Kx, L.Ky); ctx.rotate(cv(sc.alpha || 0)); ctx.lineJoin = 'round';
  var A0 = sc.ghost ? 0.45 : 1; ctx.globalAlpha = A0;
  if (!opt.noClamp) { ctx.strokeStyle = P.rod; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, G0 - 14); ctx.lineTo(0, G0 - 2000); ctx.stroke(); }
  // droop(마지막 1초 고개 숙임): 칼선·갈색 근처 기하는 절대 바꾸지 않는다(미리보기 = 판정).
  // 머리 둥근 부분이 납작해지고(0.6 → 0.24r) 가시가 아래로 처지며 집게 밑에 주름 2줄. 몸 위치·폭·축은 그대로.
  var dq = sc.droop || 0, dr = 0; dome = dome * (1 - 0.6 * dq);
  ctx.beginPath(); ctx.moveTo(-r, u);
  ctx.lineTo(-r, G0 + dome); ctx.quadraticCurveTo(-r + dr, G0, dr, G0); ctx.quadraticCurveTo(r + dr, G0, r, G0 + dome);
  ctx.lineTo(r, u); ctx.closePath();
  ctx.fillStyle = body; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = P.rib; ctx.globalAlpha = A0 * 0.32; ctx.lineWidth = Math.max(1.5, r * 0.07);
  [-0.5, 0, 0.5].forEach(function (k) { ctx.beginPath(); ctx.moveTo(k * r + dr * 0.6, G0); ctx.lineTo(k * r, u + 2); ctx.stroke(); });
  ctx.globalAlpha = A0; ctx.fillStyle = P.spine;
  for (var y = G0 + 8; y < u - 3; y += 13) [-0.75, -0.25, 0.25, 0.75].forEach(function (k, i) { ctx.beginPath(); ctx.arc(k * r, y + (i % 2) * 6, Math.max(1.1, r * 0.05), 0, 7); ctx.fill(); });
  ctx.restore();
  ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1.8, r * 0.08); ctx.stroke();
  ctx.strokeStyle = P.spine; ctx.lineWidth = 1.4;
  for (var sy = G0 + dome; sy < u - 3; sy += 12) [-1, 1].forEach(function (sd) { ctx.beginPath(); ctx.moveTo(sd * r, sy); ctx.lineTo(sd * (r + 3.5), sy - 2.5 + 6 * dq); ctx.stroke(); });
  if (dq) { ctx.strokeStyle = edge; ctx.globalAlpha = A0 * dq; ctx.lineWidth = 1.6; [10, 17].forEach(function (o) { ctx.beginPath(); ctx.moveTo(-r * 0.7, G0 + dome + o); ctx.quadraticCurveTo(0, G0 + dome + o + 4, r * 0.7, G0 + dome + o); ctx.stroke(); }); ctx.globalAlpha = A0; }
  // 갈색 밑동: 진한 갈색 + 45° 빗금 + 검은 반점 + 들쭉날쭉한 끝(뿌리 그루터기). 가시 없음.
  ctx.beginPath(); ctx.moveTo(-r, u); ctx.lineTo(r, u); ctx.lineTo(r * 0.92, u + Bp * 0.85);
  for (var i = 0; i <= 6; i++) ctx.lineTo(r * 0.92 - i * (r * 1.84 / 6), u + Bp * (i % 2 ? 1.0 : 0.86));
  ctx.closePath(); ctx.fillStyle = P.rot; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = P.rotHatch; ctx.lineWidth = 2.2;
  for (var hx = -r - Bp - 10; hx < r + 10; hx += 7) { ctx.beginPath(); ctx.moveTo(hx, u + Bp + 2); ctx.lineTo(hx + Bp + 4, u - 2); ctx.stroke(); }
  ctx.fillStyle = P.rotSpot;
  for (var j = 0; j < Math.max(2, Math.round(sc.B / 7)); j++) { ctx.beginPath(); ctx.ellipse((hash(j, 5) - 0.5) * r * 1.5, u + Bp * (0.2 + 0.65 * hash(j, 6)), 2.4, 1.9, 0, 0, 7); ctx.fill(); }
  ctx.restore();
  ctx.strokeStyle = P.rotEdge; ctx.lineWidth = Math.max(1.8, r * 0.08); ctx.stroke();
  ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-r - 1, u); ctx.lineTo(r + 1, u); ctx.stroke();   // 갈색 경계 = 진한 실선
  if (sc.pulse) {  // 4마디 갈색 맥박: 갈색 밑동 바깥 테두리
    ctx.strokeStyle = P.warn; ctx.globalAlpha = sc.pulse; ctx.lineWidth = 3; ctx.beginPath(); ctx.rect(-r - 6, u - 3, r * 2 + 12, Bp + 9); ctx.stroke(); ctx.globalAlpha = A0;
  }
  if (opt.stub) { ctx.strokeStyle = P.flesh; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-r + 2, 1); ctx.lineTo(r - 2, 1); ctx.stroke(); }
  // 집게: 초록 꼭대기를 양옆에서 무는 회색 턱 2개 + 경첩
  if (!opt.noClamp) {
    ctx.fillStyle = P.clamp; ctx.strokeStyle = P.clampEdge; ctx.lineWidth = 2;
    [-1, 1].forEach(function (sd) { ctx.beginPath(); ctx.moveTo(sd * r * 0.3, G0 - 12); ctx.lineTo(sd * (r + 7), G0 + dome * 0.2 - 4); ctx.lineTo(sd * (r + 7), G0 + dome * 1.3); ctx.lineTo(sd * (r + 1), G0 + dome * 1.3); ctx.lineTo(sd * (r + 1), G0 + dome * 0.5); ctx.lineTo(sd * r * 0.2, G0 - 4); ctx.closePath(); ctx.fill(); ctx.stroke(); });
    ctx.beginPath(); ctx.arc(0, G0 - 12, 5.5, 0, 7); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

/* ---------- 칼선 미리보기 ---------- */
// 칼선 = K를 지나는 각도 φ, 길이 72mm(접수 폭 2배). 접수 로컬에서 δ = φ − α.
// 반환: s, margin(u − s), brown = 칼선 위 좌표 x(mm, K 기준, 칼선 방향, 대략 −18..18) 중 갈색 안인 구간 [x0,x1] 또는 null
// (칼선 위 x mm 지점의 축 방향 깊이 = −x·sinδ, 축에 수직 위치 = x·cosδ. 갈색 = 깊이 > u 이고 |x·cosδ| ≤ 18)
function knifeInfo(sc, phi) {
  var d = (phi - (sc.alpha || 0)) * D, sn = Math.sin(d), cs = Math.cos(d), s = 18 * Math.abs(Math.tan(d));
  var xm = 18 / cs, lo = -xm, hi = xm, seg = null;
  if (Math.abs(sn) < 1e-9) { if (sc.u < 0) seg = [lo, hi]; }
  else { var xb = -sc.u / sn; if (sn > 0) { if (xb > lo) seg = [lo, Math.min(hi, xb)]; } else { if (xb < hi) seg = [Math.max(lo, xb), hi]; } }
  return { s: s, margin: sc.u - s, brown: seg };
}
// kn = { phi(°), armed(true = 실선: 지금 놓으면/스페이스면 자름, false = 점선·흐림: 놓으면 취소), parallel(1~3마디 평행 빛), pulse 0..1 }
function drawKnife(ctx, P, L, sc, kn) {
  var info = knifeInfo(sc, kn.phi), m = L.mm, a = cv(kn.phi), c = Math.cos(a), s = Math.sin(a), half = 36 * m;
  var col = kn.parallel ? P.perfect : P.knife;
  ctx.save(); ctx.lineCap = 'round';
  var A0 = kn.armed ? 1 : 0.55;
  var P0 = [L.Kx - c * half, L.Ky - s * half], P1 = [L.Kx + c * half, L.Ky + s * half];
  ctx.strokeStyle = P.knifeHalo; ctx.lineWidth = 7; ctx.globalAlpha = A0 * 0.7; ctx.beginPath(); ctx.moveTo(P0[0], P0[1]); ctx.lineTo(P1[0], P1[1]); ctx.stroke();
  ctx.globalAlpha = A0;
  ctx.strokeStyle = col; ctx.lineWidth = kn.parallel ? 4.5 : 3.5;
  if (kn.parallel) { ctx.shadowColor = P.perfect; ctx.shadowBlur = 10 * (kn.pulse == null ? 1 : kn.pulse); }
  if (!kn.armed) ctx.setLineDash([7, 7]);
  ctx.beginPath(); ctx.moveTo(P0[0], P0[1]); ctx.lineTo(P1[0], P1[1]); ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
  // 갈색 물듦: 칼선 중 갈색 위를 지나는 구간만 — 밝은 테 + 굵은 갈색 + 진한 점(흑백에서도 다른 선)
  if (info.brown) {
    var q0 = [L.Kx + c * info.brown[0] * m, L.Ky + s * info.brown[0] * m], q1 = [L.Kx + c * info.brown[1] * m, L.Ky + s * info.brown[1] * m];
    ctx.strokeStyle = P.flesh; ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();
    ctx.strokeStyle = P.rot; ctx.lineWidth = 8; ctx.stroke();
    ctx.strokeStyle = P.rotSpot; ctx.lineWidth = 2.2; ctx.setLineDash([2, 4]); ctx.stroke(); ctx.setLineDash([]);
  }
  // 칼날 아이콘: 칼선 왼쪽 끝에 붙음(날이 칼선 위에 얹힘, 손잡이는 바깥)
  ctx.save(); ctx.translate(P0[0], P0[1]); ctx.rotate(a);
  var bl = Math.max(26, 22 * m), bh = Math.max(8, 5 * m);
  ctx.fillStyle = P.blade; ctx.strokeStyle = P.bladeEdge; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-bl, 0); ctx.lineTo(-bl, -bh); ctx.lineTo(6 - bh, -bh); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = P.handle; ctx.beginPath(); ctx.rect(-bl - bl * 0.7, -bh - 1, bl * 0.7, bh + 3); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(L.Kx, L.Ky, 3.2, 0, 7); ctx.fill();
  ctx.restore();
  return info;
}
// 붙을 길이 괄호: 접수 왼쪽, 초록 꼭대기 ~ 칼선 중심(K). 갈색에 걸렸으면 흙빨강
function drawGainBracket(ctx, P, L, sc, info) {
  var m = L.mm, x = -L.r - 10;
  ctx.save(); ctx.translate(L.Kx, L.Ky); ctx.rotate(cv(sc.alpha || 0));
  ctx.strokeStyle = info.brown ? P.warn : P.ok; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x + 5, (sc.u - GREEN) * m + 2); ctx.lineTo(x, (sc.u - GREEN) * m + 2); ctx.lineTo(x, 0); ctx.lineTo(x + 5, 0); ctx.stroke();
  ctx.restore();
}
// 칼 높이 눈금 ▸ ◂ (장면 양 끝)
function drawKTicks(ctx, P, L) {
  ctx.save(); ctx.fillStyle = P.ink; ctx.globalAlpha = 0.5;
  [[L.scene.x + 4, 1], [L.scene.x + L.scene.w - 4, -1]].forEach(function (a) { ctx.beginPath(); ctx.moveTo(a[0], L.Ky - 7); ctx.lineTo(a[0] + a[1] * 10, L.Ky); ctx.lineTo(a[0], L.Ky + 7); ctx.fill(); });
  ctx.restore();
}

/* ---------- 수평계 ---------- */
// 위쪽 반원 눈금판 + 가운데에 선 작은 선인장 바늘. 바늘 각 = tilt × 4 (±10° → ±40°로 과장, 눈금도 같은 배율)
// 눈금: 0 굵게, ±5 가늘게, ±10 흙빨강 굵게 + 그 바깥 흙빨강 부채(넘으면 쓰러짐). |tilt| ≥ 7이면 바늘 테두리 흙빨강
function drawLevel(ctx, P, x, y, R, tilt) {
  ctx.save(); ctx.lineCap = 'round';
  ctx.fillStyle = P.level; ctx.strokeStyle = P.levelEdge; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, R, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = P.warnFill; [-1, 1].forEach(function (sd) { ctx.beginPath(); ctx.moveTo(x, y); if (sd > 0) ctx.arc(x, y, R * 0.96, -Math.PI / 2 + 40 * D, 0); else ctx.arc(x, y, R * 0.96, -Math.PI, -Math.PI / 2 - 40 * D); ctx.closePath(); ctx.fill(); });
  [[0, 2.5, P.levelEdge, 0.42], [5, 1.5, P.levelEdge, 0.3], [-5, 1.5, P.levelEdge, 0.3], [10, 3.5, P.warn, 0.5], [-10, 3.5, P.warn, 0.5]].forEach(function (t) {
    var a = -Math.PI / 2 + cv(t[0]) * 4; ctx.strokeStyle = t[2]; ctx.lineWidth = t[1];
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * R * (1 - t[3]), y + Math.sin(a) * R * (1 - t[3])); ctx.lineTo(x + Math.cos(a) * R * 0.96, y + Math.sin(a) * R * 0.96); ctx.stroke();
  });
  var a = cv(clamp(tilt, -12, 12)) * 4, danger = Math.abs(tilt) >= 7;
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = P.body; ctx.strokeStyle = danger ? P.warn : P.edge; ctx.lineWidth = danger ? 2.6 : 1.8;
  ctx.beginPath(); ctx.rect(-R * 0.13, -R * 0.82, R * 0.26, R * 0.82); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = P.levelEdge; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
  ctx.restore();
}

/* ---------- 눈금자(오른쪽) ---------- */
// zeroY = 키 0(시작 대목 윗면) 화면 y. 현재 키 + 10cm까지만 그림
function drawRuler(ctx, P, L, zeroY, cm, pxPerCm) {
  var x = L.rulerX, bot = L.scene.h, top = Math.max(0, zeroY - (cm + 10) * pxPerCm);
  ctx.save(); ctx.strokeStyle = P.ruler; ctx.fillStyle = P.rulerTxt; ctx.lineWidth = 2; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, Math.min(bot, zeroY)); ctx.stroke();
  var step = pxPerCm < 3 ? 10 : 1, lab = pxPerCm < 0.8 ? 50 : 10;
  for (var c = 0; ; c += step) {
    var y = zeroY - c * pxPerCm; if (y < top) break; if (y > bot) continue;
    var big = c % 10 === 0, mid = c % 5 === 0;
    ctx.globalAlpha = big ? 1 : mid ? 0.8 : 0.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - (big ? 10 : mid ? 7 : 4), y); ctx.stroke();
    if (c % lab === 0) { ctx.globalAlpha = 1; ctx.save(); ctx.strokeStyle = P.knifeHalo; ctx.globalAlpha = 0.8; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeText(String(c), x + 5, y + 4); ctx.restore(); ctx.fillText(String(c), x + 5, y + 4); }  // 숫자 밑 테 3px: 밤하늘에서도 대비 유지
  }
  ctx.globalAlpha = 1;
  var my = zeroY - cm * pxPerCm;   // 현재 키: 눈금자 왼쪽 삼각형
  ctx.fillStyle = P.mark; ctx.beginPath(); ctx.moveTo(x - 14, my); ctx.lineTo(x - 26, my - 6); ctx.lineTo(x - 26, my + 6); ctx.closePath(); ctx.fill();
  ctx.restore();
  return my;
}

/* ---------- 끄는 곳 + 끈 선 ---------- */
// drag = {x0,y0,x1,y1, armed} : 시작점 S·기준점 E(50ms 전). 40px 점선 원 = 준비 경계
function drawZone(ctx, P, L, drag) {
  var z = L.zone;
  ctx.save();
  ctx.fillStyle = P.sand; ctx.beginPath(); ctx.roundRect(z.x, z.y, z.w, z.h, 16); ctx.fill();
  ctx.save(); ctx.clip(); ctx.fillStyle = P.zoneDot;   // 은은한 점 패턴(18px 격자, 줄마다 9px 엇갈림)
  for (var row = 0, yy = z.y + 9; yy < z.y + z.h; yy += 18, row++) for (var xx = z.x + 9 + (row % 2) * 9; xx < z.x + z.w; xx += 18) { ctx.beginPath(); ctx.arc(xx, yy, 1.6, 0, 7); ctx.fill(); }
  ctx.restore();
  ctx.beginPath(); ctx.roundRect(z.x, z.y, z.w, z.h, 16);
  ctx.strokeStyle = P.zoneLine; ctx.setLineDash([8, 7]); ctx.lineWidth = 2; ctx.globalAlpha = 0.7; ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  if (drag) {
    ctx.strokeStyle = P.zoneInk; ctx.globalAlpha = drag.armed ? 0.3 : 0.7; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.arc(drag.x0, drag.y0, 40, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.strokeStyle = P.zoneInk; ctx.lineWidth = 3; ctx.lineCap = 'round'; if (!drag.armed) ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(drag.x0, drag.y0); ctx.lineTo(drag.x1, drag.y1); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = P.zoneInk; ctx.beginPath(); ctx.arc(drag.x0, drag.y0, 6, 0, 7); ctx.fill();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(drag.x1, drag.y1, 13, 0, 7); ctx.stroke();
  }
  ctx.restore();
}
// 손가락(첫 판 힌트·데모). 손끝이 (x,y). 게임에서는 같은 모양의 인라인 SVG를 써도 된다(desert-breath 손가락과 같은 계열).
function drawFinger(ctx, P, x, y, a, pressed) {
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha = a == null ? 1 : a; ctx.fillStyle = P.fingerFill; ctx.strokeStyle = P.finger; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  if (pressed) { ctx.save(); ctx.globalAlpha *= 0.5; ctx.beginPath(); ctx.arc(0, 0, 14, 0, 7); ctx.stroke(); ctx.restore(); }
  ctx.beginPath(); ctx.moveTo(-6, 4); ctx.lineTo(-6, 30); ctx.quadraticCurveTo(-18, 26, -16, 38); ctx.lineTo(-6, 56); ctx.lineTo(18, 56); ctx.quadraticCurveTo(24, 44, 22, 30); ctx.lineTo(22, 24); ctx.quadraticCurveTo(16, 18, 12, 24); ctx.quadraticCurveTo(8, 16, 4, 22); ctx.lineTo(4, 4); ctx.quadraticCurveTo(-1, -3, -6, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

/* ---------- 꽃(완주) ---------- */
function drawFlower(ctx, P, x, y, R, b) {
  ctx.save(); ctx.translate(x, y);
  for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; ctx.fillStyle = P.bloom; ctx.beginPath(); ctx.ellipse(Math.cos(a) * R * 0.62 * b, -R * 0.4 + Math.sin(a) * R * 0.45 * b, R * 0.5 * b, R * 0.24 * b, a, 0, 7); ctx.fill(); }
  ctx.fillStyle = P.bloomC; ctx.beginPath(); ctx.arc(0, -R * 0.4, R * 0.28 * b, 0, 7); ctx.fill();
  ctx.restore();
}

/* ---------- 실패 연출·해설 그림 ---------- */
// 각도 쐐기: (x,y)를 꼭짓점으로 대목 면(theta)·내 칼선(phi) 두 직선 + 사이 흙빨강 채움. dir = +1 오른쪽 / −1 왼쪽으로 벌어짐
function drawWedge(ctx, P, x, y, theta, phi, len, dir) {
  var a1 = cv(theta), a2 = cv(phi); if (dir < 0) { a1 += Math.PI; a2 += Math.PI; }
  ctx.save(); ctx.lineCap = 'round';
  ctx.fillStyle = P.warnFill; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, len, Math.min(a1, a2), Math.max(a1, a2)); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = P.warn; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, len * 0.8, Math.min(a1, a2), Math.max(a1, a2)); ctx.stroke();
  ctx.strokeStyle = P.guide; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a1) * len, y + Math.sin(a1) * len); ctx.stroke();
  ctx.strokeStyle = P.knifeHalo; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a2) * len, y + Math.sin(a2) * len); ctx.stroke();
  ctx.strokeStyle = P.knife; ctx.lineWidth = 3; ctx.stroke();
  ctx.restore();
  return [x + Math.cos((a1 + a2) / 2) * len * 0.6, y + Math.sin((a1 + a2) / 2) * len * 0.6];   // 숫자 놓을 자리
}
function drawRing(ctx, P, x, y, R) { ctx.save(); ctx.strokeStyle = P.warn; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.stroke(); ctx.globalAlpha = 0.35; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(x, y, R + 6, 0, 7); ctx.stroke(); ctx.restore(); }
function drawCheck(ctx, P, x, y, s) { ctx.save(); ctx.strokeStyle = P.ok; ctx.lineWidth = Math.max(3, s * 0.18); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(x - s * 0.4, y); ctx.lineTo(x - s * 0.1, y + s * 0.3); ctx.lineTo(x + s * 0.45, y - s * 0.35); ctx.stroke(); ctx.restore(); }
function drawCross(ctx, P, x, y, s) { ctx.save(); ctx.strokeStyle = P.warn; ctx.lineWidth = Math.max(3, s * 0.18); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - s / 2, y - s / 2); ctx.lineTo(x + s / 2, y + s / 2); ctx.moveTo(x + s / 2, y - s / 2); ctx.lineTo(x - s / 2, y + s / 2); ctx.stroke(); ctx.restore(); }
// 잘린 조각(로컬 Canvas: 아랫면 각 bRel(rad), 둥근 머리)
function drawPiece(ctx, P, x, y, rot, r, len, bRel, opt) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  opt = opt || {}; if (opt.dome == null) opt.dome = true; drawSeg(ctx, P, r, len, bRel, 0, opt);
  ctx.restore();
}
// 무름 조각: 갈색이 아래에서 위로 번지고(k 0..1) 납작하게 처짐 + 진물 2방울
function drawMushPiece(ctx, P, x, y, rot, r, len, k) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1 + 0.1 * k, 1 - 0.14 * k);
  drawSeg(ctx, P, r, len, 0, 0, { dome: true, color: mixHex(P.body, P.mush, 0.25 * k) });
  segPath(ctx, r, len, 0, 0, true); ctx.save(); ctx.clip();
  var g = ctx.createLinearGradient(0, 0, 0, -len); g.addColorStop(0, P.rot); g.addColorStop(clamp(k * 0.7, 0.05, 1), P.rot); g.addColorStop(clamp(k * 0.7 + 0.15, 0.1, 1), 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(-r - 4, -len - r, r * 2 + 8, len + r + 4);
  ctx.strokeStyle = P.rotHatch; ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
  for (var hx = -r * 2; hx < r * 2; hx += 7) { ctx.beginPath(); ctx.moveTo(hx, 2); ctx.lineTo(hx + len * k * 0.6, -len * k * 0.6); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = P.rotSpot; [-0.4, 0.3].forEach(function (u, i) { ctx.beginPath(); ctx.ellipse(u * r, 7 + i * 6, 3, 4.5, 0, 0, 7); ctx.fill(); });
  ctx.restore();
}

/* ---------- 첫 실패 해설 카드 그림 (카드 안 canvas W×H, 그 순간의 실제 값) ---------- */
// 어긋남: 두 선을 같은 중심에 겹쳐 확대. t 0..1 = "이렇게 했어야" 회전 진행(0.8초). 반환 = 쐐기 안 숫자 자리
function drawExplainMiss(ctx, P, W, H, theta, phi, t) {
  var cx = W / 2, cy = H * 0.5, len = Math.min(W * 0.42, H * 0.8);
  var cur = lerp(phi, theta, t || 0);
  ctx.save(); ctx.lineCap = 'round';
  var a1 = cv(theta), a2 = cv(cur), lo = Math.min(a1, a2), hi = Math.max(a1, a2);
  // 대목 면 아래에 초록 마디 조각(“면”임을 그림으로)
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(a1); ctx.fillStyle = P.body; ctx.strokeStyle = P.edge; ctx.lineWidth = 2; ctx.beginPath(); ctx.rect(-len * 0.3, 0, len * 0.6, H * 0.45); ctx.fill(); ctx.stroke(); ctx.restore();
  [0, Math.PI].forEach(function (o) { ctx.fillStyle = P.warnFill; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, len, lo + o, hi + o); ctx.closePath(); ctx.fill(); });
  ctx.strokeStyle = P.guideGlow; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(cx - Math.cos(a1) * len, cy - Math.sin(a1) * len); ctx.lineTo(cx + Math.cos(a1) * len, cy + Math.sin(a1) * len); ctx.stroke();
  ctx.strokeStyle = P.guide; ctx.lineWidth = 3.5; ctx.stroke();
  ctx.strokeStyle = P.knifeHalo; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(cx - Math.cos(a2) * len, cy - Math.sin(a2) * len); ctx.lineTo(cx + Math.cos(a2) * len, cy + Math.sin(a2) * len); ctx.stroke();
  ctx.strokeStyle = t >= 1 ? P.perfect : P.knife; ctx.lineWidth = 3.5; ctx.stroke();
  ctx.save(); ctx.translate(cx - Math.cos(a2) * len, cy - Math.sin(a2) * len); ctx.rotate(a2); ctx.fillStyle = P.blade; ctx.strokeStyle = P.bladeEdge; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-26, 0); ctx.lineTo(-26, -9); ctx.lineTo(-4, -9); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = P.handle; ctx.fillRect(-44, -10, 18, 12); ctx.restore();
  ctx.fillStyle = P.knife; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 7); ctx.fill();
  if (t >= 1) drawCheck(ctx, P, cx + len * 0.75, cy - H * 0.3, 26);
  ctx.restore();
  return [cx + Math.cos((lo + hi) / 2) * len * 0.7, cy + Math.sin((lo + hi) / 2) * len * 0.7];
}
// 무름: 접수 아랫부분 확대. 경계선·내 칼선·갈색 안 구간(흙빨강)·위로 올린 유령 칼선(초록 점선)+✓
// 원인이 비스듬함(u > 0)이면 칼선과 "축에 수직인 선" 사이 쐐기도 그림. 반환 = 깊이 숫자 자리
function drawExplainRot(ctx, P, W, H, u, alpha, phi, B) {
  var m = H / 64, cx = W / 2, ky = H * 0.45;
  var L2 = { Kx: cx, Ky: ky, mm: m, r: 18 * m };
  // 접수 아랫부분만 보이게(위쪽은 카드 밖으로 잘림)
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  drawScion(ctx, P, L2, { u: u, alpha: alpha, B: B }, { noClamp: true });
  var info = knifeInfo({ u: u, alpha: alpha }, phi), a = cv(phi), c = Math.cos(a), s = Math.sin(a), half = 30 * m;
  ctx.lineCap = 'round';
  if (u > 0 && info.s > u) {   // 비스듬함 원인: 축에 수직인 선(흐린)과 칼선 사이 쐐기
    var pa = cv(alpha); ctx.strokeStyle = P.muted; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(cx - Math.cos(pa) * half, ky - Math.sin(pa) * half); ctx.lineTo(cx + Math.cos(pa) * half, ky + Math.sin(pa) * half); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    var dir = info.brown && info.brown[0] < 0 ? -1 : 1, a1 = pa + (dir < 0 ? Math.PI : 0), a2 = a + (dir < 0 ? Math.PI : 0);
    ctx.fillStyle = P.warnFill; ctx.beginPath(); ctx.moveTo(cx, ky); ctx.arc(cx, ky, half * 0.75, Math.min(a1, a2), Math.max(a1, a2)); ctx.closePath(); ctx.fill();
  }
  var lift = (Math.max(0, info.s - u) + 2) * m, pa2 = cv(alpha);
  var gx = cx - Math.sin(-pa2) * 0 + Math.sin(pa2) * lift, gy = ky - Math.cos(pa2) * lift;   // 축을 따라 위로
  ctx.strokeStyle = P.ok; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(gx - c * half, gy - s * half); ctx.lineTo(gx + c * half, gy + s * half); ctx.stroke(); ctx.setLineDash([]);
  drawCheck(ctx, P, gx + c * half + 16, gy + s * half - 6, 18);
  ctx.strokeStyle = P.knifeHalo; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(cx - c * half, ky - s * half); ctx.lineTo(cx + c * half, ky + s * half); ctx.stroke();
  ctx.strokeStyle = P.knife; ctx.lineWidth = 3; ctx.stroke();
  var deep = null;
  if (info.brown) {
    ctx.strokeStyle = P.warn; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(cx + c * info.brown[0] * m, ky + s * info.brown[0] * m); ctx.lineTo(cx + c * info.brown[1] * m, ky + s * info.brown[1] * m); ctx.stroke();
    var dx = Math.abs(info.brown[0]) > Math.abs(info.brown[1]) ? info.brown[0] : info.brown[1]; deep = [cx + c * dx * m, ky + s * dx * m];
  }
  ctx.restore();
  return deep;
}
// 말라 버림: 바래서 고개 숙인 접수 + 비어 버린 시계 고리(왼쪽) / 손가락 끌기→떼기 그림은 카드 DOM(SVG 손가락)으로
function drawExplainWither(ctx, P, W, H) {
  var L2 = { Kx: W * 0.62, Ky: H * 0.62, mm: H / 120, r: 18 * H / 120 };
  drawScion(ctx, P, L2, { u: 30, alpha: 0, B: 30, fade: 1, droop: 1 }, {});
  var cx = W * 0.2, cy = H * 0.45, R = Math.min(W, H) * 0.14;
  ctx.save(); ctx.strokeStyle = P.muted; ctx.lineWidth = 5; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
  ctx.globalAlpha = 1; ctx.strokeStyle = P.warn; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - R * 0.7); ctx.stroke();
  ctx.restore();
}
