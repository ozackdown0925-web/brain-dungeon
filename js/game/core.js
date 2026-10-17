// ゲームの流れ：毎フレームの更新と描画、一時停止、横向きの案内。
// 段階4（ダンジョン）：seed でつないだ森の部屋を通って、出口をめざす。残り時間と地図つき。
// 4-2：鍵と扉、罠（毒の沼・落とし穴。一部は踏むまで見えない）、宝箱、敵が落とすゴールドと素材。
// 4-3：7階と14階はボスの階層（入口 → 敵の部屋 → ボスの部屋）。ボスをたおすと宝箱と出口が現れる。
// 段階5-1：拠点（base.js）から出発し、冒険が終わると拠点にもどる。経験値・熟練度・拾った物は、もどったときにまとめて入る（state.js）。
// テスト用の設定（正解数・冒険の時間・seed・レベル）は、拠点の画面にある。
(function () {
  var view = Render.view;
  var room = null;          // 今いる部屋
  var dg = null;            // 今の階層（Dungeon.generate の結果）
  var curKey = null;        // 今いる部屋の場所（地図のマス）
  var SPEED = 52;       // 1秒に進むドット数（保護者の感想で 72 → 52 に下げた）
  var ACCEL_TIME = 0.12; // 止まっている状態から、この秒数をかけて全速になる
  var TURN_TIME = 0.15;  // 大きく向きを変える（ほぼ反対を押す）ときは、この秒数その場で振り返ってから動く
  var CLEAR_SPEED = 2; // 敵を全滅させた部屋では、武器をしまって、この倍の速さで走る（2026-10-17 保護者の案）
  var TURN_ANGLE = 1.9;  // これより大きく向きが変わったら「振り返り」（ラジアン。約110度）
  var A = Party.actor;
  A.x = 6 * World.TILE; A.y = 11 * World.TILE;

  // テスト用の設定（拠点の画面で変える）。correct は知恵の試練の正解数の仮の値（段階6で本物の結果に置きかえる）
  var settings = { floor: 1, correct: 2, minutes: 5, seed: "" };
  var run = newRun();
  function newRun() {
    return { timeLeft: settings.minutes * 60, kills: 0, over: false, fade: 0, entry: null,
             gold: 0, clearGold: 0, mat: { iron: 0, stone: 0 }, got: [], swampCd: 0, lockMsg: 0, inPit: false,
             exp: [0, 0, 0], mastery: [0, 0, 0], byType: {} };
  }
  var active = false; // ダンジョンにいるあいだ true（拠点にいるあいだは止める）

  var cam = { x: 0, y: 0 };
  var paused = false, choosing = false;
  var debug = /[?&]debug=1/.test(location.search);
  var fps = { n: 0, t: 0, value: 0 };
  var message = { text: "", t: 0 };
  var tally = { kills: 0, swingsToKill: 0, hitsTaken: 0, downs: 0 };

  // ---------- 階層と部屋 ----------
  // 階層に入る：毎日の出発と同じく、HP・MP は全快。seed を省くと新しいつなぎ方。
  // resume：途中で閉じた冒険の控え（GameState.adventure()）。あれば、その続きを「階層の入口から」始める（段階5-3）
  // trial：{ correct（正解数）, subjects（正解した教科＝加護）, test（テスト用の出発） }
  var trial = { correct: 0, subjects: [], test: true };
  function startFloor(floor, seed, resume) {
    settings.floor = floor;
    dg = Dungeon.generate(floor, seed || Dungeon.newSeed());
    Party.setup(GameState.get().party.map(function (h) { return Party.fromHero(h); }));
    Party.resetAll();
    applyBlessings(trial.subjects);
    active = true; paused = false; choosing = false;
    pauseEl.hidden = true; chooseEl.hidden = true;
    A.wait = 0; A.busy = 0; A.down = false; A.move = 0;
    run = newRun();
    if (resume) applyResume(resume);
    enterRoom(dg.start, null);
    if (resume) say("森の " + floor + " 階　続きから（入口にもどった）");
    else say(dg.boss ? "森の " + floor + " 階　この先に、ボスがいる…！" : "森の " + floor + " 階　出口をめざそう！");
    saveTimer = 0;
    snapshot();
    if (!resume && !trial.tryMode && window.Sync) Sync.save("", ""); // 階に入るとき（区切り）に GAS へ
  }

  // 知恵の試練で正解した教科の加護：その日の冒険だけ、算数→物攻、国語→魔攻、理科→物防・魔防、社会→HP・MP を ＋10%
  function applyBlessings(subjects) {
    var up = { math: ["patk"], japanese: ["matk"], science: ["pdef", "mdef"], social: ["hp", "mp"] };
    Party.members().forEach(function (m) {
      (subjects || []).forEach(function (s) { (up[s] || []).forEach(function (k) { m.stats[k] = Math.round(m.stats[k] * 1.1); }); });
      m.hp = m.stats.hp; m.mp = m.stats.mp;
    });
  }

  // ---------- 冒険の途中の控え（段階5-3） ----------
  // 再開は「その階層の入口から」：部屋のつなぎ方は同じ（seed）。拾った物・経験値はそのまま。開けた宝箱は開いたまま、たおした敵は元にもどる。
  var saveTimer = 0;
  function snapshot() {
    if (!dg || !active || run.over) return;
    var opened = [], found = [];
    Object.keys(dg.cells).forEach(function (k) {
      var c = dg.cells[k];
      c.chests.forEach(function (b, i) { if (b.opened) opened.push(k + "#" + i); });
      c.traps.forEach(function (t, i) { if (t.found) found.push(k + "#" + i); });
    });
    var keyTaken = Object.keys(dg.cells).some(function (k) { return dg.cells[k].key && dg.cells[k].key.taken; });
    GameState.setAdventure({
      state: "playing", dungeon: "forest1", floor: dg.floor, seed: dg.seed, correct: settings.correct, subjects: trial.subjects, test: !!trial.test, tryMode: !!trial.tryMode,
      timeLeft: Math.max(0, run.timeLeft), opened: opened, found: found, keyTaken: keyTaken, hasKey: !!dg.hasKey,
      lockOpen: !!(dg.lock && dg.lock.open), bossDown: !!dg.bossDown,
      run: { gold: run.gold, mat: run.mat, got: run.got, exp: run.exp, mastery: run.mastery, byType: run.byType, kills: run.kills, title: run.title || null },
      party: Party.members().map(function (m) { return { hp: m.hp, mp: m.mp, down: m.down }; })
    });
  }
  function applyResume(a) {
    run.timeLeft = a.timeLeft;
    var r = a.run;
    run.gold = r.gold; run.mat = r.mat; run.got = r.got; run.exp = r.exp; run.mastery = r.mastery; run.byType = r.byType; run.kills = r.kills;
    if (r.title) run.title = r.title;
    if (dg.boss && a.bossDown) {
      // ボスはもういない。ごほうびの宝箱（2つ）と出口がある
      var bc = dg.cells[dg.exit];
      dg.bossDown = true; dg.bossMet = true;
      bc.enemies.forEach(function (s) { s.dead = true; });
      bc.chests.push({ x: bc.center.x - 60, y: bc.center.y - 22, opened: false, rare: true });
      bc.chests.push({ x: bc.center.x - 60, y: bc.center.y + 22, opened: false, rare: true });
    } else if (dg.boss) {
      dg.bossMet = false; // ボスの前の文章を、もう一度出す
    }
    a.opened.forEach(function (id) { var p = id.split("#"), c = dg.cells[p[0]]; if (c && c.chests[+p[1]]) c.chests[+p[1]].opened = true; });
    a.found.forEach(function (id) { var p = id.split("#"), c = dg.cells[p[0]]; if (c && c.traps[+p[1]]) c.traps[+p[1]].found = true; });
    if (a.keyTaken) Object.keys(dg.cells).forEach(function (k) { if (dg.cells[k].key) dg.cells[k].key.taken = true; });
    dg.hasKey = !!a.hasKey;
    if (a.lockOpen && dg.lock) {
      dg.lock.open = true;
      var pc = dg.cells[dg.lock.parent];
      Dungeon.doorTiles(pc.room.w, pc.room.h, dg.lock.dir).forEach(function (p) { pc.room.setTile(p.x, p.y, ":"); });
    }
    Party.members().forEach(function (m, i) {
      var s = a.party[i]; if (!s) return;
      m.hp = Math.min(m.stats.hp, s.hp); m.mp = Math.min(m.stats.mp, s.mp); m.down = !!s.down;
    });
    // 今の仲間が倒れていたら、倒れていない仲間から始める
    var ms = Party.members();
    if (ms[Party.activeIndex()].down) for (var i = 0; i < ms.length; i++) if (!ms[i].down) { Party.switchTo(i); break; }
  }
  // 控えから、拠点で受け取る結果を作る（日付が変わっていたとき・やめたとき）
  function resultFromSnapshot(a, kind) {
    return { exp: a.run.exp, mastery: a.run.mastery, gold: a.run.gold, mat: a.run.mat, items: a.run.got, title: a.run.title,
             floor: a.floor, cleared: false, boss: a.floor === 7 || a.floor === 14, kills: a.run.byType, kind: kind, test: !!a.test, tryMode: !!a.tryMode,
             correct: a.correct || 0, subjects: a.subjects || [] };
  }

  // 部屋に入る。fromDir は入ってきた道の向き（n/s/w/e）、null なら部屋のまんなか（入口の部屋）。
  function enterRoom(k, fromDir) {
    curKey = k;
    var c = dg.cells[k];
    c.visited = true;
    room = c.room;
    Combat.hooks.room = room;
    Enemies.clear(); Combat.clear(); Battle.clear();
    boss = null;
    var p = fromDir ? Dungeon.entryPoint(room, fromDir) : { x: c.center.x, y: c.center.y + 20, face: { x: 0, y: 1 } };
    A.x = p.x; A.y = p.y; A.face = p.face; A.move = 0; A.turn = 0; A.running = false;
    run.entry = { x: p.x, y: p.y, face: p.face }; // 落とし穴に落ちたら、ここへもどる
    run.inPit = false;
    A.inv = 0.6; // 部屋に入った直後は少しだけ無敵
    // たおした敵はもどらない。まだいる敵は、もとの場所に HP 満タンでいる。
    var lv = 0;
    Party.members().forEach(function (m) { lv += m.level; });
    var avg = lv / Party.members().length;
    var depth = Dungeon.enemyDepth(dg.floor, avg);
    // ボスの強さは決まった数字。レベルが高すぎるときだけ、ふつうの敵と同じく少し強くする
    var bossDepth = 1 + Math.max(0, avg - (1 + 0.7 * (dg.floor - 1))) / 2;
    c.enemies.forEach(function (slot) {
      if (slot.dead) return;
      var e = Enemies.spawn(slot.type, slot.x, slot.y, slot.boss ? bossDepth : depth);
      GameState.noteSeen(slot.type); // 図鑑：たたかった敵
      e.slot = slot;
      if (slot.boss) { e.face = { x: -1, y: 0 }; boss = e; }
    });
    run.fade = 0.3;
    snapshot();
    // ボスの部屋：入るとつるが道をふさぎ、短い文章が出る
    if (c.bossCell && !dg.bossDown) {
      setDoor(c, "w", "V");
      if (!dg.bossMet) {
        dg.bossMet = true; Sound.bgm("boss");
        showStory(GameData.ENEMIES[dg.bossInfo.enemy].name, dg.bossInfo.before, "たたかう！", function () { say("つるが道をふさいだ！"); });
      }
    }
  }
  var boss = null; // 今の部屋のボス（いなければ null）

  function setDoor(c, dir, ch) {
    Dungeon.doorTiles(c.room.w, c.room.h, dir).forEach(function (p) { c.room.setTile(p.x, p.y, ch); });
  }

  // 短い文章（ボスの前後）。読んでいるあいだはゲームが止まる
  function showStory(title, lines, label, then) {
    choosing = true; Input.releaseAll();
    document.getElementById("chooseTitle").textContent = title;
    var lead = document.getElementById("chooseLead"); lead.textContent = "";
    lines.forEach(function (t) { var d = document.createElement("div"); d.className = "story"; d.textContent = t; lead.appendChild(d); });
    var box = document.getElementById("chooseList"); box.textContent = "";
    var b = document.createElement("button");
    b.type = "button"; b.className = "btn wide"; b.textContent = label;
    b.addEventListener("click", function () { choosing = false; chooseEl.hidden = true; updateButtons(true); if (then) then(); });
    box.appendChild(b);
    chooseEl.hidden = false;
  }

  // ボスをたおした：子オオカミは逃げ、つるが消え、ごほうびの宝箱（レア以上）2つと出口が現れる
  function bossDefeated(e) {
    dg.bossDown = true; boss = null;
    Bosses.bossDown();
    Enemies.alive().forEach(function (o) { if (o.type === "wolf_pup") { o.dead = true; o.fade = 0.4; } });
    var c = dg.cells[curKey];
    setDoor(c, "w", ":");
    c.chests.push({ x: c.center.x - 60, y: c.center.y - 22, opened: false, rare: true });
    c.chests.push({ x: c.center.x - 60, y: c.center.y + 22, opened: false, rare: true });
    // ボスのごほうび：素材5つ・ゴールド（たたき台にない数なので仮：100＋10×階層）・称号
    for (var i = 0; i < 5; i++) run.mat[Math.random() < 0.6 ? "iron" : "stone"]++;
    var g = 100 + 10 * dg.floor;
    run.gold += g;
    run.title = dg.bossInfo.title;
    Battle.pop(e.x, e.y - 40, "+" + g + "G", "#f2c14e", 9);
    var after = dg.bossInfo.after.concat(["", "称号「" + dg.bossInfo.title + "」を手に入れた！", "宝箱を開けて、出口へ進もう。"]);
    showStory(GameData.ENEMIES[e.type].name + "をたおした！", after, "つづける", null);
    snapshot();
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
    run.byType[e.type] = (run.byType[e.type] || 0) + 1;
    // 経験値と熟練度：倒れていない3人に同じだけ（docs/draft.md 1.1：1体 2＋0.6×深さ、熟練度 1。ボスは10体分）
    if (!e.summoned) {
      // ボスは10体分。ふつうの敵は、敵を増やしたぶん Dungeon.rewardScale 倍（1階層の合計は前と同じ）
      var k = e.def.boss ? 10 : Dungeon.rewardScale(dg.floor);
      Party.members().forEach(function (m, i) {
        if (m.down) return;
        run.exp[i] += (2 + 0.6 * dg.floor) * k;
        run.mastery[i] += k;
      });
    }
    if (e.def.boss) { bossDefeated(e); return; }
    if (e.summoned) return; // 子オオカミは何も落とさない
    // 敵が落とすもの：ゴールドと素材だけ（装備は宝箱・ボス・お店・鍛冶屋から）
    var drop = Loot.enemyDrop(e.type, dg.floor);
    run.gold += drop.gold;
    if (drop.gold) Battle.pop(e.x, e.y - 30, "+" + drop.gold + "G", "#f2c14e", 7);
    if (drop.mat) { run.mat[drop.mat]++; Battle.pop(e.x, e.y - 40, Loot.MATERIALS[drop.mat] + " +1", "#cfd6e6", 7); }
  };

  // 画面に出ているキャラがダメージを受ける（e は攻撃した敵）
  // opts：{ mult（攻撃の倍率）, big（かわす大技）, noDamage（ダメージなし）, status（{ type, chance, dur }）}
  function hurtActive(e, x, y, opts) {
    if (choosing || A.inv > 0) return;
    opts = opts || {};
    var c = Party.current();
    if (opts.noDamage) {
      if (opts.status && Math.random() < opts.status.chance) Party.addStatus(c, opts.status.type, opts.status.dur);
      return;
    }
    var res = Battle.damage(e.patk * (opts.mult || 1), Party.eff(c, "pdef"), { element: "slash", res: null, crit: 0 });
    tally.hitsTaken++;
    Battle.showHit(A.x, A.y - 18, res, true);
    if (opts.big) Battle.pop(A.x, A.y - 40, "大ダメージ！", "#ef5b5b", 9);
    A.inv = opts.big ? 0.8 : 0.35;
    var fell = Party.hurtActive(res.amount);
    var st = opts.status || e.def.onHit;
    if (!fell && st && Math.random() < st.chance) Party.addStatus(c, st.type, st.dur);
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
    A.running = Enemies.alive().length === 0; // 部屋の敵を全滅させたら走る
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
        // 部屋の敵を全滅させたら、武器をしまって走る（探索しやすいように。2026-10-17）
        var sp = SPEED * (A.running ? CLEAR_SPEED : 1);
        Enemies.moveBlocked(room, A, a.x * sp * A.move * dt, a.y * sp * A.move * dt); // 敵はすり抜けない
        A.walk += dt * 8 * A.move * (A.running ? 1.8 : 1);
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

    // 鍵・宝箱・鍵の扉・罠
    if (checkThings(dt)) return;

    // 出口：入るとクリア
    if (curKey === dg.exit && (!dg.boss || dg.bossDown)) {
      var ex = dg.cells[curKey].center, edx = A.x - ex.x, edy = A.y - ex.y;
      if (edx * edx + edy * edy < 10 * 10) { finish("clear"); return; }
    }

    // 残り時間（ダンジョンに入ってから数える。一時停止・メニューのあいだは止まる）
    run.timeLeft -= dt;
    if (run.timeLeft <= 0) { run.timeLeft = 0; finish("timeout"); return; }
    saveTimer += dt;
    if (saveTimer >= 5) { saveTimer = 0; snapshot(); } // 5秒ごとに控える（敵をたおした数・残り時間）

    updateCamera();
    updateButtons(false);
  }

  // 部屋の中の物にふれたか。部屋の入口にもどされたら true
  function checkThings(dt) {
    var c = dg.cells[curKey], T = World.TILE;
    run.swampCd = Math.max(0, run.swampCd - dt);
    run.lockMsg = Math.max(0, run.lockMsg - dt);
    function near(x, y, r) { var dx = A.x - x, dy = A.y - y; return dx * dx + dy * dy < r * r; }

    if (c.key && !c.key.taken && near(c.key.x, c.key.y, 12)) {
      c.key.taken = true; dg.hasKey = true;
      say("鍵を手に入れた！ 鍵のかかった扉をさがそう"); snapshot();
      Battle.pop(A.x, A.y - 30, "鍵", "#ffe066", 9);
    }
    c.chests.forEach(function (b) {
      if (b.opened || !near(b.x, b.y, 14)) return;
      b.opened = true;
      var got = Loot.chest(dg.floor, settings.correct, b.rare);
      run.got.push(got.equip);
      run.gold += got.gold;
      Object.keys(got.mat).forEach(function (m) { run.mat[m] += got.mat[m]; });
      var R = Loot.RARITY[got.equip.r];
      say("宝箱：" + R.name + "の " + got.equip.name + " を手に入れた！"); snapshot();
      Battle.pop(b.x, b.y - 22, R.name + "！", R.color, 10);
      Battle.pop(b.x, b.y - 34, "+" + got.gold + "G", "#f2c14e", 7);
    });
    // 鍵のかかった扉：鍵を持っていれば、近づくと開く
    if (dg.lock && !dg.lock.open && curKey === dg.lock.parent) {
      var dt3 = Dungeon.doorTiles(room.w, room.h, dg.lock.dir), mid = dt3[1];
      if (near(mid.x * T + 8, mid.y * T + 8, 26)) {
        if (dg.hasKey) {
          dg.lock.open = true; dg.hasKey = false;
          dt3.forEach(function (p) { room.setTile(p.x, p.y, ":"); });
          say("鍵で扉を開けた！"); snapshot();
        } else if (run.lockMsg <= 0) {
          say("鍵がかかっている。どこかの部屋に鍵があるはず");
          run.lockMsg = 3;
        }
      }
    }
    // 罠：立っているタイルで調べる
    var tx = Math.floor(A.x / T), ty = Math.floor(A.y / T), onPit = false;
    for (var i = 0; i < c.traps.length; i++) {
      var t = c.traps[i];
      if (tx < t.tx || ty < t.ty || tx >= t.tx + t.w || ty >= t.ty + t.h) continue;
      if (t.hidden && !t.found) { t.found = true; Battle.pop(A.x, A.y - 40, "隠れた罠！", "#c86ae0", 8); snapshot(); }
      var ch = Party.current();
      if (t.type === "swamp") {
        if (!ch.status.poison && run.swampCd <= 0) {
          Party.addStatus(ch, "poison", 8);
          run.swampCd = 1.5;
          say("毒の沼だ！");
        }
      } else {
        onPit = true;
        if (!run.inPit) {
          // 落とし穴：少しダメージ（最大HPの10%。これで倒れることはない）＋部屋の入口へ（2026-10-17 決定）
          var dmg = Math.max(1, Math.round(ch.stats.hp * 0.1));
          ch.hp = Math.max(1, ch.hp - dmg);
          A.x = run.entry.x; A.y = run.entry.y; A.face = run.entry.face; A.move = 0;
          A.inv = Math.max(A.inv, 0.6);
          run.fade = 0.3;
          say("落とし穴に落ちた！ 部屋の入口にもどされた");
          Battle.pop(A.x, A.y - 28, String(dmg), "#ef5b5b", 9);
          return true;
        }
      }
    }
    run.inPit = onPit;
    return false;
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
    drawThings();
    if (curKey === dg.exit && (!dg.boss || dg.bossDown)) drawExit();
    Enemies.draw(cam);
    drawActor();
    Combat.draw(cam);
    Battle.draw(cam);
    drawHud();
    if (run.fade > 0) Render.rect(0, 0, view.w, view.h, "rgba(0,0,0," + Math.min(1, run.fade / 0.3).toFixed(2) + ")");
  }

  // 罠・宝箱・鍵（仮の絵）
  function drawThings() {
    var c = dg.cells[curKey], T = World.TILE;
    c.traps.forEach(function (t) {
      if (t.hidden && !t.found) return;
      var x = t.tx * T - cam.x, y = t.ty * T - cam.y;
      if (t.type === "pit") {
        Render.rect(x + 1, y + 1, T - 2, T - 2, "#5a4630");
        Render.rect(x + 3, y + 3, T - 6, T - 6, "#0b0906");
      } else {
        Render.rect(x, y, t.w * T, t.h * T, "rgba(120,60,140,0.75)");
        var b = Math.floor(glow * 2) % 3;
        Render.rect(x + 6 + b * 5, y + 8, 3, 3, "#c89ae0");
        Render.rect(x + 18 - b * 3, y + 20, 2, 2, "#c89ae0");
      }
    });
    c.chests.forEach(function (b) {
      var x = Math.round(b.x - cam.x), y = Math.round(b.y - cam.y);
      var trim = b.rare ? "#f2c14e" : "#c9a060";
      if (b.opened) {
        Render.rect(x - 7, y - 3, 14, 9, "#4a3018"); Render.rect(x - 7, y - 8, 14, 4, "#6e4a26"); Render.rect(x - 6, y - 2, 12, 3, "#140c04");
      } else {
        Render.rect(x - 7, y - 6, 14, 12, "#8a5a2a"); Render.rect(x - 7, y - 1, 14, 2, trim);
        Render.rect(x - 1, y - 2, 3, 4, trim); Render.rect(x - 7, y - 6, 14, 1, "#a8743a");
        if (b.rare) { var s = 0.5 + 0.5 * Math.sin(glow * 5); Render.rect(x + 7, y - 10, 2, 2, "rgba(255,240,160," + s.toFixed(2) + ")"); }
      }
    });
    if (c.key && !c.key.taken) {
      var kx = Math.round(c.key.x - cam.x), ky = Math.round(c.key.y - cam.y - 2 - Math.sin(glow * 3) * 2);
      Render.rect(kx - 5, ky - 3, 5, 5, "#ffe066"); Render.rect(kx - 4, ky - 2, 3, 3, "#3a3010");
      Render.rect(kx, ky - 1, 7, 2, "#ffe066"); Render.rect(kx + 4, ky + 1, 2, 2, "#ffe066");
    }
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
    // 手に入れたもの
    Render.text(run.gold + "G　鉄" + run.mat.iron + "　魔石" + run.mat.stone + "　装備" + run.got.length, 7, y + 10, { size: 6, color: "#f2c14e" });
    if (dg.hasKey) Render.text("鍵を持っている", 7, y + 19, { size: 6, color: "#ffe066" });
    var yy = y + (dg.hasKey ? 28 : 19);
    if (trial.subjects.length) { Render.text("加護：" + trial.subjects.map(function (s) { return Trial.BLESS[s].name; }).join("・"), 7, yy, { size: 6, color: "#b6e3ff" }); yy += 9; }
    if (trial.tryMode) Render.text("試しモード（記録に残らない）", 7, yy, { size: 6, color: "#ffb36b" });

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

    // ボスの HP（画面の上に大きく）
    var my2 = 34;
    if (boss && !boss.dead) {
      var bw = Math.min(220, view.w - 260);
      Render.rect(view.w / 2 - bw / 2 - 3, 29, bw + 6, 17, "rgba(10,12,18,0.72)");
      Render.text(boss.def.name, view.w / 2, 30, { size: 7, align: "center", bold: true, color: "#ffb0a8" });
      bar(view.w / 2 - bw / 2, 39, bw, 5, boss.hp / boss.maxHp, "#ef5b5b");
      my2 = 50;
    }
    if (message.t > 0) Render.text(message.text, view.w / 2, my2, { size: 9, align: "center", bold: true });

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
    var ctx = Render.ctx;
    if (A.inv > 0 && Math.floor(A.inv * 20) % 2 === 0) return;
    Render.rect(px - 6, py + 5, 12, 3, "rgba(0,0,0,0.35)");
    // 段階7-2b：ドット絵（sprites.js）。歩く・走る・攻撃でコマを変える
    var ph = Math.sin(A.walk), moving = A.move > 0.1;
    var frame = A.swing > 0 ? "attack" : !moving ? "stand" : A.running ? (ph > 0 ? "runA" : "runB") : ph > 0.3 ? "walkA" : ph < -0.3 ? "walkB" : "stand";
    var hair = c.hero ? c.hero.face : 0;
    var d = Sprites.dirOf(A.face);
    // 武器：ふつうは手に、攻撃中はつき出し、敵を全滅させた部屋で走るときは背中にしまう
    var mode = A.swing > 0 ? "attack" : A.running ? "back" : "hold";
    var behind = mode === "back" ? d.dir !== "up" : d.dir === "up";
    if (behind) Sprites.drawWeapon(ctx, c.weapon, A.face, px, py + 6, mode);
    Sprites.drawHero(ctx, c.job, hair, A.face, frame, px, py + 6);
    if (!behind) Sprites.drawWeapon(ctx, c.weapon, A.face, px, py + 6, mode);
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
    var titles = { clear: "森の " + dg.floor + " 階をクリア！", timeout: "時間切れ…", wipe: "3人ともたおれた…", quit: "冒険をやめた" };
    document.getElementById("chooseTitle").textContent = titles[kind];
    if (kind === "clear") {
      run.clearGold = Loot.clearGold(dg.floor, settings.correct); run.gold += run.clearGold;
      // クリア報酬：経験値 (20＋5×深さ)×(1＋0.25×正解数)、熟練度 10（倒れていない仲間に）
      var ce = (20 + 5 * dg.floor) * (1 + 0.25 * settings.correct);
      Party.members().forEach(function (m, i) { if (!m.down) { run.exp[i] += ce; run.mastery[i] += 10; } });
    }
    var tl = Math.ceil(run.timeLeft);
    var lines = [
      "たおした敵 " + run.kills + "体　通った部屋 " + finishedCells() + "　のこり時間 " + Math.floor(tl / 60) + ":" + (tl % 60 < 10 ? "0" : "") + (tl % 60),
      "知恵の試練の正解 " + settings.correct + "問" + (trial.tryMode ? "（試しモード）" : trial.test ? "（テスト用の出発）" : "") +
        (trial.subjects.length ? "　加護：" + trial.subjects.map(function (s) { return Trial.BLESS[s].name; }).join("・") : ""),
      run.title ? "称号「" + run.title + "」を手に入れた！（称号の棚は段階5の図鑑に作ります）" : "",
      "手に入れたもの：" + run.gold + "G" + (run.clearGold ? "（クリア報酬 " + run.clearGold + "G をふくむ）" : "") + "　鉄 " + run.mat.iron + "　魔石 " + run.mat.stone,
      "経験値 " + Party.members().map(function (m, i) { return m.name + " +" + Math.round(run.exp[i]); }).join("　"),
      trial.tryMode ? "試しモードなので、拾った物も経験値も持ち帰らない（記録にもセーブにも残らない）。" :
      kind === "clear" ? "拾った物と経験値を持って、拠点にもどろう。" : "拾った物と経験値は持ち帰れるが、階層は進まない。"
    ];
    var lead = document.getElementById("chooseLead"); lead.textContent = "";
    lines.forEach(function (t) { if (!t) return; var d = document.createElement("div"); d.textContent = t; lead.appendChild(d); });
    // 手に入れた装備（拠点とセーブは段階5。今は見せるだけ）
    if (run.got.length) {
      var h = document.createElement("div"); h.className = "got-head"; h.textContent = "手に入れた装備（倉庫に入る。装備の付けかえは段階5-2）"; lead.appendChild(h);
      run.got.forEach(function (it) {
        var d2 = document.createElement("div"); d2.className = "got"; d2.style.color = Loot.RARITY[it.r].color;
        d2.textContent = Loot.describe(it); lead.appendChild(d2);
      });
    }
    var box = document.getElementById("chooseList"); box.textContent = "";
    function button(label, fn) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "btn wide"; b.textContent = label;
      b.addEventListener("click", function () { choosing = false; chooseEl.hidden = true; fn(); updateButtons(true); });
      box.appendChild(b);
    }
    var result = {
      exp: run.exp.slice(), mastery: run.mastery.slice(), gold: run.gold, mat: run.mat, items: run.got.slice(),
      title: run.title || null, floor: dg.floor, cleared: kind === "clear", boss: dg.boss, kills: run.byType, kind: kind, test: !!trial.test, tryMode: !!trial.tryMode,
      correct: settings.correct, subjects: trial.subjects
    };
    GameState.setAdventure({ state: "finished", result: result }); // 「拠点にもどる」を押す前に閉じても、次に開いたとき受け取れる
    button("拠点にもどる", function () { active = false; dg = null; Enemies.clear(); Combat.clear(); Base.returnFrom(result); });
    chooseEl.hidden = false;
  }

  // 拠点から呼ぶ：出発する
  window.Adventure = {
    settings: settings,
    start: function (floor, seed, t) {
      trial = t || { correct: settings.correct, subjects: [], test: true };
      settings.correct = trial.correct;
      startFloor(floor, seed); updateButtons(true); Sound.bgm("dungeon");
    },
    // 途中で閉じた冒険の続き（その階層の入口から）
    resume: function (a) {
      trial = { correct: a.correct, subjects: a.subjects || [], test: !!a.test, tryMode: !!a.tryMode };
      settings.correct = a.correct; startFloor(a.floor, a.seed, a); updateButtons(true); Sound.bgm("dungeon");
    },
    resultFromSnapshot: resultFromSnapshot
  };

  // ---------- 一時停止とテスト用の設定 ----------
  var pauseEl = document.getElementById("pause");
  var rotateEl = document.getElementById("rotate");
  document.getElementById("resumeBtn").addEventListener("click", function () { setPaused(false); });
  // メニューから冒険をやめる：時間切れと同じ（拾った物と経験値は持ち帰り、階層は進まない）（2026-10-17 決定）
  document.getElementById("quitBtn").addEventListener("click", function () {
    if (!window.confirm("冒険をやめて拠点にもどりますか？（拾った物と経験値は持ち帰れるけれど、階層は進みません）")) return;
    setPaused(false);
    finish("quit");
  });
  window.addEventListener("keydown", function (e) { if (paused && (e.code === "Escape")) setPaused(false); });

  function setPaused(on) {
    paused = on;
    pauseEl.hidden = !on;
    Input.releaseAll();
    if (on) { drawBigMap(); buildTools(); snapshot(); }
  }

  // メニューの道具：お店で買った薬を使う（段階5-2①）
  function buildTools() {
    var g = GameState.get(), box = document.getElementById("toolList"); box.textContent = "";
    var c = Party.current();
    var note = document.getElementById("toolNote");
    function add(label, ok, fn) {
      var b = document.createElement("button"); b.type = "button"; b.className = "btn small-btn"; b.textContent = label;
      b.disabled = !ok;
      b.addEventListener("click", function () { fn(); buildTools(); updateButtons(true); });
      box.appendChild(b);
    }
    var have = GameState.TOOL_ORDER.filter(function (k) { return g.items[k] > 0; });
    if (!have.length) { note.textContent = "道具を持っていない（拠点のお店で買える）"; return; }
    note.textContent = "いま戦っている " + c.name + " に使う（復活薬は、たおれた仲間に）";
    have.forEach(function (k) {
      var t = GameState.TOOLS[k], n = " ×" + g.items[k];
      if (k === "potion") {
        add(t.name + n, c.hp < c.stats.hp, function () {
          GameState.useTool(k); c.hp = Math.min(c.stats.hp, c.hp + Math.round(c.stats.hp * 0.4)); note.textContent = c.name + "の HP が回復した";
        });
      } else if (k === "revive") {
        var downs = Party.members().filter(function (m) { return m.down; });
        if (!downs.length) add(t.name + n + "（たおれた仲間がいない）", false, function () {});
        downs.forEach(function (m) {
          add(t.name + n + " → " + m.name, true, function () {
            GameState.useTool(k); m.down = false; m.hp = Math.max(1, Math.round(m.stats.hp * 0.3)); note.textContent = m.name + "が復活した！";
          });
        });
      } else {
        add(t.name + n, !!c.status[t.cures], function () {
          GameState.useTool(k); delete c.status[t.cures]; note.textContent = c.name + "の" + GameData.STATUS[t.cures].name + "が治った";
        });
      }
    });
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
    var w = Loot.rarityWeights(settings.correct, false), sum = w[0] + w[1] + w[2] + w[3];
    document.getElementById("chestInfo").textContent = "正解 " + settings.correct + "問のときの宝箱：" +
      Loot.RARITY.map(function (R, i) { return R.name + " " + Math.round(w[i] / sum * 100) + "%"; }).join("・") + "（鍵の部屋の宝箱は、レア以上だけ）";
  }

  function checkRotate() {
    var portrait = window.innerHeight > window.innerWidth;
    rotateEl.hidden = !(Input.isTouch && portrait);
  }
  window.addEventListener("resize", checkRotate);
  checkRotate();
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) return;
    snapshot(); // iPad がスリープする・アプリを閉じるときは、まず控える
    if (active && !paused && !choosing) setPaused(true);
  });
  window.addEventListener("pagehide", function () { snapshot(); });
  Title.show(function () { Base.boot(); }); // 段階7-1：はじめにタイトル画面

  // ---------- 毎フレーム ----------
  var last = 0;
  function frame(t) {
    var dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t;
    fps.n++; fps.t += dt;
    if (fps.t >= 0.5) { fps.value = Math.round(fps.n / fps.t); fps.n = 0; fps.t = 0; }
    glow += dt;
    if (run.fade > 0) run.fade = Math.max(0, run.fade - dt);
    if (active && !paused && !choosing && rotateEl.hidden) update(dt);
    if (dg) draw(); else Render.begin();
    Input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ?debug=1 のときだけ、確かめるために中を見たり1フレームずつ進めたりできるようにする
  if (debug) {
    window.__game = {
      actor: A, cam: cam, tally: tally, settings: settings,
      room: function () { return room; }, dungeon: function () { return dg; }, cur: function () { return curKey; }, run: function () { return run; },
      step: function (dt) { if (!paused && !choosing) update(dt); draw(); Input.endFrame(); },
      start: startFloor, enter: enterRoom, boss: function () { return boss; },
      rebuild: function (lv) { GameState.setLevelForTest(lv || 1); startFloor(settings.floor); },
      state: function () { return { paused: paused, choosing: choosing }; }
    };
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
})();
