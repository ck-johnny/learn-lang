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

type AppScreen = "input" | "reading" | "settings" | "cheat-sheet" | "help";

type ReadingLine = {
  id: string;
  text: string;
};

type CheatSheetItem = {
  text: string;
  translation: string;
  note?: string;
  speechText?: string;
  kind?: "letter";
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
      kind: "letter",
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
let isTopBarOpen = false;
let speechDelayId: number | null = null;
let editingLineId: string | null = null;
let draggedLineId: string | null = null;
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

function persistLines(lines: ReadingLine[]): void {
  updateSettings({
    ...settings,
    paragraph: lines.map((line) => line.text).join("\n"),
  });
}

function updateLineText(lineId: string, text: string): void {
  const nextText = text.trim();
  const lines = paragraphToLines(settings.paragraph)
    .map((line) => (line.id === lineId ? { ...line, text: nextText } : line))
    .filter((line) => line.text);
  editingLineId = null;
  persistLines(lines);
}

function appendLine(text: string): void {
  const nextText = text.trim();

  if (!nextText) {
    return;
  }

  persistLines([
    ...paragraphToLines(settings.paragraph),
    { id: `new-${Date.now()}`, text: nextText },
  ]);
}

function reorderLines(sourceId: string, targetId: string): void {
  if (sourceId === targetId) {
    return;
  }

  const lines = paragraphToLines(settings.paragraph);
  const sourceIndex = lines.findIndex((line) => line.id === sourceId);
  const targetIndex = lines.findIndex((line) => line.id === targetId);

  if (sourceIndex === -1 || targetIndex === -1) {
    return;
  }

  const [sourceLine] = lines.splice(sourceIndex, 1);
  lines.splice(targetIndex, 0, sourceLine);
  persistLines(lines);
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

  if (speechDelayId !== null) {
    window.clearTimeout(speechDelayId);
    speechDelayId = null;
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

function speakText(
  text: string,
  id: string,
  language: LearningLanguage,
  rateOverride?: number,
): void {
  if (speechState.supportStatus === "unsupported" || !text.trim()) {
    return;
  }

  if (speechDelayId !== null) {
    window.clearTimeout(speechDelayId);
    speechDelayId = null;
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
  utterance.rate = rateOverride ?? settings.speed;
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

function speakTextRepeated(
  text: string,
  id: string,
  language: LearningLanguage,
): void {
  if (speechState.supportStatus === "unsupported" || !text.trim()) {
    return;
  }

  if (speechDelayId !== null) {
    window.clearTimeout(speechDelayId);
    speechDelayId = null;
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
  speechState.speakingId = id;

  const queue = [text, text, text];
  const speakNext = (): void => {
    const nextText = queue.shift();

    if (!nextText || speechState.speakingId !== id) {
      speechState.speakingId = null;
      render();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(nextText);
    utterance.lang = language.speechLang;
    utterance.rate = 0.55;
    utterance.voice = voice ?? null;
    utterance.onend = () => {
      speechDelayId = window.setTimeout(speakNext, 420);
    };
    utterance.onerror = () => {
      speechState.speakingId = null;
      render();
    };
    window.speechSynthesis.speak(utterance);
    render();
  };

  speakNext();
}

function speakCheatSheetItem(
  item: CheatSheetItem,
  id: string,
  language: LearningLanguage,
): void {
  const text = item.speechText ?? item.text;

  if (item.kind !== "letter") {
    speakText(text, id, language);
    return;
  }

  if (settings.letterPlaybackMode === "repeat") {
    speakTextRepeated(text, id, language);
    return;
  }

  if (settings.letterPlaybackMode === "extra-slow") {
    speakText(text, id, language, 0.35);
    return;
  }

  speakText(`${text}...`, id, language, Math.min(settings.speed, 0.65));
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
  return renderSentenceListScreen(language, paragraphToLines(settings.paragraph));
}

function goToScreen(nextScreen: AppScreen): void {
  stopSpeech();
  screen = nextScreen;
  isTopBarOpen = false;
  render();
}

function renderCheatSheetNavButton(): HTMLButtonElement {
  const button = createElement("button", {
    className: "secondary-button compact-button",
    text: "Cheat",
    attributes: { "aria-label": "Open cheat sheet" },
  });
  button.type = "button";
  button.addEventListener("click", () => goToScreen("cheat-sheet"));
  return button;
}

function renderSettingsNavButton(): HTMLButtonElement {
  const button = createElement("button", {
    className: "icon-button",
    text: "⚙",
    attributes: { "aria-label": "Open settings" },
  });
  button.type = "button";
  button.addEventListener("click", () => goToScreen("settings"));
  return button;
}

function renderReadingScreen(
  language: LearningLanguage,
  lines: ReadingLine[],
): HTMLElement {
  return renderSentenceListScreen(language, lines);
}

function renderSentenceListScreen(
  language: LearningLanguage,
  lines: ReadingLine[],
): HTMLElement {
  const main = createElement("main", { className: "screen reading-screen" });
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
      attributes: { draggable: editingLineId === line.id ? "false" : "true" },
    });
    lineCard.style.setProperty("--row-accent", getRowAccent(index));
    lineCard.addEventListener("dragstart", (event) => {
      draggedLineId = line.id;
      event.dataTransfer?.setData("text/plain", line.id);
      lineCard.classList.add("dragging");
    });
    lineCard.addEventListener("dragend", () => {
      draggedLineId = null;
      lineCard.classList.remove("dragging");
    });
    lineCard.addEventListener("dragover", (event) => {
      event.preventDefault();
      lineCard.classList.add("drag-over");
    });
    lineCard.addEventListener("dragleave", () => {
      lineCard.classList.remove("drag-over");
    });
    lineCard.addEventListener("drop", (event) => {
      event.preventDefault();
      lineCard.classList.remove("drag-over");
      const sourceId = event.dataTransfer?.getData("text/plain") || draggedLineId;
      if (sourceId) {
        reorderLines(sourceId, line.id);
      }
    });
    const lineActions = createElement("div", { className: "line-actions" });
    const editLineButton = createElement("button", {
      className: "line-edit-button",
      text: "✎",
      attributes: {
        "aria-label": `Edit paragraph from line ${index + 1}`,
        title: "Edit text",
      },
    });
    editLineButton.type = "button";
    editLineButton.addEventListener("click", () => {
      editingLineId = line.id;
      render();
    });

    const lineBody =
      editingLineId === line.id
        ? renderLineEditInput(line)
        : renderPlayableLine(line, language, isSpeaking);
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

    lineActions.append(editLineButton, lineBody, expandButton);
    lineCard.append(lineActions);

    if (isExpanded) {
      lineCard.append(renderLineAnalysis(line, language));
    }

    lineList.append(lineCard);
  });
  lineList.append(renderAddLineForm(language));
  main.append(lineList);

  return main;
}

function getRowAccent(index: number): string {
  const colors = ["#315cfd", "#0f9f8f", "#cf6d17", "#8f56d9", "#d83f87", "#2878a8", "#6d8d18"];
  return colors[index % colors.length];
}

function renderPlayableLine(
  line: ReadingLine,
  language: LearningLanguage,
  isSpeaking: boolean,
): HTMLButtonElement {
  const lineButton = createElement("button", {
    className: `reading-line ${isSpeaking ? "speaking" : ""}`,
    attributes: { "aria-pressed": String(isSpeaking) },
  });
  lineButton.type = "button";
  lineButton.append(
    createElement("span", { className: "play-icon", text: "▶" }),
    createElement("span", { className: "line-text", text: line.text }),
  );
  lineButton.addEventListener("click", () => speakLine(line, language));
  return lineButton;
}

function renderLineEditInput(line: ReadingLine): HTMLInputElement {
  const input = createElement("input", {
    className: "line-edit-input",
    attributes: {
      "aria-label": "Edit sentence",
      value: line.text,
    },
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      updateLineText(line.id, input.value);
    }

    if (event.key === "Escape") {
      editingLineId = null;
      render();
    }
  });
  input.addEventListener("blur", () => updateLineText(line.id, input.value));
  window.setTimeout(() => input.focus(), 0);
  return input;
}

function renderAddLineForm(language: LearningLanguage): HTMLElement {
  const form = createElement("form", { className: "add-line-form" });
  const input = createElement("input", {
    className: "add-line-input",
    attributes: {
      "aria-label": "Add sentence",
      placeholder: language.placeholder.split("\n")[0] ?? "Add a sentence",
    },
  });
  const button = createElement("button", {
    className: "primary-button add-line-button",
    text: "+",
    attributes: { "aria-label": "Add sentence" },
  });
  button.type = "submit";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    appendLine(input.value);
    input.value = "";
  });
  form.append(input, button);
  return form;
}

