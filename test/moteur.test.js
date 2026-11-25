// Tests du moteur : node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as M from '../src/moteur.js';

const reseau = JSON.parse(fs.readFileSync(new URL('../public/reseau.json', import.meta.url)));
const graine = s => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
const nomArret = n => reseau.arrets.find(a => a.nom === n).id;

function partie(n = 10, s = 7) {
  const p = M.nouvellePartie('TEST', 'j0', 'Joueur 0');
  for (let i = 1; i < n; i++) M.rejoindre(p, 'j' + i, 'Joueur ' + i);
  M.lancer(p, 'j0', reseau, graine(s));
  p.ordre.forEach(id => M.pret(p, id));
  return p;
}
const role = (p, r, corrompu) => p.ordre.filter(f => p.joueurs[f].role === r && (corrompu === undefined || p.joueurs[f].corrompu === corrompu));

test('le réseau est connexe', () => {
  const vus = new Set([0]); let f = [0];
  while (f.length) { const s = []; for (const a of f) for (const v of reseau.arrets[a].voisins) if (!vus.has(v)) { vus.add(v); s.push(v); } f = s; }
  assert.equal(vus.size, reseau.arrets.length);
});

test('accessibles : 2 arrêts depuis Capitole', () => {
  const noms = Object.keys(M.accessibles(reseau, nomArret('Capitole'))).map(a => reseau.arrets[a].nom);
  assert.ok(noms.includes('Jean Jaurès') && noms.includes('Carmes'));
  assert.ok(!noms.includes('Compans-Caffarelli'));
});

test('lancement : rôles, équipes et corrompus', () => {
  const p = partie(14);
  assert.equal(role(p, 'fugitif').length, 2);
  assert.equal(role(p, 'policier', true).length, 2);
  const eq = new Set(role(p, 'policier', true).map(f => p.joueurs[f].equipe));
  assert.equal(eq.size, 2, 'deux corrompus dans deux équipes différentes');
  assert.equal(p.phase, 'fugitifs'); assert.equal(p.manche, 1);
  assert.equal(p.objets.length, 28);
});

test('le créateur joue aussi', () => {
  const p = partie(6);
  assert.ok(['fugitif', 'policier'].includes(p.joueurs.j0.role));
});

test('fugitif : trop loin refusé, ramassage des objets en chemin', () => {
  const p = partie(10); const [f] = role(p, 'fugitif'); const j = p.joueurs[f];
  const loin = reseau.arrets.find(a => !Object.hasOwn(M.accessibles(reseau, j.position), a.id)).id;
  assert.throws(() => M.deplacerFugitif(p, f, loin, reseau), /trop loin/);
  const chemins = M.accessibles(reseau, j.position);
  const cible = +Object.keys(chemins).find(a => chemins[a].length === 2);
  p.objets.push(chemins[cible][0]);
  M.deplacerFugitif(p, f, cible, reseau);
  role(p, 'fugitif').filter(g => g !== f).forEach(g => M.deplacerFugitif(p, g, p.joueurs[g].position, reseau));
  assert.equal(j.position, cible); assert.ok(j.objets >= 1); assert.equal(p.phase, 'police');
});

test('enquête : trace récente trouvée, résultat privé', () => {
  const p = partie(10); const fug = role(p, 'fugitif');
  fug.forEach(g => M.deplacerFugitif(p, g, p.joueurs[g].position, reseau));
  const e = p.ordreEquipes[0]; const flic = p.ordre.find(f => p.joueurs[f].equipe === e);
  p.joueurs[flic].position = p.joueurs[fug[0]].position;
  const r = M.enqueter(p, flic, p.joueurs[flic].position, reseau);
  assert.equal(r.trace, true);
  const autre = p.ordre.find(f => f !== flic && p.joueurs[f].role === 'policier');
  assert.deepEqual(M.vue(p, autre).enquetes, []);
});

