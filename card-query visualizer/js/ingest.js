// File ingestion: tables (csv/tsv/xlsx/xls) become sources (one per sheet); everything else becomes a doc.
(() => {
  const { extOf, parseJSON, looksLikeCard, isUrl, isFileRef, slug } = EL;
  const TABLE_EXT = ["csv", "tsv", "tab", "xlsx", "xlsm", "xls", "ods"];
  const TEXT_EXT = ["md", "markdown", "txt", "aspx", "html", "htm", "json", "xml", "yaml", "yml", "csv", "tsv"];
  let seq = 0;

  const readText = f => f.text();
  const readBuf = f => f.arrayBuffer();

  async function ingestFiles(files, opts = {}) {
    const out = { sources: [], docs: [], errors: [] };
    for (const f of files) {
      const ext = extOf(f.name);
      try {
        if (TABLE_EXT.includes(ext) && !opts.asDocs) out.sources.push(...await readTable(f, ext));
        else out.docs.push(await readDoc(f, ext));
      } catch (e) { out.errors.push(`${f.name}: ${e.message}`); }
    }
    return out;
  }

  async function readTable(f, ext) {
    let wb;
    if (["csv", "tsv", "tab"].includes(ext)) {
      const text = (await readText(f)).replace(/^\uFEFF/, "");
      const nl = text.indexOf("\n"); const firstLine = nl < 0 ? text : text.slice(0, nl);
      const tabs = (firstLine.match(/\t/g) || []).length, commas = (firstLine.match(/,/g) || []).length;
      wb = XLSX.read(text, { type: "string", raw: true, FS: ext !== "csv" || tabs > commas ? "\t" : ","  });
    } else {
      wb = XLSX.read(await readBuf(f), { type: "array", raw: false, cellDates: false });
    }
    const sources = [];
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false, blankrows: false });
      if (!aoa.length) continue;
      // header row = first row with >=2 non-empty cells (skips title rows)
      let h = aoa.findIndex(r => r.filter(c => String(c).trim()).length >= 2); if (h < 0) h = 0;
      const seen = {};
      const headers = aoa[h].map((c, i) => { let n = String(c).trim() || `Column ${i + 1}`; if (seen[n]) n = `${n} (${++seen[n]})`; else seen[n] = 1; return n; });
      const rows = aoa.slice(h + 1).map(r => Object.fromEntries(headers.map((k, i) => [k, r[i] == null ? "" : String(r[i])])))
        .filter(r => headers.some(k => r[k].trim()));
      if (!rows.length) continue;
      const multi = wb.SheetNames.length > 1;
      sources.push({ id: "s" + (++seq), file: f.name, sheet: multi ? name : null, label: multi ? `${f.name} › ${name}` : f.name, ext, headers, rows, columns: headers.map(c => profile(c, rows)) });
    }
    if (!sources.length) throw new Error("no rows found");
    return sources;
  }

  // Column profile drives type badges and auto-mapping.
  function profile(name, rows) {
    const vals = rows.map(r => r[name]).filter(v => v.trim());
    const sample = vals.slice(0, 300);
    const distinct = new Set(vals).size;
    const frac = fn => sample.length ? sample.filter(fn).length / sample.length : 0;
    const avgLen = sample.length ? sample.reduce((a, v) => a + v.length, 0) / sample.length : 0;
    let kind = "text", cardLike = 0;
    const jsonFrac = frac(v => /^\s*[\[{]/.test(v));
    if (jsonFrac >= 0.5) {
      const parsed = sample.slice(0, 40).map(v => parseJSON(v));
      cardLike = parsed.filter(p => p.ok && looksLikeCard(p.v)).length / Math.max(1, parsed.length);
      kind = "json";
    } else if (frac(v => v.split(/\s*[;\n]\s*/).every(isUrl)) >= 0.6) kind = "url";
    else if (frac(v => v.split(/\s*[;\n]\s*/).every(isFileRef)) >= 0.6) kind = "file";
    else if (frac(v => /^-?\d+(\.\d+)?%?$/.test(v)) >= 0.9) kind = "num";
    else if (avgLen > 140 || frac(v => v.includes("\n")) > 0.3) kind = /<\/?(p|div|h\d|table|ul)\b/i.test(sample.slice(0, 20).join(" ")) ? "html" : (sample.some(v => /^#{1,4} |\n- |\*\*/.test(v)) ? "md" : "long");
    else if (distinct === vals.length && vals.length > 5 && avgLen < 60 && frac(v => !/\s/.test(v)) > 0.9) kind = "id";
    else if (distinct <= Math.max(15, rows.length * 0.08) && avgLen < 60) kind = "enum";
    const multi = kind !== "json" && frac(v => /[;|]/.test(v) || /^[\w.-]+(,\s*[\w.-]+)+$/.test(v)) > 0.05;
    const fileExts = kind === "file" ? [...new Set(sample.map(v => extOf(v)))] : [];
    const qmark = frac(v => /\?\s*$/.test(v));
    return { name, kind, qmark, filled: vals.length, distinct, avgLen, cardLike, multi, fileExts, example: (vals[0] || "").slice(0, 160) };
  }

  async function readDoc(f, ext) {
    const d = { id: "d" + (++seq), name: f.name, path: f.webkitRelativePath || f.name, base: f.name.toLowerCase(), slug: slug(f.name), ext, size: f.size };
    if (ext === "docx") {
      d.kind = "docx";
      try { const r = await mammoth.convertToHtml({ arrayBuffer: await readBuf(f) }); d.html = r.value; } catch (e) { d.error = e.message; }
    } else if (ext === "pdf") {
      d.kind = "pdf"; d.url = URL.createObjectURL(f);
    } else if (TEXT_EXT.includes(ext) || f.type.startsWith("text/") || !ext) {
      d.text = (await readText(f)).replace(/^\uFEFF/, "");
      d.kind = ext === "json" ? "json" : ["md", "markdown"].includes(ext) ? "md" : ["aspx", "html", "htm", "xml"].includes(ext) ? "html" : "text";
      if (d.kind === "json") { const p = parseJSON(d.text); d.json = p.ok ? p.v : null; d.jsonErr = p.ok ? null : p.err; d.isCard = p.ok && looksLikeCard(p.v); }
    } else if (/^image\//.test(f.type)) { d.kind = "image"; d.url = URL.createObjectURL(f); }
    else { d.kind = "binary"; d.url = URL.createObjectURL(f); }
    return d;
  }

  Object.assign(EL, { ingestFiles, TABLE_EXT });
})();
