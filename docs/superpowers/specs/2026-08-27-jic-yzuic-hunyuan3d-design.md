# JIC_YZUIC_Hunyuan3D 跨平台學生部署規格

- 文件狀態：Proposed
- 日期：2026-08-27
- Mac 產品名稱：`JIC_YZUIC_Hunyuan3D-Mac`
- Windows 對應產品名稱：`JIC_YZUIC_Hunyuan3D-Windows`

## 1. 目標

建立一套給學生使用的本機 image-to-3D 工具。學生只需要下載安裝包、啟動軟體、在 Web UI 上傳一張圖片，即可產生並預覽 GLB 3D 模型。

學生不應該接觸 Python、pip、Git、Node.js、Conda、Docker、CUDA Toolkit 或命令列。軟體與模型分開：先讓軟體啟動，再由 UI 下載或匯入模型。

附上的兩張圖片只作為 UI 參考，不是額外的操作指令。介面可以保留照片上傳、模型選擇、Advanced、Generate、3D 預覽、歷史縮圖與輸出資料夾等互動，但圖片中的記憶體文字不視為硬體保證。

## 2. 已確認的產品決策

1. Mac 與 Windows 使用兩個不同的推論 backend，但共用同一套 Web UI 與 Local Adapter interface。
2. Mac 使用原生 `mlx-serve` 作為 Hunyuan3D backend。
3. Windows 使用 Tencent 官方 Hunyuan3D-2.1 checkpoint 與 PyTorch/CUDA backend。
4. Docker 只用於開發、測試與可重現的打包環境，不列為學生端前置條件。
5. 學生安裝包全包 runtime 與依賴；模型不在安裝階段強制下載，而是在軟體啟動後由 UI 管理。
6. 學生端不安裝全域 Python，也不修改系統 PATH；Windows 安裝包內含私有 Python runtime，backend 子程序使用程序層級環境與絕對路徑啟動。
7. 第一版輸出為照片轉 GLB；PBR texture 是可檢查能力後的選配功能。Windows 官方 paint pipeline 可作為選配；目前 MLX shape engine 沒有明確 texture capability，因此 Mac 不開啟 PBR。沒有 paint 能力時不可默默退回無貼圖結果。
8. 第一版不承諾 rig、骨架、多人協作、模型訓練或雲端帳號功能。

## 3. 產品邊界

### 3.1 第一版包含

- Mac Apple Silicon 本機生成。
- Windows x64 NVIDIA 本機生成。
- PNG/JPEG 單張照片上傳；UI 可顯示拖放與檔案選擇。
- Shape generation，輸出 GLB。
- 若平台 backend 明確回報 paint 能力，提供 PBR texture 選項；目前 Mac MLX 僅提供 shape，Windows 需通過 VRAM 與 paint runtime 檢查。
- 進度、取消、錯誤訊息與 log 位置。
- GLB 3D 預覽、歷史輸出、下載與開啟輸出資料夾。
- 一鍵安裝、首次模型下載、模型驗證、再次啟動與修復。
- Docker 中的 UI、Local Adapter、mock backend 與 interface contract tests。

### 3.2 第一版不包含

- 讓學生自行 clone Git repository。
- 讓學生現場安裝或編譯 Python/CUDA/custom rasterizer。
- 讓學生使用 Docker、PowerShell、批次檔或 CLI 才能完成生成。
- Windows AMD/Intel GPU 的本機 Hunyuan3D 推論。
- Mac Intel 的 MLX 推論。
- 多張照片重建、文字生成 3D、模型微調、批次佇列與遠端生成。

## 4. 整體架構

```text
學生瀏覽器
    ↓ localhost Web UI
JIC Local Adapter
    ├─ Mac Adapter → mlx-serve → MLX / Metal / Apple GPU
    └─ Windows Adapter → Hunyuan3D Python → PyTorch / CUDA / NVIDIA GPU
    ↓
GLB artifact、preview、history、logs
```

### 4.1 Web UI module

