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
  {
    id: "en",
    label: "English",
    nativeLabel: "English",
    speechLang: "en-US",
    placeholder: "Good morning!\nI am practicing English.\nI listen to each sentence slowly.",
  },
  {
    id: "fr",
    label: "French",
    nativeLabel: "Français",
    speechLang: "fr-FR",
    placeholder:
      "Bonjour !\nJ'apprends le français.\nJ'écoute chaque phrase lentement.",
  },
  {
    id: "es",
    label: "Spanish",
    nativeLabel: "Español",
    speechLang: "es-ES",
    placeholder:
      "Buenos días.\nEstoy aprendiendo español.\nEscucho cada frase lentamente.",
  },
];

export const DEFAULT_LANGUAGE = SUPPORTED_LANGUAGES[0];

export function findLanguage(languageId: string): LearningLanguage {
  return (
    SUPPORTED_LANGUAGES.find((language) => language.id === languageId) ??
    DEFAULT_LANGUAGE
  );
}
