// 拠点のメニューの中身：宿屋（仲間・装備・スキル）・倉庫・お店・鍛冶屋（段階5-2①）、転職の神殿・図鑑・遊び方（段階5-2②）。
// どれも拠点の上に重ねる画面（#town）で開き、「拠点にもどる」で閉じる。数字やしくみは state.js。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Town = (function () {
  var townEl = document.getElementById("town");
  var titleEl = document.getElementById("townTitle");
  var moneyEl = document.getElementById("townMoney");
  var bodyEl = document.getElementById("townBody");
  var noteEl = document.getElementById("townNote");
  var current = null, heroIdx = 0, storageTab = "equip";

  var NAMES = { party: "宿屋（仲間・装備・スキル）", equip: "装備", storage: "倉庫", shop: "お店", smith: "鍛冶屋", job: "転職の神殿", book: "書庫（図鑑）", help: "遊び方" };

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
    moneyEl.textContent = g.gold + "G　鉱石 " + g.mat.iron + "　魔石 " + g.mat.stone + "　宝玉 " + (g.mat.gem || 0) + "　倉庫 " + g.storage.length + "/" + GameState.STORAGE_MAX;
    bodyEl.textContent = "";
    if (current === "equip") renderEquip(g);
    if (current === "party") renderParty(g);
    if (current === "job") renderJob(g);
    if (current === "book") renderBook(g);
    if (current === "help") renderHelp();
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
  function renderEquip(g, noTabs) {
    var h = g.party[heroIdx];
    if (!noTabs) bodyEl.appendChild(heroTabs(g));
    var now = GameState.heroStats(h);
    if (!noTabs) bodyEl.appendChild(el("p", "stat-now", statText(now)));
    ["weapon", "armor"].forEach(function (slot) {
      var box = el("div", "slot");
      box.appendChild(el("h3", "", slot === "weapon" ? "武器" : "防具"));
      var it = h.equip[slot];
      if (it) {
        box.appendChild(itemLine(it));
        box.appendChild(button("はずす（倉庫へ）", function () {
          var r0 = GameState.unequip(h, slot);
          if (!r0) { say("倉庫がいっぱいで、はずせない"); return; }
          say("はずして倉庫に入れた" + skillNote(r0)); render();
        }));
      } else {
        var starter = slot === "weapon" ? GameData.WEAPONS[GameState.starterWeapon(h.job)].starter : GameData.STARTER_ARMORS[GameData.JOBS[h.job].armor].name;
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
            var r1 = GameState.equipItem(h, x.id);
            say(Loot.label(x) + "を装備した" + (r1 ? skillNote(r1) : ""));
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

  // ---------- 倉庫（「装備」と「道具」のタブ。2026-10-18 保護者の案） ----------
  function renderStorage(g) {
    var tabs = el("div", "tabs");
    [["equip", "装備（" + g.storage.length + "）"], ["tools", "道具・素材"]].forEach(function (t) {
      tabs.appendChild(button(t[1], function () { storageTab = t[0]; say(""); render(); }, "chip" + (storageTab === t[0] ? " sel" : "")));
    });
    bodyEl.appendChild(tabs);
    if (storageTab === "tools") { renderToolBag(g); return; }
    renderStorageEquip(g);
  }
  function renderToolBag(g) {
    var box = el("div", "slot");
    box.appendChild(el("h3", "", "道具（ダンジョンのメニューから使える）"));
    var any = false;
    GameState.TOOL_ORDER.forEach(function (k) {
      var t = GameState.TOOLS[k], n = g.items[k] || 0;
      if (!n) return;
      any = true;
      var row = el("div", "item-line");
      row.appendChild(el("span", "item-name", t.name + "　×" + n));
      row.appendChild(el("span", "item-extra", t.note));
      box.appendChild(row);
    });
    if (!any) box.appendChild(el("p", "sub", "道具を持っていない。お店で買えるほか、宝箱や敵から手に入ることもある。"));
    bodyEl.appendChild(box);
    var mbox = el("div", "slot");
    mbox.appendChild(el("h3", "", "素材（鍛冶屋で装備を強くする）"));
    [["iron", "剣・大剣・斧・弓・こて・よろい・服の強化に使う"], ["stone", "杖・ローブの強化と、バフ・デバフの引き直しに使う"],
     ["gem", "鍛冶屋で装備のレア度を上げる。知恵の試練（3問以上の正解）・金の宝箱・ボスから、ときどき手に入る"]].forEach(function (m) {
      var row = el("div", "item-line");
      row.appendChild(el("span", "item-name", Loot.MATERIALS[m[0]] + "　×" + (g.mat[m[0]] || 0)));
      row.appendChild(el("span", "item-extra", m[1]));
      mbox.appendChild(row);
    });
    bodyEl.appendChild(mbox);
  }
  function renderStorageEquip(g) {
    if (!g.storage.length) { bodyEl.appendChild(el("p", "", "倉庫は空っぽ。宝箱やお店で装備を手に入れよう。")); return; }
    bodyEl.appendChild(el("p", "sub", "いらない装備は売却すると、ゴールドと鍛冶の素材になる（強化してあれば、強化に使った分の8割ももどる）。"));
    g.storage.slice().sort(function (a, b) { return a.slot.localeCompare(b.slot) || b.r - a.r || b.ilv - a.ilv; }).forEach(function (it) {
      var row = itemLine(it);
      var who = g.party.filter(function (h) { return GameState.canEquip(h, it); }).map(function (h) { return h.name; });
      row.appendChild(el("span", "item-extra", who.length ? "装備できる：" + who.join("・") : "いまの3人は装備できない"));
      var v = GameState.releaseValue(it);
      row.appendChild(button("売却（+" + v.gold + "G" + (v.n ? "・" + Loot.MATERIALS[v.mat] + "+" + v.n : "") + "）", function () {
        // 強化してあって、同じ種類の装備に移せるときは、売る前に確かめる（2026-10-18 保護者の希望）
        var to = (it.plus || 0) > 0 ? GameState.transferTargets(it) : [];
        function sellNow() {
          var r = GameState.release(it.id); if (!r) return;
          say(Loot.label(it) + "を売却した（+" + r.gold + "G" + (r.n ? "・" + Loot.MATERIALS[r.mat] + "+" + r.n : "") + "）"); render();
        }
        if (!to.length) { sellNow(); return; }
        Dialog.confirm(Loot.label(it) + " の強化（＋" + it.plus + "）は、鍛冶屋の「強化を移す」で " + Loot.label(to[0].item) +
          (to.length > 1 ? " など" : "") + " に移せます。\n売却すると、強化は移せなくなります（強化に使った分の8割は、ゴールドと素材でもどります）。\n売却しますか？",
          sellNow, null, { yes: "売却する", no: "売却しない" });
      }));
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
    bodyEl.appendChild(el("h3", "", "ふつうの装備（いちばん深く行った階層の強さ）"));
    GameState.shopEquipList().forEach(function (it) {
      var price = GameState.itemValue(it);
      var row = itemLine(it);
      var who = g.party.filter(function (h) { return GameState.canEquip(h, it); }).map(function (h) { return h.name; });
      row.appendChild(el("span", "item-extra", who.length ? "装備できる：" + who.join("・") : "いまの3人は装備できない"));
      row.appendChild(button("買う（" + price + "G）", function () {
        if (!GameState.buyEquip(it)) { say(g.storage.length >= GameState.STORAGE_MAX ? "倉庫がいっぱい" : "ゴールドが足りない"); return; }
        say(Loot.label(it) + "を買った（倉庫に入れた。「装備」で付けかえられる）"); render();
      }));
      bodyEl.appendChild(row);
    });
  }

  // ---------- 鍛冶屋 ----------
  // 鍛冶屋は「装備強化」と「強化を移す」のタブに分ける（2026-10-18 保護者の案）
  var smithTab = "up", moveFrom = null;
  function renderSmith(g) {
    var tabs = el("div", "tabs");
    [["up", "装備強化"], ["move", "強化を移す"], ["rare", "レア度を上げる"]].forEach(function (t) {
      tabs.appendChild(button(t[1], function () { smithTab = t[0]; moveFrom = null; say(""); render(); }, "chip" + (smithTab === t[0] ? " sel" : "")));
    });
    bodyEl.appendChild(tabs);
    var all = GameState.allItems();
    if (!all.length) { bodyEl.appendChild(el("p", "", "強くできる装備がない。宝箱やお店で装備を手に入れよう。")); return; }
    all.sort(function (a, b) { return (b.who ? 1 : 0) - (a.who ? 1 : 0) || b.item.r - a.item.r || (b.item.plus || 0) - (a.item.plus || 0); });
    if (smithTab === "move") { renderMove(all); return; }
    if (smithTab === "rare") { renderRarityUp(all, g); return; }
    bodyEl.appendChild(el("p", "sub", "強化は必ず成功する（＋1ごとにもとの強さ＋" + Math.round(Loot.PLUS_STEP * 100) + "%、＋" + Loot.PLUS_MAX + "まで）。" +
      "引き直しは、バフ・デバフを全部作りなおす（魔石" + GameState.REROLL.stone + "＋" + GameState.REROLL.gold + "G）。"));
    all.forEach(function (x) {
      var it = x.item, row = itemLine(it, whereText(x));
      if ((it.plus || 0) < Loot.PLUS_MAX) {
        var c = GameState.upgradeCost(it);
        row.appendChild(button("強化 ＋" + ((it.plus || 0) + 1) + "（" + Loot.MATERIALS[c.mat] + c.n + "＋" + c.gold + "G）", function () {
          if (!GameState.upgradeItem(it)) { say("素材かゴールドが足りない"); return; }
          say(Loot.label(it) + "にした！"); render();
        }));
      } else row.appendChild(el("span", "item-extra", "＋" + Loot.PLUS_MAX + "（いちばん上）"));
      row.appendChild(button("引き直し", function () {
        if (!GameState.rerollItem(it)) { say("魔石かゴールドが足りない"); return; }
        say(Loot.label(it) + "のバフ・デバフを引き直した"); render();
      }));
      bodyEl.appendChild(row);
    });
  }
  // レア度を上げる（2026-10-20）：宝玉とゴールドで1段ずつ（ノーマル→R→SR→UR）。強化の＋はそのまま
  function renderRarityUp(all, g) {
    bodyEl.appendChild(el("p", "sub", "宝玉とゴールドで、装備のレア度を1段上げる（ノーマル→R→SR→UR）。強化の＋はそのまま。" +
      "もとの強さとバフ（＋のおまけ）が、上がったレア度に合わせてふえる。UR になると、デバフ（−のおまけ）は消える。いま宝玉 " + (g.mat.gem || 0) + "こ。"));
    var any = false;
    all.forEach(function (x) {
      var it = x.item, c = GameState.rarityUpCost(it);
      if (!c) return;
      any = true;
      var row = itemLine(it, whereText(x));
      var next = Loot.RARITY[it.r + 1].tag;
      row.appendChild(button(next + " にする（宝玉" + c.gem + "＋" + c.gold + "G）", function () {
        if (!GameState.rarityUp(it)) { say("宝玉かゴールドが足りない"); return; }
        say(Loot.label(it) + "にした！"); render();
      }));
      bodyEl.appendChild(row);
    });
    if (!any) bodyEl.appendChild(el("p", "", "レア度を上げられる装備がない（UR はいちばん上）。"));
  }
  function whereText(x) { return x.who ? x.who.name + "が装備中" : "倉庫"; }
  // 強化を移す：① 移すもと（強化してある装備）を選ぶ → ② 移す先（同じ種類で、＋が小さい装備）を選ぶ
  function renderMove(all) {
    bodyEl.appendChild(el("p", "sub", "強化した＋を、同じ装備のレア度ちがい（たとえば 銅の剣 → 銅の剣〈SR〉）にそのまま移せる。" +
      "ちがう装備（銅の剣 → 銅の大剣、銅の剣 → 鉄の剣）には移せない。移したもとの装備はなくなる。手数料は ＋1 ごとに 10G。"));
    if (moveFrom && !all.some(function (x) { return x.item === moveFrom; })) moveFrom = null;
    if (!moveFrom) {
      bodyEl.appendChild(el("h3", "", "① どの装備の強化を移す？"));
      // 移す先（同じ種類で、＋が小さい装備）がある装備だけを出す（2026-10-18 保護者の希望）
      var src = all.filter(function (x) { return (x.item.plus || 0) > 0 && GameState.transferTargets(x.item).length > 0; });
      if (!src.length) { bodyEl.appendChild(el("p", "sub", "強化を移せる装備がない。強化した装備と同じ装備（レア度ちがい）を手に入れると、ここで移せる。")); return; }
      src.forEach(function (x) {
        var it = x.item, row = itemLine(it, whereText(x));
        row.appendChild(button("これを移す", function () { moveFrom = it; say(""); render(); }));
        bodyEl.appendChild(row);
      });
      return;
    }
    var from = moveFrom, cost = GameState.transferCost(from);
    bodyEl.appendChild(el("h3", "", "① 移すもと"));
    var fr = itemLine(from, "＋" + from.plus + " を移す");
    fr.appendChild(button("選びなおす", function () { moveFrom = null; say(""); render(); }));
    bodyEl.appendChild(fr);
    bodyEl.appendChild(el("h3", "", "② どの装備に移す？（手数料 " + cost + "G）"));
    GameState.transferTargets(from).forEach(function (t) {
      var row = itemLine(t.item, whereText(t));
      row.appendChild(button("ここに移す", function () {
        Dialog.confirm(Loot.label(from) + " の強化を " + Loot.label(t.item) + " に移します。\n" + Loot.label(from) + " はなくなります。よいですか？", function () {
          var r = GameState.transferPlus(from, t.item);
          if (!r) { say("ゴールドが足りない"); return; }
          moveFrom = null;
          say(Loot.label(t.item) + "になった！" + (r.equipped ? "（" + r.equipped.name + "が装備した）" : "")); render();
        }, null, { yes: "移す" });
      }));
      bodyEl.appendChild(row);
    });
  }

  // ---------- 宿屋：仲間のようす・装備・スキル ----------
  function renderParty(g) {
    var h = g.party[heroIdx];
    bodyEl.appendChild(heroTabs(g));
    var top = el("div", "hero");
    var fc = el("canvas", "face"), dpr = window.devicePixelRatio || 1;
    fc.width = 56 * dpr; fc.height = 56 * dpr; fc.style.width = "56px"; fc.style.height = "56px";
    var fx = fc.getContext("2d"); fx.imageSmoothingEnabled = false; Faces.draw(fx, h.face, 0, 0, 56 * dpr);
    top.appendChild(fc);
    var info = el("div", "hero-info");
    var st = GameState.stars(h);
    info.appendChild(el("div", "hero-name", h.name + "　" + GameData.JOBS[h.job].name + "　" + "★".repeat(st) + "☆".repeat(GameState.MAX_STAR - st) + "　Lv " + h.level));
    info.appendChild(el("div", "hero-stats", statText(GameState.heroStats(h))));
    info.appendChild(el("div", "hero-stats", "筋力 " + Math.floor(h.base.str) + "　体力 " + Math.floor(h.base.vit) + "　魔力 " + Math.floor(h.base.mag) + "　知力 " + Math.floor(h.base.int)));
    top.appendChild(info);
    bodyEl.appendChild(top);

    // 宿屋の中のタブ：「装備」「アクティブ」「パッシブ」（2026-10-19 保護者の案。横長の画面で、左に名前・右にくわしく）
    var tabs = el("div", "tabs");
    [["equip", "装備"], ["active", "アクティブスキル"], ["passive", "パッシブスキル"], ["training", "訓練場"]].forEach(function (t) {
      tabs.appendChild(button(t[1], function () { innTab = t[0]; say(""); render(); }, "chip" + (innTab === t[0] ? " sel" : "")));
    });
    bodyEl.appendChild(tabs);
    if (innTab === "equip") { renderEquip(g, true); return; }
    if (innTab === "training") { renderTraining(); return; }
    renderSkillTab(h, innTab === "passive");
  }

  // ---------- 宿屋：訓練場（2026-10-21 保護者の案） ----------
  // 武器の強さやスキルをためす部屋。まんなかにゴブリンの形の像（木・石・銅）、すみに回復の泉。
  // 像は攻撃してくるかを選べる。属性ごとの効き方（弱点・ふつう・半減・無効）も選べる。経験値やお金はもらえない。
  var STATUES = [["statue_wood", "木像", "ゴブリンの剣士の 1階くらい"], ["statue_stone", "石像", "8階くらい"], ["statue_bronze", "銅像", "15階くらい（瘴気の森 1階）"]];
  var RES_STEPS = [[1.5, "弱点"], [1, "ふつう"], [0.5, "半減"], [0, "無効"]];
  function trainCfg() {
    var c = null;
    try { c = JSON.parse(localStorage.getItem("bd-training") || "null"); } catch (e) { c = null; }
    if (!c || typeof c !== "object") c = {};
    if (!GameData.ENEMIES[c.type] || !GameData.ENEMIES[c.type].training) c.type = "statue_wood";
    c.attack = !!c.attack;
    if (!c.res || typeof c.res !== "object") c.res = {};
    return c;
  }
  function saveTrainCfg(c) { try { localStorage.setItem("bd-training", JSON.stringify(c)); } catch (e) { /* そのまま */ } }
  function renderTraining() {
    var cfg = trainCfg();
    function set(fn) { fn(cfg); saveTrainCfg(cfg); render(); }
    var box = el("div", "slot");
    box.appendChild(el("h3", "", "訓練場"));
    box.appendChild(el("p", "note", "今の3人の装備とスキルで入る。まんなかの像を攻撃して、武器やスキルの強さをたしかめる部屋。HP と MP は本当に減り、部屋のすみの回復の泉にふれると全快する。像はこわれても、すぐに元にもどる。経験値・お金・素材はもらえず、道具は使えない。メニューの「訓練場を出る」で宿屋にもどる。"));

    box.appendChild(el("div", "train-head", "像"));
    var r1 = el("div", "chips");
    STATUES.forEach(function (s) {
      r1.appendChild(button(s[1] + "（" + s[2] + "）", function () { set(function (c) { c.type = s[0]; }); }, "chip" + (cfg.type === s[0] ? " sel" : "")));
    });
    box.appendChild(r1);

    box.appendChild(el("div", "train-head", "像の攻撃"));
    var r2 = el("div", "chips");
    [[false, "攻撃してこない（動かない）"], [true, "攻撃してくる（ゴブリンの剣士と同じ）"]].forEach(function (a) {
      r2.appendChild(button(a[1], function () { set(function (c) { c.attack = a[0]; }); }, "chip" + (cfg.attack === a[0] ? " sel" : "")));
    });
    box.appendChild(r2);

    box.appendChild(el("div", "train-head", "属性の効き方"));
    Object.keys(GameData.ELEMENTS).forEach(function (k) {
      if (k === "none") return;
      var row = el("div", "chips train-res");
      row.appendChild(el("span", "train-elem", GameData.ELEMENTS[k]));
      var cur = cfg.res[k] === undefined ? 1 : cfg.res[k];
      RES_STEPS.forEach(function (r) {
        row.appendChild(button(r[1], function () { set(function (c) { if (r[0] === 1) delete c.res[k]; else c.res[k] = r[0]; }); }, "chip" + (cur === r[0] ? " sel" : "")));
      });
      box.appendChild(row);
    });
    box.appendChild(button("ぜんぶ「ふつう」にもどす", function () { set(function (c) { c.res = {}; }); }));

    var go = button("訓練場に入る", function () {
      townEl.hidden = true;
      Adventure.startTraining(trainCfg());
    }, "big");
    go.style.marginTop = "12px";
    box.appendChild(el("div", "", "")).appendChild(go);
    bodyEl.appendChild(box);
  }
  // 訓練場から出たとき：宿屋の訓練場のタブを開く
  function openTraining() { innTab = "training"; open("party"); }

  var innTab = "equip", selSkill = { active: null, passive: null }, selSlot = { active: 0, passive: 0 }, onlyUsable = true;
  // 装備・転職でスキルが変わったときの知らせ（2026-10-22）
  function skillNote(r) {
    var t = "";
    if (r.removed && r.removed.length) t += "　スキル「" + r.removed.join("」「") + "」は条件に合わないので外した。";
    if (r.added && r.added.length) t += "　スキル「" + r.added.join("」「") + "」をセットした。";
    return t;
  }
  // アクティブの枠：セットA（スキル1〜3）と、使えるならセットB（2026-10-22）
  function slotsOf(h, passive) { return passive ? h.pset : GameState.activeSlots(h); }
  function slotName(passive, i) {
    if (passive) return "パッシブ" + (i + 1);
    var h = GameState.get().party[heroIdx];
    if (!h.setsOpen) return "スキル" + (i + 1);
    return (i < 3 ? "A" : "B") + "-スキル" + (i % 3 + 1);
  }

  // スキルのセット（2026-10-20 保護者の案）：右の上でセットする枠を選んでから、左でスキルを選ぶ。
  // 右（枠とくわしい説明）は、左の一覧をスクロールしても見えたまま
  function renderSkillTab(h, passive) {
    var key = passive ? "passive" : "active";
    var wt = GameState.heroWeaponType(h), slots = slotsOf(h, passive);
    if (selSlot[key] >= slots.length) selSlot[key] = 0;
    var si = selSlot[key];

    // 左：名前だけの一覧（職ごと）
    var wrap = el("div", "sk-wrap");
    var list = el("div", "sk-list");
    var tg = el("label", "sk-filter"), cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = onlyUsable;
    cb.addEventListener("change", function () { onlyUsable = cb.checked; render(); });
    tg.appendChild(cb); tg.appendChild(document.createTextNode(" いまセットできるスキルだけ出す"));
    list.appendChild(tg);
    var shown = [];
    GameData.JOB_ORDER.concat(GameData.UPPER_ORDER).forEach(function (job) {
      var items = GameData.SKILLS.filter(function (sk) {
        if (sk.job !== job || !!sk.passive !== passive) return false;
        var got = h.learned.indexOf(sk.id) >= 0;
        if (onlyUsable) return got && GameData.canSet(sk, h.job, wt);
        return got || job === h.job;
      });
      if (!items.length) return;
      list.appendChild(el("div", "sk-job", GameData.JOBS[job].name));
      var grid = el("div", "sk-grid");
      items.forEach(function (sk) {
        var got = h.learned.indexOf(sk.id) >= 0, ok = got && GameData.canSet(sk, h.job, wt);
        var at = slots.indexOf(sk.id);
        // セット中は、色をつけずに「E」の印だけ（RPG の「装備中」。2026-10-19 保護者が決定）
        var b = button(sk.name, function () { selSkill[key] = sk.id; render(); },
          "sk-item" + (selSkill[key] === sk.id ? " sel" : "") + (got ? (ok ? "" : " ng") : " locked"));
        if (at >= 0) { var mk = el("span", "sk-mark", "E"); b.insertBefore(mk, b.firstChild); }
        grid.appendChild(b);
        shown.push(sk.id);
      });
      list.appendChild(grid);
    });
    if (!shown.length) list.appendChild(el("p", "sub", onlyUsable ? "いまセットできるスキルがない。上のチェックを外すと、全部出る。" :
      passive ? "まだパッシブスキルを覚えていない。" : "まだスキルを覚えていない。"));
    wrap.appendChild(list);

    // 右：セットする枠と、選んだスキルのくわしい説明
    var side = el("div", "sk-side");
    var slotBox = el("div", "sk-slots");
    slotBox.appendChild(el("div", "sk-slots-head", passive ? "① セットする枠を選ぶ（いつも効く）" :
      h.setsOpen ? "① セットする枠を選ぶ（はじめはセットA。たたかいの中の「セット」ボタンでセットBと入れかわる）" : "① セットする枠を選ぶ（ボタンで使う）"));
    if (!passive && !h.setsOpen) slotBox.appendChild(el("p", "sub", "上級職になれるようになると、セットB（もう3つ）が使えるようになる。"));
    slots.forEach(function (id, i) {
      if (!passive && h.setsOpen && i === 3) slotBox.appendChild(el("div", "sk-slots-gap", ""));
      var b = el("button", "btn sk-slot" + (i === si ? " sel" : "") + (id ? "" : " empty")); b.type = "button";
      b.appendChild(el("span", "sk-slot-no", slotName(passive, i)));
      b.appendChild(el("span", "sk-slot-name", id ? GameData.SKILL[id].name : "空き"));
      b.addEventListener("click", function () { selSlot[key] = i; if (id) selSkill[key] = id; say(""); render(); });
      slotBox.appendChild(b);
    });
    side.appendChild(slotBox);

    if (shown.indexOf(selSkill[key]) < 0 && !(selSkill[key] && slots.indexOf(selSkill[key]) >= 0)) selSkill[key] = null;
    var det = el("div", "sk-detail");
    var sk = selSkill[key] && GameData.SKILL[selSkill[key]];
    if (!sk) det.appendChild(el("p", "sub", "② 左のスキルを押すと、ここにくわしく出る。"));
    else {
      var got = h.learned.indexOf(sk.id) >= 0, ok = got && GameData.canSet(sk, h.job, wt);
      det.appendChild(el("div", "sk-name", sk.name));
      det.appendChild(el("div", "sk-kind", (sk.passive ? "パッシブ（セットしておくと、いつも効く）" : "アクティブ（ボタンを押して使う）")));
      det.appendChild(el("p", "sk-desc", sk.desc || ""));
      var info = el("div", "sk-info");
      var line = function (k, v) { var d = el("div", "sk-line"); d.appendChild(el("span", "sk-k", k)); d.appendChild(el("span", "sk-v", v)); info.appendChild(d); };
      line("覚える", GameData.JOBS[sk.job].name + (sk.star === 1 ? "になったとき" : "の★" + (sk.star - 1)));
      if (!sk.passive) {
        line("MP", String(sk.mp));
        line("待ち", sk.once ? "1回の冒険で1回" : sk.ct + "秒");
      }
      line("条件", GameData.condText(sk) + (sk.passive ? "（ほかの職でもつけられる）" : ""));
      det.appendChild(info);
      if (!got) det.appendChild(el("p", "sk-why", GameData.JOBS[sk.job].name + "の熟練度が★" + (sk.star - 1) + "になると覚える。"));
      else if (!ok) det.appendChild(el("p", "sk-why", "いまはセットできない（" + GameData.condText(sk) + "）"));
      else {
        var row = el("div", "sk-btns");
        var at = slots.indexOf(sk.id);
        if (at === si) row.appendChild(el("span", "sk-why ok", slotName(passive, si) + "にセット中"));
        else row.appendChild(button(slotName(passive, si) + "にセット", function () {
          var done = passive ? GameState.setPassive(h, si, sk.id) : GameState.setSkill(h, si, sk.id);
          say(done ? slotName(passive, si) + "を「" + sk.name + "」にした" : "セットできない");
          // 入れたら、次の空いている枠を選ぶ
          if (done) { var nx = slotsOf(h, passive).indexOf(null); if (nx >= 0) selSlot[key] = nx; }
          render();
        }, "small-btn sk-setbtn"));
        if (at >= 0) row.appendChild(button("外す", function () {
          if (passive) GameState.setPassive(h, at, null); else GameState.setSkill(h, at, null);
          selSlot[key] = at;
          say(slotName(passive, at) + "を外した"); render();
        }, "small-btn"));
        det.appendChild(row);
      }
    }
    side.appendChild(det);
    wrap.appendChild(side);
    bodyEl.appendChild(wrap);
  }

  // ---------- 転職の神殿 ----------
  // 転職の神殿：「基本職」「上級職」「最上級職」のタブ（2026-10-19 保護者の案）
  // 宿屋のスキルと同じ形：左に職の名前と★だけの一覧、右に選んだ職のくわしい説明（2026-10-19 保護者の案。横長の画面が前提）
  var jobTab = "base", selJob = { base: null, upper: null, top: null };
  function starText(st) { return "★".repeat(st) + "☆".repeat(GameState.MAX_STAR - st); }
  function renderJob(g) {
    var h = g.party[heroIdx];
    bodyEl.appendChild(heroTabs(g));
    var tabs = el("div", "tabs");
    [["base", "基本職"], ["upper", "上級職"], ["top", "最上級職"]].forEach(function (t) {
      tabs.appendChild(button(t[1], function () { jobTab = t[0]; say(""); render(); }, "chip" + (jobTab === t[0] ? " sel" : "")));
    });
    bodyEl.appendChild(tabs);
    var lead = { base: "基本職どうしは、いつでも転職できる。熟練度（★）は職業ごとに残る。",
                 upper: "上級職は、もとの職の★で開く。一本道はもとの職を★7、組み合わせは2つの職を★5。もとの職のスキルもセットできる。パッシブは3つまで。",
                 top: "最上級職は、上級職から一段上がる（これから作る）。" }[jobTab];
    bodyEl.appendChild(el("p", "sub", lead));
    var wrap = el("div", "sk-wrap"), list = el("div", "sk-list"), det = el("div", "sk-detail");
    if (jobTab === "base") jobBase(h, list, det);
    else if (jobTab === "upper") jobUpper(h, list, det);
    else jobTop(h, list, det);
    wrap.appendChild(list); wrap.appendChild(det);
    bodyEl.appendChild(wrap);
  }
  // 左の一覧の1つ：名前と、下に小さく★や印
  function jobItem(name, small, cls, fn) {
    var b = el("button", "btn sk-item job-item" + (cls ? " " + cls : "")); b.type = "button";
    b.appendChild(el("span", "job-item-name", name));
    if (small) b.appendChild(el("span", "job-item-small", small));
    b.addEventListener("click", fn);
    return b;
  }
  // 立ち絵（2026-10-20 保護者の案）：そのキャラの髪の色で、その職の前向きの絵と武器。16×24 の絵を4倍で
  function portrait(h, job) {
    var cv = el("canvas", "job-portrait"); cv.width = 24; cv.height = 30;
    var ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled = false;
    var w = job === h.job ? GameState.heroWeaponType(h) : GameState.starterWeapon(job), f = { x: 0, y: 1 };
    Sprites.drawHero(ctx, job, h.face, f, "stand", 12, 29);
    Sprites.drawWeapon(ctx, w, f, 12, 29, "hold");
    // まだなれない職は、黒いかげ（シルエット）だけ（2026-10-20 保護者の案）。なれるようになったら色つき
    if (!GameState.canBecome(h, job)) {
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = "#0b0f1a"; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.globalCompositeOperation = "source-over";
      cv.className += " locked";
    }
    return cv;
  }
  function detLine(det, k, v, cls) {
    var d = el("div", "sk-line"); d.appendChild(el("span", "sk-k", k)); d.appendChild(el("span", "sk-v" + (cls ? " " + cls : ""), v)); det.appendChild(d);
  }

  function jobBase(h, list, det) {
    if (!selJob.base) selJob.base = h.job;
    var grid = el("div", "sk-grid");
    GameData.JOB_ORDER.forEach(function (j) {
      var cls = selJob.base === j ? "sel" : "";
      var it = jobItem(GameData.JOBS[j].name, starText(GameState.stars(h, j)), cls, function () { selJob.base = j; say(""); render(); });
      if (j === h.job) { var nm = it.querySelector(".job-item-name"); nm.insertBefore(el("span", "sk-mark", "E"), nm.firstChild); }   // いまの職業は、宿屋と同じ「E」の印
      grid.appendChild(it);
    });
    list.appendChild(grid);
    var j = selJob.base, J = GameData.JOBS[j], st = GameState.stars(h, j), m = h.mastery[j] || 0;
    det.appendChild(portrait(h, j));
    det.appendChild(el("div", "sk-name", J.name));
    det.appendChild(el("div", "sk-kind", "基本職" + (j === h.job ? "　いまの職業" : "")));
    detLine(det, "熟練度", starText(st) + "　" + m + (st < GameState.MAX_STAR ? "（次の★まで " + ((st + 1) * GameState.starNeed(j) - m) + "）" : "（極めた！）"));
    detLine(det, "装備", J.weapons.map(function (w) { return GameData.WEAPONS[w].name; }).join("・") + "／" + GameData.ARMORS[J.armor].name);
    detLine(det, "伸びる", growthText(J.growth) + "（レベルが上がるとき）");
    jobSkillsAndButton(h, j, det);
  }
  // 覚えるスキル（覚えたものは明るく）と、転職のボタン
  function jobSkillsAndButton(h, j, det) {
    var J = GameData.JOBS[j];
    det.appendChild(el("div", "sk-k job-sk-head", "覚えるスキル"));
    var chips = el("div", "job-sk");
    GameData.SKILLS.filter(function (sk) { return sk.job === j; }).forEach(function (sk) {
      var got = h.learned.indexOf(sk.id) >= 0;
      chips.appendChild(el("span", "job-sk-chip" + (got ? " got" : "") + (sk.passive ? " pas" : ""), (sk.star === 1 ? "はじめ " : "★" + (sk.star - 1) + " ") + sk.name));
    });
    det.appendChild(chips);
    det.appendChild(el("p", "sk-kind", "黄色の名前はパッシブ。うすい名前は、まだ覚えていない。"));
    if (j === h.job) { det.appendChild(el("p", "sk-why ok", "いまの職業")); return; }
    if (!GameState.canBecome(h, j)) { det.appendChild(el("p", "sk-why", "まだなれない")); return; }
    var row = el("div", "sk-btns");
    row.appendChild(button(J.name + "に転職する", function () {
      var r = GameState.changeJob(h, j);
      if (!r.ok) { say(r.why); return; }
      var t = h.name + "は" + J.name + "になった！";
      if (r.moved.length) t += "　装備できない「" + r.moved.join("」「") + "」は倉庫へ。";
      if (r.removed.length) t += "　スキル「" + r.removed.join("」「") + "」は外した。";
      if (r.added && r.added.length) t += "　スキル「" + r.added.join("」「") + "」をセットした。";
      if (r.learned.length) t += "　スキル「" + r.learned.join("」「") + "」を覚えた！";
      say(t); render();
    }, "small-btn"));
    det.appendChild(row);
  }

  // 上級職：条件と、今の★（まだ転職はできない）
  function upperDone(h, u) { return u.need.every(function (n) { return GameState.stars(h, n[0]) >= n[1]; }); }
  function jobUpper(h, list, det) {
    var U = GameData.UPPER_JOBS;
    if (!selJob.upper) selJob.upper = U[0].name;
    [["一本道（もとの職を★7）", 1], ["組み合わせ（2つの職を★5）", 2]].forEach(function (grp) {
      list.appendChild(el("div", "sk-job", grp[0]));
      var grid = el("div", "sk-grid");
      U.filter(function (u) { return u.need.length === grp[1]; }).forEach(function (u) {
        var done = upperDone(h, u), made = !!u.id;
        var small = made && (h.mastery[u.id] || h.job === u.id) ? starText(GameState.stars(h, u.id)) : done ? (made ? "なれる！" : "条件そろった") : "まだ";
        var it = jobItem(u.name, small, (done ? "ready" : "wait") + (selJob.upper === u.name ? " sel" : ""), function () { selJob.upper = u.name; say(""); render(); });
        if (u.id && u.id === h.job) { var nm = it.querySelector(".job-item-name"); nm.insertBefore(el("span", "sk-mark", "E"), nm.firstChild); }
        grid.appendChild(it);
      });
      list.appendChild(grid);
    });
    var u = U.filter(function (x) { return x.name === selJob.upper; })[0] || U[0], done = upperDone(h, u);
    if (u.id) det.appendChild(portrait(h, u.id));   // 作った上級職だけ
    det.appendChild(el("div", "sk-name", u.name));
    det.appendChild(el("div", "sk-kind", "上級職（" + (u.need.length > 1 ? "組み合わせ" : "一本道") + "）　★1つに熟練度 " + GameState.STAR_NEED_UPPER));
    det.appendChild(el("p", "sk-desc", u.note));
    u.need.forEach(function (n, i) {
      var st = GameState.stars(h, n[0]);
      detLine(det, i ? "" : "条件", GameData.JOBS[n[0]].name + " ★" + n[1] + "（いま★" + st + "）" + (st >= n[1] ? " ✓" : ""), st >= n[1] ? "ok" : "");
    });
    detLine(det, "装備", u.arms);
    if (!u.id) { det.appendChild(el("p", "sk-why" + (done ? " ok" : ""), done ? "条件はそろった（この職は、これから作る）" : "まだなれない")); return; }
    var st2 = GameState.stars(h, u.id), m2 = h.mastery[u.id] || 0;
    detLine(det, "熟練度", starText(st2) + "　" + m2 + (st2 < GameState.MAX_STAR ? "（次の★まで " + ((st2 + 1) * GameState.starNeed(u.id) - m2) + "）" : "（極めた！）"));
    detLine(det, "パッシブ", "3つまでセットできる");
    jobSkillsAndButton(h, u.id, det);
  }
  function jobTop(h, list, det) {
    var T = GameData.TOP_JOBS;
    if (!selJob.top) selJob.top = T[0].name;
    var grid = el("div", "sk-grid");
    T.forEach(function (t) {
      grid.appendChild(jobItem(t.name, t.from + "から", "wait" + (selJob.top === t.name ? " sel" : ""), function () { selJob.top = t.name; say(""); render(); }));
    });
    list.appendChild(grid);
    var t = T.filter(function (x) { return x.name === selJob.top; })[0] || T[0];
    det.appendChild(el("div", "sk-name", t.name));
    det.appendChild(el("div", "sk-kind", "最上級職　★1つに熟練度 " + GameState.STAR_NEED_TOP));
    det.appendChild(el("p", "sk-desc", t.note));
    detLine(det, "条件", t.from + "を★5");
    det.appendChild(el("p", "sk-why", "まだなれない（最上級職は、これから作る）"));
  }
  function growthText(g) {
    var names = { str: "筋力", vit: "体力", mag: "魔力", int: "知力" };
    var keys = Object.keys(names).sort(function (a, b) { return g[b] - g[a]; });
    return keys.filter(function (k) { return g[k] >= 1.5; }).map(function (k) { return names[k]; }).join("・") || "どれも同じくらい";
  }

  // ---------- 書庫（図鑑） ----------
  function renderBook(g) {
    var ELEM = GameData.ELEMENTS, MARK = { weak: "弱点", normal: "ふつう", half: "いまひとつ", none: "無効" };
    var mbox = el("div", "slot");
    mbox.appendChild(el("h3", "", "モンスター図鑑"));
    Object.keys(GameData.ENEMIES).forEach(function (t) {
      var b = g.book.monsters[t], d = GameData.ENEMIES[t];
      if (d.training) return;   // 訓練場の像は図鑑に出さない
      var row = el("div", "item-line");
      if (!b || (!b.seen && !b.kills)) { row.appendChild(el("span", "item-name", "？？？")); row.appendChild(el("span", "item-extra", "まだ会っていない")); mbox.appendChild(row); return; }
      row.appendChild(el("span", "item-name", d.name + (d.boss ? "（ボス）" : "")));
      row.appendChild(el("span", "item-extra", "たおした数 " + (b.kills || 0)));
      var tried = Object.keys(b.tried || {});
      row.appendChild(el("span", "item-extra", tried.length ? "試した属性：" + tried.map(function (k) { return (k === "none" ? "属性なし" : ELEM[k]) + " " + MARK[b.tried[k]]; }).join("・") : "試した属性：まだない"));
      mbox.appendChild(row);
    });
    bodyEl.appendChild(mbox);

    var ibox = el("div", "slot");
    ibox.appendChild(el("h3", "", "装備図鑑（手に入れた種類）"));
    var row2 = el("div", "chips");
    Object.keys(GameData.WEAPONS).concat(Object.keys(GameData.ARMORS)).forEach(function (k) {
      var got = g.book.items.indexOf(k) >= 0;
      var name = Loot.typeName(k);
      row2.appendChild(el("span", "chip-tag" + (got ? " got" : ""), got ? name : "？？？"));
    });
    ibox.appendChild(row2);
    bodyEl.appendChild(ibox);

    var tbox = el("div", "slot");
    tbox.appendChild(el("h3", "", "称号の棚"));
    var row3 = el("div", "chips");
    // ダンジョンごと（開いていないダンジョンのボスは出さない）
    GameData.DUNGEON_ORDER.forEach(function (d) {
      if (!GameState.unlocked(d)) return;
      var dd = GameData.dungeonOf(d);
      Object.keys(dd.bosses).forEach(function (f) {
        var t = dd.bosses[f].title, got = g.titles.indexOf(t) >= 0;
        row3.appendChild(el("span", "chip-tag title" + (got ? " got" : ""), got ? "🏅 " + t : "？？？（" + dd.short + " " + f + "階のボス）"));
      });
    });
    tbox.appendChild(row3);
    bodyEl.appendChild(tbox);
  }

  // ---------- 遊び方（2026-10-18 書き直し。保護者があとで直す。Tips は loading.js） ----------
  var HELP = [
    ["1日の流れ", ["拠点で準備をする（装備・スキル・道具）。", "「森の門」から出て、ワールドマップで行きたいダンジョンと階を選ぶ。",
      "知恵の試練で4つの問いに答えると、ダンジョンの扉が開く。", "出口をめざして探検する。時間は決まっている（はじめは5分）。",
      "出口に着いたらクリア！ 時間切れや3人ともたおれたときも、拾った物と経験値は持ち帰れる（でも、次の階には進めない）。",
      "冒険に出られるのは、1日に2回まで。"]],
    ["知恵の試練", ["冒険に出るたびに、算数・国語・理科・社会の問いが1つずつ、新しく出る。まちがえても、答えればダンジョンに入れる。",
      "正解した教科ごとに、その冒険のあいだ「加護」がつく。算数は物攻、国語は魔攻、理科は物防と魔防、社会はHPとMPが、それぞれ＋10%。",
      "正解が多いほど、鉱石・魔石がたくさん手に入り、クリアのゴールドもふえる。"]],
    ["そうさ", ["iPad：左の十字キーで動く。右のボタンで「攻撃」「スキル」「切替」「メニュー」。",
      "パソコン：WASD か矢印で動く。J で攻撃、U・I・O でスキル、K で切替、Esc でメニュー。",
      "メニューを開いているあいだは、敵も時間も止まる。"]],
    ["たたかい", ["攻撃したあとは、足もとの黄色いバーがたまるまで、次の攻撃ができない。",
      "弓と魔法の玉は、ねらう間と撃ったあとに少し動けない。敵との間をよく見て撃とう。",
      "弱点をつくと「弱点！」と出て、大きなダメージになる。", "ボスの大技は、地面が光って知らせてくれる。光ったら逃げよう。",
      "MPは自然には回復しない。MP回復薬を持っていこう。", "仲間を切りかえると、少しのあいだ切りかえられない。",
      "たおれた仲間は、その冒険のあいだ使えない（復活薬で元気になる）。"]],
    ["ダンジョン", ["地図はいつも右上に出ている。メニューでは大きく見られる。", "出口の部屋の扉には鍵がかかっている。出口までの道のどこかにある出口の鍵（金）を拾うと開く（ボスの階は、ボスをたおすと出口が出る）。", "1つの階に1つ、金の宝箱がある。宝箱の鍵（銀）で開けられ、中身はかならずR以上。", "ボスの階では、ボスの部屋の手前に回復の泉がある（ふれると全員のHP・MPが全回復）。ボスの部屋で3人ともたおれても、1回だけ、ボスに挑んだときにもどってやり直せる。負けても、ボスのHPをけずった分だけチャレンジボーナスがもらえる。", "部屋に生えている薬草をとると、みんなのHPが少し回復する。青い魔力のキノコはMP（みんな満タンのときは、とらずに残る）。", "宝玉は、知恵の試練（4問正解だと出やすい）・金の宝箱・ボスから、ときどき手に入る。鍛冶屋の「レア度を上げる」で使う。",
      "毒の沼や落とし穴に気をつけよう。見えない罠もある。", "部屋の敵を全部たおすと、武器をしまって速く走れる。", "7階と14階には、ボスがいる。"]],
    ["装備と鍛冶屋", ["装備には、ふつう・R・SR・URがある。Rより上が出たらラッキー！",
      "鍛冶屋で鉱石・魔石を使うと、装備を強くできる（＋10まで、必ず成功）。", "鍛冶屋の「強化を移す」で、強化を同じ装備のレア度ちがい（銅の剣 → 銅の剣〈SR〉など）に引きつげる。",
      "いらない装備は倉庫で売却すると、ゴールドと素材になる。"]],
    ["拠点", ["宿屋：仲間のようす・装備・スキルのセット。訓練場で、武器やスキルの強さをためせる", "お店：薬とふつうの装備を買う", "鍛冶屋：装備を強くする", "転職の神殿：職業を変える",
      "倉庫：装備・道具・素材を見る", "書庫：モンスター図鑑・装備図鑑・称号の棚"]],
    ["そだてる", ["敵をたおすと経験値がたまり、レベルが上がる。", "その職業で戦うと熟練度（★）がふえ、新しいスキルを覚える。", "スキルは2種類：アクティブ（ボタンで使う。3つまで）と、パッシブ（セットしておくと、いつも効く。2つまで）。パッシブは、ほかの職で覚えたものもつけられる。",
      "★7 で職業を極めると、上級職（騎士・黒魔道士・スナイパー・修行僧・白魔道士）になれる。転職の神殿の「上級職」から。",
      "2つの職をどちらも★5にすると、組み合わせの上級職（魔法剣士・忍者・剣闘士・聖騎士・賢者）になれる。",
      "上級職は、もとの職のスキルもセットできる。パッシブは3つまで。★は少し上がりにくい。"]]
  ];
  function renderHelp() {
    HELP.forEach(function (sec) {
      var box = el("div", "slot");
      box.appendChild(el("h3", "", sec[0]));
      var ul = el("ul", "help-list");
      sec[1].forEach(function (t) { ul.appendChild(el("li", "", t)); });
      box.appendChild(ul);
      bodyEl.appendChild(box);
    });
  }

  return { open: open, close: close, openTraining: openTraining };
})();
