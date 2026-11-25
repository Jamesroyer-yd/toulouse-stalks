// Toulouse Stalks · serveur Cloudflare.
// Une partie = un Durable Object, relié aux téléphones par WebSocket.
//   POST /api/creer      { nom }        → { code, jeton }
//   POST /api/rejoindre  { code, nom }  → { code, jeton }
//   GET  /api/partie/CODE/ws            → WebSocket ; premier message { type: 'auth', jeton }
// Sécurité : tout ce qui arrive est vérifié ici (taille, format, origine,
// cadence) puis par le moteur (règles, types, bornes). Le jeton secret ne
// passe jamais dans une adresse. Chaque joueur ne reçoit que sa propre vue.
import { DurableObject } from 'cloudflare:workers';
import reseau from '../public/reseau.json';
import * as M from './moteur.js';

const DUREE = 24 * 3600 * 1000;        // une partie s'efface 24 h après sa création
const TAILLE_MAX = 2048;               // octets par requête ou message
const CADENCE = { messages: 30, fenetre: 10_000 };   // 30 messages par 10 s et par connexion
const LETTRES = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // sans 0, O, 1, I : lisibles à voix haute
const FORMAT_CODE = /^[A-HJ-NP-Z2-9]{5}$/;
const FORMAT_JETON = /^[0-9a-f]{64}$/;

const ENTETES = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (d, statut = 200) => new Response(JSON.stringify(d), { status: statut, headers: ENTETES });
const hexa = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const nouveauCode = () => [...crypto.getRandomValues(new Uint8Array(5))].map(b => LETTRES[b % LETTRES.length]).join('');

async function lireCorps(req) {
  if (req.method !== 'POST') return null;
  if (!(req.headers.get('content-type') || '').startsWith('application/json')) return null;
  const texte = await req.text();
  if (texte.length > TAILLE_MAX) return null;
  try { const o = JSON.parse(texte); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch { return null; }
}
// les requêtes doivent venir du site lui-même
const memeOrigine = (req, url) => { const o = req.headers.get('origin'); return !o || o === url.origin; };

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (!memeOrigine(req, url)) return json({ erreur: 'Origine refusée.' }, 403);
    const ip = req.headers.get('cf-connecting-ip') || 'local';
    if (env.LIMITE_API && !(await env.LIMITE_API.limit({ key: ip })).success) return json({ erreur: 'Trop de requêtes, patiente un peu.' }, 429);

    if (url.pathname === '/api/creer') {
      if (env.LIMITE_CREATION && !(await env.LIMITE_CREATION.limit({ key: ip })).success) return json({ erreur: 'Trop de parties créées, patiente un peu.' }, 429);
      const corps = await lireCorps(req); if (!corps) return json({ erreur: 'Requête invalide.' }, 400);
      for (let essai = 0; essai < 5; essai++) {
        const code = nouveauCode();
        const rep = await salle(env, code).fetch('https://partie/creer', { method: 'POST', body: JSON.stringify({ code, nom: corps.nom, mj: corps.mj === true, essai: Number.isInteger(corps.essai) ? corps.essai : 0 }) });
        if (rep.status !== 409) return rep;
      }
      return json({ erreur: 'Réessaie dans un instant.' }, 503);
    }
    if (url.pathname === '/api/rejoindre') {
      const corps = await lireCorps(req); if (!corps) return json({ erreur: 'Requête invalide.' }, 400);
      const code = typeof corps.code === 'string' ? corps.code.toUpperCase().trim() : '';
      if (!FORMAT_CODE.test(code)) return json({ erreur: 'Code de partie invalide.' }, 400);
      return salle(env, code).fetch('https://partie/rejoindre', { method: 'POST', body: JSON.stringify({ nom: corps.nom }) });
    }
    const m = url.pathname.match(/^\/api\/partie\/([A-Z0-9]{5})\/ws$/);
    if (m && FORMAT_CODE.test(m[1])) {
      if (req.headers.get('upgrade') !== 'websocket') return json({ erreur: 'WebSocket attendu.' }, 426);
      if (req.headers.get('origin') !== url.origin) return json({ erreur: 'Origine refusée.' }, 403);
      return salle(env, m[1]).fetch(req);
    }
    return json({ erreur: 'Introuvable.' }, 404);
  }
};
const salle = (env, code) => env.PARTIES.get(env.PARTIES.idFromName(code));

export class Partie extends DurableObject {
  async fetch(req) {
    const action = new URL(req.url).pathname.split('/').pop();
    if (action === 'ws') return this.ouvrir();
    const corps = JSON.parse(await req.text());
    const p = await this.ctx.storage.get('partie');
    try {
      if (action === 'creer') {
        if (p) return json({ erreur: 'code pris' }, 409);
        const id = hexa(8), jeton = hexa(32);
        const partie = M.nouvellePartie(corps.code, id, corps.nom, corps.mj === true, Number.isInteger(corps.essai) ? corps.essai : 0);
        await this.ctx.storage.put({ partie, jetons: { [jeton]: id } });
        await this.ctx.storage.setAlarm(Date.now() + DUREE);
        return json({ code: corps.code, jeton });
      }
      if (action === 'rejoindre') {
        if (!p) return json({ erreur: 'Partie introuvable.' }, 404);
        const id = hexa(8), jeton = hexa(32);
        M.rejoindre(p, id, corps.nom);
        const jetons = await this.ctx.storage.get('jetons');
        jetons[jeton] = id;
        await this.ctx.storage.put({ partie: p, jetons });
        this.diffuser(p);
        return json({ code: p.code, jeton });
      }
    } catch (e) { return json({ erreur: e instanceof M.Erreur ? e.message : 'Erreur.' }, 400); }
    return json({ erreur: 'Introuvable.' }, 404);
  }

