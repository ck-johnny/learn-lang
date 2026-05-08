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
  voicesStatus: "loading" | "ready";
  voices: SpeechSynthesisVoice[];
  attemptedLanguageIds: Set<string>;
  unavailableLanguageIds: Set<string>;
  speakingId: string | null;
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found.");
}

const appRoot = app;
const EDIT_ALL_FORM_ID = "edit-all-form";

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
let isTopBarOpen = false;
let isSharePanelOpen = false;
let speechDelayId: number | null = null;
let editingLineId: string | null = null;
let draggedLineId: string | null = null;
let dragPreviewLines: ReadingLine[] | null = null;
let dragPointerId: number | null = null;
let dragTouchId: number | null = null;
let dragPreviewHasMoved = false;
let longPressTimerId: number | null = null;
let isEditingAll = false;
const expandedLineIds = new Set<string>();
const translationCache = new Map<string, TranslationState>();
const speechState: SpeechState = {
  supportStatus: "speechSynthesis" in window ? "supported" : "unsupported",
  voicesStatus: "loading",
  voices: [],
  attemptedLanguageIds: new Set(),
  unavailableLanguageIds: new Set(),
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

function applySharedSettingsFromUrl(): void {
  const currentUrl = new URL(window.location.href);

  if (!currentUrl.searchParams.has("text")) {
    return;
  }

  const sharedText = currentUrl.searchParams.get("text") ?? "";
  const sharedLanguageId = currentUrl.searchParams.get("lang");
  const nextLanguageId = SUPPORTED_LANGUAGES.some(
    (language) => language.id === sharedLanguageId,
  )
    ? sharedLanguageId
    : settings.languageId;

  settings = {
    ...settings,
    paragraph: sharedText,
    languageId: nextLanguageId ?? settings.languageId,
  };
  saveSettings(settings);

  currentUrl.searchParams.delete("text");
  currentUrl.searchParams.delete("lang");
  window.history.replaceState({}, "", currentUrl);
}

function applyTheme(): void {
  document.documentElement.dataset.theme = settings.theme;
}

function getShareUrl(): string {
  const shareUrl = new URL(window.location.href);
  shareUrl.searchParams.set("text", settings.paragraph);
  shareUrl.searchParams.set("lang", settings.languageId);
  return shareUrl.toString();
}

function getQrCodeUrl(data: string): string {
  const qrUrl = new URL("https://api.qrserver.com/v1/create-qr-code/");
  qrUrl.searchParams.set("size", "260x260");
  qrUrl.searchParams.set("qzone", "2");
  qrUrl.searchParams.set("data", data);
  return qrUrl.toString();
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
  const newLines = paragraphToLines(text);

  if (newLines.length === 0) {
    return;
  }

  persistLines([
    ...paragraphToLines(settings.paragraph),
    ...newLines.map((line, index) => ({
      id: `new-${Date.now()}-${index}`,
      text: line.text,
    })),
  ]);
}

function getReorderedLines(
  lines: ReadingLine[],
  sourceId: string,
  targetId: string,
  placement: "before" | "after",
): ReadingLine[] | null {
  if (sourceId === targetId) {
    return null;
  }

  const nextLines = [...lines];
  const sourceIndex = lines.findIndex((line) => line.id === sourceId);
  const targetIndex = lines.findIndex((line) => line.id === targetId);

  if (sourceIndex === -1 || targetIndex === -1) {
    return null;
  }

  const [sourceLine] = nextLines.splice(sourceIndex, 1);
  const adjustedTargetIndex = nextLines.findIndex((line) => line.id === targetId);
  const insertIndex =
    placement === "after" ? adjustedTargetIndex + 1 : adjustedTargetIndex;
  nextLines.splice(insertIndex, 0, sourceLine);

  if (nextLines.every((line, index) => line.id === lines[index]?.id)) {
    return null;
  }

  return nextLines;
}

function clearLongPressTimer(): void {
  if (longPressTimerId !== null) {
    window.clearTimeout(longPressTimerId);
    longPressTimerId = null;
  }
}

function clearLineDragging(): void {
  clearLongPressTimer();
  draggedLineId = null;
  dragPreviewLines = null;
  dragPointerId = null;
  dragTouchId = null;
  dragPreviewHasMoved = false;
  window.removeEventListener("pointermove", handleLineDragMove, true);
  window.removeEventListener("pointerup", handleLineDragEnd, true);
  window.removeEventListener("pointercancel", handleLineDragCancel, true);
  window.removeEventListener("touchmove", handleLineTouchMove, true);
  window.removeEventListener("touchend", handleLineTouchEnd, true);
  window.removeEventListener("touchcancel", handleLineTouchCancel, true);
  document
    .querySelectorAll(".line-card.dragging")
    .forEach((element) => element.classList.remove("dragging"));
  document.documentElement.classList.remove("is-reordering");
}

function beginLineDrag(
  lineId: string,
  lineCard: HTMLElement,
  pointerId: number | null = null,
  touchId: number | null = null,
): void {
  draggedLineId = lineId;
  dragPreviewLines = paragraphToLines(settings.paragraph);
  dragPointerId = pointerId;
  dragTouchId = touchId;
  dragPreviewHasMoved = false;
  lineCard.classList.add("dragging");
  document.documentElement.classList.add("is-reordering");
  window.addEventListener("pointermove", handleLineDragMove, true);
  window.addEventListener("pointerup", handleLineDragEnd, true);
  window.addEventListener("pointercancel", handleLineDragCancel, true);
  window.addEventListener("touchmove", handleLineTouchMove, {
    capture: true,
    passive: false,
  });
  window.addEventListener("touchend", handleLineTouchEnd, true);
  window.addEventListener("touchcancel", handleLineTouchCancel, true);
}

function previewLineReorder(
  targetId: string | null,
  placement: "before" | "after",
): void {
  if (!draggedLineId || !targetId) {
    return;
  }

  const nextLines = getReorderedLines(
    dragPreviewLines ?? paragraphToLines(settings.paragraph),
    draggedLineId,
    targetId,
    placement,
  );

  if (!nextLines) {
    return;
  }

  dragPreviewLines = nextLines;
  dragPreviewHasMoved = true;
  render();
}

function updateDropTargetFromPoint(clientY: number): void {
  if (!draggedLineId) {
    return;
  }

  const lineCards = Array.from(
    document.querySelectorAll<HTMLElement>(".line-card"),
  ).filter((lineCard) => lineCard.dataset.lineId !== draggedLineId);

  if (lineCards.length === 0) {
    return;
  }

  for (const lineCard of lineCards) {
    const targetRect = lineCard.getBoundingClientRect();

    if (clientY < targetRect.top + targetRect.height / 2) {
      previewLineReorder(lineCard.dataset.lineId ?? null, "before");
      return;
    }
  }

  previewLineReorder(
    lineCards[lineCards.length - 1]?.dataset.lineId ?? null,
    "after",
  );
}

function finishLineDrag(clientY: number): void {
  if (!draggedLineId) {
    return;
  }

  updateDropTargetFromPoint(clientY);
  const nextLines = dragPreviewLines;
  clearLineDragging();

  if (nextLines) {
    persistLines(nextLines);
  }
}

function handleLineDragMove(event: PointerEvent): void {
  if (!draggedLineId) {
    return;
  }

  if (dragPointerId !== null && event.pointerId !== dragPointerId) {
    return;
  }

  event.preventDefault();
  updateDropTargetFromPoint(event.clientY);
}

function handleLineDragEnd(event: PointerEvent): void {
  if (dragPointerId !== null && event.pointerId !== dragPointerId) {
    return;
  }

  event.preventDefault();
  finishLineDrag(event.clientY);
}

function handleLineDragCancel(event?: PointerEvent): void {
  if (
    event &&
    dragPointerId !== null &&
    event.pointerId !== dragPointerId
  ) {
    return;
  }

  clearLineDragging();
}

function getTrackedTouch(touches: TouchList): Touch | null {
  if (dragTouchId === null) {
    return touches[0] ?? null;
  }

  for (const touch of Array.from(touches)) {
    if (touch.identifier === dragTouchId) {
      return touch;
    }
  }

  return null;
}

function handleLineTouchMove(event: TouchEvent): void {
  if (!draggedLineId) {
    return;
  }

  const touch = getTrackedTouch(event.touches);
  if (!touch) {
    return;
  }

  event.preventDefault();
  updateDropTargetFromPoint(touch.clientY);
}

function handleLineTouchEnd(event: TouchEvent): void {
  if (!draggedLineId) {
    return;
  }

  const touch = getTrackedTouch(event.changedTouches);
  if (!touch) {
    return;
  }

  event.preventDefault();
  finishLineDrag(touch.clientY);
}

function handleLineTouchCancel(event: TouchEvent): void {
  if (!draggedLineId || dragTouchId === null || getTrackedTouch(event.changedTouches)) {
    clearLineDragging();
  }
}

function startLineLongPress(
  lineId: string,
  lineCard: HTMLElement,
  pointerId: number,
): void {
  clearLongPressTimer();
  longPressTimerId = window.setTimeout(() => {
    beginLineDrag(lineId, lineCard, pointerId);
  }, 450);
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
  clearLongPressTimer();

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

function refreshVoices(): void {
  if (speechState.supportStatus === "unsupported") {
    return;
  }

  speechState.voices = window.speechSynthesis.getVoices();

  if (speechState.voices.length > 0) {
    speechState.voicesStatus = "ready";
    SUPPORTED_LANGUAGES.forEach((language) => {
      if (findVoice(language)) {
        speechState.unavailableLanguageIds.delete(language.id);
      }
    });
  }
}

function userLanguagesInclude(language: LearningLanguage): boolean {
  const speechLang = language.speechLang.toLowerCase();
  const languagePrefix = speechLang.split("-")[0];
  const browserLanguages = navigator.languages?.length
    ? navigator.languages
    : [navigator.language].filter(Boolean);

  return browserLanguages.some((browserLanguage) => {
    const normalizedLanguage = browserLanguage.toLowerCase();
    return (
      normalizedLanguage === speechLang ||
      normalizedLanguage === languagePrefix ||
      normalizedLanguage.startsWith(`${languagePrefix}-`)
    );
  });
}

function markLanguageVoiceUnavailable(language: LearningLanguage): void {
  speechState.attemptedLanguageIds.add(language.id);
  speechState.unavailableLanguageIds.add(language.id);
}

function isVoiceUnavailableError(error: SpeechSynthesisErrorCode): boolean {
  return [
    "language-unavailable",
    "voice-unavailable",
    "synthesis-unavailable",
    "synthesis-failed",
  ].includes(error);
}

function prepareVoiceForPlayback(
  language: LearningLanguage,
): SpeechSynthesisVoice | null | undefined {
  speechState.attemptedLanguageIds.add(language.id);
  refreshVoices();

  const voice = findVoice(language);
  if (voice) {
    speechState.unavailableLanguageIds.delete(language.id);
    return voice;
  }

  if (userLanguagesInclude(language)) {
    return null;
  }

  if (speechState.voicesStatus === "ready") {
    markLanguageVoiceUnavailable(language);
    return undefined;
  }

  return null;
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

  const voice = prepareVoiceForPlayback(language);
  if (voice === undefined) {
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
  utterance.onerror = (event) => {
    if (isVoiceUnavailableError(event.error)) {
      markLanguageVoiceUnavailable(language);
    }
    if (speechState.speakingId === id) {
      speechState.speakingId = null;
      render();
    }
  };

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

  const voice = prepareVoiceForPlayback(language);
  if (voice === undefined) {
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
    utterance.onerror = (event) => {
      if (isVoiceUnavailableError(event.error)) {
        markLanguageVoiceUnavailable(language);
      }
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

  if (!speechState.attemptedLanguageIds.has(language.id)) {
    return null;
  }

  if (speechState.unavailableLanguageIds.has(language.id)) {
    return `No ${language.label} voice was found. Install or enable a ${language.label} voice in your browser or system settings before playing lines.`;
  }

  if (userLanguagesInclude(language) && speechState.voicesStatus === "loading") {
    return null;
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
  isSharePanelOpen = false;
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
  const main = createElement("main", {
    className: `screen reading-screen ${isEditingAll ? "editing-all" : ""}`,
  });
  const ttsMessage = getTtsMessage(language);
  if (ttsMessage) {
    main.append(
      createElement("aside", { className: "notice", text: ttsMessage }),
    );
  }

  const lineList = createElement("section", {
    className: `line-list ${dragPreviewHasMoved ? "reorder-preview" : ""}`,
    attributes: { "aria-label": "Reading lines" },
  });
  if (isEditingAll) {
    lineList.append(renderEditAllForm(language));
    main.append(lineList);
    return main;
  }
  lines.forEach((line, index) => {
    const isSpeaking = speechState.speakingId === line.id;
    const isExpanded = expandedLineIds.has(line.id);
    const isDraggedLine = draggedLineId === line.id;
    const lineCard = createElement("article", {
      className: `line-card ${isExpanded ? "expanded" : ""} ${
        isDraggedLine ? "dragging" : ""
      }`,
      attributes: { "data-line-id": line.id },
    });
    lineCard.style.setProperty("--row-accent", getRowAccent(index));
    lineCard.addEventListener("pointerdown", (event) => {
      if (
        editingLineId === line.id ||
        !(event.target instanceof HTMLElement) ||
        event.target.closest("button, input")
      ) {
        return;
      }

      clearLongPressTimer();
      startLineLongPress(line.id, lineCard, event.pointerId);
    });
    lineCard.addEventListener("pointerup", (event) => {
      if (dragPointerId !== null && event.pointerId !== dragPointerId) {
        return;
      }

      clearLongPressTimer();
      finishLineDrag(event.clientY);
    });
    lineCard.addEventListener("pointercancel", handleLineDragCancel);
    const lineActions = createElement("div", { className: "line-actions" });
    const reorderLineButton = createElement("button", {
      className: "line-reorder-button",
      text: "↕",
      attributes: {
        "aria-label": `Drag to reorder line ${index + 1}`,
        title: "Drag to reorder",
      },
    });
    reorderLineButton.type = "button";
    reorderLineButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      reorderLineButton.setPointerCapture(event.pointerId);
      beginLineDrag(line.id, lineCard, event.pointerId);
      event.stopPropagation();
    });
    reorderLineButton.addEventListener(
      "touchstart",
      (event) => {
        const touch = event.changedTouches[0];
        if (!touch) {
          return;
        }

        event.preventDefault();
        beginLineDrag(line.id, lineCard, null, touch.identifier);
        event.stopPropagation();
      },
      { passive: false },
    );
    reorderLineButton.addEventListener("pointerup", clearLongPressTimer);
    reorderLineButton.addEventListener("pointercancel", handleLineDragCancel);

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

    lineActions.append(reorderLineButton, lineBody, expandButton);
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
  const input = createElement("textarea", {
    className: "add-line-input",
    attributes: {
      "aria-label": "Add sentence",
      placeholder: language.placeholder.split("\n")[0] ?? "Add a sentence",
      rows: "3",
    },
  });
  const button = createElement("button", {
    className: "primary-button add-line-button",
    text: "+",
    attributes: { "aria-label": "Add sentence" },
  });
  button.type = "submit";
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    appendLine(input.value);
    input.value = "";
  });
  form.append(input, button);
  return form;
}

function renderEditAllForm(language: LearningLanguage): HTMLElement {
  const form = createElement("form", {
    className: "edit-all-form",
    attributes: { id: EDIT_ALL_FORM_ID },
  });
  const textarea = createElement("textarea", {
    className: "edit-all-textarea",
    attributes: {
      "aria-label": "Edit all sentences",
      rows: "8",
      placeholder: language.placeholder,
    },
  });
  textarea.value = settings.paragraph;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    isEditingAll = false;
    updateSettings({ ...settings, paragraph: textarea.value });
  });
  form.append(textarea);
  window.setTimeout(() => {
    textarea.focus();
    textarea.selectionStart = textarea.value.length;
    textarea.selectionEnd = textarea.value.length;
  }, 0);
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
    ["↕", "Reorder", "Drag the reorder handle, then release on the destination line."],
    ["Cheat", "Cheat sheet", "Open weekdays, alphabet, numbers, pronouns, and common phrases."],
    ["Speed", "Playback speed", "Adjust speech speed from 0.5x to 2x."],
    ["QR", "Share text", "Open the QR panel so another user can scan your current text."],
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

    const shareButton = createElement("button", {
      className: "secondary-button compact-button",
      text: "QR",
      attributes: { "aria-label": "Share current text with QR code" },
    });
    shareButton.type = "button";
    shareButton.disabled = !settings.paragraph.trim();
    shareButton.addEventListener("click", () => {
      isSharePanelOpen = true;
      isTopBarOpen = false;
      render();
    });

    actionRow.append(
      homeButton,
      renderCheatSheetNavButton(),
      shareButton,
      helpButton,
      renderSettingsNavButton(),
    );
    controls.append(actionRow);
  }

  return controls;
}

function renderSharePanel(): HTMLElement {
  const backdrop = createElement("div", {
    className: "share-backdrop",
    attributes: { role: "presentation" },
  });
  const panel = createElement("section", {
    className: "share-panel",
    attributes: {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Share current text",
    },
  });
  const header = createElement("header", { className: "dialog-header" });
  const titleBlock = createElement("div");
  titleBlock.append(
    createElement("p", { className: "eyebrow", text: "Share" }),
    createElement("h2", { text: "Scan this text" }),
  );
  const closeButton = createElement("button", {
    className: "icon-button",
    text: "×",
    attributes: { "aria-label": "Close share panel" },
  });
  closeButton.type = "button";
  closeButton.addEventListener("click", () => {
    isSharePanelOpen = false;
    render();
  });
  header.append(titleBlock, closeButton);

  if (!settings.paragraph.trim()) {
    panel.append(
      header,
      createElement("p", {
        className: "share-hint",
        text: "Add some text first, then open this panel to generate a QR code.",
      }),
    );
    backdrop.append(panel);
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        isSharePanelOpen = false;
        render();
      }
    });
    return backdrop;
  }

  const shareUrl = getShareUrl();
  const qrImage = createElement("img", {
    className: "qr-code",
    attributes: {
      src: getQrCodeUrl(shareUrl),
      alt: "QR code for the current learning text",
      width: "260",
      height: "260",
    },
  });
  const urlField = createElement("input", {
    className: "share-url-field",
    attributes: {
      value: shareUrl,
      readonly: "true",
      "aria-label": "Share link",
    },
  });
  urlField.addEventListener("focus", () => urlField.select());

  const buttonRow = createElement("div", { className: "share-actions" });
  const copyButton = createElement("button", {
    className: "secondary-button compact-button",
    text: "Copy link",
  });
  copyButton.type = "button";
  copyButton.addEventListener("click", () => {
    navigator.clipboard?.writeText(shareUrl).catch(() => {
      urlField.focus();
    });
  });
  buttonRow.append(copyButton);

  if ("share" in navigator) {
    const nativeShareButton = createElement("button", {
      className: "primary-button compact-button",
      text: "Share",
    });
    nativeShareButton.type = "button";
    nativeShareButton.addEventListener("click", () => {
      navigator
        .share({
          title: "Lang Learn text",
          text: "Open this text in Lang Learn.",
          url: shareUrl,
        })
        .catch(() => undefined);
    });
    buttonRow.append(nativeShareButton);
  }

  panel.append(
    header,
    qrImage,
    createElement("p", {
      className: "share-hint",
      text: "The QR code opens this app with the current text and language.",
    }),
    urlField,
    buttonRow,
  );
  backdrop.append(panel);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      isSharePanelOpen = false;
      render();
    }
  });
  return backdrop;
}

