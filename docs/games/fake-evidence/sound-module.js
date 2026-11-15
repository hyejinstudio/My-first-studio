/* ===== 증거 조작범 (fake-evidence) Sound module =====
 * Web Audio API 실시간 합성. 외부 파일/의존성 없음.
 * AudioContext 미지원·생성 실패 시 모든 호출은 조용히 무시된다(게임은 소리 없이 정상 진행).
 * 사용법: 사용자 제스처(click/touchend/pointerup/keydown) 핸들러 맨 앞에서 Sound.unlock() →
 *         Sound.play('cardOpen'), Sound.play('link', { step: 1 }) 등.
 * 톤: 글을 읽는 추리 게임. 모든 소리는 짧고 부드럽게, 고음역은 필터로 깎는다.
 * 신호 경로: [sfxBus, musicBus(+echo)] → master(음소거/볼륨) → limiter(DynamicsCompressor) → destination
 */
const Sound = (function () {
  'use strict';
  var MUTE_KEY = 'fake-evidence-muted';
  var MUSIC_KEY = 'fake-evidence-music-off';   // 선택 기능: 배경음악만 끄기
  var MASTER_VOL = 0.55;   // 전체
  var MUSIC_VOL = 0.09;    // 배경음악 버스 (최종 약 -42 dBFS RMS, 효과음보다 확실히 뒤에)
  var DUCK = 0.45;         // 판정음이 날 때 음악을 이 비율로 잠시 낮춤

  var ctx = null, master = null, limiter = null, sfxBus = null, sfxTone = null;
  var musicBus = null, musicDuck = null, echoIn = null, noiseBuf = null;
  var muted = false, musicOff = false, offline = false;
  var last = {};
  var music = { on: false, timer: null, ev: 0, loop: 0, origin: 0, nodes: [], stopTimer: null };

  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { muted = false; }
  try { musicOff = localStorage.getItem(MUSIC_KEY) === '1'; } catch (e) { musicOff = false; }

  function build(c) {
    ctx = c;
    limiter = ctx.createDynamicsCompressor();          // 마스터 리미터: -6 dBFS 이상만 강하게 누름
    limiter.threshold.value = -6; limiter.knee.value = 2; limiter.ratio.value = 20;
    limiter.attack.value = 0.002; limiter.release.value = 0.15;
    limiter.connect(ctx.destination);

    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOL;
    master.connect(limiter);

    // 효과음: 6.5kHz 위를 완만히 깎아 귀 피로를 줄인다
    sfxTone = ctx.createBiquadFilter();
    sfxTone.type = 'lowpass'; sfxTone.frequency.value = 6500; sfxTone.Q.value = 0.5;
    sfxTone.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(sfxTone);

    // 음악: musicBus(트랙 볼륨/페이드) → musicDuck(판정음 덕킹) → master
    musicDuck = ctx.createGain(); musicDuck.gain.value = 1; musicDuck.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = musicOff ? 0 : MUSIC_VOL; musicBus.connect(musicDuck);

    // 피아노용 짧은 잔향(피드백 딜레이 0.43s, 피드백 0.28, 2.2kHz 로우패스)
    echoIn = ctx.createGain(); echoIn.gain.value = 0.35;
    var dl = ctx.createDelay(1.0); dl.delayTime.value = 0.43;
    var fb = ctx.createGain(); fb.gain.value = 0.28;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    echoIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(musicBus);

    var len = Math.floor(ctx.sampleRate * 0.6);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0), seed = 20261115;
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

  function throttled(key, t, gap) {
    if (last[key] !== undefined && t - last[key] < gap && t >= last[key]) return true;
    last[key] = t;
    return false;
  }

  // ---------- 음원 기본 블록 ----------
  // 단순 음: 파형, 주파수(시작→끝), 시작, 길이, 피크, 어택
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

  // 필터 노이즈: 시작, 길이, 피크, 필터 종류, 주파수(시작→끝), Q, 어택
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
      s.start(t, Math.random() * 0.2); s.stop(t + dur + 0.03);
      return s;
    } catch (e) { return null; }
  }

  // 부드러운 피아노/벨 느낌: 사인 기음 + 약한 2·3배음, 빠른 어택, 지수 감쇠, 2.5kHz 로우패스
  function pluck(f, t, dur, vol, dest, track) {
    try {
      var g = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(2500, t);
      lp.frequency.exponentialRampToValueAtTime(900, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(vol * 0.35, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      lp.connect(g); g.connect(dest || sfxBus);
      var parts = [[1, 1], [2, 0.22], [3, 0.07]];
      for (var i = 0; i < parts.length; i++) {
        var o = ctx.createOscillator(), pg = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f * parts[i][0] * (i ? 1.002 : 1);
        pg.gain.value = parts[i][1];
        o.connect(pg); pg.connect(lp);
        o.start(t); o.stop(t + dur + 0.03);
        if (track) track.push({ n: o, end: t + dur + 0.03 });
      }
      return g;
    } catch (e) { return null; }
  }

  function duck(t, hold) {
    try {
      musicDuck.gain.cancelScheduledValues(t);
      musicDuck.gain.setTargetAtTime(DUCK, t, 0.04);
      musicDuck.gain.setTargetAtTime(1, t + hold, 0.35);
    } catch (e) {}
  }

  // 음 이름 → Hz
  var N = { A2: 110.0, Bb2: 116.54, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0,
            C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, Bb4: 466.16,
            C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, D6: 1174.66 };

  // ---------- 효과음 ----------
  var sfx = {
    // 카드 열기: 종이 넘김 '스윽' (밴드패스 노이즈 상승 스윕) + 아주 작은 종이 탭
    cardOpen: function (t) {
      if (throttled('cardOpen', t, 0.06)) return;
      noise(t, 0.14, 0.20, 'bandpass', 1400, 3600, 0.9, 0.025);
      noise(t + 0.10, 0.05, 0.10, 'bandpass', 2600, 2000, 1.5, 0.003);
    },
    // 카드 닫기: 짧은 하강 노이즈 + 낮은 '톡'
    cardClose: function (t) {
      if (throttled('cardClose', t, 0.06)) return;
      noise(t, 0.09, 0.13, 'bandpass', 2800, 1300, 0.9, 0.012);
      tone('sine', 210, 150, t + 0.05, 0.06, 0.10, 0.003);
    },
    // 가짜 후보 표시: 고무 도장 '툭' (낮은 사인 낙하 + 로우패스 노이즈 짧게)
    select: function (t) {
      if (throttled('select', t, 0.05)) return;
      tone('sine', 170, 85, t, 0.11, 0.42, 0.002);
      noise(t, 0.05, 0.22, 'lowpass', 900, 400, 0.7, 0.002);
      noise(t + 0.004, 0.03, 0.05, 'bandpass', 3000, 0, 1.2, 0.002);
    },
    // 이유 선택: 연필 체크 느낌의 가벼운 나무 '똑' + 짧은 긁힘
    reason: function (t) {
      if (throttled('reason', t, 0.05)) return;
      tone('triangle', 620, 560, t, 0.06, 0.16, 0.002);
      noise(t + 0.01, 0.06, 0.06, 'bandpass', 4200, 3000, 2, 0.01);
    },
    // 제출: 차분한 2음 (D4 → A4), 결정 '탁'
    submit: function (t) {
      if (throttled('submit', t, 0.15)) return;
      noise(t, 0.04, 0.12, 'lowpass', 1200, 500, 0.7, 0.002);
      pluck(N.D4, t, 0.35, 0.26);
      pluck(N.A4, t + 0.09, 0.45, 0.24);
    },
    // 정답(가짜+이유 모두 맞음): 따뜻한 상승 아르페지오 F4-A4-D5 → D5+A5 벨, 과하지 않게
    correct: function (t) {
      duck(t, 1.0);
      pluck(N.F4, t, 0.5, 0.17);
      pluck(N.A4, t + 0.08, 0.5, 0.17);
      pluck(N.D5, t + 0.16, 0.9, 0.20);
      pluck(N.A5, t + 0.16, 0.9, 0.07);
      tone('sine', N.D6, 0, t + 0.30, 0.55, 0.03, 0.02);
    },
    // 부분 정답(증거만 맞음): 올라가다 멈추는 미해결 2음 (A4 → D5 + E5 서스)
    partial: function (t) {
      duck(t, 0.8);
      pluck(N.A4, t, 0.45, 0.20);
      pluck(N.D5, t + 0.12, 0.7, 0.18);
      pluck(N.E5, t + 0.12, 0.7, 0.09);
    },
    // 오답: 낮고 부드러운 하강 2음 (C4 → A3), 버저 없음
    wrong: function (t) {
      duck(t, 0.9);
      tone('triangle', N.C4, N.C4 * 0.985, t, 0.28, 0.20, 0.01);
      tone('triangle', N.A3, N.A3 * 0.97, t + 0.18, 0.50, 0.20, 0.01);
      tone('sine', N.A3 / 2, 0, t + 0.18, 0.45, 0.12, 0.02);
    },
    // 모순 연결선: 선이 그어지는 동안 짧은 상승 글라이드. opts.step(1~)이 클수록 시작음이 한 단계씩 높아짐
    link: function (t, opts) {
      if (throttled('link', t, 0.08)) return;
      var step = Math.max(0, Math.min(5, ((opts && +opts.step) || 1) - 1));
      var f0 = 440 * Math.pow(2, step * 2 / 12);
      tone('sine', f0, f0 * 1.5, t, 0.20, 0.13, 0.03);
      tone('sine', f0 * 1.5, 0, t + 0.17, 0.18, 0.06, 0.005);
      noise(t, 0.16, 0.025, 'bandpass', 3000, 5000, 3, 0.05);
    },
    // 다음 사건: 큰 종이 넘김 + 작은 단음
    next: function (t) {
      if (throttled('next', t, 0.2)) return;
      noise(t, 0.22, 0.20, 'bandpass', 1100, 3200, 0.8, 0.04);
      noise(t + 0.16, 0.08, 0.10, 'lowpass', 1500, 600, 0.7, 0.003);
      pluck(N.D5, t + 0.18, 0.35, 0.12);
    },
    // 사건 시작: 낮은 D3+A3 울림 → F4 피아노 한 음 (수사 시작 모티프)
    caseStart: function (t) {
      if (throttled('caseStart', t, 0.3)) return;
      tone('sine', N.D3, 0, t, 0.9, 0.16, 0.04);
      tone('triangle', N.A3, 0, t, 0.8, 0.07, 0.05);
      pluck(N.F4, t + 0.22, 0.6, 0.18);
      pluck(N.E4, t + 0.45, 0.8, 0.15);
    },
    // 최종 결과: 짧은 종지 D4-F4-A4 → D5 (약 1.3초)
    result: function (t) {
      if (throttled('result', t, 0.5)) return;
      duck(t, 1.4);
      pluck(N.D4, t, 0.5, 0.18);
      pluck(N.F4, t + 0.14, 0.5, 0.18);
      pluck(N.A4, t + 0.28, 0.5, 0.18);
      pluck(N.D5, t + 0.46, 1.0, 0.22);
      tone('sine', N.D3, 0, t + 0.46, 1.0, 0.12, 0.05);
    },
    // 새 최고 기록: 밝은 상승 D5-F5-A5-D6 + 은은한 벨 (약 1.2초). result 뒤 약 1.0초 후 권장
    best: function (t) {
      if (throttled('best', t, 0.5)) return;
      duck(t, 1.4);
      var ns = [N.D5, N.F5, N.A5, N.D6];
      for (var i = 0; i < ns.length; i++) pluck(ns[i], t + i * 0.09, 0.6 + i * 0.12, 0.15);
      pluck(N.A5, t + 0.36, 0.9, 0.07);
      noise(t + 0.30, 0.5, 0.02, 'highpass', 5000, 0, 0.7, 0.05);
    },
    // 일반 버튼: 아주 작은 '틱'
    button: function (t) {
      if (throttled('button', t, 0.04)) return;
      tone('sine', 1150, 950, t, 0.035, 0.09, 0.002);
    }
  };

  // ---------- 배경음악: 오리지널 D 마이너 패드 + 드문 피아노, 32초 루프 ----------
  var CHORD_LEN = 8;  // 초
  var CHORDS = [
    [N.D3, N.F3, N.A3, N.E4],     // Dm(add9)
    [N.Bb2, N.F3, N.A3, N.D4],    // Bbmaj7
    [N.D3 * 0.75, N.D3, N.F3, N.A3], // G2-D3-F3-A3 (Gm7sus 느낌)
    [N.A2, N.E3, N.G3, N.D4]      // A7sus4
  ];
  // 피아노 [루프 내 시각(초), 음, 홀수 루프에서도 연주?]
  var PIANO = [
    [2.0, N.E5, 1], [2.8, N.D5, 1], [6.0, N.A4, 0],
    [11.0, N.F5, 1], [11.8, N.E5, 0], [14.0, N.C5, 1],
    [18.0, N.D5, 1], [19.0, N.A4, 1], [22.5, N.Bb4, 0],
    [26.0, N.E5, 1], [26.8, N.D5, 0], [29.5, N.A4, 1]
  ];
  // 이벤트 목록(루프 내 시간순): 패드 4 + 피아노 12
  var EVENTS = (function () {
    var ev = [], i;
    for (i = 0; i < CHORDS.length; i++) ev.push({ t: i * CHORD_LEN, pad: i });
    for (i = 0; i < PIANO.length; i++) ev.push({ t: PIANO[i][0], p: i });
    ev.sort(function (a, b) { return a.t - b.t; });
    return ev;
  })();
  var LOOP_LEN = CHORD_LEN * CHORDS.length;

  function padChord(idx, t) {
    var notes = CHORDS[idx], dur = CHORD_LEN + 3.0;
    var lp = ctx.createBiquadFilter(), g = ctx.createGain();
    lp.type = 'lowpass'; lp.Q.value = 0.4;
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.linearRampToValueAtTime(850, t + CHORD_LEN * 0.5);
    lp.frequency.linearRampToValueAtTime(550, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1, t + 2.5);
    g.gain.setValueAtTime(1, t + CHORD_LEN - 0.5);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    lp.connect(g); g.connect(musicBus);
    for (var i = 0; i < notes.length; i++) {
      for (var k = -1; k <= 1; k += 2) {
        var o = ctx.createOscillator(), og = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = notes[i];
        o.detune.value = k * 5;
        og.gain.value = i === 0 ? 0.09 : 0.06;
        o.connect(og); og.connect(lp);
        o.start(t); o.stop(t + dur + 0.05);
        music.nodes.push({ n: o, end: t + dur + 0.05 });
      }
    }
  }

  function pianoNote(i, t) {
    var f = PIANO[i][1];
    var g = pluck(f, t, 2.2, 0.22, musicBus, music.nodes);
    if (g) { try { g.connect(echoIn); } catch (e) {} }
  }

  // until: 이 시각(ctx 시간)까지 예약
  function pump(until) {
    if (!music.on || !ctx) return;
    while (true) {
      var e = EVENTS[music.ev];
      var at = music.origin + music.loop * LOOP_LEN + e.t;
      if (at > until) break;
      if (e.pad !== undefined) padChord(e.pad, at);
      else if (music.loop % 2 === 0 || PIANO[e.p][2]) pianoNote(e.p, at);
      music.ev++;
      if (music.ev >= EVENTS.length) { music.ev = 0; music.loop++; }
    }
    // 끝난 노드 정리
    var now = ctx.currentTime, keep = [];
    for (var k = 0; k < music.nodes.length; k++) if (music.nodes[k].end > now) keep.push(music.nodes[k]);
    music.nodes = keep;
  }

  function scheduleMusic() {
    music.timer = null;
    if (!music.on || !ctx) return;
    try { pump(ctx.currentTime + 0.6); } catch (e) {}
    music.timer = setTimeout(scheduleMusic, 200);
  }

  function killMusicNodes(at) {
    for (var k = 0; k < music.nodes.length; k++) {
      try { music.nodes[k].n.stop(at); } catch (e) {}
    }
    music.nodes = [];
  }

  // 탭 전환 시 일시정지 / 복귀 시 재개
  try {
    document.addEventListener('visibilitychange', function () {
      if (!ctx || offline) return;
      try {
        if (document.hidden) {
          var p1 = ctx.suspend(); if (p1 && p1.catch) p1.catch(function () {});
        } else {
          var p2 = ctx.resume(); if (p2 && p2.catch) p2.catch(function () {});
        }
      } catch (e) {}
    });
  } catch (e) {}

  function setMusicGain(v, tc) {
    try {
      var t = ctx.currentTime;
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setTargetAtTime(v, t, tc || 0.3);
    } catch (e) {}
  }

  return {
    // 반드시 사용자 제스처 핸들러 안에서 호출. 여러 번 호출해도 안전.
    unlock: function () {
      if (!ensureCtx() || offline) return;
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
    // name: cardOpen|cardClose|select|reason|submit|correct|partial|wrong|link|next|caseStart|result|best|button
    // link만 opts { step: 1,2,3.. } 사용(연결선 순번)
    play: function (name, opts) {
      try {
        if (!ready() || !sfx.hasOwnProperty(name)) return;
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
    // 배경음악 시작(이미 재생 중이면 무시). unlock 이전 호출은 무시되므로 첫 제스처 뒤에 호출.
    startMusic: function () {
      if (!ctx) return;
      if (music.stopTimer) {               // 페이드아웃 도중 재시작: 페이드만 되돌림
        clearTimeout(music.stopTimer); music.stopTimer = null;
        if (music.on) { setMusicGain(musicOff ? 0 : MUSIC_VOL, 0.3); return; }
      }
      if (music.on) return;
      try {
        music.on = true; music.ev = 0; music.loop = 0;
        music.origin = ctx.currentTime + 0.1;
        setMusicGain(musicOff ? 0 : MUSIC_VOL, 0.05);
      } catch (e) { music.on = false; return; }
      if (offline) return;
      scheduleMusic();
    },
    // 배경음악 정지(약 1.2초 페이드아웃)
    stopMusic: function () {
      if (!music.on || !ctx) return;
      if (music.timer) { clearTimeout(music.timer); music.timer = null; }
      setMusicGain(0, 0.35);
      if (music.stopTimer) clearTimeout(music.stopTimer);
      music.stopTimer = setTimeout(function () {
        music.stopTimer = null; music.on = false;
        try { killMusicNodes(ctx.currentTime + 0.02); } catch (e) {}
      }, 1200);
    },
    // (선택) 배경음악만 끄기/켜기. 음소거와 별개, localStorage 'fake-evidence-music-off'
    setMusicEnabled: function (on) {
      musicOff = !on;
      try { localStorage.setItem(MUSIC_KEY, musicOff ? '1' : '0'); } catch (e) {}
      if (ctx && music.on && !music.stopTimer) setMusicGain(musicOff ? 0 : MUSIC_VOL, 0.3);
    },
    isMusicEnabled: function () { return !musicOff; },
    // 테스트 전용: OfflineAudioContext에 그래프를 붙여 렌더 검사
    _test: {
      attach: function (c) { offline = true; last = {}; build(c); },
      playAt: function (name, t, opts) { if (sfx.hasOwnProperty(name)) sfx[name](t, opts || {}); },
      startMusicAt: function (t) { music.on = true; music.ev = 0; music.loop = 0; music.origin = t; music.nodes = []; },
      pump: function (until) { pump(until); },
      sfxNames: function () { return Object.keys(sfx); }
    }
  };
})();
