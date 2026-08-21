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
- **Collecte de blocs** : clic gauche = casser (récolte) ou pelleter le
  sable / la terre, clic droit = poser.
- **Inventaire / barre rapide** : touches 1..7 ou molette pour choisir le bloc.
- **Fabrication** (touche `C` ou bouton 🛠️) : 1 bois → 2 planches,
  1 pierre → 2 briques, 2 sable → 1 verre.
- **Plus de blocs** : bois, pierre, planche, brique, verre, sable, terre.
- **Personnage carré 100 % personnalisable** : peau, 11 coiffures, couleurs
  de cheveux, yeux, chapeau (8), lunettes (5), barbe (4), haut, pantalon,
  nom — aperçu live animé (respiration, clignement), look sauvegardé.

## 🚀 Lancer le jeu

```bash
node server.js
# puis ouvre http://localhost:3000
```

## 🎮 Comment jouer

| Action | Touche / clic |
|---|---|
| Se déplacer | ZQSD / WASD / flèches |
| Casser un bloc (récolter) | Clic gauche sur l'arbre / le rocher |
| Pelleter (sable, terre) | Clic gauche sur la plage / la terre |
| Poser le bloc sélectionné | Clic droit |
| Changer de bloc | Touches 1..7 / molette |
| Fabriquer (planches, briques, verre) | Touche `C` ou bouton 🛠️ |

Astuce : casse les **arbres** (→ bois) et les **rochers** (→ pierre) autour de toi,
puis construis ta première cabane.

## 🗺️ Feuille de route

- [ ] **Multijoueur** — serveur WebSocket, positions & actions synchronisées.
- [x] **Plus de blocs** — planche, brique, sable, verre, terre… (+ craft).
- [ ] **Économie** — monnaie, banque, achats, salaires, taxes.
- [ ] **Intérieurs** — entrer dans les bâtiments construits.
- [ ] **Objets & coffres** — inventaire persistant, stockage, vols.
- [ ] **Caméras & sécurité** — poser des caméras, zones surveillées.
- [ ] **Métiers & police** — rôles, arrestations, enquêtes.
- [ ] **Propriété** — revendiquer un terrain, protéger sa maison.

## 🧱 Architecture

```
js/
  config.js      constantes & options de personnalisation
  blocks.js      définition des blocs / objets
  inventory.js   inventaire du joueur
  utils.js       helpers (RNG seed, canvas…)
  input.js       clavier + souris
  camera.js      caméra (zoom + suivi)
  tileset.js     tuiles & objets dessinés en code (pré-rendu)
  world.js       monde vide + casser/poser
  character.js   personnage carré personnalisable
  player.js      entité joueur + collisions
  ui.js          création du personnage + HUD + barre rapide
  game.js        boucle de jeu, rendu, interactions
  main.js        point d'entrée
```

Tout est rendu **en code** (aucun asset externe) pour un style cohérent et facile à étendre.
