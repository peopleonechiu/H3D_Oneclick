# 學生端打包結構

學生端安裝包的目標是自帶所需 runtime 與啟動器。學生只需要安裝應用程式並點擊啟動，不需要自行安裝 Python、Node.js、Git、Docker 或 CUDA Toolkit，也不需要修改系統 `PATH`。

目前這個資料夾是打包 harness 與啟動規格，不包含可直接發放的完整 runtime、模型 payload、簽章或安裝檔。正式版本必須先通過實機與乾淨電腦驗證。

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

模型檔與生成輸出會放在使用者的應用程式資料目錄，不放在受保護的安裝目錄。Launcher 會在第一次啟動時建立資料目錄。

## Runtime 責任

- **Mac**：`runtime/mlx-serve` 是原生 MLX／Metal backend。Adapter 以 loopback 啟動它，並把模型目錄放在使用者資料目錄。Launcher 只對子程序設定 `HOME`，不修改學生原本的 MLX cache、shell 設定或系統 `PATH`。
- **Windows**：`runtime/python/python.exe` 是包內私有 Python。backend wrapper 負責 PyTorch、CUDA 與 native extension；學生不需要編譯。模型下載器會先寫入 `.partial` 目錄，完成後才原子移動到正式模型目錄。
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

`packaging/windows/installer.iss` 是 Windows Inno Setup 安裝器定義。正式建置時，需在 Windows 將完整 payload 放入 `release/windows/`，再產生並簽署 Setup 執行檔。

`packaging/macos/build-dmg.command` 可將 staged payload 組成 `JIC_YZUIC_Hunyuan3D-Mac.app` 與 DMG。若提供 `JIC_CODESIGN_IDENTITY`，腳本可進行 codesign；notarization 仍是正式發佈階段的工作。
