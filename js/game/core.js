// ゲームの流れ：毎フレームの更新と描画、一時停止、横向きの案内。
// 段階1（土台）：仮の部屋を歩き、攻撃ボタンでふり、Wait Time のあいだは次の攻撃ができないことを見せる。
(function () {
  var view = Render.view;
  var room = World.testRoom();

  var WAIT_TIME = 0.6; // 剣の Wait Time（秒）。たたき台 docs/draft.md の 1.4
  var SPEED = 72;      // 1秒に進むドット数

  var player = {
    x: 6 * World.TILE, y: 6 * World.TILE, r: 6,
    face: { x: 0, y: 1 }, walk: 0,
    wait: 0,    // 次の攻撃まで残りの秒
    swing: 0    // ふりの見た目が残っている秒
  };
  var cam = { x: 0, y: 0 };
  var paused = false;
  var debug = /[?&]debug=1/.test(location.search);
  var fps = { n: 0, t: 0, value: 0 };
  var lastPress = { name: "", t: 0 };
  if (debug) window.__game = { player: player, cam: cam, room: room };

  // ---------- 更新 ----------
  function update(dt) {
    if (Input.pressed("menu")) { setPaused(true); return; }

    var a = Input.axis();
    var moving = Math.abs(a.x) > 0.05 || Math.abs(a.y) > 0.05;
    if (moving) {
      room.move(player, a.x * SPEED * dt, a.y * SPEED * dt);
      var len = Math.sqrt(a.x * a.x + a.y * a.y);
      player.face = { x: a.x / len, y: a.y / len };
      player.walk += dt * 8;
    }

    player.wait = Math.max(0, player.wait - dt);
    player.swing = Math.max(0, player.swing - dt);
    // 攻撃：押しっぱなしでも、Wait Time がたまるたびにふる
    if (Input.held("attack") && player.wait <= 0) {
      player.wait = WAIT_TIME;
      player.swing = 0.15;
    }

    ["skill1", "skill2", "skill3", "switch"].forEach(function (n) {
      if (Input.pressed(n)) lastPress = { name: n, t: 1.2 };
    });
    lastPress.t = Math.max(0, lastPress.t - dt);

    cam.x = clamp(player.x - view.w / 2, 0, Math.max(0, room.pxW - view.w));
    cam.y = clamp(player.y - view.h / 2, 0, Math.max(0, room.pxH - view.h));
    cam.x = Math.round(cam.x); cam.y = Math.round(cam.y);
  }

  // ---------- 描画 ----------
  var NAMES = { skill1: "スキル1", skill2: "スキル2", skill3: "スキル3", "switch": "キャラ切りかえ" };

  function draw() {
    Render.begin();
    room.draw(cam, view);
    drawPlayer();

    // 上：仮の表示（残り時間などは段階4で）
    Render.rect(0, 0, view.w, 16, "rgba(10,12,18,0.6)");
    Render.text("段階1：土台のテスト（仮の部屋）", 6, 3, { size: 9, color: "#f2c14e" });
    if (!Input.isTouch) {
      Render.text("移動 WASD/矢印　攻撃 J/スペース　スキル U・I・O　切替 K　メニュー Esc", view.w - 6, view.h - 12, { size: 7, align: "right", color: "#a3a8bd" });
    }
    if (lastPress.t > 0) {
      Render.text(NAMES[lastPress.name] + " のボタン（中身は段階3で）", view.w / 2, 24, { size: 9, align: "center" });
    }
    if (debug) {
      Render.text(fps.value + " fps　" + view.w + "×" + view.h + "　×" + view.scale.toFixed(2), 6, 20, { size: 8, color: "#6fd08c" });
    }
  }

  function drawPlayer() {
    var px = Math.round(player.x - cam.x), py = Math.round(player.y - cam.y);
    var bob = Math.sin(player.walk) > 0 ? 1 : 0;
    // かげ
    Render.rect(px - 6, py + 5, 12, 3, "rgba(0,0,0,0.35)");
    // 体（仮の絵）
    Render.rect(px - 5, py - 6 - bob, 10, 11, "#5aa9ff");
    Render.rect(px - 4, py - 12 - bob, 8, 7, "#f5d7b0");
    Render.rect(px - 4 + Math.round(player.face.x * 2), py - 10 - bob + (player.face.y < -0.5 ? -2 : 0), 2, 2, "#11131b");
    Render.rect(px + 1 + Math.round(player.face.x * 2), py - 10 - bob + (player.face.y < -0.5 ? -2 : 0), 2, 2, "#11131b");
    // 剣のふり
    if (player.swing > 0) {
      var ctx = Render.ctx;
      var ang = Math.atan2(player.face.y, player.face.x);
      ctx.strokeStyle = "rgba(255,255,255," + (player.swing / 0.15).toFixed(2) + ")";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, py - 3, 15, ang - 1, ang + 1);
      ctx.stroke();
    }
    // Wait Time のゲージ（たまるまで次の攻撃はできない）
    if (player.wait > 0) {
      var w = 16, filled = Math.round(w * (1 - player.wait / WAIT_TIME));
      Render.rect(px - w / 2, py + 9, w, 2, "#2a2f42");
      Render.rect(px - w / 2, py + 9, filled, 2, "#f2c14e");
    }
  }

  // ---------- 一時停止と横向きの案内 ----------
  var pauseEl = document.getElementById("pause");
  var rotateEl = document.getElementById("rotate");
  document.getElementById("resumeBtn").addEventListener("click", function () { setPaused(false); });
  window.addEventListener("keydown", function (e) { if (paused && (e.code === "Escape" || e.code === "Enter")) setPaused(false); });

  function setPaused(on) {
    paused = on;
    pauseEl.hidden = !on;
    Input.releaseAll();
  }
  function checkRotate() {
    var portrait = window.innerHeight > window.innerWidth;
    rotateEl.hidden = !(Input.isTouch && portrait);
  }
  window.addEventListener("resize", checkRotate);
  checkRotate();
  // アプリを切りかえたり画面を消したりしたら止める
  document.addEventListener("visibilitychange", function () { if (document.hidden && !paused) setPaused(true); });

  // ---------- 毎フレーム ----------
  var last = 0;
  function frame(t) {
    var dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t;
    fps.n++; fps.t += dt;
    if (fps.t >= 0.5) { fps.value = Math.round(fps.n / fps.t); fps.n = 0; fps.t = 0; }
    if (!paused && rotateEl.hidden) update(dt);
    draw();
    Input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // ?debug=1 のときだけ、確かめるために1フレームずつ手で進められるようにする
  if (debug) window.__game.step = function (dt) { if (!paused) update(dt); draw(); Input.endFrame(); };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
})();
