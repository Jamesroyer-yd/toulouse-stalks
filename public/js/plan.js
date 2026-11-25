/* Toulouse Stalks · plan du réseau en SVG : glisser pour se déplacer,
   pincer ou molette pour zoomer, toucher un arrêt pour le choisir.
   Tout est construit avec createElementNS et textContent : aucun HTML injecté. */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  // une couleur par ligne, comme sur un plan de métro ; reprise de la maquette Figma
  const COUL = { A: '#D9454F', B: '#E6C443', T1: '#4384D1', 'Téléo': '#C2509A', L1: '#E8994A', L2: '#4FB3A9', L3: '#9B8CE0', L4: '#E072A6', L5: '#62AEE6',
    L8: '#B8A75A', L9: '#7CC66C', L10: '#B98262', L12: '#E57B70', L14: '#62C6DB' };
  const EPAIS = { metro: 10, tram: 7, teleo: 5, lineo: 5 };
  const el = (nom, attrs = {}, parent) => {
    const e = document.createElementNS(NS, nom);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (parent) parent.appendChild(e);
    return e;
  };

  window.Plan = function (conteneur, reseau) {
    const svg = el('svg', { role: 'img', 'aria-label': 'Plan du réseau Tisséo' });
    conteneur.appendChild(svg);
    const fond = el('g', {}, svg), calque = el('g', {}, svg), cibles = el('g', {}, svg);
    const A = reseau.arrets;
    const rang = a => a.lignes.some(l => l === 'A' || l === 'B') ? 3 : a.lignes.some(l => l === 'T1' || l === 'Téléo') ? 2 : 1;

    // lignes : les tronçons partagés par plusieurs lignes sont dessinés côte à côte
    const parArete = {};
    for (const l of reseau.lignes) l.arrets.forEach((x, k) => { if (!k) return; const cle = Math.min(x, l.arrets[k - 1]) + '-' + Math.max(x, l.arrets[k - 1]); (parArete[cle] ||= []); if (!parArete[cle].includes(l.nom)) parArete[cle].push(l.nom); });
    for (const mode of ['lineo', 'tram', 'teleo', 'metro'])
      for (const l of reseau.lignes.filter(x => x.mode === mode)) {
        let d = '';
        l.arrets.forEach((x, k) => {
          if (!k) return; const y = l.arrets[k - 1], L = parArete[Math.min(x, y) + '-' + Math.max(x, y)], i = L.indexOf(l.nom);
          const x1 = A[y].x, y1 = A[y].y, x2 = A[x].x, y2 = A[x].y, lg = Math.hypot(x2 - x1, y2 - y1) || 1, dec = (i - (L.length - 1) / 2) * 6;
          const ox = -(y2 - y1) / lg * dec, oy = (x2 - x1) / lg * dec;
          d += `M${(x1 + ox).toFixed(1)} ${(y1 + oy).toFixed(1)}L${(x2 + ox).toFixed(1)} ${(y2 + oy).toFixed(1)}`;
        });
        el('path', { d, fill: 'none', stroke: COUL[l.nom] || '#6E7A92', 'stroke-width': EPAIS[mode], 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...(mode === 'teleo' ? { 'stroke-dasharray': '10 7' } : {}) }, fond);
      }
    // correspondances à pied : trait blanc court entre deux arrêts proches
    for (const [a, b] of reseau.marches || [])
      el('line', { x1: A[a].x, y1: A[a].y, x2: A[b].x, y2: A[b].y, stroke: '#E6E9EF', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-opacity': .85 }, fond);
    // arrêts : correspondances en blanc, les autres cerclés de la couleur de leur ligne
    for (const a of A) {
      const r = rang(a), corr = a.lignes.length > 1;
      el('circle', { cx: a.x, cy: a.y, r: corr ? 10 : r === 3 ? 7.5 : 6, fill: '#0e0e10', stroke: corr ? '#FFFFFF' : COUL[a.lignes[0]] || '#8B94A8', 'stroke-width': corr ? 3.5 : 3 }, fond);
    }
    // noms : grandes stations toujours, les autres seulement quand on zoome (classe .proche)
    for (const a of A) {
      const grand = rang(a) === 3 || a.lignes.length > 1;
      const t = el('text', { x: a.x + 14, y: a.y + 5, class: grand ? 'etiquette forte' : 'etiquette petite' }, fond); t.textContent = a.nom;
    }
    // étiquettes de ligne aux deux bouts de chaque ligne
    const vus = new Set();
    for (const l of reseau.lignes) for (const x of [l.arrets[0], l.arrets[l.arrets.length - 1]]) {
      if (vus.has(l.nom + x)) continue; vus.add(l.nom + x);
      const g = el('g', { transform: `translate(${A[x].x} ${A[x].y + 26})` }, fond);
      const larg = 12 + l.nom.length * 9;
      el('rect', { x: -larg / 2, y: -10, width: larg, height: 20, rx: 7, fill: COUL[l.nom] || '#6E7A92' }, g);
      const t = el('text', { y: 5, class: 'nom-ligne' }, g); t.textContent = l.nom;
    }
    for (const a of A) {
      const c = el('circle', { cx: a.x, cy: a.y, r: 18, class: 'arret-cible', 'data-arret': a.id }, cibles);
      const titre = el('title', {}, c); titre.textContent = a.nom;
    }

    // ---------- vue : déplacement et zoom ----------
    let vb = { x: 0, y: 0, l: reseau.largeur, h: reseau.hauteur };
    const bulle = document.createElement('div'); bulle.className = 'bulle-arret'; bulle.hidden = true; conteneur.appendChild(bulle);
    let bulleArret = null;
    function placerBulle() {
      if (bulleArret == null) return;
      const r = svg.getBoundingClientRect(), a = A[bulleArret];
      bulle.style.left = ((a.x - vb.x) / vb.l * r.width) + 'px';
      bulle.style.top = ((a.y - vb.y) / vb.h * r.height) + 'px';
    }
    function montrerNom(id) {
      if (id == null || !A[id]) { bulleArret = null; bulle.hidden = true; return; }
      bulleArret = id;
      const nom = document.createElement('b'); nom.textContent = A[id].nom;
      const lignes = document.createElement('span'); lignes.textContent = A[id].lignes.join(' · ');
      bulle.replaceChildren(nom, lignes); bulle.hidden = false; placerBulle();
    }
    const appliquer = () => { svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.l} ${vb.h}`); svg.classList.toggle('proche', vb.l < 700); placerBulle(); };
    const ratio = () => { const r = conteneur.getBoundingClientRect(); return r.width / r.height || 0.5; };
    function zoomer(f, cx, cy) {
      const l = Math.min(Math.max(vb.l * f, 260), reseau.largeur * 1.2);
      const k = l / vb.l; vb = { x: cx - (cx - vb.x) * k, y: cy - (cy - vb.y) * k, l, h: l / ratio() }; appliquer();
    }
    const versPlan = (px, py) => { const r = svg.getBoundingClientRect(); return [vb.x + (px - r.left) / r.width * vb.l, vb.y + (py - r.top) / r.height * vb.h]; };
    function centrer(id, largeur = 420) { const a = A[id]; if (!a) return; vb.l = largeur; vb.h = largeur / ratio(); vb.x = a.x - vb.l / 2; vb.y = a.y - vb.h * 0.42; appliquer(); }
    function toutVoir() { vb.l = reseau.largeur; vb.h = vb.l / ratio(); if (vb.h < reseau.hauteur) { vb.h = reseau.hauteur; vb.l = vb.h * ratio(); } vb.x = (reseau.largeur - vb.l) / 2; vb.y = 0; appliquer(); }

    const doigts = new Map(); let depart = null, bouge = 0;
    svg.addEventListener('pointerdown', e => { try { svg.setPointerCapture(e.pointerId); } catch {} doigts.set(e.pointerId, [e.clientX, e.clientY]); depart = [e.clientX, e.clientY]; bouge = 0; });
    svg.addEventListener('pointermove', e => {
      if (!doigts.has(e.pointerId)) return;
      const avant = doigts.get(e.pointerId); doigts.set(e.pointerId, [e.clientX, e.clientY]);
      if (doigts.size === 1) {
        const r = svg.getBoundingClientRect(); const dx = e.clientX - avant[0], dy = e.clientY - avant[1];
        bouge += Math.abs(dx) + Math.abs(dy); vb.x -= dx / r.width * vb.l; vb.y -= dy / r.height * vb.h; appliquer();
      } else if (doigts.size === 2) {
        const [p1, p2] = [...doigts.values()]; const autre = [...doigts.entries()].find(([k]) => k !== e.pointerId)[1];
        const d0 = Math.hypot(avant[0] - autre[0], avant[1] - autre[1]), d1 = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
        bouge += 99; const [cx, cy] = versPlan((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2); if (d1 > 0) zoomer(d0 / d1, cx, cy);
      }
    });
    const lacher = e => {
      doigts.delete(e.pointerId);
      if (e.type === 'pointerup' && bouge < 8 && doigts.size === 0) {
        const cible = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-arret]');
        const id = cible ? Number(cible.getAttribute('data-arret')) : null;
        montrerNom(id);                       // tout arrêt touché affiche son nom
        if (id != null && choix) choix(id);
      }
    };
    svg.addEventListener('pointerup', lacher); svg.addEventListener('pointercancel', lacher);
    svg.addEventListener('wheel', e => { e.preventDefault(); const [cx, cy] = versPlan(e.clientX, e.clientY); zoomer(e.deltaY > 0 ? 1.15 : 1 / 1.15, cx, cy); }, { passive: false });

    // ---------- éléments de partie ----------
    let choix = null;
    function jeton(a, coul, lettre, d, dx = 0, dy = 0) {
      const g = el('g', { class: 'jeton', transform: `translate(${a.x + dx} ${a.y + dy})` }, calque);
      el('circle', { r: d / 2, fill: coul, stroke: '#0e0e10', 'stroke-width': 3 }, g);
      const t = el('text', { y: 1 }, g); t.textContent = lettre;
    }
    function maj(o = {}) {
      calque.replaceChildren();
      for (const id of o.portee || []) el('circle', { cx: A[id].x, cy: A[id].y, r: 17, class: 'portee' }, calque);
      for (const id of o.bloques || []) if (A[id]) el('circle', { cx: A[id].x, cy: A[id].y, r: 22, class: 'bloque' }, calque);
      if (o.choisi != null && A[o.choisi]) el('circle', { cx: A[o.choisi].x, cy: A[o.choisi].y, r: 20, class: 'choisi' }, calque);
      for (const id of o.objets || []) el('rect', { x: A[id].x - 7, y: A[id].y - 30, width: 14, height: 14, fill: '#D1EE59', stroke: '#0e0e10', 'stroke-width': 2, transform: `rotate(45 ${A[id].x} ${A[id].y - 23})` }, calque);
      for (const t of o.traces || []) {
        const a = A[t.arret]; const g = el('g', { transform: `translate(${a.x} ${a.y - 38})` }, calque);
        el('rect', { x: -6, y: -11, width: 12 + t.texte.length * 6.6, height: 22, rx: 11, fill: t.trace ? '#FFB98A' : '#3a3252' }, g);
        const x = el('text', { x: 0, y: 4, class: t.trace ? 'texte-trace' : 'texte-rien' }, g); x.textContent = t.texte;
      }
      (o.police || []).forEach((p, k) => jeton(A[p.arret], p.coul, p.lettre, 28, k % 2 ? 10 : -10, k % 2 ? 10 : -10));
      for (const f of o.fugitifs || []) { if (f.moi) el('circle', { cx: A[f.arret].x, cy: A[f.arret].y, r: 30, fill: 'rgba(209,238,89,.2)' }, calque); jeton(A[f.arret], f.libre === false ? '#8B94A8' : '#D1EE59', f.lettre, f.moi ? 36 : 30); }
    }
    new ResizeObserver(() => { vb.h = vb.l / ratio(); appliquer(); }).observe(conteneur);
    toutVoir();
    return { maj, centrer, toutVoir, surChoix: fn => { choix = fn; } };
  };
})();
