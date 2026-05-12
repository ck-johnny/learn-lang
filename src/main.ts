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

type AppScreen =
  | "input"
  | "reading"
  | "settings"
  | "cheat-sheet"
  | "numbers"
  | "help"
  | "qr";

type BreadcrumbItem = {
  label: string;
  screen: AppScreen;
};

type ReadingLine = {
  id: string;
  text: string;
};

type CheatSheetItem = {
  text: string;
  translation: string;
  note?: string;
  speechText?: string;
  exampleText?: string;
  kind?: "letter";
};

type CheatSheetSection = {
  title: string;
  items: CheatSheetItem[];
  references?: { label: string; url: string }[];
};

type TranslationState =
  | { status: "loading" }
  | { status: "ready"; text: string; source: string }
  | { status: "error"; message: string; source: string };

type BuiltInTranslatorAvailability = "available" | "downloadable" | "downloading" | "unavailable";

type BuiltInTranslatorInstance = {
  translate(text: string): Promise<string>;
  destroy?: () => void;
};

type BuiltInTranslatorFactory = {
  availability(options: {
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<BuiltInTranslatorAvailability>;
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (monitor: EventTarget) => void;
  }): Promise<BuiltInTranslatorInstance>;
};

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
const LETTER_EXTRA_SLOW_RATE = 0.2;
const LETTER_REPEAT_RATE = 0.08;
const CHROME_TRANSLATION_TIMEOUT_MS = 8000;
const GOOGLE_TRANSLATION_TIMEOUT_MS = 12000;
const APP_BASE_PATH = new URL(".", import.meta.url).pathname;
const SCREEN_BREADCRUMB_LABELS: Record<AppScreen, string> = {
  input: "Learn Lang",
  reading: "Learn Lang",
  settings: "Settings",
  "cheat-sheet": "Cheat",
  numbers: "Numbers",
  help: "Help",
  qr: "QR",
};

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
      ["A", "ah", "Anton"],
      ["B", "beh", "Berta"],
      ["C", "tseh", "Caesar"],
      ["D", "deh", "Dora"],
      ["E", "eh", "Emil"],
      ["F", "eff", "Friedrich"],
      ["G", "geh", "Gerda"],
      ["H", "hah", "Heinrich"],
      ["I", "ih", "Ida"],
      ["J", "jott", "Jürgen"],
      ["K", "kah", "Kaufmann"],
      ["L", "ell", "Lisa"],
      ["M", "emm", "Martha"],
      ["N", "enn", "Norbert"],
      ["O", "oh", "Otto"],
      ["P", "peh", "Paula"],
      ["Q", "kuh", "Quelle"],
      ["R", "err", "Richard"],
      ["S", "ess", "Siegfried"],
      ["T", "teh", "Theodor"],
      ["U", "uh", "Ulrich"],
      ["V", "fau", "Victor"],
      ["W", "weh", "Wolfgang"],
      ["X", "iks", "Xanthippe"],
      ["Y", "üpsilon", "Ypsilon"],
      ["Z", "tsett", "Zacharias"],
      ["Ä", "äh", "Ärger"],
      ["Ö", "öh", "Ökonom"],
      ["Ü", "üh", "Übermut"],
      ["ß", "esszett", "Eszett"],
    ].map(([letter, pronunciation, example]) => ({
      text: letter,
      translation: pronunciation,
      note: `wie ${example}`,
      speechText: letter.toLocaleLowerCase("de-DE"),
      exampleText: `${letter} wie ${example}`,
      kind: "letter",
    })),
    references: [
      {
        label: "DW Deutschtrainer: Buchstabieren",
        url: "https://static.dw.com/downloads/49376952/Deutschtrainer_070_Buchstabieren_DEU.pdf",
      },
      {
        label: "Deutsches Institut: Alphabet",
        url: "https://www.deutschesinstitut.it/eng/alphabet/",
      },
      {
        label: "LanguageTool: Buchstabiertafel",
        url: "https://languagetool.org/insights/de/beitrag/buchstabiertafel/",
      },
    ],
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
let screen: AppScreen = getInitialScreen();
let isTopBarOpen = false;
let speechDelayId: number | null = null;
let editingLineId: string | null = null;
let draggedLineId: string | null = null;
let dragPreviewLines: ReadingLine[] | null = null;
let dragPointerId: number | null = null;
let dragTouchId: number | null = null;
let dragPreviewHasMoved = false;
let dragPreviewBeforeLineId: string | null = null;
let dragPreviewAtEnd = false;
let longPressTimerId: number | null = null;
let isEditingAll = false;
let converterNumberInput = "42";
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
  return Math.min(2, Math.max(0.25, speed));
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
  const shareUrl = new URL(window.location.origin + APP_BASE_PATH);
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

