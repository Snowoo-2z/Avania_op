# 🏘️ AVANIA — Le village vivant

> Un monde RP multijoueur en ligne, vue **top-down**, **à bâtir soi-même**.
> Un village que les joueurs construisent, où chacun fait ce qu'il veut :
> commerce, métiers, police, vol, surveillance… une économie vivante,
> des milliers d'histoires.

**Zéro dépendance au runtime** : JavaScript vanilla en modules ES natifs,
canvas 2D procédural (aucun asset externe, aucun framework).

---

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
- **⛏️ Le fer** : du **minerai de fer** (rocher aux pépites beige-rosé
  taillées, façon Minecraft) apparaît dans le monde, **rare** (~0,3 % des
  cases). Il exige une **pioche en pierre ou mieux** pour lâcher du
  **fer brut** (pépite à facettes), fondu en **lingots** (1:1) puis en
  **bloc de fer** (9 lingots) pour construire, et en **outils en fer** bien
  plus durables.
- **📦 Lâcher des objets** : touche `Q` pour jeter un objet de ta main,
  `Ctrl+Q` pour toute la pile — ou sors une pile de l'inventaire par-dessus
  le bord de l'écran. Les objets tombent au sol, fusionnent entre eux et
  disparaissent après 5 minutes.
- **🔥 Le four** : 8 pierres → 1 four (clic droit dessus pour l'ouvrir).
  On y met un **combustible** (bois, planches, bâtons) + un ingrédient :
  **fer brut → lingots**, **sable → verre**, **bœuf cru → steak cuit**.
  Interface façon Minecraft avec flamme, flèche de progression et
  inventaire du joueur en bas. Les fours cuisent même quand on les ferme.
- **🧰 Le coffre** : 8 planches → 1 coffre. Posé comme un bloc, il s'ouvre
  au **clic droit** : 27 cases de rangement avec toutes les manipulations
  Minecraft (clic, clic droit, double-clic, shift-clic, glisser). Un coffre
  cassé **rejette son contenu au sol** — rien ne se perd.
- **🐑 Mobs passifs** : des **moutons** (→ laine, craftable en blocs de
  laine) et des **vaches** (→ bœuf cru, cuisable au four) errent sur
  l'herbe, fuient quand on les frappe. Clic gauche pour attaquer (une épée
  fait 3× de dégâts). Les animaux sont **toujours vus de profil** (gauche
  ou droite, miroir exact) — le mouton a un look rectangulaire
  100 % Minecraft.
- **Outils durables** : les outils ont une barre de durabilité et accélèrent la récolte
  quand leur type correspond à la ressource (hache pour bois, pioche pour pierre, pelle pour sol).
- **Plus de blocs** : bois, pierre, planche, brique, verre, sable, terre.
- **Personnage carré = un vrai CUBE** : le perso est un seul carré avec
  visage, cheveux et accessoires dessus — 18 coiffures, couleurs de cheveux,
  yeux, chapeau (8), lunettes (5), barbe (4), peau, haut, pantalon, nom —
  aperçu live animé (respiration, clignement), look sauvegardé. En jeu, sa taille
  est réduite pour rester proportionnée aux arbres et aux rochers.

## 🚀 Lancer le jeu

Le jeu ne nécessite **rien à installer** : le serveur est en Node pur.

```bash
node server.js        # ou : npm start
# puis ouvre http://localhost:3000
```

Pour les outils de développement (tests, aperçus, benchmarks) :

```bash
npm install           # installe @napi-rs/canvas (dev uniquement)
```

## 🧪 Tests, aperçus & benchmark

```bash
npm test                              # test de fumée (logique pure, sans navigateur)
node scripts/render-preview.mjs       # aperçus PNG : monde, personnage, blocs, mobs
node scripts/preview-mobs.mjs         # planches des mobs (profils, marche, scène en jeu)
node scripts/preview-items.mjs        # planches des icônes d'objets (toutes + gros plan)
node scripts/frame-bench.mjs          # benchmark de la boucle de jeu (ms/frame)
node scripts/frame-bench.mjs --shots /tmp/shots     # + captures PNG par scénario
node scripts/diff-shots.mjs /tmp/avant /tmp/après   # compare deux dossiers de captures
```

Tous les PNG partent dans `preview/` (ignoré par git).

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

---

# 🧱 ARCHITECTURE DÉTAILLÉE

## Carte du projet

