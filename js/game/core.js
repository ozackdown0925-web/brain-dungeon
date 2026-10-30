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
  var settings = { dungeon: "forest1", floor: 1, correct: 2, minutes: 5, seed: "" };
  var run = newRun();
  function newRun() {
    return { timeLeft: settings.minutes * 60, kills: 0, over: false, fade: 0, entry: null,
             gold: 0, clearGold: 0, mat: { iron: 0, stone: 0, gem: 0 }, got: [], swampCd: 0, lockMsg: 0, inPit: false,
             exp: [0, 0, 0], mastery: [0, 0, 0], byType: {} };
  }
  var active = false; // ダンジョンにいるあいだ true（拠点にいるあいだは止める）

  var cam = { x: 0, y: 0 };
  var paused = false, choosing = false;
  // 演出（2026-10-18 保護者の案）：出口に入ったとき（光が広がって暗転）と、ボスをたおしたとき（絵が崩れ落ちる）。
  // 演出のあいだは、時間も敵も止まる。cine：{ kind: "exit"|"boss", t, dur, ... }
  var cine = null;
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
    dg = Dungeon.generate(floor, seed || Dungeon.newSeed(), settings.dungeon);
    Party.setup(GameState.get().party.map(function (h) { return Party.fromHero(h); }));
    Party.resetAll();
    applyBlessings(trial.subjects);
    active = true; paused = false; choosing = false; cine = null;
    pauseEl.hidden = true; chooseEl.hidden = true;
    A.wait = 0; A.busy = 0; A.down = false; A.move = 0;
    run = newRun();
    if (resume) applyResume(resume);
    enterRoom(dg.start, null);
    prerender(dg);
    if (resume) say(GameData.floorLabel(floor, dg.dungeon) + "　続きから（入口にもどった）");
    else say(GameData.floorLabel(floor, dg.dungeon) + (dg.boss ? "　この先に、ボスがいる…！" : "　出口をめざそう！"));
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
    if (!dg || !active || run.over || dg.training) return;   // 訓練場は控えない
    var opened = [], found = [], picked = [];
    Object.keys(dg.cells).forEach(function (k) {
      var c = dg.cells[k];
      c.chests.forEach(function (b, i) { if (b.opened) opened.push(k + "#" + i); });
      c.traps.forEach(function (t, i) { if (t.found) found.push(k + "#" + i); });
      (c.pickups || []).forEach(function (u, i) { if (u.taken) picked.push(k + "#" + i); });
    });
    var nests = Object.keys(dg.cells).filter(function (k) { return dg.cells[k].nest && dg.cells[k].nest.done; });   // こわして宝箱が出た巣
    var keyTaken = Object.keys(dg.cells).some(function (k) { return dg.cells[k].key && dg.cells[k].key.taken; });
    var ckeyTaken = Object.keys(dg.cells).some(function (k) { return dg.cells[k].ckey && dg.cells[k].ckey.taken; });
    GameState.setAdventure({
      state: "playing", dungeon: dg.dungeon, floor: dg.floor, seed: dg.seed, correct: settings.correct, subjects: trial.subjects, test: !!trial.test, tryMode: !!trial.tryMode, skipped: !!trial.skipped,
      timeLeft: Math.max(0, run.timeLeft), opened: opened, found: found, picked: picked, nests: nests, keyTaken: keyTaken, hasKey: !!dg.hasKey, ckeyTaken: ckeyTaken, hasCKey: !!dg.hasCKey,
      lockOpen: !!(dg.lock && dg.lock.open), bossDown: !!dg.bossDown, bossRetried: !!run.bossRetried, bossSave: run.bossSave || null, bossBest: Math.max(run.bossBest || 0, curKey === dg.exit && !dg.bossDown ? bossDamaged() : 0),
      run: { gold: run.gold, mat: run.mat, got: run.got, exp: run.exp, mastery: run.mastery, byType: run.byType, kills: run.kills, title: run.title || null },
      party: Party.members().map(function (m) { return { hp: m.hp, mp: m.mp, down: m.down }; })
    });
  }
  function applyResume(a) {
    run.timeLeft = a.timeLeft;
    run.bossRetried = !!a.bossRetried; run.bossSave = a.bossSave || null; run.bossBest = a.bossBest || 0;
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
    // こわした巣：巣はもうなく、宝箱がある（開けたかどうかは、すぐ下で opened からもどす）
    (a.nests || []).forEach(function (k) {
      var c = dg.cells[k]; if (!c || !c.nest) return;
      c.nest.slot.dead = true; c.nest.met = true; c.nest.broken = true; c.nest.done = true;
      c.chests.push({ x: c.nest.x, y: c.nest.y + 4, opened: false, rare: true, nest: true });
    });
    a.opened.forEach(function (id) { var p = id.split("#"), c = dg.cells[p[0]]; if (c && c.chests[+p[1]]) c.chests[+p[1]].opened = true; });
    a.found.forEach(function (id) { var p = id.split("#"), c = dg.cells[p[0]]; if (c && c.traps[+p[1]]) c.traps[+p[1]].found = true; });
    (a.picked || []).forEach(function (id) { var p = id.split("#"), c = dg.cells[p[0]]; if (c && c.pickups && c.pickups[+p[1]]) c.pickups[+p[1]].taken = true; });
    if (a.keyTaken) Object.keys(dg.cells).forEach(function (k) { if (dg.cells[k].key) dg.cells[k].key.taken = true; });
    dg.hasKey = !!a.hasKey;
    if (a.ckeyTaken) Object.keys(dg.cells).forEach(function (k) { if (dg.cells[k].ckey) dg.cells[k].ckey.taken = true; });
    dg.hasCKey = !!a.hasCKey;
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
             dungeon: a.dungeon || "forest1", floor: a.floor, cleared: false, boss: GameData.isBossFloor(a.dungeon, a.floor), kills: a.run.byType, kind: kind, test: !!a.test, tryMode: !!a.tryMode,
             correct: a.correct || 0, subjects: a.subjects || [], skipped: !!a.skipped };
  }

  // 部屋に入る。fromDir は入ってきた道の向き（n/s/w/e）、null なら部屋のまんなか（入口の部屋）。
  // 階のほかの部屋の絵も、少しずつ先に描いておく（部屋を移るときに止まらないように。1回に1部屋）
  function prerender(d) {
    var keys = Object.keys(d.cells);
    (function next() {
      if (d !== dg || !keys.length) return;
      var c = d.cells[keys.shift()];
      if (c && c.room) Tiles.canvasFor(c.room);
      setTimeout(next, 30);
    })();
  }

  function enterRoom(k, fromDir) {
    curKey = k;
    var c = dg.cells[k];
    c.visited = true;
    room = c.room;
    Combat.hooks.room = room;
    Enemies.clear(); Combat.clear(); Battle.clear();
    boss = null;
    var sp = fromDir ? null : Dungeon.startPoint(room, c.center);
    var p = fromDir ? Dungeon.entryPoint(room, fromDir) : { x: sp.x, y: sp.y, face: { x: 0, y: 1 } };
    A.x = p.x; A.y = p.y; A.face = p.face; A.move = 0; A.turn = 0; A.running = false;
    run.entry = { x: p.x, y: p.y, face: p.face }; // 落とし穴に落ちたら、ここへもどる
    run.inPit = false;
    run.falls = [];   // 落ちてくる岩（落石の罠。部屋を出ると消える）
    A.inv = 0.6; // 部屋に入った直後は少しだけ無敵
    // たおした敵はもどらない。まだいる敵は、もとの場所に HP 満タンでいる。
    var lv = 0;
    Party.members().forEach(function (m) { lv += m.level; });
    var avg = lv / Party.members().length;
    var depth = Dungeon.enemyDepth(dg.power, avg);
    // ボスの強さは決まった数字。レベルが高すぎるときだけ、ふつうの敵と同じく少し強くする
    var bossDepth = 1 + Math.max(0, avg - (1 + 0.7 * (dg.power - 1))) / 2;
    c.enemies.forEach(function (slot) {
      if (slot.dead) return;
      if (dg.training) { spawnStatue(slot); return; }   // 訓練場の像
      var e = Enemies.spawn(slot.type, slot.x, slot.y, slot.boss ? bossDepth : depth);
      GameState.noteSeen(slot.type); // 図鑑：たたかった敵
      e.slot = slot;
      if (slot.nest && c.nest.hp !== null) e.hp = Math.min(e.maxHp, c.nest.hp);   // 巣は、けずった HP のまま
      if (slot.boss) { e.face = { x: -1, y: 0 }; boss = e; }
    });
    run.roomAlive = Enemies.alive().length; // 部屋の敵を全部たおしたか見るため（パッシブ「めいそう」）
    run.depth = depth;                      // モンスターの巣から出る敵の強さ
    run.fade = 0.3;
    snapshot();
    // モンスターの巣（段階5）：はじめて入ったときに知らせる。入るたびに、少ししてから敵を出しはじめる
    if (c.nest && !c.nest.broken) {
      c.nest.t = GameData.ENEMIES.nest.first;
      if (!c.nest.met) {
        c.nest.met = true;
        say("モンスターの巣だ！ 巣をこわせば、敵は出てこなくなる");
        Sound.play("boss");
      }
    }
    // ボスの部屋：入るとつるが道をふさぎ、短い文章が出る
    if (c.bossCell && !dg.bossDown) {
      setDoor(c, "w", "V");
      // ボスに挑んだときのようす（残り時間と仲間のHP・MP）を覚えておく。3人ともたおれたら、1回だけここからやり直せる（2026-10-21）
      if (!run.bossSave) run.bossSave = { time: run.timeLeft, party: Party.members().map(function (m) { return { hp: m.hp, mp: m.mp, down: m.down }; }) };
      if (!dg.bossMet) {
        dg.bossMet = true; Sound.bgm("boss");
        Sound.play("boss");
        showStory(GameData.ENEMIES[dg.bossInfo.enemy].name, dg.bossInfo.before, "たたかう！", function () { say("つるが道をふさいだ！"); });
      }
    }
  }
  var boss = null; // 今の部屋のボス（いなければ null）
  // ボスの HP バーの下に出す1行（2026-10-27 保護者と決定）：図鑑に記録がある（一度その属性で攻撃した）
  // 属性の「弱点」と「無効」だけを出す。まだ何も分かっていなければ ""。戦いの途中で試すと、その場で足される
  function bossWeakLine(e) {
    var g = GameState.get();
    var b = g && g.book && g.book.monsters ? g.book.monsters[e.type] : null;
    if (!b || !b.tried) return "";
    var weak = [], none = [];
    Object.keys(GameData.ELEMENTS).forEach(function (k) {
      if (k === "none") return;
      if (!b.tried[k]) return;
      // 効き方は今のボスの数字で決める（弱点を変えたあとでも、前の記録のまちがいが出ないように）
      var r = Battle.resOf(e, k);
      if (r > 1) weak.push(GameData.ELEMENTS[k]);
      else if (r === 0) none.push(GameData.ELEMENTS[k]);
    });
    var s = [];
    if (weak.length) s.push("弱点：" + weak.join("・"));
    if (none.length) s.push("無効：" + none.join("・"));
    return s.join("　");
  }

  // 部屋の敵を全部たおしたとき：パッシブ「めいそう」などで少し回復する（2026-10-19）
  function roomCleared() {
    var who = [];
    Party.members().forEach(function (m) {
      if (m.down || !(m.stats.roomHp || m.stats.roomMp)) return;
      m.hp = Math.min(m.stats.hp, m.hp + Math.round(m.stats.hp * (m.stats.roomHp || 0)));
      m.mp = Math.min(m.stats.mp, m.mp + Math.round(m.stats.mp * (m.stats.roomMp || 0)));
      who.push(m.name);
    });
    if (who.length) { say(who.join("と") + "は、少し回復した"); Sound.play("heal"); }
  }

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
    Enemies.alive().forEach(function (o) { if (o.type === "wolf_pup" || o.summoned) { o.dead = true; o.fade = 0.4; } });   // 呼ばれた敵（子オオカミ・毒ガエル・瘴気の霊）も消える
    var c = dg.cells[curKey];
    setDoor(c, "w", ":");
    c.chests.push({ x: c.center.x - 60, y: c.center.y - 22, opened: false, rare: true });
    c.chests.push({ x: c.center.x - 60, y: c.center.y + 22, opened: false, rare: true });
    // ボスのごほうび：素材5つ・ゴールド（たたき台にない数なので仮：100＋10×階層）・称号
    for (var i = 0; i < 5; i++) run.mat[Math.random() < 0.6 ? "iron" : "stone"]++;
    var g = 100 + 10 * dg.power;
    run.gold += g;
    run.title = dg.bossInfo.title;
    if (Math.random() < Loot.GEM_CHANCE.boss) {   // 宝玉（2026-10-20）：ボスは必ず（2026-10-22 に50%から）
      run.mat.gem = (run.mat.gem || 0) + 1;
      Battle.pop(e.x, e.y - 52, "宝玉 +1", "#ff9ad0", 9);
    }
    Battle.pop(e.x, e.y - 40, "+" + g + "G", "#f2c14e", 9);
    var after = dg.bossInfo.after.concat(["", "称号「" + dg.bossInfo.title + "」を手に入れた！", "宝箱を開けて、出口へ進もう。"]);
    showStory(GameData.ENEMIES[e.type].name + "をたおした！", after, "つづける", null);
    snapshot();
  }

  // ---------- 演出 ----------
  function startExitCine(ex) {
    cine = { kind: "exit", t: 0, dur: 1.6, x: ex.x, y: ex.y };
    Input.releaseAll(); A.move = 0;
    Sound.play("door");
  }
  function drawExitCine() {
    var ctx = Render.ctx, t = cine.t;
    var x = cine.x - cam.x, y = cine.y - cam.y;
    var far = Math.sqrt(view.w * view.w + view.h * view.h);
    // 0〜1秒：まんなかが光る出口の光が、画面いっぱいに広がる
    var k = Math.min(1, t / 1.0), ease = k * k * (3 - 2 * k);
    var r = 18 + ease * far * 1.1;
    var gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(255,252,235," + (0.95).toFixed(2) + ")");
    gr.addColorStop(0.35, "rgba(255,230,140," + (0.55 + 0.4 * ease).toFixed(2) + ")");
    gr.addColorStop(0.7, "rgba(242,193,78," + (0.25 + 0.6 * ease).toFixed(2) + ")");
    gr.addColorStop(1, "rgba(242,193,78," + (0.6 * ease).toFixed(2) + ")");
    ctx.fillStyle = gr; ctx.fillRect(0, 0, view.w, view.h);
    // 1〜1.6秒：暗くなる
    if (t > 1.0) Render.rect(0, 0, view.w, view.h, "rgba(0,0,0," + Math.min(1, (t - 1.0) / 0.5).toFixed(2) + ")");
  }

  function startBossCine(e) {
    // ボスの絵を、べつの紙に写しとる（足もとが紙の下のほうに来るように）
    var W = 128, H = 128, fx = 64, fy = 110;
    var off = document.createElement("canvas"); off.width = W; off.height = H;
    var octx = off.getContext("2d"); octx.imageSmoothingEnabled = false;
    e.flash = 0;
    Monsters.drawBoss(octx, e, fx, fy + Monsters.bossFoot(e.def.kind), "stand");
    // 3×3点ずつのかけらに分ける。上のほうから先に崩れる
    var data = octx.getImageData(0, 0, W, H).data, chunks = [], top = H, bottom = 0;
    for (var cy = 0; cy < H; cy += 3) for (var cx = 0; cx < W; cx += 3) {
      var any = false;
      for (var yy = cy; yy < cy + 3 && !any; yy++) for (var xx = cx; xx < cx + 3; xx++) { if (data[(yy * W + xx) * 4 + 3] > 0) { any = true; break; } }
      if (any) { chunks.push({ sx: cx, sy: cy }); top = Math.min(top, cy); bottom = Math.max(bottom, cy); }
    }
    var span = Math.max(1, bottom - top);
    chunks.forEach(function (c) {
      c.delay = 0.45 + (c.sy - top) / span * 0.9 + Math.random() * 0.25;
      c.vx = (Math.random() - 0.5) * 30; c.vy = -10 - Math.random() * 20; c.x = 0; c.y = 0;
    });
    e.fade = 0;   // ふつうの絵は消す（崩れる絵を描く）
    cine = { kind: "boss", t: 0, dur: 2.2, e: e, img: off, ox: e.x - fx, oy: e.y - fy, chunks: chunks, dust: [] };
    Input.releaseAll(); A.move = 0;
    Sound.play("kill");
  }
  function drawBossCine() {
    var ctx = Render.ctx, c = cine, t = c.t;
    var bx = Math.round(c.ox - cam.x), by = Math.round(c.oy - cam.y);
    // はじめの0.45秒：白く光って、ふるえる
    var shake = t < 0.45 ? Math.round(Math.sin(t * 90) * 2) : 0;
    c.chunks.forEach(function (k) {
      var a = 1, dx = 0, dy = 0;
      if (t > k.delay) {
        var u = t - k.delay;
        dx = k.vx * u; dy = k.vy * u + 160 * u * u;   // 下へ落ちる
        a = Math.max(0, 1 - u / 0.6);
      }
      if (a <= 0) return;
      ctx.globalAlpha = a;
      ctx.drawImage(c.img, k.sx, k.sy, 3, 3, bx + k.sx + shake + Math.round(dx), by + k.sy + Math.round(dy), 3, 3);
    });
    ctx.globalAlpha = 1;
    if (t < 0.45) {   // 白い光
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.5 * (1 - t / 0.45);
      ctx.drawImage(c.img, bx + shake, by);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    }
    // 足もとの土けむり（ドット）
    c.dust.forEach(function (d) {
      var k2 = d.t / 0.8, a2 = (1 - k2) * 0.75, r = 2 + Math.round(k2 * 4);
      var x = Math.round(d.x - cam.x), y = Math.round(d.y - cam.y - k2 * 6);
      ctx.fillStyle = "rgba(168,152,120," + a2.toFixed(2) + ")"; ctx.fillRect(x - r, y - 1, r * 2, 3); ctx.fillRect(x - r + 1, y - 2, r * 2 - 2, 5);
      ctx.fillStyle = "rgba(220,206,170," + (a2 * 0.9).toFixed(2) + ")"; ctx.fillRect(x - r + 1, y - 2, 2, 2);
    });
  }
  function updateCine(dt) {
    cine.t += dt;
    if (cine.kind === "boss") {
      var c = cine;
      if (!c.boomed && c.t > 0.45) { c.boomed = true; Sound.play("boss"); }   // 崩れはじめる音
      // かけらが落ちはじめたら、足もとに土けむり
      if (c.t > 0.5 && c.t < 1.8 && Math.random() < dt * 14) c.dust.push({ x: c.e.x + (Math.random() - 0.5) * 50, y: c.e.y + 10 + Math.random() * 6, t: 0 });
      c.dust.forEach(function (d) { d.t += dt; });
      c.dust = c.dust.filter(function (d) { return d.t < 0.8; });
    }
    Battle.update(dt);   // ダメージの数字などは動かしておく
    if (cine.t < cine.dur) return;
    var done = cine; cine = null;
    if (done.kind === "exit") { run.blackout = true; finish("clear"); }
    else bossDefeated(done.e);
  }

  function finishedCells() {
    var n = 0, all = 0;
    Object.keys(dg.cells).forEach(function (k) { all++; if (dg.cells[k].visited) n++; });
    return n + "/" + all;
  }

  function say(text) { message = { text: text, t: 2.2 }; }

  // ---------- モンスターの巣（段階5、2026-10-22） ----------
  // 巣は数秒ごとに、その階の敵を1体出す（部屋にいる敵は roomMax まで、出すのは全部で total まで）。
  // 出た敵は部屋の敵として残る（部屋を出てもどっても、たおすまでいる）。
  // 巣をこわして部屋の敵を全部たおすと、金の宝箱と同じ中身の宝箱が、巣のあったところに出る
  function nestPick() {
    var pool = Dungeon.nestPool(dg.dungeon, dg.floor);
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function updateNest(dt) {
    var c = dg.cells[curKey], n = c.nest;
    if (!n || n.done || run.over || choosing) return;
    var ne = null;
    Enemies.list.forEach(function (e) { if (!e.dead && e.def.kind === "nest") ne = e; });
    if (ne) n.hp = ne.hp;
    if (n.broken) {
      // 巣をこわしたあと、部屋の敵を全部たおしたら宝箱
      // 消えかけのダークウィスプ（こちらの攻撃が当たらないあいだ）も、のこりの敵に数える（2026-10-25）
      if (Enemies.alive().filter(function (e) { return !e.charm; }).length === 0) {
        n.done = true;
        c.chests.push({ x: n.x, y: n.y + 4, opened: false, rare: true, nest: true });
        say("巣のあとに、宝箱が現れた！");
        Sound.play("chest");
        snapshot();
      }
      return;
    }
    if (!ne || n.made >= GameData.ENEMIES.nest.total) return;
    n.t -= dt;
    if (n.t > 0) return;
    var D = GameData.ENEMIES.nest;
    n.t = D.every;
    var others = Enemies.alive().filter(function (e) { return e.def.kind !== "nest" && !e.charm; }).length;
    if (others >= D.roomMax) return;
    // 巣のふちの、立てる場所から出る
    var T = World.TILE, spot = null;
    for (var tries = 0; tries < 12 && !spot; tries++) {
      var a = Math.random() * Math.PI * 2, x = ne.x + Math.cos(a) * 22, y = ne.y + Math.sin(a) * 18;
      var ch = room.tile(Math.floor(x / T), Math.floor(y / T));
      if (ch !== "#" && ch !== "T" && ch !== "~" && ch !== "P" && ch !== "I" && !room.hitsWall(x - 6, y - 6, 12, 12)) spot = { x: x, y: y };
    }
    if (!spot) return;
    var type = nestPick();
    var slot = { type: type, tx: Math.floor(spot.x / T), ty: Math.floor(spot.y / T), x: spot.x, y: spot.y, dead: false, fromNest: true };
    c.enemies.push(slot);
    var e = Enemies.spawn(type, spot.x, spot.y, run.depth || dg.power);
    e.slot = slot; e.cd = 0.8;
    GameState.noteSeen(type);
    ne.birth = 0.5;
    n.made++;
    run.roomAlive = Enemies.alive().length;
  }
  // 巣をこわした：経験値は敵3体分。ゴールドや素材は落とさない（宝箱があるので）
  function nestBroken(e) {
    var c = dg.cells[curKey];
    if (!c.nest) return;
    c.nest.broken = true; c.nest.hp = 0;
    var k = Dungeon.rewardScale(dg.power) * 3;
    Party.members().forEach(function (m, i) {
      if (m.down) return;
      run.exp[i] += (2 + 0.6 * dg.power) * k;
      run.mastery[i] += k;
    });
    Battle.pop(e.x, e.y - 30, "巣をこわした！", "#c86ae0", 10);
    say(Enemies.hostile().length ? "巣をこわした！ のこりの敵をたおそう" : "巣をこわした！");
  }

  Combat.hooks.onKill = function (e) {
    if (dg && dg.arena) { arenaKill(e); return; }      // 闘技場：相手の1人をたおした
    if (dg && dg.training) { trainKill(e); return; }   // 訓練場：ごほうびはなし。像はすぐ元にもどる
    tally.kills++; tally.swingsToKill += e.swingsTaken || 0;
    run.kills++;
    if (e.slot) e.slot.dead = true;
    if (e.def.kind === "nest") { nestBroken(e); return; }
    run.byType[e.type] = (run.byType[e.type] || 0) + 1;
    // 経験値と熟練度：倒れていない3人に同じだけ（docs/draft.md 1.1：1体 2＋0.6×深さ、熟練度 1。ボスは10体分）
    if (!e.summoned) {
      // ボスは10体分。ふつうの敵は、敵を増やしたぶん Dungeon.rewardScale 倍（1階層の合計は前と同じ）
      var k = e.def.boss ? 10 : Dungeon.rewardScale(dg.power);
      Party.members().forEach(function (m, i) {
        if (m.down) return;
        run.exp[i] += (2 + 0.6 * dg.power) * k;
        run.mastery[i] += k;
      });
    }
    if (e.def.boss) { startBossCine(e); return; }
    if (e.summoned) return; // 子オオカミは何も落とさない
    // 敵が落とすもの：ゴールドと素材だけ（装備は宝箱・ボス・お店・鍛冶屋から）
    var drop = Loot.enemyDrop(e.type, dg.power, settings.correct);
    run.gold += drop.gold;
    if (drop.gold) Battle.pop(e.x, e.y - 30, "+" + drop.gold + "G", "#f2c14e", 7);
    if (drop.mat) { run.mat[drop.mat]++; Battle.pop(e.x, e.y - 40, Loot.MATERIALS[drop.mat] + " +1", "#cfd6e6", 7); }
    // 瘴気の森：敵がときどき（3%）毒消しを落とす（2026-10-21 保護者の案）
    if (!drop.tool && GameData.dungeonOf(dg.dungeon).theme === "swamp" && Math.random() < 0.03) drop.tool = "antidote";
    if (drop.tool && GameState.gainTool(drop.tool)) Battle.pop(e.x, e.y - 50, GameState.TOOLS[drop.tool].name + " +1", "#9fe0a8", 7);
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
    // 身躱しの術（2026-10-20）：決まった確率で、敵の攻撃をよける
    var ev = Party.eff(c, "evade");
    if (ev > 0 && Math.random() < ev) { Battle.pop(A.x, A.y - 28, "よけた", "#a8d8ff", 8); A.inv = 0.35; return; }
    // cut：パッシブ「守りの誓い」「聖なる盾」。cutLow：聖なる盾の、HPが半分より少ないときの上のせ
    var cut = (c.stats.cut || 0) + (c.hp < c.stats.hp * 0.5 ? (c.stats.cutLow || 0) : 0);
    // 魔法の攻撃（影の魔導士・瘴気の霊。2026-10-21）は、敵の魔攻と仲間の魔防で計算する。ほかは物攻と物防
    // opts.atk：攻撃力をじかに決める（闘技場の相手のスキル。2026-10-30）
    var res = opts.magic
      ? Battle.damage((opts.atk !== undefined ? opts.atk : (e.matk || e.patk)) * (opts.mult || 1) * (1 - cut), Party.eff(c, "mdef"), { element: "dark", res: null, crit: 0, minPct: 0.3 })
      : Battle.damage((opts.atk !== undefined ? opts.atk : e.patk) * (opts.mult || 1) * (1 - cut), Party.eff(c, "pdef"), { element: "slash", res: null, crit: 0, minPct: 0.3 });   // minPct：最低でも攻撃力の30%
    tally.hitsTaken++;
    Battle.showHit(A.x, A.y - 18, res, true);
    Sound.play("hurt");
    if (opts.big) Battle.pop(A.x, A.y - 40, "大ダメージ！", "#ef5b5b", 9);
    A.inv = opts.big ? 0.8 : 0.35;
    A.hurtT = 0.3;   // 当たったとき、少し赤く光る（2026-10-19）
    var fell = Party.hurtActive(res.amount);
    var st = opts.status || e.def.onHit;
    if (!fell && st && Math.random() < st.chance) Party.addStatus(c, st.type, st.dur);
    if (fell) {
      Sound.play("down");
      tally.downs++;
      if (Party.allDown() && dg.arena) arenaEnd(false);
      else if (Party.allDown() && dg.training) trainRevive();
      else if (Party.allDown()) { if (canBossRetry()) showBossRetry(); else finish("wipe"); } else showChoose(c);
    }
  }

  // ---------- 更新 ----------
  function update(dt) {
    if (Input.pressed("menu")) { setPaused(true); return; }
    var c = Party.current();

    A.wait = Math.max(0, A.wait - dt);
    A.swing = Math.max(0, A.swing - dt);
    A.inv = Math.max(0, A.inv - dt);
    A.hurtT = Math.max(0, (A.hurtT || 0) - dt);
    A.busy = Math.max(0, A.busy - dt);
    if (A.act) A.act.el += dt;   // 行動のゲージ（skills.js の actStart）
    A.hidden = Math.max(0, (A.hidden || 0) - dt);   // 隠れみの術

    var asleep = !!c.status.sleep, para = !!c.status.para;
    var nAlive = Enemies.alive().length;
    A.running = nAlive === 0 && !dg.arena; // 部屋の敵を全滅させたら走る（闘技場では走らない）
    if (run.roomAlive > 0 && nAlive === 0 && !dg.arena) roomCleared();
    run.roomAlive = nAlive;
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
        var sp = SPEED * (A.running ? CLEAR_SPEED : 1) * (c.stats.speedMul || 1);   // speedMul：パッシブ「疾走」
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
        var id = Party.skillsOf(c)[i];
        if (!id) { say("スキル" + (i + 1) + " にはなにもセットしていない"); return; }
        var why = Combat.useSkill(c, id);
        if (why) say(why);
      });
    }
    // スキルセットの切りかえ（2026-10-22）：セットA ⇔ B。上級職になれるようになった仲間だけ
    if (Input.pressed("setswap")) {
      if (Party.flipSet(c)) { say("スキルセット" + (c.page === 1 ? "B" : "A") + "に切りかえた"); Sound.play("click"); }
      else say("スキルセットの切りかえは、上級職になれるようになると使える");
      updateButtons(true);
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
    if (!dg.training) updateNest(dt);
    Battle.update(dt);
    if (run.over) return; // 倒れて冒険が終わったとき
    if (dg.training) {   // 訓練場：時間・出口・控えはない。回復の泉と、数字を数えるだけ
      if (dg.arena) arenaUpdate(dt); else trainUpdate(dt);
      checkThings(dt);
      updateCamera();
      updateButtons(false);
      return;
    }

    // となりの部屋へ
    var out = Dungeon.leftRoom(room, A);
    if (out) { enterRoom(Dungeon.neighbor(dg, curKey, out), Dungeon.DIRS[out].back); return; }

    // 鍵・宝箱・鍵の扉・罠
    if (checkThings(dt)) return;

    // 出口：入るとクリア
    if (curKey === dg.exit && (!dg.boss || dg.bossDown)) {
      var ex = dg.cells[curKey].center, edx = A.x - ex.x, edy = A.y - ex.y;
      if (edx * edx + edy * edy < 10 * 10) { startExitCine(ex); return; }
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

    // 鍵は2種類（2026-10-19）：出口の鍵（金）と宝箱の鍵（銀）
    if (c.key && !c.key.taken && near(c.key.x, c.key.y, 12)) {
      c.key.taken = true; dg.hasKey = true;
      say("出口の鍵を手に入れた！ 出口の扉が開けられる"); snapshot();
      Battle.pop(A.x, A.y - 30, "出口の鍵", "#ffe066", 9);
      Sound.play("key");
    }
    if (c.ckey && !c.ckey.taken && near(c.ckey.x, c.ckey.y, 12)) {
      c.ckey.taken = true; dg.hasCKey = true;
      say("宝箱の鍵を手に入れた！ 金の宝箱が開けられる"); snapshot();
      Battle.pop(A.x, A.y - 30, "宝箱の鍵", "#dfe6ee", 9);
      Sound.play("key");
    }
    // 回復の泉（ボスの階。2026-10-21）：ふれると全員（たおれた仲間も）HP・MP が全快。何度でも使える
    if (c.spring && near(c.spring.x, c.spring.y, 16)) {
      var needS = Party.members().some(function (m) { return m.down || m.hp < m.stats.hp || m.mp < m.stats.mp; });
      if (needS) {
        Party.members().forEach(function (m) { m.down = false; m.hp = m.stats.hp; m.mp = m.stats.mp; m.status = {}; });
        say("回復の泉：みんなのHPとMPが全回復した！");
        Battle.pop(A.x, A.y - 30, "全回復", "#a3e8ff", 10);
        Sound.play("heal"); snapshot();
      }
    }
    // 薬草・魔力のキノコ（2026-10-20）：上を歩くと、全員が少し回復する。みんな満タンなら拾わずに残る
    // 毒消し草（瘴気の森。2026-10-21）：みんなの毒が治る。だれも毒でなければ拾わずに残る
    (c.pickups || []).forEach(function (u) {
      if (u.taken || !near(u.x, u.y, 11)) return;
      var herb = u.kind === "herb", cure = u.kind === "cure", alive = Party.members().filter(function (m) { return !m.down; });
      var need = alive.some(function (m) { return cure ? !!m.status.poison : herb ? m.hp < m.stats.hp : m.mp < m.stats.mp; });
      if (!need) return;
      u.taken = true;
      alive.forEach(function (m) {
        if (cure) delete m.status.poison;
        else if (herb) m.hp = Math.min(m.stats.hp, m.hp + Math.max(1, Math.round(m.stats.hp * 0.10)));
        else m.mp = Math.min(m.stats.mp, m.mp + Math.max(1, Math.round(m.stats.mp * 0.08)));
      });
      say(cure ? "毒消し草を見つけた！ みんなの毒が治った" : herb ? "薬草を見つけた！ みんなのHPが少し回復した" : "魔力のキノコを見つけた！ みんなのMPが少し回復した");
      Battle.pop(A.x, A.y - 30, cure ? "毒が治った" : herb ? "HP回復" : "MP回復", cure ? "#9fe8d8" : herb ? "#6fd08c" : "#a3c8ff", 9);
      Sound.play("heal"); snapshot();
    });
    c.chests.forEach(function (b) {
      if (b.opened || !near(b.x, b.y, 14)) return;
      if (b.gold && !dg.hasCKey) {   // 金の宝箱は、宝箱の鍵がいる
        if (run.lockMsg <= 0) { say("金の宝箱には鍵がかかっている。どこかの部屋に宝箱の鍵があるはず"); run.lockMsg = 3; }
        return;
      }
      if (b.gold) dg.hasCKey = false;
      b.opened = true;
      var got = Loot.chest(dg.power, settings.correct, b.rare, GameData.dungeonOf(dg.dungeon).tier || 0);
      if (got.equip) run.got.push(got.equip);
      run.gold += got.gold;
      Object.keys(got.mat).forEach(function (m) { run.mat[m] = (run.mat[m] || 0) + got.mat[m]; });
      if ((b.gold || b.nest) && Math.random() < Loot.GEM_CHANCE.goldChest) { run.mat.gem = (run.mat.gem || 0) + 1; got.bonusGem = true; }   // 金の宝箱は25%で宝玉（2026-10-22 に10%から）
      if (got.equip) {
        var R = Loot.RARITY[got.equip.r];
        // レア以上は「スーパーレア装備！」のように知らせる（2026-10-18 決定）
        var tool = got.tool && GameState.gainTool(got.tool) ? "（" + GameState.TOOLS[got.tool].name + "も）" : "";
        if (got.bonusGem) tool += "（宝玉も！）";
        say("宝箱：" + (R.long ? R.long + "！ " : "") + Loot.label(got.equip) + " を手に入れた！" + tool);
        Battle.pop(b.x, b.y - 22, (R.long || "装備") + "！", R.color, 10);
      } else {
        // よい宝箱の、装備でない中身（2026-10-22）：宝玉・復活薬・素材の山
        var gotTool = got.tool && GameState.gainTool(got.tool);
        var what = got.prize === "gem" ? "宝玉" : got.prize === "revive" ? (gotTool ? "復活薬" : "復活薬（もう持てない）") :
          "素材の山（鉱石" + (got.mat.iron || 0) + "・魔石" + (got.mat.stone || 0) + "）";
        say("宝箱：" + what + " を手に入れた！" + (got.bonusGem ? "（宝玉も！）" : "") + (got.prize !== "revive" && gotTool ? "（" + GameState.TOOLS[got.tool].name + "も）" : ""));
        Battle.pop(b.x, b.y - 22, (got.prize === "gem" ? "宝玉" : got.prize === "revive" ? "復活薬" : "素材の山") + "！", "#ff9ad0", 10);
      }
      snapshot();
      Battle.pop(b.x, b.y - 34, "+" + got.gold + "G", "#f2c14e", 7);
      Sound.play("chest");
    });
    // 鍵のかかった扉：鍵を持っていれば、近づくと開く
    if (dg.lock && !dg.lock.open && curKey === dg.lock.parent) {
      var dt3 = Dungeon.doorTiles(room.w, room.h, dg.lock.dir), mid = dt3[1];
      if (near(mid.x * T + 8, mid.y * T + 8, 26)) {
        if (dg.hasKey) {
          dg.lock.open = true; dg.hasKey = false;
          dt3.forEach(function (p) { room.setTile(p.x, p.y, ":"); });
          say("出口の鍵で扉を開けた！"); snapshot(); Sound.play("door");
        } else if (run.lockMsg <= 0) {
          say("出口の扉には鍵がかかっている。どこかの部屋に出口の鍵があるはず");
          run.lockMsg = 3;
        }
      }
    }
    // 罠：立っているタイルで調べる
    var tx = Math.floor(A.x / T), ty = Math.floor(A.y / T), onPit = false;
    for (var i = 0; i < c.traps.length; i++) {
      var t = c.traps[i];
      if (tx < t.tx || ty < t.ty || tx >= t.tx + t.w || ty >= t.ty + t.h) continue;
      if (t.hidden && !t.found) { t.found = true; Battle.pop(A.x, A.y - 40, "隠れた罠！", "#c86ae0", 8); snapshot(); Sound.play("trap"); }
      var ch = Party.current();
      if (t.type === "rock") {
        // 落石（黒鉄の坑道、2026-10-27 保護者の案）：踏むと、その場所に影が出て、少しあとに天井から岩が落ちてくる。
        // すぐ動けばよけられる。当たると最大HPの10%（これでたおれることはない）。同じ罠は少しのあいだ落ちない
        if (!(t.wait > 0)) {
          t.wait = 2.5;
          run.falls.push({ x: A.x, y: A.y, t: FALL_TIME });
          say("頭の上で、岩がくずれる音がした！"); Sound.play("trap");
        }
        continue;
      }
      if (t.type === "swamp") {
        if (!ch.status.poison && run.swampCd <= 0) {
          Party.addStatus(ch, "poison", 8);
          run.swampCd = 1.5;
          say("毒の沼だ！"); Sound.play("trap");
        }
      } else {
        onPit = true;
        if (!run.inPit) {
          // 落とし穴：少しダメージ（最大HPの10%。これで倒れることはない）＋部屋の入口へ（2026-10-17 決定）
          var dmg = Math.max(1, Math.round(ch.stats.hp * 0.1));
          ch.hp = Math.max(1, ch.hp - dmg); Sound.play("trap");
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
    updateFalls(dt, c);
    // 部屋の型の毒の沼（P。瘴気の森）：罠の毒の沼と同じ（毒になっていなければ、毒になる）
    if (room.tile(tx, ty) === "P") {
      var pc = Party.current();
      if (!pc.status.poison && run.swampCd <= 0) {
        Party.addStatus(pc, "poison", 8);
        run.swampCd = 1.5;
        say("毒の沼だ！"); Sound.play("trap");
      }
    }
    return false;
  }

  // ---------- 落石（黒鉄の坑道） ----------
  var FALL_TIME = 0.9, FALL_R = 13;
  function updateFalls(dt, c) {
    c.traps.forEach(function (t) { if (t.wait > 0) t.wait -= dt; });
    if (!run.falls) run.falls = [];
    run.falls.forEach(function (f) {
      if (f.t > 0) {
        f.t -= dt;
        if (f.t <= 0) {
          f.dust = 0.35;
          Sound.play("hit");
          var dx = A.x - f.x, dy = A.y - f.y, ch = Party.current();
          if (dx * dx + dy * dy <= FALL_R * FALL_R && !ch.down) {
            var dmg = Math.max(1, Math.round(ch.stats.hp * 0.1));
            ch.hp = Math.max(1, ch.hp - dmg);
            A.hurtT = 0.3;
            Battle.pop(A.x, A.y - 28, String(dmg), "#ef5b5b", 9);
            say("落石に当たった！");
          }
        }
      } else f.dust -= dt;
    });
    run.falls = run.falls.filter(function (f) { return f.t > 0 || f.dust > 0; });
  }
  // 影はだんだん濃く大きく、岩は上から落ちてくる。落ちたら砂けむり
  function drawFalls() {
    if (!run.falls || !run.falls.length) return;
    run.falls.forEach(function (f) {
      var x = Math.round(f.x - cam.x), y = Math.round(f.y - cam.y);
      if (f.t > 0) {
        var k = 1 - f.t / FALL_TIME, ctx = Render.ctx;
        ctx.fillStyle = "rgba(0,0,0," + (0.15 + 0.35 * k).toFixed(2) + ")";
        ctx.beginPath(); ctx.ellipse(x, y, FALL_R * (0.5 + 0.5 * k), FALL_R * (0.5 + 0.5 * k) * 0.55, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(255,90,64," + (0.3 + 0.5 * k).toFixed(2) + ")"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(x, y, FALL_R, FALL_R * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
        if (k > 0.35) {   // 岩：上から落ちてくる
          var ry = y - Math.round((1 - (k - 0.35) / 0.65) * 70) - 6;
          Render.rect(x - 5, ry - 4, 10, 8, "#140c1c");
          Render.rect(x - 4, ry - 3, 8, 6, "#544f5a");
          Render.rect(x - 3, ry - 3, 4, 2, "#706a76");
          Render.rect(x + 1, ry + 1, 3, 2, "#3c3842");
        }
      } else {   // 砂けむりと、くだけた石
        var kd = 1 - f.dust / 0.35;
        for (var i = 0; i < 8; i++) {
          var a = i * Math.PI / 4 + 0.3, rd = 4 + kd * 12;
          Render.rect(Math.round(x + Math.cos(a) * rd) - 1, Math.round(y + Math.sin(a) * rd * 0.55) - 1, 2, 2, i % 2 ? "rgba(160,150,140," + (1 - kd).toFixed(2) + ")" : "rgba(84,79,90," + (1 - kd).toFixed(2) + ")");
        }
      }
    });
  }

  // 部屋が画面より大きいときは、キャラについていく。小さいときは、部屋を画面のまんなかに置く。
  function updateCamera() {
    if (room.pxW <= view.w) cam.x = -Math.round((view.w - room.pxW) / 2);
    else cam.x = Math.round(clamp(A.x - view.w / 2, 0, room.pxW - view.w));
    if (room.pxH <= view.h) cam.y = -Math.round((view.h - room.pxH) / 2);
    else cam.y = Math.round(clamp(A.y - view.h / 2, 0, room.pxH - view.h));
    var q = Bosses.shakeOffset();   // ゴーレムの大きな攻撃で、画面がゆれる
    cam.x += q.x; cam.y += q.y;
  }

  // ---------- 描画 ----------
  function draw() {
    Render.begin();
    room.draw(cam, view);
    room.drawCrowns(cam, view, A.y + 6, false);   // キャラより手前（南）の行の木の葉は、キャラの後ろ
    drawThings();
    if (curKey === dg.exit && (!dg.boss || dg.bossDown)) drawExit();
    Enemies.draw(cam);
    drawFalls();
    if (cine && cine.kind === "boss") drawBossCine();
    Combat.drawCastBack(cam, view);   // スキルを使ったとき：画面が少し暗くなり、使った仲間のまわりが光る
    drawActor();
    room.drawCrowns(cam, view, A.y + 6, true);    // キャラより奥（北）の行の木の葉は、キャラの前
    Combat.draw(cam);
    Battle.draw(cam);
    drawHud();
    if (run.fade > 0) Render.rect(0, 0, view.w, view.h, "rgba(0,0,0," + Math.min(1, run.fade / 0.3).toFixed(2) + ")");
    if (cine && cine.kind === "exit") drawExitCine();
    if (run.blackout) Render.rect(0, 0, view.w, view.h, "#000");   // 出口の演出のあと、結果の画面のうしろは暗いまま
  }

  // 罠・宝箱・鍵（宝箱・鍵・落とし穴のドット絵は props.js。2026-10-18 に仮の絵から差しかえ）
  function drawThings() {
    var c = dg.cells[curKey], T = World.TILE, ctx = Render.ctx;
    // 部屋の型の毒の沼（P）：ところどころで泡がうかんで、はじける（絵は tiles.js。泡だけここで動かす）
    if (!room._pTiles) {
      room._pTiles = [];
      for (var py = 0; py < room.h; py++) for (var px = 0; px < room.w; px++) if (room.tile(px, py) === "P" && ((px * 7 + py * 13) % 5) === 0) room._pTiles.push([px, py]);
    }
    room._pTiles.forEach(function (pt, i) {
      var ph = (glow * 0.7 + i * 0.37) % 1;
      if (ph > 0.6) return;
      var bx = Math.round(pt[0] * T + 4 + (i * 5) % 8 - cam.x), by = Math.round(pt[1] * T + 11 - ph * 6 - cam.y), bs = ph < 0.5 ? 2 : 3;
      Render.rect(bx, by, bs, bs, ph < 0.5 ? "#c89ae0" : "rgba(200,154,224,0.5)");
    });
    c.traps.forEach(function (t, i) {
      if (t.hidden && !t.found) return;
      var x = Math.round(t.tx * T - cam.x), y = Math.round(t.ty * T - cam.y);
      if (t.type === "pit") {
        ctx.drawImage(Props.get("pit"), x, y);
      } else if (t.type === "rock") {   // 落石：天井から落ちた小石と、床のひび
        Render.rect(x + 3, y + 5, 3, 2, "#706a76"); Render.rect(x + 9, y + 9, 2, 2, "#544f5a"); Render.rect(x + 6, y + 12, 3, 2, "#706a76");
        Render.rect(x + 4, y + 8, 1, 1, "#16141a"); Render.rect(x + 5, y + 9, 1, 1, "#16141a"); Render.rect(x + 6, y + 10, 2, 1, "#16141a"); Render.rect(x + 10, y + 5, 1, 2, "#16141a");
      } else {   // 毒の沼：床の上に重ねる半とうめいの紫（2026-10-18 保護者の希望で、ドット絵にせず前の描き方のまま）
        Render.rect(x, y, t.w * T, t.h * T, "rgba(120,60,140,0.75)");
        var bb = Math.floor(glow * 2) % 3;
        Render.rect(x + 6 + bb * 5, y + 8, 3, 3, "#c89ae0");
        Render.rect(x + 18 - bb * 3, y + 20, 2, 2, "#c89ae0");
      }
    });
    c.chests.forEach(function (b) {
      var x = Math.round(b.x - cam.x), y = Math.round(b.y - cam.y);
      var img = Props.get((b.opened ? "chestOpen" : "chest") + (b.gold ? "Gold" : b.rare ? "Rare" : ""));
      ctx.drawImage(img, x - 8, y - 7);
      if (b.rare && !b.opened) {   // R以上が出る宝箱は、きらっと光る
        var s = 0.5 + 0.5 * Math.sin(glow * 5);
        Render.rect(x + 6, y - 11, 2, 2, "rgba(255,240,160," + s.toFixed(2) + ")");
      }
    });
    if (c.key && !c.key.taken) {
      var kx = Math.round(c.key.x - cam.x), ky = Math.round(c.key.y - cam.y - 2 - Math.sin(glow * 3) * 2);
      Render.rect(kx - 5, Math.round(c.key.y - cam.y) + 4, 10, 2, "rgba(20,12,28,0.35)");   // かげ
      ctx.drawImage(Props.get("key"), kx - 6, ky - 3);
    }
    if (c.spring) {   // 回復の泉：石のふちと光る水（ドット絵は props.js）。のぼる光の粒も1点ずつ
      var sx = Math.round(c.spring.x - cam.x), sy = Math.round(c.spring.y - cam.y);
      ctx.drawImage(Props.get("spring_" + (room.theme === "swamp" || room.theme === "wild" || room.theme === "cave" ? room.theme : "forest") + "_" + (Math.floor(glow * 3) % 3)), sx - 15, sy - 9);
      for (var sp = 0; sp < 5; sp++) {
        var ph = (glow * 0.6 + sp / 5) % 1, px2 = sx - 8 + ((sp * 7) % 17), py2 = Math.round(sy - 2 - ph * 20);
        if (ph > 0.85) continue;
        Render.rect(px2, py2, 1, 1, ph < 0.5 ? "#ffffff" : "#7fc8ec");
        if (ph < 0.3) { Render.rect(px2 - 1, py2, 1, 1, "#7fc8ec"); Render.rect(px2 + 1, py2, 1, 1, "#7fc8ec"); }
      }
    }
    (c.pickups || []).forEach(function (u) {   // 薬草・魔力のキノコ・毒消し草（少しゆれる）
      if (u.taken) return;
      var ux = Math.round(u.x - cam.x), uy = Math.round(u.y - cam.y);
      // 草の地面にまぎれないように、足もとにうすい光（薬草は緑、キノコは青、毒消し草は白っぽい水色）
      Combat.glowDot(ctx, ux, uy - 1, 12, "#ffffff", u.kind === "herb" ? "#d8ffa0" : u.kind === "cure" ? "#d0fff0" : "#bfe4ff", 0.7 + 0.2 * Math.sin(glow * 3 + u.x));
      Render.rect(ux - 4, uy + 4, 8, 2, "rgba(20,12,28,0.3)");
      ctx.drawImage(Props.get(u.kind === "herb" ? "herb" : u.kind === "cure" ? "cure" : "mush"), ux - 4, uy - 5 + Math.round(Math.sin(glow * 2 + u.x) * 0.6));
    });
    if (c.ckey && !c.ckey.taken) {   // 宝箱の鍵（銀）
      var cx2 = Math.round(c.ckey.x - cam.x), cy2 = Math.round(c.ckey.y - cam.y - 2 - Math.sin(glow * 3 + 1) * 2);
      Render.rect(cx2 - 5, Math.round(c.ckey.y - cam.y) + 4, 10, 2, "rgba(20,12,28,0.35)");
      ctx.drawImage(Props.get("keySilver"), cx2 - 6, cy2 - 3);
    }
  }

  // 出口：床の上に重ねる光（2026-10-18 保護者の希望で、ドット絵にせず、まんなかが光るグラデーションに）
  var glow = 0;
  function drawExit() {
    var ex = dg.cells[curKey].center, ctx = Render.ctx;
    var x = Math.round(ex.x - cam.x), y = Math.round(ex.y - cam.y);
    var pulse = 0.5 + 0.5 * Math.sin(glow * 4);
    // まんなかがいちばん明るく、外に向かって金色からとうめいになる光（2026-10-18 保護者の希望）
    var r = 16 + pulse * 3;
    var gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(255,252,235," + (0.9 + 0.1 * pulse).toFixed(2) + ")");
    gr.addColorStop(0.25, "rgba(255,230,140," + (0.75 + 0.15 * pulse).toFixed(2) + ")");
    gr.addColorStop(0.6, "rgba(242,193,78," + (0.35 + 0.15 * pulse).toFixed(2) + ")");
    gr.addColorStop(1, "rgba(242,193,78,0)");
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
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
    if (c.enchant) tags.push(GameData.ELEMENTS[c.enchant.elem] + "の剣");   // 魔法剣士（2026-10-20）
    if (c.guts > 0) tags.push("不屈");
    if (A.hidden > 0) tags.push("かくれている");
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
    // 手に入れたもの（訓練場では出さない）
    if (!dg.training) Render.text(run.gold + "G　鉱石" + run.mat.iron + "　魔石" + run.mat.stone + "　装備" + run.got.length, 7, y + 10, { size: 6, color: "#f2c14e" });
    var yy = y + 19;
    if (dg.hasKey) { Render.text("出口の鍵を持っている", 7, yy, { size: 6, color: "#ffe066" }); yy += 9; }
    if (dg.hasCKey) { Render.text("宝箱の鍵を持っている", 7, yy, { size: 6, color: "#dfe6ee" }); yy += 9; }
    if (trial.subjects.length) { Render.text("加護：" + trial.subjects.map(function (s) { return Trial.BLESS[s].name; }).join("・"), 7, yy, { size: 6, color: "#b6e3ff" }); yy += 9; }
    if (trial.tryMode) Render.text("試しモード（記録に残らない）", 7, yy, { size: 6, color: "#ffb36b" });

    // 上のまんなか：階層と残り時間（残り1分で赤くなり、点滅する）
    if (dg.arena) drawArenaHud(); else if (dg.training) drawTrainHud();   // 訓練場：時間と地図のかわりに、たしかめるための数字
    else {
      var tl = Math.ceil(run.timeLeft), mm = Math.floor(tl / 60), ss = tl % 60;
      var low = run.timeLeft <= 60;
      var tcol = low ? (Math.floor(run.timeLeft * 2) % 2 === 0 ? "#ef5b5b" : "#ffb0a8") : "#ece7da";
      Render.rect(view.w / 2 - 44, 3, 88, 24, "rgba(10,12,18,0.72)");
      Render.text(GameData.floorLabel(dg.floor, dg.dungeon), view.w / 2, 5, { size: 7, align: "center", color: "#a3c88a" });
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
    }

    // ボスの HP（画面の上に大きく）
    var my2 = 34;
    if (boss && !boss.dead) {
      var bw = Math.min(220, view.w - 260), wk = bossWeakLine(boss);
      Render.rect(view.w / 2 - bw / 2 - 3, 29, bw + 6, wk ? 26 : 17, "rgba(10,12,18,0.72)");
      Render.text(boss.def.name, view.w / 2, 30, { size: 7, align: "center", bold: true, color: "#ffb0a8" });
      bar(view.w / 2 - bw / 2, 39, bw, 5, boss.hp / boss.maxHp, "#ef5b5b");
      if (wk) Render.text(wk, view.w / 2, 46, { size: 7, align: "center", color: "#ffd27a" });
      my2 = wk ? 59 : 50;
    }
    if (message.t > 0) Render.text(message.text, view.w / 2, my2, { size: 9, align: "center", bold: true });

    // PC：スキルの名前と、使えるまでの時間
    if (!Input.isTouch) {
      var keys = ["U", "I", "O"], s = [];
      Party.skillsOf(c).forEach(function (id, i) {
        var sk = GameData.SKILL[id];
        if (!sk) { s.push(keys[i] + ":なし"); return; }
        var ct = c.ct[id] || 0;
        s.push(keys[i] + ":" + sk.name + (sk.once && c.used[id] ? "(使用済)" : ct > 0 ? "(" + ct.toFixed(0) + ")" : "") + " MP" + Combat.mpCost(c, sk));
      });
      Render.text((c.setsOn ? "［セット" + (c.page === 1 ? "B" : "A") + "　L で切りかえ］　" : "") + s.join("　"), view.w / 2, view.h - 22, { size: 7, align: "center", color: "#ffe7a0" });
      Render.text("移動 WASD/矢印　攻撃 J（押しっぱなしでも）　切替 K　メニュー Esc", view.w / 2, view.h - 11, { size: 7, align: "center", color: "#a3a8bd" });
    }
    if (debug) Render.text(fps.value + " fps", view.w - 6, view.h - 34, { size: 7, align: "right", color: "#6fd08c" });
  }

  function buffName(b) {
    var names = { patk: "物攻", pdef: "物防", mdef: "魔防", matk: "魔攻", wait: "待ち時間", crit: "会心", evade: "よける" };
    return names[b.stat] + (b.pct > 0 ? "↑" : "↓");
  }

  function drawActor() {
    var c = Party.current();
    var px = Math.round(A.x - cam.x), py = Math.round(A.y - cam.y);
    var ctx = Render.ctx;
    // 攻撃を受けたとき：キャラのまわりが少し赤く光る（2026-10-19）
    if (A.hurtT > 0) Combat.glowDot(ctx, px, py - 6, 16, "#ffffff", "#ef3b3b", 0.75 * A.hurtT / 0.3);
    if (A.inv > 0 && Math.floor(A.inv * 20) % 2 === 0) return;
    Render.rect(px - 6, py + 5, 12, 3, "rgba(0,0,0,0.35)");
    // 段階7-2b：ドット絵（sprites.js）。歩く・走る・攻撃でコマを変える
    var ph = Math.sin(A.walk), moving = A.move > 0.1;
    var frame = A.swing > 0 ? "attack" : !moving ? "stand" : A.running ? (ph > 0 ? "runA" : "runB") : ph > 0.3 ? "walkA" : ph < -0.3 ? "walkB" : "stand";
    var hair = c.hero ? c.hero.face : 0;
    var d = Sprites.dirOf(A.face);
    // 武器：ふつうは手に、攻撃中はつき出し、敵を全滅させた部屋で走るときは背中にしまう
    var mode = A.swing > 0 ? "attack" : A.running ? "back" : "hold";
    var behind = mode === "back" ? d.dir !== "up" : mode === "hold" ? d.dir !== "down" : d.dir === "up";   // 横で持つときも体の後ろ
    if (A.hidden > 0) ctx.globalAlpha = 0.45;   // 隠れみの術：半分すける
    // 槍の突き（2026-10-21）：振らずに、向いているほうへ槍をつき出してもどす
    var ext = A.swing > 0 && (A.swingKind === "thrust" || A.swingKind === "punch") ? Math.sin((1 - A.swing / (A.swingMax || 0.15)) * Math.PI) * (A.swingKind === "punch" ? 4 : 7) : 0;
    if (behind) Sprites.drawWeapon(ctx, c.weapon, A.face, px, py + 6, mode, ext);
    Sprites.drawHero(ctx, c.job, hair, A.face, frame, px, py + 6);
    if (!behind) Sprites.drawWeapon(ctx, c.weapon, A.face, px, py + 6, mode, ext);
    ctx.globalAlpha = 1;
    // 剣に属性がのっているとき（魔法剣士）：武器のまわりがその色に光る
    if (c.enchant) Combat.glowDot(ctx, px + A.face.x * 6, py - 2 + A.face.y * 4, 8, "#ffffff", ({ fire: "#ff8a3d", water: "#5aa9ff", grass: "#9be36a" })[c.enchant.elem] || "#ffffff", 0.35 + 0.1 * Math.sin(Date.now() / 90));
    if (c.guts > 0) Combat.glowDot(ctx, px, py - 6, 14, "#ffffff", "#fff2a0", 0.25);   // 不屈の光
    if (c.status.sleep) Render.text("Zz", px + 7, py - 20, { size: 7, color: "#b48cf0" });
    if (A.swing > 0 && A.swingKind !== "thrust" && A.swingKind !== "punch") {   // 振った方向へ流れる三日月の光（skills.js の drawSlash。2026-10-19）。突きと拳は出さない
      var sm = A.swingMax || 0.15;
      Combat.drawSlash(ctx, px, py - 3, A.face, A.swingArc, A.swingReach, A.swingColor, 1 - A.swing / sm, A.swingFlip);
    }
    drawActGauge(px, py + 9);
  }

  // 行動のゲージ（2026-10-27 保護者と決定。ふつうの攻撃もスキルも同じ形）：攻撃が出る前は、体のまわりの黄色い輪（skills.js）。
  // 攻撃が出たあとに足もとに1本出す。左から右へ時間が進む。
  //   オレンジ＝攻撃が出たあと動けない、黄色＝次のふつうの攻撃まで（動ける）。すぎたところは明るく、これからのところは暗い。
  //   長さは時間に合わせる（1秒＝24点。長いときは 36点に収まるようにちぢめる）
  var GAUGE = { post: ["#ff9a4d", "#7a4a2a"], wait: ["#f2c14e", "#6a5a28"], pps: 24, max: 36 };
  function drawActGauge(px, y) {
    var g = A.act;
    if (!g) return;
    if (A.busy > 0) g.busyEnd = Math.max(g.busyEnd, g.el + A.busy);   // 0 のときは、のばさない
    if (A.wait > 0) g.waitEnd = Math.max(g.waitEnd, g.el + A.wait);
    var end = Math.max(g.pre, g.busyEnd, g.waitEnd);
    if (g.el >= end) { A.act = null; return; }
    if (g.el < g.pre) return;   // 攻撃が出る前は、黄色い輪だけ
    var span = end - g.pre, pps = Math.min(GAUGE.pps, GAUGE.max / span), W = Math.max(8, Math.round(span * pps)), x0 = Math.round(px - W / 2), H = 3;
    var segs = [[g.pre, g.busyEnd, GAUGE.post], [Math.max(g.pre, g.busyEnd), g.waitEnd, GAUGE.wait]];
    Render.rect(x0 - 1, y - 1, W + 2, H + 2, "#140c1c");   // ふち
    Render.rect(x0, y, W, H, "#2a2f42");
    var now = Math.round((g.el - g.pre) / span * W);
    segs.forEach(function (sg) {
      if (sg[1] <= sg[0]) return;
      var a = Math.round((sg[0] - g.pre) / span * W), b = Math.round((sg[1] - g.pre) / span * W);
      if (b <= a) return;
      Render.rect(x0 + a, y, b - a, H, sg[2][1]);                                 // これから（暗い）
      var f = Math.min(b, Math.max(a, now));
      if (f > a) Render.rect(x0 + a, y, f - a, H, sg[2][0]);                       // すぎたところ（明るい）
    });
  }

  // ---------- iPad のボタンの文字（スキルの名前と、使えるまでの時間） ----------
  var btnEls = ["skill1", "skill2", "skill3"].map(function (n) { return document.querySelector('[data-act="' + n + '"]'); });
  var switchEl = document.querySelector('[data-act="switch"]');
  var setswapEl = document.querySelector('[data-act="setswap"]');
  var lastLabels = ["", "", "", "", "-"];
  function updateButtons(force) {
    var c = Party.current();
    btnEls.forEach(function (b, i) {
      var sk = GameData.SKILL[Party.skillsOf(c)[i]];
      var ct = sk ? (c.ct[sk.id] || 0) : 0;
      var label = !sk ? "なし" : (sk.once && c.used[sk.id]) ? sk.short + "\n済" : ct > 0 ? sk.short + "\n" + Math.ceil(ct) : sk.short;
      var dim = !sk || ct > 0 || c.mp < Combat.mpCost(c, sk) || (sk.once && c.used[sk.id]);
      if (force || label + dim !== lastLabels[i]) {
        b.textContent = label; b.classList.toggle("dim", !!dim); lastLabels[i] = label + dim;
      }
    });
    var sc = Party.switchCd();
    var sl = sc > 0 ? "切替\n" + Math.ceil(sc) : "切替";
    if (force || sl !== lastLabels[3]) { switchEl.textContent = sl; switchEl.classList.toggle("dim", sc > 0); lastLabels[3] = sl; }
    // スキルセットの切りかえのボタン：使える仲間のときだけ出す。A か B かを出す（2026-10-22）
    var ss = c.setsOn ? "セット\n" + (c.page === 1 ? "B" : "A") : "";
    if (force || ss !== lastLabels[4]) {
      setswapEl.hidden = !c.setsOn; setswapEl.textContent = ss; setswapEl.classList.toggle("b", c.page === 1); lastLabels[4] = ss;
    }
  }

  // ---------- 倒れたときの選択・全滅 ----------
  var chooseEl = document.getElementById("choose");
  // ボスへのやり直し（2026-10-21 保護者の案）：ボスの部屋で3人ともたおれたら、1回の冒険で1回だけ、ボスに挑んだときにもどれる
  // ボスのHPをどれだけけずったか（0〜1）。やり直したときは、よいほうを残す（2026-10-21 保護者が決定）
  function bossDamaged() {
    var b = Enemies.alive().filter(function (e) { return e.def && e.def.boss; })[0];
    return b ? Math.max(0, Math.min(1, 1 - b.hp / b.maxHp)) : 0;
  }
  function noteBossBest() { run.bossBest = Math.max(run.bossBest || 0, bossDamaged()); }
  function canBossRetry() { return dg.boss && curKey === dg.exit && !dg.bossDown && !run.bossRetried && !!run.bossSave; }
  function showBossRetry() {
    choosing = true; A.down = true; Input.releaseAll();
    document.getElementById("chooseTitle").textContent = "3人ともたおれた…";
    var lead = document.getElementById("chooseLead");
    lead.textContent = "もう一度だけ、ボスに挑める。仲間のHP・MPと残り時間は、ボスに挑んだときにもどる。";
    var box = document.getElementById("chooseList"); box.textContent = "";
    var again = document.createElement("button"); again.type = "button"; again.className = "btn wide";
    again.textContent = "もう一度挑む（1回だけ）";
    again.addEventListener("click", function () { chooseEl.hidden = true; bossRetry(); });
    var give = document.createElement("button"); give.type = "button"; give.className = "btn wide";
    give.textContent = "あきらめて帰る";
    give.addEventListener("click", function () { chooseEl.hidden = true; finish("wipe"); });
    box.appendChild(again); box.appendChild(give);
    chooseEl.hidden = false;
  }
  function bossRetry() {
    noteBossBest();
    run.bossRetried = true;
    var sv = run.bossSave;
    run.timeLeft = sv.time;
    Party.members().forEach(function (m, i) {
      var p = sv.party[i] || { hp: m.stats.hp, mp: m.stats.mp, down: false };
      m.hp = Math.max(1, p.down ? m.stats.hp : p.hp); m.mp = p.mp; m.down = false;
      m.status = {}; m.buffs = []; m.regens = []; m.ct = {};
    });
    var first = 0; Party.switchTo(first);
    choosing = false; A.down = false;
    // ボスの部屋に入りなおす（ボスは HP 満タンで、もう一度。前の文章は出さない）
    enterRoom(dg.exit, "w");
    Sound.bgm("boss");
    say("もう一度、ボスに挑む！ これが最後のチャンス");
    updateButtons(true);
    snapshot();
  }
  function showChoose(fallen) {
    choosing = true; A.down = true; Input.releaseAll();
    var box = document.getElementById("chooseList"); box.textContent = "";
    document.getElementById("chooseTitle").textContent = fallen.name + " はたおれた…";
    document.getElementById("chooseLead").textContent = "次に戦う仲間を選んでください";
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
    var titles = { clear: GameData.floorLabel(dg.floor, dg.dungeon) + "をクリア！", timeout: "時間切れ…", wipe: "3人ともたおれた…", quit: "冒険をやめた" };
    document.getElementById("chooseTitle").textContent = titles[kind];
    Sound.bgm(""); Sound.play(kind === "clear" ? "clear" : "fail");
    if (kind === "clear") {
      run.clearGold = Loot.clearGold(dg.power, settings.correct); run.gold += run.clearGold;
      // クリア報酬：経験値 (20＋5×深さ)×(1＋0.25×正解数)、熟練度 10（倒れていない仲間に）
      var ce = (20 + 5 * dg.power) * (1 + 0.25 * settings.correct);
      Party.members().forEach(function (m, i) { if (!m.down) { run.exp[i] += ce; run.mastery[i] += 10; } });
    }
    // チャレンジボーナス（2026-10-21 保護者と決定）：ボスに挑んで負けた（たおれた・時間切れ）とき。けずった割合で変わる。クリアよりはっきり少ない
    run.challenge = null;
    if ((kind === "wipe" || kind === "timeout") && dg.boss && run.bossSave && !dg.bossDown && !trial.tryMode) {
      if (curKey === dg.exit) noteBossBest();
      var best = run.bossBest || 0, rate = 0.2 + 0.4 * best;
      var ce2 = (20 + 5 * dg.power) * (1 + 0.25 * settings.correct) * rate;
      var cg = Math.round(Loot.clearGold(dg.power, settings.correct) * rate), nm = 2 + Math.round(3 * best);
      run.gold += cg;
      for (var mi = 0; mi < nm; mi++) run.mat[Math.random() < 0.6 ? "iron" : "stone"]++;
      Party.members().forEach(function (m, i) { run.exp[i] += ce2; run.mastery[i] += 5; });
      run.challenge = { best: best, gold: cg, mat: nm };
    }
    var tl = Math.ceil(run.timeLeft);
    var lines = [
      "たおした敵 " + run.kills + "体　通った部屋 " + finishedCells() + "　のこり時間 " + Math.floor(tl / 60) + ":" + (tl % 60 < 10 ? "0" : "") + (tl % 60),
      (trial.skipped ? "知恵の試練：なし（問題を読みこめず、とばした）" : "知恵の試練の正解 " + settings.correct + "問" + (trial.tryMode ? "（試しモード）" : trial.test ? "（テスト用の出発）" : "")) +
        (trial.subjects.length ? "　加護：" + trial.subjects.map(function (s) { return Trial.BLESS[s].name; }).join("・") : ""),
      run.title ? "称号「" + run.title + "」を手に入れた！（書庫の称号の棚に飾られる）" : "",
      run.challenge ? "チャレンジボーナス：ボスのHPを" + Math.round(run.challenge.best * 100) + "%けずった！（" + run.challenge.gold + "G・素材" + run.challenge.mat + "こ・経験値と熟練度も少し）" : "",
      "手に入れたもの：" + run.gold + "G" + (run.clearGold ? "（クリア報酬 " + run.clearGold + "G をふくむ）" : "") + "　鉱石 " + run.mat.iron + "　魔石 " + run.mat.stone + (run.mat.gem ? "　宝玉 " + run.mat.gem : ""),
      "経験値 " + Party.members().map(function (m, i) { return m.name + " +" + Math.round(run.exp[i]); }).join("　"),
      trial.tryMode ? "試しモードなので、拾った物も経験値も持ち帰らない（記録にもセーブにも残らない）。" :
      kind === "clear" ? "拾った物と経験値を持って、拠点にもどろう。" : "拾った物と経験値は持ち帰れるが、階層は進まない。"
    ];
    var lead = document.getElementById("chooseLead"); lead.textContent = "";
    lines.forEach(function (t) { if (!t) return; var d = document.createElement("div"); d.textContent = t; lead.appendChild(d); });
    // 手に入れた装備（拠点とセーブは段階5。今は見せるだけ）
    if (run.got.length) {
      var h = document.createElement("div"); h.className = "got-head"; h.textContent = "手に入れた装備（倉庫に入る）"; lead.appendChild(h);
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
      title: run.title || null, dungeon: dg.dungeon, floor: dg.floor, cleared: kind === "clear", boss: dg.boss, kills: run.byType, kind: kind, test: !!trial.test, tryMode: !!trial.tryMode,
      correct: settings.correct, subjects: trial.subjects, skipped: !!trial.skipped
    };
    GameState.setAdventure({ state: "finished", result: result }); // 「拠点にもどる」を押す前に閉じても、次に開いたとき受け取れる
    button("つづける", function () { active = false; dg = null; Enemies.clear(); Combat.clear(); Base.returnFrom(result); });
    chooseEl.hidden = false;
  }

  // 拠点から呼ぶ：出発する
  window.Adventure = {
    settings: settings,
    startArena: startArena,   // 闘技場（2026-10-30）：cfg { rivals（相手の仲間3人）, who（相手の名前）, onEnd(win) }
    // t.dungeon：どのダンジョンか（省くと新緑の樹海）
    start: function (floor, seed, t) {
      trial = t || { correct: settings.correct, subjects: [], test: true };
      settings.correct = trial.correct; settings.dungeon = trial.dungeon || "forest1";
      startFloor(floor, seed); updateButtons(true); Sound.bgm("dungeon");
    },
    // 途中で閉じた冒険の続き（その階層の入口から）
    resume: function (a) {
      trial = { correct: a.correct, subjects: a.subjects || [], test: !!a.test, tryMode: !!a.tryMode, skipped: !!a.skipped };
      settings.correct = a.correct; settings.dungeon = a.dungeon || "forest1"; startFloor(a.floor, a.seed, a); updateButtons(true); Sound.bgm("dungeon");
    },
    resultFromSnapshot: resultFromSnapshot,
    startTraining: startTraining
  };

  // ---------- 訓練場（2026-10-21 保護者の案） ----------
  // 宿屋の訓練場のタブから入る。まんなかの像（木・石・銅）を攻撃して、武器やスキルの強さをたしかめる。
  // HP・MP は本当に減る（すみの回復の泉で全快）。像はこわれても0.6秒で元にもどる。経験値・お金・素材・図鑑・セーブには何も残らない。
  // 画面の右に、1秒あたりのダメージ（最近10秒）・合計ダメージ・使った MP・こわした回数とかかった時間を出す。
  var training = null;
  function startTraining(cfg) {
    training = { type: cfg.type, attack: !!cfg.attack, res: cfg.res || {}, statue: null, respawn: 0, clock: 0 };
    resetTrainStats();
    trial = { correct: 0, subjects: [], test: true, training: true };
    settings.correct = 0; settings.dungeon = "forest1";
    dg = Dungeon.trainingFloor(training.type);
    Party.setup(GameState.get().party.map(function (h) { return Party.fromHero(h); }));
    Party.resetAll();
    active = true; paused = false; choosing = false; cine = null;
    pauseEl.hidden = true; chooseEl.hidden = true;
    A.wait = 0; A.busy = 0; A.down = false; A.move = 0;
    run = newRun();
    enterRoom(dg.start, null);
    prerender(dg);
    training.prevMp = Party.members().map(function (m) { return m.mp; });
    say("訓練場：像を攻撃して、武器やスキルの強さをたしかめよう");
    updateButtons(true); Sound.bgm("dungeon");
  }
  function resetTrainStats() {
    training.total = 0; training.mp = 0; training.kills = 0; training.lastKill = null; training.log = []; training.firstHit = null; training.spawnHit = null;
  }
  function spawnStatue(slot) {
    var e = Enemies.spawn(slot.type, slot.x, slot.y, GameData.ENEMIES[slot.type].trainDepth);
    var res = {}; Object.keys(training.res).forEach(function (k) { res[k] = training.res[k]; });
    e.res = res;
    e.face = { x: 0, y: 1 };
    if (!training.attack) {   // 攻撃してこない像：その場から動かない
      var d = {}; Object.keys(e.def).forEach(function (k) { d[k] = e.def[k]; });
      d.kind = "dummy"; d.speed = 0; e.def = d;
    }
    e.slot = slot;
    training.statue = e; training.lastHp = e.hp; training.spawnHit = null;
  }
  function trainKill(e) {
    training.kills++;
    if (training.spawnHit !== null) training.lastKill = training.clock - training.spawnHit;
    training.respawn = 0.6;
    Battle.pop(e.x, e.y - 34, "こわれた！", "#f2c14e", 8);
  }
  function trainUpdate(dt) {
    training.clock += dt;
    var st = training.statue;
    // 像に入ったダメージ（毒などもふくむ）
    if (st && st.hp < training.lastHp) {
      var dmg = training.lastHp - st.hp;
      training.total += dmg; training.log.push([training.clock, dmg]);
      if (training.firstHit === null) training.firstHit = training.clock;
      if (training.spawnHit === null) training.spawnHit = training.clock;
      training.lastHp = st.hp;
    }
    // 使った MP（回復の泉などで増えたぶんは数えない）
    Party.members().forEach(function (m, i) {
      var pv = training.prevMp[i];
      if (m.mp < pv) training.mp += pv - m.mp;
      training.prevMp[i] = m.mp;
    });
    // こわれた像は、少しして元にもどる
    if (training.respawn > 0) {
      training.respawn -= dt;
      if (training.respawn <= 0) { spawnStatue(dg.cells[curKey].enemies[0]); run.roomAlive = 1; }
    }
    while (training.log.length && training.clock - training.log[0][0] > 10) training.log.shift();
  }
  function trainRevive() {
    Party.members().forEach(function (m) { m.down = false; m.hp = m.stats.hp; m.mp = m.stats.mp; m.status = {}; });
    training.prevMp = Party.members().map(function (m) { return m.mp; });
    A.down = false; A.inv = 1;
    say("3人ともたおれた…（訓練なので、みんな元気にもどった）");
  }
  function drawTrainHud() {
    var st = training.statue, nm = GameData.ENEMIES[training.type].name;
    Render.rect(view.w / 2 - 60, 3, 120, 24, "rgba(10,12,18,0.72)");
    Render.text("訓練場", view.w / 2, 5, { size: 7, align: "center", color: "#a3c88a" });
    Render.text(nm + (training.attack ? "（攻撃あり）" : ""), view.w / 2, 13, { size: 10, align: "center", bold: true, color: "#ece7da" });
    // 右上：数字
    var x = view.w - 6, y = 26, span = training.firstHit === null ? 0 : Math.min(10, training.clock - training.firstHit);
    var recent = 0; training.log.forEach(function (l) { recent += l[1]; });
    var dps = span >= 0.5 ? recent / Math.max(1, span) : 0;
    var lines = [
      ["1秒あたりのダメージ " + Math.round(dps) + "（最近10秒）", "#ffd24a"],
      ["合計ダメージ " + Math.round(training.total), "#ece7da"],
      ["使った MP " + Math.round(training.mp), "#a3c8ff"],
      ["こわした回数 " + training.kills + (training.lastKill !== null ? "　前回 " + training.lastKill.toFixed(1) + "秒" : ""), "#ece7da"],
      ["像の HP " + Math.max(0, Math.ceil(st && !st.dead ? st.hp : 0)) + "/" + (st ? st.maxHp : 0), "#ef9a9a"]
    ];
    Render.rect(x - 150, y - 3, 153, lines.length * 10 + 5, "rgba(10,12,18,0.72)");
    lines.forEach(function (l, i) { Render.text(l[0], x, y + i * 10, { size: 7, align: "right", color: l[1] }); });
  }
  function leaveTraining() {
    setPaused(false);
    active = false; dg = null; training = null;
    Enemies.clear(); Combat.clear(); Battle.clear();
    Sound.bgm("town");
    Town.openTraining();
  }
  // ---------- 闘技場（2026-10-30 保護者と決定） ----------
  // 相手のプレイヤーの3人（子どもには保護者の対戦用）を CPU が動かす。今の戦闘と同じく、表に出るのは1人ずつ。
  // 相手の3人をたおせば勝ち、こちらの3人がたおれたら負け。時間の制限はない。道具は使えない。経験値・お金・素材は入らない。
  // CPU の切りかえ：HP が 30% を下まわり、待っている仲間の HP が半分より多ければ、交代する（交代したら10秒は交代しない）
  var arena = null;
  function startArena(cfg) {
    arena = { who: cfg.who || "相手", rivals: cfg.rivals.map(function (h) { return { hero: h, hp: null, maxHp: 0, down: false }; }),
              cur: -1, e: null, next: 0, swapCd: 8, over: false, clock: 0, onEnd: cfg.onEnd };
    trial = { correct: 0, subjects: [], test: true, training: true };
    settings.correct = 0; settings.dungeon = "forest1";
    dg = Dungeon.arenaFloor();
    Party.setup(GameState.get().party.map(function (h) { return Party.fromHero(h); }));
    Party.resetAll();
    active = true; paused = false; choosing = false; cine = null;
    pauseEl.hidden = true; chooseEl.hidden = true;
    A.wait = 0; A.busy = 0; A.down = false; A.move = 0;
    run = newRun();
    enterRoom(dg.start, null);
    var c = dg.cells[dg.start];
    A.x = c.center.x; A.y = c.center.y + 44; A.face = { x: 0, y: -1 };
    prerender(dg);
    arenaSpawn(0, c.center.x, c.center.y - 44);
    say("闘技場：" + arena.who + "のパーティとの対戦！ 3人をたおせば勝ち");
    updateButtons(true); Sound.bgm("boss"); Sound.play("boss");
  }
  function arenaSpawn(i, x, y) {
    var r = arena.rivals[i];
    r.store = r.store || {};
    var e = Enemies.spawnRival(r.hero, i, x, y, r.store);
    if (r.hp === null) r.hp = e.maxHp;
    r.maxHp = e.maxHp; e.hp = r.hp; r.mpMax = e.maxMp;
    e.cd = 0.8;
    arena.cur = i; arena.e = e;
    Battle.pop(x, y - 30, r.hero.name + "（" + GameData.JOBS[r.hero.job].name + "）", "#ffb0a0", 8);
    return e;
  }
  function arenaNextIndex(pred) {
    for (var k = 1; k <= arena.rivals.length; k++) {
      var j = (arena.cur + k) % arena.rivals.length;
      var r = arena.rivals[j];
      if (!r.down && j !== arena.cur && (!pred || pred(r))) return j;
    }
    return -1;
  }
  function arenaKill(e) {
    var r = arena.rivals[arena.cur];
    r.down = true; r.hp = 0;
    Battle.pop(e.x, e.y - 34, r.hero.name + " をたおした！", "#f2c14e", 9);
    Sound.play("down");
    arena.e = null;
    arena.spot = { x: e.x, y: e.y };
    if (arenaNextIndex() < 0) { arena.next = 0; arena.win = 1.2; return; }   // 3人ともたおした：少しして勝ち
    arena.next = 1.2;   // 少しして、次の相手が出てくる
  }
  function arenaUpdate(dt) {
    if (arena.over) return;
    arena.clock += dt;
    if (arena.win !== undefined) { arena.win -= dt; if (arena.win <= 0) arenaEnd(true); return; }
    if (arena.next > 0) {
      arena.next -= dt;
      if (arena.next <= 0) {
        var c = dg.cells[curKey], j = arenaNextIndex();
        // 仲間から少しはなれたところに出す
        var sx = A.x < c.center.x ? c.center.x + 70 : c.center.x - 70, sy = A.y < c.center.y ? c.center.y + 30 : c.center.y - 30;
        if (j >= 0) arenaSpawn(j, sx, sy);
      }
      return;
    }
    var e = arena.e;
    if (!e || e.dead) return;
    arena.rivals[arena.cur].hp = e.hp;
    arena.swapCd -= dt;
    if (arena.swapCd <= 0 && e.hp < e.maxHp * 0.3 && e.state === "chase") {
      var j2 = arenaNextIndex(function (r) { return r.hp === null || r.hp > r.maxHp * 0.5 || (r.maxHp === 0); });
      if (j2 >= 0) {
        var x = e.x, y = e.y;
        Enemies.remove(e);
        Battle.pop(x, y - 34, "交代！", "#ffb0a0", 9);
        arenaSpawn(j2, x, y);
        arena.swapCd = 10;
      }
    }
  }
  function arenaEnd(win, gaveUp) {
    if (!arena || arena.over) return;
    arena.over = true;
    var downs = Party.members().filter(function (m) { return m.down; }).length;
    var beat = arena.rivals.filter(function (r) { return r.down; }).length;
    var lines = win
      ? [arena.who + "のパーティに勝った！", "たおれた仲間：" + downs + "人　かかった時間：" + Math.round(arena.clock) + "秒"]
      : [gaveUp ? "降参した。" : "3人ともたおれてしまった…", "たおした相手：" + beat + "人　" + (GameState.arenaLeft() > 1 ? "もう一度、挑戦してみよう！" : "また明日、挑戦しよう！")];
    Sound.play(win ? "levelup" : "down");
    showStory(win ? "勝った！" : "負けた…", lines, "闘技場にもどる", function () { leaveArena(win); });
  }
  function leaveArena(win) {
    var done = arena && arena.onEnd;
    setPaused(false);
    active = false; dg = null; arena = null;
    Enemies.clear(); Combat.clear(); Battle.clear();
    Sound.bgm("town");
    if (done) done(win);
  }
  function drawArenaHud() {
    if (!arena) return;
    var w = 150, x0 = view.w / 2 - w / 2;
    Render.rect(x0, 3, w, 30, "rgba(10,12,18,0.72)");
    Render.text("闘技場　VS " + arena.who, view.w / 2, 5, { size: 7, align: "center", color: "#ffb0a0" });
    arena.rivals.forEach(function (r, i) {
      var bx = x0 + 6 + i * 48, by = 15;
      var cur = i === arena.cur && arena.e && !arena.e.dead;
      Render.text(r.hero.name, bx, by, { size: 6, color: r.down ? "#6a6f82" : cur ? "#ffd24a" : "#ece7da" });
      var hp = r.down ? 0 : r.hp === null ? 1 : r.maxHp ? Math.max(0, r.hp) / r.maxHp : 1;
      Render.rect(bx, by + 9, 42, 3, "#2a2f42");
      Render.rect(bx, by + 9, Math.round(42 * hp), 3, r.down ? "#4a4f62" : "#ef5b5b");
      if (r.store && r.store.mp !== undefined && r.mpMax) { Render.rect(bx, by + 13, 42, 1, "#2a2f42"); Render.rect(bx, by + 13, Math.round(42 * Math.max(0, r.store.mp) / r.mpMax), 1, "#5aa9ff"); }
    });
  }

  document.getElementById("trainReset").addEventListener("click", function () {
    if (!training) return;
    resetTrainStats();
    training.prevMp = Party.members().map(function (m) { return m.mp; });
    setPaused(false);
    say("数字を0にもどした");
  });

  // ---------- 一時停止とテスト用の設定 ----------
  var pauseEl = document.getElementById("pause");
  var rotateEl = document.getElementById("rotate");
  document.getElementById("resumeBtn").addEventListener("click", function () { setPaused(false); });
  // メニューから冒険をやめる：時間切れと同じ（拾った物と経験値は持ち帰り、階層は進まない）（2026-10-17 決定）
  document.getElementById("quitBtn").addEventListener("click", function () {
    if (dg && dg.arena) {   // 闘技場：やめると負け（1日3回までの1回に数えるので、確かめてから）
      Dialog.confirm("降参しますか？\n（負けになります。今日の対戦の1回に数えます）", function () { setPaused(false); arenaEnd(false, true); }, null, { yes: "降参する", no: "続ける" });
      return;
    }
    if (dg && dg.training) { leaveTraining(); return; }
    Dialog.confirm("冒険をやめて拠点にもどりますか？\n（拾った物と経験値は持ち帰れるけれど、階層は進みません）", function () {
      setPaused(false);
      finish("quit");
    }, null, { yes: "やめて拠点にもどる", no: "冒険を続ける" });
  });
  window.addEventListener("keydown", function (e) { if (paused && (e.code === "Escape")) setPaused(false); });

  function setPaused(on) {
    paused = on;
    pauseEl.hidden = !on;
    Input.releaseAll();
    // 訓練場：道具と地図は出さず、「訓練場を出る」と「数字を0にもどす」
    var tr = !!(dg && dg.training);
    document.getElementById("quitBtn").textContent = dg && dg.arena ? "降参する（負けになる）" : tr ? "訓練場を出る（宿屋にもどる）" : "冒険をやめて拠点にもどる";
    pauseEl.querySelector(".toolbox").hidden = tr; pauseEl.querySelector(".mapbox").hidden = tr;
    document.getElementById("trainReset").hidden = !tr || !!dg.arena;
    if (on && !tr) { drawBigMap(); buildTools(); snapshot(); }
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
      // 回復薬・MP回復薬（2026-10-22）：決まった数だけ回復する
      if (t.mp) {
        add(t.name + n, c.mp < c.stats.mp, function () {
          GameState.useTool(k); Sound.play("heal"); c.mp = Math.min(c.stats.mp, c.mp + t.mp); note.textContent = c.name + "の MP が回復した";
        });
      } else if (t.hp) {
        add(t.name + n, c.hp < c.stats.hp, function () {
          GameState.useTool(k); Sound.play("heal"); c.hp = Math.min(c.stats.hp, c.hp + t.hp); note.textContent = c.name + "の HP が回復した";
        });
      } else if (k === "revive") {
        var downs = Party.members().filter(function (m) { return m.down; });
        if (!downs.length) add(t.name + n + "（たおれた仲間がいない）", false, function () {});
        downs.forEach(function (m) {
          add(t.name + n + " → " + m.name, true, function () {
            GameState.useTool(k); Sound.play("heal"); m.down = false; m.hp = Math.max(1, Math.round(m.stats.hp * 0.3)); note.textContent = m.name + "が復活した！";
          });
        });
      } else {
        add(t.name + n, !!c.status[t.cures], function () {
          GameState.useTool(k); Sound.play("heal"); delete c.status[t.cures]; note.textContent = c.name + "の" + GameData.STATUS[t.cures].name + "が治った";
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
      GameData.floorLabel(dg.floor, dg.dungeon) + "　（テスト用：この階層の seed は " + dg.seed + "。気になる階層があったら、この数字を教えてください）";
    var w = Loot.rarityWeights(dg.power, settings.correct, false), sum = w[0] + w[1] + w[2] + w[3];
    document.getElementById("chestInfo").textContent = "正解 " + settings.correct + "問のときの宝箱：" +
      Loot.RARITY.map(function (R, i) { return R.name + " " + Math.round(w[i] / sum * 100) + "%"; }).join("・") + "（金の宝箱とボスの宝箱は、R以上だけ）";
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
    if (active && !paused && !choosing && rotateEl.hidden) { if (cine) updateCine(dt); else update(dt); }
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
      state: function () { return { paused: paused, choosing: choosing }; },
      training: function () { return training; }
    };
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
})();
