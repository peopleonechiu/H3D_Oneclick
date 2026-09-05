# H3D Oneclick 發布前 Review

歷史紀錄：以下問題對應修復前 `42c6cfd`。2026-09-05 後續修復與剩餘驗收限制，請看 [最新 Windows 交接文件](../WINDOWS_HANDOFF.md)。

日期：2026-08-31。檢查基準：`main` / `42c6cfd`。

結論：目前不宜作為學生正式安裝包發布。正常的 mock 流程通過，但安全邊界、錯誤處理、模型與 runtime 驗證，以及 Windows 安裝／PBR 流程有明確缺陷。一次 review 不能保證沒有其他問題；以下區分本輪重現、靜態確認與仍需實機驗證的項目。

本輪沒有修改應用程式碼、重新打包、安裝套件、下載模型或 push。僅新增本文件。診斷腳本與假模型資料在 `/private/tmp/jic-h3d-review.OUOOjk/`，測試程序已結束。

## 範圍與驗證方式

- 檢查共享 Web UI、Local Adapter、Windows Python wrapper／下載器、兩平台 launcher、payload builder、verifier、安裝器及既有規格。
- 以現在的使用者需求為準：學生不自行安裝開發環境、軟體先啟動再下載模型、跨平台相似操作流程。舊規格內的 MoMA 視覺描述不作為本輪判錯依據。
- 既有 contract test 在獨立資料目錄、既有 Node runtime 與 mock backend 上重新執行。
- Windows wrapper 的控制流程使用真正的 wrapper 程式碼與 Python 標準函式庫，替換 GPU／模型物件；這能驗證參數與生命週期錯誤，不能代表 CUDA 推論通過。
- UI 狀態測試使用 Node VM 與 DOM stub，驗證真正 UI 函式的結果；不是完整瀏覽器或視覺 QA。
- Windows 上游對照固定 commit `82920d643c0dc2f7bfd7255f45f62d386edfe60c`，不是任意最新版本。

## P1：發布前優先修復

### R01 — Adapter 暴露到區域網路，且 API 沒有來源限制

位置：[adapter/src/server.mjs:1108](/Users/jichiu/Desktop/Document/各種/Huanyuan_2.1_3D/adapter/src/server.mjs:1108)，同檔 219–237、1014–1019、1055–1073。

實際監聽 `0.0.0.0`，不是平台設定檔宣告的 `127.0.0.1`。模型下載、生成、history、GLB 下載及開啟資料夾均無授權檢查；CORS 也允許任意 Origin。包內 launcher 沒有覆寫 adapter 的 bind address，因此會帶入學生版本。

重現：帶 `Origin: https://untrusted.invalid` 的 `/api/outputs` 請求回傳 HTTP 200、`Access-Control-Allow-Origin: *` 及測試產物清單；啟動 log 明確是 `0.0.0.0`。未從另一台電腦做攻擊測試；實際遠端可達性仍受防火牆、瀏覽器本機網路限制影響，但應用程式本身的邊界缺失已確認。

修正方向：學生端強制 loopback；Docker 的容器 bind 與 host port publication 另行設定。檢查 Host／Origin，拒絕非授權來源，必要時加啟動期 token。不能只修改 CORS 而保留無授權的 LAN API。

### R02 — 不完整 multipart 上傳會使 adapter 整個退出

位置：[adapter/src/server.mjs:525](/Users/jichiu/Desktop/Document/各種/Huanyuan_2.1_3D/adapter/src/server.mjs:525)。

Busboy 的 photo FileStream 只有 `data` 與 `limit` handler，沒有 `error` handler。外層 parser 的錯誤處理不能接住 FileStream 自己的未處理 error。

重現：送出缺少結尾 boundary 的圖片 multipart，adapter 以 exit code 1 結束，錯誤為 `Unhandled 'error' event` / `Unexpected end of form`。這不是單筆工作失敗，而是本機 API 消失。

修正方向：處理 file／parser／request 的 error、aborted 與 close，終止解析並回覆可理解的錯誤；加入截斷及中途斷線上傳測試，確認服務仍存活。

### R03 — 上游 SSE 中斷會使 production Web server 整個退出

位置：[web/server.mjs:72](/Users/jichiu/Desktop/Document/各種/Huanyuan_2.1_3D/web/server.mjs:72)。

