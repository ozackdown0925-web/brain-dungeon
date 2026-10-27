// 拠点の町とワールドマップの絵（段階7-2d）。
// エルム村とフォレストヴェールの絵は、保護者が Gemini で作ったもの（2026-10-18）。Claude が 320×180 点にちぢめて、色を128色にへらした（assets/maps/）。
// 鉱山の町ボルダとフロストクレストの絵（地方2）も、保護者が Gemini で作ったもの（2026-10-27）。同じように 320×180 点・128色にした。
//   町の絵は横長だったので、横を少しちぢめている。建物の場所は base.js の LAYOUTS、地図の場所は worldmap.js の SPOTS で絵に合わせた。
// これからの地方も、絵ができるまでは、ここでプログラムで描く仮の絵（PLACEHOLDER）を使える。
//   絵ができたら assets/maps/ に置いて FILES に足し、PLACEHOLDER から消す。
// 絵は読みこみに少し時間がかかるので、読みこめたら then(絵) を呼ぶ。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var MapArt = (function () {
  var FILES = { town: "assets/maps/elm_village.png?v=1", world: "assets/maps/forestveil.png?v=1",
    town2: "assets/maps/borda.png?v=1", world2: "assets/maps/frostcrest.png?v=1" };
  var imgs = {}, waiting = {};
  var W = 320, H = 180;

  // ---------- 仮の絵（プログラムで描く） ----------
  function hash(x, y, s) {
    var h = (x * 374761393 + y * 668265263 + (s || 0) * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function noise(x, y, s) {
    var x0 = Math.floor(x), y0 = Math.floor(y), fx = smooth(x - x0), fy = smooth(y - y0);
    var a = hash(x0, y0, s), b = hash(x0 + 1, y0, s), c = hash(x0, y0 + 1, s), d = hash(x0 + 1, y0 + 1, s);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  function canvas() { var c = document.createElement("canvas"); c.width = W; c.height = H; return c; }
  function hex(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }

  // 1点ずつ描く下地：f(x, y) が色（[r,g,b]）を返す
  function paint(ctx, f) {
    var img = ctx.createImageData(W, H), D = img.data;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var c = f(x, y), i = (y * W + x) * 4;
      D[i] = c[0]; D[i + 1] = c[1]; D[i + 2] = c[2]; D[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  var PLACEHOLDER = {};   // 絵がまだない地方の仮の絵（name: 描く関数）

  // name：town・world など（GameData.REGIONS の art）。読みこめていれば絵を返す。まだなら null を返し、読みこめたら done() を呼ぶ
  function get(name, done) {
    if (!FILES[name] && PLACEHOLDER[name]) {
      if (!imgs[name]) imgs[name] = PLACEHOLDER[name]();
      return imgs[name];
    }
    var im = imgs[name];
    if (im && im.complete && im.naturalWidth) return im;
    if (!im) {
      im = imgs[name] = new Image();
      waiting[name] = [];
      im.onload = function () { var w = waiting[name]; waiting[name] = []; w.forEach(function (f) { f(); }); };
      im.src = FILES[name];
    }
    if (done && waiting[name].indexOf(done) < 0) waiting[name].push(done);
    return null;
  }
  return { get: get };
})();
