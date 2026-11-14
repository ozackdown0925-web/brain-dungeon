// 強さの表（2026-11-06）：ダンジョン・階ごとに「その階に来るころのレベルと装備で、
// ふつうの敵を何回でたおせるか／敵の攻撃を何回受けるとたおれるか」を出す。ゲームは変えない。
// 使い方：node tools/balance.js [強化の数（ふつうは 5）]
//   数字はゲームの式（data.js・loot.js・enemies.js・state.js・battle.js）をそのまま使う。
//   レベルは、保護者が遊んだ記録（秘境15階で Lv24、坑道6階で Lv25、ゴーレム（秘境8階）で Lv19）に合わせて「深さ × 0.6」とした。
//   武器・防具はその階で拾える物（アイテムレベル＝深さ、その段、レア度 R、強化 ＋N）。おまけ（バフ）は入れない。
//   「先の見通し」は、まだ作っていないダンジョンを、今の式のまま段が1つずつ上がるとしたときの試算。
var fs = require("fs"), path = require("path"), vm = require("vm");
var root = path.join(__dirname, "..");
var ctx = { window: {}, console: console, Math: Math };
vm.createContext(ctx);
["js/game/data.js", "js/game/loot.js"].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8") + "\nthis.GameData = typeof GameData !== 'undefined' ? GameData : this.GameData; this.Loot = typeof Loot !== 'undefined' ? Loot : this.Loot;", ctx, { filename: f });
});
var G = ctx.GameData, L = ctx.Loot;
var PLUS = process.argv[2] !== undefined ? Number(process.argv[2]) : 5;
// 案（node tools/balance.js 5 plan）：今ある段（銅・鉄・鋼）はそのまま、次の段からは足し算（1段ごとに ＋0.6）にしたとき
var PLAN = process.argv[3] === "plan";
var RAR = 1;   // R

function levelAt(depth) { return Math.max(1, Math.round(depth * 0.6)); }
function tierMult(t) {
  if (L.TIER_MULT[t] !== undefined) return L.TIER_MULT[t];
  return L.TIER_MULT[2] + 0.6 * (t - 2);   // 鋼のあとは1段ごとに ＋0.6（2026-11-06 決定。ミスリル＝段3 は loot.js に入った）
}
function gearK(ilv, tier) { return (1 + L.ILV_STEP * (ilv - 1)) * L.RARITY[RAR].mult * tierMult(tier) * (1 + L.PLUS_STEP * PLUS); }

function hero(job, weapon, depth, tier) {
  var lv = levelAt(depth), b = G.baseStats(job, lv), k = gearK(depth, tier);
  var W = G.WEAPONS[weapon], A = G.ARMORS[G.JOBS[job].armor];
  var s = G.combatStats(b, { patk: Math.round(W.patk * k), matk: Math.round(W.matk * k) }, { pdef: Math.round(A.pdef * k), mdef: Math.round(A.mdef * k) }, lv);
  s.level = lv; s.weapon = weapon; return s;
}
function foe(type, depth, D) {
  var d = G.ENEMIES[type], k = Math.max(0, depth - 1);
  var t = (D && D.foeType && D.foeType[type]) || {};
  var hm = ((D && D.foeHp) || 1) * (t.hp || 1), am = ((D && D.foeAtk) || 1) * (t.atk || 1);
  return { name: d.name, hp: Math.round(d.hp * (1 + 0.12 * k) * hm), patk: d.patk * (1 + 0.10 * k) * am, pdef: d.pdef, res: d.res || {} };
}
// 1回のダメージ（ゆらぎ・会心なし）
function hit(atk, mult, def, elem) { return Math.max(1, (atk * mult - def * 0.5) * elem); }
function row(label, depth, tier, D, type) {
  var e = foe(type, depth, D);
  var sw = hero("warrior", "sword", depth, tier);
  var W = G.WEAPONS.sword, el = e.res.hasOwnProperty("slash") ? e.res.slash : 1;
  var dmg = hit(sw.patk, W.power, e.pdef, el);
  var taken = Math.max(e.patk - sw.pdef * 0.5, e.patk * 0.3);
  return [label, "Lv" + sw.level, String(sw.patk), String(Math.round(dmg)), e.name, String(e.hp), String(e.pdef),
          (e.hp / dmg).toFixed(1), String(Math.round(taken)), String(sw.hp), (sw.hp / taken).toFixed(0),
          Math.round(e.pdef * 0.5 / (sw.patk * W.power) * 100) + "%"];
}
var head = ["場所", "Lv", "物攻", "1振り", "敵", "敵HP", "敵物防", "何振りで", "受ける", "HP", "何回で", "守りで減る"];
var rows = [];
var REP = { forest1: "goblin_sword", shouki: "skeleton_sword", hikyo: "goblin_sword", kodo: "thief_sword", yama: "harpy", yuki: "penguin", shonyu: "fishman" };
G.DUNGEON_ORDER.forEach(function (id) {
  var D = G.DUNGEONS[id];
  [1, D.floors].forEach(function (f) {
    rows.push(row(D.short + " " + f + "階", D.depthBase + f, D.tier || 0, D, REP[id]));
  });
});
// 先の見通し：今の式のまま、ダンジョン1つ（12階）ごとに段が1つ上がる。敵の上のせは、いちばん新しいダンジョンと同じ
var last = G.DUNGEONS[G.DUNGEON_ORDER[G.DUNGEON_ORDER.length - 1]], base = last.depthBase + last.floors, tier = last.tier || 0;
for (var i = 1; i <= 5; i++) {
  base += 12; tier += 1;
  rows.push(row("（先" + i + "）" + "段" + tier + " 12階", base, tier, last, "thief_sword"));
}
var w = head.map(function (h, c) { return Math.max.apply(null, [h].concat(rows.map(function (r) { return r[c]; })).map(function (x) { return x.length * 2; })); });
console.log("強化 ＋" + PLUS + "・レア度 R・戦士（剣）で計算" + (PLAN ? "（案：次の段から伸びを足し算に）" : "") + "\n");
console.log("| " + head.join(" | ") + " |");
console.log("|" + head.map(function () { return "---"; }).join("|") + "|");
rows.forEach(function (r) { console.log("| " + r.join(" | ") + " |"); });
