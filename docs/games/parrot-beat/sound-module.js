/* ===== 박자 앵무새 (parrot-beat) Sound module =====
 * Web Audio API 실시간 합성. 외부 파일/의존성 없음. 오리지널 소리·패턴만 사용.
 * AudioContext 미지원·실패 시 모든 호출은 조용히 무시된다(게임은 소리 없이 계속 동작).
 *
 * 공통 API:  Sound.unlock() / play(name, opts) / setMuted(bool) / isMuted() / startMusic() / stopMusic()
 * 추가 API:  Sound.setVolume(0~1) / getVolume()
 * 리듬 API:  Sound.Beat  (박자 시계 + lookahead 스케줄러 + 판정용 시간 변환) — 아래 Beat 참고
 *
 * 그리드: 4/4, 한 마디 = 16스텝(16분음표). stepInBar 0,4,8,12 = 정박(1·2·3·4박), 2,6,10,14 = 8분 엇박(앤),
 *         1,3,5,… = 16분 엇박.
 * 시간 단위는 모두 AudioContext 초(ctx.currentTime 기준). 콜백은 소리보다 약 0.03~0.15초 먼저 호출된다(예약 시점).
 */
const Sound = (function () {
  'use strict';
  var MUTE_KEY = 'parrot-beat-muted';
  var OFFSET_KEY = 'parrot-beat-offset';   // 사용자 보정값(ms), 선택 기능
  var MASTER_VOL = 0.8;
  var MUSIC_VOL = 0.55;      // 반주(메트로놈·베이스·코드·하이햇) 버스
  var LOOKAHEAD = 0.12;      // 스케줄러가 미리 예약하는 구간(초)
  var TICK_MS = 25;          // 스케줄러 깨어나는 주기(ms)
  var COMP_DELAY = 0.006;    // DynamicsCompressor 룩어헤드(Chromium 6ms). 예약음만 이 경로를 지난다

  var ctx = null, offline = false;
  var master = null, comp = null, shaper = null, musicBus = null, clockBus = null, teacherBus = null,
      sfxBus = null, tapBus = null, noiseBuf = null;
  var muted = false, volume = 1, warmed = false;
  var last = {};
  var userOffset = 0;        // 초
  var userPaused = false;

  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { muted = false; }
  try { userOffset = (parseFloat(localStorage.getItem(OFFSET_KEY)) || 0) / 1000; } catch (e) { userOffset = 0; }
  if (!(userOffset >= -0.08 && userOffset <= 0.4)) userOffset = 0;   // design.md 범위 −80~+400ms

  // ---------- 그래프 ----------
  // [musicBus,teacherBus,sfxBus] → clockBus/compressor → master → soft-clip shaper → destination
  // [tapBus] ─────────────────────────────────────────→ master   (탭은 컴프레서 룩어헤드 지연을 피함)
  function build(c) {
    ctx = c;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOL * volume;

    // 소프트 클리퍼(지연 없음): 입력을 0.5배로 받아 ±2.0까지 처리, ±0.6까지는 선형, 이후 0.95로 부드럽게 수렴
    shaper = ctx.createWaveShaper();
    var n = 2048, curve = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var u = (i / (n - 1)) * 4 - 2, a = Math.abs(u);
      var y = a < 0.6 ? a : 0.6 + 0.35 * Math.tanh((a - 0.6) / 0.35);
      curve[i] = u < 0 ? -y : y;
    }
    shaper.curve = curve;
    shaper.oversample = 'none';
    var pre = ctx.createGain(); pre.gain.value = 0.5;
    var post = ctx.createGain(); post.gain.value = 1; // shaper 출력은 원 레벨 그대로(곡선이 2배 영역을 표현)
    master.connect(pre); pre.connect(shaper); shaper.connect(post); post.connect(ctx.destination);

    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 6;
    comp.attack.value = 0.003; comp.release.value = 0.18;
    comp.connect(master);

    clockBus = ctx.createGain(); clockBus.gain.value = 1; clockBus.connect(comp); // 정지 시 예약음 컷용
    musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_VOL; musicBus.connect(clockBus);
    teacherBus = ctx.createGain(); teacherBus.gain.value = 1; teacherBus.connect(clockBus);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(comp);
    tapBus = ctx.createGain(); tapBus.gain.value = 1; tapBus.connect(master);

    var len = Math.floor(ctx.sampleRate * 0.6);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0), seed = 12345;
    for (var j = 0; j < len; j++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[j] = seed / 0x3fffffff - 1; }
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
  function throttled(name, t, gap) {
    if (last[name] !== undefined && t - last[name] < gap && t >= last[name]) return true;
    last[name] = t; return false;
  }

  // ---------- 합성 기본 블록 ----------
  // 음: 파형, 주파수 f0→f1(glide초 동안), 시작, 길이, 피크, 어택, 출력
  function tone(type, f0, f1, t, dur, vol, attack, dest, glide) {
    try {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + (glide || dur));
      var a = attack || 0.002;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || sfxBus);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }
  function noise(t, dur, vol, ftype, freq, q, dest, freqEnd) {
    try {
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf;
      f.type = ftype; f.frequency.setValueAtTime(freq, t);
      if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
      if (q) f.Q.value = q;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest || sfxBus);
      s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
    } catch (e) {}
  }
  // 새 지저귐: 위로 갔다 내려오는 짧은 글라이드 (앵무새 캐릭터 소리)
  function chirp(t, f0, fPeak, fEnd, dur, vol, dest) {
    try {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(fPeak, t + dur * 0.4);
      o.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
      g.gain.setValueAtTime(vol, t + dur * 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || sfxBus);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }

  // 음이름 (C 메이저)
  var N = { F2: 87.31, G2: 98.0, A2: 110.0, C3: 130.81, G3: 196.0, A3: 220.0, B3: 246.94,
            C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0,
            C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0,
            C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, A6: 1760.0, C7: 2093.0, G7: 3135.96 };

  // ---------- 효과음 ----------
  var sfx = {
    // 선생님 북 (부르기 마디). 낮고 둥근 손북 '둥'. opts.accent=true면 조금 크고 높게
    teacher: function (t, o) {
      var ac = o && o.accent, k = ac ? 1.12 : 1, v = ac ? 1.15 : 1;
      tone('sine', 250 * k, 150 * k, t, 0.17, 0.50 * v, 0.001, teacherBus, 0.06);
      tone('triangle', 500 * k, 290 * k, t, 0.05, 0.10 * v, 0.001, teacherBus, 0.03);
      noise(t, 0.022, 0.14 * v, 'lowpass', 1800, 0.7, teacherBus);
    },
    // 내 탭 (따라하기). 밝은 나무토막 '톡' — 선생님 북보다 높고 짧다. 탭 즉시 재생
    // opts.soft=true → 절반 크기(부르기·카운트인·전환 마디의 연습 탭용)
    tap: function (t, o) {
      if (throttled('tap', t, 0.025)) return;
      var v = o && o.soft ? 0.5 : 1;
      tone('sine', 760, 700, t, 0.07, 0.36 * v, 0.001, tapBus, 0.02);
      tone('sine', 1820, 1700, t, 0.035, 0.10 * v, 0.001, tapBus, 0.02);
      noise(t, 0.012, 0.20 * v, 'bandpass', 2400, 1.4, tapBus);
    },
    // 판정: 탭 소리 위에 살짝 얹는 작은 반짝(리듬을 가리지 않게 아주 작고 짧게)
    perfect: function (t) {
      if (throttled('judge', t, 0.03)) return;
      tone('sine', N.C7, 0, t + 0.01, 0.06, 0.05, 0.002);
      tone('sine', N.G7, 0, t + 0.03, 0.05, 0.025, 0.002);
    },
    good: function (t) {
      if (throttled('judge', t, 0.03)) return;
      tone('sine', N.G6, 0, t + 0.01, 0.045, 0.035, 0.002);
    },
    // 놓침(쳐야 할 박을 안 침): 둔하고 낮은 '뚝'
    miss: function (t) {
      if (throttled('miss', t, 0.06)) return;
      tone('triangle', 160, 105, t, 0.12, 0.12, 0.004);
      noise(t, 0.05, 0.04, 'lowpass', 500, 0.7);
    },
    // 헛박(칠 곳이 아닌데 침): 탭 소리 뒤에 붙는 막힌 '퍽'
    extra: function (t) {
      if (throttled('extra', t, 0.06)) return;
      noise(t + 0.01, 0.06, 0.08, 'lowpass', 700, 0.7, sfxBus, 250);
      tone('sine', 110, 80, t + 0.01, 0.08, 0.10, 0.003);
    },
    // 하트 회복(단계 무실패 +1): 부드러운 상승 2음
    heartGain: function (t) {
      tone('triangle', N.C5, 0, t, 0.10, 0.11, 0.004);
      tone('triangle', N.G5, 0, t + 0.10, 0.22, 0.12, 0.004);
      tone('sine', N.G6, 0, t + 0.12, 0.18, 0.025, 0.004);
    },
    // 결과 화면 새 기록: 작은 반짝 상승 + 지저귐
    newBest: function (t) {
      var arp = [N.G5, N.C6, N.E6, N.G6];
      for (var i = 0; i < arp.length; i++) tone('sine', arp[i], 0, t + i * 0.07, 0.16, 0.08, 0.003);
      chirp(t + 0.30, 1800, 3000, 2400, 0.12, 0.05);
      noise(t + 0.25, 0.3, 0.012, 'highpass', 7500);
    },
    // 한 마디를 전부 맞힘: 앵무새 기쁜 지저귐 2번
    phraseClear: function (t) {
      chirp(t, 1500, 2500, 2000, 0.09, 0.07);
      chirp(t + 0.11, 1700, 2900, 2300, 0.10, 0.07);
    },
    // 콤보 단계 도달. opts.level = 1,2,3… (단계마다 시작음이 한 칸씩 올라감)
    combo: function (t, o) {
      var lv = Math.max(1, Math.min(5, Math.floor(+(o && o.level)) || 1));
      var base = [N.C5, N.D5, N.E5, N.G5, N.A5][lv - 1];
      tone('triangle', base, 0, t, 0.07, 0.08, 0.003);
      tone('triangle', base * 1.25, 0, t + 0.06, 0.07, 0.08, 0.003);
      tone('triangle', base * 1.5, 0, t + 0.12, 0.20, 0.11, 0.003);
      tone('sine', base * 3, 0, t + 0.12, 0.15, 0.02, 0.003);
    },
    // 단계 상승(템포 오름): 상승 아르페지오 + 반짝. 마디 첫 박에 맞춰 Beat.schedule 권장
    levelUp: function (t) {
      var arp = [N.C5, N.E5, N.G5, N.C6];
      for (var i = 0; i < arp.length; i++) tone('triangle', arp[i], 0, t + i * 0.06, 0.14, 0.12, 0.003);
      tone('sine', N.E6, 0, t + 0.24, 0.30, 0.04, 0.005);
      chirp(t + 0.26, 1600, 2700, 2200, 0.12, 0.05);
      noise(t + 0.22, 0.25, 0.015, 'highpass', 7000);
    },
    // 하트 잃음: 부드러운 하강 2음 + 낮은 '툭'
    heartLost: function (t) {
      if (throttled('heartLost', t, 0.3)) return;
      tone('triangle', N.E5, 0, t, 0.12, 0.13, 0.004);
      tone('triangle', N.C5, 0, t + 0.12, 0.22, 0.13, 0.004);
      tone('sine', 120, 80, t, 0.15, 0.12, 0.004);
    },
    // 게임 오버: 느린 하강 3음 + 저음 (반주는 Developer가 stopMusic/Beat.stop으로 멈춤)
    gameOver: function (t) {
      tone('triangle', N.G4, 0, t, 0.30, 0.15, 0.01);
      tone('triangle', N.E4, 0, t + 0.28, 0.30, 0.15, 0.01);
      tone('triangle', N.C4, 0, t + 0.56, 0.70, 0.15, 0.01);
      tone('sine', N.C3, 0, t + 0.56, 0.80, 0.14, 0.02);
      chirp(t + 0.95, 1400, 1500, 900, 0.25, 0.03); // 기운 빠진 '삐우…'
    },
    // 클리어(최종 단계 통과): 팡파르 + 앵무새 지저귐
    clear: function (t) {
      tone('square', N.C5, 0, t, 0.09, 0.05);
      tone('square', N.E5, 0, t + 0.10, 0.09, 0.05);
      tone('square', N.G5, 0, t + 0.20, 0.09, 0.05);
      tone('triangle', N.C6, 0, t + 0.30, 0.70, 0.18, 0.01);
      tone('triangle', N.G5, 0, t + 0.30, 0.70, 0.10, 0.01);
      tone('triangle', N.E5, 0, t + 0.30, 0.70, 0.08, 0.01);
      tone('sine', N.C3, 0, t + 0.30, 0.70, 0.12, 0.01);
      chirp(t + 0.45, 1500, 2600, 2100, 0.10, 0.06);
      chirp(t + 0.58, 1800, 3000, 2400, 0.10, 0.06);
      chirp(t + 0.71, 2000, 3300, 2600, 0.14, 0.06);
      noise(t + 0.30, 0.5, 0.02, 'highpass', 7000);
    },
    // 카운트인 막대 '딱'. opts.n = 1~4 (4는 조금 높게: "이제 시작")
    count: function (t, o) {
      var n = (o && o.n) || 1, f = n >= 4 ? 2000 : 1500;
      tone('sine', f, f * 0.85, t, 0.04, 0.12, 0.001, musicBus);
      noise(t, 0.015, 0.10, 'bandpass', 3500, 1.5, musicBus);
    },
    start: function (t) {
      chirp(t, 1400, 2400, 1900, 0.09, 0.07);
      tone('triangle', N.C5, 0, t + 0.10, 0.10, 0.12, 0.004);
      tone('triangle', N.G5, 0, t + 0.20, 0.20, 0.12, 0.004);
    },
    button: function (t) { if (!throttled('button', t, 0.05)) tone('sine', 880, 660, t, 0.05, 0.06, 0.002); },
    pause: function (t) { tone('sine', N.A4, N.E4, t, 0.12, 0.09); },
    resume: function (t) { tone('sine', N.E4, N.A4, t, 0.12, 0.09); }
  };

  sfx.stray = sfx.extra;   // design.md 용어(헛박 = stray) 별칭

  // ---------- 반주 ----------
  // 진행: '부르기' 마디마다 다음 코드 (C → Am → F → G 순환). '따라하기' 마디는 직전 코드 유지.
  var CHORDS = [
    { bass: N.C3, notes: [N.C4, N.E4, N.G4] },
    { bass: N.A2, notes: [N.A3, N.C4, N.E4] },
    { bass: N.F2, notes: [N.A3, N.C4, N.F4] },
    { bass: N.G2, notes: [N.B3, N.D4, N.G4] }
  ];
  var music = { on: false, chordIdx: -1, hat16: false, fadeTimer: null };

  function bass(f, t, dur, vol) {
    tone('sine', f, 0, t, dur, vol, 0.008, musicBus);
    tone('triangle', f * 2, 0, t, dur * 0.6, vol * 0.25, 0.008, musicBus); // 작은 스피커에서도 들리게 2배음
  }
  function chord(ch, t, dur, vol) {
    for (var i = 0; i < ch.notes.length; i++) tone('triangle', ch.notes[i], 0, t, dur, vol, 0.012, musicBus);
  }
  function metro(t, strong) {
    if (strong) { tone('sine', 1320, 1250, t, 0.035, 0.13, 0.001, musicBus); noise(t, 0.008, 0.05, 'highpass', 5000, 0.7, musicBus); }
    else tone('sine', 990, 950, t, 0.025, 0.065, 0.001, musicBus);
  }
  function hat(t, vol) { noise(t, 0.028, vol, 'highpass', 7500, 0.7, musicBus); }

  // stepInfo마다 1번 호출 (예약 시점)
  function backing(si) {
    if (!music.on || si.late) return;
    var t = si.time, s = si.stepInBar, ph = si.phase, beatDur = si.stepDur * 4;
    if (ph === 'silent') return;
    if (ph === 'countin') {                            // 막대 4번만: 딱 딱 딱 딱(4번째 높게)
      if (s % 4 === 0) sfx.count(t, { n: s / 4 + 1 });
      return;
    }
    if (s === 0 && ph === 'call') music.chordIdx = (music.chordIdx + 1) % CHORDS.length;
    var ch = CHORDS[Math.max(0, music.chordIdx)];
    if (ph === 'transition') ph = 'rest';            // 단계 전환 마디 = 쉬는 마디 반주(C 코드, 부르기 없음)
    if (ph === 'rest') ch = CHORDS[0];

    // 메트로놈: 1박 강, 2·3·4박 약. 따라하기 마디 1박은 '네 차례' 지저귐으로 대체(+약한 틱)
    if (s === 0 && ph === 'response') {
      chirp(t, 1200, 1900, 1750, 0.08, 0.10, musicBus);
      metro(t, false);
    } else if (s % 4 === 0) metro(t, s === 0);

    // 하이햇: 8분 엇박(앤)에 은은하게. hat16 켜면 16분 엇박에 더 작게
    if (s % 4 === 2) hat(t, 0.07);
    else if (music.hat16 && s % 2 === 1) hat(t, 0.025);

    // 베이스: 1박(모든 마디), 3박(부르기·쉬는 마디)
    if (s === 0) bass(ch.bass, t, beatDur * 1.6, 0.42);
    if (s === 8 && ph !== 'response') bass(ch.bass, t, beatDur * 1.4, 0.30);

    // 코드: 부르기 마디만(풍성) — 따라하기 마디는 비워서 내 탭이 잘 들리게
    if (ph === 'call' || ph === 'rest') {
      if (s === 0) chord(ch, t, beatDur * 1.8, 0.06);
      if (s === 8) chord(ch, t, beatDur * 1.4, 0.04);
    }
  }

  // ---------- 박자 시계 ----------
  var clk = { running: false, bpm: 100, pendingBpm: 0, stepDur: 60 / 100 / 4, step: 0, bar: 0, barTime: 0,
              nextTime: 0, timer: null, curBar: null, bars: [], plan: {}, stepCbs: [], barCbs: [] };

  function makeBar(barIndex, time) {
    if (clk.pendingBpm) { clk.bpm = clk.pendingBpm; clk.stepDur = 60 / clk.bpm / 4; clk.pendingBpm = 0; }
    var info = { bar: barIndex, time: time, bpm: clk.bpm, stepDur: clk.stepDur, beatDur: clk.stepDur * 4,
                 barDur: clk.stepDur * 16, phase: clk.plan[barIndex] || 'rest' };
    delete clk.plan[barIndex];
    for (var i = 0; i < clk.barCbs.length; i++) {
      try { var r = clk.barCbs[i](info); if (typeof r === 'string') info.phase = r; } catch (e) { reportErr(e); }
    }
    clk.bars.push(info);
    if (clk.bars.length > 16) clk.bars.shift();
    return info;
  }
  function reportErr(e) { try { setTimeout(function () { throw e; }, 0); } catch (e2) {} }

  function pump(horizon) {
    var nowT = ctx.currentTime;
    while (clk.running && clk.nextTime < horizon) {
      var s = clk.step % 16;
      if (s === 0) { clk.curBar = makeBar(clk.bar, clk.nextTime); clk.barTime = clk.nextTime; }
      var b = clk.curBar;
      var t = b.time + s * b.stepDur;                 // 마디 시작 기준으로 계산(누적 오차 없음)
      var si = { step: clk.step, bar: b.bar, stepInBar: s, beatInBar: s >> 2, sub: s & 3,
                 isBeat: (s & 3) === 0, isOffbeat8: (s & 3) === 2, time: t, stepDur: b.stepDur,
                 bpm: b.bpm, phase: b.phase, barTime: b.time, late: !offline && t < nowT - 0.01 };
      backing(si);
      for (var i = 0; i < clk.stepCbs.length; i++) { try { clk.stepCbs[i](si); } catch (e) { reportErr(e); } }
      clk.step++;
      if (clk.step % 16 === 0) clk.bar++;
      clk.nextTime = b.time + (s + 1) * b.stepDur;
    }
  }
  function tick() {
    clk.timer = null;
    if (!clk.running || !ctx) return;
    try { if (ctx.state === 'running') pump(ctx.currentTime + LOOKAHEAD); } catch (e) { reportErr(e); }
    if (clk.running && !offline) clk.timer = setTimeout(tick, TICK_MS);
  }

  // 지금 귀에 들리고 있는 오디오의 ctx 시간 (perfMs = performance.now() 기준 ms, 생략 시 지금)
  function heardAt(perfMs) {
    if (!ctx) return 0;
    var pnow = (window.performance && performance.now) ? performance.now() : Date.now();
    if (perfMs === undefined || !isFinite(perfMs) || Math.abs(perfMs - pnow) > 1000) perfMs = pnow;
    var cur = ctx.currentTime;
    try {
      if (ctx.state === 'running' && ctx.getOutputTimestamp) {
        var ts = ctx.getOutputTimestamp();
        if (ts && ts.performanceTime > 0 && ts.contextTime > 0) {
          var h = ts.contextTime + (perfMs - ts.performanceTime) / 1000;
          if (h <= cur + 0.05 && h > cur - 0.5) return h;
        }
      }
    } catch (e) {}
    return cur - ((ctx.outputLatency || 0) || (ctx.baseLatency || 0)) - (pnow - perfMs) / 1000;
  }

  function positionAt(t) {
    var b = null;
    for (var i = clk.bars.length - 1; i >= 0; i--) if (clk.bars[i].time <= t) { b = clk.bars[i]; break; }
    if (!b) b = clk.bars[0];
    if (!b) return null;
    var stepF = (t - b.time) / b.stepDur;
    return { bar: b.bar, phase: b.phase, bpm: b.bpm, barTime: b.time, stepDur: b.stepDur,
             stepF: stepF, beatF: stepF / 4, barF: b.bar + stepF / 16 };
  }

  var Beat = {
    // 박자 시계 시작. bpm, opts.delay(첫 마디까지 초, 기본 0.1), opts.phases({마디번호: phase})
    start: function (bpm, opts) {
      if (!ctx || !running()) return false;
      Beat.stop(true);
      opts = opts || {};
      clk.bpm = Math.max(40, Math.min(240, +bpm || 100)); clk.stepDur = 60 / clk.bpm / 4; clk.pendingBpm = 0;
      clk.step = 0; clk.bar = 0; clk.bars = []; clk.curBar = null;
      clk.plan = {};
      if (opts.phases) for (var k in opts.phases) clk.plan[k] = opts.phases[k];
      music.chordIdx = -1;
      clk.nextTime = ctx.currentTime + Math.max(0.05, opts.delay === undefined ? 0.1 : +opts.delay);
      clk.running = true;
      try { clockBus.gain.cancelScheduledValues(ctx.currentTime); clockBus.gain.setValueAtTime(1, ctx.currentTime); } catch (e) {}
      if (!offline) tick();
      return true;
    },
    // 정지. 이미 예약된(최대 ~0.12초) 반주·선생님 북은 40ms 페이드로 끊는다
    stop: function (keepSound) {
      clk.running = false;
      if (clk.timer) { clearTimeout(clk.timer); clk.timer = null; }
      if (!keepSound && ctx && clockBus) {
        try {
          var t = ctx.currentTime;
          clockBus.gain.cancelScheduledValues(t);
          clockBus.gain.setValueAtTime(clockBus.gain.value, t);
          clockBus.gain.linearRampToValueAtTime(0, t + 0.04);
          clockBus.gain.setValueAtTime(1, t + LOOKAHEAD + 0.1);
        } catch (e) {}
      }
    },
    isRunning: function () { return clk.running; },
    // 템포 변경: 다음 마디 첫 박부터 적용(마디 중간에 바뀌지 않음)
    setBpm: function (bpm) { bpm = +bpm; if (bpm >= 40 && bpm <= 240) { if (clk.running) clk.pendingBpm = bpm; else { clk.bpm = bpm; clk.stepDur = 60 / bpm / 4; } } },
    getBpm: function () { return clk.bpm; },
    // 특정 마디의 phase 예약: 'call' | 'response' | 'countin' | 'transition' | 'rest' | 'silent'
    planPhase: function (bar, phase) { clk.plan[bar] = phase; },
    // 콜백 등록. 반환값은 해제 함수. onBar 콜백이 문자열을 반환하면 그 마디의 phase가 된다
    onStep: function (fn) { clk.stepCbs.push(fn); return function () { var i = clk.stepCbs.indexOf(fn); if (i >= 0) clk.stepCbs.splice(i, 1); }; },
    onBar: function (fn) { clk.barCbs.push(fn); return function () { var i = clk.barCbs.indexOf(fn); if (i >= 0) clk.barCbs.splice(i, 1); }; },
    // 정확한 시각에 효과음 예약 (이미 지난 시각이면 즉시). 반환: 실제 예약 시각
    schedule: function (time, name, opts) {
      try {
        if (!ready() || !sfx[name]) return -1;
        var t = Math.max(+time || 0, ctx.currentTime);
        sfx[name](t, opts || {});
        return t;
      } catch (e) { return -1; }
    },
    // 한 마디 안의 스텝 목록으로 선생님 북 예약. barInfo = onBar/onStep의 info. 반환: 각 음의 ctx 시각 배열
    playPattern: function (barInfo, steps, name) {
      var out = [];
      if (!barInfo || !steps) return out;
      for (var i = 0; i < steps.length; i++) {
        var t = barInfo.time + steps[i] * barInfo.stepDur;
        out.push(t);
        Beat.schedule(t, name || 'teacher', { accent: steps[i] === 0 });
      }
      return out;
    },
    // 마디 시작 시각 (이미 예약된 마디는 정확, 미래 마디는 현재 템포로 추정)
    barTime: function (bar) {
      for (var i = clk.bars.length - 1; i >= 0; i--) if (clk.bars[i].bar === bar) return clk.bars[i].time;
      var lb = clk.bars[clk.bars.length - 1];
      if (!lb) return clk.nextTime;
      var sd = 60 / (clk.pendingBpm || clk.bpm) / 4;
      return lb.time + lb.barDur + (bar - lb.bar - 1) * 16 * sd;
    },
    ctxTime: function () { return ctx ? ctx.currentTime : 0; },
    // 지금 들리는 소리의 ctx 시각. 화면 연출(박자에 맞춰 까딱이기 등)은 rAF에서 이 값을 쓴다
    heardTime: function () { return heardAt(); },
    // 탭 판정용 시각: 이벤트(pointerdown/keydown)의 timeStamp를 '그때 들리던 소리'의 시각으로 바꾼 값.
    // 컴프레서 지연과 사용자 보정값을 이미 뺐으므로 info.time(예약 시각)과 바로 비교하면 된다.
    tapTime: function (evt) {
      if (!ctx) return 0;
      var ts = evt && typeof evt.timeStamp === 'number' && evt.timeStamp > 0 ? evt.timeStamp : undefined;
      return heardAt(ts) - COMP_DELAY - userOffset;
    },
    // 시각 → 박 위치 {bar, phase, stepF(마디 안 0~16), beatF(0~4), barF, bpm}. t 생략 시 heardTime
    now: function (t) { return positionAt(t === undefined ? heardAt() : t); },
    latency: function () {
      if (!ctx) return { base: 0, output: 0, comp: COMP_DELAY, offset: userOffset };
      return { base: ctx.baseLatency || 0, output: ctx.outputLatency || 0, comp: COMP_DELAY, offset: userOffset,
               hasOutputTimestamp: !!ctx.getOutputTimestamp, sampleRate: ctx.sampleRate };
    },
    // 사용자 보정(ms, −80~+400 정수, design.md). +면 '소리가 늦게 들림(블루투스 등)' → 탭 시각에서 뺀다. localStorage 저장
    setOffset: function (ms) { ms = Math.round(+ms || 0); if (ms < -80) ms = -80; if (ms > 400) ms = 400; userOffset = ms / 1000; try { localStorage.setItem(OFFSET_KEY, String(ms)); } catch (e) {} },
    getOffset: function () { return userOffset * 1000; },
    // 일시정지 버튼용: 오디오 시계 자체를 멈춘다(박자·예약음이 그대로 얼어붙고 resume 시 이어짐)
    pause: function () { userPaused = true; if (ctx) try { var p = ctx.suspend(); if (p && p.catch) p.catch(function () {}); } catch (e) {} },
    resume: function () { userPaused = false; if (ctx) try { var p = ctx.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) {} },
    isPaused: function () { return userPaused; },
    // 반주 옵션: { hat16: true } → 16분 엇박에 아주 작은 하이햇 (16분 패턴이 나오는 단계용)
    setBacking: function (o) { if (o && 'hat16' in o) music.hat16 = !!o.hat16; }
  };

  // ---------- 탭 전환 ----------
  try {
    document.addEventListener('visibilitychange', function () {
      if (!ctx || offline) return;
      try {
        if (document.hidden) { var p1 = ctx.suspend(); if (p1 && p1.catch) p1.catch(function () {}); }
        else if (!userPaused) { var p2 = ctx.resume(); if (p2 && p2.catch) p2.catch(function () {}); }
      } catch (e) {}
    });
  } catch (e) {}

  return {
    // 사용자 제스처(pointerdown/touchend/click/keydown) 안에서 호출. 여러 번 호출해도 안전
    unlock: function () {
      if (!ensureCtx() || offline) return;
      try {
        if (ctx.state !== 'running' && !userPaused) { var p = ctx.resume(); if (p && p.catch) p.catch(function () {}); }
        var b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();   // iOS 무음 버퍼
        s.buffer = b; s.connect(ctx.destination); s.start(0);
        if (!warmed) {                                                          // 첫 탭 소리 초기화 지연 제거
          warmed = true;
          var o = ctx.createOscillator(), g = ctx.createGain();
          g.gain.value = 0; o.connect(g); g.connect(tapBus); o.start(); o.stop(ctx.currentTime + 0.05);
        }
      } catch (e) {}
    },
    // 즉시 재생. name: teacher|tap|perfect|good|miss|extra(=stray)|heartGain|newBest|phraseClear|combo|levelUp|heartLost|gameOver|clear|count|start|button|pause|resume
    play: function (name, opts) {
      try { if (ready() && sfx[name]) sfx[name](ctx.currentTime, opts || {}); } catch (e) {}
    },
    setMuted: function (m) {
      muted = !!m;
      try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {}
      try { if (master) { var t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(muted ? 0 : MASTER_VOL * volume, t, 0.02); } } catch (e) {}
    },
    isMuted: function () { return muted; },
    setVolume: function (v) {
      v = +v; if (!(v >= 0)) v = 0; if (v > 1) v = 1; volume = v;
      try { if (master && !muted) { var t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(MASTER_VOL * volume, t, 0.02); } } catch (e) {}
    },
    getVolume: function () { return volume; },
    // 반주 켜기. 시계가 멈춰 있으면 opts.bpm(기본 현재 bpm)으로 시계도 시작
    startMusic: function (opts) {
      if (music.fadeTimer) { clearTimeout(music.fadeTimer); music.fadeTimer = null; }
      try { if (musicBus) { musicBus.gain.cancelScheduledValues(ctx.currentTime); musicBus.gain.setValueAtTime(MUSIC_VOL, ctx.currentTime); } } catch (e) {}
      music.on = true;
      if (!clk.running && ctx) Beat.start((opts && opts.bpm) || clk.bpm, opts);
    },
    // 반주 끄기(시계는 계속 — 판정·선생님 북은 유지). fadeSec 주면 그동안 페이드아웃(게임 오버 0.8초).
    // 전부 멈추려면 이어서 Sound.Beat.stop()
    stopMusic: function (fadeSec) {
      if (music.fadeTimer) { clearTimeout(music.fadeTimer); music.fadeTimer = null; }
      var f = +fadeSec;
      if (!(f > 0) || !ctx || offline) { music.on = false; return; }
      try {
        var t = ctx.currentTime;
        musicBus.gain.cancelScheduledValues(t);
        musicBus.gain.setValueAtTime(musicBus.gain.value, t);
        musicBus.gain.linearRampToValueAtTime(0.0001, t + f);
      } catch (e) {}
      music.fadeTimer = setTimeout(function () {
        music.fadeTimer = null; music.on = false;
        try { musicBus.gain.cancelScheduledValues(ctx.currentTime); musicBus.gain.setValueAtTime(0, ctx.currentTime);
              musicBus.gain.setValueAtTime(MUSIC_VOL, ctx.currentTime + LOOKAHEAD + 0.1); } catch (e) {}
      }, f * 1000);
    },
    Beat: Beat,
    // 테스트 전용: OfflineAudioContext에 그래프를 붙이고 스케줄러를 수동으로 돌린다
    _test: {
      attach: function (c) { offline = true; last = {}; build(c); },
      pump: function (until) { pump(until); },
      sfxNames: function () { return Object.keys(sfx); }
    }
  };
})();
