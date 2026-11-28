/* ===== 선인장 키우기2 (cactus-graft) Sound module =====
 * Web Audio API 실시간 합성. 외부 파일/의존성 없음.
 * AudioContext 미지원·생성 실패 시 모든 호출은 조용히 무시된다(게임은 소리 없이 정상 진행).
 * 시리즈 전작 「선인장 키우기」(desert-breath)와 같은 구조·음색(D 장조 5음 음계, sine 마림바·작은 종, 9kHz 로우패스, 바람 바탕).
 *
 * 사용법: 사용자 제스처(click/pointerup/keydown) 핸들러 맨 앞에서 Sound.unlock() →
 *   판 시작: Sound.startAmbient()
 *   칼을 기울이는 동안 매 프레임: Sound.aim(칼 각도°)      — 소리 크기는 "돌리는 속도"만 따른다(각도·평행 정보 없음)
 *   순간 효과음: Sound.play('cut'), Sound.play('graft', { n: 12, streak: 3 }), Sound.play('miss') ...
 *
 * [공정성] 조준 중 소리는 칼을 돌리는 속도에만 반응하고 음높이·음색은 고정이다. 칼 각도나 대목 면과의 평행 여부는
 *   소리에 전혀 실리지 않는다. 평행 신호 'align'은 게임이 화면에 "미리 빛남"을 보여 줄 때(1~3마디 배우기)만 부른다.
 * [박자 없음] 루프 멜로디·일정한 박자 없음. 바람 바탕은 노이즈 + 서로 맞지 않는 느린 흔들림.
 *
 * 신호 경로: sfxBus → LP 9kHz ─────────────┐
 *            aimBus(칼 스침) ───────────────┤
 *            ambBus(바람) → ambDuck ────────┴→ master(음소거) → limiter → destination
 */
