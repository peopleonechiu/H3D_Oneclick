# JIC_YZUIC_Hunyuan3D

給學生使用的本機照片轉 3D 工具開發版。學生端的目標流程是：先啟動軟體，再由介面下載對應平台的模型，最後上傳一張圖片並產生可預覽、可下載的 GLB 模型。

目前專案提供共用的 Web UI、Local Adapter、Docker mock backend，以及 Mac／Windows 的原生 backend 接線。Docker mock 用來驗證 UI 與 API 流程，不代表 Docker 內已經具備 Hunyuan3D 推論能力。

## 目前狀態

| 項目 | 狀態 |
|---|---|
| Web UI | 已完成照片上傳、模型狀態、模型下載、品質設定、進階設定、生成進度、取消、GLB 預覽、歷史輸出與輸出資料夾操作 |
| 語言 | 已提供繁體中文／English 切換，選擇會保存在本機瀏覽器 |
| Mac Apple Silicon | 已接上原生 `mlx-serve` 的 adapter seam，開發機已完成 shape → GLB smoke test |
| Windows x64 NVIDIA | 已建立私有 Python／CUDA wrapper 與下載流程，仍需 NVIDIA Windows 實機驗證 |
| Docker | 提供 mock backend 與完整 contract test，不需要主機安裝 Python |
| 正式安裝包 | 尚未附上完整 runtime、模型檔、簽章或乾淨電腦驗證結果 |

## Docker 開發環境

需求只有 Docker Desktop。

```bash
docker compose up --build -d
```

開啟本機介面：<http://127.0.0.1:4173>

服務位置：

- Web UI：<http://127.0.0.1:4173>
- Local Adapter：<http://127.0.0.1:8787>
- Mock backend 僅在 Docker 網路內提供服務。

Docker 會以 mock 模型模擬模型下載、進度事件與 GLB 輸出，讓開發時可以不依賴 GPU 驗證整條流程。輸出與模型狀態保存在 Docker volume；若要連同開發資料一起清除：

```bash
docker compose down -v
```

## 學生端產品流程

正式的 Mac／Windows 安裝包會採用「軟體先啟動、模型後下載」：

1. 學生啟動安裝好的應用程式。
2. Launcher 啟動 Local Adapter、平台 backend 與 localhost Web UI。
3. UI 依平台顯示模型狀態與下載操作。
4. 模型完成驗證後，學生上傳 PNG／JPEG 圖片。
5. backend 產生 GLB，UI 顯示 3D 預覽並提供下載。
6. 再次點擊應用程式時，若服務已在執行，Launcher 只重新開啟既有 localhost 頁面，不重複啟動程序。

正式安裝包的 runtime 會隨應用程式提供。學生不應需要自行安裝 Python、pip、Node.js、Git、Conda、Docker 或 CUDA Toolkit；目前 repository 內的 packaging 檔案是打包 harness，尚不等於可直接發放的安裝檔。

## Mac 與 Windows 的差異

兩個平台共用 Web UI 與 `/api` 介面，但推論 backend 不相同：

- **Mac Apple Silicon**：使用原生 `mlx-serve`，模型為轉換後的 `ddalcu/Hunyuan3D-2.1-MLX-Serve-8bit`，透過 MLX／Metal 執行。這不是在一般 Docker container 內執行 Metal 推論。
- **Windows x64 NVIDIA**：使用包內私有 Python runtime，載入 Tencent `Hunyuan3D-2.1` checkpoint 與 PyTorch／CUDA backend。UI 會先檢查 NVIDIA GPU 與 VRAM，不符合條件時不開放下載或生成。
- **PBR texture**：只有 backend 明確回報 paint 能力時才會啟用。Mac 目前以 shape 生成為主，不會因為資料夾存在就假設 PBR 可用。

平台設定檔：

- [Mac Apple Silicon 設定](config/platforms/macos-arm64.json)
- [Windows x64 NVIDIA 設定](config/platforms/windows-x64-cuda.json)
- [原生 backend 接入說明](docs/integration/real-backends.md)
- [學生端打包結構](packaging/README.md)

## 測試

啟動 Docker 後，可執行完整 API contract test：

```bash
node tests/contract.mjs
```

測試會驗證：

```text
health → model download → capabilities → multipart job → SSE progress → GLB → history
```

管理 backend 子程序的 seam test：

```bash
node tests/process-seam.mjs
```

Web UI production build：

```bash
docker compose exec -T web npm run build
```

## 目錄說明

```text
adapter/                  共用 Local Adapter 與 backend process 管理
config/platforms/         Mac／Windows 平台設定
docs/                     backend 接入與產品規格文件
mock-backend/             Docker 開發用 mock backend
packaging/                Mac／Windows launcher 與打包 harness
runtime/backend/          Windows Python／CUDA wrapper 與模型下載器
tests/                    API contract 與 process seam tests
web/                      Web UI、Three.js 預覽與靜態 Web server
docker-compose.yml        Docker 開發服務編排
```

## 授權與模型檔

正式發佈前，必須一併檢查 Tencent Hunyuan3D、MLX 轉換模型、Python 套件、原生 extension 與其他第三方元件的授權條件。開發版 wrapper 與設定檔不等於已取得模型再散布許可。