function normalizeRoutePath(pathname: string): string {
  let routePath = pathname;

  if (APP_BASE_PATH !== "/" && routePath.startsWith(APP_BASE_PATH)) {
    routePath = `/${routePath.slice(APP_BASE_PATH.length)}`;
  }

  return routePath.replace(/\/+$/, "") || "/";
}

function screenFromPath(pathname: string): AppScreen {
  const routePath = normalizeRoutePath(pathname);

  if (routePath === "/pages/settings") {
    return "settings";
  }

  if (routePath === "/pages/cheat" || routePath === "/pages/cheat-sheet") {
    return "cheat-sheet";
  }

  if (routePath === "/pages/numbers" || routePath === "/pages/number-converter") {
    return "numbers";
  }

  if (routePath === "/pages/help") {
    return "help";
  }

  if (routePath === "/pages/qr" || routePath === "/pages/share") {
    return "qr";
  }

  return "input";
}

function screenFromStoredLocation(storedLocation: string): AppScreen {
  if (storedLocation === "reading") {
    return "reading";
  }

  if (storedLocation === "settings") {
    return "settings";
  }

  if (storedLocation === "cheat-sheet") {
    return "cheat-sheet";
  }

  if (storedLocation === "numbers") {
    return "numbers";
  }

  if (storedLocation === "help") {
    return "help";
  }

  if (storedLocation === "qr") {
    return "qr";
  }

  return screenFromPath(storedLocation);
}

function getInitialScreen(): AppScreen {
  const currentPath = normalizeRoutePath(window.location.pathname);

  if (currentPath !== "/") {
    return screenFromPath(currentPath);
  }

  return screenFromStoredLocation(settings.lastPath);
}

function persistLastPath(nextScreen: AppScreen): void {
  if (settings.lastPath === nextScreen) {
    return;
  }

  settings = { ...settings, lastPath: nextScreen };
  saveSettings(settings);
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
  dragPreviewBeforeLineId = null;
  dragPreviewAtEnd = false;
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
  dragPreviewBeforeLineId = null;
  dragPreviewAtEnd = false;
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
  const previewIndex = nextLines.findIndex((line) => line.id === draggedLineId);
  dragPreviewBeforeLineId = nextLines[previewIndex + 1]?.id ?? null;
  dragPreviewAtEnd = previewIndex === nextLines.length - 1;
  render();
}

function updateDropTargetFromPoint(clientY: number): void {
  if (!draggedLineId) {
    return;
  }

  const lineCards = Array.from(
    document.querySelectorAll<HTMLElement>(".line-card"),
  ).filter(
    (lineCard) =>
      lineCard.dataset.lineId !== draggedLineId &&
      !lineCard.classList.contains("line-card-preview"),
  );

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
    speakText(`${text}.\n${text}.\n${text}.`, id, language, LETTER_REPEAT_RATE);
    return;
  }

  if (settings.letterPlaybackMode === "example" && item.exampleText) {
    speakText(item.exampleText, id, language, LETTER_EXTRA_SLOW_RATE);
    return;
  }

  speakText(text, id, language, LETTER_EXTRA_SLOW_RATE);
}

function speakLine(line: ReadingLine, language: LearningLanguage): void {
  speakText(line.text, line.id, language);
}

