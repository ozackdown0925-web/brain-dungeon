// 描画：画面いっぱいの Canvas に、ドット絵の大きさ（論理の画面）で描いて拡大する。
// 論理の画面は高さ 270 で固定し、横幅は端末の縦横比に合わせる（iPad の 4:3 も、PC の 16:9 も黒い帯なしで埋める）。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Render = (function () {
  var LOGICAL_H = 270;
  var MIN_W = 360, MAX_W = 520;

  var canvas = document.getElementById("screen");
  var ctx = canvas.getContext("2d");
  var view = { w: 480, h: LOGICAL_H, scale: 1, dpr: 1 };

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    var cw = window.innerWidth, ch = window.innerHeight;
    var w = Math.round(LOGICAL_H * cw / ch);
    view.w = Math.max(MIN_W, Math.min(MAX_W, w));
    view.h = LOGICAL_H;
    view.dpr = dpr;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    // 論理の画面が実際の画面にちょうど入る倍率（はみ出さない）
    view.scale = Math.min(canvas.width / view.w, canvas.height / view.h);
    view.offX = Math.round((canvas.width - view.w * view.scale) / 2);
    view.offY = Math.round((canvas.height - view.h * view.scale) / 2);
  }

  // 1フレームの描画を始める（論理の座標で描けるようにする）
  function begin() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.offX, view.offY);
    ctx.imageSmoothingEnabled = false;
  }

  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function text(str, x, y, opt) {
    opt = opt || {};
    ctx.font = (opt.bold ? "bold " : "") + (opt.size || 10) + "px " + (opt.font || "\"Hiragino Maru Gothic ProN\", \"Hiragino Sans\", \"Yu Gothic\", sans-serif");
    ctx.textAlign = opt.align || "left";
    ctx.textBaseline = opt.baseline || "top";
    if (opt.shadow !== false) {
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillText(str, x + 1, y + 1);
    }
    ctx.fillStyle = opt.color || "#ece7da";
    ctx.fillText(str, x, y);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", function () { setTimeout(resize, 200); });
  resize();

  return { ctx: ctx, view: view, begin: begin, rect: rect, text: text, resize: resize };
})();
