# 🏘️ AVANIA — Le village vivant

> Un monde RP multijoueur en ligne, vue **top-down**. Un village où chacun fait ce qu'il veut : commerce, métiers, police, vol, surveillance… une économie vivante, des milliers d'histoires.

## 🌟 La vision

Avania, c'est un grand village en ligne inspiré des gros RP communautaires. Ici, la **liberté totale** est la règle :

- 🪙 **Économie** : une monnaie, des métiers, des boutiques, du commerce entre joueurs.
- 🏦 **Des rôles** : policier, commerçant, banquier, agriculteur, voleur…
- 📹 **Surveillance** : n'importe quel joueur peut poser des caméras (façon alarme) pour protéger ses biens.
- 🚓 **Justice** : le vol est *techniquement possible*… à tes risques. La police peut enquêter.
- 🎨 **Personnage personnalisé** : chacun crée son avatar unique.

Le but : faire vivre un village — un **phénomène** dont on parle tous les jours.

## ✅ Déjà en place (v1)

- **Map de base** générée procéduralement (seed déterministe) : village, place centrale avec fontaine, routes, **Mairie, Banque, Police, Marché, Café, Boutique, Bricolage**, maisons, ferme, rivière avec pont, lac, forêts.
- **Système de personnage personnalisé** : peau, coiffure (7 styles), couleurs de cheveux, yeux, haut, pantalon, nom — avec aperçu live et bouton "Surprise !".
- **Déplacements** fluides (ZQSD / WASD / flèches) avec collisions, caméra qui suit, profondeur réaliste (on passe derrière les toits et les arbres).

## 🚀 Lancer le jeu

```bash
node server.js
# puis ouvre http://localhost:3000
```

*(ou `python3 -m http.server 3000` — il faut juste un serveur HTTP pour les modules ES.)*

## 🗺️ Feuille de route

- [ ] **Multijoueur** — serveur WebSocket, positions & actions synchronisées.
- [ ] **Économie** — monnaie, banque, achats, salaires, taxes.
- [ ] **Intérieurs** — entrer dans les bâtiments (maison, banque, commissariat…).
- [ ] **Inventaire & objets** — objets physiques, vols, verrous, clés.
- [ ] **Caméras & sécurité** — poser des caméras, zones surveillées.
- [ ] **Métiers & police** — rôles, arrestations, enquêtes.
- [ ] **Propriété** — acheter/construire sa maison.

## 🧱 Architecture

```
js/
  config.js      constantes & options de personnalisation
  utils.js       helpers (RNG seed, canvas…)
  input.js       clavier (ZQSD/WASD/flèches)
  camera.js      caméra (zoom + suivi)
  tileset.js     tuiles dessinées en code (pré-rendu)
  world.js       génération de la carte (seed)
  decor.js       rendu du décor (arbres, toits, fontaine…)
  character.js   rendu du personnage personnalisable
  player.js      entité joueur + collisions
  ui.js          création du personnage + HUD
  game.js        boucle de jeu + rendu
  main.js        point d'entrée
```

Tout est rendu **en code** (aucun asset externe) pour un style cohérent et facile à étendre.
