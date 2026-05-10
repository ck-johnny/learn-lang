import { DEFAULT_LANGUAGE } from "./languages.js";

const STORAGE_KEY = "lang-learn-settings";

export type PersistedSettings = {
  paragraph: string;
  speed: number;
  languageId: string;
  theme: "light" | "dark";
  letterPlaybackMode: "extra-slow" | "repeat" | "example";
  lastPath: string;
};

export const DEFAULT_SETTINGS: PersistedSettings = {
  paragraph: "",
  speed: 1,
  languageId: DEFAULT_LANGUAGE.id,
  theme: "light",
  letterPlaybackMode: "extra-slow",
  lastPath: "/",
};

function isBrowserStorageAvailable(): boolean {
  return typeof window !== "undefined" && "localStorage" in window;
}

export function loadSettings(): PersistedSettings {
  if (!isBrowserStorageAvailable()) {
    return DEFAULT_SETTINGS;
  }

  const rawSettings = window.localStorage.getItem(STORAGE_KEY);
  if (!rawSettings) {
    return DEFAULT_SETTINGS;
  }

  try {
    const parsedSettings = JSON.parse(
      rawSettings,
    ) as Partial<PersistedSettings>;

    return {
      paragraph:
        typeof parsedSettings.paragraph === "string"
          ? parsedSettings.paragraph
          : DEFAULT_SETTINGS.paragraph,
      speed:
        typeof parsedSettings.speed === "number"
          ? parsedSettings.speed
          : DEFAULT_SETTINGS.speed,
      languageId:
        typeof parsedSettings.languageId === "string"
          ? parsedSettings.languageId
          : DEFAULT_SETTINGS.languageId,
      theme:
        parsedSettings.theme === "dark" || parsedSettings.theme === "light"
          ? parsedSettings.theme
          : DEFAULT_SETTINGS.theme,
      letterPlaybackMode:
        parsedSettings.letterPlaybackMode === "extra-slow" ||
        parsedSettings.letterPlaybackMode === "repeat" ||
        parsedSettings.letterPlaybackMode === "example"
          ? parsedSettings.letterPlaybackMode
          : DEFAULT_SETTINGS.letterPlaybackMode,
      lastPath:
        typeof parsedSettings.lastPath === "string"
          ? parsedSettings.lastPath
          : DEFAULT_SETTINGS.lastPath,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: PersistedSettings): void {
  if (!isBrowserStorageAvailable()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