`Readable.fromWeb(response.body).pipe(res)` 沒有處理串流的 error；`proxyApi()` 已返回後的 stream error 不會進外層 Promise catch。當 adapter 退出或串流連線損壞時，Web server 自己也會崩潰。

重現：測試上游先送 SSE，再中斷 socket；Web server exit code 1，`Unhandled 'error' event` / `TypeError: terminated`。

修正方向：使用有錯誤傳播的 pipeline 或等效生命週期管理；瀏覽器斷線時也中止上游讀取。失敗應限於該請求，服務應能繼續處理下一筆。

### R04 — Windows Inno Setup 的 Parameters 引號不合法

位置：[packaging/windows/installer.iss:25](/Users/jichiu/Desktop/Document/各種/Huanyuan_2.1_3D/packaging/windows/installer.iss:25)，同檔 26、29。

安裝器把路徑內的引號寫成 `\"`。Inno Setup quoted parameter 內嵌引號須用連續兩個雙引號；反斜線不是此處的 escape。現在的寫法會提前結束 Parameters 字串，妨礙安裝器編譯，不能把這份 `.iss` 當成已可用的 EXE 發布入口。

依據：[Inno Setup 官方參數語法](https://jrsoftware.org/ishelp/topic_params.htm)。本機沒有 Windows／ISCC，未執行真正編譯；此項是文件與原始碼確認。

修正方向：修正三處引號，執行 ISCC，再測含空格與中文使用者路徑的安裝、桌面捷徑及安裝完成後啟動。

### R05 — Windows PBR 把本地路徑傳給要求 HF repo ID 的上游

位置：[runtime/backend/server.py:211](/Users/jichiu/Desktop/Document/各種/Huanyuan_2.1_3D/runtime/backend/server.py:211)。

wrapper 把 `config.multiview_pretrained_path` 設成使用者的模型資料夾。但是固定版本上游的 `multiviewDiffusionNet` 直接執行 `snapshot_download(repo_id=config.multiview_pretrained_path)`。Windows 絕對路徑不是合法 repo ID，即使權重、GPU 與 native extensions 都準備完成，仍會在 paint 載入時失敗。

依據：[固定版本上游 multiview_utils.py](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/82920d643c0dc2f7bfd7255f45f62d386edfe60c/hy3dpaint/utils/multiview_utils.py#L33)。此項是固定版本 contract 對照，非 GPU 實測。

修正方向：讓封裝後的 paint loader 明確支援已下載的本地目錄，略過 repo 下載分支；不可只改回遠端 repo ID，否則又會繞過 UI 的模型下載與固定 revision。

### R06 — 取消只中斷 HTTP，運算仍執行，而且可同時卸載模型

位置：[adapter/src/server.mjs:1036](/Users/jichiu/Desktop/Document/各種/Huanyuan_2.1_3D/adapter/src/server.mjs:1036)、同檔 826–832；[runtime/backend/server.py:221](/Users/jichiu/Desktop/Document/各種/Huanyuan_2.1_3D/runtime/backend/server.py:221)。

adapter abort 的是 fetch；Windows 的同步生成不檢查取消狀態，且 `/v1/unload-model` 不取得生成鎖。adapter 取消後會執行 unload，UI 又立刻允許下一次生成。另有多頁籤同時送工作時，每份工作都能獨立 load／unload 同一個 backend 的問題。

重現：使用真正的 Python HTTP handler 與可暫停的假 shape pipeline，客戶端斷線後生成仍在進行；此時 unload 回傳 HTTP 200 並清空 pipeline 欄位；放行測試計算後，原本已取消的工作仍完成運算。這驗證的是控制流程，不是實際 GPU 記憶體行為。

修正方向：以單一工作管理機制序列化 load／generate／unload；取消要等 backend 確認停止，再釋放資源及允許新工作。載入階段也要有取消／逾時處理。

### R07 — 學生 launcher 沒有接上強制模型完整性驗證

位置：[adapter/src/server.mjs:135](/Users/jichiu/Desktop/Document/各種/Huanyuan_2.1_3D/adapter/src/server.mjs:135)、同檔 82–105、333–353；兩平台 launcher。

`MODEL_MANIFEST_PATH` 未設定就直接驗證成功，兩邊 launcher 均未提供該 manifest。`modelPathReady()` 只找 config 與任意權重副檔名，不確認預期檔案、大小或內容。Mac 平台 JSON 雖記錄 revision，但 launcher 的 `mlx-serve pull` 沒有使用該 revision，設定檔本身也沒有被這條啟動流程讀取。

重現：測試下載器建立 `{}` config 和內容為文字的假 `.safetensors` 後 exit 0，adapter 把模型標為 `ready`。此測試不表示 MLX 能使用假權重，而是確認應用程式的完整性 gate 沒有攔住它。

修正方向：發行時提供固定 revision、預期檔案清單、size／digest；安裝完成與 ready marker 必須依驗證結果提交。校驗失敗要提供保留舊版本的修復流程。

### R08 — Windows payload verifier 接受完全不可執行的 runtime

位置：[packaging/verify-payload.mjs:99](/Users/jichiu/Desktop/Document/各種/Huanyuan_2.1_3D/packaging/verify-payload.mjs:99)。

目前只確認路徑存在、目錄非空以及 `.dll` 副檔名。未檢查 Python／PyTorch 版本、平台架構、native extension 載入能力、DLL 相依性或私有 Python 的可搬移性。

重現：所有必需檔案均為 0 bytes、僅放一個空 `.dll` 及空 DINO 目錄，verifier exit 0 並印出 `Payload verified: windows (0.00 GiB)`。

修正方向：保留結構檢查，但不得用它代表 runtime 可用。Windows builder 必須執行包內 Python／Node 與必要 import smoke、版本／架構檢查；native 載入及 GPU 生成另設實機 release gate。

## P2：功能與復原缺陷

### R09 — 選配 DINO 缺少時反而阻止 shape-only 打包

位置：[packaging/verify-payload.mjs:121](/Users/jichiu/Desktop/Document/各種/Huanyuan_2.1_3D/packaging/verify-payload.mjs:121)。

`exists()` 找不到路徑會先寫入 `failures`；後面另加 warning 並沒有移除 failure。因此 README 及 builder 宣告可省略的 DINO 實際導致 exit 1。

重現：其他必要路徑完整但沒有 DINO，得到 `runtime/models/dinov2-giant (directory missing)`。應區分 optional check 與必需檔案檢查。

### R10 — Adapter 關閉時不終止進行中的模型下載

位置：[adapter/src/server.mjs:1099](/Users/jichiu/Desktop/Document/各種/Huanyuan_2.1_3D/adapter/src/server.mjs:1099)。

SIGINT／SIGTERM handler 只停止 managed backend，沒有清理 `downloadProcesses`／`downloadTimers`。Mac launcher 也是只終止 Web 與 adapter。應用程式關閉後仍可能下載、占用頻寬與寫入模型目錄；再次開啟又不認得原下載工作。

重現：啟動假的長時間下載器，再對 adapter 送 SIGTERM；adapter 已退出，但下載 PID 仍存活。測試結束時已明確終止該 PID 並確認不再存在。

修正方向：關閉流程需停止並等待所有所屬子程序，保留可續傳的 partial 狀態；重新啟動也要防止同一路徑多個下載工作。

### R11 — Windows 完成 rename 後若 ready marker 遺失，重新下載無法復原

位置：[runtime/backend/download_model.py:50](/Users/jichiu/Desktop/Document/各種/Huanyuan_2.1_3D/runtime/backend/download_model.py:50)。

完整下載移至正式目錄後，ready marker 由另一個 adapter 程序另外寫入。若在兩者之間關閉、marker 損壞，或日後啟用 manifest 後驗證失敗，UI 會要求重新下載；下載器完成後卻只嘗試 `rmdir()` 已有模型目錄，非空時永遠 exit 5。

重現：同一下載器搭配假的 snapshot downloader，首次 exit 0、保留正式目錄後重跑 exit 5：`Target model directory is not empty`。

修正方向：先辨識並驗證既有完整安裝，支援復原 marker；需要替換時使用 staging／備份／原子切換，不直接刪除既有可用模型。

### R12 — 下載中重開頁面會失去進度、取消與完成通知

位置：[web/src/main.js:721](/Users/jichiu/Desktop/Document/各種/Huanyuan_2.1_3D/web/src/main.js:721)、同檔 755–798、1117。

下載輪詢只存在於按鈕觸發的 `downloadModel()`。初始化 `refreshStatus()` 看見 downloading，只會停用下載按鈕，沒有恢復輪詢或顯示取消按鈕；初始化也沒有持續更新模型狀態。

重現：DOM stub 中模擬模型正在 50% 下載，執行真正 `refreshStatus()`，結果仍顯示 `0%`、取消隱藏、下載停用；僅請求 capabilities 與 models，未追蹤下載狀態。完成後亦需手動 refresh 才會更新可生成狀態。

修正方向：啟動時恢復 active download／job 的觀察，輪詢與按鈕 click handler 分離。

### R13 — Windows 不支援的 GPU 被顯示為持續「檢查中」

位置：[web/src/main.js:632](/Users/jichiu/Desktop/Document/各種/Huanyuan_2.1_3D/web/src/main.js:632)；[adapter/src/server.mjs:175](/Users/jichiu/Desktop/Document/各種/Huanyuan_2.1_3D/adapter/src/server.mjs:175)。

adapter 在 `hardware.supported === false` 時把 backendHealth 設成 unavailable；UI 卻只有 backendHealth 是 ready 才處理 unsupported 的原因，因此該分支無法生效。首次尚未選照片時，學生只看見檢查中／硬體「—」與停用下載。

重現：無相容 NVIDIA 的 health fixture，UI 輸出 `Checking`、`—`，未呈現已知硬體原因。

修正方向：區分 runtime 連線狀態與硬體支援判斷，有 hardware 結果就呈現具體原因，不用 healthy gate 遮住它。

### R14 — Windows 偷改 steps，metadata 與實際參數不一致

位置：[adapter/src/server.mjs:609](/Users/jichiu/Desktop/Document/各種/Huanyuan_2.1_3D/adapter/src/server.mjs:609)、[runtime/backend/server.py:230](/Users/jichiu/Desktop/Document/各種/Huanyuan_2.1_3D/runtime/backend/server.py:230)。

UI 平衡／精細為 30／40 steps，但 adapter 與 Python 都截成最多 20；history 仍儲存使用者送入的數值。Python 的 `or` 預設值也會把 seed 0、guidance 0 改成 42、5。

重現：HTTP request 接受 40，送給 backend 是 20，產物 metadata 記錄 40；直接執行真正 `_run_shape()` 控制邏輯亦得到 steps 20／seed 42／guidance 5。

修正方向：由能力資訊定義範圍並以同一組有效參數顯示、執行與存檔；不支援的參數明確拒絕，零值不能用 truthiness 代替空值檢查。

### R15 — GLB 只檢查 magic bytes，截斷檔案也回報成功

位置：[adapter/src/server.mjs:712](/Users/jichiu/Desktop/Document/各種/Huanyuan_2.1_3D/adapter/src/server.mjs:712)；Python wrapper 314–316 有相同檢查。

只有 `glTF` 四個字元，沒有完整 GLB header、JSON chunk 或 mesh，仍通過輸出驗證。

重現：HTTP 測試 backend 回傳 4-byte `glTF`，job 狀態為 completed、artifactBytes 為 4。學生將得到「完成」但無法預覽的檔案。

修正方向：檢查 header/version/declared length、chunk 結構及非空 mesh；PBR 發布還要驗證材質／貼圖。檢查失敗不能寫入成功 history。

### R16 — Launcher 未等 ready 就開瀏覽器，也沒有處理 port 衝突

位置：[packaging/macos/launch.command:85](/Users/jichiu/Desktop/Document/各種/Huanyuan_2.1_3D/packaging/macos/launch.command:85)、[packaging/windows/Launch.ps1:84](/Users/jichiu/Desktop/Document/各種/Huanyuan_2.1_3D/packaging/windows/Launch.ps1:84)。

兩邊都是 spawn 後直接開瀏覽器，沒有等待 Web 與 adapter ready；前端只在初始化查一次。冷啟動較慢時可能先顯示連線失敗，需要學生手動 refresh。三個固定 port 被占用時沒有自動換 port；再次開啟僅比對通用 adapter 名稱，也可能把開發用 mock 誤認為已開啟的正式 app。

此項為靜態控制流程確認，未宣稱在每台電腦必然重現。

修正方向：啟動鎖、程序／平台識別、可用 port 分配、bounded health wait；UI 啟動失敗需能自動重試並提供診斷。

### R17 — PBR capability 僅靠目錄存在就宣告可用

位置：[runtime/backend/server.py:133](/Users/jichiu/Desktop/Document/各種/Huanyuan_2.1_3D/runtime/backend/server.py:133)。

檢查只有 VRAM flag、paint 程式檔與 DINO 目錄。沒有驗證 paint／DINO／RealESRGAN 權重、custom extensions 是否能載入；`_paint_error` 也未納入 capability 判斷。缺少資產或第一次載入失敗後，UI 仍可能顯示 PBR 可用。

重現：假的支援 GPU 狀態，搭配空 DINO 目錄和空的 textureGenPipeline.py，真正 `texture_capability()` 回傳 true。

修正方向：從已驗證的 runtime／model manifest 和 native probe 推導能力；失敗要降為不可用並呈現原因。另須實測 shape 與 paint 同時常駐時的記憶體門檻。

## 本輪通過與限制

通過：

- `tests/contract.mjs`：health → mock download → capabilities → multipart job → SSE → GLB → history。
- `tests/process-seam.mjs`：managed backend 啟動與終止。
- adapter、Web JS 語法檢查與 Mac shell 語法檢查。
- 既有 Mac payload 的結構驗證：0.30 GiB。這是結構檢查，不是 GPU 推論驗收。
- 既有 Mac DMG 的 `hdiutil verify`：checksum VALID。這不是 Developer ID／notarization／Gatekeeper 驗證。

本輪未完成或不可替代的驗證：

- Docker Desktop 回報 `Docker Desktop is unable to start`，未重跑 Docker build／Compose E2E；改用現有 runtime 與暫存資料做上述測試，沒有安裝本地依賴。
- 無 Windows NVIDIA 實機、PowerShell／ISCC，未產生或執行 Windows EXE，也未驗證實際 CUDA、driver、native extension 及 PBR 結果。
- 未下載大型 HF 模型，未重新做 Mac Metal 生成或新機首次下載 smoke test。
- 未做完整瀏覽器／視覺／輔助使用工具測試。
- Windows dev bootstrap 仍不存在；`Build-Payload.ps1` 仍要求外部準備好的 private runtime。這是既有交付缺口，不是本輪已完成項目。
- 規格中的離線匯入、修復、模型位置設定及完整 hash manifest 尚未形成可驗收的整套流程。
- 仍需乾淨 OS 帳號驗證：中文／空格路徑、既有 Python／Conda 環境變數、無管理員權限、磁碟不足、網路代理／中斷、重複開啟、升級與移除時保留模型／輸出。

## 建議修復順序

1. R01–R03：關閉網路暴露，修復上傳／串流造成的整個服務崩潰。
2. R06、R10、R16：單一工作與子程序生命週期、取消、停止、重新啟動。
3. R07–R09、R11：模型與 runtime 驗證、選配資產、下載復原。
4. R04–R05、R14、R17：Windows 安裝與官方 backend contract。
5. R12–R13、R15：UI 狀態復原、硬體說明與輸出驗證。
6. 完成 Windows dev bootstrap，再進行 Windows NVIDIA 與乾淨 Apple Silicon 實機測試；通過後才建立學生正式發布包。

## 暫存重現檔案

- `/private/tmp/jic-h3d-review.OUOOjk/probe.mjs`：verifier、UI 狀態、既有 contract、API 邊界、steps、GLB、模型校驗與 downloader teardown。
- `/private/tmp/jic-h3d-review.OUOOjk/run-1g3AJi/evidence.json`：上述有效 HTTP 測試的輸出。
- `/private/tmp/jic-h3d-review.OUOOjk/probe_backend.py`：Windows wrapper 參數、PBR 能力、下載重試、取消與 unload。
- `/private/tmp/jic-h3d-review.OUOOjk/probe_failures.mjs`：Web 上游串流中斷、adapter malformed multipart 崩潰重現。

暫存檔可能由作業系統清除；程式碼位置與本輪觀察已記錄在本文件。這些是診斷用 probe，不是已納入 CI 的正式 regression tests。
