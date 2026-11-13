/* ===== 두더지 뿅뿅 (mole-pop) Sound module =====
 * Web Audio API 실시간 합성. 외부 파일/의존성 없음.
 * AudioContext 미지원·실패 시 모든 호출은 조용히 무시된다.
 * 사용법: 시작 버튼 등 사용자 제스처 핸들러 안에서 Sound.unlock() 호출 → 이후 Sound.play('hit', { combo: 5 }) 등.
 * 반응속도 게임용: 노드 그래프·노이즈 버퍼를 unlock 때 미리 만들고, 효과음은 ctx.currentTime 그대로(추가 지연 없음) 예약한다.
 */
const Sound = (function () {
  'use strict';
  var MUTE_KEY = 'mole-pop-muted';
  var MASTER_VOL = 0.5;   // 효과음 전체
  var MUSIC_VOL = 0.05;   // 배경음악 (낮게)

  var ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
  var muted = false;
  var last = {};          // 이름별 마지막 재생 시각 (스로틀)
  var music = { on: false, timer: null, step: 0, nextTime: 0 };

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
      // 노이즈 버퍼 미리 생성 (탭 순간에 만들지 않음)
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
      var a = attack || 0.003;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || sfxBus);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }

  // 빠른 피치 스윕 (앞부분에서 대부분 이동) — '뿅' 용
  function sweep(type, f0, f1, t, sweepDur, dur, vol, attack) {
    try {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + sweepDur);
      var a = attack || 0.002;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }

  function noise(t, dur, vol, filterType, freq, freqEnd, q) {
    try {
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf;
      f.type = filterType; f.frequency.setValueAtTime(freq, t);
      if (q) f.Q.value = q;
      if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(sfxBus);
      s.start(t); s.stop(t + dur + 0.02);
    } catch (e) {}
  }

  // 음이름 (C 메이저 펜타토닉 위주)
  var N = { C3: 130.81, G3: 196.0, A3: 220.0, C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0, A4: 440.0,
            C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0,
            C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, A6: 1760.0, C7: 2093.0 };

  // 콤보 사다리: 콤보 1 → C5, 2 → D5, … 10 이상 → A6 고정 (C 메이저 펜타토닉 10단)
  var LADDER = [N.C5, N.D5, N.E5, N.G5, N.A5, N.C6, N.D6, N.E6, N.G6, N.A6];
  function ladderFreq(combo) {
    var c = Math.floor(+combo);
    if (!(c >= 1)) c = 1;
    return LADDER[Math.min(c, LADDER.length) - 1];
  }

  var sfx = {
    // 게임 시작: 통통 튀는 상승 3음 + 마지막 '뿅'
    start: function (t) {
      tone('triangle', N.C5, 0, t, 0.10, 0.22);
      tone('triangle', N.E5, 0, t + 0.10, 0.10, 0.22);
      tone('triangle', N.G5, 0, t + 0.20, 0.10, 0.22);
      sweep('sine', N.C5, N.C6 * 1.2, t + 0.30, 0.05, 0.16, 0.20);
      tone('triangle', N.C6, 0, t + 0.32, 0.25, 0.16, 0.005);
    },
    // 두더지 등장: 아주 작은 '쏙' (낮은 상승 스윕). 동시 등장 대비 90ms 스로틀
    appear: function (t) {
      if (throttled('appear', t, 0.09)) return;
      sweep('sine', 220, 380, t, 0.04, 0.06, 0.03, 0.004);
    },
    // 황금 두더지 등장 알림: 작은 반짝 2음 (E6 → A6) + 미세 쉬머
    goldAppear: function (t) {
      if (throttled('goldAppear', t, 0.2)) return;
      tone('sine', N.E6, 0, t, 0.08, 0.06);
      tone('sine', N.A6, 0, t + 0.06, 0.14, 0.05);
      noise(t + 0.06, 0.12, 0.012, 'highpass', 8000);
    },
    // 일반 잡기 '뿅': 콤보가 쌓일수록 한 음씩 올라감 (opts.combo, 1부터)
    hit: function (t, opts) {
      if (throttled('hit', t, 0.02)) return;
      var f = ladderFreq(opts && opts.combo);
      // 1) '뿅' 스윕: 목표음의 0.5배 → 1.0배, 25ms 안에 이동
      sweep('sine', f * 0.5, f, t, 0.025, 0.11, 0.26, 0.002);
      // 2) 음높이 또렷하게: 같은 음 triangle 짧게
      tone('triangle', f, 0, t + 0.01, 0.09, 0.10, 0.003);
      // 3) 타격감: 아주 짧은 노이즈 '톡'
      noise(t, 0.025, 0.05, 'bandpass', 2500, 0, 1.2);
    },
    // 황금 잡기: 높은 '뿅' + 빠른 상승 아르페지오 + 반짝 쉬머
    gold: function (t) {
      sweep('sine', N.C5, N.C6, t, 0.025, 0.12, 0.26, 0.002);
      noise(t, 0.025, 0.05, 'bandpass', 3000, 0, 1.2);
      var arp = [N.E6, N.G6, N.A6, N.C7];
      for (var i = 0; i < arp.length; i++) tone('triangle', arp[i], 0, t + 0.05 + i * 0.045, 0.12, 0.15);
      tone('sine', N.C7, 0, t + 0.23, 0.35, 0.07, 0.005);
      tone('sine', N.C5, 0, t + 0.05, 0.35, 0.10, 0.01);
      noise(t + 0.18, 0.35, 0.03, 'highpass', 7500);
    },
    // 폭탄 탭: 부드러운 '퍽' — 저역 필터 노이즈 + 낮은 하강 sine + 짧은 '뿌우'. 고음·찢어지는 소리 없음
    bomb: function (t) {
      if (throttled('bomb', t, 0.1)) return;
      noise(t, 0.22, 0.22, 'lowpass', 1200, 150);
      sweep('sine', 180, 55, t, 0.18, 0.25, 0.30, 0.004);
      tone('triangle', 247, 175, t + 0.08, 0.22, 0.06, 0.01);
    },
    // 빈 구멍 탭: 거의 안 들리는 '톡' (선택 사항). 80ms 스로틀
    empty: function (t) {
      if (throttled('empty', t, 0.08)) return;
      tone('sine', 520, 380, t, 0.03, 0.03, 0.002);
    },
    // 콤보 단계 달성 (배율이 오른 순간). opts.level = 새 배율 단계(2,3,4…)
    combo: function (t, opts) {
      var lv = Math.floor(+(opts && opts.level)) || 2;
      if (lv < 2) lv = 2;
      var k = Math.min(lv - 2, 3);                 // 0~3 단계마다 한 음씩 높게 시작
      var base = [N.G5, N.A5, N.C6, N.D6][k];
      var c = t + 0.06;                            // 직전 '뿅'과 겹치지 않게 살짝 뒤
      tone('square', base, 0, c, 0.07, 0.05);
      tone('square', base * 1.25, 0, c + 0.06, 0.07, 0.05);
      tone('triangle', base * 1.5, 0, c + 0.12, 0.22, 0.16, 0.004);
      tone('sine', base * 3, 0, c + 0.12, 0.18, 0.03);
      if (lv >= 4) noise(c + 0.12, 0.2, 0.02, 'highpass', 7000);
    },
    // 마지막 10초 째깍. opts.urgent=true(마지막 3초)면 한 단계 높고 조금 크게
    tick: function (t, opts) {
      var urgent = opts && opts.urgent;
      var f = urgent ? 1600 : 1200;
      tone('sine', f, f * 0.8, t, 0.04, urgent ? 0.14 : 0.10, 0.002);
      noise(t, 0.03, urgent ? 0.05 : 0.035, 'bandpass', f * 1.5, 0, 2);
    },
    // 시간 종료: 부드러운 벨 + 하강 3음
    timeUp: function (t) {
      tone('sine', N.C6, 0, t, 0.6, 0.16, 0.005);
      tone('sine', N.C6 * 2.76, 0, t, 0.25, 0.03, 0.005); // 벨 배음
      tone('triangle', N.A5, 0, t + 0.25, 0.18, 0.18);
      tone('triangle', N.G5, 0, t + 0.42, 0.18, 0.18);
      tone('triangle', N.C5, 0, t + 0.59, 0.40, 0.18, 0.01);
      tone('sine', N.C3, 0, t + 0.59, 0.50, 0.12, 0.02);
    },
    // 최고 점수 갱신: '뿅' 3번 + 팡파르 (C5-E5-G5 → C6 화음)
    highScore: function (t) {
      sweep('sine', 260, 520, t, 0.025, 0.08, 0.12);
      sweep('sine', 330, 660, t + 0.08, 0.025, 0.08, 0.12);
      sweep('sine', 390, 780, t + 0.16, 0.025, 0.08, 0.12);
      var f = t + 0.26;
      tone('square', N.C5, 0, f, 0.09, 0.08);
      tone('square', N.E5, 0, f + 0.10, 0.09, 0.08);
      tone('square', N.G5, 0, f + 0.20, 0.09, 0.08);
      tone('triangle', N.C6, 0, f + 0.30, 0.55, 0.24, 0.01);
      tone('triangle', N.G5, 0, f + 0.30, 0.55, 0.12, 0.01);
      tone('sine', N.E6, 0, f + 0.36, 0.40, 0.05);
      noise(f + 0.30, 0.35, 0.03, 'highpass', 7000);
    },
    // 일시정지 / 재개: 부드러운 단음
    pause: function (t) { tone('sine', N.A4, N.E4, t, 0.12, 0.10); },
    resume: function (t) { tone('sine', N.E4, N.A4, t, 0.12, 0.10); }
  };

  // ---- 배경음악: 오리지널 '통통' 루프, C 메이저 펜타토닉, 116 BPM, 8분음표 그리드 ----
  var BPM = 116, STEP = 60 / BPM / 2; // 8분음표 ≈ 0.259초
  // 멜로디 (0 = 쉼표). 32스텝(4마디) ≈ 8.3초, 오리지널 패턴
  var MEL = [
    N.E5, 0, N.G5, 0, N.A5, N.G5, N.E5, 0,
    N.D5, 0, N.E5, 0, N.C5, 0, 0, 0,
    N.E5, 0, N.G5, 0, N.C6, 0, N.A5, N.G5,
    N.A5, 0, N.G5, N.E5, N.D5, 0, 0, 0
  ];
  // 베이스: 마디(8스텝)마다 C3, A2, D3, G2 (모두 C 메이저 펜타토닉 음)
  var BASS = [N.C3, 110.0, 146.83, 98.0];

  function scheduleMusic() {
    if (!music.on || !ctx) return;
    try {
      while (music.nextTime < ctx.currentTime + 0.25) {
        var s = music.step % 32, t = music.nextTime, bar = Math.floor(s / 8);
        // 멜로디: 피치카토풍 짧은 triangle + 옥타브 위 sine 아주 작게
        if (MEL[s]) {
          tone('triangle', MEL[s], 0, t, STEP * 0.9, 0.45, 0.004, musicBus);
          tone('sine', MEL[s] * 2, 0, t, STEP * 0.4, 0.08, 0.004, musicBus);
        }
        // 베이스: 박 1·3에 짧은 '퐁'
        if (s % 4 === 0) tone('sine', BASS[bar], 0, t, STEP * 1.4, 0.55, 0.008, musicBus);
        // 뒷박 '칙' (아주 작은 하이햇)
        if (s % 2 === 1) {
          try {
            var ns = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
            ns.buffer = noiseBuf; nf.type = 'highpass'; nf.frequency.value = 8000;
            ng.gain.setValueAtTime(0.0001, t);
            ng.gain.exponentialRampToValueAtTime(s % 4 === 3 ? 0.12 : 0.06, t + 0.002);
            ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
            ns.connect(nf); nf.connect(ng); ng.connect(musicBus);
            ns.start(t); ns.stop(t + 0.06);
          } catch (e2) {}
        }
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
    // 반드시 사용자 제스처(click/touchend/pointerup/keydown) 핸들러 안에서 호출. 여러 번 호출해도 안전.
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
        // 워밍업: 무음 오실레이터를 한 번 돌려 첫 '뿅'의 초기화 지연을 없앤다
        if (!last.__warm) {
          last.__warm = 1;
          var o = ctx.createOscillator(), g = ctx.createGain();
          g.gain.value = 0; o.connect(g); g.connect(sfxBus);
          o.start(); o.stop(ctx.currentTime + 0.05);
        }
      } catch (e) {}
    },
    // name: start|appear|goldAppear|hit|gold|bomb|empty|combo|tick|timeUp|highScore|pause|resume
    // opts: hit → { combo }, combo → { level }, tick → { urgent }
    play: function (name, opts) {
      try {
        if (!ready() || !sfx[name]) return;
        sfx[name](ctx.currentTime, opts || {}); // 추가 지연 없이 즉시
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
