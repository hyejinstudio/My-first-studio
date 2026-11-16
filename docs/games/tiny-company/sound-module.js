/* ===== 작은 회사 사장님 (tiny-company) Sound module =====
 * Web Audio API 실시간 합성. 외부 파일/의존성 없음.
 * AudioContext 미지원·생성 실패 시 모든 호출은 조용히 무시된다(게임은 소리 없이 정상 진행).
 * 사용법: 사용자 제스처(click/touchend/pointerup/keydown) 핸들러 맨 앞에서 Sound.unlock() →
 *         Sound.play('button'), Sound.play('tick', { value: 0.6 }), Sound.play('work', { duration: 2.5 }) 등.
 * 톤: 작은 사무실. 나무 책상·종이·타자기·탁상 벨·마림바/일렉피아노 위주. 버저·사각파 없음.
 * 조성: F 장조(효과음과 BGM 통일). 모든 멜로디는 오리지널.
 * 신호 경로: sfxBus → LP 7kHz ┐
 *            musicBus → musicReport(리포트 때 낮춤) → musicDuck(순간 덕킹) ┴→ master(음소거) → limiter → destination
 */
const Sound = (function () {
  'use strict';
  var MUTE_KEY = 'tiny-company-muted';
  var MASTER_VOL = 0.6;
  var MUSIC_VOL = 0.16;      // 배경음악 버스 (효과음보다 확실히 뒤에)
  var REPORT_LEVEL = 0.5;    // 월말 리포트 동안 음악을 이 비율로 유지
  var DUCK = 0.5;            // 큰 효과음이 날 때 잠깐 낮추는 비율

  var ctx = null, master = null, limiter = null, sfxBus = null, sfxTone = null;
  var musicBus = null, musicReport = null, musicDuck = null, noiseBuf = null;
  var muted = false, offline = false, reportOn = false;
  var last = {};
  var music = { on: false, timer: null, step: 0, origin: 0, nodes: [], stopTimer: null };
  var work = { nodes: [] };

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
    sfxTone.type = 'lowpass'; sfxTone.frequency.value = 7000; sfxTone.Q.value = 0.5;
    sfxTone.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(sfxTone);

    musicDuck = ctx.createGain(); musicDuck.gain.value = 1; musicDuck.connect(master);
    musicReport = ctx.createGain(); musicReport.gain.value = reportOn ? REPORT_LEVEL : 1; musicReport.connect(musicDuck);
    musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_VOL; musicBus.connect(musicReport);

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

  // 마림바/나무 건반: sine 기음 + 4배음(빠르게 사라짐), 짧은 감쇠
  function mallet(f, t, dur, vol, dest, track) {
    tone('sine', f, 0, t, dur, vol, 0.003, dest, track);
    tone('sine', f * 4, 0, t, Math.min(0.08, dur * 0.4), vol * 0.18, 0.002, dest, track);
  }

  // 일렉피아노/벨: sine 기음 + 2·3배음, 로우패스 2.6kHz→1kHz
  function keys(f, t, dur, vol, dest, track) {
    try {
      var g = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(2600, t);
      lp.frequency.exponentialRampToValueAtTime(1000, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(vol * 0.4, t + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      lp.connect(g); g.connect(dest || sfxBus);
      var parts = [[1, 1], [2, 0.25], [3, 0.06]];
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

  var N = { F2: 87.31, G2: 98.0, A2: 110.0, Bb2: 116.54, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61,
            G3: 196.0, A3: 220.0, Bb3: 233.08, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23,
            G4: 392.0, A4: 440.0, Bb4: 466.16, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46,
            G5: 783.99, A5: 880.0, Bb5: 932.33, C6: 1046.5, D6: 1174.66, E6: 1318.5, F6: 1396.9 };

  // ---------- 효과음 ----------
  var sfx = {
    // 슬라이더 눈금 틱: 작은 나무 '똑'. opts.value(0~1)로 음높이 살짝 변화. 60ms 미만 간격은 무시(연속 드래그 시 최대 약 16회/초)
    tick: function (t, o) {
      if (throttled('tick', t, 0.06)) return;
      var v = Math.max(0, Math.min(1, +o.value || 0.5));
      var f = 900 * Math.pow(2, v * 0.75);   // 900Hz ~ 1510Hz
      tone('triangle', f, f * 0.92, t, 0.028, 0.07, 0.001);
      noise(t, 0.012, 0.03, 'bandpass', 3500, 0, 2, 0.001);
    },
    // 일반 버튼: 부드러운 '톡' 2겹
    button: function (t) {
      if (throttled('button', t, 0.05)) return;
      tone('sine', 700, 560, t, 0.06, 0.10, 0.002);
      noise(t, 0.02, 0.05, 'bandpass', 2500, 0, 1.2, 0.001);
    },
    // 채용: 도장 '탁' + 상승 3음 마림바 (C5-F5-A5)
    hire: function (t) {
      if (throttled('hire', t, 0.15)) return;
      tone('sine', 180, 90, t, 0.09, 0.30, 0.002);
      noise(t, 0.05, 0.16, 'lowpass', 1000, 400, 0.7, 0.002);
      mallet(N.C5, t + 0.08, 0.25, 0.18);
      mallet(N.F5, t + 0.16, 0.25, 0.18);
      mallet(N.A5, t + 0.24, 0.45, 0.20);
    },
    // 한 달 진행: 타자기 타건 + 탁상 시계 째깍 + 끝에 타자기 벨 '띵'. opts.duration(초, 0.5~8, 기본 2.5)
    // Sound.stopWork()로 중간에 끊을 수 있다.
    work: function (t, o) {
      if (throttled('work', t, 0.3)) return;
      var dur = Math.max(0.5, Math.min(8, +o.duration || 2.5));
      var tr = work.nodes, k;
      // 시계: 0.5초마다 틱/톡 교대
      for (k = 0; t + k * 0.5 < t + dur - 0.15; k++) {
        var ct = t + k * 0.5;
        tone('triangle', k % 2 ? 1500 : 1900, 0, ct, 0.02, 0.05, 0.001, null, tr);
      }
      // 타자기: 3~6타 묶음 + 쉼. 타건 = 짧은 밴드패스 노이즈 + 낮은 '툭'
      var at = t + 0.08, end = t + dur - 0.35;
      while (at < end) {
        var burst = 3 + Math.floor(Math.random() * 4);
        for (var b = 0; b < burst && at < end; b++) {
          var v = 0.07 + Math.random() * 0.05;
          noise(at, 0.022, v, 'bandpass', 2200 + Math.random() * 1200, 0, 1.6, 0.001, null, tr);
          tone('sine', 260 + Math.random() * 60, 140, at, 0.03, v * 0.9, 0.001, null, tr);
          at += 0.075 + Math.random() * 0.05;
        }
        at += 0.18 + Math.random() * 0.25;
      }
      // 끝: 타자기 벨 (A6 근처 사인 + 배음)
      var bt = t + dur - 0.25;
      tone('sine', 1760, 0, bt, 0.5, 0.07, 0.002, null, tr);
      tone('sine', 4420, 0, bt, 0.12, 0.02, 0.002, null, tr);
      noise(bt - 0.06, 0.08, 0.06, 'bandpass', 1500, 900, 1, 0.01, null, tr);  // 캐리지 '스륵'
      var keep = [];
      for (k = 0; k < tr.length; k++) if (tr[k].end > t - 1) keep.push(tr[k]);
      work.nodes = keep;
    },
    // 다음 달(달력 넘김): 종이 '스윽' + 작은 단음 F5
    nextMonth: function (t) {
      if (throttled('nextMonth', t, 0.2)) return;
      noise(t, 0.18, 0.16, 'bandpass', 1200, 3200, 0.8, 0.03);
      mallet(N.F5, t + 0.14, 0.3, 0.12);
    },
    // 매출 증가: 동전 '찰랑'. opts.count(1~4) 만큼 한 음씩 높아지며 반복
    coin: function (t, o) {
      if (throttled('coin', t, 0.12)) return;
      var n = Math.max(1, Math.min(4, Math.round(+o.count || 1)));
      var base = [N.C6, N.D6, N.E6, N.F6];
      for (var i = 0; i < n; i++) {
        var ct = t + i * 0.09, f = base[i];
        tone('sine', f * 0.75, 0, ct, 0.05, 0.10, 0.002);          // 앞 짧은 음
        tone('sine', f, 0, ct + 0.045, 0.32, 0.12, 0.002);          // 본음
        tone('sine', f * 2.76, 0, ct + 0.045, 0.10, 0.025, 0.002);  // 금속성 비조화 배음
      }
    },
    // 적자: 낮고 부드러운 하강 2음 (D4 → Bb3) + 저음 받침. 버저 없음
    loss: function (t) {
      if (throttled('loss', t, 0.3)) return;
      duck(t, 0.8);
      tone('triangle', N.D4, N.D4 * 0.98, t, 0.3, 0.18, 0.01);
      tone('triangle', N.Bb3, N.Bb3 * 0.96, t + 0.2, 0.55, 0.18, 0.01);
      tone('sine', N.Bb2, 0, t + 0.2, 0.5, 0.14, 0.02);
    },
    // 월말 리포트 등장: 종이 '스윽' + 탁상 벨 2음 (F5, C6). 음악 리포트 모드는 setReportMode로 따로
    report: function (t) {
      if (throttled('report', t, 0.3)) return;
      noise(t, 0.2, 0.15, 'bandpass', 1000, 3000, 0.8, 0.04);
      keys(N.F5, t + 0.12, 0.6, 0.16);
      keys(N.C6, t + 0.24, 0.8, 0.12);
    },
    // 직원 행복 상승: 가볍게 튀어오르는 2음 (A5 → C6) + 작은 반짝임
    happy: function (t) {
      if (throttled('happy', t, 0.2)) return;
      mallet(N.A5, t, 0.2, 0.15);
      mallet(N.C6, t + 0.08, 0.35, 0.15);
      tone('sine', N.F6, 0, t + 0.16, 0.25, 0.025, 0.01);
    },
    // 피로 경고: 부드러운 2회 '톡톡' (낮은 E4 반음 하강), 경보음 아님
    tired: function (t) {
      if (throttled('tired', t, 0.5)) return;
      tone('triangle', N.E4, N.E4 * 0.97, t, 0.14, 0.15, 0.005);
      tone('triangle', N.E4 * 0.944, N.E4 * 0.92, t + 0.18, 0.22, 0.15, 0.005);
    },
    // 퇴사: 문 닫힘 '쿵-철컥' + 아쉬운 하강 2음 (A4 → F4, 살짝 처짐)
    quit: function (t) {
      if (throttled('quit', t, 0.3)) return;
      duck(t, 1.0);
      tone('sine', 110, 55, t, 0.22, 0.28, 0.003);                  // 문 '쿵'
      noise(t, 0.12, 0.18, 'lowpass', 700, 250, 0.7, 0.002);
      noise(t + 0.09, 0.03, 0.10, 'bandpass', 2400, 0, 3, 0.001);   // 걸쇠 '철컥'
      tone('triangle', 900, 0, t + 0.09, 0.03, 0.04, 0.001);
      keys(N.A4, t + 0.38, 0.4, 0.15);
      keys(N.F4 * 0.99, t + 0.62, 0.7, 0.15);
    },
    // 이벤트 카드(좋은 일): 카드 '착' + 밝은 상승 F5-A5-C6
    eventGood: function (t) {
      if (throttled('event', t, 0.3)) return;
      duck(t, 0.8);
      noise(t, 0.06, 0.14, 'bandpass', 2000, 1200, 1, 0.003);
      mallet(N.F5, t + 0.05, 0.3, 0.16);
      mallet(N.A5, t + 0.13, 0.3, 0.16);
      keys(N.C6, t + 0.21, 0.6, 0.12);
    },
    // 이벤트 카드(나쁜 일): 카드 '착' + 낮은 단3도 하강 (C5 → A4) + Bb3 받침(불협 살짝)
    eventBad: function (t) {
      if (throttled('event', t, 0.3)) return;
      duck(t, 0.8);
      noise(t, 0.06, 0.14, 'bandpass', 2000, 1200, 1, 0.003);
      keys(N.C5, t + 0.05, 0.35, 0.15);
      keys(N.A4 * 0.99, t + 0.2, 0.6, 0.15);
      tone('sine', N.Bb3, 0, t + 0.2, 0.55, 0.08, 0.02);
    },
    // 게임오버(파산): 금고 '텅' + 느린 하강 F4-D4-Bb3-F3 (약 1.6초)
    bankrupt: function (t) {
      if (throttled('over', t, 0.5)) return;
      duck(t, 2.0);
      tone('sine', 75, 45, t, 0.4, 0.35, 0.004);
      noise(t, 0.25, 0.12, 'lowpass', 500, 150, 0.7, 0.003);
      var ns = [N.F4, N.D4, N.Bb3, N.F3];
      for (var i = 0; i < ns.length; i++) keys(ns[i] * (1 - i * 0.004), t + 0.25 + i * 0.28, 0.6 + i * 0.25, 0.17);
      tone('sine', N.Bb2, 0, t + 1.09, 1.0, 0.12, 0.05);
    },
    // 게임오버(전원 퇴사): 빈 사무실 - 문 닫힘 + 시계 째깍 3번 + 외로운 C5 → A4 → F4
    allQuit: function (t) {
      if (throttled('over', t, 0.5)) return;
      duck(t, 2.2);
      tone('sine', 110, 55, t, 0.22, 0.32, 0.003);
      noise(t, 0.12, 0.15, 'lowpass', 700, 250, 0.7, 0.002);
      for (var k = 0; k < 3; k++) tone('triangle', k % 2 ? 1500 : 1900, 0, t + 0.4 + k * 0.4, 0.02, 0.05, 0.001);
      keys(N.C5, t + 0.6, 0.5, 0.14);
      keys(N.A4, t + 1.0, 0.5, 0.14);
      keys(N.F4, t + 1.4, 1.0, 0.15);
    },
    // 1년 완주: 박수 대신 밝은 종지 F4-A4-C5-F5 + 화음 (약 1.6초)
    yearClear: function (t) {
      if (throttled('yearClear', t, 0.5)) return;
      duck(t, 1.8);
      var ns = [N.F4, N.A4, N.C5, N.F5];
      for (var i = 0; i < ns.length; i++) mallet(ns[i], t + i * 0.12, 0.35, 0.15);
      keys(N.F5, t + 0.5, 1.1, 0.12);
      keys(N.A5, t + 0.5, 1.1, 0.09);
      keys(N.C6, t + 0.5, 1.1, 0.07);
      tone('sine', N.F3, 0, t + 0.5, 1.1, 0.12, 0.03);
    },
    // 새 최고 기록: 반짝 상승 C6-D6-F6 + 동전 + 높은 벨. yearClear 뒤 약 1.2초 후 권장
    best: function (t) {
      if (throttled('best', t, 0.5)) return;
      duck(t, 1.4);
      var ns = [N.A5, N.C6, N.D6, N.F6];
      for (var i = 0; i < ns.length; i++) mallet(ns[i], t + i * 0.08, 0.3 + i * 0.1, 0.13);
      keys(N.C6, t + 0.34, 0.9, 0.07);
      noise(t + 0.3, 0.5, 0.02, 'highpass', 5000, 0, 0.7, 0.05);
    }
  };

  // ---------- 배경음악: 오리지널 F 장조 사무실 루프 ----------
  // 92 BPM, 8분음표 스텝, 8마디(64스텝) ≈ 20.9초. 화음 2마디씩: Fmaj7 | Am7 | Bbmaj7 | C7sus4
  var BPM = 92, STEP = 60 / BPM / 2, STEPS = 64;
  var CH = [
    { bass: [N.F2, N.C3], notes: [N.A3, N.C4, N.E4] },
    { bass: [N.A2, N.E3], notes: [N.G3, N.C4, N.E4] },
    { bass: [N.Bb2, N.F3], notes: [N.A3, N.D4, N.F4] },
    { bass: [N.C3, N.G3], notes: [N.Bb3, N.D4, N.F4] }
  ];
  // 멜로디 [스텝, 음, 길이(스텝)] — A안(짝수 루프), B안(홀수 루프)
  var MEL_A = [
    [2, N.C5, 2], [4, N.A4, 2], [7, N.C5, 1], [8, N.D5, 4],
    [18, N.E5, 2], [20, N.C5, 2], [23, N.A4, 1], [24, N.G4, 4],
    [34, N.F4, 2], [36, N.A4, 2], [38, N.D5, 2], [40, N.C5, 4],
    [50, N.Bb4, 2], [52, N.A4, 2], [54, N.G4, 2], [56, N.C5, 6]
  ];
  var MEL_B = [
    [2, N.A4, 2], [4, N.C5, 2], [6, N.F5, 4],
    [18, N.E5, 2], [21, N.D5, 1], [22, N.C5, 2], [24, N.E5, 4],
    [34, N.D5, 2], [36, N.F5, 2], [39, N.E5, 1], [40, N.D5, 4],
    [50, N.C5, 2], [52, N.D5, 2], [54, N.Bb4, 2], [56, N.A4, 6]
  ];

  function rhodes(notes, t, dur) {
    // 부드러운 오프비트 코드 (sine 위주, 2배음 약간)
    for (var i = 0; i < notes.length; i++) {
      tone('sine', notes[i], 0, t, dur, 0.10, 0.008, musicBus, music.nodes);
      tone('sine', notes[i] * 2, 0, t, dur * 0.5, 0.015, 0.008, musicBus, music.nodes);
    }
  }

  function musicStep(s, loop, t) {
    var bar = Math.floor(s / 8), pos = s % 8, ch = CH[Math.floor(bar / 2) % 4];
    // 베이스: 1박 루트, 3박 5도 (2마디 중 둘째 마디 마지막 8분에 경과음)
    if (pos === 0) tone('triangle', ch.bass[0], 0, t, STEP * 3.5, 0.30, 0.01, musicBus, music.nodes);
    if (pos === 4) tone('triangle', ch.bass[1], 0, t, STEP * 2.5, 0.22, 0.01, musicBus, music.nodes);
    if (pos === 7 && bar % 2 === 1) tone('triangle', ch.bass[0] * 1.122, 0, t, STEP * 0.8, 0.16, 0.01, musicBus, music.nodes);
    // 코드: 2박·4박 오프비트(스텝 2, 6) + 가끔 3박 뒤
    if (pos === 2 || pos === 6) rhodes(ch.notes, t, STEP * 1.6);
    if (pos === 5 && bar % 2 === 1) rhodes(ch.notes, t, STEP * 0.9);
    // 셰이커: 8분마다 아주 작게, 정박은 더 작게
    noise(t, 0.04, pos % 2 ? 0.05 : 0.025, 'highpass', 6000, 0, 0.7, 0.008, musicBus, music.nodes);
    // 림(나무 블록): 2박·4박
    if (pos === 2 || pos === 6) tone('sine', 1250, 1100, t, 0.03, 0.05, 0.001, musicBus, music.nodes);
    // 멜로디 (마림바). 4번째 루프마다 쉼(반복 피로 감소)
    if (loop % 4 !== 3) {
      var mel = loop % 2 ? MEL_B : MEL_A;
      for (var i = 0; i < mel.length; i++) {
        if (mel[i][0] === s) mallet(mel[i][1], t, Math.max(0.25, mel[i][2] * STEP * 0.9), 0.20, musicBus, music.nodes);
      }
    }
  }

  function pump(until) {
    if (!music.on || !ctx) return;
    while (true) {
      var at = music.origin + music.step * STEP;
      if (at > until) break;
      musicStep(music.step % STEPS, Math.floor(music.step / STEPS), at);
      music.step++;
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
      var behind = ctx.currentTime - (music.origin + music.step * STEP);
      if (behind > 0.3) music.origin += Math.ceil(behind / STEP) * STEP;
      pump(ctx.currentTime + 0.5);
    } catch (e) {}
    music.timer = setTimeout(scheduleMusic, 150);
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
    // name: tick|button|hire|work|nextMonth|coin|loss|report|happy|tired|quit|eventGood|eventBad|bankrupt|allQuit|yearClear|best
    // opts: tick {value:0~1}, work {duration:초}, coin {count:1~4}
    play: function (name, opts) {
      try {
        if (!ready() || !sfx.hasOwnProperty(name)) return;
        sfx[name](ctx.currentTime + 0.01, opts || {});
      } catch (e) {}
    },
    // 진행 중인 'work'(타자기/시계) 소리를 바로 끊음 (건너뛰기 버튼 등)
    stopWork: function () {
      try { if (ctx) killNodes(work.nodes, ctx.currentTime + 0.02); } catch (e) {}
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
    // 월말 리포트 화면 동안 음악을 살짝 낮춤(true) / 원래대로(false). 음악이 꺼져 있어도 호출 안전
    setReportMode: function (on) {
      reportOn = !!on;
      try {
        if (musicReport) {
          var t = ctx.currentTime;
          musicReport.gain.cancelScheduledValues(t);
          musicReport.gain.setTargetAtTime(reportOn ? REPORT_LEVEL : 1, t, reportOn ? 0.15 : 0.4);
        }
      } catch (e) {}
    },
    // 배경음악 시작(이미 재생 중이면 무시). unlock 이전 호출은 무시되므로 첫 제스처 뒤에 호출.
    startMusic: function () {
      if (!ctx) return;
      if (music.stopTimer) {
        clearTimeout(music.stopTimer); music.stopTimer = null;
        if (music.on) { setMusicGain(MUSIC_VOL, 0.3); if (!music.timer && !offline) scheduleMusic(); return; }
      }
      if (music.on) return;
      try {
        music.on = true; music.step = 0;
        music.origin = ctx.currentTime + 0.1;
        setMusicGain(MUSIC_VOL, 0.05);
      } catch (e) { music.on = false; return; }
      if (offline) return;
      scheduleMusic();
    },
    // 배경음악 정지(약 1초 페이드아웃)
    stopMusic: function () {
      if (!music.on || !ctx) return;
      if (music.timer) { clearTimeout(music.timer); music.timer = null; }
      setMusicGain(0, 0.3);
      if (music.stopTimer) clearTimeout(music.stopTimer);
      music.stopTimer = setTimeout(function () {
        music.stopTimer = null; music.on = false;
        try { killNodes(music.nodes, ctx.currentTime + 0.02); } catch (e) {}
      }, 1000);
    },
    // 테스트 전용: OfflineAudioContext에 그래프를 붙여 렌더 검사
    _test: {
      attach: function (c) { offline = true; last = {}; music.nodes = []; work.nodes = []; build(c); },
      playAt: function (name, t, opts) { if (sfx.hasOwnProperty(name)) sfx[name](t, opts || {}); },
      startMusicAt: function (t) { music.on = true; music.step = 0; music.origin = t; music.nodes = []; },
      pump: function (until) { pump(until); },
      reportAt: function (on, t) { musicReport.gain.setTargetAtTime(on ? REPORT_LEVEL : 1, t, 0.15); },
      sfxNames: function () { return Object.keys(sfx); }
    }
  };
})();
