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
    moneyEl.textContent = g.gold + "G　鉱石 " + g.mat.iron + "　魔石 " + g.mat.stone + "　倉庫 " + g.storage.length + "/" + GameState.STORAGE_MAX;
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
          if (!GameState.unequip(h, slot)) { say("倉庫がいっぱいで、はずせない"); return; }
          say("はずして倉庫に入れた"); render();
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
            GameState.equipItem(h, x.id);
            var removed = GameState.fixSkills(h);
            say(Loot.label(x) + "を装備した" + (removed.length ? "（「" + removed.join("」「") + "」は条件に合わなくなったので外した）" : ""));
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
    [["iron", "剣・大剣・斧・弓・こて・よろい・服の強化に使う"], ["stone", "杖・ローブの強化と、バフ・デバフの引き直しに使う"]].forEach(function (m) {
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
        if (to.length && !window.confirm(Loot.label(it) + " の強化（＋" + it.plus + "）は、鍛冶屋の「強化を移す」で " + Loot.label(to[0].item) +
          (to.length > 1 ? " など" : "") + " に移せます。\n売却すると、強化は移せなくなります（強化に使った分の8割は、ゴールドと素材でもどります）。\n売却しますか？")) return;
        var r = GameState.release(it.id); if (!r) return;
        say(Loot.label(it) + "を売却した（+" + r.gold + "G" + (r.n ? "・" + Loot.MATERIALS[r.mat] + "+" + r.n : "") + "）"); render();
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
    [["up", "装備強化"], ["move", "強化を移す"]].forEach(function (t) {
      tabs.appendChild(button(t[1], function () { smithTab = t[0]; moveFrom = null; say(""); render(); }, "chip" + (smithTab === t[0] ? " sel" : "")));
    });
    bodyEl.appendChild(tabs);
    var all = GameState.allItems();
    if (!all.length) { bodyEl.appendChild(el("p", "", "強くできる装備がない。宝箱やお店で装備を手に入れよう。")); return; }
    all.sort(function (a, b) { return (b.who ? 1 : 0) - (a.who ? 1 : 0) || b.item.r - a.item.r || (b.item.plus || 0) - (a.item.plus || 0); });
    if (smithTab === "move") { renderMove(all); return; }
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
  function whereText(x) { return x.who ? x.who.name + "が装備中" : "倉庫"; }
  // 強化を移す：① 移すもと（強化してある装備）を選ぶ → ② 移す先（同じ種類で、＋が小さい装備）を選ぶ
  function renderMove(all) {
    bodyEl.appendChild(el("p", "sub", "強化した＋を、同じ種類の装備（剣なら剣、弓なら弓）にそのまま移せる。移したもとの装備はなくなる。" +
      "手数料は ＋1 ごとに 10G。"));
    if (moveFrom && !all.some(function (x) { return x.item === moveFrom; })) moveFrom = null;
    if (!moveFrom) {
      bodyEl.appendChild(el("h3", "", "① どの装備の強化を移す？"));
      // 移す先（同じ種類で、＋が小さい装備）がある装備だけを出す（2026-10-18 保護者の希望）
      var src = all.filter(function (x) { return (x.item.plus || 0) > 0 && GameState.transferTargets(x.item).length > 0; });
      if (!src.length) { bodyEl.appendChild(el("p", "sub", "強化を移せる装備がない。強化した装備と同じ種類の装備を手に入れると、ここで移せる。")); return; }
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
        if (!window.confirm(Loot.label(from) + " の強化を " + Loot.label(t.item) + " に移します。" + Loot.label(from) + " はなくなります。よいですか？")) return;
        var r = GameState.transferPlus(from, t.item);
        if (!r) { say("ゴールドが足りない"); return; }
        moveFrom = null;
        say(Loot.label(t.item) + "になった！" + (r.equipped ? "（" + r.equipped.name + "が装備した）" : "")); render();
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

    // スキルのセット
    var box = el("div", "slot");
    box.appendChild(el("h3", "", "スキル（覚えたスキルから3つ。いまの職業と武器の条件に合うものだけ）"));
    var wt = GameState.heroWeaponType(h);
    [0, 1, 2].forEach(function (i) {
      var row = el("div", "item-line");
      row.appendChild(el("span", "item-name", "スキル" + (i + 1)));
      var sel = el("select");
      var none = el("option", "", "（なし）"); none.value = ""; sel.appendChild(none);
      h.learned.forEach(function (id) {
        var sk = GameData.SKILL[id];
        if (!GameData.canSet(sk, h.job, wt)) return;
        var o = el("option", "", sk.name + "（MP" + sk.mp + "）"); o.value = id; if (h.set[i] === id) o.selected = true; sel.appendChild(o);
      });
      sel.addEventListener("change", function () { GameState.setSkill(h, i, sel.value || null); say("スキル" + (i + 1) + "を「" + (sel.value ? GameData.SKILL[sel.value].name : "なし") + "」にした"); render(); });
      row.appendChild(sel);
      var cur = h.set[i] && GameData.SKILL[h.set[i]];
      if (cur) row.appendChild(el("span", "item-extra", skillNote(cur)));
      box.appendChild(row);
    });
    // 覚えたスキルの一覧（セットできないものは理由つき）
    box.appendChild(el("div", "sub", "覚えたスキル"));
    h.learned.forEach(function (id) {
      var sk = GameData.SKILL[id], ok = GameData.canSet(sk, h.job, wt);
      var row = el("div", "item-line" + (ok ? "" : " dim-line"));
      row.appendChild(el("span", "item-name", GameData.JOBS[sk.job].name + "★" + sk.star + "　" + sk.name));
      row.appendChild(el("span", "item-extra", skillNote(sk) + (ok ? "" : "　→ いまはセットできない（" + GameData.condText(sk) + "）")));
      box.appendChild(row);
    });
    bodyEl.appendChild(box);
    renderEquip(g, true);
  }
  function skillNote(sk) { return "MP" + sk.mp + "・待ち" + (sk.once ? "1回の冒険で1回" : sk.ct + "秒") + (sk.cond ? "・条件：" + GameData.condText(sk) : "・条件なし"); }

  // ---------- 転職の神殿 ----------
  function renderJob(g) {
    var h = g.party[heroIdx];
    bodyEl.appendChild(heroTabs(g));
    bodyEl.appendChild(el("p", "sub", "基本職どうしは、いつでも転職できる。熟練度（★）は職業ごとに残る。レベルと、育った能力はそのまま。" +
      "レベルが上がるときの能力の伸び方は、そのときの職業で決まる。上級職は、職業を極めると開く（これから作る）。"));
    GameData.JOB_ORDER.forEach(function (j) {
      var J = GameData.JOBS[j], st = GameState.stars(h, j);
      var row = el("div", "item-line" + (j === h.job ? " cur-line" : ""));
      row.appendChild(el("span", "item-name", J.name + "　" + "★".repeat(st) + "☆".repeat(GameState.MAX_STAR - st)));
      var arms = J.weapons.map(function (w) { return GameData.WEAPONS[w].name; }).join("・") + "／" + GameData.ARMORS[J.armor].name;
      var gr = J.growth;
      row.appendChild(el("span", "item-extra", "装備：" + arms + "　伸びやすい：" + growthText(gr)));
      if (j === h.job) row.appendChild(el("span", "item-extra", "（いまの職業）"));
      else row.appendChild(button("転職する", function () {
        var r = GameState.changeJob(h, j);
        if (!r.ok) { say(r.why); return; }
        var t = h.name + "は" + J.name + "になった！";
        if (r.moved.length) t += "　装備できない「" + r.moved.join("」「") + "」は倉庫へ。";
        if (r.removed.length) t += "　スキル「" + r.removed.join("」「") + "」は条件に合わないので外した。";
        if (r.learned.length) t += "　スキル「" + r.learned.join("」「") + "」を覚えた！";
        say(t); render();
      }));
      bodyEl.appendChild(row);
    });
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
    Object.keys(GameData.BOSSES).forEach(function (f) {
      var t = GameData.BOSSES[f].title, got = g.titles.indexOf(t) >= 0;
      row3.appendChild(el("span", "chip-tag title" + (got ? " got" : ""), got ? "🏅 " + t : "？？？（" + f + "階のボス）"));
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
    ["ダンジョン", ["地図はいつも右上に出ている。メニューでは大きく見られる。", "鍵を拾うと、鍵のかかった扉が開く。奥の宝箱は、かならずR以上。",
      "毒の沼や落とし穴に気をつけよう。見えない罠もある。", "部屋の敵を全部たおすと、武器をしまって速く走れる。", "7階と14階には、ボスがいる。"]],
    ["装備と鍛冶屋", ["装備には、ふつう・R・SR・URがある。Rより上が出たらラッキー！",
      "鍛冶屋で鉱石・魔石を使うと、装備を強くできる（＋10まで、必ず成功）。", "鍛冶屋の「強化を移す」で、強化を同じ種類の装備に引きつげる。",
      "いらない装備は倉庫で売却すると、ゴールドと素材になる。"]],
    ["拠点", ["宿屋：仲間のようす・装備・スキルのセット", "お店：薬とふつうの装備を買う", "鍛冶屋：装備を強くする", "転職の神殿：職業を変える",
      "倉庫：装備・道具・素材を見る", "書庫：モンスター図鑑・装備図鑑・称号の棚"]],
    ["そだてる", ["敵をたおすと経験値がたまり、レベルが上がる。", "その職業で戦うと熟練度（★）がふえ、新しいスキルを覚える。",
      "★7 で職業を極めると、上級職への道が開く。"]]
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

  return { open: open, close: close };
})();
