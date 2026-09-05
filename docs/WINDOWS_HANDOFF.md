# Windows 打包與實機驗收交接

更新：2026-09-05。本版是修復後的開發交接版，不是已驗收的學生正式發行版。

## 接手者需要準備

建置機使用 Windows x64；NVIDIA GPU 是推論驗收需要，不是 Inno 壓縮檔案的必要條件。Apple Silicon 的 Parallels 不能取代 Windows NVIDIA 推論驗收。

1. 私有、可搬移的 Python 3.10 runtime，含 PyTorch `2.5.1+cu124`、Pillow、huggingface_hub、onnxruntime、rembg，以及固定 Tencent source 所需依賴。不能只交一個依赖外部 Python 的 venv。
2. Tencent source commit `82920d643c0dc2f7bfd7255f45f62d386edfe60c`，需要的 native extensions 在建置機預先編譯。
3. 對應 CUDA 12.4 runtime DLL；學生電腦仍須有相容 NVIDIA driver，但不需 CUDA Toolkit。
4. 預先取得的 `u2net.onnx`，供去背使用。建置器會放入私有目錄，避免學生生成時觸發隱藏下載。
5. PBR 選配：完整 DINO 模型及 `hy3dpaint/ckpt/RealESRGAN_x4plus.pth`，並確保 custom_rasterizer、DifferentiableRenderer 與 paint imports 可載入。省略 `-DinoModel` 可建立 shape-only 套件。
6. 建置機安裝 Inno Setup，讓 `ISCC.exe` 可執行。這是建置工具，不是學生需求。

## 打包命令

```powershell
.\packaging\windows\Build-Payload.ps1 `
  -PythonRuntime C:\build\python-runtime `
  -BackendVendor C:\build\Hunyuan3D-2.1 `
  -CudaDll C:\build\cuda-dll `
  -RemBgModel C:\build\u2net.onnx `
  -BackendRevision 82920d643c0dc2f7bfd7255f45f62d386edfe60c `
  -Payload C:\build\H3D-payload `
  -BuildInstaller
```

如需 PBR，再加 `-DinoModel C:\build\dinov2-giant`。目前 wrapper 同時保留 shape／paint pipeline，PBR 使用保守的 29 GB VRAM 門檻；較低記憶體的 offload 模式未實作，不應宣稱支援。

Builder 會用包內 Node／Python 執行版本、架構、private import 與 ONNX 載入檢查，再呼叫 Inno。自訂 `-Payload` 會傳入安裝器；已有 payload 會改名備份，不直接刪除。請保留建置紀錄與第三方授權。

`--structure-only` 只供跨平台檢查目錄，不能用它跳過 Windows native gate 發布。Builder 目前仍接收預先準備的 runtime，不是自動安裝全部編譯工具的 bootstrap。

## 模型下載

兩平台均由包內 Node 下載器讀取 `packaging/models/{windows,macos}.json`。manifest 固定 HF revision、檔案大小與 SHA-256；大檔雜湊來自 HF LFS metadata，小檔下載後先核對 Git blob ID 再計算 SHA-256。這次開發只查 metadata 與小檔，沒有下載大型權重。

- Windows 固定 `tencent/Hunyuan3D-2.1` 的 `0b94677654c57bb9a6b6845cd7b704ccf551d327`。
- Mac 固定 `ddalcu/Hunyuan3D-2.1-MLX-Serve-8bit` 的 `11ca09dc21a930e9861c0cd19bed0f0507fac232`。
- 下載到 `.partial`，支援 HTTP Range；每檔驗證後才提交。替換既有目錄時保留 `.backup-*`。
- ready marker 遺失時，重新下載操作可直接驗證既有完整模型並復原，不需再次抓取權重。
- 啟動會在背景重新校驗已安裝模型；校驗期間 UI 顯示啟動中，不能生成。
- 新下載路徑取代舊 Python downloader 與 Mac `mlx-serve pull`。更換來源／revision 必須更新並審查 manifest，不能改成 `main`。

## 本輪已驗證

Docker 隔離環境通過：正常 API contract、外部 Origin／Host 拒絕、截斷上傳與斷線 proxy 存活、單工作互斥、取消後不交付結果、下載子程序清理、SHA-256／Range／備份復原、空 payload 拒絕、選配 DINO、UI 狀態函式、Python 參數與生命週期測試、production Web build。這些都不是 GPU 測試；UI 狀態測試使用 DOM stub，不是完整瀏覽器 QA。

Inno 引號與自訂 payload 傳遞已修正，但本機沒有執行 ISCC。CI 定義涵蓋上述 CPU／Docker checks；是否通過遠端 CI 應以該次 workflow 結果為準。

## 必須完成的外部驗收

- 在 Windows 編譯並安裝 Setup.exe，核對实际包入的是自訂 payload，不是舊的 release 目錄。
- 在無 Python／Node／Git／Docker／CUDA Toolkit 的乾淨帳號驗證首次啟動、下載、生成、GLB 預覽／下載、關閉再開。
- 測試中文／空格路徑、舊 Python／Conda 環境變數、非管理員安裝、磁碟不足、網路中斷與重試。
- NVIDIA 實測 shape；如包 PBR，確認貼圖／材質、native DLL 及記憶體需求。macOS 本輪沒有重新做 Metal 生成或 DMG。
- 取消：Windows shape 在 diffusion callback 停止；PBR 正在執行的階段可能需等到階段邊界。MLX 尚未確認原生中止協定，因此保留工作鎖、等待計算結束後丟棄結果，不宣稱立即釋放 GPU。
- Launcher 已加 ready wait、平台識別及 port 衝突提示；尚無自動換 port／跨程序啟動鎖，須測連續快速雙擊。衝突時可設定 `JIC_WEB_PORT`、`JIC_ADAPTER_PORT`、`JIC_BACKEND_PORT`，不會結束其他程式。
- 完成 Windows 簽章／SmartScreen 與 Mac notarization 等正式發行程序後，才發給學生。

歷史 review 保留於 `docs/reviews/`；其未修復結論對應舊 commit，不應用來代替本版驗收結果。
