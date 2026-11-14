// Roles, auto-mapping, joining queries ↔ agents ↔ cards ↔ grounding, and saved mapping presets.
(() => {
  const { parseJSON, looksLikeCard, normalizeCard, baseName, isUrl, isFileRef, splitMulti, slug } = EL;

  const ROLES = [
    { k: "query", band: "Queries", t: "Query text", d: "One row per test query / utterance.", req: 1, q: 1 },
    { k: "qAgent", band: "Queries", t: "Query → agent", d: "Agent / plugin id(s) each query belongs to.", req: 1, q: 1, split: 1 },
    { k: "qId", band: "Queries", t: "Query id", d: "Optional stable id, shown on each row.", q: 1 },
    { k: "card", band: "Agents", t: "Agent card / manifest", d: "A JSON column — or drop uploaded .json card files here.", docs: "json" },
    { k: "cardKey", band: "Agents", t: "Card key", d: "Matches cards to agents (an id or card file-name column). Not needed when the card sits on the query row." },
    { k: "agentLabel", band: "Agents", t: "Agent display name", d: "Optional friendly name when there's no card." },
    { k: "cardExtra", band: "Agents", t: "Extra card fields", d: "More agent-level columns shown on the card.", multi: 1 },
    { k: "qSkill", band: "Agents", t: "Query → expected skill", d: "Optional. Lights up per-skill query counts on the card.", q: 1 },
    { k: "grounding", band: "Grounding & view", t: "Grounding", d: "Columns with file names, URLs or inline content — or drop grounding files here.", multi: 1, q: 1, docs: "any", mode: 1 },
    { k: "facets", band: "Grounding & view", t: "Filters", d: "Columns to slice by in the top bar.", multi: 1, q: 1 },
    { k: "rowcols", band: "Grounding & view", t: "Query row columns", d: "Shown in the query table; add / reorder any column later.", multi: 1, q: 1 }
  ];
  const GMODES = [["auto", "Auto-detect per cell"], ["file", "Cell names a file → match uploaded docs"], ["url", "Cell is a link (URL)"], ["inline", "Cell contains the content (md / html / aspx)"]];

  const newMap = () => ({ ...Object.fromEntries(ROLES.map(r => [r.k, []])), opt: { gmode: "auto", split: false } });
  const norm = s => String(s ?? "").trim().toLowerCase();
  const srcOf = (st, ref) => ref && ref.s ? st.sources.find(s => s.id === ref.s) : null;
  const colOf = (st, ref) => srcOf(st, ref)?.columns.find(c => c.name === ref.c);
  const querySource = (st, M) => srcOf(st, M.query[0]);

  // ---------- join ----------
  function build(st, M) {
    const qsrc = querySource(st, M);
    const out = { qsrc, queries: [], agents: new Map(), stats: {}, warnings: [], cardSrc: null };
    if (!qsrc) return out;
    const val = (row, ref) => ref ? String(row[ref.c] ?? "") : "";
    const qCol = M.query[0], aCol = M.qAgent[0], idCol = M.qId[0];
    const docsByBase = new Map(), docsBySlug = new Map();
    st.docs.forEach(d => { if (!docsByBase.has(d.base)) docsByBase.set(d.base, d); if (!docsBySlug.has(d.slug)) docsBySlug.set(d.slug, d); });
    const findDoc = name => docsByBase.get(norm(name)) || docsBySlug.get(slug(name)) || null;
    const agentOf = key => {
      const k = norm(key); if (!k) return null;
      if (!out.agents.has(k)) out.agents.set(k, { key: String(key).trim(), k, label: null, card: null, extras: {}, qs: [], docs: [] });
      return out.agents.get(k);
    };

    // queries
    const gCols = M.grounding.filter(r => r.s && r.s === qsrc.id);
    qsrc.rows.forEach((row, i) => {
      const text = val(row, qCol); if (!text.trim()) return;
      const keys = aCol ? (M.opt.split ? splitMulti(val(row, aCol)) : [val(row, aCol).trim()].filter(Boolean)) : [];
      const q = { i: out.queries.length, row, text, id: idCol ? val(row, idCol) : String(i + 1), keys, grefs: [], inline: [] };
      gCols.forEach(ref => groundingRefs(val(row, ref), ref.c, M.opt.gmode, findDoc, q));
      out.queries.push(q);
      keys.forEach(k => agentOf(k).qs.push(q));
    });
    if (!aCol) { const a = agentOf("(all queries)"); out.queries.forEach(q => { q.keys = ["(all queries)"]; a.qs.push(q); }); }

    // cards
    const cardRef = M.card[0];
    if (cardRef?.s) {
      const csrc = srcOf(st, cardRef); out.cardSrc = csrc;
      const keyRef = M.cardKey.find(r => r.s === csrc.id);
      if (csrc.id === qsrc.id && !keyRef) {
        out.queries.forEach(q => { const cell = val(q.row, cardRef); if (!cell.trim()) return;
          const cands = q.keys.map(k => out.agents.get(norm(k))).filter(Boolean); const p = parseJSON(cell);
          const target = (p.ok && cands.length > 1 ? matchAgentByCard(new Map(cands.map(a => [a.k, a])), p.v) : null) || cands.find(a => !a.card?.ok);
          if (target && !target.card?.ok) setCard(target, cell, `${csrc.label} › ${cardRef.c}`); });
      } else {
        csrc.rows.forEach(row => { const cell = val(row, cardRef); if (!cell.trim()) return;
          const p = parseJSON(cell); let key = keyRef ? val(row, keyRef) : null;
          if (!key && p.ok) key = matchAgentByCard(out.agents, p.v)?.key || p.v.name || p.v.id || p.v.name_for_human;
          if (!key) return; const a = agentOf(key); if (!a.card?.ok) setCard(a, cell, `${csrc.label} › ${cardRef.c}`); });
      }
    } else if (cardRef?.d) {
      const cardDocs = st.docs.filter(d => d.kind === "json");
      const fileRef = M.cardKey.find(r => r.s === qsrc.id);
      out.agents.forEach(a => {
        let doc = null;
        if (fileRef) { const fn = a.qs.map(q => val(q.row, fileRef)).find(v => v.trim()); if (fn) doc = findDoc(baseName(fn)); }
        doc ||= cardDocs.find(d => d.slug === slug(a.key)) || cardDocs.find(d => d.json && [d.json.name, d.json.id, d.json.name_for_human, d.json.namespace].some(x => x && slug(x) === slug(a.key)));
        if (doc) setCard(a, doc.text, doc.name);
      });
      cardDocs.filter(d => d.isCard && ![...out.agents.values()].some(a => a.card?.from === d.name)).forEach(d => {
        const a = agentOf(d.json.name || d.json.name_for_human || d.name); if (!a.card) setCard(a, d.text, d.name); });
    }

    // agent-level fields (first non-empty per agent, from card source or query rows)
    const agentVal = (a, ref) => {
      if (ref.s === qsrc.id) return a.qs.map(q => val(q.row, ref)).find(v => v.trim()) || "";
      const s = srcOf(st, ref), keyRef = M.cardKey.find(r => r.s === ref.s); if (!s) return "";
      const row = keyRef ? s.rows.find(r => norm(r[keyRef.c]) === a.k) : null; return row ? val(row, ref) : "";
    };
    out.agents.forEach(a => {
      if (M.agentLabel[0]) a.label = agentVal(a, M.agentLabel[0]) || null;
      M.cardExtra.forEach(ref => { a.extras[ref.c] = agentVal(a, ref); });
    });

    // agent-level grounding docs (dropped files)
    const agentDocs = M.grounding.filter(r => r.d).flatMap(r => r.d === "docs:all" ? st.docs.filter(d => d.kind !== "json") : st.docs.filter(d => d.id === r.d));
    if (agentDocs.length) out.agents.forEach(a => { const s = slug(a.key); a.docs = agentDocs.filter(d => d.slug.includes(s) || (s.length > 3 && s.includes(d.slug))); });

    // stats
    const all = [...out.agents.values()];
    const grefs = out.queries.flatMap(q => q.grefs);
    out.stats = {
      queries: out.queries.length, rows: qsrc.rows.length, unassigned: out.queries.filter(q => !q.keys.length).length,
      multi: out.queries.filter(q => q.keys.length > 1).length,
      agents: all.length, withCard: all.filter(a => a.card?.ok).length, badCard: all.filter(a => a.card && !a.card.ok).length,
      noQueries: all.filter(a => !a.qs.length).length,
      grounded: out.queries.filter(q => q.grefs.length || q.inline.length).length,
      refs: grefs.length, resolved: grefs.filter(g => g.doc).length, urlOnly: grefs.filter(g => !g.doc && g.url).length,
      missing: [...new Set(grefs.filter(g => !g.doc && !g.url).map(g => g.name))],
      wantedFiles: [...new Set(grefs.filter(g => !g.doc).map(g => g.name).filter(Boolean))],
      agentDocs: all.reduce((n, a) => n + a.docs.length, 0)
    };
    if (out.stats.unassigned) out.warnings.push(`${out.stats.unassigned} queries have no agent value — shown under “Unassigned”.`);
    if (out.stats.unassigned) { const a = agentOf("(unassigned)"); out.queries.filter(q => !q.keys.length).forEach(q => a.qs.push(q)); }
    if (out.stats.badCard) out.warnings.push(`${out.stats.badCard} agent card(s) failed to parse — raw text is still shown.`);
    return out;
  }

  function setCard(a, raw, from) {
    const p = parseJSON(raw);
    a.card = p.ok ? { ok: true, json: p.v, n: normalizeCard(p.v), from, fixed: p.fixed } : { ok: false, raw, err: p.err, from };
  }
  function matchAgentByCard(agents, j) {
    const c = [j.name, j.id, j.name_for_human, j.namespace].filter(Boolean).map(slug);
    return [...agents.values()].find(a => c.includes(slug(a.key)));
  }

  // One grounding cell → doc / url / inline refs on the query.
  function groundingRefs(cell, col, mode, findDoc, q) {
    cell = cell.trim(); if (!cell) return;
    const tokens = cell.split(/\s*[;\n]\s*/).filter(Boolean);
    const add = (name, url, anchor) => {
      const doc = name ? findDoc(name) : null; const key = (doc?.id) || norm(name) || url;
      const ex = q.grefs.find(g => g.key === key);
      if (ex) { ex.url ||= url; ex.anchor ||= anchor; ex.cols.add(col); return; }
      q.grefs.push({ key, name, url, anchor, doc, cols: new Set([col]) });
    };
    const asUrl = t => { const [u, h] = t.split("#"); const b = baseName(u); add(/\.[a-z0-9]{1,5}$/i.test(b) ? b : null, t, h ? decodeURIComponent(h) : null); };
    const asFile = t => { const [f, h] = t.split("#"); add(baseName(f), null, h || null); };
    if (mode === "inline") return void q.inline.push({ col, text: cell });
    if (mode === "url") return tokens.forEach(asUrl);
    if (mode === "file") return tokens.forEach(asFile);
    if (tokens.every(isUrl)) return tokens.forEach(asUrl);
    if (tokens.every(t => isFileRef(t) || (t.length < 80 && !/\s/.test(t) && findDoc(t.split("#")[0])))) return tokens.forEach(asFile);
    q.inline.push({ col, text: cell });
  }

  // ---------- auto-map ----------
  const score = (name, pats) => pats.reduce((s, [rx, w]) => s + (rx.test(name) ? w : 0), 0);
  function autoMap(st) {
    const M = newMap(); const tables = st.sources;
    if (!tables.length) return M;
    let best = null;
    tables.forEach(s => s.columns.forEach(c => {
      if (["json", "num", "url", "file"].includes(c.kind)) return;
      const ns = score(c.name, [[/^(utterance|query|query_?text|prompt|question|user_?query|input|user_?input)$/i, 10], [/utterance|query|prompt|question/i, 4], [/id$|_id|key|type|category|description|card|fact|answer|expected/i, -6]]);
      const sc = ns + (c.avgLen > 20 ? 2 : 0) + (c.qmark > 0.3 ? 3 : 0) - (["id", "enum"].includes(c.kind) ? 3 : 0);
      if ((ns > 0 || c.qmark > 0.3) && sc > 0 && (!best || sc > best.sc || (sc === best.sc && s.rows.length > best.s.rows.length))) best = { s, c, sc };
    }));
    if (!best) return M;
    const qs = best.s; const used = new Set([best.c.name]);
    const ref = c => ({ s: qs.id, c: c.name });
    M.query = [ref(best.c)];
    const pick = (cols, pats, ok = () => true) => cols.filter(c => !used.has(c.name) && ok(c)).map(c => ({ c, sc: score(c.name, pats) })).filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc)[0]?.c;

    const agent = pick(qs.columns, [[/focal_?agent/i, 10], [/^expected_?agent_?id$/i, 9], [/^(agent|agent_?id|agentid|agent_?key|plugin|plugin_?id)$/i, 9], [/expected_?agent/i, 7], [/plugin/i, 4], [/agent/i, 3], [/secondary|distractor|name|card|json|link|family|trigger/i, -12]], c => !["json", "long", "md", "html"].includes(c.kind));
    if (agent) { M.qAgent = [ref(agent)]; used.add(agent.name); M.opt.split = agent.multi; }
    const id = pick(qs.columns, [[/^(query_?id|qid|id|test_?id|case_?id)$/i, 10], [/query.*id/i, 5]]);
    if (id) { M.qId = [ref(id)]; used.add(id.name); }

    // cards: JSON column (prefer the query table), else uploaded .json cards
    const jsonCols = tables.flatMap(s => s.columns.filter(c => c.kind === "json" && c.cardLike >= 0.4).map(c => ({ s, c })))
      .sort((a, b) => (b.s === qs) - (a.s === qs) || b.c.cardLike - a.c.cardLike);
    if (jsonCols[0]) {
      const { s, c } = jsonCols[0]; M.card = [{ s: s.id, c: c.name }]; if (s === qs) used.add(c.name);
      if (s !== qs) { // find the key column in the card table with the best overlap with query agent keys
        const keys = new Set(agent ? qs.rows.flatMap(r => M.opt.split ? splitMulti(r[agent.name]) : [r[agent.name]]).map(norm) : []);
        const kc = s.columns.filter(x => x.kind !== "json" && x.kind !== "long").map(x => ({ x, n: s.rows.filter(r => keys.has(norm(r[x.name]))).length })).sort((a, b) => b.n - a.n)[0];
        if (kc?.n) M.cardKey = [{ s: s.id, c: kc.x.name }];
      }
    } else if (st.docs.some(d => d.isCard)) {
      M.card = [{ d: "docs:json" }];
      const fc = qs.columns.find(c => c.kind === "file" && c.fileExts.includes("json"));
      if (fc) { M.cardKey = [ref(fc)]; used.add(fc.name); }
    }
    // grounding columns
    const gPats = [[/ground|source_?(doc|file|link|url)|^source$|kb|article|reference|citation|context|passage|evidence|document/i, 6], [/link|url|file/i, 1], [/agent_?card|card/i, -20]];
    qs.columns.filter(c => !used.has(c.name)).forEach(c => {
      const sc = score(c.name, gPats);
      if ((c.kind === "file" && !(c.fileExts.length === 1 && c.fileExts[0] === "json") && sc >= 0) || (["url", "md", "html", "long"].includes(c.kind) && sc >= 6)) { M.grounding.push(ref(c)); used.add(c.name); }
    });
    // agent-level (functional-dependency) columns
    const fd = c => { if (!agent) return false; const m = new Map(); qs.rows.forEach(r => { const v = r[c.name].trim(); if (!v) return; const k = norm(r[agent.name]); (m.get(k) || m.set(k, new Set()).get(k)).add(v); }); return m.size > 1 && [...m.values()].filter(s => s.size <= 1).length / m.size >= 0.9 && c.filled / qs.rows.length > 0.5; };
    const label = pick(qs.columns, [[/^(gpt_?name|agent_?name|display_?name|agent_?title|plugin_?name)$/i, 10], [/name$/i, 3], [/file|link|url|json/i, -20]], c => c.kind !== "json" && fd(c));
    if (label) { M.agentLabel = [ref(label)]; used.add(label.name); }
    qs.columns.filter(c => !used.has(c.name) && c.kind !== "json" && score(c.name, [[/family|tool|owner|team|publisher|card_?link|card_?description|domain|product/i, 5], [/skills$/i, -10]]) > 0 && fd(c))
      .slice(0, 4).forEach(c => { M.cardExtra.push(ref(c)); used.add(c.name); });
    // expected skill: only if its values match skills on the cards
    const skillCol = pick(qs.columns, [[/skill|function|capabilit|tool|intent/i, 5]], c => c.kind !== "json" && !fd(c));
    if (skillCol && M.card.length) {
      const m = build(st, M); const names = new Set([...m.agents.values()].flatMap(a => a.card?.ok ? a.card.n.items.flatMap(i => [norm(i.id), norm(i.name)]) : []));
      const vals = qs.rows.map(r => norm(r[skillCol.name])).filter(Boolean);
      if (vals.length && vals.filter(v => names.has(v)).length / vals.length > 0.3) { M.qSkill = [ref(skillCol)]; used.add(skillCol.name); }
    }
    // facets + row columns
    const facetPats = [[/type|category|segment|intent|difficulty|origin|locale|language|persona|behavio|scenario|family|split|tier|corrected|trigger|negative|domain/i, 5]];
    const facets = qs.columns.filter(c => !used.has(c.name) && c.kind === "enum" && !c.multi && !/record|fact|link|url|^id$|_id$/i.test(c.name) && c.distinct >= 2 && c.distinct <= 40 && c.filled / qs.rows.length > 0.15)
      .map(c => ({ c, sc: score(c.name, facetPats) - c.distinct / 40 })).sort((a, b) => b.sc - a.sc).slice(0, 5).map(x => x.c);
    M.facets = facets.map(ref);
    const rowPref = qs.columns.filter(c => !used.has(c.name) && !facets.includes(c) && c.kind !== "json" && /expected|fact|behavio|answer|secondary|distractor|notes?$|comment|rationale/i.test(c.name)).slice(0, 3);
    M.rowcols = [...facets.slice(0, 2), ...rowPref].slice(0, 5).map(ref);
    // agent-level docs when nothing references them
    const m2 = build(st, M); const refd = new Set(m2.queries.flatMap(q => q.grefs.map(g => g.doc?.id)).filter(Boolean));
    if (st.docs.some(d => d.kind !== "json" && !refd.has(d.id))) M.grounding.push({ d: "docs:all" });
    return M;
  }

  // ---------- presets (localStorage, keyed by column-set signature) ----------
  const PKEY = "evallens.presets.v1";
  const sig = s => s.headers.join("\u241F");
  const loadPresets = () => { try { return JSON.parse(localStorage.getItem(PKEY)) || []; } catch { return []; } };
  function savePreset(st, M) {
    const sigOf = id => { const s = st.sources.find(x => x.id === id); return s ? sig(s) : null; };
    const roles = Object.fromEntries(ROLES.map(r => [r.k, M[r.k].map(x => x.s ? { sig: sigOf(x.s), c: x.c } : { d: x.d.startsWith("docs:") ? x.d : "docs:all" })]));
    const sigs = [...new Set(Object.values(roles).flat().map(x => x.sig).filter(Boolean))];
    const list = loadPresets().filter(p => p.sigs.join("|") !== sigs.join("|"));
    list.unshift({ sigs, roles, opt: M.opt, saved: Date.now(), label: st.sources.filter(s => sigs.includes(sig(s))).map(s => s.label).join(" + ") });
    localStorage.setItem(PKEY, JSON.stringify(list.slice(0, 20)));
  }
  function findPreset(st) {
    const have = new Map(st.sources.map(s => [sig(s), s]));
    const p = loadPresets().find(p => p.sigs.length && p.sigs.every(x => have.has(x))); if (!p) return null;
    const M = newMap(); M.opt = { ...M.opt, ...p.opt };
    ROLES.forEach(r => { M[r.k] = (p.roles[r.k] || []).map(x => x.sig ? { s: have.get(x.sig).id, c: x.c } : { d: x.d }); });
    return { M, label: p.label, saved: p.saved };
  }

  Object.assign(EL, { ROLES, GMODES, newMap, build, autoMap, savePreset, findPreset, srcOf, colOf, querySource });
})();
