# 學生端打包結構

最新交接條件、回歸測試與實機待驗項目，以 [Windows 交接文件](../docs/WINDOWS_HANDOFF.md) 為準。

學生端安裝包的目標是自帶所需 runtime 與啟動器。學生只需要安裝應用程式並點擊啟動，不需要自行安裝 Python、Node.js、Git、Docker 或 CUDA Toolkit，也不需要修改系統 `PATH`。

這個資料夾包含可重複執行的 payload builder、完整性 verifier、啟動器與安裝器定義。產生的 `release/` 不進 Git；正式對外版本仍必須通過實機、乾淨電腦、簽章與模型下載驗證。

```text
JIC_YZUIC_Hunyuan3D-<platform>/
├─ adapter/src/server.mjs
├─ adapter/node_modules/
├─ web/dist/
├─ web/server.mjs
├─ runtime/node/                 # 包內私有 Node runtime
├─ runtime/mlx-serve              # 僅 Mac
├─ runtime/backend/server.py     # 僅 Windows
├─ runtime/backend/download_model.py
├─ runtime/backend/vendor/        # 固定版本的 Tencent source 與 native assets
├─ runtime/models/dinov2-giant/   # Windows PBR conditioner（如有打包）
├─ runtime/python/python.exe     # 僅 Windows
└─ packaging/<platform>/launch.*
```

## 建立 Mac 安裝包

在 Apple Silicon Mac 上執行：

```bash
./packaging/macos/build-payload.command
./packaging/macos/build-dmg.command
```

建置器會固定版本並驗證 hash，下載 Node 與原生 `mlx-serve`，建置 production Web UI，將 adapter 依賴放入 payload，再產生：

```text
release/macos/payload/
release/installers/JIC_YZUIC_Hunyuan3D-Mac.dmg
```

預設使用 ad-hoc signature，適合本機與內部測試；正式發給學生時，以 `JIC_CODESIGN_IDENTITY` 提供 Developer ID Application，再另外完成 notarization。Ad-hoc DMG 不能宣稱已通過 Gatekeeper 的正式發佈條件。

Mac payload 只帶必要的 Node binary，不帶 npm，也不帶模型。模型由 UI 在第一次啟動後下載到使用者資料夾。

## 建立 Windows 安裝包

Windows payload 必須由已準備好的私有 runtime 建置；建置器不會把不完整的 Python 或 CUDA 檔案假裝成可用 runtime：

```powershell
.\packaging\windows\Build-Payload.ps1 `
  -PythonRuntime C:\build\python-runtime `
  -BackendVendor C:\build\Hunyuan3D-2.1 `
  -CudaDll C:\build\cuda-dll `
  -RemBgModel C:\build\u2net.onnx `
  -DinoModel C:\build\dinov2-giant `
  -BackendRevision 82920d643c0dc2f7bfd7255f45f62d386edfe60c `
  -BuildInstaller
```

`PythonRuntime` 必須已包含 `python.exe`、Python 3.10、PyTorch 2.5.1+cu124、Pillow、`huggingface_hub` 及其他已安裝依賴；`BackendVendor` 必須是 [runtime-spec.json](windows/runtime-spec.json) 鎖定的 Tencent source/native assets。官方 Hunyuan3D 安裝流程需要 CUDA 版 PyTorch 與 custom rasterizer，因此這些編譯結果必須在建置階段放入包內，不能讓學生第一次啟動時編譯。執行器會把 Node、Python、CUDA DLL、source tree、adapter 與 UI 一起放入 `release/windows/`，最後由 Inno Setup 產生 Setup EXE。學生端不需要安裝任何上述工具。

若缺少私有 Windows runtime，這個命令會停止並列出缺少項目；目前 macOS 開發機不能替代 NVIDIA Windows 實機完成這個 gate。

## Payload verifier

兩個 builder 都會執行同一個 verifier，也可以手動檢查：

```bash
node packaging/verify-payload.mjs macos release/macos/payload
```

Windows 由 builder 使用包內 Node 執行：

```powershell
node packaging\verify-payload.mjs windows release\windows
```

模型檔與生成輸出會放在使用者的應用程式資料目錄，不放在受保護的安裝目錄。Launcher 會在第一次啟動時建立資料目錄。

## Runtime 責任

- **Mac**：`runtime/mlx-serve` 是原生 MLX／Metal backend。Adapter 以 loopback 啟動它，並把模型目錄放在使用者資料目錄。Launcher 只對子程序設定 `HOME`，不修改學生原本的 MLX cache、shell 設定或系統 `PATH`。
- **Windows**：`runtime/python/python.exe` 是包內私有 Python。backend wrapper 負責 PyTorch、CUDA 與 native extension；學生不需要編譯。兩平台現在都使用包內 Node 的 manifest 下載器，寫入 `.partial`、校驗 SHA-256 後提交，替換時保留舊模型備份。
- **兩邊**：瀏覽器開啟相同的 localhost Web UI，並且只與 Local Adapter 溝通。

## Launcher 行為

第一次點擊時，Launcher 依序啟動 adapter、平台 backend 與 Web server。模型不必在應用程式啟動前存在；UI 會顯示模型尚未安裝，學生可在模型區按下下載。

再次點擊時，Launcher 會先檢查既有的 localhost 服務。如果服務仍在執行，只開啟既有介面，不建立第二組程序，也不造成 port 衝突。

預設模型位置：

- Mac：`~/Library/Application Support/JIC_YZUIC_Hunyuan3D-Mac/.mlx-serve/models/ddalcu/Hunyuan3D-2.1-MLX-Serve-8bit`
- Windows：`%LOCALAPPDATA%/JIC_YZUIC/Hunyuan3D-Windows/models/windows/hunyuan3d-2.1`

目前 Mac launcher 已在開發機上接過實際 MLX backend；Windows launcher 與 Python wrapper 尚需 Windows NVIDIA 實機完成完整功能驗證。

## 平台專屬的模型引導

第一輪 UI 不使用一個對所有平台都相同的下載畫面：

- Mac 直接顯示 MLX 模型狀態、大小與下載操作。
- Windows 先顯示 NVIDIA GPU／VRAM 狀態；硬體未通過時，CUDA 模型下載按鈕維持停用。
- 模型準備完成後，兩邊回到相同的照片 → GLB 操作流程。

`packaging/windows/installer.iss` 是 Windows Inno Setup 安裝器定義，`Build-Payload.ps1 -BuildInstaller` 會在找到 `ISCC.exe` 時呼叫它。

`packaging/macos/build-dmg.command` 會先驗證 staged payload，再組成 `JIC_YZUIC_Hunyuan3D-Mac.app` 與 DMG；notarization 仍是正式發佈階段的工作。
