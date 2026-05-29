(() => {
  const PANEL_ID = "gradio-ltx-global-assets-runner-panel";
  const STORAGE_KEY = "gradioLtxRunner:v18-global-presets-repeat-images";
  const RUNTIME_KEY = "gradioLtxRunner:v18-runtime-progress";

  const DEFAULT_SEED = "2450723370";
  const DEFAULT_ASPECT_RATIO = "9:16 Portrait";
  const MAX_ITEM_RETRIES = 3;
  const IMAGE_POST_UPLOAD_BUFFER_MS = 5000;

  const state = {
    running: false,
    paused: false,
    stopped: false,

    currentBatchIndex: 0,
    currentItemIndex: 0,
    currentRepeatIndex: 0,

    totalQueueItems: 0,
    completedQueueItems: 0,

    globalImages: new Map(),
    globalImageSeeds: new Map(), // Store seeds per image slot
    batchAudios: new Map(),
    batchQueue: [],

    seedExplorerImage: null,
    seedExplorerRunning: false,
    seedExplorerStopped: false,

    logLines: [],
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function isInsidePanel(element) {
    return Boolean(element?.closest?.(`#${PANEL_ID}`));
  }

  const selectors = {
    promptBox: () =>
      [...document.querySelectorAll('textarea[data-testid="textbox"]')]
        .filter((el) => !isInsidePanel(el))
        .find((el) => (el.placeholder || "").includes("[VISUAL]")),

    seedInput: () =>
      [...document.querySelectorAll('input[type="number"]')]
        .filter((el) => !isInsidePanel(el))
        .find((el) => (el.getAttribute("aria-label") || "").includes("Seed")),

    aspectRatioInput: () =>
      [...document.querySelectorAll('input[role="listbox"], input[aria-label]')]
        .filter((el) => !isInsidePanel(el))
        .find((el) =>
          (el.getAttribute("aria-label") || "").includes("Aspect Ratio"),
        ),

    durationInput: () => {
      const direct = document.querySelector(
        '#component-10 input[role="listbox"][aria-label*="Duration"]',
      );

      if (direct && !isInsidePanel(direct)) return direct;

      return [
        ...document.querySelectorAll(
          'input[role="listbox"], input[aria-label]',
        ),
      ]
        .filter((el) => !isInsidePanel(el))
        .find((el) => {
          const label = el.getAttribute("aria-label") || "";
          return label.includes("Duration") || label.includes("⏱️");
        });
    },

    imageBlock: () => {
      const direct = document.querySelector("#component-6");
      if (direct && !isInsidePanel(direct)) return direct;

      return [...document.querySelectorAll('[id^="component-"]')]
        .filter((el) => !isInsidePanel(el))
        .find((el) => (el.innerText || "").includes("Reference Image"));
    },

    imageUploadContainer: () =>
      selectors.imageBlock()?.querySelector(".upload-container"),

    imageUploadingLabel: () =>
      selectors.imageBlock()?.querySelector(".upload-container .uploading"),

    imageUploadWrap: () =>
      selectors.imageBlock()?.querySelector(".upload-container .wrap"),

    imageFrame: () =>
      selectors.imageBlock()?.querySelector(".upload-container .image-frame"),

    imageFrameImage: () =>
      selectors
        .imageBlock()
        ?.querySelector(".upload-container .image-frame img"),

    imageInput: () => {
      const block = selectors.imageBlock();

      if (block) {
        const scopedInput = [
          ...block.querySelectorAll('input[type="file"]'),
        ].find((input) => (input.accept || "").toLowerCase().includes("image"));

        if (scopedInput) return scopedInput;
      }

      return [...document.querySelectorAll('input[type="file"]')]
        .filter((input) => !isInsidePanel(input))
        .filter((input) => input.id !== "glsr-global-image-files")
        .find((input) => (input.accept || "").toLowerCase().includes("image"));
    },

    imageClearButton: () => {
      const block = selectors.imageBlock();
      if (!block) return null;

      return (
        block.querySelector('button[aria-label="Limpar"]') ||
        block.querySelector('button[title="Limpar"]') ||
        block.querySelector('button[aria-label="Clear"]') ||
        block.querySelector('button[title="Clear"]') ||
        block.querySelector('button[aria-label="Remove"]') ||
        block.querySelector('button[title="Remove"]')
      );
    },

    audioBlock: () => {
      const direct = document.querySelector("#component-7");
      if (direct && !isInsidePanel(direct)) return direct;

      return [...document.querySelectorAll('[id^="component-"]')]
        .filter((el) => !isInsidePanel(el))
        .find((el) =>
          (el.innerText || "").includes("Upload Speech/Song Audio"),
        );
    },

    audioInput: () => {
      const block = selectors.audioBlock();

      if (block) {
        const scopedInput = [
          ...block.querySelectorAll('input[type="file"]'),
        ].find((input) => (input.accept || "").toLowerCase().includes("audio"));

        if (scopedInput) return scopedInput;
      }

      return [...document.querySelectorAll('input[type="file"]')]
        .filter((input) => !isInsidePanel(input))
        .filter((input) => input.id !== "glsr-batch-audio-files")
        .find((input) => (input.accept || "").toLowerCase().includes("audio"));
    },

    audioClearButton: () => {
      const block = selectors.audioBlock();
      if (!block) return null;

      return (
        block.querySelector('button[aria-label="Limpar"]') ||
        block.querySelector('button[title="Limpar"]') ||
        block.querySelector('button[aria-label="Clear"]') ||
        block.querySelector('button[title="Clear"]') ||
        block.querySelector('button[aria-label="Remove"]') ||
        block.querySelector('button[title="Remove"]')
      );
    },

    generateButton: () => document.querySelector("#gen-btn"),

    downloadLink: () =>
      document.querySelector(
        'a.download-link[href*=".mp4"], a.download-link[href*="gradio_api/file="]',
      ),

    outputVideo: () =>
      document.querySelector(
        'video[data-testid="🎥 Output-player"], video[src*=".mp4"], video[src*="gradio_api/file="]',
      ),

    progressText: () => document.querySelector(".progress-level-inner"),

    seedStatusText: () => {
      const candidates = [
        ...document.querySelectorAll(
          '.toast, .notification, .status, .output-class, .prose, .markdown, .generating, .progress-text, .meta-text, [id^="component-"]',
        ),
      ].filter((el) => !isInsidePanel(el));

      return candidates.find((el) =>
        /seed\s*[:=]\s*\d{3,}/i.test(el.innerText || el.textContent || ""),
      );
    },

    generationEtaText: () => {
      const direct = document.querySelector("#component-22 .progress-text");
      if (direct && !isInsidePanel(direct)) return direct;

      return [...document.querySelectorAll(".progress-text, .meta-text")]
        .filter((el) => !isInsidePanel(el))
        .find((el) => {
          const text = (el.textContent || "").trim().toLowerCase();
          return text.endsWith("s") && /[0-9]/.test(text);
        });
    },

    generationSpinnerIcon: () => {
      const direct = document.querySelector("#component-22 svg.svelte-zyxd38");
      if (direct && !isInsidePanel(direct)) return direct;

      return [...document.querySelectorAll("svg.svelte-zyxd38")]
        .filter((el) => !isInsidePanel(el))
        .find((el) => {
          const block = el.closest('[id^="component-"]');
          return Boolean(block?.querySelector(".progress-text"));
        });
    },

    matchAudioCheckbox: () =>
      [
        ...document.querySelectorAll(
          'input[type="checkbox"][data-testid="checkbox"], input[type="checkbox"]',
        ),
      ]
        .filter((input) => !isInsidePanel(input))
        .find((input) =>
          (input.closest("label")?.innerText || "").includes(
            "Match video duration",
          ),
        ),
  };

  const exampleSound = `Gentle fast-paced mature female voice with authority. Warm, clear, grounded, and confident. Natural Portuguese pronunciation, direct-to-camera TikTok storytelling energy.`;

  const exampleVisualPrompts = `IMAGE 1 — "Vertical 9:16 realistic cinematic shot of a mature mystical woman seated at a wooden tarot table, black cat on her lap, cozy Brazilian apartment, warm daylight, plants and crystals."

IMAGE 2 — "Vertical 9:16 realistic cinematic shot of the same woman standing near a sunlit window, holding a crystal, plants and spiritual books around her, grounded mystical home atmosphere."

IMAGE 3 — "Vertical 9:16 realistic cinematic close-up of tarot cards, crystals, candles, and the woman's hands resting calmly on the wooden table, warm cinematic realism."`;

  const exampleSpeechQueue = JSON.stringify([
  {"speech": "Leão... [sigh] você tem se colocado em último lugar, não tem?"},
  {"speech": "[pause] Chega. [pause] O universo está dizendo isso agora com força.", "seed": "2450723370"},
  {"speech": "Você vai sentir uma energia diferente nesta semana... [pause] mais leve, [pause] mais sua."},
  {"speech": "Oportunidades vão chegar mas lembra... [pause] tá tudo bem não abraçar tudo.", "seed": "1234567890"},
  {"speech": "Tem felicidade esperando por você, leonino. [pause] O único erro... é achar que não merece."},
  {"speech": "Acredite, [pause] cuide de você [pause] e exija ser correspondido."},
  {"speech": "Tá fazendo sentido até aqui? [pause] Comenta: [pause] eu mereço ser feliz."},
  {"speech": "[sigh] Com essa energia... a virada é real. [pause] Só falta você [pause] se colocar em primeiro lugar."}
]);

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);

    if (panel) {
      panel.style.display = "block";
      panel.scrollIntoView({ behavior: "smooth", block: "center" });
      renderBatchQueue();
      updateFileCounts();
      updateRunProgress({ phase: "idle" });
      return panel;
    }

    panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <style>
        #${PANEL_ID} {
          position: fixed;
          z-index: 2147483647;
          right: 18px;
          top: 18px;
          width: 540px;
          max-height: calc(100vh - 36px);
          overflow: auto;
          background: #101114;
          color: #f4f4f5;
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 16px;
          box-shadow: 0 18px 70px rgba(0,0,0,.55);
          font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        #${PANEL_ID} * { box-sizing: border-box; }

        #${PANEL_ID} header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 14px;
          border-bottom: 1px solid rgba(255,255,255,.10);
          position: sticky;
          top: 0;
          background: #101114;
          z-index: 3;
        }

        #${PANEL_ID} h2 { font-size: 15px; margin: 0; }

        #${PANEL_ID} .body { padding: 14px; }

        #${PANEL_ID} label {
          display: block;
          font-size: 12px;
          font-weight: 700;
          margin: 12px 0 6px;
          color: #d4d4d8;
        }

        #${PANEL_ID} textarea,
        #${PANEL_ID} input[type="number"],
        #${PANEL_ID} input[type="text"],
        #${PANEL_ID} select {
          width: 100%;
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 10px;
          background: #181a20;
          color: #f4f4f5;
          padding: 10px;
          font: inherit;
          font-size: 12px;
          outline: none;
        }

        #${PANEL_ID} textarea {
          resize: vertical;
          min-height: 80px;
        }

        #${PANEL_ID} .small {
          color: #a1a1aa;
          font-size: 11px;
          line-height: 1.4;
        }

        #${PANEL_ID} .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        #${PANEL_ID} .row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        #${PANEL_ID} button {
          border: 0;
          border-radius: 10px;
          padding: 9px 11px;
          background: #2a2d35;
          color: #fff;
          font-weight: 700;
          font-size: 12px;
          cursor: pointer;
        }

        #${PANEL_ID} button.primary { background: #7c3aed; }
        #${PANEL_ID} button.danger { background: #dc2626; }
        #${PANEL_ID} button.good { background: #059669; }
        #${PANEL_ID} button.warning { background: #b45309; }

        #${PANEL_ID} button.tab {
          background: #181a20;
          border: 1px solid rgba(255,255,255,.12);
        }

        #${PANEL_ID} button.tab.active {
          background: #7c3aed;
          border-color: #7c3aed;
        }

        #${PANEL_ID} .tab-panel { display: none; }
        #${PANEL_ID} .tab-panel.active { display: block; }

        #${PANEL_ID} .status {
          margin-top: 10px;
          padding: 10px;
          border-radius: 10px;
          background: #181a20;
          border: 1px solid rgba(255,255,255,.10);
          min-height: 42px;
          color: #cbd5e1;
          font-size: 12px;
          white-space: pre-wrap;
        }

        #${PANEL_ID} .log {
          margin-top: 10px;
          max-height: 190px;
          overflow: auto;
          background: #0b0c0f;
          border: 1px solid rgba(255,255,255,.10);
          border-radius: 10px;
          padding: 8px;
          color: #a1a1aa;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 11px;
          white-space: pre-wrap;
        }

        #${PANEL_ID} .pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid rgba(255,255,255,.12);
          padding: 5px 8px;
          border-radius: 999px;
          color: #cbd5e1;
          background: #181a20;
          font-size: 11px;
          margin-top: 8px;
        }

        #${PANEL_ID} .batch-list {
          display: grid;
          gap: 8px;
          margin-top: 8px;
        }

        #${PANEL_ID} .batch-card {
          border: 1px solid rgba(255,255,255,.12);
          background: #181a20;
          border-radius: 12px;
          padding: 10px;
          font-size: 12px;
        }

        #${PANEL_ID} .batch-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 6px;
        }

        #${PANEL_ID} .batch-meta {
          color: #a1a1aa;
          font-size: 11px;
          line-height: 1.4;
        }

        #${PANEL_ID} .progress-shell {
          height: 8px;
          background: #0b0c0f;
          border-radius: 999px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.10);
          margin-top: 6px;
        }

        #${PANEL_ID} .progress-bar {
          height: 100%;
          width: 0%;
          background: #7c3aed;
          border-radius: 999px;
          transition: width .25s ease;
        }
      </style>

      <header>
        <h2>Gradio LTX Global Image Runner</h2>
        <div class="row">
          <button id="glsr-minimize">Hide</button>
        </div>
      </header>

      <div class="body">
        <div class="row">
          <button id="glsr-tab-inputs" class="tab active">Inputs</button>
          <button id="glsr-tab-seed-explorer" class="tab">Seed Explorer</button>
          <button id="glsr-tab-settings" class="tab">Settings</button>
        </div>

        <div id="glsr-panel-inputs" class="tab-panel active">
          <div class="small" style="margin-top:10px;">
            Images and visual prompts are global. Batches only contain speech and optional audio.
            Start / Continue resumes from the last stopped or failed generation.
          </div>

          <label>Global preset</label>
          <input id="glsr-preset-name" type="text" placeholder="Mystic Woman - Tarot Room" />

          <div class="row" style="margin-top:8px;">
            <button id="glsr-load-preset-folder" class="good">Load preset folder</button>
            <button id="glsr-export-preset-json">Export preset.json</button>
          </div>

          <div class="small">
            Folder format:
            <code>preset.json</code> plus local images like <code>images/1.png</code>, <code>images/2.png</code>.
          </div>

          <label>Global images, used by every batch</label>
          <input id="glsr-global-image-files" type="file" accept="image/*" multiple />
          <div id="glsr-global-image-count" class="pill">No image files selected</div>

          <label>Global visual prompts, one per image</label>
          <textarea id="glsr-global-visual-prompts" rows="8" placeholder='IMAGE 1 — "Visual prompt for image 1..."&#10;&#10;IMAGE 2 — "Visual prompt for image 2..."'></textarea>

          <label>Global fixed sound prompt</label>
          <textarea id="glsr-global-sound" rows="4"></textarea>

          <label>Same prompt generations</label>
          <select id="glsr-same-prompt-generations">
            <option value="1">1 generation per prompt</option>
            <option value="2">2 generations per prompt</option>
            <option value="3">3 generations per prompt</option>
          </select>
          <div class="small">
            Default is 1. With 2 or 3, the same speech prompt is reused and only the reference image rotates for each extra generation.
          </div>

          <hr style="border:0;border-top:1px solid rgba(255,255,255,.10);margin:16px 0;" />

          <label>Batch name</label>
          <input id="glsr-batch-name" type="text" placeholder="Leo batch, Taurus batch..." />

          <label>Batch speech queue (JSON format)</label>
          <textarea id="glsr-speech-queue" rows="8" placeholder='[{"speech":"CLIP 1 — Speech..."},{"speech":"CLIP 2 — Speech...","seed":"2450723370"}]'></textarea>

          <label>Optional audio files for this batch</label>
          <input id="glsr-batch-audio-files" type="file" accept="audio/*" multiple />
          <div id="glsr-batch-audio-count" class="pill">No audio files selected</div>

          <div class="small">
            Audio maps by speech number. Missing audio is allowed. If audio is missing, auto duration will set 3s, 5s, or 8s.
          </div>

          <div class="row" style="margin-top:12px;">
            <button id="glsr-validate-assets">Validate Global Assets</button>
            <button id="glsr-validate-current">Validate Batch</button>
            <button id="glsr-add-batch" class="good">Add speech batch to queue</button>
            <button id="glsr-clear-batch-form">Clear Batch Only</button>
            <button id="glsr-example">Example</button>
          </div>

          <label>Speech batch queue</label>

          <div class="row">
            <button id="glsr-start" class="primary">Start / Continue Queue</button>
            <button id="glsr-pause">Pause</button>
            <button id="glsr-stop" class="danger">Stop</button>
            <button id="glsr-clear-batch-queue" class="warning">Clear Batch Queue Only</button>
          </div>

          <div style="margin-top:10px;">
            <div class="small" id="glsr-run-progress-label">Progress: idle</div>
            <div class="progress-shell">
              <div id="glsr-run-progress-bar" class="progress-bar"></div>
            </div>
          </div>

          <div id="glsr-batch-list" class="batch-list"></div>
        </div>

        <div id="glsr-panel-seed-explorer" class="tab-panel">
          <div class="small" style="margin-top:10px;">
            Seed Explorer runs the same image, visual prompt, speech, and optionally sound with a new random seed each time.
            Downloads are saved in <code>gradio-ltx/{folder-name}/</code> using the seed as the filename (e.g., <code>gradio-ltx/seed-explorer/2450723370.mp4</code>).
          </div>

          <label>Seed Explorer image</label>
          <input id="glsr-seed-image-file" type="file" accept="image/*" />
          <div id="glsr-seed-image-count" class="pill">No seed image selected</div>

          <label>Seed Explorer visual prompt</label>
          <textarea id="glsr-seed-visual-prompt" rows="7" placeholder='Vertical 9:16 realistic cinematic shot...'></textarea>

          <label>Seed Explorer speech</label>
          <textarea id="glsr-seed-speech" rows="5" placeholder='Você não vai acreditar no que chega essa semana...'></textarea>

          <label>Seed Explorer sound prompt <span class="optional">(optional)</span></label>
          <textarea id="glsr-seed-sound" rows="4" placeholder="Gentle mature female voice..."></textarea>

          <label>Custom seeds <span class="optional">(optional - one per line, or leave empty for random)</span></label>
          <textarea id="glsr-seed-list" rows="5" placeholder="2450723370&#10;1234567890&#10;9876543210"></textarea>

          <div class="grid">
            <div>
              <label>Random seed generations</label>
              <input id="glsr-seed-count" type="number" min="1" max="100" step="1" value="10" />
            </div>
            <div>
              <label>Output folder name</label>
              <input id="glsr-seed-folder" type="text" value="seed-explorer" />
            </div>
          </div>

          <div class="small">
            Example output: <code>ltx/seed-explorer/2450723370.mp4</code>. The script sets the random seed before each run and then tries to confirm it from the Gradio status text after generation.
          </div>

          <div class="row" style="margin-top:12px;">
            <button id="glsr-seed-validate">Validate Seed Explorer</button>
            <button id="glsr-seed-start" class="primary">Start Seed Explorer</button>
            <button id="glsr-seed-stop" class="danger">Stop Seed Explorer</button>
          </div>
        </div>

        <div id="glsr-panel-settings" class="tab-panel">
          <label>Start controls</label>
          <div class="grid">
            <div>
              <label>Start batch</label>
              <input id="glsr-start-batch-index" type="number" min="1" step="1" value="1" />
            </div>
            <div>
              <label>Start item inside batch</label>
              <input id="glsr-start-item-index" type="number" min="1" step="1" value="1" />
            </div>
          </div>

          <div class="small">
            Manual start controls are used only when there is no saved resume point.
            Clear the batch queue only if you want to remove queued batches and start clean.
          </div>

          <label>Timeout minutes</label>
          <input id="glsr-timeout" type="number" min="5" step="1" value="45" />

          <label>Default generation setup</label>
          <div class="grid">
            <div>
              <label>Default seed</label>
              <input id="glsr-default-seed" type="number" step="1" value="${DEFAULT_SEED}" />
            </div>
            <div>
              <label>Aspect ratio target</label>
              <input id="glsr-aspect-target" type="text" value="${DEFAULT_ASPECT_RATIO}" />
            </div>
          </div>

          <label>Auto duration from speech</label>
          <div class="grid">
            <div>
              <label>Words per second</label>
              <input id="glsr-duration-wps" type="number" min="1" max="6" step="0.1" value="2.45" />
            </div>
            <div>
              <label>[pause] seconds</label>
              <input id="glsr-duration-pause" type="number" min="0" max="3" step="0.1" value="0.85" />
            </div>
          </div>

          <div class="grid">
            <div>
              <label>[sigh] seconds</label>
              <input id="glsr-duration-sigh" type="number" min="0" max="3" step="0.1" value="0.7" />
            </div>
            <div>
              <label>Short max estimated sec</label>
              <input id="glsr-duration-short-max" type="number" min="1" max="10" step="0.1" value="3.1" />
            </div>
          </div>

          <div class="grid">
            <div>
              <label>Normal max estimated sec</label>
              <input id="glsr-duration-normal-max" type="number" min="2" max="15" step="0.1" value="5.1" />
            </div>
            <div>
              <label>Durations</label>
              <input id="glsr-duration-values" type="text" value="3,5,8" />
            </div>
          </div>

          <div class="small">
            <label style="display:flex;align-items:center;gap:8px;margin:6px 0;font-weight:500;">
              <input id="glsr-auto-duration" type="checkbox" checked />
              Auto-set duration before each generation
            </label>

            <label style="display:flex;align-items:center;gap:8px;margin:6px 0;font-weight:500;">
              <input id="glsr-use-default-seed" type="checkbox" checked />
              Set default seed before the first generation only
            </label>

            <label style="display:flex;align-items:center;gap:8px;margin:6px 0;font-weight:500;">
              <input id="glsr-force-aspect" type="checkbox" checked />
              Force 9:16 aspect ratio before the first generation only
            </label>

            <label style="display:flex;align-items:center;gap:8px;margin:6px 0;font-weight:500;">
              <input id="glsr-auto-download" type="checkbox" checked />
              Auto-download each MP4
            </label>

            <label style="display:flex;align-items:center;gap:8px;margin:6px 0;font-weight:500;">
              <input id="glsr-match-audio" type="checkbox" checked />
              Use match-audio duration only when audio exists
            </label>
          </div>
        </div>

        <div id="glsr-status" class="status">Idle.</div>
        <div id="glsr-log" class="log"></div>
      </div>
    `;

    document.documentElement.appendChild(panel);
    bindPanel();
    loadSavedConfig();
    renderBatchQueue();
    updateFileCounts();
    updateRunProgress({ phase: "idle" });

    return panel;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function bindPanel() {
    $("glsr-minimize").addEventListener("click", () => {
      $(PANEL_ID).style.display = "none";
    });

    $("glsr-tab-inputs").addEventListener("click", () => setTab("inputs"));
    $("glsr-tab-seed-explorer").addEventListener("click", () =>
      setTab("seed-explorer")
    );
    $("glsr-tab-settings").addEventListener("click", () => setTab("settings"));

    $("glsr-load-preset-folder").addEventListener("click", () =>
      loadPresetFolder().catch((error) => {
        setStatus(`Preset load error: ${error.message}`);
        log(`Preset load error: ${error.stack || error.message}`);
      })
    );

    $("glsr-export-preset-json").addEventListener("click", () =>
      exportCurrentPresetJson().catch((error) => {
        setStatus(`Preset export error: ${error.message}`);
        log(`Preset export error: ${error.stack || error.message}`);
      })
    );

    $("glsr-global-image-files").addEventListener("change", (event) => {
      state.globalImages.clear();

      for (const file of event.target.files || []) {
        state.globalImages.set(file.name, file);
      }

      updateFileCounts();
      log(`Selected ${state.globalImages.size} global image file(s).`);
      logGlobalImageMapping();
    });

    $("glsr-batch-audio-files").addEventListener("change", (event) => {
      state.batchAudios.clear();

      for (const file of event.target.files || []) {
        state.batchAudios.set(file.name, file);
      }

      updateFileCounts();
      log(
        `Selected ${state.batchAudios.size} optional audio file(s) for current batch.`,
      );
      logAudioMapping(state.batchAudios);
    });

    $("glsr-seed-image-file").addEventListener("change", (event) => {
      const file = event.target.files?.[0] || null;
      state.seedExplorerImage = file;
      updateFileCounts();
      log(
        file
          ? `Selected Seed Explorer image: ${file.name}`
          : "Seed Explorer image cleared.",
      );
    });

    for (const id of [
      "glsr-preset-name",
      "glsr-global-visual-prompts",
      "glsr-global-sound",
      "glsr-same-prompt-generations",
      "glsr-seed-visual-prompt",
      "glsr-seed-speech",
      "glsr-seed-sound",
      "glsr-seed-count",
      "glsr-seed-folder",
      "glsr-batch-name",
      "glsr-speech-queue",
      "glsr-start-batch-index",
      "glsr-start-item-index",
      "glsr-timeout",
      "glsr-default-seed",
      "glsr-aspect-target",
      "glsr-auto-duration",
      "glsr-duration-wps",
      "glsr-duration-pause",
      "glsr-duration-sigh",
      "glsr-duration-short-max",
      "glsr-duration-normal-max",
      "glsr-duration-values",
      "glsr-use-default-seed",
      "glsr-force-aspect",
      "glsr-auto-download",
      "glsr-match-audio",
    ]) {
      $(id).addEventListener("input", saveConfig);
      $(id).addEventListener("change", saveConfig);
    }

    $("glsr-seed-validate").addEventListener("click", () => {
      try {
        validateSeedExplorerDraft(getSeedExplorerDraft());
        setStatus("Seed Explorer is valid and ready.");
      } catch (error) {
        setStatus(`Seed Explorer validation error: ${error.message}`);
        log(`Seed Explorer validation error: ${error.message}`);
      }
    });

    $("glsr-seed-start").addEventListener("click", () =>
      runSeedExplorer().catch((error) => {
        state.seedExplorerRunning = false;
        state.seedExplorerStopped = false;
        setStatus(`Seed Explorer stopped with error: ${error.message}`);
        log(`Seed Explorer fatal: ${error.stack || error.message}`);
      })
    );

    $("glsr-seed-stop").addEventListener("click", () => {
      state.seedExplorerStopped = true;
      setStatus("Stopping Seed Explorer after the current wait step...");
      log("Seed Explorer stop requested.");
    });

    $("glsr-validate-assets").addEventListener("click", () => {
      try {
        const assets = getGlobalAssets();
        validateGlobalAssets(assets);
        setStatus(
          `Global assets valid: ${assets.images.size} image(s), ${assets.visualPrompts.length} visual prompt(s).`,
        );
        logGlobalAssetCoverage(assets);
      } catch (error) {
        setStatus(`Global asset error: ${error.message}`);
        log(`Global asset error: ${error.message}`);
      }
    });

    $("glsr-validate-current").addEventListener("click", () => {
      try {
        const assets = getGlobalAssets();
        validateGlobalAssets(assets);

        const draft = buildBatchDraftFromForm();
        validateBatchDraft(draft);

        setStatus(
          `Batch is valid: ${draft.items.length} speech item(s), ${draft.audios.size} optional audio file(s).`,
        );

        logBatchCoverage(assets, draft);
      } catch (error) {
        setStatus(`Validation error: ${error.message}`);
        log(`Validation error: ${error.message}`);
      }
    });

    $("glsr-add-batch").addEventListener("click", () => {
      try {
        const draft = buildBatchDraftFromForm();
        validateBatchDraft(draft);

        const batch = {
          id: createId(),
          name: draft.name || `Speech Batch ${state.batchQueue.length + 1}`,
          speechText: draft.speechText,
          items: draft.items,
          audios: new Map(draft.audios),
          addedAt: new Date().toISOString(),
        };

        state.batchQueue.push(batch);
        renderBatchQueue();
        updateRunProgress({ phase: "batch added" });

        setStatus(`Added "${batch.name}" to speech batch queue.`);
        log(
          `Added speech batch: ${batch.name} | ${batch.items.length} item(s).`,
        );
      } catch (error) {
        setStatus(`Could not add batch: ${error.message}`);
        log(`Could not add batch: ${error.message}`);
      }
    });

    $("glsr-clear-batch-form").addEventListener("click", () => {
      clearBatchForm();
      setStatus("Batch form cleared. Global images/prompts were kept.");
    });

    $("glsr-clear-batch-queue").addEventListener("click", async () => {
      if (state.running) {
        setStatus("Cannot clear the batch queue while running.");
        return;
      }

      state.batchQueue = [];
      await clearRuntimeProgress();
      renderBatchQueue();
      updateRunProgress({ phase: "queue cleared" });
      setStatus(
        "Batch queue cleared only. Global assets and current batch form were kept.",
      );
      log("Batch queue and runtime progress cleared.");
    });

    $("glsr-start").addEventListener("click", () =>
      runBatchQueue().catch((error) => {
        state.running = false;
        state.paused = false;
        setStatus(`Stopped with error: ${error.message}`);
        log(`Fatal: ${error.stack || error.message}`);
      })
    );

    $("glsr-pause").addEventListener("click", () => {
      state.paused = !state.paused;
      $("glsr-pause").textContent = state.paused ? "Resume" : "Pause";

      setStatus(
        state.paused
          ? "Paused. Click Resume to continue after the current wait step."
          : "Resuming...",
      );

      updateRunProgress({
        batchIndex: state.currentBatchIndex,
        itemIndex: state.currentItemIndex,
        phase: state.paused ? "paused" : "resuming",
      });
    });

    $("glsr-stop").addEventListener("click", async () => {
      state.stopped = true;
      state.paused = false;

      await saveRuntimeProgress({
        batchIndex: state.currentBatchIndex,
        itemIndex: state.currentItemIndex,
        status: "stopped",
        reason: "user_stop",
      });

      setStatus(
        `Stopping after current step...\nNext Start / Continue will retry current generation from scratch.`,
      );

      updateRunProgress({
        batchIndex: state.currentBatchIndex,
        itemIndex: state.currentItemIndex,
        phase: "stopping",
      });
    });

    $("glsr-example").addEventListener("click", loadExample);
  }

  function setTab(tab) {
    const isInputs = tab === "inputs";
    const isSeedExplorer = tab === "seed-explorer";
    const isSettings = tab === "settings";

    $("glsr-tab-inputs").classList.toggle("active", isInputs);
    $("glsr-tab-seed-explorer").classList.toggle("active", isSeedExplorer);
    $("glsr-tab-settings").classList.toggle("active", isSettings);

    $("glsr-panel-inputs").classList.toggle("active", isInputs);
    $("glsr-panel-seed-explorer").classList.toggle("active", isSeedExplorer);
    $("glsr-panel-settings").classList.toggle("active", isSettings);
  }

  function getSeedExplorerDraft() {
    const visual = ($("glsr-seed-visual-prompt").value || "").trim();
    const speech = ($("glsr-seed-speech").value || "").trim();
    const sound = ($("glsr-seed-sound").value || "").trim();

    // Parse custom seeds from textarea
    const seedListText = ($("glsr-seed-list").value || "").trim();
    const customSeeds = seedListText
      ? seedListText
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line && /^\d+$/.test(line))
          .map((seed) => seed)
      : [];

    // Use custom seeds if provided, otherwise use random seed count
    const count = customSeeds.length || clampNumber(
      parseInt($("glsr-seed-count").value || "10", 10),
      1,
      100,
    );
    const folder = sanitizeFolderName(
      ($("glsr-seed-folder").value || "seed-explorer").trim() ||
        "seed-explorer",
    );

    return {
      image: state.seedExplorerImage,
      visual,
      speech,
      sound,
      count,
      customSeeds,
      folder,
    };
  }

  function validateSeedExplorerDraft(draft) {
    if (!draft.image) {
      throw new Error("Select one Seed Explorer image.");
    }

    if (!draft.visual) {
      throw new Error("Seed Explorer visual prompt is empty.");
    }

    if (!draft.speech) {
      throw new Error("Seed Explorer speech is empty.");
    }

    if (!selectors.promptBox()) {
      throw new Error("Could not find Gradio prompt textarea.");
    }

    if (!selectors.imageBlock()) {
      throw new Error("Could not find Gradio image block.");
    }

    if (!selectors.generateButton()) {
      throw new Error("Could not find Gradio Generate button (#gen-btn).");
    }
  }

  async function runSeedExplorer() {
    ensurePanel();

    if (state.running) {
      setStatus(
        "The batch queue is running. Stop it before using Seed Explorer.",
      );
      return;
    }

    if (state.seedExplorerRunning) {
      setStatus("Seed Explorer is already running.");
      return;
    }

    const draft = getSeedExplorerDraft();
    validateSeedExplorerDraft(draft);

    const config = getConfig();

    state.seedExplorerRunning = true;
    state.seedExplorerStopped = false;

    const seedSourceText = draft.customSeeds.length
      ? `${draft.customSeeds.length} custom seed(s)`
      : `${draft.count} random seed run(s)`;
    setStatus(
      `Seed Explorer starting...\nRuns: ${draft.count}\nFolder: gradio-ltx/${draft.folder}`,
    );
    log(`Seed Explorer started with ${seedSourceText}.`);

    if (config.forceAspect) {
      await setAspectRatio(config.aspectTarget || DEFAULT_ASPECT_RATIO);
    }

    for (let runIndex = 0; runIndex < draft.count; runIndex++) {
      if (state.seedExplorerStopped) break;

      // Use custom seed if provided, otherwise generate random seed
      const generatedSeed = draft.customSeeds.length
        ? draft.customSeeds[runIndex]
        : createRandomSeed();

      const seedTypeText = draft.customSeeds.length ? "custom" : "random";
      setStatus(
        `Seed Explorer ${runIndex + 1}/${draft.count}\nSetting ${seedTypeText} seed: ${generatedSeed}`,
      );

      await setSeedValue(generatedSeed);
      assertSeedExplorerNotStopped();

      const finalPrompt = buildPrompt({
        visual: draft.visual,
        speech: draft.speech,
        sound: draft.sound,
      });

      setPrompt(finalPrompt);
      assertSeedExplorerNotStopped();

      await clearGradioImageInput();
      assertSeedExplorerNotStopped();

      await uploadImageFile(draft.image);
      assertSeedExplorerNotStopped();

      setStatus(
        `Seed Explorer ${runIndex + 1}/${draft.count}\nSeed: ${generatedSeed}\nWaiting for image upload...`,
      );

      await waitForImageToBeReady(draft.image.name, 60000);
      assertSeedExplorerNotStopped();

      await clearGradioAudioInput();
      setMatchAudioChecked(false);
      await waitForGenerateButtonReady(15000);
      assertSeedExplorerNotStopped();

      await maybeSetAutoDuration({
        speech: draft.speech,
        hasAudio: false,
        config,
      });

      const oldHref = getCurrentOutputHref();
      const oldVideoSrc = selectors.outputVideo()?.src || "";

      setStatus(
        `Seed Explorer ${runIndex + 1}/${draft.count}\nSeed: ${generatedSeed}\nGenerating...`,
      );

      await clickGenerateButtonAndConfirmStarted({
        oldHref,
        oldVideoSrc,
        timeoutMs: 15000,
      });

      const output = await waitForNewOutput({
        oldHref,
        oldVideoSrc,
        timeoutMs: config.timeoutMinutes * 60 * 1000,
        queuePosition: runIndex + 1,
        queueTotal: draft.count,
        batchName: "Seed Explorer",
        itemIndex: runIndex + 1,
        batchItemTotal: draft.count,
      });

      assertSeedExplorerNotStopped();

      const statusSeed = getSeedFromStatusText();
      const finalSeed = statusSeed || generatedSeed;
      const filename = makeSeedExplorerFilename({
        folder: draft.folder,
        seed: finalSeed,
      });

      log(
        `Seed Explorer generated run ${runIndex + 1}/${draft.count}. Generated seed=${generatedSeed}, status seed=${statusSeed || "not found"}.`,
      );
      log(`Seed Explorer sending download filename: ${filename}`);

      const response = await chrome.runtime.sendMessage({
        type: "GRADIO_LTX_DOWNLOAD",
        payload: {
          url: output.href,
          filename,
        },
      });

      if (!response?.ok) {
        throw new Error(
          `Seed Explorer download failed: ${response?.error || "unknown error"}`,
        );
      }

      setStatus(
        `Seed Explorer ${runIndex + 1}/${draft.count}\nDownloaded seed: ${finalSeed}\n${filename}`,
      );

      await sleep(1000);
    }

    state.seedExplorerRunning = false;

    if (state.seedExplorerStopped) {
      state.seedExplorerStopped = false;
      setStatus("Seed Explorer stopped.");
      log("Seed Explorer stopped by user.");
      return;
    }

    setStatus("Seed Explorer complete.");
    log("Seed Explorer complete.");
  }

  function assertSeedExplorerNotStopped() {
    if (state.seedExplorerStopped) {
      throw new Error("Seed Explorer stopped by user");
    }
  }

  function createRandomSeed() {
    return String(Math.floor(Math.random() * 4294967295));
  }

  function makeSeedExplorerFilename({ folder = "seed-explorer", seed }) {
    const safeFolder = sanitizeFolderName(folder || "seed-explorer");
    const safeSeed =
      String(seed || createRandomSeed()).replace(/[^0-9]/g, "") ||
      createRandomSeed();

    return `gradio-ltx/${safeFolder}/${safeSeed}.mp4`;
  }

  function getSeedFromStatusText() {
    const directText =
      selectors.seedStatusText()?.innerText ||
      selectors.seedStatusText()?.textContent ||
      "";
    const directMatch = directText.match(/seed\s*[:=]\s*(\d{3,})/i);

    if (directMatch?.[1]) return directMatch[1];

    const candidates = [...document.querySelectorAll("body *")]
      .filter((el) => !isInsidePanel(el))
      .map((el) => (el.innerText || el.textContent || "").trim())
      .filter(Boolean)
      .slice(-350);

    for (let i = candidates.length - 1; i >= 0; i--) {
      const match = candidates[i].match(/seed\s*[:=]\s*(\d{3,})/i);
      if (match?.[1]) return match[1];
    }

    return "";
  }

  async function runBatchQueue() {
    ensurePanel();

    if (state.running) {
      setStatus(
        "Already running. You can still add speech batches from Inputs.",
      );
      return;
    }

    if (!state.batchQueue.length) {
      setStatus(
        "Speech batch queue is empty. Add at least one speech batch first.",
      );
      return;
    }

    const assets = getGlobalAssets();
    validateGlobalAssets(assets);

    const config = getConfig();
    const repeatTotal = config.samePromptGenerations;
    const runtimeProgress = await loadRuntimeProgress();

    let startBatchIndex = config.startBatchIndex - 1;
    let startItemIndex = config.startItemIndex - 1;
    let startRepeatIndex = 0;

    if (
      runtimeProgress &&
      runtimeProgress.status !== "done" &&
      Number.isInteger(runtimeProgress.batchIndex) &&
      Number.isInteger(runtimeProgress.itemIndex) &&
      state.batchQueue[runtimeProgress.batchIndex]?.items?.[
        runtimeProgress.itemIndex
      ]
    ) {
      startBatchIndex = runtimeProgress.batchIndex;
      startItemIndex = runtimeProgress.itemIndex;
      startRepeatIndex = clampNumber(
        runtimeProgress.repeatIndex || 0,
        0,
        repeatTotal - 1,
      );

      log(
        `Resuming from saved progress: batch ${startBatchIndex + 1}, item ${
          startItemIndex + 1
        }, repeat ${startRepeatIndex + 1}/${repeatTotal}. Reason: ${
          runtimeProgress.reason || "previous run did not finish"
        }`,
      );
    } else {
      log(
        `Starting from Settings: batch ${startBatchIndex + 1}, item ${
          startItemIndex + 1
        }, repeat 1/${repeatTotal}.`,
      );
    }

    state.running = true;
    state.paused = false;
    state.stopped = false;
    state.currentBatchIndex = startBatchIndex;
    state.currentItemIndex = startItemIndex;
    state.currentRepeatIndex = startRepeatIndex;
    state.totalQueueItems = getTotalQueueGenerations(repeatTotal);
    state.completedQueueItems = Math.max(
      0,
      getFlatGenerationPosition(
        startBatchIndex,
        startItemIndex,
        startRepeatIndex,
        repeatTotal,
      ) - 1,
    );

    $("glsr-pause").textContent = "Pause";

    updateRunProgress({
      batchIndex: startBatchIndex,
      itemIndex: startItemIndex,
      repeatIndex: startRepeatIndex,
      repeatTotal,
      phase: "starting",
    });

    setStatus(
      `Starting queue...\nGeneration ${getFlatGenerationPosition(
        startBatchIndex,
        startItemIndex,
        startRepeatIndex,
        repeatTotal,
      )}/${state.totalQueueItems}`,
    );

    await applyInitialGenerationSettings(config);

    let batchIndex = startBatchIndex;

    while (!state.stopped) {
      if (batchIndex >= state.batchQueue.length) break;

      const batch = state.batchQueue[batchIndex];
      const startItem = batchIndex === startBatchIndex ? startItemIndex : 0;

      log(
        `Starting speech batch ${batchIndex + 1}/${state.batchQueue.length}: ${
          batch.name
        }`,
      );

      for (
        let itemIndex = startItem;
        itemIndex < batch.items.length;
        itemIndex++
      ) {
        const repeatStart =
          batchIndex === startBatchIndex && itemIndex === startItemIndex
            ? startRepeatIndex
            : 0;

        for (
          let repeatIndex = repeatStart;
          repeatIndex < repeatTotal;
          repeatIndex++
        ) {
          state.currentBatchIndex = batchIndex;
          state.currentItemIndex = itemIndex;
          state.currentRepeatIndex = repeatIndex;

          const flatPosition = getFlatGenerationPosition(
            batchIndex,
            itemIndex,
            repeatIndex,
            repeatTotal,
          );
          const item = batch.items[itemIndex];

          await waitWhilePaused();

          if (state.stopped) {
            await saveRuntimeProgress({
              batchIndex,
              itemIndex,
              repeatIndex,
              status: "stopped",
              reason: "user_stop",
            });

            break;
          }

          await saveRuntimeProgress({
            batchIndex,
            itemIndex,
            repeatIndex,
            status: "in_progress",
            reason: "starting_generation",
          });

          let success = false;

          for (let attempt = 1; attempt <= MAX_ITEM_RETRIES; attempt++) {
            try {
              assertNotStopped();

              updateRunProgress({
                batchIndex,
                itemIndex,
                repeatIndex,
                repeatTotal,
                phase: attempt === 1 ? "starting" : "retrying",
                retryAttempt: attempt === 1 ? 0 : attempt,
              });

              setStatus(
                `Generation ${flatPosition}/${state.totalQueueItems}\nBatch ${
                  batchIndex + 1
                }: ${batch.name}\nItem ${itemIndex + 1}/${batch.items.length}\nRepeat ${
                  repeatIndex + 1
                }/${repeatTotal}\n${
                  attempt === 1
                    ? "Starting..."
                    : `Retrying after error... attempt ${attempt}/${MAX_ITEM_RETRIES}`
                }`,
              );

              if (attempt > 1) {
                await resetGradioUiForRetry();
              }

              const freshAssets = getGlobalAssets();
              validateGlobalAssets(freshAssets);

              await runOneItem({
                assets: freshAssets,
                batch,
                batchIndex,
                item,
                itemIndex,
                repeatIndex,
                repeatTotal,
                config,
                queuePosition: flatPosition,
                queueTotal: state.totalQueueItems,
                retryAttempt: attempt,
              });

              success = true;

              const nextPointer = getNextQueuePointer(
                batchIndex,
                itemIndex,
                repeatIndex,
                repeatTotal,
              );

              if (nextPointer) {
                await saveRuntimeProgress({
                  batchIndex: nextPointer.batchIndex,
                  itemIndex: nextPointer.itemIndex,
                  repeatIndex: nextPointer.repeatIndex,
                  status: "ready_for_next_generation",
                  reason: "previous_generation_completed",
                });
              } else {
                await saveRuntimeProgress({
                  batchIndex,
                  itemIndex,
                  repeatIndex,
                  status: "done",
                  reason: "queue_completed",
                });
              }

              break;
            } catch (error) {
              if (isUserStoppedError(error) || state.stopped) {
                await saveRuntimeProgress({
                  batchIndex,
                  itemIndex,
                  repeatIndex,
                  status: "stopped",
                  reason: "user_stop",
                  error: error.message,
                });

                log(
                  `Stopped by user on generation ${flatPosition}/${state.totalQueueItems}.`,
                );

                break;
              }

              log(
                `Generation ${flatPosition}/${state.totalQueueItems} failed on attempt ${attempt}/${MAX_ITEM_RETRIES}: ${error.message}`,
              );

              await saveRuntimeProgress({
                batchIndex,
                itemIndex,
                repeatIndex,
                status: "error_retrying",
                reason: `attempt_${attempt}_failed`,
                error: error.message,
              });

              if (attempt < MAX_ITEM_RETRIES) {
                setStatus(
                  `Generation ${flatPosition}/${state.totalQueueItems} failed.\nCleaning UI and retrying...\nAttempt ${
                    attempt + 1
                  }/${MAX_ITEM_RETRIES}\n\n${error.message}`,
                );

                continue;
              }

              await saveRuntimeProgress({
                batchIndex,
                itemIndex,
                repeatIndex,
                status: "failed",
                reason: "max_retries_reached",
                error: error.message,
              });

              state.running = false;
              state.paused = false;
              state.stopped = false;

              updateRunProgress({
                batchIndex,
                itemIndex,
                repeatIndex,
                repeatTotal,
                phase: "failed - check manually",
                retryAttempt: MAX_ITEM_RETRIES,
              });

              setStatus(
                `Stopped after ${MAX_ITEM_RETRIES} failed attempts.\nGeneration ${flatPosition}/${state.totalQueueItems}\nBatch ${
                  batchIndex + 1
                }, item ${itemIndex + 1}, repeat ${
                  repeatIndex + 1
                }/${repeatTotal}\n\nPlease check the Gradio UI manually. Then click Start / Continue Queue to retry this same generation from scratch.\n\nLast error: ${
                  error.message
                }`,
              );

              return;
            }
          }

          if (state.stopped || !success) break;

          state.completedQueueItems = flatPosition;

          updateRunProgress({
            batchIndex,
            itemIndex,
            repeatIndex,
            repeatTotal,
            phase: "complete",
          });
        }

        if (state.stopped) break;
      }

      if (state.stopped) break;

      batchIndex += 1;
    }

    state.running = false;
    state.paused = false;

    if (state.stopped) {
      await saveRuntimeProgress({
        batchIndex: state.currentBatchIndex,
        itemIndex: state.currentItemIndex,
        repeatIndex: state.currentRepeatIndex,
        status: "stopped",
        reason: "user_stop",
      });

      const current = getFlatGenerationPosition(
        state.currentBatchIndex,
        state.currentItemIndex,
        state.currentRepeatIndex,
        repeatTotal,
      );

      setStatus(
        `Stopped.\nNext Start / Continue will retry generation ${current}/${state.totalQueueItems} from scratch.`,
      );

      updateRunProgress({
        batchIndex: state.currentBatchIndex,
        itemIndex: state.currentItemIndex,
        repeatIndex: state.currentRepeatIndex,
        repeatTotal,
        phase: "stopped",
      });

      log("Stopped by user. Current generation was saved for resume.");
    } else {
      await clearRuntimeProgress();

      setStatus("Done. No more speech batches in the queue.");

      const bar = $("glsr-run-progress-bar");
      const label = $("glsr-run-progress-label");

      if (bar) bar.style.width = "100%";
      if (label) {
        label.textContent = `Progress: ${state.totalQueueItems}/${state.totalQueueItems} · done`;
      }

      log("Queue finished. Runtime progress cleared.");
    }
  }

  async function runOneItem({
    assets,
    batch,
    batchIndex,
    item,
    itemIndex,
    repeatIndex = 0,
    repeatTotal = 1,
    config,
    queuePosition,
    queueTotal,
    retryAttempt = 1,
  }) {
    const displayBatchIndex = batchIndex + 1;
    const displayItemIndex = itemIndex + 1;

    const imageSlot = getImageSlotForItemRepeat({
      itemIndex,
      repeatIndex,
      imageCount: assets.images.size,
    });
    const imageFile = findImageFileForSlot(imageSlot, assets.images);
    const visualPrompt = assets.visualPrompts[imageSlot - 1];

    const audioFile = findNumberedFile(displayItemIndex, batch.audios);
    const hasAudio = Boolean(audioFile);

    if (!imageFile) {
      throw new Error(`Missing global image slot ${imageSlot}.`);
    }

    if (!visualPrompt) {
      throw new Error(
        `Missing visual prompt for global image slot ${imageSlot}.`,
      );
    }

    const finalPrompt = buildPrompt({
      visual: visualPrompt,
      speech: item.speech,
      sound: assets.soundPrompt,
    });

    updateRunProgress({
      batchIndex,
      itemIndex,
      repeatIndex,
      repeatTotal,
      phase: "preparing",
      retryAttempt: retryAttempt > 1 ? retryAttempt : 0,
    });

    // Set custom seed - check item seed first, then preset image seed
    const seedToUse = item.seed || state.globalImageSeeds.get(imageSlot);
    if (seedToUse) {
      setStatus(
        `Generation ${queuePosition}/${queueTotal}\nBatch ${displayBatchIndex}: ${
          batch.name
        }\nItem ${displayItemIndex}/${batch.items.length}\nRepeat ${repeatIndex + 1}/${repeatTotal}\nSetting seed (image slot ${imageSlot}): ${seedToUse}...`,
      );
      await setSeedValue(seedToUse);
      assertNotStopped();
    }

    setStatus(
      `Generation ${queuePosition}/${queueTotal}\nBatch ${displayBatchIndex}: ${
        batch.name
      }\nItem ${displayItemIndex}/${batch.items.length}\nRepeat ${repeatIndex + 1}/${repeatTotal}\nUsing image slot ${imageSlot}: ${imageFile.name}\nPreparing prompt...`,
    );

    setPrompt(finalPrompt);
    assertNotStopped();

    await clearGradioImageInput();
    assertNotStopped();

    await uploadImageFile(imageFile);
    assertNotStopped();

    setStatus(
      `Generation ${queuePosition}/${queueTotal}\nBatch ${displayBatchIndex}: ${
        batch.name
      }\nItem ${displayItemIndex}/${batch.items.length}\nRepeat ${repeatIndex + 1}/${repeatTotal}\nWaiting for image upload to finish...`,
    );

    updateRunProgress({
      batchIndex,
      itemIndex,
      repeatIndex,
      repeatTotal,
      phase: "loading image",
      retryAttempt: retryAttempt > 1 ? retryAttempt : 0,
    });

    await waitForImageToBeReady(imageFile.name, 60000);
    assertNotStopped();

    await clearGradioAudioInput();
    assertNotStopped();

    if (hasAudio) {
      if (config.matchAudio) {
        setMatchAudioChecked(true);
      }

      await uploadAudioFile(audioFile);
      assertNotStopped();

      setStatus(
        `Generation ${queuePosition}/${queueTotal}\nBatch ${displayBatchIndex}: ${
          batch.name
        }\nItem ${displayItemIndex}/${batch.items.length}\nRepeat ${repeatIndex + 1}/${repeatTotal}\nWaiting for audio to load...`,
      );

      updateRunProgress({
        batchIndex,
        itemIndex,
        repeatIndex,
        repeatTotal,
        phase: "loading audio",
        retryAttempt: retryAttempt > 1 ? retryAttempt : 0,
      });

      await waitForAudioToBeReady(audioFile.name, 45000);
      assertNotStopped();
    } else {
      setMatchAudioChecked(false);
      log(
        `No audio file starting with "${displayItemIndex}." found. Continuing without audio.`,
      );
      await waitForGenerateButtonReady(15000);
      assertNotStopped();
    }

    await maybeSetAutoDuration({
      speech: item.speech,
      hasAudio,
      config,
      overrideDuration: item.duration,
    });

    assertNotStopped();

    const oldHref = getCurrentOutputHref();
    const oldVideoSrc = selectors.outputVideo()?.src || "";

    await waitWhilePaused();
    assertNotStopped();

    updateRunProgress({
      batchIndex,
      itemIndex,
      repeatIndex,
      repeatTotal,
      phase: "generating",
      retryAttempt: retryAttempt > 1 ? retryAttempt : 0,
    });

    setStatus(
      `Generation ${queuePosition}/${queueTotal}\nBatch ${displayBatchIndex}: ${
        batch.name
      }\nItem ${displayItemIndex}/${batch.items.length}\nRepeat ${repeatIndex + 1}/${repeatTotal}\nClicking generate...`,
    );

    await clickGenerateButtonAndConfirmStarted({
      oldHref,
      oldVideoSrc,
      timeoutMs: 15000,
    });

    assertNotStopped();

    const output = await waitForNewOutput({
      oldHref,
      oldVideoSrc,
      timeoutMs: config.timeoutMinutes * 60 * 1000,
      queuePosition,
      queueTotal,
      batchName: batch.name,
      itemIndex: displayItemIndex,
      batchItemTotal: batch.items.length,
      repeatIndex: repeatIndex + 1,
      repeatTotal,
    });

    assertNotStopped();

    setStatus(
      `Generation ${queuePosition}/${queueTotal}\nBatch ${displayBatchIndex}: ${
        batch.name
      }\nItem ${displayItemIndex}/${batch.items.length}\nRepeat ${repeatIndex + 1}/${repeatTotal}\nGenerated. Downloading...`,
    );

    updateRunProgress({
      batchIndex,
      itemIndex,
      repeatIndex,
      repeatTotal,
      phase: "downloading",
      retryAttempt: retryAttempt > 1 ? retryAttempt : 0,
    });

    if (config.autoDownload) {
      const filename = makeFilename({
        batchIndex: displayBatchIndex,
        batchName: batch.name,
        itemIndex: displayItemIndex,
        repeatIndex: repeatIndex + 1,
        speech: item.speech,
      });

      const response = await chrome.runtime.sendMessage({
        type: "GRADIO_LTX_DOWNLOAD",
        payload: {
          url: output.href,
          filename,
        },
      });

      if (!response?.ok) {
        throw new Error(
          `Download failed: ${response?.error || "unknown error"}`,
        );
      }

      log(`Downloaded as ${filename}`);
    }

    await clearGradioAudioInput();

    setStatus(
      `Generation ${queuePosition}/${queueTotal}\nBatch ${displayBatchIndex}: ${
        batch.name
      }\nItem ${displayItemIndex}/${batch.items.length}\nRepeat ${repeatIndex + 1}/${repeatTotal}\nComplete.`,
    );

    updateRunProgress({
      batchIndex,
      itemIndex,
      repeatIndex,
      repeatTotal,
      phase: "complete",
    });

    await sleep(1000);
  }

  async function applyInitialGenerationSettings(config) {
    setStatus("Applying initial generation settings...");
    updateRunProgress({ phase: "applying settings" });

    if (config.useDefaultSeed) {
      await setSeedValue(config.defaultSeed || DEFAULT_SEED);
    } else {
      log("Default seed disabled. Seed input was not touched.");
    }

    if (config.forceAspect) {
      await setAspectRatio(config.aspectTarget || DEFAULT_ASPECT_RATIO);
    } else {
      log("Force aspect ratio disabled. Aspect ratio input was not touched.");
    }

    await sleep(800);
  }

  async function maybeSetAutoDuration({ speech, hasAudio, config, overrideDuration }) {
    // Always prioritize explicit CLIP duration override
    if (overrideDuration) {
      log(`Using custom duration from CLIP marker: ${overrideDuration}s.`);
      await setDurationValue(overrideDuration);
      return;
    }

    if (!config.autoDuration) {
      log("Auto duration disabled. Duration was not touched.");
      return;
    }

    if (hasAudio && config.matchAudio) {
      log(
        "Audio exists and match-audio is enabled. Duration is ignored by Gradio, so duration was not touched.",
      );
      return;
    }

    const result = chooseDurationFromSpeech(speech, config);
    await setDurationValue(result.duration);

    log(
      `Auto duration set to ${result.duration}s. Estimated speech=${result.estimatedSeconds.toFixed(
        2,
      )}s, words=${result.wordCount}, chars=${result.characterCount}, pauses=${result.pauseCount}, sighs=${result.sighCount}.`,
    );
  }

  function chooseDurationFromSpeech(speech, config) {
    const values = parseDurationValues(config.durationValues);
    const shortDuration = values[0] || 3;
    const normalDuration = values[1] || 5;
    const longDuration = values[2] || 8;

    const text = String(speech || "").trim();

    const pauseCount = (text.match(/\[pause\]/gi) || []).length;
    const sighCount = (text.match(/\[sigh\]/gi) || []).length;

    const cleanText = text
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/["""'.…,;:!?—–-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const words = cleanText ? cleanText.split(/\s+/).filter(Boolean) : [];
    const wordCount = words.length;
    const characterCount = cleanText.replace(/\s+/g, "").length;

    // Calculate estimated duration using calibrated word rate (2.2 WPS based on user data)
    const calibratedWPS = 2.2; // Adjusted from 2.45 based on user calibration examples
    const estimatedSeconds =
      wordCount / calibratedWPS +
      pauseCount * config.durationPauseSeconds +
      sighCount * config.durationSighSeconds;

    // Calculate duration with 0.5s minimum padding for quality
    let duration = Math.round(estimatedSeconds + 0.5);

    // Ensure we don't go below 3 seconds (short minimum)
    if (duration < 3) duration = 3;
    // Cap to longest available option
    if (duration > 10) duration = 10;

    return {
      duration,
      estimatedSeconds,
      wordCount,
      characterCount,
      pauseCount,
      sighCount,
    };
  }

  function clampNumber(value, min, max) {
    const number = Number(value);

    if (!Number.isFinite(number)) return min;

    return Math.max(min, Math.min(max, number));
  }

  function parseDurationValues(value) {
    return String(value || "3,5,8")
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((number) => Number.isFinite(number) && number > 0);
  }

  async function setDurationValue(durationSeconds) {
    const input = selectors.durationInput();

    if (!input) {
      log("Duration input not found. Continuing without setting duration.");
      return false;
    }

    const duration = Number(durationSeconds);

    input.scrollIntoView({
      behavior: "instant",
      block: "center",
      inline: "center",
    });

    // Step 1: Open the dropdown
    hardClick(input);
    await sleep(400);

    // Step 2: Filter dropdown so only the target option is visible.
    // Gradio filterable dropdowns need setNativeValue to populate the options list —
    // hardClick alone does not cause Gradio to render [role="option"] elements into the DOM.
    const filterText = `${duration} Seconds`;
    setNativeValue(input, filterText);
    await sleep(400);

    // Step 3: Find the now-visible option by aria-label.
    // Safe because we only search [role="option"] / [data-testid="dropdown-option"] —
    // never generic div/span — so it cannot accidentally match the page body.
    const findDurationOption = () =>
      [...document.querySelectorAll('[data-testid="dropdown-option"], [role="option"]')]
        .filter((el) => !isInsidePanel(el))
        .find((el) => {
          const label = (el.getAttribute("aria-label") || "").toLowerCase();
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && label.startsWith(`${duration} `);
        });

    let option = findDurationOption();

    // Allow up to 3 extra ticks if the DOM hasn't updated yet after filtering
    for (let i = 0; i < 3 && !option; i++) {
      await sleep(150);
      option = findDurationOption();
    }

    if (option) {
      hardClick(option);
      await sleep(400);
      log(`Duration set to ${duration}s (option: ${option.getAttribute("aria-label") || duration})`);
      return true;
    }

    // Fallback: press Enter to confirm whatever Gradio has filtered to
    log(`Duration option for ${duration}s not found after filtering. Pressing Enter as fallback.`);

    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );

    input.dispatchEvent(
      new KeyboardEvent("keyup", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );

    await sleep(500);
    log(`Duration fallback: typed "${filterText}" and pressed Enter.`);
    return true;
  }

  async function setSeedValue(seedValue) {
    const input = selectors.seedInput();

    if (!input) {
      log("Seed input not found. Continuing without setting seed.");
      return false;
    }

    const normalizedSeed = String(seedValue ?? "").trim();

    if (!normalizedSeed) {
      log("Default seed is empty. Seed input was not touched.");
      return false;
    }

    setNativeValue(input, normalizedSeed);
    log(`Default seed set once before first generation: ${normalizedSeed}`);
    await sleep(300);
    return true;
  }

  async function setAspectRatio(targetValue) {
    const input = selectors.aspectRatioInput();

    if (!input) {
      log("Aspect ratio input not found. Continuing without forcing 9:16.");
      return false;
    }

    const target = String(targetValue || DEFAULT_ASPECT_RATIO).trim();

    input.scrollIntoView({
      behavior: "instant",
      block: "center",
      inline: "center",
    });

    hardClick(input);
    await sleep(400);

    setNativeValue(input, target);
    await sleep(400);

    const option = findVisibleOptionByText(target);

    if (option) {
      hardClick(option);
      log(
        `Aspect ratio option clicked once before first generation: ${target}`,
      );
      await sleep(500);
      return true;
    }

    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );

    input.dispatchEvent(
      new KeyboardEvent("keyup", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );

    log(`Aspect ratio value set once before first generation: ${target}`);
    await sleep(700);
    return true;
  }

  function setPrompt(value) {
    const textarea = selectors.promptBox();

    if (!textarea) {
      throw new Error("Prompt textarea not found");
    }

    setNativeValue(textarea, value);
  }

  async function clearGradioImageInput() {
    const clearButton = selectors.imageClearButton();

    if (clearButton) {
      hardClick(clearButton);
      log("Clicked Gradio image clear button inside image block.");
      await sleep(1200);
    } else {
      log("Gradio image clear button not found. Continuing.");
    }

    const input = await waitForGradioImageInput(10000);

    if (!input) {
      log("Image upload input did not reappear after clear.");
      return;
    }

    try {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      log("Image input is ready for next upload.");
    } catch (error) {
      log(`Manual image input clear skipped: ${error.message}`);
    }

    await sleep(500);
  }

  async function uploadImageFile(file) {
    if (!file) {
      throw new Error("Missing File object for image");
    }

    const input = await waitForGradioImageInput(12000);

    if (!input) {
      throw new Error("Image input not found after clearing previous image");
    }

    if (input.id === "glsr-global-image-files" || isInsidePanel(input)) {
      throw new Error("Refusing to upload into extension panel image input");
    }

    const dt = new DataTransfer();
    dt.items.add(file);

    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    log(`Uploaded image into Gradio: ${file.name}`);
  }

  async function waitForGradioImageInput(timeoutMs = 10000) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const input = selectors.imageInput();

      if (
        input &&
        input.id !== "glsr-global-image-files" &&
        !isInsidePanel(input)
      ) {
        return input;
      }

      await sleep(300);
    }

    return null;
  }

  async function waitForImageToBeReady(expectedFileName, timeoutMs = 90000) {
    const started = Date.now();
    let lastLogAt = 0;
    let loadedImageStableSince = 0;
    let safetyBufferStarted = false;

    while (Date.now() - started < timeoutMs) {
      assertNotStopped();

      const generateButton = selectors.generateButton();

      const uploadContainer = selectors.imageUploadContainer();
      const uploadingLabel = selectors.imageUploadingLabel();
      const uploadWrap = selectors.imageUploadWrap();
      const imageFrame = selectors.imageFrame();
      const imageFrameImage = selectors.imageFrameImage();

      const uploadingText = (uploadingLabel?.textContent || "").trim();
      const uploadWrapClass = String(uploadWrap?.className || "");

      const hasUploadingLabel =
        !!uploadingLabel &&
        /uploading|carregando|processing|processando/i.test(uploadingText);

      const hasProgressWrap =
        !!uploadWrap && /\bprogress\b/i.test(uploadWrapClass);

      const uploadStillActive = hasUploadingLabel || hasProgressWrap;

      const imageSrc = imageFrameImage?.getAttribute("src") || "";

      const hasLoadedImageFrame =
        !!imageFrame && !!imageFrameImage && !!imageSrc;

      const imageElementLoaded =
        !!imageFrameImage &&
        imageFrameImage.complete !== false &&
        imageFrameImage.naturalWidth > 0 &&
        imageFrameImage.naturalHeight > 0 &&
        !!imageSrc;

      const buttonReady =
        !!generateButton &&
        !generateButton.disabled &&
        generateButton.getAttribute("aria-disabled") !== "true";

      const loadedReadyState =
        !uploadStillActive && hasLoadedImageFrame && imageElementLoaded;

      if (loadedReadyState) {
        if (!loadedImageStableSince) {
          loadedImageStableSince = Date.now();

          log(
            `Image loaded in Gradio UI: ${expectedFileName}. Waiting for stable loaded state...`,
          );
        }

        const stableForMs = Date.now() - loadedImageStableSince;

        if (stableForMs >= 1000 && !safetyBufferStarted) {
          safetyBufferStarted = true;

          log(
            `Image loaded state is stable. Waiting extra ${
              IMAGE_POST_UPLOAD_BUFFER_MS / 1000
            }s before allowing generate...`,
          );
        }

        if (stableForMs >= 1000 + IMAGE_POST_UPLOAD_BUFFER_MS) {
          if (!buttonReady) {
            log(
              "Image is loaded, but Generate button is not ready yet. Waiting for button...",
            );

            await waitForGenerateButtonReady(30000);
          }

          log(
            `Image fully ready after image-frame + safety buffer: ${expectedFileName}`,
          );

          return true;
        }
      } else {
        loadedImageStableSince = 0;
        safetyBufferStarted = false;
      }

      if (Date.now() - lastLogAt > 3000) {
        lastLogAt = Date.now();

        log(
          [
            "Waiting for image readiness...",
            `uploadActive=${uploadStillActive}`,
            `uploadText="${uploadingText || "none"}"`,
            `hasUploadContainer=${Boolean(uploadContainer)}`,
            `hasImageFrame=${Boolean(imageFrame)}`,
            `hasImage=${Boolean(imageFrameImage)}`,
            `imageLoaded=${imageElementLoaded}`,
            `generateReady=${buttonReady}`,
            `stableMs=${
              loadedImageStableSince ? Date.now() - loadedImageStableSince : 0
            }`,
          ].join(" "),
        );
      }

      await sleep(400);
    }

    throw new Error(
      `Image did not become fully ready after upload: ${expectedFileName}`,
    );
  }
  async function clearGradioAudioInput() {
    const clearButton = selectors.audioClearButton();

    if (clearButton) {
      hardClick(clearButton);
      log("Clicked Gradio audio clear button inside audio block.");
      await sleep(1400);
    } else {
      log("Gradio audio clear button not found inside audio block.");
    }

    const input = await waitForGradioAudioInput(10000);

    if (!input) {
      log(
        "Audio upload input did not reappear after clear. This is okay if no audio is needed.",
      );
      return;
    }

    try {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      log("Audio input is ready for optional next upload.");
    } catch (error) {
      log(`Manual audio input clear skipped: ${error.message}`);
    }

    await sleep(500);
  }

  async function uploadAudioFile(file) {
    if (!file) {
      throw new Error("Missing File object for audio");
    }

    const input = await waitForGradioAudioInput(12000);

    if (!input) {
      throw new Error("Audio input not found after clearing previous audio");
    }

    if (input.id === "glsr-batch-audio-files" || isInsidePanel(input)) {
      throw new Error("Refusing to upload into extension panel audio input");
    }

    const dt = new DataTransfer();
    dt.items.add(file);

    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    log(`Uploaded audio into Gradio: ${file.name}`);
  }

  async function waitForGradioAudioInput(timeoutMs = 10000) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const input = selectors.audioInput();

      if (
        input &&
        input.id !== "glsr-batch-audio-files" &&
        !isInsidePanel(input)
      ) {
        return input;
      }

      await sleep(300);
    }

    return null;
  }

  async function waitForAudioToBeReady(expectedFileName, timeoutMs = 45000) {
    const started = Date.now();
    let lastLogAt = 0;

    while (Date.now() - started < timeoutMs) {
      assertNotStopped();

      const block = selectors.audioBlock();
      const generateButton = selectors.generateButton();

      const hasWaveform =
        !!block?.querySelector('[data-testid^="waveform-"]') ||
        !!block?.querySelector(".waveform-container") ||
        !!block?.querySelector("audio[src]");

      const hasClearButton = !!selectors.audioClearButton();

      const hasDuration =
        !!block?.querySelector("#duration")?.textContent?.trim() ||
        !!block?.querySelector("#time")?.textContent?.trim();

      const buttonReady =
        generateButton &&
        !generateButton.disabled &&
        generateButton.getAttribute("aria-disabled") !== "true";

      if (hasWaveform && hasClearButton && hasDuration && buttonReady) {
        log(`Audio appears ready: ${expectedFileName}`);
        await sleep(1000);
        return true;
      }

      if (Date.now() - lastLogAt > 4000) {
        lastLogAt = Date.now();
        log(
          `Waiting for audio to finish loading... waveform=${hasWaveform}, clear=${hasClearButton}, duration=${hasDuration}, generateReady=${buttonReady}`,
        );
      }

      await sleep(500);
    }

    throw new Error(
      `Audio did not become ready after upload: ${expectedFileName}`,
    );
  }

  async function waitForGenerateButtonReady(timeoutMs = 15000) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      assertNotStopped();

      const button = selectors.generateButton();

      const ready =
        button &&
        !button.disabled &&
        button.getAttribute("aria-disabled") !== "true";

      if (ready) {
        log("Generate button is ready.");
        await sleep(500);
        return true;
      }

      await sleep(300);
    }

    throw new Error("Generate button did not become ready");
  }

  async function clickGenerateButton() {
    const button = selectors.generateButton();

    if (!button) {
      throw new Error("Generate button not found");
    }

    button.scrollIntoView({
      behavior: "instant",
      block: "center",
      inline: "center",
    });

    await sleep(300);

    if (button.disabled || button.getAttribute("aria-disabled") === "true") {
      throw new Error("Generate button is disabled");
    }

    hardClick(button);
    log("Clicked Generate Video.");

    await sleep(1000);
  }

  async function clickGenerateButtonAndConfirmStarted({
    oldHref,
    oldVideoSrc,
    timeoutMs = 15000,
  }) {
    const beforeProgress = selectors.progressText()?.innerText?.trim() || "";

    await clickGenerateButton();

    const started = Date.now();
    let lastLogAt = 0;

    while (Date.now() - started < timeoutMs) {
      assertNotStopped();

      const button = selectors.generateButton();
      const href = getCurrentOutputHref();
      const videoSrc = selectors.outputVideo()?.src || "";
      const progress = selectors.progressText()?.innerText?.trim() || "";
      const etaText = getGenerationEtaText();
      const timerStarted = isGenerationTimerActive();

      const buttonLooksBusy =
        button &&
        (button.disabled || button.getAttribute("aria-disabled") === "true");

      const progressStarted = progress && progress !== beforeProgress;

      const outputAlreadyChanged =
        (href && href !== oldHref) ||
        (!href && videoSrc && videoSrc !== oldVideoSrc);

      if (
        buttonLooksBusy ||
        progressStarted ||
        timerStarted ||
        outputAlreadyChanged
      ) {
        log(
          `Generation start confirmed. busy=${buttonLooksBusy}, progress=${Boolean(
            progressStarted,
          )}, timer=${Boolean(timerStarted)}${etaText ? ` (${etaText})` : ""}, outputChanged=${Boolean(outputAlreadyChanged)}`,
        );
        return true;
      }

      if (Date.now() - lastLogAt > 3000) {
        lastLogAt = Date.now();
        log(
          `Waiting to confirm generation actually started... busy=${buttonLooksBusy}, progress="${progress || "none"}", timer="${etaText || "none"}"`,
        );
      }

      await sleep(500);
    }

    throw new Error(
      "Generate was clicked, but Gradio did not start a generation. The image/audio was probably not fully ready.",
    );
  }

  async function waitForNewOutput({
    oldHref,
    oldVideoSrc,
    timeoutMs,
    queuePosition,
    queueTotal,
    batchName,
    itemIndex,
    batchItemTotal,
  }) {
    const started = Date.now();
    let lastProgress = "";

    while (Date.now() - started < timeoutMs) {
      assertNotStopped();
      await waitWhilePaused();

      const href = getCurrentOutputHref();
      const videoSrc = selectors.outputVideo()?.src || "";
      const progress = selectors.progressText()?.innerText?.trim() || "";
      const etaText = getGenerationEtaText();
      const generationStatus = progress || etaText;

      if (generationStatus && generationStatus !== lastProgress) {
        lastProgress = generationStatus;

        setStatus(
          `Generation ${queuePosition}/${queueTotal}\n${batchName}\nItem ${itemIndex}/${batchItemTotal}\nGenerating...\n${generationStatus}`,
        );
      }

      if (href && href !== oldHref) {
        return { href };
      }

      if (!href && videoSrc && videoSrc !== oldVideoSrc) {
        return { href: videoSrc };
      }

      await sleep(2500);
    }

    throw new Error(
      `Timed out after ${Math.round(timeoutMs / 60000)} minutes waiting for new MP4`,
    );
  }

  function getGenerationEtaText() {
    const eta = selectors.generationEtaText();
    const text = (eta?.textContent || "").trim();
    const lowerText = text.toLowerCase();

    if (!lowerText.endsWith("s")) return "";
    if (!/[0-9]/.test(lowerText)) return "";

    return text;
  }

  function isGenerationTimerActive() {
    const etaText = getGenerationEtaText();
    const spinnerIcon = selectors.generationSpinnerIcon();

    return Boolean(etaText || spinnerIcon);
  }

  function getCurrentOutputHref() {
    const link = selectors.downloadLink();
    if (link?.href) return link.href;

    const video = selectors.outputVideo();
    if (video?.src) return video.src;

    return "";
  }

  function setMatchAudioChecked(checked) {
    const checkbox = selectors.matchAudioCheckbox();

    if (!checkbox) {
      log("Match-audio checkbox not found; continuing.");
      return;
    }

    if (checkbox.checked !== checked) {
      checkbox.click();
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      log(`Match-audio set to ${checked}.`);
    }
  }

  async function resetGradioUiForRetry() {
    log("Resetting Gradio UI before retry...");

    try {
      await clearGradioAudioInput();
    } catch (error) {
      log(`Audio cleanup skipped: ${error.message}`);
    }

    try {
      await clearGradioImageInput();
    } catch (error) {
      log(`Image cleanup skipped: ${error.message}`);
    }

    try {
      const textarea = selectors.promptBox();
      if (textarea) {
        setNativeValue(textarea, "");
        log("Prompt cleared before retry.");
      }
    } catch (error) {
      log(`Prompt cleanup skipped: ${error.message}`);
    }

    await sleep(1200);
  }

  async function loadPresetFolder() {
    if (!window.showDirectoryPicker) {
      throw new Error(
        "Your browser does not support folder picker. Use Chrome/Edge on HTTPS.",
      );
    }

    const dirHandle = await window.showDirectoryPicker({
      mode: "read",
    });

    const presetHandle = await getFileHandleByPath(dirHandle, "preset.json");

    if (!presetHandle) {
      throw new Error("preset.json not found in selected folder.");
    }

    const presetFile = await presetHandle.getFile();
    const presetText = await presetFile.text();
    const preset = JSON.parse(presetText);

    validatePresetJson(preset);

    const visualPrompts = [];
    const imageFiles = new Map();
    const imageSeeds = new Map();

    for (const imageConfig of preset.images) {
      const slot = Number(imageConfig.slot);
      const filePath = imageConfig.file;

      const imageHandle = await getFileHandleByPath(dirHandle, filePath);

      if (!imageHandle) {
        throw new Error(`Image file not found: ${filePath}`);
      }

      const originalFile = await imageHandle.getFile();
      const numberedName = ensureNumberedFileName(slot, originalFile.name);

      const file = new File([originalFile], numberedName, {
        type: originalFile.type || inferImageMimeType(originalFile.name),
        lastModified: originalFile.lastModified || Date.now(),
      });

      imageFiles.set(file.name, file);
      visualPrompts[slot - 1] = imageConfig.visualPrompt || "";

      // Store seed if provided in the preset
      if (imageConfig.seed) {
        imageSeeds.set(slot, imageConfig.seed);
      }
    }

    state.globalImages = imageFiles;
    state.globalImageSeeds = imageSeeds;

    $("glsr-preset-name").value = preset.name || "";
    $("glsr-global-visual-prompts").value = visualPrompts
      .map((prompt, index) => `IMAGE ${index + 1} — "${prompt || ""}"`)
      .join("\n\n");
    $("glsr-global-sound").value = preset.soundPrompt || "";

    updateFileCounts();
    await saveConfig();

    setStatus(`Loaded preset folder: ${preset.name || "Unnamed preset"}`);
    log(`Loaded preset folder with ${state.globalImages.size} image(s).`);
    logGlobalImageMapping();
  }

  async function getFileHandleByPath(dirHandle, path) {
    const parts = String(path || "")
      .replaceAll("\\", "/")
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);

    if (!parts.length) return null;

    let current = dirHandle;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      try {
        if (isLast) {
          return await current.getFileHandle(part);
        }

        current = await current.getDirectoryHandle(part);
      } catch {
        return null;
      }
    }

    return null;
  }

  function validatePresetJson(preset) {
    if (!preset || typeof preset !== "object") {
      throw new Error("Invalid preset.json.");
    }

    if (!Array.isArray(preset.images) || !preset.images.length) {
      throw new Error("preset.json must contain images array.");
    }

    for (const image of preset.images) {
      if (!image.slot) {
        throw new Error("Each preset image must have a slot.");
      }

      if (!image.file) {
        throw new Error(
          `Preset image slot ${image.slot} is missing file path.`,
        );
      }

      if (!image.visualPrompt) {
        throw new Error(
          `Preset image slot ${image.slot} is missing visualPrompt.`,
        );
      }
    }

    if (!preset.soundPrompt) {
      throw new Error("preset.json is missing soundPrompt.");
    }
  }

  async function exportCurrentPresetJson() {
    const assets = getGlobalAssets();

    if (!assets.images.size) {
      throw new Error("Select global images before exporting a preset.");
    }

    if (!assets.visualPrompts.length) {
      throw new Error("Add visual prompts before exporting a preset.");
    }

    if (assets.visualPrompts.length < assets.images.size) {
      throw new Error(
        "Add one visual prompt per selected image before exporting.",
      );
    }

    if (!assets.soundPrompt) {
      throw new Error("Add a global sound prompt before exporting.");
    }

    const presetName =
      ($("glsr-preset-name").value || "").trim() ||
      `Global Preset ${new Date().toISOString().slice(0, 10)}`;

    const sortedImages = getSortedFilesBySlot(assets.images);

    const preset = {
      name: presetName,
      version: 1,
      createdAt: new Date().toISOString(),
      soundPrompt: assets.soundPrompt,
      images: sortedImages.map((file, index) => ({
        slot: index + 1,
        file: `images/${file.name.replace(/^\d+[.\s_-]+/, `${index + 1}.`)}`,
        visualPrompt: assets.visualPrompts[index] || "",
      })),
    };

    const jsonText = JSON.stringify(preset, null, 2);
    const blob = new Blob([jsonText], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "preset.json";
    document.documentElement.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1500);

    setStatus(
      "Exported preset.json. Put it beside an images/ folder containing the image files.",
    );
    log("Exported preset.json.");
  }

  function getGlobalAssets() {
    const visualText = ($("glsr-global-visual-prompts").value || "").trim();
    const soundPrompt = ($("glsr-global-sound").value || "").trim();

    return {
      images: new Map(state.globalImages),
      visualPrompts: parsePromptList(visualText),
      soundPrompt,
    };
  }

  function buildBatchDraftFromForm() {
    const name = ($("glsr-batch-name").value || "").trim();
    const speechText = ($("glsr-speech-queue").value || "").trim();

    let items = [];

    try {
      // Try to parse as JSON first
      if (speechText.trim().startsWith("[")) {
        const parsed = JSON.parse(speechText);
        if (Array.isArray(parsed)) {
          items = parsed
            .filter((item) => item && item.speech)
            .map((item, index) => ({
              index,
              speech: item.speech,
              seed: item.seed || null,
              duration: item.duration || null,
            }));
        } else {
          throw new Error("Expected JSON array of objects");
        }
      } else {
        // Parse CLIP format: CLIP 1 [5s] — "speech text"
        items = parseCLIPFormat(speechText);
      }
    } catch (error) {
      throw new Error(`Invalid format: ${error.message}`);
    }

    return {
      name,
      speechText,
      items,
      audios: new Map(state.batchAudios),
    };
  }

  function parseCLIPFormat(text) {
    const lines = text.split("\n").filter((line) => line.trim());
    const items = [];

    for (const line of lines) {
      // Match: CLIP N [Xs] — [...] "speech" or CLIP N — [Xs] "speech" etc.
      const durationMatch = line.match(/\[(\d+)s?\]/);
      const duration = durationMatch ? parseInt(durationMatch[1], 10) : null;

      // Match speech text in quotes or without quotes
      const speechMatch = line.match(
        /CLIP\s+\d+\s*(?:\[\d+s?\])?\s*—\s*(?:\[[^\]]*\])?\s*[""]?(.+?)[""]?(?:\s*$)|^[""](.+?)[""]|^(?:CLIP\s+\d+\s*(?:\[\d+s?\])?\s*—\s*(?:\[[^\]]*\])?\s*)?(.+?)$/i,
      );

      if (speechMatch) {
        let speech = (speechMatch[1] || speechMatch[2] || speechMatch[3] || "").trim();
        // Remove any remaining quotes
        speech = speech.replace(/^[""]|[""]$/g, "").trim();

        if (speech) {
          items.push({
            index: items.length,
            speech,
            seed: null,
            duration, // Store the duration from [Xs]
          });
        }
      }
    }

    if (!items.length) {
      throw new Error("No valid speech items found. Use format: CLIP 1 [5s] — \"speech text\"");
    }

    return items;
  }

  function validateGlobalAssets(assets) {
    if (!assets.images.size) {
      throw new Error("Select at least one global image.");
    }

    if (!assets.visualPrompts.length) {
      throw new Error("Add at least one visual prompt.");
    }

    if (assets.visualPrompts.length < assets.images.size) {
      throw new Error(
        `You selected ${assets.images.size} image(s), but only ${assets.visualPrompts.length} visual prompt(s). Add one visual prompt per image.`,
      );
    }

    if (!assets.soundPrompt) {
      throw new Error("Global fixed sound prompt is empty.");
    }

    if (!selectors.promptBox()) {
      throw new Error("Could not find Gradio prompt textarea.");
    }

    if (!selectors.imageBlock()) {
      throw new Error("Could not find Gradio image block.");
    }

    if (!selectors.audioBlock()) {
      throw new Error("Could not find Gradio audio block.");
    }

    if (!selectors.generateButton()) {
      throw new Error("Could not find Gradio Generate button (#gen-btn).");
    }
  }

  function validateBatchDraft(draft) {
    if (!draft.items.length) {
      throw new Error("Batch speech queue is empty.");
    }
  }

  function renderBatchQueue() {
    const list = $("glsr-batch-list");
    if (!list) return;

    if (!state.batchQueue.length) {
      list.innerHTML = `<div class="small">No speech batches added yet.</div>`;
      return;
    }

    list.innerHTML = state.batchQueue
      .map((batch, index) => {
        const noAudioCount = batch.items.filter(
          (item) => !findNumberedFile(item.index + 1, batch.audios),
        ).length;

        return `
          <div class="batch-card" data-batch-id="${escapeHtml(batch.id)}">
            <div class="batch-title">
              <strong>${index + 1}. ${escapeHtml(batch.name)}</strong>
              <button data-remove-batch="${escapeHtml(batch.id)}" class="danger">Remove</button>
            </div>
            <div class="batch-meta">
              ${batch.items.length} speech item(s) · ${batch.audios.size} optional audio(s)
              <br />
              No-audio items: ${noAudioCount}
              <br />
              First speech: ${escapeHtml(truncate(batch.items[0]?.speech || "", 90))}
            </div>
          </div>
        `;
      })
      .join("");

    for (const button of list.querySelectorAll("[data-remove-batch]")) {
      button.addEventListener("click", async () => {
        if (state.running) {
          setStatus("Cannot remove a batch while running.");
          return;
        }

        const id = button.getAttribute("data-remove-batch");
        state.batchQueue = state.batchQueue.filter((batch) => batch.id !== id);
        await clearRuntimeProgress();
        renderBatchQueue();
        updateRunProgress({ phase: "batch removed" });
        setStatus("Batch removed. Resume point reset.");
      });
    }
  }

  function clearBatchForm() {
    $("glsr-batch-name").value = "";
    $("glsr-speech-queue").value = "";
    $("glsr-batch-audio-files").value = "";
    state.batchAudios.clear();
    updateFileCounts();
    saveConfig();
  }

  function loadExample() {
    $("glsr-preset-name").value = "Example Mystic Woman Preset";
    $("glsr-global-visual-prompts").value = exampleVisualPrompts;
    $("glsr-global-sound").value = exampleSound;
    $("glsr-batch-name").value = "Example Leo speech batch";
    $("glsr-speech-queue").value = exampleSpeechQueue;
    saveConfig();
    setStatus(
      "Example loaded. Select global images, optional numbered audio files, then add speech batch.",
    );
  }

  async function saveConfig() {
    const config = getConfig(false);
    await chrome.storage.local.set({ [STORAGE_KEY]: config });
  }

  async function loadSavedConfig() {
    const saved = await chrome.storage.local.get(STORAGE_KEY);
    const config = saved[STORAGE_KEY];

    if (!config) {
      $("glsr-default-seed").value = DEFAULT_SEED;
      $("glsr-aspect-target").value = DEFAULT_ASPECT_RATIO;
      return;
    }

    $("glsr-preset-name").value = config.presetName || "";
    $("glsr-global-visual-prompts").value = config.globalVisualPrompts || "";
    $("glsr-global-sound").value = config.globalSound || "";
    $("glsr-seed-visual-prompt").value = config.seedExplorerVisual || "";
    $("glsr-seed-speech").value = config.seedExplorerSpeech || "";
    $("glsr-seed-sound").value = config.seedExplorerSound || "";
    $("glsr-seed-count").value = config.seedExplorerCount || 10;
    $("glsr-seed-folder").value = config.seedExplorerFolder || "seed-explorer";
    $("glsr-same-prompt-generations").value = String(
      clampNumber(config.samePromptGenerations || 1, 1, 3),
    );
    $("glsr-batch-name").value = config.batchName || "";
    $("glsr-speech-queue").value = config.speechText || "";
    $("glsr-start-batch-index").value = config.startBatchIndex || 1;
    $("glsr-start-item-index").value = config.startItemIndex || 1;
    $("glsr-timeout").value = config.timeoutMinutes || 45;
    $("glsr-default-seed").value = config.defaultSeed || DEFAULT_SEED;
    $("glsr-aspect-target").value = config.aspectTarget || DEFAULT_ASPECT_RATIO;

    $("glsr-auto-duration").checked = config.autoDuration !== false;
    $("glsr-duration-wps").value = config.durationWordsPerSecond || 2.45;
    $("glsr-duration-pause").value = config.durationPauseSeconds || 0.85;
    $("glsr-duration-sigh").value = config.durationSighSeconds || 0.7;
    $("glsr-duration-short-max").value = config.durationShortMax || 3.1;
    $("glsr-duration-normal-max").value = config.durationNormalMax || 5.1;
    $("glsr-duration-values").value = config.durationValues || "3,5,8";

    $("glsr-use-default-seed").checked = config.useDefaultSeed !== false;
    $("glsr-force-aspect").checked = config.forceAspect !== false;
    $("glsr-auto-download").checked = config.autoDownload !== false;
    $("glsr-match-audio").checked = config.matchAudio !== false;
  }

  function getConfig(trim = true) {
    const val = (id) => (trim ? ($(id).value || "").trim() : $(id).value || "");

    return {
      presetName: val("glsr-preset-name"),
      globalVisualPrompts: val("glsr-global-visual-prompts"),
      globalSound: val("glsr-global-sound"),
      seedExplorerVisual: val("glsr-seed-visual-prompt"),
      seedExplorerSpeech: val("glsr-seed-speech"),
      seedExplorerSound: val("glsr-seed-sound"),
      seedExplorerCount: clampNumber(
        parseInt($("glsr-seed-count").value || "10", 10),
        1,
        100,
      ),
      seedExplorerFolder: val("glsr-seed-folder") || "seed-explorer",
      samePromptGenerations: clampNumber(
        parseInt($("glsr-same-prompt-generations").value || "1", 10),
        1,
        3,
      ),
      batchName: val("glsr-batch-name"),
      speechText: val("glsr-speech-queue"),

      startBatchIndex: Math.max(
        1,
        parseInt($("glsr-start-batch-index").value || "1", 10),
      ),

      startItemIndex: Math.max(
        1,
        parseInt($("glsr-start-item-index").value || "1", 10),
      ),

      timeoutMinutes: Math.max(
        5,
        parseInt($("glsr-timeout").value || "45", 10),
      ),

      defaultSeed: val("glsr-default-seed") || DEFAULT_SEED,
      aspectTarget: val("glsr-aspect-target") || DEFAULT_ASPECT_RATIO,

      autoDuration: $("glsr-auto-duration").checked,

      durationWordsPerSecond: Math.max(
        1,
        parseFloat($("glsr-duration-wps").value || "2.45"),
      ),

      durationPauseSeconds: Math.max(
        0,
        parseFloat($("glsr-duration-pause").value || "0.85"),
      ),

      durationSighSeconds: Math.max(
        0,
        parseFloat($("glsr-duration-sigh").value || "0.7"),
      ),

      durationShortMax: Math.max(
        1,
        parseFloat($("glsr-duration-short-max").value || "3.1"),
      ),

      durationNormalMax: Math.max(
        2,
        parseFloat($("glsr-duration-normal-max").value || "5.1"),
      ),

      durationValues: val("glsr-duration-values") || "3,5,8",

      useDefaultSeed: $("glsr-use-default-seed").checked,
      forceAspect: $("glsr-force-aspect").checked,
      autoDownload: $("glsr-auto-download").checked,
      matchAudio: $("glsr-match-audio").checked,
    };
  }

  function parsePromptList(text) {
    const raw = (text || "").trim();
    if (!raw) return [];

    const nonEmptyLines = raw
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter(Boolean);

    const quotedItems = nonEmptyLines
      .map((line) => extractQuotedText(line))
      .filter(Boolean);

    if (
      quotedItems.length >= 2 ||
      quotedItems.length === nonEmptyLines.length
    ) {
      return quotedItems.map((item) => item.trim()).filter(Boolean);
    }

    return raw
      .split(/\n\s*\n/g)
      .map((block) => (extractQuotedText(block) || block).trim())
      .filter(Boolean);
  }

  function extractQuotedText(text) {
    const value = String(text || "").trim();
    if (!value) return "";

    const quotePairs = [
      ['"', '"'],
      ["", ""],
      ["'", "'"],
      ["'", "'"],
    ];

    for (const [openQuote, closeQuote] of quotePairs) {
      const start = value.indexOf(openQuote);
      const end = value.lastIndexOf(closeQuote);

      if (start >= 0 && end > start) {
        return value.slice(start + openQuote.length, end).trim();
      }
    }

    return "";
  }

  function buildPrompt({ visual, speech, sound }) {
    let prompt = `[VISUAL]
