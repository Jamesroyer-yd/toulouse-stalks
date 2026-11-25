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
| Bleue | Enquêteurs | une enquête fouille l'arrêt visé et tous ses voisins |
| Orange | Intervention | une arrestation couvre l'arrêt visé et tous ses voisins |
| Violette | Patrouille | doit changer d'arrêt à chaque manche, de 3 arrêts au plus ; l'arrêt où elle vient d'arriver est interdit aux fugitifs, ni traversé ni atteint, à leur tour suivant |
| Verte | Enquêteurs | comme la Bleue, à 19 et 20 joueurs |

À 2 équipes, de 6 à 10 joueurs, il n'y a que les Enquêteurs et l'Intervention.

## Une manche
1. **Les fugitifs** avancent en secret de 2 arrêts au plus, ou restent sur place. Ils ramassent les objets des arrêts traversés. Leur passage laisse une trace.
2. **Chaque équipe de police** joue à son tour, dans un ordre qui tourne à chaque manche. Chaque policier peut d'abord avancer de 2 arrêts au plus, puis joue 2 actions. La Patrouille, elle, doit changer d'arrêt, de 3 au plus, avant d'agir. Les 2 actions se jouent sur son arrêt ou un arrêt voisin :
   - **Enquêter** : il est seul à voir le résultat, « trace » si un fugitif est passé pendant les 2 dernières manches, ou « rien ». **Il l'annonce ensuite à voix haute**, et un corrompu peut mentir.
   - **Arrêter** : un fugitif présent est arrêté et perd ses objets. Toute tentative s'affiche pour tous, réussie ou non.

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
| 6 | 1 | 3 et 2 | 1 | 20 | 6 |
| 7 | 1 | 3 et 3 | 1 | 20 | 6 |
| 8 | 2 | 3 et 3 | 1 | 24 | 10 |
| 9 | 2 | 4 et 3 | 1 | 24 | 9 |
| 10 | 2 | 4 et 4 | 1 | 26 | 8 |
| 11 | 2 | 3, 3 et 3 | 2 | 28 | 10 |
| 12 | 2 | 4, 3 et 3 | 2 | 28 | 9 |
| 13 | 2 | 4, 4 et 3 | 2 | 28 | 8 |
| 14 | 2 | 4, 4 et 4 | 2 | 28 | 7 |
| 15 | 3 | 4, 4 et 4 | 2 | 32 | 11 |
| 16 | 3 | 5, 4 et 4 | 2 | 32 | 10 |
| 17 | 3 | 5, 5 et 4 | 2 | 32 | 9 |
| 18 | 3 | 5, 5 et 5 | 2 | 34 | 9 |
| 19 | 3 | 4, 4, 4 et 4 | 3 | 36 | 10 |
| 20 | 3 | 5, 4, 4 et 4 | 3 | 36 | 9 |

Toujours 15 manches. La ligne à 14 joueurs reprend la composition de l'émission. Ces équilibres restent à confirmer en jouant entre humains.