test('arrestation : réussie par un honnête, annulée par un corrompu', () => {
  const p = partie(14); const fug = role(p, 'fugitif');
  fug.forEach(g => M.deplacerFugitif(p, g, p.joueurs[g].position, reseau));
  // l'équipe en cours, avec ou sans corrompu
  const e = p.ordreEquipes[0]; const m = p.ordre.filter(f => p.joueurs[f].equipe === e);
  const corr = m.find(f => p.joueurs[f].corrompu), hon = m.find(f => !p.joueurs[f].corrompu);
  if (corr) { p.joueurs[corr].position = p.joueurs[fug[0]].position; assert.equal(M.arreter(p, corr, p.joueurs[corr].position, reseau).reussie, false); assert.ok(p.joueurs[fug[0]].libre); }
  p.joueurs[hon].position = p.joueurs[fug[0]].position;
  assert.equal(M.arreter(p, hon, p.joueurs[hon].position, reseau).reussie, true);
  assert.equal(p.joueurs[fug[0]].libre, false); assert.equal(p.joueurs[fug[0]].objets, 0);
});

test('vues : un policier honnête ne voit ni fugitifs ni objets ni corrompus', () => {
  const p = partie(14); const hon = role(p, 'policier', false)[0];
  const v = M.vue(p, hon);
  assert.equal(v.objets, undefined); assert.equal(v.corrompus, undefined);
  v.joueurs.filter(j => j.role === 'fugitif').forEach(j => assert.equal(j.position, undefined));
  v.joueurs.forEach(j => assert.equal(j.corrompu, undefined));
  const corr = role(p, 'policier', true)[0];
  assert.ok(M.vue(p, corr).joueurs.filter(j => j.role === 'fugitif').every(j => j.position !== undefined));
});

test('fin : les fugitifs gagnent à l’objectif, puis accusation et points', () => {
  const p = partie(10); const fug = role(p, 'fugitif');
  p.joueurs[fug[0]].objets = p.reglages.objectif;
  fug.forEach(g => M.deplacerFugitif(p, g, p.joueurs[g].position, reseau));
  assert.equal(p.phase, 'accusation'); assert.equal(p.gagnant, 'fugitifs');
  role(p, 'policier').forEach(f => M.accuser(p, f, null));
  assert.equal(p.phase, 'fin'); assert.ok(p.resultat.points[fug[0]] >= p.reglages.objectif);
});

