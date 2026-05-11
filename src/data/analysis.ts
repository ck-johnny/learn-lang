import type { LearningLanguage } from "./languages.js";

export type WordAnalysis = {
  token: string;
  translation: string;
  lemma?: string;
  partOfSpeech?: string;
  details: string[];
};

export type SentenceAnalysis = {
  sentenceTranslation: string;
  words: WordAnalysis[];
  note?: string;
};

type LexiconEntry = Omit<WordAnalysis, "token">;

const EXACT_SENTENCES = new Map<string, string>([
  ["guten morgen", "Good morning."],
  ["ich lerne deutsch", "I am learning German."],
  [
    "heute höre ich jeden satz langsam an",
    "Today I listen to each sentence slowly.",
  ],
  ["ich bin müde", "I am tired."],
  ["du bist freundlich", "You are friendly."],
  ["er ist ein mann", "He is a man."],
  ["sie ist eine frau", "She is a woman."],
  ["wir sind studenten", "We are students."],
]);

const GERMAN_LEXICON = new Map<string, LexiconEntry>([
  [
    "ich",
    {
      translation: "I",
      lemma: "ich",
      partOfSpeech: "pronoun",
      details: ["1st person", "singular", "nominative"],
    },
  ],
  [
    "du",
    {
      translation: "you",
      lemma: "du",
      partOfSpeech: "pronoun",
      details: ["2nd person", "singular", "informal"],
    },
  ],
  [
    "er",
    {
      translation: "he",
      lemma: "er",
      partOfSpeech: "pronoun",
      details: ["3rd person", "singular", "masculine"],
    },
  ],
  [
    "sie",
    {
      translation: "she/they/you",
      lemma: "sie",
      partOfSpeech: "pronoun",
      details: ["feminine singular or plural", "formal you when capitalized"],
    },
  ],
  [
    "es",
    {
      translation: "it",
      lemma: "es",
      partOfSpeech: "pronoun",
      details: ["3rd person", "singular", "neuter"],
    },
  ],
  [
    "wir",
    {
      translation: "we",
      lemma: "wir",
      partOfSpeech: "pronoun",
      details: ["1st person", "plural"],
    },
  ],
  [
    "bin",
    {
      translation: "am",
      lemma: "sein",
      partOfSpeech: "verb",
      details: ["present tense", "1st person singular", "ich bin"],
    },
  ],
  [
    "bist",
    {
      translation: "are",
      lemma: "sein",
      partOfSpeech: "verb",
      details: ["present tense", "2nd person singular", "du bist"],
    },
  ],
  [
    "ist",
    {
      translation: "is",
      lemma: "sein",
      partOfSpeech: "verb",
      details: ["present tense", "3rd person singular", "er/sie/es ist"],
    },
  ],
  [
    "sind",
    {
      translation: "are",
      lemma: "sein",
      partOfSpeech: "verb",
      details: ["present tense", "plural or formal you", "wir/sie/Sie sind"],
    },
  ],
  [
    "seid",
    {
      translation: "are",
      lemma: "sein",
      partOfSpeech: "verb",
      details: ["present tense", "2nd person plural", "ihr seid"],
    },
  ],
  [
    "lerne",
    {
      translation: "learn / am learning",
      lemma: "lernen",
      partOfSpeech: "verb",
      details: ["present tense", "1st person singular", "regular verb"],
    },
  ],
  [
    "lernt",
    {
      translation: "learns / are learning",
      lemma: "lernen",
      partOfSpeech: "verb",
      details: ["present tense", "3rd person singular or 2nd person plural"],
    },
  ],
  [
    "höre",
    {
      translation: "hear / listen",
      lemma: "hören",
      partOfSpeech: "verb",
      details: ["present tense", "1st person singular", "separable with an"],
    },
  ],
  [
    "an",
    {
      translation: "on / at / particle",
      lemma: "an",
      partOfSpeech: "preposition/particle",
      details: ["can mark a separable verb, as in anhören"],
    },
  ],
  [
    "deutsch",
    {
      translation: "German",
      lemma: "Deutsch",
      partOfSpeech: "noun/adjective",
      details: ["language name", "capitalized as a noun"],
    },
  ],
  [
    "guten",
    {
      translation: "good",
      lemma: "gut",
      partOfSpeech: "adjective",
      details: ["accusative masculine ending in guten Morgen"],
    },
  ],
  [
    "morgen",
    {
      translation: "morning / tomorrow",
      lemma: "Morgen",
      partOfSpeech: "noun/adverb",
      details: ["masculine noun when capitalized", "singular"],
    },
  ],
  [
    "heute",
    {
      translation: "today",
      lemma: "heute",
      partOfSpeech: "adverb",
      details: ["time adverb"],
    },
  ],
  [
    "jeden",
    {
      translation: "each / every",
      lemma: "jeder",
      partOfSpeech: "determiner",
      details: ["accusative masculine singular before Satz"],
    },
  ],
  [
    "satz",
    {
      translation: "sentence",
      lemma: "Satz",
      partOfSpeech: "noun",
      details: ["masculine", "singular"],
    },
  ],
  [
    "langsam",
    {
      translation: "slowly",
      lemma: "langsam",
      partOfSpeech: "adverb/adjective",
      details: ["manner word"],
    },
  ],
  [
    "der",
    {
      translation: "the",
      lemma: "der",
      partOfSpeech: "article",
      details: ["masculine nominative or feminine genitive/dative"],
    },
  ],
  [
    "die",
    {
      translation: "the",
      lemma: "die",
      partOfSpeech: "article",
      details: ["feminine singular or plural nominative/accusative"],
    },
  ],
  [
    "das",
    {
      translation: "the",
      lemma: "das",
      partOfSpeech: "article",
      details: ["neuter singular", "nominative/accusative"],
    },
  ],
  [
    "ein",
    {
      translation: "a / an",
      lemma: "ein",
      partOfSpeech: "article",
      details: ["masculine or neuter singular"],
    },
  ],
  [
    "eine",
    {
      translation: "a / an",
      lemma: "ein",
      partOfSpeech: "article",
      details: ["feminine singular"],
    },
  ],
  [
    "mann",
    {
      translation: "man",
      lemma: "Mann",
      partOfSpeech: "noun",
      details: ["masculine", "singular"],
    },
  ],
  [
    "frau",
    {
      translation: "woman",
      lemma: "Frau",
      partOfSpeech: "noun",
      details: ["feminine", "singular"],
    },
  ],
  [
    "kind",
    {
      translation: "child",
      lemma: "Kind",
      partOfSpeech: "noun",
      details: ["neuter", "singular"],
    },
  ],
  [
    "kinder",
    {
      translation: "children",
      lemma: "Kind",
      partOfSpeech: "noun",
      details: ["neuter", "plural"],
    },
  ],
  [
    "student",
    {
      translation: "student",
      lemma: "Student",
      partOfSpeech: "noun",
      details: ["masculine", "singular"],
    },
  ],
  [
    "studenten",
    {
      translation: "students",
      lemma: "Student",
      partOfSpeech: "noun",
      details: ["masculine", "plural or weak noun form"],
    },
  ],
  [
    "müde",
    {
      translation: "tired",
      lemma: "müde",
      partOfSpeech: "adjective",
      details: ["predicate adjective", "unchanged after sein"],
    },
  ],
  [
    "freundlich",
    {
      translation: "friendly",
      lemma: "freundlich",
      partOfSpeech: "adjective",
      details: ["predicate adjective", "unchanged after sein"],
    },
  ],
]);