Web UI 是跨平台共用的靜態前端。它只呼叫 Local Adapter interface，不直接依賴 `mlx-serve`、PyTorch 或作業系統命令。

主要畫面：

- 左側：Photo、Model、Advanced、Generate。
- 右側：生成進度、3D 預覽、歷史縮圖、輸出資料夾。
- 視覺採 MoMA 啟發的編輯式版面：紙張白底、黑色網格與文字、少量橘色動作色、方角與清楚的欄位層級；只取其資訊編排精神，不複製品牌資產。
- 提供繁體中文／English 切換，預設繁體中文；選擇記錄在本機瀏覽器，重新開啟 localhost 後保留。
- 啟動但尚未下載模型時，顯示模型下載卡片，不顯示 backend stack trace。
- 模型卡片顯示 `Local / Apple MLX` 或 `Local / NVIDIA CUDA`。
- 預設顯示簡單品質選項：快速、平衡、精細；Steps、Guidance、Mesh resolution 放在 Advanced。
- `Texture (PBR)` 與 `Keep model loaded` 依 capabilities 顯示或禁用。
- `Keep model loaded` 預設關閉，以降低學生電腦的常駐記憶體壓力。

品質預設由 backend manifest 提供實際參數，UI 不自行假設 Mac 與 Windows 的 steps 或 resolution 一定相同。

### 4.2 Local Adapter module

Local Adapter 是跨平台的深 module。它對 UI 提供小而穩定的 interface，隱藏 backend 啟動、模型下載、參數轉換、SSE、檔案輸出與錯誤恢復。

它負責：

- 偵測作業系統、CPU/GPU、RAM/VRAM、磁碟與 driver 條件。
- 啟動、停止、重啟與監控 platform backend。
- 將 `qualityPreset` 轉成 backend 可接受的參數。
- 將 Mac 的 `mlx-serve` 與 Windows 的官方 API 統一成同一個 job interface。
- 將 backend progress 正規化為 `queued/loading/generating/texturing/saving/completed/failed/cancelled`。
- 管理模型下載、續傳、hash 驗證與 atomic install。
- 儲存輸出、history metadata、log 與最後一次 UI 設定。
- 不把 backend stdout 當作唯一的工作狀態來源。

### 4.3 Platform backend adapters

#### Mac Adapter

- 呼叫原生 `mlx-serve`，預設只綁定 `127.0.0.1`。
- 使用 `POST /v1/3d/generations`、`stream: true`、`GET /health` 與模型能力資訊。
- 下載並使用預先轉換的 MLX Hunyuan3D model pack。
- Shape 預設可用；目前 MLX engine 的 PBR paint 仍是後續 seam，不因模型目錄含有 `paint` 權重就啟用。
- 不安裝 Python、Conda、PyTorch 或 CUDA。

