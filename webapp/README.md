# Gene variant oncogenicity viewer

Simple web UI to browse `gene_variant_dict.json` (genes, variants, PubMed references, verbatim quotes).

## Run locally

From repo root (needs `gene_variant_dict.json` next to `webapp/`):

```powershell
cd webapp
pip install -r requirements.txt
python app.py
```

Open **http://127.0.0.1:5000**

Custom data path:

```powershell
$env:DATA_PATH = "C:\path\to\gene_variant_dict.json"
python app.py
```

## Share with external users

### Same office / VPN (LAN)

1. Run with host `0.0.0.0` (default): `python app.py`
2. Find your PC IP: `ipconfig`
3. Others open: `http://YOUR_IP:5000` (Windows Firewall may prompt — allow Python on private networks)

### Internet (temporary demo)

Use [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) on the machine running the app:

```powershell
# Terminal 1
cd webapp
python app.py

# Terminal 2 (download cloudflared for Windows, or use WSL)
cloudflared tunnel --url http://localhost:5000
```

Share the `https://....trycloudflare.com` URL. Tunnel stops when you close cloudflared.

### Production

Deploy to any host that runs Python (EC2, Azure App Service, internal server). Set `PORT` and `DATA_PATH` as needed. Do not expose without auth if data is sensitive.

## What users see

1. Search **gene** (e.g. `BRAF`, `TP53`)
2. Pick a **variant** from the dropdown
3. For each variant:
   - **Consensus** (oncogenic / not oncogenic / uncertain)
   - **References** with PMID links to PubMed
   - **Functional evidence** summary
   - **Verbatim quote** from the paper (validated when possible)
