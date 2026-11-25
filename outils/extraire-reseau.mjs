// Toulouse Stalks · fabrique le plateau public/reseau.json à partir des
// données ouvertes Tisséo (GTFS, licence ODbL), publiées chaque semaine sur
// data.toulouse-metropole.fr, jeu de données « tisseo-gtfs ».
//
// Garde le métro A et B, le tram T1 et Téléo en entier, plus les arrêts
// Linéo à moins de RAYON_KM du Capitole : environ 180 arrêts.
//
// Usage : node outils/extraire-reseau.mjs
// Le fichier GTFS est téléchargé dans outils/gtfs/, ignoré par git.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const GTFS = path.join(ICI, 'gtfs');
const SORTIE = path.join(ICI, '..', 'public', 'reseau.json');
const URL_GTFS = 'https://data.toulouse-metropole.fr/api/explore/v2.1/catalog/datasets/tisseo-gtfs/files/fc1dda89077cf37e4f7521760e0ef4e9';
const RAYON_KM = 4;
const PX_PAR_KM = 190;
const MARGE = 60;

// ---------- téléchargement ----------
if (!fs.existsSync(path.join(GTFS, 'stops.txt'))) {
  fs.mkdirSync(GTFS, { recursive: true });
  const rep = await fetch(URL_GTFS);
  if (!rep.ok) throw new Error('Téléchargement GTFS impossible : ' + rep.status);
  const zip = path.join(GTFS, 'tisseo_gtfs.zip');
  fs.writeFileSync(zip, Buffer.from(await rep.arrayBuffer()));
  execFileSync('tar', ['-xf', zip, '-C', GTFS]);
}

// ---------- lecture ----------
const csv = l => { const o = []; let c = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(c); c = ''; } else c += ch; } o.push(c); return o; };
const lire = f => fs.readFileSync(path.join(GTFS, f), 'utf8').split(/\r?\n/).filter(Boolean).map(csv).slice(1);

const toutesRoutes = lire('routes.txt');
const routes = toutesRoutes.filter(r => ['A', 'B', 'T1', 'TELEO'].includes(r[2]) || /^L\d+$/.test(r[2]));
const nomRoute = Object.fromEntries(routes.map(r => [r[0], r[2]]));
// bus classiques : ils servent seulement à relier entre eux les arrêts gardés
const nomBus = Object.fromEntries(toutesRoutes.filter(r => r[6] === '3' && !nomRoute[r[0]]).map(r => [r[0], r[2]]));
const trajets = {}, trajetsBus = {};
for (const t of lire('trips.txt')) {
  if (t[3] !== '0') continue;
  if (nomRoute[t[0]]) trajets[t[2]] = nomRoute[t[0]]; else if (nomBus[t[0]]) trajetsBus[t[2]] = nomBus[t[0]];
}
const arretsGtfs = {};
for (const s of lire('stops.txt')) arretsGtfs[s[0]] = { nom: s[2], lat: +s[3], lon: +s[4], parent: s[6] };

const suites = {};
const rl = readline.createInterface({ input: fs.createReadStream(path.join(GTFS, 'stop_times.txt')) });
for await (const l of rl) {
  const i = l.indexOf(','); const id = l.slice(0, i);
  if (!trajets[id] && !trajetsBus[id]) continue;
  const c = l.split(','); (suites[id] ||= []).push([+c[6], c[3]]);
}
// pour chaque ligne, le trajet qui dessert le plus d'arrêts
const lignes = {};
const bus = {};
for (const [id, s] of Object.entries(suites)) {
  if (trajets[id]) { const n = trajets[id]; if (!lignes[n] || s.length > lignes[n].length) lignes[n] = s; }
  else { const n = trajetsBus[id]; if (!bus[n] || s.length > bus[n].length) bus[n] = s; }
}

