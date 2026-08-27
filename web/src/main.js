import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import "./styles.css";

const MODEL_ID = "hunyuan3d-2-1-8bit";
const translations = {
  "zh-Hant": {
    "language.label": "Language / 語言",
    "language.changed": "語言已切換",
    "common.refresh": "重新整理狀態",
    "photo.title": "照片",
    "photo.choose": "選擇照片",
    "photo.drag": "或拖曳照片到這裡",
    "photo.helper": "單一、光線充足的物件照片效果最好。系統會自動移除背景。",
    "photo.selectedAlt": "已選取的來源圖片",
    "photo.remove": "移除照片",
    "model.title": "模型",
    "model.name": "Hunyuan3D 2.1（8-bit）",
    "model.checking": "檢查中",
    "model.localChecking": "檢查中",
    "model.localLoading": "啟動中",
    "model.localUnavailable": "不可用",
    "model.localDownloadRequired": "未安裝",
    "model.pbr": "PBR 可用",
    "model.macRuntime": "MLX · Shape → GLB",
    "model.windowsRuntime": "CUDA · Shape → GLB",
    "model.dockerRuntime": "Docker · Mock",
    "model.notInstalled": "模型未安裝",
    "model.downloadAfterReady": "下載模型",
    "model.download": "下載模型",
    "model.preparing": "準備下載…",
    "model.downloading": "下載中 · {downloaded} / {total}",
    "model.ready": "模型已就緒",
    "model.retry": "重新下載模型",
    "model.downloadFailed": "下載失敗",
    "model.cancel": "取消",
    "guide.mac.title": "MLX 模型",
    "guide.mac.download": "下載模型",
    "guide.mac.ready": "MLX 模型已安裝",
    "guide.mac.size": "約 8 GB",
    "guide.windows.model": "CUDA 模型",
    "guide.windows.title": "NVIDIA GPU",
    "guide.windows.download": "下載模型",
    "guide.windows.size": "約 8 GB",
    "guide.windows.ready": "硬體符合",
    "guide.windows.checking": "檢查中",
    "guide.windows.unsupported": "硬體不支援",
    "guide.windows.noGpu": "找不到 NVIDIA GPU",
    "guide.windows.vramRequired": "VRAM 不足 · 至少 10 GB",
    "guide.windows.runtimeMissing": "CUDA runtime unavailable",
    "guide.windows.hardware": "{name} · {vram} GB VRAM",
    "guide.windows.hardwareUnknown": "—",
    "guide.docker.title": "Mock 模型",
    "guide.docker.download": "下載 mock 模型",
    "guide.docker.ready": "Mock 模型已安裝",
    "guide.docker.size": "Development",
    "quality.label": "品質",
    "quality.fast": "快速 · 128",
    "quality.balanced": "平衡 · 256",
    "quality.fine": "精細 · 384",
    "quality.fastShort": "快速",
    "quality.balancedShort": "平衡",
    "quality.fineShort": "精細",
    "advanced.title": "進階設定",
    "advanced.steps": "步數",
    "advanced.guidance": "引導強度",
    "advanced.mesh": "網格解析度",
    "advanced.higher": "數值越高，網格越細，所需記憶體與時間也越多。",
    "advanced.texture": "PBR 材質",
    "advanced.keep": "生成後保留模型",
    "action.generate": "生成",
    "action.cancelGeneration": "取消生成",
    "action.choosePhoto": "選擇照片",
    "action.downloadModel": "下載模型",
    "action.backendUnavailable": "本機引擎不可用",
    "action.ready": "就緒",
    "output.emptyTitle": "3D 模型",
    "output.emptyMessage": "選擇照片",
    "output.ready": "模型已就緒",
    "output.saved": "已儲存的 3D 模型",
    "output.download": "下載 GLB",
    "output.openFolder": "開啟輸出資料夾",
    "output.folderMessage": "輸出資料夾由桌面應用程式開啟。",
    "output.previewFailed": "預覽失敗：{message}",
    "history.title": "最近生成",
    "history.empty": "尚無生成結果",
    "runtime.checking": "本機 · 檢查中",
    "runtime.offline": "本機 · 離線",
    "runtime.dockerMock": "DOCKER MOCK",
    "runtime.offlineState": "離線",
    "runtime.adapterRequired": "請啟動本機服務後繼續",
    "status.ready": "就緒",
    "status.downloading": "下載中",
    "status.missing": "未安裝",
    "status.queued": "排隊中",
    "status.running": "生成中",
    "status.complete": "完成",
    "status.failed": "失敗",
    "status.generating": "生成形體",
    "status.painting": "製作 PBR 材質",
    "status.preparing": "準備本機模型",
    "status.saving": "儲存 GLB",
    "status.cancelled": "已取消",
    "toast.language": "繁體中文",
    "toast.modelReady": "模型已就緒",
    "toast.generated": "GLB 已完成",
    "toast.cancelled": "已取消",
    "error.adapter": "本機服務無法使用",
    "error.downloadStart": "無法開始下載模型",
    "error.downloadState": "無法讀取模型下載狀態",
    "error.downloadCancel": "無法取消模型下載",
    "error.downloadCancelled": "模型下載已取消。",
    "error.downloadFailed": "模型下載失敗",
    "error.hardware": "這台電腦目前無法進行本機生成。",
    "error.chooseImage": "請選擇 PNG 或 JPEG 圖片。",
    "error.connection": "與本機生成服務的連線中斷。",
    "error.generation": "生成失敗",
    "error.preview": "預覽失敗：{message}",
    "error.openFolder": "無法開啟輸出資料夾",
  },
  en: {
    "language.label": "Language / 語言",
    "language.changed": "Language changed",
    "common.refresh": "Refresh status",
    "photo.title": "Photo",
    "photo.choose": "Choose photo",
    "photo.drag": "or drag one here",
    "photo.helper": "A single, well-lit photo of one object works best. The background is removed automatically.",
    "photo.selectedAlt": "Selected source image",
    "photo.remove": "Remove photo",
    "model.title": "Model",
    "model.name": "Hunyuan3D 2.1 (8-bit)",
    "model.checking": "Checking",
    "model.localChecking": "Checking",
    "model.localLoading": "Starting",
    "model.localUnavailable": "Unavailable",
    "model.localDownloadRequired": "Not installed",
    "model.pbr": "PBR available",
    "model.macRuntime": "MLX · Shape → GLB",
    "model.windowsRuntime": "CUDA · Shape → GLB",
    "model.dockerRuntime": "Docker · Mock",
    "model.notInstalled": "Model not installed",
    "model.downloadAfterReady": "Download model",
    "model.download": "Download model",
    "model.preparing": "Preparing download…",
    "model.downloading": "Downloading · {downloaded} / {total}",
    "model.ready": "Model ready",
    "model.retry": "Retry model download",
    "model.downloadFailed": "Download failed",
    "model.cancel": "Cancel",
    "guide.mac.title": "MLX model",
    "guide.mac.download": "Download model",
    "guide.mac.ready": "MLX model installed",
    "guide.mac.size": "About 8 GB",
    "guide.windows.title": "NVIDIA GPU",
    "guide.windows.model": "CUDA model",
    "guide.windows.download": "Download model",
    "guide.windows.size": "About 8 GB",
    "guide.windows.ready": "Hardware supported",
    "guide.windows.checking": "Checking",
    "guide.windows.unsupported": "Hardware not supported",
    "guide.windows.noGpu": "No NVIDIA GPU found",
    "guide.windows.vramRequired": "Insufficient VRAM · 10 GB minimum",
    "guide.windows.runtimeMissing": "CUDA runtime unavailable",
    "guide.windows.hardware": "{name} · {vram} GB VRAM",
    "guide.windows.hardwareUnknown": "—",
    "guide.docker.title": "Mock model",
    "guide.docker.download": "Download mock model",
    "guide.docker.ready": "Mock model installed",
    "guide.docker.size": "Development",
    "quality.label": "Quality",
    "quality.fast": "Fast · 128",
    "quality.balanced": "Balanced · 256",
    "quality.fine": "Fine · 384",
    "quality.fastShort": "fast",
    "quality.balancedShort": "balanced",
    "quality.fineShort": "fine",
    "advanced.title": "Advanced settings",
    "advanced.steps": "Steps",
    "advanced.guidance": "Guidance",
    "advanced.mesh": "Mesh resolution",
    "advanced.higher": "Higher = finer mesh, more memory and time.",
    "advanced.texture": "PBR texture",
    "advanced.keep": "Keep model loaded",
    "action.generate": "Generate",
    "action.cancelGeneration": "Cancel generation",
    "action.choosePhoto": "Select photo",
    "action.downloadModel": "Download model",
    "action.backendUnavailable": "Local engine unavailable",
    "action.ready": "Ready",
    "output.emptyTitle": "3D model",
    "output.emptyMessage": "Select photo",
    "output.ready": "Model ready",
    "output.saved": "Saved 3D model",
    "output.download": "Download GLB",
    "output.openFolder": "Open output folder",
    "output.folderMessage": "The output folder is opened by the desktop app.",
    "output.previewFailed": "Preview failed: {message}",
    "history.title": "Recent generations",
    "history.empty": "No generated models",
    "runtime.checking": "LOCAL · CHECKING",
    "runtime.offline": "LOCAL · OFFLINE",
    "runtime.dockerMock": "DOCKER MOCK",
    "runtime.offlineState": "OFFLINE",
    "runtime.adapterRequired": "Start the local adapter to continue",
    "status.ready": "READY",
    "status.downloading": "DOWNLOADING",
    "status.missing": "NOT INSTALLED",
    "status.queued": "QUEUED",
    "status.running": "RUNNING",
    "status.complete": "COMPLETE",
    "status.failed": "FAILED",
    "status.generating": "Generating shape",
    "status.painting": "Painting PBR texture",
    "status.preparing": "Preparing local model",
    "status.saving": "Saving GLB",
    "status.cancelled": "CANCELLED",
    "toast.language": "English",
    "toast.modelReady": "Model ready",
    "toast.generated": "GLB ready",
    "toast.cancelled": "Cancelled",
    "error.adapter": "Local adapter unavailable",
    "error.downloadStart": "Unable to start model download",
    "error.downloadState": "Unable to read model download state",
    "error.downloadCancel": "Unable to cancel model download",
    "error.downloadCancelled": "Model download cancelled.",
    "error.downloadFailed": "Model download failed",
    "error.hardware": "This PC cannot generate locally right now.",
    "error.chooseImage": "Choose a PNG or JPEG image.",
    "error.connection": "Lost connection to the local generation service.",
    "error.generation": "Generation failed",
    "error.preview": "Preview failed: {message}",
    "error.openFolder": "Unable to open output folder",
  },
};

