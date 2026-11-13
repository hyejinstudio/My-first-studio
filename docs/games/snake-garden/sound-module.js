/* ===== 뱀 정원 (snake-garden) Sound module =====
 * Web Audio API 실시간 합성. 외부 파일/의존성 없음.
 * AudioContext 미지원·실패 시 모든 호출은 조용히 무시된다.
 * 사용법: 첫 터치/클릭/키 입력 핸들러 안에서 Sound.unlock() 호출 → 이후 Sound.play('eat') 등.
 */
const Sound = (function () {
  'use strict';
  var MUTE_KEY = 'snake-garden-muted';
  var MASTER_VOL = 0.5;   // 효과음 전체
  var MUSIC_VOL = 0.07;   // 배경음악 (아주 조용히)

  var ctx = null, master = null, musicBus = null, noiseBuf = null;
  var muted = false;
  var lastTurn = 0;
  var music = { on: false, timer: null, step: 0, nextTime: 0 };

  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { muted = false; }

  function ensureCtx() {
    if (ctx) return ctx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER_VOL;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = MUSIC_VOL;
      musicBus.connect(master);
      // 노이즈 버퍼 (0.5초)
      var len = Math.floor(ctx.sampleRate * 0.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
    return ctx;
  }

  function ready() {
    return ctx && ctx.state === 'running' && !muted;
  }

  // 기본 음: 파형, 주파수(시작→끝), 시작시각, 길이, 피크 볼륨, 어택
  function tone(type, f0, f1, t, dur, vol, attack, dest) {
    try {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      var a = attack || 0.005;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || master);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }

  function noise(t, dur, vol, filterType, freq, freqEnd) {
    try {
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf;
      f.type = filterType; f.frequency.setValueAtTime(freq, t);
      if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t); s.stop(t + dur + 0.02);
    } catch (e) {}
  }

  var N = { C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0, A4: 440.0,
            C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0, C6: 1046.5, E6: 1318.5 };

  var sfx = {
    // 게임 시작: 상승 3음 아르페지오 (C5-E5-G5)
    start: function (t) {
      tone('triangle', N.C5, 0, t, 0.12, 0.30);
      tone('triangle', N.E5, 0, t + 0.08, 0.12, 0.30);
      tone('triangle', N.G5, 0, t + 0.16, 0.22, 0.30);
    },
    // 방향 전환: 아주 작은 틱 (60ms 이내 연속 호출은 무시)
    turn: function (t) {
      if (t - lastTurn < 0.06) return;
      lastTurn = t;
      tone('sine', 1400, 1100, t, 0.03, 0.04, 0.002);
    },
    // 일반 열매: 짧은 '뽁' — 상승 스윕
    eat: function (t) {
      tone('square', 520, 1040, t, 0.08, 0.12, 0.003);
      tone('sine', 1040, 0, t + 0.04, 0.06, 0.08);
    },
    // 보너스 열매 등장: 반짝 2음 + 고음 쉬머
    bonusSpawn: function (t) {
      tone('sine', N.E6, 0, t, 0.10, 0.12);
      tone('sine', N.C6, 0, t + 0.07, 0.14, 0.10);
      noise(t, 0.18, 0.04, 'highpass', 6000);
    },
    // 보너스 열매 사라짐(시간 초과): 하강 2음, 작게
    bonusExpire: function (t) {
      tone('sine', N.G5, 0, t, 0.08, 0.07);
      tone('sine', N.D5, 0, t + 0.07, 0.12, 0.06);
    },
    // 보너스 열매 먹기: 빠른 상승 4음 아르페지오 + 반짝임
    bonusEat: function (t) {
      var notes = [N.C5, N.E5, N.G5, N.C6];
      for (var i = 0; i < notes.length; i++) tone('triangle', notes[i], 0, t + i * 0.05, 0.12, 0.25);
      tone('sine', N.E6, 0, t + 0.2, 0.25, 0.08);
    },
    // 최고 점수 갱신: 짧은 팡파르 (G4-C5-E5 → G5 길게)
    highScore: function (t) {
      tone('square', N.G4, 0, t, 0.10, 0.10);
      tone('square', N.C5, 0, t + 0.10, 0.10, 0.10);
      tone('square', N.E5, 0, t + 0.20, 0.10, 0.10);
      tone('triangle', N.G5, 0, t + 0.30, 0.45, 0.28, 0.01);
      tone('triangle', N.C6, 0, t + 0.30, 0.45, 0.12, 0.01);
    },
    // 게임 오버: 쿵(노이즈) + 하강 톱니파
    gameOver: function (t) {
      noise(t, 0.25, 0.25, 'lowpass', 1200, 150);
      tone('sawtooth', 330, 82, t + 0.05, 0.6, 0.15, 0.01);
      tone('triangle', N.E4, 0, t + 0.25, 0.25, 0.12);
      tone('triangle', N.C4, 0, t + 0.45, 0.45, 0.12);
    },
    // 일시정지/재개: 부드러운 단음
    pause: function (t) { tone('sine', N.A4, N.E4, t, 0.12, 0.12); },
    resume: function (t) { tone('sine', N.E4, N.A4, t, 0.12, 0.12); }
  };

  // ---- 배경음악: 오리지널 8마디 펜타토닉 루프, 100 BPM, 8분음표 그리드 ----
  var BPM = 100, STEP = 60 / BPM / 2; // 8분음표 = 0.3초
  // 멜로디 (0 = 쉼표). C 메이저 펜타토닉, 오리지널 패턴, 32스텝 = 9.6초
  var MEL = [
    N.E5, 0, N.G5, 0, N.A5, N.G5, N.E5, 0,
    N.D5, 0, N.E5, 0, N.G5, 0, 0, 0,
    N.E5, 0, N.D5, 0, N.C5, N.D5, N.E5, 0,
    N.G4, 0, N.A4, 0, N.C5, 0, 0, 0
  ];
  // 베이스: 마디(8스텝)마다 C3, A2, D3, G2
  var BASS = [130.81, 110.0, 146.83, 98.0];

  function scheduleMusic() {
    if (!music.on || !ctx) return;
    try {
      while (music.nextTime < ctx.currentTime + 0.25) {
        var s = music.step % 32, t = music.nextTime;
        if (MEL[s]) tone('triangle', MEL[s], 0, t, STEP * 0.9, 0.5, 0.01, musicBus);
        if (s % 8 === 0) tone('sine', BASS[s / 8], 0, t, STEP * 7.5, 0.6, 0.03, musicBus);
        if (s % 4 === 2) tone('sine', BASS[Math.floor(s / 8)] * 2, 0, t, STEP * 1.5, 0.25, 0.01, musicBus);
        music.nextTime += STEP;
        music.step++;
      }
    } catch (e) {}
    music.timer = setTimeout(scheduleMusic, 100);
  }

  // 탭 전환 시 오디오 일시정지 / 복귀 시 재개
  try {
    document.addEventListener('visibilitychange', function () {
      if (!ctx) return;
      try {
        if (document.hidden) ctx.suspend();
        else ctx.resume();
      } catch (e) {}
    });
  } catch (e) {}

  return {
    // 반드시 사용자 제스처(touchend/pointerdown/click/keydown) 핸들러 안에서 호출
    unlock: function () {
      if (!ensureCtx()) return;
      try {
        if (ctx.state !== 'running') {
          var p = ctx.resume();
          if (p && p.catch) p.catch(function () {});
        }
        // iOS: 무음 1샘플 버퍼 재생으로 출력 경로 활성화
        var b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
        s.buffer = b; s.connect(ctx.destination); s.start(0);
      } catch (e) {}
    },
    play: function (name) {
      try {
        if (!ready() || !sfx[name]) return;
        sfx[name](ctx.currentTime + 0.01);
      } catch (e) {}
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
