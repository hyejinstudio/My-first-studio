/* 선인장 키우기2 (cactus-graft) — 그리기 참고 코드. art-ui.md의 일부(배포 안 됨).
 * 게임은 이 파일을 불러오지 않는다. 개발자는 함수 구조·수치를 게임 안으로 옮긴다(이름은 바꿔도 됨).
 * 각도 규칙: 모든 각도는 "화면 시계 방향 +"(ctx.rotate와 같은 방향, 도 단위 입력 → 내부 rad).
 *   선 각도 φ > 0 이면 오른쪽 끝이 아래. 탑이 오른쪽으로 기울면 tilt > 0, 그 윗면(축에 수직) 각도 = tilt.
 * 확인용 렌더: Chromium에서 자르기 직전 미리보기(배우기/보통)·완벽·좋음·각도 실패·무름·말라 버림·꽃 완주·쓰러짐,
 *   라이트/다크/흑백, iPad 세로·가로·PC·폰 4종 배치를 그려 검토함(작업용 PNG, 저장소에 넣지 않음). */
var PAL = {
  light: {
    sky: { noon: ['#e9d3a6', '#f6ebd3'], dusk: ['#a994c6', '#ecd3d8'], night: ['#4a5585', '#9a94bd'] }, star: '#fff6d8',
    sand: '#e4cc9c', dune: '#c4a46a', zoneLine: '#b89559', zoneInk: '#6e5530',
    pot: '#c8643c', potEdge: '#7e3a1f', potRim: '#d97a4e', soil: '#5a3d26',
    body: '#7cc35a', edge: '#3f7f2c', rib: '#3f7f2c', spine: '#fbf6e6', bud: '#a6dd7c',
    flesh: '#eef6cf', core: '#c4df8c', seam: '#f4fbe6',
    rot: '#8a5a2b', rotEdge: '#4e3016', rotHatch: '#5e3a1a', rotSpot: '#3a2410', mush: '#6b4a2a',
    dry: '#b59a62', dryEdge: '#7d6538',
    clamp: '#8b93a1', clampEdge: '#4b5260', rod: '#6b7280',
    knife: '#1f2430', blade: '#d5dbe3', bladeEdge: '#5b6472', handle: '#6b4a2e',
    guide: '#2f6f22', guideGlow: 'rgba(255,246,160,.85)', perfect: '#f2b134', perfectCore: '#fffbe6',
    warn: '#d64545', warnFill: 'rgba(214,69,69,.22)', goodGap: 'rgba(242,177,52,.35)',
    ruler: '#6b5a3e', rulerTxt: '#5c4a2e', mark: '#2f7fc4', plumb: '#1f2430', ink: '#1f2430', muted: '#6b7280',
    bloom: '#ef8aa6', bloomC: '#f2b134', ghost: 'rgba(255,255,255,.55)', finger: '#6e5530'
  },
  dark: {
    sky: { noon: ['#2b2518', '#3d3424'], dusk: ['#1f1a32', '#3b2a40'], night: ['#0c1020', '#1c2140'] }, star: '#fff2c4',
    sand: '#3a3125', dune: '#55462f', zoneLine: '#7a6544', zoneInk: '#d9c39a',
    pot: '#9c4a2c', potEdge: '#e09a72', potRim: '#b65a36', soil: '#2a1d12',
    body: '#8fd46a', edge: '#cdeeb4', rib: '#2f6a20', spine: '#e8e0c8', bud: '#b8eb8c',
    flesh: '#e3f0b8', core: '#a9c873', seam: '#f4fbe6',
    rot: '#9a6634', rotEdge: '#e0b07a', rotHatch: '#5a3416', rotSpot: '#2e1a0a', mush: '#7a5432',
    dry: '#9c8455', dryEdge: '#d2bb8a',
    clamp: '#9aa3b2', clampEdge: '#d0d6df', rod: '#9aa1ae',
    knife: '#eceef3', blade: '#c9d1db', bladeEdge: '#eceef3', handle: '#a47a52',
    guide: '#d4f59a', guideGlow: 'rgba(212,245,154,.30)', perfect: '#ffc94d', perfectCore: '#fffbe6',
    warn: '#ff6b6b', warnFill: 'rgba(255,107,107,.22)', goodGap: 'rgba(255,201,77,.30)',
    ruler: '#b9a77f', rulerTxt: '#cbb98f', mark: '#7cc0f2', plumb: '#eceef3', ink: '#eceef3', muted: '#9aa1ae',
    bloom: '#f39ab3', bloomC: '#ffc94d', ghost: 'rgba(255,255,255,.25)', finger: '#d9c39a'
  }
};
var D = Math.PI / 180;
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function hex(h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
function mixHex(a, b, t) { var x = hex(a), y = hex(b); return '#' + [0, 1, 2].map(function (i) { return ('0' + Math.round(lerp(x[i], y[i], t)).toString(16)).slice(-2); }).join(''); }
function hash(i, k) { var s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); }