function initialLanguage() {
  try {
    return localStorage.getItem("jic-hunyuan3d-language") === "en" ? "en" : "zh-Hant";
  } catch {
    return "zh-Hant";
  }
}

const state = {
  capabilities: null,
  model: null,
  file: null,
  fileUrl: null,
  currentJob: null,
  currentArtifact: null,
  eventSource: null,
  busy: false,
  downloadCancelled: false,
  language: initialLanguage(),
};

const app = document.querySelector("#app");
app.innerHTML = `
  <div class="app-frame macos-app">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">
          <svg class="brand-icon" viewBox="0 0 32 32" focusable="false">
            <path d="m16 3 11 6.5v13L16 29 5 22.5v-13L16 3Z" />
            <path d="m5 9.5 11 6.5 11-6.5M16 16v13M11.5 6l11 6.5v9" />
          </svg>
        </div>
        <h1>Hunyuan3D</h1>
      </div>
      <div class="topbar-actions">
        <span id="runtime-badge" class="runtime-badge" aria-hidden="true"></span>
        <div id="language-switch" class="language-switch" role="group" data-i18n-aria-label="language.label" aria-label="Language / 語言">
          <button type="button" data-language="zh-Hant" class="language-button">中</button>
          <button type="button" data-language="en" class="language-button">EN</button>
        </div>
        <button id="refresh-button" class="icon-button" data-i18n-title="common.refresh" data-i18n-aria-label="common.refresh" title="Refresh status" aria-label="Refresh status">
          <svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M20 11a8 8 0 1 0 1 4" />
            <path d="M20 5v6h-6" />
          </svg>
        </button>
      </div>
    </header>

    <main class="workspace">
      <section class="control-column" aria-label="Generation controls">
        <div class="section-heading">
          <h2 data-i18n="photo.title">Photo to 3D</h2>
        </div>

        <div id="drop-zone" class="drop-zone" tabindex="0" role="button" data-i18n-aria-label="photo.choose" aria-label="Choose a photo">
          <input id="photo-input" type="file" accept="image/png,image/jpeg" hidden />
          <div id="drop-empty" class="drop-empty">
            <div class="upload-icon" aria-hidden="true">
              <svg class="ui-icon" viewBox="0 0 24 24" focusable="false">
                <rect x="3" y="4" width="13" height="13" rx="2" />
                <circle cx="7.5" cy="8.5" r="1.2" />
                <path d="m4.5 15 3.5-3.5 2.5 2 2-2 3.5 3.5" />
                <circle cx="18" cy="17" r="4" />
                <path d="M18 14.8v4.4M15.8 17h4.4" />
              </svg>
            </div>
            <strong data-i18n="photo.choose">Choose photo</strong>
            <span data-i18n="photo.drag">or drag one here</span>
          </div>
          <div id="drop-selected" class="drop-selected hidden">
            <img id="photo-preview" data-i18n-alt="photo.selectedAlt" alt="Selected source" />
            <div class="file-copy">
              <strong id="photo-name"></strong>
              <span id="photo-size"></span>
            </div>
            <button id="remove-photo" class="remove-button" data-i18n-title="photo.remove" data-i18n-aria-label="photo.remove" aria-label="Remove photo">
              <svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m7 7 10 10M17 7 7 17" /></svg>
            </button>
          </div>
        </div>
        <p class="helper-copy" data-i18n="photo.helper">PNG / JPEG · single object</p>

        <div class="section-heading model-heading">
          <h2 data-i18n="model.title">Model</h2>
        </div>

        <div id="model-card" class="model-card">
          <span class="model-icon" aria-hidden="true">
            <svg class="ui-icon" viewBox="0 0 32 32" focusable="false">
              <path d="m16 3 11 6.5v13L16 29 5 22.5v-13L16 3Z" />
              <path d="m5 9.5 11 6.5 11-6.5M16 16v13" />
            </svg>
          </span>
          <div class="model-copy">
            <strong id="model-name" data-i18n="model.name">Hunyuan3D 2.1 (8-bit)</strong>
            <span id="model-description" data-i18n="model.localChecking">Checking</span>
          </div>
          <span id="model-state" class="state-pill" data-i18n="model.checking">Checking</span>
        </div>

        <div id="platform-guide" class="platform-guide hidden" aria-live="polite">
          <strong id="platform-guide-title"></strong>
          <p id="platform-guide-message"></p>
          <span id="platform-guide-hardware" class="platform-guide-hardware hidden"></span>
        </div>

        <div id="download-panel" class="download-panel hidden">
          <div class="download-heading">
            <div>
              <strong id="download-title" data-i18n="model.notInstalled">Model not installed</strong>
              <span id="download-subtitle" data-i18n="model.downloadAfterReady">Download model</span>
            </div>
            <span id="download-percent">0%</span>
          </div>
          <div class="progress-track"><div id="download-progress" class="progress-fill"></div></div>
          <div class="download-actions">
            <button id="download-button" class="secondary-button" data-i18n="model.download">Download model</button>
            <button id="cancel-download-button" class="text-button hidden" data-i18n="model.cancel">Cancel</button>
          </div>
        </div>

        <div class="field-row">
          <label class="field-label" for="quality-select" data-i18n="quality.label">Quality</label>
          <select id="quality-select" class="select-control">
            <option value="fast" data-i18n="quality.fast">Fast · 128</option>
            <option value="balanced" selected data-i18n="quality.balanced">Balanced · 256</option>
            <option value="fine" data-i18n="quality.fine">Fine · 384</option>
          </select>
        </div>

        <details class="advanced-panel">
          <summary><span data-i18n="advanced.title">Advanced options</span><span class="summary-chevron" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6" /></svg></span></summary>
          <div class="advanced-content">
            <label class="range-field">
              <span><span data-i18n="advanced.steps">Steps</span> <output id="steps-output">30</output></span>
              <input id="steps-input" type="range" min="10" max="50" step="1" value="30" />
            </label>
            <label class="range-field">
              <span><span data-i18n="advanced.guidance">Guidance</span> <output id="guidance-output">5.0</output></span>
              <input id="guidance-input" type="range" min="1" max="10" step="0.5" value="5" />
            </label>
            <div class="resolution-field">
              <span data-i18n="advanced.mesh">Mesh resolution</span>
              <div class="segmented" role="group" data-i18n-aria-label="advanced.mesh" aria-label="Mesh resolution">
                <button data-resolution="128">128</button>
                <button data-resolution="256" class="active">256</button>
                <button data-resolution="384">384</button>
              </div>
              <small class="field-hint" data-i18n="advanced.higher">Higher = finer mesh, more memory and time.</small>
            </div>
            <label class="toggle-field"><input id="texture-input" type="checkbox" /><span class="fake-checkbox"></span><span data-i18n="advanced.texture">Texture (PBR)</span></label>
            <label class="toggle-field"><input id="keep-input" type="checkbox" /><span class="fake-checkbox"></span><span data-i18n="advanced.keep">Keep model loaded after generating</span></label>
          </div>
        </details>

        <div class="action-area">
          <button id="generate-button" class="primary-button" disabled>
            <svg class="button-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
              <path d="m16 3 11 6.5v13L16 29 5 22.5v-13L16 3Z" />
              <path d="m5 9.5 11 6.5 11-6.5M16 16v13" />
            </svg>
            <span data-i18n="action.generate">Generate</span>
          </button>
          <button id="cancel-button" class="cancel-button hidden" data-i18n="action.cancelGeneration">Cancel generation</button>
          <p id="blocking-message" class="blocking-message" data-i18n="action.downloadModel">Download model</p>
        </div>

      </section>

      <section class="result-column" aria-label="3D result">
        <div class="result-toolbar">
          <div>
            <h2 id="result-title" data-i18n="output.emptyTitle">3D model</h2>
          </div>
          <span id="job-status" class="job-status" data-i18n="status.ready">READY</span>
        </div>

        <div id="viewer-shell" class="viewer-shell">
          <canvas id="viewer-canvas" data-i18n-aria-label="output.emptyTitle" aria-label="3D model preview"></canvas>
          <div id="empty-view" class="empty-view">
            <svg class="empty-model-icon" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
              <path d="m32 7 22 13v24L32 57 10 44V20L32 7Z" />
              <path d="m10 20 22 13 22-13M32 33v24M22 13l22 13v18" />
            </svg>
            <strong data-i18n="output.emptyMessage">Select photo</strong>
          </div>
          <div id="loading-view" class="loading-view hidden">
            <div class="spinner"></div>
            <strong id="loading-message" data-i18n="status.preparing">Preparing local model</strong>
            <div class="generation-progress-track"><div id="generation-progress" class="progress-fill"></div></div>
            <span id="generation-progress-label">0 / 30</span>
          </div>
          <div id="error-view" class="error-view hidden">
            <div class="error-icon" aria-hidden="true">
              <svg class="ui-icon" viewBox="0 0 24 24" focusable="false">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7.5v5" />
                <circle cx="12" cy="16.2" r=".7" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <strong id="error-title" data-i18n="error.generation">Generation failed</strong>
            <span id="error-message"></span>
          </div>
        </div>

        <div class="result-actions">
          <a id="download-artifact" class="secondary-button disabled" href="#" download>
            <svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 20h14" />
            </svg>
            <span data-i18n="output.download">Download GLB</span>
          </a>
          <button id="open-folder" class="secondary-button">
            <svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M3.5 7.5h6l1.7 2h9.3v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-8.5a2 2 0 0 1 2-2Z" />
              <path d="M3.5 7.5v-1a2 2 0 0 1 2-2h4l1.7 2h5.3" />
            </svg>
            <span data-i18n="output.openFolder">Open output folder</span>
          </button>
          <span id="artifact-meta" class="artifact-meta"></span>
        </div>

        <div class="history-header"><span data-i18n="history.title">Recent generations</span><span id="history-count">0</span></div>
        <div id="history-list" class="history-list"><div class="history-empty" data-i18n="history.empty">No generated models</div></div>
      </section>
    </main>
    <div id="toast" class="toast" role="status"></div>
  </div>
`;

