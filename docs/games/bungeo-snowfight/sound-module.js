/* ===== 붕어빵 눈싸움 (bungeo-snowfight) Sound module =====
 * Web Audio API 실시간 합성. 외부 파일/의존성 없음.
 * AudioContext 미지원·실패 시 모든 호출은 조용히 무시된다.
 * 사용법: 시작 버튼 등 사용자 제스처 핸들러 안에서 Sound.unlock() 호출 → 이후 Sound.play('throw', { type: 'pat', side: 'L' }) 등.
 * 좌우 패닝: opts.side 'L' | 'R' (없으면 가운데). 2인 모드에서 양쪽 소리가 섞여도 덜 피곤하게.
 * 스로틀: 같은 소리(+같은 side)는 최소 간격 안에 다시 호출되면 무시.
 */
const Sound = (function () {
  'use strict';
  var MUTE_KEY = 'bungeo-snowfight-muted';
  var MASTER_VOL = 0.5;   // 효과음 전체
  var MUSIC_VOL = 0.045;  // 배경음악 (낮게)
  var PAN = 0.55;         // 좌우 패닝 폭 (완전 분리 1.0은 이어폰에서 어색하므로 절반 정도)

  var ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
  var sideBus = { L: null, C: null, R: null };
  var out = null;         // 현재 재생 중인 효과음의 출력 (side 버스)
  var muted = false;
  var last = {};          // 이름(+side)별 마지막 재생 시각
  var pullLast = { L: -1, C: -1, R: -1 }; // 당기기: side별 마지막 power
  var music = { on: false, timer: null, step: 0, nextTime: 0 };

  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { muted = false; }

  function makePan(v) {
    var g = ctx.createGain();
    g.gain.value = 1;
    try {
      if (ctx.createStereoPanner) {
        var p = ctx.createStereoPanner();
        p.pan.value = v;
        g.connect(p); p.connect(sfxBus);
        return g;
      }
    } catch (e) {}
    g.connect(sfxBus); // 패너 미지원: 가운데로
    return g;
  }

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
      sideBus.L = makePan(-PAN);
      sideBus.C = makePan(0);
      sideBus.R = makePan(PAN);
      var len = Math.floor(ctx.sampleRate * 0.8);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
    return ctx;
  }

  function ready() { return ctx && ctx.state === 'running' && !muted; }

  function sideOf(opts) {
    var s = opts && opts.side;
    return s === 'L' || s === 'R' ? s : 'C';
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

  // 필터 노이즈. attack 지정 가능(휙 소리는 느린 어택)
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

  // 음이름 (D 메이저 펜타토닉: D E F# A B)
  var N = { D2: 73.42, A2: 110.0, B2: 123.47, D3: 146.83, E3: 164.81, Fs3: 185.0, G3: 196.0, A3: 220.0, B3: 246.94,
            D4: 293.66, E4: 329.63, Fs4: 369.99, G4: 392.0, A4: 440.0, B4: 493.88,
            D5: 587.33, E5: 659.25, Fs5: 739.99, A5: 880.0, B5: 987.77,
            D6: 1174.66, E6: 1318.51, Fs6: 1479.98, A6: 1760.0 };

  // 슈붕 바운스 사다리 (D 메이저 펜타토닉, 바운스마다 한 칸 위)
  var BOUNCE = [N.A4, N.B4, N.D5, N.E5, N.Fs5, N.A5];

  var sfx = {
    // 게임 시작: 썰매방울 반짝 + 상승 3음 + 종소리
    start: function (t) {
      noise(t, 0.25, 0.04, 'bandpass', 7000, 0, 3);
      tone('triangle', N.D5, 0, t, 0.10, 0.18);
      tone('triangle', N.Fs5, 0, t + 0.10, 0.10, 0.18);
      tone('triangle', N.A5, 0, t + 0.20, 0.10, 0.18);
      tone('sine', N.D6, 0, t + 0.30, 0.45, 0.16, 0.005);
      tone('sine', N.D6 * 2.76, 0, t + 0.30, 0.18, 0.025, 0.005);
      tone('sine', N.D4, 0, t + 0.30, 0.40, 0.10, 0.01);
    },
    // 당기기 '끼익' (연속 호출 대응). opts.power 0~1.
    // 80ms 스로틀 + power가 0.06 이상 늘었을 때만 소리 (가만히 잡고 있으면 조용)
    pull: function (t, opts, side) {
      var p = +(opts && opts.power);
      if (!(p >= 0)) p = 0; if (p > 1) p = 1;
      if (p < pullLast[side]) pullLast[side] = p; // 줄어들면 기준만 낮춤
      if (p - pullLast[side] < 0.06 && pullLast[side] >= 0) return;
      if (throttled('pull' + side, t, 0.08)) return;
      pullLast[side] = p;
      var f = 260 + p * 340; // 260Hz → 600Hz
      tone('triangle', f, f * 1.04, t, 0.05, 0.025, 0.006);
      noise(t, 0.04, 0.012, 'bandpass', f * 4, 0, 6);
    },
    // 발사 '휙'. opts.type 'pat'(무겁고 낮게) | 'shu'(가볍고 높게)
    throw: function (t, opts, side) {
      if (throttled('throw' + side, t, 0.06)) return;
      pullLast[side] = -1;
      if (opts && opts.type === 'shu') {
        noise(t, 0.14, 0.10, 'bandpass', 1400, 3200, 1.5, 0.03);
        sweep('sine', 500, 900, t, 0.08, 0.10, 0.04, 0.01);
      } else {
        noise(t, 0.24, 0.13, 'bandpass', 700, 300, 1.2, 0.05);
        sweep('sine', 180, 110, t, 0.2, 0.22, 0.06, 0.02);
      }
    },
    // 팥붕 착지 '쿵' — 묵직하지만 부드럽게 (눈 위라 둔탁)
    land: function (t, opts, side) {
      if (throttled('land' + side, t, 0.07)) return;
      sweep('sine', 130, 50, t, 0.18, 0.30, 0.28, 0.006);
      noise(t, 0.18, 0.10, 'lowpass', 700, 120, 0, 0.005); // 눈 '푹'
      tone('triangle', 98, 0, t, 0.12, 0.05, 0.008);
    },
    // 슈붕 바운스 '통'. opts.bounce 1,2,3… 바운스마다 한 칸 위
    bounce: function (t, opts, side) {
      if (throttled('bounce' + side, t, 0.05)) return;
      var b = Math.floor(+(opts && opts.bounce));
      if (!(b >= 1)) b = 1;
      var f = BOUNCE[Math.min(b, BOUNCE.length) - 1];
      sweep('sine', f * 0.7, f, t, 0.02, 0.12, 0.18, 0.002);
      tone('triangle', f * 2, 0, t, 0.05, 0.03, 0.002);
      noise(t, 0.03, 0.03, 'lowpass', 1500, 0, 0, 0.002);
    },
    // 슈붕 사라짐 '퐁' — 작은 거품 터짐 + 반짝
    vanish: function (t, opts, side) {
      if (throttled('vanish' + side, t, 0.06)) return;
      sweep('sine', 420, 1100, t, 0.05, 0.10, 0.12, 0.003);
      tone('sine', N.A6, 0, t + 0.04, 0.10, 0.02);
    },
    // 칸 칠하기 — 여러 칸 동시여도 1회. opts.count(칸 수)로 아주 살짝 크기·밝기 변화
    paint: function (t, opts, side) {
      if (throttled('paint' + side, t, 0.09)) return;
      var c = Math.floor(+(opts && opts.count)) || 1;
      var k = Math.min(c, 8) / 8; // 0.125~1
      noise(t, 0.12, 0.04 + 0.04 * k, 'highpass', 3000 + 2000 * k, 0, 0, 0.01); // 눈 '사락'
      tone('sine', N.Fs5 * (1 + 0.5 * k), 0, t + 0.01, 0.08, 0.025);
    },
    // 팥붕(장애물)에 막힘 '툭'
    block: function (t, opts, side) {
      if (throttled('block' + side, t, 0.08)) return;
      sweep('sine', 320, 170, t, 0.05, 0.08, 0.16, 0.002);
      noise(t, 0.05, 0.06, 'lowpass', 1200, 0, 0, 0.002);
    },
    // 팥붕 장애물 사라짐 (작게) — 눈 녹듯 '스르'
    patGone: function (t, opts, side) {
      if (throttled('patGone' + side, t, 0.12)) return;
      noise(t, 0.25, 0.025, 'bandpass', 2500, 900, 1.5, 0.05);
      tone('sine', 520, 300, t, 0.2, 0.025, 0.02);
    },
    // 재장전 완료 (아주 작게) '틱'
    reload: function (t, opts, side) {
      if (throttled('reload' + side, t, 0.1)) return;
      tone('sine', N.E6, 0, t, 0.05, 0.03, 0.002);
    },
    // 마지막 10초 째깍. opts.urgent=true(마지막 3초)면 한 단계 높고 조금 크게
    tick: function (t, opts) {
      if (throttled('tick', t, 0.3)) return;
      var urgent = opts && opts.urgent;
      var f = urgent ? 1600 : 1200;
      tone('sine', f, f * 0.8, t, 0.04, urgent ? 0.13 : 0.09, 0.002);
      noise(t, 0.03, urgent ? 0.045 : 0.03, 'bandpass', f * 1.5, 0, 2);
    },
    // 종료 휘슬 '삐익—' (부드럽게: sine + 비브라토 + 바람 노이즈)
    whistle: function (t) {
      if (throttled('whistle', t, 0.5)) return;
      try {
        var o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(1900, t);
        o.frequency.linearRampToValueAtTime(2100, t + 0.05);
        o.frequency.setValueAtTime(2100, t + 0.4);
        o.frequency.linearRampToValueAtTime(1800, t + 0.7);
        lfo.frequency.value = 28; lg.gain.value = 45;
        lfo.connect(lg); lg.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.10, t + 0.03);
        g.gain.setValueAtTime(0.10, t + 0.45);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        o.connect(g); g.connect(out || sfxBus);
        o.start(t); lfo.start(t); o.stop(t + 0.72); lfo.stop(t + 0.72);
      } catch (e) {}
      noise(t, 0.6, 0.03, 'bandpass', 2000, 0, 2, 0.03);
    },
    // 승리 징글 (밝은 상승 + 화음)
    win: function (t) {
      if (throttled('result', t, 0.8)) return;
      var m = [N.D5, N.Fs5, N.A5, N.B5];
      for (var i = 0; i < m.length; i++) tone('triangle', m[i], 0, t + i * 0.11, 0.12, 0.18);
      tone('triangle', N.D6, 0, t + 0.46, 0.6, 0.20, 0.008);
      tone('triangle', N.A5, 0, t + 0.46, 0.6, 0.10, 0.008);
      tone('sine', N.D4, 0, t + 0.46, 0.6, 0.12, 0.01);
      noise(t + 0.46, 0.5, 0.03, 'bandpass', 7000, 0, 3); // 썰매방울 반짝
    },
    // 패배 징글 (부드러운 하강, 슬프지 않게 귀엽게)
    lose: function (t) {
      if (throttled('result', t, 0.8)) return;
      tone('triangle', N.A5, 0, t, 0.16, 0.15);
      tone('triangle', N.Fs5, 0, t + 0.16, 0.16, 0.15);
      tone('triangle', N.E5, 0, t + 0.32, 0.16, 0.15);
      sweep('sine', N.D5, N.A4, t + 0.48, 0.3, 0.5, 0.15, 0.01);
      tone('sine', N.D3, 0, t + 0.48, 0.5, 0.10, 0.02);
    },
    // 무승부 징글 (같은 음 주고받기 + 중립 마무리)
    draw: function (t) {
      if (throttled('result', t, 0.8)) return;
      tone('triangle', N.A5, 0, t, 0.12, 0.15);
      tone('triangle', N.E5, 0, t + 0.14, 0.12, 0.15);
      tone('triangle', N.A5, 0, t + 0.28, 0.12, 0.15);
      tone('triangle', N.E5, 0, t + 0.42, 0.12, 0.15);
      tone('sine', N.A5, 0, t + 0.58, 0.45, 0.12, 0.01);
      tone('sine', N.E5, 0, t + 0.58, 0.45, 0.10, 0.01);
    }
  };

  // ---- 배경음악: 오리지널 겨울 루프. D 메이저 펜타토닉, 100 BPM, 8분음표 32스텝(4마디 ≈ 9.6초) ----
  var BPM = 100, STEP = 60 / BPM / 2;
  // 멜로디(0 = 쉼표): 오르골/첼레스타 느낌
  var MEL = [
    N.A5, 0, N.Fs5, 0, N.E5, N.Fs5, N.A5, 0,
    N.B5, 0, N.A5, 0, N.Fs5, 0, 0, 0,
    N.D5, 0, N.E5, N.Fs5, N.A5, 0, N.E5, 0,
    N.Fs5, 0, N.E5, 0, N.D5, 0, 0, 0
  ];
  // 마디별 베이스: D3, B2, G3(살짝 따뜻하게), A2
  var BASS = [N.D3, N.B2, N.G3 / 2, N.A2];

  function scheduleMusic() {
    if (!music.on || !ctx) return;
    try {
      while (music.nextTime < ctx.currentTime + 0.25) {
        var s = music.step % 32, t = music.nextTime, bar = Math.floor(s / 8);
        if (MEL[s]) {
          // 종소리: sine 기음 + 비조화 배음 아주 작게
          tone('sine', MEL[s], 0, t, STEP * 1.6, 0.40, 0.004, musicBus);
          tone('sine', MEL[s] * 3.01, 0, t, STEP * 0.5, 0.05, 0.003, musicBus);
        }
        // 베이스: 마디 첫 박에 길게, 3박째 5도 위로 짧게
        if (s % 8 === 0) tone('triangle', BASS[bar], 0, t, STEP * 3.5, 0.40, 0.02, musicBus);
        if (s % 8 === 4) tone('triangle', BASS[bar] * 1.5, 0, t, STEP * 1.8, 0.22, 0.02, musicBus);
        // 썰매방울 셰이커: 뒷박에 아주 작게
        if (s % 2 === 1) noise(t, 0.05, s % 4 === 3 ? 0.10 : 0.05, 'bandpass', 8000, 0, 2, 0.002, musicBus);
        music.nextTime += STEP;
        music.step++;
      }
    } catch (e) {}
    music.timer = setTimeout(scheduleMusic, 100);
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
    // name: start|pull|throw|land|bounce|vanish|paint|block|patGone|reload|tick|whistle|win|lose|draw
    // opts 공통: side 'L'|'R' (없으면 가운데)
    // pull → { power 0~1 }, throw → { type 'pat'|'shu' }, bounce → { bounce 1.. }, paint → { count }, tick → { urgent }
    play: function (name, opts) {
      try {
        if (!ready() || !sfx.hasOwnProperty(name)) return;
        opts = opts || {};
        var side = sideOf(opts);
        out = sideBus[side] || sfxBus;
        sfx[name](ctx.currentTime, opts, side);
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
    startMusic: function () {
      if (music.on || !ctx) return;
      music.on = true;
      music.step = 0;
      try { music.nextTime = ctx.currentTime + 0.05; } catch (e) { music.on = false; return; }
      scheduleMusic();
    },
    stopMusic: function () {
      music.on = false;
      if (music.timer) { clearTimeout(music.timer); music.timer = null; }
    }
  };
})();
