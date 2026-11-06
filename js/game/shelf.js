// 書庫の「知識の棚」（2026-11-04）：塾のプリント（確認テスト・言語知識テストなど）の一問一答を、覚えるまで間をあけて出す。
// ・問題は GAS の「問題」シートの kind が "shelf" のもの（shelfQuestions）。塾の教材なので、このリポジトリには置かない。
// ・答えは「書庫の記録」シート（shelfHistory・saveShelfAnswer）。知恵の試練の「記録」とは分ける。
// ・出し方（docs/game-design.md の 6.7。2026-11-04 に「キャッチアップを先に」へ変更）：
//   1日 DAILY 問まで。①前にまちがえて、まだ2回目を解いていない問題（次の日に1回だけ）→ ②まだ解いていない問題（1周目）
//   → ③1周目が終わったあとの、間をあけたたしかめ。教科はまぜて回す（子どもに選ばせない）。同じ図・表・指示の小問（group）はまとめて続けて出し、教科ごとの小問の数がそろうように回す。
//   はじめて見て正解した問題は「知っている」（14日たったら1回たしかめ、正解なら「覚えた」）。
//   2回目もまちがえた問題は「苦手」（1周目のあいだは追わない。そのあとは 3日後→1週間後→2週間後 と正解を続けたら「覚えた」。まちがえたら翌日）。
//   新しい問題は、新しいプリントから先に（プリントの中は問題の順）。休んだ日があっても、たまるのは1周目の残りだけ。
// ・保護者のデバッグ用の枠では、答えを GAS に送らない（この画面を開いているあいだだけ覚える）。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Shelf = (function () {
  var DAILY = 30;            // 1日に解く問題の数（数字は遊んでみてから直す）
  var KNOWN_CHECK = 14;      // 「知っている」問題を、たしかめるまでの日数
  var LADDER = [3, 7, 14];   // 「苦手」問題：正解が続いた回数ごとの、次に出すまでの日数。全部続けたら「覚えた」
  var ORDER = ["japanese", "science", "social", "math"];
  var PENDING_STORE = "bd-shelf-pending";

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function pad(n) { return ("0" + n).slice(-2); }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function addDays(date, n) { var d = new Date(date.replace(/-/g, "/")); d.setDate(d.getDate() + n); return ymd(d); }
  function subjectName(k) { return DrillCore.subjectName(k); }

  // ---------- 出し方（画面とは別。node でもためせるように、ここは DOM を使わない） ----------
  // 問題ごとの今の様子：{ kind（"known" 知っている／"retry" 次の日にもう1回／"weak" 苦手／"mastered" 覚えた）, box（苦手の問題で正解が続いた回数）,
  //   due（次に出す日）, last（最後に解いた日）, tries }
  function states(records) {
    var st = {};
    (records || []).slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : (String(a.answeredAt) < String(b.answeredAt) ? -1 : String(a.answeredAt) > String(b.answeredAt) ? 1 : 0);
    }).forEach(function (r) {
      if (!r || !r.qid || !r.date) return;
      var s = st[r.qid];
      if (!s) {   // はじめて解いた
        st[r.qid] = r.correct ? { kind: "known", box: 0, due: addDays(r.date, KNOWN_CHECK), last: r.date, tries: 1 }
          : { kind: "retry", box: 0, due: addDays(r.date, 1), last: r.date, tries: 1 };
        return;
      }
      s.tries++; s.last = r.date;
      if (!r.correct) { s.kind = "weak"; s.box = 0; s.due = addDays(r.date, 1); return; }
      if (s.kind === "known" || s.kind === "mastered") { s.kind = "mastered"; s.due = ""; return; }
      // retry・weak で正解：苦手の段を1つ上げる
      s.kind = "weak"; s.box++;
      if (s.box > LADDER.length) { s.kind = "mastered"; s.due = ""; return; }
      s.due = addDays(r.date, LADDER[s.box - 1]);
    });
    return st;
  }
  // 教科をまぜる（2026-11-04 保護者と決定）：同じ図・表・指示を使う小問（データの group が同じで、並びが続いているもの）は
  // 「まとまり」として続けて出す。教科はまとまりごとに回し、それまでに出した小問の数がいちばん少ない教科を次にする
  // （同じなら ORDER の順）。国語で8問のまとまりを出したら、理科・社会も8問くらいになるまで続けて出る。
  // もどり値の項目には unit（まとまりの番号）をつける。1日の数で切るときに、まとまりを途中で切らないため。
  function units(list) {
    var out = [], last = null;
    list.forEach(function (q) {
      var g = q.group ? String(q.group) : "";
      if (g && last && last.group === g) last.qs.push(q);
      else { last = { group: g, qs: [q] }; out.push(last); }
    });
    return out;
  }
  function mix(list) {
    var by = {}, out = [], count = {}, n = 0;
    list.forEach(function (q) { (by[q.subject] || (by[q.subject] = [])).push(q); });
    var keys = ORDER.filter(function (k) { return by[k]; }).concat(Object.keys(by).filter(function (k) { return ORDER.indexOf(k) < 0; }));
    keys.forEach(function (k) { by[k] = units(by[k]); count[k] = 0; });
    for (;;) {
      var pick = null;
      keys.forEach(function (k) { if (by[k].length && (pick === null || count[k] < count[pick])) pick = k; });
      if (pick === null) break;
      var u = by[pick].shift();
      u.qs.forEach(function (q) { out.push(q); });
      count[pick] += u.qs.length;
      out.unit = (out.unit || []).concat(u.qs.map(function () { return n; }));
      n++;
    }
    return out;
  }
  // mix の結果に why をつけて並べる（unit はまとまりの番号。ほかの list と重ならないように start からかぞえる）
  function tag(list, why, start) {
    var m = mix(list);
    return m.map(function (q, i) { return { q: q, why: why, unit: start + (m.unit ? m.unit[i] : i) }; });
  }
  // 1日の数で切る。まとまりは途中で切らない（さいごのまとまりは、数を少しこえても最後まで出す）
  function cut(list, room) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (out.length >= room && !(out.length && list[i].unit === out[out.length - 1].unit)) break;
      out.push(list[i]);
    }
    return out;
  }
  // プリント名（出典の最初の空白まで）と、そのプリントを取りこんだ日時（同じプリントの問題でいちばん早い書きこみ日時）
  function sheetOf(q) { return String(q.source || "").split(" ")[0]; }
  // その日の分：{ list: [{ q, why（"retry"・"new"・"check"） }], doneToday, left（1周目の残り）, caughtUp（1周目が終わった） }
  function plan(questions, records, today, daily) {
    var st = states((records || []).filter(function (r) { return r.date < today; }));
    var todayIds = {};
    (records || []).forEach(function (r) { if (r && r.date === today && r.qid) todayIds[r.qid] = true; });
    var doneToday = Object.keys(todayIds).length;
    var room = Math.max(0, (daily == null ? DAILY : daily) - doneToday);
    var Q = (questions || []).filter(function (q) { return q && q.id && q.enabled !== false && !todayIds[q.id]; });
    // ①前にまちがえて、まだ2回目を解いていない問題
    var retry = Q.filter(function (q) { var s = st[q.id]; return s && s.kind === "retry"; });
    retry.sort(function (a, b) { return st[a.id].last < st[b.id].last ? -1 : st[a.id].last > st[b.id].last ? 1 : (a.id < b.id ? -1 : 1); });
    // ②まだ解いていない問題（新しいプリントが先）
    var sheetAt = {};
    (questions || []).forEach(function (q) { if (!q) return; var k = q.subject + "|" + sheetOf(q), at = String(q.updatedAt || ""); if (!sheetAt[k] || (at && at < sheetAt[k])) sheetAt[k] = at; });
    var fresh = Q.filter(function (q) { return !st[q.id]; });
    fresh.sort(function (a, b) {
      var x = sheetAt[a.subject + "|" + sheetOf(a)] || "", y = sheetAt[b.subject + "|" + sheetOf(b)] || "";
      return (x < y ? 1 : x > y ? -1 : 0) || (sheetOf(a) < sheetOf(b) ? -1 : sheetOf(a) > sheetOf(b) ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
    // ③1周目が終わったあとの、たしかめ（知っている問題の1回・苦手の問題）
    var check = Q.filter(function (q) { var s = st[q.id]; return s && (s.kind === "known" || s.kind === "weak") && s.due && s.due <= today; });
    check.sort(function (a, b) { var x = st[a.id], y = st[b.id]; return (x.due < y.due ? -1 : x.due > y.due ? 1 : 0) || (a.id < b.id ? -1 : 1); });
    var list = tag(retry, "retry", 0);
    list = list.concat(tag(fresh, "new", 100000));
    if (!fresh.length) list = list.concat(tag(check, "check", 200000));
    return { list: room > 0 ? cut(list, room) : [], doneToday: doneToday, left: fresh.length, caughtUp: !fresh.length };
  }
  // 教科ごとの数：{ 教科: { total, mastered（覚えた）, known（知っている）, weak（苦手・もう1回）, unseen（まだ） } }
  function summary(questions, records) {
    var st = states(records), out = {};
    (questions || []).forEach(function (q) {
      if (!q || q.enabled === false) return;
      var o = out[q.subject] || (out[q.subject] = { total: 0, mastered: 0, known: 0, weak: 0, unseen: 0 });
      var s = st[q.id];
      o.total++;
      if (!s) o.unseen++; else if (s.kind === "mastered") o.mastered++; else if (s.kind === "known") o.known++; else o.weak++;
    });
    return out;
  }

  // ---------- データ ----------
  var key = "", today = "", Q = [], byId = {}, R = [], loaded = false, loading = null, debug = false;
  var queue = [], pos = 0, sessionDone = 0, sessionOk = 0, sessionGot = [];
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

  // ごほうび（state.js の shelfReward）。解いた数＝書庫の記録の数
  function rewardText(r) { return r ? "ごほうび：鉱石 +" + r.iron + "　魔石 +" + r.stone + (r.gem ? "　宝玉 +" + r.gem : "") : ""; }
  function payReward() { return window.GameState && GameState.shelfReward ? GameState.shelfReward(R.length) : null; }
  // 「手に入れた！」の知らせ（宝箱の音つき）。OK で then()
  function rewardPopup(r, head, then) {
    var t = (head || "") + "鉱石を " + r.iron + " こ、魔石を " + r.stone + " こ 手に入れた！" + (r.gem ? "\n宝玉も " + r.gem + " こ 手に入れた！" : "") +
      "\n次のごほうびまで、あと " + toNext() + " 問。";
    try { Sound.play("chest"); } catch (e) { /* そのまま */ }
    if (window.Dialog) Dialog.alert(t, then); else if (then) then();
  }
  function toNext() { return window.GameState && GameState.shelfToNext ? GameState.shelfToNext(R.length) : 0; }

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
    var p = plan(Q, R, today), n = p.list.length;
    var nr = p.list.filter(function (x) { return x.why === "retry"; }).length;
    body.appendChild(el("p", "shelf-today", n ? "今日の分：" + n + " 問" + (nr ? "（そのうち、前にまちがえた問題 " + nr + " 問）" : "") + (p.doneToday ? "　今日はもう " + p.doneToday + " 問解いた" : "") :
      (p.doneToday ? "今日の分はおわり！ また明日。" : "今日解く問題はない。")));
    body.appendChild(el("p", "sub", p.caughtUp ? "棚の本は全部1回読んだ。これからは、間をあけてたしかめる。" : "まだ読んでいない本：あと " + p.left + " 問"));
    var got = payReward();
    if (got) { body.appendChild(el("p", "shelf-today", "これまで解いた分の" + rewardText(got))); rewardPopup(got, "これまで解いた分のごほうび！\n"); }
    body.appendChild(el("p", "sub", "解いた数 " + GameState.SHELF_STEP + " 問ごとに、鉱石と魔石。3回ごとに宝玉も。次のごほうびまで、あと " + toNext() + " 問。"));
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
        var part = i < Math.round(shown * o.mastered / o.total) ? "got" : i < Math.round(shown * (o.mastered + o.known) / o.total) ? "known" :
          i < Math.round(shown * (o.mastered + o.known + o.weak) / o.total) ? "learn" : "";
        bar.appendChild(el("i", "book" + (part ? " " + part : "")));
      }
      row.appendChild(bar);
      row.appendChild(el("span", "shelf-count", "覚えた・知っている " + (o.mastered + o.known) + " / " + o.total + (o.weak ? "　もう少し " + o.weak : "")));
      shelves.appendChild(row);
    });
    body.appendChild(shelves);
    body.appendChild(el("p", "sub", "1日 " + DAILY + " 問。まちがえた問題は、次の日にもう1回出る。はじめて見て正解できた本は「知っている」（金のふち）、2週間たっても正解できたら「覚えた」（金）。"));
  }

  // ---------- 問題を解く画面 ----------
  var screen = $("shelfScreen");
  function notice(t) { var n = $("shelfNotice"); n.textContent = t || ""; n.hidden = !t; }
  function open(p) {
    Sound.bgm("trial");
    queue = p.list.slice();
    pos = 0; sessionDone = 0; sessionOk = 0; sessionGot = [];
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
      $("shelfDoneText").textContent = sessionDone ? sessionDone + " 問解いて、" + sessionOk + " 問正解。" + (sessionOk < sessionDone ? "まちがえた問題は、次の日にもう1回出てくる。" : "") +
        (sessionGot.length ? "　" + rewardText(sessionGot.reduce(function (a, b) { return { iron: a.iron + b.iron, stone: a.stone + b.stone, gem: a.gem + b.gem }; }, { iron: 0, stone: 0, gem: 0 })) + "。" : "") +
        "　次のごほうびまで、あと " + toNext() + " 問。" : "";
      Sound.play("trialDone");
      return;
    }
    done.hidden = true; card.hidden = false; ans.hidden = false;
    var it = queue[pos], q = it.q;
    var WHY = { retry: "（前にまちがえた問題）", "new": "（はじめての問題）", check: "（たしかめ）" };
    $("shelfProgress").textContent = "今日の分 " + (pos + 1) + " / " + queue.length + WHY[it.why];
    screen.dataset.s = q.subject; card.dataset.s = q.subject; ans.dataset.s = q.subject;
    var holder = el("div"); card.textContent = ""; card.appendChild(holder);
    DrillCore.renderQuestion(holder, q, {
      answerRoot: ans, keypad: true, imageLoader: loadImage,
      review: it.why === "retry",
      onFinish: function (res) {
        var rec = { date: today, subject: q.subject, qid: q.id, input: res.input || "", correct: !!res.correct,
          self: (res.parts || []).some(function (x) { return x && x.self; }), answeredAt: new Date().toISOString(), parts: res.parts || [] };
        saveAnswer(rec);
        sessionDone++; if (rec.correct) sessionOk++;
        Sound.play(rec.correct ? "correct" : "wrong");
        var got = payReward();
        if (got) { sessionGot.push(got); ans.appendChild(el("p", "shelf-reward", rewardText(got))); }
        var next = el("button", "dq-btn", pos + 1 < queue.length ? "次の問題へ" : "おわり");
        next.type = "button";
        next.addEventListener("click", function () {
          if (got) rewardPopup(got, "知識の棚で解いた数が " + R.length + " 問になった！\n", function () { pos++; show(); });
          else { pos++; show(); }
        });
        ans.appendChild(next);
        try { next.scrollIntoView({ block: "nearest" }); } catch (e) { /* そのまま */ }
      }
    });
  }
  $("shelfDoneBack").addEventListener("click", close);

  return { panel: panel, plan: plan, states: states, summary: summary, mix: mix, DAILY: DAILY };
})();