const el = (id) => document.getElementById(id);
const dropZone = el("drop-zone");
const photoInput = el("photo-input");
const generateButton = el("generate-button");
const cancelButton = el("cancel-button");
const toast = el("toast");

function t(key, values = {}) {
  const fallback = translations.en[key] || key;
  const template = translations[state.language]?.[key] || fallback;
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
}

function applyLanguage() {
  document.documentElement.lang = state.language;
  if (!state.capabilities) el("runtime-badge").textContent = t("runtime.checking");
  if (state.capabilities) {
    const backendName = state.capabilities.backend === "mock" ? t("runtime.dockerMock") : String(state.capabilities.backend).toUpperCase();
    el("runtime-badge").textContent = `${state.language === "en" ? "LOCAL" : "本機"} · ${backendName}`;
  }
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    node.title = t(node.dataset.i18nTitle);
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  });
  document.querySelectorAll("[data-i18n-alt]").forEach((node) => {
    node.alt = t(node.dataset.i18nAlt);
  });
  document.querySelectorAll("[data-language]").forEach((button) => {
    button.classList.toggle("active", button.dataset.language === state.language);
    button.setAttribute("aria-pressed", String(button.dataset.language === state.language));
  });
  updateAdvancedValues();
  updateGenerateState();
  if (state.model && state.capabilities) renderModel(state.model, state.capabilities);
}

