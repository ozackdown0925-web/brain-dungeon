// タイトル画面（段階7-1）：1枚の絵と、短い物語。「はじめる」を押すと、つなぎ先・拠点へ（Base.boot）。
// 絵は assets/title.jpg（2026-11-04 保護者が Gemini で作った絵。題名の文字も絵の中）。画面に合わせて広げる。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Title = (function () {
  var W = 1024, H = 585;   // 絵の大きさ（点）
  var screen = document.getElementById("titleScreen");
  var cv = document.getElementById("titleArt");
  var done = null;

  function draw() {
    // 絵・題名・物語（3段落。2026-11-04 に長くなった）・「はじめる」が1画面に入る大きさに（横長の低い画面では、絵を左・文を右に並べる）
    var side = window.innerHeight < 560 && window.innerWidth > window.innerHeight;
    var room = side ? window.innerHeight - 40 : window.innerHeight - 400;
    var cssW = side ? Math.min(window.innerWidth * 0.5, room * W / H) : Math.max(200, Math.min(cv.parentNode.clientWidth || 640, 900, room * W / H));
    var cssH = Math.round(cssW * H / W);
    cv.style.width = cssW + "px"; cv.style.height = cssH + "px";
  }

  // ---------- 物語を1文字ずつ出す（2026-11-04 保護者の案） ----------
  // 1段落ずつ順番に、1文字ずつ出す。出しきったら「はじめる」が出る。
  // タップで早送り：今の段落をすぐに全部出して、次の段落へ進む。
  // 文字は先に全部置いておき、見えなくしておくだけ（文字の場所が動かないように）。ふりがなのついた言葉は、言葉ごとに出す。
  var CHAR_MS = 55, PARA_MS = 700;
  var storyEl = document.getElementById("titleStory");
  var goBtn = document.getElementById("titleGo");
  var paras = [], pi = 0, ci = 0, timer = null, telling = false;
  // 段落を、1つずつ出す部品（1文字、または、ふりがなのついた言葉1つ）に分ける
  function split(p) {
    if (window.Furi) Furi.apply(p);
    var units = [];
    Array.prototype.slice.call(p.childNodes).forEach(function (n) {
      if (n.nodeType === 3) {
        var t = n.nodeValue, frag = document.createDocumentFragment();
        for (var i = 0; i < t.length; i++) {
          var s = document.createElement("span"); s.className = "tc"; s.textContent = t.charAt(i);
          frag.appendChild(s); units.push(s);
        }
        p.replaceChild(frag, n);
      } else if (n.nodeType === 1) { n.classList.add("tc"); units.push(n); }
    });
    return units;
  }
  function prepare() {
    if (!paras.length) paras = Array.prototype.slice.call(storyEl.querySelectorAll("p")).map(split);
    paras.forEach(function (u) { u.forEach(function (s) { s.classList.remove("on"); }); });
    pi = 0; ci = 0;
    goBtn.classList.add("wait");
  }
  function step() {
    timer = null;
    if (pi >= paras.length) { finish(); return; }
    var u = paras[pi];
    if (ci < u.length) { u[ci++].classList.add("on"); timer = setTimeout(step, CHAR_MS); return; }
    pi++; ci = 0;
    timer = setTimeout(step, pi >= paras.length ? 0 : PARA_MS);
  }
  function finish() {
    if (timer) clearTimeout(timer);
    timer = null; telling = false;
    paras.forEach(function (u) { u.forEach(function (s) { s.classList.add("on"); }); });
    goBtn.classList.remove("wait");
  }
  // タップで早送り：今の段落を全部出して、すぐに次の段落へ
  screen.addEventListener("click", function (ev) {
    if (!telling || (ev.target.closest && ev.target.closest("button"))) return;
    if (timer) clearTimeout(timer);
    if (pi < paras.length) { paras[pi].forEach(function (s) { s.classList.add("on"); }); pi++; ci = 0; }
    step();
  });

  function show(then) {
    done = then;
    // テストのときは、タイトルを出さない（この端末の設定。ふだんは使わない）
    var skip = false; try { skip = localStorage.getItem("bd-skip-title") === "1"; } catch (e) { skip = false; }
    if (skip) { go(); return; }
    screen.hidden = false;
    draw();
    Sound.bgm("title");
    prepare(); telling = true;
    timer = setTimeout(step, 600);
  }
  function go() {
    if (telling) return;   // 物語を出しきるまでは押せない
    screen.hidden = true;
    Sound.unlock();
    var f = done; done = null;
    if (f) f();
  }
  document.getElementById("titleGo").addEventListener("click", go);
  window.addEventListener("resize", function () { if (!screen.hidden) draw(); });

  return { show: show, draw: draw };
})();
