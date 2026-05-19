# Host the viewer online (free)

Share a public URL so others can search genes/variants without installing anything.

## Option A — GitHub Pages (recommended, stable URL)

Gives a permanent URL like `https://YOUR_USERNAME.github.io/oncogenicity-viewer/` (no random words).

1. Install [GitHub CLI](https://cli.github.com/) if needed.
2. Log in once:
   ```powershell
   gh auth login
   ```
3. From the repo root:
   ```powershell
   .\deploy-github-pages.ps1
   ```
4. In the repo on GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions** (usually auto-selected after the first deploy).
5. Wait for the **Deploy viewer to GitHub Pages** workflow to finish (~1 minute), then open your URL.

To update data after a new extraction, refresh the gzip files and push:

```powershell
Copy-Item gene_variant_dict.json.gz webapp\public\gene_variant_dict.json.gz -Force
Copy-Item gene_variant_dict.json.gz webapp\data\gene_variant_dict.json.gz -Force
git add webapp/public webapp/data
git commit -m "Update extraction results"
git push
```

---

## Option B — Render.com (Flask API, ~10 minutes)

1. Push this repo to **GitHub** (include `webapp/data/gene_variant_dict.json.gz` — ~584 KB).
2. Sign up at [render.com](https://render.com).
3. **New → Web Service** → connect your repo.
4. Settings:
   - **Root directory:** `webapp`
   - **Build:** `pip install -r requirements.txt`
   - **Start:** `gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 120`
   - **Plan:** Free
5. Deploy. You get a URL like `https://pubmed-oncogenicity-viewer.onrender.com`.

Or use the repo-root `render.yaml` — Render may auto-detect it.

**Note:** Free tier sleeps after ~15 min idle; first visit may take 30–60s to wake.

---

## Option B — Hugging Face Spaces (good for demos)

1. Create account at [huggingface.co](https://huggingface.co).
2. **New Space** → SDK **Docker** or duplicate a Flask template.
3. Upload `webapp/` files + `data/gene_variant_dict.json.gz`.
4. Share `https://huggingface.co/spaces/YOUR_USERNAME/SPACE_NAME`.

---

## Option C — Keep your PC / EC2 tunnel running

Not true hosting, but instant:

```powershell
cd webapp
python app.py
cloudflared tunnel --url http://localhost:5000
```

Share the `trycloudflare.com` URL (temporary, changes each run).

---

## Data file for deploy

Bundled path (committed for hosting):

`webapp/data/gene_variant_dict.json.gz` (~584 KB)

To refresh after a new extraction:

```powershell
Copy-Item gene_variant_dict.json.gz webapp\data\gene_variant_dict.json.gz
```

---

## What you send to reviewers

> Try the oncogenicity evidence browser: **https://YOUR-APP.onrender.com**  
> Search a gene (e.g. BRAF), pick a variant, open PMIDs for full papers. Quotes are from PMC full text; for research use only.