function setLanguage(language) {
  if (!translations[language] || state.language === language) return;
  state.language = language;
  try { localStorage.setItem("jic-hunyuan3d-language", language); } catch { /* localStorage is optional */ }
  applyLanguage();
  showToast(t("toast.language"));
}

function localizeBackendMessage(message) {
  const keys = {
    "Job queued": "status.queued",
    "Preparing local model": "status.preparing",
    "Generating shape": "status.generating",
    "Painting PBR texture": "status.painting",
    "Saving GLB": "status.saving",
  };
  return keys[message] ? t(keys[message]) : message;
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function showToast(message, tone = "") {
  toast.textContent = message;
  toast.className = `toast visible ${tone}`;
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => { toast.className = "toast"; }, 3600);
}

function setHidden(id, hidden) {
  el(id).classList.toggle("hidden", hidden);
}

function setPhoto(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast(t("error.chooseImage"), "error");
    return;
  }
  if (state.fileUrl) URL.revokeObjectURL(state.fileUrl);
  state.file = file;
  state.fileUrl = URL.createObjectURL(file);
  el("photo-preview").src = state.fileUrl;
  el("photo-name").textContent = file.name;
  el("photo-size").textContent = formatBytes(file.size);
  setHidden("drop-empty", true);
  setHidden("drop-selected", false);
  updateGenerateState();
}

