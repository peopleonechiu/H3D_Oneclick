$ErrorActionPreference = "Stop"

$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Node = Join-Path $AppRoot "runtime\node\node.exe"
$AdapterEntry = Join-Path $AppRoot "adapter\src\server.mjs"
$WebEntry = Join-Path $AppRoot "web\server.mjs"
$DistDir = Join-Path $AppRoot "web\dist"
$Backend = Join-Path $AppRoot "runtime\python\python.exe"
$BackendScript = Join-Path $AppRoot "runtime\backend\server.py"
$ModelDownloadScript = Join-Path $AppRoot "adapter\src\model-files.mjs"
$ModelManifest = Join-Path $AppRoot "packaging\models\windows.json"
$BackendSourceRoot = Join-Path $AppRoot "runtime\backend\vendor\Hunyuan3D-2.1"
$DinoModelRoot = Join-Path $AppRoot "runtime\models\dinov2-giant"
$DataRoot = Join-Path $env:LOCALAPPDATA "JIC_YZUIC\Hunyuan3D-Windows"
$ModelRoot = Join-Path $DataRoot "models\windows\hunyuan3d-2.1"
$LogDir = Join-Path $DataRoot "logs"
$AdapterPort = if ($env:JIC_ADAPTER_PORT) { $env:JIC_ADAPTER_PORT } else { "8787" }
$WebPort = if ($env:JIC_WEB_PORT) { $env:JIC_WEB_PORT } else { "4173" }
$BackendPort = if ($env:JIC_BACKEND_PORT) { $env:JIC_BACKEND_PORT } else { "11234" }

if (!(Test-Path -LiteralPath $Node)) { throw "Private Node runtime not found: $Node" }
if (!(Test-Path -LiteralPath $Backend)) { throw "Private Python runtime not found: $Backend" }
if (!(Test-Path -LiteralPath $BackendScript)) { throw "CUDA backend wrapper not found: $BackendScript" }
if (!(Test-Path -LiteralPath $ModelDownloadScript)) { throw "Model downloader not found: $ModelDownloadScript" }
if (!(Test-Path -LiteralPath $BackendSourceRoot)) { throw "Bundled Hunyuan3D source tree not found: $BackendSourceRoot" }
if (!(Test-Path -LiteralPath $AdapterEntry) -or !(Test-Path -LiteralPath $WebEntry)) {
  throw "JIC_YZUIC_Hunyuan3D-Windows package is incomplete."
}

# A second click reopens the existing local app rather than starting a second
# adapter/backend on the same ports.
try {
  $existing = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 -Uri "http://127.0.0.1:$WebPort/api/health"
  $existingPayload = $existing.Content | ConvertFrom-Json
  if ($existing.StatusCode -eq 200 -and $existingPayload.adapter -eq "jic-local-adapter" -and $existingPayload.platform -eq "windows-x64-cuda") {
    Start-Process "http://127.0.0.1:$WebPort"
    exit 0
  }
} catch {
  # No existing JIC instance; continue with startup.
}
& $Node (Join-Path $AppRoot "adapter\src\launcher-check.mjs") ports $WebPort $AdapterPort $BackendPort
if ($LASTEXITCODE -ne 0) { throw "Application ports are unavailable. No service was started." }

New-Item -ItemType Directory -Force -Path $ModelRoot, $DataRoot, $LogDir | Out-Null
$BackendArgs = @(
  $BackendScript,
  "--host", "127.0.0.1",
  "--port", "$BackendPort",
  "--model-dir", $ModelRoot,
  "--source-root", $BackendSourceRoot
)
$ModelDownloadArgs = @(
  $ModelDownloadScript,
  $ModelManifest,
  $ModelRoot
)

