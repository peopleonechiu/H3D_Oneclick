param(
  [string]$Payload = (Join-Path $PSScriptRoot "..\..\release\windows"),
  [Parameter(Mandatory = $true)][string]$PythonRuntime,
  [Parameter(Mandatory = $true)][string]$BackendVendor,
  [Parameter(Mandatory = $true)][string]$CudaDll,
  [string]$DinoModel = "",
  [string]$BackendRevision = "",
  [switch]$BuildInstaller
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$VersionsPath = Join-Path $ProjectRoot "packaging\versions.json"
$Versions = Get-Content -Raw -LiteralPath $VersionsPath | ConvertFrom-Json
$RuntimeSpecPath = Join-Path $ProjectRoot "packaging\windows\runtime-spec.json"
$RuntimeSpec = Get-Content -Raw -LiteralPath $RuntimeSpecPath | ConvertFrom-Json
$CacheRoot = if ($env:JIC_BUILD_CACHE) { $env:JIC_BUILD_CACHE } else { Join-Path $env:TEMP "jic-hunyuan3d-cache" }
$WorkRoot = Join-Path $env:TEMP ("jic-hunyuan3d-build-" + [guid]::NewGuid().ToString("N"))
$StagedPayload = Join-Path $WorkRoot "payload"

function Assert-Hash([string]$Path, [string]$Expected) {
  $Actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
  if ($Actual -ne $Expected.ToLowerInvariant()) {
    throw "Checksum mismatch for $Path. Expected $Expected, received $Actual."
  }
}

function Get-VerifiedDownload([string]$Url, [string]$Sha256, [string]$Target) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Target) | Out-Null
  if (!(Test-Path -LiteralPath $Target)) {
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Target
  }
  try {
    Assert-Hash $Target $Sha256
  } catch {
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Target
    Assert-Hash $Target $Sha256
  }
}

function Invoke-Npm([string]$Npm, [string]$WorkingDirectory, [string[]]$Arguments) {
  Push-Location $WorkingDirectory
  try {
    & $Npm @Arguments
    if ($LASTEXITCODE -ne 0) { throw "npm failed in $WorkingDirectory with exit code $LASTEXITCODE." }
  } finally {
    Pop-Location
  }
}

if (!(Test-Path -LiteralPath (Join-Path $PythonRuntime "python.exe"))) {
  throw "PythonRuntime must point to a prepared private Python distribution containing python.exe."
}
if (!(Test-Path -LiteralPath $BackendVendor)) { throw "BackendVendor was not found: $BackendVendor" }
if (!(Test-Path -LiteralPath $CudaDll)) { throw "CudaDll directory was not found: $CudaDll" }
$ResolvedBackendRevision = $BackendRevision
if (!$ResolvedBackendRevision) {
  try { $ResolvedBackendRevision = (git -C $BackendVendor rev-parse HEAD).Trim() } catch { }
}
if (!$ResolvedBackendRevision) {
  throw "BackendRevision is required when BackendVendor is not a Git checkout."
}
if ($ResolvedBackendRevision.ToLowerInvariant() -ne $RuntimeSpec.source.revision.ToLowerInvariant()) {
  throw "BackendVendor revision mismatch. Expected $($RuntimeSpec.source.revision), received $ResolvedBackendRevision."
}

New-Item -ItemType Directory -Force -Path $CacheRoot, $StagedPayload | Out-Null

$NodeArchive = $Versions.node.windowsX64.archive
$NodeSha256 = $Versions.node.windowsX64.sha256
$NodeUrl = "https://nodejs.org/dist/$($Versions.node.version)/$NodeArchive"
$NodeZip = Join-Path $CacheRoot $NodeArchive
Get-VerifiedDownload $NodeUrl $NodeSha256 $NodeZip
$NodeExtract = Join-Path $WorkRoot "node-extract"
Expand-Archive -LiteralPath $NodeZip -DestinationPath $NodeExtract -Force
$NodeRoot = Get-ChildItem -LiteralPath $NodeExtract -Directory | Select-Object -First 1
if (!$NodeRoot) { throw "Node archive has no top-level directory." }

$StageNode = Join-Path $StagedPayload "runtime\node"
New-Item -ItemType Directory -Force -Path $StageNode | Out-Null
Copy-Item (Join-Path $NodeRoot.FullName "node.exe") $StageNode -Force
Copy-Item (Join-Path $NodeRoot.FullName "LICENSE") $StageNode -Force
Copy-Item (Join-Path $NodeRoot.FullName "README.md") $StageNode -Force
$Npm = Join-Path $NodeRoot.FullName "npm.cmd"
if (!(Test-Path -LiteralPath $Npm)) { throw "Node build archive does not contain npm.cmd." }