function clearPhoto() {
  if (state.fileUrl) URL.revokeObjectURL(state.fileUrl);
  state.file = null;
  state.fileUrl = null;
  photoInput.value = "";
  setHidden("drop-empty", false);
  setHidden("drop-selected", true);
  updateGenerateState();
}

function platformKind(capabilities = state.capabilities) {
  const platform = String(capabilities?.platform || "").toLowerCase();
  if (platform.startsWith("macos") || platform.includes("darwin")) return "mac";
  if (platform.startsWith("windows") || platform.startsWith("win")) return "windows";
  if (platform === "docker-mock" || capabilities?.backend === "mock") return "docker";
  return "unknown";
}

function canDownloadModel(capabilities = state.capabilities) {
  const kind = platformKind(capabilities);
  if (kind === "mac" || kind === "docker") return true;
  return kind === "windows"
    && capabilities?.backendHealth === "ready"
    && capabilities?.hardware?.supported === true;
}

function hardwareReasonText(hardware) {
  const reason = String(hardware?.reason || "");
  if (/no compatible nvidia|nvidia cuda device/i.test(reason)) return t("guide.windows.noGpu");
  if (/at least 10 gb/i.test(reason)) return t("guide.windows.vramRequired");
  if (/pytorch|\btorch\b/i.test(reason)) return t("guide.windows.runtimeMissing");
  return reason || t("guide.windows.unsupported");
}

function renderPlatformGuide(model, capabilities) {
  const guide = el("platform-guide");
  const downloadPanel = el("download-panel");
  const downloadButton = el("download-button");
  const kind = platformKind(capabilities);
  const ready = capabilities?.modelState === "ready";
  const downloading = model?.state === "downloading" || model?.download?.state === "downloading";
  const loading = capabilities?.modelState === "loading";
  const unavailable = capabilities?.modelState === "unavailable";
  const hardware = capabilities?.hardware;

  downloadPanel.classList.remove("mac-download", "windows-download", "docker-download");
  if (kind === "unknown") {
    guide.className = "platform-guide";
    setHidden("platform-guide", true);
    downloadButton.disabled = true;
    return;
  }

  downloadPanel.classList.add(`${kind}-download`);

  let downloadTitle;
  let downloadSubtitle;
  let downloadLabel;

  if (kind === "mac") {
    downloadTitle = t("guide.mac.title");
    downloadSubtitle = t("guide.mac.size");
    downloadLabel = t("guide.mac.download");
    guide.className = "platform-guide";
    setHidden("platform-guide", true);
  } else if (kind === "windows") {
    let guideMessage = t("guide.windows.checking");
    let hardwareText = t("guide.windows.hardwareUnknown");
    if (hardware && capabilities?.backendHealth === "ready") {
      guideMessage = hardware.supported === false ? t("guide.windows.unsupported") : t("guide.windows.ready");
      hardwareText = hardware.supported === false
        ? hardwareReasonText(hardware)
        : hardware.name && Number.isFinite(hardware.vramGb)
          ? t("guide.windows.hardware", { name: hardware.name, vram: hardware.vramGb })
          : t("guide.windows.hardwareUnknown");
    }
    guide.className = "platform-guide windows";
    setHidden("platform-guide", false);
    el("platform-guide-title").textContent = t("guide.windows.title");
    el("platform-guide-message").textContent = guideMessage;
    el("platform-guide-hardware").textContent = hardwareText;
    setHidden("platform-guide-message", !guideMessage);
    setHidden("platform-guide-hardware", !hardwareText);
    downloadTitle = t("guide.windows.model");
    downloadSubtitle = t("guide.windows.size");
    downloadLabel = t("guide.windows.download");
  } else {
    downloadTitle = t("guide.docker.title");
    downloadSubtitle = t("guide.docker.size");
    downloadLabel = t("guide.docker.download");
    guide.className = "platform-guide";
    setHidden("platform-guide", true);
  }

  el("download-title").textContent = downloadTitle;
  el("download-subtitle").textContent = downloadSubtitle;
  downloadButton.textContent = downloadLabel;
  downloadButton.disabled = !canDownloadModel(capabilities) || ready || loading || unavailable || downloading;
}

