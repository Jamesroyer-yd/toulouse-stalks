// Toulouse Stalks · simulation de parties avec des joueurs automatiques.
// Les robots jouent avec le vrai moteur et ne savent que ce que leur rôle
// permet : les fugitifs voient la police et les objets ; un policier ne
// connaît que les enquêtes de son équipe ; les corrompus ne partagent rien.
// Les robots sont simples : les chiffres comparent des réglages entre eux,
// ils ne prédisent pas exactement une partie entre humains.
//
// Usage simple, depuis le dossier du jeu :
//   npm run simuler                         toutes les tailles de 6 à 20 joueurs
//   npm run simuler -- --joueurs 14          une seule taille
//   npm run simuler -- --joueurs 14 --objectif 9 --objets 30 --manches 15 --parties 1000
//   npm run simuler -- --joueurs 14 --specialites 0      sans les spécialités
// Les résultats s'écrivent en phrases. --tableau donne l'ancien tableau.
// Ancienne forme, toujours acceptée : node outils/simuler.mjs 300 public/reseau.json
import fs from 'node:fs';
import * as M from '../src/moteur.js';

// --- lecture des options : --nom valeur ; les autres mots sont l'ancienne forme
const opts = {}, libres = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) { const v = process.argv[i + 1]; if (v === undefined || v.startsWith('--')) opts[a.slice(2)] = true; else { opts[a.slice(2)] = v; i++; } }
  else libres.push(a);
}
const N = Number(opts.parties || libres[0]) || 300;
const fichiers = libres.slice(1).length ? libres.slice(1) : ['public/reseau.json'];
const JOUEURS = opts.joueurs ? [Number(opts.joueurs)] : process.env.JOUEURS ? [Number(process.env.JOUEURS)] : [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const forces = process.env.REGLAGES ? JSON.parse(process.env.REGLAGES) : {};
for (const k of ['fugitifs', 'equipes', 'corrompus', 'objets', 'objectif', 'manches', 'traces', 'specialites']) if (opts[k] !== undefined) forces[k] = Number(opts[k]);
const TABLEAU = opts.tableau || process.env.TABLEAU === '1';

function graine(s) { return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

function simuler(reseau, nb, rnd) {
  const A = reseau.arrets;
  const D = A.map(a => { const d = Array(A.length).fill(99); d[a.id] = 0; let f = [a.id]; while (f.length) { const g = []; for (const x of f) for (const v of A[x].voisins) if (d[v] === 99) { d[v] = d[x] + 1; g.push(v); } f = g; } return d; });
  const p = M.nouvellePartie('SIMUL', 'j0', 'Joueur 0');
  for (let i = 1; i < nb; i++) M.rejoindre(p, 'j' + i, 'Joueur ' + i);
  if (Object.keys(forces).length) M.regler(p, 'j0', forces);
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
  if (TABLEAU) {
    console.log(`
${fichier} · ${N} parties par ligne`);
    console.log('joueurs | fugitifs gagnent | police : arrestations | police : au temps | manches moy. | objets moy. / objectif | fugitifs arrêtés moy.');
  } else console.log(`
Simulation : ${N} parties jouées par l'ordinateur pour chaque taille de groupe.${Object.keys(forces).length ? ' Réglages forcés : ' + JSON.stringify(forces) + '.' : ''}
`);
  for (const nb of JOUEURS) {
    const rnd = graine(1000 + nb);
    let r;
    try { r = Array.from({ length: N }, () => simuler(reseau, nb, rnd)); }
    catch (e) { console.log(`${nb} joueurs : réglage impossible, ${e.message}`); continue; }
    const part = x => r.filter(x).length / N;
    const pc = x => Math.round(100 * part(x)) + ' %';
    const moy = k => (r.reduce((s, x) => s + x[k], 0) / N).toFixed(1);
    const reg = { ...M.reglagesParDefaut(nb), ...forces };
    const fug = part(x => x.gagnant === 'fugitifs'), arr = part(x => x.gagnant === 'police' && /arrêtés/.test(x.raison)), temps = part(x => x.gagnant === 'police' && /temps/.test(x.raison));
    if (TABLEAU) { console.log(`${String(nb).padStart(7)} | ${pc(x => x.gagnant === 'fugitifs').padStart(16)} | ${pc(x => x.gagnant === 'police' && /arrêtés/.test(x.raison)).padStart(21)} | ${pc(x => x.gagnant === 'police' && /temps/.test(x.raison)).padStart(17)} | ${moy('manche').padStart(12)} | ${(moy('objets') + ' / ' + reg.objectif).padStart(22)} | ${moy('arrestations').padStart(21)}`); continue; }
    const sur10 = v => Math.round(v * 10);
    const avis = fug >= 0.6 ? 'les fugitifs gagnent trop souvent : monte l’objectif ou baisse les objets cachés.'
      : fug <= 0.4 ? 'la police gagne trop souvent : baisse l’objectif ou ajoute des objets cachés.'
      : 'c’est équilibré.';
    console.log(`${nb} joueurs, ${reg.fugitifs} fugitif${reg.fugitifs > 1 ? 's' : ''}, objectif ${reg.objectif} objets sur ${reg.objets} :`);
    console.log(`   sur 10 parties, les fugitifs en gagnent ${sur10(fug)}, la police ${sur10(arr + temps)} : ${sur10(arr)} en arrêtant tout le monde, ${sur10(temps)} parce que le temps est écoulé.`);
    console.log(`   une partie dure ${moy('manche')} manches en moyenne ; les fugitifs ramassent ${moy('objets')} objets ; ${moy('arrestations')} fugitif arrêté par partie en moyenne.`);
    console.log(`   → ${avis}`);
  }
}
