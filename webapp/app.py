"""Browse gene_variant_dict.json — search genes/variants and view PubMed evidence."""
from __future__ import annotations

import json
import os
from pathlib import Path

from flask import Flask, jsonify, render_template, request

ROOT = Path(__file__).resolve().parent

app = Flask(__name__)
_DATA: dict | None = None


def _resolve_data_path() -> Path:
    if os.environ.get("DATA_PATH"):
        return Path(os.environ["DATA_PATH"])
    for p in (
        ROOT / "data" / "gene_variant_dict.json.gz",
        ROOT / "data" / "gene_variant_dict.json",
        ROOT.parent / "gene_variant_dict.json",
    ):
        if p.is_file():
            return p
    return ROOT / "data" / "gene_variant_dict.json"


def load_data() -> dict:
    global _DATA
    if _DATA is None:
        path = _resolve_data_path()
        if not path.is_file():
            raise FileNotFoundError(
                f"Missing data file. Expected {path} or set DATA_PATH."
            )
        if path.suffix == ".gz":
            import gzip
            with gzip.open(path, "rt", encoding="utf-8") as f:
                _DATA = json.load(f)
        else:
            with open(path, encoding="utf-8") as f:
                _DATA = json.load(f)
    return _DATA


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/stats")
def stats():
    data = load_data()
    n_genes = len(data)
    n_variants = sum(len(v) for v in data.values())
    n_refs = sum(len(vv.get("references", [])) for v in data.values() for vv in v.values())
    return jsonify(genes=n_genes, variants=n_variants, references=n_refs)


@app.route("/api/genes")
def genes():
    data = load_data()
    q = (request.args.get("q") or "").strip().upper()
    names = sorted(data.keys())
    if q:
        names = [g for g in names if q in g.upper()]
    return jsonify(genes=names[:500])


@app.route("/api/gene/<gene>")
def gene_detail(gene: str):
    data = load_data()
    if gene not in data:
        return jsonify(error="Gene not found"), 404
    variants = []
    for var, entry in sorted(data[gene].items()):
        s = entry.get("summary", {})
        variants.append({
            "variant": var,
            "consensus": s.get("consensus", "no_data"),
            "n_references": s.get("n_references", len(entry.get("references", []))),
            "n_oncogenic_yes": s.get("n_oncogenic_yes", 0),
            "n_oncogenic_no": s.get("n_oncogenic_no", 0),
        })
    return jsonify(gene=gene, variants=variants)


@app.route("/api/gene/<gene>/variant")
def variant_detail(gene: str):
    data = load_data()
    variant = request.args.get("v", "")
    if gene not in data or variant not in data[gene]:
        return jsonify(error="Not found"), 404
    entry = data[gene][variant]
    refs = []
    for r in entry.get("references", []):
        et = r.get("evidence_type", [])
        if isinstance(et, str):
            et = [et]
        refs.append({
            "pmid": r.get("pmid", ""),
            "oncogenic_claim": r.get("oncogenic_claim", "uncertain"),
            "evidence_type": et,
            "functional_evidence": r.get("functional_evidence", ""),
            "verbatim_quote": r.get("verbatim_quote", ""),
            "quote_validated": bool(r.get("quote_validated")),
            "pubmed_url": f"https://pubmed.ncbi.nlm.nih.gov/{r.get('pmid', '')}/",
        })
    return jsonify(gene=gene, variant=variant, summary=entry.get("summary", {}), references=refs)


if __name__ == "__main__":
    p = _resolve_data_path()
    load_data()
    port = int(os.environ.get("PORT", "5000"))
    host = os.environ.get("HOST", "0.0.0.0")
    print(f"Loaded {p} ({p.stat().st_size:,} bytes)")
    print(f"Open http://127.0.0.1:{port}")
    app.run(host=host, port=port, debug=False)