// ---------- zones d'arrêt ----------
const zones = {}; const ordre = {};
for (const [n, s] of Object.entries(lignes)) {
  s.sort((a, b) => a[0] - b[0]); ordre[n] = [];
  for (const [, sp] of s) {
    const p = arretsGtfs[sp]; const z = p.parent || sp; const zz = arretsGtfs[z] || p;
    if (ordre[n].at(-1) !== z) ordre[n].push(z);
    zones[z] = { nom: zz.nom, lat: zz.lat, lon: zz.lon };
  }
}
const capitole = Object.values(zones).find(z => z.nom === 'Capitole');
const km = z => { const k = Math.PI / 180; return [(z.lon - capitole.lon) * Math.cos(capitole.lat * k) * 111.32, -(z.lat - capitole.lat) * 110.57]; };
const lourd = new Set(['A', 'B', 'T1', 'TELEO'].flatMap(n => ordre[n]));
// Le T1 est coupé après Guyenne-Berry : vers l'aéroport, 10 arrêts en impasse
// qui étiraient le plan sans rien apporter au jeu.
const COUPE_T1 = 'Guyenne-Berry';
const iCoupe = ordre.T1.findIndex(z => zones[z].nom === COUPE_T1);
if (iCoupe < 0) throw new Error('Arrêt de coupe du T1 introuvable : ' + COUPE_T1);
const debutT1 = zones[ordre.T1[0]].nom === 'Palais de Justice';
const coupes = new Set((debutT1 ? ordre.T1.slice(iCoupe + 1) : ordre.T1.slice(0, iCoupe)).filter(z => !['A', 'B', 'TELEO'].some(n => ordre[n].includes(z))));
const garde = z => !coupes.has(z) && (lourd.has(z) || Math.hypot(...km(zones[z])) <= RAYON_KM);
const mode = n => n === 'A' || n === 'B' ? 'metro' : n === 'T1' ? 'tram' : n === 'TELEO' ? 'teleo' : 'lineo';

// découpe chaque ligne en tronçons d'arrêts gardés
const troncons = [];
for (const [n, zs] of Object.entries(ordre)) {
  let cur = [];
  for (const z of zs) { if (garde(z)) cur.push(z); else { if (cur.length > 1) troncons.push([n, cur]); cur = []; } }
  if (cur.length > 1) troncons.push([n, cur]);
}
const ids = [...new Set(troncons.flatMap(t => t[1]))];
// Le centre-ville est agrandi, comme sur un plan de métro : la distance au
// Capitole d devient R·(d/R)^ECARTEMENT. Les directions sont gardées ; les
// arrêts du centre s'écartent d'environ 60 %, la périphérie bouge peu.
const ECARTEMENT = 0.7;
const brut = ids.map(z => km(zones[z]));
const R = Math.max(...brut.map(p => Math.hypot(...p)));
const pos = brut.map(([x, y]) => { const d = Math.hypot(x, y); if (!d) return [0, 0]; const d2 = R * Math.pow(d / R, ECARTEMENT); return [x / d * d2, y / d * d2]; });
const minX = Math.min(...pos.map(p => p[0])), minY = Math.min(...pos.map(p => p[1]));
const maxX = Math.max(...pos.map(p => p[0])), maxY = Math.max(...pos.map(p => p[1]));
const indice = Object.fromEntries(ids.map((z, i) => [z, i]));
const lignesDe = ids.map(() => new Set());
troncons.forEach(([n, zs]) => zs.forEach(z => lignesDe[indice[z]].add(n)));
const voisins = ids.map(() => new Set());
troncons.forEach(([, zs]) => zs.forEach((z, k) => { if (k) { voisins[indice[z]].add(indice[zs[k - 1]]); voisins[indice[zs[k - 1]]].add(indice[z]); } }));

