/* 선인장 키우기 (desert-breath) — 그리기 참고 코드. art-ui.md의 일부(배포 안 됨).
 * 게임이 이 파일을 불러오지 않는다. 개발자는 함수 구조·수치를 게임 안으로 옮긴다(이름은 바꿔도 됨).
 * 확인용 렌더: Chromium에서 drawCactus 9상태 + 날씨 4종(라이트/다크/흑백) + 화면 6종 레이아웃을 그려 검토함.
 * 장면 모형(drawScene/drawZone/lateChip)은 배치 확인용 — 실제 게임에서 따끔 글자는 DOM(.prick), 상단 바는 DOM이다. */
var PAL = {
  light: {
    skyDawn: ['#9fb1c6', '#d6dee6'], skyNoon: ['#e9d3a6', '#f6ebd3'], skyDusk: ['#a994c6', '#ecd3d8'],
    sand: '#e4cc9c', sandDeep: '#d6ba86', dune: '#c4a46a', zoneLine: '#b89559', zoneInk: '#6e5530',
    open: '#7cc35a', openEdge: '#3f7f2c', closed: '#7f9683', closedEdge: '#4b5f50', dry: '#b59a62', dryEdge: '#7d6538',
    pore: '#f4fbe6', poreDot: '#3f7f2c', crease: '#4b5f50', spine: '#fbf6e6', grain: '#8a5a2b', grainHi: '#e2b77a',
    fullRing: '#2f7fc4', drop: '#5aa7e0', dropEdge: '#2f6fa8', prick: '#d64545', bloom: '#ef8aa6', bloomC: '#f2b134',
    ruler: '#6b5a3e', rulerTxt: '#5c4a2e', nowLine: '#1f2430',
    cloud: '#eef2f6', cloudEdge: '#6f86a0', rain: '#2f6fb0', rainTint: 'rgba(47,111,176,.13)',
    sandWave: '#b07a36', dust: '#a8773f', sandTint: 'rgba(176,122,54,.16)',
    sun: '#f5b82e', sunEdge: '#c9761a', ray: '#e8862a', sunTint: 'rgba(245,184,46,.20)', heat: 'rgba(245,170,40,.16)'
  },
  dark: {
    skyDawn: ['#16202d', '#263446'], skyNoon: ['#2b2518', '#3d3424'], skyDusk: ['#1f1a32', '#3b2a40'],
    sand: '#3a3125', sandDeep: '#30281d', dune: '#55462f', zoneLine: '#7a6544', zoneInk: '#d9c39a',
    open: '#8fd46a', openEdge: '#cdeeb4', closed: '#6e8573', closedEdge: '#a9bcad', dry: '#9c8455', dryEdge: '#d2bb8a',
    pore: '#f4fbe6', poreDot: '#2f6a20', crease: '#3c4c40', spine: '#e8e0c8', grain: '#c08a4c', grainHi: '#f0cf98',
    fullRing: '#7cc0f2', drop: '#7cc0f2', dropEdge: '#cfe8fb', prick: '#ff6b6b', bloom: '#f39ab3', bloomC: '#ffc94d',
    ruler: '#b9a77f', rulerTxt: '#cbb98f', nowLine: '#eceef3',
    cloud: '#c9d3df', cloudEdge: '#8ea6c2', rain: '#8cc0ec', rainTint: 'rgba(140,192,236,.12)',
    sandWave: '#d9a35c', dust: '#c89558', sandTint: 'rgba(217,163,92,.14)',
    sun: '#ffc94d', sunEdge: '#ff9d3a', ray: '#ffb049', sunTint: 'rgba(255,201,77,.14)', heat: 'rgba(255,190,70,.10)'
  }
};
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function hex(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
function mix(a, b, t) { var x = hex(a), y = hex(b); return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(lerp(x[i], y[i], t)); }).join(',') + ')'; }
function mixHexStr(a, b, t) { var x = hex(a), y = hex(b); return '#' + [0, 1, 2].map(function (i) { return ('0' + Math.round(lerp(x[i], y[i], t)).toString(16)).slice(-2); }).join(''); }
function hash(i, k) { var s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); }

