// ============================================================
//  AVANIA — Mobs : boîte à outils de dessin pixel-art partagée
//  (les espèces vivent chacune dans leur sous-dossier).
// ============================================================

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function blob(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function rrect(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

// Petit œil rond avec son point de lumière (la marque des mignons).
function eye(ctx, x, y, color) {
  px(ctx, x, y, 2, 2, color);
  px(ctx, x, y, 1, 1, 'rgba(255,255,255,0.9)');
}

// Étape de marche quantifiée : sin(walkPhase) ramené à 7 paliers.
// L'œil ne voit aucune différence (paliers de ~0,5 px sur des
// pattes de 3 px de large), mais cela borne le cache de sprites.
function legStepOf(walkPhase) {
  return Math.max(-3, Math.min(3, Math.round(Math.sin(walkPhase) * 3)));
}

// Quatre pattes à sabots, animées par paires diagonales (0+3 / 1+2),
// ce qui donne une allure de quadrupède bien plus naturelle.
function drawLegs(ctx, centers, top, h, pal, legStep) {
  const lift = (legStep / 3) * 1.6;
  for (let i = 0; i < 4; i++) {
    const group = (i === 0 || i === 3) ? 1 : -1;
    const y = top - Math.max(0, lift * group);
    px(ctx, centers[i] - 1, y, 3, h, pal.leg);
    px(ctx, centers[i] - 1, y + h - 2, 3, 2, pal.hoof);
  }
}

export { px, blob, rrect, eye, legStepOf, drawLegs };