${visual}

[SPEECH]
${speech}`;
    if (sound) {
      prompt += `

[SOUND]
${sound}`;
    }
    return prompt;
  }

  function findVisibleOptionByText(text) {
    const target = String(text || "")
      .trim()
      .toLowerCase();

    const candidates = [
      ...document.querySelectorAll(
        '[role="option"], [data-testid="dropdown-option"], li, div, span, button',
      ),
    ].filter((el) => !isInsidePanel(el));

    return candidates.find((el) => {
      const rect = el.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0;
      const content = (el.innerText || el.textContent || "")
        .trim()
        .toLowerCase();

      return visible && content === target;
    });
  }

  function findVisibleOptionByTextAny(texts) {
    const normalizedTargets = texts.map((text) =>
      String(text || "")
        .trim()
        .toLowerCase(),
    );

    const candidates = [
      ...document.querySelectorAll(
        '[role="option"], [data-testid="dropdown-option"], li, div, span, button',
      ),
    ].filter((el) => !isInsidePanel(el));

    return candidates.find((el) => {
      const rect = el.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0;
      const content = (el.innerText || el.textContent || "")
        .trim()
        .toLowerCase();

      if (!visible || !content) return false;

      return normalizedTargets.some(
        (target) => content === target || content.includes(target),
      );
    });
  }

  function setNativeValue(element, value) {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

    if (descriptor?.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function hardClick(element) {
    if (!element) return false;

    element.scrollIntoView({
      behavior: "instant",
      block: "center",
      inline: "center",
    });

    const rect = element.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;

    const eventOptions = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX,
      clientY,
    };

    element.dispatchEvent(new PointerEvent("pointerdown", eventOptions));
    element.dispatchEvent(new MouseEvent("mousedown", eventOptions));
    element.dispatchEvent(new PointerEvent("pointerup", eventOptions));
    element.dispatchEvent(new MouseEvent("mouseup", eventOptions));
    element.dispatchEvent(new MouseEvent("click", eventOptions));

    return true;
  }

  function findImageFileForSlot(slotNumber, filesMap) {
    const numbered = findNumberedFile(slotNumber, filesMap);
    if (numbered) return numbered;

    const sorted = getSortedFilesBySlot(filesMap);
    return sorted[slotNumber - 1] || null;
  }

  function findNumberedFile(number, filesMap) {
    const files = [...filesMap.values()];

    const exactPrefixRegex = new RegExp(
      `^${escapeRegExp(String(number))}(?:[.\\s_-]|$)`,
      "i",
    );

    return files.find((file) => exactPrefixRegex.test(file.name)) || null;
  }

  function getSortedFilesBySlot(filesMap) {
    return [...filesMap.values()].sort((a, b) => {
      const aNumber = extractLeadingNumber(a.name);
      const bNumber = extractLeadingNumber(b.name);

      if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) {
        return aNumber - bNumber;
      }

      if (Number.isFinite(aNumber)) return -1;
      if (Number.isFinite(bNumber)) return 1;

      return String(a.name).localeCompare(String(b.name));
    });
  }

  function getImageSlotForItemIndex(zeroBasedIndex, imageCount) {
    return getImageSlotForItemRepeat({
      itemIndex: zeroBasedIndex,
      repeatIndex: 0,
      imageCount,
    });
  }

  function getImageSlotForItemRepeat({ itemIndex, repeatIndex, imageCount }) {
    return ((itemIndex + repeatIndex) % imageCount) + 1;
  }

  function extractLeadingNumber(fileName) {
    const match = String(fileName || "").match(/^(\d+)(?:[.\s_-]|$)/);
    return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
  }

  function makeFilename({
    batchIndex,
    batchName,
    itemIndex,
    repeatIndex = 1,
    speech = "",
  }) {
    const safeBatch = sanitizeFolderName(batchName || `batch-${batchIndex}`);
    const speechSlug = makeSpeechSlug(speech);

    return `gradio-ltx/${safeBatch}/${String(itemIndex).padStart(
      3,
      "0",
    )}.${repeatIndex}-${speechSlug}.mp4`;
  }

  function makeSpeechSlug(text) {
    const cleaned = String(text || "")
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/CLIP\s*\d+\s*[—:-]/gi, " ")
      .replace(/CTA\s*[—:-]/gi, " ")
      .replace(/["""']/g, " ")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/ç/g, "c")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 28);

    return cleaned || "speech";
  }

  function sanitizeFolderName(text) {
    return (
      String(text || "batch")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80) || "batch"
    );
  }

  function makeSpeechSlug(text) {
    const cleaned = String(text || "")
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/CLIP\s*\d+\s*[—:-]/gi, " ")
      .replace(/CTA\s*[—:-]/gi, " ")
      .replace(/["""']/g, " ")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/ç/g, "c")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 28);

    return cleaned || "speech";
  }

  function sanitizeFolderName(text) {
    return (
      String(text || "batch")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80) || "batch"
    );
  }

  function sanitizeFilename(text) {
    return (
      String(text || "output")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9._-]+/gi, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80) || "output"
    );
  }

  function ensureNumberedFileName(slot, originalName) {
    const cleanName = String(originalName || `image-${slot}.png`).replace(
      /^(\d+)([.\s_-]+)/,
      "",
    );
    return `${slot}.${cleanName}`;
  }

  function inferImageMimeType(fileName) {
    const lower = String(fileName || "").toLowerCase();

    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".gif")) return "image/gif";

    return "image/png";
  }

  function getTotalQueueItems() {
    return state.batchQueue.reduce(
      (total, batch) => total + (batch.items?.length || 0),
      0,
    );
  }

  function getTotalQueueGenerations(repeatTotal = 1) {
    return getTotalQueueItems() * Math.max(1, repeatTotal);
  }

  function getFlatQueuePosition(batchIndex, itemIndex) {
    let position = 0;

    for (let i = 0; i < batchIndex; i++) {
      position += state.batchQueue[i]?.items?.length || 0;
    }

    return position + itemIndex + 1;
  }

  function getFlatGenerationPosition(
    batchIndex,
    itemIndex,
    repeatIndex = 0,
    repeatTotal = 1,
  ) {
    return (
      (getFlatQueuePosition(batchIndex, itemIndex) - 1) * repeatTotal +
      repeatIndex +
      1
    );
  }

  function getNextQueuePointer(
    batchIndex,
    itemIndex,
    repeatIndex = 0,
    repeatTotal = 1,
  ) {
    if (repeatIndex + 1 < repeatTotal) {
      return { batchIndex, itemIndex, repeatIndex: repeatIndex + 1 };
    }

    const batch = state.batchQueue[batchIndex];

    if (batch?.items?.[itemIndex + 1]) {
      return { batchIndex, itemIndex: itemIndex + 1, repeatIndex: 0 };
    }

    for (
      let nextBatchIndex = batchIndex + 1;
      nextBatchIndex < state.batchQueue.length;
      nextBatchIndex++
    ) {
      if (state.batchQueue[nextBatchIndex]?.items?.length) {
        return { batchIndex: nextBatchIndex, itemIndex: 0, repeatIndex: 0 };
      }
    }

    return null;
  }

  function updateRunProgress({
    batchIndex = state.currentBatchIndex,
    itemIndex = state.currentItemIndex,
    repeatIndex = state.currentRepeatIndex || 0,
    repeatTotal,
    phase = "running",
    retryAttempt = 0,
    totalRetries = MAX_ITEM_RETRIES,
  } = {}) {
    const safeRepeatTotal =
      repeatTotal || getConfig(false).samePromptGenerations || 1;
    const total = getTotalQueueGenerations(safeRepeatTotal);
    const hasValidPosition =
      total > 0 && state.batchQueue[batchIndex]?.items?.[itemIndex];

    const current = hasValidPosition
      ? Math.min(
          getFlatGenerationPosition(
            batchIndex,
            itemIndex,
            repeatIndex,
            safeRepeatTotal,
          ),
          total,
        )
      : 0;

    const percent = total ? Math.round((current / total) * 100) : 0;
    const label = $("glsr-run-progress-label");
    const bar = $("glsr-run-progress-bar");

    if (label) {
      const retryText =
        retryAttempt > 0 ? ` · retry ${retryAttempt}/${totalRetries}` : "";
      const repeatText =
        safeRepeatTotal > 1
          ? `, repeat ${repeatIndex + 1}/${safeRepeatTotal}`
          : "";

      label.textContent =
        total > 0 && hasValidPosition
          ? `Progress: ${current}/${total} · Batch ${batchIndex + 1}, item ${
              itemIndex + 1
            }${repeatText} · ${phase}${retryText}`
          : `Progress: ${phase}`;
    }

    if (bar) {
      bar.style.width = `${percent}%`;
    }
  }

  async function saveRuntimeProgress({
    batchIndex,
    itemIndex,
    repeatIndex = 0,
    status = "in_progress",
    reason = "",
    error = "",
  } = {}) {
    const progress = {
      batchIndex,
      itemIndex,
      repeatIndex,
      status,
      reason,
      error,
      updatedAt: new Date().toISOString(),
    };

    await chrome.storage.local.set({ [RUNTIME_KEY]: progress });
  }

  async function loadRuntimeProgress() {
    const saved = await chrome.storage.local.get(RUNTIME_KEY);
    return saved[RUNTIME_KEY] || null;
  }

  async function clearRuntimeProgress() {
    await chrome.storage.local.remove(RUNTIME_KEY);
  }

  function isUserStoppedError(error) {
    return /stopped by user/i.test(String(error?.message || ""));
  }

  function assertNotStopped() {
    if (state.stopped) {
      throw new Error("Stopped by user");
    }
  }

  async function waitWhilePaused() {
    while (state.paused && !state.stopped) {
      await sleep(500);
    }
  }

  function updateFileCounts() {
    $("glsr-global-image-count").textContent = state.globalImages.size
      ? `${state.globalImages.size} global image file(s) selected`
      : "No image files selected";

    $("glsr-batch-audio-count").textContent = state.batchAudios.size
      ? `${state.batchAudios.size} optional audio file(s) selected`
      : "No audio files selected";

    const seedCount = $("glsr-seed-image-count");
    if (seedCount) {
      seedCount.textContent = state.seedExplorerImage
        ? `Seed image selected: ${state.seedExplorerImage.name}`
        : "No seed image selected";
    }
  }

  function logGlobalImageMapping() {
    const files = getSortedFilesBySlot(state.globalImages).map(
      (file) => file.name,
    );

    if (!files.length) return;

    log("Global image files:");

    files.forEach((fileName, index) => {
      const number = extractLeadingNumber(fileName);
      log(
        `  slot ${Number.isFinite(number) ? number : index + 1} → ${fileName}`,
      );
    });
  }

  function logAudioMapping(filesMap) {
    const files = [...filesMap.values()]
      .map((file) => file.name)
      .sort((a, b) => extractLeadingNumber(a) - extractLeadingNumber(b));

    if (!files.length) return;

    log("Selected optional audio files:");

    for (const fileName of files) {
      const number = extractLeadingNumber(fileName);
      log(`  ${Number.isFinite(number) ? number : "?"} → ${fileName}`);
    }
  }

  function logGlobalAssetCoverage(assets) {
    log("Global asset coverage:");

    for (let i = 0; i < assets.images.size; i++) {
      const slot = i + 1;
      const image = findImageFileForSlot(slot, assets.images);
      const visual = assets.visualPrompts[i];

      log(
        `  image ${slot}: ${image?.name || "MISSING"} | visual=${truncate(
          visual || "MISSING",
          80,
        )}`,
      );
    }
  }

  function logBatchCoverage(assets, draft) {
    log("Batch coverage:");

    for (const item of draft.items) {
      const itemNumber = item.index + 1;
      const imageSlot = getImageSlotForItemIndex(
        item.index,
        assets.images.size,
      );
      const image = findImageFileForSlot(imageSlot, assets.images);
      const audio = findNumberedFile(itemNumber, draft.audios);

      log(
        `  item ${itemNumber}: global image ${imageSlot}=${
          image?.name || "MISSING"
        } | audio=${audio?.name || "NO AUDIO"}`,
      );
    }
  }

  function setStatus(text) {
    ensurePanel();
    $("glsr-status").textContent = text;
  }

  function log(text) {
    ensurePanel();

    const line = `[${new Date().toLocaleTimeString()}] ${text}`;

    state.logLines.push(line);
    state.logLines = state.logLines.slice(-700);

    $("glsr-log").textContent = state.logLines.join("\n");
  }

  function truncate(text, max) {
    text = String(text || "")
      .replace(/\s+/g, " ")
      .trim();
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  function escapeHtml(text) {
    return String(text || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function createId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "GRADIO_LTX_OPEN_PANEL") {
      ensurePanel();
      sendResponse({ ok: true });
    }

    if (message?.type === "GRADIO_LTX_LOAD_EXAMPLE") {
      ensurePanel();
      loadExample();
      sendResponse({ ok: true });
    }

    return true;
  });
})();
