import {
  findLanguage,
  SUPPORTED_LANGUAGES,
  type LearningLanguage,
} from "./data/languages.js";
import {
  loadSettings,
  saveSettings,
  type PersistedSettings,
} from "./data/storage.js";

type AppScreen = "input" | "reading";

type ReadingLine = {
  id: string;
  text: string;
};

type SpeechState = {
  supportStatus: "supported" | "unsupported";
  voices: SpeechSynthesisVoice[];
  speakingId: string | null;
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found.");
}

const appRoot = app;

let settings: PersistedSettings = loadSettings();
let screen: AppScreen = "input";
let isSpeedDialogOpen = false;
const speechState: SpeechState = {
  supportStatus: "speechSynthesis" in window ? "supported" : "unsupported",
  voices: [],
  speakingId: null,
};

function clampSpeed(speed: number): number {
  return Math.min(2, Math.max(0.5, speed));
}

function updateSettings(
  nextSettings: PersistedSettings,
  shouldRender = true,
): void {
  settings = nextSettings;
  saveSettings(settings);

  if (shouldRender) {
    render();
  }
}

function paragraphToLines(paragraph: string): ReadingLine[] {
  return paragraph
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text, index) => ({ id: `${index}-${text}`, text }));
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options: {
    className?: string;
    text?: string;
    attributes?: Record<string, string>;
  } = {},
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);

  if (options.className) {
    element.className = options.className;
  }

  if (options.text !== undefined) {
    element.textContent = options.text;
  }

  Object.entries(options.attributes ?? {}).forEach(([name, value]) =>
    element.setAttribute(name, value),
  );

  return element;
}

function stopSpeech(): void {
  if (speechState.supportStatus === "unsupported") {
    return;
  }

  window.speechSynthesis.cancel();
  speechState.speakingId = null;
  render();
}

function findVoice(
  language: LearningLanguage,
): SpeechSynthesisVoice | undefined {
  const exactMatch = speechState.voices.find(
    (voice) => voice.lang.toLowerCase() === language.speechLang.toLowerCase(),
  );

  if (exactMatch) {
    return exactMatch;
  }

  const languagePrefix = language.speechLang.split("-")[0]?.toLowerCase();
  return speechState.voices.find((voice) =>
    voice.lang.toLowerCase().startsWith(`${languagePrefix}-`),
  );
}