$WebBuild = Join-Path $WorkRoot "web"
Copy-Item (Join-Path $ProjectRoot "web\*") $WebBuild -Recurse -Force
$BuildPath = $env:Path
$env:Path = "$($NodeRoot.FullName);$env:Path"
try {
  Invoke-Npm $Npm $WebBuild @("install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock")
  Invoke-Npm $Npm $WebBuild @("run", "build")
} finally {
  $env:Path = $BuildPath
}

$StageWeb = Join-Path $StagedPayload "web"
$StageAdapter = Join-Path $StagedPayload "adapter"
$StagePackaging = Join-Path $StagedPayload "packaging\windows"
New-Item -ItemType Directory -Force -Path $StageWeb, (Join-Path $StageAdapter "src"), $StagePackaging | Out-Null
Copy-Item (Join-Path $WebBuild "server.mjs") $StageWeb -Force
Copy-Item (Join-Path $WebBuild "dist") $StageWeb -Recurse -Force
Copy-Item (Join-Path $ProjectRoot "adapter\package.json") $StageAdapter -Force
Copy-Item (Join-Path $ProjectRoot "adapter\src\*.mjs") (Join-Path $StageAdapter "src") -Force
try {
  $BuildPath = $env:Path
  $env:Path = "$($NodeRoot.FullName);$env:Path"
  Invoke-Npm $Npm $StageAdapter @("install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock")
} finally {
  $env:Path = $BuildPath
}
Copy-Item (Join-Path $ProjectRoot "packaging\windows\Launch.ps1") $StagePackaging -Force

$StagePython = Join-Path $StagedPayload "runtime\python"
New-Item -ItemType Directory -Force -Path $StagePython | Out-Null
Copy-Item (Join-Path $PythonRuntime "*") $StagePython -Recurse -Force

$StageBackend = Join-Path $StagedPayload "runtime\backend"
New-Item -ItemType Directory -Force -Path (Join-Path $StageBackend "vendor") | Out-Null
Copy-Item (Join-Path $ProjectRoot "runtime\backend\server.py") $StageBackend -Force
Copy-Item (Join-Path $ProjectRoot "runtime\backend\download_model.py") $StageBackend -Force
Copy-Item $BackendVendor (Join-Path $StageBackend "vendor\Hunyuan3D-2.1") -Recurse -Force

$StageCuda = Join-Path $StagedPayload "runtime\cuda-dll"
New-Item -ItemType Directory -Force -Path $StageCuda | Out-Null
Copy-Item (Join-Path $CudaDll "*") $StageCuda -Recurse -Force

if ($DinoModel) {
  if (!(Test-Path -LiteralPath $DinoModel)) { throw "DinoModel was not found: $DinoModel" }
  $StageDino = Join-Path $StagedPayload "runtime\models\dinov2-giant"
  New-Item -ItemType Directory -Force -Path $StageDino | Out-Null
  Copy-Item (Join-Path $DinoModel "*") $StageDino -Recurse -Force
}

$SourceCommit = "unknown"
try { $SourceCommit = (git -C $ProjectRoot rev-parse HEAD).Trim() } catch { }
$BuildInfo = [ordered]@{
  applicationVersion = $Versions.applicationVersion
  sourceCommit = $SourceCommit
  node = $Versions.node.version
  platform = "windows-x64-cuda"
  backendSourceRevision = $ResolvedBackendRevision
  modelRevision = $RuntimeSpec.model.revision
}
$BuildInfo | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $StagedPayload "runtime\build-info.json") -Encoding UTF8
Set-Content -LiteralPath (Join-Path $StageBackend "vendor-revision.txt") -Value $ResolvedBackendRevision -Encoding ASCII

$Verifier = Join-Path $ProjectRoot "packaging\verify-payload.mjs"
& (Join-Path $StageNode "node.exe") $Verifier windows $StagedPayload
if ($LASTEXITCODE -ne 0) { throw "Windows payload verification failed." }

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Payload) | Out-Null
if (Test-Path -LiteralPath $Payload) { Remove-Item -LiteralPath $Payload -Recurse -Force }
Move-Item -LiteralPath $StagedPayload -Destination $Payload
Write-Host "Windows payload staged at $Payload"

if ($BuildInstaller) {
  $Iscc = Get-Command ISCC.exe -ErrorAction SilentlyContinue
  if (!$Iscc) { throw "ISCC.exe was not found. Install Inno Setup on the build machine or omit -BuildInstaller." }
  & $Iscc.Source (Join-Path $ProjectRoot "packaging\windows\installer.iss")
  if ($LASTEXITCODE -ne 0) { throw "Inno Setup failed with exit code $LASTEXITCODE." }
}
