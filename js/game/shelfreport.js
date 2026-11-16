// 保護者画面の「書庫の結果（子ども）」（2026-11-16 保護者の希望）：書庫の知識の棚・日本地図の棚の、子どもの答えのまとめ。
// ①日ごと：解いた数と正解率（教科別・地図は別の列）。②プリントごと：解いた数・正解率・覚えた／苦手の数（新しい回が上）。
// ③苦手な問題の一覧：今「苦手」（まちがえて、まだ覚えていない）問題の問題文と答え。④日本地図：47都道府県のうち覚えた数と、苦手な県。
// 記録は GAS の childShelfHistory（子ども・保護者どちらの鍵でも子どもの記録）。問題は shelfQuestions と chizu.js。
// 「苦手」「覚えた」の決め方は書庫と同じ（shelf.js の Shelf.states）。言葉の問題（recall）の○×は子どもが自分でつけたもの。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var ShelfReport = (function () {
  var SUBJECTS = [
    { id: "japanese", name: "国語", color: "#ef7b7b" },
    { id: "science", name: "理科", color: "#6fd08c" },
    { id: "social", name: "社会", color: "#f2a44e" },
    { id: "math", name: "算数", color: "#5aa9ff" }
  ];
  var MAPCOL = { id: "map", name: "地図", color: "#c9a4f2" };
  var TOTAL = { id: "all", name: "合計", color: "#ece7da" };
  var WEEK = ["日", "月", "火", "水", "木", "金", "土"];
  var PERIODS = [{ days: 14, name: "2週間" }, { days: 30, name: "1か月" }, { days: 0, name: "全部" }];
  var WEAK_PAGE = 30;

  var state = { days: 14, sub: "", sheetsAll: false, weakN: WEAK_PAGE };
  var records = null, questions = null, byId = {}, box = null, loading = false;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function pad(n) { return ("0" + n).slice(-2); }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseDay(s) { var p = String(s).split("-"); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }
  function dayLabel(s) { var d = parseDay(s); return (d.getMonth() + 1) + "/" + d.getDate(); }
  function normDate(s) {
    var m = String(s || "").match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    return m ? m[1] + "-" + pad(Number(m[2])) + "-" + pad(Number(m[3])) : "";
  }
  function subjectOf(id) { for (var i = 0; i < SUBJECTS.length; i++) if (SUBJECTS[i].id === id) return SUBJECTS[i]; return { id: id, name: id, color: "#ece7da" }; }
  function isMap(qid) { return window.Chizu ? Chizu.isMapId(qid) : String(qid || "").indexOf("map-") === 0; }
  function rate(ok, n) { return n ? Math.round(ok / n * 100) : null; }
  function rateCls(r) { return r === null ? "dc-none" : r >= 80 ? "dc-hi" : r >= 50 ? "dc-mid" : "dc-lo"; }
  function cellText(ok, n) { var r = rate(ok, n); return r === null ? "－" : ok + "/" + n + "（" + r + "%）"; }
  // プリント名（出典の最初の空白まで）と、「上第N回」「下第N回」から習った順の数（shelf.js と同じ）
  function sheetOf(q) { return String(q.source || "").split(" ")[0]; }
  function lessonRank(sheet) {
    var m = /(上|下)第?(\d+)回/.exec(String(sheet || "").replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }));
    if (!m) return -1;
    return (m[1] === "下" ? 1000 : 0) + Number(m[2]);
  }
  function valueText(v) {
    if (v == null || v === "") return "";
    if (Array.isArray(v)) return v.map(valueText).filter(Boolean).join("、");
    if (typeof v === "object") return "n" in v || "d" in v ? String(v.n || "") + "/" + String(v.d || "") : "";
    return String(v);
  }
  function weakKind(s) { return !!s && (s.kind === "weak" || s.kind === "retry"); }
  function goodKind(s) { return !!s && (s.kind === "mastered" || s.kind === "known"); }

  // ---------- まとめ（DOM を使わない。node でもためせる） ----------
  // 日ごと：{ days: [日付…（古い順）], cell: { 日付: { 教科 or "map" or "all": { n, ok } } } }
  function byDay(list, days, todayStr) {
    var cell = {}, first = "";
    list.forEach(function (r) {
      var d = normDate(r.date);
      if (!d || !r.qid) return;
      if (!first || d < first) first = d;
      var c = cell[d] || (cell[d] = {});
      [isMap(r.qid) ? "map" : r.subject, "all"].forEach(function (k) {
        var x = c[k] || (c[k] = { n: 0, ok: 0 });
        x.n++; if (r.correct) x.ok++;
      });
    });
    var end = parseDay(todayStr), start;
    if (days) { start = new Date(end.getTime()); start.setDate(start.getDate() - (days - 1)); }
    else start = first ? parseDay(first) : new Date(end.getTime());
    var out = [];
    for (var d = new Date(start.getTime()); d <= end; d.setDate(d.getDate() + 1)) out.push(ymd(d));
    return { days: out, cell: cell };
  }
  // プリントごと：[{ subject, sheet, rank, total, seen, n, ok, good（覚えた・知っている）, mastered, weak }]（新しい回が上）
  function bySheet(qs, list, st) {
    var map = {}, out = [];
    qs.forEach(function (q) {
      if (isMap(q.id)) return;
      var k = q.subject + "|" + sheetOf(q);
      var x = map[k];
      if (!x) { x = map[k] = { subject: q.subject, sheet: sheetOf(q) || "（プリント名なし）", rank: lessonRank(sheetOf(q)), total: 0, seen: 0, n: 0, ok: 0, good: 0, mastered: 0, weak: 0 }; out.push(x); }
      var s = st[q.id];
      x.total++;
      if (s) x.seen++;
      if (goodKind(s)) x.good++;
      if (s && s.kind === "mastered") x.mastered++;
      if (weakKind(s)) x.weak++;
    });
    list.forEach(function (r) {
      var q = byId[r.qid];
      if (!q || isMap(r.qid)) return;
      var x = map[q.subject + "|" + sheetOf(q)];
      if (!x) return;
      x.n++; if (r.correct) x.ok++;
    });
    var order = SUBJECTS.map(function (s) { return s.id; });
    out.sort(function (a, b) {
      return (b.rank - a.rank) || (order.indexOf(a.subject) - order.indexOf(b.subject)) || (a.sheet < b.sheet ? -1 : a.sheet > b.sheet ? 1 : 0);
    });
    return out;
  }
  // 苦手な問題：[{ q, s, wrong（まちがえた回数）, lastInput（最後にまちがえた答え） }]（最後に解いた日が新しい順）
  function weakList(qs, list, st) {
    var wrong = {}, lastIn = {};
    list.slice().sort(function (a, b) { return String(a.date) + String(a.answeredAt) < String(b.date) + String(b.answeredAt) ? -1 : 1; })
      .forEach(function (r) { if (!r.correct) { wrong[r.qid] = (wrong[r.qid] || 0) + 1; lastIn[r.qid] = r; } });
    var out = [];
    qs.forEach(function (q) {
      if (isMap(q.id)) return;
      var s = st[q.id];
      if (weakKind(s)) out.push({ q: q, s: s, wrong: wrong[q.id] || 0, last: lastIn[q.id] || null });
    });
    out.sort(function (a, b) { return a.s.last < b.s.last ? 1 : a.s.last > b.s.last ? -1 : (b.wrong - a.wrong) || (a.q.id < b.q.id ? -1 : 1); });
    return out;
  }
  // 日本地図：{ good（その県の問題が全部「知っている」以上）, mastered（全部「覚えた」）, seen（1問でも見た県）, weak: [県の行…] }
  function mapSummary(st) {
    var out = { good: 0, mastered: 0, seen: 0, weak: [] };
    if (!window.Chizu) return out;
    var MQ = Chizu.questions();
    Chizu.PREFS.forEach(function (x) {
      var mine = MQ.filter(function (q) { return q.group === "map-" + x[0] || q.tap === x[0] || q.tapCap === x[0]; });
      var ss = mine.map(function (q) { return st[q.id]; });
      if (ss.some(function (s) { return !!s; })) out.seen++;
      if (ss.every(goodKind)) out.good++;
      if (ss.every(function (s) { return s && s.kind === "mastered"; })) out.mastered++;
      var bad = [];
      mine.forEach(function (q, i) { if (weakKind(ss[i])) bad.push(q.tap ? "場所" : q.tapCap ? "県庁所在地の場所" : /-1$/.test(q.id) ? "名前" : "県庁所在地"); });
      if (bad.length) out.weak.push({ name: x[1], capital: x[2], what: bad });
    });
    return out;
  }

  // ---------- 画面 ----------
  function render(target) {
    box = target || box;
    if (!box) return;
    box.textContent = "";
    if (!records) {
      box.appendChild(el("p", "note", "読みこんでいます…"));
      if (!loading) load();
      return;
    }
    var st = window.Shelf ? Shelf.states(records) : {};
    var bar = el("div", "dc-bar");
    var re = el("button", "btn small-btn", "読みこみ直す"); re.type = "button";
    re.onclick = function () { records = null; render(); };
    bar.appendChild(re);
    box.appendChild(bar);
    box.appendChild(el("p", "note", "書庫の知識の棚（確認テスト・言語知識テストなど）と日本地図の棚の、子どもの答え。言葉で答える問題の○×は、子どもが答えを見て自分でつけたもの。"));
    if (!records.length) { box.appendChild(el("p", "note", "まだ書庫の記録はない")); return; }

    box.appendChild(el("h4", "sr-h", "日ごと"));
    box.appendChild(dayTable());
    box.appendChild(el("h4", "sr-h", "プリントごと"));
    box.appendChild(subjectBar());
    box.appendChild(sheetTable(st));
    box.appendChild(el("h4", "sr-h", "苦手な問題"));
    box.appendChild(weakBox(st));
    box.appendChild(el("h4", "sr-h", "日本地図（都道府県と県庁所在地）"));
    box.appendChild(mapBox(st));
  }
  function toggleGroup(items, cur, on) {
    var g = el("div", "dc-tg");
    items.forEach(function (it) {
      var b = el("button", "dc-tg-b" + (it.v === cur ? " on" : ""), it.name); b.type = "button";
      b.onclick = function () { on(it.v); };
      g.appendChild(b);
    });
    return g;
  }
  function subjectBar() {
    var bar = el("div", "dc-bar");
    bar.appendChild(toggleGroup([{ v: "", name: "全部" }].concat(SUBJECTS.slice(0, 3).map(function (s) { return { v: s.id, name: s.name }; })), state.sub,
      function (v) { state.sub = v; state.weakN = WEAK_PAGE; render(); }));
    bar.appendChild(el("span", "note", "（プリントごと・苦手な問題の教科）"));
    return bar;
  }

  function dayTable() {
    var wrap = el("div", "");
    var bar = el("div", "dc-bar");
    bar.appendChild(toggleGroup(PERIODS.map(function (p) { return { v: p.days, name: p.name }; }), state.days, function (v) { state.days = v; render(); }));
    wrap.appendChild(bar);
    var s = byDay(records, state.days, GameState.todayStr());
    var played = s.days.filter(function (d) { return s.cell[d]; });
    if (!played.length) { wrap.appendChild(el("p", "note", "この期間に書庫で解いた日はない")); return wrap; }
    var cols = SUBJECTS.filter(function (sub) { return played.some(function (d) { return s.cell[d][sub.id]; }); }).concat([MAPCOL, TOTAL]);
    // 期間の合計
    var sum = el("div", "dc-sum");
    cols.forEach(function (c) {
      var n = 0, ok = 0;
      played.forEach(function (d) { var x = s.cell[d][c.id]; if (x) { n += x.n; ok += x.ok; } });
      var r = rate(ok, n), b = el("div", "dc-sum-c");
      var nm = el("span", "dc-sum-n", c.name); nm.style.color = c.color;
      b.appendChild(nm);
      b.appendChild(el("b", "", r === null ? "－" : r + "%"));
      b.appendChild(el("span", "dc-sum-x", ok + " / " + n + " 問"));
      sum.appendChild(b);
    });
    sum.style.gridTemplateColumns = "repeat(" + cols.length + ", minmax(0, 1fr))";
    wrap.appendChild(sum);
    wrap.appendChild(el("p", "note", "解いた日：" + played.length + " 日 / " + s.days.length + " 日。1日のめやすは知識の棚30問・地図15問。"));
    var tw = el("div", "dc-table-w"), t = el("table", "dc-table");
    var hr = el("tr");
    hr.appendChild(el("th", "", "日"));
    cols.forEach(function (c) { hr.appendChild(el("th", "", c.name)); });
    t.appendChild(hr);
    // 解かなかった日も出す（飛ばした日がわかるように）。全部のときは解いた日だけ
    var showDays = state.days ? s.days.slice().reverse() : played.slice().reverse();
    showDays.forEach(function (d) {
      var tr = el("tr"), wd = parseDay(d).getDay();
      tr.appendChild(el("td", "dc-d" + (wd === 0 || wd === 6 ? " we" : ""), dayLabel(d) + "（" + WEEK[wd] + "）"));
      cols.forEach(function (c) {
        var x = s.cell[d] && s.cell[d][c.id];
        tr.appendChild(el("td", x ? rateCls(rate(x.ok, x.n)) : "dc-none", x ? cellText(x.ok, x.n) : (c.id === "all" ? "解いていない" : "－")));
      });
      t.appendChild(tr);
    });
    tw.appendChild(t); wrap.appendChild(tw);
    return wrap;
  }

  function sheetTable(st) {
    var wrap = el("div", "");
    var rows = bySheet(questions, records, st).filter(function (x) { return !state.sub || x.subject === state.sub; });
    var started = rows.filter(function (x) { return x.seen; });
    var show = state.sheetsAll ? rows : started;
    if (!show.length) { wrap.appendChild(el("p", "note", "まだ解いたプリントはない")); }
    else {
      var tw = el("div", "dc-table-w"), t = el("table", "dc-table");
      var hr = el("tr");
      ["プリント", "解いた", "正解率", "覚えた・知っている", "苦手"].forEach(function (h) { hr.appendChild(el("th", "", h)); });
      t.appendChild(hr);
      show.forEach(function (x) {
        var tr = el("tr"), sub = subjectOf(x.subject);
        var nm = el("td", "dc-d");
        var tag = el("b", "", sub.name + " "); tag.style.color = sub.color;
        nm.appendChild(tag); nm.appendChild(document.createTextNode(x.sheet));
        tr.appendChild(nm);
        tr.appendChild(el("td", x.seen < x.total ? "dc-mid" : "", x.seen + " / " + x.total));
        var r = rate(x.ok, x.n);
        tr.appendChild(el("td", rateCls(r), r === null ? "－" : r + "%"));
        tr.appendChild(el("td", "", x.good + (x.mastered ? "（覚えた " + x.mastered + "）" : "")));
        tr.appendChild(el("td", x.weak ? "dc-lo" : "dc-none", x.weak ? String(x.weak) : "0"));
        t.appendChild(tr);
      });
      tw.appendChild(t); wrap.appendChild(tw);
    }
    var left = rows.length - started.length;
    if (left || state.sheetsAll) {
      var b = el("button", "btn small-btn", state.sheetsAll ? "まだ解いていないプリントをかくす" : "まだ解いていないプリントも出す（" + left + "）"); b.type = "button";
      b.onclick = function () { state.sheetsAll = !state.sheetsAll; render(); };
      wrap.appendChild(b);
    }
    wrap.appendChild(el("p", "note", "正解率は、そのプリントの問題に答えた全部の回の正解の割合。「覚えた・知っている」ははじめて見て正解したか、苦手を正解し続けた問題。「苦手」はまちがえて、まだ覚えていない問題。"));
    return wrap;
  }

  function weakBox(st) {
    var wrap = el("div", "");
    var list = weakList(questions, records, st).filter(function (x) { return !state.sub || x.q.subject === state.sub; });
    if (!list.length) { wrap.appendChild(el("p", "note", "今、苦手な問題はない")); return wrap; }
    wrap.appendChild(el("p", "note", "全部で " + list.length + " 問（最後に解いた日が新しい順）。書庫では、まちがえた次の日にもう1回、そのあと3日後・1週間後・2週間後に出る。"));
    list.slice(0, state.weakN).forEach(function (x) { wrap.appendChild(card(x)); });
    if (list.length > state.weakN) {
      var b = el("button", "btn small-btn", "もっと見る（あと " + (list.length - state.weakN) + " 問）"); b.type = "button";
      b.onclick = function () { state.weakN += WEAK_PAGE; render(); };
      wrap.appendChild(b);
    }
    return wrap;
  }
  function card(x) {
    var q = x.q, sub = subjectOf(q.subject);
    var c = el("div", "dc-q");
    var h = el("div", "dc-q-h");
    var nm = el("b", "", sub.name); nm.style.color = sub.color;
    h.appendChild(nm);
    h.appendChild(el("span", "dc-q-unit", q.unit || ""));
    c.appendChild(h);
    c.appendChild(el("div", "dc-q-src", (q.source || "") + "　まちがえた回数 " + x.wrong + "　最後に解いた日 " + dayLabel(x.s.last) +
      (x.s.kind === "weak" && x.s.box ? "　そのあと正解 " + x.s.box + " 回" : "")));
    if (q.text) c.appendChild(el("p", "dc-q-text", q.text));
    var imgs = DrillCore.asList(q.images).filter(function (id) { return id && String(id).indexOf("map:") !== 0; });
    if (imgs.length) {
      var fb = el("button", "btn small-btn", "問題の図を見る（" + imgs.length + "枚）"); fb.type = "button";
      var fig = el("div", "dc-q-figs");
      fb.onclick = function () {
        fb.remove();
        imgs.forEach(function (id) {
          var ph = el("div", "note", "図を読みこみ中…"); fig.appendChild(ph);
          Sync.image(id).then(function (src) {
            if (!src) { ph.textContent = "図を読みこめませんでした"; return; }
            var im = document.createElement("img"); im.src = src; im.alt = "問題の図"; im.className = "dc-q-img";
            fig.replaceChild(im, ph);
          }, function () { ph.textContent = "図を読みこめませんでした"; });
        });
      };
      c.appendChild(fb); c.appendChild(fig);
    }
    var qparts = DrillCore.asList(q.parts);
    var lastParts = x.last && Array.isArray(x.last.parts) ? x.last.parts : [];
    var tw = el("div", "dc-table-w"), t = el("table", "dc-table dc-ans");
    var hr = el("tr");
    var lab = qparts.length > 1 || qparts.some(function (p) { return p && p.label; });
    (lab ? ["", "正しい答え", "まちがえたときの答え"] : ["正しい答え", "まちがえたときの答え"]).forEach(function (s) { hr.appendChild(el("th", "", s)); });
    t.appendChild(hr);
    qparts.forEach(function (p, i) {
      if (p && p.prompt) { var pr = el("tr", "dc-prompt"); var pt = el("td", "", p.prompt); pt.colSpan = lab ? 3 : 2; pr.appendChild(pt); t.appendChild(pr); }
      var tr = el("tr");
      if (lab) tr.appendChild(el("td", "dc-d", (p && p.label) || String(i + 1)));
      tr.appendChild(el("td", "", p ? DrillCore.answerText(p) : "－"));
      var lp = lastParts[i], given = "";
      if (lp && typeof lp === "object" && !lp.correct) given = valueText(lp.value);
      else if (!lastParts.length && qparts.length === 1 && x.last) given = String(x.last.input || "");
      var recall = p && p.type === "recall";
      tr.appendChild(el("td", given ? "dc-lo" : "dc-none", given || (recall ? "（思い出して自分で×）" : "－")));
      t.appendChild(tr);
    });
    tw.appendChild(t); c.appendChild(tw);
    if (q.explanation) {
      var ex = el("details", "dc-q-ex"); ex.appendChild(el("summary", "", "解説"));
      ex.appendChild(el("p", "", q.explanation)); c.appendChild(ex);
    }
    return c;
  }

  function mapBox(st) {
    var wrap = el("div", "");
    var m = mapSummary(st);
    var sum = el("div", "dc-sum");
    sum.style.gridTemplateColumns = "repeat(4, minmax(0, 1fr))";
    [["見た県", m.seen], ["覚えた・知っている", m.good], ["覚えた", m.mastered], ["苦手がある県", m.weak.length]].forEach(function (a) {
      var b = el("div", "dc-sum-c");
      b.appendChild(el("span", "dc-sum-n", a[0]));
      b.appendChild(el("b", "", String(a[1])));
      b.appendChild(el("span", "dc-sum-x", "/ 47"));
      sum.appendChild(b);
    });
    wrap.appendChild(sum);
    wrap.appendChild(el("p", "note", "1つの県に、名前・県庁所在地・地図の場所・県庁所在地の場所の問題がある。全部を「知っている」以上にすると「覚えた・知っている」に入る。"));
    if (m.weak.length) {
      var tw = el("div", "dc-table-w"), t = el("table", "dc-table dc-ans");
      var hr = el("tr");
      ["苦手な県", "県庁所在地", "まちがえている問題"].forEach(function (s) { hr.appendChild(el("th", "", s)); });
      t.appendChild(hr);
      m.weak.forEach(function (w) {
        var tr = el("tr");
        tr.appendChild(el("td", "", w.name));
        tr.appendChild(el("td", "", w.capital));
        tr.appendChild(el("td", "dc-lo", w.what.join("・")));
        t.appendChild(tr);
      });
      tw.appendChild(t); wrap.appendChild(tw);
    } else wrap.appendChild(el("p", "note", "今、苦手な県はない"));
    return wrap;
  }

  function load() {
    loading = true;
    Promise.all([Sync.childShelfHistory(), Sync.shelfQuestions()]).then(function (got) {
      loading = false;
      records = got[0].filter(function (r) { return r && r.qid && normDate(r.date); }).map(function (r) { r.date = normDate(r.date); return r; });
      questions = got[1].filter(function (q) { return q && q.id && q.enabled !== false; });
      if (window.Chizu) questions = questions.concat(Chizu.questions());
      byId = {}; questions.forEach(function (q) { byId[q.id] = q; });
      render();
    }, function (err) {
      loading = false;
      if (!box) return;
      box.textContent = "";
      var msg = err.kind === "network" ? "インターネットにつながりませんでした"
        : err.kind === "old" ? "書庫の結果を見るには、GAS を新しくする必要があります（clasp push のあと、デプロイを新しい版にする）"
          : "読みこめませんでした（" + err.message + "）";
      box.appendChild(el("p", "note", msg));
      var re = el("button", "btn small-btn", "もう一度"); re.type = "button";
      re.onclick = function () { render(); };
      box.appendChild(re);
    });
  }

  // 保護者画面を開くたびに読みこみ直す
  function show(target) { records = null; questions = null; state.weakN = WEAK_PAGE; render(target); }

  return { show: show, render: render, _byDay: byDay, _bySheet: bySheet, _weakList: weakList, _mapSummary: mapSummary, _setQuestions: function (qs) { questions = qs; byId = {}; qs.forEach(function (q) { byId[q.id] = q; }); } };
})();
