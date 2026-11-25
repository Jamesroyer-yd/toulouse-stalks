// Toulouse Stalks · simulation de parties avec des joueurs automatiques.
// Les robots jouent avec le vrai moteur et ne savent que ce que leur rôle
// permet : les fugitifs voient la police et les objets ; un policier ne
// connaît que les enquêtes de son équipe ; les corrompus ne partagent rien.
// Les robots sont simples : les chiffres comparent des réglages entre eux,
// ils ne prédisent pas exactement une partie entre humains.
//
// Usage : node outils/simuler.mjs [parties par réglage] [reseau.json ...]
import fs from 'node:fs';
import * as M from '../src/moteur.js';

const N = Number(process.argv[2]) || 300;
const fichiers = process.argv.slice(3).length ? process.argv.slice(3) : ['public/reseau.json'];
const JOUEURS = process.env.JOUEURS ? [Number(process.env.JOUEURS)] : [8, 11, 14, 17, 20];

function graine(s) { return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

function simuler(reseau, nb, rnd) {
  const A = reseau.arrets;
  const D = A.map(a => { const d = Array(A.length).fill(99); d[a.id] = 0; let f = [a.id]; while (f.length) { const g = []; for (const x of f) for (const v of A[x].voisins) if (d[v] === 99) { d[v] = d[x] + 1; g.push(v); } f = g; } return d; });
  const p = M.nouvellePartie('SIMUL', 'j0', 'Joueur 0');
  for (let i = 1; i < nb; i++) M.rejoindre(p, 'j' + i, 'Joueur ' + i);
  if (process.env.REGLAGES) M.regler(p, 'j0', JSON.parse(process.env.REGLAGES));
  M.lancer(p, 'j0', reseau, rnd);
  p.ordre.forEach(id => M.pret(p, id));
  const pistes = {};   // équipe → [{ arret, manche }] : traces connues de l'équipe
  let garde = 0;
  while (['fugitifs', 'police'].includes(p.phase) && garde++ < 500) {
    if (p.phase === 'fugitifs') {
      const police = p.ordre.filter(f => p.joueurs[f].role === 'policier').map(f => p.joueurs[f].position);
      for (const f of p.ordre.filter(f => p.joueurs[f].role === 'fugitif' && p.joueurs[f].libre)) {
        const j = p.joueurs[f], chemins = M.cheminsFugitif(p, f, reseau);
        let meilleur = null, score = -1e9;
        for (const [arr, chemin] of Object.entries(chemins)) {
          const a = Number(arr);
          let s = 10 * chemin.filter(x => p.objets.includes(x)).length;
          for (const q of police) s -= Math.max(0, 4 - D[q][a]) * 6;          // la police avance de 2 puis agit à 1
          const proche = p.objets.reduce((m, o) => Math.min(m, D[a][o]), 99);
          s -= 0.6 * proche + rnd() * 2;
          if (s > score) { score = s; meilleur = a; }
        }
        M.deplacerFugitif(p, f, meilleur, reseau);
      }
      continue;
    }
    // tour d'une équipe de police
    const e = p.ordreEquipes[p.tourEquipe];
    // les équipes partagent leurs pistes, comme dans les règles ; COOP=0 pour comparer sans
    const connues = (pistes[process.env.COOP === '0' ? e : 'toutes'] ||= []);
    for (const f of p.ordre.filter(f => p.joueurs[f].role === 'policier' && p.joueurs[f].equipe === e)) {
      if (p.phase !== 'police' || p.ordreEquipes[p.tourEquipe] !== e || p.tour[f]?.fini) break;
      const j = p.joueurs[f];
      // suspects : une trace de cette manche place le fugitif sur l'arrêt ou juste à côté
      const essayes = (connues.essayes ||= {}); const fouilles = (connues.fouilles ||= {});
      const suspects = () => [...new Set(connues.filter(t => t.manche === p.manche).flatMap(t => [t.arret, ...A[t.arret].voisins]))].filter(a => essayes[a] !== p.manche);
      const recente = connues.filter(t => t.manche >= p.manche - 1).sort((a, b) => b.manche - a.manche)[0];
      const cible = recente ? recente.arret : null;
      // déplacement : vers les suspects, sinon vers la piste, sinon s'écarter des coéquipiers
      const spe = M.specialite(p, j.equipe);
      // la Patrouille doit changer d'arrêt à chaque manche
      const options = Object.keys(M.accessibles(reseau, j.position, spe === 'patrouille' ? 3 : 2)).map(Number).filter(x => spe !== 'patrouille' || x !== j.position);
      const coeq = p.ordre.filter(g => g !== f && p.joueurs[g].role === 'policier' && p.joueurs[g].equipe === e).map(g => p.joueurs[g].position);
      const s0 = suspects();
      const score = a => s0.length ? Math.min(...s0.map(s => D[a][s])) : cible != null ? D[a][cible] : -Math.min(99, ...coeq.map(c => D[a][c])) + rnd();
      M.deplacerPolicier(p, f, options.sort((a, b) => score(a) - score(b))[0], reseau);
      // actions : arrêter un suspect à portée, sinon enquêter sur un arrêt pas encore fouillé
      for (let k = 0; k < 2 && p.phase === 'police' && !p.tour[f].fini; k++) {
        const autour = [j.position, ...A[j.position].voisins];
        const sus = suspects();
        if (spe === 'intervention') {
          // une arrestation couvre l'arrêt et ses voisins : viser celui qui couvre le plus de suspects
          const couvre = a => [a, ...A[a].voisins].filter(x => sus.includes(x));
          const meilleur = autour.map(a => [a, couvre(a)]).sort((x, y) => y[1].length - x[1].length)[0];
          if (meilleur && meilleur[1].length) { meilleur[1].forEach(x => { essayes[x] = p.manche; }); M.arreter(p, f, meilleur[0], reseau); continue; }
        } else {
          const s = sus.find(a => autour.includes(a));
          if (s !== undefined) { essayes[s] = p.manche; M.arreter(p, f, s, reseau); continue; }
        }
        const lieu = autour.filter(a => fouilles[a] !== p.manche).sort((a, b) => (cible != null ? D[a][cible] - D[b][cible] : rnd() - 0.5))[0] ?? j.position;
        fouilles[lieu] = p.manche;
        const r = M.enqueter(p, f, lieu, reseau);
        if (r.trace && !j.corrompu) { if (r.traces) r.traces.forEach(t => connues.push({ arret: t.arret, manche: t.manche })); else connues.push({ arret: lieu, manche: r.mancheTrace }); }
      }
      if (p.phase === 'police' && p.tour[f] && !p.tour[f].fini) M.finirTour(p, f);
    }
  }
  return { gagnant: p.gagnant, raison: p.raison, manche: p.manche, objets: p.ordre.reduce((s, f) => s + (p.joueurs[f].objets || 0) + (p.joueurs[f].objetsPerdus || 0), 0),
    arrestations: p.ordre.filter(f => p.joueurs[f].role === 'fugitif' && !p.joueurs[f].libre).length };
}

for (const fichier of fichiers) {
  const reseau = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  console.log(`\n${fichier} · ${N} parties par ligne`);
  console.log('joueurs | fugitifs gagnent | police : arrestations | police : au temps | manches moy. | objets moy. / objectif | fugitifs arrêtés moy.');
  for (const nb of JOUEURS) {
    const rnd = graine(1000 + nb);
    const r = Array.from({ length: N }, () => simuler(reseau, nb, rnd));
    const pc = x => Math.round(100 * r.filter(x).length / N) + ' %';
    const moy = k => (r.reduce((s, x) => s + x[k], 0) / N).toFixed(1);
    const obj = M.reglagesParDefaut(nb).objectif;
    console.log(`${String(nb).padStart(7)} | ${pc(x => x.gagnant === 'fugitifs').padStart(16)} | ${pc(x => x.gagnant === 'police' && /arrêtés/.test(x.raison)).padStart(21)} | ${pc(x => x.gagnant === 'police' && /temps/.test(x.raison)).padStart(17)} | ${moy('manche').padStart(12)} | ${(moy('objets') + ' / ' + obj).padStart(22)} | ${moy('arrestations').padStart(21)}`);
  }
}
