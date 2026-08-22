# 🏘️ AVANIA — Le village vivant

> Un monde RP multijoueur en ligne, vue **top-down**, **à bâtir soi-même**.
> Un village que les joueurs construisent, où chacun fait ce qu'il veut :
> commerce, métiers, police, vol, surveillance… une économie vivante,
> des milliers d'histoires.

## 🌟 La vision

Avania, c'est un grand monde en ligne inspiré des gros RP communautaires.
Ici, **rien n'est construit d'avance** : les joueurs récoltent des blocs et
bâtissent le village de leurs mains. La **liberté totale** est la règle :

- 🧱 **Bac à sable** : on récupère des blocs (bois, pierre…), on les stocke et on construit.
- 🎒 **Inventaire** : une barre rapide pour choisir quoi poser.
- 🪙 **Économie** (à venir) : une monnaie, des métiers, des boutiques.
- 🏦 **Des rôles** (à venir) : policier, commerçant, banquier, voleur…
- 📹 **Surveillance** (à venir) : poser des caméras pour protéger ses biens.
- 🎨 **Personnage carré, 100 % personnalisable** : chacun crée son avatar unique.

## ✅ Déjà en place (v1)

- **Monde vide** (aucune construction prédéfinie) : terrain plat d'herbe,
  bordure d'eau, arbres & rochers éparpillés comme ressources.
- **Collecte de blocs** : maintenir le clic gauche pour miner progressivement
  (la durée dépend de la ressource et de l'outil), clic droit = poser.
- **Inventaire façon Minecraft** (touche `E`) : écran plein façon Minecraft
  avec personnage animé, **fabrication 2×2** et 36 cases (27 stockage + 9 barre
  rapide), piles de 64.
- **Manipulation des objets 100 % façon Minecraft** : la pile flottante suit la
  souris — clic gauche (prendre/poser toute la pile), clic droit (moitié/un),
  double-clic (tout ramasser), shift-clic (ranger vite), **glisser-répartir**
  la pile entre plusieurs cases (maintien + survol), touches `1..9` pour
  échanger avec la barre rapide, infobulle au survol.
- **Établi façon Minecraft** (touche `C` ou bouton 🛠️) : grille 3×3 + résultat,
  **livre de recettes repliable** avec recherche, et l'inventaire du joueur
  affiché en bas. Bois → planches → bâtons, puis pioches, haches, pelles et
  épées en bois, pierre ou **fer**. Clic (ou maintien) sur le résultat pour
  fabriquer, shift-clic pour tout fabriquer d'un coup.
- **🪵 Portes** : 6 planches → 3 portes. Posées comme un bloc, elles se
  ferment au clic droit et laissent passer (ou bloquent) le joueur.
- **⛏️ Le fer** : du **minerai de fer** (rocher tacheté de rouille) apparaît
  dans le monde, rare. Il exige une **pioche en pierre ou mieux** pour lâcher
  du **fer brut**, fondu en **lingots** (1:1) puis en **bloc de fer** (9
  lingots) pour construire, et en **outils en fer** bien plus durables.
- **📦 Lâcher des objets** : touche `Q` pour jeter un objet de ta main,
  `Ctrl+Q` pour toute la pile — ou sors une pile de l'inventaire par-dessus
  le bord de l'écran. Les objets tombent au sol, fusionnent entre eux et
  disparaissent après 5 minutes.
- **🔥 Le four** : 8 pierres → 1 four (clic droit dessus pour l'ouvrir).
  On y met un **combustible** (bois, planches, bâtons) + un ingrédient :
  **fer brut → lingots**, **sable → verre**, **bœuf cru → steak cuit**.
  Interface façon Minecraft avec flamme, flèche de progression et
  inventaire du joueur en bas. Les fours cuisent même quand on les ferme.
- **🐑 Mobs passifs** : des **moutons** (→ laine, craftable en blocs de
  laine) et des **vaches** (→ bœuf cru, cuisable au four) errent sur
  l'herbe, fuient quand on les frappe. Clic gauche pour attaquer (une épée
  fait 3× de dégâts).
- **Outils durables** : les outils ont une barre de durabilité et accélèrent la récolte
  quand leur type correspond à la ressource (hache pour bois, pioche pour pierre, pelle pour sol).
- **Plus de blocs** : bois, pierre, planche, brique, verre, sable, terre.
- **Personnage carré = un vrai CUBE** : le perso est un seul carré avec
  visage, cheveux et accessoires dessus — 18 coiffures, couleurs de cheveux,
  yeux, chapeau (8), lunettes (5), barbe (4), peau, haut, pantalon, nom —
  aperçu live animé (respiration, clignement), look sauvegardé. En jeu, sa taille
  est réduite pour rester proportionnée aux arbres et aux rochers.

## 🚀 Lancer le jeu

```bash
node server.js
# puis ouvre http://localhost:3000
```

## 🧪 Tests & performance

```bash
npm test                        # test de fumée (logique pure, sans navigateur)
node scripts/render-preview.mjs # régénère les aperçus PNG (preview/)
node scripts/preview-mobs.mjs   # planches des mobs (orientations, marche, scène)
node scripts/frame-bench.mjs    # benchmark de la boucle de jeu (ms/frame)
node scripts/frame-bench.mjs --shots /tmp/shots  # + captures PNG par scénario
node scripts/diff-shots.mjs /tmp/avant /tmp/après  # compare deux dossiers de captures
```

Le moteur est pensé pour rester fluide sur des PC modestes : sol rendu par
**chunks pré-dessinés**, sprites procéduraux **mis en cache** (personnage,
mobs, icônes, fissures de minage, surbrillance, ombres), **index spatiaux**
(ressources et eau par chunk, fusion des piles au sol en O(n)), **zéro
allocation** dans la boucle de rendu (pas de pression sur le GC) et remplissage
plein écran sauté quand la vue est couverte par le monde. Un **mode
performance** automatique (petits appareils ou frame coûteuse détectée) réduit
encore la résolution et les effets sans changer le rendu jouable.

Bonus : les **vagues animées** prévues dans le tileset sont désormais visibles
le long des berges — l'eau n'est plus figée.

## 🎮 Comment jouer

| Action | Touche / clic |
|---|---|
| Se déplacer | ZQSD / WASD / flèches |
| Miner / récolter | Maintenir le clic gauche sur la ressource |
| Pelleter (sable, terre) | Maintenir le clic gauche sur la plage / la terre |
| Poser le bloc sélectionné | Clic droit |
| Changer d'objet | Touches 1..9 / molette (l'objet apparaît dans ta main) |
| Ouvrir l'inventaire | Touche `E` |
| Fabriquer (matériaux & outils) | Touche `C` ou bouton 🛠️ |
| Prendre / poser toute une pile | Clic gauche (la pile suit la souris) |
| Prendre la moitié / poser un objet | Clic droit |
| Ramasser tout un objet | Double-clic |
| Ranger vite (sac ↔ barre rapide) | Shift-clic |
| Répartir une pile sur plusieurs cases | Maintenir le clic et survoler les cases |
| Échanger avec la barre rapide | Touches `1..9` en survolant une case |
| Lâcher un objet au sol | Touche `Q` (ou `Ctrl+Q` pour toute la pile) |
| Ouvrir / fermer une porte | Clic droit sur la porte |
| Ouvrir un four | Clic droit sur le four |
| Attaquer un animal | Clic gauche sur le mouton / la vache |

