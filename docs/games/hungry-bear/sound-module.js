/* ===== 폭식 불곰을 찾아라 (hungry-bear) Sound module =====
 * Web Audio API 실시간 합성. 외부 파일/의존성 없음.
 * AudioContext 미지원·생성 실패 시 모든 호출은 조용히 무시된다(게임은 소리 없이 정상 진행).
 * 사용법: 사용자 제스처(click/touchend/pointerup/keydown) 핸들러 맨 앞에서 Sound.unlock() →
 *         Sound.play('splash'), Sound.play('eat'), Sound.play('tally', { n: 3 }) 등.
 * 톤: 숲속 강가. 칼림바·나무 소리·물소리. 버저·사각파·날카로운 고음 없음(효과음 버스 7kHz 로우패스).
 * 조성: G 장조(효과음과 BGM 통일). 모든 멜로디는 오리지널.
 *
 * [공정성 규칙] 'eat'은 곰 번호를 받지 않는다. 세 곰의 먹는 소리는 완전히 같은 소리이며
 *   (패닝 없음, 음높이 무작위 ±3%는 모든 호출에 같은 분포) 소리로 곰을 구별할 수 없다.
 *   빠른 구간(연어 간격 ~120ms)에서는 간격에 따라 자동으로 짧고 작아지며(곰과 무관),
 *   첨벙·냠 동시 발음은 최대 4개로 제한된다.
 *
 * 신호 경로: sfxBus → LP 7kHz ┐
 *            musicBus → musicDuck(순간 덕킹) ┴→ master(음소거) → limiter → destination
 */
