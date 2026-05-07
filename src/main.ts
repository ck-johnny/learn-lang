import {
  findLanguage,
  SUPPORTED_LANGUAGES,
  type LearningLanguage,
} from "./data/languages.js";
import { analyzeSentence, splitWords } from "./data/analysis.js";
import {
  loadSettings,
  saveSettings,
  type PersistedSettings,
} from "./data/storage.js";

type AppScreen = "input" | "reading" | "settings" | "cheat-sheet";

type ReadingLine = {
  id: string;
  text: string;
};

type CheatSheetItem = {
  text: string;
  translation: string;
  note?: string;
  speechText?: string;
};

type CheatSheetSection = {
  title: string;
  items: CheatSheetItem[];
};

type TranslationState =
  | { status: "loading" }
  | { status: "ready"; text: string }
  | { status: "error"; message: string };

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

const CHEAT_SHEET_SECTIONS: CheatSheetSection[] = [
  {
    title: "Weekdays",
    items: [
      { text: "Montag", translation: "Monday" },
      { text: "Dienstag", translation: "Tuesday" },
      { text: "Mittwoch", translation: "Wednesday" },
      { text: "Donnerstag", translation: "Thursday" },
      { text: "Freitag", translation: "Friday" },
      { text: "Samstag", translation: "Saturday" },
      { text: "Sonntag", translation: "Sunday" },
    ],
  },
  {
    title: "Alphabet",
    items: [
      ["A", "ah"],
      ["B", "beh"],
      ["C", "tseh"],
      ["D", "deh"],
      ["E", "eh"],
      ["F", "eff"],
      ["G", "geh"],
      ["H", "hah"],
      ["I", "ih"],
      ["J", "jott"],
      ["K", "kah"],
      ["L", "ell"],
      ["M", "emm"],
      ["N", "enn"],
      ["O", "oh"],
      ["P", "peh"],
      ["Q", "kuh"],
      ["R", "err"],
      ["S", "ess"],
      ["T", "teh"],
      ["U", "uh"],
      ["V", "fau"],
      ["W", "weh"],
      ["X", "iks"],
      ["Y", "üpsilon"],
      ["Z", "tsett"],
      ["Ä", "äh"],
      ["Ö", "öh"],
      ["Ü", "üh"],
      ["ß", "esszett"],
    ].map(([letter, speechText]) => ({
      text: letter,
      translation: speechText,
      note: "letter",
      speechText,
    })),
  },
  {
    title: "Numbers",
    items: [
      { text: "null", translation: "0" },
      { text: "eins", translation: "1" },
      { text: "zwei", translation: "2" },
      { text: "drei", translation: "3" },
      { text: "vier", translation: "4" },
      { text: "fünf", translation: "5" },
      { text: "sechs", translation: "6" },
      { text: "sieben", translation: "7" },
      { text: "acht", translation: "8" },
      { text: "neun", translation: "9" },
      { text: "zehn", translation: "10" },
      { text: "elf", translation: "11" },
      { text: "zwölf", translation: "12" },
      { text: "zwanzig", translation: "20" },
      { text: "hundert", translation: "100" },
    ],
  },
  {
    title: "Pronouns",
    items: [
      { text: "ich", translation: "I", note: "singular" },
      { text: "du", translation: "you", note: "singular, informal" },
      { text: "er", translation: "he", note: "masculine" },
      { text: "sie", translation: "she / they", note: "feminine or plural" },
      { text: "es", translation: "it", note: "neuter" },
      { text: "wir", translation: "we", note: "plural" },
      { text: "ihr", translation: "you all", note: "plural, informal" },
      { text: "Sie", translation: "you", note: "formal" },
    ],
  },
  {
    title: "Useful Phrases",
    items: [
      { text: "Guten Morgen", translation: "Good morning" },
      { text: "Guten Tag", translation: "Good day" },
      { text: "Guten Abend", translation: "Good evening" },
      { text: "Danke", translation: "Thank you" },
      { text: "Bitte", translation: "Please / you're welcome" },
      { text: "Entschuldigung", translation: "Excuse me / sorry" },
      { text: "Ich lerne Deutsch", translation: "I am learning German" },
      { text: "Wie geht es dir?", translation: "How are you?" },
    ],
  },
];

let settings: PersistedSettings = loadSettings();
let screen: AppScreen = "input";
let isSpeedDialogOpen = false;
const expandedLineIds = new Set<string>();
const translationCache = new Map<string, TranslationState>();
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
  applyTheme();

  if (shouldRender) {
    render();
  }
}

