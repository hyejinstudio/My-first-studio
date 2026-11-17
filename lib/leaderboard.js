/* 혜진's 스튜디오 — 사이트 공통 온라인 순위표 v3 (docs/site/leaderboard.md 「v3」, docs/site/leaderboard-ui.md 「v2」)
 * 게임은 모듈 없이도 정상 동작해야 한다. 모든 호출은 `window.Leaderboard && Leaderboard.xxx()`.
 * 공개 API: Leaderboard.report({game, score, eligible, slot, reason}), Leaderboard.played({game}), Leaderboard.open(game?), Leaderboard.isOpen(),
 *           Leaderboard.openMe(), Leaderboard.me(), Leaderboard.onChange(fn)
 * 닉네임 게이트: 로드 시 닉네임 등록 상태(studio-nick-state)가 없으면 닫을 수 없는 창을 띄운다.
 * PIN은 서버에 해시로만 저장된다. 이 기기에는 서버 불통으로 임시 등록(pending)된 동안만 재시도용으로 남기고, 결과가 나오면 바로 지운다.
 * 파일을 바꿀 때마다 불러오는 쪽의 ?v= 숫자를 올린다.
 */
(function () {
  'use strict';
  if (window.Leaderboard) return;

  /* ===================== 설정 (한 곳) ===================== */
  function intKey(k) { return function () { var v = parseInt(store.get(k), 10); return v > 0 ? v : 0; }; }
  function zero() { return 0; }
  function bungeo(id, diff) {
    return { id: id, name: '붕어빵 눈싸움', diff: diff, short: '붕어빵', group: 'bungeo', unit: '', pct: true, cap: 1000, best: zero, seed: false };
  }
  var CONFIG = {
    url: 'https://zzynabrqpwognuwmznna.supabase.co',
    key: 'sb_publishable_fctxHgfDR0OqyV4Jwb2zqg_rKHf2mDG',
    timeoutMs: 6000,
    topN: 20,
    lockMs: 15 * 60 * 1000,     // 서버 PIN 잠금 시간(표시용)
    // 첫 등록 때 이 기기의 로컬 최고를 일괄 업로드할지. 2026-11-15 사용자 요청으로 서버 기록을 모두 지우고 시작하므로
    // 지운 기록이 되살아나지 않게 끈다(이번 판 점수만 올라감). 다시 켜면 seed:true 게임만 올라간다.
    seedLocalBest: false,
    // 홈 탭 순서 = 카드 순서. 같은 group은 탭 1개 + 난이도 토글
    games: [
      { id: 'hungry-bear', name: '폭식 불곰을 찾아라', short: '불곰', unit: '레벨', cap: 200, seed: true, best: intKey('hungry-bear-best') },
      { id: 'parrot-beat', name: '박자 앵무새', short: '앵무새', unit: '점', cap: 60000, seed: true,
        best: function () { try { var o = JSON.parse(store.get('parrot-beat-best') || 'null'); var v = o && Math.floor(+o.score); return v > 0 ? v : 0; } catch (e) { return 0; } } },
      { id: 'poop-rain', name: '똥비 피하기', short: '똥비', unit: '점', cap: 50000, seed: true, best: intKey('poop-rain-best-score') },
      bungeo('bungeo-easy', '쉬움'),
      bungeo('bungeo-normal', '보통'),
      bungeo('bungeo-hard', '어려움'),
      { id: 'mole-pop', name: '두더지 뿅뿅', short: '두더지', unit: '점', cap: 10000, seed: true, best: intKey('mole-pop-best') },
      { id: 'bunny-ten', name: '개구리 텐', short: '개구리', unit: '마리', cap: 170, seed: true, best: intKey('bunny-ten-best') },
      { id: 'snake-garden', name: '뱀 정원', short: '뱀', unit: '점', cap: 4000, seed: true, best: intKey('snake-garden-best') },
      { id: 'block-stack', name: '블록 스택', short: '블록', unit: '점', cap: 5000000, seed: true, best: intKey('blockstack-best') }
    ]
  };
  var PRIVACY = '닉네임, 점수, 플레이기록만 저장돼요. 다른 개인정보는 모으지 않아요.';
  var PIN_NOTE = 'PIN은 다른 기기에서 이어할 때 필요해요. 잊지 않게 적어 두세요';
  var K = {
    dev: 'studio-device-id', nick: 'studio-nickname', state: 'studio-nick-state', pin: 'studio-pin-pending',
    seeded: 'studio-lb-seeded', sent: 'studio-lb-sent', queue: 'studio-lb-queue', last: 'studio-lb-last',
    gmsg: 'studio-lb-gatemsg', lock: 'studio-lb-lock'
  };
  var GAME = {}, TABS = [], TAB_OF = {};
  CONFIG.games.forEach(function (g) {
    GAME[g.id] = g;
    var key = g.group || g.id, t = null;
    for (var i = 0; i < TABS.length; i++) if (TABS[i].key === key) t = TABS[i];
    if (!t) { t = { key: key, short: g.short, games: [] }; TABS.push(t); }
    t.games.push(g.id);
    TAB_OF[g.id] = t;
  });

  /* ===================== 저장소 (실패하면 메모리) ===================== */
  var mem = {};
  var store = {
    get: function (k) {
      try { var v = window.localStorage.getItem(k); if (v !== null) return v; } catch (e) {}
      return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
    },
    set: function (k, v) { mem[k] = String(v); try { window.localStorage.setItem(k, String(v)); } catch (e) {} },
    del: function (k) { delete mem[k]; try { window.localStorage.removeItem(k); } catch (e) {} }
  };
  function readObj(k) {
    try { var o = JSON.parse(store.get(k) || '{}'); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; } catch (e) { return {}; }
  }

  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function newUuid() {
    try { if (window.crypto && crypto.randomUUID) { var u = crypto.randomUUID(); if (UUID_RE.test(u)) return u; } } catch (e) {}
    var b = new Array(16), i;
    try {
      var a = new Uint8Array(16); crypto.getRandomValues(a);
      for (i = 0; i < 16; i++) b[i] = a[i];
    } catch (e) { for (i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = b.map(function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function deviceId() {
    var d = store.get(K.dev);
    if (!d || !UUID_RE.test(d)) { d = newUuid(); store.set(K.dev, d); }
    return d.toLowerCase();
  }
  function getNick() { var n = store.get(K.nick); return n && checkNick(n).ok ? cleanNick(n) : ''; }
  function nickState() { var s = store.get(K.state); return (s === 'ok' || s === 'pending') && getNick() ? s : ''; }
  function getSent() { return readObj(K.sent); }
  function getQueue() { return readObj(K.queue); }
  function setSent(o) { var has = false; for (var k in o) has = true; if (has) store.set(K.sent, JSON.stringify(o)); else store.del(K.sent); }
  function setQueue(o) { var has = false; for (var k in o) has = true; if (has) store.set(K.queue, JSON.stringify(o)); else store.del(K.queue); }

  /* ===================== 닉네임·PIN 검사 ===================== */
  var BAD = ['시발', '씨발', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '개새', '좆', '존나', '지랄', '미친놈', '미친년', '섹스',
    'fuck', 'shit', 'sex', 'bitch', '운영자', '관리자', 'admin'];
  var MSG_FORM = '8자 이내 한글·영문·숫자로 적어 주세요';
  var MSG_INFO = '전화번호·이메일·주소는 쓸 수 없어요';
  var MSG_BAD = '다른 이름을 써 주세요';
  var MSG_TAKEN = '이미 쓰는 닉네임이에요. 다른 이름을 써 주세요';
  var MSG_PINFORM = 'PIN은 숫자 4자리예요';
  var MSG_NET = '연결되지 않았어요. 잠시 후 다시 해 주세요';
  function cleanNick(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function nickKey(s) { return cleanNick(s).toLowerCase().replace(/[\s_.\-]/g, ''); }
  function nlen(s) { return Array.from(s).length; }
  function checkNick(raw) {
    var v = cleanNick(raw), n = nlen(v), low = v.toLowerCase();
    if (n < 1 || n > 8) return { ok: false, err: MSG_FORM };
    if (v.indexOf('@') >= 0 || (v.match(/[0-9]/g) || []).length >= 5 ||
        /http|www|\.com|\.kr|\.net/.test(low)) return { ok: false, err: MSG_INFO };
    if (!/^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9 _.\-]+$/.test(v)) return { ok: false, err: MSG_FORM };
    var flat = low.replace(/[\s_.\-]/g, '');
    if (!flat) return { ok: false, err: MSG_FORM }; // 한글·영문·숫자가 1글자 이상 (서버 nick_key가 비면 거부)
    for (var i = 0; i < BAD.length; i++) if (flat.indexOf(BAD[i]) >= 0) return { ok: false, err: MSG_BAD };
    return { ok: true, value: v };
  }
  function pinOk(p) { return /^[0-9]{4}$/.test(String(p || '')); }

  /* ===================== 서버 호출 ===================== */
  // 결과: { kind: 'ok'|'reject'|'fail', data, status, msg }
  function rpc(fn, body) {
    return new Promise(function (resolve) {
      var ctl = null, timer = null, done = false;
      function fin(r) { if (done) return; done = true; clearTimeout(timer); resolve(r); }
      try { ctl = new AbortController(); } catch (e) {}
      timer = setTimeout(function () { try { ctl && ctl.abort(); } catch (e) {} fin({ kind: 'fail' }); }, CONFIG.timeoutMs);
      try {
        fetch(CONFIG.url + '/rest/v1/rpc/' + fn, {
          method: 'POST',
          headers: { apikey: CONFIG.key, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: ctl ? ctl.signal : undefined,
          cache: 'no-store', credentials: 'omit'
        }).then(function (res) {
          if (res.status >= 200 && res.status < 300) {
            return res.json().then(function (d) { fin({ kind: 'ok', data: Array.isArray(d) ? d : [] }); },
              function () { fin({ kind: 'ok', data: [] }); });
          }
          // 404(함수 없음·PGRST202 = 서버 SQL 미적용)는 서버 쪽 문제 → 불통(fail)으로 본다
          var reject = res.status >= 400 && res.status < 500 && res.status !== 404 && res.status !== 408 && res.status !== 429;
          if (!reject) { fin({ kind: 'fail', status: res.status }); return; }
          return res.text().then(function (t) {
            var m = '';
            try { var o = JSON.parse(t); m = String((o && (o.message || o.hint || o.details)) || ''); } catch (e) { m = String(t || ''); }
            fin({ kind: 'reject', status: res.status, msg: m });
          }, function () { fin({ kind: 'reject', status: res.status, msg: '' }); });
        }, function () { fin({ kind: 'fail' }); });
      } catch (e) { fin({ kind: 'fail' }); }
    });
  }
  // claim 거부 사유: 서버 메시지가 정확히 'bad nickname'/'bad pin'일 때만 입력 오류. 그 밖의 거부는 서버 쪽 문제(null)
  function claimRejKind(r) {
    if (!r || r.kind !== 'reject') return null;
    var m = String(r.msg || '');
    if (/bad nickname/i.test(m)) return 'bad_nick';
    if (/bad pin/i.test(m)) return 'bad_pin';
    return null;
  }
  function rowOf(r) {
    var x = r && r.kind === 'ok' && r.data[0];
    if (!x) return null;
    var rank = +x.rank, total = +x.total, best = +x.best;
    if (!(rank >= 1)) return null;
    return { rank: rank, total: total >= rank ? total : rank, best: best || 0, nickname: x.nickname };
  }

  /* ===================== 방문·플레이 통계 (v6, docs/site/leaderboard-v6-analytics.sql) =====================
   * 닉네임 게이트와 무관하게 기록한다. 실패해도 조용히 넘어간다(재시도 없음). 중복·남용은 서버가 한 번 더 거른다.
   * page: 'home' | 게임 페이지 slug (붕어빵은 'bungeo-snowfight'). lab·admin 페이지는 이 모듈을 불러오지 않는다. */
  var BUNGEO_PAGE = 'bungeo-snowfight';
  var EXTRA_PLAY = { 'bungeo-2p': BUNGEO_PAGE }; // 순위표에 없는 플레이(붕어빵 2인)
  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';
  function pageOfGame(game) {
    if (EXTRA_PLAY[game]) return EXTRA_PLAY[game];
    var g = GAME[game];
    return g ? (g.group === 'bungeo' ? BUNGEO_PAGE : g.id) : '';
  }
  function knownPage(p) {
    if (p === 'home' || p === BUNGEO_PAGE) return true;
    return !!(GAME[p] && !GAME[p].group);
  }
  function currentPage() {
    try {
      var path = location.pathname, rel = null;
      if (SCRIPT_SRC) {
        var rootPath = new URL('../', SCRIPT_SRC).pathname; // lib/의 한 단계 위 = 사이트 루트
        if (path.indexOf(rootPath) === 0) rel = path.slice(rootPath.length);
      }
      if (rel === null) { var m0 = path.match(/(?:^|\/)(games\/[^/]+\/.*)$/); rel = m0 ? m0[1] : null; }
      if (rel === null) return '';
      if (rel === '' || rel === 'index.html') return 'home';
      var m = rel.match(/^games\/([a-z0-9-]+)\/(?:index\.html)?$/);
      return m && knownPage(m[1]) ? m[1] : '';
    } catch (e) { return ''; }
  }
  function logEvent(kind, page, game, eligible) {
    try {
      if (!page) return;
      rpc('log_event', { p_device: deviceId(), p_kind: kind, p_page: page, p_game: game || null,
        p_eligible: typeof eligible === 'boolean' ? eligible : null });
    } catch (e) {}
  }
  var lastPlay = { game: '', at: 0 };
  function logPlay(game, eligible) {
    var page = pageOfGame(game), now = Date.now();
    if (!page) return;
    // 같은 판의 중복 호출(결과 화면을 다시 그리는 등) 방지: 같은 게임이 3초 안에 다시 오면 무시
    if (lastPlay.game === game && now - lastPlay.at < 3000) return;
    lastPlay = { game: game, at: now };
    logEvent('play', page, game, eligible);
  }
  var visitLogged = false;
  function logVisit() {
    if (visitLogged) return;
    visitLogged = true;
    logEvent('visit', currentPage(), null, null);
  }

  /* ===================== 변경 알림 (홈 닉네임 버튼 등) ===================== */
  var changeFns = [];
  function me() { return { nickname: getNick(), state: nickState() }; }
  function notifyChange() {
    var m = me();
    changeFns.slice().forEach(function (f) { try { f(m); } catch (e) {} });
    if (board) renderNickRow();
  }

  /* ===================== 대기열 ===================== */
  var resp = {};      // game → { rank,total,best,at,up }  (이번 방문 동안 submit 성공 응답)
  var flushing = null;
  var noPlayer = false; // 이번 방문 중 submit_score가 no player를 받음 → 칩 "닉네임 확인이 필요해요"
  function validScore(game, s) { s = Math.floor(+s); return GAME[game] && s > 0 && s <= GAME[game].cap ? s : 0; }
  function enqueue(game, score) {
    score = validScore(game, score);
    if (!score) return false;
    var q = getQueue(), cur0 = q[game];
    if (!cur0 || !(cur0.score >= score)) q[game] = { score: score, at: Date.now() };
    setQueue(q);
    return true;
  }
  function seedLocal() {
    if (store.get(K.seeded) === '1') return;
    store.set(K.seeded, '1');
    if (!CONFIG.seedLocalBest) return;
    CONFIG.games.forEach(function (g) { if (g.seed) { var v = validScore(g.id, g.best()); if (v) enqueue(g.id, v); } });
  }
  // 서버 등록 성공(created/same/linked) 처리. switching = [다른 닉네임으로 이어하기]
  function applySuccess(status, nick, switching) {
    store.set(K.nick, nick);
    store.set(K.state, 'ok');
    store.del(K.pin); store.del(K.gmsg);
    setSent({}); resp = {}; noPlayer = false;
    if (switching) setQueue({});
    else if (status === 'linked') store.set(K.seeded, '1'); // 이 기기의 옛 로컬 기록은 다른 사람 것일 수 있음
    else seedLocal();
    notifyChange();
  }
  function retryClaim() {
    var st = nickState();
    if (st === 'ok') return Promise.resolve(true);
    if (st !== 'pending') return Promise.resolve(false);
    var nick = getNick(), pin = store.get(K.pin);
    if (!pinOk(pin)) { store.del(K.state); store.del(K.pin); notifyChange(); return Promise.resolve(false); }
    return rpc('claim_nickname', { p_device: deviceId(), p_nick: nick, p_pin: pin }).then(function (r) {
      if (r.kind === 'fail') return false;
      if (r.kind === 'reject' && !claimRejKind(r)) return false; // 입력과 무관한 거부 = 서버 문제 → pending 유지
      var row = r.kind === 'ok' && r.data[0], s = row && row.status;
      if (s === 'created' || s === 'same' || s === 'linked') { applySuccess(s, row.nickname || nick, false); return true; }
      // 다른 결과 확정 → PIN 지우고 다음 페이지 로드 때 게이트(입력값 채움 + 문구)
      if (!s) s = r.kind === 'reject' ? claimRejKind(r) : 'taken';
      if (s === 'locked') setLock(nick);
      store.set(K.gmsg, JSON.stringify({ status: s, tries: row ? row.tries_left : null }));
      store.del(K.pin); store.del(K.state);
      notifyChange();
      return false;
    });
  }
  function sendQueue() {
    if (nickState() !== 'ok') return Promise.resolve();
    var q = getQueue(), game = null;
    for (var i = 0; i < CONFIG.games.length; i++) if (q[CONFIG.games[i].id]) { game = CONFIG.games[i].id; break; }
    if (!game) {
      for (var k in q) { if (!GAME[k]) { delete q[k]; } }
      setQueue(q);
      return Promise.resolve();
    }
    var item = q[game], score = validScore(game, item && item.score);
    if (!score) { delete q[game]; setQueue(q); return sendQueue(); }
    var prev = getSent()[game];
    return rpc('submit_score', { p_game: game, p_device: deviceId(), p_nick: getNick(), p_score: score }).then(function (r) {
      if (r.kind === 'fail') return; // 그 자리에서 중단, 남겨 둠
      if (r.kind === 'reject' && /no player/i.test(r.msg || '')) {
        // 서버가 이 기기를 모름 → 상태를 지우고 칩을 "닉네임 확인이 필요해요 ›"로(누르면 게이트).
        // 대기열은 이 페이지에서는 그대로 두어 바로 게이트로 등록하면 새 플레이어로 제출되지만,
        // 등록하지 않고 다시 로드하면 상태 없는 기기로 보고 boot()에서 지운다(v3-13 5번).
        store.del(K.state); noPlayer = true; notifyChange();
        return;
      }
      var q2 = getQueue();
      if (q2[game] && !(q2[game].score > score)) delete q2[game];
      setQueue(q2);
      if (r.kind === 'ok') {
        var row = rowOf(r);
        if (row) {
          var s = getSent(); s[game] = Math.max(row.best || score, +s[game] || 0); setSent(s);
          // 이번 판 점수가 서버 최고가 된 경우에만 "새 순위!" (이어받기 직후엔 sent가 비어 prev가 없음)
          resp[game] = { rank: row.rank, total: row.total, best: row.best, at: Date.now(), up: row.best === score && !(prev >= score) };
        }
      }
      return sendQueue();
    });
  }
  function flush() {
    if (flushing) return flushing;
    flushing = retryClaim().then(function (ok) { if (ok) return sendQueue(); }).then(done, done);
    function done() {
      flushing = null;
      // 백그라운드 재전송(online·로드)으로 대기열이 비면 흐린 문구를 순위로 바꿈
      var c = cur, b = c && c.slot && c.slot.querySelector('.lb-line');
      if (b && b.dataset.state === 'off' && nickState() === 'ok' && !getQueue()[c.game]) settle(c);
    }
    return flushing;
  }
  function hasQueue() { var q = getQueue(); for (var k in q) return true; return false; }
  function afterSuccess() { if (!flushing && (nickState() === 'pending' || (hasQueue() && nickState() === 'ok'))) flush(); }

  /* ===================== PIN 잠금 표시 (서버가 남은 시간을 주지 않으므로 이 기기에서 계산) ===================== */
  function getLock(nick) { var o = readObj(K.lock), t = +o[nickKey(nick)]; return t > Date.now() ? t : 0; }
  function setLock(nick) {
    var t = getLock(nick) || Date.now() + CONFIG.lockMs, o = readObj(K.lock), now = Date.now();
    for (var k in o) if (!(+o[k] > now)) delete o[k];
    o[nickKey(nick)] = t;
    store.set(K.lock, JSON.stringify(o));
    return t;
  }
  function clearLock(nick) { var o = readObj(K.lock); delete o[nickKey(nick)]; store.set(K.lock, JSON.stringify(o)); }
  function mmss(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  /* ===================== CSS ===================== */
  var CSS = [
    '.lb,.lb-slot{--lb-panel:var(--panel,#fff);--lb-well:var(--well,var(--bg,#fbfaf7));--lb-ink:var(--ink,#1f2430);--lb-muted:var(--muted,#6b7280);',
    '--lb-line:var(--grid,var(--line,#e7e2d8));--lb-accent:var(--accent,#e4572e);--lb-me-bg:#fcebe5;--lb-up:#2f7d47;--lb-warn:#8a6d3b;--lb-err:#c23b3b;',
    '--lb-gold:#ecd08a;--lb-gold-ink:#4a3708;--lb-silver:#d8dce3;--lb-silver-ink:#343a46;--lb-bronze:#e6bf9c;--lb-bronze-ink:#4f3219;',
    '--lb-backdrop:rgba(31,36,48,.40);--lb-num:var(--num-font,system-ui,-apple-system,"Apple SD Gothic Neo",sans-serif);}',
    '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .lb,:root:not([data-theme="light"]) .lb-slot{',
    '--lb-panel:var(--panel,#1b1e27);--lb-well:var(--well,var(--bg,#161921));--lb-ink:var(--ink,#eceef3);--lb-muted:var(--muted,#9aa1ae);',
    '--lb-line:var(--grid,var(--line,#262a35));--lb-accent:var(--accent,#ff7a50);--lb-me-bg:#2b2220;--lb-up:#6fd08b;--lb-warn:#d9b36c;--lb-err:#ff7b7b;',
    '--lb-gold:#c9a54e;--lb-gold-ink:#14161c;--lb-silver:#9aa2b0;--lb-silver-ink:#14161c;--lb-bronze:#b8896a;--lb-bronze-ink:#14161c;--lb-backdrop:rgba(0,0,0,.60);}}',
    ':root[data-theme="dark"] .lb,:root[data-theme="dark"] .lb-slot{',
    '--lb-panel:var(--panel,#1b1e27);--lb-well:var(--well,var(--bg,#161921));--lb-ink:var(--ink,#eceef3);--lb-muted:var(--muted,#9aa1ae);',
    '--lb-line:var(--grid,var(--line,#262a35));--lb-accent:var(--accent,#ff7a50);--lb-me-bg:#2b2220;--lb-up:#6fd08b;--lb-warn:#d9b36c;--lb-err:#ff7b7b;',
    '--lb-gold:#c9a54e;--lb-gold-ink:#14161c;--lb-silver:#9aa2b0;--lb-silver-ink:#14161c;--lb-bronze:#b8896a;--lb-bronze-ink:#14161c;--lb-backdrop:rgba(0,0,0,.60);}',

    /* 결과 화면 칩 */
    '.lb-slot{display:flex;align-items:center;justify-content:center;min-height:32px;max-width:100%;min-width:0;margin:0;line-height:1.2}',
    '.lb-slot.lb-inline{display:inline-flex;vertical-align:middle;min-height:0;margin-left:8px}',
    '.lb-slot[hidden]{display:none!important}',
    '.lb-slot:empty{min-height:32px}',
    '.lb-slot .lb-line{position:relative;display:inline-flex;align-items:center;gap:6px;height:36px;min-height:0;min-width:0;max-width:100%;margin:0;padding:0 14px;',
    'border-radius:999px;background:var(--lb-panel);border:1px solid var(--lb-line);color:var(--lb-ink);font:inherit;font-size:14px;font-weight:600;line-height:1;',
    'white-space:nowrap;overflow:hidden;box-shadow:none;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;text-decoration:none;',
    'animation:lbChip 180ms ease-out 120ms backwards;transition:none}',
    '.lb-slot .lb-line:active{transform:scale(.97);background:var(--lb-panel);filter:none}',
    '.lb-slot .lb-line:disabled,.lb-slot .lb-line[aria-disabled="true"]{cursor:default;opacity:1;transform:none}',
    '.lb-slot .lb-line:focus-visible{outline:3px solid var(--lb-accent);outline-offset:2px}',
    '.lb-slot .lb-line.lb-wait{color:var(--lb-muted);font-weight:500}',
    '.lb-slot .lb-line.lb-check{color:var(--lb-err);border-color:var(--lb-err)}',
    '.lb-slot .lb-line.lb-off{color:var(--lb-warn);border-color:transparent;background:transparent;font-weight:500;opacity:.9}',
    '.lb-slot .lb-t{min-width:0;overflow:hidden;text-overflow:ellipsis}',
    '.lb-slot .lb-n,.lb .lb-n{font-family:var(--lb-num);font-weight:800;font-variant-numeric:tabular-nums}',
    '.lb-slot .lb-n{font-size:16px}',
    '.lb-slot .lb-more{color:var(--lb-muted);font-size:13px;font-weight:500;flex:none}',
    '.lb-slot .lb-new{flex:none;font-size:11px;font-weight:800;color:var(--lb-up);border:1px solid currentColor;border-radius:999px;padding:2px 6px}',
    '.lb-slot .lb-gold1{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--lb-gold);color:var(--lb-gold-ink);font-size:13px}',
    '.lb-slot .lb-line.lb-short .lb-long{display:none}',
    '@keyframes lbChip{from{opacity:0;transform:translateY(6px)}}',
    '@media (max-height:520px){.lb-slot,.lb-slot:empty{min-height:28px}.lb-slot.lb-inline{min-height:0}',
    '.lb-slot .lb-line{height:28px;font-size:13px;padding:0 12px}.lb-slot .lb-n{font-size:14px}',
    '.lb-slot .lb-line::after{content:"";position:absolute;left:0;right:0;top:-8px;bottom:-8px}}',

    /* 공통 레이어 */
    'body.lb-open{overflow:hidden}',
    '.lb{position:fixed;inset:0;z-index:1000;font-family:system-ui,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;color:var(--lb-ink);',
    'user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;line-height:1.4;text-align:left;font-size:15px;letter-spacing:normal;touch-action:manipulation}',
    '.lb *{box-sizing:border-box}',
    '.lb [hidden]{display:none!important}',
    '.lb-backdrop{position:absolute;inset:0;background:var(--lb-backdrop);animation:lbFade 200ms ease-out}',
    '.lb button{font:inherit;color:inherit;margin:0;box-shadow:none;touch-action:manipulation;cursor:pointer;-webkit-tap-highlight-color:transparent;transform:none;filter:none;transition:none;text-transform:none;letter-spacing:normal}',
    '.lb button:focus-visible,.lb input:focus-visible{outline:3px solid var(--lb-accent);outline-offset:2px}',
    '.lb .lb-btn{height:44px;min-width:44px;padding:0 16px;border-radius:12px;border:1px solid var(--lb-line);background:var(--lb-panel);color:var(--lb-ink);font-size:15px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;gap:6px;width:auto;white-space:nowrap}',
    '.lb .lb-btn:active{background:var(--lb-well);transform:none}',
    '.lb .lb-btn.lb-ok{background:var(--lb-accent);border-color:transparent;color:#fff}',
    '.lb .lb-btn.lb-ok:active{background:var(--lb-accent);filter:brightness(.92)}',
    '.lb .lb-btn:disabled{opacity:.45;cursor:default}',
    '.lb .lb-link{height:44px;min-width:44px;padding:0 6px;border:0;background:none;color:var(--lb-ink);font-size:14px;font-weight:700;text-decoration:underline;text-underline-offset:3px;display:inline-flex;align-items:center;white-space:nowrap}',
    '.lb .lb-link:active{background:none}',
    '.lb .lb-link:disabled{opacity:.45;cursor:default}',
    '.lb .lb-x{flex:none;width:44px;height:44px;padding:0;border:0;border-radius:12px;background:none;color:var(--lb-muted);display:grid;place-items:center}',
    '.lb .lb-x:active{background:var(--lb-well)}',
    '.lb .lb-x svg{width:20px;height:20px}',

    /* 순위표 */
    '.lb-board{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(440px,calc(100vw - 24px));max-height:calc(100vh - 32px);max-height:min(640px,calc(100dvh - 32px));',
    'background:var(--lb-panel);border:1px solid var(--lb-line);border-radius:18px;box-shadow:0 12px 32px rgba(0,0,0,.22);display:flex;flex-direction:column;overflow:hidden;animation:lbPop 240ms ease-out}',
    '.lb-head{flex:none;display:flex;align-items:center;gap:8px;min-height:52px;padding:4px 4px 4px 18px}',
    '.lb-head h2{flex:1;min-width:0;margin:0;font-size:17px;font-weight:800;color:var(--lb-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3}',
    '.lb-head h2 small{font-size:13px;font-weight:600;color:var(--lb-muted);margin-left:4px}',
    '@media (max-width:479.98px){.lb-head h2 small.lb-pcthint{display:none}}',
    '.lb-tabs{flex:none;display:flex;gap:2px;padding:0 10px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;border-bottom:1px solid var(--lb-line);overscroll-behavior-x:contain;touch-action:pan-x}',
    '.lb-tabs.lb-fade{-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 24px),transparent);mask-image:linear-gradient(to right,#000 calc(100% - 24px),transparent)}',
    '.lb-tabs::-webkit-scrollbar{display:none}',
    '.lb .lb-tab{flex:none;height:44px;padding:0 10px;border:0;border-bottom:2px solid transparent;border-radius:0;background:none;color:var(--lb-muted);font-size:14px;font-weight:600;white-space:nowrap}',
    '.lb .lb-tab:active{background:none}',
    '.lb .lb-tab[aria-selected="true"]{color:var(--lb-ink);font-weight:800;border-bottom-color:var(--lb-accent)}',
    '.lb-seg{flex:none;display:flex;margin:8px 16px 6px;border:1px solid var(--lb-line);border-radius:12px;overflow:hidden}',
    '.lb .lb-segb{flex:1 1 0;min-width:0;height:40px;padding:0 6px;border:0;border-left:1px solid var(--lb-line);border-radius:0;background:var(--lb-panel);color:var(--lb-ink);font-size:14px;font-weight:600;position:relative}',
    '.lb .lb-segb:first-child{border-left:0}',
    '.lb .lb-segb::after{content:"";position:absolute;left:0;right:0;top:-2px;bottom:-2px}',
    '.lb .lb-segb[aria-checked="true"]{background:var(--lb-accent);color:#fff;font-weight:800}',
    '.lb .lb-segb:focus-visible{outline-offset:-3px}',
    '.lb-hint{flex:none;margin:0;padding:0 16px 6px;font-size:12px;color:var(--lb-muted)}',
    '.lb-list{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch;border-top:1px solid var(--lb-line)}',
    '.lb-tabs + .lb-list{border-top:0}',
    '.lb-ol{list-style:none;margin:0;padding:4px 0}',
    '.lb-row{display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:10px;align-items:center;height:44px;padding:0 16px;position:relative}',
    '.lb-ol .lb-row:nth-child(even){background:var(--lb-well)}',
    '.lb-row .lb-rk{justify-self:center;font-family:var(--lb-num);font-weight:800;font-variant-numeric:tabular-nums;color:var(--lb-muted);font-size:15px}',
    '.lb-row .lb-rk.lb-m{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;font-size:14px}',
    '.lb-row .lb-rk.lb-m1{background:var(--lb-gold);color:var(--lb-gold-ink)}',
    '.lb-row .lb-rk.lb-m2{background:var(--lb-silver);color:var(--lb-silver-ink)}',
    '.lb-row .lb-rk.lb-m3{background:var(--lb-bronze);color:var(--lb-bronze-ink)}',
    '.lb-row .lb-nm{min-width:0;display:flex;align-items:center;gap:6px;font-size:15px;font-weight:600;color:var(--lb-ink)}',
    '.lb-row .lb-nm span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.lb-row .lb-sc{text-align:right;font-family:var(--lb-num);font-weight:800;font-variant-numeric:tabular-nums;font-size:16px;color:var(--lb-ink)}',
    '.lb-row .lb-sc small{font-size:13px;font-weight:600;color:var(--lb-muted);margin-left:1px}',
    '.lb-row.lb-me,.lb-ol .lb-row.lb-me:nth-child(even){background:var(--lb-me-bg)}',
    '.lb-row.lb-me::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--lb-accent)}',
    '.lb-tag{flex:none;font-style:normal;font-size:11px;font-weight:700;line-height:1;padding:3px 5px;border:1px solid var(--lb-line);border-radius:6px;color:var(--lb-ink);background:var(--lb-panel)}',
    '.lb-sep{text-align:center;color:var(--lb-muted);font-size:18px;line-height:1;padding:4px 0 2px;letter-spacing:2px}',
    '.lb-meout{flex:none;border-top:1px solid var(--lb-line)}',
    '.lb-msg{padding:28px 20px;text-align:center;color:var(--lb-muted);font-size:15px;display:flex;flex-direction:column;align-items:center;gap:12px}',
    '.lb-msg.lb-errm{color:var(--lb-err)}',
    '.lb-skel{padding:8px 16px}',
    '.lb-skel i{display:block;height:14px;margin:15px 0;border-radius:7px;background:var(--lb-line)}',
    '.lb-skel i:nth-child(2n){width:80%}.lb-skel i:nth-child(3n){width:65%}',
    '.lb-foot{flex:none;border-top:1px solid var(--lb-line);padding:6px 16px 10px;display:flex;flex-direction:column;gap:2px}',
    '.lb-total{font-size:12px;color:var(--lb-muted);min-height:16px}',
    '.lb-nickrow{display:flex;align-items:center;gap:6px;font-size:14px;color:var(--lb-ink);min-width:0}',
    '.lb-nickrow b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.lb-priv{margin:0;font-size:12px;color:var(--lb-muted);line-height:1.45}',

    /* 위쪽 붙임 카드 (게이트·내 정보 시트) */
    '.lb-card{position:absolute;left:50%;top:calc(var(--lb-vvt,0px) + max(12px,env(safe-area-inset-top)));transform:translateX(-50%);z-index:2;',
    'width:min(400px,calc(100vw - 24px - env(safe-area-inset-left) - env(safe-area-inset-right)));max-height:calc(var(--lb-vvh,100vh) - 24px);overflow-y:auto;overscroll-behavior:contain;',
    'background:var(--lb-panel);border:1px solid var(--lb-line);border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:16px;display:flex;flex-direction:column;gap:10px;animation:lbDrop 220ms ease-out}',
    '.lb-gate{position:absolute;inset:0;z-index:3;background:var(--lb-well);background:color-mix(in srgb,var(--lb-well) 96%,transparent);animation:lbFade 220ms ease-out}',
    '.lb-site{margin:0;font-size:13px;font-weight:700;color:var(--lb-muted)}',
    '.lb-ctop{display:flex;align-items:center;gap:8px;min-height:24px}',
    '.lb-ctop .lb-site,.lb-ctop .lb-ctitle{flex:1;min-width:0}',
    '.lb-ctop .lb-x{margin:-10px -10px -10px 0}',
    '.lb-ctitle{margin:0;font-size:20px;font-weight:800;color:var(--lb-ink);line-height:1.3}',
    '.lb-who{margin:0;font-size:13px;color:var(--lb-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.lb-who b{color:var(--lb-ink)}',
    '.lb-field{position:relative;display:flex}',
    '.lb .lb-field input{flex:1;min-width:0;height:48px;padding:0 56px 0 14px;font:inherit;font-size:16px;color:var(--lb-ink);background:var(--lb-well);border:1px solid var(--lb-line);border-radius:12px;',
    'user-select:text;-webkit-user-select:text;margin:0;width:100%;outline:none;box-shadow:none;appearance:none;-webkit-appearance:none}',
    '.lb .lb-field input:focus{border-color:var(--lb-accent)}',
    '.lb .lb-field.lb-bad input{border-color:var(--lb-err)}',
    '.lb .lb-gate .lb-field input{border-color:var(--lb-accent)}',
    '.lb .lb-gate .lb-field.lb-bad input{border-color:var(--lb-err)}',
    '.lb-count{position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:13px;color:var(--lb-muted);font-variant-numeric:tabular-nums;pointer-events:none}',
    '.lb-count.lb-full{color:var(--lb-ink);font-weight:800}',
    '.lb-pinrow{display:flex;align-items:center;gap:10px}',
    '.lb-pin{position:relative;display:flex;gap:10px;flex:none}',
    '.lb-box{width:44px;height:52px;border:1px solid var(--lb-line);border-radius:12px;background:var(--lb-well);display:grid;place-items:center;font-family:var(--lb-num);font-weight:800;font-size:24px;color:var(--lb-ink);font-variant-numeric:tabular-nums}',
    '.lb-pin.lb-focus .lb-box.lb-cur{border:2px solid var(--lb-accent)}',
    '.lb-pin.lb-bad .lb-box{border-color:var(--lb-err)}',
    '.lb-pin.lb-dis{opacity:.45}',
    '.lb .lb-pin input{position:absolute;inset:0;width:100%;height:100%;margin:0;padding:0;border:0;outline:none;background:transparent;color:transparent;caret-color:transparent;',
    'font-size:16px;opacity:.01;user-select:text;-webkit-user-select:text;appearance:none;-webkit-appearance:none;cursor:text}',
    '.lb .lb-pin input::selection{background:transparent}',
    '.lb-shake{animation:lbShake 320ms ease-in-out}',
    '@keyframes lbShake{20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}',
    '.lb-info{margin:0;font-size:12px;color:var(--lb-muted);line-height:1.45;min-height:17px}',
    '.lb-info.lb-errm{color:var(--lb-err);font-weight:600}',
    '.lb-info.lb-warnm{color:var(--lb-warn);font-weight:600}',
    '.lb-info.lb-okm{color:var(--lb-up);font-weight:700}',
    '.lb-acts{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}',
    '.lb-acts .lb-back{margin-right:auto;margin-left:-6px}',
    '.lb-acts.lb-stack{flex-direction:column;align-items:stretch}',
    '.lb-acts.lb-stack .lb-btn{width:100%}',
    '.lb-menu{display:flex;flex-direction:column;gap:8px}',
    '.lb-menu .lb-btn{width:100%;justify-content:flex-start}',
    '.lb-ctitle.lb-label{font-size:14px;font-weight:700;color:var(--lb-muted)}',
    '.lb-bignick{margin:0;font-size:22px;font-weight:800;color:var(--lb-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    /* 키보드가 올라와 보이는 높이 < 260px: 한 줄 콤팩트 */
    '.lb-card.lb-tiny{flex-direction:row;flex-wrap:wrap;align-items:center;gap:6px 8px;padding:10px 12px}',
    '.lb-card.lb-tiny .lb-site,.lb-card.lb-tiny .lb-priv,.lb-card.lb-tiny .lb-who,.lb-card.lb-tiny .lb-note{display:none}',
    '.lb-card.lb-tiny .lb-info:not(.lb-errm):not(.lb-warnm):not(.lb-okm){display:none}',
    '.lb-card.lb-tiny .lb-ctop,.lb-card.lb-tiny .lb-info{flex-basis:100%}',
    '.lb-card.lb-tiny .lb-ctop{min-height:0}',
    '.lb-card.lb-tiny .lb-ctitle{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.lb-card.lb-tiny .lb-field{flex:1 1 150px;min-width:0}',
    '.lb-card.lb-tiny .lb-pinrow{flex:1 1 auto;min-width:0;gap:4px}',
    '.lb-card.lb-tiny .lb-meclose{display:none}',
    '.lb-card.lb-tiny .lb-field input{height:44px}',
    '.lb-card.lb-tiny .lb-box{width:40px;height:44px;font-size:20px}',
    '.lb-card.lb-tiny .lb-pin{gap:6px}',
    '.lb-card.lb-tiny .lb-acts{flex:none;flex-wrap:nowrap}',
    '.lb-card.lb-tiny .lb-acts.lb-stack{flex-direction:row;flex-basis:100%}',
    '.lb-card.lb-tiny .lb-acts .lb-back{margin:0}',
    '.lb-card.lb-tiny .lb-menu{flex-basis:100%;flex-direction:row;flex-wrap:wrap}',
    '.lb-card.lb-tiny .lb-menu .lb-btn{width:auto;flex:1 1 auto}',
    '.lb-card.lb-tiny .lb-bignick{font-size:17px;flex:1}',

    /* 폰 세로: 아래 시트 */
    '@media (max-width:479.98px) and (min-height:520.02px){.lb-board{left:0;right:0;top:auto;bottom:0;transform:none;width:100%;max-height:88vh;max-height:88dvh;',
    'border-radius:18px 18px 0 0;border-left:0;border-right:0;border-bottom:0;padding-bottom:env(safe-area-inset-bottom);animation:lbUp 240ms ease-out}}',
    /* 폰 가로 */
    '@media (max-height:520px){.lb-board{max-height:calc(100vh - 16px);max-height:calc(100dvh - 16px);border-radius:14px}',
    '.lb-head{min-height:44px;padding:0 2px 0 16px}.lb-head h2{font-size:16px}.lb-row{height:40px}.lb .lb-tab{height:40px}',
    '.lb-seg{margin:6px 16px 4px}.lb .lb-segb{height:34px}.lb .lb-segb::after{top:-5px;bottom:-5px}',
    '.lb-foot{padding:4px 16px 6px;flex-direction:row;flex-wrap:wrap;align-items:center;column-gap:12px}.lb-priv{flex-basis:100%}',
    '.lb-foot .lb-link{height:36px}.lb-msg{padding:16px}',
    '.lb-hint{display:none}.lb-foot .lb-priv{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.lb-card{padding:12px 14px;gap:8px}.lb-ctitle{font-size:18px}}',
    '@keyframes lbFade{from{opacity:0}}',
    '@keyframes lbPop{from{opacity:0;transform:translate(-50%,-50%) scale(.98)}}',
    '@keyframes lbUp{from{transform:translateY(100%)}}',
    '@keyframes lbDrop{from{opacity:0;transform:translate(-50%,-12px)}}',
    '@media (prefers-reduced-motion:reduce){.lb-slot .lb-line{animation:lbFade 120ms ease-out}.lb-board,.lb-card,.lb-backdrop,.lb-gate{animation:lbFade 120ms ease-out}',
    '.lb-slot .lb-line:active{transform:none}.lb-shake{animation:none}}'
  ].join('\n');
  function injectCss() {
    if (document.getElementById('lb-style')) return;
    var st = document.createElement('style');
    st.id = 'lb-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ===================== DOM 도우미 ===================== */
  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(cls, text, fn) {
    var b = h('button', cls, text); b.type = 'button';
    if (fn) b.addEventListener('click', fn);
    return b;
  }
  function fmt(n) { n = +n || 0; try { return n.toLocaleString('ko-KR'); } catch (e) { return String(n); } }
  function pct(s) { return (Math.round(+s || 0) / 10).toFixed(1); }
  function scoreText(g, s) { return g.pct ? pct(s) + '%' : fmt(s); }
  function scoreSpeech(g, s) { return g.pct ? '이긴 판 최고 ' + pct(s) + '퍼센트' : fmt(s) + g.unit; }
  function gameTitle(g) { return g.name + ' 순위' + (g.diff ? ' · ' + g.diff : ''); }
  var X_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>';
  function announce(text) {
    var live = document.getElementById('live');
    if (live) { try { live.textContent = text; } catch (e) {} }
  }
  function focusEl(el) { if (el) { try { el.focus({ preventScroll: true }); } catch (e) {} } }
  function shake(el) { if (!el) return; el.classList.remove('lb-shake'); void el.offsetWidth; el.classList.add('lb-shake'); }
  function setInfo(info, text, kind) {
    info.textContent = text || '';
    info.classList.remove('lb-errm', 'lb-warnm', 'lb-okm');
    if (kind) info.classList.add('lb-' + kind + 'm');
  }

  /* 닉네임 입력칸 (8자, 카운터, IME 조합 고려) */
  function nickField(id, value, onChange, onEnter) {
    var field = h('div', 'lb-field');
    var inp = h('input'); inp.id = id; inp.type = 'text';
    inp.setAttribute('maxlength', '8'); inp.setAttribute('enterkeyhint', 'done'); inp.setAttribute('autocomplete', 'off');
    inp.setAttribute('autocapitalize', 'off'); inp.setAttribute('autocorrect', 'off'); inp.setAttribute('spellcheck', 'false');
    inp.setAttribute('placeholder', '최대 8자');
    inp.value = value || '';
    var cnt = h('span', 'lb-count'); cnt.setAttribute('aria-hidden', 'true');
    field.appendChild(inp); field.appendChild(cnt);
    var composing = false;
    function clip() { var a = Array.from(inp.value); if (a.length > 8) inp.value = a.slice(0, 8).join(''); }
    function upd() {
      var n = nlen(cleanNick(inp.value));
      cnt.textContent = n + '/8';
      cnt.classList.toggle('lb-full', n >= 8);
      if (onChange) onChange(n);
    }
    inp.addEventListener('compositionstart', function () { composing = true; });
    inp.addEventListener('compositionend', function () { composing = false; clip(); upd(); });
    inp.addEventListener('input', function (e) { if (!composing && !e.isComposing) clip(); field.classList.remove('lb-bad'); upd(); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.isComposing && !composing && e.keyCode !== 229) { e.preventDefault(); clip(); if (onEnter) onEnter(); }
    });
    return { el: field, input: inp, upd: upd, value: function () { clip(); return inp.value; },
      bad: function (b) { field.classList.toggle('lb-bad', !!b); } };
  }

  /* PIN 4칸 (input 1개를 투명하게 덮음). reveal=true면 입력한 숫자를 1초 보였다가 가림 */
  function pinField(id, onChange, onEnter) {
    var row = h('div', 'lb-pinrow');
    var wrap = h('div', 'lb-pin');
    var boxes = [];
    for (var i = 0; i < 4; i++) { var bx = h('span', 'lb-box'); bx.setAttribute('aria-hidden', 'true'); boxes.push(bx); wrap.appendChild(bx); }
    var inp = h('input'); inp.id = id; inp.type = 'text';
    inp.setAttribute('inputmode', 'numeric'); inp.setAttribute('pattern', '[0-9]*'); inp.setAttribute('maxlength', '4');
    inp.setAttribute('autocomplete', 'off'); inp.setAttribute('enterkeyhint', 'done'); inp.setAttribute('autocorrect', 'off');
    inp.setAttribute('spellcheck', 'false'); inp.setAttribute('autocapitalize', 'off');
    wrap.appendChild(inp);
    var eye = btn('lb-link lb-eye', '보기');
    eye.setAttribute('aria-pressed', 'false');
    row.appendChild(wrap); row.appendChild(eye);
    var st = { show: false, reveal: false, lastAt: 0, timer: 0 };
    function render() {
      var v = inp.value, now = Date.now();
      for (var j = 0; j < 4; j++) {
        var ch = v.charAt(j), txt = '';
        if (ch) txt = (st.show || (st.reveal && j === v.length - 1 && now - st.lastAt < 1000)) ? ch : '●';
        boxes[j].textContent = txt;
        boxes[j].classList.toggle('lb-cur', j === Math.min(v.length, 3));
      }
    }
    inp.addEventListener('input', function () {
      var v = inp.value.replace(/[^0-9]/g, '').slice(0, 4);
      if (v !== inp.value) inp.value = v;
      st.lastAt = Date.now();
      wrap.classList.remove('lb-bad');
      render();
      clearTimeout(st.timer);
      if (st.reveal) st.timer = setTimeout(render, 1020);
      if (onChange) onChange(v.length);
    });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); if (onEnter) onEnter(); }
    });
    inp.addEventListener('focus', function () { wrap.classList.add('lb-focus'); try { var L = inp.value.length; inp.setSelectionRange(L, L); } catch (e) {} });
    inp.addEventListener('blur', function () { wrap.classList.remove('lb-focus'); });
    eye.addEventListener('click', function () {
      st.show = !st.show;
      eye.textContent = st.show ? '가리기' : '보기';
      eye.setAttribute('aria-pressed', st.show ? 'true' : 'false');
      render(); focusEl(inp);
    });
    render();
    return {
      el: row, input: inp, wrap: wrap,
      value: function () { return inp.value; },
      clear: function () { inp.value = ''; render(); if (onChange) onChange(0); },
      setReveal: function (b) { st.reveal = !!b; render(); },
      disable: function (b) { inp.disabled = !!b; eye.disabled = !!b; wrap.classList.toggle('lb-dis', !!b); },
      bad: function () { wrap.classList.add('lb-bad'); shake(wrap); },
      destroy: function () { clearTimeout(st.timer); }
    };
  }

  /* ===================== 결과 화면 칩 ===================== */
  var cur = null, seq = 0;

  function report(o) {
    try {
      injectCss();
      o = o || {};
      var g = GAME[o.game];
      if (!g) return;
      store.set(K.last, g.id);
      var c = { id: ++seq, game: g.id, score: Math.floor(+o.score) || 0, eligible: o.eligible !== false, reason: o.reason || '', slot: o.slot || null, t0: Date.now() };
      cur = c;
      logPlay(c.game, c.eligible);
      if (c.slot) { c.slot.classList.add('lb-slot'); }
      if (!c.eligible) { render(c, 'inel'); return; }
      var s = validScore(c.game, c.score);
      var sent = getSent()[c.game];
      // 서버 최고(sent)보다 높을 때만. sent가 없으면 이번 판 점수만(로컬 최고는 섞지 않음)
      if (s && !(+sent >= s)) enqueue(c.game, s);
      var st = nickState();
      if (st !== 'ok') {
        render(c, offState());
        if (st === 'pending') flush().then(function () { if (nickState() === 'ok') settle(c); });
        return;
      }
      if (getQueue()[c.game]) {
        render(c, 'wait');
        flush().then(function () { settle(c); });
      } else settle(c);
    } catch (e) {}
  }
  function offState() { return noPlayer && !nickState() ? 'check' : 'off'; }
  function settle(c) {
    if (c !== cur) return;
    if (nickState() !== 'ok' || getQueue()[c.game]) { render(c, offState()); return; }
    var r = resp[c.game];
    if (r && r.at >= c.t0) { render(c, 'ok', r); return; }
    render(c, 'wait');
    rpc('my_rank', { p_game: c.game, p_device: deviceId() }).then(function (res) {
      if (c !== cur) return;
      if (res.kind !== 'ok') { render(c, 'off'); return; }
      var row = rowOf(res);
      if (row) render(c, 'ok', { rank: row.rank, total: row.total, up: false });
      else render(c, 'none');
      afterSuccess();
    });
  }
  function render(c, state, data) {
    if (!c.slot || c !== cur) return;
    var slot = c.slot, g = GAME[c.game];
    var b = h('button', 'lb-line');
    b.type = 'button';
    var label = '';
    if (state === 'wait') {
      b.classList.add('lb-wait');
      b.setAttribute('aria-disabled', 'true');
      b.appendChild(h('span', 'lb-t', '순위 확인 중…'));
      label = '순위 확인 중';
    } else if (state === 'off') {
      b.classList.add('lb-off');
      b.setAttribute('aria-disabled', 'true');
      b.appendChild(h('span', 'lb-t', '연결되면 순위에 올라가요'));
      label = '연결되면 순위에 올라가요';
    } else if (state === 'check') {
      // UI 명세 v2 3-1 "잠금/인증 오류": 누르면 게이트(닉네임 채움 → PIN 흐름)
      b.classList.add('lb-check');
      b.appendChild(h('span', 'lb-t', '닉네임 확인이 필요해요'));
      b.appendChild(h('span', 'lb-more', '›'));
      label = '닉네임 확인이 필요해요. 닉네임과 PIN 다시 넣기';
      b.addEventListener('click', function () { if (!nickState()) needGate(); });
    } else if (state === 'ok') {
      var t = h('span', 'lb-t');
      if (data.rank === 1) {
        t.innerHTML = '<b class="lb-n lb-gold1">1</b>위! · <b class="lb-n"></b>명';
        t.lastElementChild.textContent = fmt(data.total);
      } else {
        t.innerHTML = '<span class="lb-long">내 순위 </span><b class="lb-n"></b>위 · <b class="lb-n"></b>명';
        var ns = t.querySelectorAll('b');
        ns[0].textContent = fmt(data.rank); ns[1].textContent = fmt(data.total);
      }
      b.appendChild(t);
      if (data.up) b.appendChild(h('span', 'lb-new', '새 순위!'));
      var more = h('span', 'lb-more'); more.innerHTML = '<span class="lb-long">순위표 </span>›';
      b.appendChild(more);
      label = (g.diff ? g.diff + ' 난이도 ' : '') + '내 순위 ' + fmt(data.total) + '명 중 ' + fmt(data.rank) + '위. 순위표 열기';
      b.addEventListener('click', function () { open(c.game, b); });
      announce(fmt(data.total) + '명 중 ' + fmt(data.rank) + '위' + (data.up ? ', 새 순위' : ''));
    } else {
      var msg = state === 'none' ? (g.group === 'bungeo' ? '이기면 순위에 올라가요' : '기록을 세우면 순위에 올라가요')
        : (c.reason === 'retry' ? '이어하기 판은 순위에 안 올라가요' : '테스트 판은 순위에 안 올라가요');
      b.appendChild(h('span', 'lb-t', msg));
      var m2 = h('span', 'lb-more'); m2.innerHTML = '<span class="lb-long">순위표 </span>›';
      b.appendChild(m2);
      label = msg + '. 순위표 열기';
      b.addEventListener('click', function () { open(c.game, b); });
    }
    b.setAttribute('aria-label', label);
    b.dataset.state = state;
    var hadFocus = slot.contains(document.activeElement);
    slot.textContent = '';
    slot.appendChild(b);
    if (hadFocus) focusEl(b);
    fitChip(b);
  }
  function fitChip(b) {
    if (!b || !b.isConnected) return;
    b.classList.remove('lb-short');
    if (!b.clientWidth) return;
    var t = b.querySelector('.lb-t');
    if (b.scrollWidth > b.clientWidth + 1 || (t && t.scrollWidth > t.clientWidth + 1)) b.classList.add('lb-short');
  }
  function refit() { if (cur && cur.slot) fitChip(cur.slot.querySelector('.lb-line')); }

  /* ===================== 모달 공통 ===================== */
  var root = null, board = null, sheet = null, gate = null, opener = null;
  var B = null; // 순위표 상태
  function ensureRoot() {
    injectCss();
    if (root && root.isConnected) return root;
    root = h('div', 'lb');
    var bd = h('div', 'lb-backdrop');
    bd.addEventListener('click', function () { if (gate) return; if (sheet) closeSheet(); else closeBoard(); });
    root.appendChild(bd);
    // 게임 입력이 받지 않도록 루트에서 전파 차단
    ['pointerdown', 'pointerup', 'pointermove', 'pointercancel', 'touchstart', 'touchmove', 'touchend', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel', 'keydown', 'keyup', 'keypress', 'selectstart']
      .forEach(function (t) { root.addEventListener(t, function (e) { e.stopPropagation(); }, { passive: true }); });
    document.body.appendChild(root);
    document.body.classList.add('lb-open');
    return root;
  }
  function maybeRemoveRoot() {
    if (board || sheet || gate) return;
    if (root) { root.remove(); root = null; }
    document.body.classList.remove('lb-open');
  }
  function isOpen() { return !!(root && root.isConnected && (board || sheet || gate)); }
  function topLayer() { return gate ? gate.el : sheet ? sheet.el : board; }
  function focusables(container) {
    return Array.prototype.filter.call(container.querySelectorAll('button, input, [tabindex]'), function (e) {
      return !e.disabled && e.tabIndex >= 0 && e.getClientRects().length > 0 && !e.closest('[hidden]');
    });
  }
  function restoreFocus(el) {
    if (el && el.isConnected) { focusEl(el); return; }
    if (cur && cur.slot) focusEl(cur.slot.querySelector('.lb-line'));
  }

  window.addEventListener('keydown', function (e) {
    if (isOpen()) {
      var top = topLayer(), inside = root.contains(e.target);
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.isComposing) return;
        if (gate) { if (gate.closable && !gate.busy) closeGate(); return; }
        if (sheet) closeSheet(); else closeBoard();
        return;
      }
      if (e.key === 'Tab') {
        e.stopImmediatePropagation();
        var f = focusables(top);
        if (!f.length) { e.preventDefault(); return; }
        var i = f.indexOf(document.activeElement);
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (i < 0 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
        return;
      }
      if (!inside || !top.contains(e.target)) {
        e.stopImmediatePropagation();
        if (/^(Enter| |Spacebar|Arrow\w+|PageUp|PageDown|Home|End|Backspace)$/.test(e.key)) e.preventDefault();
      }
      return; // 안쪽 입력은 대상까지 가고, 루트에서 위로 전파가 막힌다
    }
    // 결과 화면 칩에 포커스 → 버튼 기본 동작만, 게임 키(다시 하기)는 받지 않게
    var t = e.target;
    if (t && t.closest && t.closest('.lb-slot') && (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')) e.stopImmediatePropagation();
  }, true);
  // 게임이 지연 포커스(다시 하기 버튼 등)를 주더라도 창 안으로 되돌림
  document.addEventListener('focusin', function (e) {
    if (!isOpen()) return;
    var top = topLayer();
    if (top.contains(e.target)) return;
    var f = focusables(top);
    if (f.length) focusEl(f[0]);
  }, true);
  window.addEventListener('keyup', function (e) {
    var t = e.target;
    if (isOpen() && !(root.contains(t))) { e.stopImmediatePropagation(); return; }
    if (t && t.closest && t.closest('.lb-slot') && (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')) e.stopImmediatePropagation();
  }, true);

  /* ===================== 순위표 ===================== */
  function bungeoDefault() { var l = store.get(K.last); return GAME[l] && GAME[l].group === 'bungeo' ? l : 'bungeo-normal'; }
  function open(game, from) {
    try {
      if (gate) return;
      if (game === 'bungeo' || game === 'bungeo-snowfight') game = bungeoDefault();
      if (board) closeBoard(true);
      ensureRoot();
      var tabsMode = !GAME[game];
      var g0 = tabsMode ? (GAME[store.get(K.last)] ? store.get(K.last) : CONFIG.games[0].id) : game;
      opener = from || document.activeElement;
      board = h('div', 'lb-board');
      board.setAttribute('role', 'dialog');
      board.setAttribute('aria-modal', 'true');
      board.setAttribute('aria-labelledby', 'lb-title');
      var head = h('div', 'lb-head');
      var title = h('h2'); title.id = 'lb-title';
      var x = btn('lb-x', null, function () { closeBoard(); }); x.setAttribute('aria-label', '닫기'); x.innerHTML = X_SVG;
      head.appendChild(title); head.appendChild(x);
      board.appendChild(head);
      var tabs = null;
      if (tabsMode) {
        tabs = h('div', 'lb-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '게임');
        TABS.forEach(function (tb) {
          var t = btn('lb-tab', tb.short); t.setAttribute('role', 'tab'); t.id = 'lb-tab-' + tb.key; t.setAttribute('aria-controls', 'lb-panel');
          t.dataset.tab = tb.key;
          t.addEventListener('click', function () { selectTab(tb.key, false); });
          tabs.appendChild(t);
        });
        tabs.addEventListener('keydown', function (e) {
          var keys = TABS.map(function (t) { return t.key; }), i = keys.indexOf(TAB_OF[B.game].key), n = -1;
          if (e.key === 'ArrowRight') n = (i + 1) % keys.length;
          else if (e.key === 'ArrowLeft') n = (i - 1 + keys.length) % keys.length;
          else if (e.key === 'Home') n = 0;
          else if (e.key === 'End') n = keys.length - 1;
          if (n < 0) return;
          e.preventDefault();
          selectTab(keys[n], true);
        });
        tabs.addEventListener('scroll', fadeTabs, { passive: true });
        board.appendChild(tabs);
      }
      var seg = h('div', 'lb-seg'); seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', '난이도'); seg.hidden = true;
      seg.addEventListener('keydown', function (e) {
        var ids = TAB_OF[B.game].games, i = ids.indexOf(B.game), n = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = Math.min(ids.length - 1, i + 1);
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = Math.max(0, i - 1);
        if (n < 0) return;
        e.preventDefault();
        selectGame(ids[n], true);
      });
      board.appendChild(seg);
      var hint = h('p', 'lb-hint', '컴퓨터를 이긴 판의 내 땅 %'); hint.hidden = true;
      board.appendChild(hint);
      var list = h('div', 'lb-list'); list.id = 'lb-panel';
      if (tabsMode) list.setAttribute('role', 'tabpanel');
      list.tabIndex = -1;
      board.appendChild(list);
      var meout = h('div', 'lb-meout'); meout.hidden = true;
      board.appendChild(meout);
      var foot = h('div', 'lb-foot');
      var total = h('div', 'lb-total');
      var nickrow = h('div', 'lb-nickrow');
      var priv = h('p', 'lb-priv', PRIVACY);
      foot.appendChild(total); foot.appendChild(nickrow); foot.appendChild(priv);
      board.appendChild(foot);
      root.appendChild(board);
      B = { game: g0, tabs: tabs, seg: seg, segKey: '', hint: hint, title: title, list: list, meout: meout, total: total, nickrow: nickrow, req: 0, pick: {} };
      if (GAME[g0].group) B.pick[GAME[g0].group] = g0;
      renderNickRow();
      selectGame(g0, false);
      focusEl(x);
    } catch (e) {}
  }
  function fadeTabs() {
    if (!B || !B.tabs) return;
    var t = B.tabs;
    t.classList.toggle('lb-fade', t.scrollWidth > t.clientWidth + 1 && t.scrollLeft + t.clientWidth < t.scrollWidth - 2);
  }
  function selectTab(key, focusTab) {
    if (!board) return;
    var tb = null;
    TABS.forEach(function (t) { if (t.key === key) tb = t; });
    if (!tb) return;
    var id = tb.games.length > 1 ? (B.pick[key] || (key === 'bungeo' ? bungeoDefault() : tb.games[0])) : tb.games[0];
    selectGame(id, false, focusTab);
  }
  function selectGame(id, focusSeg, focusTab) {
    if (!board || !GAME[id]) return;
    B.game = id;
    var g = GAME[id], tb = TAB_OF[id];
    if (g.group) B.pick[g.group] = id;
    B.title.innerHTML = '';
    B.title.appendChild(document.createTextNode(gameTitle(g)));
    if (g.unit) B.title.appendChild(h('small', null, '(' + g.unit + ')'));
    else if (g.pct) B.title.appendChild(h('small', 'lb-pcthint', '(이긴 판 내 땅 %)'));
    if (B.tabs) {
      Array.prototype.forEach.call(B.tabs.children, function (t) {
        var on = t.dataset.tab === tb.key;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        if (on) {
          if (focusTab) focusEl(t);
          try { t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {}
          B.list.setAttribute('aria-labelledby', t.id);
        }
      });
      fadeTabs();
    }
    // 난이도 세그먼트 (group 게임만)
    if (tb.games.length > 1) {
      if (B.segKey !== tb.key) {
        B.seg.textContent = '';
        tb.games.forEach(function (gid) {
          var sb = btn('lb-segb', GAME[gid].diff, function () { selectGame(gid, false); });
          sb.setAttribute('role', 'radio'); sb.dataset.game = gid;
          B.seg.appendChild(sb);
        });
        B.segKey = tb.key;
      }
      Array.prototype.forEach.call(B.seg.children, function (sb) {
        var on = sb.dataset.game === id;
        sb.setAttribute('aria-checked', on ? 'true' : 'false');
        sb.tabIndex = on ? 0 : -1;
        if (on && focusSeg) focusEl(sb);
      });
      B.seg.hidden = false;
      B.hint.hidden = !g.pct;
    } else { B.seg.hidden = true; B.hint.hidden = true; }
    B.list.scrollTop = 0;
    load();
  }
  function load() {
    var id = B.game, req = ++B.req, g = GAME[id];
    B.list.innerHTML = '<div class="lb-skel" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>';
    B.list.setAttribute('aria-busy', 'true');
    B.meout.hidden = true; B.meout.textContent = '';
    B.total.textContent = '';
    var dev = deviceId();
    rpc('top_scores', { p_game: id, p_limit: CONFIG.topN, p_device: dev }).then(function (r) {
      if (!board || req !== B.req) return;
      B.list.removeAttribute('aria-busy');
      if (r.kind !== 'ok') {
        B.list.innerHTML = '';
        var m = h('div', 'lb-msg lb-errm');
        m.appendChild(h('span', null, '지금은 순위를 불러올 수 없어요'));
        m.appendChild(btn('lb-btn', '다시 시도', function () { load(); }));
        B.list.appendChild(m);
        return;
      }
      afterSuccess();
      var rows = r.data.filter(function (x) { return x && x.nickname != null; });
      B.list.innerHTML = '';
      if (!rows.length) {
        B.list.appendChild(h('div', 'lb-msg', g.pct ? '아직 기록이 없어요. ' + g.diff + '에서 컴퓨터를 이겨 보세요!' : '아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!'));
        return;
      }
      var ol = h('ol', 'lb-ol'), meRow = null;
      rows.forEach(function (x) {
        var li = rowEl(+x.rank, x.nickname, +x.score, !!x.is_me, g);
        if (x.is_me) meRow = li;
        ol.appendChild(li);
      });
      B.list.appendChild(ol);
      if (rows.length < CONFIG.topN) B.total.textContent = fmt(rows.length) + '명 참여';
      if (meRow) {
        try { meRow.scrollIntoView({ block: 'center', behavior: 'auto' }); } catch (e) {}
        B.list.scrollLeft = 0;
      }
      if (!meRow && rows.length >= CONFIG.topN) {
        rpc('my_rank', { p_game: id, p_device: dev }).then(function (r2) {
          if (!board || req !== B.req) return;
          var row = rowOf(r2);
          if (!row) return;
          B.total.textContent = fmt(row.total) + '명 참여';
          if (row.rank > CONFIG.topN) {
            B.meout.textContent = '';
            B.meout.appendChild(h('div', 'lb-sep', '⋯'));
            var mine = rowEl(row.rank, row.nickname, row.best, true, g);
            mine.setAttribute('role', 'group');
            B.meout.appendChild(mine);
            B.meout.hidden = false;
          }
        });
      }
    });
  }
  function rowEl(rank, nick, score, mine, g) {
    var li = h('li', 'lb-row' + (mine ? ' lb-me' : ''));
    var rk = h('span', 'lb-rk' + (rank <= 3 ? ' lb-m lb-m' + rank : ''), fmt(rank));
    var nm = h('span', 'lb-nm');
    if (mine) nm.appendChild(h('i', 'lb-tag', '나'));
    nm.appendChild(h('span', null, String(nick)));
    var sc = h('span', 'lb-sc');
    if (g.pct) { sc.appendChild(document.createTextNode(pct(score))); sc.appendChild(h('small', null, '%')); }
    else sc.textContent = fmt(score);
    li.appendChild(rk); li.appendChild(nm); li.appendChild(sc);
    li.setAttribute('aria-label', fmt(rank) + '위 ' + nick + ', ' + scoreSpeech(g, score) + (mine ? ' (나)' : ''));
    if (mine) li.setAttribute('aria-current', 'true');
    return li;
  }
  function renderNickRow() {
    if (!board) return;
    var r = B.nickrow, n = getNick();
    r.textContent = '';
    if (!n) return;
    r.appendChild(document.createTextNode('닉네임: '));
    r.appendChild(h('b', null, n));
    r.appendChild(document.createTextNode(' ·'));
    var b = btn('lb-link', '내 정보');
    b.addEventListener('click', function () { openMe(b); });
    r.appendChild(b);
  }
  function closeBoard(keep) {
    if (!board) return;
    board.remove(); board = null; B = null;
    if (sheet || gate) return;
    maybeRemoveRoot();
    if (!keep) restoreFocus(opener);
    opener = null;
  }

  /* ===================== 보이는 높이 (키보드) ===================== */
  function vv() {
    var hgt = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    var top = window.visualViewport ? window.visualViewport.offsetTop : 0;
    [gate && gate.card, sheet && sheet.el].forEach(function (c) {
      if (!c) return;
      c.style.setProperty('--lb-vvh', hgt + 'px');
      c.style.setProperty('--lb-vvt', (top > 0 ? top : 0) + 'px');
      c.classList.toggle('lb-tiny', hgt < 260);
    });
  }
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', vv); window.visualViewport.addEventListener('scroll', vv); }
  window.addEventListener('resize', function () { vv(); refit(); fadeTabs(); });

  /* ===================== 닉네임 게이트 =====================
   * 단계: nick(닉네임) → set1(PIN 정하기) → set2(한 번 더) → claim
   *       claim 결과 wrong_pin(새로 정하던 중) → taken(이미 쓰는 닉네임: PIN 입력하기 / 다른 닉네임) → enter(PIN 입력)
   * mode: 'first'(닫기 없음) | 'switch'(내 정보 → 다른 닉네임으로 이어하기, 닫기 가능)
   */
  function openGate(o) {
    try {
      o = o || {};
      if (gate) return;
      if (sheet) closeSheet(true);
      if (board) closeBoard(true);
      ensureRoot();
      var switching = o.mode === 'switch';
      var g = gate = { mode: switching ? 'switch' : 'first', closable: switching, busy: false, touched: false,
        nick: o.nick || '', pin1: '', step: '', tries: null, timer: 0, opener: o.from || document.activeElement };
      var el = g.el = h('div', 'lb-gate');
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'lb-gate-title');
      el.addEventListener('click', function (e) { if (e.target === el && g.closable && !g.busy) closeGate(); });
      var card = g.card = h('div', 'lb-card lb-gcard');
      var top = h('div', 'lb-ctop');
      top.appendChild(h('p', 'lb-site', "혜진's 스튜디오"));
      if (switching) {
        var x = btn('lb-x', null, function () { if (!g.busy) closeGate(); }); x.setAttribute('aria-label', '닫기'); x.innerHTML = X_SVG;
        top.appendChild(x);
      }
      g.title = h('h2', 'lb-ctitle'); g.title.id = 'lb-gate-title';
      g.who = h('p', 'lb-who');
      g.nf = nickField('lb-gate-nick', g.nick, function (n) { if (g.step === 'nick') g.ok.disabled = g.busy || n < 1; }, function () { primary(); });
      g.nf.input.addEventListener('input', function () { g.touched = true; if (g.step === 'nick' && g.info.classList.contains('lb-errm')) gStep('nick'); });
      g.pf = pinField('lb-gate-pin', function (n) {
        if (g.step === 'set1' || g.step === 'set2' || g.step === 'enter') g.ok.disabled = g.busy || n < 4 || (g.step === 'enter' && !!getLock(g.nick));
        if (n && g.info.classList.contains('lb-errm') && !g.busy) setInfo(g.info, g.defInfo, '');
      }, function () { primary(); });
      g.info = h('p', 'lb-info'); g.info.id = 'lb-gate-info'; g.info.setAttribute('aria-live', 'polite');
      g.nf.input.setAttribute('aria-describedby', 'lb-gate-info');
      g.pf.input.setAttribute('aria-describedby', 'lb-gate-info');
      g.label = h('label', null); g.label.hidden = true;
      g.acts = h('div', 'lb-acts');
      g.back = btn('lb-link lb-back', '← 닉네임', function () { if (!g.busy) back(); });
      g.alt = btn('lb-btn', '다른 닉네임 쓰기', function () { if (!g.busy) toNick(true); });
      g.ok = btn('lb-btn lb-ok', '다음', function () { primary(); });
      g.acts.appendChild(g.back); g.acts.appendChild(g.alt); g.acts.appendChild(g.ok);
      var priv = h('p', 'lb-priv', PRIVACY);
      card.appendChild(top); card.appendChild(g.title); card.appendChild(g.who);
      card.appendChild(g.nf.el); card.appendChild(g.pf.el); card.appendChild(g.info); card.appendChild(g.acts); card.appendChild(priv);
      el.appendChild(card);
      root.appendChild(el);
      vv();
      g.hint = o.hint || '';
      if (o.step === 'set1' && checkNick(g.nick).ok) { g.migrate = !!o.migrate; gStep('set1'); }
      else if (o.step === 'taken' && checkNick(g.nick).ok) { g.tries = o.tries; gStep('taken'); }
      else if (o.step === 'enter' && checkNick(g.nick).ok) gStep('enter');
      else gStep('nick', o.err);
      g.nf.upd();
      focusStep();
    } catch (e) {}

    function primary() {
      var gg = gate;
      if (!gg || gg.busy || gg.ok.disabled) return;
      if (gg.step === 'nick') {
        var c = checkNick(gg.nf.value());
        if (!c.ok) { setInfo(gg.info, c.err, 'err'); gg.nf.bad(true); focusEl(gg.nf.input); return; }
        if (c.value !== gg.nick) { gg.migrate = false; }
        gg.nick = c.value; gg.nf.input.value = c.value;
        gStep('set1'); focusStep();
      } else if (gg.step === 'set1') {
        if (!pinOk(gg.pf.value())) { setInfo(gg.info, MSG_PINFORM, 'err'); return; }
        gg.pin1 = gg.pf.value(); gStep('set2'); focusStep();
      } else if (gg.step === 'set2') {
        var p = gg.pf.value();
        if (p !== gg.pin1) {
          setInfo(gg.info, 'PIN이 서로 달라요. 다시 정해 주세요', 'err'); gg.pf.bad();
          gg.busy = true; gg.ok.disabled = true;
          setTimeout(function () { if (gate !== gg) return; gg.busy = false; gg.pin1 = ''; gStep('set1', null, true); focusStep(); }, 800);
          return;
        }
        claim(p);
      } else if (gg.step === 'enter') {
        if (!pinOk(gg.pf.value())) return;
        claim(gg.pf.value());
      } else if (gg.step === 'taken') {
        gStep('enter'); focusStep();
      }
    }
    function back() {
      var gg = gate; if (!gg) return;
      if (gg.step === 'set2') { gg.pin1 = ''; gStep('set1'); }
      else toNick(false);
      focusStep();
    }
    function toNick(selectAll) {
      var gg = gate; if (!gg) return;
      gg.touched = true;
      gStep('nick'); focusStep();
      if (selectAll) { try { gg.nf.input.select(); } catch (e) {} }
    }
    function claim(pin) {
      var gg = gate; if (!gg) return;
      var fromStep = gg.step, nick = gg.nick;
      busy(true);
      var pre = gg.mode === 'switch' ? flush() : Promise.resolve();
      pre.then(function () {
        return rpc('claim_nickname', { p_device: deviceId(), p_nick: nick, p_pin: pin });
      }).then(function (r) {
        if (gate !== gg) return;
        busy(false);
        var rk = claimRejKind(r);
        // 'bad nickname'/'bad pin'이 아닌 거부(404 함수 없음, 기타 4xx)는 입력 문제가 아니라 서버 문제 → 불통과 같게
        if (r.kind === 'fail' || (r.kind === 'reject' && !rk)) {
          if (gg.mode === 'switch') { setInfo(gg.info, MSG_NET, 'err'); return; }
          // 서버 불통: 임시 등록(pending) 후 게임 시작 (재시도용 PIN만 잠시 보관)
          store.set(K.nick, nick); store.set(K.state, 'pending'); store.set(K.pin, pin); store.del(K.gmsg);
          setSent({}); resp = {};
          closeGate(); notifyChange();
          return;
        }
        if (r.kind === 'reject') {
          if (rk === 'bad_pin') { gStep(fromStep === 'enter' ? 'enter' : 'set1', MSG_PINFORM); }
          else { gStep('nick', MSG_FORM); gg.nf.bad(true); }
          focusStep();
          return;
        }
        var row = r.data[0] || {}, s = row.status;
        if (s === 'created' || s === 'same' || s === 'linked') {
          clearLock(nick);
          applySuccess(s, row.nickname || nick, gg.mode === 'switch');
          closeGate();
          flush().then(function () {
            if (cur && cur.slot && cur.eligible) settle(cur);
          });
          return;
        }
        if (s === 'taken') { gStep('nick', MSG_TAKEN); gg.nf.bad(true); focusStep(); try { gg.nf.input.select(); } catch (e) {} return; }
        if (s === 'wrong_pin') {
          gg.tries = row.tries_left;
          if (fromStep === 'enter') { gStep('enter', wrongMsg(row.tries_left)); gg.pf.bad(); }
          else gStep('taken');
          focusStep();
          return;
        }
        if (s === 'locked') { setLock(nick); gStep('enter'); focusStep(); return; }
        setInfo(gg.info, MSG_NET, 'err');
      });
    }
    function busy(b) {
      var gg = gate; if (!gg) return;
      gg.busy = b;
      gg.nf.input.readOnly = b; gg.pf.input.readOnly = b;
      gg.back.disabled = b; gg.alt.disabled = b;
      if (b) { gg.okText = gg.ok.textContent; gg.ok.textContent = '확인 중…'; gg.ok.disabled = true; setInfo(gg.info, '확인하는 중…', ''); }
      else { gg.ok.textContent = gg.okText || gg.ok.textContent; gg.ok.disabled = false; }
    }
  }
  function wrongMsg(t) {
    t = +t;
    return 'PIN이 맞지 않아요 · 남은 기회 ' + (t >= 0 ? t : '?') + '번' + (t === 1 ? ' · 마지막 기회예요' : '') + '. 처음이라면 다른 닉네임을 써 주세요';
  }
  function gStep(step, err, keepErr) {
    var g = gate; if (!g) return;
    clearInterval(g.timer); g.timer = 0;
    g.step = step;
    var isPin = step === 'set1' || step === 'set2' || step === 'enter';
    g.nf.el.hidden = isPin;
    g.nf.bad(false);
    g.pf.el.hidden = !isPin;
    g.pf.disable(false);
    if (isPin) { g.pf.clear(); g.pf.setReveal(step !== 'enter'); }
    g.who.hidden = !isPin;
    g.who.innerHTML = '';
    g.who.appendChild(document.createTextNode('닉네임 '));
    g.who.appendChild(h('b', null, g.nick));
    g.back.hidden = !isPin;
    g.alt.hidden = true;
    g.acts.classList.remove('lb-stack');
    g.ok.disabled = false;
    var def = '', title = '', okText = '다음';
    if (step === 'nick') {
      title = g.mode === 'switch' ? '어떤 닉네임으로 할까요?' : '반가워요! 닉네임을 정해 주세요';
      def = g.mode === 'switch' ? '이어할 닉네임이나 새 닉네임을 적어 주세요' : (g.hint || '순위표에 이 이름으로 올라가요');
      g.ok.disabled = nlen(cleanNick(g.nf.input.value)) < 1;
    } else if (step === 'set1') {
      title = 'PIN 4자리를 정해 주세요';
      def = g.migrate ? '전에 쓰던 닉네임이에요. PIN을 정하면 기록이 그대로 이어져요' : '다른 기기에서 이 닉네임으로 이어서 할 때 필요해요';
      g.back.textContent = g.migrate ? '← 닉네임 바꾸기' : '← 닉네임';
      g.ok.disabled = true;
    } else if (step === 'set2') {
      title = '같은 PIN을 한 번 더';
      def = '잊지 않게 적어 두세요';
      g.back.textContent = '← 다시 정하기';
      okText = g.mode === 'switch' ? '이어하기' : '시작하기';
      g.ok.disabled = true;
    } else if (step === 'taken') {
      title = '이미 쓰는 닉네임이에요';
      def = '';
      err = '내 닉네임이면 PIN을 입력하세요' + (g.tries != null && g.tries >= 0 ? ' (남은 기회 ' + g.tries + '번)' : '');
      g.acts.classList.add('lb-stack');
      g.alt.hidden = false;
      okText = 'PIN 입력하기';
    } else if (step === 'enter') {
      title = '‘' + g.nick + '’의 PIN 4자리';
      def = '이 닉네임을 만들 때 정한 PIN이에요';
      g.back.textContent = '← 닉네임';
      g.alt.hidden = false;
      okText = '이어서 하기';
      g.ok.disabled = true;
    }
    g.title.textContent = title;
    g.ok.textContent = okText;
    g.defInfo = def;
    if (err) setInfo(g.info, err, 'err');
    else if (!keepErr) setInfo(g.info, def, '');
    if (step === 'enter' && getLock(g.nick)) {
      g.pf.disable(true); g.ok.disabled = true;
      var tick = function () {
        if (gate !== g || g.step !== 'enter') { clearInterval(g.timer); return; }
        var left = getLock(g.nick) - Date.now();
        if (left <= 0) { clearInterval(g.timer); g.timer = 0; g.pf.disable(false); setInfo(g.info, g.defInfo, ''); focusEl(g.pf.input); return; }
        setInfo(g.info, 'PIN을 여러 번 틀렸어요. ' + mmss(left) + ' 뒤에 다시 할 수 있어요', 'warn');
      };
      tick();
      g.timer = setInterval(tick, 1000);
    }
  }
  function focusStep() {
    var g = gate; if (!g) return;
    var t = g.step === 'nick' ? g.nf.input : (g.step === 'taken' ? g.ok : (g.pf.input.disabled ? g.alt : g.pf.input));
    focusEl(t);
    if (g.step === 'nick') { try { var L = t.value.length; t.setSelectionRange(L, L); } catch (e) {} }
  }
  function closeGate() {
    var g = gate; if (!g) return;
    clearInterval(g.timer); g.pf.destroy();
    g.el.remove(); gate = null;
    maybeRemoveRoot();
    if (g.mode === 'switch') restoreFocus(g.opener);
    else if (g.opener && g.opener.isConnected && g.opener !== document.body) focusEl(g.opener);
  }

  /* ===================== 내 정보 시트 ===================== */
  function openMe(from) {
    try {
      if (gate) return;
      if (!getNick()) return;
      if (sheet) closeSheet(true);
      ensureRoot();
      var s = sheet = { view: '', opener: from || document.activeElement, timer: 0 };
      var el = s.el = h('div', 'lb-card lb-me-sheet');
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'lb-me-title');
      root.appendChild(el);
      vv();
      meView('info');
    } catch (e) {}
  }
  function meView(view, msg, kind) {
    var s = sheet; if (!s) return;
    if (s.pf) { s.pf.destroy(); s.pf = null; }
    clearInterval(s.timer); s.timer = 0;
    s.view = view;
    var el = s.el;
    el.textContent = '';
    var top = h('div', 'lb-ctop');
    var title = h('h2', 'lb-ctitle'); title.id = 'lb-me-title';
    var x = btn('lb-x', null, function () { closeSheet(); }); x.setAttribute('aria-label', '닫기'); x.innerHTML = X_SVG;
    top.appendChild(title); top.appendChild(x);
    el.appendChild(top);
    var st = nickState(), online = st === 'ok';
    var info = h('p', 'lb-info'); info.id = 'lb-me-info'; info.setAttribute('aria-live', 'polite');
    if (view === 'info') {
      title.textContent = '내 닉네임';
      title.classList.add('lb-label');
      el.appendChild(h('p', 'lb-bignick', getNick()));
      var menu = h('div', 'lb-menu');
      var rn = btn('lb-btn', '닉네임 바꾸기', function () { meView('rename'); });
      var pc = btn('lb-btn', 'PIN 바꾸기', function () { s.oldPin = ''; s.newPin = ''; meView('pin1'); });
      var sw = btn('lb-btn', '다른 닉네임으로 이어하기', function () {
        var o = s.opener; closeSheet(true); openGate({ mode: 'switch', from: o });
      });
      rn.disabled = pc.disabled = !online;
      menu.appendChild(rn); menu.appendChild(pc); menu.appendChild(sw);
      el.appendChild(menu);
      setInfo(info, msg || (online ? PIN_NOTE : '연결되면 바꿀 수 있어요'), msg ? kind : (online ? '' : 'warn'));
      info.classList.add('lb-note');
      if (msg) { el.appendChild(info); el.appendChild(h('p', 'lb-info lb-note', PIN_NOTE)); }
      else el.appendChild(info);
      el.appendChild(h('p', 'lb-priv', PRIVACY));
      var acts = h('div', 'lb-acts');
      acts.classList.add('lb-meclose');
      acts.appendChild(btn('lb-btn', '닫기', function () { closeSheet(); }));
      el.appendChild(acts);
      focusEl(x);
      return;
    }
    var acts2 = h('div', 'lb-acts');
    var backB = btn('lb-link lb-back', '← 이전');
    var ok = btn('lb-btn lb-ok', '다음');
    acts2.appendChild(backB); acts2.appendChild(ok);
    var okText = '다음';
    function busy(b) {
      s.busy = b; backB.disabled = b; ok.disabled = b || ok.dataset.need === '1';
      if (b) { ok.textContent = '확인 중…'; setInfo(info, '확인하는 중…', ''); } else ok.textContent = okText;
    }
    if (view === 'rename') {
      title.textContent = '닉네임 바꾸기';
      var lab = h('label', 'lb-who', '새 닉네임 (기록과 PIN은 그대로예요)'); lab.setAttribute('for', 'lb-me-nick');
      var nf = nickField('lb-me-nick', getNick(), function (n) { ok.dataset.need = n < 1 ? '1' : ''; ok.disabled = s.busy || n < 1; if (info.classList.contains('lb-errm')) setInfo(info, '', ''); },
        function () { ok.click(); });
      nf.input.setAttribute('aria-describedby', 'lb-me-info');
      okText = '바꾸기';
      el.appendChild(lab); el.appendChild(nf.el); el.appendChild(info); el.appendChild(acts2);
      ok.textContent = okText;
      nf.upd();
      backB.addEventListener('click', function () { if (!s.busy) meView('info'); });
      ok.addEventListener('click', function () {
        if (s.busy || ok.disabled) return;
        var c = checkNick(nf.value());
        if (!c.ok) { setInfo(info, c.err, 'err'); nf.bad(true); focusEl(nf.input); return; }
        if (c.value === getNick()) { meView('info'); return; }
        busy(true);
        rpc('rename_nickname', { p_device: deviceId(), p_nick: c.value }).then(function (r) {
          if (sheet !== s) return;
          busy(false);
          var row = r.kind === 'ok' && r.data[0];
          if (row && row.status === 'ok') {
            store.set(K.nick, row.nickname || c.value); notifyChange();
            if (board) load();
            meView('info', '닉네임을 바꿨어요', 'ok');
            return;
          }
          if (row && row.status === 'taken') { setInfo(info, MSG_TAKEN, 'err'); nf.bad(true); focusEl(nf.input); return; }
          if (r.kind === 'reject') {
            if (/no player/i.test(r.msg || '')) { needGate(); return; }
            setInfo(info, MSG_FORM, 'err'); nf.bad(true); return;
          }
          setInfo(info, MSG_NET, 'err');
        });
      });
      focusEl(nf.input);
      try { var L = nf.input.value.length; nf.input.setSelectionRange(0, L); } catch (e) {}
      return;
    }
    // PIN 바꾸기: pin1(지금 PIN) → pin2(새 PIN) → pin3(새 PIN 한 번 더) → change_pin
    var pf = s.pf = pinField('lb-me-pin', function (n) {
      ok.dataset.need = n < 4 ? '1' : ''; ok.disabled = s.busy || n < 4 || (view === 'pin1' && !!getLock(getNick()));
      if (n && info.classList.contains('lb-errm') && !s.busy) setInfo(info, def, '');
    }, function () { ok.click(); });
    pf.input.setAttribute('aria-describedby', 'lb-me-info');
    var def = '';
    if (view === 'pin1') { title.textContent = '지금 PIN 4자리'; def = '바꾸기 전에 지금 PIN을 확인해요'; pf.setReveal(false); }
    else if (view === 'pin2') { title.textContent = '새 PIN 4자리'; def = '다른 기기에서 이어할 때 쓸 새 PIN이에요'; pf.setReveal(true); }
    else { title.textContent = '새 PIN 한 번 더'; def = '잊지 않게 적어 두세요'; pf.setReveal(true); okText = '바꾸기'; }
    ok.textContent = okText; ok.dataset.need = '1'; ok.disabled = true;
    el.appendChild(pf.el); el.appendChild(info); el.appendChild(acts2);
    setInfo(info, msg || def, msg ? (kind || 'err') : '');
    backB.addEventListener('click', function () {
      if (s.busy) return;
      meView(view === 'pin1' ? 'info' : view === 'pin2' ? 'pin1' : 'pin2');
    });
    ok.addEventListener('click', function () {
      if (s.busy || ok.disabled) return;
      var v = pf.value();
      if (!pinOk(v)) return;
      if (view === 'pin1') { s.oldPin = v; meView('pin2'); return; }
      if (view === 'pin2') { s.newPin = v; meView('pin3'); return; }
      if (v !== s.newPin) {
        setInfo(info, 'PIN이 서로 달라요. 다시 정해 주세요', 'err'); pf.bad();
        busy(true); ok.textContent = okText; setInfo(info, 'PIN이 서로 달라요. 다시 정해 주세요', 'err');
        setTimeout(function () { if (sheet === s) { s.busy = false; meView('pin2'); } }, 800);
        return;
      }
      busy(true);
      rpc('change_pin', { p_device: deviceId(), p_old: s.oldPin, p_new: v }).then(function (r) {
        if (sheet !== s) return;
        busy(false);
        var row = r.kind === 'ok' && r.data[0], stt = row && row.status;
        if (stt === 'ok') {
          s.oldPin = s.newPin = '';
          clearLock(getNick());
          meView('info', 'PIN을 바꿨어요', 'ok');
          s.timer = setTimeout(function () { if (sheet === s && s.view === 'info') meView('info'); }, 1500);
          return;
        }
        if (stt === 'wrong_pin') { s.oldPin = ''; meView('pin1', wrongMsg(row.tries_left).replace(/\. 처음이라면.*$/, '')); if (sheet && sheet.pf) sheet.pf.bad(); return; }
        if (stt === 'locked') { s.oldPin = ''; setLock(getNick()); meView('pin1'); return; }
        if (r.kind === 'reject') {
          if (/no player/i.test(r.msg || '')) { needGate(); return; }
          meView('pin2', MSG_PINFORM); return;
        }
        setInfo(info, MSG_NET, 'err');
      });
    });
    if (view === 'pin1' && getLock(getNick())) {
      pf.disable(true);
      var tick = function () {
        if (sheet !== s || s.view !== 'pin1') { clearInterval(s.timer); return; }
        var left = getLock(getNick()) - Date.now();
        if (left <= 0) { clearInterval(s.timer); s.timer = 0; pf.disable(false); setInfo(info, def, ''); focusEl(pf.input); return; }
        setInfo(info, 'PIN을 여러 번 틀렸어요. ' + mmss(left) + ' 뒤에 다시 할 수 있어요', 'warn');
      };
      tick(); s.timer = setInterval(tick, 1000);
      focusEl(backB);
    } else focusEl(pf.input);
  }
  // 서버가 이 기기를 모름(no player) → 게이트를 다시 연다(닉네임 채움)
  function needGate() {
    var n = getNick();
    store.del(K.state);
    notifyChange();
    if (sheet) closeSheet(true);
    if (board) closeBoard(true);
    openGate({ nick: n, hint: '닉네임 확인이 필요해요. 닉네임과 PIN을 다시 넣어 주세요' });
  }
  function closeSheet(keep) {
    var s = sheet; if (!s) return;
    if (s.pf) s.pf.destroy();
    clearInterval(s.timer); clearTimeout(s.timer);
    s.el.remove(); sheet = null;
    if (gate) return;
    if (board) { if (!keep) restoreFocus(s.opener && board.contains(s.opener) ? s.opener : board.querySelector('.lb-x')); return; }
    maybeRemoveRoot();
    if (!keep) restoreFocus(s.opener);
  }

  /* ===================== 재시도 시점 ===================== */
  window.addEventListener('online', function () { flush(); });

  /* ===================== 테스트 훅 (열거 안 됨) ===================== */
  var tainted = { allow: false };
  try {
    Object.defineProperty(window, '__lb', {
      value: Object.freeze({
        state: function () {
          return { deviceId: deviceId(), nickname: getNick(), nickState: nickState(), seeded: store.get(K.seeded) === '1', sent: getSent(), queue: getQueue() };
        },
        flush: function () { return flush(); },
        reset: function () { for (var k in K) store.del(K[k]); mem = {}; resp = {}; },
        allowTainted: function (b) { tainted.allow = !!b; },
        checkNick: checkNick,
        gateStep: function () { return gate ? gate.step : null; },
        config: CONFIG
      }),
      enumerable: false, configurable: false, writable: false
    });
  } catch (e) {}

  function reportPublic(o) {
    o = o || {};
    // allowTainted(true): 모킹 테스트에서 '테스트 판' 제출 흐름을 시험할 때만
    if (o.eligible === false && o.reason === 'test' && tainted.allow) o = Object.assign({}, o, { eligible: true });
    return report(o);
  }

  window.Leaderboard = Object.freeze({
    report: reportPublic,
    open: function (game) { open(game); },
    openMe: function () { openMe(); },
    isOpen: isOpen,
    me: me,
    onChange: function (fn) { if (typeof fn === 'function') changeFns.push(fn); },
    // 순위표에 안 올라가는 플레이를 통계에만 기록 (붕어빵 2인: { game: 'bungeo-2p' })
    played: function (o) { try { o = o || {}; if (EXTRA_PLAY[o.game]) logPlay(o.game, null); } catch (e) {} },
    version: 2
  });

  /* ===================== 로드 시 ===================== */
  function gateFromMsg() {
    var m = null;
    try { m = JSON.parse(store.get(K.gmsg) || 'null'); } catch (e) {}
    var n = getNick(), s = m && m.status;
    if (s === 'wrong_pin') return { nick: n, step: 'taken', tries: m.tries };
    if (s === 'locked') return { nick: n, step: 'enter' };
    if (s === 'taken') return { nick: n, err: MSG_TAKEN };
    if (s === 'bad_pin') return { nick: n, step: 'set1' };
    if (s === 'bad_nick') return { nick: n, err: MSG_FORM };
    return { nick: n, hint: n ? '전에 쓰던 닉네임이에요. 그대로 쓰거나 바꾼 뒤 PIN 4자리를 정해 주세요' : '' };
  }
  function boot() {
    injectCss();
    logVisit();
    var st = nickState();
    if (st === 'ok') {
      // 대기열은 whoami 확인 뒤에 보낸다(서버가 이 기기를 모르면 옛 대기열을 버려야 하므로)
      rpc('whoami', { p_device: deviceId() }).then(function (r) {
        if (r.kind !== 'ok') { if (hasQueue()) flush(); return; } // 네트워크 실패면 상태는 그대로
        var row = r.data[0];
        if (!row) {
          // 서버가 이 기기를 모름(기록 초기화 등) → 새 방문자처럼 게이트(닉네임 채움), 옛 기록 정보는 버림
          var n0 = getNick();
          store.del(K.state); setSent({}); setQueue({}); resp = {};
          notifyChange();
          if (!gate) openGate({ nick: n0, hint: '닉네임을 다시 정해 주세요. 그대로 쓰거나 바꿀 수 있어요' });
          return;
        }
        if (row.nickname && row.nickname !== getNick() && checkNick(row.nickname).ok) { store.set(K.nick, row.nickname); notifyChange(); }
        if (row.has_pin === false) {
          store.del(K.state); notifyChange();
          if (!gate) openGate({ nick: row.nickname || getNick(), step: 'set1', migrate: true });
          return;
        }
        if (hasQueue()) flush();
      });
      return;
    }
    if (st === 'pending') { flush(); return; }
    // 등록 안 됨: v1/v2 시절의 sent·대기열은 이 기기 기준이라 v3 플레이어와 맞지 않음 → 버림
    // (임시 등록 재시도가 taken 등으로 끝난 경우의 대기열은 같은 사람이 친 판이라 남겨 둠)
    setSent({});
    if (!store.get(K.gmsg)) setQueue({});
    openGate(gateFromMsg());
    // 서버가 이 기기를 이미 아는 경우(저장소 일부 삭제·옛 기록에서 옮겨 온 PIN 없는 플레이어)
    rpc('whoami', { p_device: deviceId() }).then(function (r) {
      var g = gate;
      if (!g || g.mode !== 'first' || g.busy || g.touched || r.kind !== 'ok') return;
      var row = r.data[0];
      if (!row || !checkNick(row.nickname).ok) return;
      if (row.has_pin) {
        store.set(K.nick, row.nickname); store.set(K.state, 'ok'); store.del(K.pin); store.del(K.gmsg); store.set(K.seeded, '1');
        closeGate(); notifyChange();
        return;
      }
      g.nick = row.nickname; g.nf.input.value = row.nickname; g.nf.upd(); g.migrate = true;
      gStep('set1'); focusStep();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