const Sound = (function () {
  'use strict';
  var MUTE_KEY = 'hungry-bear-muted';
  var MUSIC_KEY = 'hungry-bear-music';
  var MASTER_VOL = 0.6;
  var MUSIC_VOL = 0.14;      // 배경음악 버스 (효과음보다 확실히 뒤에)
  var DUCK = 0.45;           // 결과음이 날 때 음악을 잠깐 낮추는 비율
  var HIT_CAP = 4;           // 첨벙·냠 동시 발음 최대 수

  var ctx = null, master = null, limiter = null, sfxBus = null, sfxTone = null;
  var musicBus = null, musicDuck = null, noiseBuf = null;
  var muted = false, musicPref = true, offline = false;
  var last = {}, hitPool = [];
  var music = { want: false, on: false, timer: null, step: 0, nextAt: 0, nodes: [], stopTimer: null,
                mode: 'calm', level: 1 };

  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { muted = false; }
  try { musicPref = localStorage.getItem(MUSIC_KEY) !== '0'; } catch (e) { musicPref = true; }

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
    sfxTone.type = 'lowpass'; sfxTone.frequency.value = 7000; sfxTone.Q.value = 0.5;
    sfxTone.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(sfxTone);

    musicDuck = ctx.createGain(); musicDuck.gain.value = 1; musicDuck.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_VOL; musicBus.connect(musicDuck);

    var len = Math.floor(ctx.sampleRate * 0.6);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0), seed = 20261116;
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

  // ---------- 음원 기본 블록 ----------
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
      s.start(t, Math.random() * 0.2); s.stop(t + dur + 0.03);
      if (track) track.push({ n: s, end: t + dur + 0.03 });
      return s;
    } catch (e) { return null; }
  }

  // 칼림바: sine 기음 + 비조화 금속 배음(5.4배, 40ms 이내 소멸)
  function kalimba(f, t, dur, vol, dest, track) {
    tone('sine', f, 0, t, dur, vol, 0.003, dest, track);
    tone('sine', f * 5.4, 0, t, Math.min(0.04, dur * 0.3), vol * 0.12, 0.001, dest, track);
  }

  // 첨벙·냠 전용 보이스: 동시 발음이 HIT_CAP을 넘으면 가장 오래된 소리를 10ms 안에 줄여 없앤다
  function hitVoice(t, dur) {
    var keep = [];
    for (var i = 0; i < hitPool.length; i++) if (hitPool[i].end > t) keep.push(hitPool[i]);
    hitPool = keep;
    if (hitPool.length >= HIT_CAP) {
      var old = hitPool.shift();
      try { old.g.gain.setTargetAtTime(0, t, 0.004); } catch (e) {}
    }
    var g = ctx.createGain(); g.gain.value = 1; g.connect(sfxBus);
    hitPool.push({ g: g, end: t + dur });
    return g;
  }

  // 연속 발음 밀도 계수: 직전 같은 소리와의 간격(초)이 짧을수록 작고 짧게. 곰과 무관한 시간 정보만 쓴다.
  function density(key, t) {
    var prev = last[key + ':d'];
    var gap = (prev === undefined || t < prev) ? 1 : t - prev;
    last[key + ':d'] = t;
    return gap;
  }

  function duck(t, hold) {
    try {
      musicDuck.gain.cancelScheduledValues(t);
      musicDuck.gain.setTargetAtTime(DUCK, t, 0.04);
      musicDuck.gain.setTargetAtTime(1, t + hold, 0.35);
    } catch (e) {}
  }

  var N = { E2: 82.41, G2: 98.0, A2: 110.0, B2: 123.47, C3: 130.81, D3: 146.83, E3: 164.81, Fs3: 185.0,
            G3: 196.0, A3: 220.0, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, Fs4: 369.99,
            G4: 392.0, A4: 440.0, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, Fs5: 739.99,
            G5: 783.99, A5: 880.0, B5: 987.77, D6: 1174.66, E6: 1318.51, G6: 1567.98 };
  // 해설 틱 음계(G 장조 5음 음계, 한 칸씩 상승)
  var TALLY = [N.G4, N.A4, N.B4, N.D5, N.E5, N.G5, N.A5, N.B5, N.D6, N.E6, N.G6];

  // ---------- 효과음 ----------
  var sfx = {
    // 시작 카운트(3·2·1 각각): 나무 '톡' + 칼림바 D5
    count: function (t) {
      if (throttled('count', t, 0.25)) return;
      noise(t, 0.025, 0.06, 'bandpass', 1800, 0, 1.5, 0.001);
      kalimba(N.D5, t, 0.22, 0.15);
    },
    // 시작 신호(카운트 끝 "시작!"): 칼림바 G5 + D6 동시 + 작은 물방울
    go: function (t) {
      if (throttled('go', t, 0.3)) return;
      kalimba(N.G5, t, 0.4, 0.15);
      kalimba(N.D6, t + 0.01, 0.35, 0.08);
      tone('sine', 900, 1500, t + 0.05, 0.05, 0.04, 0.002);
    },
    // 첨벙: 연어가 강에서 튀어오를 때. 밴드패스 노이즈 하강 + 작은 물방울. 연속이면 자동으로 작고 짧게
    splash: function (t) {
      if (throttled('splash', t, 0.04)) return;
      var gap = density('splash', t);
      var dens = clamp(0.65 + gap * 1.2, 0.65, 1);
      var dur = clamp(gap * 0.9, 0.07, 0.13);
      var r = 0.94 + Math.random() * 0.12;
      var v = hitVoice(t, dur + 0.05);
      noise(t, dur, 0.13 * dens, 'bandpass', 2400 * r, 800 * r, 0.9, 0.006, v);
      tone('sine', 900 * r, 1500 * r, t + 0.025, 0.035, 0.035 * dens, 0.002, v);
    },
    // 냠: 곰이 연어를 먹을 때. 세 곰 모두 완전히 같은 소리(인자 없음, 패닝 없음).
    // 짧은 '앙' 깨물기(로우패스 노이즈) + 낮은 '냠'(triangle 하강, 2kHz 로우패스) + 작은 윗소리.
    // 음높이 무작위 ±3%는 모든 호출 동일 분포. 연속이면 간격에 따라 자동으로 작고 짧게
    eat: function (t) {
      if (throttled('eat', t, 0.04)) return;
      var gap = density('eat', t);
      var dens = clamp(0.65 + gap * 1.2, 0.65, 1);
      var dur = clamp(gap * 0.75, 0.06, 0.1);
      var r = 0.97 + Math.random() * 0.06;
      var v = hitVoice(t, dur + 0.05);
      var lp;
      try { lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2000; lp.Q.value = 0.6; lp.connect(v); }
      catch (e) { lp = v; }
      noise(t, dur * 0.5, 0.12 * dens, 'lowpass', 1400, 400, 0.7, 0.002, v);
      tone('triangle', 330 * r, 230 * r, t + 0.004, dur, 0.17 * dens, 0.006, lp);
      tone('sine', 520 * r, 380 * r, t + 0.012, dur * 0.6, 0.05 * dens, 0.004, lp);
    },
    // 곰 선택(정답 확인 전): 나무 '툭' + 작은 B4
    select: function (t) {
      if (throttled('select', t, 0.2)) return;
      tone('sine', 240, 150, t, 0.07, 0.16, 0.002);
      noise(t, 0.03, 0.07, 'bandpass', 1200, 0, 1.2, 0.001);
      kalimba(N.B4, t + 0.02, 0.18, 0.08);
    },
    // 정답: 밝은 상승 G5-B5-D6 + 작은 반짝임
    correct: function (t) {
      if (throttled('result', t, 0.4)) return;
      duck(t, 0.9);
      kalimba(N.G5, t, 0.3, 0.16);
      kalimba(N.B5, t + 0.08, 0.3, 0.15);
      kalimba(N.D6, t + 0.16, 0.55, 0.15);
      tone('sine', N.G6, 0, t + 0.24, 0.3, 0.025, 0.01);
    },
    // 오답: 부드러운 하강 2음 (E4 → C4, 살짝 처짐) + 낮은 받침. 버저 없음
    wrong: function (t) {
      if (throttled('result', t, 0.4)) return;
      duck(t, 1.0);
      tone('triangle', N.E4, N.E4 * 0.98, t, 0.3, 0.17, 0.01);
      tone('triangle', N.C4, N.C4 * 0.96, t + 0.22, 0.55, 0.17, 0.01);
      tone('sine', N.C3, 0, t + 0.22, 0.5, 0.12, 0.02);
    },
    // 해설 카운트 틱: 곰별 먹은 수가 하나씩 쌓일 때. opts.n(1부터)으로 5음 음계를 한 칸씩 올라감(11칸 이후 고정)
    tally: function (t, o) {
      if (throttled('tally', t, 0.035)) return;
      var n = Math.max(1, Math.round(+o.n || 1));
      var f = TALLY[Math.min(n, TALLY.length) - 1];
      kalimba(f, t, 0.14, 0.10);
      noise(t, 0.012, 0.025, 'bandpass', 3000, 0, 2, 0.001);
    },
    // 레벨업: 칼림바 G4-B4-D5-G5 상승(90ms) + 부드러운 화음 G5·B5
    levelUp: function (t) {
      if (throttled('levelUp', t, 0.5)) return;
      duck(t, 1.3);
      var ns = [N.G4, N.B4, N.D5, N.G5];
      for (var i = 0; i < ns.length; i++) kalimba(ns[i], t + i * 0.09, 0.3, 0.14);
      tone('sine', N.G5, 0, t + 0.36, 0.8, 0.07, 0.03);
      tone('sine', N.B5, 0, t + 0.36, 0.8, 0.05, 0.03);
      tone('sine', N.G3, 0, t + 0.36, 0.8, 0.08, 0.03);
    },
    // 게임오버: 느린 하강 D5-B4-A4-G4(점점 처짐) + 낮은 G2 받침. 아쉬움 정도
    gameOver: function (t) {
      if (throttled('gameOver', t, 0.5)) return;
      duck(t, 2.0);
      var ns = [N.D5, N.B4, N.A4, N.G4];
      for (var i = 0; i < ns.length; i++) kalimba(ns[i] * (1 - i * 0.004), t + i * 0.27, 0.45 + i * 0.2, 0.15);
      tone('triangle', N.G2, 0, t + 0.81, 1.1, 0.14, 0.04);
    },
    // 일반 버튼: 부드러운 '톡'
    button: function (t) {
      if (throttled('button', t, 0.05)) return;
      tone('sine', 660, 520, t, 0.055, 0.10, 0.002);
      noise(t, 0.02, 0.045, 'bandpass', 2500, 0, 1.2, 0.001);
    }
  };

  // ---------- 배경음악: 오리지널 G 장조 강가 루프 ----------
  // 8분음표 스텝, 8마디(64스텝). 화음 2마디씩: Gmaj7 | Em7 | Cmaj7 | Dsus4
  // 'calm' 모드: 80 BPM(≈24초 루프). 패드 + 베이스 + 칼림바 멜로디.
  // 'feed' 모드: 96 + (레벨-1)*4 BPM(최대 120). 멜로디 없음. 낮은 북 '둥'(200Hz 이하) + 고역 셰이커(7kHz 이상)만 추가해
  //              '냠'·'첨벙'이 있는 중역(200Hz~3kHz)을 비워 둔다. 연어 타이밍과 동기화하지 않는다(일정한 박).
  var STEPS = 64;
  var CH = [
    { bass: N.G2, notes: [N.B3, N.D4, N.Fs4] },
    { bass: N.E2, notes: [N.G3, N.B3, N.D4] },
    { bass: N.C3, notes: [N.B3, N.E4, N.G4] },
    { bass: N.D3, notes: [N.A3, N.D4, N.G4] }
  ];
  // 멜로디 [스텝, 음, 길이(스텝)] — A안(짝수 루프), B안(홀수 루프), 4번째 루프는 쉼
  var MEL_A = [
    [2, N.D5, 2], [4, N.B4, 2], [6, N.D5, 2], [8, N.G5, 6],
    [18, N.E5, 2], [20, N.D5, 2], [22, N.B4, 2], [24, N.D5, 6],
    [34, N.E5, 2], [36, N.G5, 2], [38, N.E5, 2], [40, N.D5, 4], [44, N.B4, 2],
    [50, N.A4, 2], [52, N.B4, 2], [54, N.D5, 2], [56, N.A4, 6]
  ];
  var MEL_B = [
    [2, N.B4, 2], [4, N.D5, 2], [6, N.G5, 2], [8, N.Fs5, 4],
    [18, N.G5, 2], [20, N.E5, 2], [22, N.D5, 4],
    [34, N.C5, 2], [36, N.E5, 2], [38, N.G5, 2], [40, N.E5, 4],
    [50, N.D5, 2], [52, N.E5, 2], [54, N.Fs5, 2], [56, N.G5, 6]
  ];

  function stepDur() {
    var bpm = music.mode === 'feed' ? Math.min(120, 96 + (music.level - 1) * 4) : 80;
    return 60 / bpm / 2;
  }

  function musicStep(s, loop, t, st) {
    var bar = Math.floor(s / 8), pos = s % 8, ch = CH[Math.floor(bar / 2) % 4];
    var feed = music.mode === 'feed', mb = musicBus, tr = music.nodes, i;
    // 패드: 마디마다 부드러운 sine 화음(느린 어택)
    if (pos === 0) {
      for (i = 0; i < ch.notes.length; i++) tone('sine', ch.notes[i], 0, t, st * 8.5, feed ? 0.035 : 0.05, 0.35, mb, tr);
    }
    if (feed) {
      // 낮은 북 '둥': 1·3박 (sine 110→55Hz)
      if (pos === 0 || pos === 4) tone('sine', 110, 55, t, 0.16, 0.20, 0.004, mb, tr);
      // 베이스: 매 박 짧게 루트
      if (pos % 2 === 0) tone('triangle', ch.bass, 0, t, st * 0.9, 0.20, 0.008, mb, tr);
      // 셰이커: 8분마다 고역 노이즈(정박 작게, 뒷박 조금 크게)
      noise(t, 0.035, pos % 2 ? 0.045 : 0.022, 'highpass', 7000, 0, 0.7, 0.006, mb, tr);
    } else {
      // 베이스: 1박 루트, 3박 5도
      if (pos === 0) tone('triangle', ch.bass, 0, t, st * 3.5, 0.26, 0.015, mb, tr);
      if (pos === 4) tone('triangle', ch.bass * 1.5, 0, t, st * 2.5, 0.18, 0.015, mb, tr);
      // 멜로디(칼림바). 4번째 루프마다 쉼(반복 피로 감소)
      if (loop % 4 !== 3) {
        var mel = loop % 2 ? MEL_B : MEL_A;
        for (i = 0; i < mel.length; i++) {
          if (mel[i][0] === s) kalimba(mel[i][1], t, Math.max(0.3, mel[i][2] * st * 0.9), 0.20, mb, tr);
        }
      }
    }
  }

  function pump(until) {
    if (!music.on || !ctx) return;
    while (music.nextAt <= until) {
      var st = stepDur();
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
      pump(ctx.currentTime + 0.3);   // 룩어헤드 0.3초: 모드 전환이 빨리 반영되도록
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
    },
    // name: count|go|splash|eat|select|correct|wrong|tally|levelUp|gameOver|button
    // opts: tally {n: 1부터}. 'eat'은 인자를 받지 않는다(곰 구별 금지).
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
    // 배경음악만 켜기/끄기(설정 저장). 효과음은 그대로. 음소거(setMuted)는 전체.
    setMusicOn: function (on) {
      musicPref = !!on;
      try { localStorage.setItem(MUSIC_KEY, musicPref ? '1' : '0'); } catch (e) {}
      if (musicPref && music.want) musicOn(); else musicOff();
    },
    isMusicOn: function () { return musicPref; },
    // 음악 분위기: 'calm'(타이틀·선택·해설) / 'feed'(먹는 구간). level은 feed 템포에 반영(1부터, 6 이상은 120 BPM).
    // 다음 8분음표부터 반영(최대 약 0.3초 뒤). 음악이 꺼져 있어도 호출 안전.
    setMusicMode: function (mode, level) {
      music.mode = mode === 'feed' ? 'feed' : 'calm';
      if (level !== undefined) music.level = Math.max(1, Math.round(+level) || 1);
    },
    // 배경음악 시작(이미 재생 중이면 무시). unlock 이전 호출은 무시되므로 첫 제스처 뒤에 호출.
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
      attach: function (c) { offline = true; last = {}; hitPool = []; music.nodes = []; build(c); },
      playAt: function (name, t, opts) { if (sfx.hasOwnProperty(name)) sfx[name](t, opts || {}); },
      startMusicAt: function (t, mode, level) {
        music.on = true; music.step = 0; music.nextAt = t; music.nodes = [];
        music.mode = mode === 'feed' ? 'feed' : 'calm'; music.level = level || 1;
      },
      setMode: function (mode, level) { music.mode = mode; if (level) music.level = level; },
      pump: function (until) { pump(until); },
      sfxNames: function () { return Object.keys(sfx); }
    }
  };
})();
