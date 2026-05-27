const geneSearch = document.getElementById("gene-search");
const geneList = document.getElementById("gene-list");
const variantSearch = document.getElementById("variant-search");
const variantSelect = document.getElementById("variant-select");
const variantList = document.getElementById("variant-list");
const detail = document.getElementById("detail");
const statsEl = document.getElementById("stats");
const datasetNav = document.getElementById("dataset-nav");
const browseDesc = document.getElementById("browse-desc");
const prototypeFilters = document.getElementById("prototype-filters");

const DATASETS = {
  full: {
    label: "Full catalog",
    gz: "gene_variant_dict.json.gz",
    json: "gene_variant_dict.json",
    desc: "Search genes and variants from the curated list",
    isPrototype: false,
  },
  prototype: {
    label: "Prototype · 200 variants",
    gz: null,
    json: "gene_variant_dict_prototype_200.json",
    desc: "First 200 variants · strict functional extraction · review coverage",
    isPrototype: true,
  },
  prototype2000: {
    label: "Prototype · 2000 variants",
    gz: null,
    json: "gene_variant_dict_prototype_2000.json",
    desc: "First 2000 variants · variant PubMed search · strict functional extraction",
    isPrototype: true,
  },
};

let DATA = null;
let VARIANT_INDEX = [];
let selectedGene = null;
let selectedVariant = null;
let geneDebounce = null;
let variantDebounce = null;
let activeDataset = "full";
let prototypeFilter = "all";

