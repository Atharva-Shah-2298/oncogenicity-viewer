const geneSearch = document.getElementById("gene-search");
const geneList = document.getElementById("gene-list");
const variantSelect = document.getElementById("variant-select");
const detail = document.getElementById("detail");
const statsEl = document.getElementById("stats");

let selectedGene = null;
let debounceTimer = null;

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function badgeClass(consensus) {
  const c = (consensus || "no_data").replace(/ /g, "_");
  return `badge ${c}`;
}

function claimClass(c) {
  return `claim ${c || "uncertain"}`;
}

async function loadStats() {
  const s = await fetchJson("/api/stats");
  statsEl.textContent = `${s.genes.toLocaleString()} genes · ${s.variants.toLocaleString()} variants · ${s.references.toLocaleString()} paper references`;
}

async function loadGenes(q = "") {
  const url = q ? `/api/genes?q=${encodeURIComponent(q)}` : "/api/genes";
  const { genes } = await fetchJson(url);
  geneList.innerHTML = "";
  genes.forEach((g) => {
    const li = document.createElement("li");
    li.textContent = g;
    li.addEventListener("click", () => selectGene(g, li));
    if (g === selectedGene) li.classList.add("active");
    geneList.appendChild(li);
  });
}

async function selectGene(gene, liEl) {
  selectedGene = gene;
  geneSearch.value = gene;
  geneList.querySelectorAll("li").forEach((el) => el.classList.remove("active"));
  if (liEl) liEl.classList.add("active");

  const { variants } = await fetchJson(`/api/gene/${encodeURIComponent(gene)}`);
  variantSelect.disabled = false;
  variantSelect.innerHTML = '<option value="">Choose variant…</option>';
  variants.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.variant;
    opt.textContent = `${v.variant} (${v.n_references} refs, ${v.consensus})`;
    variantSelect.appendChild(opt);
  });
  detail.innerHTML = `<p class="placeholder">${variants.length} variant(s) for <strong>${gene}</strong>. Pick one from the list.</p>`;
}

async function loadVariant(gene, variant) {
  const data = await fetchJson(
    `/api/gene/${encodeURIComponent(gene)}/variant?v=${encodeURIComponent(variant)}`
  );
  const s = data.summary || {};
  const consensus = s.consensus || "no_data";

  let html = `
    <h2><code>${data.gene}</code> · <code>${data.variant}</code>
      <span class="${badgeClass(consensus)}">${consensus.replace(/_/g, " ")}</span>
    </h2>
    <p class="summary-line">
      ${s.n_references ?? data.references.length} references ·
      ${s.n_oncogenic_yes ?? 0} oncogenic · ${s.n_oncogenic_no ?? 0} not oncogenic
    </p>
  `;

  if (!data.references.length) {
    html += "<p>No references stored for this variant.</p>";
  } else {
    data.references.forEach((r) => {
      const types = Array.isArray(r.evidence_type) ? r.evidence_type.join(", ") : r.evidence_type;
      html += `
        <article class="ref-card">
          <div class="ref-head">
            <a href="${r.pubmed_url}" target="_blank" rel="noopener">PMID ${r.pmid}</a>
            <span class="${claimClass(r.oncogenic_claim)}">${r.oncogenic_claim}</span>
            ${r.quote_validated ? "<span class=\"tags\">✓ quote validated</span>" : "<span class=\"tags\">quote not validated</span>"}
          </div>
          <p class="evidence">${escapeHtml(r.functional_evidence)}</p>
          <blockquote class="quote">${escapeHtml(r.verbatim_quote)}</blockquote>
          ${types ? `<p class="tags">Evidence: ${escapeHtml(types)}</p>` : ""}
        </article>
      `;
    });
  }
  detail.innerHTML = html;
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

geneSearch.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => loadGenes(geneSearch.value.trim()), 200);
});

variantSelect.addEventListener("change", () => {
  const v = variantSelect.value;
  if (selectedGene && v) loadVariant(selectedGene, v);
});

loadStats().then(() => loadGenes()).catch((e) => {
  statsEl.textContent = "Failed to load data: " + e.message;
});
