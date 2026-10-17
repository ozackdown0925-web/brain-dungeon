// 顔グラフィック（仮）：16×16 のドット絵を、色と髪の形の組み合わせで描く。
// 絵の素材は段階7で、キャラ・敵・地面の絵といっしょに決めて差しかえる（docs/plan-v1.md）。
var Faces = (function () {
  // hair：髪の色、style：髪の形（0 短い・1 長い・2 つんつん・3 おだんご）、skin：はだの色、eye：目の色
  var LIST = [
    { hair: "#3a2a1e", style: 0, skin: "#f5d7b0", eye: "#2a2a3a" },
    { hair: "#e8c060", style: 1, skin: "#f5d7b0", eye: "#3a6ab0" },
    { hair: "#c0402a", style: 2, skin: "#f0c8a0", eye: "#2a2a3a" },
    { hair: "#2a2a3a", style: 3, skin: "#f5d7b0", eye: "#2a2a3a" },
    { hair: "#8a5a3a", style: 1, skin: "#d8a878", eye: "#3a2a1e" },
    { hair: "#c8ccd8", style: 2, skin: "#f5d7b0", eye: "#7a3ab0" },
    { hair: "#3a5ab0", style: 0, skin: "#f0c8a0", eye: "#2a2a3a" },
    { hair: "#5a8a3a", style: 3, skin: "#d8a878", eye: "#2a2a3a" }
  ];

  // ctx に (x, y) から size×size で描く
  function draw(ctx, id, x, y, size) {
    var f = LIST[id] || LIST[0], u = size / 16;
    function px(cx, cy, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x + cx * u), Math.round(y + cy * u), Math.ceil(w * u), Math.ceil(h * u)); }
    px(0, 0, 16, 16, "#2a3046");                        // うしろ
    if (f.style === 1) px(3, 4, 10, 11, f.hair);         // 長い髪（うしろ）
    px(4, 4, 8, 9, f.skin);                              // 顔
    px(5, 13, 6, 3, f.skin);                             // 首
    px(4, 14, 8, 2, "#5a6a8a");                          // 服
    px(3, 2, 10, 3, f.hair);                             // 前髪
    if (f.style === 0) { px(3, 5, 1, 3, f.hair); px(12, 5, 1, 3, f.hair); }
    if (f.style === 2) { px(3, 1, 2, 2, f.hair); px(7, 0, 2, 2, f.hair); px(11, 1, 2, 2, f.hair); px(3, 5, 1, 2, f.hair); px(12, 5, 1, 2, f.hair); }
    if (f.style === 3) { px(6, 0, 4, 2, f.hair); px(3, 5, 1, 2, f.hair); px(12, 5, 1, 2, f.hair); }
    px(5, 5, 6, 1, f.hair);
    px(6, 8, 1, 2, f.eye); px(9, 8, 1, 2, f.eye);         // 目
    px(7, 11, 2, 1, "#c07060");                           // 口
  }

  return { LIST: LIST, count: LIST.length, draw: draw };
})();
