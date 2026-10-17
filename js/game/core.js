// ゲームの流れ：毎フレームの更新と描画、一時停止、横向きの案内。
// 段階4-1（階層の形）：seed でつないだ森の部屋を通って、出口をめざす。残り時間と地図つき。
// 職業・武器・スキル・レベル・階層・冒険の時間などは、一時停止の画面の「テスト用の設定」で変えられる（キャラクリと拠点は段階5で作る）。
(function () {
  var view = Render.view;
  var room = null;          // 今いる部屋
  var dg = null;            // 今の階層（Dungeon.generate の結果）
  var curKey = null;        // 今いる部屋の場所（地図のマス）
  var SPEED = 52;       // 1秒に進むドット数（保護者の感想で 72 → 52 に下げた）
  var ACCEL_TIME = 0.12; // 止まっている状態から、この秒数をかけて全速になる
  var TURN_TIME = 0.15;  // 大きく向きを変える（ほぼ反対を押す）ときは、この秒数その場で振り返ってから動く
  var TURN_ANGLE = 1.9;  // これより大きく向きが変わったら「振り返り」（ラジアン。約110度）
  var A = Party.actor;
  A.x = 6 * World.TILE; A.y = 11 * World.TILE;

  // ---------- テスト用のパーティ ----------
  var setup = [
    { name: "アレン", job: "warrior", weapon: "sword",  skills: ["w.spin", "w.rush", "w.focus"] },
    { name: "ミラ",   job: "mage",    weapon: "staff",  skills: ["m.fire", "m.aqua", "m.sleep"] },
    { name: "ロイ",   job: "hunter",  weapon: "bow",    skills: ["h.triple", "h.poison", "h.para"] }
  ];
  var testLevel = 1;
  // テスト用の設定（段階4）。correct は知恵の試練の正解数の仮の値（段階6で本物の結果に置きかえる。段階4-2で宝箱のレア度に使う）
  var settings = { floor: 1, correct: 2, minutes: 5, seed: "" };
  var run = { timeLeft: 300, kills: 0, over: false, fade: 0 };
  function buildParty() {
    Party.setup(setup.map(function (s) { return Party.makeChar(s.name, s.job, s.weapon, testLevel, s.skills.slice()); }));
  }
  buildParty();

  var cam = { x: 0, y: 0 };
  var paused = false, choosing = false;
  var debug = /[?&]debug=1/.test(location.search);
  var fps = { n: 0, t: 0, value: 0 };
  var message = { text: "", t: 0 };
  var tally = { kills: 0, swingsToKill: 0, hitsTaken: 0, downs: 0 };

  // ---------- 階層と部屋 ----------
  // 階層に入る：毎日の出発と同じく、HP・MP は全快。seed を省くと新しいつなぎ方。
  function startFloor(floor, seed) {
    settings.floor = floor;
    dg = Dungeon.generate(floor, seed || Dungeon.newSeed());
    Party.resetAll();
    A.wait = 0; A.busy = 0; A.down = false; A.move = 0;
    run = { timeLeft: settings.minutes * 60, kills: 0, over: false, fade: 0 };
    enterRoom(dg.start, null);
    say("森の " + floor + " 階　出口をめざそう！" + (dg.boss ? "（ボスは段階4-3で作ります）" : ""));
  }

  // 部屋に入る。fromDir は入ってきた道の向き（n/s/w/e）、null なら部屋のまんなか（入口の部屋）。
  function enterRoom(k, fromDir) {
    curKey = k;
    var c = dg.cells[k];
    c.visited = true;
    room = c.room;
    Combat.hooks.room = room;
    Enemies.clear(); Combat.clear();
    var p = fromDir ? Dungeon.entryPoint(room, fromDir) : { x: c.center.x, y: c.center.y + 20, face: { x: 0, y: 1 } };
    A.x = p.x; A.y = p.y; A.face = p.face; A.move = 0; A.turn = 0;
    A.inv = 0.6; // 部屋に入った直後は少しだけ無敵
    // たおした敵はもどらない。まだいる敵は、もとの場所に HP 満タンでいる。
    var lv = 0;
    Party.members().forEach(function (m) { lv += m.level; });
    var depth = Dungeon.enemyDepth(dg.floor, lv / Party.members().length);
    c.enemies.forEach(function (slot) {
      if (slot.dead) return;
      var e = Enemies.spawn(slot.type, slot.x, slot.y, depth);
      e.slot = slot;
    });
    run.fade = 0.3;
  }

  function finishedCells() {
    var n = 0, all = 0;
    Object.keys(dg.cells).forEach(function (k) { all++; if (dg.cells[k].visited) n++; });
    return n + "/" + all;
  }

  function say(text) { message = { text: text, t: 2.2 }; }

  Combat.hooks.onKill = function (e) {
    tally.kills++; tally.swingsToKill += e.swingsTaken || 0;
    run.kills++;
    if (e.slot) e.slot.dead = true;
  };

  // 画面に出ているキャラがダメージを受ける（e は攻撃した敵）
  function hurtActive(e) {
    if (choosing || A.inv > 0) return;
    var c = Party.current();
    var res = Battle.damage(e.patk, Party.eff(c, "pdef"), { element: "slash", res: null, crit: 0 });
    tally.hitsTaken++;
    Battle.showHit(A.x, A.y - 18, res, true);
    A.inv = 0.35;
    var fell = Party.hurtActive(res.amount);
    if (!fell && e.def.onHit && Math.random() < e.def.onHit.chance) Party.addStatus(c, e.def.onHit.type, e.def.onHit.dur);
    if (fell) {
      tally.downs++;
      if (Party.allDown()) finish("wipe"); else showChoose(c);
    }
  }

  // ---------- 更新 ----------
  function update(dt) {
    if (Input.pressed("menu")) { setPaused(true); return; }
    var c = Party.current();

    A.wait = Math.max(0, A.wait - dt);
    A.swing = Math.max(0, A.swing - dt);
    A.inv = Math.max(0, A.inv - dt);
    A.busy = Math.max(0, A.busy - dt);

    var asleep = !!c.status.sleep, para = !!c.status.para;
    var a = Input.axis();
    A.turn = Math.max(0, (A.turn || 0) - dt);
    if (Math.abs(a.x) > 0.05 || Math.abs(a.y) > 0.05) {
      var len = Math.sqrt(a.x * a.x + a.y * a.y);
      var nx = a.x / len, ny = a.y / len;
      if (!asleep && A.busy <= 0) {
        // ほぼ反対を押したら、その場で振り返ってから動き出す（すぐ反対へ走って敵にぶつからないように）
        var diff = Math.abs(Math.atan2(ny, nx) - Math.atan2(A.face.y, A.face.x));
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff > TURN_ANGLE) { A.turn = TURN_TIME; A.move = 0; }
        A.face = { x: nx, y: ny };
      }
      if (!asleep && !para && A.busy <= 0 && A.turn <= 0) {
        A.move = Math.min(1, (A.move || 0) + dt / ACCEL_TIME); // 少しずつ速くなる
        room.move(A, a.x * SPEED * A.move * dt, a.y * SPEED * A.move * dt);
        A.walk += dt * 8 * A.move;
      }
    } else {
      A.move = 0;
    }
    if (!asleep && A.busy <= 0) {
      if (Input.held("attack") && A.wait <= 0) Combat.normalAttack(c);
      ["skill1", "skill2", "skill3"].forEach(function (n, i) {
        if (!Input.pressed(n)) return;
        var id = c.skills[i];
        if (!id) { say("スキル" + (i + 1) + " にはなにもセットしていない"); return; }
        var why = Combat.useSkill(c, id);
        if (why) say(why);
      });
    }
    if (Input.pressed("switch")) {
      if (Party.switchCd() > 0) say("切りかえは あと " + Party.switchCd().toFixed(1) + " 秒");
      else if (!Party.switchNext()) say("切りかえられる仲間がいない");
      else say(Party.current().name + "（" + GameData.JOBS[Party.current().job].name + "）に切りかえ");
      updateButtons(true);
    }

    message.t = Math.max(0, message.t - dt);
    Party.tick(dt);
    Combat.update(dt);
    Enemies.update(dt, room, A, hurtActive, Combat.hooks.onKill);
    Enemies.list.forEach(function (e) { room.keepInside(e); });
    Battle.update(dt);
    if (run.over) return; // 倒れて冒険が終わったとき

    // となりの部屋へ
    var out = Dungeon.leftRoom(room, A);
    if (out) { enterRoom(Dungeon.neighbor(dg, curKey, out), Dungeon.DIRS[out].back); return; }

    // 出口：入るとクリア
    if (curKey === dg.exit) {
      var ex = dg.cells[curKey].center, edx = A.x - ex.x, edy = A.y - ex.y;
      if (edx * edx + edy * edy < 10 * 10) { finish("clear"); return; }
    }

    // 残り時間（ダンジョンに入ってから数える。一時停止・メニューのあいだは止まる）
    run.timeLeft -= dt;
    if (run.timeLeft <= 0) { run.timeLeft = 0; finish("timeout"); return; }

    updateCamera();
    updateButtons(false);
  }

  // 部屋が画面より大きいときは、キャラについていく。小さいときは、部屋を画面のまんなかに置く。
  function updateCamera() {
    if (room.pxW <= view.w) cam.x = -Math.round((view.w - room.pxW) / 2);
    else cam.x = Math.round(clamp(A.x - view.w / 2, 0, room.pxW - view.w));
    if (room.pxH <= view.h) cam.y = -Math.round((view.h - room.pxH) / 2);
    else cam.y = Math.round(clamp(A.y - view.h / 2, 0, room.pxH - view.h));
  }

  // ---------- 描画 ----------
  function draw() {
    Render.begin();
    room.draw(cam, view);
    if (curKey === dg.exit) drawExit();
    Enemies.draw(cam);
    drawActor();
    Combat.draw(cam);
    Battle.draw(cam);
    drawHud();
    if (run.fade > 0) Render.rect(0, 0, view.w, view.h, "rgba(0,0,0," + Math.min(1, run.fade / 0.3).toFixed(2) + ")");
  }

  // 出口（仮の絵）：光るまるい門
  var glow = 0;
  function drawExit() {
    var ex = dg.cells[curKey].center, ctx = Render.ctx;
    var x = Math.round(ex.x - cam.x), y = Math.round(ex.y - cam.y);
    var pulse = 0.5 + 0.5 * Math.sin(glow * 4);
    ctx.fillStyle = "rgba(242,193,78," + (0.25 + 0.25 * pulse).toFixed(2) + ")";
    ctx.beginPath(); ctx.arc(x, y, 13 + pulse * 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1a1408";
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#f2c14e"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke();
    Render.text("出口", x, y - 26, { size: 8, align: "center", bold: true, color: "#f2c14e" });
  }

  function bar(x, y, w, h, v, color) {
    Render.rect(x, y, w, h, "#2a2f42");
    Render.rect(x, y, Math.round(w * Math.max(0, Math.min(1, v))), h, color);
  }

  function drawHud() {
    var members = Party.members(), ai = Party.activeIndex(), c = Party.current();
    // 左上：今のキャラ
    Render.rect(4, 4, 124, 34, "rgba(10,12,18,0.72)");
    Render.text(c.name + "  " + GameData.JOBS[c.job].name + "  Lv" + c.level, 8, 6, { size: 8, color: "#f2c14e" });
    Render.text("HP " + Math.ceil(c.hp) + "/" + c.stats.hp, 124, 6, { size: 7, align: "right" });
    bar(8, 16, 116, 4, c.hp / c.stats.hp, c.hp / c.stats.hp < 0.3 ? "#ef5b5b" : "#6fd08c");
    Render.text("MP " + Math.floor(c.mp) + "/" + c.stats.mp, 124, 22, { size: 7, align: "right", color: "#a3c8ff" });
    bar(8, 23, 60, 3, c.mp / c.stats.mp, "#5aa9ff");
    var tags = Object.keys(c.status).map(function (k) { return GameData.STATUS[k].name; })
      .concat(c.buffs.map(function (b) { return buffName(b); }));
    if (tags.length) Render.text(tags.join(" "), 8, 29, { size: 6, color: "#ffe7a0" });

    // その下：待機中の2人
    var y = 42;
    members.forEach(function (m, i) {
      if (i === ai) return;
      Render.rect(4, y, 86, 14, "rgba(10,12,18,0.6)");
      Render.text(m.name + " " + GameData.JOBS[m.job].name, 7, y + 2, { size: 6, color: m.down ? "#ef5b5b" : "#ece7da" });
      if (m.down) Render.text("たおれた", 87, y + 2, { size: 6, align: "right", color: "#ef5b5b" });
      else { bar(7, y + 10, 50, 2, m.hp / m.stats.hp, "#6fd08c"); bar(60, y + 10, 27, 2, m.mp / m.stats.mp, "#5aa9ff"); }
      y += 16;
    });
    var sc = Party.switchCd();
    Render.text(sc > 0 ? "切りかえ あと" + sc.toFixed(1) + "秒" : "切りかえ OK", 7, y + 1, { size: 6, color: sc > 0 ? "#a3a8bd" : "#6fd08c" });

    // 上のまんなか：階層と残り時間（残り1分で赤くなり、点滅する）
    var tl = Math.ceil(run.timeLeft), mm = Math.floor(tl / 60), ss = tl % 60;
    var low = run.timeLeft <= 60;
    var tcol = low ? (Math.floor(run.timeLeft * 2) % 2 === 0 ? "#ef5b5b" : "#ffb0a8") : "#ece7da";
    Render.rect(view.w / 2 - 44, 3, 88, 24, "rgba(10,12,18,0.72)");
    Render.text("森 " + dg.floor + "階", view.w / 2, 5, { size: 7, align: "center", color: "#a3c88a" });
    Render.text("のこり " + mm + ":" + (ss < 10 ? "0" : "") + ss, view.w / 2, 13, { size: 11, align: "center", bold: true, color: tcol });

    // 右上（メニューのボタンの下）：小さな地図
    var mc = 9, mh = 6, mg = 3, ms = Dungeon.mapSize(mc, mh, mg);
    var mx = view.w - 6 - ms.w, my = 24;
    Render.rect(mx - 3, my - 3, ms.w + 6, ms.h + 6, "rgba(10,12,18,0.72)");
    Dungeon.drawMap(Render.ctx, dg, mx, my, mc, mh, mg, curKey);

    // ?debug=1 のときだけ：手ごたえの数
    if (debug) {
      var avg = tally.kills ? (tally.swingsToKill / tally.kills).toFixed(1) : "-";
      var tx = view.w - 6, ty = my + ms.h + 6;
      Render.text("1体に当てた回数（平均） " + avg, tx, ty, { size: 7, align: "right", color: "#a3a8bd" });
      Render.text("受けた攻撃 " + tally.hitsTaken + "回　たおれた " + tally.downs + "回", tx, ty + 9, { size: 7, align: "right", color: "#a3a8bd" });
    }

    if (message.t > 0) Render.text(message.text, view.w / 2, 34, { size: 9, align: "center", bold: true });

    // PC：スキルの名前と、使えるまでの時間
    if (!Input.isTouch) {
      var keys = ["U", "I", "O"], s = [];
      c.skills.forEach(function (id, i) {
        var sk = GameData.SKILL[id];
        if (!sk) { s.push(keys[i] + ":なし"); return; }
        var ct = c.ct[id] || 0;
        s.push(keys[i] + ":" + sk.name + (sk.once && c.used[id] ? "(使用済)" : ct > 0 ? "(" + ct.toFixed(0) + ")" : "") + " MP" + sk.mp);
      });
      Render.text(s.join("　"), view.w / 2, view.h - 22, { size: 7, align: "center", color: "#ffe7a0" });
      Render.text("移動 WASD/矢印　攻撃 J（押しっぱなしでも）　切替 K　メニュー Esc", view.w / 2, view.h - 11, { size: 7, align: "center", color: "#a3a8bd" });
    }
    if (debug) Render.text(fps.value + " fps", view.w - 6, view.h - 34, { size: 7, align: "right", color: "#6fd08c" });
  }

  function buffName(b) {
    var names = { patk: "物攻", pdef: "物防", mdef: "魔防", matk: "魔攻", wait: "待ち時間", crit: "会心" };
    return names[b.stat] + (b.pct > 0 ? "↑" : "↓");
  }

  function drawActor() {
    var c = Party.current();
    var px = Math.round(A.x - cam.x), py = Math.round(A.y - cam.y);
    var bob = Math.sin(A.walk) > 0 ? 1 : 0;
    var ctx = Render.ctx;
    if (A.inv > 0 && Math.floor(A.inv * 20) % 2 === 0) return;
    Render.rect(px - 6, py + 5, 12, 3, "rgba(0,0,0,0.35)");
    Render.rect(px - 5, py - 6 - bob, 10, 11, GameData.JOBS[c.job].color);
    Render.rect(px - 4, py - 12 - bob, 8, 7, "#f5d7b0");
    var ey = py - 10 - bob + (A.face.y < -0.5 ? -2 : 0);
    Render.rect(px - 4 + Math.round(A.face.x * 2), ey, 2, 2, "#11131b");
    Render.rect(px + 1 + Math.round(A.face.x * 2), ey, 2, 2, "#11131b");
    // 武器（仮の絵）
    var w = c.weapon;
    ctx.strokeStyle = w === "bow" ? "#a0703a" : w === "staff" ? "#c9a8ff" : w === "fist" ? "#f5d7b0" : "#c9ccd6";
    ctx.lineWidth = w === "greatsword" || w === "axe" ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(px + A.face.x * 4, py - 2 + A.face.y * 4); ctx.lineTo(px + A.face.x * (w === "fist" ? 7 : 11), py - 2 + A.face.y * (w === "fist" ? 7 : 11)); ctx.stroke();
    if (c.status.sleep) Render.text("Zz", px + 7, py - 20, { size: 7, color: "#b48cf0" });
    if (A.swing > 0) {
      var ang = Math.atan2(A.face.y, A.face.x);
      ctx.strokeStyle = A.swingColor; ctx.globalAlpha = Math.min(1, A.swing / 0.15);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(px, py - 3, A.swingReach, ang - A.swingArc, ang + A.swingArc); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (A.wait > 0) {
      var wt = GameData.WEAPONS[c.weapon].wait * Party.eff(c, "wait");
      bar(px - 8, py + 9, 16, 2, 1 - A.wait / wt, "#f2c14e");
    }
  }

  // ---------- iPad のボタンの文字（スキルの名前と、使えるまでの時間） ----------
  var btnEls = ["skill1", "skill2", "skill3"].map(function (n) { return document.querySelector('[data-act="' + n + '"]'); });
  var switchEl = document.querySelector('[data-act="switch"]');
  var lastLabels = ["", "", "", ""];
  function updateButtons(force) {
    var c = Party.current();
    btnEls.forEach(function (b, i) {
      var sk = GameData.SKILL[c.skills[i]];
      var ct = sk ? (c.ct[sk.id] || 0) : 0;
      var label = !sk ? "なし" : (sk.once && c.used[sk.id]) ? sk.short + "\n済" : ct > 0 ? sk.short + "\n" + Math.ceil(ct) : sk.short;
      var dim = !sk || ct > 0 || c.mp < sk.mp || (sk.once && c.used[sk.id]);
      if (force || label + dim !== lastLabels[i]) {
        b.textContent = label; b.classList.toggle("dim", !!dim); lastLabels[i] = label + dim;
      }
    });
    var sc = Party.switchCd();
    var sl = sc > 0 ? "切替\n" + Math.ceil(sc) : "切替";
    if (force || sl !== lastLabels[3]) { switchEl.textContent = sl; switchEl.classList.toggle("dim", sc > 0); lastLabels[3] = sl; }
  }

  // ---------- 倒れたときの選択・全滅 ----------
  var chooseEl = document.getElementById("choose");
  function showChoose(fallen) {
    choosing = true; A.down = true; Input.releaseAll();
    var box = document.getElementById("chooseList"); box.textContent = "";
    document.getElementById("chooseTitle").textContent = fallen.name + " はたおれた…";
    document.getElementById("chooseLead").textContent = "次に戦う仲間を選んでね";
    Party.members().forEach(function (m, i) {
      if (m.down) return;
      var b = document.createElement("button");
      b.type = "button"; b.className = "btn wide";
      b.textContent = m.name + "（" + GameData.JOBS[m.job].name + "）HP " + Math.ceil(m.hp) + "/" + m.stats.hp;
      b.addEventListener("click", function () {
        Party.switchTo(i); choosing = false; A.down = false; chooseEl.hidden = true; updateButtons(true);
      });
      box.appendChild(b);
    });
    chooseEl.hidden = false;
  }
  // 冒険の終わり：clear（出口に着いた）・timeout（時間切れ）・wipe（3人とも倒れた）
  function finish(kind) {
    if (run.over) return;
    run.over = true; choosing = true; A.down = true; Input.releaseAll();
    var titles = { clear: "森の " + dg.floor + " 階をクリア！", timeout: "時間切れ…", wipe: "3人ともたおれた…" };
    document.getElementById("chooseTitle").textContent = titles[kind];
    var tl = Math.ceil(run.timeLeft);
    var lines = [
      "たおした敵 " + run.kills + "体　通った部屋 " + finishedCells() + "　のこり時間 " + Math.floor(tl / 60) + ":" + (tl % 60 < 10 ? "0" : "") + (tl % 60),
      "知恵の試練の正解（テスト用の仮の値） " + settings.correct + "問",
      kind === "clear" ? "本番では、拾った物と経験値を持って拠点にもどり、次の日は次の階層へ（拠点とセーブは段階5）。"
        : "本番では、その日の冒険はここで終わり。拾った物と経験値は持ち帰れるが、階層は進まない。"
    ];
    var lead = document.getElementById("chooseLead"); lead.textContent = "";
    lines.forEach(function (t) { var d = document.createElement("div"); d.textContent = t; lead.appendChild(d); });
    var box = document.getElementById("chooseList"); box.textContent = "";
    function button(label, fn) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "btn wide"; b.textContent = label;
      b.addEventListener("click", function () { choosing = false; chooseEl.hidden = true; fn(); updateButtons(true); });
      box.appendChild(b);
    }
    if (kind === "clear" && dg.floor < 14) button("次の階層（" + (dg.floor + 1) + "階）へ（テスト）", function () { startFloor(dg.floor + 1); });
    button("同じ階層をもう一度（テスト・新しいつなぎ方）", function () { startFloor(dg.floor); });
    button("同じつなぎ方でもう一度（テスト）", function () { startFloor(dg.floor, dg.seed); });
    chooseEl.hidden = false;
  }

  // ---------- 一時停止とテスト用の設定 ----------
  var pauseEl = document.getElementById("pause");
  var rotateEl = document.getElementById("rotate");
  document.getElementById("resumeBtn").addEventListener("click", function () { setPaused(false); });
  window.addEventListener("keydown", function (e) { if (paused && (e.code === "Escape")) setPaused(false); });

  function setPaused(on) {
    paused = on;
    pauseEl.hidden = !on;
    Input.releaseAll();
    if (on) { drawBigMap(); buildTestPanel(); }
  }

  // メニューの大きな地図
  function drawBigMap() {
    var cv = document.getElementById("bigMap");
    var cw = 40, ch = 26, gap = 10, ms = Dungeon.mapSize(cw, ch, gap), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(ms.w * dpr); cv.height = Math.round(ms.h * dpr);
    cv.style.width = ms.w + "px"; cv.style.height = ms.h + "px";
    var ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ms.w, ms.h);
    Dungeon.drawMap(ctx, dg, 0, 0, cw, ch, gap, curKey);
    document.getElementById("floorInfo").textContent =
      "森 " + dg.floor + "階　（テスト用：この階層の seed は " + dg.seed + "。気になる階層があったら、この数字を教えてください）";
  }

  function option(sel, value, text, selected) {
    var o = document.createElement("option"); o.value = value; o.textContent = text; if (selected) o.selected = true; sel.appendChild(o);
  }
  function buildTestPanel() {
    var box = document.getElementById("testPanel"); box.textContent = "";
    var lv = document.getElementById("testLevel"); lv.textContent = "";
    [1, 5, 10, 20].forEach(function (l) { option(lv, l, "Lv" + l, l === testLevel); });
    var fl = document.getElementById("testFloor"); fl.textContent = "";
    for (var f = 1; f <= 14; f++) option(fl, f, f + "階" + (Dungeon.BOSS_FLOORS.indexOf(f) >= 0 ? "（ボス）" : ""), f === settings.floor);
    var co = document.getElementById("testCorrect"); co.textContent = "";
    for (var n = 0; n <= 4; n++) option(co, n, n + "問", n === settings.correct);
    var mi = document.getElementById("testMinutes"); mi.textContent = "";
    [1, 3, 5, 10].forEach(function (m) { option(mi, m, m + "分", m === settings.minutes); });
    document.getElementById("testSeed").value = settings.seed;
    setup.forEach(function (s, idx) {
      var row = document.createElement("div"); row.className = "test-row";
      var name = document.createElement("span"); name.className = "test-name"; name.textContent = s.name; row.appendChild(name);
      var job = document.createElement("select");
      GameData.JOB_ORDER.forEach(function (j) { option(job, j, GameData.JOBS[j].name, j === s.job); });
      var weapon = document.createElement("select");
      var skills = [document.createElement("select"), document.createElement("select"), document.createElement("select")];
      function fillWeapons() {
        weapon.textContent = "";
        GameData.JOBS[s.job].weapons.forEach(function (w) { option(weapon, w, GameData.WEAPONS[w].name, w === s.weapon); });
      }
      function fillSkills() {
        skills.forEach(function (sel, i) {
          sel.textContent = "";
          option(sel, "", "（なし）", !s.skills[i]);
          GameData.SKILLS.forEach(function (sk) {
            if (!GameData.canSet(sk, s.job, s.weapon)) return; // 条件に合わないスキルはセットできない
            option(sel, sk.id, GameData.JOBS[sk.job].name + "★" + sk.star + " " + sk.name, sk.id === s.skills[i]);
          });
        });
      }
      // 職業や武器を変えて条件に合わなくなったスキルは外す
      function dropInvalid() {
        var removed = [];
        s.skills = s.skills.map(function (id) {
          if (id && !GameData.canSet(GameData.SKILL[id], s.job, s.weapon)) { removed.push(GameData.SKILL[id].name); return null; }
          return id;
        });
        if (removed.length) document.getElementById("testNote").textContent = s.name + "：「" + removed.join("」「") + "」は条件に合わなくなったので外しました";
      }
      job.addEventListener("change", function () {
        s.job = job.value;
        if (GameData.JOBS[s.job].weapons.indexOf(s.weapon) < 0) s.weapon = GameData.JOBS[s.job].weapons[0];
        fillWeapons(); dropInvalid(); fillSkills();
      });
      weapon.addEventListener("change", function () { s.weapon = weapon.value; dropInvalid(); fillSkills(); });
      skills.forEach(function (sel, i) {
        sel.addEventListener("change", function () {
          var v = sel.value || null;
          if (v) s.skills = s.skills.map(function (id, k) { return k !== i && id === v ? null : id; }); // 同じスキルは1つだけ
          s.skills[i] = v; fillSkills();
        });
      });
      fillWeapons(); fillSkills();
      row.appendChild(job); row.appendChild(weapon);
      skills.forEach(function (sel) { row.appendChild(sel); });
      box.appendChild(row);
    });
    document.getElementById("testNote").textContent = "";
  }
  document.getElementById("testApply").addEventListener("click", function () {
    testLevel = Number(document.getElementById("testLevel").value) || 1;
    settings.correct = Number(document.getElementById("testCorrect").value) || 0;
    settings.minutes = Number(document.getElementById("testMinutes").value) || 5;
    settings.seed = String(document.getElementById("testSeed").value || "").replace(/[^0-9]/g, "");
    buildParty(); tally.kills = 0; tally.swingsToKill = 0; tally.hitsTaken = 0; tally.downs = 0;
    startFloor(Number(document.getElementById("testFloor").value) || 1, settings.seed ? Number(settings.seed) : 0);
    setPaused(false); updateButtons(true);
  });

  function checkRotate() {
    var portrait = window.innerHeight > window.innerWidth;
    rotateEl.hidden = !(Input.isTouch && portrait);
  }
  window.addEventListener("resize", checkRotate);
  checkRotate();
  document.addEventListener("visibilitychange", function () { if (document.hidden && !paused) setPaused(true); });
  startFloor(1);
  updateButtons(true);

  // ---------- 毎フレーム ----------
  var last = 0;
  function frame(t) {
    var dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t;
    fps.n++; fps.t += dt;
    if (fps.t >= 0.5) { fps.value = Math.round(fps.n / fps.t); fps.n = 0; fps.t = 0; }
    glow += dt;
    if (run.fade > 0) run.fade = Math.max(0, run.fade - dt);
    if (!paused && !choosing && rotateEl.hidden) update(dt);
    draw();
    Input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ?debug=1 のときだけ、確かめるために中を見たり1フレームずつ進めたりできるようにする
  if (debug) {
    window.__game = {
      actor: A, cam: cam, tally: tally, setup: setup, settings: settings,
      room: function () { return room; }, dungeon: function () { return dg; }, cur: function () { return curKey; }, run: function () { return run; },
      step: function (dt) { if (!paused && !choosing) update(dt); draw(); Input.endFrame(); },
      start: startFloor, enter: enterRoom,
      rebuild: function (lv) { testLevel = lv || 1; buildParty(); startFloor(settings.floor); },
      state: function () { return { paused: paused, choosing: choosing }; }
    };
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
})();
