/* 혜진's 스튜디오 — 사이트 공통 온라인 순위표 (docs/site/leaderboard.md)
 * 게임은 모듈 없이도 정상 동작해야 한다. 모든 호출은 `window.Leaderboard && Leaderboard.xxx()`.
 * 공개 API: Leaderboard.report({game, score, eligible, slot, reason}), Leaderboard.open(game?), Leaderboard.isOpen()
 * 파일을 바꿀 때마다 불러오는 쪽의 ?v= 숫자를 올린다.
 */
(function () {
  'use strict';
  if (window.Leaderboard) return;

  /* ===================== 설정 (한 곳) ===================== */
  function intKey(k) { return function () { var v = parseInt(store.get(k), 10); return v > 0 ? v : 0; }; }
  var CONFIG = {
    url: 'https://zzynabrqpwognuwmznna.supabase.co',
    key: 'sb_publishable_fctxHgfDR0OqyV4Jwb2zqg_rKHf2mDG',
    timeoutMs: 6000,
    topN: 20,
    // 홈 탭 순서 = 카드 순서
    games: [
      { id: 'parrot-beat', name: '박자 앵무새', short: '앵무새', unit: '점', cap: 60000,
        best: function () { try { var o = JSON.parse(store.get('parrot-beat-best') || 'null'); var v = o && Math.floor(+o.score); return v > 0 ? v : 0; } catch (e) { return 0; } } },
      { id: 'poop-rain', name: '똥비 피하기', short: '똥비', unit: '점', cap: 50000, best: intKey('poop-rain-best-score') },
      { id: 'mole-pop', name: '두더지 뿅뿅', short: '두더지', unit: '점', cap: 10000, best: intKey('mole-pop-best') },
      { id: 'bunny-ten', name: '개구리 텐', short: '개구리', unit: '마리', cap: 170, best: intKey('bunny-ten-best') },
      { id: 'snake-garden', name: '뱀 정원', short: '뱀', unit: '점', cap: 4000, best: intKey('snake-garden-best') },
      { id: 'block-stack', name: '블록 스택', short: '블록', unit: '점', cap: 5000000, best: intKey('blockstack-best') }
    ]
  };
  var PRIVACY = '순위표에는 닉네임과 점수만 공개돼요. 이 기기에는 무작위 번호만 저장되고, 다른 개인정보는 모으지 않아요.';
  var K = { dev: 'studio-device-id', nick: 'studio-nickname', sent: 'studio-lb-sent', queue: 'studio-lb-queue', last: 'studio-lb-last' };
  var GAME = {};
  CONFIG.games.forEach(function (g) { GAME[g.id] = g; });

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
  function getSent() { return readObj(K.sent); }
  function getQueue() { return readObj(K.queue); }
  function setSent(o) { store.set(K.sent, JSON.stringify(o)); }
  function setQueue(o) { var has = false; for (var k in o) has = true; if (has) store.set(K.queue, JSON.stringify(o)); else store.del(K.queue); }

  /* ===================== 닉네임 검사 ===================== */
  var BAD = ['시발', '씨발', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '개새', '좆', '존나', '지랄', '미친놈', '미친년', '섹스',
    'fuck', 'shit', 'sex', 'bitch', '운영자', '관리자', 'admin'];
  var MSG_FORM = '8자 이내 한글·영문·숫자로 적어 주세요';
  var MSG_INFO = '전화번호·이메일·주소는 쓸 수 없어요';
  var MSG_BAD = '다른 이름을 써 주세요';
  function cleanNick(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function nlen(s) { return Array.from(s).length; }
  function checkNick(raw) {
    var v = cleanNick(raw), n = nlen(v), low = v.toLowerCase();
    if (n < 1 || n > 8) return { ok: false, err: MSG_FORM };
    if (v.indexOf('@') >= 0 || (v.match(/[0-9]/g) || []).length >= 5 ||
        /http|www|\.com|\.kr|\.net/.test(low)) return { ok: false, err: MSG_INFO };
    if (!/^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9 _.\-]+$/.test(v)) return { ok: false, err: MSG_FORM };
    var flat = low.replace(/[\s_.\-]/g, '');
    for (var i = 0; i < BAD.length; i++) if (flat.indexOf(BAD[i]) >= 0) return { ok: false, err: MSG_BAD };
    return { ok: true, value: v };
  }

  /* ===================== 서버 호출 ===================== */
  // 결과: { kind: 'ok'|'reject'|'fail', data }
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
          fin({ kind: res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429 ? 'reject' : 'fail', status: res.status });
        }, function () { fin({ kind: 'fail' }); });
      } catch (e) { fin({ kind: 'fail' }); }
    });
  }
  function rowOf(r) {
    var x = r && r.kind === 'ok' && r.data[0];
    if (!x) return null;
    var rank = +x.rank, total = +x.total, best = +x.best;
    if (!(rank >= 1)) return null;
    return { rank: rank, total: total >= rank ? total : rank, best: best || 0, nickname: x.nickname };
  }

  /* ===================== 대기열 ===================== */
  var resp = {};      // game → { rank,total,best,at,up }  (이번 방문 동안 submit 성공 응답)
  var flushing = null;
  var listeners = [];
  function validScore(game, s) { s = Math.floor(+s); return GAME[game] && s > 0 && s <= GAME[game].cap ? s : 0; }
  function enqueue(game, score) {
    score = validScore(game, score);
    if (!score) return false;
    var q = getQueue(), cur = q[game];
    if (!cur || !(cur.score >= score)) q[game] = { score: score, at: Date.now() };
    setQueue(q);
    return true;
  }
  function flush() {
    if (flushing) return flushing;
    flushing = (function step() {
      var nick = getNick(), q = getQueue(), game = null;
      if (!nick) return Promise.resolve();
      for (var i = 0; i < CONFIG.games.length; i++) if (q[CONFIG.games[i].id]) { game = CONFIG.games[i].id; break; }
      if (!game) {
        for (var k in q) { if (!GAME[k]) { delete q[k]; } }
        setQueue(q);
        return Promise.resolve();
      }
      var item = q[game], score = validScore(game, item && item.score);
      if (!score) { delete q[game]; setQueue(q); return step(); }
      var prev = getSent()[game];
      return rpc('submit_score', { p_game: game, p_device: deviceId(), p_nick: nick, p_score: score }).then(function (r) {
        var q2 = getQueue();
        if (r.kind === 'fail') return; // 그 자리에서 중단, 남겨 둠
        if (q2[game] && !(q2[game].score > score)) delete q2[game];
        setQueue(q2);
        if (r.kind === 'ok') {
          var row = rowOf(r);
          if (row) {
            var s = getSent(); s[game] = Math.max(row.best || score, +s[game] || 0); setSent(s);
            resp[game] = { rank: row.rank, total: row.total, best: row.best, at: Date.now(), up: !(prev >= row.best) };
          }
          notify(game);
        }
        return step();
      });
    })().then(done, done);
    function done() {
      flushing = null;
      // 백그라운드 재전송(online·로드)으로 대기열이 비면 흐린 문구를 순위로 바꿈
      var c = cur, b = c && c.slot && c.slot.querySelector('.lb-line');
      if (b && b.dataset.state === 'off' && !getQueue()[c.game]) settle(c);
    }
    return flushing;
  }
  function hasQueue() { var q = getQueue(); for (var k in q) return true; return false; }
  function afterSuccess() { if (hasQueue() && getNick() && !flushing) flush(); }
  function notify(game) { listeners.slice().forEach(function (f) { try { f(game); } catch (e) {} }); }

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
    '.lb-slot .lb-line.lb-cta{border-color:var(--lb-accent)}',
    '.lb-slot .lb-line.lb-wait{color:var(--lb-muted);font-weight:500}',
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
    'user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;line-height:1.4;text-align:left;font-size:15px;letter-spacing:normal}',
    '.lb *{box-sizing:border-box}',
    '.lb [hidden]{display:none!important}',
    '.lb-backdrop{position:absolute;inset:0;background:var(--lb-backdrop);animation:lbFade 200ms ease-out}',
    '.lb button{font:inherit;color:inherit;margin:0;box-shadow:none;touch-action:manipulation;cursor:pointer;-webkit-tap-highlight-color:transparent;transform:none;filter:none}',
    '.lb button:focus-visible,.lb input:focus-visible{outline:3px solid var(--lb-accent);outline-offset:2px}',
    '.lb .lb-btn{height:44px;min-width:44px;padding:0 16px;border-radius:12px;border:1px solid var(--lb-line);background:var(--lb-panel);color:var(--lb-ink);font-size:15px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;gap:6px;width:auto}',
    '.lb .lb-btn:active{background:var(--lb-well);transform:none}',
    '.lb .lb-btn.lb-ok{background:var(--lb-accent);border-color:transparent;color:#fff}',
    '.lb .lb-btn.lb-ok:active{background:var(--lb-accent);filter:brightness(.92)}',
    '.lb .lb-btn:disabled{opacity:.45;cursor:default}',
    '.lb .lb-link{height:44px;min-width:44px;padding:0 6px;border:0;background:none;color:var(--lb-ink);font-size:14px;font-weight:700;text-decoration:underline;text-underline-offset:3px;display:inline-flex;align-items:center}',
    '.lb .lb-link:active{background:none}',
    '.lb .lb-x{flex:none;width:44px;height:44px;padding:0;border:0;border-radius:12px;background:none;color:var(--lb-muted);display:grid;place-items:center}',
    '.lb .lb-x:active{background:var(--lb-well)}',
    '.lb .lb-x svg{width:20px;height:20px}',

    /* 순위표 */
    '.lb-board{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(440px,calc(100vw - 24px));max-height:calc(100vh - 32px);max-height:min(640px,calc(100dvh - 32px));',
    'background:var(--lb-panel);border:1px solid var(--lb-line);border-radius:18px;box-shadow:0 12px 32px rgba(0,0,0,.22);display:flex;flex-direction:column;overflow:hidden;animation:lbPop 240ms ease-out}',
    '.lb-head{flex:none;display:flex;align-items:center;gap:8px;min-height:52px;padding:4px 4px 4px 18px}',
    '.lb-head h2{flex:1;min-width:0;margin:0;font-size:17px;font-weight:800;color:var(--lb-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3}',
    '.lb-head h2 small{font-size:13px;font-weight:600;color:var(--lb-muted);margin-left:4px}',
    '.lb-tabs{flex:none;display:flex;gap:2px;padding:0 10px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;border-bottom:1px solid var(--lb-line);overscroll-behavior-x:contain;touch-action:pan-x}',
    '.lb-tabs::-webkit-scrollbar{display:none}',
    '.lb .lb-tab{flex:none;height:44px;padding:0 10px;border:0;border-bottom:2px solid transparent;border-radius:0;background:none;color:var(--lb-muted);font-size:14px;font-weight:600;white-space:nowrap}',
    '.lb .lb-tab:active{background:none}',
    '.lb .lb-tab[aria-selected="true"]{color:var(--lb-ink);font-weight:800;border-bottom-color:var(--lb-accent)}',
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

    /* 닉네임 시트 */
    '.lb-nick{position:absolute;left:50%;top:max(12px,env(safe-area-inset-top));transform:translateX(-50%);z-index:2;',
    'width:min(400px,calc(100vw - 24px - env(safe-area-inset-left) - env(safe-area-inset-right)));max-height:calc(var(--lb-vvh,100vh) - 24px);overflow-y:auto;overscroll-behavior:contain;',
    'background:var(--lb-panel);border:1px solid var(--lb-line);border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:16px;display:flex;flex-direction:column;gap:10px;animation:lbDrop 200ms ease-out}',
    '.lb-nick label{font-size:16px;font-weight:800;color:var(--lb-ink)}',
    '.lb-field{position:relative;display:flex}',
    '.lb .lb-field input{flex:1;min-width:0;height:48px;padding:0 56px 0 14px;font:inherit;font-size:16px;color:var(--lb-ink);background:var(--lb-well);border:1px solid var(--lb-line);border-radius:12px;',
    'user-select:text;-webkit-user-select:text;margin:0;width:100%;outline:none;box-shadow:none;appearance:none;-webkit-appearance:none}',
    '.lb .lb-field input:focus{border-color:var(--lb-accent)}',
    '.lb-count{position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:13px;color:var(--lb-muted);font-variant-numeric:tabular-nums;pointer-events:none}',
    '.lb-count.lb-full{color:var(--lb-ink);font-weight:800}',
    '.lb-info{margin:0;font-size:12px;color:var(--lb-muted);line-height:1.45;min-height:17px}',
    '.lb-info.lb-errm{color:var(--lb-err);font-weight:600}',
    '.lb-acts{display:flex;justify-content:flex-end;gap:8px}',
    '.lb-tinylater{display:none}',
    '.lb-nick.lb-tiny{padding:10px 10px 10px 12px;gap:4px}',
    '.lb-nick.lb-tiny label,.lb-nick.lb-tiny .lb-acts .lb-later{display:none}',
    '.lb-nick.lb-tiny .lb-info:not(.lb-errm){display:none}',
    '.lb-nick.lb-tiny .lb-tinyrow{display:flex;gap:8px;align-items:center}',
    '.lb-nick.lb-tiny .lb-tinylater{display:inline-flex;align-self:flex-end;order:-1;height:28px;font-size:13px;position:relative}',
    '.lb-nick.lb-tiny .lb-tinylater::after{content:"";position:absolute;inset:-8px 0}',
    '.lb-tinyrow{display:flex;flex-direction:column;gap:10px}',
    '.lb-tinyrow .lb-field{flex:1;min-width:0}',

    /* 폰 세로: 아래 시트 */
    '@media (max-width:479.98px) and (min-height:520.02px){.lb-board{left:0;right:0;top:auto;bottom:0;transform:none;width:100%;max-height:88vh;max-height:88dvh;',
    'border-radius:18px 18px 0 0;border-left:0;border-right:0;border-bottom:0;padding-bottom:env(safe-area-inset-bottom);animation:lbUp 240ms ease-out}}',
    /* 폰 가로 */
    '@media (max-height:520px){.lb-board{max-height:calc(100vh - 16px);max-height:calc(100dvh - 16px);border-radius:14px}',
    '.lb-head{min-height:44px;padding:0 2px 0 16px}.lb-head h2{font-size:16px}.lb-row{height:40px}.lb .lb-tab{height:40px}',
    '.lb-foot{padding:4px 16px 6px;flex-direction:row;flex-wrap:wrap;align-items:center;column-gap:12px}.lb-priv{flex-basis:100%}',
    '.lb-foot .lb-link{height:36px}.lb-msg{padding:16px}}',
    '@keyframes lbFade{from{opacity:0}}',
    '@keyframes lbPop{from{opacity:0;transform:translate(-50%,-50%) scale(.98)}}',
    '@keyframes lbUp{from{transform:translateY(100%)}}',
    '@keyframes lbDrop{from{opacity:0;transform:translate(-50%,-16px)}}',
    '@media (prefers-reduced-motion:reduce){.lb-slot .lb-line{animation:lbFade 120ms ease-out}.lb-board,.lb-nick,.lb-backdrop{animation:lbFade 120ms ease-out}.lb-slot .lb-line:active{transform:none}}'
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
  function fmt(n) { n = +n || 0; try { return n.toLocaleString('ko-KR'); } catch (e) { return String(n); } }
  var X_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>';
  function announce(text) {
    var live = document.getElementById('live');
    if (live) { try { live.textContent = text; } catch (e) {} }
  }

  /* ===================== 결과 화면 칩 ===================== */
  var cur = null, seq = 0;
  var pendingRun = {}; // 닉네임 없을 때의 이번 판 점수(첫 등록 때 함께 올림)

  function report(o) {
    try {
      injectCss();
      o = o || {};
      var g = GAME[o.game];
      if (!g) return;
      store.set(K.last, g.id);
      var c = { id: ++seq, game: g.id, score: Math.floor(+o.score) || 0, eligible: o.eligible !== false, reason: o.reason || '', slot: o.slot || null, t0: Date.now() };
      cur = c;
      if (c.slot) { c.slot.classList.add('lb-slot'); }
      if (!c.eligible) { render(c, 'inel'); return; }
      var s = validScore(c.game, c.score);
      var nick = getNick();
      if (!nick) {
        if (s && !(pendingRun[c.game] >= s)) pendingRun[c.game] = s;
        render(c, 'nonick');
        return;
      }
      var sent = getSent()[c.game];
      var want = 0;
      if (sent == null) want = Math.max(s, validScore(c.game, GAME[c.game].best()));
      else if (s > +sent) want = s;
      if (want) enqueue(c.game, want);
      if (getQueue()[c.game]) {
        render(c, 'wait');
        flush().then(function () { settle(c); });
      } else settle(c);
    } catch (e) {}
  }
  function settle(c) {
    if (c !== cur) return;
    if (getQueue()[c.game]) { render(c, 'off'); return; }
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
    if (state === 'nonick') {
      b.classList.add('lb-cta');
      b.appendChild(h('span', 'lb-t', '순위에 이름 올리기'));
      b.appendChild(h('span', 'lb-more', '›'));
      label = '순위에 이름 올리기';
      b.addEventListener('click', function () { openNick({ from: b }); });
    } else if (state === 'wait') {
      b.classList.add('lb-wait');
      b.setAttribute('aria-disabled', 'true');
      b.appendChild(h('span', 'lb-t', '순위 확인 중…'));
      label = '순위 확인 중';
    } else if (state === 'off') {
      b.classList.add('lb-off');
      b.setAttribute('aria-disabled', 'true');
      b.appendChild(h('span', 'lb-t', '연결되면 순위에 올라가요'));
      label = '연결되면 순위에 올라가요';
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
      label = '내 순위 ' + fmt(data.total) + '명 중 ' + fmt(data.rank) + '위. 순위표 열기';
      b.addEventListener('click', function () { open(c.game, b); });
      announce(fmt(data.total) + '명 중 ' + fmt(data.rank) + '위' + (data.up ? ', 새 순위' : ''));
    } else {
      var msg = state === 'none' ? '기록을 세우면 순위에 올라가요'
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
    if (hadFocus) { try { b.focus({ preventScroll: true }); } catch (e) {} }
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
  var root = null, board = null, sheet = null, opener = null, sheetOpener = null;
  var B = null; // 순위표 상태
  function ensureRoot() {
    injectCss();
    if (root && root.isConnected) return root;
    root = h('div', 'lb');
    var bd = h('div', 'lb-backdrop');
    bd.addEventListener('click', function () { if (sheet) closeNick(); else closeBoard(); });
    root.appendChild(bd);
    // 게임 입력이 받지 않도록 루트에서 전파 차단
    ['pointerdown', 'pointerup', 'pointermove', 'pointercancel', 'touchstart', 'touchmove', 'touchend', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel', 'keydown', 'keyup', 'keypress', 'selectstart']
      .forEach(function (t) { root.addEventListener(t, function (e) { e.stopPropagation(); }, { passive: true }); });
    document.body.appendChild(root);
    document.body.classList.add('lb-open');
    return root;
  }
  function maybeRemoveRoot() {
    if (board || sheet) return;
    if (root) { root.remove(); root = null; }
    document.body.classList.remove('lb-open');
  }
  function isOpen() { return !!(root && root.isConnected && (board || sheet)); }
  function focusables(container) {
    return Array.prototype.filter.call(container.querySelectorAll('button, input, [tabindex]'), function (e) {
      return !e.disabled && e.tabIndex >= 0 && e.offsetParent !== null && !e.closest('[hidden]');
    });
  }
  function restoreFocus(el) {
    if (el && el.isConnected) { try { el.focus({ preventScroll: true }); } catch (e) {} return; }
    if (cur && cur.slot) { var b = cur.slot.querySelector('.lb-line'); if (b) try { b.focus({ preventScroll: true }); } catch (e) {} }
  }

  window.addEventListener('keydown', function (e) {
    if (isOpen()) {
      var top = sheet || board, inside = root.contains(e.target);
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.isComposing) return;
        if (sheet) closeNick(); else closeBoard();
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
      if (!inside || (sheet && !sheet.contains(e.target))) {
        e.stopImmediatePropagation();
        if (/^(Enter| |Spacebar|Arrow\w+|PageUp|PageDown|Home|End)$/.test(e.key)) e.preventDefault();
      }
      return; // 안쪽 입력은 대상까지 가고, 루트에서 위로 전파가 막힌다
    }
    // 결과 화면 칩에 포커스 → 버튼 기본 동작만, 게임 키(다시 하기)는 받지 않게
    var t = e.target;
    if (t && t.closest && t.closest('.lb-slot') && (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')) e.stopImmediatePropagation();
  }, true);
  // 게임이 지연 포커스(다시 하기 버튼 등)를 주더라도 창 안으로 되돌림
  document.addEventListener('focusin', function (e) {
    if (!isOpen() || root.contains(e.target)) return;
    var top = sheet || board, f = focusables(top);
    if (f.length) { try { f[0].focus({ preventScroll: true }); } catch (er) {} }
  }, true);
  window.addEventListener('keyup', function (e) {
    var t = e.target;
    if (isOpen() && !(root.contains(t))) { e.stopImmediatePropagation(); return; }
    if (t && t.closest && t.closest('.lb-slot') && (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')) e.stopImmediatePropagation();
  }, true);

  /* ===================== 순위표 ===================== */
  function open(game, from) {
    try {
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
      var x = h('button', 'lb-x'); x.type = 'button'; x.setAttribute('aria-label', '닫기'); x.innerHTML = X_SVG;
      x.addEventListener('click', function () { closeBoard(); });
      head.appendChild(title); head.appendChild(x);
      board.appendChild(head);
      var tabs = null;
      if (tabsMode) {
        tabs = h('div', 'lb-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '게임');
        CONFIG.games.forEach(function (g) {
          var t = h('button', 'lb-tab', g.short); t.type = 'button';
          t.setAttribute('role', 'tab'); t.id = 'lb-tab-' + g.id; t.setAttribute('aria-controls', 'lb-panel');
          t.dataset.game = g.id;
          t.addEventListener('click', function () { selectTab(g.id, false); });
          tabs.appendChild(t);
        });
        tabs.addEventListener('keydown', function (e) {
          var ids = CONFIG.games.map(function (g) { return g.id; }), i = ids.indexOf(B.game), n = -1;
          if (e.key === 'ArrowRight') n = (i + 1) % ids.length;
          else if (e.key === 'ArrowLeft') n = (i - 1 + ids.length) % ids.length;
          else if (e.key === 'Home') n = 0;
          else if (e.key === 'End') n = ids.length - 1;
          if (n < 0) return;
          e.preventDefault();
          selectTab(ids[n], true);
        });
        board.appendChild(tabs);
      }
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
      B = { game: g0, tabs: tabs, title: title, list: list, meout: meout, total: total, nickrow: nickrow, req: 0 };
      renderNickRow();
      selectTab(g0, false);
      try { x.focus({ preventScroll: true }); } catch (e) {}
    } catch (e) {}
  }
  function selectTab(id, focusTab) {
    if (!board || !GAME[id]) return;
    B.game = id;
    var g = GAME[id];
    B.title.innerHTML = '';
    B.title.appendChild(document.createTextNode(g.name + ' 순위'));
    B.title.appendChild(h('small', null, '(' + g.unit + ')'));
    if (B.tabs) {
      Array.prototype.forEach.call(B.tabs.children, function (t) {
        var on = t.dataset.game === id;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        if (on) {
          if (focusTab) try { t.focus(); } catch (e) {}
          try { t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {}
          B.list.setAttribute('aria-labelledby', t.id);
        }
      });
    }
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
        var again = h('button', 'lb-btn', '다시 시도'); again.type = 'button';
        again.addEventListener('click', function () { load(); });
        m.appendChild(again);
        B.list.appendChild(m);
        return;
      }
      afterSuccess();
      var rows = r.data.filter(function (x) { return x && x.nickname != null; });
      B.list.innerHTML = '';
      if (!rows.length) {
        B.list.appendChild(h('div', 'lb-msg', '아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!'));
        B.total.textContent = '';
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
            var me = rowEl(row.rank, row.nickname, row.best, true, g);
            me.setAttribute('role', 'group');
            B.meout.appendChild(me);
            B.meout.hidden = false;
          }
        });
      }
    });
  }
  function rowEl(rank, nick, score, me, g) {
    var li = h('li', 'lb-row' + (me ? ' lb-me' : ''));
    var rk = h('span', 'lb-rk' + (rank <= 3 ? ' lb-m lb-m' + rank : ''), fmt(rank));
    var nm = h('span', 'lb-nm');
    if (me) nm.appendChild(h('i', 'lb-tag', '나'));
    nm.appendChild(h('span', null, String(nick)));
    var sc = h('span', 'lb-sc', fmt(score));
    li.appendChild(rk); li.appendChild(nm); li.appendChild(sc);
    li.setAttribute('aria-label', fmt(rank) + '위 ' + nick + ' ' + fmt(score) + g.unit + (me ? ' (나)' : ''));
    if (me) li.setAttribute('aria-current', 'true');
    return li;
  }
  function renderNickRow() {
    if (!board) return;
    var r = B.nickrow, n = getNick();
    r.textContent = '';
    var btn = h('button', 'lb-link'); btn.type = 'button';
    if (n) {
      r.appendChild(document.createTextNode('닉네임: '));
      r.appendChild(h('b', null, n));
      r.appendChild(document.createTextNode(' ·'));
      btn.textContent = '바꾸기';
    } else btn.textContent = '이름 정하기';
    btn.addEventListener('click', function () { openNick({ from: btn }); });
    r.appendChild(btn);
  }
  function closeBoard(keep) {
    if (!board) return;
    board.remove(); board = null; B = null;
    if (sheet) return;
    maybeRemoveRoot();
    if (!keep) restoreFocus(opener);
    opener = null;
  }

  /* ===================== 닉네임 시트 ===================== */
  function openNick(o) {
    try {
      o = o || {};
      if (sheet) return;
      ensureRoot();
      sheetOpener = o.from || document.activeElement;
      var had = getNick();
      sheet = h('div', 'lb-nick');
      sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-labelledby', 'lb-nick-label');
      var lab = h('label', null, '순위에 올릴 닉네임'); lab.id = 'lb-nick-label'; lab.setAttribute('for', 'lb-nick-input');
      var row = h('div', 'lb-tinyrow');
      var field = h('div', 'lb-field');
      var inp = h('input'); inp.id = 'lb-nick-input'; inp.type = 'text';
      inp.setAttribute('maxlength', '8'); inp.setAttribute('enterkeyhint', 'done'); inp.setAttribute('autocomplete', 'off');
      inp.setAttribute('autocapitalize', 'off'); inp.setAttribute('autocorrect', 'off'); inp.setAttribute('spellcheck', 'false');
      inp.setAttribute('placeholder', '최대 8자'); inp.setAttribute('aria-describedby', 'lb-nick-info');
      inp.value = had;
      var cnt = h('span', 'lb-count'); cnt.setAttribute('aria-hidden', 'true');
      field.appendChild(inp); field.appendChild(cnt);
      var info = h('p', 'lb-info', PRIVACY); info.id = 'lb-nick-info';
      var acts = h('div', 'lb-acts');
      var later = h('button', 'lb-btn lb-later', '나중에'); later.type = 'button';
      var ok = h('button', 'lb-btn lb-ok', '확인'); ok.type = 'button';
      var tinyLater = h('button', 'lb-link lb-tinylater', '나중에'); tinyLater.type = 'button';
      acts.appendChild(later); acts.appendChild(ok);
      row.appendChild(field);
      sheet.appendChild(tinyLater);
      sheet.appendChild(lab);
      sheet.appendChild(row);
      sheet.appendChild(info);
      sheet.appendChild(acts);
      var composing = false;
      function clip() {
        var a = Array.from(inp.value);
        if (a.length > 8) inp.value = a.slice(0, 8).join('');
      }
      function upd() {
        var n = nlen(cleanNick(inp.value));
        cnt.textContent = n + '/8';
        cnt.classList.toggle('lb-full', n >= 8);
        ok.disabled = n < 1;
        if (info.classList.contains('lb-errm')) { info.classList.remove('lb-errm'); info.textContent = PRIVACY; }
      }
      inp.addEventListener('compositionstart', function () { composing = true; });
      inp.addEventListener('compositionend', function () { composing = false; clip(); upd(); });
      inp.addEventListener('input', function (e) { if (!composing && !e.isComposing) clip(); upd(); });
      inp.addEventListener('keydown', function (e) {
        if ((e.key === 'Enter') && !e.isComposing && !composing && e.keyCode !== 229) { e.preventDefault(); save(); }
      });
      later.addEventListener('click', function () { closeNick(); });
      tinyLater.addEventListener('click', function () { closeNick(); });
      ok.addEventListener('click', function () { save(); });
      function save() {
        clip();
        var c = checkNick(inp.value);
        if (!c.ok) {
          info.textContent = c.err; info.classList.add('lb-errm');
          try { inp.focus({ preventScroll: true }); } catch (e) {}
          return;
        }
        commitNick(c.value, had);
        closeNick();
      }
      root.appendChild(sheet);
      upd();
      vv();
      try { inp.focus({ preventScroll: true }); } catch (e) {}
      try { var L = inp.value.length; inp.setSelectionRange(L, L); } catch (e) {}
    } catch (e) {}
  }
  function vv() {
    if (!sheet) return;
    var hgt = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    sheet.style.setProperty('--lb-vvh', hgt + 'px');
    sheet.classList.toggle('lb-tiny', hgt < 260);
  }
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', vv); }
  window.addEventListener('resize', function () { vv(); refit(); });
  function closeNick() {
    if (!sheet) return;
    sheet.remove(); sheet = null;
    var o = sheetOpener; sheetOpener = null;
    if (board) { restoreFocus(o && board.contains(o) ? o : board.querySelector('.lb-x')); return; }
    maybeRemoveRoot();
    restoreFocus(o);
  }
  function commitNick(nick, hadBefore) {
    store.set(K.nick, nick);
    if (!hadBefore) {
      // 첫 등록: 이 기기 6개 게임 로컬 최고(+ 이번 판) 일괄 업로드
      CONFIG.games.forEach(function (g) {
        var v = Math.max(validScore(g.id, g.best()), validScore(g.id, pendingRun[g.id]));
        if (v) enqueue(g.id, v);
      });
    } else {
      var s = getSent();
      for (var k in s) if (GAME[k]) enqueue(k, s[k]);
    }
    pendingRun = {};
    if (board) renderNickRow();
    var c = cur;
    if (c && c.slot && c.eligible) render(c, 'wait');
    flush().then(function () {
      if (c && c === cur && c.slot) {
        if (c.eligible) settle(c);
      }
      if (board) load();
    });
  }

  /* ===================== 재시도 시점 ===================== */
  window.addEventListener('online', function () { flush(); });

  /* ===================== 테스트 훅 (열거 안 됨) ===================== */
  var tainted = { allow: false };
  try {
    Object.defineProperty(window, '__lb', {
      value: Object.freeze({
        state: function () { return { deviceId: deviceId(), nickname: getNick(), sent: getSent(), queue: getQueue() }; },
        flush: function () { return flush(); },
        reset: function () { for (var k in K) store.del(K[k]); mem = {}; resp = {}; pendingRun = {}; },
        allowTainted: function (b) { tainted.allow = !!b; },
        checkNick: checkNick,
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
    isOpen: isOpen,
    version: 1
  });

  /* 모듈 로드 시 대기열 재전송 */
  function boot() { injectCss(); if (hasQueue() && getNick()) flush(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
