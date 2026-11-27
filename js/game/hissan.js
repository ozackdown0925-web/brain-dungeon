// 筆算パッド（2026-11-27 保護者の希望）：知恵の試練・書庫の問題を解くときに、画面のマスに数字を入れて筆算する道具。
// 手で書くのではなく、たし算・ひき算・かけ算・わり算の形に合わせたマスに、数字のボタンで1つずつ入れていく。
// 答え合わせはしない（自分で計算するための紙のかわり。答えを出す電卓にはしない）。記録も送らない。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Hissan = (function () {
  var OPS = [
    { key: "add", sign: "＋", name: "たし算", a: "たされる数", b: "たす数" },
    { key: "sub", sign: "－", name: "ひき算", a: "ひかれる数", b: "ひく数" },
    { key: "mul", sign: "×", name: "かけ算", a: "かけられる数", b: "かける数" },
    { key: "div", sign: "÷", name: "わり算", a: "わられる数", b: "わる数" }
  ];
  var MAXLEN = 7;          // 入れられる数の長さ（小数点もふくむ）
  var MAX_B = { mul: 3, div: 3 };   // かける数・わる数は3けたまで
  var EXTRA_DIV = 2;       // わり算で、わられる数の右に足すマス（0をつけてわり進めるため）

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function opOf(k) { for (var i = 0; i < OPS.length; i++) if (OPS[i].key === k) return OPS[i]; return OPS[0]; }

  // 状態：setup（数を入れる）か grid（マスに入れる）
  var st = { phase: "setup", op: "add", a: "", b: "", field: "a", msg: "", rows: [], extra: null, sel: null, side: "left" };
  var panel = null, openers = [];

  // ---------- 数の形 ----------
  function clean(s) {   // 先頭のいらない0と、最後の小数点をとる
    if (s.charAt(s.length - 1) === ".") s = s.slice(0, -1);
    var i = s.indexOf("."), ip = i < 0 ? s : s.slice(0, i), fp = i < 0 ? "" : s.slice(i + 1);
    ip = ip.replace(/^0+/, ""); if (ip === "") ip = "0";
    return fp ? ip + "." + fp : ip;
  }
  function intLen(s) { var i = s.indexOf("."); return i < 0 ? s.length : i; }
  function fracLen(s) { var i = s.indexOf("."); return i < 0 ? 0 : s.length - i - 1; }
  function digits(s) { return s.replace(".", ""); }

  // ---------- マスの形を作る ----------
  // 行：{ cells: [マス], dir: "left"|"right"|"", small: 小さいマス（くり上がり・くり下がり） }
  // マス：{ k: "in"（入れる）|"fix"（問題の数）|"gap"（空き）|"op"（記号）|"brk"（わり算のかっこ）, v, dot（右下に小数点）, dotEdit（小数点をつけられる）, line（下に線）, top（上に線）, strike（線で消した）, can（線で消せる） }
  function cell(k, v) { return { k: k, v: v || "", dot: false, dotEdit: false, line: false, top: false, strike: false, can: false }; }
  function row(n, k, dir, small) { var r = { cells: [], dir: dir || "", small: !!small }; for (var i = 0; i < n; i++) r.cells.push(cell(k)); return r; }

  function buildAddSub(a, b, op) {
    var f = Math.max(fracLen(a), fracLen(b)), il = Math.max(intLen(a), intLen(b));
    var W = il + f + 1, cols = W + 1, dotCol = W - f;   // マス0は記号。小数点は dotCol のマスの右下
    function put(r, s) {
      var ip = s.slice(0, intLen(s)), fp = s.slice(intLen(s) + 1), j;
      for (j = 0; j < ip.length; j++) { r.cells[dotCol - ip.length + 1 + j] = cell("fix", ip.charAt(j)); }
      for (j = 0; j < f; j++) r.cells[dotCol + 1 + j] = j < fp.length ? cell("fix", fp.charAt(j)) : cell("in");   // 足りない小数のけたは0を書けるように
      if (fp.length) r.cells[dotCol].dot = true;
    }
    var carry = row(cols, "in", "", true); carry.cells[0] = cell("gap");
    var ra = row(cols, "gap"); put(ra, a);
    var rb = row(cols, "gap"); put(rb, b); rb.cells[0] = cell("op", op === "sub" ? "－" : "＋");
    for (var j = 0; j < cols; j++) rb.cells[j].line = true;
    if (op === "sub") ra.cells.forEach(function (c) { if (c.k === "fix") c.can = true; });
    var res = row(cols, "in", "left"); res.cells[0] = cell("gap");
    res.cells.forEach(function (c) { if (c.k === "in") c.dotEdit = true; });
    return [carry, ra, rb, res];
  }

  function buildMul(a, b) {
    var da = digits(a), db = digits(b);
    var nb = db.replace(/^0+/, "").length || 1;   // 0.3 なら、部分の積は1行
    var W = Math.max(da.length + db.length, da.length + 1), cols = W + 1;
    function put(r, d, fl) {
      for (var j = 0; j < d.length; j++) r.cells[cols - d.length + j] = cell("fix", d.charAt(j));
      if (fl) r.cells[cols - 1 - fl].dot = true;
    }
    var rows = [];
    var carry = row(cols, "in", "", true); carry.cells[0] = cell("gap"); rows.push(carry);
    var ra = row(cols, "gap"); put(ra, da, fracLen(a)); rows.push(ra);
    var rb = row(cols, "gap"); put(rb, db, fracLen(b)); rb.cells[0] = cell("op", "×");
    rb.cells.forEach(function (c) { c.line = true; }); rows.push(rb);
    if (nb > 1) {
      for (var i = 0; i < nb; i++) {
        var p = row(cols, "in", "left"); p.cells[0] = cell(i === nb - 1 ? "op" : "gap", i === nb - 1 ? "＋" : "");
        if (i === nb - 1) p.cells.forEach(function (c) { c.line = true; });
        rows.push(p);
      }
    }
    var res = row(cols, "in", "left"); res.cells[0] = cell("gap");
    res.cells.forEach(function (c) { if (c.k === "in") c.dotEdit = true; });
    rows.push(res);
    return rows;
  }

  function buildDiv(a, b) {
    var da = digits(a), lb = b.length, L = lb + 1, dl = da.length, cols = L + dl + EXTRA_DIV;
    var q = row(cols, "gap", "right");
    for (var j = L; j < cols; j++) { q.cells[j] = cell("in"); q.cells[j].dotEdit = true; }
    var d = row(cols, "gap", "right");
    for (j = 0; j < lb; j++) d.cells[j] = cell("fix", b.charAt(j));
    d.cells[lb] = cell("brk", ")");
    for (j = 0; j < dl; j++) d.cells[L + j] = cell("fix", da.charAt(j));
    for (j = L + dl; j < cols; j++) d.cells[j] = cell("in");    // わり進めるときの0
    for (j = L; j < cols; j++) d.cells[j].top = true;
    if (fracLen(a)) d.cells[L + dl - 1 - fracLen(a)].dot = true;
    var rows = [q, d];
    var steps = Math.max(1, dl - lb + 1);
    for (var s = 0; s < steps; s++) addDivStep(rows, cols, L);
    return rows;
  }
  function addDivStep(rows, cols, L) {
    var p = row(cols, "gap", "right"), r = row(cols, "gap", "right");
    for (var j = L; j < cols; j++) { p.cells[j] = cell("in"); p.cells[j].line = true; r.cells[j] = cell("in"); }
    rows.push(p); rows.push(r);
  }

  function build() {
    var a = st.a, b = st.b;
    if (st.op === "add" || st.op === "sub") st.rows = buildAddSub(a, b, st.op);
    else if (st.op === "mul") st.rows = buildMul(a, b);
    else st.rows = buildDiv(a, b);
    st.extra = st.op === "div" ? row(3, "in", "right") : null;   // あまり
    st.sel = firstSel();
  }
  function firstSel() {
    // たし算・ひき算・かけ算は答え（またはかけ算の1行目）の右はし、わり算は商の左はしから
    var rows = st.rows, r, c;
    if (st.op === "div") { for (c = 0; c < rows[0].cells.length; c++) if (rows[0].cells[c].k === "in") return { r: 0, c: c }; }
    for (r = 0; r < rows.length; r++) {
      if (rows[r].small || rows[r].dir !== "left") continue;
      for (c = rows[r].cells.length - 1; c >= 0; c--) if (rows[r].cells[c].k === "in") return { r: r, c: c };
    }
    return null;
  }

  // ---------- 数を入れる（setup） ----------
  function check() {
    var a = st.a, b = st.b, o = opOf(st.op);
    if (!a || !b || a === "." || b === ".") return "数を2つ入れてね。";
    a = clean(a); b = clean(b);
    if (st.op === "sub" && parseFloat(a) < parseFloat(b)) return o.a + "のほうが小さいよ。上と下を入れかえてね。";
    if (st.op === "mul" && digits(b).replace(/^0+/, "").length > MAX_B.mul) return "かける数は3けたまで。";
    if (st.op === "div") {
      if (b.indexOf(".") >= 0) return "わる数は整数で入れてね。";
      if (parseFloat(b) === 0) return "0ではわれないよ。";
      if (b.length > MAX_B.div) return "わる数は3けたまで。";
    }
    st.a = a; st.b = b;
    return "";
  }
  function typeSetup(k) {
    var f = st.field, s = st[f];
    if (k === "back") s = s.slice(0, -1);
    else if (k === "dot") { if (s.indexOf(".") < 0 && s.length < MAXLEN - 1) s = (s || "0") + "."; }
    else if (/^\d$/.test(k)) { if (s.length < MAXLEN) s = s === "0" ? k : s + k; }
    st[f] = s; st.msg = "";
    render();
  }

  // ---------- マスに入れる（grid） ----------
  function cellAt(p) {
    if (!p) return null;
    if (p.r === -1) return st.extra ? st.extra.cells[p.c] : null;
    var r = st.rows[p.r]; return r ? r.cells[p.c] : null;
  }
  function rowAt(r) { return r === -1 ? st.extra : st.rows[r]; }
  function step(p, dc) {   // 同じ行で、となりの入れられるマス
    var r = rowAt(p.r);
    for (var c = p.c + dc; c >= 0 && c < r.cells.length; c += dc) if (r.cells[c].k === "in") return { r: p.r, c: c };
    return null;
  }
  function vstep(p, dr) {  // 上か下の行で、同じ列の入れられるマス（なければいちばん近い列）
    if (p.r === -1) return dr < 0 ? lastRowNear(p.c) : null;
    for (var r = p.r + dr; r >= 0 && r < st.rows.length; r += dr) {
      var best = null, bd = 99, cs = st.rows[r].cells;
      for (var c = 0; c < cs.length; c++) if (cs[c].k === "in" && Math.abs(c - p.c) < bd) { bd = Math.abs(c - p.c); best = { r: r, c: c }; }
      if (best) return best;
    }
    if (dr > 0 && st.extra) return { r: -1, c: 0 };
    return null;
  }
  function lastRowNear(c) { return vstep({ r: st.rows.length, c: c + 99 }, -1) || null; }
  function typeGrid(k) {
    var p = st.sel, c = cellAt(p);
    if (k === "left" || k === "right") { var q = step(p || { r: 0, c: 0 }, k === "left" ? -1 : 1); if (q) st.sel = q; render(); return; }
    if (k === "up" || k === "down") { var v = p ? vstep(p, k === "up" ? -1 : 1) : null; if (v) st.sel = v; render(); return; }
    if (!c || c.k !== "in") return;
    var small = p.r >= 0 && st.rows[p.r].small, dir = rowAt(p.r).dir;
    if (k === "back") {
      if (c.v || c.dot) { c.v = ""; if (c.dotEdit) c.dot = false; }
      else { var bk = step(p, dir === "right" ? -1 : 1); if (bk) { st.sel = bk; cellAt(bk).v = ""; } }
    } else if (k === "dot") {
      if (c.dotEdit) c.dot = !c.dot;
    } else if (/^\d$/.test(k)) {
      if (small) c.v = c.v.length === 1 ? c.v + k : k;     // くり上がり・くり下がりのマスは2けた（10・12 など）まで
      else {
        c.v = k;
        var nx = dir ? step(p, dir === "left" ? -1 : 1) : null;
        if (nx) st.sel = nx;
      }
    }
    render();
  }
  function tapCell(r, c) {
    var x = r === -1 ? st.extra.cells[c] : st.rows[r].cells[c];
    if (x.k === "in") st.sel = { r: r, c: c };
    else if (x.can) x.strike = !x.strike;   // ひき算の上の数は、タップで線を引いて消せる（くり下がり）
    render();
  }
  function clearGrid() {
    st.rows.forEach(function (r) { r.cells.forEach(function (c) { if (c.k === "in") { c.v = ""; if (c.dotEdit) c.dot = false; } c.strike = false; }); });
    if (st.extra) st.extra.cells.forEach(function (c) { c.v = ""; });
    st.sel = firstSel();
    render();
  }

  // ---------- 画面 ----------
  function make() {
    panel = el("div", "hissan"); panel.id = "hissanPanel"; panel.hidden = true;
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "筆算");
    document.body.appendChild(panel);
    panel.addEventListener("click", function (e) {
      var t = e.target;
      while (t && t !== panel && !t.getAttribute("data-k") && !t.getAttribute("data-cell")) t = t.parentNode;
      if (!t || t === panel) return;
      var cl = t.getAttribute("data-cell");
      if (cl) { var rc = cl.split(","); tapCell(+rc[0], +rc[1]); return; }
      act(t.getAttribute("data-k"));
    });
    document.addEventListener("keydown", function (e) {   // PC で試すとき用
      if (!panel || panel.hidden) return;
      var tg = e.target && e.target.tagName;
      if ((tg === "INPUT" || tg === "TEXTAREA") && !e.target.readOnly) return;
      var map = { Backspace: "back", Delete: "back", ".": "dot", ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", Escape: "close" };
      var k = /^\d$/.test(e.key) ? e.key : map[e.key];
      if (!k) return;
      e.preventDefault(); e.stopPropagation();
      act(k);
    }, true);
  }
  function act(k) {
    if (k === "close") { close(); return; }
    if (k === "side") { st.side = st.side === "left" ? "right" : "left"; render(); return; }
    if (k.indexOf("op:") === 0) { st.op = k.slice(3); st.msg = ""; render(); return; }
    if (k === "fa" || k === "fb") { st.field = k.slice(1); render(); return; }
    if (k === "go") { var m = check(); if (m) { st.msg = m; render(); return; } build(); st.phase = "grid"; render(); return; }
    if (k === "new") { st.phase = "setup"; st.a = ""; st.b = ""; st.field = "a"; st.msg = ""; render(); return; }
    if (k === "clear") { clearGrid(); return; }
    if (k === "addrow") {
      var L = st.b.length + 1, cols = st.rows[0].cells.length; addDivStep(st.rows, cols, L); render();
      var g = panel.querySelector(".hs-area"); if (g) g.scrollTop = g.scrollHeight; return;
    }
    if (st.phase === "setup") typeSetup(k); else typeGrid(k);
  }
  function btn(text, k, cls) { var b = el("button", "hs-b" + (cls ? " " + cls : ""), text); b.type = "button"; b.setAttribute("data-k", k); return b; }

  function render() {
    if (!panel) return;
    panel.className = "hissan " + st.side;
    panel.textContent = "";
    var o = opOf(st.op);
    var bar = el("div", "hs-bar");
    if (st.phase === "grid") {
      bar.appendChild(el("span", "hs-expr", st.a + " " + o.sign + " " + st.b));
      bar.appendChild(btn("あたらしく", "new"));
      bar.appendChild(btn("消す", "clear"));
    } else bar.appendChild(el("b", "hs-title", "筆算"));
    var sep = el("span", "hs-sep"); bar.appendChild(sep);
    var sd = btn(st.side === "left" ? "▶" : "◀", "side"); sd.setAttribute("aria-label", st.side === "left" ? "右へうごかす" : "左へうごかす");
    bar.appendChild(sd);
    bar.appendChild(btn("とじる", "close", "hs-close"));
    panel.appendChild(bar);

    var area = el("div", "hs-area");
    if (st.phase === "setup") area.appendChild(setupView(o));
    else area.appendChild(gridView());
    panel.appendChild(area);
    panel.appendChild(keypad());
    if (st.phase === "grid") {
      var s = area.querySelector(".hs-cell.sel");
      if (s && s.scrollIntoView) { try { s.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) { /* 古い Safari */ } }
    }
  }
  function setupView(o) {
    var box = el("div", "hs-setup");
    var ops = el("div", "hs-ops");
    OPS.forEach(function (x) {
      var b = btn(x.sign + " " + x.name, "op:" + x.key, "hs-op");
      b.setAttribute("aria-pressed", String(x.key === st.op));
      ops.appendChild(b);
    });
    box.appendChild(ops);
    ["a", "b"].forEach(function (f) {
      var b = btn("", "f" + f, "hs-field");
      b.setAttribute("aria-pressed", String(st.field === f));
      b.appendChild(el("span", "hs-flabel", f === "a" ? o.a : o.b));
      b.appendChild(el("span", "hs-fval", st[f] || " "));
      box.appendChild(b);
    });
    box.appendChild(el("p", "hs-msg", st.msg || "問題の数を入れて「筆算にする」をおそう。"));
    box.appendChild(btn("筆算にする", "go", "hs-go"));
    return box;
  }
  function cellView(x, r, c, small) {
    var d = el("div", "hs-cell" + (small ? " small" : "") + " k-" + x.k);
    if (x.line) d.className += " line";
    if (x.top) d.className += " top";
    if (x.strike) d.className += " strike";
    if (x.can) d.className += " can";
    if (x.dot) d.className += " dot";
    if (st.sel && st.sel.r === r && st.sel.c === c) d.className += " sel";
    if (x.k === "in" || x.can) d.setAttribute("data-cell", r + "," + c);
    d.textContent = x.v;
    return d;
  }
  function gridView() {
    var g = el("div", "hs-grid hs-" + st.op);
    st.rows.forEach(function (rw, r) {
      var line = el("div", "hs-row" + (rw.small ? " small" : ""));
      rw.cells.forEach(function (x, c) { line.appendChild(cellView(x, r, c, rw.small)); });
      g.appendChild(line);
    });
    if (st.extra) {
      var ex = el("div", "hs-row hs-amari");
      ex.appendChild(el("span", "hs-alabel", "あまり"));
      st.extra.cells.forEach(function (x, c) { ex.appendChild(cellView(x, -1, c, false)); });
      g.appendChild(ex);
      var more = btn("＋ 行をふやす", "addrow", "hs-more");
      g.appendChild(more);
    }
    var wrap = el("div", "hs-gwrap"); wrap.appendChild(g);
    var hint = st.op === "sub" ? "上の数をタップすると線で消せる。小さいマスはくり下がり。" :
      st.op === "div" ? "「.」で、えらんだマスの右下に小数点。" : "小さいマスはくり上がり。「.」で、えらんだマスの右下に小数点。";
    wrap.appendChild(el("p", "hs-hint", hint));
    return wrap;
  }
  function keypad() {
    var kp = el("div", "hs-keys");
    ["1", "2", "3", "4", "5", "back", "6", "7", "8", "9", "0", "dot"].forEach(function (k) {
      kp.appendChild(btn(k === "back" ? "⌫" : k === "dot" ? "." : k, k, k === "back" ? "hs-back" : ""));
    });
    if (st.phase === "grid") {
      [["◀", "left"], ["▲", "up"], ["▼", "down"], ["▶", "right"]].forEach(function (a) { kp.appendChild(btn(a[0], a[1], "hs-arrow")); });
    }
    return kp;
  }

  // ---------- ひらく・とじる ----------
  function open() {
    if (!panel) make();
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
  function reset() {
    close();
    st.phase = "setup"; st.a = ""; st.b = ""; st.field = "a"; st.msg = ""; st.rows = []; st.extra = null; st.sel = null;
  }
  // 画面の「筆算」ボタンをつなぐ
  function attach(id) {
    var b = $(id); if (!b) return;
    openers.push(b);
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", toggle);
  }

  return { open: open, close: close, reset: reset, attach: attach };
})();