function updateGenerateState() {
  const modelState = state.capabilities?.modelState;
  const modelReady = modelState === "ready";
  const enabled = Boolean(state.file && modelReady && !state.busy);
  generateButton.disabled = !enabled;
  const message = el("blocking-message");
  const hardwareBlocked = platformKind() === "windows" && state.capabilities?.hardware?.supported === false;
  if (!state.file) message.textContent = t("action.choosePhoto");
  else if (hardwareBlocked) message.textContent = hardwareReasonText(state.capabilities.hardware);
  else if (modelState === "unavailable" || modelState === "loading") message.textContent = t("action.backendUnavailable");
  else if (!modelReady) message.textContent = t("action.downloadModel");
  else message.textContent = t("action.ready");
}

function renderModel(model, capabilities) {
  state.model = model;
  const runtimeKey = {
    mac: "model.macRuntime",
    windows: "model.windowsRuntime",
    docker: "model.dockerRuntime",
  }[platformKind(capabilities)];
  const runtimeSummary = runtimeKey ? t(runtimeKey) : t("model.name");
  const ready = capabilities.modelState === "ready";
  const downloading = model?.state === "downloading" || model?.download?.state === "downloading";
  const failed = model?.download?.state === "failed";
  const loading = capabilities.modelState === "loading";
  const unavailable = capabilities.modelState === "unavailable";
  el("model-name").textContent = model?.name || t("model.name");
  el("model-description").textContent = ready
    ? `${runtimeSummary}${capabilities.capabilities.texture ? ` · ${t("model.pbr")}` : ""}`
    : loading ? t("model.localLoading") : unavailable
      ? (platformKind(capabilities) === "windows" ? hardwareReasonText(capabilities.hardware) : t("model.localUnavailable"))
      : runtimeSummary;
  const stateLabel = ready
    ? t("status.ready")
    : downloading
      ? t("status.downloading")
      : failed
        ? t("model.downloadFailed")
        : loading || unavailable
          ? t("model.checking")
          : t("status.missing");
  el("model-state").textContent = stateLabel;
  el("model-state").className = `state-pill ${ready ? "ready" : downloading ? "downloading" : loading || unavailable ? "loading" : "missing"}`;
  el("model-card").classList.toggle("ready", ready);
  renderPlatformGuide(model, capabilities);
  setHidden("download-panel", ready || loading || unavailable);
  el("texture-input").disabled = !ready || !capabilities.capabilities.texture;
  el("keep-input").disabled = !ready;
  if (!ready && !downloading) {
    el("download-percent").textContent = "0%";
    el("download-progress").style.width = "0%";
    el("download-progress").classList.remove("indeterminate");
  }
  updateGenerateState();
}

async function refreshStatus() {
  try {
    const [capabilitiesResponse, modelsResponse] = await Promise.all([
      fetch("/api/capabilities"),
      fetch("/api/models"),
    ]);
    if (!capabilitiesResponse.ok || !modelsResponse.ok) throw new Error(t("error.adapter"));
    state.capabilities = await capabilitiesResponse.json();
    const models = await modelsResponse.json();
    const model = models.data?.[0];
    const backendName = state.capabilities.backend === "mock" ? t("runtime.dockerMock") : String(state.capabilities.backend).toUpperCase();
    el("runtime-badge").textContent = `${state.language === "en" ? "LOCAL" : "本機"} · ${backendName}`;
    el("runtime-badge").className = `runtime-badge ${state.capabilities.backendHealth === "ready" ? "online" : "offline"}`;
    renderModel(model, state.capabilities);
  } catch (error) {
    state.capabilities = null;
    el("runtime-badge").textContent = t("runtime.offline");
    el("runtime-badge").className = "runtime-badge offline";
    el("model-state").textContent = t("runtime.offlineState");
    el("model-state").className = "state-pill missing";
    el("model-description").textContent = t("runtime.adapterRequired");
    renderPlatformGuide(null, null);
    setHidden("download-panel", true);
    updateGenerateState();
    showToast(error.message, "error");
  }
}

async function getDownloadState() {
  const response = await fetch(`/api/models/${MODEL_ID}/download`);
  if (!response.ok) throw new Error(t("error.downloadState"));
  return response.json();
}