/* ---------- 배치 ---------- */
// SW×SH = 무대(.stage) CSS px. 반환: 장면 영역, 끄는 곳(zone), 탑 x, 칼 높이, 대목 윗면 높이, mm→px
function layout(SW, SH) {
  var land = SW > SH * 1.15, L = { SW: SW, SH: SH, land: land };
  if (land) {
    var zw = Math.round(clamp(SW * 0.32, 220, 420));
    L.scene = { x: 0, y: 0, w: SW - zw, h: SH };
    L.zone = { x: SW - zw + 8, y: 8, w: zw - 16, h: SH - 16 };
  } else {
    var zh = Math.round(clamp(SH * 0.28, 150, 300));
    L.scene = { x: 0, y: 0, w: SW, h: SH - zh };
    L.zone = { x: 12, y: SH - zh + 8, w: SW - 24, h: zh - 20 };
  }
  var sh = L.scene.h;
  L.cx = Math.round(L.scene.x + L.scene.w * 0.5);
  L.mm = sh * 0.0026;                         // 1mm = px (iPad 세로 ≈ 1.86)
  L.bw = Math.round(clamp(46 * L.mm, 40, 110)); // 접수·탑 폭
  L.knifeY = Math.round(sh * 0.40);            // 칼 높이(고정)
  L.stockY = Math.round(sh * 0.70);            // 대목 윗면 가운데(카메라가 여기에 고정)
  L.clampTop = Math.round(sh * 0.02);
  L.rulerX = Math.round(L.scene.x + (L.scene.w < 500 ? 30 : 46));      // 눈금자: 장면 왼쪽 끝 고정
  L.guideExt = Math.round(Math.min(L.cx - L.rulerX - 30, L.bw * 5));  // 보조선·칼 연장 반길이(눈금자와 겹치지 않게)
  return L;
}

/* ---------- 하늘: 키에 따라 한낮 → 해질녘 → 밤 ---------- */
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
  if (s[2] > 0) { ctx.fillStyle = P.star; for (var i = 0; i < 40; i++) { ctx.globalAlpha = s[2] * (0.4 + 0.6 * hash(i, 9)); ctx.beginPath(); ctx.arc(hash(i, 1) * L.SW, hash(i, 2) * L.scene.h * 0.8, 1 + hash(i, 3) * 1.2, 0, 7); ctx.fill(); } ctx.globalAlpha = 1; }
}

