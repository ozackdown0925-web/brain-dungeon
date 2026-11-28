// 計算の道具（2026-11-28 保護者の希望）：筆算パッド（hissan.js）の紙に、ほかの道具を足す。
//   すだれ算（連除法）：最大公約数・最小公倍数を出すときの、数をわっていく L 字の形。1つの数なら素因数分解にも使える。
//   樹形図：場合の数で、ならべ方・組み合わせを枝分かれで書いていく。
// 筆算と同じ決まり：手書きなし・数字（や文字）のボタンで入れる・答え合わせはしない（電卓にしない）・記録は送らない。
// わる数・商・枝を書くのは自分。道具は「書く場所をそろえる」ことだけをする。
// 筆算パッドの紙（Hissan）の上の「筆算／すだれ算／樹形図」で切りかえる。ボタン・色は css/hissan.css をつかう。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var KeisanDogu = (function () {
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(text, k, cls) { var b = el("button", "hs-b" + (cls ? " " + cls : ""), text); b.type = "button"; b.setAttribute("data-k", k); return b; }
  function pressed(b, on) { b.setAttribute("aria-pressed", String(!!on)); return b; }
  // 書く順番の手引き（2026-11-28 保護者の希望：道具を使うことで、正しい計算の順・書く順を学べるように）。
  // list＝手順、at＝いまの手順（太字）。say＝順番や書き方の声かけ（答え合わせではない）
  function guide(list, at, say) {
    var g = el("div", "dg-guide"), ol = el("ol");
    list.forEach(function (t, i) { var li = el("li", i === at ? "now" : i < at ? "done" : "", t); ol.appendChild(li); });
    g.appendChild(ol);
    if (say) g.appendChild(el("p", "dg-say", say));
    return g;
  }
  function isPrime(n) { if (n < 2) return false; for (var i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; }
  function smallFactor(n) { for (var i = 2; i * i <= n; i++) if (n % i === 0) return i; return n; }

  // =====================================================================
  // すだれ算（連除法）
  //   2 ) 12  18      ← いちばん上に問題の数（1〜3こ）。左に「わる数」を自分で書く
  //   3 )  6   9      ← その下に、わった答え（商）を自分で書く。また左にわる数…
  //        2   3      ← わる数を書かずに「つぎへ」で、下の答えの欄へ
  //   答えの欄（最大公約数・最小公倍数）は「2×3＝6」のように × と ＝ も入る。
  // =====================================================================
  var Sudare = (function () {
    var MAXD = 4, MAXLINES = 9, MAXANS = 24;
    var s = null;
    function fresh(n) {
      s = { n: n || (s ? s.n : 2), lines: [], cur: { line: 0, f: "v0" }, ans: { a1: "", a2: "" }, say: "" };
      s.lines.push(newLine());
    }
    function newLine() { return { d: "", v: ["", "", ""] }; }
    function ansKeys() { return s.n === 1 ? ["a1"] : ["a1", "a2"]; }
    function ansLabel(k) { return s.n === 1 ? "かけ算の式" : k === "a1" ? "最大公約数" : "最小公倍数"; }
    function get(c) { if (c.line < 0) return s.ans[c.f]; var L = s.lines[c.line]; return c.f === "d" ? L.d : L.v[+c.f.slice(1)]; }
    function put(c, x) { if (c.line < 0) { s.ans[c.f] = x; return; } var L = s.lines[c.line]; if (c.f === "d") L.d = x; else L.v[+c.f.slice(1)] = x; }
    function isAns() { return s.cur.line < 0; }

    function next() {
      var c = s.cur, j;
      if (c.line < 0) { var a = ansKeys(), i = a.indexOf(c.f); if (i + 1 < a.length) s.cur = { line: -1, f: a[i + 1] }; return; }
      if (c.f === "d") {
        // わる数を書かずに「つぎへ」＝もうわれない → 答えの欄へ
        if (!s.lines[c.line].d) { s.cur = { line: -1, f: "a1" }; return; }
        var dv = +s.lines[c.line].d;
        if (dv === 1) s.say = "1 でわっても数はかわらないよ。2・3・5…でわれるか見てみよう";
        else if (!isPrime(dv)) s.say = dv + " は " + smallFactor(dv) + " × " + (dv / smallFactor(dv)) + "。小さい数（2・3・5・7…）から順にわると、見落としが少ないよ";
        if (c.line + 1 >= s.lines.length) { if (s.lines.length >= MAXLINES) { s.cur = { line: -1, f: "a1" }; return; } s.lines.push(newLine()); }
        s.cur = { line: c.line + 1, f: "v0" };
        return;
      }
      j = +c.f.slice(1);
      if (j + 1 < s.n) s.cur = { line: c.line, f: "v" + (j + 1) };
      else s.cur = { line: c.line, f: "d" };   // 数を書いたら、左にわる数
    }
    function act(k) {
      if (!/^\d$/.test(k) && k !== "back") s.say = "";   // 声かけは、次の数を書いているあいだは残す
      if (k === "new") { fresh(s.n); return; }
      if (k.indexOf("sdn:") === 0) { fresh(+k.slice(4)); return; }
      if (k.indexOf("sd:") === 0) { var p = k.split(":"); s.cur = { line: +p[1], f: p[2] }; return; }
      if (k === "next") { next(); return; }
      var x = get(s.cur);
      if (k === "back") put(s.cur, x.slice(0, -1));
      else if (k === "clear") {
        put(s.cur, "");
        // 下の行が空なら消す（書きまちがえて行をふやしたとき）
        while (s.lines.length > 1 && s.cur.line < s.lines.length - 1) {
          var last = s.lines[s.lines.length - 1];
          if (last.d || last.v.join("")) break;
          s.lines.pop();
        }
      }
      else if (/^\d$/.test(k)) { if (isAns() ? x.length < MAXANS : x.length < MAXD) put(s.cur, x + k); }
      else if ((k === "times" || k === "eq") && isAns() && x.length < MAXANS) put(s.cur, x + (k === "times" ? "×" : "＝"));
    }

    function bar(box) {
      [1, 2, 3].forEach(function (n) { box.appendChild(pressed(btn(n + "つの数", "sdn:" + n, "hs-op hs-opw"), s.n === n)); });
      box.appendChild(el("span", "hs-sep"));
      box.appendChild(btn("あたらしく", "new"));
    }
    function cell(text, k, on, cls) {
      var d = el("span", "sd-box" + (cls ? " " + cls : "") + (on ? " caret" : ""), text);
      d.setAttribute("data-k", k);
      return d;
    }
    function sheet() {
      var g = el("div", "sd-grid"), i, j;
      g.style.gridTemplateColumns = "auto repeat(" + s.n + ", auto)";
      for (i = 0; i < s.lines.length; i++) {
        var L = s.lines[i], last = i === s.lines.length - 1;
        var dOn = s.cur.line === i && s.cur.f === "d";
        var hasD = !!L.d || dOn;
        var dc = cell(L.d, "sd:" + i + ":d", dOn, "sd-d" + (hasD ? " brk" : "") + (isAns() && L.d ? " hl" : ""));
        g.appendChild(dc);
        for (j = 0; j < s.n; j++) {
          var on = s.cur.line === i && s.cur.f === "v" + j;
          // 答えを書くとき、かける数を光らせる（最大公約数＝左のたての列、最小公倍数＝左と下の L 字）
          var hlv = isAns() && (s.cur.f === "a2" || s.n === 1) && last && !L.d;
          g.appendChild(cell(L.v[j], "sd:" + i + ":v" + j, on, "sd-v" + (hasD ? " line" : "") + (hlv ? " hl" : "")));
        }
      }
      var wrap = el("div", "sd-wrap");
      wrap.appendChild(g);
      var ab = el("div", "sd-ans");
      ansKeys().forEach(function (k) {
        var row = el("div", "sd-arow");
        row.appendChild(el("span", "hs-lab", ansLabel(k)));
        var on = isAns() && s.cur.f === k;
        var b = cell(s.ans[k], "sd:-1:" + k, on, "sd-a");
        row.appendChild(b);
        ab.appendChild(row);
      });
      wrap.appendChild(ab);
      return wrap;
    }
    function steps() {
      var c = s.cur, list, at;
      if (s.n === 1) list = ["数を書く", "左に、われる数を書く（2・3・5・7…の小さい順に）", "わった答えを下に書く", "もうわれなくなるまでくり返す（わる数を入れずに つぎへ）", "左の数と下の数をかけ算の式にする（光っている数）"];
      else list = ["問題の数を書く", "左に、" + (s.n === 3 ? "どれも（最小公倍数なら2つでも）" : "どれも") + "われる数を書く（2・3・5・7…の小さい順に）", "わった答えを下に書く" + (s.n === 3 ? "（われない数はそのまま下へ）" : ""),
        "もうわれなくなるまでくり返す（わる数を入れずに つぎへ）", "最大公約数＝左の数を全部かける（光っているたての列）", "最小公倍数＝左の数と下の数を全部かける（光っている L 字）"];
      if (c.line < 0) at = s.n === 1 ? 4 : c.f === "a1" ? 4 : 5;
      else if (c.line === 0 && c.f !== "d") at = 0;
      else if (c.f === "d") at = c.line === 0 ? 1 : 3;
      else at = 2;
      return guide(list, at, s.say);
    }
    function hint() {
      var c = s.cur;
      if (c.line < 0) return "答えの式（× と ＝ も入る）。答え合わせはしないよ";
      if (c.f === "d") return s.lines[c.line].d ? "わる数（つぎへ で下の行）" : "わる数を入れる（もうわれなければ、入れずに つぎへ）";
      return c.line === 0 ? "問題の数を入れる" : "上の数を、わる数でわった答えを入れる（われない数はそのまま下へ）";
    }
    function keys(kp) {
      var a = isAns();
      ["1", "2", "3", "4", "5", "back", "6", "7", "8", "9", "0", "times"].forEach(function (k) {
        var b = btn(k === "back" ? "⌫" : k === "times" ? "×" : k, k, k === "back" ? "hs-back" : "");
        if (k === "times" && !a) b.disabled = true;
        kp.appendChild(b);
      });
      var eq = btn("＝", "eq"); if (!a) eq.disabled = true;
      kp.appendChild(eq);
      kp.appendChild(btn("消す", "clear", "hs-clear hs-w2"));
      kp.appendChild(btn("つぎへ ↵", "next", "hs-next hs-w3"));
    }
    return { fresh: fresh, act: act, bar: bar, sheet: sheet, hint: hint, keys: keys, steps: steps, ready: function () { return !!s; } };
  })();

  // =====================================================================
  // 樹形図
  //   左のはしの●から、枝を1本ずつ書いていく。えらんでいる所（黄色のわく）に、下のボタンで枝を足す。
  //   「つぎへ」で、まだ枝のない次の所へ（上から順。紙に書くときと同じ順）。
  //   ✕ は「この枝はだめ」（0 は百の位に使えない など）のしるし。
  //   いちばん下の「全部で □ 通り」も自分で数えて入れる（数えるのはしない）。
  // =====================================================================
  var Jukei = (function () {
    var SETS = [
      { key: "num", name: "1 2 3", items: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] },
      { key: "abc", name: "A B C", items: ["A", "B", "C", "D", "E", "F"] },
      { key: "kana", name: "ア イ ウ", items: ["ア", "イ", "ウ", "エ", "オ", "カ"] },
      { key: "coin", name: "表 裏", items: ["表", "裏"] }
    ];
    var MAXKIDS = 10, MAXNODES = 160;
    var s = null, seq = 0;
    function node(ch, up) { seq++; return { id: seq, ch: ch, kids: [], up: up, x: false }; }
    function fresh(keepSet) {
      var set = keepSet && s ? s.set : "num", depth = keepSet && s ? s.depth : 3;
      s = { set: set, depth: depth, root: node("", null), sel: null, focus: "tree", ans: "", say: "" };
      s.sel = s.root;
    }
    function setOf() { for (var i = 0; i < SETS.length; i++) if (SETS[i].key === s.set) return SETS[i]; return SETS[0]; }
    function depthOf(n) { var d = 0; while (n.up) { d++; n = n.up; } return d; }
    function count(n) { var c = 1; for (var i = 0; i < n.kids.length; i++) c += count(n.kids[i]); return c; }
    function find(n, id) { if (n.id === id) return n; for (var i = 0; i < n.kids.length; i++) { var f = find(n.kids[i], id); if (f) return f; } return null; }
    function canGrow(n) { return depthOf(n) < s.depth; }
    function preorder(n, out) { out.push(n); for (var i = 0; i < n.kids.length; i++) preorder(n.kids[i], out); return out; }
    function next() {
      // 上から順に、まだ枝のない所（いちばん下の段より前で、✕ でない所）へ
      var all = preorder(s.root, []), i = all.indexOf(s.sel), j, n;
      for (j = 1; j <= all.length; j++) {
        n = all[(i + j) % all.length];
        if (!n.kids.length && canGrow(n) && !struck(n)) { s.sel = n; return; }
      }
      s.focus = "ans";   // 書く所がもうない → 「全部で □ 通り」へ
    }
    function struck(n) { while (n) { if (n.x) return true; n = n.up; } return false; }
    function addKid(ch) {
      var n = s.sel;
      if (!canGrow(n) || n.kids.length >= MAXKIDS || count(s.root) >= MAXNODES) return;
      // 書き方の声かけ（止めはしない）：小さい順・同じ枝の重なり・上で使ったもの
      var items = setOf().items, i, up;
      var ord = function (c) { return s.set === "num" ? +c : items.indexOf(c); };
      for (i = 0; i < n.kids.length; i++) if (n.kids[i].ch === ch) { s.say = "「" + ch + "」はもうこの枝に書いてあるよ（重なり）"; break; }
      if (!s.say && n.kids.length && ord(ch) < ord(n.kids[n.kids.length - 1].ch)) s.say = "小さい順（" + items.slice().sort(function (a, b) { return ord(a) - ord(b); }).slice(0, 3).join("→") + "…）に書くと、もれや重なりに気づきやすいよ";
      if (!s.say && s.set !== "coin") for (up = n; up && up.up; up = up.up) if (up.ch === ch) { s.say = "「" + ch + "」はもう上で使っているよ。同じものを2回使える問題かな？"; break; }
      n.kids.push(node(ch, n));
    }
    function act(k) {
      s.say = "";
      if (k === "new") { fresh(true); return; }
      if (k.indexOf("jset:") === 0) { s.set = k.slice(5); return; }
      if (k.indexOf("jdep:") === 0) {
        s.depth = +k.slice(5);
        if (depthOf(s.sel) > s.depth) s.sel = s.root;
        cut(s.root, 0);
        return;
      }
      if (k.indexOf("jn:") === 0) { var f = find(s.root, +k.slice(3)); if (f) { s.sel = f; s.focus = "tree"; } return; }
      if (k === "jans") { s.focus = "ans"; return; }
      if (s.focus === "ans") {
        if (k === "back") s.ans = s.ans.slice(0, -1);
        else if (k === "clear") s.ans = "";
        else if (/^\d$/.test(k) && s.ans.length < 4) s.ans += k;
        else if (k === "next") { s.focus = "tree"; }
        return;
      }
      if (k === "next") { next(); return; }
      if (k === "x") { if (s.sel.up) s.sel.x = !s.sel.x; return; }
      if (k === "back") {   // 最後に足した枝を消す（枝がなければ、えらんでいる所を消す）
        var n = s.sel;
        if (n.kids.length) n.kids.pop();
        else if (n.up) { var u = n.up; u.kids.splice(u.kids.indexOf(n), 1); s.sel = u; }
        return;
      }
      if (k === "clear") { s.sel.kids = []; s.sel.x = false; return; }
      if (/^\d$/.test(k) && s.set === "num") { addKid(k); return; }
      if (k.indexOf("lb:") === 0) { addKid(k.slice(3)); return; }
    }
    function cut(n, d) { if (d >= s.depth) n.kids = []; for (var i = 0; i < n.kids.length; i++) cut(n.kids[i], d + 1); }

    // ---------- 図をかく ----------
    var COLW = 58, ROWH = 38, NODE = 32, PADX = 10, PADY = 26;
    function sheet() {
      // まだ書いていない所（えらんでいる所の次の枝）は、点線のわくで見せる
      var ghost = null;
      if (s.focus === "tree" && canGrow(s.sel) && s.sel.kids.length < MAXKIDS) ghost = { id: 0, ch: "", kids: [], up: s.sel, ghost: true };
      var rows = 0, pos = {};
      function place(n, d) {
        var kids = n.kids.slice();
        if (ghost && ghost.up === n) kids.push(ghost);
        var y;
        if (!kids.length) { y = rows; rows++; }
        else {
          var ys = [];
          for (var i = 0; i < kids.length; i++) ys.push(place(kids[i], d + 1));
          y = (ys[0] + ys[ys.length - 1]) / 2;
        }
        pos[n.ghost ? "g" : n.id] = { x: d, y: y, n: n, kids: kids };
        return y;
      }
      place(s.root, 0);
      var w = PADX * 2 + s.depth * COLW + NODE + 8, h = PADY + Math.max(rows, 1) * ROWH + 4;
      var box = el("div", "jk-box"); box.style.width = w + "px"; box.style.height = h + "px";
      var ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
      svg.setAttribute("width", w); svg.setAttribute("height", h); svg.setAttribute("class", "jk-lines");
      function cx(p) { return PADX + p.x * COLW + NODE / 2; }
      function cy(p) { return PADY + p.y * ROWH + ROWH / 2; }
      // 段の名前
      for (var d = 1; d <= s.depth; d++) {
        var hd = el("span", "jk-head", d + "こ目"); hd.style.left = (PADX + d * COLW - 6) + "px"; hd.style.width = (NODE + 12) + "px";
        box.appendChild(hd);
      }
      Object.keys(pos).forEach(function (id) {
        var p = pos[id];
        p.kids.forEach(function (kd) {
          var q = pos[kd.ghost ? "g" : kd.id];
          var ln = document.createElementNS(ns, "path");
          var x1 = p.n.up ? cx(p) + NODE / 2 : cx(p) + 5, y1 = cy(p), x2 = cx(q) - NODE / 2, y2 = cy(q);
          ln.setAttribute("d", "M" + x1 + " " + y1 + " L" + x2 + " " + y2);
          ln.setAttribute("class", "jk-ln" + (kd.ghost ? " ghost" : "") + (struck(kd) ? " dead" : "") + (p.n.up ? "" : " first"));
          svg.appendChild(ln);
        });
      });
      box.appendChild(svg);
      Object.keys(pos).forEach(function (id) {
        var p = pos[id], n = p.n, b;
        if (!n.up) {   // はじまりの点
          b = el("span", "jk-root" + (s.sel === n && s.focus === "tree" ? " sel" : ""));
          b.setAttribute("data-k", "jn:" + n.id);
          b.style.left = (cx(p) - 9) + "px"; b.style.top = (cy(p) - 9) + "px";
        } else if (n.ghost) {
          b = el("span", "jk-node ghost", "");
          b.style.left = (cx(p) - NODE / 2) + "px"; b.style.top = (cy(p) - NODE / 2) + "px";
        } else {
          var leaf = s.focus === "ans" && !n.kids.length && depthOf(n) === s.depth && !struck(n);   // 数えるのは、いちばん右の列
          b = el("span", "jk-node" + (s.sel === n && s.focus === "tree" ? " sel" : "") + (n.x ? " x" : "") + (struck(n) && !n.x ? " dead" : "") + (leaf ? " hl" : ""), n.ch);
          b.setAttribute("data-k", "jn:" + n.id);
          b.style.left = (cx(p) - NODE / 2) + "px"; b.style.top = (cy(p) - NODE / 2) + "px";
        }
        box.appendChild(b);
      });
      var wrap = el("div", "jk-wrap");
      wrap.appendChild(box);
      var ar = el("div", "sd-arow jk-ans");
      ar.appendChild(el("span", "hs-lab", "全部で"));
      var a = el("span", "sd-box sd-a jk-a" + (s.focus === "ans" ? " caret" : ""), s.ans); a.setAttribute("data-k", "jans");
      ar.appendChild(a);
      ar.appendChild(el("span", "jk-tori", "通り"));
      wrap.appendChild(ar);
      return wrap;
    }
    function bar(box) {
      SETS.forEach(function (x) { box.appendChild(pressed(btn(x.name, "jset:" + x.key, "hs-op hs-opw"), s.set === x.key)); });
      box.appendChild(el("span", "hs-sep"));
      [2, 3, 4].forEach(function (d) { box.appendChild(pressed(btn(d + "だん", "jdep:" + d, "hs-op hs-opw"), s.depth === d)); });
      box.appendChild(btn("あたらしく", "new"));
    }
    function steps() {
      var list = ["1こ目に来るものを、小さい順に全部書く", "いちばん上の枝から、次に来るものを小さい順に書く", "「つぎへ」で下の枝へ。どの枝も同じ順で書く（✕ はだめな枝）", "いちばん右の列（光っている所）を数えて「全部で □ 通り」"], at;
      if (s.focus === "ans") at = 3;
      else if (!s.sel.up) at = 0;
      else { var top = s.sel; while (top.up && top.up.up) top = top.up; at = s.root.kids.indexOf(top) === 0 ? 1 : 2; }
      return guide(list, at, s.say);
    }
    function hint() {
      if (s.focus === "ans") return "数えた数を入れる（答え合わせはしないよ）";
      if (!canGrow(s.sel)) return "いちばん下の段。つぎへ で次の所へ";
      return (s.sel.up ? "「" + s.sel.ch + "」のあとに来るもの" : "1こ目に来るもの") + "を、ボタンで1つずつ足す";
    }
    function keys(kp) {
      if (s.focus === "ans") {
        ["1", "2", "3", "4", "5", "back", "6", "7", "8", "9", "0"].forEach(function (k) { kp.appendChild(btn(k === "back" ? "⌫" : k, k, k === "back" ? "hs-back" : "")); });
        kp.appendChild(btn("消す", "clear", "hs-clear"));
        kp.appendChild(btn("図にもどる", "next", "hs-next hs-w6"));
        return;
      }
      var items = setOf().items;
      if (s.set === "num") {
        ["1", "2", "3", "4", "5", "back", "6", "7", "8", "9", "0", "x"].forEach(function (k) {
          kp.appendChild(btn(k === "back" ? "⌫" : k === "x" ? "✕" : k, k, k === "back" ? "hs-back" : k === "x" ? "hs-fix" : ""));
        });
      } else {
        items.forEach(function (it) { kp.appendChild(btn(it, "lb:" + it)); });
        for (var i = items.length; i < 6; i++) kp.appendChild(el("span"));
        kp.appendChild(btn("⌫", "back", "hs-back"));
        kp.appendChild(btn("✕", "x", "hs-fix"));
        kp.appendChild(btn("消す", "clear", "hs-clear"));
        kp.appendChild(btn("つぎへ ↵", "next", "hs-next hs-w3"));
        return;
      }
      kp.appendChild(btn("消す", "clear", "hs-clear hs-w2"));
      kp.appendChild(btn("つぎへ ↵", "next", "hs-next hs-w4"));
    }
    return { fresh: fresh, act: act, bar: bar, sheet: sheet, hint: hint, keys: keys, steps: steps, ready: function () { return !!s; } };
  })();

  // =====================================================================
  // ボタンで入れる文字の板（メモ・線分図の名前や数でつかう）
  //   数：数字・小数点・かっこ・＋－×÷・＝・□・①②③
  //   単位：cm・円・人…　文字：A B C・ア イ ウ・兄 弟…　キーボード：iPad のキーボードで言葉を入れる
  // =====================================================================
  var PAGES = {
    num: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", ".", "□", "(", ")", "＋", "－", "×", "÷", "＝", "①", "②", "③", "④", "⑤"],
    unit: ["cm", "m", "km", "mm", "g", "kg", "L", "dL", "mL", "円", "個", "人", "本", "枚", "まい", "分", "秒", "時間", "日", "才", "％", "割", "倍", "通り"],
    word: ["A", "B", "C", "D", "ア", "イ", "ウ", "エ", "兄", "弟", "姉", "妹", "父", "母", "子", "全体", "差", "和", "答え", "式", "→", "？", "：", "、"]
  };
  var PAGE_NAMES = [["num", "数・記号"], ["unit", "単位"], ["word", "文字"], ["kbd", "キーボード"]];
  function tokenPad(kp, page) {
    var tabs = el("div", "dg-pages");
    PAGE_NAMES.forEach(function (x) { tabs.appendChild(pressed(btn(x[1], "pg:" + x[0], "dg-pg"), page === x[0])); });
    kp.appendChild(tabs);
    if (page === "kbd") {
      var row = el("div", "dg-kbd"), inp = el("input");
      inp.type = "text"; inp.id = "dgKbdInput"; inp.maxLength = 12; inp.placeholder = "言葉を入れて「入れる」";
      inp.setAttribute("autocomplete", "off");
      row.appendChild(inp); row.appendChild(btn("入れる", "kbdok", "hs-next"));
      kp.appendChild(row);
      return;
    }
    PAGES[page].forEach(function (t) { kp.appendChild(btn(t, "t:" + t, t.length > 2 ? "dg-sm" : "")); });
  }
  function kbdValue() { var i = document.getElementById("dgKbdInput"); var v = i ? i.value.replace(/^\s+|\s+$/g, "") : ""; if (i) i.value = ""; return v; }

  // =====================================================================
  // 式メモ（2026-11-28 保護者の希望。手書きのメモのかわり）
  //   1行に1つの式を、ボタンで書いていく。「計算の順」で、どの計算からするかを ①②③ で見せる（答えは出さない）。
  //   声かけ：＝ のあとに続けて計算している（3＋4＝7×2＝14）・かっこが閉じていない
  // =====================================================================
  var Memo = (function () {
    var MAXLINES = 30, MAXTOK = 40;
    var s = null, store = {}, key = "";
    function fresh() { s = { lines: [[]], line: 0, pos: 0, page: "num", order: false, say: "" }; store[key] = s; }
    function setKey(k) { key = k || ""; if (store[key]) s = store[key]; else fresh(); }
    function reset() { store = {}; fresh(); }
    function cur() { return s.lines[s.line]; }
    function insert(t) {
      var L = cur(); if (L.length >= MAXTOK) return;
      L.splice(s.pos, 0, t); s.pos++;
    }
    function act(k) {
      s.say = "";
      if (k === "new") { fresh(); return; }
      if (k.indexOf("pg:") === 0) { s.page = k.slice(3); return; }
      if (k === "order") { s.order = !s.order; return; }
      if (k.indexOf("mt:") === 0) { var p = k.split(":"); s.line = +p[1]; s.pos = +p[2]; return; }
      if (k.indexOf("ml:") === 0) { s.line = +k.slice(3); s.pos = cur().length; return; }
      if (k.indexOf("t:") === 0) { insert(k.slice(2)); check(); return; }
      if (/^\d$/.test(k)) { insert(k); return; }
      if (k === "times") { insert("×"); return; }
      if (k === "eq") { insert("＝"); check(); return; }
      if (k === "dot") { insert("."); return; }
      if (k === "kbdok") { var v = kbdValue(); if (v) insert(v); return; }
      if (k === "left") { if (s.pos > 0) s.pos--; else if (s.line > 0) { s.line--; s.pos = cur().length; } return; }
      if (k === "right") { if (s.pos < cur().length) s.pos++; else if (s.line + 1 < s.lines.length) { s.line++; s.pos = 0; } return; }
      if (k === "back") {
        if (s.pos > 0) { cur().splice(s.pos - 1, 1); s.pos--; }
        else if (s.line > 0) { var prev = s.lines[s.line - 1], n = prev.length; s.lines[s.line - 1] = prev.concat(cur()); s.lines.splice(s.line, 1); s.line--; s.pos = n; }
        return;
      }
      if (k === "clear") { if (s.lines.length > 1) { s.lines.splice(s.line, 1); if (s.line >= s.lines.length) s.line = s.lines.length - 1; } else s.lines[0] = []; s.pos = cur().length; return; }
      if (k === "next") {   // 改行
        check();
        if (s.lines.length >= MAXLINES) return;
        var rest = cur().splice(s.pos); s.lines.splice(s.line + 1, 0, rest); s.line++; s.pos = 0;
      }
    }
    // 書き方の声かけ
    function check() {
      for (var li = 0; li < s.lines.length && !s.say; li++) {
        var L = s.lines[li], i, eq = 0, opAfterEq = false, depth = 0, head = s.lines.length > 1 ? (li + 1) + "行目：" : "";
        for (i = 0; i < L.length; i++) {
          if (L[i] === "＝") eq++;
          else if (eq && /^[＋－×÷]$/.test(L[i])) opAfterEq = true;
          if (L[i] === "(") depth++; if (L[i] === ")") depth--;
          if (depth < 0) break;
        }
        if (eq >= 2 && opAfterEq) s.say = head + "＝ のあとに続けて計算しないで、行を分けて書こう（「＝」の左と右は同じ大きさ）";
        else if (depth < 0) s.say = head + "「)」が「(」より先にあるよ";
        else if (depth > 0 && li !== s.line) s.say = head + "かっこが閉じていないよ";
      }
    }
    // 計算の順：かっこの中 → ×÷（左から）→ ＋－（左から）。演算子の場所に番号をつける（答えは出さない）
    function orderOf(L) {
      var rank = {}, n = 0, segs = [], st = 0, i;
      for (i = 0; i <= L.length; i++) if (i === L.length || L[i] === "＝") { segs.push([st, i]); st = i + 1; }
      function walk(a, b) {
        var i, d = 0, open = -1;
        for (i = a; i < b; i++) {   // まず、かっこの中（左から）
          if (L[i] === "(") { if (d === 0) open = i; d++; }
          else if (L[i] === ")") { d--; if (d === 0 && open >= 0) { walk(open + 1, i); open = -1; } }
        }
        [/^[×÷]$/, /^[＋－]$/].forEach(function (re) {
          var dd = 0;
          for (var j = a; j < b; j++) {
            if (L[j] === "(") dd++; else if (L[j] === ")") dd--;
            else if (dd === 0 && re.test(L[j]) && !(L[j] === "－" && (j === a || /^[(＋－×÷]$/.test(L[j - 1])))) rank[j] = ++n;
          }
        });
      }
      segs.forEach(function (g) { n = 0; walk(g[0], g[1]); });
      return rank;
    }
    var CIRC = ["", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
    function sheet() {
      var box = el("div", "mm-sheet");
      s.lines.forEach(function (L, li) {
        var row = el("div", "mm-line" + (li === s.line ? " cur" : "")); row.setAttribute("data-k", "ml:" + li);
        var rank = s.order ? orderOf(L) : {}, i;
        row.appendChild(el("span", "mm-no", String(li + 1)));
        var cells = el("span", "mm-toks");
        for (i = 0; i <= L.length; i++) {
          if (li === s.line && i === s.pos) cells.appendChild(el("span", "mm-caret"));
          if (i === L.length) break;
          var t = el("span", "mm-t" + (/^[＋－×÷＝()]$/.test(L[i]) ? " op" : "") + (/^\d|^\.$/.test(L[i]) ? "" : L[i].length > 1 ? " w" : ""), L[i]);
          t.setAttribute("data-k", "mt:" + li + ":" + (i + 1));
          if (rank[i]) t.appendChild(el("span", "mm-rank", CIRC[rank[i]] || String(rank[i])));
          cells.appendChild(t);
        }
        row.appendChild(cells);
        box.appendChild(row);
      });
      return box;
    }
    function bar(box) {
      box.appendChild(pressed(btn("計算の順を見る", "order", "hs-op hs-opw"), s.order));
      box.appendChild(el("span", "hs-sep"));
      box.appendChild(btn("ぜんぶ消す", "new"));
    }
    function steps() {
      s.say = ""; check();   // 書き方の声かけは、いまの行を見て毎回出す
      return guide(["わかっていることを、1行に1つずつ式にする（単位もつける）", "1行に「＝」は1つ。続けるときは行を分ける", "「計算の順を見る」で、かっこ → ×÷ → ＋－ の順をたしかめる", "最後の行に「答え」"],
        s.order ? 2 : s.lines.length > 1 ? 1 : 0, s.say);
    }
    function hint() { return "◀ ▶ で書く場所を動かす。字をタップしてもよい"; }
    function keys(kp) {
      tokenPad(kp, s.page);
      kp.appendChild(btn("◀", "left", "hs-shift"));
      kp.appendChild(btn("▶", "right", "hs-shift"));
      kp.appendChild(btn("⌫", "back", "hs-back"));
      kp.appendChild(btn("行を消す", "clear", "hs-clear dg-sm"));
      kp.appendChild(btn("改行 ↵", "next", "hs-next hs-w2"));
    }
    return { fresh: fresh, setKey: setKey, reset: reset, act: act, bar: bar, sheet: sheet, hint: hint, keys: keys, steps: steps, ready: function () { return !!s; } };
  })();

  // =====================================================================
  // 線分図
  //   行（兄・弟 など）ごとに、線を区切りで分けて書く。どの行も左はしがそろう。
  //   区切りの長さは ◀ ▶ でかえる（目もりは自由。数の大きさは自分で考えて長さを決める）。
  //   区切りの上に数や □・① を書く。点線にすると「ちがい（差）」「わからない所」。右の } に合計。
  // =====================================================================
  var Senbun = (function () {
    var MAXROWS = 5, MAXSEG = 6, MAXLEN = 16, U = 16;
    var s = null;
    function fresh() { s = { rows: [newRow()], sel: { r: 0, s: 0 }, total: "", page: "num", say: "" }; }
    function newRow() { return { name: "", segs: [{ len: 6, lab: "", dash: false }] }; }
    function selSeg() { var r = s.rows[s.sel.r]; return s.sel.s >= 0 && r ? r.segs[s.sel.s] : null; }
    function getText() { if (s.sel.r < 0) return s.total; var r = s.rows[s.sel.r]; return s.sel.s < 0 ? r.name : r.segs[s.sel.s].lab; }
    function setText(x) { if (s.sel.r < 0) { s.total = x; return; } var r = s.rows[s.sel.r]; if (s.sel.s < 0) r.name = x; else r.segs[s.sel.s].lab = x; }
    function act(k) {
      s.say = "";
      if (k === "new") { fresh(); return; }
      if (k.indexOf("pg:") === 0) { s.page = k.slice(3); return; }
      if (k.indexOf("sb:") === 0) { var p = k.split(":"); s.sel = { r: +p[1], s: +p[2] }; if (+p[2] < 0 && +p[1] >= 0) s.page = "word"; else if (s.page === "word") s.page = "num"; return; }
      var seg = selSeg(), r = s.rows[s.sel.r];
      if (k === "longer" && seg) { if (rowLen(r) < MAXLEN * 2 && seg.len < MAXLEN) seg.len++; return; }
      if (k === "shorter" && seg) { if (seg.len > 1) seg.len--; return; }
      if (k === "dash" && seg) { seg.dash = !seg.dash; return; }
      if (k === "addseg" && r) {
        if (r.segs.length >= MAXSEG) return;
        r.segs.splice(s.sel.s < 0 ? r.segs.length : s.sel.s + 1, 0, { len: 3, lab: "", dash: false });
        s.sel = { r: s.sel.r, s: s.sel.s < 0 ? r.segs.length - 1 : s.sel.s + 1 };
        return;
      }
      if (k === "addrow") {
        if (s.rows.length >= MAXROWS) return;
        // 下の行は、上の行の1つ目の区切りと同じ長さから（左はしをそろえて、同じ所・ちがう所をくらべる）
        var base = s.rows[s.rows.length - 1].segs[0];
        s.rows.push({ name: "", segs: [{ len: base.len, lab: "", dash: false }] });
        s.sel = { r: s.rows.length - 1, s: -1 }; s.page = "word";
        if (s.rows.length === 2 && !s.rows[0].name) s.say = "行の名前（兄・弟 など）も書いておくと、あとで見まちがえないよ";
        return;
      }
      if (k === "delrow") {
        if (s.sel.r < 0) { s.total = ""; return; }
        if (s.sel.s >= 0 && r.segs.length > 1) { r.segs.splice(s.sel.s, 1); s.sel.s = Math.min(s.sel.s, r.segs.length - 1); return; }
        if (s.rows.length > 1) { s.rows.splice(s.sel.r, 1); s.sel = { r: Math.max(0, s.sel.r - 1), s: 0 }; }
        else s.rows[0] = newRow();
        return;
      }
      if (k === "next") {   // 次の区切り → 次の行 → 合計
        if (s.sel.r < 0) return;
        if (s.sel.s + 1 < r.segs.length) s.sel.s++;
        else if (s.sel.r + 1 < s.rows.length) s.sel = { r: s.sel.r + 1, s: -1 };
        else if (s.rows.length > 1) s.sel = { r: -1, s: 0 };
        if (s.sel.s < 0 && s.sel.r >= 0) s.page = "word"; else if (s.page === "word") s.page = "num";
        return;
      }
      var x = getText();
      if (k === "back") { setText(x.slice(0, -1)); return; }
      if (k === "clear") { setText(""); return; }
      var t = k.indexOf("t:") === 0 ? k.slice(2) : /^\d$/.test(k) ? k : k === "kbdok" ? kbdValue() : "";
      if (t && x.length + t.length <= 12) setText(x + t);
    }
    function rowLen(r) { var n = 0; r.segs.forEach(function (g) { n += g.len; }); return n; }
    function sheet() {
      var box = el("div", "sb-sheet"), maxLen = 0;
      s.rows.forEach(function (r) { maxLen = Math.max(maxLen, rowLen(r)); });
      s.rows.forEach(function (r, ri) {
        var row = el("div", "sb-row");
        var nm = el("span", "sb-name" + (s.sel.r === ri && s.sel.s < 0 ? " caret" : ""), r.name || "名前");
        if (!r.name) nm.className += " empty";
        nm.setAttribute("data-k", "sb:" + ri + ":-1");
        row.appendChild(nm);
        var line = el("span", "sb-line");
        r.segs.forEach(function (g, si) {
          var sg = el("span", "sb-seg" + (g.dash ? " dash" : "") + (s.sel.r === ri && s.sel.s === si ? " sel" : ""));
          sg.style.width = (g.len * U) + "px";
          sg.setAttribute("data-k", "sb:" + ri + ":" + si);
          sg.appendChild(el("span", "sb-lab", g.lab));
          line.appendChild(sg);
        });
        row.appendChild(line);
        box.appendChild(row);
      });
      if (s.rows.length > 1) {
        var tb = el("span", "sb-total" + (s.sel.r < 0 ? " caret" : ""), s.total || "合計");
        if (!s.total) tb.className += " empty";
        tb.setAttribute("data-k", "sb:-1:0");
        tb.style.left = (64 + maxLen * U + 10) + "px";
        box.appendChild(tb);
        box.className += " many";
        box.style.setProperty("--brace-left", (64 + maxLen * U + 2) + "px");
      }
      var wrap = el("div", "sb-wrap"); wrap.appendChild(box);
      return wrap;
    }
    function bar(box) {
      box.appendChild(btn("＋ 区切り", "addseg", "hs-op hs-opw"));
      box.appendChild(btn("＋ 行", "addrow", "hs-op hs-opw"));
      box.appendChild(el("span", "hs-sep"));
      box.appendChild(btn("あたらしく", "new"));
    }
    function steps() {
      var at = s.rows.length === 1 ? (s.rows[0].segs.length === 1 && !s.rows[0].segs[0].lab ? 0 : 1) : s.sel.r < 0 ? 4 : 2;
      if (s.rows.length > 1) for (var i = 0; i < s.rows.length; i++) for (var j = 0; j < s.rows[i].segs.length; j++) if (s.rows[i].segs[j].dash && at < 3) at = 3;
      return guide(["くらべるもとになる量（いちばん小さい方）を1行目に書く", "わかっている数・□・① を線の上に書く", "ほかの量を「＋ 行」で下に。左はしをそろえて、同じ長さの所と、ちがう所に区切る", "ちがい（差）やわからない所は「点線」にする", "右の } に合計を書く"], at, s.say);
    }
    function hint() {
      if (s.sel.r < 0) return "合計を書く";
      return s.sel.s < 0 ? "行の名前を書く" : "えらんだ区切りの上に数を書く。◀ ▶ で長さをかえる";
    }
    function keys(kp) {
      tokenPad(kp, s.page);
      var seg = selSeg();
      var a = btn("◀ 短く", "shorter", "hs-shift dg-sm"), b2 = btn("長く ▶", "longer", "hs-shift dg-sm"), d = pressed(btn("点線", "dash", "hs-fix"), seg && seg.dash);
      if (!seg) { a.disabled = true; b2.disabled = true; d.disabled = true; }
      kp.appendChild(a); kp.appendChild(b2); kp.appendChild(d);
      kp.appendChild(btn("⌫", "back", "hs-back"));
      kp.appendChild(btn(s.sel.s >= 0 && s.sel.r >= 0 ? "区切りを消す" : "行を消す", "delrow", "hs-clear dg-sm"));
      kp.appendChild(btn("つぎへ ↵", "next", "hs-next"));
    }
    return { fresh: fresh, act: act, bar: bar, sheet: sheet, hint: hint, keys: keys, steps: steps, ready: function () { return !!s; } };
  })();

  var TOOLS = { memo: Memo, sudare: Sudare, jukei: Jukei, senbun: Senbun };
  function get(key) { var t = TOOLS[key]; if (t && !t.ready()) { if (t === Memo) Memo.setKey(""); else t.fresh(); } return t; }
  // 新しい試練・書庫をひらいたとき：メモは問いごとにとっておくので、ここでは全部白紙にする
  function reset() { Sudare.fresh(); Jukei.fresh(); Senbun.fresh(); memoStore(); }
  function memoStore() { Memo.reset(); }
  return { get: get, reset: reset, memoKey: function (k) { Memo.setKey(k); } };
})();