const CONSENSUS_LABEL = {
  oncogenic: "Oncogenic",
  not_oncogenic: "Not oncogenic",
  uncertain: "Uncertain",
  no_data: "No data",
};

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}`);
  return JSON.parse(await res.text());
}

async function parseGzipResponse(response) {
  if (typeof DecompressionStream !== "undefined") {
    const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
    const text = await new Response(stream).text();
    return JSON.parse(text);
  }
  if (typeof pako !== "undefined") {
    const buf = await response.arrayBuffer();
    const text = pako.ungzip(new Uint8Array(buf), { to: "string" });
    return JSON.parse(text);
  }
  throw new Error("No gzip decoder (need modern browser or pako CDN)");
}

async function loadDatasetConfig(cfg) {
  if (cfg.gz) {
    const gzRes = await fetch(cfg.gz);
    if (gzRes.ok) {
      try {
        return await parseGzipResponse(gzRes);
      } catch (e) {
        console.warn("gzip decode failed, trying plain JSON", e);
      }
    }
  }
  return fetchJson(cfg.json);
}

function buildVariantIndex() {
  VARIANT_INDEX = [];
  for (const [gene, variants] of Object.entries(DATA)) {
    for (const [variant, entry] of Object.entries(variants)) {
      const s = entry.summary || {};
      const nRefs = s.n_references ?? (entry.references || []).length;
      VARIANT_INDEX.push({
        gene,
        variant,
        consensus: s.consensus || (nRefs ? "uncertain" : "no_data"),
        nRefs,
      });
    }
  }
  VARIANT_INDEX.sort((a, b) =>
    a.gene.localeCompare(b.gene) || a.variant.localeCompare(b.variant)
  );
}

function renderStats() {
  const cfg = DATASETS[activeDataset];
  const nGenes = Object.keys(DATA).length;
  let nVar = 0;
  let nRef = 0;
  let nWithEvidence = 0;
  for (const g of Object.values(DATA)) {
    nVar += Object.keys(g).length;
    for (const v of Object.values(g)) {
      const refs = v.references || [];
      nRef += refs.length;
      if (refs.length > 0) nWithEvidence += 1;
    }
  }

  let html = `
    <span class="stat-chip genes">${nGenes.toLocaleString()} genes</span>
    <span class="stat-chip variants">${nVar.toLocaleString()} variants</span>
    <span class="stat-chip refs">${nRef.toLocaleString()} references</span>`;

  if (cfg.isPrototype) {
    html += `<span class="stat-chip coverage">${nWithEvidence} / ${nVar} with evidence</span>`;
  }

  statsEl.innerHTML = html;

  if (cfg.isPrototype) {
    const allBtn = prototypeFilters.querySelector('[data-filter="all"]');
    if (allBtn) allBtn.textContent = `All ${nVar.toLocaleString()}`;
  }
}

function passesPrototypeFilter(item) {
  if (prototypeFilter === "has_evidence") return item.nRefs > 0;
  if (prototypeFilter === "no_data") return item.nRefs === 0;
  return true;
}

function genesMatching(q) {
  let names = Object.keys(DATA).sort();
  if (activeDataset === "prototype") {
    const visible = new Set(
      VARIANT_INDEX.filter(passesPrototypeFilter).map((i) => i.gene)
    );
    names = names.filter((g) => visible.has(g));
  }
  if (!q) return names.slice(0, 500);
  const u = q.toUpperCase();
  return names.filter((g) => g.toUpperCase().includes(u)).slice(0, 500);
}

function variantsMatching(q) {
  let pool = VARIANT_INDEX.filter(passesPrototypeFilter);
  if (selectedGene) {
    pool = pool.filter((item) => item.gene === selectedGene);
  }
  if (!q) return pool.slice(0, 500);
  const u = q.toUpperCase();
  return pool
    .filter(
      (item) =>
        item.variant.toUpperCase().includes(u) ||
        item.gene.toUpperCase().includes(u)
    )
    .slice(0, 500);
}

function badgeClass(consensus) {
  return `badge ${(consensus || "no_data").replace(/ /g, "_")}`;
}
function claimClass(c) {
  return `claim ${c || "uncertain"}`;
}
function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

function parseCriterion(text) {
  const m = (text || "").match(/^\[(OS2|BS2)\]\s*/);
  return m ? m[1] : null;
}

function cleanEvidence(text) {
  return (text || "").replace(/^\[(OS2|BS2)\]\s*/, "").trim();
}

function renderGeneList(q = "") {
  geneList.innerHTML = "";
  const matches = genesMatching(q);
  if (!matches.length) {
    geneList.innerHTML = '<li class="empty-hint">No genes match</li>';
    return;
  }
  matches.forEach((g) => {
    const li = document.createElement("li");
    li.textContent = g;
    li.setAttribute("role", "option");
    li.addEventListener("click", () => selectGene(g, li));
    if (g === selectedGene) li.classList.add("active");
    geneList.appendChild(li);
  });
}

function fillVariantSelect(items) {
  variantSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = items.length
    ? `Choose variant (${items.length})…`
    : "No variants match";
  variantSelect.appendChild(placeholder);
  items.forEach((item) => {
    const label = CONSENSUS_LABEL[item.consensus] || item.consensus;
    const opt = document.createElement("option");
    opt.value = `${item.gene}|${item.variant}`;
    opt.textContent = selectedGene
      ? `${item.variant} · ${item.nRefs} refs · ${label}`
      : `${item.gene} · ${item.variant} · ${item.nRefs} refs · ${label}`;
    if (item.gene === selectedGene && item.variant === selectedVariant) {
      opt.selected = true;
    }
    variantSelect.appendChild(opt);
  });
  variantSelect.disabled = items.length === 0;
}

function renderVariantList(q = "") {
  const matches = variantsMatching(q);
  fillVariantSelect(matches);

  variantList.innerHTML = "";
  if (!matches.length) {
    variantList.innerHTML = '<li class="empty-hint">No variants match</li>';
    return;
  }
  matches.forEach((item) => {
    const li = document.createElement("li");
    const label = CONSENSUS_LABEL[item.consensus] || item.consensus;
    li.innerHTML = selectedGene
      ? `<span class="variant-name">${escapeHtml(item.variant)}</span>
         <span class="variant-meta">${item.nRefs} refs · ${escapeHtml(label)}</span>`
      : `<span class="variant-name">${escapeHtml(item.gene)} · ${escapeHtml(item.variant)}</span>
         <span class="variant-meta">${item.nRefs} refs · ${escapeHtml(label)}</span>`;
    li.setAttribute("role", "option");
    if (item.nRefs === 0) li.classList.add("no-data");
    li.addEventListener("click", () => selectVariant(item.gene, item.variant, li));
    if (item.gene === selectedGene && item.variant === selectedVariant) {
      li.classList.add("active");
    }
    variantList.appendChild(li);
  });
}

function selectGene(gene, liEl) {
  selectedGene = gene;
  selectedVariant = null;
  geneSearch.value = gene;
  geneList.querySelectorAll("li").forEach((el) => el.classList.remove("active"));
  if (liEl) liEl.classList.add("active");
  variantSearch.disabled = false;
  variantSearch.placeholder = `Search variants in ${gene}…`;
  variantSearch.value = "";
  renderVariantList("");
  detail.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">◎</div>
      <h3>${Object.keys(DATA[gene]).length} variant(s) for ${gene}</h3>
      <p>Search, pick from the list, or use the dropdown.</p>
    </div>`;
}

function selectVariant(gene, variant, liEl) {
  if (gene !== selectedGene) {
    selectedGene = gene;
    geneSearch.value = gene;
    renderGeneList(geneSearch.value.trim());
    geneList.querySelectorAll("li").forEach((el) => {
      el.classList.toggle("active", el.textContent === gene);
    });
    variantSearch.placeholder = `Search variants in ${gene}…`;
  }
  selectedVariant = variant;
  variantSearch.value = variant;
  renderVariantList(variantSearch.value.trim());
  if (liEl) {
    variantList.querySelectorAll("li").forEach((el) => el.classList.remove("active"));
    liEl.classList.add("active");
  }
  loadVariant(gene, variant);
}

