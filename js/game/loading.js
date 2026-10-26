// ロード画面（Tips つき）と、1行ずつタップで読む知らせ（段階7-3。2026-10-18 保護者の案）。
// ・ロード画面：ダンジョンに入るとき・拠点に帰るときに出す。2秒たったら自動で次へ（タップでは飛ばさない）。
// ・1行ずつの知らせ：冒険の終わりのレベルアップ・熟練度・覚えたスキル。タップで次の行へ。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Loading = (function () {
  var WAIT_MS = 2000;

  // Tips（遊び方のページと同じ内容から。保護者があとで直す）
  var TIPS = [
    "弱点をつくと、大きなダメージ！ 書庫の図鑑で効き方をたしかめよう。",
    "金の宝箱は、かならずR以上。宝箱の鍵（銀）をさがそう。",
    "出口の扉には鍵がかかっている。出口の鍵（金）は、出口までの道のどこかにある。",
    "知恵の試練の正解が多いと、鉱石・魔石がたくさん手に入る。",
    "正解した教科ごとに、その冒険のあいだ加護がつく。",
    "MPは自然には回復しない。MP回復薬を忘れずに。",
    "弓と魔法の玉は、撃つ前後に少し止まる。近づかれる前に撃とう。",
    "部屋の敵を全部たおすと、武器をしまって速く走れる。",
    "見えない罠もある。一度ふむと地図に出る。",
    "落とし穴に落ちると、部屋の入口にもどされる。",
    "毒の沼に入ると毒になる。毒消しを持っていこう。",
    "部屋に生えている薬草をとると、みんなのHPが少し回復する。青いキノコはMP。",
    "宝玉があると、鍛冶屋で装備のレア度を上げられる。知恵の試練で4問正解すると、出やすい。",
    "強化は＋5くらいまでは安い。3人の装備を順番に強くしよう。",
    "鍛冶屋の「強化を移す」で、強化をむだにせず、同じ装備のレア度の高いものに乗りかえられる。",
    "いらない装備は倉庫で売却すると、ゴールドと素材になる。",
    "メニューを開くと、敵も時間も止まる。",
    "地図はいつも右上に出ている。メニューでは大きく見られる。",
    "ボスの大技は、地面が光って知らせてくれる。光ったら逃げよう。",
    "仲間を切りかえると、少しのあいだは切りかえられない。",
    "その職業で戦うと熟練度（★）がふえ、新しいスキルを覚える。",
    "パッシブスキルは、ほかの職で覚えたものもつけられる。いろいろな職を育てよう。",
    "職業を★7にすると、上級職になれる。騎士は槍も使える。",
    "2つの職を★5にすると、組み合わせの上級職になれる。忍者はどの武器でも戦える。",
    "R・SR・UR の装備が出たらラッキー！",
    "ボスの部屋の手前には、回復の泉がある。準備をととのえてから挑もう。",
    "7階には、群れの長がいるらしい……。",
    "14階の奥には、森の主がいるという……。",
    "原生の秘境は落とし穴が多い。足もとに気をつけよう。",
    "ワイルドボアの突進は、赤い線で知らせてくれる。岩や柱にぶつけると、すきができる。",
    "ダークウィスプは、消えて別の場所に現れる。出てきたところをねらおう。",
    "秘境の8階には、岩の番人がいるらしい……。",
    "秘境の15階の奥には、弓の名手がいるという……。"
  ];
  // ダンジョンごとの「うわさ」（2026-10-27 保護者の案）：敵の弱点のヒント。全部は言い切らず「〜らしい」にして、
  // 試して見つける楽しさを残す。そのダンジョンに入るときは、Tips よりうわさを多めに出す。文は Claude の仮の文（保護者があとで直す）
  var RUMORS = {
    forest1: [
      "つる草やキノコの魔物は、火をきらうらしい……",
      "ゴブリンの剣士は、たたく攻撃が苦手だとか……",
      "大きな蜂は、矢や槍で突くとよく効くらしい……",
      "森の主は、火をこわがっているという……"
    ],
    shouki: [
      "骸骨はかたいが、たたく攻撃でくだけるという……",
      "骸骨には、矢や槍がささりにくいらしい……",
      "瘴気の霊には、剣も弓もあまり効かないらしい。光が苦手だとか……",
      "毒ガエルは、剣で斬られるのが苦手らしい……",
      "沼の魔女は、光をきらうらしい……"
    ],
    hikyo: [
      "オオカミは、剣で斬られるのに弱いらしい……",
      "ダークウィスプには、剣も弓もこぶしもあまり効かないらしい。光が苦手だとか……",
      "岩の番人は、水をかけられるのをいやがるらしい……",
      "弓の名手は、矢や槍で突かれるのに弱いという……"
    ]
  };
  var RUMOR_RATE = 0.6;   // うわさを出す割合
  var lastTip = -1, lastRumor = "";
  function pickTip() {
    var i = Math.floor(Math.random() * TIPS.length);
    if (i === lastTip) i = (i + 1) % TIPS.length;
    lastTip = i;
    return TIPS[i];
  }
  // { head, text }：dungeon にうわさがあれば、RUMOR_RATE の割合でうわさ（同じものは続けない）
  function pickHint(dungeon) {
    var list = dungeon && RUMORS[dungeon];
    if (list && list.length && Math.random() < RUMOR_RATE) {
      var j = Math.floor(Math.random() * list.length);
      if (list[j] === lastRumor) j = (j + 1) % list.length;
      lastRumor = list[j];
      return { head: "うわさ", text: list[j] };
    }
    return { head: "Tips", text: pickTip() };
  }

  var box = null;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function make() {
    if (box) return box;
    box = el("div", "load-screen");
    box.hidden = true;
    document.body.appendChild(box);
    return box;
  }

  // ロード画面：title（例「新緑の樹海 3階へ」）を出して、2秒たったら then()。dungeon：入るダンジョン（うわさを出す）
  function show(title, then, dungeon) {
    var hint = pickHint(dungeon);
    var b = make(); b.textContent = "";
    var inner = el("div", "load-inner");
    inner.appendChild(el("h2", "load-title", title));
    var tip = el("div", "load-tip");
    tip.appendChild(el("div", "load-tip-head", hint.head));
    tip.appendChild(el("p", "", hint.text));
    inner.appendChild(tip);
    var dots = el("div", "load-dots");
    for (var i = 0; i < 3; i++) dots.appendChild(el("span", ""));
    inner.appendChild(dots);
    b.appendChild(inner);
    b.onclick = null;
    b.hidden = false;
    setTimeout(function () { b.hidden = true; if (then) then(); }, WAIT_MS);
  }

  // 1行ずつの知らせ：lines（文の配列）を1行ずつ出し、最後の行のあとのタップで then()
  // 行は { text, sound } でもよい（sound はその行を出したときの効果音）
  function lines(list, title, then) {
    list = (list || []).filter(function (x) { return x; });
    if (!list.length) { if (then) then(); return; }
    var b = make(); b.textContent = "";
    var inner = el("div", "load-inner msg-inner");
    if (title) inner.appendChild(el("h2", "load-title", title));
    var log = el("div", "msg-log");
    inner.appendChild(log);
    var hint = el("p", "msg-hint", "タップで次へ");
    inner.appendChild(hint);
    b.appendChild(inner);
    var i = 0, ready = false;
    function next() {
      if (i >= list.length) { b.onclick = null; b.hidden = true; if (then) then(); return; }
      var item = typeof list[i] === "string" ? { text: list[i] } : list[i];
      log.appendChild(el("div", "msg-line", item.text));
      if (item.sound && window.Sound) Sound.play(item.sound);
      i++;
      if (i >= list.length) hint.textContent = "タップで " + GameState.baseName() + " へ";
      // 押しっぱなしで一気に進まないように、少しだけ間をあける
      ready = false; setTimeout(function () { ready = true; }, 250);
    }
    b.onclick = function () { if (ready) next(); };
    b.hidden = false;
    next();
  }

  return { show: show, lines: lines, TIPS: TIPS, RUMORS: RUMORS };
})();
