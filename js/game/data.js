// 数字の定義（たたき台 docs/draft.md から）。段階2では戦士・剣・重装備・森のゴブリン3種だけ。
// 遊んでみて直すときは、まずここの数字を変える。
var GameData = (function () {
  // 属性の名前（表示用）
  var ELEMENTS = { slash: "斬", pierce: "刺", strike: "打", fire: "火", water: "水", grass: "草" };

  // 武器（ノーマル・アイテムレベル1）。reach は届く距離（ドット）、arc はふりの広さ（ラジアンの半分）
  var WEAPONS = {
    sword: { name: "剣", element: "slash", patk: 8, matk: 0, wait: 0.6, reach: 18, arc: 1.05 }
  };

  // 防具
  var ARMORS = {
    heavy: { name: "てつのよろい", pdef: 3, mdef: 0 }
  };

  // 職業ごとのレベルアップの伸び（筋力・体力・魔力・知力）
  var JOBS = {
    warrior: { name: "戦士", growth: { str: 2.0, vit: 2.0, mag: 0.5, int: 0.5 } }
  };

  // 森の敵（深さ1のとき）。res は属性ごとの倍率（1.5＝弱点、0.5＝半減、0＝無効。書いていない属性は1）
  // kind：melee＝近づいて斬る、spear＝少し離れて突く、archer＝離れて矢を撃つ
  var ENEMIES = {
    goblin_sword: {
      name: "ゴブリンの剣士", kind: "melee", hp: 40, patk: 8, pdef: 5, mdef: 2,
      res: { strike: 1.5, pierce: 0.5 }, speed: 24, r: 6,
      reach: 14, windup: 0.45, cooldown: 1.6, color: "#6f8f3e"
    },
    goblin_spear: {
      name: "ゴブリンの槍兵", kind: "spear", hp: 32, patk: 9, pdef: 3, mdef: 2,
      res: { slash: 1.5 }, speed: 28, r: 6,
      reach: 30, keep: 20, windup: 0.6, cooldown: 1.9, color: "#7d8f4a"
    },
    goblin_archer: {
      name: "ゴブリンの弓兵", kind: "archer", hp: 36, patk: 7, pdef: 2, mdef: 2,
      res: { pierce: 1.5 }, speed: 32, r: 6,
      keepMin: 64, keepMax: 120, windup: 0.5, cooldown: 2.3, arrowSpeed: 120, color: "#8a9a52"
    }
  };

  // 戦闘パラメーター（docs/draft.md 1.2）
  function combatStats(base, weapon, armor) {
    return {
      hp: 30 + base.vit * 5,
      mp: 10 + base.int * 2,
      patk: base.str + weapon.patk,
      pdef: base.str * 0.5 + armor.pdef,
      matk: base.mag + weapon.matk,
      mdef: base.mag * 0.5 + armor.mdef,
      crit: 0.05
    };
  }

  return { ELEMENTS: ELEMENTS, WEAPONS: WEAPONS, ARMORS: ARMORS, JOBS: JOBS, ENEMIES: ENEMIES, combatStats: combatStats };
})();