# Keep Python and CUDA DLL resolution private to this launcher process. No
# system PATH, Python registry, or user shell profile is modified.
$PrivatePythonBin = Join-Path $AppRoot "runtime\python"
$PrivateCudaBin = Join-Path $AppRoot "runtime\cuda-dll"
$env:PATH = "$PrivatePythonBin;$PrivateCudaBin;$env:PATH"
$env:PYTHONNOUSERSITE = "1"
Remove-Item Env:PYTHONHOME -ErrorAction SilentlyContinue
Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue
$env:HF_HUB_OFFLINE = "1"
$env:TRANSFORMERS_OFFLINE = "1"

$env:PORT = "$AdapterPort"
$env:DATA_DIR = $DataRoot
$env:PLATFORM = "windows-x64-cuda"
$env:BACKEND_KIND = "hunyuan3d-cuda"
$env:BACKEND_PROTOCOL = "official-hunyuan"
$env:BACKEND_URL = "http://127.0.0.1:$BackendPort"
$env:MODEL_DISPLAY_NAME = "Hunyuan3D 2.1 (CUDA)"
$env:BACKEND_MODEL_TARGET = $ModelRoot
$env:BACKEND_REQUEST_MODEL = "hunyuan3d-2-1-8bit"
$env:JIC_DINO_MODEL_PATH = $DinoModelRoot
$env:U2NET_HOME = Join-Path $AppRoot "runtime\models\rembg"
$env:BACKEND_COMMAND = $Backend
$env:BACKEND_ARGS_JSON = $BackendArgs | ConvertTo-Json -Compress
$env:BACKEND_WORKDIR = $AppRoot
$env:MODEL_DOWNLOAD_COMMAND = $Node
$env:MODEL_MANIFEST_PATH = $ModelManifest
$env:BIND_HOST = "127.0.0.1"
$env:ALLOWED_ORIGINS = "http://127.0.0.1:$WebPort,http://localhost:$WebPort"
$env:MODEL_DOWNLOAD_ARGS_JSON = $ModelDownloadArgs | ConvertTo-Json -Compress
$env:MODEL_DOWNLOAD_WORKDIR = $AppRoot
$env:MODEL_EXPECTED_PATH = $ModelRoot
$env:MODEL_PROGRESS_PATH = "$ModelRoot.partial"
$env:MODEL_TOTAL_BYTES = "0"

$AdapterLog = Join-Path $LogDir "adapter.log"
$AdapterErrorLog = Join-Path $LogDir "adapter-error.log"
$WebLog = Join-Path $LogDir "web.log"
$WebErrorLog = Join-Path $LogDir "web-error.log"
$adapterProcess = $null
$webProcess = $null
try {
  $adapterProcess = Start-Process -FilePath $Node -WorkingDirectory $AppRoot -ArgumentList @("`"$AdapterEntry`"") -RedirectStandardOutput $AdapterLog -RedirectStandardError $AdapterErrorLog -PassThru

  $env:PORT = "$WebPort"
  $env:DIST_DIR = $DistDir
  $env:ADAPTER_URL = "http://127.0.0.1:$AdapterPort"
  $webProcess = Start-Process -FilePath $Node -WorkingDirectory $AppRoot -ArgumentList @("`"$WebEntry`"") -RedirectStandardOutput $WebLog -RedirectStandardError $WebErrorLog -PassThru

  & $Node (Join-Path $AppRoot "adapter\src\launcher-check.mjs") ready "http://127.0.0.1:$WebPort" "windows-x64-cuda"
  if ($LASTEXITCODE -ne 0 -or $adapterProcess.HasExited -or $webProcess.HasExited) { throw "Local service startup failed. Logs: $LogDir" }
  Start-Process "http://127.0.0.1:$WebPort"
  Write-Host "JIC_YZUIC_Hunyuan3D-Windows is running."
  Write-Host "Logs: $LogDir"
  Wait-Process -Id $webProcess.Id
}
finally {
  if ($webProcess -and !$webProcess.HasExited) { Stop-Process -Id $webProcess.Id -Force }
  if ($adapterProcess -and !$adapterProcess.HasExited) { & taskkill.exe /PID $adapterProcess.Id /T /F | Out-Null }
}
