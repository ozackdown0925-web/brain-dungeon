// タイトル画面（段階7-1）：1枚の絵と、短い物語。「はじめる」を押すと、つなぎ先・拠点へ（Base.boot）。
// 絵は titleart.js（プログラムで描いたドット絵。素材は使っていない）。画面に合わせて広げる。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Title = (function () {
  var W = TitleArt.W, H = TitleArt.H;
  var screen = document.getElementById("titleScreen");
  var cv = document.getElementById("titleArt");
  var done = null;

  // 決まった並びの乱数（毎回同じ絵になるように）
  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function draw() {
    var dpr = window.devicePixelRatio || 1;
    // 絵・題名・物語・「はじめる」が1画面に入る大きさに（横長の低い画面では、絵を左・文を右に並べる）
    var side = window.innerHeight < 560 && window.innerWidth > window.innerHeight;
    var room = side ? window.innerHeight - 40 : window.innerHeight - 330;
    var cssW = side ? Math.min(window.innerWidth * 0.5, room * W / H) : Math.max(200, Math.min(cv.parentNode.clientWidth || 640, 900, room * W / H));
    var cssH = Math.round(cssW * H / W);
    cv.style.width = cssW + "px"; cv.style.height = cssH + "px";
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    var c = cv.getContext("2d");
    c.imageSmoothingEnabled = false;
    c.drawImage(TitleArt.image(), 0, 0, cv.width, cv.height);   // 絵は titleart.js（1点ずつ描いたドット絵）
  }

  function show(then) {
    done = then;
    // テストのときは、タイトルを出さない（この端末の設定。ふだんは使わない）
    var skip = false; try { skip = localStorage.getItem("bd-skip-title") === "1"; } catch (e) { skip = false; }
    if (skip) { go(); return; }
    screen.hidden = false;
    draw();
    Sound.bgm("title");
  }
  function go() {
    screen.hidden = true;
    Sound.unlock();
    var f = done; done = null;
    if (f) f();
  }
  document.getElementById("titleGo").addEventListener("click", go);
  window.addEventListener("resize", function () { if (!screen.hidden) draw(); });

  return { show: show, draw: draw };
})();
