# Toulouse Stalks · règles de la version 2

Jeu de traque à déplacement caché sur le vrai réseau Tisséo, de 6 à 20 joueurs, chacun sur son téléphone. On joue ensemble à voix haute, autour d'une table ou sur un salon vocal Discord. Le créateur de la partie choisit sa place : **il joue**, avec un rôle tiré au sort comme les autres, ou **il est maître du jeu** : il ne joue pas, voit toute la partie : rôles, corrompus, fugitifs et objets, et il donne le rythme.

## Rôles, tirés au sort
- **Fugitifs** : ils se connaissent, voient où sont les objets cachés, et savent qui sont les corrompus.
- **Policiers** : répartis en équipes, chacune avec sa spécialité. Toute la police coopère.
- **Corrompus** : un policier caché dans certaines équipes, au plus un par équipe, et une équipe reste toujours honnête. Il voit les fugitifs, et ses arrestations sont annulées en secret.

Tout le monde sait qui sont les fugitifs, mais seuls les fugitifs et les corrompus voient leur position. La position des policiers est publique.

## Les spécialités des équipes
| Équipe | Spécialité | Pouvoir |
|---|---|---|
| Bleue | Enquêteurs | une enquête fouille son arrêt et tous ses voisins |
| Orange | Intervention | une arrestation couvre son arrêt et tous ses voisins |
| Violette | Patrouille | doit changer d'arrêt à chaque manche, de 3 arrêts au plus ; l'arrêt où elle vient d'arriver est interdit aux fugitifs, ni traversé ni atteint, à leur tour suivant |
| Verte | Enquêteurs | comme la Bleue, à 19 et 20 joueurs |

À 2 équipes, de 6 à 10 joueurs, il n'y a que les Enquêteurs et l'Intervention.

## Départ
Les objets sont cachés au hasard. Avant la première manche, chacun choisit son arrêt de départ :
1. **La police** d'abord, sur n'importe quel arrêt. Sa position est visible de tous, et plusieurs joueurs peuvent partager un arrêt.
2. **Les fugitifs** ensuite, en secret, en voyant la police et les objets, mais jamais sur un arrêt qui cache un objet.

## Une manche
1. **Les fugitifs** avancent en secret de 2 arrêts au plus, ou restent sur place. Ils ramassent les objets des arrêts traversés. Leur passage laisse une trace.
2. **Chaque équipe de police** joue à son tour, dans un ordre qui tourne à chaque manche. Chaque policier peut d'abord avancer de 2 arrêts au plus, puis joue 2 actions. La Patrouille, elle, doit changer d'arrêt, de 3 au plus, avant d'agir. Les 2 actions se jouent **sur l'arrêt où il se trouve**, et tout le monde voit en direct qui enquête ou tente une arrestation, et où :
   - **Enquêter** : il est seul à voir le résultat : « un fugitif est passé ici il y a 2 manches », de cette manche jusqu'à 3 manches plus tôt, ou « rien ». **Il l'annonce ensuite à voix haute**, et un corrompu peut mentir.
   - **Arrêter** : un fugitif présent est arrêté et part en prison : il perd ses objets, ne parle plus et ne montre plus son écran jusqu'à la fin. Toute tentative s'affiche pour tous, réussie ou non.

Le compteur d'objets volés est caché à la police : le jeu l'annonce à tous à la fin des manches 5 et 10.

**Chrono, en option** : le créateur peut donner 5 minutes à chaque équipe de police. Le temps écoulé, la main passe à l'équipe suivante.

Le jeu n'a ni bouton de partage ni fausse piste : tout se dit à voix haute.

## Fin
- Les fugitifs gagnent dès qu'ils ont ramassé l'objectif d'objets.
- La police gagne si tous les fugitifs sont arrêtés, ou si l'objectif n'est pas atteint après la 15ᵉ manche.
- Puis chaque équipe de police accuse au plus un coéquipier.

## Points
- **Fugitif** : 1 par objet gardé, plus 3 en cas de victoire.
- **Corrompu** : 4 si les fugitifs gagnent sans qu'il soit démasqué, 1 si la police gagne sans qu'il soit démasqué, 0 s'il est démasqué.
- **Équipe de police** : 3 par arrestation, plus 2 en cas de victoire, plus 2 pour un corrompu démasqué, moins 1 pour un innocent accusé.

Le créateur peut **forcer la suite** si un joueur ne répond plus.

## Le plateau
170 arrêts réels : métro A et B, tram T1 jusqu'à Guyenne-Berry, Téléo, et arrêts Linéo à moins de 4 km du Capitole. On ne se déplace que le long des lignes. Le centre-ville est agrandi, comme sur un plan de métro, et les arrêts trop proches sont écartés pour rester lisibles.

## Répartitions équilibrées
Proposées par défaut dans la salle d'attente, et modifiables par le créateur. Elles sont définies dans `EQUILIBRES`, dans src/moteur.js, et calées par simulation avec outils/simuler.mjs : environ une victoire sur deux pour chaque camp.

| Joueurs | Fugitifs | Équipes de police | Corrompus | Objets cachés | Objectif |
|---|---|---|---|---|---|
| 6 | 1 | 3 et 2 | 1 | 14 | 6 |
| 7 | 1 | 3 et 3 | 1 | 26 | 8 |
| 8 | 2 | 3 et 3 | 1 | 28 | 12 |
| 9 | 2 | 4 et 3 | 1 | 24 | 11 |
| 10 | 2 | 4 et 4 | 1 | 20 | 9 |
| 11 | 2 | 3, 3 et 3 | 2 | 30 | 12 |
| 12 | 2 | 4, 3 et 3 | 2 | 34 | 12 |
| 13 | 2 | 4, 4 et 3 | 2 | 22 | 9 |
| 14 | 2 | 4, 4 et 4 | 2 | 26 | 8 |
| 15 | 3 | 4, 4 et 4 | 2 | 34 | 12 |
| 16 | 3 | 5, 4 et 4 | 2 | 36 | 11 |
| 17 | 3 | 5, 5 et 4 | 2 | 30 | 9 |
| 18 | 3 | 5, 5 et 5 | 2 | 36 | 9 |
| 19 | 3 | 4, 4, 4 et 4 | 3 | 42 | 11 |
| 20 | 3 | 5, 4, 4 et 4 | 3 | 38 | 8 |

Toujours 15 manches. La ligne à 14 joueurs reprend la composition de l'émission. Ces équilibres restent à confirmer en jouant entre humains.