/* ---------- 탑 한 마디 ---------- */
// 로컬 좌표: 축 = 위쪽(-y), 아랫면 가운데 = (0,0). r = 반폭, len = 축 길이 px,
// b, t = 아랫면/윗면 각도(축 기준 상대, rad, 시계 +). opt: {dryTip 0..1, bud, perfectMark, seamGlow}
function segPath(ctx, r, len, b, t) {
  var tb = Math.tan(b), tt = Math.tan(t);
  ctx.beginPath();
  ctx.moveTo(-r, -r * tb);            // 아래 왼쪽 (아랫면: y = x·tan b)
  ctx.lineTo(-r, -len - r * tt);      // 위 왼쪽 (윗면: y = -len + x·tan t)
  ctx.lineTo(r, -len + r * tt);       // 위 오른쪽
  ctx.lineTo(r, r * tb);              // 아래 오른쪽
  ctx.closePath();
}
function drawSeg(ctx, P, r, len, b, t, opt) {
  opt = opt || {};
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  segPath(ctx, r, len, b, t);
  ctx.fillStyle = opt.color || P.body; ctx.fill();
  ctx.save(); ctx.clip();
  // 세로 골 3줄
  ctx.strokeStyle = P.rib; ctx.globalAlpha = 0.32; ctx.lineWidth = Math.max(1.5, r * 0.06);
  [-0.5, 0, 0.5].forEach(function (k) { ctx.beginPath(); ctx.moveTo(k * r, 4); ctx.lineTo(k * r * 0.96, -len - 4); ctx.stroke(); });
  ctx.globalAlpha = 1;
  // 가시 자리(작은 흰 점)
  ctx.fillStyle = P.spine;
  for (var y = -10; y > -len + 6; y -= 16) [-0.75, -0.25, 0.25, 0.75].forEach(function (k, i) { ctx.beginPath(); ctx.arc(k * r, y - (i % 2) * 8, Math.max(1.2, r * 0.045), 0, 7); ctx.fill(); });
  // 좋음: 끝이 시든 딱지(윗면 쪽 띠)
  if (opt.dryTip) { ctx.fillStyle = P.dry; ctx.globalAlpha = 0.9; ctx.fillRect(-r - 2, -len - r - 4, r * 2 + 4, r + 4 + Math.max(8, len * 0.12)); ctx.globalAlpha = 1; }
  ctx.restore();
  segPath(ctx, r, len, b, t);
  ctx.strokeStyle = opt.edge || P.edge; ctx.lineWidth = Math.max(2, r * 0.07); ctx.stroke();
  // 옆 가시
  ctx.strokeStyle = P.spine; ctx.lineWidth = 1.5;
  for (var sy = -8; sy > -len + 6; sy -= 14) [-1, 1].forEach(function (sd) { ctx.beginPath(); ctx.moveTo(sd * r, sy); ctx.lineTo(sd * (r + 4), sy - 3); ctx.stroke(); });
  if (opt.bud) { ctx.fillStyle = P.bud; ctx.strokeStyle = P.edge; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(r + 2, -len * 0.55, r * 0.22, r * 0.3, 0.5, 0, 7); ctx.fill(); ctx.stroke(); }
  ctx.restore();
}
// 접합선(아랫면). kind: 'perfect' | 'good' | 'none'. glow 0..1(붙는 순간 번쩍)
function drawSeam(ctx, P, r, b, kind, glow) {
  var tb = Math.tan(b);
  ctx.save(); ctx.lineCap = 'round';
  ctx.strokeStyle = P.seam; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.moveTo(-r + 2, (-r + 2) * tb); ctx.lineTo(r - 2, (r - 2) * tb); ctx.stroke();
  ctx.globalAlpha = 1;
  if (kind === 'perfect') { ctx.fillStyle = P.perfect; [-1, 1].forEach(function (s) { ctx.beginPath(); ctx.arc(s * (r + 5), s * (r + 5) * tb, 3.2, 0, 7); ctx.fill(); }); }
  if (glow) {
    ctx.globalAlpha = glow; ctx.strokeStyle = P.perfect; ctx.lineWidth = 10; ctx.shadowColor = P.perfect; ctx.shadowBlur = 16;
    var ext = kind === 'perfect' ? r * 1.9 : r;
    var x0 = kind === 'good' ? 0 : -ext;
    ctx.beginPath(); ctx.moveTo(x0, x0 * tb); ctx.lineTo(ext, ext * tb); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = P.perfectCore; ctx.lineWidth = 3; ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* ---------- 화분 + 시작 대목 ---------- */
function drawPot(ctx, P, x, y, bw) {   // y = 흙 높이
  var w = bw * 2.1, h = bw * 1.15;
  ctx.save(); ctx.lineJoin = 'round';
  ctx.fillStyle = P.pot; ctx.strokeStyle = P.potEdge; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w * 0.38, y + h); ctx.lineTo(x - w * 0.38, y + h); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = P.potRim; ctx.beginPath(); ctx.rect(x - w / 2 - 6, y - 4, w + 12, h * 0.22); ctx.fill(); ctx.stroke();
  ctx.fillStyle = P.soil; ctx.fillRect(x - w / 2 + 2, y - 6, w - 4, 3);
  ctx.restore();
}

/* ---------- 대목 윗면 보조선 ---------- */
// (x,y) = 윗면 가운데, phi = 윗면 각도(rad). learn: 배우기 구간이면 더 밝게. ext = 보조선 반길이 px
function drawGuide(ctx, P, x, y, phi, r, ext, learn) {
  var c = Math.cos(phi), s = Math.sin(phi);
  ctx.save(); ctx.lineCap = 'round';
  // 자른 면(속살): 면 위에 얇은 띠
  ctx.strokeStyle = P.flesh; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x - c * r, y - s * r); ctx.lineTo(x + c * r, y + s * r); ctx.stroke();
  ctx.strokeStyle = P.core; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - c * r * 0.45, y - s * r * 0.45); ctx.lineTo(x + c * r * 0.45, y + s * r * 0.45); ctx.stroke();
  // 빛: 면 바로 위 은은한 띠
  ctx.strokeStyle = P.guideGlow; ctx.lineWidth = learn ? 12 : 9; ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.moveTo(x - c * r * 1.15, y - s * r * 1.15); ctx.lineTo(x + c * r * 1.15, y + s * r * 1.15); ctx.stroke();
  ctx.globalAlpha = 1;
  // 양옆 연장 보조선(점선) — 칼선과 나란한지 비교하는 긴 자
  ctx.strokeStyle = P.guide; ctx.lineWidth = 2.5; ctx.setLineDash([10, 7]); ctx.globalAlpha = learn ? 0.9 : 0.6;
  [-1, 1].forEach(function (sd) { ctx.beginPath(); ctx.moveTo(x + sd * c * (r + 8), y + sd * s * (r + 8)); ctx.lineTo(x + sd * c * ext, y + sd * s * ext); ctx.stroke(); });
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  // 양끝 각 표시: 작은 수직 눈금(면에 수직) — 기울기를 눈으로 읽게
  ctx.strokeStyle = P.guide; ctx.lineWidth = 2.5;
  [-1, 1].forEach(function (sd) { var px = x + sd * c * ext, py = y + sd * s * ext; ctx.beginPath(); ctx.moveTo(px + s * 7, py - c * 7); ctx.lineTo(px - s * 7, py + c * 7); ctx.stroke(); });
  ctx.restore();
}

