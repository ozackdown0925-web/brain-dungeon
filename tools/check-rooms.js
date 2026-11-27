// 部屋の型を全部しらべて、となりの部屋から入ったときに、キャラが水や壁の中に出ないかを確かめる。
// 使い方：node tools/check-rooms.js （何も出なければ OK）
// 2026-11-28：鍾乳洞の「地底の川」に西や東から入ると川の中に出て動けなくなったので作った。
var fs = require("fs"), vm = require("vm"), path = require("path");
var root = path.join(__dirname, "..");
var ctx = { console: console, Math: Math };
vm.createContext(ctx);
var roomsSrc = fs.readFileSync(path.join(root, "js/game/rooms.js"), "utf8");
var names = (roomsSrc.match(/^var (\w+)/mg) || []).map(function (s) { return s.slice(4); });
vm.runInContext(fs.readFileSync(path.join(root, "js/game/world.js"), "utf8") + "\nthis.World = World;", ctx);
vm.runInContext(roomsSrc + "\nthis.__R = {" + names.map(function (n) { return n + ": " + n; }).join(", ") + "};", ctx);
vm.runInContext(fs.readFileSync(path.join(root, "js/game/dungeon.js"), "utf8") + "\nthis.Dungeon = Dungeon;", ctx);
var World = ctx.World, Dungeon = ctx.Dungeon, R = ctx.__R, bad = 0, r = 6;
Object.keys(R).forEach(function (n) {
  var list = Array.isArray(R[n]) ? R[n] : [R[n]];
  list.forEach(function (tpl) {
    if (!tpl || !tpl.rows) return;
    ["n", "s", "w", "e"].forEach(function (d) {
      var g = tpl.rows.map(function (row) { return row.split(""); });
      Dungeon.doorTiles(g[0].length, g.length, d).forEach(function (p) { g[p.y][p.x] = ":"; });
      var room = new World.Room(g.map(function (row) { return row.join(""); }));
      var p = Dungeon.entryPoint(room, d);
      if (room.hitsWall(p.x - r, p.y - r, r * 2, r * 2)) { bad++; console.log("動けない：" + n + "「" + tpl.name + "」" + d + " から入ったとき (" + p.x + ", " + p.y + ")"); }
    });
  });
});
if (!bad) console.log("OK：どの部屋も、入ったところで動けます");
process.exitCode = bad ? 1 : 0;
