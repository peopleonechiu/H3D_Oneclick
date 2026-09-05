# Windows 打包交接 Review

歷史紀錄：以下是修復前 `42c6cfd` 的審查結果。2026-09-05 後續修復與仍待實機驗收項目，請看 [最新 Windows 交接文件](../WINDOWS_HANDOFF.md)。

日期：2026-09-05。檢查基準：`42c6cfd3dd7f4d5ea67874b100c315837001d181`。

結論：未通過「程式已完成，可交給對方只做 Windows 打包」的條件。可以作為待修復的開發原始碼交接，不能標示為待封裝即可發布的版本。

本輪確認本地 HEAD 與 `git ls-remote origin refs/heads/main` 一致。上次 review 以後沒有應用程式碼變更；上次的 17 項問題尚無修復提交。依使用者「如果好了幫我 push」的條件，本輪未 commit／push，僅新增本 review。

## 阻礙交接的問題

| 優先級 | 問題與影響 | 原始碼位置 | 本輪證據 |
|---|---|---|---|
| P1 | Inno Setup Parameters 使用 `\"` 內嵌引號，不符 Inno 參數語法；阻礙 Setup.exe 編譯 | `packaging/windows/installer.iss:25`，另有 26、29 | 已重新對照官方文件；本輪未執行 Windows ISCC |
| P1 | verifier 只確認路徑存在，無法判斷包內 Python、CUDA DLL、native extensions 是否可用 | `packaging/verify-payload.mjs:99` | 必需檔案全部為 0 bytes、搭配空 DINO 目錄，exit 0：`Payload verified: windows (0.00 GiB)` |
| P1 | adapter 對所有網路介面監聽，API 無授權及 Origin 限制 | `adapter/src/server.mjs:1108`、219 | 啟動 log 為 `0.0.0.0`，任意 Origin 的 outputs 請求得到 HTTP 200 與 CORS `*`；未進行跨機器存取測試 |
| P1 | 圖片 multipart 不完整時，未處理 file stream error，使整個 adapter 退出 | `adapter/src/server.mjs:525` | Docker 內送出截斷 multipart，exit 1：`Unexpected end of form` |
| P1 | 上游串流中斷時，未處理 proxy stream error，使 Web server 退出 | `web/server.mjs:72` | Docker 內中斷假上游 SSE，exit 1：`TypeError: terminated` |
| P1 | PBR 將本地資料夾當成 HF repo ID 傳給固定版本上游，貼圖載入失敗 | `runtime/backend/server.py:211` | 重新對照固定上游 `multiview_utils.py:33` 的 `snapshot_download(repo_id=...)` |
| P2 | DINO 宣告為選配，但缺少時 `exists()` 先寫入 failures，後加 warning 仍導致整個打包失敗 | `packaging/verify-payload.mjs:121` | 省略 DINO 時 exit 1：`runtime/models/dinov2-giant (directory missing)` |
| P2 | builder 的自訂 `-Payload` 沒有傳入 Inno；仍打包固定 `release/windows`，可能失敗或包到舊版本 | `packaging/windows/Build-Payload.ps1:162`、`packaging/windows/installer.iss:3` | 靜態確認 ISCC 呼叫只有 script 路徑，未傳入 payload，script 又硬編碼 PackageRoot |

Inno 引號應以兩個連續雙引號表示，詳見 [官方參數語法](https://jrsoftware.org/ishelp/topic_params.htm)。PBR 的依據為 [固定 commit 的 multiview_utils.py](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/82920d643c0dc2f7bfd7255f45f62d386edfe60c/hy3dpaint/utils/multiview_utils.py#L33)。

模型 manifest 未接入、下載復原、取消／卸載互相干擾、下載子程序未清理、steps 與 metadata 不一致、UI 狀態復原及 GLB 完整性問題，見 [2026-08-31 完整 review](2026-08-31-release-readiness.md)。這些相關原始碼仍未變更；本輪沒有把全部 17 項重新動態測試一次。

## 本輪驗證

- 通過：現有 `tests/process-seam.mjs`、adapter 與 Web server JS 語法檢查。
- 通過：在隔離 Docker 容器內，使用目前原始碼執行 `tests/contract.mjs`；health、mock download、生成、SSE、GLB、history 正常流程皆通過。
- 通過：在既有 Web Docker image 內覆入目前 Web source 後執行 `npm run build`，Vite build 成功；仍有超過 500 kB 的 chunk 警告。
- 重現：上表中的空 runtime、DINO 缺少、CORS、截斷 multipart 及 proxy stream 失敗。
- 本輪 Docker Engine 可正常使用，與 8 月 31 日狀態不同。
- 測試容器使用 `--network none`、read-only source mount，無 host port publication、無學生模型資料 volume；完成後自動移除容器。
- 未安裝宿主機套件、未下載大型模型、未重新打包 Mac DMG、未執行 Windows／NVIDIA／ISCC 實測。

診斷腳本暫存在 `/private/tmp/jic-windows-handoff-review.TixDTC/check.mjs`，不是正式 regression test；假模型與輸出僅在已移除的容器內。

## 給 Windows 接手者的實際工作範圍

目前 `Build-Payload.ps1` 接收已準備好的 `PythonRuntime`、`BackendVendor`、`CudaDll`，不會自行建立完整 Python／PyTorch／CUDA runtime。接手者除了安裝器工作，仍須準備私有 runtime、編譯匹配的 native extensions，並驗證搬移後可載入。

固定版本記錄在 `packaging/windows/runtime-spec.json`：Python 3.10、PyTorch 2.5.1+cu124、CUDA runtime 12.4，Tencent source 與 model commit 也已記錄。這些是目前專案設定，尚非已驗收的 Windows 組合。

交接順序：先修正本輪阻礙及上次 review 的相關問題，建立 Windows runtime，再產出 Setup.exe，最後在沒有 Python／Node／Git／Docker／CUDA Toolkit 的 Windows NVIDIA 電腦完成安裝、首次下載、生成、取消、重開與 GLB 驗證。NVIDIA driver 仍由電腦提供。
