# One-time: publish static viewer to GitHub Pages
# Prerequisite: gh auth login   (browser login once)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$py = "C:\Users\athu2\miniconda3\python.exe"
if (-not (Test-Path $py)) { $py = (Get-Command python -ErrorAction Stop).Source }

$srcJson = Join-Path $root "gene_variant_dict.json"
if (Test-Path $srcJson) {
    & $py -c @"
import gzip, shutil, os
src = r'$srcJson'
for dst in [r'$root\webapp\public\gene_variant_dict.json.gz', r'$root\webapp\data\gene_variant_dict.json.gz']:
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(src, 'rb') as f, gzip.open(dst, 'wb') as g:
        shutil.copyfileobj(f, g)
    print('wrote', dst)
"@
}

gh auth status | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Run: gh auth login"
    exit 1
}

$repoName = "oncogenicity-viewer"
$user = (gh api user -q .login)
Write-Host "GitHub user: $user"
Write-Host "Site will be: https://$user.github.io/$repoName/"

if (-not (git rev-parse HEAD 2>$null)) {
    git checkout -b main 2>$null
    git add .github/workflows/pages.yml webapp/public webapp/data/gene_variant_dict.json.gz .gitignore
    git commit -m "Deploy gene variant oncogenicity viewer to GitHub Pages"
}

if (-not (git remote get-url origin 2>$null)) {
    gh repo create $repoName --public --source=. --remote=origin --push
} else {
    git push -u origin HEAD
}

Write-Host ""
Write-Host "Enable Pages (if not auto-enabled):"
Write-Host "  Repo -> Settings -> Pages -> Source: GitHub Actions"
Write-Host ""
Write-Host "After the workflow finishes (~1 min):"
Write-Host "  https://$user.github.io/$repoName/"