Astuce : casse les **arbres** (→ bois) et les **rochers** (→ pierre) autour de toi,
puis construis ta première cabane.

## 🗺️ Feuille de route

- [ ] **Multijoueur** — serveur WebSocket, positions & actions synchronisées.
- [x] **Plus de blocs** — planche, brique, sable, verre, terre… (+ craft).
- [ ] **Économie** — monnaie, banque, achats, salaires, taxes.
- [ ] **Intérieurs** — entrer dans les bâtiments construits.
- [x] **Inventaire & objets** — 36 cases, piles, outils durables et fabrication 3×3.
- [ ] **Coffres** — stockage partagé, vols.
- [ ] **Caméras & sécurité** — poser des caméras, zones surveillées.
- [ ] **Métiers & police** — rôles, arrestations, enquêtes.
- [ ] **Propriété** — revendiquer un terrain, protéger sa maison.

## 🧱 Architecture

```
js/
  config.js      constantes & options de personnalisation
  blocks.js      définition des blocs / objets / recettes
  inventory.js   inventaire du joueur (piles, curseur, drag, grilles)
  slots.js       interactions des cases façon Minecraft (clic, drag, infobulle)
  utils.js       helpers (RNG seed, canvas…)
  input.js       clavier + souris
  camera.js      caméra (zoom + suivi)
  tileset.js     tuiles, objets & cubes 3D dessinés en code (pré-rendu)
  icons.js       icônes d'inventaire (outils + cubes isométriques)
  held.js        objet tenu en main selon la sélection
  world.js       monde vide + casser/poser
  character.js   personnage carré personnalisable
  player.js      entité joueur + collisions
  furnace.js     logique du four (recettes, combustibles, cuisson)
  mobs.js        moutons & vaches (IA d'errance, rendu, butin)
  ui.js          création du personnage + HUD + barre rapide + écrans E/C + four
  game.js        boucle de jeu, rendu, interactions
  main.js        point d'entrée
```

Tout est rendu **en code** (aucun asset externe) pour un style cohérent et facile à étendre.
