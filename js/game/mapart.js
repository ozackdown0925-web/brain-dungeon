// 拠点（エルム村）とワールドマップ（フォレストヴェール）の絵（段階7-2d）。
// もとの絵は、保護者が Gemini で作ったもの（2026-10-18）。Claude が 320×180 点にちぢめて、色を128色にへらした（assets/maps/）。
// 絵は読みこみに少し時間がかかるので、読みこめたら then(絵) を呼ぶ。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var MapArt = (function () {
  var FILES = { town: "assets/maps/elm_village.png?v=1", world: "assets/maps/forestveil.png?v=1" };
  var imgs = {}, waiting = {};
  // name：town・world。読みこめていれば絵を返す。まだなら null を返し、読みこめたら done() を呼ぶ
  function get(name, done) {
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
