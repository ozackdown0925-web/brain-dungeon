// 仲間のドット絵（段階7-2b）。16×24 点。保護者の絵（横向きの戦士・正面の素体）をもとに、1点ずつの地図で描いた。
// 地図の1文字が1点。色は下の PAL（16色の DawnBringer の色が中心）。1〜4 は髪の色で、顔の番号で8色に変わる（顔グラフィックの髪の色に合わせる）。
// 正面はFF6のように少し上から見下ろした形（目は顔の下より、あごは平ら）。体は左右対称。
// 職業で変わるのは服と髪型だけ（顔と体の形は全員同じ）。男女どちらにも見えるように描く。
// 向き：down（前）・up（後ろ）・side（地図は左向き。絵にするときに右向きにする。左向きはさらに左右反転）。
// コマ：stand・walkA・walkB・attack・runA・runB。地図を少し書きかえて作る。描いた絵は覚えておく。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Sprites = (function () {
  var SW = 16, SH = 24;
  var cache = {};

  // 色
  var PAL = {
    A: "#140c1c",  // ふちどり
    B: "#dad45e", C: "#854c30", D: "#442434",   // 金・茶・こげ茶
    E: "#d2aa99", F: "#d27d2c",                 // 肌・肌の影（オレンジ）
    H: "#deeed6", I: "#597dce", J: "#30346d",   // 白・青・紺
    K: "#d04648",                               // 赤
    L: "#6a3a98", M: "#3a1a5a", N: "#9a5ad0",   // むらさき（魔法使い）
    O: "#2a5a2e", Q: "#4e8a40", R: "#7aaa4a",   // 緑（狩人）
    T: "#8595a1", U: "#c8ccd4",                 // 白い布の影（僧侶）
    V: "#a04a14", W: "#f8a040",                 // オレンジの道着（格闘家）
    // 上級職（2026-10-19）
    S: "#5a6078", X: "#5a1424", Y: "#2a1838", Z: "#8a2a4a",   // 鉄の影・暗い赤・黒むらさき・えんじ
    g: "#6a5038", h: "#9a7a50", s: "#3a4a3e"                  // 革（こげ茶・茶）・暗い緑
  };
  // 上級職の見た目：保護者がペイントで描いた絵（2026-10-20）を、そのまま地図にした（map）。
  //  騎士：顔までおおうかぶと・銀のよろい・赤いマント。黒魔道士：深いフードと金のかざり。スナイパー：暗い緑のフードと眼帯。
  //  修行僧：坊主で目を閉じた顔・赤い道着。白魔道士：白いフードと赤いかざり。
  //  swap は、歩く・攻撃のコマで足や腕を描きかえるときの色だけに使う（もとの職の足・腕の地図を、上級職の色にする）。
  var LOOK = {
    knight: { from: "warrior", swap: { I: "U", J: "T", "1": "U", "2": "T", "3": "S", "4": "H" },
                 // 保護者がペイントで描いた絵（2026-10-20）。前・後ろ・横（地図は左向き）の 16×24。1〜4 は髪の色
                 map: {
                   down: ["......AKKA......", "....AAAKKAAA....", "...AHUTAATUTA...", "...HUUUAAUUUT...", "..AUUUUTTUUUTA..", "..AAUUUUUUUUAA..", "..ASSSUUUUSSSA..", "..AUAATTTTAATA..", "..AUAAAAAAAATA..", "..AUUUUAAUUUTA..", "..AAUUUSSUUTAA..", ".AAATTUUUUTTAAA.", ".AHUTAASSAATUHA.", ".ASASTUBBUTSASA.", ".AUTAUUTTUUATUA.", ".AUTACCBBCCATUA.", ".AEEATUTTUTAEEA.", ".AFFATUTTUTAFFA.", "..AAATTAATTAAA..", ".AKKADDAADDAKKA.", ".AAAADCAACDAAAA.", "...AADDAADDAA...", "...ATUTAATUTA...", "...AAAAAAAAAA..."],
                   up: ["......AKKA......", "....AAAKKAAA....", "...AHUAKKAUTA...", "..AHUUAKKAUUTA..", "..AUUUAKKAUUTA..", "..ASUUUAAUUUSA..", "..ASUSUASUSUSA..", "..ASUUSUUSUUSA..", "..ASSSUSSUSSSA..", "..AUUUUSSUUUTA..", "...TUSSUUSSTT...", ".AAASSTTTTSSAAA.", ".AHUAKKKKKKAUHA.", ".ASAAKKKKKDAASA.", ".AUAKKKDKKDKAUA.", ".AUAKKKDKKDKAUA.", ".AEAKKKDKKDKAEA.", ".AFAKKDKKKDKAFA.", "..AKKKDKKDDKKA..", ".AAKKDKKKDKDKA..", "...AKAKKAKDAA...", "...AADDAADDAA...", "...ATUTAATUTA...", "...AAAAAAAAAA..."],
                   side: [".....AKKKKKA....", "....AAAAAAAKA...", "...AHUUUUUTAKA..", "..AHUUUUUUTTAK..", "..AHUUUUTTTSAK..", "..AUUUTTTTSTAK..", "..ASSASSSSTTAA..", "..AAAAUUUTUTA...", "..AAUSUUSSTSA...", "..AUUSUUSSSA....", "..AUTUUSTTS.....", "...AASASUTAA....", ".....ATUTAAKA...", "....AAUTUTTAKA..", "....AUUTUTAAKA..", "....ATCBCCAAKKA.", ".....ATAEEFACKA.", "......AAEFAACKA.", ".....ATUTTAACKK.", ".....ATADDATACA.", ".....AAADDAA.A..", ".....AAAADA.....", "......ATUTA.....", ".....AAAAAA....."] } },
    blackmage: { from: "mage", swap: { L: "Y", N: "Z", M: "A" },
                 // 保護者がペイントで描いた絵（2026-10-20）。前・後ろ・横（地図は左向き）の 16×24。1〜4 は髪の色
                 map: {
                   down: ["................", ".....AAAAAA.....", "....AZYYYYAA....", "...AZYYYYYAAA...", "..AZYZYYYYYAAA..", "..AYYZYYYYYAAA..", "..AYYYYBBYYYAA..", "..AYBBBBBBBBAA..", "..AY3AAEEAA3AA..", "..AAAHJEEJHAAA..", "..AAFEJEEJEFAA..", "..AAAFEEEEFAAA..", "..ABYAAFFAAYBA..", ".AYAAAYBBYAAAYA.", ".AYAAAYZYYAAAYA.", ".AYAAAAABAAAAYA.", ".AYZAAYYAYAAZYA.", ".AEEAYZYAYAAEEA.", "..AAAAYYAYAAAA..", "...AAYZYAYYAA...", "...AYAYYAZYAA...", "..AAYYAYYAYAAA..", "..ABABAAABABAA..", "....AJJAAJJA...."],
                   up: ["................", ".....AAAAAA.....", "....AZYYYYAA....", "...AZYZYYYYAA...", "..AZYYYYYAYAAA..", "..AYZYYYAYYAAA..", "..AYYYAYYYAYAA..", "..AYYAYYYAYYAA..", "..AAYYYAYYAYAA..", "..AAYYAYYYAYAA..", "..AAAYYYAYYAAA..", "..AAYAYYYAYAAA..", "..ABYAAYYAAYBA..", ".AYAAAYYAYAAAYA.", ".AYAAAYZYYAAAYA.", ".AYAAAAAYAAAAYA.", ".AYZAAYYAYAAZYA.", ".AEEAYZYAYAAEEA.", "..AAAAYYAYAAAA..", "...AAYZYAYYAA...", "...AYAYYAZYAA...", "..AAYYAYYAYAAA..", "..ABABAAABABAA..", "....AJJAAJJA...."],
                   side: ["................", "....AAAAA.......", "..AAZYYAAAA.....", ".AYZYYAYYAAA....", ".AZAYYZYAAAA....", ".AZAYYYYYYAAA...", ".AAAYYAZYAAAA...", ".ABBBBBYAAAAA...", "..AAEJHFAAYA....", "...AEJEFAAAA....", "...AEEFAAAAA....", "....AFAAYAAA....", ".....AYAYAAA....", "....AAYAZYAAA...", "....AYAYZYYAA...", "....AAAABAAAA...", "....AYAZEEFA....", "....AYAYAEFA....", "....AAYYAYAA....", "...AAYZYAYYAA...", "...AYAYYAZYAA...", "..AAYYAYYAYAA...", "..ABABAABABAA...", "....AAJJAJJA...."] } },
    sniper: { from: "hunter", swap: { O: "s", Q: "g", R: "h", "1": "O", "2": "s", "3": "A", "4": "Q" },
                 // 保護者がペイントで描いた絵（2026-10-20）。前・後ろ・横（地図は左向き）の 16×24。1〜4 は髪の色
                 map: {
                   down: ["................", ".....AAAAAA.....", "....AsAssOsA....", "...AsAOOsOssA...", "..AsAsOQOsOsAA..", "..AAsssOOsAAAA..", ".AAsAEEAAAssAAA.", ".AAsAFEAAssAsAA.", ".AAsAAAEEAAAsAA.", "..AAAAAEEJHAAA..", "...AFAAEEJEFA...", "....AFEEEEFA....", "..AhgAAFFAAghA..", ".AgsAsCgggsAsgA.", ".AgsAggCggsAsgA.", ".AgsACCDCBCAsgA.", ".ACCAsggsgsACCA.", ".ADDAgsAAsgADDA.", "..AAACCAACCAAA..", "....ACDAADCA....", "....ACDAADCA....", "...ADDDAADDDA...", "...ADCDAADCDA...", "...AAAAAAAAAA..."],
                   up: ["................", ".....AAAAAA.....", "....AsOOssAA....", "...AsOQOsssAA...", "..AsOOsOssAsAA..", "..AssOssAssAAA..", ".AAsssAssAssAAA.", ".AAAAAAAAAAAAAA.", ".AAAsAsAAsAsAAA.", "..AAAsAAsAAAAA..", "...AAAAAsAAHKA..", "....AAFEEFAKHA..", "..AhghghgACDhA..", ".AgsAghgACDAsgA.", ".AgsAggACDgAsgA.", ".AgsACDDCCCAsgA.", ".ACCAsggsgsACCA.", ".ADDAgsgsgsADDA.", "..AAACCAACCAAA..", "....ACDAADCA....", "....ACDAADCA....", "...ADDDAADDDA...", "...ADCDAADCDA...", "...AAAAAAAAAA..."],
                   side: ["................", "....AAAAA.......", "..AAOssAAAA.....", ".AsOOsAssAAA....", ".AOAsQOsAAAA....", ".AOAsAOssAAAA...", ".AAAssAOsAAAA...", ".AAAFAAAAAAAA...", "..AAEAAFAFAA....", "...AEAEFFAAA....", "...AEEFAAAhHA...", "....AFAghhhKA...", ".....AsgsAhCDA..", "....AAgsgsACDA..", "....AggsgsACDA..", "....AsCDCCACDA..", ".....AsACCDAA...", "......AAgDAA....", ".....AgsgsAA....", ".....ACADCA.....", ".....ACADCA.....", ".....ADDADA.....", "......ADCDA.....", ".....AAAAAA....."] } },
    monk: { from: "fighter", swap: { W: "K", V: "X", K: "B", F: "Z" },
                 // 保護者がペイントで描いた絵（2026-10-20）。前・後ろ・横（地図は左向き）の 16×24。1〜4 は髪の色
                 map: {
                   down: ["................", "................", ".....AAAAAA.....", "....AHEEEEEA....", "...AHEFEFEEEA...", "...AEEEEEEEFA...", "...AEEFEFEEFA...", "...AEEEEEEEFA...", "..AEEFFEEFFEEA..", "..AEEAAEEAAEEA..", "...AFEEEEEEFA...", "....AFEEEEFA....", ".AKZXAAZZAAXZKA.", ".AZXAKZEEZXAXZA.", ".AEZAKZZEZXAZEA.", ".AEZAJJDJJJAZEA.", ".AHHAZKZZXZAHHA.", ".AEZAZKZXXZAZEA.", "..AAAZZAAXZAAA..", "....AKZAAXZA....", "....AZXAAZXA....", "....AHHAAHHA....", "...AEEZAAEEZA...", "...AAAAAAAAAA..."],
                   up: ["................", "................", ".....AAAAAA.....", "....AHEEEEEA....", "...AHEEEEEEEA...", "...AEEEEEEEFA...", "...AEEEEEEEFA...", "...AEEEEEEEFA...", "..AEEEEEEEEEFA..", "..AEEEEEEEEFFA..", "...AFEEEEEEFA...", "....AFFEEFFA....", ".AKZXKZKZZXXZKA.", ".AZXAKZZKZXAXZA.", ".AEZAZKZZXZAZEA.", ".AEZAJJDJJJAZEA.", ".AHHAZKZZXZAHHA.", ".AEZAZKZXXZAZEA.", "..AAAZZAAXZAAA..", "....AKZAAXZA....", "....AZXAAZXA....", "....AHHAAHHA....", "...AZEEAAZEEA...", "...AAAAAAAAAA..."],
                   side: ["................", "................", ".....AAAAA......", "...AAHEEEEAA....", "..AFEEEEEEFA....", "..AEEEEEEEEFA...", "..AFEEEEFEEFA...", "..AEFFEEAFFFA...", "..AFAAEEEAFFA...", "...AEEEEFAFA....", "...AEEFAAAAA....", "....AFAKFXAA....", ".....AXZKZXA....", "....AAZKZXZXA...", "....AZKZZXZA....", "....AJJDJJJJA...", ".....AZAEEZA....", "......AAHHAA....", ".....AKZXZA.....", ".....AKZAXZA....", ".....AZXAZXA....", ".....AHHAHHA....", ".....AEEZEEA....", ".....AAAAAAA...."] } },
    whitemage: { from: "priest", swap: { I: "K", J: "X", "1": "H", "2": "U", "3": "T", "4": "H" },
                 // 保護者がペイントで描いた絵（2026-10-20）。前・後ろ・横（地図は左向き）の 16×24。1〜4 は髪の色
                 map: {
                   down: ["................", "...AAAAAAAAAA...", "..AATUUUUUTTAA..", "..ATUHUUTUUTTA..", "..AUHHUUHUTUTA..", "..AKKKKKKKKKKA..", ".ATUAFFEFFFATTA.", ".ATUAFEEEFFATTA.", ".ATUAAAEEAAAUTA.", "..ATAHXEEXHATA..", "...AFEXEEXEFA...", "....AFEEEEFA....", "..AHUAAFFAAUHA..", ".AUTAKHUUHKATUA.", ".AUTAKHUUTXATUA.", ".AUTAXUHUUXATUA.", ".AHUAKUHUTKAUHA.", ".AEEAXHUUTXAEEA.", "..AAAKUHUTKAAA..", "...AUXUHUTXTA...", "...AHKUHUTKTA...", "...AUXHUUTXTA...", "...AKXKKXKXKA...", "....AXXAAXXA...."],
                   up: ["................", "...AAAAAAAAAA...", "..ATTUUHUUTTTA..", "..ATUHUUUTUTTA..", "..AUHUUTUUTUTA..", "..AKKKKKKKKKKA..", "..AUUUUUUUUUTA..", "..AUTUUTUUTUTA..", "..ATUUUTUUTUTA..", "..ATTUTTUTTTTA..", "...ATTTTUTTTA...", "....ATFEEFTA....", "..AHUKKXXKKUHA..", ".AUTAHUUHUTATUA.", ".AUTAUHUUTUATUA.", ".AUTAKXKKXKATUA.", ".AHUAUHUTUTAUHA.", ".AEEAHUUTUTAEEA.", "..AAAUHUUTTAAA..", "...AUHUUTUTTA...", "...AHUHUUTUTA...", "...AUUHUTUTTA...", "...AKXKKXKXKA...", "....AXXAAXXA...."],
                   side: ["................", "..AAAAAAAAAA....", "..AAHUUTTTTTA...", "..AHHUTUUTTTA...", "..ATUHHUTTTTA...", ".AKKKKKKKKKKA...", ".ATAFATHUTTTA...", ".ATAFAAATETTA...", "..AAEXHFAFTA....", "...AEXEFFTTA....", "...AEEFAAAA.....", "....AFAHUTAA....", ".....AKHUTTA....", "....AAKHUUTTA...", "....AUXHUTUTA...", "....AUKXKXKXA...", ".....AXHAEEFA...", "....AUKUHAEFA...", "....AUXHUTTA....", "...AUKHUUTTA....", "...AHXUHUTTTA...", "...AUKUHUTUTA...", "...AKXKKXKXA....", "....AXXAXXA....."] } }
  };
  // 組み合わせの上級職：絵は下の ART（2026-10-26 保護者が描きなおした絵）。ここでは、もとにする職（from）だけ
  LOOK.magicknight = { from: "warrior" };
  LOOK.ninja = { from: "hunter" };
  LOOK.gladiator = { from: "warrior" };
  LOOK.paladin = { from: "warrior" };
  LOOK.sage = { from: "priest" };
  LOOK.tamer = { from: "hunter" };   // 魔物使い（まだ職はない。絵だけ）
  function baseJob(job) { return LOOK[job] ? LOOK[job].from : job; }
  // 髪の色（顔の番号 0〜7。faces.js の顔の髪に合わせる。2026-10-18）：1 明るい・2 ふつう・3 影・4 光
  var HAIR = [
    ["#b08050", "#704626", "#3e2414", "#e8d0a8"],   // 0 茶
    ["#c89a60", "#8a6234", "#4a321a", "#f0dcb4"],   // 1 明るい茶
    ["#5a5a6a", "#2c2c36", "#121218", "#a0a0b0"],   // 2 黒
    ["#f4d470", "#c89a38", "#7e5a1c", "#fff2c0"],   // 3 金
    ["#e07848", "#a8401e", "#561c10", "#ffc0a0"],   // 4 赤
    ["#f0f0f2", "#c4c8d0", "#7c8292", "#ffffff"],   // 5 銀
    ["#585266", "#2a2632", "#100e16", "#a098aa"],   // 6 黒（つやのある黒）
    ["#f8e09a", "#d8b05a", "#946a2a", "#fffae0"]    // 7 はちみつ色
  ];

  // 職業ごとの地図（立っている絵）。side は左向き
  var MAP = {
    warrior: {
      down: [
        "................",
        ".....AAAAAA.....",
        "....A223322A....",
        "...A21232123A...",
        "..A2114321423A..",
        "..A3211232123A..",
        ".A32223EE32223A.",
        ".A3123FEEF3213A.",
        ".A323AAEEAA323A.",
        "..A3AHJEEJHA3A..",
        "...AFEJEEJEFA...",
        "....AFEEEEFA....",
        ".AHIJAAFFAAJIHA.",
        ".AIJAJIBBIJAJIA.",
        ".AIJAIIJJIIAJIA.",
        ".AIJACCBBCCAJIA.",
        ".AEEAJIJJIJAEEA.",
        ".AFFAJIJJIJAFFA.",
        "..AKAJJAAJJAKA..",
        "..AKADDAADDAKA..",
        "..AKADCAACDAKA..",
        "...AADDAADDAA...",
        "...AJIJAAJIJA...",
        "...AAAAAAAAAA..."
      ],
      up: [
        "................",
        ".....AAAAAA.....",
        "....A211223A....",
        "...A21412223A...",
        "..A2112122323A..",
        "..A2212232233A..",
        ".A322232232233A.",
        ".A323223223233A.",
        ".A332323323233A.",
        "..A3323323333A..",
        "...A33332333A...",
        "....A3FEEF3A....",
        ".AHIAKKKKKKAIHA.",
        ".AIJAKKKKKDAJIA.",
        ".AIJAKKDKKDAJIA.",
        ".AIJAKKDKKDAJIA.",
        ".AEEAKKDKKDAEEA.",
        ".AFFAKDKKKDAFFA.",
        "..AAAKDKKDDAAA..",
        "...AKDKKKDKDA...",
        "...AKAKKAKDAA...",
        "...AADDAADDAA...",
        "...AJIJAAJIJA...",
        "...AAAAAAAAAA..."
      ],
      side: [
        "................",
        "....AAAAA.......",
        "..AA12233AA.....",
        ".A211232233A....",
        ".A132412333A....",
        ".A1323122333A...",
        ".A3322312333A...",
        ".A3AFAAA3E33A...",
        "..AAEJHF3F3A....",
        "...AEJEFF33A....",
        "...AEEFAAAA.....",
        "....AFAHIJAA....",
        ".....AJIJAAKA...",
        "....AAIJIJJAKA..",
        "....AIIJIJAAKA..",
        "....AJCBCCAAKKA.",
        ".....AJAEEFACKA.",
        "......AAEFAACKA.",
        ".....AJIJJAACKK.",
        ".....AJADDAJACA.",
        ".....AAADDAA.A..",
        ".....AAAADA.....",
        "......AJIJA.....",
        ".....AAAAAA....."
      ]
    },
    mage: {
      down: [
        "................",
        ".....AAAAAA.....",
        "....ANLLLLMA....",
        "...ANLLLLLMMA...",
        "..ANLNLLLLLMMA..",
        "..ALLAAAAAAMMA..",
        "..ALA212212AMA..",
        "..ALA3FEEF3AMA..",
        "..AL3AAEEAA3MA..",
        "..AMAHJEEJHAMA..",
        "..AMFEJEEJEFMA..",
        "..AMAFEEEEFAMA..",
        "..ANLAAFFAALNA..",
        ".ALMAMLBBLMAMLA.",
        ".ALMAMLNLLMAMLA.",
        ".ALMAMMMBMMAMLA.",
        ".ALNAMLLMLMANLA.",
        ".AEEALNLMLMAEEA.",
        "..AAAMLLMLMAAA..",
        "...AMLNLMLLMA...",
        "...ALMLLMNLMA...",
        "..AMLLMLLMLMMA..",
        "..ABMBMMMBMBMA..",
        "....AJJAAJJA...."
      ],
      up: [
        "................",
        ".....AAAAAA.....",
        "....ANLLLLMA....",
        "...ANLNLLLLMA...",
        "..ANLLLLLMLMMA..",
        "..ALNLLLMLLMMA..",
        "..ALLLMLLLMLMA..",
        "..ALLMLLLMLLMA..",
        "..AMLLLMLLMLMA..",
        "..AMLLMLLLMLMA..",
        "..AMMLLLMLLMMA..",
        "..AMLMLLLMLMMA..",
        "..ANLMMLLMMLNA..",
        ".ALMAMLLMLMAMLA.",
        ".ALMAMLNLLMAMLA.",
        ".ALMAMMMLMMAMLA.",
        ".ALNAMLLMLMANLA.",
        ".AEEALNLMLMAEEA.",
        "..AAAMLLMLMAAA..",
        "...AMLNLMLLMA...",
        "...ALMLLMNLMA...",
        "..AMLLMLLMLMMA..",
        "..ABMBMMMBMBMA..",
        "....AJJAAJJA...."
      ],
      side: [
        "................",
        "....AAAAA.......",
        "..AANLLMMAA.....",
        ".ALNNLMLLMMA....",
        ".ANMLNNLMMMA....",
        ".ANMLMNLLMMMA...",
        ".AMMLLMNLMMMA...",
        ".A2AFAAAMMMMA...",
        "..AAEJHFMMMA....",
        "...AEJEFMMMA....",
        "...AEEFAMMMA....",
        "....AFAMLMMA....",
        ".....ALMLMMA....",
        "....AALMNLMMA...",
        "....ALMLNLLMA...",
        "....AMMMBMMMA...",
        "....ALMNEEFA....",
        "....ALMLAEFA....",
        "....AMLLMLMA....",
        "...AMLNLMLLMA...",
        "...ALMLLMNLMA...",
        "..AMLLMLLMLMA...",
        "..ABMBMMBMBMA...",
        "....AAJJAJJA...."
      ]
    },
    hunter: {
      down: [
        "................",
        ".....AAAAAA.....",
        "....A232212A....",
        "...A23112122A...",
        "..A2321412123A..",
        "..A3222112223A..",
        ".A323EE3212233A.",
        ".A323FEE322323A.",
        ".A323AAEEA3323A.",
        "..A3AHJEEJHA3A..",
        "...AFEJEEJEFA...",
        "....AFEEEEFA....",
        "..ARQAAFFAAQRA..",
        ".AQOAOCQQQOAOQA.",
        ".AQOAQQCQQOAOQA.",
        ".AQOACCDCBCAOQA.",
        ".ACCAOQQOQOACCA.",
        ".ADDAQOAAOQADDA.",
        "..AAACCAACCAAA..",
        "....ACDAADCA....",
        "....ACDAADCA....",
        "...ADDDAADDDA...",
        "...ADCDAADCDA...",
        "...AAAAAAAAAA..."
      ],
      up: [
        "................",
        ".....AAAAAA.....",
        "....A211223A....",
        "...A21412223A...",
        "..A2112122323A..",
        "..A2212232233A..",
        ".A322232232233A.",
        ".A323223223233A.",
        ".A332323323233A.",
        "..A3323323333A..",
        "...A3333233HKA..",
        "....A3FEEFAKHA..",
        "..ARQRQRQACDRA..",
        ".AQOAQRQACDAOQA.",
        ".AQOAQQACDQAOQA.",
        ".AQOACDDCCCAOQA.",
        ".ACCAOQQOQOACCA.",
        ".ADDAQOQOQOADDA.",
        "..AAACCAACCAAA..",
        "....ACDAADCA....",
        "....ACDAADCA....",
        "...ADDDAADDDA...",
        "...ADCDAADCDA...",
        "...AAAAAAAAAA..."
      ],
      side: [
        "................",
        "....AAAAA.......",
        "..AA12233AA.....",
        ".A211232233A....",
        ".A132412333A....",
        ".A1323122333A...",
        ".A3322312333A...",
        ".A3AFAAA3E33A...",
        "..AAEJHF3F3A....",
        "...AEJEFF33A....",
        "...AEEFAAARHA...",
        "....AFAQRRRKA...",
        ".....AOQOARCDA..",
        "....AAQOQOACDA..",
        "....AQQOQOACDA..",
        "....AOCDCCACDA..",
        ".....AOACCDAA...",
        "......AAQDAA....",
        ".....AQOQOAA....",
        ".....ACADCA.....",
        ".....ACADCA.....",
        ".....ADDADA.....",
        "......ADCDA.....",
        ".....AAAAAA....."
      ]
    },
    fighter: {
      down: [
        "....A..AA..A....",
        "...A2AA12AA2A...",
        "...A21212232A...",
        "..A2142121233A..",
        "..A3212212233A..",
        ".A322321232233A.",
        ".A3KFKKKKKFKK3A.",
        ".A323FEEEEF323A.",
        ".A323AAEEAA323A.",
        "..A3AHJEEJHA3A..",
        "...AFEJEEJEFA...",
        "....AFEEEEFA....",
        ".AWFVAAFFAAVFWA.",
        ".AFVAWFEEFVAVFA.",
        ".AEFAWFFEFVAFEA.",
        ".AEFAJJDJJJAFEA.",
        ".AHHAFWFFVFAHHA.",
        ".AEFAFWFVVFAFEA.",
        "..AAAFFAAVFAAA..",
        "....AWFAAVFA....",
        "....AFVAAFVA....",
        "....AHHAAHHA....",
        "...AEEFAAEEFA...",
        "...AAAAAAAAAA..."
      ],
      up: [
        "....A..AA..A....",
        "...A2AA12AA2A...",
        "...A21212232A...",
        "..A2142121233A..",
        "..A3212212233A..",
        ".A322321232233A.",
        ".A3KFKKKKKKKK3A.",
        ".A323232232K33A.",
        ".A332323323KK3A.",
        "..A3323323K3KA..",
        "...A333323K3KA..",
        "....A3FEEFAKA...",
        ".AWFVWFWFFVVFWA.",
        ".AFVAWFFWFVAVFA.",
        ".AEFAFWFFVFAFEA.",
        ".AEFAJJDJJJAFEA.",
        ".AHHAFWFFVFAHHA.",
        ".AEFAFWFVVFAFEA.",
        "..AAAFFAAVFAAA..",
        "....AWFAAVFA....",
        "....AFVAAFVA....",
        "....AHHAAHHA....",
        "...AFEEAAFEEA...",
        "...AAAAAAAAAA..."
      ],
      side: [
        "....A.AA.A......",
        "...A2A12A2A.....",
        "..AA12233AA.....",
        ".A211232233A....",
        ".A132412333A....",
        ".A1323122333A...",
        ".AKKFKKKKKKKAKA.",
        ".A3AFAAA3E33AKA.",
        "..AAEJHF3F3AKA..",
        "...AEJEFF33A....",
        "...AEEFAAAA.....",
        "....AFAWFVAA....",
        ".....AVFWFVA....",
        "....AAFWFVFVA...",
        "....AFWFFVFA....",
        "....AJJDJJJJA...",
        ".....AFAEEFA....",
        "......AAHHAA....",
        ".....AWFVFA.....",
        ".....AWFAVFA....",
        ".....AFVAFVA....",
        ".....AHHAHHA....",
        ".....AEEFEEA....",
        ".....AAAAAAA...."
      ]
    },
    priest: {
      down: [
        "................",
        ".....AAAAAA.....",
        "....A222223A....",
        "...A21223223A...",
        "..A2112212323A..",
        "..A3212322323A..",
        ".A323EEE322233A.",
        ".A323FEEEF3233A.",
        ".A323AAEEAA323A.",
        "..A3AHJEEJHA3A..",
        "...AFEJEEJEFA...",
        "....AFEEEEFA....",
        "..AHUAAFFAAUHA..",
        ".AUTAIHUUHIATUA.",
        ".AUTAIHUUTJATUA.",
        ".AUTAJUHUUJATUA.",
        ".AHUAIUHUTIAUHA.",
        ".AEEAJHUUTJAEEA.",
        "..AAAIUHUTIAAA..",
        "...AUJUHUTJTA...",
        "...AHIUHUTITA...",
        "...AUJHUUTJTA...",
        "...AIJIIJIJIA...",
        "....AJJAAJJA...."
      ],
      up: [
        "................",
        ".....AAAAAA.....",
        "....A221223A....",
        "...A21222323A...",
        "..A2122322323A..",
        "..A2232232233A..",
        ".A322232232233A.",
        ".A323223223233A.",
        ".A332323323233A.",
        "..A3323323333A..",
        "...A33332333A...",
        "....A3FEEF3A....",
        "..AHUIIJJIIUHA..",
        ".AUTAHUUHUTATUA.",
        ".AUTAUHUUTUATUA.",
        ".AUTAIJIIJIATUA.",
        ".AHUAUHUTUTAUHA.",
        ".AEEAHUUTUTAEEA.",
        "..AAAUHUUTTAAA..",
        "...AUHUUTUTTA...",
        "...AHUHUUTUTA...",
        "...AUUHUTUTTA...",
        "...AIJIIJIJIA...",
        "....AJJAAJJA...."
      ],
      side: [
        "................",
        "....AAAAA.......",
        "..AA12233AA.....",
        ".A211232233A....",
        ".A132112333A....",
        ".A1323122333A...",
        ".A3322312333A...",
        ".A3AFAAA3E33A...",
        "..AAEJHF3F3A....",
        "...AEJEFF33A....",
        "...AEEFAAAA.....",
        "....AFAHUTAA....",
        ".....AIHUTTA....",
        "....AAIHUUTTA...",
        "....AUJHUTUTA...",
        "....AUIJIJIJA...",
        ".....AJHAEEFA...",
        "....AUIUHAEFA...",
        "....AUJHUTTA....",
        "...AUIHUUTTA....",
        "...AHJUHUTTTA...",
        "...AUIUHUTUTA...",
        "...AIJIIJIJA....",
        "....AJJAJJA....."
      ]
    }
  };

  // 横向きで歩くときの足（19〜23行め。前の足を左＝前へ、後ろの足を右＝後ろへ開く）
  var STRIDE = {
    warrior: ["....ADAADDAJACA.", "...ADDA.ADDA.A..", "...ADDA..ADDA...", "..AJIJA..AJIJA..", "..AAAAA..AAAAA.."],
    hunter:  ["....ACAACDA.....", "...ACDA.ACDA....", "...ADDA..ADDA...", "..ADCDA..ADCDA..", "..AAAAA..AAAAA.."],
    fighter: ["....AWFAAVFA....", "...AFVA..AFVA...", "...AHHA..AHHA...", "..AEEFA..AEEFA..", "..AAAAA..AAAAA.."],
    mage:    [null, null, null, null, "..AJJA..AJJA...."],
    priest:  [null, null, null, null, "..AJJA..AJJA...."]
  };
  // 基本職・一本道の上級職の新しい絵（2026-10-25 保護者が描いた絵。前・後ろ・横（左向き）の 16×24）。
  // 色は職ごとの一覧（pal。小文字）。1〜4 は髪の色（顔の番号で変わる）：絵の髪の色を、明るい→1・ふつう→2・影→3・灰色の光→4 に分けた。
  // 騎士・魔術師・黒魔道士は、かぶと・フードなので髪の色は変わらない（保護者）。
  // 絵は足が下から2行めだったので、1行下げて入れた（今の絵と足の高さをそろえる）。
  // stride：横向きで歩く・攻撃するときの足（19〜23行め。null の行はそのまま。ローブの職は、すその下から足を出すだけ）。
  // hand：横向きの攻撃でのばす手の色 [肌, 肌の影]、sleeve：そでの色 [そで, そでの影]
  var ART = {
    // 戦士
    warrior: {
      pal: { d: "#ff8c39", e: "#ffc68c", f: "#ffefde", g: "#a54848", h: "#63442c", i: "#2b2b85", j: "#5e40ff", k: "#a75400", l: "#f3b926", m: "#5e3838", n: "#b54545" },
      map: {
        down: ["................", "................", ".....AAAAAA.....", "....A411112A....", "...A11114112A...", "..A4112211112A..", "..A4212221212A..", "..A121dee2212A..", "..A122efee212A..", "..A22AAfAAA22A..", "...A2fAeeAfAA...", "....AeAeeAeA....", ".AAggAeeeeAgghA.", "..AAghAddAigAA..", "..AeAAiiiiAAeA..", "..AedijjjjideA..", ".AdkAkiiiikAkdA.", ".AdeAikllkiAedA.", ".AdeAAjiijAAedA.", "..AAAijiijiAAA..", "....AmiiiimA....", "....AmnAAnmA....", "....AmmAAmmA....", ".....AnAAnA....."],
        up: ["................", "................", ".....AAAAAA.....", "....A412212A....", "...A11121112A...", "..A1111111112A..", "..A1121111112A..", "..A2121121122A..", "..A2122121122A..", "..A2222221222A..", "...A22222222A...", "....AA2A22AA....", ".AgghAAAAAAhggA.", "..AhhAiiiiAhhA..", "..AdAijjjjiAdA..", "..AdAiijjiiAdA..", ".AdkAAiiiiAAkdA.", ".AdeAikkkkiAedA.", ".AdeAAjiijAAedA.", "..AAAijiijiAAA..", "....AmiiiimA....", "....AmnAAnmA....", "....AmmAAmmA....", ".....AnAAnA....."],
        side: ["................", "................", "....AAAAAAA.....", "...A4111122AA...", "..A1111211222A..", ".A12211221122A..", ".A12221122122A..", ".A2Ae22122222A..", ".A2Afe2122222A..", "..2AfAA22e222A..", "...AeAf2ed22A...", "...AeAe2dd2A....", "...AeeedAggghA..", "....AddAAhhhA...", "....AAiiAdeA....", "....AjjiAdeA....", "....AiiiAlkA....", "....AlkAdedA....", ".....AAAdedA....", ".....iAjAAA.....", ".....iAjiiA.....", "....AAAAmmA.....", "....AAnnmmA.....", ".....AAAAAA....."]
      },
      stride: ["....AiAjiiA.....", "...AmmA.AmmA....", "...AmmA..AmmA...", "..AnnmA..AnmmA..", "..AAAAA..AAAAA.."],
      hand: ["e", "d"], sleeve: ["j", "i"]
    },
    // 魔術師（フードなので髪の色は変わらない）
    mage: {
      pal: { d: "#7a8eb3", e: "#444d84", f: "#1c236a", g: "#7d7b18", h: "#ff8c39", i: "#ffefde", j: "#ffc68c", k: "#783b22", l: "#f3d27f", m: "#c27126" },
      map: {
        down: ["................", "................", "................", ".....AAAAAA.....", "....AdeeeeeA....", "...AeeeeeeffA...", "...AfefeefffA...", "...AffffffffA...", "...AfgfggfgfA...", "...AfAAhAAAfA...", "...AfiAhhAifA...", "...AfjAjjAjfA...", "...AfAjjjjAfA...", "..AefAAhhAAeeA..", "..AefAgeegAefA..", "..AfffedeffffA..", ".AgfAkeeffkAfgA.", ".AhgAfklgkfAghA.", ".AhjAeffffeAjhA.", "..AAfeeeeeefAA..", "...AfefeefefA...", "...AfgffffgfA...", "....AkfggfkA....", ".....AmAAmA....."],
        up: ["................", "................", "................", ".....AAAAAA.....", "....AdeeeeeA....", "...AeeeeeeefA...", "...AfeeeefefA...", "...AfefeefffA...", "...AfeeeffffA...", "...AfeffffffA...", "...AfeffffffA...", "...AfeeffeefA...", "...AfeeeeeffA...", "..AegffeeffgfA..", "..AeffgffgeefA..", "..AffffffffffA..", ".AAAAfffAAAAfAA.", ".AgAAkmmkkkAAgA.", ".AhAAefffffAAhA.", "..AAfeeeeeffAA..", "...AfffeefffA...", "...AffffffffA...", "...AfgfggfgfA...", "....AkkAAkkA...."],
        side: ["................", "................", "................", "....eAAAAAA.....", "...AdeeffffA....", "..AeeefeffefA...", "..AefefefffeA...", "..AffffeefffA...", "..AgfgfeeeffA...", "..AAhAAefeffA...", "...AhAiefeefA...", "...AjAjefeffA...", "...AjjjffAAfA...", "....AhhAgeeA....", "....AAgeffef....", "....AddeAfefA...", "....AeeeAfefA...", "....AgkAhggA....", "....AefAhjhA....", "....fefeAAAA....", "....fefffffff...", "....ffgfgfffA...", "....AAmkkkAAA...", ".....AAAAAA....."]
      },
      stride: [null, null, null, null, "...AmkA.AmkA...."],
      hand: ["j", "h"], sleeve: ["d", "e"]
    },
    // 狩人
    hunter: {
      pal: { d: "#ff8c39", e: "#ffc68c", f: "#ffefde", g: "#4e3212", h: "#1b531d", i: "#a55b15", j: "#279c4a", k: "#a75400", l: "#f3b926", m: "#5d0000", n: "#a51414" },
      map: {
        down: ["................", "................", ".....AA11AAA....", "....A4221221A...", "...A121441221A..", "..A41221441221..", "..A42222111221..", "..A12dd2221122..", "..A22eed22212A..", "..A22AAdAAA22A..", "...A2fAedAfAA...", "....AeAeeAeA....", "..AggAeeeeAhA...", "..AAgiAddAhAhA..", "..AjAAighhAAjA..", "..AjhhgigjhhjA..", ".AdkAkhhggkAkdA.", ".AdeAhkllkhAedA.", ".AdeAAjhhjAAedA.", "..AAAhjhhjhAAA..", "....AghhhhgA....", "....AgiAAigA....", "....AggAAggA....", ".....AiAAiA....."],
        up: ["................", "................", ".....112AAAA....", "....24412211A...", "...A441112212A..", "...11111112212..", "..A21212212212A.", "..A21211221222A.", "..A21221222122A.", "..A222222222mmA.", "...A22222222nfm.", "....AA2A22Amfnm.", "...AAAAAAAgmmmA.", "..AhAAhhhgigmA..", "..AhAhjjgigAhA..", "..AhAhhgiggAhA..", ".AdkAAggggAAkdA.", ".AdeAhAgkkhAedA.", ".AdeAAjhhjAAedA.", "..AAAhjhhjhAAA..", "....AghhhhgA....", "....AgiAAigA....", "....AggAAggA....", ".....AiAAiA....."],
        side: ["................", "................", "....11AAAAA.....", "..A44111111AA...", ".A44141211211A..", ".A24114221121A..", ".A22211122121A..", ".A2A221212112A..", ".A2Ad22221222A..", "..2AfAA222222A..", "...AeAf22d22Am..", "...AeAe2dd2Amm..", "...AeeedAAAnig..", "....AddAAhhAig..", "....AAhhAhjAig..", "....AjjhAhjAig..", "....AhhhAlkAg...", "....AlkAdedAg...", ".....AAAdedA....", ".....hAjAAA.....", ".....hAjhhA.....", "....AAAAggA.....", "....AAiiggA.....", ".....AAAAAA....."]
      },
      stride: ["....AhAjhhA.....", "...AggA.AggA....", "...AggA..AggA...", "..AiigA..AiggA..", "..AAAAA..AAAAA.."],
      hand: ["e", "d"], sleeve: ["j", "h"]
    },
    // 武術家
    fighter: {
      pal: { d: "#8e0000", e: "#f90000", f: "#ffefde", g: "#ffc68c", h: "#ff8c39", i: "#984d00", j: "#ff7304", k: "#5e3838", l: "#f3e8cb", m: "#979683" },
      map: {
        down: ["................", "........2.......", "....2.2212.2....", "....12211221....", "...2123212213...", "...3223213223...", "...332332323A...", "...AddeeedddA...", "...AdddeedddA...", "....3AAfAAA3....", "....AfAghAfA....", "....AgAggAgA....", "...AhAggggAhA...", "..AfhAAhhAAhfA..", "..AghAiiiiAhgA..", "..AddijjjjiddA..", ".AhdAdiiiidAdhA.", ".AhgAideediAghA.", ".AhgAAjiijAAghA.", "..AAAijiijiAAA..", "....AkiiiikA....", "....AllAAllA....", "....AhgAAghA....", ".....AgAAgA....."],
        up: ["................", ".......2........", "....2.2122.2....", "....12211221....", "...3122123212...", "...3223223223...", "...A333333333...", "...AddededddA...", "...AdddeddddA...", "...A333ddd33A...", "....A33d33dA....", "....A33dd33d....", "...AhAAAAAAhA...", "..AgAiiiiiiAgA..", "..AhAijiijiAhA..", "..AdAijijjiAdA..", ".AhdAAiiiiAAdhA.", ".AhgAddeeddAghA.", ".AhgAAjiijAAghA.", "..AAAijiijiAAA..", "....AkiiiikA....", "....AllAAllA....", "....AhhAAhhA....", "....AghAAhgA...."],
        side: ["................", ".....2..2.......", "....21.223..2...", "...21231233223..", "...22331233233..", "...23232332233..", "...23233332333..", "...AeeeddddddA..", "...AeedddddddA..", "...AgAAh3g333d..", "...AgAfhgh33Add.", "...AgAghhh3A..d.", "...AggghAAA.....", "....AhhAAhfA....", "....AAiiAhgA....", "....AjjiAhdA....", "....AiiiAdeA....", "....AlmAhghA....", ".....AAAhghA....", ".....iAjAAA.....", ".....iAfffA.....", "....AAAghhA.....", "....AAghhhA.....", ".....AAAAAA....."]
      },
      stride: ["....AiAjiiA.....", "...AggA.AggA....", "...AggA..AggA...", "..AhhgA..AhggA..", "..AAAAA..AAAAA.."],
      hand: ["g", "h"], sleeve: ["j", "i"]
    },
    // 僧侶
    priest: {
      pal: { d: "#ff8c39", e: "#ffc68c", f: "#ffefde", g: "#606089", h: "#cadbdf", i: "#acb7bd", j: "#7c9fac", k: "#b54545", l: "#5e3838" },
      map: {
        down: ["................", "................", "................", ".....AAAAAA.....", "....A321123A....", "...A32233223A...", "...A32333122A...", "...A22deed12A...", "...A2defee12A...", "...A2AAfAA12A...", "...32fAeeA123...", "....2eAeeA12....", "...AgAeeeeAgA...", "..AhiAAddAAihA..", "..AigjjijjjgiA..", "..AjgjihijjgjA..", ".AdkAgihijgAkdA.", ".AdeigjijjgAedA.", ".AdeigihijgjedA.", "..AAijihijjiAA..", "...gijihijjig...", "...gigjiijgAg...", "....AgjjjjgA....", ".....AkAAkA....."],
        up: ["................", "................", "................", ".....AAAAAA.....", "....A211323A....", "...A22223223A...", "...A32222223A...", "...A32223223A...", "...A32223233A...", "...A33223233A...", "...A33223333A...", "...A33333333A...", "...AA33333AgA...", "..AjgAAAAAggjA..", "..AggggggggggA..", "..AggjijjggggA..", ".AdkgjjijjjgkdA.", ".AdeAgjjjjggedA.", ".AdeAggjjggAedA.", "..AAAjjjjjjAAA..", "...ggjijjjjgg...", "...ggjijgjggg...", "....AgijgjgA....", ".....AkAAkA....."],
        side: ["................", "................", "................", "....333AAAA.....", "...222222333....", "..A3222222333...", ".A23312222333...", ".A2Add1222233...", ".A2Afed12223A...", "..2AeAA13233A...", "..3AeAf13233A...", "..3AeAd13233A...", "..3AeeddA233A...", "...33ddAgggAA...", "....AAjggjig....", "....Ahijgjig....", "....AijggjjA....", "....AhgAdekA....", "....jhjAdedA....", "....jijiAAAg....", "....gijijjgg....", "....gjgjjggg....", "....ggkklggg....", ".....AAAAAA....."]
      },
      stride: [null, null, null, null, "...AklA.AklA...."],
      hand: ["e", "d"], sleeve: ["i", "j"]
    },
    // 騎士（かぶとなので髪の色は変わらない）
    knight: {
      pal: { d: "#bf2626", e: "#86231a", f: "#86889e", g: "#495350", h: "#c3deff", i: "#ff8c39", j: "#5e3434", k: "#ffefde", l: "#ffc68c", m: "#6a6b1b", n: "#f3e326", o: "#b57575" },
      map: {
        down: ["................", ".......dd.......", ".......dee......", "......edede.....", "....fffefggg....", "...gggggggggg...", "...fghghgfgfg...", "...ggfgfgfggg...", "...gggggggggg...", "...AgAAiAAAgA...", "...AjkAiiAkgA...", "...AAlAllAlAA...", ".AAddAllllAddeA.", "..AAdeAiiAfdAA..", "..AhAAfggfAAhA..", "..AhfgfhhfgfhA..", ".AfmAmfggfmAmfA.", ".AghAgmnnmgAhgA.", ".AiiAAffffAAiiA.", "..AAAfhffhfAAA..", "...eAgfggfgAe...", "...eAgoAAogAe...", "....AggAAggA....", ".....AoAAoA....."],
        up: ["................", ".......dd.......", "......eede......", ".....edeeej.....", "....gfdedefg....", "...ghfdedefgg...", "...gfgeedeggg...", "...gfgeedeggg...", "...gggfeeeggg...", "...AgggegeggA...", "...AgggeggggA...", "...AAgAiiAgAA...", ".AdddAAAAAAdddA.", "..AeeeeeeeeeeA..", "..AedeeeeeeeeA..", "..AeedeeeedeeA..", ".AfeeedddeeeefA.", ".AfeeeeeeeeeefA.", ".AideeeeeeeeeiA.", "..AdedeeedeeeA..", "...dedeeedeee...", "...dAdeAAdeAe...", "....AggAAggA....", ".....AoAAoA....."],
        side: ["................", ".....eedddee....", "....defeeeeee...", "....dfffgggede..", "...fgggffgggedd.", "..hfffggggggeed.", "..fghgfffgggged.", "..fgfgfgfgfgged.", "..ggggggggfggee.", "..jAiAAAAgfgge..", "...AiAkjfgfgA...", "...AlAljfAAA....", "...AllliAdddeA..", "....AiiAAeeeA...", "....AAfgAfhAe...", "....AhhfAghAe...", "....AffgAmgAed..", "....AnmAfhfAed..", ".....AAAilfAed..", ".....fAhAAAeed..", ".....fAhffAeed..", "....AAAAggAeee..", "....AAooggA.....", ".....AAAAAA....."]
      },
      stride: ["....AfAhffA.....", "...AggA.AggA....", "...AggA..AggA...", "..AoogA..AoggA..", "..AAAAA..AAAAA.."],
      hand: ["l", "i"], sleeve: ["h", "f"]
    },
    // 黒魔道士（フードなので髪の色は変わらない）
    blackmage: {
      pal: { d: "#9c7ab3", e: "#7d7b18", f: "#54347d", g: "#4f175e", h: "#f3d27f", i: "#ff8c39", j: "#ffc68c", k: "#783b22", l: "#c27126" },
      map: {
        down: ["................", "................", "................", ".....AAAAAA.....", "....AdeffefA....", "...AfeffffegA...", "...AghgffghgA...", "...AghgffghgA...", "...AgegeegegA...", "...AgeehheegA...", "...AegAiiAgeA...", "...AgiAiiAigA...", "...AgAijjiAgA...", "..AfgAAiiAAgfA..", "..AfgAeffeAgfA..", "..AfggfhegggfA..", ".AgfAeffggeAggA.", ".AegAgeheegAgeA.", ".AklAfggggfAlkA.", "..AAgfeffefgAA..", "...AgghffhggA...", "...AegeggegeA...", "....AeeheeeA....", ".....AlAAlA....."],
        up: ["................", "................", "................", ".....AAAAAA.....", "....AeffffeA....", "...AffeffefgA...", "...AgffhegfgA...", "...AeeeffeeeA...", "...AgfffggggA...", "...AgfggggggA...", "...AgfggggggA...", "...AgffggffgA...", "...AgfffffggA...", "..AfeegffgeegA..", "..AfggeheeffgA..", "..AggggggggggA..", ".AAAAggggggAgAA.", ".AeAAeeheeeAAeA.", ".AlAAfgggggAAlA.", "..AAgfffffggAA..", "...AgggffgggA...", "...AggggggggA...", "...AeeeheeeeA...", "....AkkAAkkA...."],
        side: ["................", "................", "................", "....fAAAAAA.....", "...AdfeggggA....", "..AffegfggfgA...", "..AfghgfgggfA...", "..AggegffggeA...", "..AggegffgegA...", "..AeeeefgeggA...", "..AAiAeeeefgA...", "...AiAiAgeggA...", "...AjjiAgAAgA...", "....AiiAeegA....", "....AAAeggfg....", "....hhefAgfgA...", "....gfffAgfgA...", "...AhheAkeeAA...", "...AgfgAklkA....", "...AgfgfAAAAA...", "...AgfggggggA...", "...AheeeeeeeA...", "...AAAlkkkAAA...", ".....AAAAAA....."]
      },
      stride: [null, null, null, null, "...AlkA.AlkA...."],
      hand: ["j", "i"], sleeve: ["f", "g"]
    },
    // スナイパー
    sniper: {
      pal: { d: "#ff8c39", e: "#ffefde", f: "#ffc68c", g: "#5b5449", h: "#4e3212", i: "#a55b15", j: "#a27e2b", k: "#a75400", l: "#f3b926", m: "#5d0000", n: "#a51414" },
      map: {
        down: ["................", "................", ".....AA11AA.....", "....1221221A....", "...12214412A....", "..122144122A1...", "..12211122AA1...", "..2211222AA2A...", "..A21222AAd2A...", "..A22AA1AAA2A...", "...AAAAAdAeA....", "....AAAffAfA....", "...AgAffffAhhA..", "..AAhiAddAgAgA..", "..AjAAihggAAjA..", "..AjgghihjggjA..", ".AhhAhgghhhAhhA.", ".AhiAgkkklgAihA.", ".AhiAAjggjAAihA.", "..AAAgjggjgAAA..", "....AhgggghA....", "....AhiAAihA....", "....AhhAAhhA....", ".....AiAAiA....."],
        up: ["................", "................", ".....22AA211....", "....214221112...", "...A2A2211111A..", "...212A1111111..", "...2122A221212..", "...22212A1121A..", "...A21222A221A..", "...A222222AAmmA.", "....A222222Anem.", ".....AAAAAAmenm.", "...AAAAAAAhmmmA.", "..AgAAggghihmA..", "..AgAgjjhihAgA..", "..AgAgghihhAgA..", ".AhhAAhhhhAAhhA.", ".AhiAgAhkkgAihA.", ".AhiAAjggjAAihA.", "..AAAgjggjgAAA..", "....AhgggghA....", "....AhiAAihA....", "....AhhAAhhA....", ".....AiAAiA....."],
        side: ["................", "................", ".....2AAAAA.....", "...12111122A....", "..2114122AAAA...", "..24111AAA221A..", ".A1112AA22121A..", ".A1222A212122A..", ".A222Add2122A...", "..22AAAd2222A...", "...AdAed2d2Aem..", "...AfAfdddAemm..", "...AfffdAAAnih..", "....AddAAggAih..", "....AAggAgjAih..", "....AjjgAgjAih..", "....AgggAlkAh...", "....AklAhihAh...", ".....AAAhihA....", ".....gAjAAA.....", ".....gAjggA.....", "....AAAAhhA.....", "....AAiihhA.....", ".....AAAAAA....."]
      },
      stride: ["....AgAjggA.....", "...AhhA.AhhA....", "...AhhA..AhhA...", "..AiihA..AihhA..", "..AAAAA..AAAAA.."],
      hand: ["f", "d"], sleeve: ["j", "g"]
    },
    // 修行僧
    monk: {
      pal: { d: "#ff8c39", e: "#ffc68c", f: "#ffefde", g: "#5b0000", h: "#9a0000", i: "#df6b6b", j: "#dd0d00", k: "#175c77", l: "#46afc3", m: "#897626", n: "#c47327" },
      map: {
        down: ["................", "................", "................", ".....AAAAAA.....", "....A321223A....", "...A32212223A...", "...A32222223A...", "...A3deeeed3A...", "...AdeefeeedA...", "...AddeeedddA...", "....AAAdAAAA....", "....AeAeeAeA....", "...ghAeeeeAhA...", "..gijgAddAgjiA..", "..gjhgjjhighjA..", "..gjhjjhijjhjA..", ".AkhAkhijjkAhkA.", ".AdlAgkllkgAldA.", ".AdeAjhijhgAedA.", "..AAAjhijhgAAA..", "....AjhgijhA....", "....AhggghjA....", "....AmmAAmmA....", ".....AnAAnA....."],
        up: ["................", "................", "................", ".....AAAAAA.....", "....A321223A....", "...A32212223A...", "...A32222223A...", "...A32222223A...", "...A32222223A...", "...A33222233A...", "....A332233A....", ".....A3AA3A.....", "...AhhghhghhA...", "..AjhghgghghjA..", "..AhAhjhhjgAhA..", "..AhAhhjjhgAhA..", ".AkhAghhhggAhkA.", ".AdkAgkkkkgAkdA.", ".AdeAgghhggAedA.", "..AAAghhhhgAAA..", "....ghhhghgg....", "....ghhggggg....", "....AmmAAmmA....", ".....AnAAnA....."],
        side: ["................", "................", "................", ".....AAAAAAA....", "....A2222233A...", "...A222222233A..", "...A222222233A..", "...Aeedd22233A..", "...Afeed33333A..", "...Aeddd3e333A..", "...AeAAded33A...", "...AeAeddd3A....", "...AeeedAAA.....", "....AddAAhjA....", "....AAjhAhhA....", "...AhiijgjhA....", "...AhjjhAjhA....", "....AlkAdkkA....", "...AghhAdedA....", "...AhjhhAAA.....", "...AhgjhggA.....", "...AhggjhhA.....", "....AAnnmmA.....", ".....AAAAAA....."]
      },
      stride: [null, null, null, null, "...AnmA.AnmA...."],
      hand: ["e", "d"], sleeve: ["j", "h"]
    },
    // 白魔道士
    whitemage: {
      pal: { d: "#cb2121", e: "#d8dadb", f: "#acacac", g: "#70707f", h: "#7a0b0b", i: "#ff8c39", j: "#ffc68c", k: "#ffefde", l: "#f0f0f0", m: "#b54545" },
      map: {
        down: ["................", "................", ".....deefd......", ".....deefdA.....", "....fdeefdgA....", "...Afdeefdf3A...", "...AgdfefdfgA...", "...AhdddddhgA...", "...h2iijii1hA...", "...A2AAkAA12A...", "...32kAjjA123...", "....2jAjjA12....", "...AgAjjjjAgA...", "..AleAAiiAAelA..", "..AegdfeffdgeA..", "..AfgheleffgfA..", ".AimAhelefdAmiA.", ".AijehfefghAjiA.", ".AijedelefdfjiA.", "..AAefeleffeAA..", "...gedelefdeg...", "...ghdfeefdhg...", "....AhddddhA....", ".....AmAAmA....."],
        up: ["................", "................", ".....hffggh.....", ".....ggAAAA.....", "....AfeffggA....", "...AgfeeffggA...", "...AggfffgggA...", "...AggggggggA...", "...AhhgggghhA...", "...A33dddh33A...", "...A23333333A...", "...A23323333A...", "...AA33233AgA...", "..AfgAAAAAggfA..", "..AggggggggggA..", "..AggfeffggggA..", ".AimgffefffgmiA.", ".AijAhffffhgjiA.", ".AijAhhfdhhAjiA.", "..AAAffffffAAA..", "...ggfeffffgg...", "...hhfefgfghh...", "....AhddhdhA....", ".....AmAAmA....."],
        side: ["................", "................", "..eefd..........", "..eefd3AAAA.....", "..fefdfffggA....", "..feghffffggA...", "..ggghffffggA...", "..hhhhgffgggA...", "..2AiihhggggA...", "..2AjAA2hhhhA...", "..3AjAk13233A...", "..3AjAi13233A...", "..3AjjiiA233A...", "...33iiAgggAA...", "....AAfggfeg....", "....Aldfgfeg....", "....AedggffA....", "....AlgAijmA....", "....flfAijiA....", "....fedeAAAg....", "....gedeffgg....", "....gfdffggg....", "....ddhdhhhh....", ".....AAAAAA....."]
      },
      stride: [null, null, null, null, "...AmhA.AmhA...."],
      hand: ["j", "i"], sleeve: ["e", "f"]
    },
    // ---- 組み合わせの上級職（2026-10-26 保護者が描きなおした絵。前・後ろ・横（左向き）の 16×24。1行下げて入れた）。
    // 髪の色は顔の番号で変わる（2026-10-26 保護者の希望。基本職と同じく、絵の髪を ふつう→1・影→2・こい影→3・光→4 に分けた）。忍者は顔をおおうので変わらない。stride はもとの職の足の形に、この絵の色をのせた（マントは足の後ろに残す）
    // 魔法剣士（黒いよろいと赤いマント）
    magicknight: {
      pal: { a: "#b9bab4", b: "#9b7e6a", c: "#5e3434", d: "#ff8c39", e: "#706d7d", f: "#a51f1f", g: "#ffc68c", h: "#ffefde", i: "#4c0d0d", j: "#2c2c2f", k: "#553514", l: "#8d4016", m: "#5e3838", n: "#b54545" },
      map: {
        down: ["................", "................", ".....AAAAAA.....", "....A411122A....", "...A11111112A...", "..A4112121112A..", "..A4212122112A..", "..A1212122212A..", "..A122d22d222A..", "..A22AAd2AA22A..", "...22efggAhA2A..", "...AAgiggAgAA...", ".AAhfAggggAffhA.", "..AAhhAddAjhhA..", "..AeAAjjjjAAeA..", "..AejjklfijjeA..", ".AjjAkjjjjkAjjA.", ".AjeAjklfijAejA.", ".AjeAAjjjjAAejA.", "..AAAjejjejAAA..", "..fiAmjjjjmAif..", "..fiAmnAAnmAif..", "....AmmAAmmA....", ".....AnAAnA....."],
        up: ["................", "................", ".....AAAAAA.....", "....A412212A....", "...A11121112A...", "..A1111111112A..", "..A1121111112A..", "..A2121121122A..", "..A2122121122A..", "..A2222221222A..", "..A2222222222A..", "...A222A222AA...", ".AffAAcAAcAAAfA.", "..AiiAAiiAAiiA..", "..AdfeiifiiedA..", "..AffihfffhifA..", ".AdffiihhefifdA.", ".AdfiiiehififdA.", ".AffiifehifiifA.", "..ffiifehiffif..", "..ffiifheiffif..", "..ffiifheiffif..", "....AmmAAmmA....", ".....AnAAnA....."],
        side: ["................", "................", "....AAAAAAA.....", "...A4111112AA...", "..A1111111122A..", ".A11111221122A..", ".A11211222112A..", ".A21221122212A..", "..212d2122222A..", "..A2dAA221222A..", "...AdAh221222A..", "...AgAg2d122A...", "...AgggdAfffhA..", "....AddAAhhhA...", "....AAjjAjeAf...", "....AlfjAjeAf...", ".....jjjAjjAif..", ".....lfAjejAif..", ".....AAAjejAif..", ".....jAeAAAiif..", ".....jAejjAiff..", "....AAAAmmA.ff..", "....AAnnmmA.f...", ".....AAAAAA....."]
      },
      stride: ["....AjAejjAiif..", "...AmmAeAmmAff..", "...AmmAAmAmmAf..", "..AnnmAnmAnmmA..", "..AAAAAAAAAAAA.."],
      hand: ["g", "d"], sleeve: ["e", "j"]
    },
    // 忍者（紺の忍び装束。顔をおおうので髪の色は変わらない）
    ninja: {
      pal: { a: "#2f2c4a", b: "#484678", c: "#6b6188", d: "#a29cca", e: "#606060", f: "#848a8a", g: "#b64343", h: "#ff8c39", i: "#ffc68c", j: "#c47327", k: "#71702f" },
      map: {
        down: ["................", "................", "................", ".....AAAAAA.....", "....AaaaaaaA....", "...AaabcbbaaA...", "...AabcdbbbaA...", "...AaaaaaaaaA...", "...AeefgffeeA...", "...aeeffgfeea...", "...aAAAhAAAAaa..", "....AiAhiAiA.a..", "....AAbcbbAA....", "...dcaAbbAacd...", "..acbacAAdabcA..", "..acbcbbdcbbcA..", "..ebAebdcceAbe..", "..bfAaeffeaAfb..", "..biAbbbbbbAib..", "..AAAbcaacbAAA..", "....AbcaacbA....", ".....abaaba.....", ".....ggAAgg.....", ".....AjAAjA....."],
        up: ["................", "................", "................", ".....AAAAAA.....", "....AacbaaaA....", "...AabbbbbbaA...", "...AaabbbbaaA...", "...AAAAAAAAAA...", "...AAAaaaaAAA...", "...AaaaaabaaA...", "....Aaaaaabb....", ".....AAAAAb.....", "....bbabbabb....", "...cbabaababc...", "..AbAbbbbbaAbA..", "..AbAbbbbbaAbA..", "..ebAabbbaaAbe..", "..beAaeeeeaAeb..", "..biAaabbaaAib..", "..AAAabaabaAAA..", "....abbaabba....", ".....bbaabb.....", ".....ggAAgg.....", ".....AjAAjA....."],
        side: ["................", "................", "................", ".....AAAAAAA....", "....AccbbaaaA...", "...AcbbbbbaaaA..", "...AbbbbbaaaaA..", "...AbbaaaaAAAA..", "...AgfeeAAAAAA..", "...AffeekaaaaA..", "...AhAAhbbaaA...", "...AiAibbaaA.b..", "...AbbbaaAA...b.", "....AaaAAbcA....", "....AAbaAabA....", "...AbdcbacbA....", "...AbcbaAcbA....", "....AfeAheeA....", "....acbAhbbA....", ".....cbbAAA.....", ".....acbaA......", "......acbA......", ".....AjjgA......", ".....AAAAA......"]
      },
      stride: ["....AcbAAcbA....", "...AcbAbAbaA....", "...AbaAcbAbaA...", "..AjjgAjgAjjgA..", "..AAAAAAAAAAAA.."],
      hand: ["i", "h"], sleeve: ["b", "a"]
    },
    // 剣闘士（はだかの胸と緑のズボン。腕もはだか）
    gladiator: {
      pal: { a: "#593131", b: "#b9bab4", c: "#9b7e6a", d: "#ff8c39", e: "#ffc68c", f: "#ffefde", g: "#a54848", h: "#4d2d14", i: "#1a511e", j: "#a78767", k: "#f0f3c4", l: "#5c761b", m: "#253224", n: "#1e3e18" },
      map: {
        down: ["................", "................", ".....241214.....", "....42412112....", "...2112221224...", "...1222222212...", "...222dedd222...", "...12defedd22...", "...22AdedAA22...", "...22AAdAAAA2...", "...2AgAggAgA2...", "..AggAdeedAggA..", ".AhAghAddAhgAhA.", "..AdAghfehgAdA..", "..AeAgheehgAeA..", "..AedhhddhhdeA..", ".AghAhheehhAhgA.", ".AhgAijkkjiAghA.", ".AhgAAliilAAghA.", "..AAAiliiliAAA..", "....AmiiiimA....", "....AmnAAnmA....", "....AmmAAmmA....", ".....AnAAnA....."],
        up: ["................", "................", ".....141111.....", "....41412111....", "...4111124211...", "...1121124212...", "...2121121212...", "...2121121222...", "...2121121222...", "...2221221222...", "...A22222222A...", "..ggA22A222Agg..", ".AAghAAhAAAhgAA.", "..AAhAhhhhhhAA..", "..AdAhgggghAdA..", "..AdAhhgghhAdA..", ".AghAghhhhgAhgA.", ".AhgAghhhhgAghA.", ".AhgAAAAAAAAghA.", "..AAAiliiliAAA..", "....AmiiiimA....", "....AmnAAnmA....", "....AmmAAmmA....", "....AAnAAnAA...."],
        side: ["................", "................", ".....4121112....", "....422222222...", "...1224411122...", "...12122222123..", "...Ad222111213..", "...Aedd1122223..", "...AfdAd2e123A..", "...AeAAded223A..", "...AgAgddd233A..", "...AeeddAgggAA..", "....AddAhgAAhA..", ".....AAhAddhh...", ".....dhgAdeAh...", ".....ehgAdeAh...", ".....dhgAhgAh...", ".....khAhghAh...", ".....AAAhghA....", ".....iAlAAA.....", ".....iAliiA.....", "....AAAAmmA.....", "....AAnnmmA.....", ".....AAAAAA....."]
      },
      stride: ["....AiAliiA.....", "...AmmAlAmmA....", "...AmmAAmAmmA...", "..AnnmAnmAnmmA..", "..AAAAAAAAAAAA.."],
      hand: ["e", "d"], sleeve: ["e", "d"]
    },
    // 聖騎士（白いよろいと青いマント）
    paladin: {
      pal: { a: "#ffefde", b: "#9b7e6a", c: "#5e3434", d: "#ff8c39", e: "#eeeeed", f: "#ffc68c", g: "#1c1a67", h: "#2648cc", i: "#898989", j: "#bdbdbd", k: "#c48e00", l: "#ffde68", m: "#551414" },
      map: {
        down: ["................", "................", ".....AAAAAA.....", "....A411122A....", "...A11111112A...", "..A4112121112A..", "..A4212122112A..", "..A1212122212A..", "...122d22d222A..", "...22AAd2AA22...", "....2eAffAaA2...", "....AfAffAfA....", ".AghhAffffAhhgA.", "..AAggAddAggAA..", "..AiAAiiiiAAiA..", "..AeijjaajjieA..", ".AklAmijjimAlkA.", ".AjeAkkiikkAejA.", ".AjeAAilliAAejA.", "..AAAjejjejAAA..", "..hgAcjiijcAgh..", "..hgAcbAAbcAgh..", "....AccAAccA....", ".....AbAAbA....."],
        up: ["................", "................", ".....AAAAAA.....", "....A412212A....", "...A11121112A...", "..A1111111112A..", "..A1121111112A..", "..A2121121122A..", "..A2122121122A..", "...2222221222...", "...A22222222A...", "....A22A222A....", ".AhggAAAAAAgghA.", "..AggggggggggA..", "..AjhkgghgkhjA..", "..AhhglkklhghA..", ".AjhhggllhhghjA.", ".AjhgglhllhghjA.", ".AhhgkhhkgkgghA.", "..hhgkhhhgkhgh..", "..hhkghhhghkgh..", "..hhkghhhghkgh..", "....AccAAccA....", ".....AbAAbA....."],
        side: ["................", "................", "....AAAAAAA.....", "...A4111112AA...", "..A4111111122A..", ".A11111221122A..", ".A11211222112A..", ".A21221122212A..", "..212d2122222A..", "..A2dAA22f22A...", "...AdAa22d2A....", "...AfAf2d1A.....", "...AfffdAhhhgA..", "....AddAAgggA...", "....AAiiAjeAh...", "....iejiAjeAh...", "....ijimAlkAgh..", ".....lkAjejAgh..", ".....AAAjejAgh..", ".....jAeAAAggh..", ".....jAejjAghh..", ".....AAAccAghh..", "....AAbbccA.h...", ".....AAAAAA....."]
      },
      stride: ["....AjAejjAggh..", "...AccAeAccAhh..", "...AccAAcAccAh..", "..AbbcAbcAbccA..", "..AAAAAAAAAAAA.."],
      hand: ["l", "k"], sleeve: ["e", "j"]
    },
    // 賢者（むらさきのローブ）
    sage: {
      pal: { a: "#592a2a", b: "#815656", c: "#ba8787", d: "#f3cf76", e: "#b39400", f: "#ff9b53", g: "#ffcd9a", h: "#ffefde", i: "#48284c", j: "#aa55b9", k: "#7f2975", l: "#782580", m: "#b54545", n: "#5e3838" },
      map: {
        down: ["................", "................", "................", ".....AAAAAA.....", "....A214412A....", "...A2112211dA...", "...A2122241eA...", "...A11fggf4AA...", "...A1fghgg41A...", "...A1AAhAA41A...", "...21hegge412...", "...i1gdggd41i...", "...eiAggggAie...", "...jedAffAAdj...", "..AkildkldeikA..", "..AlilkedllilA..", ".AfmAiedkleAmfA.", ".AfgieldleeAgfA.", ".AfgiikekliigfA.", "..AAklkedlkiAA..", "...ikldAedlli...", "...ikieAAeiAi...", "...iAeAAAAeAi...", "...eenmAAmnee..."],
        up: ["................", "................", "................", ".....AAAAAA.....", "....A144212A....", "...A11112112A...", "...Ad1111112A...", "...Ade112112A...", "...AeA112122A...", "...AA2112122A...", "...A22112222A...", "...A22222222A...", "...AA22222AiA...", "..AeiAAAAAiieA..", "..AieiiiiiieiA..", "..AiidAAAAeiiA..", ".AgmilddeelimgA.", ".AgfiileeliifgA.", ".AffiiilliiiffA.", "..AAillillliiA..", "...AilkillliA...", "...AilkliliiA...", "...AilkliliAA...", "...eedddeeeee..."],
        side: ["................", "................", "................", "....222AAAA.....", "...111111222....", "..A2111111222...", ".A12241111222...", ".A1Aff4111122...", ".A1Ahgf41112A...", "..1AgAA42122A...", "..2Ageh42122A...", "..2Agdf42122A...", "..2AggffA122A...", "...22ffAiAAAei..", "....AAeiilkiAe..", "....AeklilkiAi..", "....ekliillAA...", "....djiAfgmA....", "....djlAfgfAl...", "....eklkAAAli...", "....eklkllili...", "....idillkiiA...", "....iedlniiiA...", ".....Aeddeeee..."]
      },
      stride: [null, null, null, null, "...AnmAdAnmAe..."],
      hand: ["g", "f"], sleeve: ["j", "k"]
    },
    // 魔物使い（狩人＋魔術師。とがった髪と緑の服。2026-10-26 の絵。職はまだ作っていない）
    tamer: {
      pal: { a: "#595959", b: "#bababa", c: "#818181", d: "#ff8c39", e: "#ffefde", f: "#ffc68c", g: "#295c40", h: "#88a898", i: "#7d7b18", j: "#2b2b85", k: "#f3d27f", l: "#69c3e5", m: "#5e3838", n: "#b54545" },
      map: {
        down: ["................", ".......2........", "...2..22.222....", "...22A42212.....", "...4221242241...", "...21222122122A.", ".A14122222122A..", "..A22122d2242...", "..1212d2dd2212..", ".A212AA2AAA22A..", "...12eAffAeA22..", "..ghgfAffAfAhg..", ".ggghAffffAhggg.", "..AggAAddAAggA..", ".gAfghgggghgfAg.", "..AfdghhhhgdfA..", ".AdiAiggggiAidA.", ".AdfAjikkijAfdA.", ".AdfAAljjlAAfdA.", "..AAAdfmmfdAAA..", "....AmdmmdmA....", "....AmnAAnmA....", "....AmmAAmmA....", ".....AnAAnA....."],
        up: ["................", "........2.......", "....222.22..2...", ".....21224A22...", "...1422421224...", ".A22122122212...", "..A22122222141A.", "...2422222122A..", "..212222222121..", "..A22222222212A.", "..22122212221...", "..gh11A21A2ghg..", "...AgAA21AAgg...", "..gggggA2AAggg..", ".gggghhA2Ahgggg.", "..AdgggAAgggdA..", ".AdiAAgAggAAidA.", ".AdfAjiiiijAfdA.", ".AdfAAljjlAAfdA.", "..AAAdfmmfdAAA..", "....AmdmmdmA....", "....AmnAAnmA....", "....AmmAAmmA....", ".....AnAAnA....."],
        side: ["................", "......2.........", "....2.222.......", ".22A12412222....", "..12421221222...", "..212122221122..", ".2222221422222A.", "224122221422222.", ".2422f22212222..", "..12fAA22f222A..", "..2AfAed2d222...", "..2AfAfddgg21...", "...AfffdghgA21..", "....Addghggg21..", "....AAgggAAgA2..", "....AhhgAdfA.A..", "....AgggAkiA.A..", "....AkiAdfdA....", ".....AAAdfdA....", ".....jAlAAA.....", ".....dAfddA.....", "....AAAAmmA.....", "....AAnnmmA.....", ".....AAAAAA....."]
      },
      stride: ["....AjAljjA.....", "...AmmAfAmmA....", "...AmmAAmAmmA...", "..AnnmAnmAnmmA..", "..AAAAAAAAAAAA.."],
      hand: ["f", "d"], sleeve: ["f", "d"]
    }
  };
  // 横向きの攻撃：前（左）へのばす腕の色 [そで, そでの影]
  var SLEEVE = { warrior: ["I", "J"], mage: ["N", "L"], hunter: ["Q", "O"], fighter: ["E", "F"], priest: ["U", "T"] };

  function grid(rows) { return rows.map(function (r) { return r.split(""); }); }
  function rowsOf(g) { return g.map(function (r) { return r.join(""); }); }
  // x0〜x1 の列の足（19〜23行め）を1点上げる
  function lift(g, x0, x1) {
    for (var y = 19; y <= 23; y++) for (var x = x0; x <= x1; x++) if (g[y][x] !== ".") g[y - 1][x] = g[y][x];
    for (x = x0; x <= x1; x++) g[23][x] = ".";
  }
  // y0〜y1 行の x0〜x1 列を、dy 行ずらす（腕を上げるなど）
  function shiftUp(g, x0, x1, y0, y1, dy) {
    var keep = [], y, x;
    for (y = y0; y <= y1; y++) { keep.push(g[y].slice(x0, x1 + 1)); }
    for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) g[y][x] = ".";
    for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) { var ch = keep[y - y0][x - x0]; if (ch !== ".") g[y - dy][x] = ch; }
  }
  // 上半身（0〜rows行め）を左（前）へ1点ずらす：走るときの前かがみ
  function lean(g, rows) {
    for (var y = 0; y <= rows; y++) { g[y].shift(); g[y].push("."); }
  }

  function swapStr(str, sw) { if (!str || !sw) return str; return str.split("").map(function (c) { return sw[c] || c; }).join(""); }
  function frameMap(job0, dir, frame) {
    var job = baseJob(job0), lk = LOOK[job0] || null, sw = lk ? lk.swap : null;
    var art = ART[job0] || null;   // 保護者の新しい絵（2026-10-25）があれば、それを使う
    var base = art ? art.map[dir] : lk && lk.map ? lk.map[dir] : (MAP[job] || MAP.warrior)[dir];
    var g = grid(base), y, x;
    // 上級職：頭の行をおきかえる（head）・点を打つ（put）。歩く・走るの形を作る前に行う（2026-10-19）
    if (lk && lk.head && lk.head[dir]) Object.keys(lk.head[dir]).forEach(function (r) { g[+r] = lk.head[dir][r].split(""); });
    if (lk && lk.put && lk.put[dir]) lk.put[dir].forEach(function (pt) { g[pt[1]][pt[0]] = pt[2]; });
    var walk = frame === "walkA" || frame === "runA" ? 1 : frame === "walkB" || frame === "runB" ? -1 : 0;
    var run = frame === "runA" || frame === "runB";
    if (dir !== "side") {
      if (walk > 0) lift(g, 2, 7);
      if (walk < 0) lift(g, 8, 13);
      if (frame === "attack") {
        // 前：右手（絵の右）を上げる。後ろ：左手（絵の左）を上げる
        if (dir === "down") shiftUp(g, 11, 14, 13, 17, 2); else shiftUp(g, 1, 4, 13, 17, 2);
      }
    } else {
      var st = art ? art.stride : STRIDE[job] || STRIDE.warrior;
      if (art) sw = null;   // 新しい絵の足は、もうその職の色
      var stride = walk > 0 || frame === "attack";
      if (stride) for (y = 0; y < 5; y++) if (st[y]) g[19 + y] = swapStr(st[y], sw).split("");
      if (walk < 0) lift(g, 8, 11);
      if (run) lean(g, 17);
      if (frame === "attack") {
        var s = SLEEVE[job] || SLEEVE.warrior;
        if (art) s = art.sleeve;
        else if (lk && lk.sleeve) s = lk.sleeve;   // 職ごとの腕の色（2026-10-21）
        else if (sw) s = [sw[s[0]] || s[0], sw[s[1]] || s[1]];
        var hd = art && art.hand ? art.hand : ["E", "F"];
        var arm = [["A", "A", "A", "A", "A"], ["A", hd[0], s[0], s[0], s[0]], ["A", hd[1], s[1], s[1], s[1]], ["A", "A", "A", "A", "A"]];
        for (y = 0; y < 4; y++) for (x = 0; x < 5; x++) g[13 + y][x] = arm[y][x];
      }
    }
    return g;
  }

  function paint(job, hairId, dir, frame) {
    var g = frameMap(job, dir, frame);
    var lk = LOOK[job] || null, sw = lk ? lk.swap : null, bodySw = lk ? lk.body : null;
    if (ART[job]) lk = ART[job];   // 新しい絵は、職ごとの色の一覧だけを使う
    if (lk && lk.map) { sw = null; bodySw = null; }   // 描いた地図は、もう上級職の色になっている
    if (lk && lk.add && lk.add[dir]) lk.add[dir].forEach(function (pt) { if (g[pt[1]][pt[0]] === ".") g[pt[1]][pt[0]] = pt[2]; });
    var hair = HAIR[(hairId | 0) % HAIR.length];
    var cv = document.createElement("canvas"); cv.width = SW; cv.height = SH;
    var ctx = cv.getContext("2d");
    var flip = dir === "side";   // 地図は左向き。絵は右向きにする
    for (var y = 0; y < SH; y++) for (var x = 0; x < SW; x++) {
      var ch = g[y][x], col = null;
      var rw = lk && lk.rows && lk.rows[dir] ? lk.rows[dir][y] : null;
      if (rw && rw[ch]) ch = rw[ch];
      else if (bodySw && y >= 12 && bodySw[ch]) ch = bodySw[ch];
      else if (sw && sw[ch]) ch = sw[ch];
      if (ch >= "1" && ch <= "4") col = hair[ch.charCodeAt(0) - 49];
      else if (lk && lk.pal && lk.pal[ch]) col = lk.pal[ch];   // 職ごとの色の一覧（組み合わせの上級職）
      else if (PAL[ch]) col = PAL[ch];
      if (!col) continue;
      ctx.fillStyle = col; ctx.fillRect(flip ? SW - 1 - x : x, y, 1, 1);
    }
    return cv;
  }

  // ---------- 手に持つ武器 ----------
  var WCOL = {
    blade: pal(["#5a6078", "#c8ccd8", "#ffffff"]), gold: pal(["#7a5a18", "#c8a040", "#f0d070"]), wood: pal(["#4a2c14", "#7a4e26", "#a87840"]),
    gem: pal(["#1a7a9a", "#5ad8f8", "#d8f8ff"]), string: pal(["#c8c0a8", "#e8e0c8", "#ffffff"])
  };
  function hex(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function pal(list) { return list.map(hex); }
  function px(ctx, x, y, c) { ctx.fillStyle = "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); }
  // (x0, y0) から向き (dx, dy) に len 点、太さ wid の棒
  function bar(ctx, x0, y0, dx, dy, len, wid, P) {
    for (var i = 0; i < len; i++) for (var w = 0; w < wid; w++) {
      var x = x0 + dx * i - dy * w, y = y0 + dy * i + dx * w;
      px(ctx, x, y, P[w === 0 ? 2 : 1]);
      if (i === len - 1) px(ctx, x, y, P[0]);
    }
  }
  // weapon：sword・greatsword・axe・bow・fist・staff。face：向き。mode：hold（持つ）・attack（ふる）・back（背中にしまう）
  // 手の場所：前は絵の右手（足もとから右へ5・上へ7）、後ろは絵の左手、横は体のうしろよりの手（足もとから後ろへ2・上へ7）。
  // 横で持つときは、刃や杖が顔にかぶらないように、体の後ろで少し後ろへたおして立てる
  function drawWeapon(ctx, weapon, face, x, y, mode, ext) {
    if (weapon === "fist") return;   // 拳は手そのもの
    var d = dirOf(face), sx = d.flip ? -1 : 1;
    var hx, hy, dx, dy;
    if (mode === "back") {           // 背中（ななめ）
      hx = x - 4 * sx; hy = y - 18; dx = 0.45 * sx; dy = 0.9;
      if (d.dir === "down") { hx = x + 4; hy = y - 19; dx = -0.45; dy = 0.9; }
    } else if (mode === "attack") {  // 向いているほうへつき出す
      hx = x + face.x * (7 + (ext || 0)); hy = y - 9 + face.y * (5 + (ext || 0) * 0.7); dx = face.x; dy = face.y;   // ext：槍の突きで前へ出す長さ
    } else {                          // 手に持って、少し上に向ける
      if (d.dir === "side") { hx = x - 2 * sx; hy = y - 7; dx = -0.35 * sx; dy = -0.94; }   // 横：体の後ろで立てて持つ（core.js で体より先に描く）
      else if (d.dir === "down") { hx = x + 5; hy = y - 7; dx = 0.2; dy = -0.98; }
      else { hx = x - 6; hy = y - 7; dx = -0.2; dy = -0.98; }
    }
    if (weapon === "sword") { bar(ctx, hx, hy, dx, dy, 9, 1, WCOL.blade); bar(ctx, hx - dy * 1.5 * -1 - dx, hy + dx * 1.5 * -1 - dy, -dy, dx, 3, 1, WCOL.gold); }
    if (weapon === "greatsword") { bar(ctx, hx, hy, dx, dy, 12, 2, WCOL.blade); bar(ctx, hx + dy * 2 - dx, hy - dx * 2 - dy, -dy, dx, 5, 1, WCOL.gold); }
    if (weapon === "axe") {
      bar(ctx, hx, hy, dx, dy, 11, 1, WCOL.wood);
      var ax = hx + dx * 8, ay = hy + dy * 8;
      for (var i = 0; i < 4; i++) bar(ctx, ax + dx * i, ay + dy * i, -dy * (sx || 1), dx * (sx || 1), 4 - Math.abs(i - 1.5) > 2 ? 4 : 3, 1, WCOL.blade);
    }
    if (weapon === "spear") {   // 槍（2026-10-19）：長い木の柄と、銀の穂先
      bar(ctx, hx - dx * 4, hy - dy * 4, dx, dy, 15, 1, WCOL.wood);
      var sx2 = hx + dx * 11, sy2 = hy + dy * 11;
      bar(ctx, sx2, sy2, dx, dy, 4, 1, WCOL.blade);
      px(ctx, sx2 - dy, sy2 + dx, WCOL.blade[1]); px(ctx, sx2 + dy, sy2 - dx, WCOL.blade[1]);
    }
    if (weapon === "staff") { bar(ctx, hx - dx * 3, hy - dy * 3, dx, dy, 14, 1, WCOL.wood); var gx = hx + dx * 11, gy = hy + dy * 11; px(ctx, gx, gy, WCOL.gem[1]); px(ctx, gx + 1, gy, WCOL.gem[0]); px(ctx, gx, gy - 1, WCOL.gem[2]); px(ctx, gx + 1, gy - 1, WCOL.gem[1]); }
    if (weapon === "bow") {
      // 弓：手のところで弧をえがく（弦は直線）
      for (var t = -5; t <= 5; t++) {
        var bend = 2.5 - (t * t) / 10;
        var bx = hx - dy * t * 1 + dx * bend, by = hy + dx * t * 1 + dy * bend;
        px(ctx, bx, by, WCOL.wood[Math.abs(t) > 3 ? 0 : 1]);
        px(ctx, hx - dy * t, hy + dx * t, WCOL.string[1]);
      }
    }
  }

  function hero(job, hairId, dir, frame) {
    var k = job + "|" + hairId + "|" + dir + "|" + frame;
    if (!cache[k]) cache[k] = paint(job, hairId, dir, frame);
    return cache[k];
  }

  // 向き（face：{x, y}）から、down / up / side と、左右反転するか（side の絵は右向き）
  function dirOf(face) {
    if (Math.abs(face.x) > Math.abs(face.y) + 0.01) return { dir: "side", flip: face.x < 0 };
    return { dir: face.y < 0 ? "up" : "down", flip: false };
  }

  // 足もと（x, y）を基準に描く。opt：{ alpha }
  function drawHero(ctx, job, hairId, face, frame, x, y, opt) {
    var d = dirOf(face), img = hero(job, hairId, d.dir, frame);
    ctx.save();
    if (opt && opt.alpha != null) ctx.globalAlpha = opt.alpha;
    if (d.flip) { ctx.translate(Math.round(x), 0); ctx.scale(-1, 1); ctx.drawImage(img, -SW / 2, Math.round(y) - SH); }
    else ctx.drawImage(img, Math.round(x) - SW / 2, Math.round(y) - SH);
    ctx.restore();
  }
  // たおれた姿（横にたおれる）
  function drawDown(ctx, job, hairId, x, y) {
    var img = hero(job, hairId, "side", "stand");
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(Math.PI / 2); ctx.drawImage(img, -SH + 2, -SW / 2); ctx.restore();
  }

  return { SW: SW, SH: SH, hero: hero, drawHero: drawHero, drawDown: drawDown, drawWeapon: drawWeapon, dirOf: dirOf, JOBS: Object.keys(MAP), HAIRS: HAIR.length };
})();