```
Avania_op/
├── index.html          page unique (canvas #game + DOM des panneaux UI)
├── css/
│   └── style.css       tout le style : HUD Minecraft-like, panneaux, écrans
├── server.js           serveur statique de dev (Node pur, port 3000)
│                       — plus tard : le serveur WebSocket multijoueur se
│                         branchera ici
├── js/                 TOUT le jeu (modules ES natifs, ~9 000 lignes)
│   ├── main.js         point d'entrée : initialisation & boucle
│   ├── game.js         boucle de jeu, rendu du monde, interactions (1 594 l.)
│   ├── config.js       constantes globales & options de personnalisation
│   ├── world.js        génération du monde, tuiles, collisions, casser/poser
│   ├── blocks.js       définitions : items, blocs, outils, recettes, butin
│   ├── tileset.js      sprites procéduraux : sol, eau animée, arbres, rochers
│   ├── icons.js        icônes d'inventaire : outils Minecraft + cubes iso
│   ├── character.js    le personnage-cube (adaptable, pré-rendu en cache)
│   ├── player.js       entité joueur + collisions sub-tuile
│   ├── camera.js       caméra : suivi fluide + zoom fixe ×2
│   ├── input.js        clavier + souris (état courant des touches)
│   ├── inventory.js    modèle d'inventaire : piles, craft, four, curseur
│   ├── slots.js        interactions des cases (clic, drag, infobulle)
│   ├── ui.js           création du perso, HUD, barre rapide, panneaux E/C, four
│   ├── held.js         objet tenu en main (poses par orientation, swing)
│   ├── furnace.js      logique du four (recettes, combustibles, cuisson)
│   ├── tutorial.js     petit didacticiel illustré (pages E, C, mobs…)
│   ├── utils.js        helpers : RNG seed, canvas, détection PC modeste
│   └── mobs/           ★ les animaux — voir section dédiée plus bas
├── scripts/            outils hors-ligne (Node + @napi-rs/canvas)
│   ├── render-preview.mjs
│   ├── preview-mobs.mjs
│   ├── preview-items.mjs
│   ├── frame-bench.mjs
│   └── diff-shots.mjs
├── test/
│   └── smoke.mjs       test de fumée : logique pure importée en Node
└── preview/            (généré, git-ignoré) PNG de vérification visuelle
```

## Flux de démarrage

```
index.html
   │  <script type="module" src="js/main.js">
   ▼
main.js ──► 1. canvas + DPR (plafonné, mode basse conso éventuel)
       ──► 2. openCharacterCreation()  [ui.js]
       ──► 3. initIcons()              [icons.js]  (toutes les icônes pré-rendues)
       ──► 4. new Game(canvas, ctx)    [game.js]
       │        └─► buildTileset()     [tileset.js] (tous les sprites de tuiles)
       │        └─► new World()        [world.js]   (génération seed)
       │        └─► spawnMobs(world)   [mobs/core.js]
       │        └─► new Player(spawn)  [player.js]
       ──► 5. SlotManager + panneaux (inventaire E, craft C, four)
       ──► 6. requestAnimationFrame → game.frame(dt)
```

## La boucle de jeu (`game.js`)

Chaque frame :

1. **update(dt)** — entrées (input.js) → déplacements/collisions du joueur
   (player.js) → mobs (mobs/core.js) → objets au sol (fusion, expiration) →
   particules → cuisson des fours.
2. **render()** — dans l'ordre de peinture :
   océan hors-monde → **chunks de sol** pré-dessinés → surbrillance du bloc
   visé → tri de profondeur **zéro-allocation** des entités (objets du monde
   indexés par chunk, drops, mobs, joueur, triés par `sortY`) → fissures de
   minage → particules → vignette.

## Pipeline de rendu & performance

Le moteur tient 60 fps sur des PC modestes :

- **Chunks pré-dessinés** : le sol est regroupé en chunks de 16×16 tuiles,
  chacun rasterisé une seule fois puis blitté à chaque frame.
- **Sprites procéduraux en cache** : tuiles (dont **4 frames de vagues**
  pour l'eau animée), cubes extrudés, arbres/rochers/minerai (coupés en
  tranches pour le passage « derrière »), personnages (par apparence ×
  orientation × clignement), mobs (espèce × côté × flash × étape de marche),
  icônes d'items, fissures de minage, surbrillance, ombres.
- **Zéro allocation par frame** dans la boucle de rendu : tags de profondeur
  numériques portés par les entités, objets d'options réutilisés, clés de
  cache numériques — pas de pression sur le GC.
