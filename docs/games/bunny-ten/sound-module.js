/* ===== 토끼 텐 (bunny-ten) Sound module =====
 * Web Audio API 실시간 합성. 외부 파일/의존성 없음.
 * AudioContext 미지원·실패 시 모든 호출은 조용히 무시된다.
 * 사용법: 첫 터치/클릭/키 입력 핸들러 안에서 Sound.unlock() 호출 → 이후 Sound.play('clear', { count: 3 }) 등.
 */
const Sound = (function () {
  'use strict';
  var MUTE_KEY = 'bunny-ten-muted';
  var MASTER_VOL = 0.5;   // 효과음 전체
  var MUSIC_VOL = 0.06;   // 배경음악 (아주 조용히)

  var ctx = null, master = null, musicBus = null, noiseBuf = null;
  var muted = false;
  var last = {};          // 이름별 마지막 재생 시각 (스로틀)
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

  // 같은 소리가 gap초 안에 다시 호출되면 무시
  function throttled(name, t, gap) {
    if (last[name] !== undefined && t - last[name] < gap) return true;
    last[name] = t;
    return false;
  }

  // 기본 음: 파형, 주파수(시작→끝), 시작시각, 길이, 피크 볼륨, 어택, 출력
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

  // '깡충' — 짧은 상승 피치 블립 (토끼 한 마리 점프)
  function hop(t, base, vol) {
    tone('sine', base, base * 2.2, t, 0.07, vol, 0.004);
  }

  var N = { F3: 174.61, A3: 220.0, C4: 261.63, D4: 293.66, F4: 349.23, G4: 392.0, A4: 440.0,
            C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0,
            C6: 1046.5, D6: 1174.66, F6: 1396.91, A6: 1760.0 };

  var sfx = {
    // 게임 시작: 통통 튀는 상승 3음 (F5-A5-C6) + 마지막 깡충
    start: function (t) {
      tone('triangle', N.F5, 0, t, 0.10, 0.25);
      tone('triangle', N.A5, 0, t + 0.09, 0.10, 0.25);
      tone('triangle', N.C6, 0, t + 0.18, 0.22, 0.25);
      hop(t + 0.18, 500, 0.10);
    },
    // 드래그 시작: 거의 안 들리는 '톡' (80ms 스로틀)
    select: function (t) {
      if (throttled('select', t, 0.08)) return;
      tone('sine', 900, 700, t, 0.035, 0.035, 0.002);
    },
    // 선택 합이 10이 된 순간 미리 알림: 작은 반짝 2음 (150ms 스로틀)
    ready: function (t) {
      if (throttled('ready', t, 0.15)) return;
      tone('sine', N.C6, 0, t, 0.07, 0.07);
      tone('sine', N.F6, 0, t + 0.05, 0.10, 0.06);
    },
    // 지우기 성공: count(지운 토끼 수)에 따라 2 / 3 / 4+ 단계
    clear: function (t, opts) {
      var count = (opts && +opts.count) || 2;
      // 1) 토끼마다 깡충 블립 (최대 6번, 45ms 간격, 점점 높게)
      var hops = Math.min(Math.max(count, 1), 6);
      for (var i = 0; i < hops; i++) hop(t + i * 0.045, 420 + i * 60, 0.09);
      var c = t + 0.04;
      if (count <= 2) {
        // 2개: 밝은 2음 (C6 → F6)
        tone('triangle', N.C6, 0, c, 0.10, 0.20);
        tone('triangle', N.F6, 0, c + 0.07, 0.16, 0.18);
      } else if (count === 3) {
        // 3개: 3음 아르페지오 (A5-C6-F6) + 살짝 반짝임
        tone('triangle', N.A5, 0, c, 0.10, 0.20);
        tone('triangle', N.C6, 0, c + 0.06, 0.10, 0.20);
        tone('triangle', N.F6, 0, c + 0.12, 0.22, 0.20);
        tone('sine', N.A6, 0, c + 0.12, 0.20, 0.04);
      } else {
        // 4개+: 4음 아르페지오 + 화음 + 쉬머 노이즈 + 부드러운 저음
        var arp = [N.F5, N.A5, N.C6, N.F6];
        for (var j = 0; j < arp.length; j++) tone('triangle', arp[j], 0, c + j * 0.05, 0.12, 0.20);
        var e = c + 0.20;
        tone('triangle', N.F6, 0, e, 0.40, 0.16, 0.01);
        tone('sine', N.A6, 0, e, 0.40, 0.06, 0.01);
        tone('sine', N.F4, 0, c, 0.45, 0.12, 0.01);
        noise(e, 0.30, 0.035, 'highpass', 7000);
        if (count >= 6) {
          // 아주 큰 묶음: 반짝 꼬리 2음 추가
          tone('sine', N.A6, 0, e + 0.12, 0.18, 0.05);
          tone('sine', N.C6 * 2, 0, e + 0.20, 0.22, 0.04);
        }
      }
    },
    // 실패(합 ≠ 10): 부드러운 하강 '뿌우' — 낮고 짧게, 귀에 거슬리지 않게
    miss: function (t) {
      if (throttled('miss', t, 0.12)) return;
      tone('sine', 330, 220, t, 0.16, 0.10, 0.01);
      tone('triangle', 247, 196, t + 0.05, 0.14, 0.05, 0.01);
    },
    // 마지막 10초 째깍: 우드블록 느낌의 짧은 틱. opts.urgent=true(마지막 3초)면 한 단계 높고 조금 크게
    tick: function (t, opts) {
      var urgent = opts && opts.urgent;
      var f = urgent ? 1600 : 1200;
      tone('sine', f, f * 0.8, t, 0.04, urgent ? 0.14 : 0.10, 0.002);
      noise(t, 0.03, urgent ? 0.05 : 0.035, 'bandpass', f * 1.5);
    },
    // 시간 종료: 부드러운 벨 + 하강 3음 (C6-A5-F5)
    timeUp: function (t) {
      tone('sine', N.C6, 0, t, 0.6, 0.16, 0.005);
      tone('sine', N.C6 * 2.76, 0, t, 0.25, 0.03, 0.005); // 벨 배음
      tone('triangle', N.A5, 0, t + 0.25, 0.18, 0.18);
      tone('triangle', N.F5, 0, t + 0.42, 0.18, 0.18);
      tone('triangle', N.C5, 0, t + 0.59, 0.40, 0.18, 0.01);
      tone('sine', N.F3, 0, t + 0.59, 0.50, 0.12, 0.02);
    },
    // 최고 점수 갱신: 깡충 3번 + 팡파르 (C5-F5-A5 → C6 화음)
    highScore: function (t) {
      hop(t, 450, 0.08); hop(t + 0.07, 520, 0.08); hop(t + 0.14, 600, 0.08);
      var f = t + 0.2;
      tone('square', N.C5, 0, f, 0.09, 0.08);
      tone('square', N.F5, 0, f + 0.10, 0.09, 0.08);
      tone('square', N.A5, 0, f + 0.20, 0.09, 0.08);
      tone('triangle', N.C6, 0, f + 0.30, 0.50, 0.24, 0.01);
      tone('triangle', N.F5, 0, f + 0.30, 0.50, 0.12, 0.01);
      tone('sine', N.A6, 0, f + 0.36, 0.35, 0.04);
      noise(f + 0.30, 0.35, 0.03, 'highpass', 7000);
    },
    // 일시정지 / 재개: 부드러운 단음
    pause: function (t) { tone('sine', N.A4, N.F4, t, 0.12, 0.10); },
    resume: function (t) { tone('sine', N.F4, N.A4, t, 0.12, 0.10); }
  };

  // ---- 배경음악: 오리지널 뮤직박스풍 루프, F 메이저 펜타토닉, 92 BPM, 8분음표 그리드 ----
  var BPM = 92, STEP = 60 / BPM / 2; // 8분음표 ≈ 0.326초
  // 멜로디 (0 = 쉼표). 32스텝(4마디) ≈ 10.4초, 오리지널 패턴
  var MEL = [
    N.C5, 0, N.F5, N.G5, N.A5, 0, N.G5, 0,
    N.F5, 0, N.D5, 0, N.C5, 0, 0, 0,
    N.D5, 0, N.F5, 0, N.G5, N.A5, N.C6, 0,
    N.A5, 0, N.G5, 0, N.F5, 0, 0, 0
  ];
  // 베이스: 마디(8스텝)마다 F3, D3, A3, C3 (모두 F 펜타토닉 안의 음)
  var BASS = [N.F3, 146.83, N.A3, 130.81];

  function scheduleMusic() {
    if (!music.on || !ctx) return;
    try {
      while (music.nextTime < ctx.currentTime + 0.25) {
        var s = music.step % 32, t = music.nextTime, bar = Math.floor(s / 8);
        // 뮤직박스: sine 본음 + 한 옥타브 위 아주 작은 배음, 짧게 감쇠
        if (MEL[s]) {
          tone('sine', MEL[s], 0, t, STEP * 1.6, 0.5, 0.004, musicBus);
          tone('sine', MEL[s] * 2, 0, t, STEP * 0.6, 0.12, 0.004, musicBus);
        }
        // 베이스: 박 1·3에 짧은 '퐁'
        if (s % 4 === 0) tone('triangle', BASS[bar], 0, t, STEP * 1.5, 0.45, 0.01, musicBus);
        // 뒷박 화음 톡 (5도 위)
        if (s % 4 === 2) tone('sine', BASS[bar] * 3, 0, t, STEP * 0.5, 0.12, 0.004, musicBus);
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
    // 반드시 사용자 제스처(touchend/pointerup/click/keydown) 핸들러 안에서 호출. 여러 번 호출해도 안전.
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
    // name: start|select|ready|clear|miss|tick|timeUp|highScore|pause|resume
    // opts: clear → { count }, tick → { urgent }
    play: function (name, opts) {
      try {
        if (!ready() || !sfx[name]) return;
        sfx[name](ctx.currentTime + 0.01, opts || {});
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