const Sound = (function () {
  'use strict';
  var MUTE_KEY = 'cactus-graft-muted';
  var MASTER_VOL = 0.6;
  var AMB_VOL = 1.0;
  var DUCK = 0.4;           // 무너짐·꽃·새 기록 때 바람을 잠깐 낮추는 비율
  var WIND_LV = 0.035;      // 바람 바탕(전작 0.055보다 작게 — 이번 판은 손끝 소리가 주인공)
  var AIM_LV = 0.05;        // 칼 스침 최대 음량(돌리는 속도 AIM_FULL°/초 이상에서)
  var AIM_FULL = 140;       // 이 속도(°/초)에서 스침 최대

  var ctx = null, master = null, limiter = null, sfxBus = null, sfxTone = null;
  var ambBus = null, ambDuck = null, noiseBuf = null;
  var aimBus = null, aimNode = null;
  var muted = false, offline = false;
  var last = {};
  var amb = { want: false, on: false, nodes: null, stopTimer: null };
  var paused = false;
  var aimSt = { deg: null, t: 0 };

  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { muted = false; }

  function build(c) {
    ctx = c;
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6; limiter.knee.value = 2; limiter.ratio.value = 20;
    limiter.attack.value = 0.002; limiter.release.value = 0.15;
    limiter.connect(ctx.destination);

    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOL;
    master.connect(limiter);

    sfxTone = ctx.createBiquadFilter();
    sfxTone.type = 'lowpass'; sfxTone.frequency.value = 9000; sfxTone.Q.value = 0.5;
    sfxTone.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(sfxTone);

    aimBus = ctx.createGain(); aimBus.gain.value = 0; aimBus.connect(master);

    ambDuck = ctx.createGain(); ambDuck.gain.value = 1; ambDuck.connect(master);
    ambBus = ctx.createGain(); ambBus.gain.value = 0; ambBus.connect(ambDuck);

    // 노이즈 버퍼 1개(4초, 스테레오, 고정 시드). 루프 이음매 20ms 교차 페이드
    var len = Math.floor(ctx.sampleRate * 4);
    noiseBuf = ctx.createBuffer(2, len, ctx.sampleRate);
    var seed = 20261128 | 0;
    for (var ch = 0; ch < 2; ch++) {
      var d = noiseBuf.getChannelData(ch);
      // xorshift32(정수 연산만) — 곱셈 LCG를 double로 돌리면 정밀도가 깨져 0.3초 주기로 반복되므로 쓰지 않는다
      for (var j = 0; j < len; j++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; d[j] = (seed >>> 0) / 2147483648 - 1; }
      var xf = Math.floor(ctx.sampleRate * 0.02);
      for (var k = 0; k < xf; k++) { var a = k / xf; d[len - xf + k] = d[len - xf + k] * (1 - a) + d[k] * a; }
    }
    aimNode = null;
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
  function rnd(a, b) { return a + Math.random() * (b - a); }

  // ---------- 음원 기본 블록 (엔벨로프는 0.0001에서 지수 어택/감쇠 — 클릭음 방지) ----------
  function tone(type, f0, f1, t, dur, vol, attack, dest, glide) {
    try {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.value = f0; g.gain.value = 0;
      o.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + (glide || dur * 0.8));
      var a = attack || 0.005;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || sfxBus);
      o.start(t); o.stop(t + dur + 0.03);
      return o;
    } catch (e) { return null; }
  }

  function noise(t, dur, vol, ftype, f0, f1, q, attack, dest) {
    try {
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf;
      f.type = ftype; f.Q.value = q || 0.8;
      f.frequency.value = f0; g.gain.value = 0;      // 시작 전 기본값(HP 350Hz·게인 1)이 남지 않게
      f.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      var a = attack || 0.004;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest || sfxBus);
      s.start(t, Math.random() * 3.5); s.stop(t + dur + 0.03);
      return s;
    } catch (e) { return null; }
  }

  function mallet(f, t, dur, vol, dest) {
    tone('sine', f, 0, t, dur, vol, 0.003, dest);
    tone('sine', f * 4, 0, t, Math.min(0.03, dur * 0.3), vol * 0.08, 0.001, dest);
  }
  function bell(f, t, dur, vol, dest) {
    tone('sine', f, 0, t, dur, vol, 0.002, dest);
    tone('sine', f * 2, 0, t, dur * 0.35, vol * 0.25, 0.002, dest);
    tone('sine', f * 3, 0, t, dur * 0.15, vol * 0.07, 0.001, dest);
  }
  // 촉촉한 '쏙': 아주 짧게 위로 튀는 물방울 sine + 젖은 클릭
  function plop(f, t, vol) {
    tone('sine', f * 0.55, f, t, 0.06, vol, 0.003, null, 0.035);
    noise(t, 0.018, vol * 0.5, 'bandpass', 1400, 2600, 1.4, 0.001);
  }
  // 삐걱(탑 흔들림): 짧은 클릭을 조금씩 벌어지는 간격으로 늘어놓고 공명 밴드패스에 통과 → 나무 삐걱처럼
  function creak(t, dur, vol, fc) {
    try {
      var bp = ctx.createBiquadFilter(), g = ctx.createGain();
      bp.type = 'bandpass'; bp.frequency.value = fc; bp.frequency.setValueAtTime(fc, t); bp.frequency.linearRampToValueAtTime(fc * 0.8, t + dur); bp.Q.value = 7;
      g.gain.value = 1; bp.connect(g); g.connect(sfxBus);
      var x = t, gap = 0.011, i = 0;
      while (x < t + dur && i < 60) {
        var p = (x - t) / dur, env = Math.sin(Math.PI * p);
        noise(x, 0.004, vol * (0.25 + 0.75 * env) * rnd(0.8, 1.1), 'highpass', 300, 0, 0.7, 0.0005, bp);
        x += gap * rnd(0.85, 1.15); gap *= 1.035; i++;
      }
    } catch (e) {}
  }
  function thud(t, vol, f) {
    noise(t, 0.16, vol, 'lowpass', 500, 180, 0.7, 0.003);
    tone('sine', f || 130, (f || 130) * 0.55, t, 0.16, vol * 0.8, 0.003);
  }

  function duck(t, hold) {
    try {
      ambDuck.gain.cancelScheduledValues(t);
      ambDuck.gain.setTargetAtTime(DUCK, t, 0.05);
      ambDuck.gain.setTargetAtTime(1, t + hold, 0.5);
    } catch (e) {}
  }

  var N = { D3: 146.83, G3: 196.0, A3: 220.0, D4: 293.66, E4: 329.63, Fs4: 369.99, G4: 392.0, A4: 440.0, B4: 493.88,
            Cs5: 554.37, D5: 587.33, E5: 659.25, Fs5: 739.99, G5: 783.99, A5: 880.0, B5: 987.77,
            D6: 1174.66, E6: 1318.51, Fs6: 1479.98, A6: 1760.0, B6: 1975.53, D7: 2349.32, E7: 2637.02, Fs7: 2959.96 };
  // 접붙임 음계: D 장조 5음 음계. 마디 3개마다 한 칸 위로(1~3마디 A4 … 28~30마디 F#6) — 탑이 자랄수록 음이 올라간다
  var SC = [N.A4, N.B4, N.D5, N.E5, N.Fs5, N.A5, N.B5, N.D6, N.E6, N.Fs6, N.A6, N.B6, N.D7, N.E7, N.Fs7];
  function stepOf(n) { return clamp(Math.floor((Math.max(1, Math.round(+n || 1)) - 1) / 3), 0, 9); }

  // ---------- 효과음 ----------
  var sfx = {
    // 일반 UI 버튼: 부드러운 '톡'(전작과 같음)
    button: function (t) {
      if (throttled('button', t, 0.05)) return;
      tone('sine', 640, 500, t, 0.055, 0.10, 0.002);
      noise(t, 0.02, 0.04, 'bandpass', 2400, 0, 1.2, 0.001);
    },
    // 면 다듬기(마디 시작 0.30초, 대목 윗면을 새로 다듬음): 작은 '사각사각' 세 번 + 부스러기 톡톡. 각도 정보 없음(음 고정)
    trim: function (t) {
      if (throttled('trim', t, 0.2)) return;
      var f = [3600, 3100, 2700];
      for (var i = 0; i < 3; i++) noise(t + i * 0.085 + rnd(0, 0.01), 0.06, 0.05 - i * 0.008, 'bandpass', f[i], f[i] * 0.8, 2.2, 0.008);
      for (var j = 0; j < 4; j++) noise(t + 0.05 + rnd(0, 0.24), 0.004, rnd(0.03, 0.06), 'bandpass', rnd(1800, 3000), 0, 2.0, 0.0005);
    },
    // 취소(40px 안에서 떼기·톡 치기 = 자르지 않음): 칼이 물러나는 부드러운 두 음 '포롱↓'. 노이즈 '싹'이 없어 cut과 확실히 다름
    cancel: function (t) {
      if (throttled('cancel', t, 0.15)) return;
      tone('sine', 700, 0, t, 0.06, 0.035, 0.004);
      tone('sine', 520, 0, t + 0.055, 0.09, 0.03, 0.004);
    },
    // 새 접수가 집게에 물려 내려옴(마디 시작): 아주 작은 집게 '틱' + 옅은 스침
    scion: function (t) {
      if (throttled('scion', t, 0.2)) return;
      tone('sine', 1250, 1050, t, 0.025, 0.03, 0.001);
      noise(t, 0.14, 0.018, 'bandpass', 900, 1500, 0.9, 0.05);
    },
    // 칼이 나타남(40px 이상 끌었을 때, 키보드는 첫 ←→): 칼날 '스릉'(작게)
    blade: function (t) {
      if (throttled('blade', t, 0.25)) return;
      noise(t, 0.12, 0.035, 'bandpass', 3500, 6500, 2.0, 0.03);
      tone('sine', 2650, 0, t + 0.03, 0.10, 0.008, 0.004);
    },
    // [배우기 1~3마디 전용] 화면이 "평행 미리 빛남"을 켜는 순간에만. 작은 종 한 번
    align: function (t) {
      if (throttled('align', t, 0.3)) return;
      bell(N.A6, t, 0.22, 0.025);
    },
    // 자름(손 떼기·스페이스 순간): '싹'(칼 스침 고음) + '둑'(살 끊기는 낮고 짧은 소리)
    cut: function (t) {
      if (throttled('cut', t, 0.12)) return;
      noise(t, 0.06, 0.10, 'highpass', 3000, 6000, 0.8, 0.004);         // 싹
      noise(t + 0.045, 0.035, 0.16, 'bandpass', 1700, 1100, 1.5, 0.001); // 아삭 끊김
      for (var i = 0; i < 3; i++) noise(t + 0.05 + i * 0.009 + rnd(0, 0.003), 0.005, 0.08, 'bandpass', rnd(2400, 3400), 0, 2.0, 0.0005);
      tone('sine', 190, 95, t + 0.045, 0.07, 0.12, 0.002);                // 둑
    },
    // 완벽 접붙임 '쏙' + 키 상승음. opts: n(지금 붙은 마디 번호 1~30), streak(연속 완벽 수)
    //   음 = 마디 3개마다 5음 음계 한 칸 위. 연속 완벽 3번째부터 위에 작은 종이 한 칸씩 더 높게(최대 +5칸)
    graft: function (t, o) {
      if (throttled('graft', t, 0.1)) return;
      var s = stepOf(o.n), f = SC[s], k = Math.round(+o.streak || 0);
      plop(N.D5, t, 0.10);
      tone('sine', f * 0.84, f, t + 0.03, 0.42, 0.13, 0.008, null, 0.05);   // 쓱 올라 앉는 맑은 음
      tone('sine', f * 2, 0, t + 0.06, 0.14, 0.014, 0.003);                // 반짝 배음
      if (k >= 3) {
        bell(SC[s + Math.min(k - 2, 5)], t + 0.1, 0.4, 0.03);   // 본음보다 1~5칸 위(연속일수록 높게, 항상 단조 상승)
      }
    },
    // 좋음(비뚤게 붙음): 둔한 '쏙' + 같은 음계의 4도 아래 음을 살짝 어긋난 두 sine으로(맥놀이 = 조금 비뚤다)
    good: function (t, o) {
      if (throttled('graft', t, 0.1)) return;
      var f = SC[stepOf(o.n)] * 0.75;
      plop(N.A4, t, 0.08);
      tone('sine', f, 0, t + 0.03, 0.34, 0.06, 0.01);
      tone('sine', f * 1.012, 0, t + 0.03, 0.30, 0.04, 0.01);
    },
    // 어긋남: 틈이 벌어지며 '스르륵' 미끄러지고(0~0.35초) 0.38초에 아래로 '툭'
    miss: function (t) {
      if (throttled('fail', t, 0.3)) return;
      noise(t, 0.36, 0.07, 'bandpass', 1300, 450, 1.2, 0.04);
      tone('sine', 520, 300, t, 0.3, 0.025, 0.03);
      thud(t + 0.38, 0.13, 120);
    },
    // 무름(갈색 밑동을 자름): '물컹' — 낮은 sine이 출렁이며 내려가고 젖은 노이즈가 와와(필터가 오르내림)
    rot: function (t) {
      if (throttled('fail', t, 0.3)) return;
      try {
        var o = ctx.createOscillator(), g = ctx.createGain(), w = ctx.createOscillator(), wg = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.4);
        w.type = 'sine'; w.frequency.value = 11; wg.gain.value = 18; w.connect(wg); wg.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.05, t + 0.18); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        o.connect(g); g.connect(sfxBus);
        o.start(t); w.start(t); o.stop(t + 0.48); w.stop(t + 0.48);
        var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), ng = ctx.createGain();
        s.buffer = noiseBuf; f.type = 'bandpass'; f.Q.value = 3;
        f.frequency.setValueAtTime(350, t); f.frequency.exponentialRampToValueAtTime(950, t + 0.12); f.frequency.exponentialRampToValueAtTime(260, t + 0.38);
        ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.10, t + 0.02); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        s.connect(f); f.connect(ng); ng.connect(sfxBus); s.start(t, Math.random() * 3.5); s.stop(t + 0.42);
      } catch (e) {}
    },
    // 말라 버림 직전(남은 1초, 접수가 고개 숙일 때) — 화면과 같은 시점에 한 번, 아주 작게
    droop: function (t) {
      if (throttled('droop', t, 0.5)) return;
      tone('sine', 560, 430, t, 0.22, 0.03, 0.02);
    },
    // 말라 버림(제한 시간 초과): 마른 잎 '바스락' + 힘 빠지는 하강 + 작은 '톡' 떨어짐
    wither: function (t) {
      if (throttled('fail', t, 0.3)) return;
      for (var i = 0; i < 6; i++) noise(t + rnd(0, 0.3), 0.012, rnd(0.04, 0.08), 'highpass', 2500, 0, 0.8, 0.001);
      noise(t, 0.32, 0.03, 'bandpass', 4000, 2200, 1.0, 0.03);
      tone('sine', 392, 220, t + 0.05, 0.45, 0.06, 0.03);
      thud(t + 0.42, 0.06, 160);
    },
    // 탑 기울기 경고. opts.deg = 지금 기울기(°). 기울기가 5°·7°·9°를 처음 넘을 때 게임이 1번씩 부른다(화면 경고와 같은 시점)
    //   삐걱 + 낮은 흔들림 '우웅'. 기울수록 크고 길고 낮다
    tilt: function (t, o) {
      if (throttled('tilt', t, 0.4)) return;
      var d = clamp(+o.deg || 5, 5, 10), k = (d - 5) / 5;   // 0(5°) ~ 1(10°)
      creak(t, 0.28 + 0.22 * k, 0.9 + 0.9 * k, 760 - 200 * k);
      noise(t, 0.55 + 0.2 * k, 0.10 + 0.08 * k, 'lowpass', 260, 160, 0.8, 0.18);
    },
    // 무너짐(실패 3번 또는 기울기 10°): 길게 삐걱 → '휘익' 기울어짐 → 마디들이 툭·투둑·툭 → 모래 '사르르'
    collapse: function (t) {
      if (throttled('collapse', t, 1)) return;
      duck(t, 2.2);
      creak(t, 0.55, 1.8, 620);
      noise(t + 0.35, 0.6, 0.06, 'bandpass', 900, 300, 0.9, 0.3);
      var hits = [0.95, 1.08, 1.17, 1.33, 1.5], f = [140, 120, 165, 105, 130];
      for (var i = 0; i < hits.length; i++) thud(t + hits[i] + rnd(0, 0.02), 0.16 - i * 0.02, f[i]);
      noise(t + 1.0, 0.9, 0.025, 'bandpass', 3500, 2000, 0.9, 0.2);
      tone('sine', N.D4, N.A3, t + 0.9, 1.0, 0.035, 0.1);
    },
    // 30마디 완주, 꽃이 핌: 꽃봉오리 '퐁' → 마림바 상승 → D 장조 add9 화음이 피어나고 꽃잎처럼 작은 종이 흩날림
    bloom: function (t) {
      if (throttled('bloom', t, 1)) return;
      duck(t, 2.6);
      plop(N.A5, t, 0.12);
      var run = [N.A4, N.B4, N.D5, N.E5, N.Fs5, N.A5], i;
      for (i = 0; i < run.length; i++) mallet(run[i], t + 0.12 + i * 0.07, 0.22, 0.09);
      var ch = [N.D4, N.Fs4, N.A4, N.E5, N.A5];
      for (i = 0; i < ch.length; i++) tone('sine', ch[i], 0, t + 0.55 + i * 0.05, 2.0, 0.045, 0.25);
      tone('triangle', N.D3, 0, t + 0.55, 1.8, 0.10, 0.2);
      bell(N.D6, t + 0.6, 1.0, 0.07);
      var pet = [N.Fs6, N.A6, N.E6, N.B6, N.D6], pt = [0.85, 1.05, 1.3, 1.5, 1.8];
      for (i = 0; i < pet.length; i++) bell(pet[i], t + pt[i] + rnd(0, 0.04), 0.5, 0.022);
    },
    // 결과 화면(새 기록 아님): 작은 마림바 2음(전작과 같음)
    result: function (t) {
      if (throttled('result', t, 0.5)) return;
      mallet(N.A5, t, 0.25, 0.08);
      mallet(N.D6, t + 0.09, 0.35, 0.08);
    },
    // 새 기록: 마림바 F#5-A5-B5-D6-E6-F#6 상승 + 종 + Bm → D 두 화음(전작 G → D와 다른 오리지널 진행)
    record: function (t) {
      if (throttled('record', t, 0.8)) return;
      duck(t, 2.0);
      var run = [N.Fs5, N.A5, N.B5, N.D6, N.E6, N.Fs6], i;
      for (i = 0; i < run.length; i++) mallet(run[i], t + i * 0.055, 0.2, 0.09);
      bell(N.Fs6, t + 0.36, 0.6, 0.08);
      var c1 = [N.Fs4, N.B4, N.D5], c2 = [N.Fs4, N.A4, N.D5, N.E5];
      for (i = 0; i < c1.length; i++) tone('sine', c1[i], 0, t + 0.36, 0.45, 0.05, 0.02);
      tone('triangle', N.B4 / 2, 0, t + 0.36, 0.4, 0.10, 0.02);
      for (i = 0; i < c2.length; i++) tone('sine', c2[i], 0, t + 0.78, 1.1, 0.045, 0.02);
      tone('triangle', N.D3, 0, t + 0.78, 1.0, 0.11, 0.02);
      bell(N.A6, t + 0.78, 0.5, 0.035);
    }
  };

  // ---------- 칼 스침(조준 중 연속음) ----------
  // 노이즈 → BP 2.4kHz(고정) → aimBus. 음량 = 칼을 돌리는 속도(°/초)만. 음높이·필터는 각도와 무관하게 고정.
  // aim()이 끊기면(손 뗌·자름) 0.1초 안에 저절로 사라진다(매 호출마다 "잠시 뒤 0" 예약을 다시 걸기 때문).
  function aimEnsure(t) {
    if (aimNode) return;
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
    s.buffer = noiseBuf; s.loop = true; s.loopStart = 1.1; s.loopEnd = 3.3;
    f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 1.3;
    f2.type = 'highpass'; f2.frequency.value = 900; f2.Q.value = 0.5;
    s.connect(f); f.connect(f2); f2.connect(aimBus); s.start(t, 1.4);
    aimNode = s;
  }
  function aimAt(deg, t) {
    deg = +deg;
    if (!isFinite(deg)) return;
    if (aimSt.deg === null || t - aimSt.t > 0.25 || t < aimSt.t) { aimSt.deg = deg; aimSt.t = t; return; }
    var dt = Math.max(1 / 120, t - aimSt.t), spd = Math.abs(deg - aimSt.deg) / dt;
    aimSt.deg = deg; aimSt.t = t;
    var v = AIM_LV * clamp(spd / AIM_FULL, 0, 1);
    aimEnsure(t);
    try {
      aimBus.gain.cancelScheduledValues(t);
      aimBus.gain.setTargetAtTime(v, t, 0.03);
      aimBus.gain.setTargetAtTime(0, t + 0.06, 0.03);
    } catch (e) {}
  }
  function aimStop(t) {
    aimSt.deg = null;
    try { aimBus.gain.cancelScheduledValues(t); aimBus.gain.setTargetAtTime(0, t, 0.015); } catch (e) {}
  }

  // ---------- 바람 바탕(연속, 박자 없음) ----------
  function lfo(freq, depth, param, t) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq; g.gain.value = depth;
    o.connect(g); g.connect(param); o.start(t);
    return o;
  }
  function buildAmbient(t) {
    var n = { src: [], osc: [] };
    var A = ctx.createBufferSource(); A.buffer = noiseBuf; A.loop = true;
    n.src.push(A);
    var lvl = ctx.createGain(); lvl.gain.value = WIND_LV; lvl.connect(ambBus);
    var mod = ctx.createGain(); mod.gain.value = 1; mod.connect(lvl);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.6;
    A.connect(lp); lp.connect(mod);
    n.osc.push(lfo(0.061, 0.25, mod.gain, t), lfo(0.107, 0.18, mod.gain, t), lfo(0.043, 130, lp.frequency, t));
    A.start(t, 0);
    return n;
  }
  function target(param, v, t, tc) {
    try { param.cancelScheduledValues(t); param.setTargetAtTime(v, t, tc); } catch (e) {}
  }
  function ambStart(t) {
    paused = false;
    if (amb.stopTimer) { clearTimeout(amb.stopTimer); amb.stopTimer = null; }
    if (!amb.on) {
      try { amb.nodes = buildAmbient(t); amb.on = true; } catch (e) { amb.on = false; amb.nodes = null; return; }
    }
    target(ambBus.gain, AMB_VOL, t, 0.4);
  }
  function killAmb(at) {
    var n = amb.nodes; amb.nodes = null; amb.on = false;
    if (!n) return;
    var all = n.src.concat(n.osc);
    for (var k = 0; k < all.length; k++) { try { all[k].stop(at); } catch (e) {} }
  }
  function ambPause(on, t) {
    paused = !!on;
    if (paused) aimStop(t);
    if (!amb.on) return;
    target(ambBus.gain, paused ? 0 : AMB_VOL, t, paused ? 0.06 : 0.12);
  }
  function ambStop(t) {
    aimStop(t);
    if (!amb.on) return;
    target(ambBus.gain, 0, t, 0.45);
    if (offline) return;
    if (amb.stopTimer) clearTimeout(amb.stopTimer);
    amb.stopTimer = setTimeout(function () {
      amb.stopTimer = null;
      try { killAmb(ctx.currentTime + 0.02); } catch (e) {}
    }, 2500);
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

  return {
    // 반드시 사용자 제스처 핸들러 안에서 호출(시작 버튼 click 필수). 여러 번 호출해도 안전.
    unlock: function () {
      if (!ensureCtx() || offline) return;
      try {
        if (ctx.state !== 'running') { var p = ctx.resume(); if (p && p.catch) p.catch(function () {}); }
        var b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
        s.buffer = b; s.connect(ctx.destination); s.start(0);
      } catch (e) {}
      if (amb.want && !amb.on) { try { ambStart(ctx.currentTime + 0.02); } catch (e) {} }
    },
    // name: button|trim|scion|blade|align|cut|cancel|graft|good|miss|rot|droop|wither|tilt|collapse|bloom|result|record
    // opts: graft {n, streak} / good {n} / tilt {deg}
    play: function (name, opts) {
      try {
        if (!ready() || !sfx.hasOwnProperty(name)) return;
        sfx[name](ctx.currentTime + 0.01, opts || {});
      } catch (e) {}
    },
    // 칼이 보이는 동안 매 프레임(또는 각도가 바뀔 때마다) 현재 칼 각도(°). 크기는 돌리는 속도만 따른다
    aim: function (deg) {
      try { if (ready() && !paused) aimAt(deg, ctx.currentTime + 0.01); } catch (e) {}
    },
    // 자름·칼 사라짐·일시정지 때(안 불러도 0.1초 안에 저절로 조용해짐)
    aimEnd: function () { try { if (ctx) aimStop(ctx.currentTime); } catch (e) {} },
    startAmbient: function () {
      amb.want = true;
      try { if (running()) ambStart(ctx.currentTime + 0.02); } catch (e) {}
    },
    stopAmbient: function () {
      amb.want = false;
      try { if (ctx) ambStop(ctx.currentTime); } catch (e) {}
    },
    setPaused: function (on) {
      try { if (ctx) ambPause(on, ctx.currentTime); else paused = !!on; } catch (e) {}
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
    // 공통 인터페이스 호환: 배경음악 없음 → 바람 바탕으로 대신
    startMusic: function () { this.startAmbient(); },
    stopMusic: function () { this.stopAmbient(); },
    // 테스트 전용: OfflineAudioContext에 그래프를 붙여 렌더 검사
    _test: {
      attach: function (c) {
        offline = true; paused = false; last = {}; aimSt = { deg: null, t: 0 };
        amb = { want: false, on: false, nodes: null, stopTimer: null }; build(c);
      },
      playAt: function (name, t, opts) { if (sfx.hasOwnProperty(name)) sfx[name](t, opts || {}); },
      aimAt: function (deg, t) { aimAt(deg, t); },
      aimEndAt: function (t) { aimStop(t); },
      ambientAt: function (t) { ambStart(t); },
      stopAmbientAt: function (t) { ambStop(t); },
      pauseAt: function (on, t) { ambPause(on, t); },
      sfxNames: function () { return Object.keys(sfx); },
      notes: function () { var r = []; for (var n = 1; n <= 30; n++) r.push(Math.round(SC[stepOf(n)])); return r; }
    }
  };
})();
