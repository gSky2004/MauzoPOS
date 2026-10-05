# Gsky deploy bundler - run on Windows
# Builds the client and creates gsky-deploy.zip ready to upload to your server.
#   pwsh ./deploy.ps1   (or:  powershell -ExecutionPolicy Bypass -File deploy.ps1)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$OutZip = Join-Path $ProjectRoot "gsky-deploy.zip"
$stage = Join-Path $env:TEMP "gsky-bundle-stage"

Write-Host "==> Building client (production)..."
Push-Location (Join-Path $ProjectRoot "client")
try { & npm run build } finally { Pop-Location }

Write-Host "==> Staging files..."
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

# client: production build + package files
New-Item -ItemType Directory -Path (Join-Path $stage "client") | Out-Null
Copy-Item (Join-Path $ProjectRoot "client\dist") -Destination (Join-Path $stage "client\dist") -Recurse
Copy-Item (Join-Path $ProjectRoot "client\package.json") -Destination (Join-Path $stage "client")
Copy-Item (Join-Path $ProjectRoot "client\package-lock.json") -Destination (Join-Path $stage "client")
Copy-Item (Join-Path $ProjectRoot "client\vite.config.js") -Destination (Join-Path $stage "client")

# server: everything except node_modules (includes uploads/ and .env)
$serverFiles = Get-ChildItem (Join-Path $ProjectRoot "server") | Where-Object { $_.Name -ne "node_modules" }
if ($serverFiles) {
  Copy-Item $serverFiles.FullName -Destination (Join-Path $stage "server") -Recurse
}

# drop runtime logs from the bundle
Get-ChildItem (Join-Path $stage "server") -Recurse -Filter *.log | Remove-Item -Force

# deploy kit
Copy-Item (Join-Path $ProjectRoot "deploy") -Destination (Join-Path $stage "deploy") -Recurse

Write-Host "==> Creating $OutZip ..."
if (Test-Path $OutZip) { Remove-Item $OutZip -Force }
# Build the zip entry-by-entry with POSIX '/' names so Linux unzip works
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$base = (Resolve-Path $stage).Path.TrimEnd('\')
$fs = [System.IO.File]::Open($OutZip, [System.IO.FileMode]::Create)
$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem $base -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($base.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel) | Out-Null
  }
} finally {
  $zip.Dispose()
  $fs.Dispose()
}
$mb = [math]::Round((Get-Item $OutZip).Length / 1MB, 1)
Write-Host "==> Done: $OutZip ($mb MB)"
Write-Host ""
Write-Host "NEXT STEPS"
Write-Host " 1. Upload gsky-deploy.zip to your server (e.g. with WinSCP to /root/)"
Write-Host " 2. SSH into the server and run:"
Write-Host "       cd /root && unzip gsky-deploy.zip -d gsky && cd gsky/deploy"
Write-Host "       sudo DOMAIN=yourdomain.com CERT_EMAIL=you@email.com bash setup-vps.sh"
