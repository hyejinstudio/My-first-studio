/* ===== 짝꿍 카드 (pair-flip) Sound module =====
 * Web Audio API 실시간 합성. 외부 파일/의존성 없음.
 * AudioContext 미지원·생성 실패 시 모든 호출은 조용히 무시된다(게임은 소리 없이 정상 진행).
 * 사용법: 사용자 제스처(click/touchend/pointerup/keydown) 핸들러 맨 앞에서 Sound.unlock() →
 *         Sound.play('flip'), Sound.play('match', { combo: 3 }), Sound.play('clear') 등.
 * 톤: 나무 테이블 위 종이 카드. 마림바·작은 종('딩')·카드 마찰음. 버저·사각파 없음(효과음 버스 8kHz 로우패스).
 * 조성: C 장조(5음 음계 위주). 모든 멜로디는 오리지널.
 *
 * [연타 규칙] 'flip'은 가장 자주 나는 소리라 가장 작고 짧다(~35ms). 동시 발음 최대 3개(넘치면 가장 오래된 것을
 *   10ms 안에 줄임), 25ms 스로틀, 직전 flip과의 간격이 짧을수록 자동으로 더 작아진다.
 *
 * 신호 경로: sfxBus → LP 8kHz ┐
 *            musicBus → musicDuck(순간 덕킹) ┴→ master(음소거) → limiter → destination
 */
