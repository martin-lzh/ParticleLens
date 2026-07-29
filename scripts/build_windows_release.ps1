param(
    [switch]$SkipNpmCi
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$ReleaseDir = Join-Path $Root "release"
$BuildRoot = Join-Path "C:\tmp" ("ParticleLensBuild-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
$DistDir = Join-Path $BuildRoot "dist"
$WorkDir = Join-Path $BuildRoot "build"
$AppDir = Join-Path $DistDir "ParticleLens"
$Version = "0.2.1"
$ZipPath = Join-Path $ReleaseDir "ParticleLens-Windows-v$Version.zip"
$OneFileDistPath = Join-Path $DistDir "ParticleLens.exe"
$OneFileReleasePath = Join-Path $ReleaseDir "ParticleLens-Windows-OneFile-v$Version.exe"
$InstallerReleasePath = Join-Path $ReleaseDir "ParticleLens-Windows-Setup-v$Version.exe"

Set-Location $Root

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    throw "uv is required to build this release."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm is required to build the native frontend."
}

$IsccCommand = Get-Command "ISCC.exe" -ErrorAction SilentlyContinue
$IsccCandidates = @(
    $IsccCommand.Source
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
) | Where-Object { $_ -and (Test-Path $_) }
if ($IsccCandidates.Count -eq 0) {
    throw "Inno Setup 6 is required to build the Windows installer."
}
$IsccPath = $IsccCandidates | Select-Object -First 1

New-Item -ItemType Directory -Force -Path $BuildRoot | Out-Null

if (-not $SkipNpmCi) {
    npm ci
    if ($LASTEXITCODE -ne 0) {
        throw "npm ci failed with exit code $LASTEXITCODE"
    }
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

$OneFolderSelfTest = Start-Process `
    -FilePath (Join-Path $AppDir "ParticleLens.exe") `
    -ArgumentList "--self-test" `
    -Wait `
    -PassThru `
    -WindowStyle Hidden
if ($OneFolderSelfTest.ExitCode -ne 0) {
    throw "One-folder self-test failed with exit code $($OneFolderSelfTest.ExitCode)"
}

uv run --with pyinstaller pyinstaller --noconfirm --distpath $DistDir --workpath $WorkDir "packaging/ParticleLensOneFile.spec"
if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller one-file build failed with exit code $LASTEXITCODE"
}

if (-not (Test-Path $OneFileDistPath)) {
    throw "Expected one-file build output was not found: $OneFileDistPath"
}

$OneFileSelfTest = Start-Process `
    -FilePath $OneFileDistPath `
    -ArgumentList "--self-test" `
    -Wait `
    -PassThru `
    -WindowStyle Hidden
if ($OneFileSelfTest.ExitCode -ne 0) {
    throw "One-file self-test failed with exit code $($OneFileSelfTest.ExitCode)"
}

New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null
if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
}
if (Test-Path $OneFileReleasePath) {
    Remove-Item $OneFileReleasePath -Force
}
if (Test-Path $InstallerReleasePath) {
    Remove-Item $InstallerReleasePath -Force
}

Compress-Archive -Path $AppDir -DestinationPath $ZipPath
Copy-Item -Path $OneFileDistPath -Destination $OneFileReleasePath

$IsccArguments = @(
    "/Qp"
    "/DAppVersion=$Version"
    "/DAppSource=$AppDir"
    "/DOutputDir=$ReleaseDir"
    (Join-Path $Root "packaging\ParticleLens.iss")
)
& $IsccPath $IsccArguments
if ($LASTEXITCODE -ne 0) {
    throw "Windows installer build failed with exit code $LASTEXITCODE"
}
if (-not (Test-Path $InstallerReleasePath)) {
    throw "Expected installer output was not found: $InstallerReleasePath"
}

$InstallerTestDir = Join-Path $BuildRoot "installer-smoke"
$InstallProcess = Start-Process `
    -FilePath $InstallerReleasePath `
    -ArgumentList @(
        "/VERYSILENT"
        "/SUPPRESSMSGBOXES"
        "/NORESTART"
        "/SP-"
        "/NOICONS"
        "/DIR=$InstallerTestDir"
    ) `
    -Wait `
    -PassThru `
    -WindowStyle Hidden
if ($InstallProcess.ExitCode -ne 0) {
    throw "Installer smoke test failed with exit code $($InstallProcess.ExitCode)"
}

$InstalledAppPath = Join-Path $InstallerTestDir "ParticleLens.exe"
if (-not (Test-Path $InstalledAppPath)) {
    throw "Installed app was not found: $InstalledAppPath"
}
$InstalledAppSelfTest = Start-Process `
    -FilePath $InstalledAppPath `
    -ArgumentList "--self-test" `
    -Wait `
    -PassThru `
    -WindowStyle Hidden
if ($InstalledAppSelfTest.ExitCode -ne 0) {
    throw "Installed app self-test failed with exit code $($InstalledAppSelfTest.ExitCode)"
}

$UninstallerPath = Join-Path $InstallerTestDir "unins000.exe"
if (-not (Test-Path $UninstallerPath)) {
    throw "Uninstaller was not found: $UninstallerPath"
}
$UninstallProcess = Start-Process `
    -FilePath $UninstallerPath `
    -ArgumentList @("/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART") `
    -Wait `
    -PassThru `
    -WindowStyle Hidden
if ($UninstallProcess.ExitCode -ne 0) {
    throw "Uninstaller smoke test failed with exit code $($UninstallProcess.ExitCode)"
}
if (Test-Path $InstallerTestDir) {
    throw "Installer smoke test left files behind: $InstallerTestDir"
}

$HashLines = @()
foreach ($ArtifactPath in @($InstallerReleasePath, $OneFileReleasePath, $ZipPath)) {
    $Hash = Get-FileHash $ArtifactPath -Algorithm SHA256
    $HashLines += "$($Hash.Hash)  $(Split-Path -Leaf $ArtifactPath)"
}
$HashLines | Set-Content -Path (Join-Path $ReleaseDir "SHA256SUMS.txt") -Encoding ASCII

Write-Host "Built $ZipPath"
Write-Host "Built $OneFileReleasePath"
Write-Host "Built $InstallerReleasePath"
Write-Host "Wrote SHA256SUMS.txt"
