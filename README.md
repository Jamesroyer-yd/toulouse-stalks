# Toulouse Stalks

Jeu de traque sur le réseau Tisséo, de 6 à 20 joueurs, chacun sur son téléphone, à voix haute au bar ou sur Discord. Règles : [REGLES.md](REGLES.md). Livret illustré : `outils/livret/`.

## Lancer en local, sur le Wi-Fi de la maison
    npm install
    npm run dev
Puis ouvrir `http://ADRESSE-DU-PC:8787` sur chaque téléphone du même Wi-Fi.

## Tester seul
À la création, choisir **Partie d’essai** : la partie se remplit de 6 à 20 faux joueurs. Une barre en haut de l’écran permet de voir l’écran du MJ ou de n’importe quel joueur, et de jouer à sa place. Seul le créateur d’une partie d’essai peut le faire.

## Mettre en ligne sur Cloudflare
Le jeu tourne sur l'offre gratuite de Cloudflare Workers : les fichiers de `public/`, plus une salle de jeu par partie dans un Durable Object.

1. **Créer un compte** sur https://dash.cloudflare.com, ou se connecter à celui qui existe.
2. **Relier le dossier au compte**, une seule fois :

       npx wrangler login

   Une page s'ouvre dans le navigateur : accepter.
3. **Publier** :

       npx wrangler deploy

   À la fin, wrangler affiche l'adresse du jeu : `https://toulouse-stalks.NOM-DU-COMPTE.workers.dev`. C'est cette adresse qu'on donne aux joueurs.

   Adresse provisoire du jeu : https://traque.okamimura.com, déclarée dans `wrangler.jsonc` (routes). L'adresse en workers.dev reste active en secours.
4. **Plus tard, pour publier une nouvelle version**, refaire seulement `npx wrangler deploy`.

Options :
- **Publier à chaque push sur GitHub** : dans le tableau de bord Cloudflare, Workers & Pages, puis toulouse-stalks, Settings, Builds, connecter le dépôt GitHub. La commande de publication est `npx wrangler deploy`.
- **Un nom de domaine à soi** : dans le tableau de bord, le Worker, Settings, Domains & Routes, Add, Custom domain. Le domaine doit être géré par Cloudflare.

## Tests
    npm test                 # moteur : règles et entrées hostiles
    npm run test:serveur     # bout en bout, serveur local lancé sur le port 8788

## Plateau
`npm run reseau` refait `public/reseau.json` à partir des données ouvertes Tisséo, en GTFS sous licence ODbL : métro A et B, tram T1 jusqu'à Guyenne-Berry, Téléo, les Linéo à moins de 4 km du Capitole, et la L5 prolongée jusqu’à l’Oncopole, terminus de Téléo. Le centre-ville est agrandi comme sur un plan de métro et les arrêts trop proches sont écartés. `MARCHE=1` remet les correspondances à pied et `BUS=1` les liaisons en bus, toutes deux désactivées.

## Simulation
L'ordinateur joue des centaines de parties avec des robots simples, sur le vrai moteur, et dit en phrases qui gagne :

    npm run simuler                                   # toutes les tailles, de 6 à 20 joueurs
    npm run simuler -- --joueurs 14                   # une seule taille
    npm run simuler -- --joueurs 14 --objectif 9      # tester un autre objectif
    npm run simuler -- --joueurs 14 --objets 30 --manches 12 --parties 1000

Réglages possibles : `--fugitifs`, `--equipes`, `--corrompus`, `--objets`, `--objectif`, `--manches`, `--specialites 0` pour jouer sans les spécialités, `--parties` pour le nombre de parties, 300 par défaut. `--tableau` affiche les résultats en tableau. Les robots ne bluffent pas et ne se méfient pas : les chiffres servent à comparer des réglages entre eux.

## Organisation
- `src/moteur.js` : les règles, des fonctions pures et testées.
- `src/worker.js` : le serveur Cloudflare, une partie par Durable Object, en WebSocket.
- `public/` : l'interface, avec `js/plan.js` pour le plan et `js/app.js` pour les écrans.
- `outils/` : extraction du plateau, simulation, livret de règles.

## Sécurité
- Le moteur vérifie toutes les entrées : entiers bornés, joueurs existants, et `Object.hasOwn` contre les pièges de prototype.
- Les prénoms sont filtrés : lettres, chiffres, espace, apostrophe et tiret seulement.
- Le serveur limite la taille des requêtes à 2 Ko et la cadence des messages à 30 par 10 secondes, n'accepte que la même origine et que des actions d'une liste fermée.
- Le jeton secret de 256 bits ne passe jamais dans une adresse.
- L'interface n'utilise jamais `innerHTML`, sous une CSP stricte définie dans `public/_headers`.