function loadVariant(gene, variant) {
  const entry = DATA[gene][variant];
  const s = entry.summary || {};
  const refs = entry.references || [];
  const consensus = s.consensus || (refs.length ? "uncertain" : "no_data");
  const label = CONSENSUS_LABEL[consensus] || consensus.replace(/_/g, " ");

  let html = `
    <div class="variant-header">
      <div class="variant-title">
        <span class="gene">${escapeHtml(gene)}</span>
        <span class="sep">·</span>
        <code class="variant">${escapeHtml(variant)}</code>
        <span class="${badgeClass(consensus)}">${escapeHtml(label)}</span>
      </div>
      <div class="summary-grid">
        <span class="summary-pill"><strong>${s.n_references ?? refs.length}</strong> references</span>
        <span class="summary-pill"><strong>${s.n_oncogenic_yes ?? 0}</strong> oncogenic</span>
        <span class="summary-pill"><strong>${s.n_oncogenic_no ?? 0}</strong> not oncogenic</span>
      </div>
    </div>`;

  if (!refs.length) {
    html += `
      <div class="empty-state inline-empty">
        <div class="empty-icon">—</div>
        <h3>No functional evidence found</h3>
        <p>No passing OS2/BS2 literature references for this variant in the prototype run.</p>
      </div>`;
    detail.innerHTML = html;
    return;
  }

  html += `<p class="refs-heading">${refs.length} literature reference${refs.length === 1 ? "" : "s"}</p>`;

  refs.forEach((r) => {
    const types = Array.isArray(r.evidence_type) ? r.evidence_type : [];
    const url = `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`;
    const crit = parseCriterion(r.functional_evidence);
    const evidence = cleanEvidence(r.functional_evidence);
    html += `
      <article class="ref-card">
        <div class="ref-head">
          <a class="pmid-link" href="${url}" target="_blank" rel="noopener">↗ PMID ${escapeHtml(r.pmid)}</a>
          <span class="${claimClass(r.oncogenic_claim)}">${escapeHtml(r.oncogenic_claim || "uncertain")}</span>
          ${crit ? `<span class="criterion-tag">${crit}</span>` : ""}
          ${r.quote_validated
            ? '<span class="validated">✓ validated quote</span>'
            : '<span class="not-validated">unvalidated quote</span>'}
        </div>
        <p class="evidence">${escapeHtml(evidence)}</p>
        <blockquote class="quote">${escapeHtml(r.verbatim_quote)}</blockquote>
        ${types.length ? `<div class="tags">${types.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
      </article>`;
  });
  detail.innerHTML = html;
}

async function switchDataset(key) {
  activeDataset = key;
  selectedGene = null;
  selectedVariant = null;
  prototypeFilter = "all";

  datasetNav.querySelectorAll(".dataset-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.dataset === key);
  });

  const cfg = DATASETS[key];
  browseDesc.textContent = cfg.desc;
  prototypeFilters.classList.toggle("hidden", !cfg.isPrototype);
  prototypeFilters.querySelectorAll(".filter-chip").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === "all");
  });

  statsEl.innerHTML = '<span class="stat-chip loading">Loading dataset…</span>';
  detail.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">⎔</div>
      <h3>Loading ${escapeHtml(cfg.label)}…</h3>
    </div>`;

  try {
    DATA = await loadDatasetConfig(cfg);
    buildVariantIndex();
    renderStats();
    geneSearch.value = "";
    variantSearch.value = "";
    variantSearch.disabled = false;
    variantSearch.placeholder = "p.Val600Glu, V600E, c.1799…";
    renderGeneList();
    renderVariantList();
    detail.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⎔</div>
        <h3>Select a gene &amp; variant</h3>
        <p>Evidence cards with PubMed links and verbatim quotes will appear here.</p>
      </div>`;
  } catch (e) {
    console.error(e);
    statsEl.innerHTML = `<span class="stat-chip" style="color:var(--no)">Load error</span>`;
    detail.innerHTML = `<div class="empty-state"><h3>Could not load ${escapeHtml(cfg.label)}</h3><p>${escapeHtml(e.message)}</p></div>`;
  }
}

geneSearch.addEventListener("input", () => {
  clearTimeout(geneDebounce);
  geneDebounce = setTimeout(() => renderGeneList(geneSearch.value.trim()), 150);
});

variantSearch.addEventListener("input", () => {
  clearTimeout(variantDebounce);
  variantDebounce = setTimeout(() => renderVariantList(variantSearch.value.trim()), 150);
});

variantSelect.addEventListener("change", () => {
  const val = variantSelect.value;
  if (!val) return;
  const [gene, variant] = val.split("|");
  selectVariant(gene, variant, null);
});

datasetNav.addEventListener("click", (e) => {
  const btn = e.target.closest(".dataset-tab");
  if (!btn || btn.dataset.dataset === activeDataset) return;
  switchDataset(btn.dataset.dataset);
});

prototypeFilters.addEventListener("click", (e) => {
  const btn = e.target.closest(".filter-chip");
  if (!btn) return;
  prototypeFilter = btn.dataset.filter;
  prototypeFilters.querySelectorAll(".filter-chip").forEach((el) => {
    el.classList.toggle("active", el === btn);
  });
  selectedVariant = null;
  renderGeneList(geneSearch.value.trim());
  renderVariantList(variantSearch.value.trim());
  if (selectedGene) {
    detail.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">◎</div>
        <h3>Filtered variant list updated</h3>
        <p>Pick a variant to review evidence.</p>
      </div>`;
  }
});

switchDataset("full");