- **Index spatiaux** : objets statiques et eau par chunk, fusion des piles
  au sol en O(n) via grille réutilisée.
- **Mode performance adaptatif** : échantillonnage des frames coûteuses et
  réduction automatique des effets (DPR, ombres) sur les petits appareils.
- Les constantes vivent dans `config.js` (`PERFORMANCE`, DPR max 1.5…).

## 🐑 Les mobs (`js/mobs/`) — un sous-dossier par animal

Chaque espèce possède **tout ce dont elle a besoin pour être en jeu** dans
son sous-dossier ; le moteur partagé se branche dessus.

```
js/mobs/
├── index.js          ré-export de l'API publique (import : './mobs/index.js')
├── core.js           moteur : Mob, spawnMobs, updateMob, mobDrops, drawMob,
│                     cache de sprites + registre des espèces (MOBS)
├── render-utils.js   helpers pixel-art partagés (px, blob, rrect, eye,
│                     legs animées par paires diagonales)
├── sheep/
│   └── sheep.js      DEF (label/hp/speed/butin) + PAL/HIT (palettes) +
│                     drawSide (dessin du profil, look rectangulaire Minecraft)
└── cow/
    └── cow.js        idem pour la vache (taches, museau rose, cornes…)
```

**Ajouter un animal** = 3 étapes :

1. Créer `js/mobs/pig/pig.js` qui exporte `DEF`, `PAL`, `HIT`, `drawSide`.
2. L'importer dans `core.js` et l'ajouter au registre `MOBS`.
3. (Optionnel) lui donner des apparitions dans `spawnMobs(world, counts)`
   et des objets-butin dans `blocks.js`.

Règles de rendu : dessin en coordonnées **pieds au point (0, 0)**, profil
tourné vers la **gauche** (la marche à droite est le miroir automatique),
7 étapes de marche quantifiées, palette `HIT` pour le flash de dégât.

## 🧭 « Je veux modifier… » → où regarder

| Envie | Fichier | Endroit précis |
|---|---|---|
| Changer la taille du monde / des tuiles | `js/config.js` | `WORLD_W/H`, `TILE` |
| Rareté d'une ressource à la génération | `js/world.js` | boucle « ressources naturelles éparpillées » |
| Ajouter un bloc posable | `js/blocks.js` + `js/tileset.js` | `BLOCK_DEFS` + `drawTile()` + `paint…` (icône) |
| Ajouter un objet du monde (comme le minerai) | `js/blocks.js` + `js/tileset.js` | `kind: 'object'` + `draw…ObjectRaw` + `objectCache` |
| Ajouter une recette de craft | `js/blocks.js` | tableau `RECIPES` (pattern 3×3 façon Minecraft) |
| Ajouter une recette de four | `js/furnace.js` | recettes / combustibles |
| Retoucher l'icône d'un outil | `js/icons.js` | `TOOL_DRAWERS` + `drawPickaxe/Axe/…` |
| Changer la tête d'un animal | `js/mobs/<espèce>/<espèce>.js` | `drawSide` + palette `PAL` |
| Son comportement (vitesse, butin, vie) | `js/mobs/<espèce>/<espèce>.js` | objet `DEF` |
| Ajouter un animal | `js/mobs/core.js` + sous-dossier | registre `MOBS` (voir ci-dessus) |
| Apparence du personnage (options) | `js/config.js` + `js/character.js` | listes `HAIR_STYLES`… + `drawHair()` |
| HUD, barre rapide, panneaux | `js/ui.js` + `css/style.css` | classes `HUD`, `Hotbar`, `InventoryPanel`… |
| Contrôles / touches | `js/input.js` + `js/main.js` + `js/game.js` | mapping touche → action |
| Équilibrage (vitesse, portée, minage) | `js/config.js` + `js/blocks.js` | `PLAYER_SPEED`, `REACH`, `breakTime`… |

## Conventions du code

- **Tout est dessiné en code** (aucun asset externe) : sprites procéduraux
  au style « voxel doux » — contour sombre, reflet clair en haut, ombre en bas.
- **Pré-rendu puis blit** : tout ce qui ne change pas à la frame est mis en
  cache dans un canvas hors-écran (voir `makeCanvas` dans `utils.js`).
- Le code est **commenté en français**, les identifiants en anglais.
- Monde 128×128 tuiles, tuile de 32 px, zoom caméra ×2, portée d'interaction
  3 tuiles.