function getTranslationCacheKey(text: string, language: LearningLanguage): string {
  return `${language.id}:en:${text.trim()}`;
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

function getBuiltInTranslator(): BuiltInTranslatorFactory | null {
  const maybeWindow = window as Window &
    typeof globalThis & { Translator?: BuiltInTranslatorFactory };

  return maybeWindow.Translator ?? null;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out`));
    }, timeoutMs);

    promise
      .then(resolve, reject)
      .finally(() => window.clearTimeout(timeoutId));
  });
}

async function translateWithChrome(
  text: string,
  language: LearningLanguage,
): Promise<string> {
  const translatorFactory = getBuiltInTranslator();

  if (!translatorFactory) {
    throw new Error("Chrome built-in Translator API is not available");
  }

  const availability = await withTimeout(
    translatorFactory.availability({
      sourceLanguage: language.id,
      targetLanguage: "en",
    }),
    CHROME_TRANSLATION_TIMEOUT_MS,
    "Chrome built-in Translator availability check",
  );

  if (availability === "unavailable") {
    throw new Error("Chrome built-in Translator does not support this language pair");
  }

  const translator = await withTimeout(
    translatorFactory.create({
      sourceLanguage: language.id,
      targetLanguage: "en",
    }),
    CHROME_TRANSLATION_TIMEOUT_MS,
    "Chrome built-in Translator setup",
  );

  try {
    const translatedText = (
      await withTimeout(
        translator.translate(text),
        CHROME_TRANSLATION_TIMEOUT_MS,
        "Chrome built-in Translator",
      )
    ).trim();

    if (!translatedText) {
      throw new Error("Chrome built-in Translator returned an empty response");
    }

    return translatedText;
  } finally {
    translator.destroy?.();
  }
}

async function translateWithGoogleEndpoint(
  text: string,
  language: LearningLanguage,
): Promise<string> {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", language.id);
  url.searchParams.set("tl", "en");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  const response = await withTimeout(
    fetch(url),
    GOOGLE_TRANSLATION_TIMEOUT_MS,
    "Google translation endpoint",
  );

  if (!response.ok) {
    throw new Error(`Google translation failed with ${response.status}`);
  }

  const translatedText = parseGoogleTranslationPayload(await response.json());

  if (!translatedText) {
    throw new Error("Google translation response was empty");
  }

  return translatedText;
}

function requestSentenceTranslation(text: string, language: LearningLanguage): void {
  const trimmedText = text.trim();

  if (!trimmedText) {
    return;
  }

  const cacheKey = getTranslationCacheKey(text, language);

  if (translationCache.has(cacheKey)) {
    return;
  }

  translationCache.set(cacheKey, { status: "loading" });
  window.setTimeout(render, 0);

  if (language.id === "en") {
    translationCache.set(cacheKey, {
      status: "ready",
      text: trimmedText,
      source: "English source text",
    });
    window.setTimeout(render, 0);
    return;
  }

  translateWithChrome(trimmedText, language)
    .then((translatedText) => {
      translationCache.set(cacheKey, {
        status: "ready",
        text: translatedText,
        source: "Chrome built-in Translator",
      });
      render();
    })
    .catch((chromeError: unknown) => {
      translateWithGoogleEndpoint(trimmedText, language)
        .then((translatedText) => {
          translationCache.set(cacheKey, {
            status: "ready",
            text: translatedText,
            source: "Google Translate endpoint",
          });
          render();
        })
        .catch((googleError: unknown) => {
          const chromeMessage =
            chromeError instanceof Error ? chromeError.message : "Chrome translation failed";
          const googleMessage =
            googleError instanceof Error ? googleError.message : "Google translation failed";

          translationCache.set(cacheKey, {
            status: "error",
            message: `${chromeMessage}; fallback failed: ${googleMessage}`,
            source: "Chrome built-in Translator and Google Translate endpoint",
          });
          render();
        });
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
  persistLastPath(nextScreen);
  render();
}

function renderCheatSheetNavButton(): HTMLButtonElement {
  const button = createElement("button", {
    className: `secondary-button compact-button ${
      screen === "cheat-sheet" ? "active" : ""
    }`,
    text: "Cheat",
    attributes: {
      "aria-current": screen === "cheat-sheet" ? "page" : "false",
      "aria-label": "Open cheat sheet",
    },
  });
  button.type = "button";
  button.addEventListener("click", () => goToScreen("cheat-sheet"));
  return button;
}

function renderNumbersNavButton(): HTMLButtonElement {
  const button = createElement("button", {
    className: `secondary-button compact-button ${
      screen === "numbers" ? "active" : ""
    }`,
    text: "Numbers",
    attributes: {
      "aria-current": screen === "numbers" ? "page" : "false",
      "aria-label": "Open number converter",
    },
  });
  button.type = "button";
  button.addEventListener("click", () => goToScreen("numbers"));
  return button;
}

function renderSettingsNavButton(): HTMLButtonElement {
  const button = createElement("button", {
    className: `icon-button ${screen === "settings" ? "active" : ""}`,
    text: "⚙",
    attributes: {
      "aria-current": screen === "settings" ? "page" : "false",
      "aria-label": "Open settings",
    },
  });
  button.type = "button";
  button.addEventListener("click", () => goToScreen("settings"));
  return button;
}

function getBreadcrumbItems(currentScreen: AppScreen): BreadcrumbItem[] {
  const homeScreen = currentScreen === "reading" ? "reading" : "input";
  const items: BreadcrumbItem[] = [
    { label: SCREEN_BREADCRUMB_LABELS[homeScreen], screen: homeScreen },
  ];

  if (currentScreen !== "input" && currentScreen !== "reading") {
    items.push({
      label: SCREEN_BREADCRUMB_LABELS[currentScreen],
      screen: currentScreen,
    });
  }

  return items;
}

function renderBreadcrumbs(): HTMLElement {
  const breadcrumbs = createElement("nav", {
    className: "breadcrumb-nav",
    attributes: { "aria-label": "Current location" },
  });
  const items = getBreadcrumbItems(screen);

  items.forEach((item, index) => {
    const isCurrent = index === items.length - 1;
    const chip = createElement("button", {
      className: `breadcrumb-chip ${isCurrent ? "current" : ""}`,
      text: item.label,
      attributes: {
        "aria-current": isCurrent ? "page" : "false",
      },
    });
    chip.type = "button";
    chip.disabled = isCurrent;

    if (!isCurrent) {
      chip.addEventListener("click", () => goToScreen(item.screen));
    }

    if (index > 0) {
      breadcrumbs.append(createElement("span", { className: "breadcrumb-separator", text: "/" }));
    }
    breadcrumbs.append(chip);
  });

  return breadcrumbs;
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

  const draggedLine = draggedLineId
    ? paragraphToLines(settings.paragraph).find((line) => line.id === draggedLineId) ?? null
    : null;
  const draggedLineIndex = draggedLine
    ? lines.findIndex((line) => line.id === draggedLine.id)
    : -1;
  const appendDragPreview = (beforeLineId: string | null, isEndSlot = false) => {
    if (
      !dragPreviewHasMoved ||
      !draggedLine ||
      (isEndSlot ? !dragPreviewAtEnd : dragPreviewBeforeLineId !== beforeLineId)
    ) {
      return;
    }

    const previewCard = createElement("article", {
      className: "line-card line-card-preview",
      attributes: { "aria-hidden": "true" },
    });
    previewCard.style.setProperty("--row-accent", getRowAccent(Math.max(0, draggedLineIndex)));

    const previewActions = createElement("div", { className: "line-actions" });
    const previewLine = createElement("div", { className: "reading-line" });
    previewLine.append(
      createElement("span", { className: "play-icon", text: "▶" }),
      createElement("span", { className: "line-text", text: draggedLine.text }),
    );
    previewActions.append(
      createElement("div", { className: "line-reorder-button", text: "↕" }),
      previewLine,
      createElement("div", { className: "expand-button", text: "+" }),
    );
    previewCard.append(previewActions);
    lineList.append(previewCard);
  };

  lines.forEach((line, index) => {
    appendDragPreview(line.id);

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
  appendDragPreview(null, true);
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
    ["+", "Expand", "Open the sentence-level translation."],
    ["＋", "Add row", "Use the input at the end of the list to add a new sentence."],
    ["↕", "Reorder", "Drag the reorder handle, then release on the destination line."],
    ["Cheat", "Cheat sheet", "Open weekdays, alphabet, numbers, pronouns, and common phrases."],
    ["123", "Number converter", "Convert digits into words for the selected reading language."],
    ["Speed", "Playback speed", "Adjust speech speed from 0.5x to 2x."],
    ["QR", "Share text", "Open the QR page so another user can scan your current text."],
    ["ABC", "Letter modes", "Test extra slow or repeat mode from Settings."],
    ["⚙", "Settings", "Change reading language and dark mode."],
    ["Stop", "Stop speech", "Stop any current line or cheat sheet playback."],
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
  const cacheKey = getTranslationCacheKey(line.text, language);
  requestSentenceTranslation(line.text, language);
  const translation = translationCache.get(cacheKey);
  const panel = createElement("section", {
    className: "analysis-panel",
    attributes: { "aria-label": "Translation" },
  });

  const sentenceBlock = createElement("div", { className: "sentence-translation" });
  const sentenceTranslation =
    translation?.status === "ready"
      ? translation.text
      : translation?.status === "error"
        ? "Translation unavailable."
        : "Translating...";
  sentenceBlock.append(
    createElement("span", { className: "analysis-label", text: "Sentence" }),
    createElement("p", { text: sentenceTranslation }),
  );
  if (translation?.status === "error") {
    sentenceBlock.append(
      createElement("small", {
        text: `${translation.source} failed. ${translation.message}. Check your connection or browser privacy settings.`,
      }),
    );
  } else if (translation?.status === "ready") {
    sentenceBlock.append(
      createElement("small", {
        text: `${translation.source}. Translated from ${language.label} to English.`,
      }),
    );
  }

  panel.append(sentenceBlock);
  return panel;
}

function renderSettingsScreen(language: LearningLanguage): HTMLElement {
  const main = createElement("main", { className: "screen settings-screen" });

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
    ["extra-slow", "Extra slow"],
    ["repeat", "Repeat 3 times"],
    ["example", "Letter + example"],
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
        letterModeSelect.value === "repeat" ||
        letterModeSelect.value === "example"
          ? letterModeSelect.value
          : "extra-slow",
    });
  });
  letterModeLabel.append(letterModeSelect);

  panel.append(languageLabel, letterModeLabel, themeRow);
  main.append(panel);
  return main;
}


type NumberConversionResult =
  | {
      status: "ready";
      value: string;
      integerPart: number;
      fractionalDigits: string;
      isNegative: boolean;
      words: string;
    }
  | { status: "empty"; message: string }
  | { status: "error"; message: string };

const NUMBER_CONVERTER_MIN = -999_999_999_999_999;
const NUMBER_CONVERTER_MAX = 999_999_999_999_999;
const MAX_FRACTION_DIGITS = 18;

type NumberScale = {
  singular: string;
  plural: string;
};

function getNumberConverterId(language: LearningLanguage, value: string): string {
  return `number-converter-${language.id}-${value}`;
}

function normalizeNumberInput(input: string): string {
  return input.trim().replace(/,/g, "");
}

function parseNumberInput(input: string): NumberConversionResult {
  const normalizedInput = normalizeNumberInput(input);

  if (!normalizedInput) {
    return { status: "empty", message: "Enter a number to convert." };
  }

  if (!/^-?(?:\d+|\d*\.\d+)$/.test(normalizedInput)) {
    return {
      status: "error",
      message: "Use digits with an optional minus sign and decimal point.",
    };
  }

  const isNegative = normalizedInput.startsWith("-");
  const unsignedInput = isNegative ? normalizedInput.slice(1) : normalizedInput;
  const [rawIntegerPart = "", rawFractionalDigits = ""] = unsignedInput.split(".");
  const integerDigits = (rawIntegerPart || "0").replace(/^0+(?=\d)/, "");
  const fractionalDigits = rawFractionalDigits;

  if (rawFractionalDigits.length > MAX_FRACTION_DIGITS) {
    return {
      status: "error",
      message: `Use ${MAX_FRACTION_DIGITS} or fewer digits after the decimal point.`,
    };
  }

  const integerPart = Number(integerDigits);
  if (!Number.isSafeInteger(integerPart)) {
    return { status: "error", message: "That number is too large to convert safely." };
  }

  if (integerPart > NUMBER_CONVERTER_MAX) {
    return {
      status: "error",
      message: `Choose a number from ${NUMBER_CONVERTER_MIN.toLocaleString()} to ${NUMBER_CONVERTER_MAX.toLocaleString()}.`,
    };
  }

  const displayValue = `${isNegative ? "-" : ""}${integerDigits}${fractionalDigits ? `.${fractionalDigits}` : ""}`;
  return {
    status: "ready",
    value: displayValue,
    integerPart,
    fractionalDigits,
    isNegative,
    words: "",
  };
}

function convertNumberToWords(
  integerPart: number,
  fractionalDigits: string,
  isNegative: boolean,
  language: LearningLanguage,
): string {
  const integerWords = convertIntegerToWords(integerPart, language);
  const decimalWords = fractionalDigits
    ? `${getDecimalSeparatorWord(language)} ${fractionalDigits
        .split("")
        .map((digit) => convertIntegerToWords(Number(digit), language))
        .join(" ")}`
    : "";
  const signWord = isNegative && (integerPart > 0 || fractionalDigits)
    ? `${language.id === "fr" ? "moins" : "minus"} `
    : "";

  return `${signWord}${integerWords}${decimalWords ? ` ${decimalWords}` : ""}`;
}

function convertIntegerToWords(value: number, language: LearningLanguage): string {
  if (language.id === "de") {
    return numberToGerman(value);
  }

  if (language.id === "fr") {
    return numberToFrench(value);
  }

  if (language.id === "es") {
    return numberToSpanish(value);
  }

  return numberToEnglish(value);
}

function getDecimalSeparatorWord(language: LearningLanguage): string {
  if (language.id === "de") return "Komma";
  if (language.id === "fr") return "virgule";
  if (language.id === "es") return "coma";
  return "point";
}

function splitNumberChunks(value: number): number[] {
  const chunks: number[] = [];
  let remaining = value;

  do {
    chunks.unshift(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  } while (remaining > 0);

  return chunks;
}

function joinScaledChunks(
  value: number,
  underThousand: (value: number) => string,
  scales: NumberScale[],
  options: {
    separator: string;
    omitOneBeforeFirstScale?: boolean;
    pluralizeScale?: (chunk: number, scale: NumberScale) => string;
  },
): string {
  if (value < 1000) {
    return underThousand(value);
  }

  const chunks = splitNumberChunks(value);
  const highestScaleIndex = chunks.length - 2;

  return chunks
    .map((chunk, chunkIndex) => {
      if (chunk === 0) {
        return "";
      }

      const scaleIndex = highestScaleIndex - chunkIndex;
      if (scaleIndex < 0) {
        return underThousand(chunk);
      }

      const scale = scales[scaleIndex];
      const scaleWord = options.pluralizeScale
        ? options.pluralizeScale(chunk, scale)
        : chunk === 1
          ? scale.singular
          : scale.plural;
      const chunkWords = options.omitOneBeforeFirstScale && chunk === 1 && scaleIndex === 0
        ? ""
        : underThousand(chunk);

      return `${chunkWords}${chunkWords ? options.separator : ""}${scaleWord}`;
    })
    .filter(Boolean)
    .join(options.separator);
}

function numberToGerman(value: number): string {
  const units = ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun"];
  const teens: Record<number, string> = {
    10: "zehn",
    11: "elf",
    12: "zwölf",
    13: "dreizehn",
    14: "vierzehn",
    15: "fünfzehn",
    16: "sechzehn",
    17: "siebzehn",
    18: "achtzehn",
    19: "neunzehn",
  };
  const tens: Record<number, string> = {
    20: "zwanzig",
    30: "dreißig",
    40: "vierzig",
    50: "fünfzig",
    60: "sechzig",
    70: "siebzig",
    80: "achtzig",
    90: "neunzig",
  };
  const underHundred = (number: number): string => {
    if (number < 10) {
      return units[number];
    }
    if (number < 20) {
      return teens[number];
    }
    const unit = number % 10;
    const ten = number - unit;
    return unit === 0 ? tens[ten] : `${unit === 1 ? "ein" : units[unit]}und${tens[ten]}`;
  };
  const underThousand = (number: number): string => {
    if (number < 100) {
      return underHundred(number);
    }
    const hundred = Math.floor(number / 100);
    const rest = number % 100;
    const hundredWords = `${hundred === 1 ? "ein" : units[hundred]}hundert`;
    return rest === 0 ? hundredWords : `${hundredWords}${underHundred(rest)}`;
  };

  return joinScaledChunks(
    value,
    underThousand,
    [
      { singular: "tausend", plural: "tausend" },
      { singular: "Million", plural: "Millionen" },
      { singular: "Milliarde", plural: "Milliarden" },
      { singular: "Billion", plural: "Billionen" },
    ],
    {
      separator: " ",
      omitOneBeforeFirstScale: true,
    },
  );
}

function numberToEnglish(value: number): string {
  const units = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  const teens = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const underHundred = (number: number): string => {
    if (number < 10) return units[number];
    if (number < 20) return teens[number - 10];
    const unit = number % 10;
    return unit === 0 ? tens[Math.floor(number / 10)] : `${tens[Math.floor(number / 10)]}-${units[unit]}`;
  };
  const underThousand = (number: number): string => {
    if (number < 100) return underHundred(number);
    const rest = number % 100;
    const hundredWords = `${units[Math.floor(number / 100)]} hundred`;
    return rest === 0 ? hundredWords : `${hundredWords} ${underHundred(rest)}`;
  };

  return joinScaledChunks(
    value,
    underThousand,
    [
      { singular: "thousand", plural: "thousand" },
      { singular: "million", plural: "million" },
      { singular: "billion", plural: "billion" },
      { singular: "trillion", plural: "trillion" },
    ],
    { separator: " " },
  );
}

function numberToFrench(value: number): string {
  const units = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"];
  const teens = ["dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
  const tens: Record<number, string> = { 20: "vingt", 30: "trente", 40: "quarante", 50: "cinquante", 60: "soixante" };
  const underHundred = (number: number): string => {
    if (number < 10) return units[number];
    if (number < 20) return teens[number - 10];
    if (number < 70) {
      const ten = Math.floor(number / 10) * 10;
      const unit = number % 10;
      if (unit === 0) return tens[ten];
      if (unit === 1) return `${tens[ten]} et un`;
      return `${tens[ten]}-${units[unit]}`;
    }
    if (number < 80) {
      return number === 71 ? "soixante et onze" : `soixante-${underHundred(number - 60)}`;
    }
    if (number === 80) return "quatre-vingts";
    return `quatre-vingt-${underHundred(number - 80)}`;
  };
  const underThousand = (number: number): string => {
    if (number < 100) return underHundred(number);
    const rest = number % 100;
    const hundreds = Math.floor(number / 100);
    const hundredWords = hundreds === 1 ? "cent" : `${units[hundreds]} cent${rest === 0 ? "s" : ""}`;
    return rest === 0 ? hundredWords : `${hundredWords} ${underHundred(rest)}`;
  };

  return joinScaledChunks(
    value,
    underThousand,
    [
      { singular: "mille", plural: "mille" },
      { singular: "million", plural: "millions" },
      { singular: "milliard", plural: "milliards" },
      { singular: "billion", plural: "billions" },
    ],
    {
      separator: " ",
      omitOneBeforeFirstScale: true,
    },
  );
}

function numberToSpanish(value: number): string {
  const units = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
  const underThirty: Record<number, string> = {
    10: "diez", 11: "once", 12: "doce", 13: "trece", 14: "catorce", 15: "quince",
    16: "dieciséis", 17: "diecisiete", 18: "dieciocho", 19: "diecinueve", 20: "veinte",
    21: "veintiuno", 22: "veintidós", 23: "veintitrés", 24: "veinticuatro", 25: "veinticinco",
    26: "veintiséis", 27: "veintisiete", 28: "veintiocho", 29: "veintinueve",
  };
  const tens: Record<number, string> = { 30: "treinta", 40: "cuarenta", 50: "cincuenta", 60: "sesenta", 70: "setenta", 80: "ochenta", 90: "noventa" };
  const hundreds: Record<number, string> = {
    100: "cien", 200: "doscientos", 300: "trescientos", 400: "cuatrocientos", 500: "quinientos",
    600: "seiscientos", 700: "setecientos", 800: "ochocientos", 900: "novecientos",
  };
  const underHundred = (number: number): string => {
    if (number < 10) return units[number];
    if (number < 30) return underThirty[number];
    const unit = number % 10;
    const ten = number - unit;
    return unit === 0 ? tens[ten] : `${tens[ten]} y ${units[unit]}`;
  };
  const underThousand = (number: number): string => {
    if (number < 100) return underHundred(number);
    if (number === 100) return hundreds[100];
    const hundred = Math.floor(number / 100) * 100;
    const rest = number % 100;
    const hundredWords = hundred === 100 ? "ciento" : hundreds[hundred];
    return rest === 0 ? hundredWords : `${hundredWords} ${underHundred(rest)}`;
  };

  return joinScaledChunks(
    value,
    underThousand,
    [
      { singular: "mil", plural: "mil" },
      { singular: "millón", plural: "millones" },
      { singular: "mil millones", plural: "mil millones" },
      { singular: "billón", plural: "billones" },
    ],
    {
      separator: " ",
      omitOneBeforeFirstScale: true,
      pluralizeScale: (chunk, scale) => chunk === 1 ? scale.singular : scale.plural,
    },
  );
}

function renderNumberConverterScreen(language: LearningLanguage): HTMLElement {
  const main = createElement("main", { className: "screen number-converter-screen" });
  const parsedNumber = parseNumberInput(converterNumberInput);
  const result = parsedNumber.status === "ready"
    ? {
        ...parsedNumber,
        words: convertNumberToWords(
          parsedNumber.integerPart,
          parsedNumber.fractionalDigits,
          parsedNumber.isNegative,
          language,
        ),
      }
    : parsedNumber;

  const panel = createElement("section", {
    className: "panel number-converter-panel",
    attributes: { "aria-label": "Number converter" },
  });

  const intro = createElement("div", { className: "converter-intro" });
  intro.append(
    createElement("p", { className: "eyebrow", text: "Number converter" }),
    createElement("h1", { text: "Digits to words" }),
    createElement("p", {
      className: "converter-copy",
      text: `Convert large integers and decimals into ${language.label} words, then listen or add the result to your practice lines.`,
    }),
  );

  const form = createElement("form", { className: "number-converter-form" });
  const label = createElement("label", { className: "field-label", text: "Number" });
  const input = createElement("input", {
    className: "number-converter-input",
    attributes: {
      type: "text",
      inputmode: "decimal",
      pattern: "-?[0-9,]*(\\.[0-9]*)?",
      value: converterNumberInput,
      placeholder: "42",
      "aria-describedby": "number-converter-help",
    },
  });
  input.addEventListener("input", () => {
    converterNumberInput = input.value;
  });
  label.append(input);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    converterNumberInput = input.value;
    render();
  });

  const help = createElement("p", {
    className: "converter-help",
    text: `Supported range: ${NUMBER_CONVERTER_MIN.toLocaleString()} to ${NUMBER_CONVERTER_MAX.toLocaleString()}, with up to ${MAX_FRACTION_DIGITS} decimal digits.`,
    attributes: { id: "number-converter-help" },
  });
  const convertButton = createElement("button", {
    className: "primary-button compact-button",
    text: "Convert",
  });
  convertButton.type = "submit";
  form.append(label, help, convertButton);

  const output = createElement("section", {
    className: `number-output ${result.status}`,
    attributes: { "aria-live": "polite" },
  });

  if (result.status === "ready") {
    const converterId = getNumberConverterId(language, result.value);
    output.append(
      createElement("span", { className: "analysis-label", text: language.label }),
      createElement("p", { text: result.words }),
    );

    const actions = createElement("div", { className: "converter-actions" });
    const speakButton = createElement("button", {
      className: `primary-button compact-button ${speechState.speakingId === converterId ? "active" : ""}`,
      text: speechState.speakingId === converterId ? "Speaking" : "Speak",
    });
    speakButton.type = "button";
    speakButton.addEventListener("click", () => speakText(result.words, converterId, language));

    const addButton = createElement("button", {
      className: "secondary-button compact-button",
      text: "Add as line",
    });
    addButton.type = "button";
    addButton.addEventListener("click", () => appendLine(result.words));
    actions.append(speakButton, addButton);
    output.append(actions);
  } else {
    output.append(
      createElement("span", { className: "analysis-label", text: result.status === "empty" ? "Ready" : "Check input" }),
      createElement("p", { text: result.message }),
    );
  }

  panel.append(intro, form, output);
  main.append(panel);
  return main;
}

function renderCheatSheetScreen(language: LearningLanguage): HTMLElement {
  const main = createElement("main", { className: "screen cheat-sheet-screen" });

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
    const sectionReferences = section.references ?? [];
    if (sectionReferences.length) {
      const references = createElement("p", { className: "cheat-references" });
      references.append(document.createTextNode("Refs: "));
      sectionReferences.forEach((reference, index) => {
        const link = createElement("a", {
          text: reference.label,
          attributes: {
            href: reference.url,
            target: "_blank",
            rel: "noreferrer",
          },
        });
        references.append(link);
        if (index < sectionReferences.length - 1) {
          references.append(document.createTextNode(" · "));
        }
      });
      sectionElement.append(references);
    }
    sections.append(sectionElement);
  });

  main.append(sections);
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
  primaryRow.append(renderBreadcrumbs(), menuButton);
  controls.append(primaryRow);

  if (isTopBarOpen) {
    const actionRow = createElement("nav", {
      className: "global-actions",
      attributes: { "aria-label": "Global app controls" },
    });
    const homeButton = createElement("button", {
      className: `secondary-button compact-button ${
        screen === "input" || screen === "reading" ? "active" : ""
      }`,
      text: "Home",
      attributes: {
        "aria-current":
          screen === "input" || screen === "reading" ? "page" : "false",
      },
    });
    homeButton.type = "button";
    homeButton.addEventListener("click", () => goToScreen("input"));

    const helpButton = createElement("button", {
      className: `secondary-button compact-button ${
        screen === "help" ? "active" : ""
      }`,
      text: "Help",
      attributes: {
        "aria-current": screen === "help" ? "page" : "false",
        "aria-label": "Open help",
      },
    });
    helpButton.type = "button";
    helpButton.addEventListener("click", () => goToScreen("help"));

    const shareButton = createElement("button", {
      className: `secondary-button compact-button ${
        screen === "qr" ? "active" : ""
      }`,
      text: "QR",
      attributes: {
        "aria-current": screen === "qr" ? "page" : "false",
        "aria-label": "Open QR share page",
      },
    });
    shareButton.type = "button";
    shareButton.addEventListener("click", () => goToScreen("qr"));

    actionRow.append(
      homeButton,
      renderCheatSheetNavButton(),
      renderNumbersNavButton(),
      shareButton,
      helpButton,
      renderSettingsNavButton(),
    );
    controls.append(actionRow);
  }

  return controls;
}

function renderQrScreen(): HTMLElement {
  const main = createElement("main", { className: "screen qr-screen" });
  const panel = createElement("section", {
    className: "panel qr-panel",
    attributes: { "aria-label": "QR share page" },
  });

  if (!settings.paragraph.trim()) {
    panel.append(
      createElement("p", {
        className: "share-hint",
        text: "Add some text first, then return here to generate a QR code.",
      }),
    );
    main.append(panel);
    return main;
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
    qrImage,
    createElement("p", {
      className: "share-hint",
      text: "The QR code opens this app with the current text and language.",
    }),
    urlField,
    buttonRow,
  );
  main.append(panel);
  return main;
}

function renderSpeedPresets(): HTMLElement {
  const presetGroup = createElement("div", {
    className: "bottom-speed-presets",
    attributes: { "aria-label": "Playback speed presets" },
  });
  [0.25, 0.5, 0.75, 1, 1.5, 2].forEach((speed) => {
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
  const shouldShowEditActions = isEditingAll && screen !== "cheat-sheet";
  const controls = createElement("nav", {
    className: `bottom-playback-controls ${
      shouldShowEditActions ? "edit-mode" : ""
    }`,
    attributes: { "aria-label": "Playback controls" },
  });

  if (shouldShowEditActions) {
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
  const lines = paragraphToLines(settings.paragraph);

  appRoot.replaceChildren(
    screen === "settings"
      ? renderSettingsScreen(language)
      : screen === "cheat-sheet"
        ? renderCheatSheetScreen(language)
      : screen === "numbers"
        ? renderNumberConverterScreen(language)
      : screen === "help"
        ? renderHelpScreen()
      : screen === "qr"
        ? renderQrScreen()
      : screen === "input"
        ? renderInputScreen(language)
        : renderReadingScreen(language, lines),
  );

  appRoot.append(renderGlobalControls());
  appRoot.append(renderBottomPlaybackControls());
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

window.addEventListener("popstate", () => {
  stopSpeech();
  screen = getInitialScreen();
  isTopBarOpen = false;
  persistLastPath(screen);
  render();
});

applyTheme();
applySharedSettingsFromUrl();
persistLastPath(screen);
render();