// 하늘 색: t = 0..150초. 0 새벽 → 75 한낮 → 150 해질녘 (smoothstep 보간)
function skyColors(P, t) {
  var u = clamp(t / 150, 0, 1), a, b, k;
  if (u < 0.5) { a = P.skyDawn; b = P.skyNoon; k = u / 0.5; } else { a = P.skyNoon; b = P.skyDusk; k = (u - 0.5) / 0.5; }
  k = k * k * (3 - 2 * k);
  return [mixHexStr(a[0], b[0], k), mixHexStr(a[1], b[1], k)];
}

// 몸통 외곽 경로 (x 가운데, 바닥 y=0, 위쪽이 음수)
function bodyPath(ctx, w, hh, bulge, wob, seed) {
  var r = w / 2, top = -Math.max(hh - r, r * 0.4), N = 12, i, y, x;
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  for (i = 1; i <= N; i++) { y = top * i / N; x = -r - bulge * Math.sin(Math.PI * i / N) + wob * Math.sin(i * 2.1 + seed); ctx.lineTo(x, y); }
  ctx.arc(0, top, r, Math.PI, 0);
  for (i = N - 1; i >= 0; i--) { y = top * i / N; x = r + bulge * Math.sin(Math.PI * i / N) + wob * Math.sin(i * 1.7 + seed + 1); ctx.lineTo(x, y); }
  ctx.closePath();
  return top;
}