async function downloadModel() {
  const button = el("download-button");
  const cancelButton = el("cancel-download-button");
  if (!canDownloadModel()) {
    const message = platformKind() === "windows"
      ? hardwareReasonText(state.capabilities?.hardware)
      : t("error.hardware");
    showToast(message, "error");
    return;
  }
  state.downloadCancelled = false;
  button.disabled = true;
  cancelButton.disabled = false;
  setHidden("cancel-download-button", false);
  button.textContent = t("model.preparing");
  try {
    const startResponse = await fetch(`/api/models/${MODEL_ID}/download`, { method: "POST" });
    if (!startResponse.ok) {
      const payload = await startResponse.json().catch(() => null);
      throw new Error(payload?.error?.message || t("error.downloadStart"));
    }
    setHidden("download-panel", false);
    while (true) {
      const current = await getDownloadState();
      const percent = Number.isFinite(current.progress) ? Math.round(current.progress * 100) : null;
      el("download-percent").textContent = percent === null ? "—" : `${percent}%`;
      el("download-progress").classList.toggle("indeterminate", Boolean(current.indeterminate || percent === null));
      el("download-progress").style.width = percent === null ? "34%" : `${percent}%`;
      button.textContent = current.state === "ready" ? t("model.ready") : t("model.downloading", { downloaded: formatBytes(current.downloadedBytes), total: formatBytes(current.totalBytes) });
      if (current.state === "ready") break;
      if (current.state === "cancelled") throw new Error(t("error.downloadCancelled"));
      if (current.state === "failed") throw new Error(current.error || t("error.downloadFailed"));
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await refreshStatus();
    showToast(t("toast.modelReady"), "success");
  } catch (error) {
    button.textContent = t("model.retry");
    showToast(state.downloadCancelled ? t("error.downloadCancelled") : error.message, state.downloadCancelled ? "" : "error");
  } finally {
    button.disabled = state.capabilities?.modelState === "ready" || !canDownloadModel();
    cancelButton.disabled = false;
    setHidden("cancel-download-button", true);
  }
}

async function cancelModelDownload() {
  state.downloadCancelled = true;
  const cancelButton = el("cancel-download-button");
  cancelButton.disabled = true;
  try {
    const response = await fetch(`/api/models/${MODEL_ID}/cancel-download`, { method: "POST" });
    if (!response.ok) throw new Error(t("error.downloadCancel"));
  } catch (error) {
    state.downloadCancelled = false;
    cancelButton.disabled = false;
    showToast(error.message || t("error.downloadCancelled"), "error");
  }
}

function updateAdvancedValues() {
  el("steps-output").textContent = el("steps-input").value;
  el("guidance-output").textContent = Number(el("guidance-input").value).toFixed(1);
}

function setResolution(value) {
  document.querySelectorAll("[data-resolution]").forEach((button) => {
    button.classList.toggle("active", button.dataset.resolution === String(value));
  });
}

function selectedResolution() {
  return Number(document.querySelector("[data-resolution].active")?.dataset.resolution || 256);
}

function setBusy(busy) {
  state.busy = busy;
  setHidden("generate-button", busy);
  setHidden("cancel-button", !busy);
  updateGenerateState();
}

function showLoading(message = t("status.preparing"), step = 0, total = 30) {
  setHidden("empty-view", true);
  setHidden("error-view", true);
  setHidden("loading-view", false);
  el("loading-message").textContent = message;
  const indeterminate = !total;
  el("generation-progress").classList.toggle("indeterminate", indeterminate);
  el("generation-progress").style.width = indeterminate ? "34%" : `${Math.min(100, (step / Math.max(1, total)) * 100)}%`;
  el("generation-progress-label").textContent = indeterminate ? "—" : `${step} / ${total}`;
  el("job-status").textContent = t("status.running");
  el("job-status").className = "job-status running";
}

function showError(message = t("error.generation")) {
  setHidden("loading-view", true);
  setHidden("empty-view", true);
  setHidden("error-view", false);
  el("error-title").textContent = t("error.generation");
  el("error-message").textContent = message;
  el("job-status").textContent = t("status.failed");
  el("job-status").className = "job-status failed";
}

function showReady(titleKey = "output.emptyTitle") {
  const title = t(titleKey);
  setHidden("loading-view", true);
  setHidden("error-view", true);
  setHidden("empty-view", titleKey === "output.emptyTitle");
  el("result-title").textContent = title;
  el("job-status").textContent = titleKey === "output.emptyTitle" ? t("status.ready") : t("status.complete");
  el("job-status").className = `job-status ${titleKey === "output.emptyTitle" ? "" : "complete"}`;
}

function handleJobEvent(event) {
  if (event.type === "progress") {
    showLoading(localizeBackendMessage(event.message || t("status.generating")), event.step || 0, event.indeterminate ? 0 : (event.total || 30));
    return;
  }
  if (event.type === "status") {
    showLoading(localizeBackendMessage(event.message || t("status.preparing")));
    return;
  }
  if (event.type === "complete") {
    state.currentArtifact = event.artifact;
    const artifact = event.artifact;
    el("result-title").textContent = t("output.ready");
    el("artifact-meta").textContent = `${artifact.filename} · ${formatBytes(artifact.bytes)}`;
    el("download-artifact").href = artifact.downloadUrl;
    el("download-artifact").download = artifact.filename;
    el("download-artifact").classList.remove("disabled");
    showReady("output.ready");
    viewer.load(artifact.downloadUrl);
    loadHistory();
    setBusy(false);
    state.eventSource?.close();
    showToast(t("toast.generated"), "success");
    return;
  }
  if (event.type === "error") {
    showError(event.message || t("error.generation"));
    setBusy(false);
    state.eventSource?.close();
    showToast(event.message || t("error.generation"), "error");
    return;
  }
  if (event.type === "cancelled") {
    setBusy(false);
    showReady();
    showToast(t("toast.cancelled"));
  }
}

async function generate() {
  if (!state.file || state.busy) return;
  setBusy(true);
  showLoading(t("status.preparing"));
  const form = new FormData();
  form.append("photo", state.file, state.file.name);
  form.append("qualityPreset", el("quality-select").value);
  form.append("steps", el("steps-input").value);
  form.append("guidance", el("guidance-input").value);
  form.append("meshResolution", selectedResolution());
  form.append("texture", el("texture-input").checked ? "true" : "false");
  form.append("keepModelLoaded", el("keep-input").checked ? "true" : "false");
  try {
    const response = await fetch("/api/jobs", { method: "POST", body: form });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || t("error.generation"));
    state.currentJob = payload.jobId;
    state.eventSource?.close();
    state.eventSource = new EventSource(`/api/jobs/${encodeURIComponent(state.currentJob)}/events`);
    state.eventSource.onmessage = (message) => handleJobEvent(JSON.parse(message.data));
    state.eventSource.onerror = () => {
      if (state.busy && state.currentJob) {
        state.eventSource.close();
        showError(t("error.connection"));
        setBusy(false);
      }
    };
  } catch (error) {
    showError(error.message);
    setBusy(false);
  }
}

