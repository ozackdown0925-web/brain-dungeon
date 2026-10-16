// ゲームの流れ：毎フレームの更新と描画、一時停止、横向きの案内。
// 段階2（戦いの手ざわり）：レベル1の戦士（剣・重装備）が、ゴブリンの部隊（剣士・槍兵・弓兵）と戦う。
// 手ごたえの目安（docs/draft.md）：ふつうの敵は剣で約3回でたおせる、ふつうの敵の攻撃に約20回当たると倒れる。
(function () {
  var view = Render.view;
  var room = World.testRoom();
  var SPEED = 72; // 1秒に進むドット数

  // ---------- 戦士（レベル1） ----------
  var weapon = GameData.WEAPONS.sword;
  var armor = GameData.ARMORS.heavy;
  var base = { str: 10, vit: 10, mag: 10, int: 10 };
  var stats = GameData.combatStats(base, weapon, armor);

  var player = {
    name: "戦士", level: 1,
    x: 6 * World.TILE, y: 11 * World.TILE, r: 6,
    face: { x: 1, y: 0 }, walk: 0,
    hp: stats.hp, maxHp: stats.hp,
    wait: 0,     // 次の攻撃まで残りの秒（Wait Time）
    swing: 0,    // ふりの見た目が残っている秒
    inv: 0,      // 当たったあとの、少しのあいだ当たらない時間
    down: false, downT: 0
  };
  var cam = { x: 0, y: 0 };
  var paused = false;
  var debug = /[?&]debug=1/.test(location.search);
  var fps = { n: 0, t: 0, value: 0 };
  var lastPress = { name: "", t: 0 };
  var message = { text: "", t: 0 };

  // 手ごたえを数える（画面の右上に出す）
  var tally = { kills: 0, swingsToKill: 0, hitsTaken: 0, downs: 0 };

  // ---------- ゴブリンの部隊 ----------
  var waveT = 0, wave = 0;
  function spawnWave() {
    wave++;
    var cx = 24 * World.TILE, cy = 11 * World.TILE; // 仮の部屋の、まわりに壁のない場所
    Enemies.spawn("goblin_sword", cx - 40, cy - 16);
    Enemies.spawn("goblin_spear", cx - 10, cy + 20);
    Enemies.spawn("goblin_archer", cx + 50, cy);
    if (wave % 2 === 0) Enemies.spawn("goblin_sword", cx - 40, cy + 40);
    say("ゴブリンの部隊があらわれた！");
  }
  spawnWave();

  function say(text) { message = { text: text, t: 2 }; }

  // プレイヤーがダメージを受ける（e は攻撃した敵）
  function hurtPlayer(e, x, y) {
    if (player.down || player.inv > 0) return;
    var res = Battle.damage(e.patk, stats.pdef, { element: "slash", res: null, crit: 0 });
    player.hp = Math.max(0, player.hp - res.amount);
    player.inv = 0.35;
    tally.hitsTaken++;
    Battle.showHit(player.x, player.y - 18, res, true);
    if (player.hp <= 0) {
      player.down = true; player.downT = 2.5; tally.downs++;
      say("戦士はたおれた…（段階3からは仲間に交代）");
    }
  }

  // 剣をふる：届く範囲・向きの中の敵に当たる
  function swing() {
    player.wait = weapon.wait;
    player.swing = 0.15;
    var ang = Math.atan2(player.face.y, player.face.x);
    Enemies.alive().forEach(function (e) {
      var dx = e.x - player.x, dy = e.y - player.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > weapon.reach + e.r + player.r) return;
      var da = Math.abs(Math.atan2(dy, dx) - ang);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (da > weapon.arc && dist > e.r + player.r + 2) return;
      var res = Battle.damage(stats.patk, e.pdef, { element: weapon.element, res: e.res, crit: stats.crit });
      e.hp -= res.amount; e.flash = 0.1;
      e.swingsTaken = (e.swingsTaken || 0) + 1;
      Battle.showHit(e.x, e.y - 20, res, false);
      // 少しだけ押し返す
      room.move(e, dx / (dist || 1) * 3, dy / (dist || 1) * 3);
      if (e.hp <= 0) {
        e.dead = true; tally.kills++; tally.swingsToKill += e.swingsTaken;
      }
    });
  }

  // ---------- 更新 ----------
  function update(dt) {
    if (Input.pressed("menu")) { setPaused(true); return; }

    player.wait = Math.max(0, player.wait - dt);
    player.swing = Math.max(0, player.swing - dt);
    player.inv = Math.max(0, player.inv - dt);

    if (player.down) {
      player.downT -= dt;
      if (player.downT <= 0) { player.down = false; player.hp = player.maxHp; player.inv = 1; say("戦士が起き上がった（仮）"); }
    } else {
      var a = Input.axis();
      if (Math.abs(a.x) > 0.05 || Math.abs(a.y) > 0.05) {
        room.move(player, a.x * SPEED * dt, a.y * SPEED * dt);
        var len = Math.sqrt(a.x * a.x + a.y * a.y);
        player.face = { x: a.x / len, y: a.y / len };
        player.walk += dt * 8;
      }
      // 攻撃：押しっぱなしでも、Wait Time がたまるたびにふる
      if (Input.held("attack") && player.wait <= 0) swing();
    }

    ["skill1", "skill2", "skill3", "switch"].forEach(function (n) {
      if (Input.pressed(n)) lastPress = { name: n, t: 1.2 };
    });
    lastPress.t = Math.max(0, lastPress.t - dt);
    message.t = Math.max(0, message.t - dt);

    Enemies.update(dt, room, player, hurtPlayer);
    Battle.update(dt);

    // 部隊をたおしたら、少しして次の部隊
    if (Enemies.alive().length === 0 && Enemies.list.length === 0) {
      if (waveT <= 0) { waveT = 2.5; say("たおした！ 次の部隊が来る…"); }
      waveT -= dt;
      if (waveT <= 0.0001) { waveT = 0; spawnWave(); }
    }

    cam.x = Math.round(clamp(player.x - view.w / 2, 0, Math.max(0, room.pxW - view.w)));
    cam.y = Math.round(clamp(player.y - view.h / 2, 0, Math.max(0, room.pxH - view.h)));
  }

  // ---------- 描画 ----------
  var NAMES = { skill1: "スキル1", skill2: "スキル2", skill3: "スキル3", "switch": "キャラ切りかえ" };

  function draw() {
    Render.begin();
    room.draw(cam, view);
    Enemies.draw(cam);
    drawPlayer();
    Battle.draw(cam);
    drawHud();
  }

  function drawHud() {
    // 左上：戦士の HP
    Render.rect(4, 4, 112, 22, "rgba(10,12,18,0.7)");
    Render.text(player.name + "  Lv" + player.level, 8, 6, { size: 8, color: "#f2c14e" });
    Render.text("HP " + player.hp + "/" + player.maxHp, 112, 6, { size: 8, align: "right" });
    Render.rect(8, 17, 104, 4, "#2a2f42");
    Render.rect(8, 17, Math.round(104 * player.hp / player.maxHp), 4, player.hp / player.maxHp < 0.3 ? "#ef5b5b" : "#6fd08c");

    // 右上（メニューのボタンの下）：手ごたえの数
    var avg = tally.kills ? (tally.swingsToKill / tally.kills).toFixed(1) : "-";
    var tx = view.w - 6, ty = Input.isTouch ? 22 : 6;
    Render.text("1体に当てた回数（平均） " + avg, tx, ty, { size: 7, align: "right", color: "#a3a8bd" });
    Render.text("受けた攻撃 " + tally.hitsTaken + "回　たおれた " + tally.downs + "回", tx, ty + 9, { size: 7, align: "right", color: "#a3a8bd" });

    if (message.t > 0) Render.text(message.text, view.w / 2, 34, { size: 9, align: "center", bold: true });
    if (lastPress.t > 0) Render.text(NAMES[lastPress.name] + " のボタン（中身は段階3で）", view.w / 2, 46, { size: 8, align: "center" });
    if (!Input.isTouch) {
      Render.text("移動 WASD/矢印　攻撃 J/スペース（押しっぱなしでも）　メニュー Esc", view.w - 6, view.h - 12, { size: 7, align: "right", color: "#a3a8bd" });
    }
    if (debug) Render.text(fps.value + " fps　" + view.w + "×" + view.h, 6, 30, { size: 7, color: "#6fd08c" });
  }

  function drawPlayer() {
    var px = Math.round(player.x - cam.x), py = Math.round(player.y - cam.y);
    var bob = Math.sin(player.walk) > 0 ? 1 : 0;
    var ctx = Render.ctx;
    if (player.down) {
      Render.rect(px - 8, py - 2, 16, 6, "#5aa9ff");
      Render.rect(px + 6, py - 3, 6, 6, "#f5d7b0");
      return;
    }
    if (player.inv > 0 && Math.floor(player.inv * 20) % 2 === 0) return; // 当たった直後は点滅
    Render.rect(px - 6, py + 5, 12, 3, "rgba(0,0,0,0.35)");
    Render.rect(px - 5, py - 6 - bob, 10, 11, "#5aa9ff");
    Render.rect(px - 4, py - 12 - bob, 8, 7, "#f5d7b0");
    var ey = py - 10 - bob + (player.face.y < -0.5 ? -2 : 0);
    Render.rect(px - 4 + Math.round(player.face.x * 2), ey, 2, 2, "#11131b");
    Render.rect(px + 1 + Math.round(player.face.x * 2), ey, 2, 2, "#11131b");
    if (player.swing > 0) {
      var ang = Math.atan2(player.face.y, player.face.x);
      ctx.strokeStyle = "rgba(255,255,255," + (player.swing / 0.15).toFixed(2) + ")";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, py - 3, weapon.reach, ang - weapon.arc, ang + weapon.arc);
      ctx.stroke();
    }
    if (player.wait > 0) {
      var w = 16, filled = Math.round(w * (1 - player.wait / weapon.wait));
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

  // ?debug=1 のときだけ、確かめるために中を見たり1フレームずつ進めたりできるようにする
  if (debug) {
    window.__game = {
      player: player, cam: cam, room: room, stats: stats, tally: tally,
      step: function (dt) { if (!paused) update(dt); draw(); Input.endFrame(); }
    };
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
})();
