# Lang Learn PWA

A minimal installable web app for learning German by listening. Paste a paragraph, tap a line, and hear the browser speak it aloud.

## What it does

- Paste a German paragraph on the input screen.
- Each newline becomes a tappable line on the reading screen.
- Tap a line to speak it with the browser's Text-to-Speech voice for German (`de-DE`). Tapping another line interrupts the current one.
- Floating action button opens a 0.5×–2.0× playback speed slider in 0.25× steps.
- Last paragraph, selected speed, and selected language are remembered with `localStorage`.
- Installs as a PWA and caches the app shell for offline use after first load.
- Language metadata is centralized so more languages can be added later.

## Browser support

The app uses the Web Speech API. Chrome and Edge generally provide the best support; Safari support depends on the platform, and Firefox support may be unavailable. Browser voice lists come from the operating system/browser, so a German voice may need to be installed in system settings.

Unlike the Android app, browsers cannot open a system voice-data installer directly. If no German voice is found, the PWA shows guidance and falls back to the browser default voice where possible.

## Build

This project has no runtime package dependencies. It compiles the TypeScript source and copies static PWA assets into `dist/`:

```sh
npm run build
```

## Deploy to GitHub Pages

This repository must be deployed from the generated `dist/` directory, not directly from the repository root. The root source tree does not contain the compiled `main.js`, copied `styles.css`, or copied PWA manifest that browsers request in production.

The included GitHub Actions workflow builds the app on every push to `main` and publishes `dist/` to GitHub Pages. In the repository settings, set **Pages > Build and deployment > Source** to **GitHub Actions**.

## Preview locally

```sh
npm run dev
```

Then open <http://localhost:4173>, or the port printed by the dev server if
`4173` is already in use.

The dev server watches `src/`, `public/`, `index.html`, and `tsconfig.json`.
When you save a change, it rebuilds `dist/` and reloads the browser tab.

## Project layout

```txt
├── index.html                  app HTML shell
├── public/
│   ├── manifest.webmanifest    PWA install metadata
│   ├── sw.js                   offline app-shell service worker
│   └── icons/icon.svg          app icon
├── scripts/
│   ├── copy-static.mjs         copies static files after TypeScript build
│   └── serve.mjs               small local static server for preview
└── src/
    ├── main.ts                 UI, navigation, TTS, speed dialog, service worker registration
    ├── styles.css              responsive mobile-first styling
    └── data/
        ├── languages.ts        language metadata, currently German
        └── storage.ts          localStorage persistence helpers
```

## Add another language

Add a new entry to `SUPPORTED_LANGUAGES` in `src/data/languages.ts`:

```ts
{
  id: 'fr',
  label: 'French',
  nativeLabel: 'Français',
  speechLang: 'fr-FR',
  placeholder: 'Bonjour !\nJe pratique le français.',
}
```