/* ---------- 접수 + 집게 ---------- */
// sc = { x, top(접수 꼭대기 y), sway(rad), G(초록 px), B(갈색 px), r, fade 0..1(말라 감), droop 0..1 }
function scionToWorld(sc, lx, ly) { var c = Math.cos(sc.sway), s = Math.sin(sc.sway); return [sc.x + lx * c - ly * s, sc.top + lx * s + ly * c]; }
function worldToScion(sc, wx, wy) { var dx = wx - sc.x, dy = wy - sc.top, c = Math.cos(sc.sway), s = Math.sin(sc.sway); return [dx * c + dy * s, -dx * s + dy * c]; }
function drawScion(ctx, P, sc, opt) {
  opt = opt || {};
  var r = sc.r, G = sc.G, B = sc.B, dome = opt.stub ? 0 : r * 0.55;   // opt.stub: 잘려 나간 아래 토막(평평한 잘린 면, 집게 없음)
  var body = mixHex(P.body, P.dry, (sc.fade || 0) * 0.85), edge = mixHex(P.edge, P.dryEdge, (sc.fade || 0) * 0.85);
  ctx.save(); ctx.translate(sc.x, sc.top); ctx.rotate(sc.sway); ctx.lineJoin = 'round';
  // 집게 막대
  if (!opt.stub) { ctx.strokeStyle = P.rod; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -dome - 6); ctx.lineTo(0, -2000); ctx.stroke(); }
  // 초록 몸통(둥근 머리)
  ctx.beginPath(); ctx.moveTo(-r, G); ctx.lineTo(-r, 0); ctx.quadraticCurveTo(-r, -dome, 0, -dome); ctx.quadraticCurveTo(r, -dome, r, 0); ctx.lineTo(r, G); ctx.closePath();
  ctx.fillStyle = body; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = P.rib; ctx.globalAlpha = 0.32; ctx.lineWidth = Math.max(1.5, r * 0.06);
  [-0.5, 0, 0.5].forEach(function (k) { ctx.beginPath(); ctx.moveTo(k * r, -dome); ctx.lineTo(k * r, G + 2); ctx.stroke(); });
  ctx.globalAlpha = 1; ctx.fillStyle = P.spine;
  for (var y = 6; y < G - 4; y += 16) [-0.75, -0.25, 0.25, 0.75].forEach(function (k, i) { ctx.beginPath(); ctx.arc(k * r, y + (i % 2) * 8, Math.max(1.2, r * 0.045), 0, 7); ctx.fill(); });
  ctx.restore();
  ctx.strokeStyle = edge; ctx.lineWidth = Math.max(2, r * 0.07); ctx.stroke();
  ctx.strokeStyle = P.spine; ctx.lineWidth = 1.5;
  for (var sy = 4; sy < G - 4; sy += 14) [-1, 1].forEach(function (sd) { ctx.beginPath(); ctx.moveTo(sd * r, sy); ctx.lineTo(sd * (r + 4), sy - 3); ctx.stroke(); });
  // 갈색 밑동: 진한 갈색 + 45° 빗금 + 검은 반점 + 아래 뿌리 그루터기(들쭉날쭉)
  ctx.beginPath(); ctx.moveTo(-r, G); ctx.lineTo(r, G); ctx.lineTo(r * 0.92, G + B * 0.85);
  for (var i = 0; i <= 6; i++) { var xx = r * 0.92 - i * (r * 1.84 / 6); ctx.lineTo(xx, G + B * (i % 2 ? 1.05 : 0.88)); }
  ctx.closePath(); ctx.fillStyle = P.rot; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = P.rotHatch; ctx.lineWidth = 2.2;
  for (var hx = -r - B * 1.2; hx < r + B; hx += 7) { ctx.beginPath(); ctx.moveTo(hx, G + B * 1.1); ctx.lineTo(hx + B * 1.2, G - 1); ctx.stroke(); }
  ctx.fillStyle = P.rotSpot;
  for (var j = 0; j < 5; j++) { ctx.beginPath(); ctx.ellipse((hash(j, 5) - 0.5) * r * 1.5, G + B * (0.25 + 0.6 * hash(j, 6)), 2.6, 2, 0, 0, 7); ctx.fill(); }
  ctx.restore();
  ctx.strokeStyle = P.rotEdge; ctx.lineWidth = Math.max(2, r * 0.07); ctx.stroke();
  // 초록/갈색 경계: 진한 실선(판단 기준선)
  ctx.strokeStyle = P.rotEdge; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-r, G); ctx.lineTo(r, G); ctx.stroke();
  if (opt.stub) { ctx.strokeStyle = P.flesh; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-r + 2, 0); ctx.lineTo(r - 2, 0); ctx.stroke(); }
  // 집게 턱
  if (!opt.stub) {
  ctx.fillStyle = P.clamp; ctx.strokeStyle = P.clampEdge; ctx.lineWidth = 2;
  [-1, 1].forEach(function (sd) { ctx.beginPath(); ctx.moveTo(sd * (r * 0.35), -dome - 10); ctx.lineTo(sd * (r + 7), -dome * 0.2 - 4); ctx.lineTo(sd * (r + 7), dome * 0.5); ctx.lineTo(sd * (r + 1), dome * 0.5); ctx.lineTo(sd * (r + 1), -dome * 0.1); ctx.lineTo(sd * (r * 0.25), -dome - 2); ctx.closePath(); ctx.fill(); ctx.stroke(); });
  ctx.beginPath(); ctx.arc(0, -dome - 10, 6, 0, 7); ctx.fill(); ctx.stroke();
  }
  // 배우기 1~2마디: 자를 자리 흐린 점선
  if (opt.target != null) { ctx.strokeStyle = P.ink; ctx.globalAlpha = 0.45; ctx.lineWidth = 2; ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.moveTo(-r - 10, opt.target); ctx.lineTo(r + 10, opt.target); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
  ctx.restore();
}

