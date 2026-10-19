// ダメージの計算と、画面に飛び出す数字・文字（docs/draft.md 1.3）。
// ダメージ ＝（攻撃力 × 技の倍率 − 相手の防御力 × 0.5）× 属性の倍率 × 0.9〜1.1 のゆらぎ（会心は×1.5、最低1）
var Battle = (function () {
  var popups = [];

  function resOf(target, element) {
    var r = target.res && target.res.hasOwnProperty(element) ? target.res[element] : 1;
    return r;
  }

  // atk：攻撃側の攻撃力、def：受ける側の防御力、opt：{ mult, element, res, crit }
  function damage(atk, def, opt) {
    var mult = opt.mult || 1;
    var elem = opt.res && opt.res.hasOwnProperty(opt.element) ? opt.res[opt.element] : 1;
    if (elem === 0) return { amount: 0, crit: false, label: "無効" };
    var crit = Math.random() < (opt.crit || 0);
    var raw = atk * mult - def * 0.5;
    var amount = raw * elem * (0.9 + Math.random() * 0.2) * (crit ? (opt.critMul || 1.5) : 1);   // critMul：パッシブ「急所の心得」
    amount = Math.max(1, Math.round(amount));
    var label = elem > 1 ? "弱点！" : elem < 1 ? "いまひとつ" : "";
    return { amount: amount, crit: crit, label: label };
  }

  // 飛び出す文字
  function pop(x, y, text, color, size) {
    popups.push({ x: x, y: y, text: text, color: color || "#fff", size: size || 9, life: 0.8, max: 0.8 });
  }
  // ダメージの結果をまとめて表示する
  function showHit(x, y, res, toPlayer) {
    if (res.amount === 0) { pop(x, y - 4, "無効", "#a3a8bd", 8); return; }
    var color = toPlayer ? "#ff7070" : res.crit ? "#ffd24a" : "#ffffff";
    pop(x, y, String(res.amount), color, res.crit ? 12 : 10);
    if (res.crit) pop(x, y - 10, "会心！", "#ffd24a", 8);
    else if (res.label) pop(x, y - 10, res.label, res.label === "弱点！" ? "#ffb84d" : "#a3a8bd", 8);
  }

  function update(dt) {
    for (var i = popups.length - 1; i >= 0; i--) {
      var p = popups[i];
      p.life -= dt; p.y -= 22 * dt;
      if (p.life <= 0) popups.splice(i, 1);
    }
  }
  function draw(cam) {
    var ctx = Render.ctx;
    popups.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 2));
      Render.text(p.text, Math.round(p.x - cam.x), Math.round(p.y - cam.y), { size: p.size, align: "center", bold: true, color: p.color });
    });
    ctx.globalAlpha = 1;
  }

  function clear() { popups.length = 0; }

  return { clear: clear, damage: damage, resOf: resOf, pop: pop, showHit: showHit, update: update, draw: draw };
})();
