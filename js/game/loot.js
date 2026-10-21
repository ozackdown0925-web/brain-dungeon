// 手に入るもの：宝箱の中身（装備＋素材＋ゴールド）と、敵が落とすもの（ゴールドと素材）。数字は docs/draft.md 1.4〜1.5、2、4。
// 拾った装備は、拠点とセーブ（段階5）ができるまでは、冒険の終わりに一覧で見せるだけ。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Loot = (function () {
  // レア度（draft 1.5）。表記は なし・R・SR・UR（2026-10-18 決定）。long＝手に入れたときの言い方
  var RARITY = [
  // 強さの倍率は「当たったらラッキー」くらい（2026-10-18 決定：R ×1.1・SR ×1.2・UR ×1.3）。強くなるのは主に鍛冶屋の強化
    { name: "ノーマル", tag: "",   long: "",               color: "#ece7da", mult: 1.00, buff: [0, 1], debuff: [0, 1] },
    { name: "R",        tag: "R",  long: "レア装備",         color: "#5aa9ff", mult: 1.10, buff: [1, 2], debuff: [0, 1] },
    { name: "SR",       tag: "SR", long: "スーパーレア装備", color: "#b48cf0", mult: 1.20, buff: [2, 2], debuff: [0, 1] },
    { name: "UR",       tag: "UR", long: "ウルトラレア装備", color: "#f2c14e", mult: 1.30, buff: [2, 2], debuff: [0, 0] }
  ];
  // 装備の段（銅・鉄・鋼…。ダンジョン1つで1段）。次の段のもとの強さは1.6倍（＝前の段の＋10くらい）。
  // 強化に使う素材は、段が上がるほど増える（銅 ×1・鉄 ×2・鋼 ×3）。今は銅（0）だけ。2026-10-18 決定
  var TIER_MULT = [1, 1.6, 2.56];
  // 深い階で拾う装備の、もとの強さの伸び（1階ごと）
  var ILV_STEP = 0.03;
  var STAT_NAMES = { patk: "物攻", pdef: "物防", matk: "魔攻", mdef: "魔防", hp: "HP", mp: "MP" };
  var STATS = ["patk", "pdef", "matk", "mdef", "hp", "mp"];
  // レジェンドの特別な効果（名前だけ。効き目は段階5で装備できるようになってから）
  var SPECIALS = ["会心が出やすい", "MPの回復が速い", "Wait Time が短い", "毒にならない"];
  var MATERIALS = { iron: "鉱石", stone: "魔石", gem: "宝玉" };   // 宝玉（2026-10-20）：鍛冶屋でレア度を上げる   // iron は前のセーブとそろえるための名前（画面では「鉱石」）

  // 鍛冶屋の強化：＋1ごとにもとの強さ＋6%、どの段も＋10まで（2026-10-18 決定）
  var PLUS_STEP = 0.06, PLUS_MAX = 10;

  function between(r) { return r[0] + Math.floor(Math.random() * (r[1] - r[0] + 1)); }

  // 宝箱のレア度の出やすさ（2026-10-18 決定）：階層で変わる。1階 ふつう85・R13・SR2・UR0 → 14階 65・25・8・2。
  // 正解数は少しだけ効く（1問ごとに ふつう−2・R＋1.5・SR＋0.5）
  function rarityWeights(floor, correct, rareOrBetter) {
    var c = Math.max(0, Math.min(4, correct || 0));
    var t = (Math.max(1, Math.min(14, floor || 1)) - 1) / 13;
    var w = [85 - 20 * t - 2 * c, 13 + 12 * t + 1.5 * c, 2 + 6 * t + 0.5 * c, 2 * t];
    if (rareOrBetter) w[0] = 0; // 鍵の部屋の宝箱：レア以上が必ず出る（2026-10-17 決定）
    return w;
  }
  function rollRarity(floor, correct, rareOrBetter) {
    var w = rarityWeights(floor, correct, rareOrBetter), sum = w[0] + w[1] + w[2] + w[3], r = Math.random() * sum;
    for (var i = 0; i < 4; i++) { if (r < w[i]) return i; r -= w[i]; }
    return 3;
  }

  // 装備を1つ作る。ilv＝拾った階層の深さ、tier＝段（0＝銅）
  function makeEquip(ilv, correct, rareOrBetter, tier) {
    tier = tier || 0;
    var r = rollRarity(ilv, correct, rareOrBetter), R = RARITY[r];
    var isWeapon = Math.random() < 0.6;
    var base = isWeapon ? pick(Object.keys(GameData.WEAPONS)) : pick(Object.keys(GameData.ARMORS));
    var def = isWeapon ? GameData.WEAPONS[base] : GameData.ARMORS[base];
    var k = (1 + ILV_STEP * (ilv - 1)) * R.mult * TIER_MULT[tier];
    var item = {
      slot: isWeapon ? "weapon" : "armor", base: base, r: r, ilv: ilv, tier: tier, plus: 0, buff: [], debuff: [], sp: null,
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

  // レア度を1段上げる（2026-10-20 保護者と決定）：もとの強さはレア度の倍率に合わせ、＋の強化はそのまま。
  // バフ（＋のおまけ）は、そのレア度の少ないほうの数まで足す。UR になったらデバフ（−のおまけ）は消える
  function raiseRarity(item) {
    if (item.r >= 3) return false;
    var to = RARITY[item.r + 1];
    item.r++;
    // もとの強さは、同じレア度で拾ったときと同じ計算で出しなおす（小さい数でも、四捨五入で上がりそこねないように）
    var def = item.slot === "weapon" ? GameData.WEAPONS[item.base] : GameData.ARMORS[item.base];
    if (def) {
      var k = (1 + ILV_STEP * ((item.ilv || 1) - 1)) * to.mult * TIER_MULT[item.tier || 0];
      if (item.slot === "weapon") { item.patk = Math.max(item.patk || 0, Math.round(def.patk * k)); item.matk = Math.max(item.matk || 0, Math.round(def.matk * k)); }
      else { item.pdef = Math.max(item.pdef || 0, Math.round(def.pdef * k)); item.mdef = Math.max(item.mdef || 0, Math.round(def.mdef * k)); }
    }
    var size = Math.round(2 + (item.ilv || 1) * 0.5);
    var used = item.buff.map(function (b) { return b[0]; }).concat(item.debuff.map(function (d) { return d[0]; }));
    while (item.buff.length < to.buff[0]) {
      var free = STATS.filter(function (x) { return used.indexOf(x) < 0; });
      if (!free.length) break;
      var s2 = pick(free); used.push(s2); item.buff.push([s2, size]);
    }
    if (item.r === 3) item.debuff = [];
    return true;
  }
  // 宝玉が出る確率（2026-10-20 保護者と決定）
  // 2026-10-22 保護者の感想（宝玉が出にくい。レア度より強化のほうが強いので、レア度を上げるハードルを下げたい）で上げた。
  // 前は 4問正解15%・3問正解5%・金の宝箱10%・ボス50%
  var GEM_CHANCE = { trial4: 0.30, trial3: 0.15, goldChest: 0.25, boss: 1.0 };

  // 装備の名前（例：「銅の剣」「銅の剣＋2〈SR〉」）。名前は種類から決める（前のセーブの装備も新しい名前で出る）
  function baseName(item) {
    var def = item.slot === "weapon" ? GameData.WEAPONS[item.base] : GameData.ARMORS[item.base];
    var tn = GameData.TIER_NAMES[item.tier || 0];   // 鉄の段の名前（2026-10-22）
    if (tn && tn[item.base]) return tn[item.base];
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
    var k = 1 + PLUS_STEP * (item.plus || 0);
    main = item.slot === "weapon"
      ? (item.patk ? "物攻" + Math.round(item.patk * k) : "") + (item.matk ? (item.patk ? "・" : "") + "魔攻" + Math.round(item.matk * k) : "")
      : "物防" + Math.round(item.pdef * k) + "・魔防" + Math.round(item.mdef * k);
    return label(item) + " Lv" + item.ilv + "  " + main + (mods.length ? "（" + mods.join("・") + "）" : "");
  }

  // 素材の量の倍率：深い階ほど多い（14階で1階の2倍）、正解1問ごとに＋15%（2026-10-18 決定。前は＋25%）
  function matScale(floor, correct) {
    var t = (Math.max(1, Math.min(14, floor || 1)) - 1) / 13;
    return (1 + t) * (1 + 0.15 * Math.max(0, Math.min(4, correct || 0)));
  }
  // 道具（宝箱は3つに1つくらい、敵はまれに）
  function rollTool() {
    var r = Math.random();
    if (r < 0.45) return "potion";
    if (r < 0.80) return "ether";
    return pick(["antidote", "paraheal", "wake"]);
  }

  // 宝箱の中身（いつも装備1つ＋素材＋ゴールド。ときどき道具）。ゴールド 20＋5×d（draft 4）。tier：装備の段（0＝銅・1＝鉄）
  // よい宝箱（金の宝箱・ボスの宝箱。rareOrBetter）は、装備のかわりに、宝玉・復活薬・素材の山が出ることもある
  // （2026-10-22 保護者の案：宝玉でレア度を上げられるので、レア装備ばかり出ても仕方ない）
  //   R以上の装備 40%・宝玉1こ 20%・復活薬1こ 15%・素材の山（鉱石と魔石あわせて6〜9こ）25%
  var RARE_PRIZE = [["equip", 0.40], ["gem", 0.20], ["revive", 0.15], ["mats", 0.25]];
  function chest(floor, correct, rareOrBetter, tier) {
    var mat = {};
    var n = Math.floor(1.5 * matScale(floor, correct) + (rareOrBetter ? 1 : 0) + Math.random());
    for (var i = 0; i < n; i++) { var m = Math.random() < 0.6 ? "iron" : "stone"; mat[m] = (mat[m] || 0) + 1; }
    var out = { equip: null, gold: 20 + 5 * floor, mat: mat, tool: Math.random() < 1 / 3 ? rollTool() : null, prize: "equip" };
    if (rareOrBetter) {
      var r = Math.random(), acc = 0;
      for (var k = 0; k < RARE_PRIZE.length; k++) { acc += RARE_PRIZE[k][1]; if (r < acc) { out.prize = RARE_PRIZE[k][0]; break; } }
    }
    if (out.prize === "equip") out.equip = makeEquip(floor, correct, rareOrBetter, tier || 0);
    else if (out.prize === "gem") mat.gem = (mat.gem || 0) + 1;
    else if (out.prize === "revive") out.tool = "revive";
    else if (out.prize === "mats") { var big = 6 + Math.floor(Math.random() * 4); for (var j = 0; j < big; j++) { var m2 = j % 2 ? "stone" : "iron"; mat[m2] = (mat[m2] || 0) + 1; } }
    return out;
  }

  // 敵が落とすもの：ゴールド 3＋d、素材は30%で1つ（ゴブリン・蜂 → 鉱石、つる草・キノコの魔物 → 魔石）（draft 2）
  // 敵を増やしたので、1体あたりは Dungeon.rewardScale(d) 倍（1階層の合計は前と同じ）
  // 素材は深い階と正解数で増える（matScale）。まれに（3%）回復薬か MP回復薬を落とす
  function enemyDrop(type, floor, correct) {
    var k = Dungeon.rewardScale(floor);
    var g = (3 + floor) * k;
    var drop = { gold: Math.floor(g) + (Math.random() < g - Math.floor(g) ? 1 : 0), mat: null }; // 小数は確率で切り上げ（合計がずれないように）
    if (Math.random() < 0.3 * k * matScale(floor, correct)) drop.mat = type === "vine" || type === "mushroom" || type === "frog" || type === "shadow_mage" || type === "wisp" ? "stone" : "iron";
    drop.tool = Math.random() < 0.03 ? (Math.random() < 0.5 ? "potion" : "ether") : null;
    return drop;
  }

  // クリア報酬のゴールド：(30＋10×d)×(1＋0.25×正解数)（draft 4・1.6）
  function clearGold(floor, correct) { return Math.round((30 + 10 * floor) * (1 + 0.25 * (correct || 0))); }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  return {
    RARITY: RARITY, MATERIALS: MATERIALS, raiseRarity: raiseRarity, GEM_CHANCE: GEM_CHANCE, rarityWeights: rarityWeights, makeEquip: makeEquip, describe: describe,
    chest: chest, enemyDrop: enemyDrop, clearGold: clearGold, rerollMods: rerollMods, label: label, TIER_MULT: TIER_MULT, ILV_STEP: ILV_STEP, PLUS_STEP: PLUS_STEP, PLUS_MAX: PLUS_MAX, typeName: typeName, STAT_NAMES: STAT_NAMES
  };
})();
