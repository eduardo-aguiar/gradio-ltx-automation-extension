(() => {
  const PANEL_ID = "gradio-ltx-speech-runner-panel";
  const STORAGE_KEY = "gradioLtxSpeechRunner:v7-clip-quote-parser";

  const state = {
    running: false,
    paused: false,
    stopped: false,
    currentIndex: 0,
    selectedFiles: new Map(),
    logLines: [],
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function isInsideRunnerPanel(element) {
    return Boolean(element?.closest?.(`#${PANEL_ID}`));
  }

  const selectors = {
    promptBox: () =>
      [...document.querySelectorAll('textarea[data-testid="textbox"]')]
        .filter((el) => !isInsideRunnerPanel(el))
        .find((el) => (el.placeholder || "").includes("[VISUAL]")),

    audioBlock: () => {
      const direct = document.querySelector("#component-7");

      if (direct && !isInsideRunnerPanel(direct)) {
        return direct;
      }

      return [...document.querySelectorAll('[id^="component-"]')]
        .filter((el) => !isInsideRunnerPanel(el))
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

        if (scopedInput) {
          return scopedInput;
        }
      }

      return [...document.querySelectorAll('input[type="file"]')]
        .filter((input) => !isInsideRunnerPanel(input))
        .filter((input) => input.id !== "glsr-audio-files")
        .find((input) => (input.accept || "").toLowerCase().includes("audio"));
    },

    audioClearButton: () => {
      const block = selectors.audioBlock();

      if (!block) {
        return null;
      }

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
    stopButton: () => document.querySelector("#stop-btn"),
    clearButton: () => document.querySelector("#clear-btn"),

    downloadLink: () =>
      document.querySelector(
        'a.download-link[href*=".mp4"], a.download-link[href*="gradio_api/file="]',
      ),

    outputVideo: () =>
      document.querySelector(
        'video[data-testid="🎥 Output-player"], video[src*=".mp4"], video[src*="gradio_api/file="]',
      ),

    progressText: () => document.querySelector(".progress-level-inner"),

    matchAudioCheckbox: () =>
      [
        ...document.querySelectorAll(
          'input[type="checkbox"][data-testid="checkbox"], input[type="checkbox"]',
        ),
      ]
        .filter((input) => !isInsideRunnerPanel(input))
        .find((input) =>
          (input.closest("label")?.innerText || "").includes(
            "Match video duration",
          ),
        ),
  };

  const exampleBasePrompt = `[VISUAL] A realistic woman talking directly to camera in a cozy mystical room, warm cinematic lighting, natural facial expression, subtle head movement.
[SPEECH] {{speech}}
[SOUND] Clear female voice, studio quality, natural pacing, clean microphone, no background noise.`;

  const exampleQueue = `CLIP 1 — "Leão... [sigh] você tem se colocado em último lugar, não tem?"
CLIP 2 — "[pause] Chega. [pause] O universo está dizendo isso agora — com força."
CLIP 3 — "Você vai sentir uma energia diferente nesta semana... [pause] mais leve, [pause] mais sua."`;

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);

    if (panel) {
      panel.style.display = "block";
      panel.scrollIntoView({ behavior: "smooth", block: "center" });
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
          width: 430px;
          max-height: calc(100vh - 36px);
          overflow: auto;
          background: #101114;
          color: #f4f4f5;
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 16px;
          box-shadow: 0 18px 70px rgba(0,0,0,.55);
          font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        #${PANEL_ID} * {
          box-sizing: border-box;
        }

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
          z-index: 1;
        }

        #${PANEL_ID} h2 {
          font-size: 15px;
          margin: 0;
        }

        #${PANEL_ID} .body {
          padding: 14px;
        }

        #${PANEL_ID} label {
          display: block;
          font-size: 12px;
          font-weight: 700;
          margin: 12px 0 6px;
          color: #d4d4d8;
        }

        #${PANEL_ID} textarea,
        #${PANEL_ID} input[type="number"],
        #${PANEL_ID} input[type="text"] {
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
          min-height: 92px;
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

        #${PANEL_ID} button.primary {
          background: #7c3aed;
        }

        #${PANEL_ID} button.danger {
          background: #dc2626;
        }

        #${PANEL_ID} button.good {
          background: #059669;
        }

        #${PANEL_ID} button:disabled {
          opacity: .45;
          cursor: not-allowed;
        }

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
          max-height: 180px;
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
      </style>

      <header>
        <h2>Gradio LTX Speech Runner</h2>
        <div class="row">
          <button id="glsr-minimize">Hide</button>
        </div>
      </header>

      <div class="body">
        <div class="small">
          Fixed <b>[VISUAL]</b> and <b>[SOUND]</b>.
          Only <b>[SPEECH]</b> changes.
          Audio is matched by queue index:
          prompt 1 → audio starting with <b>1.</b>,
          prompt 2 → audio starting with <b>2.</b>, etc.
          You can paste lines like <code>CLIP 1 — "speech here"</code>.
          The extension will use only the text inside quotes.
        </div>

        <label>1. Audio files</label>
        <input id="glsr-audio-files" type="file" accept="audio/*" multiple />
        <div id="glsr-file-count" class="pill">No audio files selected</div>

        <label>2. Base prompt template</label>
        <textarea id="glsr-base-prompt" rows="6" placeholder="[VISUAL] ...&#10;[SPEECH] {{speech}}&#10;[SOUND] ..."></textarea>
        <div class="small">Required placeholder: <code>{{speech}}</code></div>

        <label>3. Speech queue</label>
        <textarea id="glsr-queue" rows="8" placeholder='CLIP 1 — "First speech..."&#10;CLIP 2 — "Second speech..."&#10;CLIP 3 — "Third speech..."'></textarea>
        <div class="small">
          Accepted formats:
          <br />
          1. One speech per blank line.
          <br />
          2. <code>CLIP 1 — "speech here"</code> lines.
        </div>

        <div class="grid">
          <div>
            <label>Start index</label>
            <input id="glsr-start-index" type="number" min="1" step="1" value="1" />
          </div>
          <div>
            <label>Timeout minutes</label>
            <input id="glsr-timeout" type="number" min="5" step="1" value="45" />
          </div>
        </div>

        <label>Options</label>
        <div class="small">
          <label style="display:flex;align-items:center;gap:8px;margin:6px 0;font-weight:500;">
            <input id="glsr-auto-download" type="checkbox" checked />
            Auto-download each MP4
          </label>

          <label style="display:flex;align-items:center;gap:8px;margin:6px 0;font-weight:500;">
            <input id="glsr-match-audio" type="checkbox" checked />
            Keep Gradio “match audio duration” checked
          </label>

          <label style="display:flex;align-items:center;gap:8px;margin:6px 0;font-weight:500;">
            <input id="glsr-stop-on-error" type="checkbox" checked />
            Stop on first error
          </label>
        </div>

        <div class="row" style="margin-top:12px;">
          <button id="glsr-validate">Validate</button>
          <button id="glsr-start" class="primary">Start</button>
          <button id="glsr-pause">Pause</button>
          <button id="glsr-stop" class="danger">Stop</button>
          <button id="glsr-example">Example</button>
        </div>

        <div id="glsr-status" class="status">Idle.</div>
        <div id="glsr-log" class="log"></div>
      </div>
    `;

    document.documentElement.appendChild(panel);
    bindPanel(panel);
    loadSavedConfig();

    return panel;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function bindPanel(panel) {
    $("glsr-minimize").addEventListener("click", () => {
      panel.style.display = "none";
    });

    $("glsr-audio-files").addEventListener("change", (event) => {
      if (state.running) {
        log("Ignored extension audio picker change while running.");
        return;
      }

      state.selectedFiles.clear();

      for (const file of event.target.files || []) {
        state.selectedFiles.set(file.name, file);
      }

      updateFileCount();
      log(`Selected ${state.selectedFiles.size} audio file(s).`);
      logSelectedAudioMapping();
    });

    for (const id of [
      "glsr-base-prompt",
      "glsr-queue",
      "glsr-start-index",
      "glsr-timeout",
      "glsr-auto-download",
      "glsr-match-audio",
      "glsr-stop-on-error",
    ]) {
      $(id).addEventListener("input", saveConfig);
      $(id).addEventListener("change", saveConfig);
    }

    $("glsr-validate").addEventListener("click", () => {
      try {
        const config = getConfig();
        const items = parseQueue(config.queueText);

        validateConfig(config, items);

        setStatus(`Valid queue: ${items.length} item(s).`);
        log(`Validation passed: ${items.length} item(s).`);
        logParsedQueuePreview(items);
      } catch (error) {
        setStatus(`Validation error: ${error.message}`);
        log(`Validation error: ${error.message}`);
      }
    });

    $("glsr-start").addEventListener("click", () =>
      runQueue().catch((error) => {
        state.running = false;
        setStatus(`Stopped with error: ${error.message}`);
        log(`Fatal: ${error.stack || error.message}`);
      }),
    );

    $("glsr-pause").addEventListener("click", () => {
      state.paused = !state.paused;
      $("glsr-pause").textContent = state.paused ? "Resume" : "Pause";

      setStatus(
        state.paused
          ? "Paused. Click Resume to continue after the current wait step."
          : "Resuming...",
      );
    });

    $("glsr-stop").addEventListener("click", () => {
      state.stopped = true;
      state.paused = false;
      setStatus("Stopping after current step...");
    });

    $("glsr-example").addEventListener("click", loadExample);
  }

  function loadExample() {
    ensurePanel();
    $("glsr-base-prompt").value = exampleBasePrompt;
    $("glsr-queue").value = exampleQueue;
    saveConfig();
    setStatus("Example loaded. Select files named like 1.wav, 2.wav, 3.wav.");
  }

  async function saveConfig() {
    const config = getConfig(false);
    await chrome.storage.local.set({ [STORAGE_KEY]: config });
  }

  async function loadSavedConfig() {
    const saved = await chrome.storage.local.get(STORAGE_KEY);
    const config = saved[STORAGE_KEY];

    if (!config) return;

    $("glsr-base-prompt").value = config.basePrompt || "";
    $("glsr-queue").value = config.queueText || "";
    $("glsr-start-index").value = config.startIndex || 1;
    $("glsr-timeout").value = config.timeoutMinutes || 45;
    $("glsr-auto-download").checked = config.autoDownload !== false;
    $("glsr-match-audio").checked = config.matchAudio !== false;
    $("glsr-stop-on-error").checked = config.stopOnError !== false;
  }

  function getConfig(trim = true) {
    const val = (id) => (trim ? ($(id).value || "").trim() : $(id).value || "");

    return {
      basePrompt: val("glsr-base-prompt"),
      queueText: val("glsr-queue"),
      startIndex: Math.max(1, parseInt($("glsr-start-index").value || "1", 10)),
      timeoutMinutes: Math.max(
        5,
        parseInt($("glsr-timeout").value || "45", 10),
      ),
      autoDownload: $("glsr-auto-download").checked,
      matchAudio: $("glsr-match-audio").checked,
      stopOnError: $("glsr-stop-on-error").checked,
    };
  }

  function parseQueue(text) {
    const raw = (text || "").trim();

    if (!raw) return [];

    const nonEmptyLines = raw
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter(Boolean);

    const quotedItems = nonEmptyLines
      .map((line) => extractQuotedSpeech(line))
      .filter(Boolean);

    if (
      quotedItems.length >= 2 ||
      quotedItems.length === nonEmptyLines.length
    ) {
      return quotedItems.map((speech, index) => {
        if (!speech.trim()) {
          throw new Error(`Item ${index + 1} has empty speech text`);
        }

        return {
          index,
          speech: speech.trim(),
        };
      });
    }

    const blocks = raw
      .split(/\n\s*\n/g)
      .map((block) => block.trim())
      .filter(Boolean);

    return blocks.map((block, index) => {
      let speech = block;

      const quotedSpeech = extractQuotedSpeech(block);
      if (quotedSpeech) {
        speech = quotedSpeech;
      } else {
        const speechMatch = block.match(/^speech\s*:\s*([\s\S]+)$/im);

        if (speechMatch) {
          speech = speechMatch[1].trim();
        }
      }

      speech = speech
        .replace(/^audio\s*:\s*.+$/gim, "")
        .replace(/^speech\s*:\s*/im, "")
        .trim();

      if (!speech) {
        throw new Error(`Item ${index + 1} has empty speech text`);
      }

      return {
        index,
        speech,
      };
    });
  }

  function extractQuotedSpeech(text) {
    const value = String(text || "").trim();

    if (!value) return "";

    const quotePairs = [
      ['"', '"'],
      ["“", "”"],
      ["‘", "’"],
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

  function logParsedQueuePreview(items) {
    log("Parsed speech queue:");
    for (const item of items) {
      log(`  ${item.index + 1} → ${truncate(item.speech, 90)}`);
    }
  }

  function validateConfig(config, items) {
    if (!config.basePrompt.includes("{{speech}}")) {
      throw new Error("Base prompt must contain {{speech}}");
    }

    if (!items.length) {
      throw new Error("Queue is empty");
    }

    const missing = [];

    for (const item of items) {
      const number = item.index + 1;
      const file = findAudioFileForNumber(number);

      if (!file) {
        missing.push(`${number}.`);
      }
    }

    if (missing.length) {
      throw new Error(
        `Missing selected audio file(s) starting with: ${[
          ...new Set(missing),
        ].join(", ")}`,
      );
    }

    if (!selectors.promptBox()) {
      throw new Error("Could not find Gradio prompt textarea");
    }

    const block = selectors.audioBlock();

    if (!block) {
      throw new Error("Could not find Gradio audio block (#component-7)");
    }

    if (!selectors.generateButton()) {
      throw new Error("Could not find Gradio Generate button (#gen-btn)");
    }
  }

  function buildPrompt(basePrompt, speech) {
    return basePrompt.replaceAll("{{speech}}", speech);
  }

  function findAudioFileForNumber(number) {
    const files = [...state.selectedFiles.values()];

    const exactPrefixRegex = new RegExp(
      `^${escapeRegExp(String(number))}(?:[.\\s_-]|$)`,
      "i",
    );

    return files.find((file) => exactPrefixRegex.test(file.name)) || null;
  }

  async function runQueue() {
    ensurePanel();

    if (state.running) {
      setStatus("Already running.");
      return;
    }

    const config = getConfig();
    const items = parseQueue(config.queueText);

    validateConfig(config, items);
    await saveConfig();

    state.running = true;
    state.paused = false;
    state.stopped = false;
    state.currentIndex = config.startIndex - 1;

    $("glsr-pause").textContent = "Pause";

    log(`Starting from item ${state.currentIndex + 1}/${items.length}.`);
    logSelectedAudioMapping();
    logParsedQueuePreview(items);

    for (let i = state.currentIndex; i < items.length; i++) {
      state.currentIndex = i;

      if (state.stopped) break;

      await waitWhilePaused();

      const item = items[i];

      try {
        await runOneItem(item, i, items.length, config);
      } catch (error) {
        log(`Item ${i + 1} failed: ${error.message}`);
        setStatus(`Item ${i + 1} failed: ${error.message}`);

        if (config.stopOnError) break;
      }
    }

    state.running = false;
    state.paused = false;

    if (state.stopped) {
      setStatus("Stopped.");
      log("Stopped by user.");
    } else {
      setStatus("Done.");
      log("Queue finished.");
    }
  }

  async function runOneItem(item, zeroIndex, total, config) {
    const displayIndex = zeroIndex + 1;
    const audioFile = findAudioFileForNumber(displayIndex);

    if (!audioFile) {
      logSelectedAudioMapping();
      throw new Error(`Missing audio file starting with "${displayIndex}."`);
    }

    setStatus(`Item ${displayIndex}/${total}: preparing ${audioFile.name}`);

    log(
      `Item ${displayIndex}: speech=${truncate(
        item.speech,
        70,
      )} | audio=${audioFile.name}`,
    );

    const prompt = buildPrompt(config.basePrompt, item.speech);
    setPrompt(prompt);

    if (config.matchAudio) {
      setMatchAudioChecked(true);
    }

    await clearGradioAudioInput();
    await uploadAudioFile(audioFile);

    setStatus(`Item ${displayIndex}/${total}: waiting for audio to load...`);
    await waitForAudioToBeReady(audioFile.name, 45000);

    const oldHref = getCurrentOutputHref();
    const oldVideoSrc = selectors.outputVideo()?.src || "";

    await waitWhilePaused();

    setStatus(`Item ${displayIndex}/${total}: generating...`);
    await clickGenerateButton();

    const output = await waitForNewOutput({
      oldHref,
      oldVideoSrc,
      timeoutMs: config.timeoutMinutes * 60 * 1000,
    });

    setStatus(`Item ${displayIndex}/${total}: generated. Downloading...`);
    log(`New output: ${output.href}`);

    if (config.autoDownload) {
      const filename = makeFilename(displayIndex, audioFile.name);

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

    setStatus(`Item ${displayIndex}/${total}: complete.`);
    await sleep(1000);
  }

  function setPrompt(value) {
    const textarea = selectors.promptBox();

    if (!textarea) {
      throw new Error("Prompt textarea not found");
    }

    setNativeValue(textarea, value);
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

  async function clearGradioAudioInput() {
    const clearButton = selectors.audioClearButton();

    if (clearButton) {
      hardClick(clearButton);
      log("Clicked Gradio audio clear button inside #component-7.");
      await sleep(1600);
    } else {
      log("Gradio audio clear button not found inside #component-7.");
    }

    const input = await waitForGradioAudioInput(10000);

    if (!input) {
      log("Audio upload input did not reappear after clear.");
      return;
    }

    try {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      log("Audio input is ready for next upload.");
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

    if (input.id === "glsr-audio-files" || isInsideRunnerPanel(input)) {
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
        input.id !== "glsr-audio-files" &&
        !isInsideRunnerPanel(input)
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

  async function waitForNewOutput({ oldHref, oldVideoSrc, timeoutMs }) {
    const started = Date.now();
    let lastProgress = "";

    while (Date.now() - started < timeoutMs) {
      if (state.stopped) {
        throw new Error("Stopped by user");
      }

      await waitWhilePaused();

      const href = getCurrentOutputHref();
      const videoSrc = selectors.outputVideo()?.src || "";
      const progress = selectors.progressText()?.innerText?.trim() || "";

      if (progress && progress !== lastProgress) {
        lastProgress = progress;
        setStatus(`Generating...\n${progress}`);
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
      `Timed out after ${Math.round(
        timeoutMs / 60000,
      )} minutes waiting for new MP4`,
    );
  }

  function getCurrentOutputHref() {
    const link = selectors.downloadLink();

    if (link?.href) {
      return link.href;
    }

    const video = selectors.outputVideo();

    if (video?.src) {
      return video.src;
    }

    return "";
  }

  function makeFilename(index, audioName) {
    const base = audioName.replace(/\.[^.]+$/, "");

    return `gradio-ltx/${String(index).padStart(3, "0")}_${sanitizeFilename(
      base,
    )}.mp4`;
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

  async function waitWhilePaused() {
    while (state.paused && !state.stopped) {
      await sleep(500);
    }
  }

  function updateFileCount() {
    const count = state.selectedFiles.size;

    $("glsr-file-count").textContent = count
      ? `${count} audio file(s) selected`
      : "No audio files selected";
  }

  function logSelectedAudioMapping() {
    const files = [...state.selectedFiles.values()]
      .map((file) => file.name)
      .sort((a, b) => extractLeadingNumber(a) - extractLeadingNumber(b));

    if (!files.length) return;

    log("Selected audio files currently in memory:");

    for (const fileName of files) {
      const number = extractLeadingNumber(fileName);

      log(`  ${Number.isFinite(number) ? number : "?"} → ${fileName}`);
    }
  }

  function extractLeadingNumber(fileName) {
    const match = String(fileName || "").match(/^(\d+)(?:[.\s_-]|$)/);

    return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
  }

  function setStatus(text) {
    ensurePanel();
    $("glsr-status").textContent = text;
  }

  function log(text) {
    ensurePanel();

    const line = `[${new Date().toLocaleTimeString()}] ${text}`;

    state.logLines.push(line);
    state.logLines = state.logLines.slice(-280);

    $("glsr-log").textContent = state.logLines.join("\n");
  }

  function truncate(text, max) {
    text = String(text || "")
      .replace(/\s+/g, " ")
      .trim();

    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
