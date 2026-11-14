// Explore view: agent picker, facets, card dossier, query table, grounding drawer.
(() => {
  const { $, esc, jsonTree, fmtN, renderMarkdown, renderHtmlDoc, sanitize, highlightTerms, termsFrom, isUrl, slug, PALETTE, toast } = EL;
  const ALL = "__all";
  const norm = s => String(s ?? "").trim().toLowerCase();
  const E = { agent: ALL, view: "card", skill: null, f: {}, q: "", sort: null, dir: 1, cols: null, compact: false, gOn: true, idOn: localStorage.getItem("evallens.idOn") !== "0", mix: null, limit: 150, ovSort: "n", sig: null };
  let model, M, visible = [];
  const colors = {};

  const blank = v => (String(v ?? "").trim() || "(blank)");
  const nameOf = a => a.card?.ok ? a.card.n.title : (a.label || a.key);
  const agentsSorted = () => [...model.agents.values()].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const cur = () => E.agent === ALL ? null : model.agents.get(E.agent);
  const baseQs = () => E.agent === ALL ? model.queries : (cur()?.qs || []);
  const passes = (q, except) => Object.entries(E.f).every(([c, set]) => c === except || !set.size || set.has(blank(q.row[c])));
  const skillCol = () => M.qSkill[0]?.c;
  const qSkillMatch = (q, s) => { const v = norm(q.row[skillCol()]); return v && (v === norm(s.id) || v === norm(s.name)); };
  const colorOf = (col, v) => { const m = colors[col] ||= (() => { const vals = [...new Set(model.queries.map(q => blank(q.row[col])))].sort(); return Object.fromEntries(vals.map((x, i) => [x, x === "(blank)" ? "#b8ab92" : PALETTE[i % PALETTE.length]])); })(); return m[v] || "#999"; };
  const colKind = c => model.qsrc.columns.find(x => x.name === c)?.kind;

  function init() {
    model = EL.state.model; M = EL.state.M;
    const sig = JSON.stringify([model.qsrc.id, M.facets, M.rowcols, M.query, M.qAgent]);
    if (E.sig !== sig) { // mapping changed → reset view state
      Object.assign(E, { agent: ALL, skill: null, f: {}, q: "", sort: null, dir: 1, limit: 150, sig });
      E.cols = M.rowcols.map(r => r.c); E.mix = M.facets[0]?.c || null; for (const k in colors) delete colors[k];
      $("fq").value = "";
    }
    if (E.agent !== ALL && !model.agents.has(E.agent)) E.agent = ALL;
    E.facetCols = M.facets.map(r => r.c);
    render();
  }
  function render() { renderPicker(); renderFacets(); renderCard(); renderQueries(); fitFilters(); }
  const fitFilters = () => document.documentElement.style.setProperty("--fh", $("filters").offsetHeight + "px");

  // ---------- agent picker ----------
  function select(key) { E.agent = key; E.skill = null; E.limit = 150; $("amenu").classList.remove("on"); render(); window.scrollTo({ top: 0 }); }
  function step(d) { const keys = [ALL, ...agentsSorted().map(a => a.k)]; const i = keys.indexOf(E.agent); select(keys[(i + d + keys.length) % keys.length]); }
  function renderPicker() {
    const a = cur();
    $("acur").innerHTML = a ? `${esc(nameOf(a))}<span class="k">${a.qs.length} q</span>` : `All agents<span class="k">${model.agents.size} agents · ${fmtN(model.queries.length)} q</span>`;
    $("acur").onclick = e => { e.stopPropagation(); const m = $("amenu"); m.classList.toggle("on"); if (m.classList.contains("on")) { renderMenu(""); m.querySelector("input").focus(); } };
    $("aprev").onclick = () => step(-1); $("anext").onclick = () => step(1);
  }
  function renderMenu(filter) {
    const m = $("amenu"); const f = norm(filter);
    const list = agentsSorted().filter(a => !f || norm(nameOf(a)).includes(f) || a.k.includes(f));
    const cs = a => a.card ? (a.card.ok ? `<span class="cs ok">card</span>` : `<span class="cs bad">bad card</span>`) : `<span class="cs">no card</span>`;
    const items = `<div class="it ${E.agent === ALL ? "on" : ""}" data-a="${ALL}"><div><b>All agents</b><small>overview · patterns</small></div><span></span><span class="n">${fmtN(model.queries.length)}</span></div>`
      + list.map(a => `<div class="it ${E.agent === a.k ? "on" : ""}" data-a="${esc(a.k)}"><div><b>${esc(nameOf(a))}</b><small>${esc(a.key)}</small></div>${cs(a)}<span class="n">${a.qs.length}</span></div>`).join("");
    if (!m.querySelector("input")) { m.innerHTML = `<input type="search" placeholder="Find an agent…"><div class="list"></div>`; m.querySelector("input").oninput = e => renderMenu(e.target.value); m.onclick = e => e.stopPropagation();
      m.querySelector("input").onkeydown = e => { if (e.key === "Enter") m.querySelector(".list .it:nth-child(2)")?.click(); }; }
    m.querySelector(".list").innerHTML = items || `<div class="empty">No match</div>`;
    m.querySelectorAll(".it").forEach(it => it.onclick = () => select(it.dataset.a));
  }

  // ---------- facets ----------
  function renderFacets() {
    const open = [...document.querySelectorAll("#facets .menu.on")].map(m => m.dataset.c);
    const qs = baseQs();
    $("facets").innerHTML = E.facetCols.map(c => {
      const set = E.f[c] || new Set(); const counts = new Map();
      qs.forEach(q => { const v = blank(q.row[c]); if (!counts.has(v)) counts.set(v, 0); if (passes(q, c)) counts.set(v, counts.get(v) + 1); });
      const vals = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b)); const mx = Math.max(1, ...counts.values());
      return `<div class="facet"><button class="${set.size ? "act" : ""}" data-open="${esc(c)}">${esc(c)} ${set.size ? `<b>${set.size}</b>` : ""} ▾</button>
        <div class="menu ${open.includes(c) ? "on" : ""}" data-c="${esc(c)}"><div class="mh"><span class="lbl">${esc(c)} · ${vals.length}</span>${set.size ? `<a data-clr="${esc(c)}">clear</a>` : ""}</div>
        ${vals.map(v => { const n = counts.get(v); return `<label class="opt ${n ? "" : "dim"}"><span class="bg" style="width:${n / mx * 100}%"></span><input type="checkbox" data-c="${esc(c)}" value="${esc(v)}" ${set.has(v) ? "checked" : ""}><span>${c === E.mix ? `<span class="sw" style="background:${colorOf(c, v)}"></span>` : ""}${esc(v)}</span><span class="c">${n}</span></label>`; }).join("")}</div></div>`;
    }).join("") || `<span class="lbl" title="Map Filters on the Connect tab">no filters mapped</span>`;
    $("facets").querySelectorAll("[data-open]").forEach(b => b.onclick = e => { e.stopPropagation(); const m = b.nextElementSibling; const was = m.classList.contains("on"); closeMenus(); if (!was) m.classList.add("on"); });
    $("facets").querySelectorAll(".menu").forEach(m => m.onclick = e => e.stopPropagation());
    $("facets").querySelectorAll("input[data-c]").forEach(i => i.onchange = () => { const s = E.f[i.dataset.c] ||= new Set(); i.checked ? s.add(i.value) : s.delete(i.value); E.limit = 150; renderFacets(); renderQueries(); if (E.agent === ALL) renderCard(); });
    $("facets").querySelectorAll("[data-clr]").forEach(a => a.onclick = () => { E.f[a.dataset.clr].clear(); renderFacets(); renderQueries(); if (E.agent === ALL) renderCard(); });
    renderCrumbs();
  }
  function renderCrumbs() {
    const parts = Object.entries(E.f).flatMap(([c, s]) => [...s].map(v => `<span data-c="${esc(c)}" data-v="${esc(v)}">${esc(c)}: ${esc(v)} ✕</span>`));
    if (E.skill) parts.push(`<span data-skill="1">skill: ${esc(E.skill)} ✕</span>`);
    if (parts.length > 1) parts.push(`<span data-all="1">clear all</span>`);
    $("crumbs").innerHTML = parts.join("");
    $("crumbs").querySelectorAll("[data-c]").forEach(x => x.onclick = () => { E.f[x.dataset.c].delete(x.dataset.v); render(); });
    $("crumbs").querySelector("[data-skill]")?.addEventListener("click", () => { E.skill = null; render(); });
    $("crumbs").querySelector("[data-all]")?.addEventListener("click", () => { E.f = {}; E.skill = null; render(); });
    fitFilters();
  }
  const closeMenus = () => document.querySelectorAll(".menu.on,.amenu.on").forEach(m => m.classList.remove("on"));

  // ---------- card / overview ----------
  function renderCard() {
    const a = cur();
    if (!a) return renderOverview();
    const c = a.card, n = c?.ok ? c.n : null;
    const extras = Object.entries(a.extras).filter(([, v]) => v);
    const link = v => isUrl(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener noreferrer">${esc(decodeURIComponent(v.split("/").pop() || v))} ↗</a>` : esc(v);
    const vt = c ? `<div class="vt">${(c.ok ? ["card", "tree", "raw"] : ["card", "raw"]).map(v => `<button class="${E.view === v ? "on" : ""}" data-v="${v}">${{ card: "Formatted", tree: "JSON tree", raw: "Raw" }[v]}</button>`).join("")}</div>` : "";
    let body;
    if (c && E.view === "tree" && c.ok) body = jsonTree(c.json);
    else if (c && E.view === "raw") body = `<pre class="raw">${esc(c.ok ? JSON.stringify(c.json, null, 2) : c.raw)}</pre>`;
    else {
      const meta = n ? { version: n.version, endpoint: n.url, ...n.meta } : {};
      const skillCounts = n && skillCol() ? s => a.qs.filter(q => qSkillMatch(q, s)).length : null;
      body = `${c && !c.ok ? `<div class="carderr"><b>Card JSON could not be parsed.</b><br>${esc(c.err)}<br><small>from ${esc(c.from)} — see Raw.</small></div>` : ""}
        ${!c ? `<div class="nocard">No agent card mapped for this agent.${M.card.length ? " Its key didn't match any card." : " Map one on the Connect tab."}</div>` : ""}
        ${Object.values(meta).some(Boolean) || extras.length ? `<dl class="metagrid">${Object.entries(meta).filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${link(String(v))}</dd>`).join("")}
          ${extras.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v.length > 220 ? `<span class="clamp">${esc(v)}</span>` : link(v)}</dd>`).join("")}</dl>` : ""}
        ${n?.flags.length ? `<div class="flags">${n.flags.map(f => `<span class="flag ${f.v ? "t" : "f"}">${esc(f.k)}</span>`).join("")}</div>` : ""}
        ${n?.modelDescription ? `<div class="modeldesc"><b style="font:600 10px var(--mono);letter-spacing:.1em;font-style:normal">DESCRIPTION FOR MODEL</b><br>${esc(n.modelDescription)}</div>` : ""}
        ${n?.items.length ? `<div class="skills"><h3>${n.itemLabel} · ${n.items.length}${skillCounts ? " · click to filter" : ""}</h3>${n.items.map(s => { const k = skillCounts?.(s);
          return `<div class="skill ${skillCounts ? "click" : ""} ${E.skill === s.id ? "on" : ""}" data-s="${esc(s.id)}">${skillCounts ? `<span class="cnt ${k ? "" : "z"}">${k ? k + " q" : "0 q ⚠"}</span>` : ""}<span class="nm">${esc(s.name)}</span>${s.name !== s.id && s.id ? `<span class="id">${esc(s.id)}</span>` : ""}
            ${s.description ? `<p>${esc(s.description)}</p>` : ""}${s.tags.length || s.confirm ? `<div class="tags">${s.tags.map(t => `<span>${esc(t)}</span>`).join("")}${s.confirm ? '<span style="background:var(--hl)">requires confirmation</span>' : ""}</div>` : ""}
            ${s.examples.length ? `<div class="ex">e.g. “${s.examples.map(esc).join("”, “")}”</div>` : ""}</div>`; }).join("")}</div>` : ""}
        ${n && Object.keys(n.rest).length ? `<h3>Other fields</h3>${jsonTree(n.rest, 0, 1)}` : ""}
        ${a.docs.length ? `<h3>Grounding docs · ${a.docs.length}</h3><div class="docs">${a.docs.map(d => `<a data-doc="${d.id}">📄 ${esc(d.name)}</a>`).join("")}</div>` : ""}`;
    }
    $("card").innerHTML = `<div class="kind">${esc(n?.kind || "Agent")}</div><h2>${esc(nameOf(a))}</h2>
      <div class="key">${esc(a.key)} · ${a.qs.length} queries${c ? ` · card from ${esc(c.from)}` : ""}${c?.fixed ? " · repaired JSON" : ""}</div>
      ${n?.subtitle ? `<p class="sub">${esc(n.subtitle)}</p>` : ""}${vt}${body}`;
    $("card").querySelectorAll("[data-v]").forEach(b => b.onclick = () => { E.view = b.dataset.v; renderCard(); });
    $("card").querySelectorAll(".skill.click").forEach(el => el.onclick = () => { E.skill = E.skill === el.dataset.s ? null : el.dataset.s; renderCard(); renderQueries(); renderCrumbs(); });
    $("card").querySelectorAll("[data-doc]").forEach(el => el.onclick = () => openDrawer({ doc: EL.state.docs.find(d => d.id === el.dataset.doc) }));
    $("card").querySelectorAll(".clamp").forEach(el => el.onclick = () => el.classList.toggle("open"));
    $("card").scrollTop = 0;
  }
  function renderOverview() {
    const s = model.stats, mix = E.mix;
    let list = agentsSorted().map(a => ({ a, qs: a.qs.filter(q => passes(q)) }));
    if (E.ovSort === "n") list.sort((x, y) => y.qs.length - x.qs.length);
    if (E.ovSort === "card") list.sort((x, y) => (x.a.card?.ok ? 2 : x.a.card ? 0 : 1) - (y.a.card?.ok ? 2 : y.a.card ? 0 : 1));
    const mx = Math.max(1, ...list.map(x => x.qs.length));
    const bar = qs => { if (!mix) return `<i style="width:${qs.length / mx * 100}%;background:var(--ink2)"></i>`; const c = new Map(); qs.forEach(q => { const v = blank(q.row[mix]); c.set(v, (c.get(v) || 0) + 1); });
      return [...c].sort((a, b) => a[0].localeCompare(b[0])).map(([v, n]) => `<i title="${esc(v)}: ${n}" style="width:${n / mx * 100}%;background:${colorOf(mix, v)}"></i>`).join(""); };
    $("card").innerHTML = `<div class="kind">Overview</div><h2>All agents</h2>
      <div class="key">${s.agents} agents · ${fmtN(s.queries)} queries${M.card.length ? ` · ${s.withCard} cards` : ""}${s.badCard ? ` · ${s.badCard} unparseable` : ""}${s.noQueries ? ` · ${s.noQueries} without queries` : ""}</div>
      <div class="ovsort"><span class="lbl">sort</span>${[["n", "queries"], ["name", "name"], ["card", "card status"]].map(([k, l]) => `<button class="${E.ovSort === k ? "on" : ""}" data-os="${k}">${l}</button>`).join("")}</div>
      ${mix ? `<div class="cstrip">bars split by <b>${esc(mix)}</b> · width = filtered query count</div>` : ""}
      <div class="ov">${list.map(({ a, qs }) => `<div class="it" data-a="${esc(a.k)}"><div><b>${esc(nameOf(a))}</b>${a.card ? (a.card.ok ? "" : `<span class="cs bad">bad card</span>`) : (M.card.length ? `<span class="cs none">no card</span>` : "")}<br><small>${esc(a.key)}</small></div><span class="n">${qs.length}${qs.length !== a.qs.length ? `<small>/${a.qs.length}</small>` : ""}</span><div class="bar">${bar(qs)}</div></div>`).join("")}</div>`;
    $("card").querySelectorAll("[data-a]").forEach(el => el.onclick = () => select(el.dataset.a));
    $("card").querySelectorAll("[data-os]").forEach(b => b.onclick = () => { E.ovSort = b.dataset.os; renderOverview(); });
  }

  // ---------- query table ----------
  const cmp = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  function filtered() {
    const words = E.q.trim().toLowerCase();
    const a = cur(); const skill = E.skill && a?.card?.ok ? a.card.n.items.find(s => s.id === E.skill) : null;
    let qs = baseQs().filter(q => passes(q) && (!skill || qSkillMatch(q, skill)) && (!words || (q.text + " " + q.id + " " + E.cols.map(c => q.row[c]).join(" ")).toLowerCase().includes(words)));
    if (E.sort) { const get = E.sort === "__q" ? q => q.text : E.sort === "__id" ? q => q.id : E.sort === "__agent" ? q => q.keys.join(",") : q => q.row[E.sort]; qs = [...qs].sort((x, y) => cmp(get(x), get(y)) * E.dir); }
    return qs;
  }
  function renderQueries() {
    const all = baseQs(); const qs = filtered(); visible = qs;
    const rx = E.q.trim() ? new RegExp(E.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig") : null;
    const hl = s => rx ? esc(s).replace(new RegExp(esc(E.q.trim()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), m => `<mark>${m}</mark>`) : esc(s);
    const showAgent = E.agent === ALL;
    const th = (key, label) => `<th data-sort="${esc(key)}">${esc(label)}${E.sort === key ? `<span class="s"> ${E.dir > 0 ? "↑" : "↓"}</span>` : ""}</th>`;
    const cell = (q, c) => { const v = q.row[c] ?? ""; const k = colKind(c);
      if (c === E.mix && v.trim()) return `<td class="c"><span class="pill cat" style="background:${colorOf(c, blank(v))}">${hl(v)}</span></td>`;
      if (isUrl(v.trim())) return `<td class="c"><a href="${esc(v.trim())}" target="_blank" rel="noopener noreferrer" title="${esc(v)}">${esc(decodeURIComponent(v.split("/").pop()).slice(0, 40))} ↗</a></td>`;
      if (["long", "md", "html", "json"].includes(k) || v.length > 60) return `<td class="c long"><div class="clamp">${hl(v)}</div></td>`;
      return `<td class="c">${hl(v)}</td>`; };
    const mixHtml = E.mix ? (() => { const c = new Map(); all.forEach(q => { const v = blank(q.row[E.mix]); c.set(v, (c.get(v) || 0) + 1); }); const set = E.f[E.mix] || new Set();
      return `<div class="dist">${[...c].sort((a, b) => b[1] - a[1]).map(([v, n]) => `<div data-mix="${esc(v)}" title="${esc(v)}: ${n}" style="flex:${n};background:${colorOf(E.mix, v)};${set.size && !set.has(v) ? "opacity:.25" : ""}">${n / all.length > 0.06 ? esc(v) + " " + n : ""}</div>`).join("")}</div>`; })() : "";
    const shown = qs.slice(0, E.limit);
    $("queries").innerHTML = `<div class="qhead"><h2>Queries</h2><span class="n">${fmtN(qs.length)} of ${fmtN(all.length)}</span><span class="sp"></span>
        ${E.facetCols.length ? `<span class="lbl">mix by</span><select class="mixsel" id="mixsel"><option value="">—</option>${E.facetCols.map(c => `<option ${c === E.mix ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>` : ""}
        <button class="btn sm" id="dens">${E.compact ? "Comfortable" : "Compact"}</button>
        <div class="facet"><button class="btn sm" id="colbtn">⚙ Columns (${E.cols.length + (E.idOn ? 1 : 0)})</button><div class="menu colmenu" style="left:auto;right:0;min-width:300px"></div></div>
        <button class="btn sm" id="csv" title="Download the filtered rows as CSV">⇣ CSV</button></div>
      ${mixHtml}
      ${qs.length ? `<div class="tablewrap"><table class="qt ${E.compact ? "compact" : ""}"><thead><tr>${E.idOn ? th("__id", M.qId[0]?.c || "#") : ""}${th("__q", "Query")}${showAgent ? th("__agent", "Agent") : ""}${E.cols.map(c => th(c, c)).join("")}</tr></thead><tbody>
        ${shown.map((q, i) => `<tr>${E.idOn ? `<td class="i">${M.qId[0] ? `<small>${esc(q.id)}</small>` : String(i + 1).padStart(2, "0")}</td>` : ""}
          <td class="q">${hl(q.text)}${!showAgent ? q.keys.filter(k => norm(k) !== E.agent).map(k => `<span class="also" data-go="${esc(norm(k))}" title="Also expected: ${esc(k)}">+ ${esc(k)}</span>`).join("") : ""}${gline(q, i)}</td>
          ${showAgent ? `<td class="c">${q.keys.map(k => `<span class="also" style="margin:0 4px 0 0" data-go="${esc(norm(k))}">${esc(k)}</span>`).join("") || "—"}</td>` : ""}
          ${E.cols.map(c => cell(q, c)).join("")}</tr>`).join("")}</tbody></table>
        ${qs.length > E.limit ? `<div class="morerows"><button class="btn" id="more">Show ${Math.min(300, qs.length - E.limit)} more of ${fmtN(qs.length - E.limit)}</button></div>` : ""}</div>`
      : `<div class="empty">No queries match these filters.</div>`}`;
    const Q = $("queries");
    Q.querySelectorAll("[data-mix]").forEach(el => el.onclick = () => { const s = E.f[E.mix] ||= new Set(); if (s.has(el.dataset.mix) && s.size === 1) s.clear(); else { s.clear(); s.add(el.dataset.mix); } render(); });
    Q.querySelectorAll("[data-sort]").forEach(h => h.onclick = () => { if (E.sort === h.dataset.sort) { if (E.dir > 0) E.dir = -1; else { E.sort = null; E.dir = 1; } } else { E.sort = h.dataset.sort; E.dir = 1; } renderQueries(); });
    Q.querySelectorAll("[data-g]").forEach(el => el.onclick = e => { if (el.tagName === "A") return; e.preventDefault(); const [i, j] = el.dataset.g.split(":").map(Number); openForQuery(i, j); });
    Q.querySelectorAll("[data-go]").forEach(el => el.onclick = () => { if (model.agents.has(el.dataset.go)) select(el.dataset.go); else toast("That agent isn't in the data."); });
    Q.querySelectorAll(".clamp").forEach(el => el.onclick = () => el.classList.toggle("open"));
    $("more") && ($("more").onclick = () => { E.limit += 300; renderQueries(); });
    $("dens").onclick = () => { E.compact = !E.compact; renderQueries(); };
    $("mixsel") && ($("mixsel").onchange = e => { E.mix = e.target.value || null; render(); });
    $("csv").onclick = exportCsv;
    $("colbtn").onclick = e => { e.stopPropagation(); const m = $("colbtn").nextElementSibling; const was = m.classList.contains("on"); closeMenus(); if (!was) { renderColMenu(m); m.classList.add("on"); } };
  }

  // grounding links shown under each query (doc → drawer, URL → new tab, missing → drawer explains)
  function gline(q, i) {
    if (!E.gOn) return "";
    const parts = q.grefs.map((g, j) => {
      const t = g.doc ? g.doc.ext || g.doc.kind : (g.name ? (g.name.split(".").pop() || "file") : "link");
      const an = g.anchor ? `<span class="an">#${esc(g.anchor)}</span>` : "";
      if (g.doc) return `<span class="glink" data-g="${i}:${j}" title="Open ${esc(g.doc.name)}"><span class="t">${esc(t)}</span>${esc(g.doc.name)}${an}</span>${g.url ? `<a class="gorig" href="${esc(g.url)}" target="_blank" rel="noopener noreferrer" title="Open original">↗</a>` : ""}`;
      if (g.url) return `<a class="glink ext" href="${esc(g.url)}" target="_blank" rel="noopener noreferrer" title="${esc(g.url)}\n(upload ${esc(g.name || "the file")} on Connect to read it here)"><span class="t">${esc(t)}</span>${esc(g.name || g.url.slice(0, 50))}${an} ↗</a>`;
      return `<span class="glink miss" data-g="${i}:${j}" title="Not uploaded"><span class="t">${esc(t)}</span>${esc(g.name)}${an} · not uploaded</span>`;
    });
    q.inline.forEach((g, j) => parts.push(`<span class="glink" data-g="${i}:${100 + j}"><span class="t">inline</span>${esc(g.col)} · ${fmtN(g.text.length)} chars</span>`));
    if (!parts.length) { const docs = q.keys.flatMap(k => model.agents.get(norm(k))?.docs || []);
      docs.slice(0, 3).forEach(d => parts.push(`<span class="glink" data-doc="${d.id}" title="Agent-level grounding doc"><span class="t">agent</span>${esc(d.name)}</span>`)); }
    if (!parts.length) return M.grounding.length ? `<div class="gline"><span class="nog">no grounding</span></div>` : "";
    return `<div class="gline">${parts.join("")}</div>`;
  }
  document.addEventListener("click", e => { const d = e.target.closest("#queries [data-doc]"); if (d) openDrawer({ doc: EL.state.docs.find(x => x.id === d.dataset.doc) }); });

  function renderColMenu(m) {
    const avail = model.qsrc.headers.filter(c => c !== M.query[0]?.c && c !== M.qId[0]?.c);
    const order = [...E.cols, ...avail.filter(c => !E.cols.includes(c))];
    m.innerHTML = `<div class="mh"><span class="lbl">Query row columns</span><a id="creset">reset</a></div><label class="opt"><input type="checkbox" id="idtoggle" ${E.idOn ? "checked" : ""}><span>${esc(M.qId[0]?.c || "Row #")} <span class="sc">id column</span></span><span></span><span></span></label>` + order.map(c => { const on = E.cols.includes(c), idx = E.cols.indexOf(c);
      return `<label class="opt"><input type="checkbox" data-col="${esc(c)}" ${on ? "checked" : ""}><span>${esc(c)} <span class="sc">${colKind(c) || ""}</span></span>${on ? `<button class="mv" data-up="${idx}" title="Move left">↑</button><button class="mv" data-dn="${idx}" title="Move right">↓</button>` : "<span></span><span></span>"}</label>`; }).join("")
      + (M.grounding.length ? `<label class="opt"><input type="checkbox" id="gtoggle" ${E.gOn ? "checked" : ""}><span>grounding links <span class="sc">under each query</span></span><span></span><span></span></label>` : "")
      + `<div class="foot">Any column of <b>${esc(model.qsrc.label)}</b> can be shown.</div>`;
    m.onclick = e => e.stopPropagation();
    const again = () => { renderQueries(); const mm = $("colbtn").nextElementSibling; renderColMenu(mm); mm.classList.add("on"); };
    m.querySelectorAll("[data-col]").forEach(i => i.onchange = () => { const c = i.dataset.col; E.cols = i.checked ? [...E.cols, c] : E.cols.filter(x => x !== c); again(); });
    m.querySelectorAll("[data-up]").forEach(b => b.onclick = e => { e.preventDefault(); const i = +b.dataset.up; if (i > 0) [E.cols[i - 1], E.cols[i]] = [E.cols[i], E.cols[i - 1]]; again(); });
    m.querySelectorAll("[data-dn]").forEach(b => b.onclick = e => { e.preventDefault(); const i = +b.dataset.dn; if (i < E.cols.length - 1) [E.cols[i + 1], E.cols[i]] = [E.cols[i], E.cols[i + 1]]; again(); });
    m.querySelector("#idtoggle").onchange = e => { E.idOn = e.target.checked; localStorage.setItem("evallens.idOn", E.idOn ? "1" : "0"); again(); };
    m.querySelector("#gtoggle") && (m.querySelector("#gtoggle").onchange = e => { E.gOn = e.target.checked; again(); });
    m.querySelector("#creset").onclick = () => { E.cols = M.rowcols.map(r => r.c); again(); };
  }

  function exportCsv() {
    const cols = [M.qId[0]?.c, M.query[0].c, M.qAgent[0]?.c, ...E.cols].filter((c, i, a) => c && a.indexOf(c) === i);
    const q = v => /[",\n\r]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v;
    const csv = [cols.map(q).join(","), ...visible.map(x => cols.map(c => q(x.row[c] ?? "")).join(","))].join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv" }));
    a.download = `evallens-${E.agent === ALL ? "all" : slug(E.agent)}-${visible.length}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- grounding drawer ----------
  let D = {};
  const groundedList = () => visible.flatMap((q, i) => [...q.grefs.map((g, j) => [i, j]), ...q.inline.map((g, j) => [i, 100 + j])].slice(0, 1));
  function openForQuery(i, j) {
    const q = visible[i]; if (!q) return;
    const g = j >= 100 ? { inline: q.inline[j - 100] } : q.grefs[j];
    openDrawer({ q, i, j, doc: g.doc, ref: g, inline: g.inline });
  }
  function defaultHlCol() { return model.qsrc.headers.find(c => /source_?record|record_?id|anchor|evidence|expected_?fact|fact/i.test(c)) || ""; }
  function openDrawer(o) {
    const keepMode = D.doc && o.doc && D.doc === o.doc ? D.mode : null;
    D = { ...o, mode: keepMode || "rendered", hl: D.hl ?? defaultHlCol(), hit: 0 };
    drawDrawer();
  }
  function docBody(doc, mode) {
    if (D.inline) { const t = D.inline.text; if (mode === "source") return `<pre>${esc(t)}</pre>`; return /<\w+[^>]*>/.test(t) ? renderHtmlDoc(t) : renderMarkdown(t); }
    if (!doc) return `<div class="miss">“${esc(D.ref?.name || "file")}” isn't uploaded.<br><br>${D.ref?.url ? `<a href="${esc(D.ref.url)}" target="_blank" rel="noopener noreferrer">Open the original ↗</a><br><br>` : ""}<button class="btn" id="dUpload">Upload grounding files…</button></div>`;
    if (doc.error) return `<div class="miss">Couldn't read ${esc(doc.name)}: ${esc(doc.error)}</div>`;
    if (mode === "source" && doc.text != null) return `<pre>${esc(doc.text)}</pre>`;
    switch (doc.kind) {
      case "md": return renderMarkdown(doc.text);
      case "html": return renderHtmlDoc(doc.text);
      case "json": return doc.json ? jsonTree(doc.json, 0, 3) : `<pre>${esc(doc.text)}</pre>`;
      case "docx": return sanitize(doc.html || "");
      case "pdf": return `<iframe src="${doc.url}#toolbar=1" title="${esc(doc.name)}"></iframe>`;
      case "image": return `<img src="${doc.url}" alt="${esc(doc.name)}">`;
      case "text": return `<pre>${esc(doc.text)}</pre>`;
      default: return `<div class="miss">Preview not available for this file type.<br><a href="${doc.url}" download="${esc(doc.name)}">Download ${esc(doc.name)}</a></div>`;
    }
  }
  function drawDrawer() {
    const { q, doc, ref, inline } = D;
    const title = inline ? `Inline · ${inline.col}` : doc ? doc.name : (ref?.name || "Grounding");
    const kind = inline ? "inline" : doc ? (doc.ext || doc.kind) : "missing";
    const canSource = inline || (doc && doc.text != null && doc.kind !== "text");
    const list = q ? groundedList() : []; const pos = q ? list.findIndex(([i]) => i === D.i) : -1;
    const hlOpts = q ? model.qsrc.headers.filter(c => c !== M.query[0].c) : [];
    $("drawer").innerHTML = `<header><div class="top"><span class="pill" style="background:var(--accent2);color:#fff;border:0">${esc(kind)}</span><b>${esc(title)}</b>${ref?.url ? `<a class="btn sm" href="${esc(ref.url)}" target="_blank" rel="noopener noreferrer">Original ↗</a>` : ""}<button class="btn sm" id="dclose">Close ✕</button></div>
        ${ref?.anchor ? `<div class="lbl" style="margin-top:4px">anchor #${esc(ref.anchor)}</div>` : ""}
        ${q ? `<div class="ctx"><span>query ${esc(q.id)}</span>${esc(q.text)}</div>` : ""}
        <div class="tools">${canSource ? `<div class="seg"><button data-m="rendered" class="${D.mode === "rendered" ? "on" : ""}">Rendered</button><button data-m="source" class="${D.mode === "source" ? "on" : ""}">Source</button></div>` : ""}
          ${q && doc?.kind !== "pdf" ? `<span class="lbl">highlight</span><select id="dhl"><option value="">—</option><option value="__q" ${D.hl === "__q" ? "selected" : ""}>query text words</option>${hlOpts.map(c => `<option ${D.hl === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select><span class="lbl" id="dhits"></span><button class="btn sm" id="dhp">‹</button><button class="btn sm" id="dhn">›</button>` : ""}</div></header>
      <div class="body" id="dbody">${docBody(doc, D.mode)}</div>
      ${q && list.length > 1 ? `<div class="nav"><button class="btn sm" id="dprev" ${pos <= 0 ? "disabled" : ""}>← prev query</button><span style="flex:1;text-align:center">${pos + 1} / ${list.length} grounded queries <span class="kbd">← →</span></span><button class="btn sm" id="dnext" ${pos >= list.length - 1 ? "disabled" : ""}>next query →</button></div>` : ""}`;
    $("drawer").classList.add("open");
    $("dclose").onclick = closeDrawer;
    $("dUpload") && ($("dUpload").onclick = () => $("docIn").click());
    $("drawer").querySelectorAll("[data-m]").forEach(b => b.onclick = () => { D.mode = b.dataset.m; drawDrawer(); });
    $("dprev") && ($("dprev").onclick = () => openForQuery(...list[pos - 1]));
    $("dnext") && ($("dnext").onclick = () => openForQuery(...list[pos + 1]));
    $("dhl") && ($("dhl").onchange = e => { D.hl = e.target.value; drawDrawer(); });
    applyHighlights();
  }
  function applyHighlights() {
    const body = $("dbody"); if (!body) return;
    let target = null;
    if (D.ref?.anchor && D.mode === "rendered") {
      const a = slug(D.ref.anchor);
      target = body.querySelector(`[id="${CSS.escape(a)}"]`) || body.querySelector(`[data-alt="${CSS.escape(a)}"]`) || [...body.querySelectorAll("h1,h2,h3,h4,h5,h6")].find(h => slug(h.textContent).startsWith(a));
      if (target) target.classList.add("hl-anchor");
    }
    let marks = [];
    if (D.q && D.hl) {
      const terms = D.hl === "__q" ? D.q.text.split(/\W+/).filter(w => w.length > 4) : termsFrom(D.q.row[D.hl]);
      marks = highlightTerms(body, terms);
    }
    if (!target && D.ref?.anchor && !marks.length) marks = highlightTerms(body, [D.ref.anchor.replace(/[-_]/g, " ")]);
    D.marks = marks;
    const hits = $("dhits"); if (hits) hits.textContent = D.hl || marks.length ? `${marks.length} hit${marks.length === 1 ? "" : "s"}` : "";
    const go = k => { if (!marks.length) return; marks.forEach(m => m.classList.remove("cur")); D.hit = (k + marks.length) % marks.length; marks[D.hit].classList.add("cur"); marks[D.hit].scrollIntoView({ block: "center" }); if (hits) hits.textContent = `${D.hit + 1} / ${marks.length} hits`; };
    $("dhp") && ($("dhp").onclick = () => go(D.hit - 1)); $("dhn") && ($("dhn").onclick = () => go(D.hit + 1));
    if (target) target.scrollIntoView({ block: "start" }); else if (marks.length) go(0);
  }
  function closeDrawer() { $("drawer").classList.remove("open"); D = { hl: D.hl }; }

  // ---------- global keys ----------
  document.addEventListener("click", e => { if (!e.target.closest(".facet,.apick")) closeMenus(); });
  document.addEventListener("keydown", e => {
    if (!$("explore").classList.contains("on")) return;
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName);
    if (e.key === "Escape") { if ($("drawer").classList.contains("open")) closeDrawer(); closeMenus(); return; }
    if (typing) return;
    if ($("drawer").classList.contains("open") && D.q) { if (e.key === "ArrowRight") $("dnext")?.click(); if (e.key === "ArrowLeft") $("dprev")?.click(); return; }
    if (e.key === "[") step(-1); else if (e.key === "]") step(1);
    else if (e.key === "/") { e.preventDefault(); $("fq").focus(); }
  });
  $("fq").addEventListener("input", EL.debounce(e => { E.q = e.target.value; E.limit = 150; renderQueries(); }, 120));
  window.addEventListener("resize", fitFilters);

  Object.assign(EL, { exploreInit: init, closeDrawer });
})();