function renderSpeedPresets(): HTMLElement {
  const presetGroup = createElement("div", {
    className: "bottom-speed-presets",
    attributes: { "aria-label": "Playback speed presets" },
  });
  [0.5, 0.75, 1, 1.25, 1.5, 2].forEach((speed) => {
    const isSelected = settings.speed === speed;
    const presetButton = createElement("button", {
      className: `speed-preset ${isSelected ? "selected" : ""}`,
      text: `${speed.toFixed(2).replace(/\.00$/, "")}×`,
      attributes: { "aria-pressed": String(isSelected) },
    });
    presetButton.type = "button";
    presetButton.addEventListener("click", () => {
      updateSettings({ ...settings, speed: clampSpeed(speed) });
    });
    presetGroup.append(presetButton);
  });
  return presetGroup;
}

function renderBottomPlaybackControls(): HTMLElement {
  const controls = createElement("nav", {
    className: `bottom-playback-controls ${isEditingAll ? "edit-mode" : ""}`,
    attributes: { "aria-label": "Playback controls" },
  });

  if (isEditingAll) {
    const clearButton = createElement("button", {
      className: "secondary-button compact-button",
      text: "Clear",
      attributes: { "aria-label": "Clear all sentences" },
    });
    clearButton.type = "button";
    clearButton.addEventListener("click", () => {
      if (!window.confirm("Remove all sentences?")) {
        return;
      }

      isEditingAll = false;
      updateSettings({ ...settings, paragraph: "" });
    });

    const saveButton = createElement("button", {
      className: "primary-button compact-button",
      text: "Save",
      attributes: { form: EDIT_ALL_FORM_ID },
    });
    saveButton.type = "submit";

    controls.append(clearButton, saveButton);
    return controls;
  }

  const stopButton = createElement("button", {
    className: "secondary-button compact-button",
    text: speechState.speakingId ? "Stop" : "Edit",
  });
  stopButton.type = "button";
  stopButton.addEventListener("click", () => {
    if (speechState.speakingId) {
      stopSpeech();
      return;
    }

    isEditingAll = true;
    goToScreen("input");
  });
  controls.append(stopButton);
  controls.append(renderSpeedPresets());
  return controls;
}

function render(): void {
  const language = findLanguage(settings.languageId);
  const lines = dragPreviewLines ?? paragraphToLines(settings.paragraph);

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

  appRoot.append(renderGlobalControls());
  appRoot.append(renderBottomPlaybackControls());

  if (isSharePanelOpen) {
    appRoot.append(renderSharePanel());
  }
}

function loadVoices(): void {
  if (speechState.supportStatus === "unsupported") {
    return;
  }

  refreshVoices();
  render();
}

if (speechState.supportStatus === "supported") {
  loadVoices();
  window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
  window.addEventListener("pagehide", () => window.speechSynthesis.cancel());
}

const isLocalDevHost =
  ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) ||
  window.location.hostname.startsWith("192.168.");

if ("serviceWorker" in navigator && !isLocalDevHost) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(new URL("./sw.js", import.meta.url));
  });
} else if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}

applyTheme();
applySharedSettingsFromUrl();
render();
