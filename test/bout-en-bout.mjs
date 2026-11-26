// Test de bout en bout contre le serveur local : npx wrangler dev, puis
//   node test/bout-en-bout.mjs [adresse]
// 8 joueurs jouent une manche complète, puis des attaques sont tentées.
import assert from 'node:assert/strict';
const BASE = process.argv[2] || 'http://127.0.0.1:8788';
const WSB = BASE.replace(/^http/, 'ws');
const reseau = await (await fetch(BASE + '/reseau.json')).json();
const attendre = ms => new Promise(r => setTimeout(r, ms));

async function post(chemin, corps, entetes = {}) {
  const r = await fetch(BASE + chemin, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE, ...entetes }, body: JSON.stringify(corps) });
  return { statut: r.status, d: await r.json() };
}
function socket(code, jeton, origine = BASE) {
  return new Promise((ok, ko) => {
    const ws = new WebSocket(`${WSB}/api/partie/${code}/ws`, { headers: { origin: origine } });
    const j = { ws, vue: null, erreurs: [], ferme: null };
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'vue') j.vue = m.vue; if (m.type === 'erreur') j.erreurs.push(m.message); };
    ws.onclose = e => { j.ferme = e.code; };
    ws.onerror = () => ko(new Error('ws'));
    ws.onopen = () => { if (jeton) ws.send(JSON.stringify({ type: 'auth', jeton })); ok(j); };
  });
}
const envoi = (j, m) => j.ws.send(JSON.stringify(m));

// ---------- partie normale ----------
const c = await post('/api/creer', { nom: '<b>Léa</b>' });
assert.equal(c.statut, 200, JSON.stringify(c.d));
const code = c.d.code;
const joueurs = [await socket(code, c.d.jeton)];
for (const n of ['Hugo', 'Inès', 'Malik', 'Sarah', 'Tom', 'Chloé', 'Yanis']) {
  const r = await post('/api/rejoindre', { code, nom: n }); assert.equal(r.statut, 200, JSON.stringify(r.d));
  joueurs.push(await socket(code, r.d.jeton));
}
await attendre(300);
assert.equal(joueurs[0].vue.joueurs[0].nom, 'bLéab', 'balises retirées du prénom');
assert.equal(joueurs[0].vue.joueurs.length, 8);
envoi(joueurs[1], { type: 'lancer' }); await attendre(200);
assert.ok(joueurs[1].erreurs.some(e => /créateur/.test(e)), 'seul le créateur lance');
envoi(joueurs[0], { type: 'lancer' }); await attendre(300);
assert.equal(joueurs[0].vue.phase, 'roles');
joueurs.forEach(j => envoi(j, { type: 'pret' })); await attendre(400);
assert.equal(joueurs[0].vue.phase, 'depart');