// ---------- correspondances à pied ----------
// Celles que Tisséo publie (transfers.txt) entre deux zones d'arrêt gardées,
// à moins de MARCHE_MAX mètres : elles comptent comme un arrêt de déplacement.
const MARCHE_MAX = 500;
const metres = (a, b) => Math.round(Math.hypot(...km(a).map((v, k) => v - km(b)[k])) * 1000);
const zoneDe = sp => arretsGtfs[sp] ? (arretsGtfs[sp].parent || sp) : null;
const marches = new Map();
for (const [de, vers] of lire('transfers.txt')) {
  const a = indice[zoneDe(de)], b = indice[zoneDe(vers)];
  if (a === undefined || b === undefined || a === b || voisins[a].has(b)) continue;
  const m = metres(zones[ids[a]], zones[ids[b]]);
  if (m > MARCHE_MAX) continue;
  marches.set(Math.min(a, b) + '-' + Math.max(a, b), [Math.min(a, b), Math.max(a, b), m]);
}
// Tisséo n'en publie presque aucune entre stations distinctes : on ajoute aussi
// les arrêts proches, à moins de MARCHE_MAX mètres à vol d'oiseau, s'ils ne
// sont pas sur une même ligne (sinon on sauterait des arrêts le long de la ligne).
for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
  if (voisins[a].has(b) || [...lignesDe[a]].some(l => lignesDe[b].has(l))) continue;
  const m = metres(zones[ids[a]], zones[ids[b]]);
  if (m <= MARCHE_MAX) marches.set(a + '-' + b, [a, b, m]);
}
for (const [a, b] of marches.values()) { voisins[a].add(b); voisins[b].add(a); }

// ---------- liaisons en bus ----------
// Un bus qui dessert à la suite deux arrêts gardés, à moins de BUS_MAX mètres
// l'un de l'autre, les relie : un saut d'un arrêt, comme sur une ligne.
const BUS_MAX = 1500;
const liaisons = new Map();
for (const [n, s] of Object.entries(bus)) {
  s.sort((x, y) => x[0] - y[0]);
  const suite = s.map(([, sp]) => indice[zoneDe(sp)]).filter(i => i !== undefined).filter((i, k, t) => k === 0 || i !== t[k - 1]);
  for (let k = 1; k < suite.length; k++) {
    const a = Math.min(suite[k - 1], suite[k]), b = Math.max(suite[k - 1], suite[k]);
    if (voisins[a].has(b) || metres(zones[ids[a]], zones[ids[b]]) > BUS_MAX) continue;
    const cle = a + '-' + b;
    if (liaisons.has(cle)) liaisons.get(cle)[2].add(n); else liaisons.set(cle, [a, b, new Set([n])]);
  }
}
// Désactivées : sur le plan lisible, on ne se déplace que par ce qui est dessiné,
// et ces liaisons brouillaient le plan. BUS=1 pour les remettre.
const AVEC_BUS = process.env.BUS === '1';
if (AVEC_BUS) for (const [a, b] of liaisons.values()) { voisins[a].add(b); voisins[b].add(a); }
else liaisons.clear();
console.log(`${liaisons.size} liaisons en bus ajoutées${AVEC_BUS ? '' : ', désactivées'}`);
console.log(`${marches.size} correspondances à pied ajoutées`);

const reseau = {
  source: 'Tisséo, données ouvertes GTFS, licence ODbL',
  genere: new Date().toISOString().slice(0, 10),
  largeur: Math.round((maxX - minX) * PX_PAR_KM + 2 * MARGE),
  hauteur: Math.round((maxY - minY) * PX_PAR_KM + 2 * MARGE),
  arrets: ids.map((z, i) => ({
    id: i, nom: zones[z].nom,
    x: Math.round((pos[i][0] - minX) * PX_PAR_KM + MARGE),
    y: Math.round((pos[i][1] - minY) * PX_PAR_KM + MARGE),
    lignes: [...lignesDe[i]].map(n => n === 'TELEO' ? 'Téléo' : n),
    voisins: [...voisins[i]].sort((a, b) => a - b)
  })),
  lignes: troncons.map(([n, zs]) => ({ nom: n === 'TELEO' ? 'Téléo' : n, mode: mode(n), arrets: zs.map(z => indice[z]) })),
  marches: [...marches.values()],         // [arrêt, arrêt, mètres] : correspondances à pied
  bus: [...liaisons.values()].map(([a, b, l]) => [a, b, [...l].sort()])   // [arrêt, arrêt, lignes de bus]
};
fs.writeFileSync(SORTIE, JSON.stringify(reseau));
console.log(`${reseau.arrets.length} arrêts, ${reseau.lignes.length} tronçons, plan ${reseau.largeur}×${reseau.hauteur} → public/reseau.json`);
