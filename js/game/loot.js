// 手に入るもの：宝箱の中身（装備＋素材＋ゴールド）と、敵が落とすもの（ゴールドと素材）。数字は docs/draft.md 1.4〜1.5、2、4。
// 拾った装備は、拠点とセーブ（段階5）ができるまでは、冒険の終わりに一覧で見せるだけ。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Loot = (function () {
  // レア度（draft 1.5）。表記は なし・R・SR・UR（2026-10-18 決定）。long＝手に入れたときの言い方
  var RARITY = [
    { name: "ノーマル", tag: "",   long: "",               color: "#ece7da", mult: 1.00, buff: [0, 1], debuff: [0, 1] },
    { name: "R",        tag: "R",  long: "レア装備",         color: "#5aa9ff", mult: 1.15, buff: [1, 2], debuff: [0, 1] },
    { name: "SR",       tag: "SR", long: "スーパーレア装備", color: "#b48cf0", mult: 1.30, buff: [2, 2], debuff: [0, 1] },
    { name: "UR",       tag: "UR", long: "ウルトラレア装備", color: "#f2c14e", mult: 1.50, buff: [2, 2], debuff: [0, 0] }
  ];
  var STAT_NAMES = { patk: "物攻", pdef: "物防", matk: "魔攻", mdef: "魔防", hp: "HP", mp: "MP" };
  var STATS = ["patk", "pdef", "matk", "mdef", "hp", "mp"];
  // レジェンドの特別な効果（名前だけ。効き目は段階5で装備できるようになってから）
  var SPECIALS = ["会心が出やすい", "MPの回復が速い", "Wait Time が短い", "毒にならない"];
  var MATERIALS = { iron: "鉄", stone: "魔石" };

  function between(r) { return r[0] + Math.floor(Math.random() * (r[1] - r[0] + 1)); }

  // 宝箱のレア度の出やすさ（draft 1.5、決定）：0問 ノーマル60・レア30・エピック9・レジェンド1、正解1問ごとに −8・＋4・＋3・＋1
  function rarityWeights(correct, rareOrBetter) {
    var c = Math.max(0, Math.min(4, correct || 0));
    var w = [60 - 8 * c, 30 + 4 * c, 9 + 3 * c, 1 + c];
    if (rareOrBetter) w[0] = 0; // 鍵の部屋の宝箱：レア以上が必ず出る（2026-10-17 決定）
    return w;
  }
  function rollRarity(correct, rareOrBetter) {
    var w = rarityWeights(correct, rareOrBetter), sum = w[0] + w[1] + w[2] + w[3], r = Math.random() * sum;
    for (var i = 0; i < 4; i++) { if (r < w[i]) return i; r -= w[i]; }
    return 3;
  }

  // 装備を1つ作る。ilv＝拾った階層の深さ
  function makeEquip(ilv, correct, rareOrBetter) {
    var r = rollRarity(correct, rareOrBetter), R = RARITY[r];
    var isWeapon = Math.random() < 0.6;
    var base = isWeapon ? pick(Object.keys(GameData.WEAPONS)) : pick(Object.keys(GameData.ARMORS));
    var def = isWeapon ? GameData.WEAPONS[base] : GameData.ARMORS[base];
    var k = (1 + 0.08 * (ilv - 1)) * R.mult;
    var item = {
      slot: isWeapon ? "weapon" : "armor", base: base, r: r, ilv: ilv, plus: 0, buff: [], debuff: [], sp: null,
      name: def.item || def.name
    };
    if (isWeapon) { item.patk = Math.round(def.patk * k); item.matk = Math.round(def.matk * k); }
    else { item.pdef = Math.round(def.pdef * k); item.mdef = Math.round(def.mdef * k); }
    var size = Math.round(2 + ilv * 0.5);
    var used = [];
    function addMod(list) {
      var s = pick(STATS.filter(function (x) { return used.indexOf(x) < 0; }));
      used.push(s); list.push([s, size]);
    }
    for (var i = between(R.buff); i > 0; i--) addMod(item.buff);
    for (var j = between(R.debuff); j > 0; j--) addMod(item.debuff);
    if (r === 3) item.sp = pick(SPECIALS);
    return item;
  }

  // バフ・デバフだけを作りなおす（鍛冶屋の引き直し）
  function rerollMods(r, ilv) {
    var R = RARITY[r], size = Math.round(2 + ilv * 0.5), used = [], out = { buff: [], debuff: [] };
    function addMod(list) { var s = pick(STATS.filter(function (x) { return used.indexOf(x) < 0; })); used.push(s); list.push([s, size]); }
    for (var i = between(R.buff); i > 0; i--) addMod(out.buff);
    for (var j = between(R.debuff); j > 0; j--) addMod(out.debuff);
    return out;
  }

  // 装備の名前（例：「銅の剣」「銅の剣＋2〈SR〉」）。名前は種類から決める（前のセーブの装備も新しい名前で出る）
  function baseName(item) {
    var def = item.slot === "weapon" ? GameData.WEAPONS[item.base] : GameData.ARMORS[item.base];
    return def ? (def.item || def.name) : item.name;
  }
  function label(item) {
    return baseName(item) + (item.plus ? "＋" + item.plus : "") + (item.r > 0 ? "〈" + RARITY[item.r].tag + "〉" : "");
  }
  // 装備の種類の名前（図鑑などで使う）
  function typeName(key) {
    var def = GameData.WEAPONS[key] || GameData.ARMORS[key];
    return def ? (def.item || def.name) : key;
  }

  // 装備を1行で書く（例：「銅の剣〈R〉 Lv3  物攻11（物攻+3・魔防−3）」）
  function describe(item) {
    var main = item.slot === "weapon"
      ? (item.patk ? "物攻" + item.patk : "") + (item.matk ? (item.patk ? "・" : "") + "魔攻" + item.matk : "")
      : "物防" + item.pdef + "・魔防" + item.mdef;
    var mods = item.buff.map(function (b) { return STAT_NAMES[b[0]] + "+" + b[1]; })
      .concat(item.debuff.map(function (d) { return STAT_NAMES[d[0]] + "−" + d[1]; }));
    if (item.sp) mods.push(item.sp);
    var k = 1 + 0.05 * (item.plus || 0);
    main = item.slot === "weapon"
      ? (item.patk ? "物攻" + Math.round(item.patk * k) : "") + (item.matk ? (item.patk ? "・" : "") + "魔攻" + Math.round(item.matk * k) : "")
      : "物防" + Math.round(item.pdef * k) + "・魔防" + Math.round(item.mdef * k);
    return label(item) + " Lv" + item.ilv + "  " + main + (mods.length ? "（" + mods.join("・") + "）" : "");
  }

  // 宝箱の中身（いつも装備1つ＋素材＋ゴールド）。ゴールド 20＋5×d（draft 4）
  function chest(floor, correct, rareOrBetter) {
    var mat = {};
    var n = 1 + Math.floor(Math.random() * 2) + (rareOrBetter ? 1 : 0);
    for (var i = 0; i < n; i++) { var m = Math.random() < 0.6 ? "iron" : "stone"; mat[m] = (mat[m] || 0) + 1; }
    return { equip: makeEquip(floor, correct, rareOrBetter), gold: 20 + 5 * floor, mat: mat };
  }

  // 敵が落とすもの：ゴールド 3＋d、素材は30%で1つ（ゴブリン・蜂 → 鉄、つる草・キノコの魔物 → 魔石）（draft 2）
  // 敵を増やしたので、1体あたりは Dungeon.rewardScale(d) 倍（1階層の合計は前と同じ）
  function enemyDrop(type, floor) {
    var k = Dungeon.rewardScale(floor);
    var g = (3 + floor) * k;
    var drop = { gold: Math.floor(g) + (Math.random() < g - Math.floor(g) ? 1 : 0), mat: null }; // 小数は確率で切り上げ（合計がずれないように）
    if (Math.random() < 0.3 * k) drop.mat = type === "vine" || type === "mushroom" ? "stone" : "iron";
    return drop;
  }

  // クリア報酬のゴールド：(30＋10×d)×(1＋0.25×正解数)（draft 4・1.6）
  function clearGold(floor, correct) { return Math.round((30 + 10 * floor) * (1 + 0.25 * (correct || 0))); }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  return {
    RARITY: RARITY, MATERIALS: MATERIALS, rarityWeights: rarityWeights, makeEquip: makeEquip, describe: describe,
    chest: chest, enemyDrop: enemyDrop, clearGold: clearGold, rerollMods: rerollMods, label: label, typeName: typeName, STAT_NAMES: STAT_NAMES
  };
})();
