# Windows 私有 backend

`server.py` 是 Windows 專用程序，由 Local Adapter 啟動，不是給學生直接操作的 CLI。正式安裝包必須提供固定版本的 Tencent Hunyuan3D-2.1 source tree、`runtime/models/dinov2-giant`、對應 Python 依賴與預先編譯的 native extension。

## 提供的介面

- `GET /health`
- `GET /v1/models`
- `POST /v1/load-model`
- `POST /v1/unload-model`
- `POST /v1/models/rescan`
- `POST /v1/3d/generations`，使用 SSE 回報進度
- `POST /generate`，提供 Tencent 官方 synchronous API 形狀

啟動 shape pipeline 前，wrapper 會檢查 NVIDIA CUDA 裝置與至少 10 GB VRAM。PBR 需完整 paint／DINO／RealESRGAN 資產、native imports，以及至少 29 GB VRAM（目前兩個 pipeline 同時常駐）。要求材質但能力不足會明確失敗，不會默默回傳無貼圖結果。

## 模型下載

正式 launcher 已改用 `adapter/src/model-files.mjs` 與 `packaging/models/windows.json`，以包內 Node 固定 revision、驗證 SHA-256 並續傳。`download_model.py` 是保留的舊開發入口，不再由學生啟動器呼叫，不應用於新打包流程。

正式發佈時必須攜帶 Tencent 的 `LICENSE`、`Notice.txt`，以及所有包入的第三方 Python／native 元件授權。這個開發 wrapper 本身不代表已取得 checkpoint 再散布許可。
