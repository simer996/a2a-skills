// Connect view: source tray + schema board + join preview.
(() => {
  const { $, esc, ROLES, GMODES, build, toast, fmtN } = EL;
  const ST = () => EL.state;
  let showAllDocs = false;

  const refKey = r => r.s ? `${r.s}::${r.c}` : `d::${r.d}`;
  const usedRefs = () => new Set(ROLES.flatMap(r => ST().M[r.k].map(refKey)));
  const roleOf = k => ROLES.find(r => r.k === k);
  const qSrcId = () => ST().M.query[0]?.s;

  function assign(k, ref, silent) {
    const st = ST(), M = st.M, r = roleOf(k);
    if (ref.d) {
      if (!r.docs) return toast("Drop a column here — documents go on Grounding or Agent card.", "warn");
      if (k === "card") { ref = { d: "docs:json" }; if (!st.docs.some(d => d.kind === "json")) return toast("No .json files uploaded yet.", "warn"); }
      if (k === "grounding" && ref.d === "docs:json") return toast("Those are card files — drop them on Agent card.", "warn");
    } else {
      const qs = qSrcId();
      if (r.q && k !== "query" && qs && ref.s !== qs) return toast(`“${r.t}” must come from the same table as Query text.`, "warn");
      if (k === "query") ROLES.filter(x => x.q && x.k !== "query").forEach(x => { const before = M[x.k].length; M[x.k] = M[x.k].filter(y => !y.s || y.s === ref.s); if (before !== M[x.k].length && !silent) toast(`Cleared ${x.t} — it was from another table.`); });
      if (k === "qAgent") { const col = EL.colOf(st, ref); M.opt.split = !!col?.multi; }
    }
    M[k] = r.multi ? [...M[k].filter(y => refKey(y) !== refKey(ref)), ref] : [ref];
    refresh();
  }
  function unassign(k, i) { ST().M[k].splice(i, 1); refresh(); }

  function chip(ref, label, kind, extra = "", title = "") {
    return `<span class="chip ${extra}" draggable="true" data-ref='${esc(JSON.stringify(ref))}' title="${esc(title)}"><span>${esc(label)}</span>${kind ? `<span class="ty ${kind}">${kind}</span>` : ""}</span>`;
  }
  function renderTray() {
    const st = ST(), used = usedRefs();
    const tables = st.sources.map((s, i) => `<div class="src" style="animation-delay:${i * 50}ms"><header><span class="ext">${esc(s.ext)}</span><b>${esc(s.label)}</b><small class="lbl">${fmtN(s.rows.length)} rows</small><button class="x" data-rm="${s.id}" title="Remove">✕</button></header>
      <div class="chips">${s.columns.map(c => chip({ s: s.id, c: c.name }, c.name, c.kind, used.has(`${s.id}::${c.name}`) ? "used" : "",
        `${c.name}\n${c.kind}${c.multi ? " · multi-value" : ""} · ${c.filled}/${s.rows.length} filled · ${c.distinct} distinct\ne.g. ${c.example}`)).join("")}</div></div>`).join("");
    const docs = st.docs; let docHtml = "";
    if (docs.length) {
      const cards = docs.filter(d => d.kind === "json"), other = docs.filter(d => d.kind !== "json");
      const shown = showAllDocs ? docs : docs.slice(0, 14);
      docHtml = `<div class="src"><header><span class="ext doc">docs</span><b>Documents</b><small class="lbl">${docs.length} files</small><button class="x" data-rmdocs="1" title="Remove all documents">✕</button></header><div class="chips">
        ${other.length ? chip({ d: "docs:all" }, `All grounding docs (${other.length})`, "", "group " + (used.has("d::docs:all") ? "used" : ""), "Drop on Grounding: attaches docs to agents whose id appears in the file name. Docs named in a grounding column are matched automatically.") : ""}
        ${cards.length ? chip({ d: "docs:json" }, `All JSON cards (${cards.length})`, "", "group " + (used.has("d::docs:json") ? "used" : ""), "Drop on Agent card") : ""}
        ${shown.map(d => chip({ d: d.id }, d.name, d.kind, "docchip " + (used.has("d::" + d.id) ? "used" : ""), `${d.path}\n${d.kind}${d.error ? " · " + d.error : ""}${d.jsonErr ? " · invalid JSON: " + d.jsonErr : ""}`)).join("")}
        ${docs.length > 14 ? `<span class="morebtn" id="moredocs">${showAllDocs ? "show fewer" : `+${docs.length - 14} more`}</span>` : ""}</div></div>`;
    }
    $("srcs").innerHTML = tables + docHtml || `<p class="lbl" style="text-align:center;margin-top:30px">No files yet</p>`;
    $("srcs").querySelectorAll(".chip[draggable]").forEach(ch => ch.ondragstart = e => { e.dataTransfer.setData("application/x-evallens", ch.dataset.ref); e.dataTransfer.effectAllowed = "copy"; });
    $("srcs").querySelectorAll("[data-rm]").forEach(b => b.onclick = () => EL.removeSource(b.dataset.rm));
    $("srcs").querySelector("[data-rmdocs]")?.addEventListener("click", () => EL.removeDocs());
    $("moredocs") && ($("moredocs").onclick = () => { showAllDocs = !showAllDocs; renderTray(); });
  }

  function options(r) {
    const st = ST(), qs = qSrcId(), used = usedRefs();
    const srcs = st.sources.filter(s => !(r.q && r.k !== "query" && qs) || s.id === qs);
    let html = srcs.map(s => `<optgroup label="${esc(s.label)}">${s.columns.map(c => { const v = JSON.stringify({ s: s.id, c: c.name }); return `<option value='${esc(v)}' ${used.has(`${s.id}::${c.name}`) ? "class='u'" : ""}>${esc(c.name)} · ${c.kind}</option>`; }).join("")}</optgroup>`).join("");
    if (r.docs === "json" && st.docs.some(d => d.kind === "json")) html += `<optgroup label="Documents"><option value='{"d":"docs:json"}'>All uploaded JSON card files</option></optgroup>`;
    if (r.docs === "any" && st.docs.some(d => d.kind !== "json")) html += `<optgroup label="Documents"><option value='{"d":"docs:all"}'>All grounding docs (match by agent id in file name)</option>${st.docs.filter(d => d.kind !== "json").slice(0, 200).map(d => `<option value='${esc(JSON.stringify({ d: d.id }))}'>${esc(d.name)}</option>`).join("")}</optgroup>`;
    return `<select data-add="${r.k}"><option value="">${r.multi ? "+ add" : "choose"} from list…</option>${html}</select>`;
  }
  function refLabel(ref) {
    const st = ST();
    if (ref.s) { const c = EL.colOf(st, ref); return { label: ref.c, kind: c?.kind || "?" }; }
    if (ref.d === "docs:all") return { label: "all grounding docs", kind: "docs" };
    if (ref.d === "docs:json") return { label: "uploaded JSON cards", kind: "docs" };
    const d = st.docs.find(x => x.id === ref.d); return { label: d ? d.name : "(removed)", kind: d?.kind || "doc" };
  }
  function renderSockets() {
    const st = ST(), M = st.M, model = st.model;
    const bands = [...new Set(ROLES.map(r => r.band))];
    $("sockets").innerHTML = bands.map(b => `<div class="band"><span class="lbl">${b}</span><div class="sockets">${ROLES.filter(r => r.band === b).map(r => {
      const refs = M[r.k];
      let hint = "";
      if (r.k === "cardKey" && M.card[0]?.s && model?.cardSrc && model.cardSrc !== model.qsrc && !refs.length) hint = "Cards are in another table — map its id column here (or names are matched).";
      if (r.k === "card" && model?.stats.badCard) hint = `${model.stats.badCard} card(s) could not be parsed.`;
      return `<div class="sock ${refs.length ? "ok" : ""} ${hint && r.k === "cardKey" ? "bad" : ""}" data-k="${r.k}">${r.req ? '<span class="req">REQUIRED</span>' : ""}<h4>${r.t}</h4><p>${r.d}</p>
        <div class="slot">${refs.map((x, i) => { const l = refLabel(x); return `<span class="chip" title="${esc(x.s ? EL.srcOf(st, x)?.label : "")}"><span>${esc(l.label)}</span><span class="ty">${l.kind}</span><span class="x" data-k="${r.k}" data-i="${i}">✕</span></span>`; }).join("")}</div>
        ${r.split && refs.length ? `<label class="opt"><input type="checkbox" id="optSplit" ${M.opt.split ? "checked" : ""}> cell may list several agents (split on ; , |)</label>` : ""}
        ${r.mode ? `<select id="gmode" title="How to read grounding columns">${GMODES.map(([v, t]) => `<option value="${v}" ${M.opt.gmode === v ? "selected" : ""}>${t}</option>`).join("")}</select>` : ""}
        ${options(r)}${hint ? `<div class="hint">${esc(hint)}</div>` : ""}</div>`; }).join("")}</div></div>`).join("");
    $("sockets").querySelectorAll(".sock").forEach(s => {
      s.ondragover = e => { e.preventDefault(); s.classList.add("over"); }; s.ondragleave = () => s.classList.remove("over");
      s.ondrop = e => { e.preventDefault(); s.classList.remove("over"); const raw = e.dataTransfer.getData("application/x-evallens"); if (raw) assign(s.dataset.k, JSON.parse(raw)); };
    });
    $("sockets").querySelectorAll(".slot .x").forEach(x => x.onclick = () => unassign(x.dataset.k, +x.dataset.i));
    $("sockets").querySelectorAll("select[data-add]").forEach(sel => sel.onchange = () => { if (sel.value) assign(sel.dataset.add, JSON.parse(sel.value)); });
    $("optSplit") && ($("optSplit").onchange = e => { M.opt.split = e.target.checked; refresh(); });
    $("gmode") && ($("gmode").onchange = e => { M.opt.gmode = e.target.value; refresh(); });
  }

  function renderModel() {
    const st = ST(), M = st.M, m = st.model, s = m?.stats || {};
    const ok = k => M[k].length > 0;
    const box = (x, t, l1, l2, on, dash) => `<g><rect x="${x}" y="20" width="250" height="88" fill="#fffdf7" stroke="${on ? "#1d1a16" : "#d9cdb5"}" stroke-width="1.5" ${dash ? 'stroke-dasharray="5 4"' : ""}/><text x="${x + 14}" y="46" fill="#1d1a16" font-size="18" font-family="Fraunces,Georgia" font-weight="600">${t}</text><text x="${x + 14}" y="70" fill="#5b5348">${esc(l1)}</text><text x="${x + 14}" y="90" fill="#5b5348">${esc(l2)}</text></g>`;
    const trunc = (t, n = 28) => t.length > n ? t.slice(0, n - 1) + "…" : t;
    const cardLbl = M.card[0] ? (M.card[0].s ? M.card[0].c : "JSON files") : "—";
    const gl = M.grounding.length ? M.grounding.map(r => r.s ? r.c : "docs").join(", ") : "—";
    const line = (x, on, lbl) => `<line x1="${x}" y1="64" x2="${x + 75}" y2="64" stroke="${on ? "#c2410c" : "#d9cdb5"}" stroke-width="2" ${on ? "" : 'stroke-dasharray="4 4"'}/><text x="${x + 8}" y="56" fill="${on ? "#c2410c" : "#9a8f7c"}">${lbl}</text>`;
    const svg = `<svg viewBox="0 0 920 120" font-family="JetBrains Mono,Consolas" font-size="12">
      ${box(10, "Agents", trunc(`card: ${cardLbl}`), m?.qsrc ? `${s.agents} agents · ${s.withCard} with card` : "—", ok("card"), !ok("card"))}
      ${line(260, ok("qAgent"), ok("qAgent") ? (M.opt.split ? "n ─ n" : "1 ─ n") : "no join")}
      ${box(335, "Queries", trunc(`text: ${M.query[0]?.c || "—"}`), m?.qsrc ? `${fmtN(s.queries)} rows · ${M.facets.length} filters · ${M.rowcols.length} cols` : "—", ok("query") && ok("qAgent"))}
      ${line(585, ok("grounding"), ok("grounding") ? "per row" : "optional")}
      ${box(660, "Grounding", trunc(gl), m?.qsrc && ok("grounding") ? `${s.resolved}/${s.refs} refs → files${s.agentDocs ? ` · ${s.agentDocs} agent docs` : ""}` : "mode: " + M.opt.gmode, ok("grounding"), !ok("grounding"))}</svg>`;
    let body = "";
    if (m?.qsrc) {
      const stat = (n, l, cls = "") => `<div class="stat ${cls}"><b>${n}</b><span>${l}</span></div>`;
      body = `<div class="stats">${stat(fmtN(s.queries), "queries")}${stat(s.agents, "agents / plugins")}
        ${ok("card") ? stat(`${s.withCard}/${s.agents}`, "agents with a valid card", s.withCard === s.agents ? "good" : "warn") : ""}
        ${s.multi ? stat(s.multi, "queries → several agents") : ""}
        ${s.noQueries ? stat(s.noQueries, "agents with 0 queries", "warn") : ""}
        ${ok("grounding") ? stat(`${s.grounded}/${s.queries}`, "queries with grounding") : ""}
        ${s.refs ? stat(`${s.resolved}/${s.refs}`, "grounding refs → uploaded file", s.resolved === s.refs ? "good" : "warn") : ""}
        ${s.urlOnly ? stat(s.urlOnly, "refs link out (URL only)") : ""}</div>
        ${m.warnings.length ? `<ul class="warnings">${m.warnings.map(w => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
        ${s.wantedFiles?.length ? `<div class="missing">Grounding files referenced but not uploaded (${s.wantedFiles.length}) — <a href="#" id="upMissing">upload them</a> to read them inline:<br>${s.wantedFiles.slice(0, 30).map(f => `<code>${esc(f)}</code>`).join("")}${s.wantedFiles.length > 30 ? ` … +${s.wantedFiles.length - 30}` : ""}</div>` : ""}`;
    }
    $("model").innerHTML = `<div class="lbl" style="margin-bottom:6px">Resulting data model</div>${svg}${body}`;
    $("upMissing") && ($("upMissing").onclick = e => { e.preventDefault(); $("docIn").click(); });
    const missing = ROLES.filter(r => r.req && !ok(r.k)).map(r => r.t);
    $("readiness").textContent = !st.sources.length ? "add a file to begin" : missing.length ? `missing: ${missing.join(", ")}` : "ready ✓";
    $("go").disabled = !ok("query");
    document.querySelector('#nav [data-v="explore"]').disabled = !ok("query");
  }

  function renderPreview() {
    const st = ST(), m = st.model;
    if (!m?.qsrc) { $("preview").innerHTML = ""; return; }
    const M = st.M, mapped = new Map();
    ROLES.forEach(r => M[r.k].forEach(x => { if (x.s === m.qsrc.id) mapped.set(x.c, (mapped.get(x.c) ? mapped.get(x.c) + ", " : "") + r.t); }));
    const cols = m.qsrc.headers;
    $("preview").innerHTML = `<div class="lbl" style="margin-bottom:6px">Query table preview · ${esc(m.qsrc.label)} · first 5 rows</div><div class="tw"><table><thead><tr>${cols.map(c => `<th title="${esc(mapped.get(c) || "unmapped")}" style="${mapped.has(c) ? "color:var(--accent)" : ""}">${esc(c)}${mapped.has(c) ? "<br><small style='text-transform:none;font-weight:400'>" + esc(mapped.get(c)) + "</small>" : ""}</th>`).join("")}</tr></thead>
      <tbody>${m.qsrc.rows.slice(0, 5).map(r => `<tr>${cols.map(c => `<td title="${esc(r[c].slice(0, 400))}">${esc(r[c].slice(0, 120))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function renderPresetBar() {
    const p = ST().presetInfo;
    $("presetBar").innerHTML = p ? `<div class="preset">↺ Applied your saved mapping for <b>${esc(p.label)}</b> <span class="lbl">${new Date(p.saved).toLocaleDateString()}</span><span class="sp"></span><button class="btn sm" id="presetAuto">Use auto-map instead</button></div>` : "";
    $("presetAuto") && ($("presetAuto").onclick = () => { ST().presetInfo = null; $("auto").click(); });
  }

  function refresh() {
    const st = ST(); st.model = build(st, st.M);
    renderTray(); renderSockets(); renderModel(); renderPreview(); renderPresetBar();
    EL.onModelChange && EL.onModelChange();
  }

  function init() {
    $("auto").onclick = () => { const st = ST(); st.M = EL.autoMap(st); st.presetInfo = null; refresh(); toast(st.M.query.length ? "Auto-mapped — review the roles, then open the explorer." : "Couldn't find a query column — map it manually.", st.M.query.length ? "" : "warn"); };
    $("clear").onclick = () => { ST().M = EL.newMap(); ST().presetInfo = null; refresh(); };
    $("go").onclick = () => { const st = ST(); try { EL.savePreset(st, st.M); } catch {} EL.show("explore"); };
  }

  Object.assign(EL, { connectRefresh: refresh, connectInit: init });
})();