function applyTheme(): void {
  document.documentElement.dataset.theme = settings.theme;
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
  const speechLang = language.speechLang.toLowerCase();
  const languagePrefix = language.speechLang.split("-")[0]?.toLowerCase();
  const candidates = speechState.voices.filter((voice) =>
    voice.lang.toLowerCase() === speechLang ||
    voice.lang.toLowerCase().startsWith(`${languagePrefix}-`),
  );

  return (
    candidates.find((voice) => voice.lang.toLowerCase() === speechLang && voice.localService) ??
    candidates.find((voice) => voice.lang.toLowerCase() === speechLang && voice.default) ??
    candidates.find((voice) => voice.lang.toLowerCase() === speechLang) ??
    candidates.find((voice) => voice.localService) ??
    candidates.find((voice) => voice.default) ??
    candidates[0]
  );
}

function speakText(text: string, id: string, language: LearningLanguage): void {
  if (speechState.supportStatus === "unsupported" || !text.trim()) {
    return;
  }

  if (speechState.voices.length === 0) {
    speechState.voices = window.speechSynthesis.getVoices();
  }

  const voice = findVoice(language);
  if (speechState.voices.length > 0 && !voice) {
    render();
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language.speechLang;
  utterance.rate = settings.speed;
  utterance.voice = voice ?? null;
  utterance.onstart = () => {
    speechState.speakingId = id;
    render();
  };
  utterance.onend = () => {
    if (speechState.speakingId === id) {
      speechState.speakingId = null;
      render();
    }
  };
  utterance.onerror = utterance.onend;

  speechState.speakingId = id;
  window.speechSynthesis.speak(utterance);
  render();
}

function speakLine(line: ReadingLine, language: LearningLanguage): void {
  speakText(line.text, line.id, language);
}

function speakWord(word: string, line: ReadingLine, language: LearningLanguage): void {
  speakText(word, `${line.id}-word-${word}`, language);
}

function getTranslationCacheKey(text: string, language: LearningLanguage): string {
  return `${language.id}:en:${text}`;
}

function parseGoogleTranslationPayload(payload: unknown): string | null {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    return null;
  }

  const translatedChunks = payload[0]
    .map((chunk) =>
      Array.isArray(chunk) && typeof chunk[0] === "string" ? chunk[0] : "",
    )
    .join("")
    .trim();

  return translatedChunks || null;
}

