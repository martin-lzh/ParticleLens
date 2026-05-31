$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$ReleaseDir = Join-Path $Root "release"
$BuildRoot = Join-Path "C:\tmp" ("ParticleSizeAnnotatorBuild-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
$DistDir = Join-Path $BuildRoot "dist"
$WorkDir = Join-Path $BuildRoot "build"
$AppDir = Join-Path $DistDir "Particle Size Annotator"
$Version = "0.1.0"
$ZipPath = Join-Path $ReleaseDir "ParticleSizeAnnotator-Windows-v$Version.zip"
$OneFileDistPath = Join-Path $DistDir "Particle Size Annotator.exe"
$OneFileReleasePath = Join-Path $ReleaseDir "ParticleSizeAnnotator-Windows-OneFile-v$Version.exe"

Set-Location $Root

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    throw "uv is required to build this release."
}

New-Item -ItemType Directory -Force -Path $BuildRoot | Out-Null

uv run --with pyinstaller pyinstaller --noconfirm --distpath $DistDir --workpath $WorkDir "packaging/ParticleSizeAnnotator.spec"
if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller one-folder build failed with exit code $LASTEXITCODE"
}

if (-not (Test-Path $AppDir)) {
    throw "Expected build output was not found: $AppDir"
}

uv run --with pyinstaller pyinstaller --noconfirm --distpath $DistDir --workpath $WorkDir "packaging/ParticleSizeAnnotatorOneFile.spec"
if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller one-file build failed with exit code $LASTEXITCODE"
}

if (-not (Test-Path $OneFileDistPath)) {
    throw "Expected one-file build output was not found: $OneFileDistPath"
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
