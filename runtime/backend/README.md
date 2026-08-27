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

啟動 shape pipeline 前，wrapper 會檢查 NVIDIA CUDA 裝置與至少 10 GB VRAM。只有 paint source tree 存在且裝置至少有 21 GB VRAM 時才啟用 PBR。若使用者要求材質但能力不足，工作會明確失敗，不會默默回傳無貼圖結果。

## 模型下載

`download_model.py` 會在 UI 已經開啟後，由 Launcher 使用包內 Python 執行。它透過私有 runtime 的 `huggingface_hub` 將檔案下載到 `<model>.partial`，Hugging Face snapshot 完成後才重新命名成正式目錄。正式建置應將 `--revision` 固定到模型 manifest，不應依賴會移動的 branch。

正式發佈時必須攜帶 Tencent 的 `LICENSE`、`Notice.txt`，以及所有包入的第三方 Python／native 元件授權。這個開發 wrapper 本身不代表已取得 checkpoint 再散布許可。
