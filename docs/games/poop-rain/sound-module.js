/* ===== 똥비 피하기 (poop-rain) Sound module =====
 * Web Audio API 실시간 합성. 외부 파일/의존성 없음.
 * AudioContext 미지원·실패·잠김·음소거 상태에서는 모든 호출이 조용히 무시된다.
 * 사용법: 시작 버튼 등 사용자 제스처 핸들러 안에서 Sound.unlock() → Sound.play('start') 등.
 * 위치 패닝(선택): opts.x 0~1 (화면 왼쪽 0 ~ 오른쪽 1). 없으면 가운데.
 * 스로틀: 같은 소리는 최소 간격 안에 다시 호출되면 무시.
 * BGM 템포: Sound.setTempo(배율 1.0~1.4) 또는 Sound.startMusic({ tempo: 1.0 }).
 */
const Sound = (function () {
  'use strict';
  var MUTE_KEY = 'poop-rain-muted';
  var MASTER_VOL = 0.5;   // 효과음 전체
  var MUSIC_VOL = 0.05;   // 배경음악 (낮게)
  var PAN = 0.5;          // opts.x 패닝 폭 (±0.5)
  var BASE_BPM = 120, TEMPO_MIN = 1.0, TEMPO_MAX = 1.4;

  var ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
  var out = null;         // 현재 재생 중인 효과음의 출력 (패너 또는 sfxBus)
  var muted = false;
  var last = {};          // 이름별 마지막 재생 시각
  var music = { on: false, timer: null, step: 0, nextTime: 0, tempo: 1 };

  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { muted = false; }

  function ensureCtx() {
    if (ctx) return ctx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e1) { ctx = new AC(); }
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER_VOL;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 1;
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = MUSIC_VOL;
      musicBus.connect(master);
      var len = Math.floor(ctx.sampleRate * 0.8);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
    return ctx;
  }

  function ready() { return ctx && ctx.state === 'running' && !muted; }

  // opts.x(0~1) → 일회용 패너. 미지원이면 sfxBus
  function outFor(opts) {
    var x = opts && +opts.x;
    if (!(x >= 0 && x <= 1)) return sfxBus;
    try {
      if (!ctx.createStereoPanner) return sfxBus;
      var p = ctx.createStereoPanner();
      p.pan.value = (x * 2 - 1) * PAN;
      p.connect(sfxBus);
      // 짧은 효과음용: 2초 뒤 연결 해제 (GC)
      setTimeout(function () { try { p.disconnect(); } catch (e) {} }, 2000);
      return p;
    } catch (e) { return sfxBus; }
  }

  function throttled(key, t, gap) {
    if (last[key] !== undefined && t - last[key] < gap) return true;
    last[key] = t;
    return false;
  }

  // 기본 음: 파형, 주파수(시작→끝), 시작시각, 길이, 피크, 어택, 출력
  function tone(type, f0, f1, t, dur, vol, attack, dest) {
    try {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      var a = attack || 0.004;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || out || sfxBus);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }

  // 빠른 스윕: sweepDur 안에 f0→f1 이동, 이후 유지하며 감쇠
  function sweep(type, f0, f1, t, sweepDur, dur, vol, attack) {
    try {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + sweepDur);
      var a = attack || 0.003;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(out || sfxBus);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }

  // 비브라토가 걸린 슬라이드 (코믹한 '뿌우~', '띠요옹')
  function wobble(type, f0, f1, t, dur, vol, rate, depth, attack) {
    try {
      var o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      lfo.frequency.value = rate; lg.gain.value = depth;
      lfo.connect(lg); lg.connect(o.frequency);
      var a = attack || 0.01;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + a);
      g.gain.setValueAtTime(vol, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(out || sfxBus);
      o.start(t); lfo.start(t); o.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02);
    } catch (e) {}
  }

  // 필터 노이즈
  function noise(t, dur, vol, filterType, freq, freqEnd, q, attack, dest) {
    try {
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf;
      f.type = filterType; f.frequency.setValueAtTime(freq, t);
      if (q) f.Q.value = q;
      if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
      var a = attack || 0.003;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest || out || sfxBus);
      s.start(t, Math.random() * 0.2); s.stop(t + dur + 0.02);
    } catch (e) {}
  }

  // 음이름 (C 메이저)
  var N = { G2: 98.0, A2: 110.0, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
            C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
            C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77,
            C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98 };

  // 아슬아슬 회피 연속(combo) 사다리: C 메이저 펜타토닉
  var DODGE = [N.C6, N.D6, N.E6, N.G6];
  // (v2) 별사탕 연속 획득(chain) 사다리: 기준음 f (C 메이저 펜타토닉 6단). 실제로는 f → f×2 '또-링'
  var STAR = [N.C5, N.D5, N.E5, N.G5, N.A5, N.C6];

  var sfx = {
    // 게임 시작: '띠용' 스프링 + 상승 3음 + 반짝
    start: function (t) {
      if (throttled('start', t, 0.5)) return;
      wobble('triangle', 220, 520, t, 0.22, 0.14, 18, 25, 0.005);
      tone('triangle', N.C5, 0, t + 0.22, 0.09, 0.16);
      tone('triangle', N.E5, 0, t + 0.31, 0.09, 0.16);
      tone('triangle', N.G5, 0, t + 0.40, 0.30, 0.18, 0.005);
      tone('sine', N.C6, 0, t + 0.40, 0.30, 0.06, 0.005);
      tone('sine', N.C4, 0, t + 0.40, 0.30, 0.08, 0.01);
    },
    // 보통 똥이 땅에 떨어짐: 아주 작은 '퐁'. 많이 나므로 피크 0.05, 120ms 스로틀, 음높이 살짝 랜덤
    plop: function (t) {
      if (throttled('plop', t, 0.12)) return;
      var f = 260 * (0.92 + Math.random() * 0.16);
      sweep('sine', f * 1.5, f, t, 0.03, 0.08, 0.05, 0.002);
      noise(t, 0.04, 0.015, 'lowpass', 900, 0, 0, 0.002);
    },
    // 큰 똥 착지: 조금 묵직한 '쿵-뿌직' (부드러운 저역 + 짧은 통통 튐)
    bigLand: function (t) {
      if (throttled('bigLand', t, 0.15)) return;
      sweep('sine', 120, 45, t, 0.16, 0.28, 0.26, 0.004);
      noise(t, 0.14, 0.07, 'lowpass', 600, 150, 0, 0.004);
      sweep('sine', 180, 240, t + 0.09, 0.04, 0.09, 0.06, 0.003); // 작은 튐 '뽁'
    },
    // 아슬아슬 회피 '휙' + 반짝. opts.combo 1,2,3… 연속 회피마다 한 칸 위
    dodge: function (t, opts) {
      if (throttled('dodge', t, 0.08)) return;
      var c = Math.floor(+(opts && opts.combo));
      if (!(c >= 1)) c = 1;
      var f = DODGE[Math.min(c, DODGE.length) - 1];
      noise(t, 0.13, 0.09, 'bandpass', 1200, 3500, 1.4, 0.03);
      tone('sine', f, 0, t + 0.06, 0.12, 0.07, 0.003);
      tone('sine', f * 1.5, 0, t + 0.10, 0.10, 0.03, 0.003);
    },
    // (v2) 별사탕 획득: 맑은 2음 '또-링'(앞꾸밈음 f → 옥타브 위 f×2 벨). opts.chain 1~6, 7 이상은 6단 고정
    // dodge(노이즈 '휙' + sine)와 달리 노이즈 없음, triangle 꾸밈음 + 옥타브 도약 + 3배음 반짝으로 구분
    star: function (t, opts) {
      if (throttled('star', t, 0.05)) return;
      var c = Math.floor(+(opts && opts.chain));
      if (!(c >= 1)) c = 1;
      if (c > STAR.length) c = STAR.length;
      var f = STAR[c - 1], v = 0.10 + (c - 1) * 0.004;
      tone('triangle', f, 0, t, 0.045, 0.08, 0.002);               // '또'
      tone('triangle', f * 2, 0, t + 0.045, 0.20, v, 0.002);        // '링'
      tone('sine', f * 3, 0, t + 0.045, 0.12, 0.025, 0.002);        // 반짝 배음
      if (c === STAR.length) tone('sine', f * 3, 0, t + 0.11, 0.16, 0.035, 0.003); // 최대 단계: 위로 한 번 더 '찡'
    },
    // (v2, 선택) 별사탕 놓침: 아주 작은 하강 '퓨'. 연속이 끊길 때(chain 2 이상)만 부르는 것을 권장
    starMiss: function (t) {
      if (throttled('starMiss', t, 0.3)) return;
      sweep('sine', N.E5, N.A4, t, 0.12, 0.14, 0.035, 0.004);
    },
    // 아이템 획득: 빠른 상승 아르페지오 '뾰로롱'
    item: function (t) {
      if (throttled('item', t, 0.15)) return;
      var m = [N.G5, N.C6, N.E6, N.G6];
      for (var i = 0; i < m.length; i++) tone('triangle', m[i], 0, t + i * 0.05, 0.10, 0.12, 0.003);
    },
    // 무적(우산) 시작: 펼치는 '파앗' + 반짝이는 화음
    // (v2) 우산이 자주 나와 약 25% 작고 짧게: 노이즈 0.06→0.045, 화음 0.45→0.32s, 피크 0.10/0.08→0.08/0.06
    shieldOn: function (t) {
      if (throttled('shieldOn', t, 0.3)) return;
      noise(t, 0.15, 0.045, 'bandpass', 800, 4000, 1.2, 0.02);
      tone('sine', N.C5, 0, t + 0.07, 0.32, 0.08, 0.01);
      tone('sine', N.E5, 0, t + 0.07, 0.32, 0.06, 0.01);
      tone('sine', N.G5, 0, t + 0.07, 0.32, 0.06, 0.01);
      tone('sine', N.C6, 0, t + 0.13, 0.24, 0.035, 0.01);
    },
    // 무적 곧 끝남 경고(아주 작게) '틱'. (v2) 남은 1.5초 → n:1, 남은 0.8초 → n:2(조금 높은 C6)
    shieldWarn: function (t, opts) {
      if (throttled('shieldWarn', t, 0.25)) return;
      var hi = opts && +opts.n === 2;
      tone('sine', hi ? N.C6 : N.G5, 0, t, 0.06, 0.05, 0.002);
    },
    // 무적 끝: 접히는 하강 2음 (작게)
    shieldOff: function (t) {
      if (throttled('shieldOff', t, 0.3)) return;
      tone('triangle', N.G5, 0, t, 0.09, 0.09);
      tone('triangle', N.C5, 0, t + 0.09, 0.16, 0.09);
      noise(t, 0.12, 0.025, 'bandpass', 2500, 700, 1.2, 0.01);
    },
    // 피격: 코믹 '뽀잉~' (말랑한 충돌 + 비브라토 하강). 지저분한 소리 없이
    hit: function (t) {
      if (throttled('hit', t, 0.4)) return;
      sweep('sine', 500, 200, t, 0.05, 0.08, 0.18, 0.002);   // 말랑 '뽁'
      noise(t, 0.06, 0.05, 'lowpass', 1500, 400, 0, 0.002);
      wobble('triangle', 700, 260, t + 0.06, 0.45, 0.14, 14, 30, 0.01); // '뽀잉~'
    },
    // 게임 오버 징글: 코믹 하강 '빠-바-바-뿌우~' (슬프지 않게)
    gameOver: function (t) {
      if (throttled('result', t, 0.8)) return;
      tone('triangle', N.G4, 0, t, 0.14, 0.15);
      tone('triangle', N.F4, 0, t + 0.18, 0.14, 0.15);
      tone('triangle', N.E4, 0, t + 0.36, 0.14, 0.15);
      wobble('triangle', N.D4 * 1.06, N.C4 * 0.94, t + 0.56, 0.7, 0.15, 6, 8, 0.01);
      tone('sine', N.C3, 0, t + 0.56, 0.7, 0.10, 0.02);
    },
    // 신기록: 밝은 팡파레 (게임 오버 징글 대신 또는 뒤에)
    record: function (t) {
      if (throttled('record', t, 0.8)) return;
      tone('triangle', N.C5, 0, t, 0.10, 0.16);
      tone('triangle', N.C5, 0, t + 0.12, 0.10, 0.16);
      tone('triangle', N.C5, 0, t + 0.24, 0.10, 0.16);
      tone('triangle', N.E5, 0, t + 0.36, 0.14, 0.17);
      tone('triangle', N.G5, 0, t + 0.52, 0.14, 0.17);
      tone('triangle', N.C6, 0, t + 0.68, 0.60, 0.18, 0.006);
      tone('triangle', N.G5, 0, t + 0.68, 0.60, 0.09, 0.006);
      tone('sine', N.C4, 0, t + 0.68, 0.60, 0.10, 0.01);
      noise(t + 0.68, 0.4, 0.025, 'bandpass', 7000, 0, 3);
    },
    // 난이도 단계 상승: 아주 작은 '딩동↑'
    levelUp: function (t) {
      if (throttled('levelUp', t, 0.5)) return;
      tone('sine', N.E5, 0, t, 0.08, 0.06, 0.003);
      tone('sine', N.A5, 0, t + 0.08, 0.14, 0.06, 0.003);
    },
    // UI 버튼 '톡' (선택)
    tap: function (t) {
      if (throttled('tap', t, 0.06)) return;
      tone('sine', 900, 700, t, 0.05, 0.08, 0.002);
    }
  };

  // ---- 배경음악: 오리지널 코믹 루프. C 메이저, 기본 120 BPM, 8분음표 32스텝(4마디 = 8초 @1.0) ----
  // 멜로디(0 = 쉼표): 통통 튀는 짧은 플럭
  var MEL = [
    N.C5, 0, N.E5, N.G5, 0, N.E5, N.C5, 0,
    N.D5, 0, N.F5, N.A5, N.G5, 0, 0, 0,
    N.E5, N.G5, N.C6, 0, N.A5, N.G5, N.E5, 0,
    N.D5, N.E5, N.D5, N.B4, N.C5, 0, 0, 0
  ];
  // 마디별 베이스 근음 / 위 음(오-파 '움-빠'): C, Dm, Am, G
  var BASS = [N.C3, N.D3, N.A2, N.G2];
  var CHORD = [N.G3, N.A3, N.E3, N.D3];

  function stepDur() { return 60 / (BASE_BPM * music.tempo) / 2; }

  function scheduleMusic() {
    if (!music.on || !ctx) return;
    try {
      while (music.nextTime < ctx.currentTime + 0.25) {
        var s = music.step % 32, t = music.nextTime, bar = Math.floor(s / 8), st = stepDur();
        if (MEL[s]) {
          tone('triangle', MEL[s], 0, t, st * 0.9, 0.38, 0.004, musicBus);
          tone('sine', MEL[s] * 2, 0, t, st * 0.4, 0.06, 0.003, musicBus);
        }
        // 움-빠: 짝수 박(0,4)에 근음, 2,6에 위 음 (짧게, 스타카토)
        if (s % 4 === 0) tone('triangle', BASS[bar], 0, t, st * 1.2, 0.45, 0.006, musicBus);
        if (s % 4 === 2) tone('triangle', CHORD[bar], 0, t, st * 0.8, 0.22, 0.006, musicBus);
        // 하이햇: 뒷박에 아주 작게
        if (s % 2 === 1) noise(t, 0.035, 0.06, 'highpass', 7000, 0, 0, 0.002, musicBus);
        // 마디 끝 코믹 '뽁' (마지막 마디 제외)
        if (s % 8 === 7 && bar < 3) sweep2(t);
        music.nextTime += st;
        music.step++;
      }
    } catch (e) {}
    music.timer = setTimeout(scheduleMusic, 100);
  }
  function sweep2(t) {
    try {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(300, t);
      o.frequency.exponentialRampToValueAtTime(600, t + 0.05);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      o.connect(g); g.connect(musicBus);
      o.start(t); o.stop(t + 0.09);
    } catch (e) {}
  }

  function clampTempo(v) {
    v = +v;
    if (!(v > 0)) return music.tempo;
    return Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, v));
  }

  // 탭 전환 시 일시정지 / 복귀 시 재개
  try {
    document.addEventListener('visibilitychange', function () {
      if (!ctx) return;
      try {
        if (document.hidden) {
          var p1 = ctx.suspend(); if (p1 && p1.catch) p1.catch(function () {});
        } else {
          var p2 = ctx.resume(); if (p2 && p2.catch) p2.catch(function () {});
          if (music.on) music.nextTime = Math.max(music.nextTime, ctx.currentTime + 0.05);
        }
      } catch (e) {}
    });
  } catch (e) {}

  return {
    // 반드시 사용자 제스처(click/touchend/pointerup/keydown) 핸들러 안에서 호출. 여러 번 호출해도 안전.
    unlock: function () {
      if (!ensureCtx()) return;
      try {
        if (ctx.state !== 'running') {
          var p = ctx.resume();
          if (p && p.catch) p.catch(function () {});
        }
        var b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
        s.buffer = b; s.connect(ctx.destination); s.start(0);
      } catch (e) {}
    },
    // name: start|plop|bigLand|dodge|star|starMiss|item|shieldOn|shieldWarn|shieldOff|hit|gameOver|record|levelUp|tap
    // opts 공통: x 0~1 (선택, 좌우 위치). dodge → { combo 1.. }, star → { chain 1..6 }, shieldWarn → { n 1|2 }
    play: function (name, opts) {
      try {
        if (!ready() || typeof name !== 'string' || !sfx.hasOwnProperty(name)) return;
        opts = opts || {};
        out = outFor(opts);
        sfx[name](ctx.currentTime, opts);
      } catch (e) {}
      out = null;
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
    // opts.tempo: 시작 템포 배율 (기본 1.0, 1.0~1.4)
    startMusic: function (opts) {
      if (opts && opts.tempo !== undefined) music.tempo = clampTempo(opts.tempo);
      else music.tempo = 1;
      if (music.on || !ctx) return;
      music.on = true;
      music.step = 0;
      try { music.nextTime = ctx.currentTime + 0.05; } catch (e) { music.on = false; return; }
      scheduleMusic();
    },
    stopMusic: function () {
      music.on = false;
      if (music.timer) { clearTimeout(music.timer); music.timer = null; }
    },
    // 템포 배율 변경 (1.0~1.4로 제한). 다음 스텝부터 적용, 재생 중이 아니어도 값은 기억
    setTempo: function (v) { music.tempo = clampTempo(v); },
    getTempo: function () { return music.tempo; }
  };
})();