// ---------- entrées hostiles ----------
test('prénoms : balises, contrôles et doublons neutralisés', () => {
  assert.equal(M.nettoyerNom('<b>Léa</b>'), 'bLéab');
  assert.doesNotMatch(M.nettoyerNom('<img src=x onerror=alert(1)>'), /[<>="()&]/);
  assert.equal(M.nettoyerNom('  Jean-\u0000Paul\n  '), 'Jean-Paul');
  assert.equal(M.nettoyerNom('a'.repeat(5000)).length, 20);
  assert.throws(() => M.nettoyerNom('<>"&'), /prénom/);
  assert.throws(() => M.nettoyerNom({ toString: () => 'Léa' }), /prénom/);
  const p = M.nouvellePartie('T', 'a', 'Léa');
  assert.throws(() => M.rejoindre(p, 'b', 'léa'), /déjà pris/);
  assert.throws(() => M.rejoindre(p, '__proto__', 'Hugo'));
});

test('arrêts : seuls des entiers du réseau passent', () => {
  const p = partie(10); const [f] = role(p, 'fugitif');
  for (const mauvais of ['__proto__', 'constructor', '3', 3.5, -1, 1e9, null, undefined, NaN, {}, []])
    assert.throws(() => M.deplacerFugitif(p, f, mauvais, reseau), M.Erreur, String(mauvais));
});

test('réglages : valeurs absurdes refusées, clés inconnues ignorées', () => {
  const p = M.nouvellePartie('T', 'a', 'Léa'); for (let i = 0; i < 9; i++) M.rejoindre(p, 'b' + i, 'Hugo ' + i);
  assert.throws(() => M.regler(p, 'a', { manches: 'beaucoup' }));
  assert.throws(() => M.regler(p, 'a', { objectif: 1e9 }));
  assert.throws(() => M.regler(p, 'b0', { manches: 10 }), /créateur/);
  M.regler(p, 'a', { manches: 10, __proto__: { x: 1 }, pirate: 3 });
  assert.equal(p.reglages.manches, 10); assert.equal(p.reglages.pirate, undefined);
});

test('usurpation : jouer à la place d’un autre ou hors de son tour', () => {
  const p = partie(10);
  const flic = role(p, 'policier').find(f => f !== p.createur);
  assert.throws(() => M.deplacerFugitif(p, flic, 0, reseau), /ne peux pas/);
  assert.throws(() => M.enqueter(p, 'inconnu', 0, reseau));
  assert.throws(() => M.accuser(p, flic, '__proto__'));
  assert.throws(() => M.forcerSuite(p, flic), /créateur/);
});

// ---------- spécialités des équipes ----------
function auTourDe(p, specialiteVoulue) {
  // fait jouer les fugitifs sur place puis passe les équipes jusqu'à celle voulue
  role(p, 'fugitif').filter(f => p.joueurs[f].libre).forEach(g => M.deplacerFugitif(p, g, p.joueurs[g].position, reseau));
  while (M.specialite(p, p.ordreEquipes[p.tourEquipe]) !== specialiteVoulue) M.forcerSuite(p, p.createur);
  return p.ordre.find(f => p.joueurs[f].role === 'policier' && p.joueurs[f].equipe === p.ordreEquipes[p.tourEquipe] && !p.joueurs[f].corrompu);
}
test('spécialités actives par défaut, une par équipe', () => {
  const p = partie(14);
  assert.equal(p.reglages.specialites, 1);
  assert.deepEqual([0, 1, 2].map(e => M.specialite(p, e)), ['enqueteurs', 'intervention', 'patrouille']);
});
test('intervention : l’arrestation couvre l’arrêt et ses voisins', () => {
  const p = partie(14); const flic = auTourDe(p, 'intervention'); const [f] = role(p, 'fugitif');
  const cible = p.joueurs[flic].position; p.joueurs[f].position = reseau.arrets[cible].voisins[0];
  assert.equal(M.arreter(p, flic, cible, reseau).reussie, true);
  assert.equal(p.joueurs[f].libre, false);
});
test('enquêteurs : l’enquête couvre l’arrêt et ses voisins', () => {
  const p = partie(14); const flic = auTourDe(p, 'enqueteurs');
  const pos = p.joueurs[flic].position, voisin = reseau.arrets[pos].voisins[0];
  p.passages[voisin] = [{ manche: p.manche }];
  const r = M.enqueter(p, flic, pos, reseau);
  assert.equal(r.trace, true); assert.ok(r.traces.some(t => t.arret === voisin));
});
test('patrouille : 3 arrêts, et elle bloque le passage des fugitifs', () => {
  const p = partie(14); const [f] = role(p, 'fugitif');
  const patrouille = p.ordre.find(g => M.specialite(p, p.joueurs[g].equipe) === 'patrouille');
  const depart = p.joueurs[f].position, voisin = reseau.arrets[depart].voisins[0];
  p.joueurs[patrouille].position = voisin;
  p.joueurs[patrouille].arrivee = p.manche - 1;          // arrivée au tour de police précédent
  assert.ok(!Object.hasOwn(M.cheminsFugitif(p, f, reseau), voisin), 'arrêt occupé interdit');
  assert.throws(() => M.deplacerFugitif(p, f, voisin, reseau), /trop loin/);
  const flic = auTourDe(p, 'patrouille');
  const loin3 = Object.entries(M.accessibles(reseau, p.joueurs[flic].position, 3)).find(([, c]) => c.length === 3);
  if (loin3) M.deplacerPolicier(p, flic, Number(loin3[0]), reseau);
});
test('patrouille : impossible de camper sur un arrêt', () => {
  const p = partie(14); const [f] = role(p, 'fugitif');
  const patrouille = p.ordre.find(g => M.specialite(p, p.joueurs[g].equipe) === 'patrouille');
  const voisin = reseau.arrets[p.joueurs[f].position].voisins[0];
  p.joueurs[patrouille].position = voisin;
  p.joueurs[patrouille].arrivee = p.manche - 3;          // arrivée il y a longtemps : il campe
  assert.ok(Object.hasOwn(M.cheminsFugitif(p, f, reseau), voisin), 'un patrouilleur immobile ne bloque plus');
  const flic = auTourDe(p, 'patrouille');
  const ici = p.joueurs[flic].position;
  assert.throws(() => M.deplacerPolicier(p, flic, ici, reseau), /changer d’arrêt/);
  assert.throws(() => M.enqueter(p, flic, ici, reseau), /d’abord changer/);
  assert.throws(() => M.finirTour(p, flic), /d’abord changer/);
});

// ---------- mode maître du jeu ----------
function partieMJ(n = 8) {
  const p = M.nouvellePartie('MJ', 'mj', 'Gérard', true);
  for (let i = 0; i < n; i++) M.rejoindre(p, 'j' + i, 'Joueur ' + i);
  return p;
}
test('MJ : pas de rôle, mais il règle, lance et force la suite', () => {
  const p = partieMJ(8);
  assert.equal(p.ordre.length, 8); assert.equal(p.reglages.fugitifs, 2);
  M.regler(p, 'mj', { manches: 12 });
  M.lancer(p, 'mj', reseau, graine(3));
  assert.equal(p.joueurs.mj, undefined, 'le MJ n’est pas un joueur');
  p.ordre.forEach(id => M.pret(p, id));
  assert.equal(p.phase, 'fugitifs');
  M.forcerSuite(p, 'mj'); assert.equal(p.phase, 'police');
});
test('MJ : il voit tout, mais ne peut pas jouer', () => {
  const p = partieMJ(10); M.lancer(p, 'mj', reseau, graine(5)); p.ordre.forEach(id => M.pret(p, id));
  const v = M.vue(p, 'mj');
  assert.equal(v.estMJ, true);
  assert.ok(v.joueurs.every(j => j.position != null), 'toutes les positions');
  assert.ok(v.joueurs.some(j => j.corrompu), 'les corrompus');
  assert.ok(Array.isArray(v.objets));
  assert.throws(() => M.deplacerFugitif(p, 'mj', 0, reseau));
  assert.throws(() => M.accuser(p, 'mj', null));
});
test('MJ : son prénom est réservé, et un joueur ne voit pas ce qu’il voit', () => {
  const p = partieMJ(8);
  assert.throws(() => M.rejoindre(p, 'x', 'gérard'), /déjà pris/);
  assert.throws(() => M.rejoindre(p, 'mj', 'Autre'), /inconnu/);
  M.lancer(p, 'mj', reseau, graine(2));
  const hon = p.ordre.find(f => p.joueurs[f].role === 'policier' && !p.joueurs[f].corrompu);
  assert.equal(M.vue(p, hon).estMJ, undefined); assert.equal(M.vue(p, hon).mj, 'Gérard');
});

// ---------- partie d'essai ----------
test('essai : de faux joueurs, et le MJ peut prendre la place de chacun', () => {
  const p = M.nouvellePartie('ES', 'mj', 'James', false, 10);
  assert.equal(p.essai, true); assert.equal(p.ordre.length, 10); assert.ok(M.estMJ(p, 'mj'));
  M.lancer(p, 'mj', reseau, graine(4));
  assert.equal(M.incarnation(p, 'mj', 'essai-3'), 'essai-3');
  assert.equal(M.incarnation(p, 'mj', null), null);
  assert.throws(() => M.incarnation(p, 'mj', '__proto__'), /inconnu/);
  assert.throws(() => M.incarnation(p, 'essai-1', 'essai-2'), /Réservé/);
  assert.throws(() => M.nouvellePartie('ES', 'mj', 'James', false, 3), /de 6 à 20/);
  assert.throws(() => M.nouvellePartie('ES', 'mj', 'James', false, 1e9), /de 6 à 20/);
});
test('essai : impossible dans une vraie partie', () => {
  const p = M.nouvellePartie('VR', 'mj', 'James', true);
  for (let i = 0; i < 8; i++) M.rejoindre(p, 'j' + i, 'Joueur ' + i);
  assert.throws(() => M.incarnation(p, 'mj', 'j1'), /Réservé/);
});