function normalizeToken(token: string): string {
  return token.toLocaleLowerCase("de-DE").replace(/[^\p{L}äöüß-]/gu, "");
}

function normalizeSentence(sentence: string): string {
  return sentence
    .toLocaleLowerCase("de-DE")
    .replace(/[^\p{L}äöüß\s-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitWords(text: string): string[] {
  return text.match(/[\p{L}äöüÄÖÜß]+(?:-[\p{L}äöüÄÖÜß]+)*/gu) ?? [];
}

export function analyzeSentence(
  text: string,
  language: LearningLanguage,
): SentenceAnalysis {
  const words = splitWords(text).map((token) => {
    const entry =
      language.id === "de" ? GERMAN_LEXICON.get(normalizeToken(token)) : undefined;

    return {
      token,
      translation: entry?.translation ?? "Offline glossary gap",
      lemma: entry?.lemma,
      partOfSpeech: entry?.partOfSpeech,
      details:
        entry?.details ??
        [
          language.id === "de"
            ? "Not in the offline word glossary yet"
            : "Offline grammar glossary is available for German only",
        ],
    };
  });

  if (language.id !== "de") {
    return {
      sentenceTranslation: `No offline sentence translation for ${language.label} yet.`,
      words,
      note: "Live sentence translation works online. Word notes are offline grammar hints.",
    };
  }

  const exactTranslation = EXACT_SENTENCES.get(normalizeSentence(text));
  const knownTranslations = words
    .filter((word) => word.translation !== "Offline glossary gap")
    .map((word) => word.translation);

  return {
    sentenceTranslation:
      exactTranslation ??
      (knownTranslations.length > 0
        ? `Approximate: ${knownTranslations.join(" ")}`
        : "No offline translation match yet."),
    words,
    note: exactTranslation
      ? undefined
      : "Offline translation is approximate and based on known glossary words.",
  };
}
