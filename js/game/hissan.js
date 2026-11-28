// 筆算パッド（2026-11-27 保護者の希望）：知恵の試練・書庫の問題を解くときに、画面で筆算する道具。
// 手で書くのではなく、数字のボタンで入れる。計算の種類ごとに「箱」（わる数・わられる数・商・ひく数・のこり など）があり、
// 1つの箱に好きなけた数の数を入れて「つぎへ」で次の箱へ進む。けたの縦は自動でそろう（2026-11-28 保護者の案）。
// 答えの行（たし算・ひき算の答え、かけ算のとちゅうの行と答え）は、筆算と同じように右から入る。◀ ▶ は入れる場所（わく）を動かす。
// くり上がり・くり下がり（2026-11-28 保護者の案）：どの数字も、わくを合わせて（またはタップして）
//   「くり上がり」を押すと右上に小さい数（線は引かない。かけ算のとちゅうの行でも使える）、
//   「✕ なおす」を押すと、ななめの線が引かれて右上に小さい数（ひき算のくり下がりなど）を入れられる。
// 答え合わせはしない（自分で計算するための紙のかわり。答えを出す電卓にはしない）。記録も送らない。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Hissan = (function () {
  var OPS = [
    { key: "add", sign: "＋", name: "たし算" },
    { key: "sub", sign: "－", name: "ひき算" },
    { key: "mul", sign: "×", name: "かけ算" },
    { key: "div", sign: "÷", name: "わり算" }
  ];
  var MAXLEN = 9;   // 1つの箱に入れられるけた数

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // 状態。v[箱]＝{ d: 数字の列（左から。" " は空き）, dot: 小数点の左にある数字の数（-1 はなし） }
  // pos[箱]＝入れる場所。右から入る箱は右から数えて何番目、左から入る箱は左から数えて何番目
  var st = null, side = "right", panel = null, openers = [];   // はじめは右（左の問いが見えるように）
  // mk[箱][列]＝右上の小さい数（ななめの線つき）、ca[箱][列]＝右上の小さい数（くり上がり。線なし）、mark＝いま小さい数を入れている所 { t: "mk"|"ca", key, col }
  function fresh(op) { st = { op: op || (st ? st.op : "add"), v: {}, pos: {}, cur: "", steps: 1, mk: {}, ca: {}, mark: null }; st.cur = order()[0]; }
  function val(k) { if (!st.v[k]) st.v[k] = { d: [], dot: -1 }; return st.v[k]; }
  function digitsStr(k) { return val(k).d.join("").replace(/ /g, "0"); }

  // ---------- 箱 ----------
  function partCount() {   // かけ算のとちゅうの行の数（かける数のけた数。0.3 のような先頭の0は数えない。1けたならなし）
    var d = digitsStr("b").replace(/^0+/, "");
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
  function rtl(k) {        // 右から入る箱
    if (st.op === "div") return false;
    return k === "ans" || k.charAt(0) === "p";
  }
  function label(k) {
    var L = {
      add: { a: "たされる数", b: "たす数", ans: "答え" },
      sub: { a: "ひかれる数", b: "ひく数", ans: "答え" },
      mul: { a: "かけられる数", b: "かける数", ans: "答え" },
      div: { d: "わる数", n: "わられる数", q: "商", r: "あまり" }
    }[st.op];
    if (L[k]) return L[k];
    if (k.charAt(0) === "p") return "とちゅう" + k.slice(1);
    if (k.charAt(0) === "s") return "ひく数";
    if (k.charAt(0) === "t") return "のこり";
    return k;
  }

  // ---------- 数をマスにならべる ----------
  function frac(k) { var v = val(k); return v.dot >= 0 ? Math.max(0, v.d.length - v.dot) : 0; }
  // 最後の数字が列 end に来るようにならべる。行：{ key, cells: { 列: { ch, dot } }, start, end, n }
  function placeEnd(k, end) {
    var v = val(k), cells = {}, n = v.d.length, start = end - n + 1;
    for (var i = 0; i < n; i++) cells[start + i] = { ch: v.d[i] === " " ? "" : v.d[i], dot: v.dot >= 1 && i === v.dot - 1 };
    if (v.dot === 0 && n) cells[start - 1] = { ch: "0", dot: true, ghost: true };   // 「.5」のように始めたとき
    return { key: k, cells: cells, start: start, end: end, n: n };
  }
  function placeStart(k, start) { return placeEnd(k, start + Math.max(val(k).d.length, 1) - 1); }

  function layout() {
    var o = st.op, rows = [], i, r;
    function add(row) { rows.push(row); return row; }
    if (o === "add" || o === "sub") {
      // 上の2つは小数点の位置でそろえる（一の位を列0に）。答えは右はしを上の2つの右はしに合わせ、右から入る
      add(placeEnd("a", frac("a")));
      r = add(placeEnd("b", frac("b"))); r.sign = o === "add" ? "＋" : "－"; r.line = true;
      add(placeEnd("ans", Math.max(frac("a"), frac("b"))));
    } else if (o === "mul") {
      // 右はしでそろえる（小数点は数えない）。とちゅうの行は1つずつ左へ
      add(placeEnd("a", 0)); r = add(placeEnd("b", 0)); r.sign = "×"; r.line = true;
      var pc = partCount();
      for (i = 1; i <= pc; i++) { r = add(placeEnd("p" + i, -(i - 1))); if (i === pc) { r.line = true; r.sign = "＋"; } }
      add(placeEnd("ans", 0));
    } else {
      // わり算：わられる数を列0から右へ。わる数はその左（列-1 はかっこ）
      var nd = val("n").d, last = Math.max(nd.length - 1, 0);
      // 商のはじめの数字は、わる数以上になるところの上（商を0から書いたら、わられる数の左はしから）
      var qs = 0, dv = parseInt(digitsStr("d").replace(/^0+/, "") || "0", 10), qd = val("q").d;
      if (qd[0] !== "0" && dv > 0) {
        qs = last;
        for (i = 0; i < nd.length; i++) if (parseInt(digitsStr("n").slice(0, i + 1), 10) >= dv) { qs = i; break; }
      }
      var q = add(placeStart("q", qs));
      var nr = add(placeEnd("n", last)); nr.top = true;
      var dp = placeEnd("d", -2); nr.divisor = dp.cells; nr.dstart = dp.start;
      // i番目の「ひく数」は商のi番目の0でない数字の下、「のこり」は次の0でない数字の下でそろえる
      var nz = [], qLast = q.n ? q.end : last;
      for (i = 0; i < qd.length; i++) if (qd[i] !== "0" && qd[i] !== " ") nz.push(q.start + i);
      for (i = 1; i <= st.steps; i++) {
        var se = nz[i - 1] != null ? nz[i - 1] : (i === 1 ? Math.min(qs, last) : qLast);
        var te = nz[i] != null ? nz[i] : qLast;
        r = add(placeEnd("s" + i, se)); r.line = true;
        add(placeEnd("t" + i, te));
      }
      r = add(placeStart("r", 0)); r.free = true;   // あまりは下に別に書く
    }
    rows.forEach(function (row) {   // 入れる場所（わく）の列
      var p = st.pos[row.key] || 0;
      row.caret = rtl(row.key) ? row.end - p : row.start + p;
      if (!row.n && !rtl(row.key)) row.caret = row.start + p;
    });
    return rows;
  }

  // ---------- 入れる ----------
  function trim(k) {   // はしの空きを消す
    var v = val(k);
    if (rtl(k)) { while (v.d.length && v.d[0] === " ") { v.d.shift(); if (v.dot > 0) v.dot--; } }
    else { while (v.d.length && v.d[v.d.length - 1] === " ") v.d.pop(); }
    if (v.dot > v.d.length) v.dot = -1;
  }
  function typeDigit(k, ch) {
    var v = val(k), p = st.pos[k] || 0, n = v.d.length;
    if (rtl(k)) {
      if (p >= n) { if (n >= MAXLEN) return; while (v.d.length < p) { v.d.unshift(" "); if (v.dot >= 0) v.dot++; } v.d.unshift(ch); if (v.dot >= 0) v.dot++; }
      else v.d[n - 1 - p] = ch;
    } else {
      if (p >= n) { if (n >= MAXLEN) return; while (v.d.length < p) v.d.push(" "); v.d.push(ch); }
      else v.d[p] = ch;
    }
    st.pos[k] = p + 1;   // 次のマスへ（右から入る箱は左へ、左から入る箱は右へ）
  }
  // ⌫：わくの所の数字を消して、あいた所を詰める（2026-11-28 保護者の希望）。わくが数字のないところ（入れた数のとなり）なら、1つ前の数字を消す。
  // 1つの数字だけ直したいときは、わくをそこに合わせて新しい数字を押せば書きかわる（消さなくてよい）
  function backspace(k) {
    var v = val(k), p = st.pos[k] || 0, n = v.d.length;
    if (p >= n) { if (p <= 0) return; p = n - 1; }
    var i = rtl(k) ? n - 1 - p : p;
    if (i < 0 || i >= n) return;
    v.d.splice(i, 1);
    if (v.dot > i) v.dot--;
    if (v.dot > v.d.length) v.dot = -1;
    st.pos[k] = Math.min(p, v.d.length);
    trim(k);
  }
  function moveCaret(k, dir) {   // dir：-1 左・+1 右
    var v = val(k), p = st.pos[k] || 0, n = v.d.length;
    p += rtl(k) ? -dir : dir;
    st.pos[k] = Math.max(0, Math.min(p, Math.min(n + 1, MAXLEN)));
  }
  function toggleDot(k) {   // わくの左に小数点（右から入る箱）／わくの左に小数点（左から入る箱は、いま入れた数字の右）
    var v = val(k), p = st.pos[k] || 0, at = rtl(k) ? v.d.length - p : p;
    if (at < 0 || at > v.d.length) return;
    v.dot = v.dot === at ? -1 : at;
  }
  // ---------- くり上がり・なおす ----------
  var lastRows = [];
  function rowOf(key) { for (var i = 0; i < lastRows.length; i++) if (lastRows[i].key === key) return lastRows[i]; return null; }
  function tapCell(key, col) {   // マスをタップ：くり上がりのマスならそこに入れる。数の行なら、わくをそこへ
    st.mark = null; st.cur = key;
    var r = rowOf(key); if (!r) return;
    var n = val(key).d.length, p = rtl(key) ? r.end - col : col - r.start;
    st.pos[key] = Math.max(0, Math.min(p, n));
  }
  // t："mk"＝わくの数字に、ななめの線と右上の小さい数／"ca"＝右上にくり上がりの小さい数（線なし）。もう一度押すと消す
  function markAt(key, t) {
    var r = rowOf(key); if (!r) return;
    var col = r.caret, x = r.cells[col];
    if (t === "mk" && (!x || !x.ch || x.ghost)) return;   // 線を引くのは数字だけ
    if (r.free) return;
    if (!st[t][key]) st[t][key] = {};
    if (st[t][key][col] != null) { delete st[t][key][col]; return; }
    st[t][key][col] = "";
    st.mark = { t: t, key: key, col: col };
  }
  function typeMark(k) {   // 小さい数を入れる（2けたまで。10・12 など）
    var m = st.mark, o = st[m.t][m.key] || {}, cur = o[m.col] || "";
    if (o[m.col] == null) return;
    if (k === "back") cur = cur.slice(0, -1); else cur = cur.length >= 2 ? k : cur + k;
    o[m.col] = cur;
  }
  function act(k) {
    if (k === "close") { close(); return; }
    if (k === "side") { side = side === "left" ? "right" : "left"; render(); return; }
    if (k.indexOf("op:") === 0) { fresh(k.slice(3)); render(); return; }
    if (k === "new") { fresh(st.op); render(); return; }
    if (k.indexOf("box:") === 0) { st.cur = k.slice(4); st.mark = null; render(); return; }
    if (k.indexOf("cell:") === 0) { tapCell(k.split(":")[1], +k.split(":")[2]); render(); return; }
    var key = st.cur;
    if (st.mark && (/^\d$/.test(k) || k === "back")) { typeMark(k); render(); return; }
    st.mark = null;
    if (k === "fix" || k === "carry") { markAt(key, k === "fix" ? "mk" : "ca"); render(); return; }
    if (k === "next") {
      var o = order(), i = o.indexOf(key);
      if (st.op === "div" && key === "t" + st.steps) { st.steps++; o = order(); }   // わり算は「のこり」のあとに次の組をふやす
      if (i >= 0 && i + 1 < o.length) st.cur = o[i + 1];
    } else if (k === "left" || k === "right") moveCaret(key, k === "left" ? -1 : 1);
    else if (k === "clear") { st.v[key] = { d: [], dot: -1 }; st.pos[key] = 0; st.mk[key] = {}; st.ca[key] = {}; }
    else if (k === "back") backspace(key);
    else if (k === "dot") toggleDot(key);
    else if (/^\d$/.test(k)) typeDigit(key, k);
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
    lastRows = rows;
    rows.forEach(function (r) {
      if (r.free) return;
      for (var c in r.cells) { c = +c; if (c < lo) lo = c; if (c > hi) hi = c; }
      if (r.end > hi) hi = r.end; if (r.start < lo) lo = r.start;
      if (r.key === st.cur) { if (r.caret < lo) lo = r.caret; if (r.caret > hi) hi = r.caret; }
      if (r.dstart != null && r.dstart < lo) lo = r.dstart;
    });
    var signCol = st.op === "div" ? null : lo - 1;
    if (signCol != null) lo = signCol;
    var box = el("div", "hs-sheet hs-" + st.op);
    rows.forEach(function (r) {
      var cur = r.key === st.cur;
      var mks = st.mk[r.key] || {}, cas = st.ca[r.key] || {}, hasMk = false;
      for (var mm in mks) hasMk = true;
      for (mm in cas) hasMk = true;
      var line = el("div", "hs-row" + (cur ? " cur" : "") + (r.free ? " free" : "") + (hasMk ? " mk" : ""));
      line.setAttribute("data-k", "box:" + r.key);
      line.appendChild(el("span", "hs-lab", label(r.key)));
      var cellsBox = el("span", "hs-cells");
      if (r.free) {   // あまり：左から
        var v = val(r.key), p = st.pos[r.key] || 0;
        for (i = 0; i < Math.max(v.d.length, p + 1, 1); i++) {
          var fc = cellEl(v.d[i] && v.d[i] !== " " ? v.d[i] : "", v.dot >= 1 && i === v.dot - 1, cur);
          if (cur && i === p) fc.className += " caret";
          cellsBox.appendChild(fc);
        }
      } else {
        for (var c = lo; c <= hi; c++) {
          var x = r.cells[c], d;
          if (r.sign && c === signCol) { d = cellEl(r.sign, false, false); d.className += " sign"; }
          else if (r.divisor && c === -1) { d = cellEl(")", false, false); d.className += " brk"; }
          else if (r.divisor && r.divisor[c]) d = cellEl(r.divisor[c].ch, r.divisor[c].dot, false);
          else {
            d = cellEl(x ? x.ch : "", x && x.dot, cur);
            if (x && x.ghost) d.className += " ghost";
            if (cur && c === r.caret && !st.mark) d.className += " caret";
            d.setAttribute("data-k", "cell:" + r.key + ":" + c);
            if (mks[c] != null) {
              d.className += " x";
              var sm = el("span", "hs-sm", mks[c]);
              if (st.mark && st.mark.t === "mk" && st.mark.key === r.key && st.mark.col === c) sm.className += " mking";
              d.appendChild(sm);
            }
            if (cas[c] != null) {
              var sc = el("span", "hs-sm ca" + (mks[c] != null ? " left" : ""), cas[c]);   // 「なおす」の数と重なるときは左上
              if (st.mark && st.mark.t === "ca" && st.mark.key === r.key && st.mark.col === c) sc.className += " mking";
              d.appendChild(sc);
            }
            var inSpan = r.n && c >= r.start && c <= r.end;
            if (r.line && (st.op === "div" ? inSpan : true)) d.className += " line";
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
  function cellEl(ch, dot, on) { return el("span", "hs-cell" + (dot ? " dot" : "") + (on && ch ? " on" : ""), ch); }
  function keypad() {
    var kp = el("div", "hs-keys");
    ["1", "2", "3", "4", "5", "back", "6", "7", "8", "9", "0", "dot"].forEach(function (k) {
      kp.appendChild(btn(k === "back" ? "⌫" : k === "dot" ? "." : k, k, k === "back" ? "hs-back" : ""));
    });
    kp.appendChild(btn("◀", "left", "hs-shift"));
    kp.appendChild(btn("▶", "right", "hs-shift"));
    kp.appendChild(btn("くり上がり", "carry", "hs-fix hs-ca"));
    kp.appendChild(btn("✕ なおす", "fix", "hs-fix"));
    kp.appendChild(btn("消す", "clear", "hs-clear"));
    kp.appendChild(btn("つぎへ ↵", "next", "hs-next"));
    var now = el("p", "hs-now", st.mark ? (st.mark.t === "ca" ? "右上にくり上がりの数を入れる" : "右上に小さい数を入れる（10 などの2けたも）") :
      "いま：" + label(st.cur) + (rtl(st.cur) ? "（右から入る）" : "") + "　◀ ▶ でわくを動かせる");
    var wrap = el("div", "hs-kwrap"); wrap.appendChild(now); wrap.appendChild(kp);
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
