export type LearningLanguage = {
  id: string;
  label: string;
  nativeLabel: string;
  speechLang: string;
  placeholder: string;
};

export const SUPPORTED_LANGUAGES: LearningLanguage[] = [
  {
    id: "de",
    label: "German",
    nativeLabel: "Deutsch",
    speechLang: "de-DE",
    placeholder:
      "Guten Morgen!\nIch lerne Deutsch.\nHeute höre ich jeden Satz langsam an.",
  },
];

export const DEFAULT_LANGUAGE = SUPPORTED_LANGUAGES[0];

export function findLanguage(languageId: string): LearningLanguage {
  return (
    SUPPORTED_LANGUAGES.find((language) => language.id === languageId) ??
    DEFAULT_LANGUAGE
  );
}
