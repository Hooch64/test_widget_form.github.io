'use strict';
/* Widget Grist « Formulaire de demande de téléservice » — écrit dans la table Demandes (sas de validation) */
const CFG = {
  title: 'Nouvelle demande de téléservice',
  subtitle: 'Les champs marqués d’un astérisque sont obligatoires. Votre demande sera vérifiée avant intégration au référentiel.',
  table: '',      // vide = table de la section du widget (Demandes)
  dirParent: ''   // colonne « DG » de la table Directions ; vide = détection automatique
};
// a = noms de colonnes acceptés (sans accents ni espaces) ; add = ajout d'une nouvelle valeur autorisé
const FIELDS = [
  {k:'titreTech', l:'Titre technique', a:['titretechnique'], req:1, max:60},
  {k:'titre', l:'Titre public', a:['titrepublic'], max:60},
  {k:'url', l:'URL publique', a:['urlpublique','url'], url:1, ph:'https://…'},
  {k:'desc', l:'Description', a:['description'], req:1, max:150, area:1},
  {k:'statut', l:'Statut', a:['statut'], req:1},
  {k:'collectivite', l:'Collectivité', a:['collectivite'], req:1, single:1}, // single : liste déroulante même si la colonne est un choix multiple
  {k:'thematique', l:'Thématique', a:['thematique'], req:1},
  {k:'instance', l:'Instance Publik', a:['instancepublik','instance'], req:1},
  {k:'dg', l:'DG propriétaire', a:['dgproprietaire'], req:1},
  {k:'dir', l:'Direction propriétaire', a:['directionproprietaire'], req:1},
  {k:'referent', l:'Référent métier', a:['referentmetier'], req:1, add:1, fmt:1, ph:'Prénom NOM', h:'Choisissez dans la liste ou saisissez un nouveau nom (Prénom NOM) puis Entrée.'},
  {k:'mcoEntite', l:'Entité en charge du MCO', a:['entiteenchargedumco','entitemco'], req:1},
  {k:'mcoResp', l:'Responsable MCO', a:['responsablemco'], req:1},
  {k:'date', l:'Date d’ouverture', a:['datedouverture','dateouverture'], req:1},
  {k:'dateFin', l:'Date d’arrêt', a:['datedarret','datearret']},
  {k:'volMens', l:'Volumétrie mensuelle', a:['volumetriemensuelle']},
  {k:'volAnn', l:'Volumétrie annuelle', a:['volumetrieannuelle']},
  {k:'usagers', l:'Usagers visés', a:['usagersvises'], req:1},
  {k:'type', l:'Type de la démarche', a:['typedelademarche','typedemarche'], req:1},
  {k:'categorie', l:'Catégorie', a:['categorie'], req:1},
  {k:'paiement', l:'Paiement en ligne', a:['paiementenligne'], req:1},
  {k:'heberg', l:'Mode d’hébergement', a:['modedhebergement','modehebergement'], req:1},
  {k:'progiciel', l:'Progiciel support', a:['progicielsupport'], add:1},
  {k:'editeur', l:'Raison sociale éditeur', a:['raisonsocialediteur','raisonsocialeediteur','editeur'], add:1},
  {k:'appMetier', l:'Application métier', a:['applicationmetier'], add:1}
];
const SECT = [
  ['Identification', [['titreTech',6],['titre',6],['url',12],['desc',12]]],
  ['Classification', [['statut',3],['collectivite',3],['thematique',3],['instance',3]]],
  ['Rattachement', [['dg',6],['dir',6]]],
  ['Responsabilités', [['referent',6],['mcoEntite',3],['mcoResp',3]]],
  ['Calendrier et volumétrie', [['date',3],['dateFin',3],['volMens',3],['volAnn',3]]],
  ['Démarche', [['usagers',12],['type',5],['categorie',4],['paiement',3]]],
  ['Technique', [['heberg',3],['progiciel',3],['editeur',3],['appMetier',3]]]
];
const VERSION = 'v3';
const FM = Object.fromEntries(FIELDS.map(f => [f.k, f]));
const COL = {}, OPT = {}, V = {}, E = {}, T = {}, O = {};
let TID = '', DIRS = [], PC = null, DONE = null, BUSY = false;

