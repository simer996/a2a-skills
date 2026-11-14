// App bootstrap: state, file intake, navigation.
(() => {
  const { $, toast } = EL;
  EL.state = { sources: [], docs: [], M: EL.newMap(), model: null, presetInfo: null };
  const st = EL.state;
  const isEmptyMap = M => EL.ROLES.every(r => !M[r.k].length);

  async function addFiles(fileList, opts = {}) {
    const files = [...fileList].filter(f => !/^~\$|^\./.test(f.name));
    if (!files.length) return;
    $("busy").classList.add("on");
    try {
      const r = await EL.ingestFiles(files, opts);
      st.sources.push(...r.sources); st.docs.push(...r.docs);
      r.errors.forEach(e => toast(e, "warn"));
      if (isEmptyMap(st.M) && st.sources.length) {
        const p = EL.findPreset(st);
        if (p) { st.M = p.M; st.presetInfo = p; }
        else { st.M = EL.autoMap(st); }
      } else if (!st.M.card.length && r.docs.some(d => d.isCard)) st.M.card = [{ d: "docs:json" }];
      EL.connectRefresh();
      const msg = [r.sources.length && `${r.sources.length} table${r.sources.length > 1 ? "s" : ""}`, r.docs.length && `${r.docs.length} doc${r.docs.length > 1 ? "s" : ""}`].filter(Boolean).join(" + ");
      if (msg) toast(`Loaded ${msg}${st.presetInfo ? " · saved mapping applied" : st.M.query.length ? " · auto-mapped" : ""}`);
      if ($("explore").classList.contains("on") && st.M.query.length) EL.exploreInit();
    } finally { $("busy").classList.remove("on"); }
  }
  EL.addFiles = addFiles;
  EL.removeSource = id => { st.sources = st.sources.filter(s => s.id !== id); EL.ROLES.forEach(r => st.M[r.k] = st.M[r.k].filter(x => x.s !== id)); EL.connectRefresh(); };
  EL.removeDocs = () => { st.docs.forEach(d => d.url && URL.revokeObjectURL(d.url)); st.docs = []; EL.ROLES.forEach(r => st.M[r.k] = st.M[r.k].filter(x => !x.d)); EL.connectRefresh(); };

  EL.show = v => {
    if (v === "explore" && !st.M.query.length) return;
    $("nav").querySelectorAll("button").forEach(x => x.classList.toggle("on", x.dataset.v === v));
    document.querySelectorAll(".view").forEach(x => x.classList.toggle("on", x.id === v));
    if (v === "explore") EL.exploreInit(); else EL.closeDrawer?.();
    window.scrollTo({ top: 0 });
  };
  EL.onModelChange = () => { const m = st.model; $("mastinfo").textContent = m?.qsrc ? `${m.stats.queries} queries · ${m.stats.agents} agents` : ""; };

  $("nav").querySelectorAll("button").forEach(b => b.onclick = () => EL.show(b.dataset.v));
  const dz = $("dz");
  dz.onclick = () => $("fileIn").click();
  $("pickFiles").onclick = () => $("fileIn").click();
  $("pickFolder").onclick = () => $("folderIn").click();
  $("pickDocs").onclick = () => $("docIn").click();
  $("fileIn").onchange = e => { addFiles(e.target.files); e.target.value = ""; };
  $("folderIn").onchange = e => { addFiles(e.target.files); e.target.value = ""; };
  $("docIn").onchange = e => { addFiles(e.target.files, { asDocs: true }); e.target.value = ""; };
  ["dragenter", "dragover"].forEach(t => document.addEventListener(t, e => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); dz.classList.add("over"); } }));
  document.addEventListener("dragleave", e => { if (!e.relatedTarget) dz.classList.remove("over"); });
  document.addEventListener("drop", async e => {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault(); dz.classList.remove("over");
    const files = await filesFromDrop(e.dataTransfer);
    if ($("explore").classList.contains("on")) EL.show("connect");
    addFiles(files);
  });
  // Supports dropped folders (webkitGetAsEntry) as well as plain files.
  async function filesFromDrop(dt) {
    const entries = [...dt.items || []].map(i => i.webkitGetAsEntry?.()).filter(Boolean);
    if (!entries.length) return [...dt.files];
    const out = [];
    const walk = async ent => {
      if (ent.isFile) out.push(await new Promise((res, rej) => ent.file(res, rej)));
      else if (ent.isDirectory) { const rd = ent.createReader(); let batch; do { batch = await new Promise((res, rej) => rd.readEntries(res, rej)); for (const b of batch) await walk(b); } while (batch.length); }
    };
    for (const e of entries) await walk(e);
    return out;
  }

  EL.connectInit();
  EL.connectRefresh();
})();
