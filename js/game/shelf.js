// 書庫の「知識の棚」（2026-11-04）：塾のプリント（確認テスト・言語知識テストなど）の一問一答を、覚えるまで間をあけて出す。
// ・問題は GAS の「問題」シートの kind が "shelf" のもの（shelfQuestions）。塾の教材なので、このリポジトリには置かない。
// ・答えは「書庫の記録」シート（shelfHistory・saveShelfAnswer）。知恵の試練の「記録」とは分ける。
// ・出し方（docs/game-design.md の 6.8）：
//   正解するたびに、次に出すまでの日数をのばす（翌日 → 3日後 → 1週間後 → 2週間後 → 1か月後）。まちがえたら翌日にもどす。
//   1か月あけても正解したら「覚えた」（そのあとは2か月ごとにたしかめる）。
//   その日に出すのは、①出す日が来た問題（復習。数の上限なし）→ ②まだ解いていない問題（1日 NEW_PER_DAY 問まで）。
//   どちらも教科をまぜて、国語 → 理科 → 社会 → 算数 の順に1問ずつ回す（子どもに教科を選ばせない）。
//   新しい問題は、新しいプリントから先に（プリントの中は問題の順）。
// ・保護者のデバッグ用の枠では、答えを GAS に送らない（この画面を開いているあいだだけ覚える）。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Shelf = (function () {
  var INTERVALS = [1, 3, 7, 14, 30];   // 正解が続いた回数ごとの、次に出すまでの日数
  var KEEP_DAYS = 60;                   // 覚えた問題を、たしかめる間かく
  var MASTER = INTERVALS.length + 1;    // この段（1か月あけて正解）で「覚えた」
  var NEW_PER_DAY = 10;                 // 1日に出す新しい問題の数（数字は遊んでみてから直す）
  var ORDER = ["japanese", "science", "social", "math"];
  var PENDING_STORE = "bd-shelf-pending";

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function pad(n) { return ("0" + n).slice(-2); }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function addDays(date, n) { var d = new Date(date.replace(/-/g, "/")); d.setDate(d.getDate() + n); return ymd(d); }
  function subjectName(k) { return DrillCore.subjectName(k); }

  // ---------- 出し方（画面とは別。node でもためせるように、ここは DOM を使わない） ----------
  // 問題ごとの今の様子：{ box（正解が続いた回数。0＝まちがえた）, due（次に出す日）, last（最後に解いた日）, tries, mastered }
  function states(records) {
    var st = {};
    (records || []).slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : (String(a.answeredAt) < String(b.answeredAt) ? -1 : String(a.answeredAt) > String(b.answeredAt) ? 1 : 0);
    }).forEach(function (r) {
      if (!r || !r.qid || !r.date) return;
      var s = st[r.qid] || (st[r.qid] = { box: 0, due: "", last: "", tries: 0, mastered: false, lastCorrect: false });
      s.tries++; s.last = r.date; s.lastCorrect = !!r.correct;
      if (r.correct) {
        s.box = Math.min(MASTER, s.box + 1);
        if (s.box >= MASTER) s.mastered = true;
        s.due = addDays(r.date, s.box >= MASTER ? KEEP_DAYS : INTERVALS[s.box - 1]);
      } else {
        s.box = 0; s.mastered = false;
        s.due = addDays(r.date, 1);
      }
    });
    return st;
  }
  // 教科をまぜる：ORDER の順に1問ずつ回す（それぞれの教科の中の順は、渡した順のまま）
  function mix(list) {
    var by = {}, out = [];
    list.forEach(function (q) { (by[q.subject] || (by[q.subject] = [])).push(q); });
    var keys = ORDER.filter(function (k) { return by[k]; }).concat(Object.keys(by).filter(function (k) { return ORDER.indexOf(k) < 0; }));
    var left = true;
    while (left) {
      left = false;
      keys.forEach(function (k) { if (by[k].length) { out.push(by[k].shift()); left = true; } });
    }
    return out;
  }
  // プリント名（出典の最初の空白まで）と、そのプリントを取りこんだ日時（同じプリントの問題でいちばん早い書きこみ日時）
  function sheetOf(q) { return String(q.source || "").split(" ")[0]; }
  // その日の分：{ reviews: [問題], fresh: [問題], doneToday: 今日解いた数, newToday: 今日解いた新しい問題の数 }
  function plan(questions, records, today, newPerDay) {
    var st = states((records || []).filter(function (r) { return r.date < today; }));
    var todayIds = {};
    (records || []).forEach(function (r) { if (r && r.date === today && r.qid) todayIds[r.qid] = true; });
    var newToday = Object.keys(todayIds).filter(function (id) { return !st[id]; }).length;
    var Q = (questions || []).filter(function (q) { return q && q.id && q.enabled !== false; });
    var reviews = Q.filter(function (q) { var s = st[q.id]; return s && !todayIds[q.id] && s.due <= today; });
    reviews.sort(function (a, b) { var x = st[a.id], y = st[b.id]; return (x.due < y.due ? -1 : x.due > y.due ? 1 : 0) || x.box - y.box || (a.id < b.id ? -1 : 1); });
    var sheetAt = {};
    Q.forEach(function (q) { var k = q.subject + "|" + sheetOf(q), at = String(q.updatedAt || ""); if (!sheetAt[k] || (at && at < sheetAt[k])) sheetAt[k] = at; });
    var fresh = Q.filter(function (q) { return !st[q.id] && !todayIds[q.id]; });
    fresh.sort(function (a, b) {
      var x = sheetAt[a.subject + "|" + sheetOf(a)] || "", y = sheetAt[b.subject + "|" + sheetOf(b)] || "";
      return (x < y ? 1 : x > y ? -1 : 0) || (sheetOf(a) < sheetOf(b) ? -1 : sheetOf(a) > sheetOf(b) ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
    var limit = Math.max(0, (newPerDay == null ? NEW_PER_DAY : newPerDay) - newToday);
    fresh = mix(fresh).slice(0, limit);
    return { reviews: mix(reviews), fresh: fresh, doneToday: Object.keys(todayIds).length, newToday: newToday };
  }
  // 教科ごとの数：{ 教科: { total, mastered, learning（解いたことがあってまだ覚えていない）, unseen } }
  function summary(questions, records) {
    var st = states(records), out = {};
    (questions || []).forEach(function (q) {
      if (!q || q.enabled === false) return;
      var o = out[q.subject] || (out[q.subject] = { total: 0, mastered: 0, learning: 0, unseen: 0 });
      var s = st[q.id];
      o.total++;
      if (!s) o.unseen++; else if (s.mastered) o.mastered++; else o.learning++;
    });
    return out;
  }

  // ---------- データ ----------
  var key = "", today = "", Q = [], byId = {}, R = [], loaded = false, loading = null, debug = false;
  var queue = [], pos = 0, sessionDone = 0, sessionOk = 0;
  var writeChain = Promise.resolve();

  function readPending() { try { var v = JSON.parse(localStorage.getItem(PENDING_STORE) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function writePending(list) { try { if (list.length) localStorage.setItem(PENDING_STORE, JSON.stringify(list)); else localStorage.removeItem(PENDING_STORE); } catch (e) { /* そのまま */ } }
  function sameRec(a, b) { return a.date === b.date && a.qid === b.qid && a.answeredAt === b.answeredAt; }

  // 問題と記録を読む（書庫を開くたびに読み直す）
  function load() {
    key = BDApi.getKey("player"); today = ymd(new Date());
    debug = !!(window.Sync && Sync.isDebug && Sync.isDebug());
    if (!key) return Promise.reject(new Error("鍵が入っていません"));
    var qs = BDApi.call("shelfQuestions", {}, key, { timeout: 60000 });
    var rs = BDApi.call("shelfHistory", {}, key, { timeout: 60000 });
    loading = qs.then(function (q) { return rs.then(function (r) { return { q: q.questions || [], r: r.records || [] }; }); }).then(function (got) {
      Q = got.q.filter(function (q) { return q && q.id && q.enabled !== false; });
      byId = {}; Q.forEach(function (q) { byId[q.id] = q; });
      var mine = readPending().filter(function (x) { return (x._k || key) === key; });
      // 送れていない答えのうち、もう GAS に入っているものは重ねない
      R = got.r.concat(mine.filter(function (p) { return !got.r.some(function (r) { return sameRec(r, p); }); }));
      if (debug) R = R.concat(debugRecs);
      loaded = true; loading = null;
      if (readPending().length) flushPending();
      return true;
    }, function (err) { loading = null; throw err; });
    return loading;
  }
  var debugRecs = [];   // デバッグ用の枠で解いた答え（送らない）

  function saveAnswer(rec) {
    R.push(rec);
    if (debug) { debugRecs.push(rec); return; }
    var body = {}; Object.keys(rec).forEach(function (k) { body[k] = rec[k]; });
    body._k = key;
    var list = readPending(); list.push(body); writePending(list);
    flushPending();
  }
  function flushPending() {
    writeChain = writeChain.then(function () {
      var list = readPending(), failed = false;
      return list.reduce(function (p, rec) {
        return p.then(function () {
          return send(rec, failed ? 0 : 2).then(function (ok) {
            if (ok) writePending(readPending().filter(function (r) { return !sameRec(r, rec); }));
            if (!ok) failed = true;
          });
        });
      }, Promise.resolve()).then(function () {
        if (failed) notice("答えをまだ送れていません。この iPad に控えてあるので、インターネットにつながったときに送られます。");
      });
    });
    return writeChain;
  }
  function send(rec, tries) {
    var r = {}; Object.keys(rec).forEach(function (k) { if (k !== "_k") r[k] = rec[k]; });
    return BDApi.call("saveShelfAnswer", { record: r }, rec._k || key).then(function () { return true; }, function (err) {
      if (err.kind === "forbidden") return "drop";
      if (tries <= 0) return false;
      return new Promise(function (ok) { setTimeout(ok, 2000); }).then(function () { return send(rec, tries - 1); });
    });
  }

  var imgCache = {};
  function loadImage(id) {
    if (!imgCache[id]) {
      imgCache[id] = BDApi.call("image", { id: id }, key).then(function (r) { return r.src; });
      imgCache[id].catch(function () { delete imgCache[id]; });
    }
    return imgCache[id];
  }

  // ---------- 書庫の中の「知識の棚」の欄（town.js の書庫から呼ぶ） ----------
  function panel(box) {
    box.textContent = "";
    box.appendChild(el("h3", "", "知識の棚"));
    var body = el("div", "shelf-panel"); box.appendChild(body);
    body.appendChild(el("p", "sub", "棚の本を読みこんでいます…"));
    load().then(function () { fillPanel(body); }, function (err) {
      body.textContent = "";
      body.appendChild(el("p", "sub", "棚の本を読みこめませんでした（" + err.message + "）。"));
      var b = el("button", "btn small-btn", "もう一度"); b.type = "button";
      b.addEventListener("click", function () { panel(box); });
      body.appendChild(b);
    });
  }
  function fillPanel(body) {
    body.textContent = "";
    if (!Q.length) { body.appendChild(el("p", "sub", "まだ棚に本がない。塾のプリントの問題が入ると、ここで覚えられるようになる。")); return; }
    var p = plan(Q, R, today), n = p.reviews.length + p.fresh.length;
    body.appendChild(el("p", "shelf-today", n ? "今日の分：復習 " + p.reviews.length + " 問・新しい問題 " + p.fresh.length + " 問" :
      (p.doneToday ? "今日の分はおわり！ また明日。" : "今日解く問題はない。")));
    if (debug) body.appendChild(el("p", "sub", "（デバッグ用の枠：答えは送らない）"));
    if (n) {
      var b = el("button", "btn", "今日の問題を解く（" + n + " 問）"); b.type = "button";
      b.addEventListener("click", function () { open(p); });
      body.appendChild(b);
    }
    // 教科ごとの本棚：覚えた数／棚の問題の数
    var sm = summary(Q, R), shelves = el("div", "shelf-rows");
    ORDER.forEach(function (k) {
      var o = sm[k]; if (!o) return;
      var row = el("div", "shelf-row"); row.dataset.s = k;
      row.appendChild(el("span", "shelf-name", subjectName(k)));
      var bar = el("span", "shelf-books");
      var shown = Math.min(o.total, 40);
      for (var i = 0; i < shown; i++) {
        var part = i < Math.round(shown * o.mastered / o.total) ? "got" : i < Math.round(shown * (o.mastered + o.learning) / o.total) ? "learn" : "";
        bar.appendChild(el("i", "book" + (part ? " " + part : "")));
      }
      row.appendChild(bar);
      row.appendChild(el("span", "shelf-count", "覚えた " + o.mastered + " / " + o.total));
      shelves.appendChild(row);
    });
    body.appendChild(shelves);
    body.appendChild(el("p", "sub", "正解するたびに、次に出るまでの日がのびる（翌日→3日後→1週間後→2週間後→1か月後）。1か月あけても正解できたら「覚えた」。"));
  }

  // ---------- 問題を解く画面 ----------
  var screen = $("shelfScreen");
  function notice(t) { var n = $("shelfNotice"); n.textContent = t || ""; n.hidden = !t; }
  function open(p) {
    Sound.bgm("trial");
    queue = p.reviews.map(function (q) { return { q: q, review: true }; }).concat(p.fresh.map(function (q) { return { q: q, review: false }; }));
    pos = 0; sessionDone = 0; sessionOk = 0;
    screen.hidden = false;
    ["base", "worldScreen", "town"].forEach(function (id) { var e = $(id); if (e) e.hidden = true; });
    notice("");
    show();
  }
  function close() {
    screen.hidden = true;
    Sound.bgm("town");
    Town.open("book");
  }
  $("shelfBack").addEventListener("click", close);

  function show() {
    var card = $("shelfCard"), ans = $("shelfAnswer"), done = $("shelfDone");
    screen.scrollTop = 0;
    if (pos >= queue.length) {
      card.hidden = true; ans.hidden = true; done.hidden = false;
      $("shelfProgress").textContent = "";
      $("shelfDoneText").textContent = sessionDone ? "今日は " + sessionDone + " 問、そのうち " + sessionOk + " 問正解。" + "まちがえた問題は、明日また出てくる。" : "";
      Sound.play("trialDone");
      return;
    }
    done.hidden = true; card.hidden = false; ans.hidden = false;
    var it = queue[pos], q = it.q;
    $("shelfProgress").textContent = "今日の分 " + (pos + 1) + " / " + queue.length + (it.review ? "（復習）" : "（新しい問題）");
    screen.dataset.s = q.subject; card.dataset.s = q.subject; ans.dataset.s = q.subject;
    var holder = el("div"); card.textContent = ""; card.appendChild(holder);
    DrillCore.renderQuestion(holder, q, {
      answerRoot: ans, keypad: true, imageLoader: loadImage,
      extraMeta: [it.review ? "前に解いた問題" : "はじめての問題"],
      onFinish: function (res) {
        var rec = { date: today, subject: q.subject, qid: q.id, input: res.input || "", correct: !!res.correct,
          self: (res.parts || []).some(function (x) { return x && x.self; }), answeredAt: new Date().toISOString(), parts: res.parts || [] };
        saveAnswer(rec);
        sessionDone++; if (rec.correct) sessionOk++;
        Sound.play(rec.correct ? "correct" : "wrong");
        var next = el("button", "dq-btn", pos + 1 < queue.length ? "次の問題へ" : "おわり");
        next.type = "button";
        next.addEventListener("click", function () { pos++; show(); });
        ans.appendChild(next);
        try { next.scrollIntoView({ block: "nearest" }); } catch (e) { /* そのまま */ }
      }
    });
  }
  $("shelfDoneBack").addEventListener("click", close);

  return { panel: panel, plan: plan, states: states, summary: summary, mix: mix, NEW_PER_DAY: NEW_PER_DAY, INTERVALS: INTERVALS };
})();