/* ---------- 칼 + 자를 선 미리보기 ---------- */
// kn = { x, y(칼 높이), ang(rad), on(끌어서 칼이 나타남), parallel(배우기 구간 평행 빛남), ext(연장 반길이) }
// 반환: { hit, rot, gx(붙을 길이 px) } — 미리보기 계산(그리기용)
function knifeOnScion(sc, kn) {
  // 칼선을 접수 로컬로 옮겨 x=-r..r 구간의 y를 구한다
  var a = worldToScion(sc, kn.x - Math.cos(kn.ang) * 100, kn.y - Math.sin(kn.ang) * 100),
      b = worldToScion(sc, kn.x + Math.cos(kn.ang) * 100, kn.y + Math.sin(kn.ang) * 100);
  var k = (b[1] - a[1]) / (b[0] - a[0]);
  var yl = a[1] + k * (-sc.r - a[0]), yr = a[1] + k * (sc.r - a[0]);
  var lo = Math.max(yl, yr), hi = Math.min(yl, yr);
  return { yl: yl, yr: yr, hit: hi < sc.G + sc.B && lo > -sc.r * 0.3, rot: lo > sc.G, h: Math.min(yl, yr), k: k };
}
function drawKnife(ctx, P, sc, kn) {
  var c = Math.cos(kn.ang), s = Math.sin(kn.ang), r = sc.r, ext = kn.ext || r * 3;
  var info = knifeOnScion(sc, kn);
  ctx.save(); ctx.lineCap = 'round';
  // 칼 높이 기준점(가운데 작은 원)
  ctx.globalAlpha = kn.on ? 1 : 0.35;
  // 연장선(가늘게)
  ctx.strokeStyle = kn.parallel ? P.perfect : P.knife; ctx.lineWidth = 1.5; ctx.globalAlpha *= 0.4;
  ctx.beginPath(); ctx.moveTo(kn.x - c * ext, kn.y - s * ext); ctx.lineTo(kn.x + c * ext, kn.y + s * ext); ctx.stroke();
  ctx.globalAlpha = kn.on ? 1 : 0.35;
  // 접수 안을 지나는 자를 선: 초록 구간 = 굵은 점선, 갈색 구간 = 빨간 지그재그
  if (info.hit) {
    // 접수 안 구간을 잘게 나눠 초록(자를 선) / 갈색(무름 경고)으로 칠한다
    var N = 32, pts = [];
    for (var i = 0; i <= N; i++) { var u = -r + 2 * r * i / N, ly = info.yl + (info.yr - info.yl) * (u + r) / (2 * r); pts.push({ w: scionToWorld(sc, u, ly), rot: ly > sc.G }); }
    var run = function (rot, style) {
      for (var i = 0; i < N; i++) { if (pts[i].rot !== rot && pts[i + 1].rot !== rot) continue; style(pts[i].w, pts[i + 1].w, i); }
    };
    // 초록 구간: 흰 바탕 7px + 칼선 3.5px 점선(평행이면 금색 실선 + 빛)
    ctx.strokeStyle = P.seam; ctx.lineWidth = 8; ctx.globalAlpha *= 0.85;
    run(false, function (a, b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); });
    ctx.globalAlpha = kn.on ? 1 : 0.35;
    ctx.strokeStyle = kn.parallel ? P.perfect : P.knife; ctx.lineWidth = kn.parallel ? 5 : 3.5;
    if (kn.parallel) { ctx.shadowColor = P.perfect; ctx.shadowBlur = 10; }
    run(false, function (a, b, i) { if (!kn.parallel && i % 3 === 2) return; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); });
    ctx.shadowBlur = 0;
    // 갈색 구간: 빨간 지그재그 5px
    ctx.strokeStyle = P.warn; ctx.lineWidth = 4.5;
    run(true, function (a, b, i) { var nx = -(b[1] - a[1]), ny = b[0] - a[0], l = Math.hypot(nx, ny) || 1, o = (i % 2 ? 4 : -4); ctx.beginPath(); ctx.moveTo(a[0] - nx / l * o, a[1] - ny / l * o); ctx.lineTo(b[0] + nx / l * o, b[1] + ny / l * o); ctx.stroke(); });
  } else {
    ctx.strokeStyle = P.knife; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(kn.x - c * (r + 6), kn.y - s * (r + 6)); ctx.lineTo(kn.x + c * (r + 6), kn.y + s * (r + 6)); ctx.stroke(); ctx.setLineDash([]);
  }
  // 칼날(오른쪽, 접수 밖): 날 = 선 위에 얹힌 은색 띠, 끝에 나무 손잡이
  ctx.save(); ctx.translate(kn.x, kn.y); ctx.rotate(kn.ang);
  var b0 = r + 14, b1 = r + 14 + r * 1.5, bh = Math.max(9, r * 0.24);
  ctx.fillStyle = P.blade; ctx.strokeStyle = P.bladeEdge; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(b0, 0); ctx.lineTo(b1, 0); ctx.lineTo(b1, -bh); ctx.lineTo(b0 + bh * 0.8, -bh); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = P.handle; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(b1, -bh - 1, r * 0.9, bh + 3, 4) : ctx.rect(b1, -bh - 1, r * 0.9, bh + 3); ctx.fill(); ctx.stroke();
  // 날끝이 갈색에 닿으면 날끝에 갈색 얼룩
  if (info.rot || (info.hit && Math.max(info.yl, info.yr) > sc.G)) { ctx.fillStyle = P.rot; ctx.beginPath(); ctx.ellipse(b0 + 8, -2, 7, 3, 0, 0, 7); ctx.fill(); }
  ctx.restore();
  // 칼 높이 중심점
  ctx.fillStyle = kn.parallel ? P.perfect : P.knife; ctx.beginPath(); ctx.arc(kn.x, kn.y, 3.5, 0, 7); ctx.fill();
  // 배우기: 평행이면 양끝에 ∥ 표시
  if (kn.parallel) {
    ctx.strokeStyle = P.perfect; ctx.lineWidth = 3;
    [-1, 1].forEach(function (sd) { var px = kn.x + sd * c * (r + 30), py = kn.y + sd * s * (r + 30);
      [-4, 4].forEach(function (o) { var qx = px + o * c, qy = py + o * s; ctx.beginPath(); ctx.moveTo(qx + s * 9, qy - c * 9); ctx.lineTo(qx - s * 9, qy + c * 9); ctx.stroke(); }); });
  }
  ctx.restore();
  return info;
}
// 붙을 길이 괄호: 접수 왼쪽에 세로 괄호(칼선 위 초록 부분)
function drawGainBracket(ctx, P, sc, info) {
  if (!info.hit) return;
  var x = -sc.r - 12, y0 = -sc.r * 0.55, y1 = Math.min(info.yl, info.yr, sc.G);
  ctx.save(); ctx.translate(sc.x, sc.top); ctx.rotate(sc.sway);
  ctx.strokeStyle = info.rot ? P.warn : P.guide; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x + 6, y0); ctx.lineTo(x, y0); ctx.lineTo(x, y1); ctx.lineTo(x + 6, y1); ctx.stroke();
  ctx.restore();
}

