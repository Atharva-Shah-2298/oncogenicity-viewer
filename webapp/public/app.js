const geneSearch = document.getElementById("gene-search");
const geneList = document.getElementById("gene-list");
const variantSelect = document.getElementById("variant-select");
const detail = document.getElementById("detail");
const statsEl = document.getElementById("stats");

let DATA = null;
let selectedGene = null;
let debounceTimer = null;

async function loadData() {
  const r = await fetch("gene_variant_dict.json.gz");
  if (!r.ok) throw new Error("Failed to load gene_variant_dict.json.gz");
  const buf = await r.arrayBuffer();
  const json = pako.ungzip(new Uint8Array(buf), { to: "string" });
  DATA = JSON.parse(json);
  const nGenes = Object.keys(DATA).length;
  let nVar = 0, nRef = 0;
  for (const g of Object.values(DATA)) {
    nVar += Object.keys(g).length;
    for (const v of Object.values(g)) {
      nRef += (v.references || []).length;
    }
  }
  statsEl.textContent = `${nGenes.toLocaleString()} genes · ${nVar.toLocaleString()} variants · ${nRef.toLocaleString()} references`;
}

function genesMatching(q) {
  const names = Object.keys(DATA).sort();
  if (!q) return names.slice(0, 500);
  const u = q.toUpperCase();
  return names.filter((g) => g.toUpperCase().includes(u)).slice(0, 500);
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

function renderGeneList(q = "") {
  geneList.innerHTML = "";
  genesMatching(q).forEach((g) => {
    const li = document.createElement("li");
    li.textContent = g;
    li.addEventListener("click", () => selectGene(g, li));
    if (g === selectedGene) li.classList.add("active");
    geneList.appendChild(li);
  });
}

function selectGene(gene, liEl) {
  selectedGene = gene;
  geneSearch.value = gene;
  geneList.querySelectorAll("li").forEach((el) => el.classList.remove("active"));
  if (liEl) liEl.classList.add("active");
  const vars = DATA[gene];
  variantSelect.disabled = false;
  variantSelect.innerHTML = '<option value="">Choose variant…</option>';
  Object.entries(vars)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([variant, entry]) => {
      const s = entry.summary || {};
      const opt = document.createElement("option");
      opt.value = variant;
      opt.textContent = `${variant} (${s.n_references ?? (entry.references || []).length} refs, ${s.consensus || "no_data"})`;
      variantSelect.appendChild(opt);
    });
  detail.innerHTML = `<p class="placeholder">${Object.keys(vars).length} variant(s) for <strong>${gene}</strong>.</p>`;
}

function loadVariant(gene, variant) {
  const entry = DATA[gene][variant];
  const s = entry.summary || {};
  const refs = entry.references || [];
  const consensus = s.consensus || "no_data";
  let html = `
    <h2><code>${gene}</code> · <code>${variant}</code>
      <span class="${badgeClass(consensus)}">${consensus.replace(/_/g, " ")}</span>
    </h2>
    <p class="summary-line">
      ${s.n_references ?? refs.length} references · ${s.n_oncogenic_yes ?? 0} oncogenic · ${s.n_oncogenic_no ?? 0} not oncogenic
    </p>`;
  refs.forEach((r) => {
    const types = Array.isArray(r.evidence_type) ? r.evidence_type.join(", ") : r.evidence_type;
    const url = `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`;
    html += `
      <article class="ref-card">
        <div class="ref-head">
          <a href="${url}" target="_blank" rel="noopener">PMID ${r.pmid}</a>
          <span class="${claimClass(r.oncogenic_claim)}">${r.oncogenic_claim}</span>
          ${r.quote_validated ? '<span class="tags">✓ quote validated</span>' : '<span class="tags">quote not validated</span>'}
        </div>
        <p class="evidence">${escapeHtml(r.functional_evidence)}</p>
        <blockquote class="quote">${escapeHtml(r.verbatim_quote)}</blockquote>
        ${types ? `<p class="tags">Evidence: ${escapeHtml(types)}</p>` : ""}
      </article>`;
  });
  detail.innerHTML = html;
}

geneSearch.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => renderGeneList(geneSearch.value.trim()), 150);
});
variantSelect.addEventListener("change", () => {
  const v = variantSelect.value;
  if (selectedGene && v) loadVariant(selectedGene, v);
});

loadData()
  .then(() => {
    renderGeneList();
    detail.innerHTML = '<p class="placeholder">Search for a gene, then pick a variant.</p>';
  })
  .catch((e) => {
    statsEl.textContent = "Error: " + e.message;
    detail.innerHTML = "<p>Could not load data file.</p>";
  });
