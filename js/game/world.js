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
  // 通れないところ：岩の壁・木・水・崩れた石柱（I。原生の秘境）
  Room.prototype.solidAt = function (tx, ty) {
    var t = this.tile(tx, ty);
    return t === "#" || t === "~" || t === "T" || t === "L" || t === "V" || t === "I";
  };
  // タイルを1つ書きかえる（鍵で扉を開けたときなど）
  Room.prototype.setTile = function (tx, ty, ch) {
    var r = this.rows[ty];
    this.rows[ty] = r.substring(0, tx) + ch + r.substring(tx + 1);
    this.ver = (this.ver || 0) + 1;   // 絵を描き直す印
  };
  // 矢や魔法が止まるところ：岩の壁と木と石柱（水の上は飛んでいける）
  Room.prototype.blocksShot = function (tx, ty) {
    var t = this.tile(tx, ty);
    return t === "#" || t === "T" || t === "L" || t === "V" || t === "I";
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
        if (this.solidAt(tx, ty) && !(this._fly && this.tile(tx, ty) === "~")) return true;   // 浮いているもの（瘴気の霊）は水の上も通る
      }
    }
    return false;
  };
  // 動くもの（e.x, e.y は中心、e.r は半分の大きさ）を、壁にめりこまないように動かす。横と縦を別々に動かすので、壁ぞいにすべる。
  Room.prototype.move = function (e, dx, dy) {
    this._fly = !!e.fly;
    if (dx !== 0) e.x = this.reach(e.x, e.y, e.r, dx, 0);
    if (dy !== 0) e.y = this.reach(e.x, e.y, e.r, 0, dy);
    this._fly = false;
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

  // 見えている範囲だけを写す。部屋の絵は tiles.js が1回だけ描いて覚えておく（段階7-2a）
  Room.prototype.draw = function (cam, view) {
    var cv = Tiles.canvasFor(this).ground, ctx = Render.ctx;
    var cx = Math.round(cam.x), cy = Math.round(cam.y);
    var sx = Math.max(0, cx), sy = Math.max(0, cy);
    var w = Math.min(this.pxW, cx + view.w + 1) - sx, h = Math.min(this.pxH, cy + view.h + 1) - sy;
    if (w > 0 && h > 0) ctx.drawImage(cv, sx, sy, w, h, sx - cx, sy - cy, w, h);
  };
  // 木の葉の帯。footY（キャラの足もと）より奥の行の木は front＝true のときに（キャラの前に）、手前の行の木は front＝false のときに描く
  Room.prototype.drawCrowns = function (cam, view, footY, front) {
    var bands = Tiles.canvasFor(this).bands, ctx = Render.ctx;
    var cx = Math.round(cam.x), cy = Math.round(cam.y);
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      if ((b.base > footY) !== front) continue;
      if (b.y0 > cy + view.h || b.y0 + b.canvas.height < cy) continue;
      ctx.drawImage(b.canvas, -cx, b.y0 - cy);
    }
  };

  return { TILE: TILE, Room: Room, testRoom: function () { return new Room(TEST_ROOM); } };
  // testRoom：段階1〜3の仮の部屋（今は使っていない。くらべるために残す）
})();