/* ---------- 끄는 곳 + 끈 선 ---------- */
function drawZone(ctx, P, L, drag, hintTxt) {
  var z = L.zone;
  ctx.save();
  ctx.fillStyle = P.sand; ctx.beginPath(); ctx.roundRect(z.x, z.y, z.w, z.h, 16); ctx.fill();
  ctx.strokeStyle = P.zoneLine; ctx.setLineDash([8, 7]); ctx.lineWidth = 2; ctx.globalAlpha = 0.7; ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  if (hintTxt) { ctx.fillStyle = P.zoneInk; ctx.font = '700 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(hintTxt, z.x + z.w / 2, z.y + z.h - 18); }
  if (drag) {
    var dx = drag.x1 - drag.x0, dy = drag.y1 - drag.y0;
    ctx.strokeStyle = P.zoneInk; ctx.globalAlpha = 0.35; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.arc(drag.x0, drag.y0, 40, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.strokeStyle = P.zoneInk; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(drag.x0, drag.y0); ctx.lineTo(drag.x1, drag.y1); ctx.stroke();
    ctx.fillStyle = P.zoneInk; ctx.beginPath(); ctx.arc(drag.x0, drag.y0, 6, 0, 7); ctx.fill();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(drag.x1, drag.y1, 13, 0, 7); ctx.stroke();
  }
  ctx.restore();
}
// 손가락 힌트(SVG와 같은 모양의 Canvas 버전, 확인용)
function drawFinger(ctx, P, x, y, a) {
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha = a == null ? 1 : a; ctx.fillStyle = '#fbe3c8'; ctx.strokeStyle = P.finger; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-6, 26); ctx.quadraticCurveTo(-18, 22, -16, 34); ctx.lineTo(-6, 52); ctx.lineTo(18, 52); ctx.quadraticCurveTo(24, 40, 22, 26); ctx.lineTo(22, 20); ctx.quadraticCurveTo(16, 14, 12, 20); ctx.quadraticCurveTo(8, 12, 4, 18); ctx.lineTo(4, 0); ctx.quadraticCurveTo(-1, -7, -6, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

/* ---------- 눈금자 ---------- */
function drawRuler(ctx, P, L, zeroY, cm, pxPerCm) {
  var x = L.rulerX, bot = L.scene.h, top = Math.max(0, zeroY - (cm + 10) * pxPerCm); // 현재 키 + 10cm까지만
  ctx.save(); ctx.strokeStyle = P.ruler; ctx.fillStyle = P.rulerTxt; ctx.lineWidth = 2; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'right';
  ctx.beginPath(); ctx.moveTo(x, Math.max(top, 0)); ctx.lineTo(x, Math.min(bot, zeroY)); ctx.stroke();
  var step = pxPerCm < 3.5 ? 5 : 1;
  for (var c = 0; ; c += step) {
    var y = zeroY - c * pxPerCm; if (y < top) break; if (y > bot) continue;
    var big = c % 10 === 0, mid = c % 5 === 0;
    ctx.globalAlpha = big ? 1 : mid ? 0.8 : 0.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (big ? 10 : mid ? 7 : 4), y); ctx.stroke();
    if (big && (pxPerCm > 2 || c % 50 === 0)) { ctx.globalAlpha = 1; ctx.fillText(String(c), x - 5, y + 4); }
  }
  ctx.globalAlpha = 1;
  var my = zeroY - cm * pxPerCm;
  ctx.fillStyle = P.mark; ctx.beginPath(); ctx.moveTo(x + 14, my); ctx.lineTo(x + 26, my - 6); ctx.lineTo(x + 26, my + 6); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/* ---------- 탑 전체(카메라 포함) ---------- */
// tower = { tilt(deg), baseFace(deg, 시작 대목 윗면), segs:[{len(mm), face(deg, 그 마디 윗면 world), kind:'perfect'|'good', bud, glow}] }
// cam: 화면 y에서 탑 꼭대기 가운데 = L.stockY. scale = 1이 기본, 끝 연출에서 축소.
function drawTower(ctx, P, L, tower, opt) {
  opt = opt || {};
  var mm = L.mm * (opt.scale || 1), r = L.bw / 2 * (opt.scale || 1), tilt = tower.tilt * D;
  var total = 0; tower.segs.forEach(function (s) { total += s.len; });
  var baseLen = 60; // 화분 위 시작 대목 mm (design.md 값 우선)
  // 탑 꼭대기를 (topX, topY)에 두고, 아래 끝 = 화분
  var topX = opt.topX != null ? opt.topX : L.cx, topY = opt.topY != null ? opt.topY : L.stockY;
  var H = (total + baseLen) * mm;
  var bx = topX - Math.sin(tilt) * H, by = topY + Math.cos(tilt) * H;
  // 다림줄(연직 기준선): 화분 가운데에서 위로
  ctx.save(); ctx.strokeStyle = P.plumb; ctx.globalAlpha = 0.28; ctx.setLineDash([3, 6]); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, topY - 40); ctx.stroke(); ctx.restore();
  drawPot(ctx, P, bx, by, r * 2);
  ctx.save(); ctx.translate(bx, by); ctx.rotate(tilt);
  var y = 0, prevFace = 0;
  var all = [{ len: baseLen, face: tower.baseFace != null ? tower.baseFace : 0, kind: 'base' }].concat(tower.segs);
  for (var i = 0; i < all.length; i++) {
    var s = all[i], len = s.len * mm, bRel = i === 0 ? 0 : prevFace * D - tilt, tRel = (s.face * D) - tilt;
    ctx.save(); ctx.translate(0, -y);
    drawSeg(ctx, P, r, len, bRel, tRel, { dryTip: s.kind === 'good', bud: s.bud });
    if (i > 0) drawSeam(ctx, P, r, bRel, s.kind, s.glow || 0);
    ctx.restore();
    y += len; prevFace = s.face;
  }
  ctx.restore();
  return { bx: bx, by: by, H: H };
}

/* ---------- 꽃(완주) ---------- */
function drawFlower(ctx, P, x, y, R, b) {
  ctx.save(); ctx.translate(x, y);
  for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; ctx.fillStyle = P.bloom; ctx.beginPath(); ctx.ellipse(Math.cos(a) * R * 0.62 * b, -R * 0.4 + Math.sin(a) * R * 0.45 * b, R * 0.5 * b, R * 0.24 * b, a, 0, 7); ctx.fill(); }
  ctx.fillStyle = P.bloomC; ctx.beginPath(); ctx.arc(0, -R * 0.4, R * 0.28 * b, 0, 7); ctx.fill();
  ctx.restore();
}

/* ---------- 실패 해설 그림 ---------- */
// 각도 차이: 접점(x,y)에서 대목 면(phiS)과 잘린 면(phiK) 두 직선 + 사이 부채꼴 채움
function drawAngleDiff(ctx, P, x, y, phiS, phiK, len) {
  ctx.save(); ctx.lineCap = 'round';
  var dir = Math.cos(phiS) >= 0 ? 1 : -1;
  ctx.fillStyle = P.warnFill; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, len, Math.min(phiS, phiK), Math.max(phiS, phiK)); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = P.guide; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - Math.cos(phiS) * len * 0.3, y - Math.sin(phiS) * len * 0.3); ctx.lineTo(x + Math.cos(phiS) * len, y + Math.sin(phiS) * len); ctx.stroke();
  ctx.strokeStyle = P.warn; ctx.lineWidth = 3; ctx.setLineDash([8, 5]); ctx.beginPath(); ctx.moveTo(x - Math.cos(phiK) * len * 0.3, y - Math.sin(phiK) * len * 0.3); ctx.lineTo(x + Math.cos(phiK) * len, y + Math.sin(phiK) * len); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = P.warn; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, len * 0.8, Math.min(phiS, phiK), Math.max(phiS, phiK)); ctx.stroke();
  ctx.restore();
}
// 닿은 곳 고리
function drawRing(ctx, P, x, y, R) { ctx.save(); ctx.strokeStyle = P.warn; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.stroke(); ctx.globalAlpha = 0.35; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(x, y, R + 6, 0, 7); ctx.stroke(); ctx.restore(); }
// 잘린 조각(자유 위치·회전): 로컬 아랫면 각도 bRel, 길이 len px
function drawPiece(ctx, P, x, y, rot, r, len, bRel, opt) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  drawSeg(ctx, P, r, len, bRel, 0, opt);
  ctx.restore();
}
// 무름: 갈색이 아래에서 위로 번진 조각(rotK 0..1)
function drawMushPiece(ctx, P, x, y, rot, r, len, k) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1 + 0.1 * k, 1 - 0.12 * k);
  drawSeg(ctx, P, r, len, 0, 0, { color: mixHex(P.body, P.mush, 0.25 * k) });
  segPath(ctx, r, len, 0, 0); ctx.save(); ctx.clip();
  var g = ctx.createLinearGradient(0, 0, 0, -len); g.addColorStop(0, P.rot); g.addColorStop(clamp(k * 0.7, 0.05, 1), P.rot); g.addColorStop(clamp(k * 0.7 + 0.15, 0.1, 1), 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(-r - 4, -len - r, r * 2 + 8, len + r + 4);
  ctx.strokeStyle = P.rotHatch; ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
  for (var hx = -r * 2; hx < r * 2; hx += 7) { ctx.beginPath(); ctx.moveTo(hx, 2); ctx.lineTo(hx + len * k * 0.6, -len * k * 0.6); ctx.stroke(); }
  ctx.restore();
  // 물방울 2개(흘러내림)
  ctx.fillStyle = P.rotSpot; [-0.4, 0.3].forEach(function (u, i) { ctx.beginPath(); ctx.ellipse(u * r, 8 + i * 6, 3, 4.5, 0, 0, 7); ctx.fill(); });
  ctx.restore();
}
