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
- **💰 L'argent** — à l'arrivée sur l'île, un **monsieur en costume-cravate**
  aborde le joueur, lui remet sa somme de bienvenue (**150 écus**) et lui
  explique les règles, puis repart. Pendant toute la scène le joueur ne peut
  pas bouger ; la somme n'est versée qu'une seule fois, même si la cinématique
  est rejouée ou passée. La bourse est affichée en haut à droite, avec la
  profondeur courante et la profondeur autorisée par l'équipement.
- **⛰️ La grotte** — une arche taillée dans la falaise, à un endroit fixe de
  la carte. On entre avec `F`. À l'intérieur, **8 niveaux** qui descendent de
  plus en plus bas, générés de façon déterministe, où l'on ne trouve **que de
  la pierre et du fer** (le fer devient plus abondant en profondeur). Chaque
  niveau a son échelle de sortie et son puits de descente, toujours
  atteignables.
- **🎭 Masque & protection de minage** — descendre au-delà du niveau 1 exige
  deux équipements achetés : un **masque** et une **protection de minage**.
  Chacun existe en **trois paliers** ; plus c'est cher, plus la profondeur
  atteignable est grande (la profondeur autorisée est le minimum des deux).
  Sans l'équipement, la descente est refusée avec la raison exacte.
- **🧔 Deux marchands, et une vraie négociation** — Gaspard vend les masques,
  Aldric les protections, tous deux devant l'entrée de la grotte. On leur
  parle avec `F`, puis on **écrit ce qu'on veut en texte libre**. Le marchand
  répond **toujours dans son rôle** (jamais de markdown, jamais de
  didascalie, jamais « je suis une IA »). Il raisonne à partir de deux
  ancres économiques — son **coût de fabrication** (réalisée hors de l'île,
  il n'en connaît pas le détail) et son **coût de transport** — plus le
  nombre de jours passés sur l'île, le nombre de joueurs et ses ventes
  récentes. Il peut faire un geste, mais **jamais sous son prix plancher**.
  Deux commandes structurent l'échange : `/sell [article] [prix]` affiche une
  fiche d'offre avec **Acheter** ou **Continuer à discuter**, et `/out` met le
  joueur dehors s'il insiste trop ou devient insultant — **45 secondes**
  pendant lesquelles le marchand refuse de lui parler.
  Le dialogue passe par un modèle si une clé `AVANIA_AI_API_KEY` est
  configurée (relais `POST /api/merchant`), sinon par un **cerveau de
  négociation local** qui applique exactement les mêmes règles.

## 🚀 Lancer le jeu

Le jeu ne nécessite **rien à installer** : le serveur est en Node pur.

```bash
node server.js        # ou : npm start
# puis ouvre http://localhost:3000
```

Pour les outils de développement (tests, aperçus, benchmarks) :

```bash
npm install           # installe @napi-rs/canvas et jsdom (dev uniquement)
```

### Donner une vraie voix aux marchands (Mistral, gratuit)

Sans clé, les marchands tournent sur le **cerveau de négociation local**
(`js/merchant-brain.js`) : mêmes règles, mêmes commandes, aucun réseau.

Avec une clé **Mistral AI**, leurs répliques sont produites par un modèle. Le
palier gratuit « Experiment » suffit : pas de carte bancaire, ~1 milliard de
jetons par mois, et tous les modèles sont accessibles.

1. Créer un compte sur [console.mistral.ai](https://console.mistral.ai)
   (vérification par SMS), puis une clé dans **API Keys**.
2. Lancer le serveur avec la clé :

```bash
MISTRAL_API_KEY=ta_cle npm start
```

La clé ne quitte **jamais** le serveur : le navigateur parle à
`POST /api/merchant`, qui relaie vers `https://api.mistral.ai/v1/chat/completions`.
Le modèle par défaut est `mistral-small-latest`.

Le palier gratuit impose environ **une requête par seconde et par clé**, tous
modèles confondus. Le relais sérialise donc les appels et espace leurs départs
de 1,1 s ; si la file dépasse 6 s il répond immédiatement `rate-limited` et le
jeu bascule sur le cerveau local. Un `429` (quota atteint) déclenche une pause
de 15 s — le joueur ne voit qu'une réplique locale, jamais une erreur.

Variables d'environnement :

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `MISTRAL_API_KEY` | — | la clé Mistral (`AVANIA_AI_API_KEY` est aussi accepté) |
| `AVANIA_AI_BASE_URL` | `https://api.mistral.ai/v1` | tout fournisseur compatible OpenAI convient |
| `AVANIA_AI_MODEL` | `mistral-small-latest` | `mistral-large-latest` pour des répliques plus fines |
| `PORT` | `3000` | port d'écoute |

### 🌐 Multijoueur (étape 1 : présence, étape 2 : monde partagé, étape 3 : coffres)

**Étape 1 — présence.** Chaque joueur voit les autres se déplacer en
direct : position, orientation, animation de marche, apparence et nom.

**Étape 2 — monde partagé.** Casser un arbre, poser un mur, ouvrir une
porte : ces changements sont désormais visibles par les autres joueurs
de la **même zone** (surface, ou grotte à une profondeur donnée), avec
une resynchronisation automatique quand on rejoint une zone déjà
modifiée par d'autres.

**Étape 3 — coffres partagés.** Le contenu d'un coffre posé est
désormais partagé par tous les joueurs de la zone : ranger ou piocher
un objet dans un coffre ouvert diffuse l'intégralité de ses 27 cases
(`{t:'chest', tx, ty, slots}`, voir `js/net-protocol.js`,
`sanitizeChestSlots`) aux autres joueurs présents, avec la même
resynchronisation à l'arrivée dans une zone déjà modifiée
(`{t:'chestSync', zone, chests:[...]}`). Casser un coffre annonce aussi
qu'il est désormais vide, pour ne pas laisser une ancienne copie
réapparaître si un nouveau coffre est reposé au même endroit. Les mobs
et la progression des **fours**, eux, restent **locaux à chaque
client** — ce sera l'objet d'une étape suivante.

Le format volontairement simple (le coffre entier plutôt qu'un diff des
seules cases modifiées) part du principe qu'ouvrir/manipuler un coffre
reste un évènement rare comparé aux positions envoyées à chaque tick :
un coffre plein avec de la durabilité pèse environ 1,4 Ko en JSON, ce
qui reste négligeable à cette fréquence (voir `maxPayload` ci-dessous).

Le serveur reste volontairement un simple **relais + mémoire tampon**,
jamais une autorité qui rejoue les règles du jeu : il ne fait aucune
hypothèse sur ce qu'un client a le droit de casser ou de poser, il note
juste « en (tx,ty) de telle zone, la tuile ressemble maintenant à ceci »
et le retransmet. C'est un choix assumé pour rester simple et gratuit
(voir « Limites connues » ci-dessous) plutôt qu'un monde serveur
autoritatif complet, qui exigerait de porter `world.js`/`blocks.js`
côté serveur.

Tout est pensé pour tenir dans le budget très serré du plan **gratuit**
de Render (0.1 CPU, 512 Mo de RAM, 5 Go de bande passante par mois,
partagés à l'échelle du workspace) :

- **protocole binaire compact** pour les positions (6 octets par
  joueur, voir `js/net-protocol.js`) plutôt que du JSON — un JSON
  équivalent pèserait 15 à 20 fois plus lourd sur le réseau ;
- **silence quand rien ne bouge** : aucune trame n'est envoyée si
  aucune position n'a changé depuis le dernier tick (un monde immobile
  ne coûte aucun octet) ;
- **tick serveur à ~12,5 Hz** (`AVANIA_TICK_HZ`), largement suffisant
  pour du déplacement top-down — le client lisse les positions reçues
  pour rester fluide à 60 fps entre deux tics ;
- **plafond dur de connexions** (`AVANIA_MAX_PLAYERS`, 24 par défaut) :
  au-delà, une nouvelle connexion est refusée proprement plutôt que de
  dégrader tout le monde ;
- **garde-fou de bande passante mensuelle** (`AVANIA_MONTHLY_BYTES_BUDGET`,
  3 Go par défaut — sous les 5 Go du plan gratuit, en laissant de la
  marge pour le reste du workspace) : au-delà, les nouvelles connexions
  sont refusées jusqu'au mois suivant plutôt que de risquer une
  suspension du service en pleine partie ;
- **reconnexion automatique côté client** avec un backoff progressif
  (jusqu'à 20 s) si le serveur est hors ligne ou en train de se
  réveiller (spin-down du plan gratuit) — le jeu reste jouable en solo
  pendant ce temps, comme pour le cerveau de négociation local ;
- **filtrage par zone** : un joueur descendu dans la grotte n'apparaît
  pas comme un fantôme à la surface (`js/cave.js` réutilise les mêmes
  coordonnées de tuile d'un niveau à l'autre, d'où l'importance de ce
  filtre côté serveur ET client) — le monde partagé applique le même
  filtre : un bloc cassé dans la grotte niveau 3 n'est diffusé qu'aux
  joueurs qui s'y trouvent ;
- **messages de bloc compacts et rares** : casser/poser/ouvrir une
  porte envoie un petit message JSON (jamais un flot par frame comme
  la position) contenant uniquement ce qui a changé sur la tuile
  (`{t:'block', tx, ty, diff:{...}}`) — voir `js/net-protocol.js`,
  `sanitizeBlockDiff` ;
- **journal en mémoire par zone, avec des bornes dures** : le serveur
  retient les tuiles modifiées d'au plus 64 zones, 20 000 tuiles par
  zone — largement au-dessus d'un usage normal — pour resynchroniser
  qui rejoint, sans jamais laisser la mémoire grossir sans limite sur
  un service qui tourne plusieurs jours d'affilée (les zones les plus
  anciennes sont évincées en premier). Un journal du même genre existe
  pour les coffres (`chestJournal`, jusqu'à 2 000 coffres par zone) ;
- **`maxPayload` relevé à 4 096 octets** (`net-server.js`) pour
  absorber un coffre plein envoyé en entier (~1,4 Ko), tout en gardant
  une limite dure contre un client qui enverrait n'importe quoi.

Aucune configuration n'est nécessaire pour activer le multijoueur : le
serveur écoute automatiquement les connexions WebSocket sur `/ws`, sur
le même port que le reste du jeu (`render.yaml` n'a rien à changer).

**Limites connues** (compromis assumé pour rester dans le budget
gratuit) :
- un client qui **rate un message** (coupure réseau furtive) reste
  désynchronisé sur ce bloc/coffre précis jusqu'à son prochain
  aller-retour de zone (entrer/sortir de la grotte force une
  resynchronisation complète) ;
- la progression des **fours** n'est *pas* synchronisée — seule la
  forme du monde (sol, blocs posés, portes) et le contenu des
  **coffres** le sont ;
- le serveur ne **valide rien** : un client modifié pourrait annoncer
  un bloc halluciné n'importe où, ou remplir un coffre à volonté (pas
  de vérification que les objets envoyés existent vraiment dans
  l'inventaire du joueur). Sans conséquence grave pour une partie entre
  amis, mais à garder en tête si le service devait un jour être ouvert
  plus largement.

Variables d'environnement :

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `AVANIA_MAX_PLAYERS` | `24` | connexions simultanées maximum |
| `AVANIA_TICK_HZ` | `12.5` | fréquence de diffusion des positions |
| `AVANIA_MONTHLY_BYTES_BUDGET` | `3221225472` (3 Go) | seuil de sécurité de bande passante sortante par mois |

## 🧪 Tests, aperçus & benchmark

```bash
npm test                              # test de fumée (logique pure, sans navigateur)
npm run test:browser                  # test d'intégration : le jeu démarre dans un vrai DOM
npm run test:relay                    # relais marchand contre une API Mistral simulée
npm run test:multiplayer              # protocole réseau : vrai server.js + vrais clients WebSocket
npm run test:multiplayer:client       # client réseau (js/net.js) de bout en bout, deux "joueurs"
npm run bench                         # benchmark de la boucle de jeu (ms/frame)
node scripts/render-preview.mjs       # aperçus PNG : monde, personnage, blocs, mobs
node scripts/preview-mobs.mjs         # planches des mobs (profils, marche, scène en jeu)
node scripts/preview-items.mjs        # planches des icônes d'objets (toutes + gros plan)
node scripts/frame-bench.mjs --shots /tmp/shots     # + captures PNG par scénario
node scripts/diff-shots.mjs /tmp/avant /tmp/après   # compare deux dossiers de captures
```

`npm run test:browser` démarre réellement `js/main.js` dans un DOM (jsdom)
avec le vrai `index.html`, puis rejoue une partie complète : cinématique du
monsieur en costume → argent remis → marche vers la grotte → entrée → descente
refusée → négociation avec les deux marchands → achats → équipement → descente
→ remontée. Ce n'est pas un test de rendu (jsdom ne peint rien) : c'est un
test de **câblage** — ids du DOM, imports, rappels du moteur et règles
métier, exécutés par le vrai code de production. C'est lui qui a trouvé les
bugs les plus graves de la v2 (cinématique qui ne se terminait jamais,
marchands absents, offre `/sell` perdue en route).

`npm run test:relay` fait tourner le **vrai** `server.js` devant un amont
simulé qui répond exactement comme La Plateforme. Sont vérifiés pour de vrai :
le point d'entrée appelé, l'en-tête `Bearer`, le modèle demandé, le passage des
ancres économiques en message système, l'espacement d'au moins une seconde
entre deux appels (la limite du palier gratuit), le repli propre sur `429`, et
le refus d'une réponse vide.

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

- [x] **Multijoueur (étape 1 : présence)** — WebSocket, chaque joueur
  voit les autres se déplacer en temps réel (position, orientation,
  apparence, zone).
- [x] **Multijoueur (étape 2 : monde partagé)** — blocs cassés/posés et
  portes synchronisés entre joueurs d'une même zone, avec
  resynchronisation à la connexion.
- [x] **Multijoueur (étape 3 : coffres partagés)** — le contenu des
  coffres est synchronisé entre joueurs d'une même zone, avec
  resynchronisation à la connexion. Les mobs et la progression des
  fours restent locaux à chaque client — ce sera une étape suivante.
- [x] **Plus de blocs** — planche, brique, sable, verre, terre… (+ craft).
- [x] **Économie (v2)** — monnaie, achats auprès des marchands, négociation.
- [ ] **Économie (suite)** — banque, salaires, taxes, troc entre joueurs.
- [x] **La grotte** — 8 niveaux souterrains, pierre & fer, équipement exigé.
- [ ] **Intérieurs** — entrer dans les bâtiments construits.
- [x] **Inventaire & objets** — 36 cases, piles, outils durables et fabrication 3×3.
- [x] **Coffres** — stockage partagé (voir étape 3 ci-dessus) ; vols
  encore possibles côté serveur car rien n'y est validé (limite connue).
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
├── server.js           serveur statique (Node pur, port 3000)
│                       + relais POST /api/merchant vers un modèle si une
│                         clé AVANIA_AI_API_KEY est définie
│                       + branche le multijoueur (net-server.js) sur /ws
├── net-server.js       ★ serveur multijoueur : WebSocket, présence des
│                         joueurs, diffusion des positions ET journal du
│                         monde partagé + du contenu des coffres par
│                         zone (voir la section « Multijoueur » plus haut)
├── js/                 TOUT le jeu (modules ES natifs, ~9 000 lignes)
│   ├── main.js         point d'entrée : initialisation & boucle
│   ├── net.js          ★ client multijoueur : connexion, lissage des
│   │                     positions distantes, reconnexion automatique,
│   │                     relais des changements de bloc (étape 2) et
│   │                     de coffre (étape 3)
│   ├── net-protocol.js ★ protocole partagé (client ET serveur) : trames
│   │                     binaires de position + validation des diffs
│   │                     de bloc et des cases de coffre du monde partagé
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
│   ├── economy.js      ★ monnaie : Wallet, formatage, journal des mouvements
│   ├── cave.js         ★ la grotte : entrée, génération BFS des niveaux,
│   │                     profondeur autorisée selon l'équipement
│   ├── intro.js        ★ cinématique d'arrivée (le monsieur en costume)
│   ├── merchant.js     ★ catalogue, coûts (production + transport), marchands
│   ├── merchant-brain.js ★ cerveau de négociation local (règles du rôle)
│   ├── merchant-ai.js  ★ relais modèle + nettoyage + lecture des commandes
│   ├── chat.js         ★ comptoir de négociation (panneau de dialogue)
│   ├── svgicons.js     icônes vectorielles de l'interface
│   ├── npc/            ★ les PNJ : un fichier par look
│   │   ├── base.js         nom, ombre, nuage « … »
│   │   ├── gentleman.js    le monsieur en costume-cravate
│   │   ├── merchant-look.js Gaspard & Aldric
│   │   └── index.js        drawNpc : un seul point de dessin
│   └── mobs/           ★ les animaux — voir section dédiée plus bas
├── scripts/            outils hors-ligne (Node + @napi-rs/canvas)
│   ├── render-preview.mjs
│   ├── preview-mobs.mjs
│   ├── preview-items.mjs
│   ├── frame-bench.mjs
│   └── diff-shots.mjs
├── test/
│   ├── smoke.mjs       test de fumée : logique pure importée en Node
│   └── browser-boot.mjs ★ test d'intégration : le jeu dans un vrai DOM
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

### Ce que mesure `npm run bench`

Les chunks de sol sont rasterisés **en pixels monde**, donc leur contenu ne
dépend pas du zoom. Un cran de zoom vidait pourtant tout le cache et
reconstruisait les ~16 chunks visibles dans la frame qui suivait : **18 ms de
travail perdu, au-dessus du budget de 16,67 ms** — un à-coup visible à chaque
réglage. Ce coût est désormais **nul**. Le bench le mesure explicitement pour
que l'écart reste vérifiable.

Le scénario « allocations » compte ce que la boucle de jeu alloue : les blocs
posés sont dessinés via une **réserve réutilisée** (9 → 9 objets, aucune
allocation nouvelle) au lieu d'un objet neuf par bloc et par frame. Sur un PC
modeste avec beaucoup d'onglets ouverts, ce n'est pas le coût moyen qui fait
saccader, ce sont les pauses du ramasse-miettes.

Deux autres gains ne sont pas mesurables ici mais sont réels en navigateur :
le HUD n'écrit dans le DOM que lorsque la valeur a **vraiment** changé, et le
`resize` est regroupé au lieu de reconstruire le canvas à chaque pixel.

> Le coût par frame du bench est mesuré en **rastérisation logicielle**
> (`@napi-rs/canvas`) : un navigateur GPU est nettement plus rapide, mais les
> écarts **relatifs** entre deux versions restent la référence. Attention :
> cette bibliothèque native retient ~1 Mo par grand `drawImage` et ne le rend
> jamais — une croissance de RSS dans un script Node n'est **pas** une fuite
> du jeu.

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
