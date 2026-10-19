// 知恵の試練（段階6-1）：ゲームの中の「毎日4問」。算数・国語・理科・社会を1問ずつ解くと、ダンジョンの扉が開く。
// 問題の表示と答え合わせ・図への書きこみは、ドリルと同じ部品（js/drillcore.js）。GAS とのやりとりは js/api.js。
// 出題のルール（CLAUDE.md・docs/game-design.md）：教科ごとに、①正解した回数が少ない問題が先、②同じなら優先度
//   （テストでまちがえた問題（正答率30%未満は除く）→ 正答率の高い問題）、③それも同じなら日によって変える。3日後の復習はしない。
// 問題と記録は GAS から（つなぎ先は sync.js。G-2 で「ためしの問題」はなくした）。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Trial = (function () {
  var SUBJECTS = DrillCore.SUBJECTS;
  var PENDING_STORE = "bd-drill-pending"; // まだ送れていない答え（ドリルと同じ置き場所）
  // 正解した教科の加護（その日の冒険だけ）：docs/game-design.md 2（決定）
  var BLESS = {
    math: { name: "算数", text: "物攻＋10%" }, japanese: { name: "国語", text: "魔攻＋10%" },
    science: { name: "理科", text: "物防・魔防＋10%" }, social: { name: "社会", text: "HP・MP＋10%" }
  };

  var screen = document.getElementById("trialScreen");
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  var key = "", today = "";
  var Q = [], byId = {}, days = {}, picks = {}, current = "math", ready = false, shownKey = "";
  var writeChain = Promise.resolve();
  var onDone = null, floorNo = 1, rest = false;
  // 何回目の試練か（1日に出発できる回数まで。出発ごとに新しい4問。2026-10-17）
  // 記録の形は変えない：同じ日・同じ教科の記録の、何番目かで見分ける（1番目＝1回目、2番目＝2回目）
  var round = 1, memoFor = "";

  function pad(n) { return ("0" + n).slice(-2); }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function notice(t) { var n = $("trialNotice"); n.textContent = t || ""; n.hidden = !t; }

  // ---------- ひらく ----------
  // floor：挑む階、done(result)：扉が開いたとき（result：{ correct, subjects }）
  // opts.rest：休みの日（ダンジョンは閉じていて、知恵の試練だけ解く。段階6-2）
  function open(floor, done, opts) {
    Sound.bgm("trial");
    floorNo = floor; onDone = done; today = ymd(new Date()); rest = !!(opts && opts.rest);
    round = Math.max(1, (opts && opts.round) || 1);
    // 新しい試練になったら、メモを白紙にする
    if (memoFor !== today + "#" + round) { clearMemos(); memoFor = today + "#" + round; }
    key = BDApi.getKey("player");
    screen.hidden = false;
    ["base", "worldScreen", "town"].forEach(function (id) { var e = document.getElementById(id); if (e) e.hidden = true; }); // 下の画面がかぶさらないように
    $("trialSub").textContent = rest ? "今日はお休みの日。ダンジョンは閉じているけれど、知恵の試練は解ける。" :
      (round > 1 ? "今日の " + round + " 回目の試練。" : "") + GameData.floorLabel(floor) + "へ向かう前に、4つの問いに答えよう。解き終えると、扉が開く。";
    document.querySelector("#trialDone h3").textContent = rest ? "4つの問いに答えた！" : "4つの問いに答えた！ 扉が開いた";
    $("trialGo").textContent = rest ? "拠点にもどる" : "ダンジョンへ";
    $("trialDone").hidden = true;
    $("trialBody").hidden = false;
    ready = false; shownKey = ""; current = "math";
    renderAll();
    if (!key) { close(); Sync.reconnect(""); return; }
    load();
  }
  function close() { screen.hidden = true; }
  $("trialBack").addEventListener("click", function () { close(); Base.showBase(null); });

  // インターネットにつながらないときは遊べない（記録とセーブがいつもそろうように）
  function offline(msg) {
    notice("インターネットにつながっていません。つないでから「もう一度」を押してください。" + (msg ? "（" + msg + "）" : ""));
    var b = el("button", "dq-btn small", "もう一度"); b.type = "button"; b.addEventListener("click", load);
    $("trialNotice").appendChild(document.createTextNode(" ")); $("trialNotice").appendChild(b);
  }

  function load() {
    notice("問題を読みこんでいます…");
    if (navigator.onLine === false) { offline(""); return; }
    var qs = BDApi.call("drillQuestions", {}, key);
    var rs = BDApi.call("history", {}, key);
    qs.then(function (q) {
      return rs.then(function (r) { return { q: q.questions, r: r.records }; });
    }).then(function (got) {
      start(got.q, got.r.concat(readPending().filter(function (x) { return (x._k || key) === key; })));
      notice("");
      if (readPending().length) flushPending();
    }, function (err) {
      if (err.kind === "forbidden") { BDApi.clearKey("player"); key = ""; close(); Sync.reconnect("鍵が使えなくなりました。新しいプレイヤー用の鍵を入れてください。"); return; }
      offline(err.message);
    });
  }

  function start(questions, records) {
    Q = (questions || []).filter(function (q) { return q && q.id && q.enabled !== false; });
    byId = {}; Q.forEach(function (q) { byId[q.id] = q; });
    makeTestAt();
    days = {};
    (records || []).forEach(function (r) {
      if (!r || !r.date || !r.subject) return;
      var d = days[r.date] || (days[r.date] = { date: r.date, lists: {} });
      (d.lists[r.subject] || (d.lists[r.subject] = [])).push(r); // 記録の順（古い順）
    });
    ready = true;
    SUBJECTS.forEach(function (s) { picks[s.key] = choose(s.key); });
    // まだ解いていない教科から
    var first = SUBJECTS.filter(function (s) { return picks[s.key] && !itemOf(s.key); })[0];
    current = first ? first.key : "math";
    renderAll();
  }

  // ---------- 出題（ドリルと同じルール） ----------
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function todayList(subject) { return (days[today] && days[today].lists[subject]) || []; }
  // この回（round）に、この教科で解いた記録
  function itemOf(subject) { return todayList(subject)[round - 1]; }
  // 正解した回数：前の日の記録と、今日のこの回より前の記録
  function historyFor(subject) {
    var h = {};
    Object.keys(days).forEach(function (d) {
      if (d > today) return;
      var list = days[d].lists[subject] || [];
      if (d === today) list = list.slice(0, round - 1);
      list.forEach(function (it) {
        if (!it || !it.qid) return;
        var x = h[it.qid] || (h[it.qid] = { ok: 0, tries: 0 });
        x.tries++; if (it.correct) x.ok++;
      });
    });
    return h;
  }
  function rateOf(q) {
    var r = DrillCore.asList(q.parts).map(function (p) { return Number(p.rate); }).filter(function (v) { return isFinite(v) && v > 0; });
    if (!r.length) return 50;
    return r.reduce(function (s, v) { return s + v; }, 0) / r.length;
  }
  // テスト名（出典の最初の空白まで。例「組分け第6回」）と、そのテストを取りこんだ日時（同じテストの問題でいちばん早い書きこみ日時）
  // 問題を直すと書きこみ日時は新しくなるが、いちばん早いものを使うので、テストの日付はほとんど動かない（2026-10-20）
  function testOf(q) { return String(q.source || "").split(" ")[0]; }
  var testAt = {};
  function makeTestAt() {
    testAt = {};
    Q.forEach(function (q) {
      var t = testOf(q), at = String(q.updatedAt || "");
      if (!t || !at) return;
      var k = q.subject + "|" + t;
      if (!testAt[k] || at < testAt[k]) testAt[k] = at;
    });
  }
  // 教科ごとに、いちばん新しいテスト（2026-10-20 保護者の希望：直近のテストを優先して出す）
  function latestTest(subject) {
    var best = "", at = "";
    Object.keys(testAt).forEach(function (k) {
      var p = k.split("|");
      if (p[0] === subject && testAt[k] > at) { at = testAt[k]; best = p.slice(1).join("|"); }
    });
    return best;
  }
  // 点数：正答率＋テストでまちがえた（30%以上のとき）100＋直近のテスト 200
  function priority(q, latest) {
    var r = rateOf(q);
    return Math.round(r) + (q.testMiss && r >= 30 ? 100 : 0) + (latest && testOf(q) === latest ? 200 : 0);
  }
  function choose(subject) {
    var t = itemOf(subject);
    if (t && byId[t.qid]) return { qid: t.qid, review: !!t.review };
    var pool = Q.filter(function (q) { return q.subject === subject; });
    if (!pool.length) return null;
    // 今日もう出した問題は、ほかに問題があれば出さない（2回目に同じ問題が続かないように）
    var shown = todayList(subject).slice(0, round - 1).map(function (r) { return r.qid; });
    var fresh = pool.filter(function (q) { return shown.indexOf(q.id) < 0; });
    if (fresh.length) pool = fresh;
    var h = historyFor(subject);
    function ok(q) { return h[q.id] ? h[q.id].ok : 0; }
    var latest = latestTest(subject);
    pool.sort(function (a, b) { return ok(a) - ok(b) || priority(b, latest) - priority(a, latest) || hash(a.id + today) - hash(b.id + today); });
    var top = pool[0], th = h[top.id];
    return { qid: top.id, review: !!(th && th.tries > 0 && th.ok === 0) };
  }

  // ---------- 記録（送れないときは iPad の中に控えて、あとで送る） ----------
  function saveAnswer(subject, record) {
    var day = days[today] || (days[today] = { date: today, lists: {} });
    var list = day.lists[subject] || (day.lists[subject] = []);
    list[round - 1] = record;
    var body = Object.assign({ date: today, subject: subject }, record);
    body._k = key;
    var list = readPending(); list.push(body); writePending(list);
    flushPending();
  }
  function readPending() { try { var v = JSON.parse(localStorage.getItem(PENDING_STORE) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function writePending(list) { try { if (list.length) localStorage.setItem(PENDING_STORE, JSON.stringify(list)); else localStorage.removeItem(PENDING_STORE); } catch (e) { /* そのまま */ } }
  function sameRec(a, b) { return a.date === b.date && a.subject === b.subject && a.answeredAt === b.answeredAt; }
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
        if (failed) notice("記録をまだ送れていません。この iPad に控えてあるので、インターネットにつながったときに送られます。");
      });
    });
    return writeChain;
  }
  function send(rec, tries) {
    var r = {}; Object.keys(rec).forEach(function (k) { if (k !== "_k") r[k] = rec[k]; });
    return BDApi.call("saveAnswer", { record: r }, rec._k || key).then(function () { return true; }, function (err) {
      if (err.kind === "forbidden") return "drop";
      if (tries <= 0) return false;
      return new Promise(function (ok) { setTimeout(ok, 2000); }).then(function () { return send(rec, tries - 1); });
    });
  }

  // ---------- 図の読みこみ ----------
  var imgCache = {};
  function loadImage(id) {
    if (!imgCache[id]) {
      imgCache[id] = BDApi.call("image", { id: id }, key).then(function (r) { return r.src; });
      imgCache[id].catch(function () { delete imgCache[id]; });
    }
    return imgCache[id];
  }

  // ---------- 画面 ----------
  function renderAll() { renderTabs(); renderQuestion(); showMemo(current); renderDone(); }
  function renderTabs() {
    var nav = $("trialTabs"); nav.textContent = "";
    SUBJECTS.forEach(function (s) {
      var it = itemOf(s.key), none = ready && !picks[s.key];
      var b = el("button", "ttab" + (s.key === current ? " sel" : "")); b.type = "button"; b.dataset.s = s.key;
      b.appendChild(el("span", "tname", s.name));
      b.appendChild(el("span", "tstate", none ? "問題なし" : !it ? "まだ" : it.correct ? "○ 正解" : "× ざんねん"));
      b.addEventListener("click", function () { current = s.key; renderAll(); });
      nav.appendChild(b);
    });
  }
  function renderQuestion() {
    // 左に問い（問題文・図）、右に答えの欄（2026-10-17：問題が長くても、答えの欄がいつも見えるように）
    var card = $("trialCard"), ansBox = $("trialAnswer");
    card.dataset.s = current; ansBox.dataset.s = current; screen.dataset.s = current;
    if (!ready) { card.textContent = ""; ansBox.textContent = ""; card.appendChild(el("p", "muted", "問いを用意しています…")); shownKey = ""; return; }
    var pick = picks[current], q = pick && byId[pick.qid];
    if (!q) { card.textContent = ""; ansBox.textContent = ""; card.appendChild(el("p", "muted", "この教科の問題がまだありません。ほかの教科を解こう。")); shownKey = ""; return; }
    var saved = itemOf(current) || null;
    var k = current + "|" + q.id + "|" + (saved ? "done" : "open");
    if (k === shownKey) return; // 入力中の答えを消さない
    shownKey = k;
    var holder = el("div"); card.textContent = ""; card.appendChild(holder);
    DrillCore.renderQuestion(holder, q, {
      answerRoot: ansBox, keypad: true,   // 数字の答えは、画面の数字のボタンで入れる（2026-10-19）
      imageLoader: loadImage, saved: saved, review: pick.review,
      extraMeta: [q.testMiss ? "テストでまちがえた問題" : "", "正答率 " + Math.round(rateOf(q)) + "%"].filter(Boolean),
      reviewNote: "正解するまで、また出てきます。",
      onFinish: function (res) {
        var rec = Object.assign({ qid: q.id, unit: q.unit || "", review: !!pick.review, answeredAt: new Date().toISOString() }, res);
        saveAnswer(current, rec);
        Sound.play(rec.correct ? "correct" : "wrong");
        shownKey = current + "|" + q.id + "|done";
        renderTabs(); renderDone(); appendNext(ansBox);
      }
    });
    if (saved) appendNext(ansBox);
  }
  function appendNext(card) {
    var nextS = SUBJECTS.filter(function (s) { return picks[s.key] && !itemOf(s.key); })[0];
    if (!nextS) return;
    var b = el("button", "dq-btn", "次の問い（" + nextS.name + "）へ"); b.type = "button";
    b.addEventListener("click", function () { current = nextS.key; renderAll(); screen.scrollTop = 0; });
    card.appendChild(b);
  }

  // 4問（問題のある教科ぜんぶ）を解き終えたか
  function result() {
    var list = SUBJECTS.filter(function (s) { return picks[s.key]; });
    var solved = list.filter(function (s) { return itemOf(s.key); });
    var correct = list.filter(function (s) { var it = itemOf(s.key); return it && it.correct; }).map(function (s) { return s.key; });
    return { all: list.length > 0 && solved.length === list.length, solved: solved.length, total: list.length, correct: correct.length, subjects: correct };
  }
  function renderDone() {
    var box = $("trialDone");
    if (!ready) { box.hidden = true; return; }
    var r = result();
    $("trialProgress").textContent = r.total ? "解いた問い " + r.solved + " / " + r.total : "";
    if (!r.all) { box.hidden = true; return; }
    if (box.hidden) Sound.play("trialDone");
    $("trialDoneText").textContent = "正解 " + r.correct + " / " + r.total + "。" +
      (rest ? "" : r.correct ? "加護：" + r.subjects.map(function (s) { return BLESS[s].name + "（" + BLESS[s].text + "）"; }).join("・") + "。" : "加護はなし。") +
      (rest ? "今日はお休みの日なので、ダンジョンはまた明日。" : "正解が多いほど、宝箱がよくなり、クリア報酬がふえる。");
    $("trialGo").onclick = function () {
      close();
      if (onDone) onDone({ correct: r.correct, subjects: r.subjects });
    };
    box.hidden = false;
  }

  // ---------- メモ（教科ごとに1枚） ----------
  var canvases = {}, memo = { color: "pen", erase: false };
  function makeCanvas(subject) {
    var c = el("canvas"); c.dataset.s = subject; $("trialMemoBox").appendChild(c); canvases[subject] = c;
    var drawing = false, lastX = 0, lastY = 0, ctx = c.getContext("2d");
    function pos(e) { var r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    function style(ev) {
      var pr = ev.pressure && ev.pointerType === "pen" ? ev.pressure : 0.5;
      ctx.globalCompositeOperation = memo.erase ? "destination-out" : "source-over";
      ctx.strokeStyle = ctx.fillStyle = memo.color === "red" ? "#c8412c" : "#1d2733";
      ctx.lineWidth = memo.erase ? 22 : 1.4 + pr * 2.6;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
    }
    c.addEventListener("pointerdown", function (e) { drawing = true; try { c.setPointerCapture(e.pointerId); } catch (x) { /* そのまま */ } var p = pos(e); lastX = p[0]; lastY = p[1]; style(e); ctx.beginPath(); ctx.arc(lastX, lastY, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); });
    c.addEventListener("pointermove", function (e) {
      if (!drawing) return;
      var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      evs.forEach(function (ev) { var p = pos(ev); style(ev); ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p[0], p[1]); ctx.stroke(); lastX = p[0]; lastY = p[1]; });
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (t) { c.addEventListener(t, function () { drawing = false; }); });
    fit(c);
    return c;
  }
  function fit(c) {
    var box = $("trialMemoBox"), dpr = window.devicePixelRatio || 1;
    var w = Math.round(box.clientWidth * dpr), h = Math.round(box.clientHeight * dpr);
    if (!w || !h || (c.width === w && c.height === h)) return;
    var old = null;
    if (c.width) { old = document.createElement("canvas"); old.width = c.width; old.height = c.height; old.getContext("2d").drawImage(c, 0, 0); }
    c.width = w; c.height = h;
    var ctx = c.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (old) ctx.drawImage(old, 0, 0, old.width / dpr, old.height / dpr);
  }
  function clearMemos() {
    Object.keys(canvases).forEach(function (k) { var c = canvases[k]; var x = c.getContext("2d"); x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height); x.restore(); });
  }
  function showMemo(subject) {
    if (screen.hidden) return;
    SUBJECTS.forEach(function (s) { var c = canvases[s.key] || makeCanvas(s.key); c.hidden = s.key !== subject; });
    fit(canvases[subject]);
  }
  function setTool(which) {
    memo.erase = which === "eraser"; if (!memo.erase) memo.color = which === "red" ? "red" : "pen";
    $("memoPen").setAttribute("aria-pressed", String(which === "pen"));
    $("memoRed").setAttribute("aria-pressed", String(which === "red"));
    $("memoErase").setAttribute("aria-pressed", String(which === "eraser"));
  }
  $("memoPen").addEventListener("click", function () { setTool("pen"); });
  $("memoRed").addEventListener("click", function () { setTool("red"); });
  $("memoErase").addEventListener("click", function () { setTool("eraser"); });
  $("memoClear").addEventListener("click", function () { var c = canvases[current]; if (c) { var x = c.getContext("2d"); x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height); x.restore(); } });
  window.addEventListener("resize", function () { var c = canvases[current]; if (c && !screen.hidden) fit(c); });

  return { open: open, close: close, BLESS: BLESS };
})();
