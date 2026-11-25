// Toulouse Stalks · moteur de jeu.
// Fonctions pures sur l'état d'une partie : aucune entrée, aucun réseau.
// Le serveur (src/worker.js) les appelle, garde l'état et envoie à chaque
// joueur sa propre vue (fonction vue), jamais l'état complet.
// Une action interdite lève une Erreur dont le message s'affiche au joueur.
// Règles détaillées : REGLES.md.

export const NOMS_EQUIPES = ['Bleue', 'Orange', 'Violette', 'Verte'];
const PAS_MAX = 2;          // arrêts parcourus par manche, fugitifs comme policiers
const ACTIONS = 2;          // actions par policier et par tour
const MEMOIRE_TRACES = 2;   // par défaut, une enquête voit les passages des 2 dernières manches (réglage « traces »)
// en dessous de 6, une équipe de 2 avec un corrompu le démasque aussitôt
const MIN_JOUEURS = 6, MAX_JOUEURS = 20;

export class Erreur extends Error {}
const exiger = (cond, message) => { if (!cond) throw new Erreur(message); };

// ---------- contrôle des entrées ----------
// Tout ce qui vient d'un téléphone est suspect : types, bornes, clés d'objet.
const aJoueur = (p, id) => typeof id === 'string' && Object.hasOwn(p.joueurs, id);
const arret = (reseau, a) => { exiger(Number.isInteger(a) && a >= 0 && a < reseau.arrets.length, 'Arrêt inconnu.'); return a; };
// prénom : lettres, chiffres, espaces, tiret et apostrophe, 20 caractères au plus
export function nettoyerNom(nom) {
  // 200 caractères lus au plus, puis seuls lettres, chiffres, espace, ' ’ et - sont gardés :
  // aucun < > " & ni caractère de contrôle ne peut atteindre un écran ou un journal
  const n = String(typeof nom === 'string' ? nom.slice(0, 200) : '').normalize('NFC').replace(/[^\p{L}\p{N} '’-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20);
  exiger(n, 'Choisis un prénom, avec des lettres.');
  return n;
}
const entier = (v, min, max, message) => { const n = Number(v); exiger(Number.isInteger(n) && n >= min && n <= max, message); return n; };

// ---------- réseau ----------
// chemins d'au plus `pas` arrêts depuis `depart` : { arret: [arrêts traversés, arrivée comprise] }
// `bloques` : arrêts qu'on ne peut ni traverser ni atteindre (patrouille)
export function accessibles(reseau, depart, pas = PAS_MAX, bloques = null) {
  const chemins = { [depart]: [] };
  let front = [depart];
  for (let i = 0; i < pas; i++) {
    const suivant = [];
    for (const a of front) for (const v of reseau.arrets[a].voisins) {
      if (chemins[v] !== undefined || bloques?.has(v)) continue;
      chemins[v] = [...chemins[a], v]; suivant.push(v);
    }
    front = suivant;
  }
  return chemins;
}
const distances = (reseau, depart) => {
  const d = { [depart]: 0 }; let front = [depart];
  while (front.length) { const s = []; for (const a of front) for (const v of reseau.arrets[a].voisins) if (d[v] === undefined) { d[v] = d[a] + 1; s.push(v); } front = s; }
  return d;
};

// ---------- réglages ----------
// Répartitions équilibrées de 6 à 20 joueurs, voir REGLES.md. Objectifs
// calés par simulation (outils/simuler.mjs) avec spécialités et coopération :
// environ une victoire sur deux pour chaque camp. Une équipe reste toujours
// sans corrompu.
// joueurs : [fugitifs, équipes, corrompus, objets, objectif]
export const EQUILIBRES = {
  6: [1, 2, 1, 20, 7], 7: [1, 2, 1, 20, 6],
  8: [2, 2, 1, 24, 11], 9: [2, 2, 1, 24, 9], 10: [2, 2, 1, 26, 10],
  11: [2, 3, 2, 28, 11], 12: [2, 3, 2, 28, 9], 13: [2, 3, 2, 28, 8], 14: [2, 3, 2, 28, 8],
  15: [3, 3, 2, 32, 11], 16: [3, 3, 2, 32, 10], 17: [3, 3, 2, 32, 10], 18: [3, 3, 2, 34, 10],
  19: [3, 4, 3, 36, 10], 20: [3, 4, 3, 36, 10]
};
export function reglagesParDefaut(nb) {
  if (EQUILIBRES[nb]) { const [fugitifs, equipes, corrompus, objets, objectif] = EQUILIBRES[nb]; return { fugitifs, equipes, corrompus, objets, objectif, manches: 15, traces: MEMOIRE_TRACES, specialites: 1 }; }
  const fugitifs = nb <= 7 ? 1 : 2;
  const police = Math.max(nb - fugitifs, 0);
  const equipes = police >= 9 ? 3 : police >= 4 ? 2 : 1;
  const corrompus = Math.min(equipes - 1, police >= 6 ? 2 : police >= 4 ? 1 : 0);
  return { fugitifs, equipes, corrompus, objets: 28, objectif: 12, manches: 15, traces: MEMOIRE_TRACES, specialites: 1 };
}
function verifierReglages(r, nb) {
  const police = nb - r.fugitifs;
  exiger(r.fugitifs >= 1 && r.fugitifs <= Math.max(1, nb - 2), 'Nombre de fugitifs impossible.');
  exiger(r.equipes >= 1 && r.equipes <= NOMS_EQUIPES.length && r.equipes <= police, 'Pas assez de policiers pour ces équipes.');
  exiger(r.corrompus >= 0 && r.corrompus <= r.equipes, 'Au plus un corrompu par équipe.');
  exiger(r.corrompus === 0 || Math.floor(police / r.equipes) >= 2, 'Une équipe avec un corrompu doit compter au moins 2 policiers.');
  exiger(r.objectif >= 1 && r.objectif <= r.objets && r.objets <= 80, 'Objectif d’objets impossible.');
  exiger(r.manches >= 3 && r.manches <= 30, 'Nombre de manches impossible.');
  exiger(r.traces >= 1 && r.traces <= 4, 'Durée des traces impossible.');
  exiger(r.specialites === 0 || r.specialites === 1, 'Réglage des spécialités impossible.');
}

// ---------- salle d'attente ----------
// mj = true : le créateur est maître du jeu. Il ne reçoit pas de rôle, voit
// toute la partie et garde les commandes : régler, lancer, forcer la suite.
// essai = nombre de faux joueurs, de 6 à 20 : partie d'essai pour un MJ seul,
// qui peut voir le jeu et jouer à la place de n'importe quel faux joueur.
const NOMS_ESSAI = ['Léa', 'Hugo', 'Inès', 'Malik', 'Sarah', 'Tom', 'Chloé', 'Yanis', 'Emma', 'Nora', 'Lucas', 'Jade', 'Rémi', 'Zoé', 'Adam', 'Lina', 'Noé', 'Mia', 'Sacha', 'Alba'];
export function nouvellePartie(code, id, nom, mj = false, essai = 0) {
  const p = { code, phase: 'salle', createur: id, mj: null, essai: false, joueurs: {}, ordre: [], reglages: reglagesParDefaut(0), manche: 0, journal: [] };
  if (essai) {
    exiger(Number.isInteger(essai) && essai >= MIN_JOUEURS && essai <= MAX_JOUEURS, `Une partie d'essai compte de ${MIN_JOUEURS} à ${MAX_JOUEURS} joueurs.`);
    mj = true;
  }
  if (mj === true) {
    exiger(typeof id === 'string' && /^[A-Za-z0-9-]{1,40}$/.test(id), 'Joueur inconnu.');
    p.mj = { id, nom: nettoyerNom(nom) };
  } else rejoindre(p, id, nom);
  if (essai) {
    p.essai = true;
    NOMS_ESSAI.filter(n => n.toLowerCase() !== p.mj.nom.toLowerCase()).slice(0, essai).forEach((n, i) => rejoindre(p, 'essai-' + (i + 1), n));
  }
  return p;
}
// en essai, le MJ peut jouer à la place d'un faux joueur
export function incarnation(p, mjId, joueur) {
  exiger(p.essai && estMJ(p, mjId), 'Réservé au MJ d’une partie d’essai.');
  exiger(joueur === null || aJoueur(p, joueur), 'Joueur inconnu.');
  return joueur;
}
// liste pour la barre d'essai : qui est qui
export const listeEssai = p => p.ordre.map(f => { const j = p.joueurs[f]; return { id: f, nom: j.nom, role: j.role ?? null, equipe: j.equipe ?? null, corrompu: !!j.corrompu, libre: j.libre ?? true }; });
export const estMJ = (p, id) => !!p.mj && p.mj.id === id;
export function rejoindre(p, id, nom) {
  exiger(p.phase === 'salle', 'La partie a déjà commencé.');
  // identifiant fabriqué par le serveur : lettres et chiffres seulement, jamais __proto__
  exiger(typeof id === 'string' && /^[A-Za-z0-9-]{1,40}$/.test(id) && !Object.hasOwn(p.joueurs, id) && !estMJ(p, id), 'Joueur inconnu.');
  nom = nettoyerNom(nom);
  exiger(p.ordre.length < MAX_JOUEURS, `La partie est pleine : ${MAX_JOUEURS} joueurs au plus.`);
  exiger(![...Object.values(p.joueurs), ...(p.mj ? [p.mj] : [])].some(j => j.nom.toLowerCase() === nom.toLowerCase()), 'Ce prénom est déjà pris.');
  p.joueurs[id] = { id, nom };
  p.ordre.push(id);
  p.reglages = reglagesParDefaut(p.ordre.length);
}
export function regler(p, id, reglages) {
  exiger(p.phase === 'salle', 'La partie a déjà commencé.');
  exiger(id === p.createur, 'Seul le créateur règle la partie.');
  exiger(reglages && typeof reglages === 'object', 'Réglages invalides.');
  const r = { ...p.reglages };
  for (const k of Object.keys(r)) if (Object.hasOwn(reglages, k)) r[k] = entier(reglages[k], 0, 80, 'Réglage invalide.');
  verifierReglages(r, p.ordre.length);
  p.reglages = r;
}

// ---------- lancement ----------
const melanger = (t, rnd) => { const a = [...t]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function lancer(p, id, reseau, rnd = Math.random) {
  exiger(p.phase === 'salle', 'La partie a déjà commencé.');
  exiger(id === p.createur, 'Seul le créateur lance la partie.');
  exiger(p.ordre.length >= MIN_JOUEURS, `Il faut au moins ${MIN_JOUEURS} joueurs.`);
  const r = p.reglages; verifierReglages(r, p.ordre.length);
  const tires = melanger(p.ordre, rnd);
  const fugitifs = tires.slice(0, r.fugitifs), policiers = tires.slice(r.fugitifs);
  fugitifs.forEach(f => Object.assign(p.joueurs[f], { role: 'fugitif', libre: true, objets: 0 }));
  policiers.forEach((f, i) => Object.assign(p.joueurs[f], { role: 'policier', equipe: i % r.equipes, corrompu: false, arrestations: 0 }));
  // un corrompu dans `corrompus` équipes différentes, tirées au sort
  for (const e of melanger([...Array(r.equipes).keys()], rnd).slice(0, r.corrompus)) {
    const membres = policiers.filter(f => p.joueurs[f].equipe === e);
    p.joueurs[melanger(membres, rnd)[0]].corrompu = true;
  }
  // départs : policiers sur le métro, fugitifs loin d'eux, objets ailleurs
  const tous = reseau.arrets.map(a => a.id);
  const metro = melanger(reseau.arrets.filter(a => a.lignes.some(l => l === 'A' || l === 'B')).map(a => a.id), rnd);
  policiers.forEach((f, i) => { p.joueurs[f].position = metro[i % metro.length]; });
  const pris = new Set(policiers.map(f => p.joueurs[f].position));
  const loin = a => policiers.every(f => (distances(reseau, p.joueurs[f].position)[a] ?? 99) >= 4);
  const candidats = melanger(tous.filter(a => !pris.has(a)), rnd);
  for (const f of fugitifs) {
    const a = candidats.find(c => loin(c) && !pris.has(c)) ?? candidats.find(c => !pris.has(c));
    p.joueurs[f].position = a; pris.add(a);
  }
  p.objets = melanger(tous.filter(a => !pris.has(a)), rnd).slice(0, r.objets);
  p.passages = {};               // arrêt → [{ manche }] : passages des fugitifs, base des traces
  fugitifs.forEach(f => noterPassage(p, p.joueurs[f].position, 0));
  p.enquetes = {};               // joueur → ses résultats, vus par lui seul
  p.journal = [];
  p.phase = 'roles';
  p.prets = [];
}
const noterPassage = (p, a, manche) => { (p.passages[a] ||= []).push({ manche }); };
export function pret(p, id) {
  exiger(p.phase === 'roles', 'Ce n’est pas le moment.');
  exiger(aJoueur(p, id), 'Joueur inconnu.');
  if (!p.prets.includes(id)) p.prets.push(id);
  if (p.prets.length === p.ordre.length) debutManche(p);
}

// ---------- spécialités des équipes, en essai ----------
// Enquêteurs : une enquête couvre l'arrêt visé et ses voisins.
// Intervention : une arrestation couvre l'arrêt visé et ses voisins.
// Patrouille : avance de 3 arrêts ; un fugitif ne peut ni traverser ni atteindre un arrêt qu'elle occupe.
export const SPECIALITES = ['enqueteurs', 'intervention', 'patrouille', 'enqueteurs'];
export const specialite = (p, e) => p.reglages?.specialites ? SPECIALITES[e] : null;
// Un arrêt n'est bloqué que si un patrouilleur vient d'y arriver, pendant le
// tour de police précédent : impossible de camper sur une sortie.
const estPatrouille = (p, j) => j.role === 'policier' && specialite(p, j.equipe) === 'patrouille';
const bloquesPatrouille = p => new Set(p.ordre.filter(f => estPatrouille(p, p.joueurs[f]) && p.joueurs[f].arrivee === p.manche - 1).map(f => p.joueurs[f].position));
export const arretsBloques = p => [...bloquesPatrouille(p)];
// arrêts accessibles pour un fugitif, patrouilles comprises
export const cheminsFugitif = (p, id, reseau) => accessibles(reseau, p.joueurs[id].position, PAS_MAX, bloquesPatrouille(p));

// ---------- manches ----------
const libres = p => p.ordre.filter(f => p.joueurs[f].role === 'fugitif' && p.joueurs[f].libre);
const membres = (p, e) => p.ordre.filter(f => p.joueurs[f].role === 'policier' && p.joueurs[f].equipe === e);
const objetsEquipe = p => p.ordre.reduce((s, f) => s + (p.joueurs[f].role === 'fugitif' ? p.joueurs[f].objets : 0), 0);

function debutManche(p) {
  p.manche += 1;
  p.phase = 'fugitifs';
  p.coups = {};                  // fugitif → { arrivee, chemin } en attente
  const n = p.reglages.equipes;  // l'ordre des équipes tourne à chaque manche
  p.ordreEquipes = [...Array(n).keys()].map(i => (i + p.manche - 1) % n);
}

export function deplacerFugitif(p, id, arrivee, reseau) {
  exiger(p.phase === 'fugitifs', 'Ce n’est pas le tour des fugitifs.');
  exiger(aJoueur(p, id), 'Joueur inconnu.');
  const j = p.joueurs[id];
  exiger(j.role === 'fugitif' && j.libre, 'Tu ne peux pas te déplacer.');
  arret(reseau, arrivee);
  const chemins = cheminsFugitif(p, id, reseau);
  exiger(Object.hasOwn(chemins, arrivee), 'Cet arrêt est trop loin : 2 arrêts au plus.');
  p.coups[id] = { arrivee, chemin: chemins[arrivee] };
  if (libres(p).every(f => p.coups[f])) finTourFugitifs(p);
}
function finTourFugitifs(p) {
  for (const f of libres(p)) {
    const coup = p.coups[f]; if (!coup) continue;   // pas joué : il reste sur place
    const j = p.joueurs[f];
    for (const a of coup.chemin) {
      noterPassage(p, a, p.manche);
      const k = p.objets.indexOf(a);
      if (k >= 0) { p.objets.splice(k, 1); j.objets += 1; }
    }
    j.position = coup.arrivee;
  }
  p.coups = {};
  if (objetsEquipe(p) >= p.reglages.objectif) return finPartie(p, 'fugitifs', 'Les fugitifs ont ramassé assez d’objets.');
  p.phase = 'police'; p.tourEquipe = 0; debutTourEquipe(p);
}
function debutTourEquipe(p) {
  const e = p.ordreEquipes[p.tourEquipe];
  p.tour = {};
  for (const f of membres(p, e)) p.tour[f] = { deplace: false, actions: ACTIONS, fini: false };
}
const equipeEnCours = p => p.ordreEquipes[p.tourEquipe];
function monTour(p, id) {
  exiger(p.phase === 'police', 'Ce n’est pas le tour de la police.');
  exiger(aJoueur(p, id), 'Joueur inconnu.');
  const j = p.joueurs[id];
  exiger(j.role === 'policier' && j.equipe === equipeEnCours(p), 'Ce n’est pas le tour de ton équipe.');
  exiger(!p.tour[id].fini, 'Tu as déjà fini ton tour.');
  return j;
}

export function deplacerPolicier(p, id, arrivee, reseau) {
  const j = monTour(p, id), t = p.tour[id];
  exiger(!t.deplace, 'Tu t’es déjà déplacé ce tour.');
  exiger(t.actions === ACTIONS, 'On se déplace avant d’agir.');
  arret(reseau, arrivee);
  const patrouille = estPatrouille(p, j), pas = patrouille ? 3 : PAS_MAX;
  exiger(Object.hasOwn(accessibles(reseau, j.position, pas), arrivee), `Cet arrêt est trop loin : ${pas} arrêts au plus.`);
  exiger(!patrouille || arrivee !== j.position, 'La Patrouille doit changer d’arrêt à chaque manche.');
  if (patrouille) j.arrivee = p.manche;
  j.position = arrivee; t.deplace = true;
}
const aPortee = (reseau, j, cible) => arret(reseau, cible) === j.position || reseau.arrets[j.position].voisins.includes(cible);

export function enqueter(p, id, cible, reseau) {
  const j = monTour(p, id), t = p.tour[id];
  exiger(t.actions > 0, 'Tu n’as plus d’action.');
  exiger(t.deplace || !estPatrouille(p, j), 'La Patrouille doit d’abord changer d’arrêt.');
  exiger(aPortee(reseau, j, cible), 'Tu enquêtes sur ton arrêt ou un arrêt voisin.');
  t.actions -= 1; t.deplace = true;
  const recent = a => (p.passages[a] || []).filter(x => x.manche >= p.manche - (p.reglages.traces ?? MEMOIRE_TRACES) + 1 || (p.manche === 1 && x.manche === 0));
  const zone = specialite(p, j.equipe) === 'enqueteurs' ? [cible, ...reseau.arrets[cible].voisins] : [cible];
  const traces = zone.filter(a => recent(a).length).map(a => ({ arret: a, manche: Math.max(...recent(a).map(x => x.manche)) }));
  const vus = traces.map(t => ({ manche: t.manche }));
  const res = { manche: p.manche, arret: cible, trace: vus.length > 0, mancheTrace: vus.length ? Math.max(...vus.map(x => x.manche)) : null };
  if (zone.length > 1) { res.zone = zone; res.traces = traces; }
  (p.enquetes[id] ||= []).push(res);
  finSiPlusDAction(p, id);
  return res;
}

export function arreter(p, id, cible, reseau) {
  const j = monTour(p, id), t = p.tour[id];
  exiger(t.actions > 0, 'Tu n’as plus d’action.');
  exiger(t.deplace || !estPatrouille(p, j), 'La Patrouille doit d’abord changer d’arrêt.');
  exiger(aPortee(reseau, j, cible), 'Tu arrêtes sur ton arrêt ou un arrêt voisin.');
  t.actions -= 1; t.deplace = true;
  const zone = specialite(p, j.equipe) === 'intervention' ? [cible, ...reseau.arrets[cible].voisins] : [cible];
  const pris = libres(p).filter(f => zone.includes(p.joueurs[f].position));
  const ok = pris.length > 0 && !j.corrompu;          // l'arrestation d'un corrompu est annulée en secret
  const nomArret = reseau.arrets[cible].nom;
  if (ok) {
    for (const f of pris) { const g = p.joueurs[f]; g.libre = false; g.objetsPerdus = g.objets; g.objets = 0; }
    j.arrestations += pris.length;
    p.journal.push({ manche: p.manche, texte: `${pris.map(f => p.joueurs[f].nom).join(' et ')} arrêté${pris.length > 1 ? 's' : ''} à ${nomArret} par ${j.nom}, équipe ${NOMS_EQUIPES[j.equipe]}.` });
    if (!libres(p).length) return finPartie(p, 'police', 'Tous les fugitifs sont arrêtés.');
  } else {
    p.journal.push({ manche: p.manche, texte: `${j.nom}, équipe ${NOMS_EQUIPES[j.equipe]}, tente une arrestation à ${nomArret} : personne.` });
    if (pris.length) j.annulees = (j.annulees || 0) + 1;
  }
  finSiPlusDAction(p, id);
  return { reussie: ok };
}
function finSiPlusDAction(p, id) { if (p.tour[id].actions === 0) finirTour(p, id); }

// Les résultats d'enquête ne se partagent pas dans le jeu : chacun annonce
// le sien à voix haute, autour de la table ou sur Discord, vrai ou faux.

export function finirTour(p, id) {
  const j = monTour(p, id);
  exiger(p.tour[id].deplace || !estPatrouille(p, j), 'La Patrouille doit d’abord changer d’arrêt.');
  p.tour[id].fini = true;
  if (Object.values(p.tour).every(t => t.fini)) equipeSuivante(p);
}
function equipeSuivante(p) {
  p.tourEquipe += 1;
  if (p.tourEquipe < p.ordreEquipes.length) return debutTourEquipe(p);
  if (p.manche >= p.reglages.manches) return finPartie(p, 'police', 'Les fugitifs n’ont pas ramassé assez d’objets à temps.');
  debutManche(p);
}
// le créateur débloque un joueur absent : les fugitifs qui n'ont pas joué restent sur place
export function forcerSuite(p, id) {
  exiger(id === p.createur, 'Seul le créateur peut forcer la suite.');
  if (p.phase === 'roles') return debutManche(p);
  if (p.phase === 'fugitifs') return finTourFugitifs(p);
  if (p.phase === 'police') return equipeSuivante(p);
  if (p.phase === 'accusation') return resultats(p);
  throw new Erreur('Rien à forcer.');
}

// ---------- fin ----------
function finPartie(p, gagnant, raison) {
  p.gagnant = gagnant; p.raison = raison;
  p.phase = 'accusation';
  p.votes = {};
}
export function accuser(p, id, cible) {
  exiger(p.phase === 'accusation', 'Ce n’est pas le moment d’accuser.');
  exiger(aJoueur(p, id), 'Joueur inconnu.');
  const j = p.joueurs[id];
  exiger(j.role === 'policier', 'Seuls les policiers votent.');
  exiger(cible === null || (aJoueur(p, cible) && cible !== id && p.joueurs[cible].equipe === j.equipe && p.joueurs[cible].role === 'policier'), 'Tu accuses un membre de ton équipe, ou personne.');
  p.votes[id] = cible;
  if (p.ordre.filter(f => p.joueurs[f].role === 'policier').every(f => f in p.votes)) resultats(p);
}
function resultats(p) {
  const r = p.reglages, equipes = [];
  for (let e = 0; e < r.equipes; e++) {
    const m = membres(p, e), compte = {};
    m.forEach(f => { const c = p.votes[f] ?? null; compte[c] = (compte[c] || 0) + 1; });
    const [haut, n] = Object.entries(compte).sort((a, b) => b[1] - a[1])[0] || ['null', 0];
    const egalite = Object.values(compte).filter(v => v === n).length > 1;
    const accuse = egalite || haut === 'null' ? null : haut;
    const corrompu = m.find(f => p.joueurs[f].corrompu) || null;
    const arrests = m.reduce((s, f) => s + (p.joueurs[f].corrompu ? 0 : p.joueurs[f].arrestations), 0);
    let points = 3 * arrests + (p.gagnant === 'police' ? 2 : 0);
    if (accuse && accuse === corrompu) points += 2;
    if (accuse && accuse !== corrompu) points -= 1;
    equipes.push({ equipe: e, nom: NOMS_EQUIPES[e], accuse, corrompu, demasque: !!accuse && accuse === corrompu, arrestations: arrests, points });
  }
  const points = {};
  for (const f of p.ordre) {
    const j = p.joueurs[f];
    if (j.role === 'fugitif') points[f] = j.objets + (p.gagnant === 'fugitifs' ? 3 : 0);
    else if (j.corrompu) points[f] = equipes[j.equipe].demasque ? 0 : (p.gagnant === 'fugitifs' ? 4 : 1);
    else points[f] = equipes[j.equipe].points;
  }
  p.resultat = { gagnant: p.gagnant, raison: p.raison, equipes, points, objets: objetsEquipe(p) };
  p.phase = 'fin';
}

// ---------- vue d'un joueur ----------
// Ce que le joueur a le droit de savoir, rien de plus.
export function vue(p, id) {
  if (estMJ(p, id)) return vueMJ(p, id);
  const moi = p.joueurs[id];
  const fin = p.phase === 'fin';
  const voitFugitifs = fin || moi?.role === 'fugitif' || moi?.corrompu;
  const joueurs = p.ordre.map(f => {
    const j = p.joueurs[f];
    const o = { id: f, nom: j.nom, role: j.role ?? null, equipe: j.equipe ?? null };
    if (j.role === 'policier') o.position = j.position;                       // public
    if (j.role === 'fugitif') { o.libre = j.libre; if (voitFugitifs || !j.libre) o.position = j.position; }
    if (fin) o.corrompu = !!j.corrompu;
    if (p.phase === 'roles') o.pret = p.prets.includes(f);
    return o;
  });
  const v = { code: p.code, phase: p.phase, createur: p.createur, mj: p.mj ? p.mj.nom : null, moi: id, reglages: p.reglages, manche: p.manche, joueurs, journal: p.journal };
  if (!moi?.role) return v;
  v.role = { role: moi.role, equipe: moi.equipe ?? null, corrompu: !!moi.corrompu, specialite: moi.role === 'policier' ? specialite(p, moi.equipe) : null };
  if (p.reglages.specialites) v.specialites = [...Array(p.reglages.equipes).keys()].map(e => specialite(p, e));
  if (moi.role === 'fugitif' || moi.corrompu) v.corrompus = p.ordre.filter(f => p.joueurs[f].corrompu);
  if (moi.role === 'fugitif') { v.objets = p.objets; v.coup = p.coups?.[id] ?? null; }
  v.objetsRamasses = objetsEquipe(p);
  if (moi.role === 'policier') { v.enquetes = p.enquetes[id] || []; }
  if (p.phase === 'police') { v.equipeEnCours = equipeEnCours(p); v.ordreEquipes = p.ordreEquipes; v.tour = p.tour[id] ?? null; v.finis = Object.keys(p.tour).filter(f => p.tour[f].fini); }
  if (p.phase === 'fugitifs') v.ontJoue = Object.keys(p.coups);
  if (['fugitifs', 'police'].includes(p.phase)) v.bloques = arretsBloques(p);   // public : la police est visible de tous
  if (p.phase === 'accusation') { v.gagnant = p.gagnant; v.raison = p.raison; v.monVote = id in p.votes ? p.votes[id] : undefined; v.votants = Object.keys(p.votes); }
  if (fin) { v.resultat = p.resultat; v.objets = p.objets; }
  return v;
}

// ---------- vue du maître du jeu ----------
// Il voit tout : rôles, corrompus, positions des fugitifs et objets.
function vueMJ(p, id) {
  const joueurs = p.ordre.map(f => {
    const j = p.joueurs[f];
    const o = { id: f, nom: j.nom, role: j.role ?? null, equipe: j.equipe ?? null, corrompu: !!j.corrompu, position: j.position ?? null };
    if (j.role === 'fugitif') { o.libre = j.libre; o.objets = j.objets; }
    if (j.role === 'policier') o.specialite = specialite(p, j.equipe);
    if (p.phase === 'roles') o.pret = p.prets.includes(f);
    return o;
  });
  const v = { code: p.code, phase: p.phase, createur: p.createur, mj: p.mj.nom, estMJ: true, moi: id, reglages: p.reglages, manche: p.manche, joueurs, journal: p.journal };
  if (!p.ordre.some(f => p.joueurs[f].role)) return v;
  if (p.reglages.specialites) v.specialites = [...Array(p.reglages.equipes).keys()].map(e => specialite(p, e));
  v.objets = p.objets; v.objetsRamasses = objetsEquipe(p);
  if (p.phase === 'police') { v.equipeEnCours = equipeEnCours(p); v.ordreEquipes = p.ordreEquipes; v.finis = Object.keys(p.tour).filter(f => p.tour[f].fini); }
  if (p.phase === 'fugitifs') v.ontJoue = Object.keys(p.coups);
  if (['fugitifs', 'police'].includes(p.phase)) v.bloques = arretsBloques(p);
  if (p.phase === 'accusation') { v.gagnant = p.gagnant; v.raison = p.raison; v.votants = Object.keys(p.votes); }
  if (p.phase === 'fin') v.resultat = p.resultat;
  return v;
}
