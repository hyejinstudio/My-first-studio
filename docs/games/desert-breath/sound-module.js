/* ===== 선인장 키우기 (desert-breath) Sound module =====
 * Web Audio API 실시간 합성. 외부 파일/의존성 없음.
 * AudioContext 미지원·생성 실패 시 모든 호출은 조용히 무시된다(게임은 소리 없이 정상 진행).
 *
 * 사용법: 사용자 제스처(click/touchend/pointerup/keydown) 핸들러 맨 앞에서 Sound.unlock() →
 *   판 시작: Sound.startAmbient()
 *   매 프레임: Sound.update({ now:'rain', heavy:0.4, next:'sand', nextIn:1.8, open:true })
 *   순간 효과음: Sound.play('open'), Sound.play('close'), Sound.play('grow', { cm: 23 }), Sound.play('sting') ...
 *
 * [박자 없음] 이 게임 소리에는 박자·루프 멜로디가 없다. 환경음은 노이즈 + 서로 맞지 않는 느린 흔들림(LFO),
 *   빗방울·꿀렁·지글은 매번 무작위 간격. 리듬 게임처럼 들리면 안 된다.
 * [공정성] 다가오는 날씨는 화면 예고 띠와 똑같이 "도착 3초 전"부터만 작게(최대 50%, 빗방울 알갱이 없이) 들린다. 그보다 일찍은 절대 안 남.
 *   날씨가 실제로 바뀌는 순간은 빠르게(시정수 50ms) 바뀌어 귀로도 경계가 분명하다.
 * [연타] open/close는 가장 자주 나는 소리라 가장 작고 짧다. 동시 발음 최대 2개, 50ms 스로틀, 연타할수록 작아짐.
 *
 * 신호 경로: sfxBus → LP 9kHz ─────────────┐
 *            ambBus(환경음) → ambDuck ─────┴→ master(음소거) → limiter → destination
 */
