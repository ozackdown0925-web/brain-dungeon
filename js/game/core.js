// ゲームの流れ：毎フレームの更新と描画、一時停止、横向きの案内。
// 段階3（パーティと職業）：3人を切りかえながら、ゴブリンの部隊とつる草の魔物と戦う。
// 職業・武器・スキル・レベルは、一時停止の画面の「テスト用の設定」で変えられる（キャラクリと拠点は段階5で作る）。
(function () {
  var view = Render.view;
  var room = World.testRoom();
  var SPEED = 72; // 1秒に進むドット数
  var A = Party.actor;
  A.x = 6 * World.TILE; A.y = 11 * World.TILE;

  // ---------- テスト用のパーティ ----------
  var setup = [
    { name: "アレン", job: "warrior", weapon: "sword",  skills: ["w.spin", "w.rush", "w.focus"] },
    { name: "ミラ",   job: "mage",    weapon: "staff",  skills: ["m.fire", "m.aqua", "m.sleep"] },
    { name: "ロイ",   job: "hunter",  weapon: "bow",    skills: ["h.triple", "h.poison", "h.para"] }
  ];
  var testLevel = 1;
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

  // ---------- 敵の部隊 ----------
  var waveT = 0, wave = 0;
  function spawnWave() {
    wave++;
    var cx = 24 * World.TILE, cy = 11 * World.TILE; // 仮の部屋の、まわりに壁のない場所
    Enemies.spawn("goblin_sword", cx - 40, cy - 16);
    Enemies.spawn("goblin_spear", cx - 10, cy + 20);
    Enemies.spawn("goblin_archer", cx + 50, cy);
    Enemies.spawn("vine", cx + 10, cy - 50);
    if (wave % 2 === 0) Enemies.spawn("goblin_sword", cx - 40, cy + 40);
    say("ゴブリンの部隊があらわれた！");
  }
  function resetBattle() {
    Enemies.clear(); Combat.clear();
    Party.resetAll();
    A.x = 6 * World.TILE; A.y = 11 * World.TILE; A.inv = 1; A.wait = 0; A.busy = 0;
    wave = 0; waveT = 0;
    spawnWave();
  }
  spawnWave();

  function say(text) { message = { text: text, t: 2.2 }; }

  Combat.hooks.room = room;
  Combat.hooks.onKill = function (e) { tally.kills++; tally.swingsToKill += e.swingsTaken || 0; };

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
      if (Party.allDown()) showWipe(); else showChoose(c);
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
    if (Math.abs(a.x) > 0.05 || Math.abs(a.y) > 0.05) {
      var len = Math.sqrt(a.x * a.x + a.y * a.y);
      if (!asleep && A.busy <= 0) A.face = { x: a.x / len, y: a.y / len };
      if (!asleep && !para && A.busy <= 0) {
        room.move(A, a.x * SPEED * dt, a.y * SPEED * dt);
        A.walk += dt * 8;
      }
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
    Battle.update(dt);

    if (Enemies.alive().length === 0 && Enemies.list.length === 0) {
      if (waveT <= 0) { waveT = 2.5; say("たおした！ 次の部隊が来る…"); }
      waveT -= dt;
      if (waveT <= 0.0001) { waveT = 0; spawnWave(); }
    }

    cam.x = Math.round(clamp(A.x - view.w / 2, 0, Math.max(0, room.pxW - view.w)));
    cam.y = Math.round(clamp(A.y - view.h / 2, 0, Math.max(0, room.pxH - view.h)));
    updateButtons(false);
  }

  // ---------- 描画 ----------
  function draw() {
    Render.begin();
    room.draw(cam, view);
    Enemies.draw(cam);
    drawActor();
    Combat.draw(cam);
    Battle.draw(cam);
    drawHud();
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

    // 右上：手ごたえの数
    var avg = tally.kills ? (tally.swingsToKill / tally.kills).toFixed(1) : "-";
    var tx = view.w - 6, ty = 24; // 右上のメニューのボタンの下
    Render.text("1体に当てた回数（平均） " + avg, tx, ty, { size: 7, align: "right", color: "#a3a8bd" });
    Render.text("受けた攻撃 " + tally.hitsTaken + "回　たおれた " + tally.downs + "回", tx, ty + 9, { size: 7, align: "right", color: "#a3a8bd" });

    if (message.t > 0) Render.text(message.text, view.w / 2, 30, { size: 9, align: "center", bold: true });

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
  function showWipe() {
    choosing = true; A.down = true; Input.releaseAll();
    document.getElementById("chooseTitle").textContent = "3人ともたおれた…";
    document.getElementById("chooseLead").textContent = "本番では、ここでその日の冒険が終わる（拾った物と経験値は持ち帰り）。";
    var box = document.getElementById("chooseList"); box.textContent = "";
    var b = document.createElement("button");
    b.type = "button"; b.className = "btn wide"; b.textContent = "もう一度（テスト）";
    b.addEventListener("click", function () { choosing = false; A.down = false; chooseEl.hidden = true; resetBattle(); updateButtons(true); });
    box.appendChild(b);
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
    if (on) buildTestPanel();
  }

  function option(sel, value, text, selected) {
    var o = document.createElement("option"); o.value = value; o.textContent = text; if (selected) o.selected = true; sel.appendChild(o);
  }
  function buildTestPanel() {
    var box = document.getElementById("testPanel"); box.textContent = "";
    var lv = document.getElementById("testLevel"); lv.textContent = "";
    [1, 5, 10, 20].forEach(function (l) { option(lv, l, "Lv" + l, l === testLevel); });
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
    buildParty(); resetBattle(); tally.kills = 0; tally.swingsToKill = 0; tally.hitsTaken = 0; tally.downs = 0;
    setPaused(false); updateButtons(true);
    say("テスト用の設定ではじめから");
  });

  function checkRotate() {
    var portrait = window.innerHeight > window.innerWidth;
    rotateEl.hidden = !(Input.isTouch && portrait);
  }
  window.addEventListener("resize", checkRotate);
  checkRotate();
  document.addEventListener("visibilitychange", function () { if (document.hidden && !paused) setPaused(true); });
  updateButtons(true);

  // ---------- 毎フレーム ----------
  var last = 0;
  function frame(t) {
    var dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t;
    fps.n++; fps.t += dt;
    if (fps.t >= 0.5) { fps.value = Math.round(fps.n / fps.t); fps.n = 0; fps.t = 0; }
    if (!paused && !choosing && rotateEl.hidden) update(dt);
    draw();
    Input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ?debug=1 のときだけ、確かめるために中を見たり1フレームずつ進めたりできるようにする
  if (debug) {
    window.__game = {
      actor: A, cam: cam, room: room, tally: tally, setup: setup,
      step: function (dt) { if (!paused && !choosing) update(dt); draw(); Input.endFrame(); },
      reset: resetBattle, rebuild: function (lv) { testLevel = lv || 1; buildParty(); resetBattle(); },
      state: function () { return { paused: paused, choosing: choosing }; }
    };
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
})();
