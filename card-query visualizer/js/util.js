// Shared helpers. Classic script (no modules) so the app works from file://.
window.EL = window.EL || {};
(() => {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = id => document.getElementById(id);
  const slug = s => String(s ?? "").toLowerCase().replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const baseName = s => { let b = String(s ?? "").split("#")[0].split("?")[0].split(/[\\/]/).pop(); try { b = decodeURIComponent(b); } catch {} return b.trim(); };
  const extOf = s => (baseName(s).match(/\.([a-z0-9]{1,5})$/i) || [])[1]?.toLowerCase() || "";
  const isUrl = s => /^https?:\/\/\S+$/i.test(String(s).trim());
  const FILE_RX = /^[^\s\\/:*?"<>|][^\\/:*?"<>|\n]{0,200}\.(md|markdown|aspx|html?|txt|pdf|docx|json|csv|tsv|xml|yaml|yml)(#\S*)?$/i;
  const isFileRef = s => FILE_RX.test(String(s).trim());
  const splitMulti = s => String(s ?? "").split(/\s*[;|\n]\s*|\s*,\s*(?=[^\s,])/).map(x => x.trim()).filter(Boolean);
  const fmtN = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n);
  const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // Lenient JSON: strips BOM, smart quotes and trailing commas before giving up.
  function parseJSON(raw) {
    if (raw == null) return { ok: false, err: "empty" };
    let s = String(raw).trim().replace(/^\uFEFF/, "");
    if (!s) return { ok: false, err: "empty" };
    if (!/^[\[{]/.test(s)) return { ok: false, err: "not JSON" };
    try { return { ok: true, v: JSON.parse(s) }; } catch (e1) {
      try { return { ok: true, v: JSON.parse(s.replace(/[\u201C\u201D]/g, '"').replace(/,\s*([}\]])/g, "$1")), fixed: true }; }
      catch { return { ok: false, err: e1.message + (s.length >= 32767 ? " (cell hit Excel's 32,767-char limit — likely truncated)" : "") }; }
    }
  }

  function jsonTree(v, depth = 0, open = 2) {
    if (v === null) return `<span class="jt-null">null</span>`;
    if (typeof v === "string") return `<span class="jt-str">"${esc(v)}"</span>`;
    if (typeof v === "number") return `<span class="jt-num">${v}</span>`;
    if (typeof v === "boolean") return `<span class="jt-bool">${v}</span>`;
    const isArr = Array.isArray(v);
    const entries = isArr ? v.map((x, i) => [i, x]) : Object.entries(v);
    const [o, c] = isArr ? ["[", "]"] : ["{", "}"];
    if (!entries.length) return `${o}${c}`;
    const body = entries.map(([k, x]) => `<div>${isArr ? "" : `<span class="jt-key">"${esc(k)}"</span>: `}${jsonTree(x, depth + 1, open)}</div>`).join("");
    return `<details class="jt" ${depth < open ? "open" : ""}><summary>${o}<span class="jt-count">${entries.length} ${isArr ? "items" : "keys"}</span></summary><div class="jt-body">${body}</div>${c}</details>`;
  }

  const looksLikeCard = v => v && typeof v === "object" && !Array.isArray(v) &&
    ("skills" in v || "functions" in v || "name_for_human" in v || "capabilities" in v || "supportedInterfaces" in v || ("name" in v && "description" in v));

  // Normalizes A2A agent cards, plugin manifests and unknown JSON into one readable shape.
  function normalizeCard(m) {
    const used = new Set();
    const take = k => { used.add(k); return m[k]; };
    const isPlugin = "name_for_human" in m || "functions" in m || "schema_version" in m;
    const n = { kind: isPlugin ? "Plugin manifest" : ("skills" in m || "supportedInterfaces" in m || "protocolVersion" in m) ? "A2A agent card" : "JSON", meta: {}, flags: [], items: [] };
    n.title = take("name_for_human") || take("name") || take("title") || m.id || "Untitled";
    used.add("name");
    n.subtitle = take("description_for_human") || take("description") || "";
    used.add("description");
    n.modelDescription = take("description_for_model");
    n.version = take("version") || take("schema_version");
    const iface = take("supportedInterfaces");
    n.url = take("url") || (Array.isArray(iface) && iface[0]?.url) || m.runtimes?.[0]?.spec?.url;
    if (take("protocolVersion")) n.meta.protocol = m.protocolVersion;
    if (m.provider) { used.add("provider"); n.meta.provider = m.provider.organization || m.provider.name || JSON.stringify(m.provider); }
    if (m.namespace) { used.add("namespace"); n.meta.namespace = m.namespace; }
    if (Array.isArray(iface) && iface.length) n.meta.interfaces = iface.map(i => [i.protocolBinding || i.transport || i.type, i.url].filter(Boolean).join(" · ")).join("\n");
    if (m.defaultInputModes) { used.add("defaultInputModes"); n.meta.input = [].concat(m.defaultInputModes).join(", "); }
    if (m.defaultOutputModes) { used.add("defaultOutputModes"); n.meta.output = [].concat(m.defaultOutputModes).join(", "); }
    if (m.runtimes) { used.add("runtimes"); n.meta.runtime = m.runtimes.map(r => r.type + (r.auth?.type ? ` (${r.auth.type})` : "")).join(", "); }
    const caps = take("capabilities");
    if (caps && typeof caps === "object" && !Array.isArray(caps)) n.flags = Object.entries(caps).filter(([, v]) => typeof v === "boolean").map(([k, v]) => ({ k, v }));
    const skills = take("skills"), fns = take("functions"), tools = Array.isArray(m.tools) ? take("tools") : null;
    const list = skills || fns || tools || [];
    n.itemLabel = skills ? "Skills" : fns ? "Functions" : tools ? "Tools" : "Skills";
    n.items = (Array.isArray(list) ? list : []).map(s => typeof s === "string" ? { id: s, name: s, description: "", tags: [], examples: [] } : ({
      id: s.id || s.name || "", name: s.name || s.id || "", description: s.description || "",
      tags: s.tags || Object.keys(s.parameters?.properties || {}), examples: s.examples || [],
      confirm: !!s.capabilities?.confirmation
    }));
    n.rest = Object.fromEntries(Object.entries(m).filter(([k]) => !used.has(k)));
    return n;
  }

  // ---- grounding document rendering (sanitized; scripts never execute) ----
  const PURIFY = { FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "input", "button", "link", "meta", "base"], FORBID_ATTR: ["style"] };
  const sanitize = html => window.DOMPurify ? DOMPurify.sanitize(html, PURIFY) : esc(html);
  function renderMarkdown(text) {
    const html = window.marked ? marked.parse(String(text), { gfm: true, breaks: false }) : `<pre>${esc(text)}</pre>`;
    return addHeadingIds(sanitize(html));
  }
  function renderHtmlDoc(text) {
    let s = String(text).replace(/<%[\s\S]*?%>/g, "").replace(/<script[\s\S]*?<\/script>/gi, "");
    const body = s.match(/<body[^>]*>([\s\S]*)<\/body>/i); if (body) s = body[1];
    return addHeadingIds(sanitize(s));
  }
  function addHeadingIds(html) {
    const t = document.createElement("div"); t.innerHTML = html;
    t.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach(h => { if (!h.id) h.id = slug(h.textContent); const ab = (h.textContent.match(/\(([^)]+)\)/) || [])[1]; if (ab) h.dataset.alt = slug(ab); });
    t.querySelectorAll("a[href]").forEach(a => { if (!/^#/.test(a.getAttribute("href"))) { a.target = "_blank"; a.rel = "noopener noreferrer"; } });
    return t.innerHTML;
  }

  // Highlights terms in an element's text nodes; returns the created <mark> elements.
  function highlightTerms(root, terms) {
    terms = [...new Set(terms.map(t => t.trim()).filter(t => t.length >= 3 && t.length <= 120))].sort((a, b) => b.length - a.length);
    if (!terms.length) return [];
    const rx = new RegExp(terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const nodes = [];
    while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) nodes.push(walker.currentNode);
    const marks = [];
    for (const node of nodes) {
      const txt = node.nodeValue; rx.lastIndex = 0; if (!rx.test(txt)) continue; rx.lastIndex = 0;
      const frag = document.createDocumentFragment(); let last = 0, m;
      while ((m = rx.exec(txt))) { frag.append(txt.slice(last, m.index)); const mk = document.createElement("mark"); mk.className = "hit"; mk.textContent = m[0]; frag.append(mk); marks.push(mk); last = m.index + m[0].length; if (!m[0].length) rx.lastIndex++; }
      frag.append(txt.slice(last)); node.replaceWith(frag);
    }
    return marks;
  }
  // Breaks "a; b, c" / "agent--rec123" style cells into highlightable terms.
  const termsFrom = v => String(v ?? "").split(/[;|\n]|,\s|\s--\s|--/).flatMap(t => { t = t.trim(); const out = [t]; const m = t.match(/^[a-z][\w ]{0,30}?\s(\S*\d\S*)$/i); if (m) out.push(m[1]); return out; });

  function toast(msg, kind = "") {
    const t = document.createElement("div"); t.className = "toast " + kind; t.textContent = msg; document.body.append(t);
    setTimeout(() => t.classList.add("out"), 3200); setTimeout(() => t.remove(), 3800);
  }

  const PALETTE = ["#c2410c", "#0f766e", "#1d4ed8", "#9333ea", "#a16207", "#be185d", "#4d7c0f", "#475569", "#0e7490", "#7c2d12", "#6d28d9", "#15803d"];

  Object.assign(EL, { esc, $, slug, baseName, extOf, isUrl, isFileRef, splitMulti, fmtN, debounce, parseJSON, jsonTree, looksLikeCard, normalizeCard,
    sanitize, renderMarkdown, renderHtmlDoc, highlightTerms, termsFrom, toast, PALETTE });
})();
