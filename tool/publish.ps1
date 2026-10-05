# publish.ps1 - Push "Fruit Puzzle Garden" to GitHub (first release + later updates)
#
# Usage (PowerShell 5.1 built into Windows):
#   powershell -ExecutionPolicy Bypass -File tool\publish.ps1 -Repo https://github.com/USER/REPO.git
#
# Or just double-click publish.bat in the project root (recommended).
#
# NOTE: keep this file pure ASCII. Windows PowerShell 5.1 decodes .ps1 files as
# system ANSI (GBK on Chinese Windows) when there is no UTF-8 BOM, so non-ASCII
# text here would be mangled and break the parser. Chinese messages live in
# publish.bat instead.

param(
  [Parameter(Mandatory = $true)][string]$Repo,
  [string]$Branch = 'main',
  [string]$Message = 'feat: Fruit Puzzle Garden - fruit themed puzzle collection'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host '[ERROR] git not found. Install Git for Windows: https://git-scm.com/download/win' -ForegroundColor Red
  exit 1
}

Write-Host ''
Write-Host '=== Fruit Puzzle Garden -> GitHub ===' -ForegroundColor Cyan
Write-Host ("Project : " + $root)
Write-Host ("Remote  : " + $Repo)
Write-Host ("Branch  : " + $Branch)
Write-Host ''

# 1) init repository
if (-not (Test-Path (Join-Path $root '.git'))) {
  git init | Out-Null
  Write-Host '[1/5] git repository initialised' -ForegroundColor Green
} else {
  Write-Host '[1/5] git repository already exists, skip init' -ForegroundColor DarkGray
}

# 2) make sure we are on the target branch
git checkout -B $Branch | Out-Null
Write-Host ("[2/5] on branch " + $Branch) -ForegroundColor Green

# 3) remote origin
$remotes = @(git remote 2>$null)
if ($remotes -contains 'origin') {
  git remote set-url origin $Repo
  Write-Host '[3/5] origin updated' -ForegroundColor Green
} else {
  git remote add origin $Repo
  Write-Host '[3/5] origin added' -ForegroundColor Green
}

# 4) stage and commit
git add -A
$staged = (git diff --cached --name-only | Measure-Object -Line).Lines
if ($staged -gt 0) {
  git commit -m $Message | Out-Null
  Write-Host ("[4/5] committed " + $staged + " file(s)") -ForegroundColor Green
} else {
  Write-Host '[4/5] nothing to commit' -ForegroundColor DarkGray
}

# 5) push
Write-Host '[5/5] pushing to GitHub (a login prompt may appear)...' -ForegroundColor Yellow
git push -u origin $Branch
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host '[FAILED] push did not succeed. Common causes:' -ForegroundColor Red
  Write-Host '  - wrong repo URL, or the repository does not exist yet on GitHub'
  Write-Host '  - auth failed: the password field needs a Personal Access Token, not your account password'
  Write-Host '  - remote already has commits: run  git pull --rebase origin ' -NoNewline
  Write-Host $Branch
  Write-Host '    then run this script again'
  exit 1
}

Write-Host ''
Write-Host '=== PUSH OK ===' -ForegroundColor Green
Write-Host ''
Write-Host 'Enable public access (one time only):' -ForegroundColor Cyan
Write-Host '  1. open the repository page -> Settings -> Pages'
Write-Host '  2. Source: "Deploy from a branch"'
Write-Host ("  3. Branch: " + $Branch + " , folder: / (root) , then Save")
Write-Host '  4. wait 1-2 minutes, then open:'
Write-Host '     https://<username>.github.io/<repo>/'
Write-Host ''
Write-Host 'For later updates just run this script again; Pages redeploys automatically.'
Write-Host ''
