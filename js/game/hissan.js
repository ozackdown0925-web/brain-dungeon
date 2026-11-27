// 筆算パッド（2026-11-27 保護者の希望）：知恵の試練・書庫の問題を解くときに、画面で筆算する道具。
// 手で書くのではなく、数字のボタンで入れる。計算の種類ごとに「箱」（わる数・わられる数・商・ひく数・のこり など）があり、
// 1つの箱に好きなけた数の数を入れて「つぎへ」で次の箱へ進む。けたの縦は自動でそろう（ずれたら ◀ ▶ でずらせる）。
// 答え合わせはしない（自分で計算するための紙のかわり。答えを出す電卓にはしない）。記録も送らない。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Hissan = (function () {
  var OPS = [
    { key: "add", sign: "＋", name: "たし算" },
    { key: "sub", sign: "－", name: "ひき算" },
    { key: "mul", sign: "×", name: "かけ算" },
    { key: "div", sign: "÷", name: "わり算" }
  ];
  var MAXLEN = 9;   // 1つの箱に入れられる長さ（小数点もふくむ）

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // 状態。v：箱の中身（文字）、shift：◀ ▶ でずらした数、cur：いま入れている箱、steps：わり算の「ひく数・のこり」の組の数
  var st = null, side = "right", panel = null, openers = [];   // はじめは右（左の問いが見えるように）
  function fresh(op) { st = { op: op || (st ? st.op : "add"), v: {}, shift: {}, cur: "", steps: 1 }; st.cur = order()[0]; }

  // ---------- 箱 ----------
  function partCount() {   // かけ算の途中の行の数（かける数のけた数。0.3 のような先頭の0は数えない。1けたなら途中の行はなし）
    var d = (st.v.b || "").replace(".", "").replace(/^0+/, "");
    return d.length > 1 ? d.length : 0;
  }
  function order() {       // 「つぎへ」で進む順
    var o = st.op, i, list;
    if (o === "add" || o === "sub") return ["a", "b", "ans"];
    if (o === "mul") { list = ["a", "b"]; for (i = 1; i <= partCount(); i++) list.push("p" + i); list.push("ans"); return list; }
    list = ["d", "n", "q"];
    for (i = 1; i <= st.steps; i++) { list.push("s" + i); list.push("t" + i); }
    list.push("r");
    return list;
  }
  function label(k) {
    var o = st.op;
    var L = {
      add: { a: "たされる数", b: "たす数", ans: "答え" },
      sub: { a: "ひかれる数", b: "ひく数", ans: "答え" },
      mul: { a: "かけられる数", b: "かける数", ans: "答え" },
      div: { d: "わる数", n: "わられる数", q: "商", r: "あまり" }
    }[o];
    if (L[k]) return L[k];
    if (k.charAt(0) === "p") return "とちゅう" + k.slice(1);
    if (k.charAt(0) === "s") return "ひく数";
    if (k.charAt(0) === "t") return "のこり";
    return k;
  }

  // ---------- 数をマスにならべる ----------
  // 数の文字を、数字の列と「どの数字の右に小数点があるか」に分ける
  function parse(s) {
    s = s || "";
    var digs = [], dotAfter = -1;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === ".") dotAfter = digs.length - 1; else digs.push(c);
    }
    return { digs: digs, dotAfter: dotAfter, frac: s.indexOf(".") < 0 ? 0 : s.length - s.indexOf(".") - 1, hasDot: s.indexOf(".") >= 0 };
  }
  // 行：{ key, cells: { 列: { ch, dot } }, line（下に線をひく列の範囲）, top, sign, anchor（空のときの目じるしの列） }
  function placeEnd(s, end) {   // 最後の数字が列 end に来るようにならべる
    var p = parse(s), cells = {}, start = end - p.digs.length + 1;
    for (var i = 0; i < p.digs.length; i++) cells[start + i] = { ch: p.digs[i], dot: i === p.dotAfter && p.dotAfter >= 0 };
    if (p.hasDot && p.dotAfter < 0) cells[start - 1] = { ch: "0", dot: true, ghost: true };   // 「.5」のように始めたとき
    return { cells: cells, start: start, end: end, n: p.digs.length };
  }
  function placeStart(s, start) {   // 最初の数字が列 start に来るようにならべる（わり算の商）
    var p = parse(s);
    return placeEnd(s, start + Math.max(p.digs.length, 1) - 1);
  }
  function toInt(s) { var d = (s || "").replace(".", "").replace(/^0+/, ""); return d ? parseInt(d, 10) : 0; }

  function layout() {
    var o = st.op, v = st.v, rows = [], k, i, r, sh;
    function S(key) { return st.shift[key] || 0; }
    function mk(key, pl) { var row = { key: key, cells: pl.cells, start: pl.start, end: pl.end, n: pl.n }; rows.push(row); return row; }
    if (o === "add" || o === "sub") {
      // 小数点の位置でそろえる（一の位を列0に）
      ["a", "b", "ans"].forEach(function (key) { mk(key, placeEnd(v[key], parse(v[key]).frac + S(key))); });
      rows[1].sign = o === "add" ? "＋" : "－"; rows[1].line = true;
    } else if (o === "mul") {
      // 右はしでそろえる（小数点は数えない）。途中の行は1つずつ左へ
      mk("a", placeEnd(v.a, S("a"))); r = mk("b", placeEnd(v.b, S("b"))); r.sign = "×"; r.line = true;
      var pc = partCount();
      for (i = 1; i <= pc; i++) { r = mk("p" + i, placeEnd(v["p" + i], -(i - 1) + S("p" + i))); if (i === pc) { r.line = true; r.sign = "＋"; } }
      mk("ans", placeEnd(v.ans, S("ans")));
    } else {
      // わり算：わられる数を列0から右へ。わる数はその左（列-1 はかっこ）
      var n = parse(v.n), last = Math.max(n.digs.length - 1, 0);
      // 商のはじめの数字は、わる数以上になるところの上（商を0から書いたら、わられる数の左はしから）
      var qs = 0, dv = toInt(v.d);
      if (!/^0/.test(v.q || "") && dv > 0) {
        qs = last;
        for (i = 0; i < n.digs.length; i++) if (parseInt(n.digs.slice(0, i + 1).join(""), 10) >= dv) { qs = i; break; }
      }
      var q = mk("q", placeStart(v.q, qs + S("q")));
      var nr = mk("n", placeEnd(v.n, last + S("n"))); nr.top = true;
      var dp = placeEnd(v.d, -2); nr.divisor = dp.cells; nr.dstart = dp.start;
      // 商の数字のうち0でないものの列。i番目の「ひく数」はi番目の数字の下、「のこり」は次の数字の下でそろえる
      var qp = parse(v.q), nz = [], qLast = q.n ? q.end : last;
      for (i = 0; i < qp.digs.length; i++) if (qp.digs[i] !== "0") nz.push(q.start + i);
      for (i = 1; i <= st.steps; i++) {
        var se = nz[i - 1] != null ? nz[i - 1] : (i === 1 ? Math.min(qs, last) : qLast);
        var te = nz[i] != null ? nz[i] : qLast;
        r = mk("s" + i, placeEnd(v["s" + i], se + S("s" + i))); r.line = true;
        mk("t" + i, placeEnd(v["t" + i], te + S("t" + i)));
      }
      r = mk("r", placeStart(v.r, 0)); r.free = true;   // あまりは下に別に書く
    }
    return rows;
  }

  // ---------- 入れる ----------
  function act(k) {
    if (k === "close") { close(); return; }
    if (k === "side") { side = side === "left" ? "right" : "left"; render(); return; }
    if (k.indexOf("op:") === 0) { fresh(k.slice(3)); render(); return; }
    if (k === "new") { fresh(st.op); render(); return; }
    if (k.indexOf("box:") === 0) { st.cur = k.slice(4); render(); return; }
    var key = st.cur, s = st.v[key] || "";
    if (k === "next") {
      var o = order(), i = o.indexOf(key);
      if (st.op === "div" && key === "t" + st.steps) { st.steps++; o = order(); }   // わり算は「のこり」のあとに次の組をふやす
      if (i >= 0 && i + 1 < o.length) st.cur = o[i + 1];
      render(); return;
    }
    if (k === "left" || k === "right") { st.shift[key] = (st.shift[key] || 0) + (k === "left" ? -1 : 1); render(); return; }
    if (k === "clear") { st.v[key] = ""; st.shift[key] = 0; render(); return; }
    if (k === "back") s = s.slice(0, -1);
    else if (k === "dot") { if (s.indexOf(".") < 0 && s.length < MAXLEN) s = (s || "0") + "."; }
    else if (/^\d$/.test(k)) { if (s.length < MAXLEN) s += k; }
    st.v[key] = s;
    render();
  }

  // ---------- 画面 ----------
  function btn(text, k, cls) { var b = el("button", "hs-b" + (cls ? " " + cls : ""), text); b.type = "button"; b.setAttribute("data-k", k); return b; }
  function make() {
    panel = el("div", "hissan"); panel.id = "hissanPanel"; panel.hidden = true;
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "筆算");
    document.body.appendChild(panel);
    panel.addEventListener("click", function (e) {
      var t = e.target;
      while (t && t !== panel && !t.getAttribute("data-k")) t = t.parentNode;
      if (!t || t === panel) return;
      act(t.getAttribute("data-k"));
    });
    document.addEventListener("keydown", function (e) {   // PC で試すとき用
      if (!panel || panel.hidden) return;
      var tg = e.target && e.target.tagName;
      if ((tg === "INPUT" || tg === "TEXTAREA") && !e.target.readOnly) return;
      var map = { Backspace: "back", Delete: "clear", ".": "dot", Enter: "next", ArrowLeft: "left", ArrowRight: "right", Escape: "close" };
      var k = /^\d$/.test(e.key) ? e.key : map[e.key];
      if (!k) return;
      e.preventDefault(); e.stopPropagation();
      act(k);
    }, true);
  }

  function render() {
    if (!panel) return;
    panel.className = "hissan " + side;
    panel.textContent = "";
    var bar = el("div", "hs-bar");
    OPS.forEach(function (x) {
      var b = btn(x.sign, "op:" + x.key, "hs-op"); b.setAttribute("aria-label", x.name);
      b.setAttribute("aria-pressed", String(x.key === st.op)); bar.appendChild(b);
    });
    bar.appendChild(el("span", "hs-sep"));
    bar.appendChild(btn("あたらしく", "new"));
    var sd = btn(side === "left" ? "▶" : "◀", "side"); sd.setAttribute("aria-label", side === "left" ? "右へうごかす" : "左へうごかす");
    bar.appendChild(sd);
    bar.appendChild(btn("とじる", "close", "hs-close"));
    panel.appendChild(bar);

    var area = el("div", "hs-area");
    area.appendChild(sheet());
    panel.appendChild(area);
    panel.appendChild(keypad());
    var c = area.querySelector(".hs-row.cur");
    if (c && c.scrollIntoView) { try { c.scrollIntoView({ block: "nearest" }); } catch (e) { /* 古い Safari */ } }
  }

  function sheet() {
    var rows = layout(), lo = 0, hi = 0, i;
    rows.forEach(function (r) {
      if (r.free) return;
      for (var c in r.cells) { c = +c; if (c < lo) lo = c; if (c > hi) hi = c; }
      if (r.end > hi) hi = r.end; if (r.start < lo) lo = r.start;
      if (r.dstart != null && r.dstart < lo) lo = r.dstart;
    });
    var signCol = st.op === "div" ? null : lo - 1;
    if (signCol != null) lo = signCol;
    var box = el("div", "hs-sheet hs-" + st.op);
    rows.forEach(function (r) {
      var line = el("div", "hs-row" + (r.key === st.cur ? " cur" : "") + (r.free ? " free" : ""));
      line.setAttribute("data-k", "box:" + r.key);
      line.appendChild(el("span", "hs-lab", label(r.key)));
      var cellsBox = el("span", "hs-cells");
      if (r.free) {   // あまり：左から
        var p = parse(st.v[r.key]);
        for (i = 0; i < Math.max(p.digs.length, 1); i++) cellsBox.appendChild(cellEl(p.digs[i] || "", i === p.dotAfter, r, true));
      } else {
        for (var c = lo; c <= hi; c++) {
          var x = r.cells[c], ch = x ? x.ch : "", d;
          if (r.sign && c === signCol) { d = cellEl(r.sign, false, r, false); d.className += " sign"; }
          else if (r.divisor && c === -1) { d = cellEl(")", false, r, false); d.className += " brk"; }
          else if (r.divisor && r.divisor[c]) d = cellEl(r.divisor[c].ch, r.divisor[c].dot, r, false);
          else {
            d = cellEl(ch, x && x.dot, r, false);
            if (x && x.ghost) d.className += " ghost";
            var inSpan = c >= Math.min(r.start, r.end) && c <= r.end;
            if (r.key === st.cur && !r.n && c === r.end) d.className += " caret";
            if (r.line && (st.op === "div" ? (r.n ? inSpan : false) : true)) d.className += " line";
            if (r.top && c >= 0) d.className += " top";
          }
          cellsBox.appendChild(d);
        }
      }
      line.appendChild(cellsBox);
      box.appendChild(line);
    });
    return box;
  }
  function cellEl(ch, dot, r, free) {
    var d = el("span", "hs-cell" + (dot ? " dot" : ""), ch);
    if (r.key === st.cur && ch !== "" && !/^[＋－×)]$/.test(ch)) d.className += " on";
    return d;
  }
  function keypad() {
    var kp = el("div", "hs-keys");
    ["1", "2", "3", "4", "5", "back", "6", "7", "8", "9", "0", "dot"].forEach(function (k) {
      kp.appendChild(btn(k === "back" ? "⌫" : k === "dot" ? "." : k, k, k === "back" ? "hs-back" : ""));
    });
    kp.appendChild(btn("◀", "left", "hs-shift"));
    kp.appendChild(btn("▶", "right", "hs-shift"));
    kp.appendChild(btn("消す", "clear", "hs-clear"));
    var nx = btn("つぎへ ↵", "next", "hs-next"); kp.appendChild(nx);
    var cur = el("p", "hs-now", "いま：" + label(st.cur) + "　（◀ ▶ でずらせる）");
    var wrap = el("div", "hs-kwrap"); wrap.appendChild(cur); wrap.appendChild(kp);
    return wrap;
  }

  // ---------- ひらく・とじる ----------
  function open() {
    if (!panel) make();
    if (!st) fresh("add");
    panel.hidden = false;
    openers.forEach(function (b) { b.setAttribute("aria-pressed", "true"); });
    render();
  }
  function close() {
    if (panel) panel.hidden = true;
    openers.forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
  }
  function toggle() { if (panel && !panel.hidden) close(); else open(); }
  // 新しい試練・書庫をひらいたときに白紙にもどす
  function reset() { close(); st = null; }
  // 画面の「筆算」ボタンをつなぐ
  function attach(id) {
    var b = $(id); if (!b) return;
    openers.push(b);
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", toggle);
  }

  return { open: open, close: close, reset: reset, attach: attach };
})();