const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const rows = t => { const ks = Object.keys(t); return (t.id || []).map((_, i) => Object.fromEntries(ks.map(c => [c, t[c][i]]))); };
const empty = v => v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
const known = (k, x) => (OPT[k] || []).some(o => o.v === x);
const okNom = s => /^\S+(\s+\S+)+$/.test(s) && /(^|\s)[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ'’-]+(\s|$)/.test(s);

function kind(f) {
  const c = COL[f.k]; if (!c) return 'none';
  const t = c.type;
  if (t.startsWith('Ref:')) return 'ref';
  if (t === 'ChoiceList') return f.single ? 'select' : f.add ? 'tags' : 'pills';
  if (t === 'Choice') return f.add ? 'combo' : 'select';
  if (t === 'Date') return 'date';
  return f.area ? 'area' : 'text';
}

async function init() {
  grist.ready({requiredAccess: 'full'});
  try {
    TID = CFG.table;
    if (!TID) { try { TID = await grist.selectedTable.getTableId(); } catch (e) { TID = 'Demandes'; } }
    const [tt, tc] = await Promise.all([grist.docApi.fetchTable('_grist_Tables'), grist.docApi.fetchTable('_grist_Tables_column')]);
    const TB = rows(tt), CL = rows(tc), byId = new Map(CL.map(c => [c.id, c]));
    const trow = TB.find(t => t.tableId === TID);
    if (!trow) throw new Error('Table « ' + TID + ' » introuvable.');
    const cols = CL.filter(c => c.parentId === trow.id && !/^gristHelper_|^manualSort$/.test(c.colId));
    FIELDS.forEach(f => {
      const names = [norm(f.l), ...f.a];
      const c = cols.find(c => names.includes(norm(c.colId)) || names.includes(norm(c.label)));
      if (c) { let wo = {}; try { wo = JSON.parse(c.widgetOptions || '{}'); } catch (e) {} COL[f.k] = {...c, wo}; }
    });
    for (const f of FIELDS) {
      const c = COL[f.k]; if (!c) continue;
      if (c.type.startsWith('Choice')) OPT[f.k] = (c.wo.choices || []).map(x => ({v: x, l: x}));
      else if (c.type.startsWith('Ref:')) {
        const tgt = c.type.slice(4), t = await grist.docApi.fetchTable(tgt);
        const lc = (byId.get(c.visibleCol) || {}).colId || Object.keys(t).find(x => !['id','manualSort'].includes(x) && !x.startsWith('gristHelper_'));
        const idx = new Map(t.id.map((id, i) => [id, i]));
        OPT[f.k] = t.id.map((id, i) => ({v: id, l: String((t[lc] || [])[i] ?? '')})).sort((a, b) => a.l.localeCompare(b.l, 'fr'));
        if (f.k === 'dir') {
          const dgT = COL.dg && COL.dg.type.startsWith('Ref:') ? COL.dg.type : null, tr = TB.find(x => x.tableId === tgt);
          PC = CFG.dirParent || ((CL.find(x => x.parentId === tr.id && x.type === dgT) || {}).colId) || null;
          DIRS = OPT.dir.map(o => ({...o, p: PC ? t[PC][idx.get(o.v)] : null}));
        }
      }
    }
    console.log('[formulaire ' + VERSION + ']', Object.fromEntries(FIELDS.map(f => [f.k, COL[f.k] ? COL[f.k].colId + ' (' + COL[f.k].type + ') -> ' + kind(f) : 'introuvable'])));
    resetForm();
  } catch (e) {
    $('#app').innerHTML = `<div class="bn"><b>Impossible de charger le formulaire.</b><br>${esc(e.message || e)}<br>Vérifiez que le widget est sur la table Demandes avec l’accès « Accès complet au document ».</div>`;
  }
}

function resetForm() {
  Object.keys(V).forEach(k => delete V[k]); Object.keys(E).forEach(k => delete E[k]); Object.keys(T).forEach(k => delete T[k]);
  FIELDS.forEach(f => { const kd = kind(f); V[f.k] = ['pills', 'tags'].includes(kd) ? [] : ''; });
  DONE = null; BUSY = false; render();
}

function ctl(f) {
  const k = f.k, kd = kind(f), v = V[k];
  if (kd === 'none') return '<span class="nr">Colonne introuvable dans la table</span>';
  if (kd === 'text' || kd === 'date')
    return `<input type="${kd === 'date' ? 'date' : 'text'}" data-k="${k}" value="${esc(v)}"${f.max ? ` maxlength="${f.max}"` : ''}${f.ph ? ` placeholder="${esc(f.ph)}"` : ''}>`;
  if (kd === 'area') return `<textarea data-k="${k}" rows="3" maxlength="${f.max}">${esc(v)}</textarea>`;
  if (kd === 'select' || kd === 'ref') {
    const isDir = k === 'dir', opts = isDir ? DIRS.filter(d => !PC || d.p === V.dg) : OPT[k];
    const ph = isDir && !V.dg ? 'Choisir d’abord une DG' : isDir && !opts.length ? 'Aucune direction pour cette DG' : 'Sélectionner…';
    return `<select data-k="${k}"${isDir && !V.dg ? ' disabled' : ''}><option value="">${ph}</option>${opts.map(o =>
      `<option value="${esc(o.v)}"${String(o.v) === String(v) ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}</select>`;
  }
  if (kd === 'pills') return `<div class="pl">${OPT[k].map(o => `<button type="button" class="pill${v.includes(o.v) ? ' on' : ''}" data-a="pill" data-k="${k}" data-v="${esc(o.v)}" aria-pressed="${v.includes(o.v)}">${esc(o.l)}</button>`).join('')}</div>`;
  const arr = kd === 'combo' ? (v ? [v] : []) : v;
  const ph = f.ph ? (arr.length ? 'Ajouter un autre…' : f.ph) : 'Choisir ou saisir une nouvelle valeur';
  return `<div class="tg"><div class="tc">${arr.map(x => { const kn = known(k, x); return `<span class="ck${kn ? '' : ' new'}">${esc(x)}${kn ? '' : '<i>nouveau</i>'}<button type="button" data-a="rm" data-k="${k}" data-v="${esc(x)}" aria-label="Retirer">✕</button></span>`; }).join('')}${kd === 'combo' && arr.length ? '' :
    `<input class="tin" type="text" data-t="${k}" value="${esc(T[k] || '')}" placeholder="${esc(ph)}" autocomplete="off">`}</div><div class="sg" id="sg-${k}" hidden></div></div>`;
}

function drawCtl(k, focus) {
  $('#c-' + k).innerHTML = ctl(FM[k]);
  const i = $('#c-' + k + ' .tin');
  if (i && focus) { i.focus(); O[k] = true; drawSg(k); }
  prog();
}

function drawSg(k) {
  const el = $('#sg-' + k); if (!el) return;
  const q = norm(T[k] || ''), t = (T[k] || '').trim(), taken = [].concat(V[k] || []);
  const list = OPT[k].filter(o => !taken.includes(o.v) && (!q || norm(o.l).includes(q))).slice(0, 60);
  const add = t && !OPT[k].some(o => norm(o.v) === norm(t)) && !taken.some(x => norm(x) === norm(t));
  el.innerHTML = (add ? `<button type="button" class="ad" data-a="sg" data-k="${k}" data-v="${esc(t)}">Ajouter « ${esc(t)} »</button>` : '') +
    list.map(o => `<button type="button" data-a="sg" data-k="${k}" data-v="${esc(o.v)}">${esc(o.l)}</button>`).join('');
  el.hidden = !(O[k] && el.innerHTML);
}

function addVal(k, val, focus) {
  const f = FM[k]; val = String(val).trim().replace(/\s+/g, ' ');
  if (!val) return;
  const o = OPT[k].find(o => norm(o.v) === norm(val)); if (o) val = o.v;
  if (!known(k, val) && f.fmt && !okNom(val)) return setErr(k, 'Format attendu : Prénom NOM (ex. Marie DUPONT)');
  if (!known(k, val) && val.length > 60) return setErr(k, '60 caractères maximum');
  if (kind(f) === 'combo') V[k] = val; else if (!V[k].includes(val)) V[k].push(val);
  T[k] = ''; setErr(k, ''); drawCtl(k, focus);
}

function setErr(k, msg) {
  E[k] = msg; const e = $('#er-' + k), d = $('#fd-' + k);
  if (e) e.textContent = msg || '';
  if (d) d.classList.toggle('bad', !!msg);
}

function check(f) {
  const k = f.k, v = V[k];
  if (!COL[k]) return '';
  if (empty(v)) return f.req ? 'Champ obligatoire' : '';
  if (f.url && !/^https?:\/\/[^\s.]+\.\S+$/i.test(v)) return 'URL invalide (ex. https://exemple.fr/…)';
  if (f.fmt && Array.isArray(v) && v.some(x => !known(k, x) && !okNom(x))) return 'Format attendu : Prénom NOM';
  if (k === 'dateFin' && V.date && v < V.date) return 'Doit être postérieure à la date d’ouverture';
  return '';
}

function prog() {
  const r = FIELDS.filter(f => f.req && COL[f.k]);
  const n = r.filter(f => !empty(V[f.k])).length, el = $('#prog');
  if (el) el.textContent = `${n} / ${r.length} champs obligatoires renseignés`;
}

function counter(k) { const c = $('#ct-' + k), f = FM[k]; if (c && f.max) c.textContent = `${(V[k] || '').length}/${f.max}`; }

function render() {
  const app = $('#app');
  if (DONE !== null) {
    app.innerHTML = `<div class="ok"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="23"/><path d="M15 27l8 8 14-16"/></svg>
      <h1>Demande envoyée</h1><p class="mu">« ${esc(DONE)} » a été transmise et sera vérifiée avant son intégration au référentiel.</p>
      <button class="btn" data-a="again">Saisir une autre demande</button></div>`;
    return;
  }
  const miss = FIELDS.filter(f => !COL[f.k]).map(f => f.l);
  app.innerHTML = `<header><h1>${esc(CFG.title)}</h1><p class="mu">${esc(CFG.subtitle)}</p></header>
    ${miss.length ? `<div class="bn"><b>Colonnes introuvables dans « ${esc(TID)} »</b> : ${esc(miss.join(', '))}. Vérifiez leur nom dans la table.</div>` : ''}
    ${SECT.map(([t, fs]) => `<section class="sc"><h3>${t}</h3><div class="mg">${fs.map(([k, s]) => { const f = FM[k];
      return `<div class="fd" id="fd-${k}" style="--s:${s}"><label><span>${esc(f.l)}${f.req ? '<b>*</b>' : ''}</span>${f.max ? `<span class="ct" id="ct-${k}">0/${f.max}</span>` : ''}</label>
      <div id="c-${k}">${ctl(f)}</div>${f.add && COL[k] ? `<p class="hn">${esc(f.h || 'Choisissez dans la liste ou saisissez une nouvelle valeur.')}</p>` : ''}<p class="er" id="er-${k}"></p></div>`; }).join('')}</div></section>`).join('')}
    <footer class="ft"><span class="mu" id="prog"></span><span id="msg" role="alert"></span><small class="mu">${VERSION}</small>
    <button type="button" class="gh" data-a="reset">Réinitialiser</button><button type="button" class="btn" id="go" data-a="submit">Envoyer la demande</button></footer>`;
  FIELDS.forEach(f => counter(f.k)); prog();
}

function encode(c, v) {
  const t = c.type;
  if (t.startsWith('ChoiceList') || t.startsWith('RefList')) return ['L', ...[].concat(v)];
  if (t.startsWith('Ref:')) return +v;
  if (t === 'Date') { const [y, m, d] = v.split('-').map(Number); return Date.UTC(y, m - 1, d) / 1000; }
  if (Array.isArray(v)) return v.join(', ');
  return typeof v === 'string' ? v.trim() : v;
}

async function submit() {
  if (BUSY) return;
  FIELDS.forEach(f => { if (['tags', 'combo'].includes(kind(f)) && (T[f.k] || '').trim()) addVal(f.k, T[f.k], false); });
  let first = null;
  FIELDS.forEach(f => { const m = E[f.k] && !empty(T[f.k]) ? E[f.k] : check(f); setErr(f.k, m); if (m && !first) first = f.k; });
  const msg = $('#msg');
  if (first) { msg.textContent = 'Certains champs sont à corriger.'; $('#fd-' + first).scrollIntoView({behavior: 'smooth', block: 'center'}); return; }
  msg.textContent = '';
  const fields = {};
  FIELDS.forEach(f => { const c = COL[f.k]; if (c && !empty(V[f.k])) fields[c.colId] = encode(c, V[f.k]); });
  BUSY = true; $('#go').disabled = true; $('#go').textContent = 'Envoi…';
  try {
    await grist.getTable(TID).create({fields});
    DONE = V.titre || V.titreTech; BUSY = false; render();
  } catch (err) {
    BUSY = false; $('#go').disabled = false; $('#go').textContent = 'Envoyer la demande';
    msg.textContent = 'Échec de l’envoi : ' + (err.message || err);
  }
}

document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.t) {
    const k = t.dataset.t; T[k] = t.value; O[k] = true;
    if (/[;,]$/.test(t.value) && kind(FM[k]) === 'tags') { T[k] = t.value.slice(0, -1); addVal(k, T[k], true); return; }
    drawSg(k); return;
  }
  const k = t.dataset.k; if (!k || t.tagName === 'SELECT') return;
  V[k] = t.value; if (E[k]) setErr(k, ''); counter(k); prog();
});
document.addEventListener('change', e => {
  const t = e.target, k = t.dataset.k; if (!k || t.tagName !== 'SELECT') return;
  V[k] = t.value === '' ? '' : (kind(FM[k]) === 'ref' ? +t.value : t.value);
  setErr(k, '');
  if (k === 'dg') { V.dir = ''; setErr('dir', ''); if (COL.dir) drawCtl('dir'); }
  prog();
});
document.addEventListener('keydown', e => {
  const k = e.target.dataset && e.target.dataset.t; if (!k) return;
  if (e.key === 'Enter') { e.preventDefault(); if ((T[k] || '').trim()) addVal(k, T[k], true); }
  else if (e.key === 'Backspace' && !T[k]) { if (Array.isArray(V[k]) && V[k].length) { V[k].pop(); drawCtl(k, true); } else if (V[k]) { V[k] = ''; drawCtl(k, true); } }
  else if (e.key === 'Escape') { O[k] = false; drawSg(k); }
});
document.addEventListener('focusin', e => { const k = e.target.dataset && e.target.dataset.t; if (k) { O[k] = true; drawSg(k); } });
document.addEventListener('focusout', e => {
  const k = e.target.dataset && e.target.dataset.t; if (!k) return;
  const to = e.relatedTarget;
  if (to && to.closest && to.closest('#fd-' + k)) return;
  O[k] = false; drawSg(k);
  if ((T[k] || '').trim() && !(kind(FM[k]) === 'combo' && V[k])) addVal(k, T[k], false);
});
document.addEventListener('mousedown', e => { if (e.target.closest && e.target.closest('.sg')) e.preventDefault(); });
document.addEventListener('click', e => {
  const t = e.target.closest('[data-a]'); if (!t) return;
  const a = t.dataset.a, k = t.dataset.k, v = t.dataset.v;
  if (a === 'pill') { const i = V[k].indexOf(v); i < 0 ? V[k].push(v) : V[k].splice(i, 1); setErr(k, ''); drawCtl(k); }
  else if (a === 'sg') addVal(k, v, true);
  else if (a === 'rm') { V[k] = kind(FM[k]) === 'combo' ? '' : V[k].filter(x => x !== v); setErr(k, ''); drawCtl(k, true); }
  else if (a === 'submit') submit();
  else if (a === 'reset' || a === 'again') resetForm();
});

init();