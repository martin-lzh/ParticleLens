$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$ReleaseDir = Join-Path $Root "release"
$BuildRoot = Join-Path "C:\tmp" ("ParticleLensBuild-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
$DistDir = Join-Path $BuildRoot "dist"
$WorkDir = Join-Path $BuildRoot "build"
$AppDir = Join-Path $DistDir "ParticleLens"
$Version = "0.2.0"
$ZipPath = Join-Path $ReleaseDir "ParticleLens-Windows-v$Version.zip"
$OneFileDistPath = Join-Path $DistDir "ParticleLens.exe"
$OneFileReleasePath = Join-Path $ReleaseDir "ParticleLens-Windows-OneFile-v$Version.exe"

Set-Location $Root

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    throw "uv is required to build this release."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm is required to build the native frontend."
}

New-Item -ItemType Directory -Force -Path $BuildRoot | Out-Null

npm ci
if ($LASTEXITCODE -ne 0) {
    throw "npm ci failed with exit code $LASTEXITCODE"
}
npm run build:native
if ($LASTEXITCODE -ne 0) {
    throw "Native frontend build failed with exit code $LASTEXITCODE"
}

uv run --with pyinstaller pyinstaller --noconfirm --distpath $DistDir --workpath $WorkDir "packaging/ParticleLens.spec"
if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller one-folder build failed with exit code $LASTEXITCODE"
}

if (-not (Test-Path $AppDir)) {
    throw "Expected build output was not found: $AppDir"
}

& (Join-Path $AppDir "ParticleLens.exe") --self-test
if ($LASTEXITCODE -ne 0) {
    throw "One-folder self-test failed with exit code $LASTEXITCODE"
}

uv run --with pyinstaller pyinstaller --noconfirm --distpath $DistDir --workpath $WorkDir "packaging/ParticleLensOneFile.spec"
if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller one-file build failed with exit code $LASTEXITCODE"
}

if (-not (Test-Path $OneFileDistPath)) {
    throw "Expected one-file build output was not found: $OneFileDistPath"
}

& $OneFileDistPath --self-test
if ($LASTEXITCODE -ne 0) {
    throw "One-file self-test failed with exit code $LASTEXITCODE"
}

New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null
if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
}
if (Test-Path $OneFileReleasePath) {
    Remove-Item $OneFileReleasePath -Force
}

Compress-Archive -Path $AppDir -DestinationPath $ZipPath
Copy-Item -Path $OneFileDistPath -Destination $OneFileReleasePath

$HashLines = @()
foreach ($ArtifactPath in @($ZipPath, $OneFileReleasePath)) {
    $Hash = Get-FileHash $ArtifactPath -Algorithm SHA256
    $HashLines += "$($Hash.Hash)  $(Split-Path -Leaf $ArtifactPath)"
}
$HashLines | Set-Content -Path (Join-Path $ReleaseDir "SHA256SUMS.txt") -Encoding ASCII

Write-Host "Built $ZipPath"
Write-Host "Built $OneFileReleasePath"
Write-Host "Wrote SHA256SUMS.txt"