// s = { x, gy, bw(꽉 찬 폭 px), h(키 px), o(열림 0..1, 이미 보간된 값), W(물 0..100), grains(박힌 모래 수),
//       flash(따끔 번쩍 0..1), tilt(rad, 말라 쓰러짐), bloom(0..1, 해질녘 꽃), withered(0..1 말라 죽음 색) }
function drawCactus(ctx, P, s) {
  var o = s.o, f = 0.5 + 0.5 * Math.min(s.W, 90) / 90, w = s.bw * f;
  var dry = clamp((35 - s.W) / 35, 0, 1), wd = Math.max(dry, s.withered || 0);
  var hh = s.h * (1 - 0.08 * (1 - o)) * (1 - 0.05 * dry);
  var body = mix(mixHexStr(P.closed, P.open, o), P.dry, wd * 0.7);
  var edge = mix(mixHexStr(P.closedEdge, P.openEdge, o), P.dryEdge, wd * 0.7);
  var lw = Math.max(2, s.bw * 0.035);
  var bulge = w * (0.07 * o - 0.035 * (1 - o)) - dry * w * 0.05;
  var wob = dry * w * 0.035;
  ctx.save();
  ctx.translate(s.x, s.gy);
  if (s.tilt) ctx.rotate(s.tilt);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  // 1) 90 선(꽉 찬 몸 윤곽) — 은은한 점선, 꽉 차면 실선
  var full = s.W >= 88;
  if (!s.withered) {
  ctx.save();
  bodyPath(ctx, s.bw, hh, s.bw * 0.07 * o - s.bw * 0.035 * (1 - o), 0, 0);
  ctx.setLineDash(full ? [] : [5, 5]);
  ctx.strokeStyle = P.fullRing; ctx.globalAlpha = full ? 0.85 : 0.4; ctx.lineWidth = full ? 2.5 : 1.5;
  ctx.stroke(); ctx.restore();
  }

  // 2) 팔 2개 (몸 뒤). 열림 = 바깥으로 벌리고 위로 듦, 닫힘 = 몸에 붙여 접음
  var aw = Math.max(7, w * 0.34);
  [[-1, 0.42], [1, 0.6]].forEach(function (a) {
    var side = a[0], ay = -hh * a[1];
    var reach = w * (0.16 + 0.42 * o) * (1 - 0.3 * dry);
    var up = hh * (0.12 + 0.16 * o) * (1 - 0.5 * dry);
    var ex = side * (w / 2 + reach), tipx = ex + side * w * (0.12 * o - 0.06 * (1 - o));
    var tipy = ay - aw * 0.4 - up + dry * up * 0.6;
    ctx.beginPath();
    ctx.moveTo(side * w * 0.2, ay);
    ctx.quadraticCurveTo(ex, ay, ex, ay - aw * 0.4);
    ctx.lineTo(tipx, tipy);
    ctx.strokeStyle = edge; ctx.lineWidth = aw + lw * 2; ctx.stroke();
    ctx.strokeStyle = body; ctx.lineWidth = aw; ctx.stroke();
    // 팔 끝 가시
    ctx.strokeStyle = P.spine; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(tipx, tipy - aw / 2); ctx.lineTo(tipx, tipy - aw / 2 - 4); ctx.stroke();
  });

  // 3) 몸통
  var top = bodyPath(ctx, w, hh, bulge, wob, 3);
  ctx.fillStyle = body; ctx.fill();
  ctx.save(); ctx.clip();
  // 갈비(세로 골) — 열림: 넓게 벌어짐·옅음 / 닫힘: 모이고 진함
  var spread = 0.15 + 0.1 * o;
  ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1.5, w * 0.03) + 1.2 * (1 - o); ctx.globalAlpha = 0.28 + 0.4 * (1 - o);
  [-1, 0, 1].forEach(function (k) {
    ctx.beginPath(); ctx.moveTo(k * w * spread * 1.15, 2); ctx.quadraticCurveTo(k * w * spread * 1.25, top * 0.6, k * w * spread * 0.6, top - w * 0.3); ctx.stroke();
  });
  ctx.globalAlpha = 1;
  // 물구멍 점(열림) — 갈비 사이 4줄
  if (o > 0.05) {
    ctx.globalAlpha = clamp((o - 0.05) / 0.6, 0, 1);
    var pr = Math.max(1.8, w * 0.04), cols = [-0.31, -0.1, 0.1, 0.31], row = Math.max(11, w * 0.2), y, j = 0;
    for (y = -row * 0.8; y > top - w * 0.15; y -= row, j++) {
      cols.forEach(function (c, ci) {
        var px = c * w * (0.85 + 0.3 * o) + ((j % 2) ? w * 0.02 : -w * 0.02);
        ctx.fillStyle = P.pore; ctx.beginPath(); ctx.ellipse(px, y, pr, pr * 1.35, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = P.poreDot; ctx.beginPath(); ctx.ellipse(px, y, pr * 0.35, pr * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      });
    }
    ctx.globalAlpha = 1;
  }
  // 웅크림 주름(닫힘) — 짧은 가로 주름 ︶
  if (o < 0.95) {
    ctx.globalAlpha = (1 - o) * 0.75; ctx.strokeStyle = P.crease; ctx.lineWidth = Math.max(1.5, w * 0.03);
    var cy, step = Math.max(10, w * 0.17), jj = 0;
    for (cy = -step * 0.7; cy > top; cy -= step, jj++) {
      [-0.25, 0, 0.25].forEach(function (c) {
        var cx = c * w + ((jj % 2) ? w * 0.06 : -w * 0.06);
        ctx.beginPath(); ctx.moveTo(cx - w * 0.09, cy); ctx.quadraticCurveTo(cx, cy + w * 0.06, cx + w * 0.09, cy); ctx.stroke();
      });
    }
    ctx.globalAlpha = 1;
  }
  // 마른 주름(물 적음) — 몸통을 가로지르는 물결 주름
  if (dry > 0) {
    ctx.globalAlpha = dry * 0.85; ctx.strokeStyle = mix(P.dryEdge, P.crease, 0.3); ctx.lineWidth = Math.max(1.2, w * 0.025);
    var dy, st = Math.max(7, w * 0.12);
    for (dy = -st * 0.6; dy > top; dy -= st) {
      ctx.beginPath();
      for (var xx = -w / 2; xx <= w / 2; xx += 3) { var yy = dy + Math.sin(xx * 0.55 + dy) * w * 0.03; if (xx === -w / 2) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // 박힌 모래알
  for (var g = 0; g < Math.min(s.grains || 0, 16); g++) {
    var gx = (hash(g, 1) - 0.5) * w * 0.75, gy2 = top * (0.08 + 0.85 * hash(g, 2)) , gr = Math.max(2.4, w * 0.05);
    ctx.fillStyle = P.grain; ctx.strokeStyle = P.crease; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(gx, gy2, gr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = P.grainHi; ctx.beginPath(); ctx.arc(gx - gr * 0.35, gy2 - gr * 0.35, gr * 0.38, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  bodyPath(ctx, w, hh, bulge, wob, 3);
  ctx.strokeStyle = edge; ctx.lineWidth = lw; ctx.stroke();
  // 따끔 번쩍(외곽선 빨강)
  if (s.flash) { ctx.strokeStyle = P.prick; ctx.globalAlpha = s.flash; ctx.lineWidth = lw + 2; ctx.stroke(); ctx.globalAlpha = 1; }
  // 가시(양 옆 + 머리)
  ctx.strokeStyle = P.spine; ctx.lineWidth = 1.5;
  for (var sy = -10; sy > top; sy -= 14) {
    [-1, 1].forEach(function (sd) { var sx = sd * (w / 2 + bulge * Math.sin(Math.PI * sy / top)); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + sd * 4, sy - 3); ctx.stroke(); });
  }
  [-0.5, 0, 0.5].forEach(function (k) { var a = -Math.PI / 2 + k * 0.6; ctx.beginPath(); ctx.moveTo(Math.cos(a) * w / 2 * 0.9, top + Math.sin(a) * w / 2 * 0.9); ctx.lineTo(Math.cos(a) * (w / 2 + 6), top + Math.sin(a) * (w / 2 + 6)); ctx.stroke(); });
  // 해질녘 꽃
  if (s.bloom) {
    var b = s.bloom, fr = Math.max(6, w * 0.2) * b, fy = top - w / 2 - fr * 0.3;
    ctx.fillStyle = P.bloom;
    for (var pi = 0; pi < 5; pi++) { var pa = -Math.PI / 2 + pi * Math.PI * 2 / 5; ctx.beginPath(); ctx.ellipse(Math.cos(pa) * fr * 0.6, fy + Math.sin(pa) * fr * 0.6, fr * 0.55, fr * 0.32, pa, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = P.bloomC; ctx.beginPath(); ctx.arc(0, fy, fr * 0.3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  return { top: s.gy + top - w / 2, w: w };
}

// 넘친 물방울(위로 올라가 키가 됨). p = 0..1 진행
function drawDrop(ctx, P, x, y, r, a) {
  ctx.save(); ctx.globalAlpha = a;
  ctx.beginPath(); ctx.moveTo(x, y - r * 1.6); ctx.quadraticCurveTo(x + r, y - r * 0.2, x, y + r); ctx.quadraticCurveTo(x - r, y - r * 0.2, x, y - r * 1.6);
  ctx.strokeStyle = P.pore; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = P.drop; ctx.fill(); ctx.strokeStyle = P.dropEdge; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore();
}

// 날씨 한 조각 (띠 안). x0<x1, 띠 y=by, 높이 bh. 비는 오른쪽(나중)으로 갈수록 빗줄이 굵다.
function drawSeg(ctx, P, type, x0, x1, by, bh, phase) {
  var col = { rain: P.rainTint, sand: P.sandTint, sun: P.sunTint }[type];
  if (!col) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, by, x1 - x0, bh); ctx.clip();
  ctx.fillStyle = col; ctx.fillRect(x0, by, x1 - x0, bh);
  if (type === 'rain') {
    // 빗줄: 띠 아래쪽 55%. 굵기 1.5 → 5px (선형, 조각 안 위치)
    for (var x = x0 + 5; x < x1 - 2; x += 9) {
      var k = (x - x0) / Math.max(1, x1 - x0), lw = 1.5 + 3.5 * k;
      var off = ((phase || 0) * 1.0 + hash(Math.round(x), 4) * bh) % (bh * 0.3);
      ctx.strokeStyle = P.rain; ctx.lineWidth = lw; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, by + bh * 0.5 + off * 0.3); ctx.lineTo(x, by + bh - 4); ctx.stroke();
    }
    // 둥근 구름: 위쪽, 조각 폭을 따라 원 반복
    var cr = bh * 0.2, cy = by + bh * 0.33;
    ctx.fillStyle = P.cloud; ctx.strokeStyle = P.cloudEdge; ctx.lineWidth = 2;
    var xs = []; for (var cx = x0 + cr * 0.9; cx < x1 + cr * 0.2; cx += cr * 1.3) xs.push(cx);
    if (xs.length === 0) xs.push((x0 + x1) / 2);
    ctx.beginPath(); xs.forEach(function (c, i) { var rr = cr * (i % 2 ? 1.15 : 0.95); ctx.moveTo(c + rr, cy - (i % 2 ? cr * 0.15 : 0)); ctx.arc(c, cy - (i % 2 ? cr * 0.15 : 0), rr, 0, Math.PI * 2); });
    ctx.rect(x0, cy, x1 - x0, cr * 0.85);
    ctx.stroke(); ctx.fill();
  } else if (type === 'sand') {
    ctx.strokeStyle = P.sandWave; ctx.lineCap = 'round';
    [0.3, 0.52, 0.74].forEach(function (yy, i) {
      ctx.lineWidth = 3.2 - i * 0.4;
      ctx.beginPath();
      for (var x = x0 - 10; x <= x1 + 10; x += 3) { var y = by + bh * yy + Math.sin((x + (phase || 0) * 2 + i * 9) * 0.12) * bh * 0.05; if (x === x0 - 10) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
    });
    ctx.fillStyle = P.dust;
    for (var d = 0; d < (x1 - x0) / 7; d++) { ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(x0 + hash(d, 7) * (x1 - x0), by + bh * (0.15 + 0.8 * hash(d, 8)), 1.4 + hash(d, 9) * 1.2, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  } else if (type === 'sun') {
    var r = Math.min(bh * 0.24, (x1 - x0) * 0.32), sx = (x0 + x1) / 2, sy = by + bh * 0.5;
    var reps = Math.max(1, Math.floor((x1 - x0) / (bh * 1.4)));
    for (var q = 0; q < reps; q++) {
      sx = x0 + (x1 - x0) * (q + 0.5) / reps;
      ctx.strokeStyle = P.ray; ctx.lineWidth = Math.max(2, r * 0.18); ctx.lineCap = 'round';
      for (var a = 0; a < 8; a++) { var an = a * Math.PI / 4 + (phase || 0) * 0.002; ctx.beginPath(); ctx.moveTo(sx + Math.cos(an) * r * 1.35, sy + Math.sin(an) * r * 1.35); ctx.lineTo(sx + Math.cos(an) * r * 1.8, sy + Math.sin(an) * r * 1.8); ctx.stroke(); }
      ctx.fillStyle = P.sun; ctx.strokeStyle = P.sunEdge; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
  ctx.restore();
  // 경계선(시작·끝) — 조각 색의 진한 선 2px: "언제 끝나는지"를 정확히 읽게
  var ec = { rain: P.rain, sand: P.sandWave, sun: P.sunEdge }[type];
  ctx.fillStyle = ec; ctx.fillRect(Math.round(x0), by, 2, bh); ctx.fillRect(Math.round(x1) - 2, by, 2, bh);
}

// 띠 아래 장면 효과 (날씨 조각 바로 아래, 하늘~땅): 비 = 떨어지는 빗줄, 모래 = 낮은 먼지 띠, 해 = 열기 기둥
function drawSegScene(ctx, P, type, x0, x1, top, gy, phase) {
  ctx.save(); ctx.beginPath(); ctx.rect(x0, top, x1 - x0, gy - top); ctx.clip();
  if (type === 'rain') {
    for (var x = x0 + 7; x < x1 - 2; x += 16) {
      var k = (x - x0) / Math.max(1, x1 - x0), lw = 1.2 + 2.6 * k, len = 12 + 10 * k;
      ctx.strokeStyle = P.rain; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.globalAlpha = 0.5;
      for (var y = top - 40 + ((phase || 0) * 0.6 + hash(Math.round(x), 2) * 60) % 60; y < gy; y += 70) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke(); }
    }
  } else if (type === 'sand') {
    var h = (gy - top) * 0.45;
    var grd = ctx.createLinearGradient(0, gy - h, 0, gy); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, P.sandTint.replace(/[\d.]+\)$/, '0.45)'));
    ctx.fillStyle = grd; ctx.fillRect(x0, gy - h, x1 - x0, h);
    ctx.strokeStyle = P.sandWave; ctx.lineWidth = 2; ctx.globalAlpha = 0.7;
    for (var i = 0; i < 4; i++) { var yy = gy - h * (0.15 + 0.2 * i); var sx = x0 + (((phase || 0) * 1.5 + i * 37) % 60); for (; sx < x1; sx += 60) { ctx.beginPath(); ctx.moveTo(sx, yy); ctx.quadraticCurveTo(sx + 9, yy - 4, sx + 18, yy); ctx.stroke(); } }
    ctx.fillStyle = P.dust; for (var d = 0; d < (x1 - x0) / 5; d++) { ctx.globalAlpha = 0.65; ctx.beginPath(); ctx.arc(x0 + hash(d, 3) * (x1 - x0), gy - h * hash(d, 5), 1.3 + hash(d, 6), 0, Math.PI * 2); ctx.fill(); }
  } else if (type === 'sun') {
    ctx.fillStyle = P.heat; ctx.fillRect(x0, top, x1 - x0, gy - top);
    ctx.strokeStyle = P.ray; ctx.lineWidth = 2; ctx.globalAlpha = 0.35; ctx.setLineDash([6, 10]);
    for (var bx = x0 + 12; bx < x1; bx += 26) { ctx.beginPath(); ctx.moveTo(bx, top); ctx.lineTo(bx - 8, gy); ctx.stroke(); }
  }
  ctx.restore();
}

function layout(W, SH) {
  var landscape = W > SH, low = SH < 420;
  var r = low ? 0.64 : landscape ? 0.6 : 0.56;
  var SZ = Math.round(SH * r);                // 하늘+선인장 영역 높이 (땅선 y)
  if (SH - SZ < 110) SZ = SH - 110;           // 누르는 곳 최소 110
  var by = low ? 6 : 10;
  var BH = clamp(Math.round(SZ * 0.2), 52, 112);
  var nowX = Math.round(W * (W < 520 ? 0.34 : 0.3));
  var right = W - 8, fpx = right - nowX;       // 예고 3초 = fpx 픽셀
  var gap = low ? 16 : 26;                     // 띠 아래 ~ 선인장 최대 키 사이 (따끔 글자·지금 표시)
  var space = SZ - (by + BH) - gap;
  var Hmax = Math.round(space * 0.86);
  var bw = clamp(Math.round(Math.min(W * 0.1, space * 0.32)), 36, 96);
  var rulerX = Math.round(nowX - bw * 1.3 - 14);
  return { SZ: SZ, gy: SZ, by: by, BH: BH, nowX: nowX, right: right, pxPerSec: fpx / 3, Hmax: Hmax, bw: bw, rulerX: rulerX, zoneTop: SZ, zoneH: SH - SZ, low: low };
}
var ZOOM = [25, 40, 60, 90];
function zoomFor(Hcm) { for (var i = 0; i < ZOOM.length; i++) if (Hcm <= ZOOM[i] * 0.85) return ZOOM[i]; return ZOOM[ZOOM.length - 1]; }

function drawRuler(ctx, P, L, R, Hcm) {
  var ppcm = L.Hmax / R, x = L.rulerX, gy = L.gy;
  ctx.save();
  ctx.strokeStyle = P.ruler; ctx.fillStyle = P.rulerTxt; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy - L.Hmax); ctx.stroke();
  ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (var c = 0; c <= R; c++) {
    var y = gy - c * ppcm, len = c % 10 === 0 ? 10 : c % 5 === 0 ? 7 : 4;
    if (len === 4 && ppcm < 3.5) continue;
    ctx.lineWidth = c % 10 === 0 ? 2 : 1.2; ctx.globalAlpha = len === 4 ? 0.55 : 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
    if (c % 10 === 0 && c > 0) { ctx.globalAlpha = 1; ctx.fillText(String(c), x - 5, y); }
  }
  ctx.globalAlpha = 1;
  // 현재 키 표시: 눈금자 오른쪽 삼각형 + 선인장 머리까지 점선
  var hy = gy - Hcm * ppcm;
  ctx.fillStyle = P.fullRing;
  ctx.beginPath(); ctx.moveTo(x + 3, hy); ctx.lineTo(x + 12, hy - 6); ctx.lineTo(x + 12, hy + 6); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = P.fullRing; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(x + 14, hy); ctx.lineTo(L.nowX, hy); ctx.stroke();
  ctx.restore();
}

// segs: [{type, t0, t1}] 시간(초). now = 현재 시각
function drawScene(ctx, P, W, SH, st) {
  var L = layout(W, SH), sky = skyColors(P, st.t);
  var g = ctx.createLinearGradient(0, 0, 0, L.gy); g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, L.gy);
  var X = function (tt) { return L.nowX + (tt - st.t) * L.pxPerSec; };
  var pastX = L.nowX - 0.5 * L.pxPerSec;      // 지난 날씨는 최대 0.5초만 (design.md)
  // 장면 효과(띠 아래)
  ctx.save(); ctx.beginPath(); ctx.rect(pastX, 0, L.right - pastX, L.gy); ctx.clip();
  st.segs.forEach(function (s) { var a = X(s.t0), b = X(s.t1); if (b <= pastX || a >= L.right) return; drawSegScene(ctx, P, s.type, a, b, L.by + L.BH, L.gy, st.phase || 0); });
  ctx.restore();
  // 띠 바탕 (하늘 위 반투명 판)
  ctx.save();
  ctx.fillStyle = P === PAL.dark ? 'rgba(18,20,26,.35)' : 'rgba(255,255,255,.35)';
  roundRect(ctx, 4, L.by, W - 8, L.BH, 10); ctx.fill();
  ctx.beginPath(); roundRect(ctx, 4, L.by, W - 8, L.BH, 10); ctx.clip();
  // 조각은 '진짜' 좌표로 그리고 보이는 범위 [pastX, right]로만 자른다 → 빗줄 굵기(p)·해 위치가 조각에 고정됨
  ctx.save(); ctx.beginPath(); ctx.rect(pastX, L.by, L.right - pastX, L.BH); ctx.clip();
  st.segs.forEach(function (s) { var a = X(s.t0), b = X(s.t1); if (b <= pastX || a >= L.right) return; drawSeg(ctx, P, s.type, a, b, L.by, L.BH, st.phase || 0); });
  ctx.restore();
  // 지난 쪽(지금 선 왼쪽) 흐리게
  ctx.fillStyle = P === PAL.dark ? 'rgba(18,20,26,.55)' : 'rgba(244,241,234,.6)';
  ctx.fillRect(pastX, L.by, L.nowX - pastX, L.BH);
  // 1초·2초·3초 눈금
  ctx.fillStyle = P.nowLine; ctx.globalAlpha = 0.45;
  for (var k = 1; k <= 3; k++) { var tx = Math.round(L.nowX + k * L.pxPerSec) - 1; ctx.fillRect(tx - (k === 3 ? 6 : 0), L.by + L.BH - 7, 2, 7); }
  ctx.restore();
  ctx.save(); ctx.fillStyle = P.nowLine; ctx.globalAlpha = 0.7; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText('3초', W - 10, L.by + L.BH - 8); ctx.restore();
  // 땅(모래 언덕) + 누르는 곳
  ctx.fillStyle = P.sand; ctx.beginPath(); ctx.moveTo(0, L.gy + 6);
  for (var x = 0; x <= W; x += 8) ctx.lineTo(x, L.gy + Math.sin(x * 0.012) * 5 - (Math.abs(x - L.nowX) < L.bw ? 4 : 0));
  ctx.lineTo(W, SH); ctx.lineTo(0, SH); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = P.dune; ctx.lineWidth = 2; ctx.beginPath();
  for (x = 0; x <= W; x += 8) { var yy = L.gy + Math.sin(x * 0.012) * 5 - (Math.abs(x - L.nowX) < L.bw ? 4 : 0); if (!x) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); } ctx.stroke();
  drawZone(ctx, P, L, W, SH, st);
  // 지금 선
  ctx.save(); ctx.strokeStyle = P.nowLine; ctx.lineWidth = 2; ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.moveTo(L.nowX, L.by - 2); ctx.lineTo(L.nowX, L.by + L.BH + 2); ctx.stroke();
  ctx.fillStyle = P.nowLine; ctx.beginPath(); ctx.moveTo(L.nowX - 7, L.by + L.BH + 3); ctx.lineTo(L.nowX + 7, L.by + L.BH + 3); ctx.lineTo(L.nowX, L.by + L.BH + 11); ctx.closePath(); ctx.fill();
  ctx.restore();
  // 눈금자 + 선인장
  var R = zoomFor(st.H); drawRuler(ctx, P, L, R, st.H);
  var hpx = st.H * L.Hmax / R;
  var c = drawCactus(ctx, P, { x: L.nowX, gy: L.gy + 2, bw: L.bw, h: hpx, o: st.o, W: st.W, grains: st.grains, flash: st.flash, bloom: st.bloom, tilt: st.tilt });
  if (st.drops) st.drops.forEach(function (d) { drawDrop(ctx, P, L.nowX + d[0] * L.bw, L.gy - hpx * d[1], Math.max(3, L.bw * 0.07), d[2]); });
  if (st.late) lateChip(ctx, P, L.nowX + c.w / 2 + 10, Math.max(L.by + L.BH + 16, L.gy - hpx - 8), st.late);
  return L;
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function lateChip(ctx, P, x, y, txt) {
  ctx.save(); ctx.font = '800 14px system-ui, sans-serif';
  var t1 = '따끔!', w = Math.max(ctx.measureText(t1).width, (ctx.font = '700 12px system-ui, sans-serif', ctx.measureText(txt).width)) + 20;
  ctx.fillStyle = P === PAL.dark ? '#1b1e27' : '#ffffff'; ctx.strokeStyle = P.prick; ctx.lineWidth = 2;
  roundRect(ctx, x, y - 22, w, 42, 10); ctx.fill(); ctx.stroke();
  ctx.fillStyle = P === PAL.dark ? '#f39a84' : '#b2452f'; ctx.textBaseline = 'middle';
  ctx.font = '800 14px system-ui, sans-serif'; ctx.fillText(t1, x + 10, y - 9);
  ctx.font = '700 12px system-ui, sans-serif'; ctx.fillText(txt, x + 10, y + 9);
  ctx.restore();
}
function drawZone(ctx, P, L, W, SH, st) {
  var m = L.low ? 8 : 14, x = m, y = L.zoneTop + m + 6, w = W - m * 2, h = L.zoneH - m * 2 - 6;
  ctx.save();
  if (st.o > 0.5) { ctx.fillStyle = P === PAL.dark ? 'rgba(143,212,106,.10)' : 'rgba(63,127,44,.08)'; roundRect(ctx, x, y, w, h, 16); ctx.fill(); }
  ctx.strokeStyle = P.zoneLine; ctx.lineWidth = 2; ctx.setLineDash([8, 7]); ctx.globalAlpha = st.o > 0.5 ? 0.9 : 0.55;
  roundRect(ctx, x, y, w, h, 16); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  // 손가락 아이콘 + 안내
  var cx = W / 2, cy = y + h / 2;
  ctx.fillStyle = P.zoneInk; ctx.strokeStyle = P.zoneInk; ctx.lineWidth = 2.5;
  ctx.globalAlpha = 0.85;
  var r = Math.min(22, h * 0.18);
  ctx.beginPath(); ctx.arc(cx - 70, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx - 70, cy, r * 0.45, 0, Math.PI * 2); ctx.fill();
  ctx.font = '700 ' + (L.low ? 14 : 16) + 'px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(st.o > 0.5 ? '펴는 중 · 떼면 웅크려요' : (st.hint || '누르고 있으면 펴져요'), cx - 70 + r + 12, cy);
  ctx.restore();
}
