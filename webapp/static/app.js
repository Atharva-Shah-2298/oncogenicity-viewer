const geneSearch = document.getElementById("gene-search");
const geneList = document.getElementById("gene-list");
const variantSearch = document.getElementById("variant-search");
const variantList = document.getElementById("variant-list");
const detail = document.getElementById("detail");
const statsEl = document.getElementById("stats");

let DATA = null;
let VARIANT_INDEX = [];
let selectedGene = null;
let selectedVariant = null;
let geneDebounce = null;
let variantDebounce = null;

const CONSENSUS_LABEL = {
  oncogenic: "Oncogenic",
  not_oncogenic: "Not oncogenic",
  uncertain: "Uncertain",
  no_data: "No data",
};

async function loadData() {
  const r = await fetch("gene_variant_dict.json.gz");
  if (!r.ok) throw new Error("Failed to load gene_variant_dict.json.gz");
  const buf = await r.arrayBuffer();
  const json = pako.ungzip(new Uint8Array(buf), { to: "string" });
  DATA = JSON.parse(json);
  buildVariantIndex();
  const nGenes = Object.keys(DATA).length;
  let nVar = 0, nRef = 0;
  for (const g of Object.values(DATA)) {
    nVar += Object.keys(g).length;
    for (const v of Object.values(g)) {
      nRef += (v.references || []).length;
    }
  }
  statsEl.innerHTML = `
    <span class="stat-chip genes">${nGenes.toLocaleString()} genes</span>
    <span class="stat-chip variants">${nVar.toLocaleString()} variants</span>
    <span class="stat-chip refs">${nRef.toLocaleString()} references</span>`;
}

function buildVariantIndex() {
  VARIANT_INDEX = [];
  for (const [gene, variants] of Object.entries(DATA)) {
    for (const [variant, entry] of Object.entries(variants)) {
      const s = entry.summary || {};
      VARIANT_INDEX.push({
        gene,
        variant,
        consensus: s.consensus || "no_data",
        nRefs: s.n_references ?? (entry.references || []).length,
      });
    }
  }
  VARIANT_INDEX.sort((a, b) => a.variant.localeCompare(b.variant));
}

function genesMatching(q) {
  const names = Object.keys(DATA).sort();
  if (!q) return names.slice(0, 500);
  const u = q.toUpperCase();
  return names.filter((g) => g.toUpperCase().includes(u)).slice(0, 500);
}

function variantsMatching(q) {
  let pool = VARIANT_INDEX;
  if (selectedGene) {
    pool = pool.filter((item) => item.gene === selectedGene);
  }
  if (!q) return pool.slice(0, 500);
  const u = q.toUpperCase();
  return pool
    .filter(
      (item) =>
        item.variant.toUpperCase().includes(u) ||
        item.gene.toUpperCase().includes(u) ||
        `${item.gene} ${item.variant}`.toUpperCase().includes(u)
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

function renderVariantList(q = "") {
  variantList.innerHTML = "";
  const matches = variantsMatching(q);
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
  renderVariantList(variantSearch.value.trim());
  detail.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">◎</div>
      <h3>${Object.keys(DATA[gene]).length} variant(s) for ${gene}</h3>
      <p>Search or pick a variant to view evidence.</p>
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
  const consensus = s.consensus || "no_data";
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
    </div>
    <p class="refs-heading">${refs.length} literature reference${refs.length === 1 ? "" : "s"}</p>`;

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

geneSearch.addEventListener("input", () => {
  clearTimeout(geneDebounce);
  geneDebounce = setTimeout(() => renderGeneList(geneSearch.value.trim()), 150);
});

variantSearch.addEventListener("input", () => {
  clearTimeout(variantDebounce);
  variantDebounce = setTimeout(() => renderVariantList(variantSearch.value.trim()), 150);
});

loadData()
  .then(() => {
    renderGeneList();
    renderVariantList();
  })
  .catch((e) => {
    statsEl.innerHTML = `<span class="stat-chip" style="color:var(--no)">Error: ${escapeHtml(e.message)}</span>`;
    detail.innerHTML = `<div class="empty-state"><h3>Could not load data</h3><p>${escapeHtml(e.message)}</p></div>`;
  });
