// ============================================================
//  AVANIA — Four (logique pure, sans DOM)
//
//  Comme dans Minecraft : on met un combustible (bois, planches,
//  bâtons) + un ingrédient (minerai, sable, viande) et le four
//  transforme l'ingrédient en résultat au fil du temps.
//
//  Un « four » est représenté par une entrée :
//    {
//      input:   [stack|null],   // ingrédient à fondre
//      fuel:    [stack|null],   // combustible
//      output:  [stack|null],   // résultat
//      progress,                // 0..recipe.time (secondes)
//      fuelTime,                // secondes de feu restantes
//      maxFuelTime,             // pour l'icône de flamme
//    }
//  Les cases sont des tableaux de longueur 1 pour que le gestionnaire
//  d'inventaire (SlotManager) fonctionne sans adaptation.
// ============================================================

// Recettes de fonte / cuisson : 1 ingrédient → 1 résultat, temps en secondes.
export const SMELT_RECIPES = {
  rawIron: { out: 'ironIngot', time: 8 },
  sand: { out: 'glass', time: 6.5 },
  rawBeef: { out: 'cookedBeef', time: 8 },
};

// Combustibles : durée de combustion d'un objet (en secondes).
export const FUEL = {
  wood: 15,
  plank: 15,
  stick: 5,
};

export function isFuel(id) {
  return FUEL[id] != null;
}

export function smeltRecipe(id) {
  return SMELT_RECIPES[id] || null;
}

export function makeFurnaceEntry() {
  return {
    input: [null],
    fuel: [null],
    output: [null],
    progress: 0,
    fuelTime: 0,
    maxFuelTime: 0,
  };
}

// Avance la cuisson d'un four. `data` est modifié en place.
// Retourne true si quelque chose a changé (pour rafraîchir l'UI).
export function updateFurnace(data, dt) {
  if (!data) return false;
  const input = data.input[0];
  const fuel = data.fuel[0];
  const output = data.output[0];
  const recipe = input && smeltRecipe(input.id);
  const outOk = recipe && (!output || (output.id === recipe.out && output.count < 64));

  if (!recipe || !outOk) {
    // Rien à fondre (ou sortie pleine) : le feu s'éteint doucement.
    if (data.progress > 0) {
      data.progress = Math.max(0, data.progress - dt * 3);
      return true;
    }
    return false;
  }

  // Allumer un combustible si le feu est éteint.
  if (data.fuelTime <= 0 && fuel && isFuel(fuel.id)) {
    const fuelId = fuel.id;
    fuel.count -= 1;
    if (fuel.count <= 0) data.fuel[0] = null;
    data.maxFuelTime = FUEL[fuelId];
    data.fuelTime = FUEL[fuelId];
  }

  if (data.fuelTime <= 0) return false;

  // On ne brûle que le temps réellement disponible (jamais négatif).
  const burn = Math.min(dt, data.fuelTime);
  data.fuelTime -= burn;
  data.progress += burn;
  // Epsilon anti-virgule flottante (7.9999… ≈ 8,0).
  if (data.progress >= recipe.time - 1e-6) {
    data.progress = Math.max(0, data.progress - recipe.time);
    input.count -= 1;
    if (input.count <= 0) data.input[0] = null;
    if (data.output[0]) data.output[0].count += 1;
    else data.output[0] = { id: recipe.out, count: 1 };
  }
  return true;
}
