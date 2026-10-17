// 拠点のメニューの中身（段階5-2①）：装備・倉庫・お店・鍛冶屋。
// どれも拠点の上に重ねる画面（#town）で開き、「拠点にもどる」で閉じる。数字やしくみは state.js。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Town = (function () {
  var townEl = document.getElementById("town");
  var titleEl = document.getElementById("townTitle");
  var moneyEl = document.getElementById("townMoney");
  var bodyEl = document.getElementById("townBody");
  var noteEl = document.getElementById("townNote");
  var current = null, heroIdx = 0;

  var NAMES = { equip: "装備", storage: "倉庫", shop: "お店", smith: "鍛冶屋" };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function button(text, fn, cls) {
    var b = el("button", "btn " + (cls || "small-btn"), text); b.type = "button";
    b.addEventListener("click", fn);
    return b;
  }
  function itemLine(it, extra) {
    var d = el("div", "item-line");
    var name = el("span", "item-name", Loot.describe(it)); name.style.color = Loot.RARITY[it.r].color;
    d.appendChild(name);
    if (extra) d.appendChild(el("span", "item-extra", extra));
    return d;
  }
  function say(text) { noteEl.textContent = text; }

  function open(name) {
    current = name;
    titleEl.textContent = NAMES[name];
    say("");
    townEl.hidden = false;
    document.getElementById("base").hidden = true; // 拠点の画面は、閉じるまで隠す（重なって押せなくならないように）
    townEl.scrollTop = 0;
    render();
  }
  function close() {
    townEl.hidden = true;
    Base.showBase(null);
  }
  document.getElementById("townBack").addEventListener("click", close);

  function render() {
    var g = GameState.get();
    moneyEl.textContent = g.gold + "G　鉄 " + g.mat.iron + "　魔石 " + g.mat.stone + "　倉庫 " + g.storage.length + "/" + GameState.STORAGE_MAX;
    bodyEl.textContent = "";
    if (current === "equip") renderEquip(g);
    if (current === "storage") renderStorage(g);
    if (current === "shop") renderShop(g);
    if (current === "smith") renderSmith(g);
  }

  // ---------- 装備 ----------
  function heroTabs(g) {
    var tabs = el("div", "tabs");
    g.party.forEach(function (h, i) {
      var b = button(h.name + "（" + GameData.JOBS[h.job].name + "）", function () { heroIdx = i; say(""); render(); }, "chip" + (i === heroIdx ? " sel" : ""));
      tabs.appendChild(b);
    });
    return tabs;
  }
  function statText(s) { return "HP " + s.hp + "　MP " + s.mp + "　物攻 " + s.patk + "　物防 " + s.pdef + "　魔攻 " + s.matk + "　魔防 " + s.mdef; }
  // a → b の変わり方（上がるところは緑、下がるところは赤）
  function diffNode(a, b) {
    var d = el("div", "diff");
    [["hp", "HP"], ["mp", "MP"], ["patk", "物攻"], ["pdef", "物防"], ["matk", "魔攻"], ["mdef", "魔防"]].forEach(function (k) {
      if (a[k[0]] === b[k[0]]) return;
      var up = b[k[0]] > a[k[0]];
      d.appendChild(el("span", up ? "up" : "down", k[1] + " " + a[k[0]] + "→" + b[k[0]]));
    });
    if (!d.children.length) d.appendChild(el("span", "", "能力は変わらない"));
    return d;
  }
  function renderEquip(g) {
    var h = g.party[heroIdx];
    bodyEl.appendChild(heroTabs(g));
    var now = GameState.heroStats(h);
    bodyEl.appendChild(el("p", "stat-now", statText(now)));
    ["weapon", "armor"].forEach(function (slot) {
      var box = el("div", "slot");
      box.appendChild(el("h3", "", slot === "weapon" ? "武器" : "防具"));
      var it = h.equip[slot];
      if (it) {
        box.appendChild(itemLine(it));
        box.appendChild(button("はずす（倉庫へ）", function () {
          if (!GameState.unequip(h, slot)) { say("倉庫がいっぱいで、はずせない"); return; }
          say("はずして倉庫に入れた"); render();
        }));
      } else {
        var starter = slot === "weapon" ? GameData.WEAPONS[GameState.starterWeapon(h.job)].name : GameData.STARTER_ARMORS[GameData.JOBS[h.job].armor].name;
        box.appendChild(el("div", "item-line", "はじめの" + (slot === "weapon" ? "武器（" + starter + "）" : "防具（" + starter + "）")));
      }
      // 倉庫の中で、この職業が装備できる物
      var cand = g.storage.filter(function (x) { return x.slot === slot && GameState.canEquip(h, x); });
      if (cand.length) {
        box.appendChild(el("div", "sub", "倉庫から付けかえる（" + GameData.JOBS[h.job].name + "が装備できる物）"));
        cand.sort(function (a, b) { return b.r - a.r || b.ilv - a.ilv; }).forEach(function (x) {
          var row = itemLine(x);
          // 付けかえたときの能力
          var save = h.equip[slot]; h.equip[slot] = x; var after = GameState.heroStats(h); h.equip[slot] = save;
          row.appendChild(diffNode(now, after));
          row.appendChild(button("装備する", function () {
            GameState.equipItem(h, x.id);
            var removed = GameState.fixSkills(h);
            say(x.name + "を装備した" + (removed.length ? "（「" + removed.join("」「") + "」は条件に合わなくなったので外した）" : ""));
            render();
          }));
          box.appendChild(row);
        });
      } else {
        box.appendChild(el("div", "sub", "倉庫に、" + GameData.JOBS[h.job].name + "が装備できる" + (slot === "weapon" ? "武器" : "防具") + "はない"));
      }
      bodyEl.appendChild(box);
    });
  }

  // ---------- 倉庫 ----------
  function renderStorage(g) {
    if (!g.storage.length) { bodyEl.appendChild(el("p", "", "倉庫は空っぽ。宝箱やお店で装備を手に入れよう。")); return; }
    bodyEl.appendChild(el("p", "sub", "いらない装備は、売る（ゴールド）か、分解する（鍛冶の素材）を選べる。"));
    g.storage.slice().sort(function (a, b) { return a.slot.localeCompare(b.slot) || b.r - a.r || b.ilv - a.ilv; }).forEach(function (it) {
      var row = itemLine(it);
      var who = g.party.filter(function (h) { return GameState.canEquip(h, it); }).map(function (h) { return h.name; });
      row.appendChild(el("span", "item-extra", who.length ? "装備できる：" + who.join("・") : "いまの3人は装備できない"));
      var p = GameState.sellPrice(it), m = GameState.matOf(it), n = GameState.dismantleCount(it);
      row.appendChild(button("売る（" + p + "G）", function () { var got = GameState.sell(it.id); say(it.name + "を売った（+" + got + "G）"); render(); }));
      row.appendChild(button("分解（" + Loot.MATERIALS[m] + "+" + n + "）", function () { var r = GameState.dismantle(it.id); say(it.name + "を分解した（" + Loot.MATERIALS[r.mat] + "+" + r.n + "）"); render(); }));
      bodyEl.appendChild(row);
    });
  }

  // ---------- お店 ----------
  function renderShop(g) {
    bodyEl.appendChild(el("h3", "", "道具（ダンジョンのメニューから使える。種類ごとに " + GameState.TOOL_MAX + "個まで）"));
    GameState.TOOL_ORDER.forEach(function (k) {
      var t = GameState.TOOLS[k];
      var row = el("div", "item-line");
      row.appendChild(el("span", "item-name", t.name + "　" + t.price + "G"));
      row.appendChild(el("span", "item-extra", t.note + "　持っている数 " + g.items[k]));
      [1, 5].forEach(function (n) {
        row.appendChild(button(n + "個買う", function () {
          if (!GameState.buyTool(k, n)) { say(g.gold < t.price * n ? "ゴールドが足りない" : "これ以上持てない"); return; }
          say(t.name + "を " + n + "個 買った"); render();
        }));
      });
      bodyEl.appendChild(row);
    });
    bodyEl.appendChild(el("h3", "", "ふつうの装備（ノーマル。いちばん深く行った階層の強さ）"));
    GameState.shopEquipList().forEach(function (it) {
      var price = GameState.itemValue(it);
      var row = itemLine(it);
      var who = g.party.filter(function (h) { return GameState.canEquip(h, it); }).map(function (h) { return h.name; });
      row.appendChild(el("span", "item-extra", who.length ? "装備できる：" + who.join("・") : "いまの3人は装備できない"));
      row.appendChild(button("買う（" + price + "G）", function () {
        if (!GameState.buyEquip(it)) { say(g.storage.length >= GameState.STORAGE_MAX ? "倉庫がいっぱい" : "ゴールドが足りない"); return; }
        say(it.name + "を買った（倉庫に入れた。「装備」で付けかえられる）"); render();
      }));
      bodyEl.appendChild(row);
    });
  }

  // ---------- 鍛冶屋 ----------
  function renderSmith(g) {
    bodyEl.appendChild(el("p", "sub", "強化は必ず成功する（＋1ごとに基本の強さ＋5%、＋10まで）。引き直しは、バフ・デバフを全部作りなおす（魔石" +
      GameState.REROLL.stone + "＋" + GameState.REROLL.gold + "G）。"));
    var all = GameState.allItems();
    if (!all.length) { bodyEl.appendChild(el("p", "", "強くできる装備がない。宝箱やお店で装備を手に入れよう。")); return; }
    all.sort(function (a, b) { return (b.who ? 1 : 0) - (a.who ? 1 : 0) || b.item.r - a.item.r; }).forEach(function (x) {
      var it = x.item, row = itemLine(it, x.who ? x.who.name + "が装備中" : "倉庫");
      if ((it.plus || 0) < 10) {
        var c = GameState.upgradeCost(it);
        row.appendChild(button("強化 ＋" + ((it.plus || 0) + 1) + "（" + Loot.MATERIALS[c.mat] + c.n + "＋" + c.gold + "G）", function () {
          if (!GameState.upgradeItem(it)) { say("素材かゴールドが足りない"); return; }
          say(it.name + "を ＋" + it.plus + " にした！"); render();
        }));
      } else row.appendChild(el("span", "item-extra", "＋10（いちばん上）"));
      row.appendChild(button("引き直し", function () {
        if (!GameState.rerollItem(it)) { say("魔石かゴールドが足りない"); return; }
        say(it.name + "のバフ・デバフを引き直した"); render();
      }));
      bodyEl.appendChild(row);
    });
  }

  return { open: open, close: close };
})();