async function cancelGeneration() {
  if (!state.currentJob) return;
  await fetch(`/api/jobs/${encodeURIComponent(state.currentJob)}/cancel`, { method: "POST" });
  state.eventSource?.close();
  state.currentJob = null;
  setBusy(false);
  showReady();
}

async function loadHistory() {
  try {
    const response = await fetch("/api/outputs");
    const payload = await response.json();
    const outputs = payload.data || [];
    el("history-count").textContent = outputs.length;
    const list = el("history-list");
    if (!outputs.length) {
      list.innerHTML = `<div class="history-empty">${t("history.empty")}</div>`;
      return;
    }
    list.innerHTML = outputs.slice(0, 8).map((output) => `
      <button class="history-item" data-artifact="${output.artifactId}">
        <span><strong>${output.filename}</strong><small>${formatBytes(output.bytes)}</small></span>
      </button>
    `).join("");
    list.querySelectorAll("[data-artifact]").forEach((button) => {
      button.addEventListener("click", async () => {
        const output = outputs.find((item) => item.artifactId === button.dataset.artifact);
        if (output) {
          state.currentArtifact = output;
          el("result-title").textContent = t("output.saved");
          el("artifact-meta").textContent = `${output.filename} · ${formatBytes(output.bytes)}`;
          el("download-artifact").href = output.downloadUrl;
          el("download-artifact").download = output.filename;
          el("download-artifact").classList.remove("disabled");
          showReady("output.saved");
          viewer.load(output.downloadUrl);
        }
      });
    });
  } catch {
    // History is an enhancement; the main generation flow remains usable.
  }
}

async function openOutputFolder() {
  try {
    const response = await fetch("/api/system/open-output-folder", { method: "POST" });
    const payload = await response.json();
    showToast(payload.opened ? t("output.openFolder") : t("output.folderMessage"));
  } catch (error) {
    showToast(error.message || t("error.openFolder"), "error");
  }
}

function setupInteractions() {
  document.querySelectorAll("[data-language]").forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.language));
  });
  dropZone.addEventListener("click", () => photoInput.click());
  dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); photoInput.click(); }
  });
  photoInput.addEventListener("change", () => setPhoto(photoInput.files?.[0]));
  ["dragenter", "dragover"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
    event.preventDefault(); dropZone.classList.add("dragging");
  }));
  ["dragleave", "drop"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
    event.preventDefault(); dropZone.classList.remove("dragging");
  }));
  dropZone.addEventListener("drop", (event) => setPhoto(event.dataTransfer.files?.[0]));
  el("remove-photo").addEventListener("click", (event) => { event.stopPropagation(); clearPhoto(); });
  el("download-button").addEventListener("click", downloadModel);
  el("cancel-download-button").addEventListener("click", cancelModelDownload);
  el("refresh-button").addEventListener("click", refreshStatus);
  el("generate-button").addEventListener("click", generate);
  el("cancel-button").addEventListener("click", cancelGeneration);
  el("open-folder").addEventListener("click", openOutputFolder);
  el("steps-input").addEventListener("input", updateAdvancedValues);
  el("guidance-input").addEventListener("input", updateAdvancedValues);
  document.querySelectorAll("[data-resolution]").forEach((button) => button.addEventListener("click", () => setResolution(button.dataset.resolution)));
  el("quality-select").addEventListener("change", () => {
    const presets = { fast: [15, 128], balanced: [30, 256], fine: [40, 384] };
    const [steps, resolution] = presets[el("quality-select").value];
    el("steps-input").value = steps;
    setResolution(resolution);
    updateAdvancedValues();
  });
}

const viewer = {
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  root: null,
  loader: new GLTFLoader(),
  init() {
    const canvas = el("viewer-canvas");
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#dedede");
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    this.camera.position.set(0, 0.3, 3.2);
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch (error) {
      console.warn("3D preview is unavailable in this browser", error);
      setHidden("viewer-canvas", true);
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0.2, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x73829c, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(3, 5, 4);
    key.castShadow = true;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xc7c7cc, 1.1);
    rim.position.set(-4, 2, -3);
    this.scene.add(rim);
    window.addEventListener("resize", () => this.resize());
    this.resize();
    const render = () => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(render);
    };
    render();
  },
  resize() {
    const shell = el("viewer-shell");
    const width = Math.max(1, shell.clientWidth);
    const height = Math.max(1, shell.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  },
  clear() {
    if (!this.root) return;
    this.scene.remove(this.root);
    this.root.traverse((node) => {
      if (!node.isMesh) return;
      node.geometry?.dispose();
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) material?.dispose?.();
    });
    this.root = null;
  },
  load(url) {
    this.loader.load(url, (gltf) => {
      this.clear();
      this.root = gltf.scene;
      this.root.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
      const box = new THREE.Box3().setFromObject(this.root);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = 1.65 / Math.max(size.x, size.y, size.z, 0.01);
      this.root.scale.setScalar(scale);
      this.root.position.sub(center.multiplyScalar(scale));
      this.scene.add(this.root);
      this.controls.target.set(0, 0.1, 0);
      this.camera.position.set(0, 0.25, 3.0);
      this.controls.update();
      setHidden("empty-view", true);
    }, undefined, (error) => showToast(t("error.preview", { message: error.message }), "error"));
  },
};

applyLanguage();
setupInteractions();
updateAdvancedValues();
viewer.init();
refreshStatus();
loadHistory();