const fug = joueurs.filter(j => j.vue.role.role === 'fugitif');
const pol = joueurs.filter(j => j.vue.role.role === 'policier');
// départs : la police d'abord, puis les fugitifs, jamais sur un objet
envoi(fug[0], { type: 'placer', arret: 0 }); await attendre(150);
assert.ok(fug[0].erreurs.some(e => /police choisit/.test(e)), 'les fugitifs attendent la police');
pol.forEach((p, i) => envoi(p, { type: 'placer', arret: [6, 34, 47, 65][i % 4] })); await attendre(400);
assert.equal(joueurs[0].vue.depart, 'fugitifs');
const objets = fug[0].vue.objets;
envoi(fug[0], { type: 'placer', arret: objets[0] }); await attendre(150);
assert.ok(fug[0].erreurs.some(e => /objet/.test(e)), 'pas de départ sur un objet');
const sansObjet = reseau.arrets.map(a => a.id).filter(a => !objets.includes(a));
fug.forEach((f, i) => envoi(f, { type: 'placer', arret: sansObjet[10 + i * 20] })); await attendre(400);
assert.equal(joueurs[0].vue.phase, 'fugitifs');
assert.equal(pol[0].vue.objetsRamasses, undefined, 'la police ne voit pas le compteur');
// un policier honnête ne voit ni position de fugitif ni objets
const hon = pol.find(j => !j.vue.role.corrompu);
assert.ok(hon.vue.joueurs.filter(x => x.role === 'fugitif').every(x => x.position === undefined));
assert.equal(hon.vue.objets, undefined);
for (const f of fug) { const p = f.vue.joueurs.find(x => x.id === f.vue.moi).position; envoi(f, { type: 'deplacerFugitif', arret: reseau.arrets[p].voisins[0] }); }
await attendre(400);
assert.equal(joueurs[0].vue.phase, 'police');
const eq = joueurs[0].vue.equipeEnCours;
for (const p of pol.filter(j => j.vue.role.equipe === eq)) {
  const pos = p.vue.joueurs.find(x => x.id === p.vue.moi).position;
  envoi(p, { type: 'deplacerPolicier', arret: pos }); await attendre(80);
  envoi(p, { type: 'enqueter', arret: pos }); await attendre(80);
  envoi(p, { type: 'finirTour' }); await attendre(80);
}
await attendre(300);
assert.notEqual(joueurs[0].vue.equipeEnCours, eq, 'équipe suivante');
console.log('✔ manche jouée : déplacements, enquêtes, tours des équipes');

// ---------- attaques ----------
const pirate = await socket(code, null);
envoi(pirate, { type: 'lancer' }); await attendre(200);
assert.equal(pirate.ferme, 1008, 'action sans identification refusée');
const faux = await socket(code, 'f'.repeat(64)); await attendre(200);
assert.equal(faux.ferme, 1008, 'jeton inconnu refusé');
const proto = await socket(code, '__proto__'); await attendre(200);
assert.equal(proto.ferme, 1008, 'jeton mal formé refusé');
let refuse = false; try { const x = await socket(code, c.d.jeton, 'https://site-pirate.example'); await attendre(200); refuse = x.ferme !== null; } catch { refuse = true; }
assert.ok(refuse, 'origine étrangère refusée');
assert.equal((await post('/api/creer', { nom: 'X' }, { origin: 'https://site-pirate.example' })).statut, 403, 'POST depuis un autre site refusé');
assert.equal((await post('/api/rejoindre', { code: '../../x', nom: 'X' })).statut, 400, 'code mal formé refusé');
assert.equal((await post('/api/creer', { nom: 'x'.repeat(5000) })).statut, 400, 'corps trop long refusé');
const r = await fetch(BASE + '/api/creer', { method: 'POST', headers: { 'content-type': 'text/plain', origin: BASE }, body: '{}' });
assert.equal(r.status, 400, 'type de contenu refusé');
const j0 = joueurs[0];
for (const m of [{ type: '__proto__' }, { type: 'constructor' }, { type: 'deplacerFugitif', arret: '__proto__' }, { type: 'arreter', arret: { valueOf: 1 } }, { type: 'regler', reglages: { manches: 1e9 } }, { type: 'accuser', cible: '__proto__' }])
  envoi(j0, m);
await attendre(300);
assert.ok(j0.erreurs.length >= 6, 'messages hostiles refusés : ' + j0.erreurs.length);
j0.ws.send('x'.repeat(3000)); await attendre(200);
assert.equal(j0.ferme, 1009, 'message trop long : connexion coupée');
const bavard = joueurs[2]; assert.equal(bavard.ferme, null);
for (let i = 0; i < 40; i++) envoi(bavard, { type: 'finirTour' });
await attendre(300);
assert.equal(bavard.ferme, 1008, 'cadence trop rapide : connexion coupée');
console.log('✔ attaques refusées : sans jeton, faux jeton, autre origine, injections, messages trop longs ou trop rapides');
joueurs.forEach(j => { try { j.ws.close(); } catch {} });
process.exit(0);
