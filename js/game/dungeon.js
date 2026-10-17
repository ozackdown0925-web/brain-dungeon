// ダンジョンの階層：部屋の型（rooms.js）を seed でえらび、つなぎ方を決める。地図もここで描く。
// 同じ seed なら、いつも同じ階層になる（途中で閉じても、同じつなぎ方で入口から再開できるように。段階5で使う）。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Dungeon = (function () {
  var GRID_W = 5, GRID_H = 4;   // 部屋をならべるマス目（地図の大きさ）
  var MAIN_ROOMS = 5;           // 入口から出口までの部屋の数
  var BOSS_FLOORS = [7, 14];    // ボスの階層：決まった形（入口 → 敵の部屋 → ボスの部屋）
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
      if (!passable(g[y0][x0]) || !passable(g[y0][x0 + 1]) || !passable(g[y0 + 1][x0]) || !passable(g[y0 + 1][x0 + 1])) continue;
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
      if (!passable(room.tile(x, y)) || !passable(room.tile(x + 1, y)) || !passable(room.tile(x, y + 1))) continue;
      var dd = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (dd < bd) { bd = dd; best = { x: x, y: y }; }
    }
    return { x: (best.x + 1) * World.TILE, y: (best.y + 1) * World.TILE };
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
  // avoid：近くに置かない場所（入口の部屋のスタート地点。タイルの座標）
  function placeEnemies(rnd, room, doors, floor, avoid) {
    var n = enemyCount(rnd, floor), types = [];
    for (var i = 0; i < n; i++) types.push(SQUAD[i % 3]);
    if (rnd() < 0.35) types[types.length - 1] = "vine";
    // キノコの魔物（どの階でも）と、大きな蜂（8階から）がまざる（2026-10-18 保護者と決定）
    if (rnd() < 0.4) types[0] = "mushroom";
    if (floor >= 8 && rnd() < 0.55) { types[1] = "bee"; if (n >= 5 && rnd() < 0.5) types[2] = "bee"; }
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
  function generate(floor, seed) {
    if (BOSS_FLOORS.indexOf(floor) >= 0) return generateBoss(floor, seed);
    var rnd = rng(seed);
    var lay = layout(rnd);
    var cells = {};
    var order = ForestRooms.map(function (r, i) { return i; });
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
      c.room = buildRoom(ForestRooms[c.tpl], c.doors);
      c.name = ForestRooms[c.tpl].name;
      c.center = centerSpot(c.room);
      c.enemies = placeEnemies(rnd, c.room, c.doors, floor, c.kind === "start" ? { x: c.center.x / World.TILE, y: c.center.y / World.TILE } : null);
      c.visited = false;
    });
    var dg = {
      floor: floor, seed: seed, cells: cells, start: key(start.x, start.y), exit: key(exit.x, exit.y),
      boss: BOSS_FLOORS.indexOf(floor) >= 0, lock: null, hasKey: false
    };
    placeThings(dg, floor, seed);
    return dg;
  }

  // ---------- ボスの階層（段階4-3） ----------
  // 決まった形：入口の部屋 → 敵のいる部屋 → ボスの部屋（地図のまんなかの段に横ならび）。鍵・罠・ふつうの宝箱はない。
  function generateBoss(floor, seed) {
    var rnd = rng(seed);
    var info = GameData.BOSSES[floor];
    var cells = {};
    var mid = Math.floor(rnd() * ForestRooms.length);
    if (mid === 0) mid = 1; // 入口の部屋（ひろば）とちがう型にする
    var plan = [
      { x: 1, y: 1, kind: "start", tpl: ForestRooms[0], doors: ["e"] },
      { x: 2, y: 1, kind: "room", tpl: ForestRooms[mid], doors: ["w", "e"] },
      { x: 3, y: 1, kind: "exit", tpl: BossRoom, doors: ["w"] }
    ];
    plan.forEach(function (p) {
      var c = { x: p.x, y: p.y, kind: p.kind, doors: p.doors, name: p.tpl.name, visited: false, chests: [], key: null, traps: [] };
      c.room = buildRoom(p.tpl, p.doors);
      c.center = centerSpot(c.room);
      c.enemies = p.kind === "exit" ? [] : placeEnemies(rnd, c.room, c.doors, floor, p.kind === "start" ? { x: c.center.x / World.TILE, y: c.center.y / World.TILE } : null);
      cells[key(p.x, p.y)] = c;
    });
    var bc = cells[key(3, 1)];
    // ボスは部屋のまんなか（入ってすぐ見えるように）
    bc.enemies = [{ type: info.enemy, tx: 0, ty: 0, x: bc.center.x + 10, y: bc.center.y, dead: false, boss: true }];
    bc.bossCell = true;
    return {
      floor: floor, seed: seed, cells: cells, start: key(1, 1), exit: key(3, 1), boss: true, bossInfo: info,
      bossDown: false, bossMet: false, lock: null, hasKey: false
    };
  }

  // ---------- 鍵と扉・宝箱・罠（段階4-2） ----------
  // 部屋のつなぎ方と別の順の数を使う（4-1 と同じ seed なら、部屋のつなぎ方と敵は同じまま）
  function placeThings(dg, floor, seed) {
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
      c.chests = []; c.key = null; c.traps = [];
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

    // 鍵のかかった部屋：寄り道の部屋の1つ（寄り道がない階層は、鍵も扉もなし）
    var sides = keys.filter(function (k) { return dg.cells[k].kind === "side"; });
    if (sides.length) {
      var lk = pick(rnd, sides), lc = dg.cells[lk], d = lc.doors[0];
      var pk = neighbor(dg, lk, d), pdir = DIRS[d].back, pc = dg.cells[pk];
      lc.locked = true;
      doorTiles(pc.room.w, pc.room.h, pdir).forEach(function (p) { pc.room.setTile(p.x, p.y, "L"); });
      dg.lock = { cell: lk, parent: pk, dir: pdir, open: false };
      // 鍵の部屋の宝箱（レア以上）：部屋のまんなかに
      lc.chests.push({ x: lc.center.x, y: lc.center.y, opened: false, rare: true });
      // 鍵：入口・鍵の部屋以外のどこかの部屋に
      var keyRooms = shuffle(keys.filter(function (k) { return k !== dg.start && k !== lk; }));
      for (var i = 0; i < keyRooms.length; i++) {
        var ks = spots(keyRooms[i], 1, 1, 5, false);
        if (!ks.length) continue;
        var kp = pick(rnd, ks);
        dg.cells[keyRooms[i]].key = { tx: kp.x, ty: kp.y, x: kp.x * T + 8, y: kp.y * T + 8, taken: false };
        mark(keyRooms[i], kp.x, kp.y, 1, 1, 1);
        break;
      }
    }

    // ふつうの宝箱：鍵の部屋とあわせて1階層に2〜3個。寄り道の部屋を先に
    var total = 2 + (rnd() < 0.5 ? 1 : 0), have = dg.lock ? 1 : 0;
    var chestRooms = shuffle(keys.filter(function (k) { return dg.cells[k].kind === "side" && !dg.cells[k].locked; }))
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
    var traps = 2 + Math.floor(floor / 3) + (rnd() < 0.5 ? 1 : 0);
    var trapRooms = keys.filter(function (k) { return k !== dg.start; });
    var perRoom = {};
    for (var t = 0, tries = 0; t < traps && tries < 60; tries++) {
      var tk = pick(rnd, trapRooms);
      if ((perRoom[tk] || 0) >= 2) continue;
      var pit = rnd() < 0.45;
      // 落とし穴はまわり1マスも通れるところだけ（せまい道をふさがないように）
      var ts = pit ? spots(tk, 1, 1, 4, true) : spots(tk, 2, 2, 3, false);
      if (!ts.length) continue;
      var tp = pick(rnd, ts);
      dg.cells[tk].traps.push({ type: pit ? "pit" : "swamp", tx: tp.x, ty: tp.y, w: pit ? 1 : 2, h: pit ? 1 : 2, hidden: rnd() < 0.35, found: false });
      mark(tk, tp.x, tp.y, pit ? 1 : 2, pit ? 1 : 2, 1);
      perRoom[tk] = (perRoom[tk] || 0) + 1;
      t++;
    }
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
      if (c.chests) c.chests.forEach(function (b) { if (!b.opened) at(b.x / World.TILE, b.y / World.TILE, "#d08a3a"); });
      if (c.key && !c.key.taken) at(c.key.tx + 0.5, c.key.ty + 0.5, "#ffe066");
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
    generate: generate, newSeed: newSeed, doorTiles: doorTiles, leftRoom: leftRoom, neighbor: neighbor, entryPoint: entryPoint,
    enemyDepth: enemyDepth, rewardScale: rewardScale, drawMap: drawMap, mapSize: mapSize, DIRS: DIRS, BOSS_FLOORS: BOSS_FLOORS
  };
})();
