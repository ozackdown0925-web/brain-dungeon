// ダンジョンの階層：部屋の型（rooms.js）を seed でえらび、つなぎ方を決める。地図もここで描く。
// 同じ seed なら、いつも同じ階層になる（途中で閉じても、同じつなぎ方で入口から再開できるように。段階5で使う）。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Dungeon = (function () {
  var GRID_W = 5, GRID_H = 4;   // 部屋をならべるマス目（地図の大きさ）
  var MAIN_ROOMS = 5;           // 入口から出口までの部屋の数
  // ボスの階層は、ダンジョンごとに GameData.DUNGEONS の bosses で決まる（決まった形：入口 → 敵の部屋 → ボスの部屋）
  var DIRS = {
    n: { dx: 0, dy: -1, back: "s" }, s: { dx: 0, dy: 1, back: "n" },
    w: { dx: -1, dy: 0, back: "e" }, e: { dx: 1, dy: 0, back: "w" }
  };

  // seed から決まった順に数を出す（mulberry32）。0 以上 1 未満。
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }
  function key(x, y) { return x + "," + y; }
  function newSeed() { return Math.floor(Math.random() * 900000) + 100000; }

  // ---------- 部屋のつなぎ方 ----------
  function layout(rnd) {
    for (var tries = 0; tries < 100; tries++) {
      var sx = Math.floor(rnd() * GRID_W), sy = Math.floor(rnd() * GRID_H);
      var path = [{ x: sx, y: sy }], used = {};
      used[key(sx, sy)] = true;
      while (path.length < MAIN_ROOMS) {
        var cur = path[path.length - 1];
        var next = Object.keys(DIRS).map(function (d) { return { x: cur.x + DIRS[d].dx, y: cur.y + DIRS[d].dy }; })
          .filter(function (p) { return p.x >= 0 && p.y >= 0 && p.x < GRID_W && p.y < GRID_H && !used[key(p.x, p.y)]; });
        if (!next.length) break;
        var p = pick(rnd, next);
        path.push(p); used[key(p.x, p.y)] = true;
      }
      if (path.length < MAIN_ROOMS) continue;
      // 寄り道の部屋（1〜2つ）：入口と出口以外の部屋から、となりに1つ。段階4-2で宝箱を置く。
      var branches = [], want = 1 + (rnd() < 0.5 ? 1 : 0);
      for (var b = 0; b < 20 && branches.length < want; b++) {
        var from = path[1 + Math.floor(rnd() * (MAIN_ROOMS - 2))];
        var d = pick(rnd, Object.keys(DIRS));
        var bp = { x: from.x + DIRS[d].dx, y: from.y + DIRS[d].dy, from: from };
        if (bp.x < 0 || bp.y < 0 || bp.x >= GRID_W || bp.y >= GRID_H || used[key(bp.x, bp.y)]) continue;
        used[key(bp.x, bp.y)] = true; branches.push(bp);
      }
      return { path: path, branches: branches };
    }
    throw new Error("部屋をならべられなかった");
  }

  function dirBetween(a, b) {
    var ks = Object.keys(DIRS);
    for (var i = 0; i < ks.length; i++) if (a.x + DIRS[ks[i]].dx === b.x && a.y + DIRS[ks[i]].dy === b.y) return ks[i];
    return null;
  }

  // ---------- 部屋の型に道をあける ----------
  function passable(ch) { return ch !== "#" && ch !== "T" && ch !== "~"; }
  // 立ち止まってよいところ（部屋の中心・入口でキャラが立つ場所）：通れて、毒の沼（P）でない
  function standable(ch) { return passable(ch) && ch !== "P"; }
  // ダンジョンの部屋の型（瘴気の森は沼の型）
  function roomsFor(dungeon) { return GameData.dungeonOf(dungeon).theme === "swamp" ? SwampRooms : ForestRooms; }
  function doorTiles(w, h, d) {
    var mx = Math.floor(w / 2), my = Math.floor(h / 2), t = [];
    for (var i = -1; i <= 1; i++) {
      if (d === "n") t.push({ x: mx + i, y: 0 });
      if (d === "s") t.push({ x: mx + i, y: h - 1 });
      if (d === "w") t.push({ x: 0, y: my + i });
      if (d === "e") t.push({ x: w - 1, y: my + i });
    }
    return t;
  }
  function buildRoom(tpl, doors) {
    var g = tpl.rows.map(function (r) { return r.split(""); });
    var w = g[0].length, h = g.length;
    var cx = Math.floor(w / 2), cy = Math.floor(h / 2);
    doors.forEach(function (d) { doorTiles(w, h, d).forEach(function (p) { g[p.y][p.x] = ":"; }); });
    // どの道からも、部屋のまんなかへ行けるか確かめる。行けなければ、まっすぐ道を切りひらく（型の作りまちがいの保険）
    function reach(from) {
      var seen = {}, q = [from];
      seen[key(from.x, from.y)] = true;
      while (q.length) {
        var c = q.shift();
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) {
          var x = c.x + o[0], y = c.y + o[1];
          if (x < 0 || y < 0 || x >= w || y >= h || seen[key(x, y)] || !passable(g[y][x])) return;
          seen[key(x, y)] = true; q.push({ x: x, y: y });
        });
      }
      return seen;
    }
    // まんなかに近い陸地（2×2 マス空いているところ）を、部屋の中心にする。池の部屋なら、池のほとり。
    var hub = null, best = 1e9;
    for (var y0 = 1; y0 < h - 2; y0++) for (var x0 = 1; x0 < w - 2; x0++) {
      if (!standable(g[y0][x0]) || !standable(g[y0][x0 + 1]) || !standable(g[y0 + 1][x0]) || !standable(g[y0 + 1][x0 + 1])) continue;
      var dd = (x0 - cx) * (x0 - cx) + (y0 - cy) * (y0 - cy);
      if (dd < best) { best = dd; hub = { x: x0, y: y0 }; }
    }
    doors.forEach(function (d) {
      var start = doorTiles(w, h, d)[1];
      if (reach(start)[key(hub.x, hub.y)]) return;
      var x = start.x, y = start.y;
      while (x !== hub.x || y !== hub.y) {
        if (x !== hub.x && (d === "w" || d === "e" || y === hub.y)) x += x < hub.x ? 1 : -1; else y += y < hub.y ? 1 : -1;
        for (var i = -1; i <= 1; i++) {
          var tx = d === "n" || d === "s" ? x + i : x, ty = d === "n" || d === "s" ? y : y + i;
          if (tx > 0 && ty > 0 && tx < w - 1 && ty < h - 1 && !passable(g[ty][tx])) g[ty][tx] = ".";
        }
      }
    });
    return new World.Room(g.map(function (r) { return r.join(""); }));
  }

  // 部屋のまんなかに近い、立てる場所（タイルの中心のドット座標）
  function centerSpot(room) {
    var cx = Math.floor(room.w / 2), cy = Math.floor(room.h / 2), best = null, bd = 1e9;
    for (var y = 1; y < room.h - 1; y++) for (var x = 1; x < room.w - 1; x++) {
      if (!standable(room.tile(x, y)) || !standable(room.tile(x + 1, y)) || !standable(room.tile(x, y + 1))) continue;
      var dd = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (dd < bd) { bd = dd; best = { x: x, y: y }; }
    }
    return { x: (best.x + 1) * World.TILE, y: (best.y + 1) * World.TILE };
  }

  // 入口の部屋でキャラが立つ場所：部屋のまんなかの少し下。そこが水・壁・毒の沼にかかるときは、近くの動ける場所
  // （2026-10-22：瘴気の森で、水と橋のさかい目に出て動けなくなったため）
  function startPoint(room, center) {
    var R = 6, T = World.TILE;
    function ok(x, y) {
      if (room.hitsWall(x - R, y - R, R * 2, R * 2)) return false;
      if (room.tile(Math.floor(x / T), Math.floor(y / T)) === "P") return false;
      // まわりへ少し動けること
      return !room.hitsWall(x + 3 - R, y - R, R * 2, R * 2) || !room.hitsWall(x - 3 - R, y - R, R * 2, R * 2) ||
             !room.hitsWall(x - R, y + 3 - R, R * 2, R * 2) || !room.hitsWall(x - R, y - 3 - R, R * 2, R * 2);
    }
    var x0 = center.x, y0 = center.y + 20;
    if (ok(x0, y0)) return { x: x0, y: y0 };
    if (ok(center.x, center.y)) return { x: center.x, y: center.y };
    for (var rad = 4; rad <= 160; rad += 4) for (var a = 0; a < 24; a++) {
      var x = Math.round(x0 + Math.cos(a / 24 * Math.PI * 2) * rad), y = Math.round(y0 + Math.sin(a / 24 * Math.PI * 2) * rad);
      if (x > R && y > R && x < room.pxW - R && y < room.pxH - R && ok(x, y)) return { x: x, y: y };
    }
    return { x: x0, y: y0 };
  }

  // ---------- 敵の置き方 ----------
  // 1部屋に4〜6体（平均5体）。入口の部屋にもいる（2026-10-17 保護者の感想で、2〜4体から増やした）。
  // ゴブリンの部隊が多く、ときどきつる草の魔物・キノコの魔物（8階からは大きな蜂も）がまざる。
  function enemyCount(rnd, floor) { return 4 + Math.floor(rnd() * 3); }

  // 敵1体あたりのごほうび（経験値・熟練度・ゴールド・素材の出る確率）の倍率。
  // 敵を増やす前と、1階層でもらえる合計が同じになるようにする：前の1階層の平均（1〜3階 13.5体・4〜10階 16.2体・11階〜 18.7体）÷ 今の平均（約32体）
  var ENEMIES_PER_FLOOR = 32;
  function rewardScale(floor) {
    var before = floor <= 3 ? 13.5 : floor <= 10 ? 16.2 : 18.7;
    return before / ENEMIES_PER_FLOOR;
  }
  var SQUAD = ["goblin_sword", "goblin_spear", "goblin_archer"];
  // 瘴気の森（段階2、2026-10-21）：骸骨の部隊（剣士2・弓兵1のくり返し）に、毒ガエルとキノコの魔物がまざる
  var SKULL_SQUAD = ["skeleton_sword", "skeleton_archer", "skeleton_sword"];
  // avoid：近くに置かない場所（入口の部屋のスタート地点。タイルの座標）
  function placeEnemies(rnd, room, doors, floor, avoid, dungeon) {
    var n = enemyCount(rnd, floor), types = [];
    if (GameData.dungeonOf(dungeon).theme === "swamp") {
      for (var si = 0; si < n; si++) types.push(SKULL_SQUAD[si % 3]);
      if (rnd() < 0.6) types[types.length - 1] = "frog";
      if (n >= 5 && rnd() < 0.35) types[types.length - 2] = "frog";
      if (rnd() < 0.3) types[0] = "mushroom";
      // 魔法の敵（段階3）：影の魔導士はどの階でも、瘴気の霊は6階から
      if (rnd() < 0.45) types[1] = "shadow_mage";
      if (floor >= 6 && rnd() < 0.55) { types[2] = "wisp"; if (n >= 5 && rnd() < 0.35) types[0] = "wisp"; }
    } else {
      for (var i = 0; i < n; i++) types.push(SQUAD[i % 3]);
      if (rnd() < 0.35) types[types.length - 1] = "vine";
      // キノコの魔物（どの階でも）と、大きな蜂（8階から）がまざる（2026-10-18 保護者と決定）
      if (rnd() < 0.4) types[0] = "mushroom";
      if (floor >= 8 && rnd() < 0.55) { types[1] = "bee"; if (n >= 5 && rnd() < 0.5) types[2] = "bee"; }
    }
    // 道（入り口）から離れた、立てる場所
    var doorPts = [];
    doors.forEach(function (d) { doorPts.push(doorTiles(room.w, room.h, d)[1]); });
    function farFromDoors(x, y, min) {
      for (var k = 0; k < doorPts.length; k++) {
        var dx = doorPts[k].x - x, dy = doorPts[k].y - y;
        if (dx * dx + dy * dy < min * min) return false;
      }
      return true;
    }
    var spots = [];
    for (var y = 2; y < room.h - 2; y++) for (var x = 2; x < room.w - 2; x++) {
      if (!passable(room.tile(x, y)) || room.tile(x, y) === ":" || !farFromDoors(x, y, 7)) continue;
      if (avoid && (x - avoid.x) * (x - avoid.x) + (y - avoid.y) * (y - avoid.y) < 9 * 9) continue; // スタート地点から9マス以上はなす
      spots.push({ x: x, y: y });
    }
    if (!spots.length) return [];
    var anchor = pick(rnd, spots), out = [];
    types.forEach(function (t) {
      var near = spots.filter(function (p) { return Math.abs(p.x - anchor.x) <= 4 && Math.abs(p.y - anchor.y) <= 4; })
        .filter(function (p) { return !out.some(function (o) { return o.tx === p.x && o.ty === p.y; }); });
      var p = t === "vine" || !near.length ? pick(rnd, spots) : pick(rnd, near);
      out.push({ type: t, tx: p.x, ty: p.y, x: p.x * World.TILE + 8, y: p.y * World.TILE + 8, dead: false });
    });
    return out;
  }

  // ---------- 階層を作る ----------
  // dungeon：ダンジョンの id（省くと新緑の樹海）
  function generate(floor, seed, dungeon) {
    dungeon = GameData.dungeonOf(dungeon).id;
    if (GameData.isBossFloor(dungeon, floor)) return tagDungeon(generateBoss(floor, seed, dungeon), dungeon);
    var rnd = rng(seed);
    var lay = layout(rnd);
    var cells = {};
    var ROOMS = roomsFor(dungeon), theme = GameData.dungeonOf(dungeon).theme;
    var order = ROOMS.map(function (r, i) { return i; });
    for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = order[i]; order[i] = order[j]; order[j] = t; }
    var all = lay.path.concat(lay.branches);
    all.forEach(function (p, idx) { cells[key(p.x, p.y)] = { x: p.x, y: p.y, tpl: order[idx % order.length], doors: [], kind: "room" }; });
    for (var k = 1; k < lay.path.length; k++) {
      var a = lay.path[k - 1], b = lay.path[k], d = dirBetween(a, b);
      cells[key(a.x, a.y)].doors.push(d); cells[key(b.x, b.y)].doors.push(DIRS[d].back);
    }
    lay.branches.forEach(function (bp) {
      var d2 = dirBetween(bp.from, bp);
      cells[key(bp.from.x, bp.from.y)].doors.push(d2); cells[key(bp.x, bp.y)].doors.push(DIRS[d2].back);
      cells[key(bp.x, bp.y)].kind = "side";
    });
    var start = lay.path[0], exit = lay.path[lay.path.length - 1];
    cells[key(start.x, start.y)].kind = "start";
    cells[key(exit.x, exit.y)].kind = "exit";
    Object.keys(cells).forEach(function (kk) {
      var c = cells[kk];
      c.room = buildRoom(ROOMS[c.tpl], c.doors);
      c.room.theme = theme;
      c.name = ROOMS[c.tpl].name;
      c.center = centerSpot(c.room);
      c.enemies = placeEnemies(rnd, c.room, c.doors, floor, c.kind === "start" ? { x: c.center.x / World.TILE, y: c.center.y / World.TILE } : null, dungeon);
      c.visited = false;
    });
    var dg = {
      floor: floor, seed: seed, cells: cells, start: key(start.x, start.y), exit: key(exit.x, exit.y),
      boss: false, lock: null, hasKey: false, hasCKey: false
    };
    placeThings(dg, floor, seed, dungeon);
    return tagDungeon(dg, dungeon);
  }
  // どのダンジョンの階か（dungeon）と、強さの深さ（power：敵の強さ・ごほうび・拾う装備のレベルに使う）
  function tagDungeon(dg, dungeon) { dg.dungeon = dungeon; dg.power = GameData.depthOf(dungeon, dg.floor); return dg; }

  // ---------- ボスの階層（段階4-3） ----------
  // 決まった形：入口の部屋 → 敵のいる部屋 → ボスの部屋（地図のまんなかの段に横ならび）。鍵・罠・ふつうの宝箱はない。
  function generateBoss(floor, seed, dungeon) {
    var rnd = rng(seed);
    var info = GameData.bossInfo(dungeon, floor);
    var cells = {};
    var ROOMS = roomsFor(dungeon), theme = GameData.dungeonOf(dungeon).theme;
    var mid = Math.floor(rnd() * ROOMS.length);
    if (mid === 0) mid = 1; // 入口の部屋（ひろば）とちがう型にする
    var plan = [
      { x: 1, y: 1, kind: "start", tpl: ROOMS[0], doors: ["e"] },
      { x: 2, y: 1, kind: "room", tpl: ROOMS[mid], doors: ["w", "e"] },
      { x: 3, y: 1, kind: "exit", tpl: theme === "swamp" ? SwampBossRoom : BossRoom, doors: ["w"] }
    ];
    plan.forEach(function (p) {
      var c = { x: p.x, y: p.y, kind: p.kind, doors: p.doors, name: p.tpl.name, visited: false, chests: [], key: null, traps: [] };
      c.room = buildRoom(p.tpl, p.doors);
      c.room.theme = theme;
      c.center = centerSpot(c.room);
      c.enemies = p.kind === "exit" ? [] : placeEnemies(rnd, c.room, c.doors, floor, p.kind === "start" ? { x: c.center.x / World.TILE, y: c.center.y / World.TILE } : null, dungeon);
      cells[key(p.x, p.y)] = c;
    });
    var bc = cells[key(3, 1)];
    // ボスは部屋のまんなか（入ってすぐ見えるように）
    bc.enemies = [{ type: info.enemy, tx: 0, ty: 0, x: bc.center.x + 10, y: bc.center.y, dead: false, boss: true }];
    bc.bossCell = true;
    // 回復の泉（2026-10-21 保護者の案）：ボスの部屋の1つ手前の部屋のまんなか。ふれると全員のHP・MPが全快
    var mc = cells[key(2, 1)];
    mc.spring = { x: mc.center.x, y: mc.center.y };
    return {
      floor: floor, seed: seed, cells: cells, start: key(1, 1), exit: key(3, 1), boss: true, bossInfo: info,
      bossDown: false, bossMet: false, lock: null, hasKey: false, hasCKey: false
    };
  }

  // ---------- 鍵と扉・宝箱・罠（段階4-2） ----------
  // 部屋のつなぎ方と別の順の数を使う（4-1 と同じ seed なら、部屋のつなぎ方と敵は同じまま）
  function placeThings(dg, floor, seed, dungeon) {
    var swamp = GameData.dungeonOf(dungeon).theme === "swamp";
    var rnd = rng((seed ^ 0x5bd1e995) >>> 0);
    var keys = Object.keys(dg.cells);
    var used = {}; // 物を置いたタイル（部屋ごと）
    keys.forEach(function (k) {
      var c = dg.cells[k], T = World.TILE;
      used[k] = {};
      c.enemies.forEach(function (e) { used[k][key(e.tx, e.ty)] = true; });
      // 部屋の中心（入口でキャラが立つ場所・出口）のまわりは空けておく
      var cx = c.center.x / T - 1, cy = c.center.y / T - 1;
      for (var y = cy - 2; y <= cy + 3; y++) for (var x = cx - 2; x <= cx + 3; x++) used[k][key(x, y)] = true;
      c.chests = []; c.key = null; c.ckey = null; c.traps = []; c.pickups = [];
    });
    function mark(k, x, y, w, h, pad) {
      for (var yy = y - pad; yy < y + h + pad; yy++) for (var xx = x - pad; xx < x + w + pad; xx++) used[k][key(xx, yy)] = true;
    }
    function plain(ch) { return ch === "." || ch === "*"; }
    // 部屋 k の中で、w×h が置ける場所（道から minDoor マス以上はなれる）。around＝まわり1マスも通れること
    function spots(k, w, h, minDoor, around) {
      var c = dg.cells[k], room = c.room, out = [];
      var doorPts = c.doors.map(function (d) { return doorTiles(room.w, room.h, d)[1]; });
      for (var y = 2; y < room.h - 1 - h; y++) for (var x = 2; x < room.w - 1 - w; x++) {
        var ok = true;
        for (var yy = y - (around ? 1 : 0); yy < y + h + (around ? 1 : 0) && ok; yy++)
          for (var xx = x - (around ? 1 : 0); xx < x + w + (around ? 1 : 0) && ok; xx++) {
            if (!plain(room.tile(xx, yy)) || used[k][key(xx, yy)]) ok = false;
          }
        for (var q = 0; q < doorPts.length && ok; q++) {
          var dx = doorPts[q].x - x, dy = doorPts[q].y - y;
          if (dx * dx + dy * dy < minDoor * minDoor) ok = false;
        }
        if (ok) out.push({ x: x, y: y });
      }
      return out;
    }
    function shuffle(arr) {
      for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
      return arr;
    }
    var T = World.TILE;

    // 鍵は2種類（2026-10-19 決定）
    // ・出口の鍵：出口の部屋の入口に鍵のかかった扉。出口までの道すじの部屋（入口と出口以外）に落ちている
    // ・宝箱の鍵：1階層に1つの金の宝箱を開ける。寄り道の部屋に落ちている（寄り道がなければ道すじの部屋）
    // 金の宝箱は、宝箱の鍵とは別の部屋（寄り道の部屋がもう1つあればそこ、なければ道すじの部屋）
    function putItem(rooms) {
      for (var i = 0; i < rooms.length; i++) {
        var ks = spots(rooms[i], 1, 1, 5, false);
        if (!ks.length) continue;
        var kp = pick(rnd, ks);
        mark(rooms[i], kp.x, kp.y, 1, 1, 1);
        return { room: rooms[i], tx: kp.x, ty: kp.y, x: kp.x * T + 8, y: kp.y * T + 8, taken: false };
      }
      return null;
    }
    // モンスターの巣（段階5、2026-10-22 保護者と決定）：瘴気の森のふつうの階で、3階に1回くらい。寄り道の部屋の1つが巣の部屋になる。
    // 地図にも入口にも印は出さない。巣の部屋には、鍵・宝箱（ふつう・金）・罠は置かない（巣をこわすと宝箱が出るため）。
    // 巣を置くかどうかは、ほかの物とは別の順の数で決める
    var nestKey = null;
    if (swamp) {
      var nr = rng((seed ^ 0x2c1b3c6d) >>> 0);
      var sideKeys = keys.filter(function (k) { return dg.cells[k].kind === "side"; });
      if (sideKeys.length && nr() < 1 / 3) nestKey = sideKeys[Math.floor(nr() * sideKeys.length)];
    }
    if (nestKey) makeNest(dg.cells[nestKey]);
    function notNest(k) { return k !== nestKey; }
    var pathRooms = shuffle(keys.filter(function (k) { return dg.cells[k].kind === "room"; }));
    var sides = shuffle(keys.filter(function (k) { return dg.cells[k].kind === "side" && notNest(k); }));
    // 出口の鍵と、鍵のかかった扉
    var ex = dg.cells[dg.exit], ed = ex.doors[0];
    var ekey = putItem(pathRooms.length ? pathRooms : sides);
    if (ekey && ed) {
      var pk = neighbor(dg, dg.exit, ed), pdir = DIRS[ed].back, pc = dg.cells[pk];
      doorTiles(pc.room.w, pc.room.h, pdir).forEach(function (p) { pc.room.setTile(p.x, p.y, "L"); });
      dg.lock = { cell: dg.exit, parent: pk, dir: pdir, open: false };
      ex.locked = true;
      dg.cells[ekey.room].key = { tx: ekey.tx, ty: ekey.ty, x: ekey.x, y: ekey.y, taken: false };
    }
    // 宝箱の鍵
    var ckey = putItem(sides.concat(pathRooms.filter(function (k) { return !dg.cells[k].key; })).concat(pathRooms));
    if (ckey) dg.cells[ckey.room].ckey = { tx: ckey.tx, ty: ckey.ty, x: ckey.x, y: ckey.y, taken: false };
    // 金の宝箱
    var goldRooms = sides.filter(function (k) { return !ckey || k !== ckey.room; })
      .concat(pathRooms.filter(function (k) { return !ckey || k !== ckey.room; }));
    for (var gi = 0; gi < goldRooms.length && ckey; gi++) {
      var gs = spots(goldRooms[gi], 1, 1, 5, true);
      if (!gs.length) continue;
      var gp = pick(rnd, gs);
      dg.cells[goldRooms[gi]].chests.push({ x: gp.x * T + 8, y: gp.y * T + 8, opened: false, rare: true, gold: true });
      mark(goldRooms[gi], gp.x, gp.y, 1, 1, 1);
      dg.goldChest = true;
      break;
    }

    // ふつうの宝箱：金の宝箱とあわせて1階層に2〜3個。寄り道の部屋を先に
    var total = 2 + (rnd() < 0.5 ? 1 : 0), have = dg.goldChest ? 1 : 0;
    var chestRooms = shuffle(keys.filter(function (k) { return dg.cells[k].kind === "side" && notNest(k); }))
      .concat(shuffle(keys.filter(function (k) { return dg.cells[k].kind === "room" || dg.cells[k].kind === "exit"; })));
    for (var ci = 0; ci < chestRooms.length && have < total; ci++) {
      var cs = spots(chestRooms[ci], 1, 1, 5, true);
      if (!cs.length) continue;
      var cp = pick(rnd, cs);
      dg.cells[chestRooms[ci]].chests.push({ x: cp.x * T + 8, y: cp.y * T + 8, opened: false, rare: false });
      mark(chestRooms[ci], cp.x, cp.y, 1, 1, 1);
      have++;
    }

    // 罠：毒の沼（2×2）と落とし穴（1マス）。深い階層ほど少し多い。一部は踏むまで見えない
    // 瘴気の森：部屋の型にも毒の沼があるうえに、罠も樹海より多い（毒の沼が多め。落とし穴は少なめ）
    var traps = 2 + Math.floor(floor / 3) + (rnd() < 0.5 ? 1 : 0) + (swamp ? 2 : 0);
    var trapRooms = keys.filter(function (k) { return k !== dg.start && notNest(k); });
    var perRoom = {};
    for (var t = 0, tries = 0; t < traps && tries < 60; tries++) {
      var tk = pick(rnd, trapRooms);
      if ((perRoom[tk] || 0) >= 2) continue;
      var pit = rnd() < (swamp ? 0.25 : 0.45);
      // 落とし穴はまわり1マスも通れるところだけ（せまい道をふさがないように）
      var ts = pit ? spots(tk, 1, 1, 4, true) : spots(tk, 2, 2, 3, false);
      if (!ts.length) continue;
      var tp = pick(rnd, ts);
      dg.cells[tk].traps.push({ type: pit ? "pit" : "swamp", tx: tp.x, ty: tp.y, w: pit ? 1 : 2, h: pit ? 1 : 2, hidden: rnd() < 0.35, found: false });
      mark(tk, tp.x, tp.y, pit ? 1 : 2, pit ? 1 : 2, 1);
      perRoom[tk] = (perRoom[tk] || 0) + 1;
      t++;
    }

    // 拾うと回復するもの（2026-10-20 保護者と決定）：薬草（全員のHP10%）を1階に1〜2つ、魔力のキノコ（全員のMP8%）を0〜1つ。
    // 部屋に置くだけ（敵は落とさない）。寄り道の部屋を先に。入口の部屋には置かない
    var herbN = 1 + (rnd() < 0.5 ? 1 : 0), mushN = rnd() < 0.6 ? 1 : 0;
    var pickRooms = shuffle(keys.filter(function (k) { return dg.cells[k].kind === "side"; }))
      .concat(shuffle(keys.filter(function (k) { return k !== dg.start && dg.cells[k].kind !== "side"; })));
    var want = [];
    for (var hn = 0; hn < herbN; hn++) want.push("herb");
    for (var mn = 0; mn < mushN; mn++) want.push("mush");
    // 毒消し草（瘴気の森だけ。2026-10-21 保護者の案）：1階に1つ、ときどき2つ。拾うと、みんなの毒が治る
    if (swamp) { want.push("cure"); if (rnd() < 0.4) want.push("cure"); }
    for (var wi = 0, ri = 0; wi < want.length && ri < pickRooms.length * 2; ri++) {
      var pr = pickRooms[ri % pickRooms.length];
      var ps = spots(pr, 1, 1, 4, false);
      if (!ps.length) continue;
      var pp = pick(rnd, ps);
      dg.cells[pr].pickups.push({ kind: want[wi], x: pp.x * T + 8, y: pp.y * T + 8, taken: false });
      mark(pr, pp.x, pp.y, 1, 1, 1);
      wi++;
    }
  }

  // 巣の部屋にする：部屋のまんなかに巣（敵の1つとして、いちばん先に置く。絵がほかの敵の下になるように）。
  // もとからいる敵は3体までにへらす（巣から出てくるぶん）。巣の HP・出した数は c.nest に残る（部屋を出てもどっても、そのまま）
  function makeNest(c) {
    c.enemies = c.enemies.slice(0, 3);
    var T = World.TILE, nx = c.center.x, ny = c.center.y;
    // 巣と重なる場所にいる敵は置かない
    c.enemies = c.enemies.filter(function (e) { var dx = e.x - nx, dy = e.y - ny; return dx * dx + dy * dy >= 30 * 30; });
    var slot = { type: "nest", tx: Math.floor(nx / T), ty: Math.floor(ny / T), x: nx, y: ny, dead: false, nest: true };
    c.enemies.unshift(slot);
    c.nest = { slot: slot, x: nx, y: ny, hp: null, made: 0, t: 0, met: false, broken: false, done: false };
  }

  // ---------- 訓練場（2026-10-21 保護者の案） ----------
  // 道のない1部屋。まんなかに像（type）、左下のすみに回復の泉。出口・鍵・宝箱・罠はない
  function trainingFloor(type) {
    var c = { x: 2, y: 1, kind: "start", doors: [], name: "訓練場", visited: true, chests: [], traps: [], pickups: [], key: null, ckey: null };
    c.room = buildRoom(TrainingRoom, []);
    c.room.theme = "forest";
    c.center = centerSpot(c.room);
    c.enemies = [{ type: type, tx: 0, ty: 0, x: c.center.x, y: c.center.y - 28, dead: false }];
    c.spring = { x: 5 * World.TILE, y: 12 * World.TILE };   // 左下のすみ（左上は画面の表示と重なるため）
    var cells = {}; cells[key(2, 1)] = c;
    return { floor: 1, seed: 0, cells: cells, start: key(2, 1), exit: null, boss: false, lock: null, hasKey: false, hasCKey: false,
             training: true, dungeon: "forest1", power: 1 };
  }

  // 部屋の外へ出た向き（出ていなければ null）
  function leftRoom(room, a) {
    if (a.x < 0) return "w";
    if (a.x >= room.pxW) return "e";
    if (a.y < 0) return "n";
    if (a.y >= room.pxH) return "s";
    return null;
  }
  function neighbor(dg, cellKey, d) {
    var c = dg.cells[cellKey];
    return key(c.x + DIRS[d].dx, c.y + DIRS[d].dy);
  }
  // 部屋に入ったときに立つ場所（入ってきた道から少し内側）
  function entryPoint(room, fromDir) {
    var p = doorTiles(room.w, room.h, fromDir)[1], T = World.TILE;
    var x = p.x * T + T / 2, y = p.y * T + T / 2;
    if (fromDir === "w") x += T * 1.2;
    if (fromDir === "e") x -= T * 1.2;
    if (fromDir === "n") y += T * 1.2;
    if (fromDir === "s") y -= T * 1.2;
    return { x: x, y: y, face: { x: -DIRS[fromDir].dx, y: -DIRS[fromDir].dy } };
  }

  // 敵の強さの深さ：3人の平均レベルが目安（1＋0.7×(d−1)）を超えたら、超えたぶんの半分だけ深くする（docs/draft.md 2）
  function enemyDepth(floor, avgLevel) {
    var target = 1 + 0.7 * (floor - 1);
    return floor + Math.max(0, avgLevel - target) / 2;
  }

  // ---------- 地図 ----------
  // ctx に (x, y) から描く。cw, ch は1部屋の大きさ、gap は部屋のすきま。curKey は今いる部屋。
  function drawMap(ctx, dg, x, y, cw, ch, gap, curKey) {
    function rect(px, py, w, h, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(px), Math.round(py), Math.round(w), Math.round(h)); }
    Object.keys(dg.cells).forEach(function (k) {
      var c = dg.cells[k];
      var px = x + c.x * (cw + gap), py = y + c.y * (ch + gap);
      // 道（部屋どうしのつながり）。鍵のかかった扉は、開けるまで茶色
      c.doors.forEach(function (d) {
        var lw = Math.max(1, Math.round(Math.min(cw, ch) / 4));
        var other = key(c.x + DIRS[d].dx, c.y + DIRS[d].dy);
        var locked = dg.lock && !dg.lock.open && ((k === dg.lock.cell && other === dg.lock.parent) || (k === dg.lock.parent && other === dg.lock.cell));
        var lc = locked ? "#c0782e" : "#8a8f74";
        if (locked) lw = Math.max(lw, 2);
        if (d === "e") rect(px + cw, py + ch / 2 - lw / 2, gap, lw, lc);
        if (d === "s") rect(px + cw / 2 - lw / 2, py + ch, lw, gap, lc);
      });
      var color = k === curKey ? "#f2c14e" : c.visited ? "#5e7a52" : c.locked && !(dg.lock && dg.lock.open) ? "#4a3a2a" : "#3a4636";
      rect(px, py, cw, ch, color);
      // 中の物：鍵（金）・まだ開けていない宝箱（茶）・見つけた罠（紫）
      var dot = Math.max(1, Math.round(Math.min(cw, ch) / 5));
      function at(tx, ty, col) { rect(px + tx / c.room.w * cw - dot / 2, py + ty / c.room.h * ch - dot / 2, dot, dot, col); }
      if (c.traps) c.traps.forEach(function (t) { if (!t.hidden || t.found) at(t.tx + t.w / 2, t.ty + t.h / 2, "#c86ae0"); });
      if (c.chests) c.chests.forEach(function (b) { if (!b.opened) at(b.x / World.TILE, b.y / World.TILE, b.gold ? "#f2c14e" : "#d08a3a"); });
      if (c.key && !c.key.taken) at(c.key.tx + 0.5, c.key.ty + 0.5, "#ffe066");      // 出口の鍵（金）
      if (c.ckey && !c.ckey.taken) at(c.ckey.tx + 0.5, c.ckey.ty + 0.5, "#dfe6ee");   // 宝箱の鍵（銀）
      if (c.kind === "exit") {
        var s = Math.max(2, Math.round(Math.min(cw, ch) / 2.5));
        rect(px + cw / 2 - s / 2, py + ch / 2 - s / 2, s, s, k === curKey ? "#b32c2c" : "#ef5b5b");
      }
      if (c.kind === "start") {
        var s2 = Math.max(2, Math.round(Math.min(cw, ch) / 3.5));
        rect(px + cw / 2 - s2 / 2, py + ch / 2 - s2 / 2, s2, s2, k === curKey ? "#2a5e8a" : "#5aa9ff");
      }
    });
  }
  function mapSize(cw, ch, gap) { return { w: GRID_W * cw + (GRID_W - 1) * gap, h: GRID_H * ch + (GRID_H - 1) * gap }; }

  return {
    generate: generate, trainingFloor: trainingFloor, startPoint: startPoint, newSeed: newSeed, doorTiles: doorTiles, leftRoom: leftRoom, neighbor: neighbor, entryPoint: entryPoint,
    enemyDepth: enemyDepth, rewardScale: rewardScale, drawMap: drawMap, mapSize: mapSize, DIRS: DIRS
  };
})();