const Sound = (function () {
  'use strict';
  var MUTE_KEY = 'pair-flip-muted';
  var MUSIC_KEY = 'pair-flip-music';
  var MASTER_VOL = 0.6;
  var MUSIC_VOL = 0.10;      // 배경음악 버스(집중 게임이라 아주 작게)
  var MUSIC_DEFAULT = false; // BGM 기본 꺼짐(집중·기록 게임). 🎵 버튼으로 켜면 저장
  var DUCK = 0.4;            // 클리어·기록 팡파레 때 음악을 잠깐 낮추는 비율
  var FLIP_CAP = 3;          // 카드 '탁' 동시 발음 최대 수

  var ctx = null, master = null, limiter = null, sfxBus = null, sfxTone = null;
  var musicBus = null, musicDuck = null, noiseBuf = null;
  var muted = false, musicPref = MUSIC_DEFAULT, offline = false;
  var last = {}, flipPool = [];
  var music = { want: false, on: false, timer: null, step: 0, nextAt: 0, nodes: [], stopTimer: null };

  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { muted = false; }
  try {
    var mv = localStorage.getItem(MUSIC_KEY);
    musicPref = mv === null ? MUSIC_DEFAULT : mv === '1';
  } catch (e) { musicPref = MUSIC_DEFAULT; }

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
    sfxTone.type = 'lowpass'; sfxTone.frequency.value = 8000; sfxTone.Q.value = 0.5;
    sfxTone.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(sfxTone);

    musicDuck = ctx.createGain(); musicDuck.gain.value = 1; musicDuck.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_VOL; musicBus.connect(musicDuck);

    var len = Math.floor(ctx.sampleRate * 0.6);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0), seed = 20261126;
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
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ---------- 음원 기본 블록 (엔벨로프는 0.0001에서 지수 어택/감쇠 — 클릭음 방지) ----------
  function tone(type, f0, f1, t, dur, vol, attack, dest, track) {
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
      if (track) track.push({ n: o, end: t + dur + 0.03 });
      return o;
    } catch (e) { return null; }
  }

  function noise(t, dur, vol, ftype, f0, f1, q, attack, dest, track) {
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
      s.start(t, Math.random() * 0.4); s.stop(t + dur + 0.03);
      if (track) track.push({ n: s, end: t + dur + 0.03 });
      return s;
    } catch (e) { return null; }
  }

  // 마림바: sine 기음 + 4배 배음(10%, 30ms 이내 소멸)
  function mallet(f, t, dur, vol, dest, track) {
    tone('sine', f, 0, t, dur, vol, 0.003, dest, track);
    tone('sine', f * 4, 0, t, Math.min(0.03, dur * 0.3), vol * 0.10, 0.001, dest, track);
  }
  // 작은 종 '딩': sine 기음 + 2배(빠르게 사라짐) + 3배(아주 작게). 순수 배음이라 맑고 둥글다
  function bell(f, t, dur, vol, dest) {
    tone('sine', f, 0, t, dur, vol, 0.002, dest);
    tone('sine', f * 2, 0, t, dur * 0.35, vol * 0.28, 0.002, dest);
    tone('sine', f * 3, 0, t, dur * 0.15, vol * 0.08, 0.001, dest);
  }

  // 카드 '탁' 전용 보이스: 동시 발음이 FLIP_CAP을 넘으면 가장 오래된 소리를 10ms 안에 줄여 없앤다
  function flipVoice(t, dur) {
    var keep = [];
    for (var i = 0; i < flipPool.length; i++) if (flipPool[i].end > t) keep.push(flipPool[i]);
    flipPool = keep;
    if (flipPool.length >= FLIP_CAP) {
      var old = flipPool.shift();
      try { old.g.gain.setTargetAtTime(0, t, 0.004); } catch (e) {}
    }
    var g = ctx.createGain(); g.gain.value = 1; g.connect(sfxBus);
    flipPool.push({ g: g, end: t + dur });
    return g;
  }

  // 직전 같은 소리와의 간격(초)
  function gapOf(key, t) {
    var prev = last[key + ':d'];
    var gap = (prev === undefined || t < prev) ? 1 : t - prev;
    last[key + ':d'] = t;
    return gap;
  }

  function duck(t, hold) {
    try {
      musicDuck.gain.cancelScheduledValues(t);
      musicDuck.gain.setTargetAtTime(DUCK, t, 0.04);
      musicDuck.gain.setTargetAtTime(1, t + hold, 0.4);
    } catch (e) {}
  }

  var N = { C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.0, A2: 110.0,
            C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
            C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
            C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77,
            C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, A6: 1760.0, C7: 2093.0 };
  // 짝 맞음 콤보 음계(C 장조 5음 음계, 콤보 1부터 한 칸씩 상승, 8 이상은 마지막 음 고정)
  var COMBO = [N.E5, N.G5, N.A5, N.C6, N.D6, N.E6, N.G6, N.A6];

  // ---------- 효과음 ----------
  var sfx = {
    // 일반 UI 버튼: 부드러운 '톡'
    button: function (t) {
      if (throttled('button', t, 0.05)) return;
      tone('sine', 660, 520, t, 0.055, 0.10, 0.002);
      noise(t, 0.02, 0.045, 'bandpass', 2500, 0, 1.2, 0.001);
    },
    // 미리보기 카운트 틱(남은 초마다). opts.last=true(마지막 1초)면 한 음 높게(G5→C6) 조금 크게
    tick: function (t, o) {
      if (throttled('tick', t, 0.2)) return;
      var fin = !!o.last;
      noise(t, 0.015, 0.035, 'bandpass', 2200, 0, 1.6, 0.001);
      mallet(fin ? N.C6 : N.G5, t, 0.16, fin ? 0.09 : 0.065);
    },
    // 전체 뒤집힘 '촤르륵': 카드 마찰 클릭 10~16개(길이×30)(점점 빨라졌다 느려짐) + 부드러운 바람(노이즈 스윕) + 끝에 작은 마림바(이제 시작)
    // opts.dur: 뒤집힘 애니메이션 길이(초, 0.2~1.2, 기본 0.3 = 기획 확정값)에 맞춰 늘고 줄어든다
    flipAll: function (t, o) {
      if (throttled('flipAll', t, 0.3)) return;
      var dur = clamp(+o.dur || 0.3, 0.2, 1.2), n = Math.round(clamp(dur * 30, 10, 16)), i;
      for (i = 0; i < n; i++) {
        var x = i / (n - 1);
        var ti = t + dur * (0.5 - 0.5 * Math.cos(Math.PI * x)) * 0.92;   // 가운데가 촘촘
        var r = 0.9 + Math.random() * 0.2;
        var v = 0.05 + 0.03 * Math.sin(Math.PI * x);
        noise(ti, 0.018, v, 'bandpass', (2600 + 900 * x) * r, 0, 1.4, 0.001);
      }
      noise(t, dur, 0.035, 'bandpass', 900, 3200, 0.7, dur * 0.45);
      mallet(N.C5, t + dur, 0.22, 0.07);
      mallet(N.G5, t + dur + 0.06, 0.25, 0.06);
    },
    // 카드 한 장 뒤집기 '탁': 종이 마찰(밴드패스 노이즈 3.2kHz, 22ms) + 아주 짧은 나무 '톡'(sine 1300→800Hz, 25ms)
    // 음높이 ±4% 무작위. 연타 간격이 짧을수록 작게(최소 0.6배). opts.back=true(틀려서 되돌아갈 때)는 더 작고 낮게
    flip: function (t, o) {
      if (throttled('flip', t, 0.025)) return;
      var gap = gapOf('flip', t);
      var dens = clamp(0.6 + gap * 2, 0.6, 1) * (o.back ? 0.6 : 1);
      var r = (0.96 + Math.random() * 0.08) * (o.back ? 0.85 : 1);
      var v = flipVoice(t, 0.06);
      noise(t, 0.022, 0.07 * dens, 'bandpass', 3200 * r, 2200 * r, 1.3, 0.001, v);
      tone('sine', 1300 * r, 800 * r, t + 0.002, 0.025, 0.045 * dens, 0.001, v);
    },
    // 짝 맞음 '딩': 작은 종 + 0.05초 뒤 5도 위 작은 종. opts.combo(연속 맞힘 수, 1부터)로 C 장조 5음 음계를 한 칸씩 상승
    // 콤보 5 이상이면 한 옥타브 위 반짝임 추가. 콤보 1(또는 미지정)이 기본음 E5
    match: function (t, o) {
      if (throttled('judge', t, 0.08)) return;
      var c = Math.max(1, Math.round(+o.combo || 1));
      var f = COMBO[Math.min(c, COMBO.length) - 1];
      bell(f, t, 0.45, 0.13);
      bell(f * 1.5, t + 0.05, 0.35, 0.06);
      if (c >= 5) tone('sine', f * 2, 0, t + 0.1, 0.2, 0.025, 0.003);
    },
    // 틀림 '뚱': 부드러운 낮은 음 하나(sine 247→220Hz + triangle 받침 작게), 날카로운 성분 없음. 자주 나도 짜증나지 않게 짧고 작게
    miss: function (t) {
      if (throttled('judge', t, 0.08)) return;
      tone('sine', N.B3, N.A3, t, 0.26, 0.10, 0.01);
      tone('triangle', N.B3 * 0.5, N.A3 * 0.5, t, 0.22, 0.045, 0.012);
      noise(t, 0.03, 0.015, 'lowpass', 600, 0, 0.7, 0.003);
    },
    // 마지막 짝/클리어 팡파레: 마림바 C5-E5-G5-C6 상승(80ms) + 종 E6 + C 장조 화음 지속 1초
    clear: function (t) {
      if (throttled('clear', t, 0.5)) return;
      duck(t, 1.6);
      var ns = [N.C5, N.E5, N.G5, N.C6];
      for (var i = 0; i < ns.length; i++) mallet(ns[i], t + i * 0.08, 0.3, 0.15);
      bell(N.E6, t + 0.32, 0.6, 0.08);
      tone('sine', N.C5, 0, t + 0.32, 1.1, 0.07, 0.03);
      tone('sine', N.E5, 0, t + 0.32, 1.1, 0.055, 0.03);
      tone('sine', N.G5, 0, t + 0.32, 1.1, 0.05, 0.03);
      tone('triangle', N.C3, 0, t + 0.32, 1.0, 0.12, 0.02);
    },
    // 새 기록: 빠른 반짝 상승 G5-A5-C6-D6-E6-G6(55ms) + 종 C6 + F→C(버금딸림→으뜸) 2화음. 클리어 팡파레와 다른 '축하'
    record: function (t) {
      if (throttled('record', t, 0.8)) return;
      duck(t, 2.0);
      var run = [N.G5, N.A5, N.C6, N.D6, N.E6, N.G6], i;
      for (i = 0; i < run.length; i++) mallet(run[i], t + i * 0.055, 0.2, 0.10);
      bell(N.C6, t + 0.36, 0.7, 0.10);
      var c1 = [N.F4, N.A4, N.C5], c2 = [N.E4, N.G4, N.C5];
      for (i = 0; i < 3; i++) tone('sine', c1[i], 0, t + 0.36, 0.45, 0.05, 0.02);
      tone('triangle', N.F2 * 2, 0, t + 0.36, 0.4, 0.10, 0.02);
      for (i = 0; i < 3; i++) tone('sine', c2[i], 0, t + 0.78, 1.1, 0.055, 0.02);
      tone('triangle', N.C3, 0, t + 0.78, 1.0, 0.11, 0.02);
      bell(N.G6, t + 0.78, 0.5, 0.04);
    }
  };

  // ---------- 배경음악(선택, 기본 꺼짐): 오리지널 C 장조 '찻집' 루프 ----------
  // 72 BPM, 8분음표 스텝, 8마디(64스텝, 약 26.7초). 화음 2마디씩: Cmaj7 | Am7 | Fmaj7 | G6
  // 패드(sine, 느린 어택) + 베이스(triangle 1박) + 성긴 마림바 멜로디(2마디에 3~4음, 3번째 루프마다 쉼).
  // 카드 효과음(3kHz 대)·딩(660Hz~1.8kHz)과 겹치지 않게 멜로디는 아주 작고 성기다.
  var STEPS = 64, BPM = 72;
  var CH = [
    { bass: N.C3, notes: [N.E4, N.G4, N.B4] },
    { bass: N.A2, notes: [N.E4, N.G4, N.C5] },
    { bass: N.F2, notes: [N.E4, N.A4, N.C5] },
    { bass: N.G2, notes: [N.D4, N.G4, N.B4] }
  ];
  // [스텝, 음, 길이(스텝)] — A안(짝수 루프), B안(홀수 루프)
  var MEL_A = [
    [2, N.G5, 2], [5, N.E5, 3], [10, N.D5, 4],
    [18, N.C5, 2], [21, N.E5, 3], [26, N.A5, 4],
    [34, N.A5, 2], [37, N.G5, 3], [42, N.E5, 4],
    [50, N.D5, 2], [53, N.G5, 3], [58, N.D5, 4]
  ];
  var MEL_B = [
    [2, N.E5, 2], [5, N.G5, 3], [10, N.C6, 4],
    [18, N.A5, 2], [21, N.G5, 3], [26, N.E5, 4],
    [34, N.C5, 2], [37, N.D5, 3], [42, N.E5, 4],
    [50, N.G5, 2], [53, N.D5, 3], [58, N.C5, 6]
  ];

  function musicStep(s, loop, t, st) {
    var bar = Math.floor(s / 8), pos = s % 8, ch = CH[Math.floor(bar / 2) % 4];
    var mb = musicBus, tr = music.nodes, i;
    if (pos === 0) {
      for (i = 0; i < ch.notes.length; i++) tone('sine', ch.notes[i], 0, t, st * 8.5, 0.05, 0.4, mb, tr);
      tone('triangle', ch.bass, 0, t, st * 5, 0.22, 0.02, mb, tr);
    }
    if (pos === 4 && bar % 2 === 1) tone('triangle', ch.bass * 1.5, 0, t, st * 3, 0.14, 0.02, mb, tr);
    if (loop % 3 !== 2) {
      var mel = loop % 2 ? MEL_B : MEL_A;
      for (i = 0; i < mel.length; i++) {
        if (mel[i][0] === s) mallet(mel[i][1], t, Math.max(0.35, mel[i][2] * st * 0.9), 0.16, mb, tr);
      }
    }
  }

  function pump(until) {
    if (!music.on || !ctx) return;
    var st = 60 / BPM / 2;
    while (music.nextAt <= until) {
      musicStep(music.step % STEPS, Math.floor(music.step / STEPS), music.nextAt, st);
      music.step++;
      music.nextAt += st;
    }
    var now = ctx.currentTime, keep = [];
    for (var k = 0; k < music.nodes.length; k++) if (music.nodes[k].end > now) keep.push(music.nodes[k]);
    music.nodes = keep;
  }

  function scheduleMusic() {
    music.timer = null;
    if (!music.on || !ctx) return;
    try {
      // 탭 복귀 등으로 많이 밀렸으면 지금부터 다시 맞춤(밀린 음을 한꺼번에 몰아 치지 않음)
      if (ctx.currentTime - music.nextAt > 0.3) music.nextAt = ctx.currentTime + 0.05;
      pump(ctx.currentTime + 0.3);
    } catch (e) {}
    music.timer = setTimeout(scheduleMusic, 100);
  }

  function killNodes(list, at) {
    for (var k = 0; k < list.length; k++) { try { list[k].n.stop(at); } catch (e) {} }
    list.length = 0;
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

  function setMusicGain(v, tc) {
    try {
      var t = ctx.currentTime;
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setTargetAtTime(v, t, tc || 0.3);
    } catch (e) {}
  }

  // 실제 재생 시작/정지 (want && musicPref 일 때만 재생)
  function musicOn() {
    if (!ctx) return;
    if (music.stopTimer) {
      clearTimeout(music.stopTimer); music.stopTimer = null;
      if (music.on) { setMusicGain(MUSIC_VOL, 0.3); if (!music.timer && !offline) scheduleMusic(); return; }
    }
    if (music.on) return;
    try {
      music.on = true; music.step = 0;
      music.nextAt = ctx.currentTime + 0.1;
      setMusicGain(MUSIC_VOL, 0.05);
    } catch (e) { music.on = false; return; }
    if (offline) return;
    scheduleMusic();
  }
  function musicOff() {
    if (!music.on || !ctx) return;
    if (music.timer) { clearTimeout(music.timer); music.timer = null; }
    setMusicGain(0, 0.3);
    if (music.stopTimer) clearTimeout(music.stopTimer);
    music.stopTimer = setTimeout(function () {
      music.stopTimer = null; music.on = false;
      try { killNodes(music.nodes, ctx.currentTime + 0.02); } catch (e) {}
    }, 1000);
  }

  return {
    // 반드시 사용자 제스처 핸들러 안에서 호출. 여러 번 호출해도 안전.
    unlock: function () {
      if (!ensureCtx() || offline) return;
      try {
        if (ctx.state !== 'running') { var p = ctx.resume(); if (p && p.catch) p.catch(function () {}); }
        var b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
        s.buffer = b; s.connect(ctx.destination); s.start(0);
      } catch (e) {}
      // BGM을 원하는 상태인데 unlock 전에 startMusic이 불렸으면 지금 시작
      if (music.want && musicPref && !music.on) musicOn();
    },
    // name: button|tick|flipAll|flip|match|miss|clear|record
    // opts: tick {last}, flipAll {dur}, flip {back}, match {combo}
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
    // 배경음악만 켜기/끄기(설정 저장, 기본 꺼짐). 효과음은 그대로. 음소거(setMuted)는 전체.
    setMusicOn: function (on) {
      musicPref = !!on;
      try { localStorage.setItem(MUSIC_KEY, musicPref ? '1' : '0'); } catch (e) {}
      if (musicPref && music.want) musicOn(); else musicOff();
    },
    isMusicOn: function () { return musicPref; },
    // 배경음악 시작 요청(이미 재생 중이면 무시). BGM 설정이 꺼져 있으면 재생하지 않고, 나중에 켜면 그때 시작.
    startMusic: function () {
      music.want = true;
      if (musicPref) musicOn();
    },
    // 배경음악 정지(약 1초 페이드아웃)
    stopMusic: function () {
      music.want = false;
      musicOff();
    },
    // 테스트 전용: OfflineAudioContext에 그래프를 붙여 렌더 검사
    _test: {
      attach: function (c) { offline = true; last = {}; flipPool = []; music.nodes = []; build(c); },
      playAt: function (name, t, opts) { if (sfx.hasOwnProperty(name)) sfx[name](t, opts || {}); },
      startMusicAt: function (t) { music.on = true; music.step = 0; music.nextAt = t; music.nodes = []; },
      pump: function (until) { pump(until); },
      sfxNames: function () { return Object.keys(sfx); }
    }
  };
})();