const Sound = (function () {
  'use strict';
  var MUTE_KEY = 'desert-breath-muted';
  var MASTER_VOL = 0.6;
  var AMB_VOL = 1.0;        // 환경음 버스(각 층 레벨은 LV 표)
  var DUCK = 0.45;          // 해질녘·말라 쓰러짐·새 기록 때 환경음을 잠깐 낮추는 비율
  var OC_CAP = 2;           // open/close 동시 발음 최대 수
  var PREVIEW_MAX = 0.5;    // 예고 중인 날씨의 최대 음량 비율(도착 순간 1.0, 빗방울·지글 같은 알갱이는 도착 순간부터)
  var PREVIEW_SEC = 3;      // 예고 시간(화면 예고 띠와 같음). 이보다 일찍 들려주지 않는다

  // 환경음 층 레벨(층 게인 값, master 0.6 앞)
  var LV = {
    wind: 0.055,      // 바탕 사막 바람(항상). 해 날씨에는 0.5배(고요하고 뜨거움)
    rainLo: 0.045,    // 빗소리: 빗줄 가늘 때(heavy 0)
    rainHi: 0.125,    // 빗소리: 빗줄 굵을 때(heavy 1)
    sand: 0.11,      // 모래바람(고음 노이즈 + 낮은 바람)
    sun: 0.035,       // 한낮 해(아주 옅은 고음 아지랑이)
    sizzle: 0.03,    // 해에 열려 있는 동안 '치이—'
    grit: 0.035,     // 모래에 열려 있는 동안 '사사삭'
    rainPv: 0.07,    // 예고 중인 비의 기준(빗방울 없이 '쏴—' 몸통만이라 가는 비보다 기준을 높게)
    sunPv: 0.06      // 예고 중인 해의 기준
  };

  var ctx = null, master = null, limiter = null, sfxBus = null, sfxTone = null;
  var ambBus = null, ambDuck = null, noiseBuf = null;
  var muted = false, offline = false;
  var last = {}, ocPool = [];
  var amb = { want: false, on: false, nodes: null, stopTimer: null };
  var paused = false;       // 일시정지 화면(날씨 띠가 가려짐) 동안 환경음·알갱이 모두 멈춤
  // 현재 적용된 상태(차이가 있을 때만 AudioParam을 건드린다 — 매 프레임 호출해도 가벼움)
  var st = { now: 'clear', heavy: 0, next: null, pv: 0, open: false };
  var applied = {};
  var micro = { drop: 0, gulp: 0, crackle: 0 };   // 무작위 알갱이 다음 예정 시각

  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { muted = false; }

  function build(c) {
    ctx = c;
    limiter = ctx.createDynamicsCompressor();          // 마스터 리미터
    limiter.threshold.value = -6; limiter.knee.value = 2; limiter.ratio.value = 20;
    limiter.attack.value = 0.002; limiter.release.value = 0.15;
    limiter.connect(ctx.destination);

    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOL;
    master.connect(limiter);

    sfxTone = ctx.createBiquadFilter();
    sfxTone.type = 'lowpass'; sfxTone.frequency.value = 9000; sfxTone.Q.value = 0.5;
    sfxTone.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(sfxTone);

    ambDuck = ctx.createGain(); ambDuck.gain.value = 1; ambDuck.connect(master);
    ambBus = ctx.createGain(); ambBus.gain.value = 0; ambBus.connect(ambDuck);

    // 노이즈 버퍼 1개(4초, 스테레오, 고정 시드)를 환경음·효과음 모두 재사용. 4초라 반복이 귀에 잡히지 않고,
    // 두 재생기는 루프 구간·속도를 다르게 해 같은 무늬가 겹쳐 돌지 않는다.
    var len = Math.floor(ctx.sampleRate * 4);
    noiseBuf = ctx.createBuffer(2, len, ctx.sampleRate);
    var seed = 20261127;
    for (var ch = 0; ch < 2; ch++) {
      var d = noiseBuf.getChannelData(ch);
      for (var j = 0; j < len; j++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[j] = seed / 0x3fffffff - 1; }
      // 루프 이음매 클릭 방지: 끝 20ms를 앞부분과 교차 페이드
      var xf = Math.floor(ctx.sampleRate * 0.02);
      for (var k = 0; k < xf; k++) { var a = k / xf; d[len - xf + k] = d[len - xf + k] * (1 - a) + d[k] * a; }
    }
    applied = {};
  }

  function ensureCtx() {
    if (ctx) return ctx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      var c;
      try { c = new AC({ latencyHint: 'interactive' }); } catch (e1) { c = new AC(); }
      build(c);
    } catch (e) { ctx = null; }
    return ctx;
  }

  function running() { return !!ctx && (offline || ctx.state === 'running'); }
  function ready() { return running() && !muted; }

  function throttled(key, t, gap) {
    if (last[key] !== undefined && t - last[key] < gap && t >= last[key]) return true;
    last[key] = t;
    return false;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  // ---------- 음원 기본 블록 (엔벨로프는 0.0001에서 지수 어택/감쇠 — 클릭음 방지) ----------
  function tone(type, f0, f1, t, dur, vol, attack, dest) {
    try {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
      var a = attack || 0.005;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || sfxBus);
      o.start(t); o.stop(t + dur + 0.03);
      return o;
    } catch (e) { return null; }
  }

  function noise(t, dur, vol, ftype, f0, f1, q, attack, dest) {
    try {
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf;
      f.type = ftype; f.Q.value = q || 0.8;
      f.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      var a = attack || 0.004;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest || sfxBus);
      s.start(t, Math.random() * 3.5); s.stop(t + dur + 0.03);
      return s;
    } catch (e) { return null; }
  }

  // 마림바풍: sine 기음 + 4배 배음(짧게)
  function mallet(f, t, dur, vol, dest) {
    tone('sine', f, 0, t, dur, vol, 0.003, dest);
    tone('sine', f * 4, 0, t, Math.min(0.03, dur * 0.3), vol * 0.08, 0.001, dest);
  }
  // 작은 종: sine 기음 + 2배 + 3배(짧게)
  function bell(f, t, dur, vol, dest) {
    tone('sine', f, 0, t, dur, vol, 0.002, dest);
    tone('sine', f * 2, 0, t, dur * 0.35, vol * 0.25, 0.002, dest);
    tone('sine', f * 3, 0, t, dur * 0.15, vol * 0.07, 0.001, dest);
  }

  // open/close 전용 보이스: 동시 발음이 OC_CAP을 넘으면 가장 오래된 소리를 10ms 안에 줄여 없앤다
  function ocVoice(t, dur) {
    var keep = [];
    for (var i = 0; i < ocPool.length; i++) if (ocPool[i].end > t) keep.push(ocPool[i]);
    ocPool = keep;
    if (ocPool.length >= OC_CAP) {
      var old = ocPool.shift();
      try { old.g.gain.setTargetAtTime(0, t, 0.004); } catch (e) {}
    }
    var g = ctx.createGain(); g.gain.value = 1; g.connect(sfxBus);
    ocPool.push({ g: g, end: t + dur });
    return g;
  }
  // 직전 open/close와의 간격(초) → 음량 계수(0.2초 이상 1.0, 짧을수록 최소 0.55)
  function density(t) {
    var prev = last['oc:d'];
    var gap = (prev === undefined || t < prev) ? 1 : t - prev;
    last['oc:d'] = t;
    return clamp(0.55 + gap * 2.25, 0.55, 1);
  }

  function duck(t, hold) {
    try {
      ambDuck.gain.cancelScheduledValues(t);
      ambDuck.gain.setTargetAtTime(DUCK, t, 0.05);
      ambDuck.gain.setTargetAtTime(1, t + hold, 0.5);
    } catch (e) {}
  }

  var N = { D3: 146.83, A3: 220.0, D4: 293.66, E4: 329.63, Fs4: 369.99, G4: 392.0, A4: 440.0, B4: 493.88,
            D5: 587.33, E5: 659.25, Fs5: 739.99, G5: 783.99, A5: 880.0, B5: 987.77,
            D6: 1174.66, E6: 1318.51, Fs6: 1479.98, A6: 1760.0, B6: 1975.53, G3: 196.0, G2: 98.0, D2: 73.42 };
  // 자람 음계: D 장조 5음 음계 2옥타브(키 1cm마다 한 칸 위로, 10칸마다 처음으로 — 매번 다른 간격이라 박자 아님)
  var GROW = [N.D5, N.E5, N.Fs5, N.A5, N.B5, N.D6, N.E6, N.Fs6, N.A6, N.B6];

  // ---------- 효과음 ----------
  var sfx = {
    // 일반 UI 버튼: 부드러운 '톡'
    button: function (t) {
      if (throttled('button', t, 0.05)) return;
      tone('sine', 640, 500, t, 0.055, 0.10, 0.002);
      noise(t, 0.02, 0.04, 'bandpass', 2400, 0, 1.2, 0.001);
    },
    // 열기(누르는 순간) '스읍': 부드러운 들숨 — 밴드패스 노이즈 700→1900Hz, 0.15초(펴지는 시간과 같음), 느린 어택
    open: function (t) {
      if (throttled('open', t, 0.05)) return;
      var k = density(t), v = ocVoice(t, 0.2), r = rnd(0.95, 1.05);
      noise(t, 0.16, 0.10 * k, 'bandpass', 700 * r, 1900 * r, 1.1, 0.09, v);
      tone('sine', 420 * r, 520 * r, t + 0.02, 0.12, 0.012 * k, 0.06, v);   // 숨결의 아주 옅은 몸통
    },
    // 닫기(떼는 순간) '톡': 작은 나무 톡 25ms + 숨 끝 노이즈 30ms
    close: function (t) {
      if (throttled('close', t, 0.05)) return;
      var k = density(t), v = ocVoice(t, 0.06), r = rnd(0.96, 1.04);
      tone('sine', 950 * r, 620 * r, t, 0.03, 0.05 * k, 0.001, v);
      noise(t, 0.03, 0.03 * k, 'bandpass', 1500 * r, 1100 * r, 1.0, 0.002, v);
    },
    // 자람(키 1cm 늘 때마다): 아래에서 위로 미끄러져 올라가는 맑은 음. opts.cm(정수 키)로 음계 한 칸씩 위로
    grow: function (t, o) {
      if (throttled('grow', t, 0.12)) return;
      var cm = Math.max(0, Math.round(+o.cm || 0));
      var f = GROW[cm % GROW.length];
      tone('sine', f * 0.75, f, t, 0.26, 0.085, 0.012);           // 4도 아래에서 쓱 올라옴
      tone('sine', f * 2, 0, t + 0.05, 0.12, 0.012, 0.004);       // 반짝 배음
      if (cm % GROW.length === 0 && cm > 0) bell(f * 2, t + 0.07, 0.35, 0.03);   // 10cm마다 작은 종
    },
    // 따끔(모래에 열린 채 들어감, 구간당 1번) '츳': 모래알 3개 고음 클릭 + 짧은 '츠' 노이즈. 신음·낮은 음 없음
    sting: function (t) {
      if (throttled('sting', t, 0.15)) return;
      for (var i = 0; i < 3; i++) noise(t + i * 0.011 + rnd(0, 0.004), 0.008, 0.16 - i * 0.03, 'bandpass', rnd(3800, 5200), 0, 2.2, 0.0007);
      noise(t + 0.004, 0.075, 0.10, 'highpass', 3200, 5200, 0.8, 0.003);
      tone('triangle', 1800, 1500, t, 0.03, 0.025, 0.001);
    },
    // 해 열기(해에 열린 채 들어감, 구간당 1번) '지글': 탁탁 튀는 작은 클릭 + '치이' 하강 노이즈 0.35초
    scorch: function (t) {
      if (throttled('scorch', t, 0.15)) return;
      for (var i = 0; i < 7; i++) noise(t + rnd(0, 0.3), 0.004, rnd(0.04, 0.09), 'highpass', 3000, 0, 0.7, 0.0005);
      noise(t, 0.36, 0.07, 'bandpass', 6000, 3000, 0.9, 0.01);
    },
    // 말라 쓰러짐(쓰러짐 연출 1.2초): 힘 빠지는 하강(sine 392→165Hz, 1.1초) + 0.95초에 모래에 '퍽'(저역 노이즈). 날카로운 소리 없음
    wilt: function (t) {
      if (throttled('wilt', t, 1)) return;
      duck(t, 1.8);
      tone('sine', N.G4, 165, t, 1.1, 0.10, 0.03);
      tone('triangle', N.G3, 82, t, 1.05, 0.05, 0.03);
      noise(t + 0.15, 0.75, 0.03, 'bandpass', 1200, 500, 0.8, 0.2);   // 바람 빠지는 '휘유'
      noise(t + 0.95, 0.22, 0.12, 'lowpass', 420, 160, 0.7, 0.006);   // 모래에 '퍽'
      tone('sine', 110, 70, t + 0.95, 0.2, 0.08, 0.004);
    },
    // 해질녘 도착(150초 완주): 따뜻한 D 장조 add9 화음 천천히 피어남 + 종 A5·D6
    dusk: function (t) {
      if (throttled('dusk', t, 1)) return;
      duck(t, 2.4);
      var ch = [N.D4, N.Fs4, N.A4, N.E5], i;
      for (i = 0; i < ch.length; i++) tone('sine', ch[i], 0, t + i * 0.06, 2.4, 0.045, 0.35);
      tone('triangle', N.D3, 0, t, 2.2, 0.10, 0.25);
      bell(N.A5, t + 0.25, 1.0, 0.07);
      bell(N.D6, t + 0.55, 1.2, 0.05);
    },
    // 결과 화면(새 기록 아님): 작은 마림바 2음
    result: function (t) {
      if (throttled('result', t, 0.5)) return;
      mallet(N.A5, t, 0.25, 0.08);
      mallet(N.D6, t + 0.09, 0.35, 0.08);
    },
    // 새 기록: 마림바 D5-E5-F#5-A5-B5-D6 빠른 상승 + 종 D6 + G→D 두 화음
    record: function (t) {
      if (throttled('record', t, 0.8)) return;
      duck(t, 2.0);
      var run = [N.D5, N.E5, N.Fs5, N.A5, N.B5, N.D6], i;
      for (i = 0; i < run.length; i++) mallet(run[i], t + i * 0.055, 0.2, 0.10);
      bell(N.D6, t + 0.36, 0.7, 0.10);
      var c1 = [N.G4, N.B4, N.D5], c2 = [N.Fs4, N.A4, N.D5];
      for (i = 0; i < 3; i++) tone('sine', c1[i], 0, t + 0.36, 0.45, 0.05, 0.02);
      tone('triangle', N.G2 * 2, 0, t + 0.36, 0.4, 0.10, 0.02);
      for (i = 0; i < 3; i++) tone('sine', c2[i], 0, t + 0.78, 1.1, 0.055, 0.02);
      tone('triangle', N.D3, 0, t + 0.78, 1.0, 0.11, 0.02);
      bell(N.A6, t + 0.78, 0.5, 0.035);
    }
  };

  // ---------- 환경음(연속, 박자 없음) ----------
  // 노이즈 재생기 2개 → 필터 → 층별 게인. 층: 바람(항상) / 비 / 모래 / 해 / 해-열림 지글 / 모래-열림 사각
  function lfo(freq, depth, param, t) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq; g.gain.value = depth;
    o.connect(g); g.connect(param); o.start(t);
    return o;
  }
  function filt(type, f, q) { var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  function gain(v, dest) { var g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }

  function buildAmbient(t) {
    var n = { src: [], osc: [] };
    var A = ctx.createBufferSource(), B = ctx.createBufferSource();
    A.buffer = noiseBuf; A.loop = true;
    B.buffer = noiseBuf; B.loop = true; B.loopStart = 0.53; B.loopEnd = 3.71; B.playbackRate.value = 0.97;
    n.src.push(A, B);

    // 바람(항상): LP 450Hz, 서로 맞지 않는 느린 흔들림 0.067/0.113Hz로 크기·밝기가 천천히 변함
    n.wind = gain(0, ambBus);
    var wMod = gain(1, n.wind), wLp = filt('lowpass', 450, 0.6);
    A.connect(wLp); wLp.connect(wMod);
    n.osc.push(lfo(0.067, 0.25, wMod.gain, t), lfo(0.113, 0.18, wMod.gain, t), lfo(0.041, 140, wLp.frequency, t));

    // 비: HP 450 → LP(굵기에 따라 2.6k→6.5k). 빗방울 알갱이는 rainDrops로 따로(같은 층 게인 아래)
    n.rain = gain(0, ambBus);
    var rHp = filt('highpass', 450, 0.5), rLp = filt('lowpass', 2600, 0.5);
    B.connect(rHp); rHp.connect(rLp); rLp.connect(n.rain);
    n.rainLp = rLp;
    n.drops = gain(1, n.rain);

    // 모래바람: BP 3.6kHz(고음 사르르) + LP 200Hz(낮은 바람). 돌풍 흔들림 0.31/0.53Hz(서로 안 맞음 → 박자 없음)
    n.sand = gain(0, ambBus);
    var sMod = gain(1, n.sand), sBp = filt('bandpass', 3600, 0.9), sLp = filt('lowpass', 200, 0.7), sLow = gain(0.9, sMod);
    A.connect(sBp); sBp.connect(sMod); B.connect(sLp); sLp.connect(sLow);
    n.osc.push(lfo(0.31, 0.28, sMod.gain, t), lfo(0.53, 0.17, sMod.gain, t), lfo(0.23, 700, sBp.frequency, t));

    // 한낮 해: 아주 옅은 고음 아지랑이(BP 5.5kHz Q2) — 해 날씨에선 바람이 반으로 줄어 '고요하고 뜨거움'
    n.sun = gain(0, ambBus);
    var uBp = filt('bandpass', 5500, 2.0); B.connect(uBp); uBp.connect(n.sun);
    n.osc.push(lfo(0.17, 1200, uBp.frequency, t));

    // 해에 열려 있는 동안 '치이—'(HP 4kHz) + 무작위 탁탁(crackle)
    n.sizzle = gain(0, ambBus);
    var zHp = filt('highpass', 4200, 0.7); A.connect(zHp); zHp.connect(n.sizzle);
    n.crackle = gain(1, n.sizzle);

    // 모래에 열려 있는 동안 '사사삭'(BP 6.5kHz) — 모래 돌풍 흔들림을 같이 탄다
    n.grit = gain(0, ambBus);
    var gMod = gain(1, n.grit), gBp = filt('bandpass', 6500, 1.4); B.connect(gBp); gBp.connect(gMod);
    n.osc.push(lfo(0.37, 0.35, gMod.gain, t));

    A.start(t, 0); B.start(t, 1.9);
    return n;
  }

  function target(param, v, t, tc) {
    try { param.cancelScheduledValues(t); param.setTargetAtTime(v, t, tc); } catch (e) {}
  }
  function setIf(key, param, v, t, tc, eps) {
    if (applied[key] !== undefined && Math.abs(applied[key] - v) < (eps || 0.004)) return;
    applied[key] = v;
    target(param, v, t, tc);
  }

  // 상태 → 층별 목표 음량. 지금 날씨는 1.0, 예고 중 날씨는 PREVIEW_MAX × 진행도(도착 3초 전 0 → 도착 직전 0.5)
  function layerLevels() {
    var L = { wind: LV.wind, rain: 0, sand: 0, sun: 0, sizzle: 0, grit: 0 };
    var rainFull = LV.rainLo + (LV.rainHi - LV.rainLo) * st.heavy;
    if (st.now === 'rain') L.rain = rainFull;
    if (st.now === 'sand') L.sand = LV.sand;
    if (st.now === 'sun') { L.sun = LV.sun; L.wind = LV.wind * 0.5; }
    if (st.next && st.next !== st.now && st.pv > 0) {
      if (st.next === 'rain') L.rain = Math.max(L.rain, LV.rainPv * st.pv);
      if (st.next === 'sand') L.sand = Math.max(L.sand, LV.sand * st.pv);
      if (st.next === 'sun') L.sun = Math.max(L.sun, LV.sunPv * st.pv);
    }
    if (st.open && st.now === 'sun') L.sizzle = LV.sizzle;
    if (st.open && st.now === 'sand') L.grit = LV.grit;
    return L;
  }

  function apply(t, nowChanged) {
    if (!amb.on || !amb.nodes) return;
    var n = amb.nodes, L = layerLevels();
    var fast = 0.05, slow = 0.15;
    setIf('wind', n.wind.gain, L.wind, t, 0.3);
    setIf('rain', n.rain.gain, L.rain, t, nowChanged ? fast : slow);
    setIf('sand', n.sand.gain, L.sand, t, nowChanged ? fast : slow);
    setIf('sun', n.sun.gain, L.sun, t, nowChanged ? fast : slow);
    setIf('sizzle', n.sizzle.gain, L.sizzle, t, 0.03);
    setIf('grit', n.grit.gain, L.grit, t, 0.03);
    setIf('rainLp', n.rainLp.frequency, 2600 + 3900 * st.heavy, t, 0.15, 60);
  }

  // 무작위 알갱이(빗방울·꿀렁·탁탁)를 t ~ t+0.12초 앞까지 예약. 간격은 매번 무작위(지수 분포) → 박자가 생기지 않음
  function grains(t) {
    if (!amb.on || !amb.nodes || paused) return;
    var n = amb.nodes, until = t + 0.12, guard;
    // 빗방울: 비가 '지금'일 때만. 굵을수록 잦음(초당 8→34개)
    if (st.now === 'rain') {
      var rate = 8 + 26 * st.heavy;
      if (micro.drop < t) micro.drop = t + Math.random() * 0.05;
      for (guard = 0; micro.drop < until && guard < 12; guard++) {
        noise(micro.drop, rnd(0.005, 0.012), rnd(0.06, 0.16), 'bandpass', rnd(2200, 6000), 0, 1.6, 0.0008, n.drops);
        micro.drop += -Math.log(1 - Math.random() * 0.999) / rate;
      }
    } else micro.drop = 0;
    // 물 머금음 '꿀렁': 비 + 열림일 때. 물방울 소리처럼 sine이 위로 꿀떡(260~340Hz → 1.8배, 70ms), 0.18~0.6초 무작위 간격
    if (st.now === 'rain' && st.open) {
      if (micro.gulp < t) micro.gulp = t + rnd(0.05, 0.15);
      for (guard = 0; micro.gulp < until && guard < 4; guard++) {
        var f = rnd(260, 340);
        tone('sine', f, f * 1.8, micro.gulp, 0.07, 0.04 + 0.02 * st.heavy, 0.01);
        tone('sine', f * 0.5, f * 0.8, micro.gulp, 0.06, 0.025, 0.01);
        micro.gulp += rnd(0.18, 0.6) * (1.15 - 0.35 * st.heavy);
      }
    } else micro.gulp = 0;
    // 해 + 열림: '탁탁' 튀는 작은 클릭(초당 약 12개, 무작위)
    if (st.now === 'sun' && st.open) {
      if (micro.crackle < t) micro.crackle = t + Math.random() * 0.04;
      for (guard = 0; micro.crackle < until && guard < 6; guard++) {
        noise(micro.crackle, 0.003, rnd(0.2, 0.6), 'highpass', 3000, 0, 0.7, 0.0005, n.crackle);
        micro.crackle += -Math.log(1 - Math.random() * 0.999) / 12;
      }
    } else micro.crackle = 0;
  }

  var WEATHER = { clear: 1, rain: 1, sun: 1, sand: 1 };
  function update(s, t) {
    if (!s) return;
    var now = WEATHER[s.now] ? s.now : 'clear';
    var nowChanged = now !== st.now;
    st.now = now;
    st.heavy = clamp(+s.heavy || 0, 0, 1);
    st.open = !!s.open;
    st.next = WEATHER[s.next] ? s.next : null;
    var ni = +s.nextIn;
    // 예고: 도착 3초 전부터만(그보다 이르면 0). 0.05 단위로 끊어 매 프레임 AudioParam을 건드리지 않음
    st.pv = (st.next && ni >= 0 && ni <= PREVIEW_SEC) ? Math.round(PREVIEW_MAX * (1 - ni / PREVIEW_SEC) * 20) / 20 : 0;
    apply(t, nowChanged);
    grains(t);
  }

  function ambStart(t) {
    paused = false;
    if (amb.stopTimer) { clearTimeout(amb.stopTimer); amb.stopTimer = null; }
    if (!amb.on) {
      try { amb.nodes = buildAmbient(t); amb.on = true; } catch (e) { amb.on = false; amb.nodes = null; return; }
      applied = {}; micro = { drop: 0, gulp: 0, crackle: 0 };
    }
    target(ambBus.gain, AMB_VOL, t, 0.4);
    apply(t, true);
  }
  function killAmb(at) {
    var n = amb.nodes; amb.nodes = null; amb.on = false;
    if (!n) return;
    var all = n.src.concat(n.osc);
    for (var k = 0; k < all.length; k++) { try { all[k].stop(at); } catch (e) {} }
  }
  // 일시정지: 환경음을 약 0.25초에 0으로(예고 소리도 함께 사라짐 — 가려진 띠를 소리로 엿듣지 못하게)
  function ambPause(on, t) {
    paused = !!on;
    if (!amb.on) return;
    micro = { drop: 0, gulp: 0, crackle: 0 };
    target(ambBus.gain, paused ? 0 : AMB_VOL, t, paused ? 0.06 : 0.12);
  }
  function ambStop(t) {
    if (!amb.on) return;
    target(ambBus.gain, 0, t, 0.45);      // 약 1.5초에 걸쳐 사라짐
    st.open = false; micro = { drop: 0, gulp: 0, crackle: 0 };
    if (offline) return;
    if (amb.stopTimer) clearTimeout(amb.stopTimer);
    amb.stopTimer = setTimeout(function () {
      amb.stopTimer = null;
      try { killAmb(ctx.currentTime + 0.02); } catch (e) {}
    }, 2500);
  }

  try {
    document.addEventListener('visibilitychange', function () {
      if (!ctx || offline) return;
      try {
        if (document.hidden) { var p1 = ctx.suspend(); if (p1 && p1.catch) p1.catch(function () {}); }
        else { var p2 = ctx.resume(); if (p2 && p2.catch) p2.catch(function () {}); }
      } catch (e) {}
    });
  } catch (e) {}

  return {
    // 반드시 사용자 제스처 핸들러 안에서 호출. 여러 번 호출해도 안전.
    unlock: function () {
      if (!ensureCtx() || offline) return;
      try {
        if (ctx.state !== 'running') { var p = ctx.resume(); if (p && p.catch) p.catch(function () {}); }
        var b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
        s.buffer = b; s.connect(ctx.destination); s.start(0);
      } catch (e) {}
      if (amb.want && !amb.on) { try { ambStart(ctx.currentTime + 0.02); } catch (e) {} }
    },
    // name: button|open|close|grow|sting|scorch|wilt|dusk|result|record   opts: grow {cm}
    play: function (name, opts) {
      try {
        if (!ready() || !sfx.hasOwnProperty(name)) return;
        sfx[name](ctx.currentTime + 0.01, opts || {});
      } catch (e) {}
    },
    // 판 시작 때 환경음 시작(이미 켜져 있으면 무시). unlock 전에 불렸으면 unlock 때 시작
    startAmbient: function () {
      amb.want = true;
      try { if (running()) ambStart(ctx.currentTime + 0.02); } catch (e) {}
    },
    // 판 끝(해질녘·말라 쓰러짐·나가기) 때 환경음 정지(약 1.5초 페이드아웃)
    stopAmbient: function () {
      amb.want = false;
      try { if (ctx) ambStop(ctx.currentTime); } catch (e) {}
    },
    // 일시정지 화면을 띄울 때 true, "계속"을 눌러 다시 준비(띠가 보임)로 갈 때 false
    setPaused: function (on) {
      try { if (ctx) ambPause(on, ctx.currentTime); else paused = !!on; } catch (e) {}
    },
    // 매 프레임(또는 상태가 바뀔 때마다) 호출. 값이 바뀐 것만 반영하므로 가볍다.
    // { now:'clear'|'rain'|'sun'|'sand', heavy:0~1(비 굵기: 비 구간 진행도), next:다음 날씨|null, nextIn:다음 날씨까지 초, open:bool }
    update: function (s) {
      try { if (running() && amb.on) update(s, ctx.currentTime + 0.01); } catch (e) {}
    },
    setMuted: function (m) {
      muted = !!m;
      try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {}
      try {
        if (master) {
          var t = ctx.currentTime;
          master.gain.cancelScheduledValues(t);
          master.gain.setTargetAtTime(muted ? 0 : MASTER_VOL, t, 0.02);
        }
      } catch (e) {}
    },
    isMuted: function () { return muted; },
    // 공통 인터페이스 호환: 이 게임은 배경음악(박자 있는 곡)이 없다 → 환경음으로 대신
    startMusic: function () { this.startAmbient(); },
    stopMusic: function () { this.stopAmbient(); },
    // 테스트 전용: OfflineAudioContext에 그래프를 붙여 렌더 검사
    _test: {
      attach: function (c) {
        offline = true; paused = false; last = {}; ocPool = []; amb = { want: false, on: false, nodes: null, stopTimer: null };
        st = { now: 'clear', heavy: 0, next: null, pv: 0, open: false }; build(c);
      },
      playAt: function (name, t, opts) { if (sfx.hasOwnProperty(name)) sfx[name](t, opts || {}); },
      ambientAt: function (t) { ambStart(t); },
      stopAmbientAt: function (t) { ambStop(t); },
      pauseAt: function (on, t) { ambPause(on, t); },
      updateAt: function (s, t) { update(s, t); },
      sfxNames: function () { return Object.keys(sfx); },
      stats: function () { return { on: amb.on, applied: JSON.parse(JSON.stringify(applied)) }; }
    }
  };
})();
