/* Toulouse Stalks · interface du joueur.
   Sécurité : tout texte venu du serveur ou d'un joueur passe par textContent
   (fonction h) ; aucun innerHTML. Les seules icônes SVG sont des constantes. */
(function () {
  'use strict';
  const EQUIPES = [['Bleue', '#80B4E3', 'B'], ['Orange', '#FFB98A', 'O'], ['Violette', '#C2A6E5', 'V'], ['Verte', '#8FD6A8', 'Ve']];
  const C = { citron: '#D1EE59', rouge: '#FF9C92', txt2: '#9AA5B8' };
  const FORMAT_CODE = /^[A-HJ-NP-Z2-9]{5}$/, FORMAT_JETON = /^[0-9a-f]{64}$/;
  const ecran = document.getElementById('ecran'), bandeau = document.getElementById('message');
  let reseau = null, session = null, ws = null, vue = null, jeu = null, essais = 0;
  const local = { accueil: 'choix', choisi: null, action: 'enqueter', mode: 'joue', essaiN: 10, reglages: false };

  // ---------- construction sûre ----------
  function h(tag, props, ...enfants) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'couleur') e.style.setProperty('--c', v);
      else if (k === 'clic') e.addEventListener('click', v);
      else if (k === 'saisie') e.addEventListener('input', v);
      else if (['type', 'id', 'value', 'placeholder', 'maxlength', 'autocomplete', 'inputmode', 'aria-label', 'aria-pressed', 'for', 'name', 'enterkeyhint', 'autocapitalize', 'spellcheck'].includes(k)) e.setAttribute(k, String(v));
      else if (k === 'disabled') e.disabled = true;
    }
    for (const c of enfants.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return e;
  }
  const bouton = (texte, clic, second, desactive) => h('button', { class: 'bouton' + (second ? ' second' : ''), type: 'button', clic, disabled: desactive }, texte);
  const ligne = (a, b) => h('div', { class: 'ligne' }, h('span', {}, a), h('span', {}, b));
  const pastille = (texte, couleur) => h('span', { class: 'pastille', couleur }, texte);
  const SPE = {
    enqueteurs: ['Enquêteurs', 'Tes enquêtes fouillent l’arrêt visé et tous ses voisins d’un coup.'],
    intervention: ['Intervention', 'Tes arrestations couvrent l’arrêt visé et tous ses voisins d’un coup.'],
    patrouille: ['Patrouille', 'Tu changes d’arrêt à chaque manche, 3 au plus. L’arrêt où tu arrives est interdit aux fugitifs à leur tour suivant.']
  };
  const ICONES = {
    fugitif: 'M9 4a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7 21l3-6l3 2v4M6 12l4-3l3 1l2 3h3M10 9l-1 5',
    policier: 'M12 3l7 3v5c0 5-3 8-7 10c-4-2-7-5-7-10V6zM9 12l2 2l4-4',
    corrompu: 'M12 3l7 3v5c0 5-3 8-7 10c-4-2-7-5-7-10V6zM8.5 11h7M10 14.5c1.3 1 2.7 1 4 0'
  };
  function icone(nom) {
    const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) s.setAttribute(k, v);
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', ICONES[nom]); s.append(p); return s;
  }
  function message(texte) { bandeau.textContent = texte; bandeau.hidden = false; clearTimeout(message.t); message.t = setTimeout(() => { bandeau.hidden = true; }, 4000); }
  const afficher = (...noeuds) => { jeu = null; ecran.replaceChildren(...noeuds); };

  // ---------- session et connexion ----------
  function lireSession() {
    try { const s = JSON.parse(localStorage.getItem('ts-session')); if (s && FORMAT_CODE.test(s.code) && FORMAT_JETON.test(s.jeton)) return s; } catch {}
    return null;
  }
  function oublier() { localStorage.removeItem('ts-session'); session = null; vue = null; if (ws) { ws.onclose = null; ws.close(); ws = null; } accueil(); }
  async function api(chemin, corps) {
    try {
      const r = await fetch(chemin, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) });
      const d = await r.json();
      if (!r.ok) return message(d.erreur || 'Erreur.');
      if (!FORMAT_CODE.test(d.code) || !FORMAT_JETON.test(d.jeton)) return message('Réponse inattendue.');
      session = { code: d.code, jeton: d.jeton }; localStorage.setItem('ts-session', JSON.stringify(session)); connecter();
    } catch { message('Connexion impossible.'); }
  }
  function connecter() {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/partie/${session.code}/ws`);
    ws.onopen = () => { essais = 0; ws.send(JSON.stringify({ type: 'auth', jeton: session.jeton })); };
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'vue') { if (vue && m.vue.moi !== vue.moi) { jeu = null; local.choisi = null; local.resultat = null; } vue = m.vue; rendre(); }
      else if (m.type === 'erreur') message(m.message);
      else if (m.type === 'retour' && m.action === 'enqueter') { local.resultat = m.resultat; rendre(); }
      else if (m.type === 'retour' && m.action === 'arreter') message(m.resultat.reussie ? 'Arrestation réussie !' : 'Personne à arrêter ici.');
    };
    ws.onclose = e => {
      if (e.code === 1008) { message('Partie introuvable ou terminée.'); return oublier(); }
      setTimeout(connecter, Math.min(1000 * 2 ** essais++, 15000));
    };
  }
  const envoyer = (type, donnees = {}) => { if (ws?.readyState === 1) ws.send(JSON.stringify({ type, ...donnees })); else message('Reconnexion en cours…'); };

  // ---------- accueil ----------
  function accueil() {
    const nom = h('input', { id: 'nom', maxlength: 20, autocomplete: 'given-name', placeholder: 'Léa', enterkeyhint: 'go' });
    const champNom = h('label', { class: 'champ', for: 'nom' }, h('span', {}, 'Ton prénom'), nom);
    if (local.accueil === 'creer') return afficher(h('section', { class: 'page' }, h('p', { class: 'sur' }, 'Créer'), h('h1', {}, 'Nouvelle partie'),
      h('p', { class: 'intro' }, 'Choisis ta place dans cette partie.'),
      h('div', { class: 'choix colonne' },
        ...[['joue', 'Je joue', 'Mon rôle est tiré au sort, comme les autres'], ['mj', 'Je suis MJ', 'Je ne joue pas : je vois tout et j’anime'], ['essai', 'Partie d’essai', 'Seul, avec de faux joueurs : je vois l’écran de chacun et je joue à sa place']]
          .map(([cle, titre, sous]) => h('button', { type: 'button', class: 'option', 'aria-pressed': String(local.mode === cle), clic: () => { local.mode = cle; const v = nom.value; accueil(); document.getElementById('nom').value = v; } }, h('b', {}, titre), h('span', {}, sous)))),
      local.mode === 'essai' ? h('div', { class: 'ligne' }, h('span', {}, 'Faux joueurs'), h('span', { class: 'pas' },
        h('button', { type: 'button', 'aria-label': 'Un faux joueur de moins', clic: () => { local.essaiN = Math.max(6, local.essaiN - 1); const v = nom.value; accueil(); document.getElementById('nom').value = v; } }, '−'),
        h('output', {}, String(local.essaiN)),
        h('button', { type: 'button', 'aria-label': 'Un faux joueur de plus', clic: () => { local.essaiN = Math.min(20, local.essaiN + 1); const v = nom.value; accueil(); document.getElementById('nom').value = v; } }, '+'))) : null,
      champNom, h('div', { class: 'pousse' }),
      bouton('Créer la partie', () => api('/api/creer', { nom: nom.value, mj: local.mode !== 'joue', essai: local.mode === 'essai' ? local.essaiN : 0 })), bouton('Retour', () => { local.accueil = 'choix'; accueil(); }, true)));
    if (local.accueil === 'rejoindre') {
      const code = h('input', { id: 'code', class: 'code', maxlength: 5, autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', placeholder: 'TLS42' });
      return afficher(h('section', { class: 'page' }, h('p', { class: 'sur' }, 'Rejoindre'), h('h1', {}, 'Entre le code de la partie'),
        h('label', { class: 'champ', for: 'code' }, h('span', {}, 'Code'), code), champNom, h('div', { class: 'pousse' }),
        bouton('Entrer dans la salle', () => api('/api/rejoindre', { code: code.value, nom: nom.value })), bouton('Retour', () => { local.accueil = 'choix'; accueil(); }, true)));
    }
    afficher(h('section', { class: 'page centre' }, h('div', { class: 'pousse' }),
      h('h1', { class: 'logo' }, h('span', {}, 'TOULOUSE'), h('b', {}, 'STALKS')),
      h('p', { class: 'intro' }, 'Une traque cachée sur le réseau de la Ville rose.'), h('div', { class: 'pousse' }),
      bouton('Créer une partie', () => { local.accueil = 'creer'; accueil(); }),
      bouton('Rejoindre avec un code', () => { local.accueil = 'rejoindre'; accueil(); }, true),
      h('p', { class: 'petit' }, 'Chaque joueur sur son téléphone · 6 à 20 joueurs')));
  }

  // ---------- aides de vue ----------
  const joueur = id => vue.joueurs.find(j => j.id === id);
  const moi = () => joueur(vue.moi);
  const estCreateur = () => vue.moi === vue.createur;
  const equipe = e => EQUIPES[e] || ['?', C.txt2, '?'];
  const nomArret = a => reseau.arrets[a]?.nom ?? '?';
  function portee(depart, pas, bloques) {
    const vus = new Set([depart]); let front = [depart];
    for (let i = 0; i < pas; i++) { const s = []; for (const a of front) for (const v of reseau.arrets[a].voisins) if (!vus.has(v) && !bloques?.has(v)) { vus.add(v); s.push(v); } front = s; }
    return vus;
  }
  const forcer = () => h('button', { class: 'bouton second', type: 'button', clic: () => { if (confirm('Passer à la suite sans attendre les joueurs en retard ?')) envoyer('forcer'); } }, 'Forcer la suite');

  // ---------- rendu ----------
  function rendre() {
    if (!vue) return;
    barreEssai();
    if (vue.phase === 'salle') return salle();
    if (vue.phase === 'roles') return vue.estMJ ? rolesMJ() : roles();
    if (vue.phase === 'fugitifs' || vue.phase === 'police') return vue.estMJ ? partieMJ() : partie();
    if (vue.phase === 'accusation') return vue.estMJ ? accusationMJ() : accusation();
    if (vue.phase === 'fin') return fin();
  }

  function salle() {
    const r = vue.reglages, n = vue.joueurs.length;
    const reglage = (cle, libelle, min, max) => {
      if (!estCreateur()) return ligne(libelle, String(r[cle]));
      const changer = d => envoyer('regler', { reglages: { [cle]: Math.min(max, Math.max(min, r[cle] + d)) } });
      return h('div', { class: 'ligne' }, h('span', {}, libelle), h('span', { class: 'pas' },
        h('button', { type: 'button', 'aria-label': libelle + ' moins', clic: () => changer(-1) }, '−'), h('output', {}, String(r[cle])),
        h('button', { type: 'button', 'aria-label': libelle + ' plus', clic: () => changer(1) }, '+')));
    };
    afficher(h('section', { class: 'page' }, h('p', { class: 'sur' }, 'Partie ' + vue.code), h('h1', {}, 'Salle d’attente'),
      h('p', { class: 'intro' }, `Donne le code ${vue.code} aux autres. Les rôles seront tirés au sort au lancement.`),
      local.reglages && estCreateur()
        ? h('div', { class: 'carte' }, h('div', { class: 'ligne' }, h('h2', {}, 'Réglages'), h('button', { type: 'button', class: 'lien', clic: () => { local.reglages = false; salle(); } }, 'Fermer')),
            reglage('fugitifs', 'Fugitifs', 1, 6), reglage('equipes', 'Équipes de police', 1, 4),
            reglage('corrompus', 'Policiers corrompus', 0, 4), reglage('objets', 'Objets cachés', 4, 80), reglage('objectif', 'Objets à ramasser', 1, 80), reglage('manches', 'Manches', 3, 30))
        : h('div', { class: 'carte' }, h('div', { class: 'ligne' }, h('h2', {}, 'Réglages'), estCreateur() ? h('button', { type: 'button', class: 'lien', clic: () => { local.reglages = true; salle(); } }, 'Modifier') : null),
            h('p', { class: 'petit' }, `${r.fugitifs} fugitif${r.fugitifs > 1 ? 's' : ''} · ${r.equipes} équipe${r.equipes > 1 ? 's' : ''} de police · ${r.corrompus} corrompu${r.corrompus > 1 ? 's' : ''} · ${r.objectif} objets à trouver sur ${r.objets} · ${r.manches} manches`)),
      // le MJ à part, puis les joueurs avec leur nombre et ce qu'il manque pour lancer
      vue.mj ? h('div', { class: 'carte' }, h('div', { class: 'ligne' }, h('h2', {}, 'Maître du jeu'), pastille(vue.mj + (vue.estMJ ? ' · toi' : ''), C.citron)),
        h('p', { class: 'petit' }, 'Ne joue pas : voit toute la partie et l’anime.')) : null,
      h('div', { class: 'carte' }, h('h2', {}, `Joueurs · ${n}`),
        n ? h('div', { class: 'pastilles' }, vue.joueurs.map(j => pastille(j.nom + (j.id === vue.moi ? ' · toi' : j.id === vue.createur ? ' · créateur' : ''), j.id === vue.moi ? C.citron : C.txt2)))
          : h('p', { class: 'petit' }, 'Personne pour l’instant. Donne le code ' + vue.code + '.'),
        n < 6 ? h('p', { class: 'petit' }, `Il en faut au moins 6 pour lancer : encore ${6 - n}.`) : null),
      h('div', { class: 'pousse' }),
      estCreateur() ? bouton(n < 6 ? 'Il faut au moins 6 joueurs' : 'Lancer la partie', () => envoyer('lancer'), false, n < 6) : h('p', { class: 'petit centre' }, 'Le créateur lancera la partie.'),
      h('button', { type: 'button', class: 'lien centre-texte', clic: () => { if (confirm('Quitter la partie ?')) oublier(); } }, 'Quitter la salle')));
  }

  function roles() {
    const r = vue.role, coul = r.corrompu ? C.rouge : r.role === 'fugitif' ? C.citron : equipe(r.equipe)[1];
    const infos = [];
    if (r.role === 'fugitif') {
      const co = vue.joueurs.filter(j => j.role === 'fugitif' && j.id !== vue.moi).map(j => j.nom);
      if (co.length) infos.push(ligne('Ton équipe', co.join(', ')));
      infos.push(ligne('Objectif', `${vue.reglages.objectif} objets en ${vue.reglages.manches} manches`));
    } else {
      infos.push(ligne('Ton équipe', vue.joueurs.filter(j => j.equipe === r.equipe && j.role === 'policier' && j.id !== vue.moi).map(j => j.nom).join(', ') || 'seul'));
      infos.push(ligne('Fugitifs', vue.joueurs.filter(j => j.role === 'fugitif').map(j => j.nom).join(', ')));
    }
    // un corrompu ne se voit pas dans la liste : seulement les autres, s'il y en a
    const autres = (vue.corrompus || []).filter(id => id !== vue.moi);
    if (autres.length) infos.push(ligne(r.corrompu ? (autres.length > 1 ? 'Autres corrompus' : 'Autre corrompu') : 'Policiers corrompus', autres.map(id => `${joueur(id).nom} · ${equipe(joueur(id).equipe)[0]}`).join(', ')));
    const texte = r.role === 'fugitif' ? 'Ramasse les objets cachés sur le réseau sans te faire arrêter. Toi seul vois où ils sont.'
      : r.corrompu ? `Tu joues dans l’équipe ${equipe(r.equipe)[0]}, mais tu aides les fugitifs. Tu vois leur position, tes arrestations ne comptent pas, et tu peux mentir à voix haute sur tes enquêtes.`
      : 'Avec toute la police, retrouve et arrête les fugitifs. Un traître se cache peut-être dans ton équipe.';
    if (r.specialite) infos.unshift(ligne('Spécialité', SPE[r.specialite][0]), h('p', { class: 'petit' }, SPE[r.specialite][1]));
    const prets = vue.joueurs.filter(j => j.pret).length;
    afficher(h('section', { class: 'page centre' }, h('p', { class: 'petit' }, 'TON RÔLE · NE MONTRE PAS TON ÉCRAN'), h('div', { class: 'pousse' }),
      h('div', { class: 'embleme', couleur: coul }, icone(r.corrompu ? 'corrompu' : r.role)),
      h('p', { class: 'titre-role', couleur: coul }, r.corrompu ? 'Corrompu' : r.role === 'fugitif' ? 'Fugitif' : 'Policier'),
      r.role === 'policier' ? h('div', { class: 'pastilles' }, pastille('Équipe ' + equipe(r.equipe)[0], equipe(r.equipe)[1])) : null,
      h('p', { class: 'intro' }, texte), h('div', { class: 'pousse' }), h('div', { class: 'carte' }, infos),
      moi().pret ? h('p', { class: 'petit' }, `Prêts : ${prets} sur ${vue.joueurs.length}`) : bouton('J’ai compris', () => envoyer('pret')),
      estCreateur() && moi().pret ? forcer() : null));
  }

  function partie() {
    const r = vue.role, m = moi();
    if (!jeu) {
      const conteneur = h('div', { class: 'plan' });
      const racine = h('div', { class: 'jeu' }, conteneur);
      afficher(racine);
      const plan = Plan(conteneur, reseau);
      plan.surChoix(a => { local.choisi = a; partie(); });
      jeu = { racine, plan, barre: null, outils: null, panneau: null };
      const p = r.role === 'fugitif' || r.corrompu ? vue.joueurs.find(j => j.id === vue.moi).position : m.position;
      if (p != null) plan.centrer(p);
      local.choisi = null;
    }
    const monTourFugitif = r.role === 'fugitif' && m.libre && vue.phase === 'fugitifs' && !vue.coup;
    const t = vue.tour, monTourPolice = r.role === 'policier' && vue.phase === 'police' && t && !t.fini;
    let cercles = [];
    const patrouilles = new Set(vue.bloques || []);   // arrêts tenus par une patrouille qui vient d'y arriver
    if (monTourFugitif) cercles = [...portee(m.position, 2, patrouilles)];
    else if (monTourPolice && !t.deplace) cercles = [...portee(m.position, r.specialite === 'patrouille' ? 3 : 2)].filter(a => r.specialite !== 'patrouille' || a !== m.position);
    else if (monTourPolice) cercles = [...portee(m.position, 1)];
    if (local.choisi != null && !cercles.includes(local.choisi) && !(r.corrompu && vue.phase === 'police')) local.choisi = null;

    const enquetes = (vue.enquetes || []).filter(e => e.manche >= vue.manche - 1);
    jeu.plan.maj({
      portee: cercles, choisi: local.choisi, objets: vue.objets || [], bloques: vue.bloques || [],
      police: vue.joueurs.filter(j => j.role === 'policier' && j.position != null).map(j => ({ arret: j.position, coul: equipe(j.equipe)[1], lettre: equipe(j.equipe)[2] })),
      fugitifs: vue.joueurs.filter(j => j.role === 'fugitif' && j.position != null).map(j => ({ arret: j.position, lettre: j.nom[0].toUpperCase(), moi: j.id === vue.moi, libre: j.libre })),
      traces: enquetes.flatMap(e => (e.traces || (e.trace ? [{ arret: e.arret, manche: e.mancheTrace }] : [])).map(t => ({ arret: t.arret, trace: true, texte: 'Trace · M' + t.manche }))),
      fouilles: enquetes.flatMap(e => (e.zone || [e.arret]).filter(a => !(e.traces || (e.trace ? [{ arret: e.arret }] : [])).some(t => t.arret === a)))
    });

    // barre du haut
    const tour = vue.phase === 'fugitifs' ? ['Les fugitifs se déplacent', C.citron] : [`Au tour de l’équipe ${equipe(vue.equipeEnCours)[0]}`, equipe(vue.equipeEnCours)[1]];
    const barre = h('div', { class: 'barre' }, h('div', {}, h('p', { class: 'sur' }, `Manche ${vue.manche} / ${vue.reglages.manches}`), h('p', { class: 'tour', couleur: tour[1] }, tour[0])),
      h('span', { class: 'compteur', 'aria-label': 'Objets ramassés' }, `${vue.objetsRamasses} / ${vue.reglages.objectif}`));
    const outils = h('div', { class: 'outils' },
      h('button', { type: 'button', 'aria-label': 'Recentrer sur ma position', clic: () => jeu.plan.centrer(m.position ?? 0) }, '◎'),
      h('button', { type: 'button', 'aria-label': 'Voir tout le réseau', clic: () => jeu.plan.toutVoir() }, '⤢'));
    jeu.barre?.remove(); jeu.outils?.remove(); jeu.panneau?.remove();
    jeu.barre = barre; jeu.outils = outils; jeu.panneau = h('section', { class: 'panneau', 'aria-label': 'Actions' }, panneau(monTourFugitif, monTourPolice));
    jeu.racine.append(barre, outils, jeu.panneau);
    jeu.resultat?.remove(); jeu.resultat = null;
    if (local.resultat) { jeu.resultat = carteResultat(local.resultat); jeu.racine.append(jeu.resultat); }
  }

  // grande carte du résultat d'enquête, vue par le policier seul
  function carteResultat(e) {
    const traces = e.traces || (e.trace ? [{ arret: e.arret, manche: e.mancheTrace }] : []);
    const zone = e.zone || [e.arret];
    const fermer = () => { local.resultat = null; partie(); };
    return h('div', { class: 'voile-resultat', role: 'dialog', 'aria-label': 'Résultat de ton enquête' },
      h('div', { class: 'carte-resultat ' + (traces.length ? 'oui' : 'non') },
        h('p', { class: 'sur' }, 'Résultat · vu par toi seul'),
        h('p', { class: 'titre-resultat' }, traces.length ? 'Une trace !' : 'Rien'),
        h('p', { class: 'intro' }, traces.length
          ? 'Un fugitif est passé ' + traces.map(t => 'à ' + nomArret(t.arret) + ', manche ' + t.manche).join(' et ') + '.'
          : (zone.length > 1 ? 'Aucune trace autour de ' + nomArret(e.arret) + ' : ' + zone.length + ' arrêts fouillés.' : 'Aucune trace à ' + nomArret(e.arret) + '.')),
        h('p', { class: 'consigne' }, vue.role?.corrompu ? 'Annonce-le à voix haute… ou mens.' : 'Annonce-le à voix haute à la police.'),
        bouton('Continuer', fermer)));
  }

  function panneau(monTourFugitif, monTourPolice) {
    const r = vue.role, m = moi(), t = vue.tour, x = [];
    const choisi = local.choisi != null ? nomArret(local.choisi) : null;
    if (r.role === 'fugitif') {
      if (!m.libre) x.push(h('h2', {}, 'Tu as été arrêté'), h('p', { class: 'intro' }, 'Tes objets sont perdus. Aide ton équipe de vive voix, si vous êtes ensemble.'));
      else if (monTourFugitif) {
        x.push(h('h2', {}, 'Avance de 2 arrêts au plus'), h('p', { class: 'intro' }, 'Touche un arrêt cerclé. Tu ramasses les objets des arrêts traversés.'));
        if (choisi) x.push(ligne('Arrêt choisi', choisi));
        x.push(bouton(choisi ? 'Aller à ' + choisi : 'Choisis un arrêt', () => { envoyer('deplacerFugitif', { arret: local.choisi }); local.choisi = null; }, false, !choisi),
          bouton('Rester sur place', () => envoyer('deplacerFugitif', { arret: m.position }), true));
      } else if (vue.phase === 'fugitifs') x.push(h('h2', {}, 'Coup enregistré'), h('p', { class: 'intro' }, 'En attente des autres fugitifs.'));
      else x.push(h('h2', {}, 'La police cherche'), h('p', { class: 'intro' }, 'Ne dis rien, ne regarde personne.'));
    } else {
      if (monTourPolice && !t.deplace) {
        x.push(h('h2', {}, r.specialite === 'patrouille' ? 'Change d’arrêt : 3 au plus' : 'Déplace-toi de 2 arrêts au plus'), h('p', { class: 'intro' }, r.specialite === 'patrouille' ? 'Tu dois bouger à chaque manche. L’arrêt où tu arrives sera bloqué pour les fugitifs à leur prochain tour.' : 'Ou reste sur place, puis joue tes 2 actions.'));
        if (choisi) x.push(ligne('Arrêt choisi', choisi));
        x.push(bouton(choisi ? 'Aller à ' + choisi : 'Choisis un arrêt', () => { envoyer('deplacerPolicier', { arret: local.choisi }); local.choisi = null; }, false, !choisi),
          r.specialite === 'patrouille' ? null : bouton('Rester ici', () => envoyer('deplacerPolicier', { arret: m.position }), true));
      } else if (monTourPolice) {
        x.push(h('div', { class: 'ligne' }, h('h2', {}, `Tes actions : ${t.actions}`), pastille('Sur ton arrêt ou un voisin', C.txt2)));
        const opt = (cle, titre, sous) => h('button', { type: 'button', class: 'option', 'aria-pressed': String(local.action === cle), clic: () => { local.action = cle; partie(); } }, h('b', {}, titre), h('span', {}, sous));
        x.push(h('div', { class: 'choix' }, opt('enqueter', 'Enquêter', r.specialite === 'enqueteurs' ? 'L’arrêt et ses voisins' : 'Chercher une trace'), opt('arreter', 'Arrêter', r.specialite === 'intervention' ? 'L’arrêt et ses voisins' : 'Si tu crois un fugitif là')));
        if (choisi) x.push(ligne('Arrêt visé', choisi));
        x.push(bouton(choisi ? (local.action === 'enqueter' ? 'Enquêter à ' : 'Arrêter à ') + choisi : 'Touche un arrêt cerclé',
          () => envoyer(local.action === 'enqueter' ? 'enqueter' : 'arreter', { arret: local.choisi }), false, !choisi),
          bouton('Finir mon tour', () => envoyer('finirTour'), true));
        if (r.corrompu) x.push(h('p', { class: 'petit' }, 'Tes arrestations sont annulées en secret.'));
      } else if (vue.phase === 'police') x.push(h('h2', {}, `L’équipe ${equipe(vue.equipeEnCours)[0]} joue`), h('p', { class: 'intro' }, t?.fini ? 'Tu as fini ton tour.' : 'Attends ton tour.'));
      else x.push(h('h2', {}, 'Les fugitifs se déplacent'), h('p', { class: 'intro' }, 'Prépare la suite avec ton équipe.'));

      // enquêtes privées et partage
      const mes = vue.enquetes || [];
      if (mes.length) x.push(h('div', { class: 'carte' }, h('h2', {}, 'Mes enquêtes · vues par moi seul'),
        h('p', { class: 'petit' }, r.corrompu ? 'Annonce-les à voix haute… ou mens pour égarer la police.' : 'Annonce-les à voix haute à la police.'),
        h('ul', { class: 'liste' }, mes.slice(-4).reverse().map(e => { const t = e.traces ? e.traces.length > 0 : e.trace;
          return h('li', { class: t ? 'res-trace' : '' }, e.traces
            ? `M${e.manche} · autour de ${nomArret(e.arret)} : ${e.traces.length ? 'TRACE à ' + e.traces.map(t => nomArret(t.arret) + ', manche ' + t.manche).join(' ; ') : 'rien'}`
            : `M${e.manche} · ${nomArret(e.arret)} : ${e.trace ? 'TRACE, manche ' + e.mancheTrace : 'rien'}`); }))));
    }
    if (vue.journal.length) x.push(h('ul', { class: 'liste' }, vue.journal.slice(-3).reverse().map(j => h('li', {}, `M${j.manche} · ${j.texte}`))));
    if (estCreateur()) x.push(forcer());
    return x;
  }

  // ---------- partie d'essai : voir l'écran de n'importe qui ----------
  function barreEssai() {
    let b = document.getElementById('essai');
    if (!vue.essai) { b?.remove(); document.body.classList.remove('essai-actif'); return; }
    document.body.classList.add('essai-actif');
    if (!b) { b = h('div', { id: 'essai', class: 'essai' }); document.body.append(b); }
    const libelle = j => j.nom + (j.role === 'fugitif' ? ' · fugitif' + (j.libre ? '' : ', arrêté') : j.role === 'policier' ? ' · ' + (j.corrompu ? 'corrompu, ' : '') + equipe(j.equipe)[0] : '');
    const choix = h('select', { 'aria-label': 'Voir l’écran de' }, h('option', { value: '' }, 'MJ · vue d’ensemble'), vue.essai.joueurs.map(j => h('option', { value: j.id }, libelle(j))));
    choix.value = vue.essai.comme || '';
    choix.addEventListener('change', () => envoyer('incarner', { joueur: choix.value || null }));
    b.replaceChildren(h('span', {}, 'Essai · écran de'), choix);
  }

  // ---------- maître du jeu : il voit tout ----------
  const nomRole = j => j.role === 'fugitif' ? 'Fugitif' : (j.corrompu ? 'Corrompu · ' : '') + 'équipe ' + equipe(j.equipe)[0] + (j.specialite ? ' · ' + SPE[j.specialite][0] : '');
  function rolesMJ() {
    const prets = vue.joueurs.filter(j => j.pret).length;
    afficher(h('section', { class: 'page' }, h('p', { class: 'sur' }, 'Maître du jeu'), h('h1', {}, 'Les rôles sont distribués'),
      h('p', { class: 'intro' }, 'Toi seul vois cette liste. Attends que tout le monde ait lu son rôle.'),
      h('div', { class: 'carte serree' }, vue.joueurs.map(j => h('div', { class: 'ligne' }, h('span', {}, (j.pret ? '✓ ' : '') + j.nom), h('span', { couleur: j.corrompu ? C.rouge : null }, nomRole(j))))),
      h('div', { class: 'pousse' }), h('p', { class: 'petit centre' }, 'Prêts : ' + prets + ' sur ' + vue.joueurs.length), forcer()));
  }
  function partieMJ() {
    if (!jeu) {
      const conteneur = h('div', { class: 'plan' });
      const racine = h('div', { class: 'jeu' }, conteneur);
      afficher(racine);
      const plan = Plan(conteneur, reseau);
      plan.surChoix(() => {});
      jeu = { racine, plan, barre: null, outils: null, panneau: null };
      plan.toutVoir();
    }
    jeu.plan.maj({
      objets: vue.objets || [], bloques: vue.bloques || [],
      police: vue.joueurs.filter(j => j.role === 'policier').map(j => ({ arret: j.position, coul: j.corrompu ? C.rouge : equipe(j.equipe)[1], lettre: equipe(j.equipe)[2] })),
      fugitifs: vue.joueurs.filter(j => j.role === 'fugitif').map(j => ({ arret: j.position, lettre: j.nom[0].toUpperCase(), libre: j.libre }))
    });
    const tour = vue.phase === 'fugitifs' ? ['Les fugitifs se déplacent', C.citron] : ['Au tour de l’équipe ' + equipe(vue.equipeEnCours)[0], equipe(vue.equipeEnCours)[1]];
    const barre = h('div', { class: 'barre' }, h('div', {}, h('p', { class: 'sur' }, 'MJ · manche ' + vue.manche + ' / ' + vue.reglages.manches), h('p', { class: 'tour', couleur: tour[1] }, tour[0])),
      h('span', { class: 'compteur', 'aria-label': 'Objets ramassés' }, vue.objetsRamasses + ' / ' + vue.reglages.objectif));
    const outils = h('div', { class: 'outils' }, h('button', { type: 'button', 'aria-label': 'Voir tout le réseau', clic: () => jeu.plan.toutVoir() }, '⤢'));
    // qui doit encore jouer
    const attente = vue.phase === 'fugitifs'
      ? vue.joueurs.filter(j => j.role === 'fugitif' && j.libre && !(vue.ontJoue || []).includes(j.id))
      : vue.joueurs.filter(j => j.role === 'policier' && j.equipe === vue.equipeEnCours && !(vue.finis || []).includes(j.id));
    const x = [h('h2', {}, attente.length ? 'On attend : ' + attente.map(j => j.nom).join(', ') : 'Tout le monde a joué')];
    x.push(h('div', { class: 'carte' }, h('h2', {}, 'Fugitifs'), vue.joueurs.filter(j => j.role === 'fugitif').map(j => ligne(j.nom, j.libre ? nomArret(j.position) + ' · ' + j.objets + ' objet' + (j.objets > 1 ? 's' : '') : 'arrêté'))));
    x.push(h('div', { class: 'carte' }, h('h2', {}, 'Corrompus'), vue.joueurs.filter(j => j.corrompu).map(j => ligne(j.nom, 'équipe ' + equipe(j.equipe)[0]))));
    if (vue.journal.length) x.push(h('ul', { class: 'liste' }, vue.journal.slice(-3).reverse().map(j => h('li', {}, 'M' + j.manche + ' · ' + j.texte))));
    x.push(forcer());
    jeu.barre?.remove(); jeu.outils?.remove(); jeu.panneau?.remove();
    jeu.barre = barre; jeu.outils = outils; jeu.panneau = h('section', { class: 'panneau', 'aria-label': 'Tableau du MJ' }, x);
    jeu.racine.append(barre, outils, jeu.panneau);
  }
  function accusationMJ() {
    const pol = vue.joueurs.filter(j => j.role === 'policier');
    afficher(h('section', { class: 'page' }, h('p', { class: 'sur' }, 'Maître du jeu'), h('h1', {}, 'La police vote'), h('p', { class: 'intro' }, vue.raison),
      h('p', { class: 'petit' }, 'Votes : ' + vue.votants.length + ' sur ' + pol.length),
      h('div', { class: 'carte' }, h('h2', {}, 'Les corrompus'), vue.joueurs.filter(j => j.corrompu).map(j => ligne(j.nom, 'équipe ' + equipe(j.equipe)[0]))),
      h('div', { class: 'pousse' }), forcer()));
  }

  function accusation() {
    const r = vue.role, x = [h('p', { class: 'sur' }, 'Fin de la partie'), h('h1', {}, r.role === 'policier' ? 'Qui est le traître ?' : 'La police délibère'),
      h('p', { class: 'intro' }, vue.raison)];
    if (r.role === 'policier' && vue.monVote === undefined) {
      x.push(h('p', { class: 'intro' }, 'Ton équipe désigne au plus un coéquipier. Démasquer un corrompu rapporte des points, accuser un innocent en fait perdre.'));
      const coeq = vue.joueurs.filter(j => j.role === 'policier' && j.equipe === r.equipe && j.id !== vue.moi);
      for (const j of coeq) x.push(bouton('Accuser ' + j.nom, () => envoyer('accuser', { cible: j.id }), true));
      x.push(bouton('Personne', () => envoyer('accuser', { cible: null }), true));
    } else x.push(h('p', { class: 'petit' }, `Votes : ${vue.votants.length} sur ${vue.joueurs.filter(j => j.role === 'policier').length}`));
    if (estCreateur()) x.push(h('div', { class: 'pousse' }), forcer());
    afficher(h('section', { class: 'page' }, x));
  }

  function fin() {
    const R = vue.resultat;
    const titre = R.gagnant === 'fugitifs' ? 'Les fugitifs s’échappent' : 'La police l’emporte';
    afficher(h('section', { class: 'page centre' }, h('p', { class: 'sur' }, `Manche ${vue.manche} · partie terminée`),
      h('h1', { class: 'titre-role', couleur: R.gagnant === 'fugitifs' ? C.citron : equipe(0)[1] }, titre), h('p', { class: 'intro' }, `${R.raison} ${R.objets} objets ramassés.`),
      h('div', { class: 'carte' }, h('h2', {}, 'Les corrompus'), R.equipes.filter(e => e.corrompu).map(e => ligne(`${joueur(e.corrompu).nom} · ${e.nom}`, e.demasque ? 'démasqué' : 'jamais démasqué'))),
      h('div', { class: 'carte' }, h('h2', {}, 'Points'), vue.joueurs.slice().sort((a, b) => R.points[b.id] - R.points[a.id]).map(j => ligne(`${j.nom} · ${j.role === 'fugitif' ? 'fugitif' : j.corrompu ? 'corrompu' : equipe(j.equipe)[0]}`, String(R.points[j.id])))),
      h('div', { class: 'pousse' }), bouton('Nouvelle partie', oublier)));
  }

  // ---------- démarrage ----------
  fetch('reseau.json').then(r => r.json()).then(d => {
    reseau = d; session = lireSession();
    if (session) { afficher(h('section', { class: 'page centre' }, h('p', { class: 'intro' }, 'Connexion à la partie…'))); connecter(); }
    else accueil();
  }).catch(() => message('Impossible de charger le plan.'));
})();
