// Fabrique la section « Exemples » du livret : schémas SVG d'un petit bout du
// réseau autour de Jean Jaurès, puis les insère dans corps.html.
import fs from 'node:fs';
const D = process.argv[2];

const ST = {
  'Esquirol': [40, 110], 'Capitole': [120, 110], 'Jean Jaurès': [200, 110], 'Marengo': [280, 110], 'Jolimont': [355, 110],
  "Jeanne d'Arc": [200, 40], 'François Verdier': [200, 180], 'Bachelier': [262, 52]
};
const LIGNES = [
  ['A', '#D9454F', ['Esquirol', 'Capitole', 'Jean Jaurès', 'Marengo', 'Jolimont'], 7],
  ['B', '#E6C443', ["Jeanne d'Arc", 'Jean Jaurès', 'François Verdier'], 7],
  ['L1', '#E8994A', ['Jean Jaurès', 'Bachelier'], 4]
];
const COUL = { cit: '#9DB82C', bleu: '#3f7cb8', orange: '#c56a2c', violet: '#7b55b0', gris: '#9aa0ab', rouge: '#b3423a' };

function schema(titre, o) {
  let s = `<svg viewBox="0 0 395 215" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Inter Tight, sans-serif">`;
  s += `<rect width="395" height="215" rx="10" fill="#f6f6f2"/>`;
  for (const [, c, l, w] of LIGNES) s += `<polyline points="${l.map(n => ST[n].join(',')).join(' ')}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  for (const [n, c] of o.zones || []) { const [x, y] = ST[n]; s += `<circle cx="${x}" cy="${y}" r="19" fill="${c}" fill-opacity=".22" stroke="${c}" stroke-width="2"/>`; }
  for (const n of o.portee || []) { const [x, y] = ST[n]; s += `<circle cx="${x}" cy="${y}" r="16" fill="${COUL.cit}" fill-opacity=".18" stroke="${COUL.cit}" stroke-width="2" stroke-dasharray="4 3"/>`; }
  for (const n of o.bloques || []) { const [x, y] = ST[n]; s += `<circle cx="${x}" cy="${y}" r="20" fill="${COUL.violet}" fill-opacity=".15" stroke="${COUL.violet}" stroke-width="2.5"/>`; }
  for (const [n, t] of o.traces || []) { const [x0, y] = ST[n]; const w = 14 + t.length * 5.4, x = Math.max(x0, w / 2 + 4); s += `<rect x="${x - w / 2}" y="${y - 44}" width="${w}" height="17" rx="8.5" fill="#f0a868"/><text x="${x}" y="${y - 32}" font-size="9.5" font-weight="600" text-anchor="middle" fill="#16161a">${t}</text>`; }
  for (const [n] of Object.entries(ST)) { const [x, y] = ST[n]; const corr = n === 'Jean Jaurès'; s += `<circle cx="${x}" cy="${y}" r="${corr ? 8 : 6}" fill="#fff" stroke="#16161a" stroke-width="${corr ? 3 : 2}"/>`; }
  for (const [n] of Object.entries(ST)) { const [x, y] = ST[n]; const dx = n === "Jeanne d'Arc" || n === 'François Verdier' ? 12 : 0, dy = n === "Jeanne d'Arc" || n === 'François Verdier' ? 4 : 24, anc = dx ? 'start' : 'middle'; s += `<text x="${x + dx}" y="${y + dy}" font-size="10" text-anchor="${anc}" fill="#3a3d48">${n}</text>`; }
  for (const [n, c, l, dx = 0, dy = 0] of o.pions || []) { const [x, y] = ST[n]; s += `<circle cx="${x + dx}" cy="${y + dy}" r="11" fill="${c}" stroke="#16161a" stroke-width="2"/><text x="${x + dx}" y="${y + dy + 4}" font-size="11" font-weight="700" text-anchor="middle" fill="#fff">${l}</text>`; }
  s += `</svg>`;
  return `<figure class="schema">${s}<figcaption>${titre}</figcaption></figure>`;
}

const F = COUL.cit;
const sec = `
<section class="saut">
  <h2><span class="num">6</span>Exemples, pas à pas</h2>
  <p>Tous les exemples se passent autour de Jean Jaurès, où se croisent le métro A, le métro B et le Linéo L1. Les cercles en pointillés montrent ce qu’on peut atteindre.</p>

  <h3>1. Jusqu’où un fugitif peut aller</h3>
  <p>Léa, fugitive, est à <b>Capitole</b>. Elle peut avancer de <b>2 arrêts au plus</b>, en suivant les lignes et en changeant de ligne si elle veut. Elle peut donc finir à Esquirol, Jean Jaurès, Marengo, Jeanne d’Arc, François Verdier ou Bachelier, ou rester sur place.</p>
  <div class="deux">
    ${schema('Sans patrouille : 6 arrêts possibles.', { portee: ['Esquirol', 'Jean Jaurès', 'Marengo', "Jeanne d'Arc", 'François Verdier', 'Bachelier'], pions: [['Capitole', F, 'L']] })}
    ${schema('La Patrouille tient Jean Jaurès : Léa ne peut ni s’y arrêter ni passer par là. Il ne lui reste qu’Esquirol.', { portee: ['Esquirol'], bloques: ['Jean Jaurès'], pions: [['Capitole', F, 'L'], ['Jean Jaurès', COUL.violet, 'V', 0, 0]] })}
  </div>

  <h3>2. Où un policier peut agir</h3>
  <p>Malik, policier, est à <b>Jean Jaurès</b>. Il peut d’abord se déplacer de 2 arrêts au plus, puis il joue ses 2 actions <b>sur l’arrêt où il se trouve</b>, et nulle part ailleurs. Pour enquêter à Capitole, il doit donc d’abord y aller. Tout le monde voit aussitôt « Malik enquête à Capitole ».</p>
  <div class="deux">
    ${schema('Malik peut aller jusqu’à l’un de ces arrêts, ou rester à Jean Jaurès, puis agir là où il s’arrête.', { portee: ['Esquirol', 'Capitole', 'Marengo', 'Jolimont', "Jeanne d'Arc", 'François Verdier', 'Bachelier'], pions: [['Jean Jaurès', COUL.bleu, 'B']] })}
    ${schema('Arrivé à Capitole, un policier ordinaire n’y fouille que Capitole.', { zones: [['Capitole', COUL.gris]], pions: [['Capitole', COUL.bleu, 'B', 14, -14]] })}
  </div>
</section>

<section class="saut">
  <h3 style="margin-top:0">3. Les Enquêteurs, équipe Bleue</h3>
  <p>Inès est chez les Enquêteurs. Elle va à <b>Capitole</b> et y enquête : sa fouille couvre Capitole <b>et tous ses voisins</b>, Esquirol et Jean Jaurès. Le téléphone lui dit lesquels ont une trace, et il y a combien de manches. Elle l’annonce ensuite à voix haute.</p>
  <div class="deux">
    ${schema('Enquête à Capitole : 3 arrêts fouillés d’un coup.', { zones: [['Capitole', COUL.bleu], ['Esquirol', COUL.bleu], ['Jean Jaurès', COUL.bleu]], traces: [['Esquirol', 'il y a 1 manche']], pions: [['Capitole', COUL.bleu, 'B', 14, -14]] })}
    ${schema('Enquête à Jean Jaurès, la grande correspondance : 6 arrêts fouillés d’un coup.', { zones: [['Jean Jaurès', COUL.bleu], ['Capitole', COUL.bleu], ['Marengo', COUL.bleu], ["Jeanne d'Arc", COUL.bleu], ['François Verdier', COUL.bleu], ['Bachelier', COUL.bleu]], pions: [['Jean Jaurès', COUL.bleu, 'B', 14, -14]] })}
  </div>
  <p class="petit">Conseil : enquêter sur une correspondance fouille beaucoup plus d’arrêts.</p>

  <h3>4. L’Intervention, équipe Orange</h3>
  <p>Tom est dans l’Intervention, à <b>Marengo</b>. Il va à Jean Jaurès et y lance une arrestation : elle couvre Jean Jaurès <b>et tous ses voisins</b>, donc aussi Capitole. Si Léa est à Capitole, elle est arrêtée.</p>
  <div class="deux">
    ${schema('Tom arrête à Jean Jaurès : 6 arrêts couverts, Léa est prise à Capitole.', { zones: [['Jean Jaurès', COUL.orange], ['Capitole', COUL.orange], ['Marengo', COUL.orange], ["Jeanne d'Arc", COUL.orange], ['François Verdier', COUL.orange], ['Bachelier', COUL.orange]], pions: [['Jean Jaurès', COUL.orange, 'O', 14, -14], ['Capitole', F, 'L']] })}
    ${schema('Un policier ordinaire à Jean Jaurès n’arrête qu’à Jean Jaurès : Léa, à Capitole, s’en sort.', { zones: [['Jean Jaurès', COUL.gris]], pions: [['Jean Jaurès', COUL.bleu, 'B', 14, -14], ['Capitole', F, 'L']] })}
  </div>
</section>

<section class="saut">
  <h3 style="margin-top:0">5. La Patrouille, équipe Violette</h3>
  <p>Sarah est dans la Patrouille. Elle avance de <b>3 arrêts</b> au lieu de 2, et elle <b>doit changer d’arrêt à chaque manche</b>. L’arrêt où elle arrive devient un mur pour les fugitifs à leur tour suivant : ils ne peuvent <b>ni s’y arrêter ni le traverser</b>. Bien placée sur une correspondance, elle coupe plusieurs lignes à la fois. Mais elle ne peut pas camper : à la manche d’après, elle doit repartir, et le passage se rouvre. Elle ne voit pas les fugitifs : elle bloque à l’aveugle, guidée par ce que disent les autres.</p>
  <div class="deux">
    ${schema('Depuis Jolimont, Sarah peut aller jusqu’à Capitole, Jeanne d’Arc, François Verdier ou Bachelier, 3 arrêts plus loin.', { portee: ['Marengo', 'Jean Jaurès', 'Capitole', "Jeanne d'Arc", 'François Verdier', 'Bachelier'], pions: [['Jolimont', COUL.violet, 'V']] })}
    ${schema('Arrivée à Jean Jaurès, elle ferme le carrefour pour une manche : A, B et L1 sont coupés pour les fugitifs. Ensuite, elle doit repartir.', { bloques: ['Jean Jaurès'], pions: [['Jean Jaurès', COUL.violet, 'V']] })}
  </div>

  <h3>6. Les traces</h3>
  <p>Hugo, fugitif, part de Marengo à la manche 4, passe par Jean Jaurès et s’arrête à Capitole. Il laisse une trace sur <b>Jean Jaurès et Capitole</b>, mais pas sur Marengo, son point de départ. Une enquête voit ces traces pendant cette manche et jusqu’à <b>3 manches</b> plus tard, en disant il y a combien de manches Hugo est passé. À la manche 8, elles ont disparu.</p>
  <div class="deux">
    ${schema('Manche 4 : Hugo va de Marengo à Capitole par Jean Jaurès.', { traces: [['Jean Jaurès', 'manche 4'], ['Capitole', 'manche 4']], pions: [['Capitole', F, 'H']] })}
    ${schema('Manche 6 : une enquête à Capitole répond « un fugitif est passé ici il y a 2 manches ». Hugo a eu le temps de filer.', { zones: [['Capitole', COUL.gris]], traces: [['Capitole', 'il y a 2 manches']], pions: [['Capitole', COUL.bleu, 'B', 14, -14]] })}
  </div>
</section>

<section class="saut">
  <h3 style="margin-top:0">7. Une manche racontée</h3>
  <ol class="etapes">
    <li><b>Les fugitifs bougent.</b> Léa va de Capitole à Carmes par Esquirol et ramasse l’objet caché à Carmes. Hugo reste à Bachelier. Personne côté police ne voit rien, sauf Inès, la corrompue, qui voit tout.</li>
    <li><b>L’équipe Bleue, les Enquêteurs, joue.</b> Malik va à Capitole et y enquête : tout le monde lit « Malik enquête à Capitole ». Sa fouille couvre Capitole, Esquirol et Jean Jaurès, et le téléphone lui montre une trace de cette manche à Esquirol. Il l’annonce : « Trace fraîche à Esquirol ! » Inès enquête à Jean Jaurès et voit une trace à Bachelier. Corrompue, elle annonce : « Rien autour de Jean Jaurès. »</li>
    <li><b>L’équipe Orange, l’Intervention, joue.</b> Grâce à Malik, Tom sait qu’un fugitif vient de passer vers Esquirol. Il va à Esquirol et y arrête : la zone couvre Esquirol, Capitole, Saint-Cyprien, Pont Neuf et Carmes. Léa est à Carmes, elle est arrêtée.</li>
    <li><b>L’équipe Violette, la Patrouille, joue.</b> Sarah se place à Jean Jaurès pour couper le centre. Hugo, coincé à Bachelier, ne pourra plus passer par Jean Jaurès à la prochaine manche.</li>
    <li><b>À la fin de la partie</b>, l’équipe Bleue se souviendra peut-être qu’Inès n’a jamais rien trouvé à Jean Jaurès, alors qu’Hugo était juste à côté…</li>
  </ol>
</section>
`;
let c = fs.readFileSync(D + '/corps.html', 'utf8');
// ordre final : … 8 cas particuliers, 9 exemples, 10 répartitions
c = c.replace('<span class="num">9</span>Les répartitions', '<span class="num">10</span>Les répartitions');
const ancre = '<h2 style="margin-top:14px"><span class="num">10</span>Les répartitions';
if (!c.includes(ancre)) throw new Error('ancre des répartitions introuvable');
c = c.replace(ancre, '</section>\n' + sec.replace('<span class="num">6</span>Exemples', '<span class="num">9</span>Exemples') + '\n<section class="saut">\n  <h2><span class="num">10</span>Les répartitions');
fs.writeFileSync(D + '/corps-exemples.html', c);
console.log('ok');