function speakLine(line: ReadingLine, language: LearningLanguage): void {
  if (speechState.supportStatus === "unsupported" || !line.text.trim()) {
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(line.text);
  utterance.lang = language.speechLang;
  utterance.rate = settings.speed;
  utterance.voice = findVoice(language) ?? null;
  utterance.onstart = () => {
    speechState.speakingId = line.id;
    render();
  };
  utterance.onend = () => {
    if (speechState.speakingId === line.id) {
      speechState.speakingId = null;
      render();
    }
  };
  utterance.onerror = utterance.onend;

  speechState.speakingId = line.id;
  window.speechSynthesis.speak(utterance);
  render();
}

function getTtsMessage(language: LearningLanguage): string | null {
  if (speechState.supportStatus === "unsupported") {
    return "Text-to-speech is not supported in this browser. Try Chrome, Edge, or Safari with system voices enabled.";
  }

  if (speechState.voices.length === 0) {
    return null;
  }

  if (!findVoice(language)) {
    return `No ${language.label} voice was found. The browser may use its default voice until you install or enable ${language.label} voices in your system settings.`;
  }

  return null;
}

function renderInputScreen(language: LearningLanguage): HTMLElement {
  const main = createElement("main", { className: "screen input-screen" });
  const hero = createElement("section", { className: "hero-card" });
  hero.append(
    createElement("p", { className: "eyebrow", text: "Listen line by line" }),
    createElement("h1", { text: "Lang Learn" }),
    createElement("p", {
      className: "hero-copy",
      text: `Paste a ${language.label.toLowerCase()} paragraph, split it with new lines, then tap any line to hear it spoken aloud.`,
    }),
  );

  const panel = createElement("section", {
    className: "panel",
    attributes: { "aria-label": "Paragraph editor" },
  });
  const languageLabel = createElement("label", {
    className: "field-label",
    text: "Language",
  });
  const select = createElement("select", {
    className: "select",
    attributes: { id: "language-selector" },
  });
  SUPPORTED_LANGUAGES.forEach((supportedLanguage) => {
    const option = createElement("option", {
      text: `${supportedLanguage.label} · ${supportedLanguage.nativeLabel}`,
      attributes: { value: supportedLanguage.id },
    });
    option.selected = supportedLanguage.id === language.id;
    select.append(option);
  });
  select.addEventListener("change", () =>
    updateSettings({ ...settings, languageId: select.value }),
  );
  languageLabel.append(select);

  const paragraphLabel = createElement("label", {
    className: "field-label",
    text: "Paragraph",
  });
  const textarea = createElement("textarea", {
    className: "paragraph-input",
    attributes: {
      id: "paragraph-input",
      placeholder: language.placeholder,
      rows: "10",
    },
  });
  textarea.value = settings.paragraph;
  textarea.addEventListener("input", () => {
    updateSettings({ ...settings, paragraph: textarea.value }, false);
    const currentLines = paragraphToLines(textarea.value);
    lineCountElement.textContent =
      currentLines.length === 0
        ? "No reading lines yet"
        : `${currentLines.length} reading ${currentLines.length === 1 ? "line" : "lines"}`;
    startButton.disabled = currentLines.length === 0;
  });
  paragraphLabel.append(textarea);

  const lines = paragraphToLines(settings.paragraph);
  const actions = createElement("div", { className: "input-actions" });
  const lineCountElement = createElement("p", {
    className: "line-count",
    text:
      lines.length === 0
        ? "No reading lines yet"
        : `${lines.length} reading ${lines.length === 1 ? "line" : "lines"}`,
  });
  const startButton = createElement("button", {
    className: "primary-button",
    text: "Start reading",
  });
  startButton.type = "button";
  startButton.disabled = lines.length === 0;
  startButton.addEventListener("click", () => {
    screen = "reading";
    render();
  });
  actions.append(lineCountElement, startButton);

  panel.append(languageLabel, paragraphLabel, actions);
  main.append(hero, panel);
  return main;
}

function renderReadingScreen(
  language: LearningLanguage,
  lines: ReadingLine[],
): HTMLElement {
  const main = createElement("main", { className: "screen reading-screen" });
  const header = createElement("header", { className: "reading-header" });
  const editButton = createElement("button", {
    className: "secondary-button",
    text: "← Edit",
  });
  editButton.type = "button";
  editButton.addEventListener("click", () => {
    stopSpeech();
    screen = "input";
    render();
  });

  const titleGroup = createElement("div");
  titleGroup.append(
    createElement("p", { className: "eyebrow", text: language.label }),
    createElement("h1", { text: "Tap a line" }),
  );

  const stopButton = createElement("button", {
    className: "secondary-button",
    text: "Stop",
  });
  stopButton.type = "button";
  stopButton.disabled = !speechState.speakingId;
  stopButton.addEventListener("click", stopSpeech);
  header.append(editButton, titleGroup, stopButton);
  main.append(header);

  const ttsMessage = getTtsMessage(language);
  if (ttsMessage) {
    main.append(
      createElement("aside", { className: "notice", text: ttsMessage }),
    );
  }

  const lineList = createElement("section", {
    className: "line-list",
    attributes: { "aria-label": "Reading lines" },
  });
  lines.forEach((line, index) => {
    const isSpeaking = speechState.speakingId === line.id;
    const lineButton = createElement("button", {
      className: `reading-line ${isSpeaking ? "speaking" : ""}`,
      attributes: { "aria-pressed": String(isSpeaking) },
    });
    lineButton.type = "button";
    lineButton.append(
      createElement("span", {
        className: "line-number",
        text: String(index + 1),
      }),
      createElement("span", { className: "line-text", text: line.text }),
      createElement("span", {
        className: "speak-indicator",
        text: isSpeaking ? "Speaking" : "Tap",
      }),
    );
    lineButton.addEventListener("click", () => speakLine(line, language));
    lineList.append(lineButton);
  });
  main.append(lineList, renderSpeedButton());

  return main;
}

function renderSpeedButton(): HTMLButtonElement {
  const button = createElement("button", {
    className: "speed-fab",
    attributes: { "aria-label": "Open playback speed settings" },
  });
  button.type = "button";
  button.innerHTML = `<span aria-hidden="true">⚙︎</span><strong>${settings.speed.toFixed(2).replace(/\.00$/, "")}×</strong>`;
  button.addEventListener("click", () => {
    isSpeedDialogOpen = true;
    render();
  });
  return button;
}

function renderSpeedDialog(): HTMLElement | null {
  if (!isSpeedDialogOpen) {
    return null;
  }

  const backdrop = createElement("div", {
    className: "dialog-backdrop",
    attributes: { role: "presentation" },
  });
  const dialog = createElement("section", {
    className: "speed-dialog",
    attributes: {
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "speed-dialog-title",
    },
  });
  const header = createElement("div", { className: "dialog-header" });
  const titleGroup = createElement("div");
  titleGroup.append(
    createElement("p", { className: "eyebrow", text: "Playback" }),
    createElement("h2", {
      text: "Speed",
      attributes: { id: "speed-dialog-title" },
    }),
  );
  const closeButton = createElement("button", {
    className: "icon-button",
    text: "×",
    attributes: { "aria-label": "Close speed settings" },
  });
  closeButton.type = "button";
  closeButton.addEventListener("click", () => {
    isSpeedDialogOpen = false;
    render();
  });
  header.append(titleGroup, closeButton);

  const rangeLabel = createElement("label", { className: "range-label" });
  const rangeValue = createElement("span", {
    text: `${settings.speed.toFixed(2).replace(/\.00$/, "")}×`,
  });
  const range = createElement("input", {
    attributes: {
      id: "speed-range",
      type: "range",
      min: "0.5",
      max: "2",
      step: "0.25",
    },
  });
  range.value = String(settings.speed);
  range.addEventListener("input", () => {
    const nextSpeed = clampSpeed(Number(range.value));
    updateSettings({ ...settings, speed: nextSpeed }, false);
    rangeValue.textContent = `${nextSpeed.toFixed(2).replace(/\.00$/, "")}×`;
  });
  rangeLabel.append(rangeValue, range);

  const ticks = createElement("div", {
    className: "range-ticks",
    attributes: { "aria-hidden": "true" },
  });
  ticks.append(
    createElement("span", { text: "0.5×" }),
    createElement("span", { text: "1×" }),
    createElement("span", { text: "2×" }),
  );

  dialog.append(header, rangeLabel, ticks);
  dialog.addEventListener("mousedown", (event) => event.stopPropagation());
  backdrop.addEventListener("mousedown", () => {
    isSpeedDialogOpen = false;
    render();
  });
  backdrop.append(dialog);
  return backdrop;
}

function render(): void {
  const language = findLanguage(settings.languageId);
  const lines = paragraphToLines(settings.paragraph);

  appRoot.replaceChildren(
    screen === "input"
      ? renderInputScreen(language)
      : renderReadingScreen(language, lines),
  );

  const dialog = renderSpeedDialog();
  if (dialog) {
    appRoot.append(dialog);
  }
}

function loadVoices(): void {
  if (speechState.supportStatus === "unsupported") {
    return;
  }

  speechState.voices = window.speechSynthesis.getVoices();
  render();
}

if (speechState.supportStatus === "supported") {
  loadVoices();
  window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
  window.addEventListener("pagehide", () => window.speechSynthesis.cancel());
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}

render();
