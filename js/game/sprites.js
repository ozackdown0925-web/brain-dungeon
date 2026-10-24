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
  // 組み合わせの上級職：保護者がペイントで描いた絵（2026-10-21。前・横・後ろの 16×24。横は右向きに描いたので、左右を反転して入れた）。
  // 絵の色が多いので、職ごとの色の一覧（pal。小文字 a〜）を持つ。髪の色は絵のまま（顔の番号では変わらない）。
  // swap は歩くときの足の色、sleeve は横向きで攻撃するときの腕の色（そで・そでの影）。
  // 保護者の絵（2026-10-21）：黒いよろいと赤いマント
  LOOK.magicknight = { from: "warrior", swap: { D: "f", C: "a", J: "l", I: "e" }, sleeve: ["d", "g"],
    pal: { a: "#f1f1ed", b: "#080009", c: "#1f2130", d: "#907a74", e: "#625258", f: "#a43a39", g: "#000010", h: "#872427", i: "#bfa9a2", j: "#060815", k: "#030210", l: "#232639", m: "#19192b", n: "#41293c", o: "#34060c", p: "#b97a57" },
    map: {
      down: [".....AAAAAA.....", "....AccgmncA....", "...AcnegceecA...", "...AkcemkcecA...", "..AkccbppbcckA..", "..AjnmedpekmgA..", "...AmkmppleggA..", "....AfnppedeA...", ".AA.AoppppdbAAA.", ".AaAabbddbkaeaA.", "..AlbdlaajbblA..", "..AacmeddeniaaA.", "..AjjllednngAA..", ".AelgAjnnjmgmdA.", ".AibkklddmbjbaA.", ".AnAbjndibbkgnA.", ".AdbjngnejAgbeA.", ".AhelaideaajnbA.", "..AbiebiigbionA.", "..AobdikkdiboiA.", ".AboonndbcncooA.", ".AbAjcllAcjkAoA.", ".AA.AelAAleA.AA.", "....AAAA.AAA..A."],
      up: [".....AAAAAA.....", "....AbeecmjA....", "...AkeeecAmA....", "...AceccgcggA...", "..AjccgccmckA...", "..AAAccgcAmjA...", "...AmkmgjjmgA...", "....AgkgcggA....", ".AA.AkggkgkA.A..", ".AaAdbiaaddbAA..", "..AlmbfoofdmnA..", "..AdohhffhibiA..", "..AjAoiooaijkA..", "..AcdohaifibmA..", ".AjbahfaafhablA.", ".AlgiffaafhajeA.", ".AlahffaafhhiAA.", "..AahffaafhhA.A.", "..AhhffaafhfaA..", "..AhhfhaahfhiA..", "..AhhfdaaofhhA..", ".AihhfdaaofhhaA.", ".AidhfdaaohhdiA.", "..AAAAAAAAAAAA.."],
      side: ["....AAAAAA......", "...AjAcjceAA....", "..AkkjcceelA....", "..AgjmcmgcgA....", "..AkkmeblckA....", "..AedegbgcgA....", "...AnbAibjA.....", "...AeifbkA......", "...AidbaadAA....", "....AdamibA.....", "....AdbeilA.....", "...AdAelljaA....", "...AnlbaaaaA....", "....AmgddmaA....", "....AblkAeaA....", "....AbjlebbfA...", "....AcgddbbfA...", "....AibfdbbfA...", "....AAdddobafA..", "....AeiccooafA..", ".....AjdgknafA..", ".....AlmnkAafA..", ".....AlelA.AA...", ".....AAAAA.A...."] } };
  // 保護者の絵（2026-10-21）：顔をおおう紺の忍び装束
  LOOK.ninja = { from: "hunter", swap: { C: "e", D: "c" }, sleeve: ["n", "l"],
    pal: { a: "#3d314a", b: "#16192c", c: "#1e1830", d: "#987565", e: "#000013", f: "#41394d", g: "#333147", h: "#232738", i: "#050518", j: "#2e293f", k: "#1b132b", l: "#201e31", m: "#06000d", n: "#030213", o: "#111022" },
    map: {
      down: [".....AAAAAA.....", "....AafaaagA....", "...AjgaaaajgA...", "...AgjaaagghA...", "...AjkkkkkcbA...", "...AjjddddaoA...", "...AcmmddmmbA...", "...AcfoffcfAA...", "....AlhffjdA....", "....AicffliA....", "...A.AiggiA.A...", "...AAhbehehAA...", "..AdmhbbghifA...", "..AdmibhbhnfdA..", "..AleehnbbeifA..", "..AiebgeifiilA..", ".AflnAehjjehdA..", ".AAflbleeAbidAA.", "...AiAbeA.AnA...", "...AA.AeiAjA....", "....AAbAibcA....", "....AfA.AbfA....", "....AbA..AbA....", "....AAA..AAA...."],
      up: [".....AAAAAA.....", "....AgaaaagA....", "...AhfhaaaahA...", "...AajaaaaaaA...", "...AgkaaaacfA...", "...AcccgacclA...", "...AckckkkccA...", "....AocccciA....", "....AgekcigA....", "...AAnngaknA....", "...A.AAAgoA.A...", "...AA...AA.AA...", "...AdAAAA.AddA..", "..AdfblglAmfdA..", "..AkeilcbbiedA..", "..AbihgAAebncA..", "..AmihA..AlioA..", "..AmnA...AbnAA..", "...AbbAAAlAA....", "....AbfeiA.A....", "....AcbeebAA....", "....AjjAAohA....", "....AbA..AbA....", "....AAA..AAA...."],
      side: [".....AAAAA......", "....AjaaajA.....", "...AgfajaagA....", "...AagafgaajA...", "...AkckbkakcA...", "...AddddbgkcA...", "...AdmddbgccA...", "...AfgafhcoA....", "...AafachcA.....", "....AfoeleA.....", ".....AleeAhA....", ".....AbhddiA....", "....AhhjddA.....", "....AlhnddA.....", ".....AlehfA.....", ".....AjnAjA.....", "....AneA.AA.....", "....AmmA.AA.....", ".....AkmAiA.....", ".....AighcA.....", ".....AbecbA.....", "......AeelA.....", "......AbeiA.....", "......AAAAA....."] } };
  // 保護者の絵（2026-10-21）：はだかの上半身と茶色の腰布
  LOOK.gladiator = { from: "warrior", swap: { D: "e", C: "d", J: "d", I: "d" }, sleeve: ["c", "i"],
    pal: { a: "#010215", b: "#714032", c: "#c28d6d", d: "#523b35", e: "#422826", f: "#c0896a", g: "#06020d", h: "#1c0103", i: "#855940", j: "#141423", k: "#00010d", l: "#a9785d", m: "#c49579", n: "#3e1a22", o: "#0e1120", p: "#c3c3c3", q: "#000000" },
    map: {
      down: [".....aAAAAA.....", "....aAdjjjjA....", "...aadAjjdojA...", "..aAkAqAageaA...", "..aAkjAmmigjkA..", "..aAjkcmccigoA..", "..aAjakddhkaoA..", "...aApkddkpiA...", "....aidmcdiA....", "...AAailliaiA...", "..AcfcaiiafcmA..", "..AcbcfffclbcA..", ".AfmdlfllfieclA.", ".AmbeicfflbgicA.", ".AmkghhhhhhgefA.", ".AighnbbnbngnlA.", ".AfhkghanehadcA.", ".AlAeddhebngAAA.", "..A.AbnbebdA....", "...AbbeggnbA....", "...AbbekgebbA...", "....AeAAAeeA....", "....AdA..AA.....", "....AAA..AAA...."],
      up: ["......AAAA......", "....AAaaaaA.....", "....AjakaojA....", "...AaajajjaAA...", "...AaaakaaaaA...", "...AaaaaaaaaA...", "...AaaaaaaaaA...", "...AAaaaaaaAA...", "....AAaakkAA....", "...AAAmAAAiAA...", "..AmccccffffmA..", "..AfiffcfccifA..", "..AcbifilcibfA..", "..AfgfcflclhlA..", ".AmlkhhhhhhgbmA.", ".AlbabbenbnaelA.", ".AcdgddbbbegbfA.", ".AAAgebbbbegAAA.", "....AdeneebA....", "....AbbkabbA....", "....AbekjeieA...", "....AeeAAedA....", "....AeA..AeA....", "....AAA..AAA...."],
      side: ["......AAAAA.....", "....AAddjdjA....", "...AkjooodjjA...", "...AakkkgkejA...", "...AgmmgakjjA...", "....AmmcgkaaA...", "....AdhdgmaaA...", "....AdhpigaAA...", "....AcdcigAA....", ".....AlbbcAA....", "......AffccA....", ".....AmmnllA....", ".....AfidlclA...", ".....AflbncfA...", "......AhhdfA....", "......AnnlcA....", "......AneciA....", "......AnlchgA...", "......AnhihA....", ".......AddeA....", ".......AdbeA....", ".......AhenA....", "........AddA....", ".......AAAAA...."] } };
  // 保護者の絵（2026-10-21）：白と金のよろい、金の髪
  LOOK.paladin = { from: "warrior", swap: { D: "l", C: "g", J: "k", I: "o" }, sleeve: ["f", "b"],
    pal: { a: "#d8c678", b: "#a9a99d", c: "#959286", d: "#f4fcf2", e: "#b6945a", f: "#090205", g: "#010109", h: "#987b48", i: "#fafdf7", j: "#c7b37b", k: "#716f70", l: "#4e4948", m: "#ded296", n: "#1e181b", o: "#f2f0d3" },
    map: {
      down: [".....AAAAAA.....", "....AmahamhA....", "...AammhamjhA...", "...AemaahaahA...", "..AeaaheehaaA...", "..AeaeeeehamhA..", "...AjlgjjfhmA...", "...AhecjjbhfA...", "...AjejejjhdA...", "..AicmfhhficiA..", "..AbchcjbcecbcA.", "..AnncmhaebnnA..", "..AnnbhhehbgnA..", ".AblgkbaeekgkbA.", ".AdcggkjjkggkoA.", ".AcAAkljblAAnbA.", ".AlgkicobconglA.", ".AggbfcbbcfbAkA.", ".AlnngAbcfggAlA.", ".AdglkbnnckglkA.", ".AillbjkgjbglcA.", ".AiglcfkckcglcA.", ".AoAAcicgocgAcA.", "..A..AAAAAAA.A.."],
      up: ["....AAAAAA......", "....AaaaajA.....", "...AaaaaaajA....", "..AaaaaaaaaA....", "..AaaaaaaaaA....", "..AaeahaaeaeA...", "..AeaehaaeaA....", "...AneeeeehA....", "...AcfeaaefoA...", "..AdoogffffcdA..", "..AbbcbodbncbkA.", ".AlffkbcbdbnnA..", "AclnncbidobinA..", "AkfkgoimooikgbA.", "AcfofiiidddmfbA.", ".AlcfbiddddcfA..", "..AnmbbddiocmA..", "..AkiboddddcoA..", "..AbciddddddbA..", "..AocdidddiibiA.", "..AcididddiddcA.", ".AjbdbiddddbdcmA", "..AembidddibmcA.", "...AAAAAAAAAAA.."],
      side: [".....AAAAA......", "....AaeaaaAA....", "...AaameaaaA....", "..AmeamahaaA....", "..AmhhamhaaA....", "...AejhaheaA....", "....AffaheeA....", "....AcmhleeA....", "....AjjfffA.....", ".....AfkccA.....", "....AbbbmdbA....", "....AjbjAnbA....", "....AhofjjfA....", "....AcbglmkA....", "....AblfeojA....", ".....AfgmbniA...", "....AkdfobgiA...", "....AllbbbfiA...", "....AlggkkliA...", "....AkongglmA...", ".....AccgAljdA..", ".....AfkblgjaA..", ".....AkobcfaA...", ".....AAAAAAA...."] } };
  // 保護者の絵（2026-10-21）：むらさきのローブ、銀の髪
  LOOK.sage = { from: "priest", swap: { J: "e" }, sleeve: ["a", "g"],
    pal: { a: "#5f2656", b: "#8f918f", c: "#6b5d56", d: "#c59f86", e: "#3c1133", f: "#0b010c", g: "#2a182d", h: "#582b50", i: "#757572", j: "#54254d", k: "#451c3e", l: "#937a6e", m: "#220c1e", n: "#644343", o: "#140512" },
    map: {
      down: [".....AAAAAA.....", "....AibcibbA....", "....AbiiiiiiA...", "...AbibccbbcA...", "...AcbbclcbiiA..", "...AcbcddlcbbA..", "...AccfddffbA...", "....AldddidiA...", "...AfldddddkdA..", "...AmmkccfndA...", "..AijedemjdahA..", "...AodlibednmA..", "..AjeocnmdffjnAA", "AAcljgcgkfefhcdA", "AdlcjglkifeonmcA", "AffnojlcdokmmffA", "AlfcfalghfkgmffA", ".AofgalghfeamffA", ".AgkeacgafkhklA.", "..AjaadkjgdajmA.", "..AkajdjaedaahA.", ".AjhadfaakfjaejA", ".AkjalfaajfcakkA", ".AAAAAAAAAAAAAA."],
      up: [".....AAAAA......", "....AbbbbbA.....", "...AbbbbbbbA....", "...AbbbbbbbA....", "...AbbbbbbbcA...", "..AcicbbbibcA...", "...AiccbccbcA...", "....AlllllgA....", "...AdejjhkdfA...", "...AkaaaaahgA...", "..AghhooojhhA...", "..AfdaaaahkdmA..", "..AemdnnndcoA...", "..AjggAAAmgeA...", "..AhggeaaggghA..", ".AhgmjaahhhoeA..", "..AggaaaahhggA..", ".AnfkaaaaajeoA..", "..AAheaaaaejgA..", "..AgheaaaaejA...", "..AgaeaaaaehgA..", "..AjjhaaaaaaeA..", "..AnjaaaaaaacA..", "..AAAAAAAAAAAA.."],
      side: ["....AAAAAA......", "...AccibbiA.....", "...AbibbbbcA....", "..AbibbiiibA....", "..AccbibbbbA....", "...AdiibicbA....", "...AdfbbcibA....", "...AdnlcmccA....", "...AAdcfddddA...", ".....AleffhA....", ".....AhddmgA....", "....AhlgelA.....", "....AcAhemA.....", "....AfgjagA.....", "....AggeaklA....", "....AhoaakcA....", "....AhckjknA....", "....AflejkkA....", "....AmdcdekA....", "....AdcffneeA...", "....AdgfbgeeA...", "...AgdeeegehA...", "...AkoleaeeenA..", "...AAAAAAAAAA..."] } };
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
  // 色は職ごとの一覧（pal。小文字）。1〜4 は髪の色（顔の番号で変わる）：絵の髪の明るい茶→1、こげ茶→2、灰色の光→4。
  // 絵は足が下から2行めだったので、1行下げて入れた（今の絵と足の高さをそろえる）。
  // stride：横向きで歩く・攻撃するときの足（19〜23行め）。hand：横向きの攻撃でのばす手の色 [肌, 肌の影]、sleeve：そでの色 [そで, そでの影]
  var ART = {
    warrior: {
      pal: { d: "#ff8c39", e: "#ffc68c", f: "#ffefde", g: "#a54848", h: "#63442c", i: "#2b2b85", j: "#5e40ff", k: "#a75400", l: "#f3b926", m: "#5e3838", n: "#b54545" },
      map: {
        down: ["................", "................", ".....AAAAAA.....", "....A411112A....", "...A11114112A...", "..A4112211112A..", "..A4212221212A..", "..A121dee2212A..", "..A122efee212A..", "..A22AAfAAA22A..", "...A2fAeeAfAA...", "....AeAeeAeA....", ".AAggAeeeeAgghA.", "..AAghAddAigAA..", "..AeAAiiiiAAeA..", "..AedijjjjideA..", ".AdkAkiiiikAkdA.", ".AdeAikllkiAedA.", ".AdeAAjiijAAedA.", "..AAAijiijiAAA..", "....AmiiiimA....", "....AmnAAnmA....", "....AmmAAmmA....", ".....AnAAnA....."],
        up: ["................", "................", ".....AAAAAA.....", "....A412212A....", "...A11121112A...", "..A1111111112A..", "..A1121111112A..", "..A2121121122A..", "..A2122121122A..", "..A2222221222A..", "...A22222222A...", "....AA2A22AA....", ".AgghAAAAAAhggA.", "..AhhAiiiiAhhA..", "..AdAijjjjiAdA..", "..AdAiijjiiAdA..", ".AdkAAiiiiAAkdA.", ".AdeAikkkkiAedA.", ".AdeAAjiijAAedA.", "..AAAijiijiAAA..", "....AmiiiimA....", "....AmnAAnmA....", "....AmmAAmmA....", ".....AnAAnA....."],
        side: ["................", "................", "....AAAAAAA.....", "...A4111122AA...", "..A1111211222A..", ".A12211221122A..", ".A12221122122A..", ".A2Ae22122222A..", ".A2Afe2122222A..", "..2AfAA22e222A..", "...AeAf2ed22A...", "...AeAe2dd2A....", "...AeeedAggghA..", "....AddAAhhhA...", "....AAiiAdeA....", "....AjjiAdeA....", "....AiiiAlkA....", "....AlkAdedA....", ".....AAAdedA....", ".....iAjAAA.....", ".....iAjiiA.....", "....AAAAmmA.....", "....AAnnmmA.....", ".....AAAAAA....."]
      },
      stride: ["....AiAjiiA.....", "...AmmA.AmmA....", "...AmmA..AmmA...", "..AnnmA..AnmmA..", "..AAAAA..AAAAA.."],
      hand: ["e", "d"], sleeve: ["j", "i"]
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
