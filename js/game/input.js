// 入力：PC のキーボードと、iPad の画面のボタン（十字キー＋攻撃・スキル1〜3・切替・メニュー）。
// ゲームからは Input.axis()（移動の向き）と Input.held(名前)・Input.pressed(名前) で読む。
// 名前：attack, skill1, skill2, skill3, switch, menu
var Input = (function () {
  var ACTIONS = ["attack", "skill1", "skill2", "skill3", "switch", "menu"];

  // PC のキー
  var KEYS = {
    ArrowUp: "up", KeyW: "up",
    ArrowDown: "down", KeyS: "down",
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
    KeyJ: "attack", Space: "attack",
    KeyU: "skill1", KeyI: "skill2", KeyO: "skill3",
    KeyK: "switch", KeyQ: "switch",
    Escape: "menu", KeyM: "menu"
  };

  var keyDir = { up: false, down: false, left: false, right: false };
  var down = {};      // いま押されている（キーとボタンの合計）
  var keyDown = {};   // キーボードで押されているもの
  var touchDown = {}; // 画面のボタンで押されているもの
  var edge = {};      // このフレームで押されたもの
  var pad = { x: 0, y: 0 };

  ACTIONS.forEach(function (a) { down[a] = false; keyDown[a] = false; touchDown[a] = false; edge[a] = false; });

  function refresh(a) {
    var now = keyDown[a] || touchDown[a];
    if (now && !down[a]) edge[a] = true;
    down[a] = now;
  }

  // ---------- キーボード ----------
  window.addEventListener("keydown", function (e) {
    var k = KEYS[e.code];
    if (!k) return;
    e.preventDefault();
    if (keyDir.hasOwnProperty(k)) { keyDir[k] = true; return; }
    if (e.repeat) return;
    keyDown[k] = true; refresh(k);
  });
  window.addEventListener("keyup", function (e) {
    var k = KEYS[e.code];
    if (!k) return;
    if (keyDir.hasOwnProperty(k)) { keyDir[k] = false; return; }
    keyDown[k] = false; refresh(k);
  });
  window.addEventListener("blur", releaseAll);

  function releaseAll() {
    Object.keys(keyDir).forEach(function (k) { keyDir[k] = false; });
    ACTIONS.forEach(function (a) { keyDown[a] = false; touchDown[a] = false; refresh(a); });
    pad.x = 0; pad.y = 0; drawKnob();
  }

  // ---------- iPad の画面のボタン ----------
  var isTouch = ("ontouchstart" in window) || (navigator.maxTouchPoints || 0) > 0;
  var touchEl = document.getElementById("touch");
  var dpad = document.getElementById("dpad");
  var knob = document.getElementById("dpadKnob");
  var padPointer = null;

  if (isTouch) touchEl.hidden = false;

  // ボタンの大きさを画面に合わせる：画面の短い辺が 768（iPad の横向き）なら今の大きさ、スマホでは小さく（最小 0.6 倍）
  function sizeControls() {
    var short = Math.min(window.innerWidth, window.innerHeight);
    var k = Math.max(0.6, Math.min(1, short / 768));
    document.documentElement.style.setProperty("--ctrl", k.toFixed(3));
  }
  window.addEventListener("resize", sizeControls);
  window.addEventListener("orientationchange", function () { setTimeout(sizeControls, 200); });
  sizeControls();

  // 指が外へずれても、離すまでそのボタンのまま扱う（できない端末では何もしない）
  function capture(el, id) {
    try { if (el.setPointerCapture) el.setPointerCapture(id); } catch (err) { /* そのままでよい */ }
  }

  // 十字キー：中心からの向きを8方向にまとめる（真ん中の小さな円は止まる）
  function setPad(e) {
    var r = dpad.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var dx = e.clientX - cx, dy = e.clientY - cy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var dead = r.width * 0.12;
    if (dist < dead) { pad.x = 0; pad.y = 0; }
    else {
      var ang = Math.atan2(dy, dx);
      var step = Math.round(ang / (Math.PI / 4));
      var a8 = step * Math.PI / 4;
      pad.x = Math.round(Math.cos(a8) * 1000) / 1000;
      pad.y = Math.round(Math.sin(a8) * 1000) / 1000;
    }
    drawKnob();
  }
  function drawKnob() {
    var m = 46;
    knob.style.transform = "translate(" + (pad.x * m) + "px," + (pad.y * m) + "px)";
  }
  dpad.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    padPointer = e.pointerId;
    capture(dpad, e.pointerId);
    setPad(e);
  });
  dpad.addEventListener("pointermove", function (e) { if (e.pointerId === padPointer) setPad(e); });
  function padEnd(e) {
    if (e.pointerId !== padPointer) return;
    padPointer = null; pad.x = 0; pad.y = 0; drawKnob();
  }
  dpad.addEventListener("pointerup", padEnd);
  dpad.addEventListener("pointercancel", padEnd);

  // 攻撃・スキル・切替・メニューのボタン
  Array.prototype.forEach.call(document.querySelectorAll("#touch .btn"), function (b) {
    var a = b.getAttribute("data-act");
    var pid = null;
    b.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      pid = e.pointerId;
      capture(b, e.pointerId);
      touchDown[a] = true; refresh(a); b.classList.add("on");
    });
    function up(e) {
      if (e.pointerId !== pid) return;
      pid = null; touchDown[a] = false; refresh(a); b.classList.remove("on");
    }
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
    b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  });

  // iPad の Safari で、ピンチやダブルタップで画面が拡大されないようにする
  document.addEventListener("gesturestart", function (e) { e.preventDefault(); });
  document.addEventListener("dblclick", function (e) { e.preventDefault(); });

  // ---------- ゲームから読む ----------
  // 移動の向き（長さは最大1）
  function axis() {
    var x = (keyDir.right ? 1 : 0) - (keyDir.left ? 1 : 0) + pad.x;
    var y = (keyDir.down ? 1 : 0) - (keyDir.up ? 1 : 0) + pad.y;
    var len = Math.sqrt(x * x + y * y);
    if (len > 1) { x /= len; y /= len; }
    return { x: x, y: y };
  }
  function held(a) { return !!down[a]; }
  function pressed(a) { return !!edge[a]; }
  // 1フレームの終わりに呼ぶ
  function endFrame() { ACTIONS.forEach(function (a) { edge[a] = false; }); }

  return { axis: axis, held: held, pressed: pressed, endFrame: endFrame, releaseAll: releaseAll, isTouch: isTouch };
})();
