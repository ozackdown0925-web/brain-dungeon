// 部屋：タイル（16×16）の並びと、壁とのぶつかり判定、描画。
// 部屋の型は rooms.js、つなぎ方は dungeon.js（段階4）。
var World = (function () {
  var TILE = 16;

  // # 壁　. 床　~ 水（通れない）　* 草むら（通れる・見た目だけ）
  var TEST_ROOM = [
    "########################################",
    "#......................................#",
    "#..****.............................**.#",
    "#..****......####..........~~~......**.#",
    "#............####..........~~~.........#",
    "#..........................~~~.........#",
    "#......................................#",
    "#.....##...............................#",
    "#.....##..............*****.....###....#",
    "#.....................*****.....###....#",
    "#......................................#",
    "#..........~~~~........................#",
    "#..........~~~~.............##.........#",
    "#...........................##.....***.#",
    "#..***.............................***.#",
    "#..***.................................#",
    "#........#####.........................#",
    "#......................................#",
    "#......................................#",
    "#......................................#",
    "#......................................#",
    "#......................................#",
    "########################################"
  ];

  function Room(rows) {
    this.rows = rows;
    this.h = rows.length;
    this.w = rows[0].length;
    this.pxW = this.w * TILE;
    this.pxH = this.h * TILE;
  }
  // : は、となりの部屋への道（dungeon.js がまわりの壁にあける）。道の外側（部屋の外）も少しだけ歩けるので、そこまで進むと部屋を移る。
  Room.prototype.tile = function (tx, ty) {
    if (ty < 0 || ty >= this.h || tx < 0 || tx >= this.w) {
      var cx = Math.max(0, Math.min(this.w - 1, tx)), cy = Math.max(0, Math.min(this.h - 1, ty));
      if (this.rows[cy].charAt(cx) === ":" && Math.abs(tx - cx) + Math.abs(ty - cy) <= 2) return ":";
      return "#";
    }
    return this.rows[ty].charAt(tx);
  };
  // 通れないところ：岩の壁・木・水
  Room.prototype.solidAt = function (tx, ty) {
    var t = this.tile(tx, ty);
    return t === "#" || t === "~" || t === "T";
  };
  // 矢や魔法が止まるところ：岩の壁と木（水の上は飛んでいける）
  Room.prototype.blocksShot = function (tx, ty) {
    var t = this.tile(tx, ty);
    return t === "#" || t === "T";
  };
  // 敵が部屋の外に出ないようにする
  Room.prototype.keepInside = function (e) {
    e.x = Math.max(e.r + 1, Math.min(this.pxW - e.r - 1, e.x));
    e.y = Math.max(e.r + 1, Math.min(this.pxH - e.r - 1, e.y));
  };
  // 四角（x, y は左上、w, h は大きさ）が壁にかかっているか
  Room.prototype.hitsWall = function (x, y, w, h) {
    var x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.001) / TILE);
    var y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.001) / TILE);
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        if (this.solidAt(tx, ty)) return true;
      }
    }
    return false;
  };
  // 動くもの（e.x, e.y は中心、e.r は半分の大きさ）を、壁にめりこまないように動かす。横と縦を別々に動かすので、壁ぞいにすべる。
  Room.prototype.move = function (e, dx, dy) {
    if (dx !== 0) e.x = this.reach(e.x, e.y, e.r, dx, 0);
    if (dy !== 0) e.y = this.reach(e.x, e.y, e.r, 0, dy);
  };
  // (x, y) から (dx, dy) だけ進もうとして、壁の手前で止まった位置（動かした方の座標）を返す
  Room.prototype.reach = function (x, y, r, dx, dy) {
    var self = this;
    function free(nx, ny) { return !self.hitsWall(nx - r, ny - r, r * 2, r * 2); }
    if (free(x + dx, y + dy)) return dx !== 0 ? x + dx : y + dy;
    var d = dx !== 0 ? dx : dy;
    var step = d > 0 ? 0.25 : -0.25;
    var n = Math.floor(Math.abs(d) / 0.25);
    var moved = 0;
    for (var i = 0; i < n; i++) {
      var nx = dx !== 0 ? x + moved + step : x, ny = dy !== 0 ? y + moved + step : y;
      if (!free(nx, ny)) break;
      moved += step;
    }
    return dx !== 0 ? x + moved : y + moved;
  };

  var COLORS = {
    "#": { top: "#4a5240", face: "#2f3529" },
    ".": { a: "#3b4a2f", b: "#384629" },
    "*": { a: "#2f5a2a", b: "#2a5025" },
    "~": { a: "#26506e", b: "#2b5878" },
    ":": { a: "#4a4a32", b: "#45452e" },
    "=": { a: "#7a5a34", b: "#6e5030" }
  };

  // 見えている範囲のタイルだけを描く
  Room.prototype.draw = function (cam, view) {
    var tx0 = Math.max(0, Math.floor(cam.x / TILE)), tx1 = Math.min(this.w - 1, Math.floor((cam.x + view.w) / TILE));
    var ty0 = Math.max(0, Math.floor(cam.y / TILE)), ty1 = Math.min(this.h - 1, Math.floor((cam.y + view.h) / TILE));
    for (var ty = ty0; ty <= ty1; ty++) {
      for (var tx = tx0; tx <= tx1; tx++) {
        var t = this.tile(tx, ty);
        var sx = tx * TILE - cam.x, sy = ty * TILE - cam.y;
        if (t === "#") {
          Render.rect(sx, sy, TILE, TILE, COLORS["#"].face);
          if (!this.solidAt(tx, ty + 1) || ty === this.h - 1) Render.rect(sx, sy, TILE, 4, COLORS["#"].top);
        } else {
          var c = COLORS[t === "T" ? "." : t] || COLORS["."];
          Render.rect(sx, sy, TILE, TILE, (tx + ty) % 2 ? c.a : c.b);
          if (t === "*") { Render.rect(sx + 3, sy + 9, 2, 4, "#4d8a3c"); Render.rect(sx + 9, sy + 5, 2, 4, "#4d8a3c"); }
          if (t === "~") Render.rect(sx + 2, sy + 6, 6, 1, "#4f86a8");
          if (t === "=") { Render.rect(sx, sy + 4, TILE, 1, "#4e3820"); Render.rect(sx, sy + 10, TILE, 1, "#4e3820"); }
          if (t === "T") {
            // 木（仮の絵）：みき＋まるい葉
            Render.rect(sx + 6, sy + 9, 4, 6, "#5a3d22");
            Render.rect(sx + 2, sy + 2, 12, 9, "#1f4a22");
            Render.rect(sx + 4, sy + 1, 8, 2, "#2a5e2b");
            Render.rect(sx + 4, sy + 4, 3, 2, "#3a7a37");
          }
        }
      }
    }
  };

  return { TILE: TILE, Room: Room, testRoom: function () { return new Room(TEST_ROOM); } };
  // testRoom：段階1〜3の仮の部屋（今は使っていない。くらべるために残す）
})();
