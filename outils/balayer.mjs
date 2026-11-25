// Balaye des réglages pour chaque taille de partie et garde les plus équilibrés.
// Usage : node outils/balayer.mjs [parties]
import { execSync } from 'node:child_process';
const N = Number(process.argv[2]) || 300;
const base = { 8: [24, 10], 11: [28, 12], 14: [28, 12], 17: [32, 14], 20: [36, 16] };
for (const nb of Object.keys(base)) {
  const lignes = [];
  for (const traces of [2, 3]) for (const mult of [1, 1.4, 1.7]) for (const frac of [0.25, 0.3, 0.35]) {
    const objets = Math.round(base[nb][0] * mult), objectif = Math.max(4, Math.round(objets * frac));
    const out = execSync(`node outils/simuler.mjs ${N} public/reseau.json`, { env: { ...process.env, REGLAGES: JSON.stringify({ objets, objectif, traces }), JOUEURS: nb } }).toString();
    const l = out.split(/\r?\n/).find(x => x.trim().startsWith(nb + ' |')).split('|').map(x => x.trim());
    lignes.push({ traces, objets, objectif, fug: parseInt(l[1]), arr: parseInt(l[2]), temps: parseInt(l[3]), manches: +l[4], pris: +l[6] });
  }
  // équilibre : fugitifs proches de 50 %, le moins de fins au temps possible
  lignes.sort((a, b) => (Math.abs(a.fug - 50) + a.temps * 0.3) - (Math.abs(b.fug - 50) + b.temps * 0.3));
  console.log(`\n${nb} joueurs`);
  for (const r of lignes.slice(0, 5)) console.log(`  traces ${r.traces} · ${r.objets} objets / objectif ${r.objectif} → fugitifs ${r.fug} %, police par arrestation ${r.arr} %, au temps ${r.temps} %, ${r.manches} manches, ${r.pris} fugitifs arrêtés`);
}