目前 `mlx-serve` 的 Hunyuan3D engine 是將 Tencent reference port 到 `mlx-c` 的原生實作，並使用預先轉換的 `safetensors` 權重。[engine source](https://raw.githubusercontent.com/ddalcu/mlx-serve/main/src/hunyuan3d.zig)

#### Windows Adapter

- 使用 Tencent 官方 Hunyuan3D-2.1 checkpoint：`tencent/Hunyuan3D-2.1`。
- 使用預先建好的私有 Python runtime、PyTorch CUDA runtime、backend 套件與 custom extensions。
- 不讓學生執行 `pip install` 或現場編譯 custom rasterizer/renderer。
- 只在偵測到相容 NVIDIA driver 與足夠 VRAM 時顯示本機生成。
- 若硬體不合格，第一版顯示清楚的 unsupported message，不做未告知的遠端上傳或無聲 fallback。

Tencent 官方目前提供 Python/CUDA 安裝、shape/paint pipeline 與 API server，但其原始流程仍包含 Python、PyTorch CUDA 與 custom rasterizer 編譯，因此必須在發布前預先建置與驗證 Windows runtime。[官方 Hunyuan3D repository](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1)

## 5. 平台與硬體政策

### 5.1 Mac

- 目標架構：Apple Silicon。
- 安裝器在啟動時驗證 Apple Silicon 與支援的 macOS 版本；目前 upstream README 的發布基準為 macOS 26.2+，實際版本寫入 release manifest。[mlx-serve repository](https://github.com/ddalcu/mlx-serve)
- 以 unified memory 進行容量檢查；UI 顯示「可嘗試」或「建議」而非保證速度。
- 16 GB 為最低實測門檻，32 GB 為課堂建議值；此為本產品部署政策，必須由實機矩陣驗證。
- 模型包與輸出資料放在使用者資料目錄，不放入唯讀的 `.app` bundle。

### 5.2 Windows

- 目標架構：Windows x64、NVIDIA GPU。
- NVIDIA driver 是學生端唯一主要外部硬體前置條件；安裝器不得偷偷替換 driver。
- 官方估算 shape 約需 10 GB VRAM、texture 約需 21 GB VRAM、shape 加 texture 約需 29 GB VRAM；安裝器必須依實際能力決定可用功能，不以低 VRAM 模式作為成功保證。[官方資源需求](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1)
- Windows runtime 的 custom extensions 必須在發布包內預先編譯。
- 必須在乾淨 Windows 機器上驗證「沒有 Python、Git、Node.js、Conda、Docker、CUDA Toolkit」仍可完成安裝與 shape smoke test。

## 6. 學生端安裝與啟動

### 6.1 發布物

```text
JIC_YZUIC_Hunyuan3D-Mac.dmg
JIC_YZUIC_Hunyuan3D-Windows-Setup.exe
```

提供兩種模型交付方式：

1. Online installer：安裝器先安裝軟體，第一次啟動後由 UI 下載模型。
2. Offline full package：教師或助教取得包含模型的完整資料包，透過 USB、校內網路或本地檔案匯入。

「全包」指 runtime 與依賴由產品負責，不表示一定把大型模型壓進單一 EXE。

### 6.2 首次啟動

```text
雙擊安裝器
→ 安裝 UI、Local Adapter、platform runtime
→ 建立使用者資料目錄
→ 自動開啟 localhost UI
→ 顯示模型狀態：尚未安裝
→ 按下載模型或匯入離線模型
→ 續傳與 SHA-256 驗證
→ atomic install
→ backend rescan/load
→ Generate 變為可用
```

安裝器不可在學生電腦執行 Git clone、pip install 或編譯。

### 6.3 再次啟動

```text
雙擊桌面捷徑
→ 啟動 Local Adapter
→ 啟動 platform backend
→ 等待 health ready
→ 開啟 localhost UI
```

模型留在使用者資料目錄，更新 UI 或 runtime 不應刪除模型與輸出。若 backend 啟動失敗，UI 提供 Repair、重新啟動與顯示 log 的入口。

### 6.4 私有 runtime 原則

Windows 安裝包可包含以下私有內容：

```text
runtime/python/python.exe
runtime/python/Lib/
runtime/backend/
runtime/native-extensions/
runtime/cuda-dll/
```

Launcher 使用絕對路徑啟動 `runtime/python/python.exe`，並只對 backend 子程序設定程序層級的 `PATH`、`PYTHONPATH`、模型路徑與暫存路徑。不得寫入系統 PATH、全域 Python registry 或使用者 shell profile。

安裝位置預設使用使用者可寫入的資料目錄，例如 Windows `%LOCALAPPDATA%` 與 macOS `~/Library/Application Support/`；模型與輸出可在 UI 中改到其他磁碟。

## 7. Local Adapter interface

Local Adapter 對 Web UI 提供以下 interface。實際 port 可由 launcher 分配並透過啟動頁傳遞，UI 不應硬編碼 platform backend 的 `11234` 或 Windows backend port。

### 7.1 Health 與能力

```http
GET /api/health
GET /api/capabilities
GET /api/models
```

`/api/capabilities` 最少回傳：

```json
{
  "platform": "macos-arm64",
  "backend": "mlx-serve",
  "modelState": "ready",
  "capabilities": {
    "shape": true,
    "texture": true,
    "formats": ["glb"],
    "stream": true
  },
  "qualityPresets": ["fast", "balanced", "fine"],
  "memoryClass": "recommended"
}
```

### 7.2 模型下載

```http
GET  /api/models
POST /api/models/{modelId}/download
GET  /api/models/{modelId}/download
POST /api/models/{modelId}/cancel-download
POST /api/models/{modelId}/install-local
```

模型 manifest 必須包含：

- platform 與 architecture。
- model repository、revision 或固定版本。
- 檔案清單、大小與 SHA-256。
- shape/texture 能力。
- 最低與建議硬體。
- 授權與 Notice 位置。

下載器必須支援續傳、暫停、重試、hash 驗證與失敗後清理未完成檔案。

### 7.3 生成工作

```http
POST /api/jobs
GET  /api/jobs/{jobId}
GET  /api/jobs/{jobId}/events
POST /api/jobs/{jobId}/cancel
GET  /api/jobs/{jobId}/artifact
```

`POST /api/jobs` 使用 multipart photo，並接受：

```json
{
  "qualityPreset": "balanced",
  "texture": false,
  "steps": 30,
  "guidance": 5.0,
  "meshResolution": 256,
  "seed": null,
  "keepModelLoaded": false
}
```

`qualityPreset` 是一般學生操作的主要參數；Advanced 的數值必須由 `/api/capabilities` 回報可用範圍。若 backend 不支援某項參數，adapter 必須拒絕或明確回報，不可假裝成功。

SSE event 最少包含：

```json
{
  "type": "progress",
  "jobId": "job_123",
  "stage": "shape",
  "step": 12,
  "total": 30,
  "message": "Generating shape"
}
```

完成事件包含 artifact id、檔案名稱、格式、大小與本地檔案路徑的受控識別，不把任意絕對路徑直接交給瀏覽器。

### 7.4 輸出與歷史

```http
GET  /api/outputs
GET  /api/outputs/{artifactId}
POST /api/system/open-output-folder
```

輸出預設為 `.glb`。history 儲存來源圖片名稱、生成時間、backend、model version、quality、texture、seed 與 artifact path，讓學生可以重新預覽而不必重新生成。

## 8. 生成與 UI 行為

### 8.1 初始狀態

- 沒有圖片：Generate disabled，顯示選擇照片提示。
- 沒有模型：顯示下載模型卡片，Generate disabled。
- 模型下載中：顯示百分比、速度、剩餘大小與取消按鈕。
- backend 啟動中：顯示「正在準備本機引擎」，不顯示終端機。

### 8.2 生成狀態

```text
idle
→ validating
→ loading
→ shape
→ texture（若選取 PBR）
→ saving
→ completed
```

生成期間：

- Generate 變為 Cancel。
- 進度條為 determinate；若 backend 沒有可靠百分比，顯示階段與 spinner，不偽造百分比。
- 完成後自動將 GLB 放入 outputs，更新右側預覽與 history。
- 使用者取消時，adapter 釋放模型與暫存檔，不留下半成品作為有效結果。

### 8.3 PBR 與模型常駐

- `Texture (PBR)` 只有在 `capabilities.texture=true` 時可選。
- texture weights 缺少時回傳 `TEXTURE_UNAVAILABLE`，不可靜默改成無貼圖 GLB。
- `Keep model loaded` 預設關閉；勾選後顯示記憶體使用提醒。
- adapter 在生成完成後依設定 unload model。

## 9. 錯誤處理

錯誤必須由 adapter 轉成學生看得懂的訊息，同時保留技術 log：

| Code | 使用者訊息方向 | 處理方式 |
|---|---|---|
| `UNSUPPORTED_HARDWARE` | 這台電腦不符合本機生成條件 | 顯示需求與檢查結果 |
| `DRIVER_MISSING` | 找不到相容的 NVIDIA driver | 提供教師／管理員處理提示 |
| `MODEL_MISSING` | 請先下載模型 | 回到模型下載卡片 |
| `MODEL_DOWNLOAD_FAILED` | 模型下載未完成 | 允許續傳與重試 |
| `MODEL_CHECKSUM_FAILED` | 模型檔案驗證失敗 | 刪除未完成檔並重新下載 |
| `INSUFFICIENT_MEMORY` | 記憶體不足，請降低品質或關閉其他程式 | 提供快速模式與取消 |
| `TEXTURE_UNAVAILABLE` | PBR 模型尚未安裝 | 保持 texture 關閉或提供安裝入口 |
| `BACKEND_START_FAILED` | 本機引擎啟動失敗 | Repair、重啟、開啟 log |
| `PORT_IN_USE` | 本機服務埠被占用 | 自動改用可用 port，不要求學生手動查 port |
| `INVALID_IMAGE` | 請選擇 PNG 或 JPEG 單張照片 | 回到上傳區 |
| `GENERATION_FAILED` | 生成失敗 | 保留 job log，不產生假成功結果 |
| `CANCELLED` | 已取消 | 清除未完成輸出 |

所有錯誤都必須包含可供老師複製的診斷識別碼與 log 位置；學生 UI 不顯示 secrets 或完整環境變數。

## 10. 儲存與隱私

- 預設只綁定 `127.0.0.1`，圖片不離開學生電腦。
- 不把 local backend 預設暴露到 `0.0.0.0`。
- 模型、輸出、下載暫存與 logs 分開儲存。
- 使用者可以清除輸出與下載暫存，但清除模型前要再次確認。
- 不把圖片或生成結果送到遠端服務；若未來加入遠端 fallback，必須是明確的使用者操作與獨立設定。
- 發布包保留 `LICENSE`、`NOTICE` 與第三方授權。`mlx-serve` 自身為 MIT，但其第三方元件與 Hunyuan model license 仍需分別遵守。[mlx-serve license](https://raw.githubusercontent.com/ddalcu/mlx-serve/main/LICENSE)、[Hunyuan model card](https://huggingface.co/tencent/Hunyuan3D-2.1)

## 11. Docker 開發規格

Docker 是開發隔離工具，不是學生端的必要 runtime。

### 11.1 Compose profiles

```text
default
├─ web-ui
├─ local-adapter
├─ mock-backend
└─ contract-tests

windows-cuda
├─ web-ui
├─ local-adapter
└─ hunyuan-cuda-backend（需要 NVIDIA Docker runtime）
```

### 11.2 Docker 驗證範圍

- UI build、adapter interface、模型狀態機、SSE parser、錯誤 mapping。
- mock GLB artifact、下載續傳、hash 驗證、history 與輸出管理。
- Windows CUDA backend 在具備 NVIDIA GPU 的 Windows/WSL2 環境做實際 smoke test。
- Mac 的 MLX/Metal generation 不在一般 Linux container 內宣稱通過；必須以原生 Mac `mlx-serve` 做 integration smoke test。

### 11.3 開發機隔離

- 不在開發者宿主機全域安裝專案 Python、Node 或 Hunyuan requirements。
- Docker image 固定基礎映像、Python/CUDA/PyTorch 版本與依賴 lock。
- backend 產物經過 clean-machine test 後才進入學生安裝包。
- Docker volume 不應覆蓋宿主機既有專案或使用者模型目錄；使用明確的 project-scoped volume。

## 12. 打包與版本管理

每個 release 必須產生一份 manifest，包含：

- app version。
- adapter version。
- Mac/Windows backend version 或 Git commit。
- model repository、revision、model files hash。
- 最低支援 OS、CPU/GPU 與記憶體政策。
- 可用 capabilities。
- 安裝包與離線模型包的 hash。
- License/Notice 版本。

學生端更新順序：

```text
更新 manifest
→ 下載新 runtime
→ 驗證與安裝到新版本目錄
→ 保留舊版本與模型
→ health check
→ 成功後切換版本
```

不可覆寫正在使用的 backend，也不可因更新 UI 而刪除模型或生成結果。

## 13. 驗收條件

### 13.1 學生端 clean-machine 驗收

- 在沒有 Python、Git、Node.js、Conda、Docker 的 Windows 電腦上，雙擊 Setup.exe 可以完成軟體安裝。
- 在沒有全域 Python 的 Mac Apple Silicon 電腦上，雙擊 `.dmg` 後可以開啟 UI。
- 安裝前後系統 PATH、全域 Python registry 與 shell profile 沒有被產品修改。
- 軟體第一次開啟時，即使模型尚未下載，UI 仍可正常啟動並顯示模型狀態。
- 模型下載中斷後重新開啟可以續傳，不會從零開始，也不會把未完成檔當成可用模型。
- 模型 hash 不符合時，UI 顯示驗證錯誤並提供重新下載。
- 模型完成後，Generate 才會啟用。

### 13.2 生成驗收

- shape-only 生成輸出有效 GLB，包含非空 mesh。
- PBR 生成只有在 texture capability 存在時啟用；輸出包含可讀取的材質／貼圖資料。
- SSE 進度、完成、取消與失敗事件都能被 UI 正確處理。
- 生成失敗不產生假成功 artifact。
- 重新開啟軟體後，歷史 GLB 仍可預覽與下載。
- Mac 與 Windows 使用相同 UI 流程，但可根據 capabilities 隱藏不支援選項。

### 13.3 Docker 驗收

- `docker compose --profile default up` 可以啟動 UI、adapter、mock backend 與 contract tests。
- contract tests 覆蓋 health、capabilities、model missing、download、job progress、cancel、artifact 與錯誤 mapping。
- Docker build 不依賴宿主機全域 Python 或 Node。
- Mac native MLX 與 Windows CUDA 另有 platform smoke test，不以 mock backend 代替真實硬體證據。

### 13.4 發布證據

每次發布保留：

- clean-machine install log。
- `/api/health` 與 `/api/capabilities` 結果。
- shape GLB 驗證結果。
- texture GLB 驗證結果（若該平台發布 PBR）。
- 安裝前後系統環境差異檢查。
- 模型 manifest、hash 與授權檔案。
- 各硬體組合的生成時間、峰值記憶體與失敗率；在實測完成前，不把生成秒數寫成產品保證。

## 14. 風險與發布閘門

1. **Windows runtime 打包風險**：官方流程包含 CUDA 與 custom extensions。沒有在乾淨 Windows NVIDIA 機器通過安裝與 shape smoke test 前，不發布 Windows 學生包。
2. **硬體差異風險**：Mac unified memory 與 Windows VRAM 不可用同一個數字判斷；所有模型能力由 manifest 與 runtime probe 決定。
3. **模型下載風險**：Online installer 必須有續傳、hash、重試與離線匯入方案。
4. **授權風險**：程式碼、模型、第三方套件與 Notice 分開追蹤，不因「全包」而忽略模型授權。
5. **上游變動風險**：固定 `mlx-serve` commit、Windows Hunyuan repo commit、model revision 與 adapter contract；更新必須重新通過 smoke tests。

## 15. 參考來源

- [Tencent Hunyuan3D-2.1 GitHub](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1)
- [Tencent Hunyuan3D-2.1 Hugging Face model](https://huggingface.co/tencent/Hunyuan3D-2.1)
- [ddalcu/mlx-serve](https://github.com/ddalcu/mlx-serve)
- [mlx-serve HTTP API](https://raw.githubusercontent.com/ddalcu/mlx-serve/main/docs/api.md)
- [mlx-serve Hunyuan3D shape engine](https://raw.githubusercontent.com/ddalcu/mlx-serve/main/src/hunyuan3d.zig)
- [MLX installation documentation](https://ml-explore.github.io/mlx/build/html/install.html)
- [Docker Desktop GPU support](https://docs.docker.com/desktop/features/gpu/)
