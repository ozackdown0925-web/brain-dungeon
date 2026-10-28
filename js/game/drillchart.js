// 保護者画面の「知恵の試練の正解率」（2026-10-29）：子どもの記録から、日ごと・教科ごとの正解率を折れ線グラフと表で出す。
// 数え方は「問題ごと」（小問が1つでもまちがえると ×）と「小問ごと」を切りかえる。期間は直近2週間（1か月・全部にも切りかえ）。
// 記録は GAS の childHistory（子ども・保護者どちらの鍵でも子どもの記録）。保護者の記録は入れない。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var DrillChart = (function () {
  var SUBJECTS = [
    { id: "math", name: "算数", color: "#5aa9ff" },
    { id: "japanese", name: "国語", color: "#ef7b7b" },
    { id: "science", name: "理科", color: "#6fd08c" },
    { id: "social", name: "社会", color: "#f2a44e" }
  ];
  var TOTAL = { id: "all", name: "合計", color: "#ece7da" };
  var WEEK = ["日", "月", "火", "水", "木", "金", "土"];
  var PERIODS = [{ days: 14, name: "2週間" }, { days: 30, name: "1か月" }, { days: 0, name: "全部" }];
  var SVGNS = "http://www.w3.org/2000/svg";

  var state = { unit: "q", days: 14, hide: {} };
  var records = null, box = null, loading = false;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function sv(tag, attrs) {
    var e = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
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

  // 1つの記録を数える：問題ごと（1問で○か×）と、小問ごと（小問の数のうち正解の数）
  function countOf(r) {
    var parts = Array.isArray(r.parts) ? r.parts.filter(function (p) { return p && typeof p === "object"; }) : [];
    var pn = parts.length, pok = parts.filter(function (p) { return p.correct === true; }).length;
    if (!pn) { pn = 1; pok = r.correct ? 1 : 0; }
    return { qn: 1, qok: r.correct ? 1 : 0, pn: pn, pok: pok };
  }

  // 記録 → { days: [日付…], cell: { 日付: { 教科: {qn,qok,pn,pok} } } }（期間の中だけ。日付は古い順）
  function summarize(list, days, todayStr) {
    var cell = {}, first = "";
    list.forEach(function (r) {
      var d = normDate(r.date);
      if (!d || !r.subject || !r.qid) return;
      if (!first || d < first) first = d;
      var c = countOf(r), byS = cell[d] || (cell[d] = {});
      [r.subject, "all"].forEach(function (s) {
        var x = byS[s] || (byS[s] = { qn: 0, qok: 0, pn: 0, pok: 0 });
        x.qn += c.qn; x.qok += c.qok; x.pn += c.pn; x.pok += c.pok;
      });
    });
    var end = parseDay(todayStr), start;
    if (days) { start = new Date(end.getTime()); start.setDate(start.getDate() - (days - 1)); }
    else start = first ? parseDay(first) : new Date(end.getTime());
    var out = [];
    for (var d = new Date(start.getTime()); d <= end; d.setDate(d.getDate() + 1)) out.push(ymd(d));
    return { days: out, cell: cell };
  }
  function pick(x, unit) {
    if (!x) return null;
    return unit === "q" ? { n: x.qn, ok: x.qok } : { n: x.pn, ok: x.pok };
  }
  function rate(v) { return v && v.n ? Math.round(v.ok / v.n * 100) : null; }
  function sumOver(s, sumDays, sub, unit) {
    var t = { n: 0, ok: 0 };
    sumDays.forEach(function (d) { var v = pick(s.cell[d] && s.cell[d][sub], unit); if (v) { t.n += v.n; t.ok += v.ok; } });
    return t;
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
    var todayStr = GameState.todayStr();
    var s = summarize(records, state.days, todayStr);
    var played = s.days.filter(function (d) { return s.cell[d]; });

    // 切りかえ
    var bar = el("div", "dc-bar");
    bar.appendChild(toggleGroup([{ v: "q", name: "問題ごと" }, { v: "p", name: "小問ごと" }], state.unit, function (v) { state.unit = v; render(); }));
    bar.appendChild(toggleGroup(PERIODS.map(function (p) { return { v: p.days, name: p.name }; }), state.days, function (v) { state.days = v; render(); }));
    var re = el("button", "btn small-btn", "読みこみ直す"); re.type = "button";
    re.onclick = function () { records = null; render(); };
    bar.appendChild(re);
    box.appendChild(bar);
    box.appendChild(el("p", "note", state.unit === "q"
      ? "問題ごと：小問が1つでもまちがえると、その問題は×。1日に1教科2〜4問なので、日によって大きくゆれる。"
      : "小問ごと：小問の数のうち、正解した数。部分的にできたことも分かる。"));

    if (!played.length) { box.appendChild(el("p", "note", "この期間の記録はない")); return; }

    // 期間の合計
    var sum = el("div", "dc-sum");
    SUBJECTS.concat([TOTAL]).forEach(function (sub) {
      var t = sumOver(s, played, sub.id, state.unit), r = rate(t);
      var c = el("div", "dc-sum-c");
      var nm = el("span", "dc-sum-n", sub.name); nm.style.color = sub.color;
      c.appendChild(nm);
      c.appendChild(el("b", "", r === null ? "－" : r + "%"));
      c.appendChild(el("span", "dc-sum-x", t.ok + " / " + t.n));
      sum.appendChild(c);
    });
    box.appendChild(sum);

    // 線を出す・かくす
    var lg = el("div", "dc-legend");
    SUBJECTS.concat([TOTAL]).forEach(function (sub) {
      var b = el("button", "dc-lg" + (state.hide[sub.id] ? " off" : ""), sub.name); b.type = "button";
      var dot = el("i", ""); dot.style.background = sub.color; b.insertBefore(dot, b.firstChild);
      b.onclick = function () { state.hide[sub.id] = !state.hide[sub.id]; render(); };
      lg.appendChild(b);
    });
    box.appendChild(lg);

    box.appendChild(chart(s));
    box.appendChild(table(s, played));
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

  // 折れ線グラフ（SVG）。記録のない日は点を打たず、前後の点を点線でつなぐ
  function chart(s) {
    var n = s.days.length, W = 640, H = 260, L = 38, R = 22, T = 12, B = 34;
    var cw = W - L - R, ch = H - T - B;
    function x(i) { return L + (n <= 1 ? cw / 2 : cw * i / (n - 1)); }
    function y(v) { return T + ch * (1 - v / 100); }
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, "class": "dc-svg", role: "img", "aria-label": "日ごと・教科ごとの正解率" });
    [0, 25, 50, 75, 100].forEach(function (v) {
      svg.appendChild(sv("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), "class": v === 50 ? "dc-grid mid" : "dc-grid" }));
      var t = sv("text", { x: L - 6, y: y(v) + 4, "class": "dc-ax", "text-anchor": "end" }); t.textContent = v + "%"; svg.appendChild(t);
    });
    var every = n <= 16 ? 1 : n <= 35 ? 3 : Math.ceil(n / 12);
    s.days.forEach(function (d, i) {
      var wd = parseDay(d).getDay();
      if (i % every && i !== n - 1) return;
      var t = sv("text", { x: x(i), y: H - B + 16, "class": "dc-ax" + (wd === 0 || wd === 6 ? " we" : ""), "text-anchor": "middle" });
      t.textContent = dayLabel(d); svg.appendChild(t);
      if (n <= 16) { var w = sv("text", { x: x(i), y: H - B + 30, "class": "dc-ax sm" + (wd === 0 || wd === 6 ? " we" : ""), "text-anchor": "middle" }); w.textContent = WEEK[wd]; svg.appendChild(w); }
    });
    SUBJECTS.concat([TOTAL]).forEach(function (sub) {
      if (state.hide[sub.id]) return;
      var pts = [];
      s.days.forEach(function (d, i) { var r = rate(pick(s.cell[d] && s.cell[d][sub.id], state.unit)); if (r !== null) pts.push([x(i), y(r), i]); });
      var wide = sub.id === "all" ? 3.5 : 2.5;
      for (var k = 1; k < pts.length; k++) {
        var gap = pts[k][2] - pts[k - 1][2] > 1;
        svg.appendChild(sv("line", { x1: pts[k - 1][0], y1: pts[k - 1][1], x2: pts[k][0], y2: pts[k][1], stroke: sub.color, "stroke-width": wide, "stroke-linecap": "round", "stroke-dasharray": gap ? "4 5" : "none", opacity: gap ? 0.6 : 1 }));
      }
      pts.forEach(function (p) { svg.appendChild(sv("circle", { cx: p[0], cy: p[1], r: sub.id === "all" ? 4.5 : 3.5, fill: sub.color, stroke: "#0b0d13", "stroke-width": 1.5 })); });
    });
    var wrap = el("div", "dc-chart");
    wrap.appendChild(svg);
    return wrap;
  }

  // 表：新しい日が上。教科ごとに「正解 / 数（％）」
  function table(s, played) {
    var wrap = el("div", "dc-table-w"), t = el("table", "dc-table");
    var hr = el("tr");
    hr.appendChild(el("th", "", "日"));
    SUBJECTS.concat([TOTAL]).forEach(function (sub) { hr.appendChild(el("th", "", sub.name)); });
    t.appendChild(hr);
    played.slice().reverse().forEach(function (d) {
      var tr = el("tr"), wd = parseDay(d).getDay();
      tr.appendChild(el("td", "dc-d" + (wd === 0 || wd === 6 ? " we" : ""), dayLabel(d) + "（" + WEEK[wd] + "）"));
      SUBJECTS.concat([TOTAL]).forEach(function (sub) {
        var v = pick(s.cell[d][sub.id], state.unit), r = rate(v);
        var td = el("td", r === null ? "dc-none" : r >= 80 ? "dc-hi" : r >= 50 ? "dc-mid" : "dc-lo");
        td.textContent = r === null ? "－" : v.ok + "/" + v.n + "（" + r + "%）";
        tr.appendChild(td);
      });
      t.appendChild(tr);
    });
    wrap.appendChild(t);
    return wrap;
  }

  function load() {
    loading = true;
    Sync.childHistory().then(function (list) {
      loading = false; records = list; render();
    }, function (err) {
      loading = false;
      if (!box) return;
      box.textContent = "";
      var msg = err.kind === "network" ? "インターネットにつながりませんでした"
        : err.kind === "old" ? "保護者の端末で見るには、GAS を新しくする必要があります（子どもの端末の保護者画面なら見られます）"
          : "読みこめませんでした（" + err.message + "）";
      box.appendChild(el("p", "note", msg));
      var re = el("button", "btn small-btn", "もう一度"); re.type = "button";
      re.onclick = function () { render(); };
      box.appendChild(re);
    });
  }

  // 保護者画面を開くたびに読みこみ直す
  function show(target) { records = null; render(target); }

  return { show: show, render: render, _summarize: summarize, _countOf: countOf };
})();
