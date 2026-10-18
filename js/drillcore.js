// 問題の表示と答え合わせ。ドリル（drill.html）とエディタ（editor.html）の両方で使う。
// iPadOS 16 の Safari で動くように、?. や ?? は使わない。
(function () {
  var SUBJECTS = [
    { key: "math", name: "算数" },
    { key: "japanese", name: "国語" },
    { key: "science", name: "理科" },
    { key: "social", name: "社会" }
  ];
  var TYPES = [
    { key: "number", name: "数を入力" },
    { key: "fraction", name: "分数（帯分数）" },
    { key: "text", name: "ことばを入力" },
    { key: "choice", name: "記号を1つ選ぶ" },
    { key: "multi", name: "記号をいくつか選ぶ" },
    { key: "order", name: "並べかえ" },
    { key: "kanji", name: "漢字の書き取り（自己採点）" },
    { key: "free", name: "記述（自己採点）" }
  ];
  var SELF = { kanji: true, free: true };

  function subjectName(k) { for (var i = 0; i < SUBJECTS.length; i++) if (SUBJECTS[i].key === k) return SUBJECTS[i].name; return k; }
  function asList(v) { if (v == null || v === "") return []; return Array.isArray(v) ? v : [v]; }

  // ---------- 正規化と採点 ----------
  function norm(s) {
    return String(s == null ? "" : s).normalize("NFKC")
      .replace(/[−‐-―﹣]/g, "-")
      .replace(/[\s。、，,・]/g, "")
      .replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); })
      .toLowerCase();
  }
  function parseNum(raw, suffix) {
    // iPad の日本語キーボードでは「.」が「。」になるので、「。」「｡」も小数点として読む（2026-10-19）
    var s = String(raw == null ? "" : raw).normalize("NFKC").trim().replace(/,/g, "").replace(/[。｡]/g, ".");
    if (suffix) { var sf = String(suffix).normalize("NFKC"); if (sf && s.slice(-sf.length) === sf) s = s.slice(0, -sf.length).trim(); }
    var m;
    if ((m = s.match(/^(-?\d+)\/(\d+)$/))) { var d = +m[2]; return d ? +m[1] / d : null; }
    if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    return null;
  }
  function intOrZero(v) { var s = String(v == null ? "" : v).normalize("NFKC").trim(); return s === "" ? 0 : (/^\d+$/.test(s) ? parseInt(s, 10) : NaN); }
  function fracText(a) {
    if (!a) return "";
    var w = intOrZero(a.w), n = String(a.n || ""), d = String(a.d || "");
    return (w ? w + "と" : "") + n + "/" + d;
  }
  function answerText(p) {
    if (p.type === "fraction") return fracText(p.answer);
    if (p.type === "multi") return asList(p.answer).join("、");
    if (p.type === "order") return asList(p.answer).join(" → ");
    var a = asList(p.answer);
    return (a[0] == null ? "" : String(a[0])) + (p.type === "number" && p.suffix ? " " + p.suffix : "");
  }
  function inputText(p, v) {
    if (v == null) return "";
    if (p.type === "fraction") return (v.w || v.n || v.d) ? fracText(v) : "";
    if (p.type === "multi") return asList(v).join("、");
    if (p.type === "order") return asList(v).join("→");
    return String(v);
  }
  function isEmpty(p, v) {
    if (SELF[p.type]) return false;
    if (p.type === "fraction") return !v || !(String(v.n || "").trim() && String(v.d || "").trim());
    if (p.type === "multi" || p.type === "order") return !v || !v.length;
    return v == null || String(v).trim() === "";
  }
  // 戻り値 { correct: bool, note?: string }
  function checkPart(p, v) {
    if (p.type === "number") {
      var got = parseNum(v, p.suffix);
      if (got == null) return { correct: false, note: "数字で答えましょう。" };
      var ok = asList(p.answer).some(function (a) { var w = parseNum(a); return w != null && Math.abs(w - got) < 1e-9; });
      return { correct: ok };
    }
    if (p.type === "fraction") {
      var a = p.answer || {};
      var same = intOrZero(v.w) === intOrZero(a.w) && intOrZero(v.n) === intOrZero(a.n) && intOrZero(v.d) === intOrZero(a.d);
      if (same) return { correct: true };
      var gv = intOrZero(v.w) + intOrZero(v.n) / intOrZero(v.d), av = intOrZero(a.w) + intOrZero(a.n) / intOrZero(a.d);
      if (isFinite(gv) && Math.abs(gv - av) < 1e-9) return { correct: false, note: "大きさは合っています。帯分数で、約分した形で答えましょう。" };
      return { correct: false };
    }
    if (p.type === "text") {
      var n = norm(v);
      if (!n) return { correct: false };
      if (asList(p.answer).some(function (a) { return norm(a) === n; })) return { correct: true };
      if (asList(p.alt).some(function (a) { return norm(a) === n; })) return { correct: true, note: "正解！ 漢字でも書けるようにしておこう。" };
      return { correct: false };
    }
    if (p.type === "choice") return { correct: norm(v) === norm(asList(p.answer)[0]) };
    if (p.type === "multi") {
      var want = asList(p.answer).map(norm).sort().join("|");
      return { correct: asList(v).map(norm).sort().join("|") === want };
    }
    if (p.type === "order") return { correct: asList(v).map(norm).join("|") === asList(p.answer).map(norm).join("|") };
    return { correct: false };
  }

  // ---------- 小さな道具 ----------
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, text, onClick) { var b = el("button", cls, text); b.type = "button"; if (onClick) b.addEventListener("click", onClick); return b; }
  // ---------- 図への書きこみ ----------
  // 線は図の幅を1とした座標で持つので、拡大しても位置がずれない。ページを開いている間だけ残る。
  var INK = {};   // 図のID -> [{ c: "pen"|"red"|"erase", w: 太さ(図の幅に対する割合), p: [[x,y],...] }]
  function inkColor(c) { return c === "red" ? "#d0342c" : "#1d2733"; }
  function drawInk(canvas, strokes) {
    var ctx = canvas.getContext("2d"); var W = canvas.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    (strokes || []).forEach(function (s) { strokeOn(ctx, W, s, 0); });
  }
  function strokeOn(ctx, W, s, from) {
    ctx.globalCompositeOperation = s.c === "erase" ? "destination-out" : "source-over";
    ctx.strokeStyle = ctx.fillStyle = inkColor(s.c);
    ctx.lineWidth = Math.max(1, s.w * W); ctx.lineCap = "round"; ctx.lineJoin = "round";
    var p = s.p;
    if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0][0] * W, p[0][1] * W, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); return; }
    ctx.beginPath(); var i0 = Math.max(0, from - 1);
    ctx.moveTo(p[i0][0] * W, p[i0][1] * W);
    for (var i = i0 + 1; i < p.length; i++) ctx.lineTo(p[i][0] * W, p[i][1] * W);
    ctx.stroke();
  }
  function fitCanvas(canvas, box) {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(box.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(box.clientHeight * dpr));
  }

  function annotate(id, src, onClose) {
    var strokes = INK[id] || (INK[id] = []);
    var tool = "pen", mode = "draw", scale = 1;
    var z = el("div", "dq-ann");
    var bar = el("div", "dq-ann-bar");
    var tools = {};
    function tbtn(key, label, fn) { var b = btn("dq-tool", label, fn); tools[key] = b; return b; }
    bar.append(
      tbtn("pen", "✏ えんぴつ", function () { setTool("pen"); }),
      tbtn("red", "● 赤", function () { setTool("red"); }),
      tbtn("erase", "消しゴム", function () { setTool("erase"); }),
      tbtn("move", "✋ 動かす", function () { setTool("move"); }),
      btn("dq-tool", "1つもどす", function () { strokes.pop(); redraw(); }),
      btn("dq-tool", "ぜんぶ消す", function () { strokes.length = 0; redraw(); }),
      btn("dq-tool", "＋", function () { setScale(scale + 0.5); }),
      btn("dq-tool", "−", function () { setScale(scale - 0.5); }),
      // 書いているあいだは指で動かせないので、ボタンで上下（と左右）に動かす。押しっぱなしで続けて動く（2026-10-18 保護者の案）
      scrollBtn("▲", 0, -1), scrollBtn("▼", 0, 1), scrollBtn("◀", -1, 0, "dq-hscroll"), scrollBtn("▶", 1, 0, "dq-hscroll"),
      el("span", "dq-ann-sep"),
      btn("dq-btn small", "とじる", close)
    );
    function scrollBtn(label, dx, dy, extra) {
      var b = btn("dq-tool dq-scroll" + (extra ? " " + extra : ""), label);
      b.setAttribute("aria-label", dy < 0 ? "上へ" : dy > 0 ? "下へ" : dx < 0 ? "左へ" : "右へ");
      var timer = 0, wait = 0;
      function step(n) { area.scrollLeft += dx * n; area.scrollTop += dy * n; }
      function stop() { clearTimeout(wait); clearInterval(timer); wait = timer = 0; }
      b.addEventListener("pointerdown", function (e) {
        e.preventDefault(); stop();
        step(Math.round(area.clientHeight * 0.25));
        wait = setTimeout(function () { timer = setInterval(function () { step(14); }, 30); }, 350);
      });
      b.addEventListener("pointerup", stop); b.addEventListener("pointerleave", stop); b.addEventListener("pointercancel", stop);
      return b;
    }
    var area = el("div", "dq-ann-area");
    var stage = el("div", "dq-ann-stage");
    var im = document.createElement("img"); im.src = src; im.alt = "問題の図"; im.draggable = false;
    var cv = document.createElement("canvas");
    stage.append(im, cv); area.append(stage); z.append(bar, area); document.body.append(z);
    document.documentElement.style.overflow = "hidden";

    function setTool(t) {
      if (t === "move") mode = "move"; else { mode = "draw"; tool = t; }
      Object.keys(tools).forEach(function (k) { tools[k].setAttribute("aria-pressed", String(k === (mode === "move" ? "move" : tool))); });
      cv.style.pointerEvents = mode === "move" ? "none" : "auto";
    }
    function setScale(s) {
      scale = Math.min(3, Math.max(1, s));
      stage.style.width = (scale * 100) + "%";
      z.classList.toggle("zoomed", scale > 1);   // 拡大したときだけ ◀▶ を出す
      requestAnimationFrame(redraw);
    }
    function redraw() { fitCanvas(cv, stage); drawInk(cv, strokes); }
    im.addEventListener("load", redraw);
    window.addEventListener("resize", redraw);
    setTool("pen"); setScale(window.innerWidth < 900 ? 1.5 : 1);

    var cur = null;
    function pt(e) { var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.width]; }
    cv.addEventListener("pointerdown", function (e) {
      if (mode !== "draw") return;
      e.preventDefault(); cv.setPointerCapture(e.pointerId);
      var pr = e.pointerType === "pen" && e.pressure ? e.pressure : 0.5;
      var base = tool === "erase" ? 0.035 : 0.0035 + pr * 0.003;
      cur = { c: tool, w: base / scale, p: [pt(e)] };
      strokes.push(cur);
      strokeOn(cv.getContext("2d"), cv.width, cur, 0);
    });
    cv.addEventListener("pointermove", function (e) {
      if (!cur) return;
      var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      if (!evs.length) evs = [e];
      var n = cur.p.length;
      evs.forEach(function (ev) { cur.p.push(pt(ev)); });
      strokeOn(cv.getContext("2d"), cv.width, cur, n);
    });
    function end() { cur = null; }
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);

    function close() {
      window.removeEventListener("resize", redraw);
      document.documentElement.style.overflow = "";
      z.remove();
      if (onClose) onClose();
    }
  }

  function images(ids, loader) {
    var box = el("div", "dq-imgs");
    asList(ids).forEach(function (id) {
      var ph = el("div", "dq-img loading", "図を読みこみ中…"); box.append(ph);
      Promise.resolve(loader ? loader(id) : null).then(function (src) {
        if (!src) { ph.textContent = "図を読みこめませんでした"; return; }
        var fig = el("div", "dq-fig");
        var im = document.createElement("img"); im.className = "dq-img"; im.src = src; im.alt = "問題の図";
        var cv = document.createElement("canvas"); cv.className = "dq-fig-ink";
        // 書きこむボタンは、問題に重ならないように右上の小さなえんぴつだけにする（2026-10-18 保護者の案）。書きこみがあると印がつく
        var open = btn("dq-fig-btn", "✏");
        open.setAttribute("aria-label", "書きこむ"); open.title = "書きこむ";
        function paint() { fitCanvas(cv, im); drawInk(cv, INK[id]); open.classList.toggle("has-ink", !!(INK[id] && INK[id].length)); }
        function go() { annotate(id, src, paint); }
        im.addEventListener("click", go); open.addEventListener("click", go);
        im.addEventListener("load", paint);
        window.addEventListener("resize", paint);
        fig.append(im, cv, open);
        ph.replaceWith(fig);
      }, function () { ph.textContent = "図を読みこめませんでした"; });
    });
    return box;
  }

  // ---------- 入力部品 ----------
  // 戻り値 { node, get(), set(v), lock() }
  function widget(p, onChange) {
    var t = p.type;
    if (t === "number" || t === "text") {
      var row = el("div", "dq-row");
      var inp = document.createElement("input"); inp.className = "dq-in"; inp.type = "text";
      inp.autocomplete = "off"; inp.spellcheck = false; inp.setAttribute("autocapitalize", "off"); inp.setAttribute("autocorrect", "off");
      inp.inputMode = t === "number" ? "decimal" : "text";
      inp.setAttribute("aria-label", "答え");
      if (t === "number") {
        // 数字の欄：日本語キーボードの「。」「．」を、その場で小数点「.」に直す（2026-10-19。小数点が打てなかったため）
        var fixDot = function (e) {
          if (e && e.isComposing) return;
          var v = inp.value, nv = v.replace(/[。｡．]/g, ".").replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
          if (nv === v) return;
          var pos = inp.selectionStart; inp.value = nv;
          try { inp.setSelectionRange(pos, pos); } catch (err) { /* そのまま */ }
        };
        inp.addEventListener("input", fixDot);
        inp.addEventListener("compositionend", function () { setTimeout(function () { fixDot(); onChange(); }, 0); });
      }
      inp.addEventListener("input", onChange);
      row.append(inp); if (p.suffix) row.append(el("span", "dq-suffix", p.suffix));
      return { node: row, get: function () { return inp.value.trim(); }, set: function (v) { inp.value = v == null ? "" : v; }, lock: function () { inp.disabled = true; } };
    }
    if (t === "fraction") {
      var fr = el("div", "dq-frac");
      function box(label) { var i = document.createElement("input"); i.className = "dq-in short"; i.type = "text"; i.inputMode = "numeric"; i.autocomplete = "off"; i.setAttribute("aria-label", label); i.addEventListener("input", onChange); return i; }
      var w = box("整数の部分"), n = box("分子"), d = box("分母");
      var stack = el("div", "fr"); stack.append(n, el("div", "bar"), d);
      fr.append(w, stack);
      var row2 = el("div", "dq-row"); row2.append(fr); if (p.suffix) row2.append(el("span", "dq-suffix", p.suffix));
      row2.append(el("span", "dq-note", "（整数の部分がないときは左を空けておく）"));
      return {
        node: row2,
        get: function () { return { w: w.value.trim(), n: n.value.trim(), d: d.value.trim() }; },
        set: function (v) { v = v || {}; w.value = v.w || ""; n.value = v.n || ""; d.value = v.d || ""; },
        lock: function () { w.disabled = n.disabled = d.disabled = true; }
      };
    }
    if (t === "choice" || t === "multi") {
      var opts = asList(p.options).length ? asList(p.options) : ["ア", "イ", "ウ", "エ"];
      var row3 = el("div", "dq-row"); var picked = [];
      var bs = opts.map(function (o) {
        var b = btn("dq-opt", o, function () {
          if (t === "choice") picked = [o];
          else picked = picked.indexOf(o) >= 0 ? picked.filter(function (x) { return x !== o; }) : picked.concat([o]);
          paint(); onChange();
        });
        row3.append(b); return b;
      });
      function paint() { bs.forEach(function (b, i) { b.setAttribute("aria-pressed", String(picked.indexOf(opts[i]) >= 0)); }); }
      paint();
      if (t === "multi") row3.append(el("span", "dq-note", "（あてはまるものをすべて選ぶ）"));
      return {
        node: row3,
        get: function () { return t === "choice" ? (picked[0] || "") : opts.filter(function (o) { return picked.indexOf(o) >= 0; }); },
        set: function (v) { picked = asList(v); paint(); },
        lock: function () { bs.forEach(function (b) { b.disabled = true; }); }
      };
    }
    if (t === "order") {
      var opts2 = asList(p.options).length ? asList(p.options) : ["ア", "イ", "ウ", "エ"];
      var wrap = el("div", "dq"); var seq = [];
      var shown = el("div", "dq-seq", "");
      var row4 = el("div", "dq-row");
      var bs2 = opts2.map(function (o) { var b = btn("dq-opt", o, function () { if (seq.indexOf(o) < 0) { seq.push(o); paint2(); onChange(); } }); row4.append(b); return b; });
      var reset = btn("dq-btn ghost small", "やり直す", function () { seq = []; paint2(); onChange(); });
      row4.append(reset);
      function paint2() { shown.textContent = seq.length ? seq.join(" → ") : "（順番にタップ）"; bs2.forEach(function (b, i) { b.setAttribute("aria-pressed", String(seq.indexOf(opts2[i]) >= 0)); }); }
      paint2();
      wrap.append(row4, shown);
      return { node: wrap, get: function () { return seq.slice(); }, set: function (v) { seq = asList(v).slice(); paint2(); }, lock: function () { bs2.forEach(function (b) { b.disabled = true; }); reset.disabled = true; } };
    }
    if (t === "free") {
      var ta = document.createElement("textarea"); ta.className = "dq-in"; ta.placeholder = "ここに書くか、メモに書いてから答え合わせ";
      ta.addEventListener("input", onChange);
      return { node: ta, get: function () { return ta.value.trim(); }, set: function (v) { ta.value = v || ""; }, lock: function () { ta.disabled = true; } };
    }
    // kanji
    var note = el("p", "dq-note", "メモに書いてから「答え合わせ」を押して、自分で○×をつけよう。");
    return { node: note, get: function () { return "（自己採点）"; }, set: function () {}, lock: function () {} };
  }

  // ---------- 問題を描く ----------
  // opts: { imageLoader(id)->Promise<src>, saved: 記録 or null, review: bool, onFinish(result), extraMeta: [文字列] }
  function renderQuestion(root, q, opts) {
    opts = opts || {};
    root.textContent = "";
    var wrap = el("div", "dq"); root.append(wrap);
    var meta = el("div", "dq-meta");
    meta.append(el("span", "dq-chip", subjectName(q.subject) + (q.unit ? "・" + q.unit : "")));
    if (opts.review) { meta.append(el("span", "dq-chip review", "復習"), el("span", null, "前にまちがえた問題です")); }
    if (q.source) meta.append(el("span", null, q.source));
    asList(opts.extraMeta).forEach(function (m) { meta.append(el("span", null, m)); });
    wrap.append(meta);
    if (q.text) wrap.append(el("p", "dq-text", q.text));
    if (asList(q.images).length) wrap.append(images(q.images, opts.imageLoader));

    // opts.answerRoot：答えの欄（と答え合わせ・解説）を、問題とは別の場所に出すとき（知恵の試練。2026-10-17）
    var ans = wrap;
    if (opts.answerRoot) { opts.answerRoot.textContent = ""; ans = el("div", "dq"); opts.answerRoot.append(ans); }
    var parts = asList(q.parts);
    var saved = opts.saved || null;
    var savedParts = saved && Array.isArray(saved.parts) ? saved.parts : [];
    var ws = [], marks = [], partBoxes = [];
    var action = el("div", "dq-row");

    parts.forEach(function (p, i) {
      var box = el("div", "dq-part");
      if (p.label || p.prompt) {
        var lab = el("div", "dq-plabel");
        if (p.label) lab.append(el("b", null, p.label));
        if (p.prompt) lab.append(el("p", "dq-prompt", p.prompt));
        box.append(lab);
      }
      if (asList(p.images).length) box.append(images(p.images, opts.imageLoader));
      var w = widget(p, update); ws.push(w); box.append(w.node);
      var mk = el("div"); marks.push(mk); box.append(mk);
      partBoxes.push(box); ans.append(box);
    });
    if (!parts.length) ans.append(el("p", "dq-note", "この問題には答えの欄がありません。"));
    ans.append(action);

    var checkBtn = btn("dq-btn", "答え合わせ", check);
    function update() {
      var ready = parts.every(function (p, i) { return !isEmpty(p, ws[i].get()); });
      checkBtn.disabled = !ready || !parts.length;
    }

    function showPartResult(i, res, value) {
      var p = parts[i]; var mk = marks[i]; mk.textContent = "";
      mk.append(el("span", "dq-mark " + (res.correct ? "ok" : "ng"), res.correct ? "○" : "×"));
      if (!res.correct || SELF[p.type]) mk.append(el("div", "dq-answer", "正しい答え：" + answerText(p)));
      if (res.note) mk.append(el("p", "dq-note", res.note));
    }

    function finish(results) {
      var all = results.every(function (r) { return r.correct; });
      var box = el("div", "dq-result " + (all ? "ok" : "ng"));
      box.append(el("div", "dq-verdict", all ? "○ 正解！" : (results.some(function (r) { return r.correct; }) ? "△ おしい" : "× ざんねん")));
      if (q.explanation) box.append(el("p", "dq-ex", q.explanation));
      if (asList(q.explainImages).length) box.append(images(q.explainImages, opts.imageLoader));
      if (!all && opts.reviewNote) box.append(el("p", "dq-note", opts.reviewNote));
      action.replaceWith(box);
      return all;
    }

    if (saved) {
      parts.forEach(function (p, i) {
        var sp = savedParts[i] || {};
        ws[i].set(sp.value); ws[i].lock();
        showPartResult(i, { correct: !!sp.correct, note: sp.note }, sp.value);
      });
      var res0 = parts.map(function (p, i) { return { correct: !!(savedParts[i] || {}).correct }; });
      if (!savedParts.length) res0 = [{ correct: !!saved.correct }];
      finish(res0);
      return;
    }

    action.append(checkBtn); update();

    function check() {
      ws.forEach(function (w) { w.lock(); });
      checkBtn.remove();
      var results = parts.map(function (p, i) {
        var v = ws[i].get();
        if (SELF[p.type]) return { self: true, value: v };
        var r = checkPart(p, v); r.value = v; showPartResult(i, r, v); return r;
      });
      var pending = results.filter(function (r) { return r.self; }).length;
      if (!pending) return done();
      results.forEach(function (r, i) {
        if (!r.self) return;
        var mk = marks[i];
        mk.append(el("div", "dq-model", answerText(parts[i])));
        var row = el("div", "dq-row");
        var ok = btn("dq-btn ok small", "○ できた", function () { grade(true); });
        var ng = btn("dq-btn ng small", "× まちがえた", function () { grade(false); });
        function grade(c) { r.correct = c; r.self = false; row.remove(); mk.querySelector(".dq-model").remove(); showPartResult(i, r, r.value); pending--; if (!pending) done(); }
        row.append(el("span", "dq-note", "自分の答えと比べて："), ok, ng); mk.append(row);
      });
      function done() {
        var all = finish(results);
        var rec = {
          correct: all,
          input: parts.map(function (p, i) { return (p.label ? p.label + " " : "") + inputText(p, results[i].value); }).join(" / "),
          parts: parts.map(function (p, i) { return { label: p.label || "", value: results[i].value, correct: !!results[i].correct, note: results[i].note || "" }; })
        };
        var note = results.map(function (r) { return r.note; }).filter(Boolean)[0];
        if (note) rec.note = note;
        if (opts.onFinish) opts.onFinish(rec);
      }
    }
  }

  window.DrillCore = {
    SUBJECTS: SUBJECTS, TYPES: TYPES, subjectName: subjectName, renderQuestion: renderQuestion,
    checkPart: checkPart, answerText: answerText, asList: asList
  };
})();