  ouvrir() {
    const [client, serveur] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(serveur);
    serveur.serializeAttachment({ id: null, compte: 0, debut: Date.now(), ouvert: Date.now() });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, brut) {
    const a = ws.deserializeAttachment() || {};
    // cadence : au-delà de 30 messages en 10 s, la connexion est coupée
    const maintenant = Date.now();
    if (maintenant - a.debut > CADENCE.fenetre) { a.debut = maintenant; a.compte = 0; }
    if (++a.compte > CADENCE.messages) return ws.close(1008, 'Trop de messages');
    ws.serializeAttachment(a);
    if (typeof brut !== 'string' || brut.length > TAILLE_MAX) return ws.close(1009, 'Message trop long');
    let msg; try { msg = JSON.parse(brut); } catch { return this.erreur(ws, 'Message illisible.'); }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.type !== 'string') return this.erreur(ws, 'Message illisible.');

    const p = await this.ctx.storage.get('partie');
    if (!p) return ws.close(1008, 'Partie introuvable');

    if (msg.type === 'auth') {
      if (typeof msg.jeton !== 'string' || !FORMAT_JETON.test(msg.jeton)) return ws.close(1008, 'Jeton invalide');
      const jetons = await this.ctx.storage.get('jetons');
      const id = Object.hasOwn(jetons, msg.jeton) ? jetons[msg.jeton] : null;
      if (!id) return ws.close(1008, 'Jeton inconnu');
      a.id = id; ws.serializeAttachment(a);
      return ws.send(JSON.stringify({ type: 'vue', vue: this.vuePour(p, a) }));
    }
    if (!a.id) return ws.close(1008, 'Non identifié');

    // partie d'essai : le MJ choisit le joueur dont il voit l'écran et prend la place
    if (msg.type === 'incarner') {
      try { a.comme = M.incarnation(p, a.id, msg.joueur ?? null); } catch (e) { return this.erreur(ws, e instanceof M.Erreur ? e.message : 'Action impossible.'); }
      ws.serializeAttachment(a);
      return ws.send(JSON.stringify({ type: 'vue', vue: this.vuePour(p, a) }));
    }

    try {
      // en essai, les actions du MJ incarné partent au nom du faux joueur
      const acteur = p.essai && a.comme && M.estMJ(p, a.id) ? a.comme : a.id;
      const r = this.jouer(p, acteur, msg);
      await this.ctx.storage.put('partie', p);
      if (r !== undefined) ws.send(JSON.stringify({ type: 'retour', action: msg.type, resultat: r }));
      this.diffuser(p);
    } catch (e) {
      if (e instanceof M.Erreur) return this.erreur(ws, e.message);
      console.error(e); return this.erreur(ws, 'Action impossible.');
    }
  }

  // liste fermée d'actions : rien d'autre n'atteint le moteur
  jouer(p, id, msg) {
    switch (msg.type) {
      case 'regler': return M.regler(p, id, msg.reglages);
      case 'lancer': return M.lancer(p, id, reseau);
      case 'pret': return M.pret(p, id);
      case 'deplacerFugitif': return M.deplacerFugitif(p, id, msg.arret, reseau);
      case 'deplacerPolicier': return M.deplacerPolicier(p, id, msg.arret, reseau);
      case 'enqueter': return M.enqueter(p, id, msg.arret, reseau);
      case 'arreter': return M.arreter(p, id, msg.arret, reseau);
      case 'finirTour': return M.finirTour(p, id);
      case 'forcer': return M.forcerSuite(p, id);
      case 'accuser': return M.accuser(p, id, msg.cible ?? null);
      default: throw new M.Erreur('Action inconnue.');
    }
  }

  diffuser(p) {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a?.id) try { ws.send(JSON.stringify({ type: 'vue', vue: this.vuePour(p, a) })); } catch {}
    }
  }
  // vue envoyée à une connexion : la sienne, ou celle du faux joueur incarné en essai
  vuePour(p, a) {
    const essaiMJ = p.essai && M.estMJ(p, a.id);
    const v = M.vue(p, essaiMJ && a.comme ? a.comme : a.id);
    if (essaiMJ) v.essai = { comme: a.comme || null, joueurs: M.listeEssai(p), createur: a.id };
    return v;
  }
  erreur(ws, message) { try { ws.send(JSON.stringify({ type: 'erreur', message })); } catch {} }
  webSocketClose(ws, code) { try { ws.close(code, 'Fin'); } catch {} }
  async alarm() { for (const ws of this.ctx.getWebSockets()) try { ws.close(1001, 'Partie expirée'); } catch {} await this.ctx.storage.deleteAll(); }
}