function renderHelpScreen(): HTMLElement {
  const main = createElement("main", { className: "screen help-screen" });
  const sections = createElement("section", {
    className: "feature-guide",
    attributes: { "aria-label": "Feature guide" },
  });

  [
    ["▶", "Play a line", "Tap the blue row to read the full sentence aloud."],
    ["✎", "Edit row", "Use the pencil to edit only that sentence in place."],
    ["+", "Expand", "Open translation, word playback, and grammar notes for a sentence."],
    ["＋", "Add row", "Use the input at the end of the list to add a new sentence."],
    ["↕", "Reorder", "Drag a sentence row to rearrange your reading order."],
    ["Cheat", "Cheat sheet", "Open weekdays, alphabet, numbers, pronouns, and common phrases."],
    ["Speed", "Playback speed", "Adjust speech speed from 0.5x to 2x."],
    ["ABC", "Letter modes", "Test phonetic pause, extra slow, or repeat mode from Settings."],
    ["⚙", "Settings", "Change reading language and dark mode."],
    ["Stop", "Stop speech", "Stop any current line, word, or cheat sheet playback."],
  ].forEach(([indicator, title, body]) => {
    const card = createElement("article", { className: "feature-card" });
    card.append(
      createElement("span", { className: "feature-indicator", text: indicator }),
      createElement("strong", { text: title }),
      createElement("p", { text: body }),
    );
    sections.append(card);
  });

  main.append(sections);
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

  const letterModeLabel = createElement("label", {
    className: "field-label",
    text: "ABC playback",
  });
  const letterModeSelect = createElement("select", {
    className: "select",
    attributes: { id: "letter-playback-mode" },
  });
  [
    ["spaced", "Phonetic + pause"],
    ["extra-slow", "Extra slow"],
    ["repeat", "Repeat 3 times"],
  ].forEach(([value, label]) => {
    const option = createElement("option", {
      text: label,
      attributes: { value },
    });
    option.selected = settings.letterPlaybackMode === value;
    letterModeSelect.append(option);
  });
  letterModeSelect.addEventListener("change", () => {
    updateSettings({
      ...settings,
      letterPlaybackMode:
        letterModeSelect.value === "extra-slow" ||
        letterModeSelect.value === "repeat"
          ? letterModeSelect.value
          : "spaced",
    });
  });
  letterModeLabel.append(letterModeSelect);

  panel.append(languageLabel, letterModeLabel, themeRow);
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
        speakCheatSheetItem(item, itemId, language),
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
  const controls = createElement("header", {
    className: `global-controls ${isTopBarOpen ? "open" : ""}`,
  });
  const primaryRow = createElement("div", { className: "global-row" });
  const menuButton = createElement("button", {
    className: "icon-button menu-button",
    text: isTopBarOpen ? "×" : "☰",
    attributes: {
      "aria-expanded": String(isTopBarOpen),
      "aria-label": isTopBarOpen ? "Collapse controls" : "Expand controls",
    },
  });
  menuButton.type = "button";
  menuButton.addEventListener("click", () => {
    isTopBarOpen = !isTopBarOpen;
    render();
  });
  primaryRow.append(
    createElement("strong", { className: "app-title", text: "Lang Learn" }),
    menuButton,
  );
  controls.append(primaryRow);

  if (isTopBarOpen) {
    const actionRow = createElement("nav", {
      className: "global-actions",
      attributes: { "aria-label": "Global app controls" },
    });
    const homeButton = createElement("button", {
      className: "secondary-button compact-button",
      text: "Home",
    });
    homeButton.type = "button";
    homeButton.addEventListener("click", () => goToScreen("input"));

    const helpButton = createElement("button", {
      className: "secondary-button compact-button",
      text: "Help",
      attributes: { "aria-label": "Open help" },
    });
    helpButton.type = "button";
    helpButton.addEventListener("click", () => goToScreen("help"));

    actionRow.append(
      homeButton,
      renderCheatSheetNavButton(),
      helpButton,
      renderSettingsNavButton(),
    );
    controls.append(actionRow);
  }

  return controls;
}

function renderBottomPlaybackControls(): HTMLElement {
  const controls = createElement("nav", {
    className: "bottom-playback-controls",
    attributes: { "aria-label": "Playback controls" },
  });
  const stopButton = createElement("button", {
    className: "secondary-button compact-button",
    text: "Stop",
  });
  stopButton.type = "button";
  stopButton.disabled = !speechState.speakingId;
  stopButton.addEventListener("click", stopSpeech);
  controls.append(stopButton, renderSpeedButton());
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
      : screen === "help"
        ? renderHelpScreen()
      : screen === "input"
        ? renderInputScreen(language)
        : renderReadingScreen(language, lines),
  );

  const dialog = renderSpeedDialog();
  if (dialog) {
    appRoot.append(dialog);
  }

  appRoot.append(renderGlobalControls());
  appRoot.append(renderBottomPlaybackControls());
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