function requestSentenceTranslation(text: string, language: LearningLanguage): void {
  const cacheKey = getTranslationCacheKey(text, language);

  if (translationCache.has(cacheKey)) {
    return;
  }

  translationCache.set(cacheKey, { status: "loading" });

  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", language.id);
  url.searchParams.set("tl", "en");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Translation failed with ${response.status}`);
      }

      return response.json() as Promise<unknown>;
    })
    .then((payload) => {
      const translatedText = parseGoogleTranslationPayload(payload);

      if (!translatedText) {
        throw new Error("Translation response was empty");
      }

      translationCache.set(cacheKey, {
        status: "ready",
        text: translatedText,
      });
      render();
    })
    .catch((error: unknown) => {
      translationCache.set(cacheKey, {
        status: "error",
        message: error instanceof Error ? error.message : "Translation failed",
      });
      render();
    });
}

function getTtsMessage(language: LearningLanguage): string | null {
  if (speechState.supportStatus === "unsupported") {
    return "Text-to-speech is not supported in this browser. Try Chrome, Edge, or Safari with system voices enabled.";
  }

  if (speechState.voices.length === 0) {
    return null;
  }

  if (!findVoice(language)) {
    return `No ${language.label} voice was found. Install or enable a ${language.label} voice in your browser or system settings before playing lines.`;
  }

  return null;
}

function renderInputScreen(language: LearningLanguage): HTMLElement {
  const main = createElement("main", { className: "screen input-screen" });
  const topBar = createElement("header", { className: "top-bar" });
  const topActions = createElement("div", { className: "top-actions" });
  topActions.append(renderSettingsNavButton());
  topBar.append(
    createElement("strong", { className: "app-title", text: "Lang Learn" }),
    topActions,
  );

  const panel = createElement("section", {
    className: "panel",
    attributes: { "aria-label": "Paragraph editor" },
  });
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

  panel.append(paragraphLabel, actions);
  main.append(topBar, panel);
  return main;
}

function renderCheatSheetNavButton(): HTMLButtonElement {
  const button = createElement("button", {
    className: "secondary-button compact-button",
    text: "Cheat",
    attributes: { "aria-label": "Open cheat sheet" },
  });
  button.type = "button";
  button.addEventListener("click", () => {
    stopSpeech();
    screen = "cheat-sheet";
    render();
  });
  return button;
}

function renderSettingsNavButton(): HTMLButtonElement {
  const button = createElement("button", {
    className: "icon-button",
    text: "⚙",
    attributes: { "aria-label": "Open settings" },
  });
  button.type = "button";
  button.addEventListener("click", () => {
    stopSpeech();
    screen = "settings";
    render();
  });
  return button;
}

function renderReadingScreen(
  language: LearningLanguage,
  lines: ReadingLine[],
): HTMLElement {
  const main = createElement("main", { className: "screen reading-screen" });
  const header = createElement("header", { className: "reading-header" });
  const editButton = createElement("button", {
    className: "secondary-button",
    text: "Edit",
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
  header.append(editButton, titleGroup, stopButton, renderSettingsNavButton());
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
    const isExpanded = expandedLineIds.has(line.id);
    const lineCard = createElement("article", {
      className: `line-card ${isExpanded ? "expanded" : ""}`,
    });
    const lineActions = createElement("div", { className: "line-actions" });
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
    const expandButton = createElement("button", {
      className: "expand-button",
      text: isExpanded ? "−" : "+",
      attributes: {
        "aria-expanded": String(isExpanded),
        "aria-label": `${isExpanded ? "Hide" : "Show"} translation for line ${index + 1}`,
        title: isExpanded ? "Hide translation" : "Show translation",
      },
    });
    expandButton.type = "button";
    expandButton.addEventListener("click", () => {
      if (isExpanded) {
        expandedLineIds.delete(line.id);
      } else {
        expandedLineIds.add(line.id);
      }
      render();
    });

    lineActions.append(lineButton, expandButton);
    lineCard.append(lineActions);

    if (isExpanded) {
      lineCard.append(renderLineAnalysis(line, language));
    }

    lineList.append(lineCard);
  });
  main.append(lineList);

  return main;
}

function renderLineAnalysis(
  line: ReadingLine,
  language: LearningLanguage,
): HTMLElement {
  const analysis = analyzeSentence(line.text, language);
  const cacheKey = getTranslationCacheKey(line.text, language);
  const translation = translationCache.get(cacheKey);
  requestSentenceTranslation(line.text, language);
  const panel = createElement("section", {
    className: "analysis-panel",
    attributes: { "aria-label": "Translation and word analysis" },
  });

  const sentenceBlock = createElement("div", { className: "sentence-translation" });
  const sentenceTranslation =
    translation?.status === "ready"
      ? translation.text
      : translation?.status === "loading"
        ? "Translating..."
        : analysis.sentenceTranslation;
  sentenceBlock.append(
    createElement("span", { className: "analysis-label", text: "Sentence" }),
    createElement("p", { text: sentenceTranslation }),
  );
  if (translation?.status === "error") {
    sentenceBlock.append(
      createElement("small", {
        text: `Live translation unavailable. Showing offline fallback. ${translation.message}`,
      }),
    );
  } else if (translation?.status === "ready") {
    sentenceBlock.append(
      createElement("small", {
        text: "Translated online. Word notes below use the offline grammar glossary.",
      }),
    );
  } else if (analysis.note) {
    sentenceBlock.append(createElement("small", { text: analysis.note }));
  }

  const wordControls = createElement("div", { className: "word-play-list" });
  splitWords(line.text).forEach((word) => {
    const wordButton = createElement("button", {
      className: `word-play-button ${
        speechState.speakingId === `${line.id}-word-${word}` ? "speaking" : ""
      }`,
      text: word,
    });
    wordButton.type = "button";
    wordButton.addEventListener("click", () => speakWord(word, line, language));
    wordControls.append(wordButton);
  });

  const wordGrid = createElement("div", { className: "word-analysis-grid" });
  analysis.words.forEach((word) => {
    const wordCard = createElement("article", { className: "word-card" });
    const meta = [word.partOfSpeech, word.lemma ? `lemma: ${word.lemma}` : ""]
      .filter(Boolean)
      .join(" · ");
    wordCard.append(
      createElement("strong", { text: word.token }),
      createElement("span", {
        className: "word-translation",
        text: word.translation,
      }),
    );
    if (meta) {
      wordCard.append(createElement("span", { className: "word-meta", text: meta }));
    }
    const detailList = createElement("ul", { className: "grammar-list" });
    word.details.forEach((detail) => {
      detailList.append(createElement("li", { text: detail }));
    });
    wordCard.append(detailList);
    wordGrid.append(wordCard);
  });

  panel.append(sentenceBlock, wordControls, wordGrid);
  return panel;
}

function renderSettingsScreen(language: LearningLanguage): HTMLElement {
  const main = createElement("main", { className: "screen settings-screen" });
  const header = createElement("header", { className: "settings-header" });
  const backButton = createElement("button", {
    className: "secondary-button",
    text: "Done",
  });
  backButton.type = "button";
  backButton.addEventListener("click", () => {
    screen = "input";
    render();
  });
  header.append(
    createElement("div", { className: "app-title", text: "Settings" }),
    backButton,
  );

  const panel = createElement("section", {
    className: "panel settings-panel",
    attributes: { "aria-label": "Settings" },
  });

  const languageLabel = createElement("label", {
    className: "field-label",
    text: "Reading language",
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

  const themeRow = createElement("label", { className: "switch-row" });
  const themeText = createElement("span");
  themeText.append(
    createElement("strong", { text: "Dark mode" }),
    createElement("span", {
      className: "setting-hint",
      text: settings.theme === "dark" ? "On" : "Off",
    }),
  );
  const themeToggle = createElement("input", {
    attributes: { type: "checkbox", "aria-label": "Toggle dark mode" },
  });
  themeToggle.checked = settings.theme === "dark";
  themeToggle.addEventListener("change", () => {
    updateSettings({
      ...settings,
      theme: themeToggle.checked ? "dark" : "light",
    });
  });
  themeRow.append(themeText, themeToggle);

  panel.append(languageLabel, themeRow);
  main.append(header, panel);
  return main;
}

function renderCheatSheetScreen(language: LearningLanguage): HTMLElement {
  const main = createElement("main", { className: "screen cheat-sheet-screen" });
  const header = createElement("header", { className: "settings-header" });
  const backButton = createElement("button", {
    className: "secondary-button",
    text: "Done",
  });
  backButton.type = "button";
  backButton.addEventListener("click", () => {
    stopSpeech();
    screen = "input";
    render();
  });
  header.append(
    createElement("div", { className: "app-title", text: "Cheat Sheet" }),
    backButton,
  );

  const sections = createElement("section", {
    className: "cheat-section-list",
    attributes: { "aria-label": "Language cheat sheet" },
  });
  CHEAT_SHEET_SECTIONS.forEach((section) => {
    const sectionElement = createElement("section", { className: "cheat-section" });
    sectionElement.append(createElement("h2", { text: section.title }));

    const itemGrid = createElement("div", { className: "cheat-grid" });
    section.items.forEach((item) => {
      const itemId = `cheat-${section.title}-${item.text}`;
      const itemButton = createElement("button", {
        className: `cheat-item ${
          speechState.speakingId === itemId ? "speaking" : ""
        }`,
      });
      itemButton.type = "button";
      itemButton.addEventListener("click", () =>
        speakText(item.speechText ?? item.text, itemId, language),
      );
      itemButton.append(
        createElement("strong", { text: item.text }),
        createElement("span", { text: item.translation }),
      );
      if (item.note) {
        itemButton.append(createElement("small", { text: item.note }));
      }
      itemGrid.append(itemButton);
    });

    sectionElement.append(itemGrid);
    sections.append(sectionElement);
  });

  main.append(header, sections);
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

function renderGlobalControls(): HTMLElement {
  const controls = createElement("nav", {
    className: "global-controls",
    attributes: { "aria-label": "Global app controls" },
  });
  controls.append(renderCheatSheetNavButton(), renderSpeedButton());
  return controls;
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
    screen === "settings"
      ? renderSettingsScreen(language)
      : screen === "cheat-sheet"
        ? renderCheatSheetScreen(language)
      : screen === "input"
        ? renderInputScreen(language)
        : renderReadingScreen(language, lines),
  );

  const dialog = renderSpeedDialog();
  if (dialog) {
    appRoot.append(dialog);
  }

  appRoot.append(renderGlobalControls());
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
    navigator.serviceWorker.register(new URL("./sw.js", import.meta.url));
  });
}

applyTheme();
render();
