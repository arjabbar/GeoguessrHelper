# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Chrome extension (Manifest V3, plain JavaScript — no bundler, no framework, no tests) that screenshots a Geoguessr game tab and sends the image to the OpenAI Responses API (`/v1/responses`) with a strict JSON Schema to get location guesses. The user supplies their own OpenAI API key.

## Commands

- `npm run tailwind` — rebuild `src/styles/output.css` from `src/styles/styles.css` in watch mode (`npm run tailwind:build` for a one-shot build). Required after any Tailwind class changes; `output.css` is the file the HTML pages actually load and it is checked in.
- `npm run build` — packages the extension as `archive.zip` via `git archive master`. Note: this zips the **committed master branch**, not the working tree, so commit before building.
- To test locally: load the repo directory unpacked at `chrome://extensions` (Developer mode → "Load unpacked"), then reload the extension there after changes.

## Architecture

Three scripts communicate solely through `chrome.runtime.sendMessage` broadcasts (no `sendResponse`; every listener sees every message and filters on `request.message`):

- `src/scripts/background.js` — service worker. Handles the `captureScreen` message and the Alt+Shift+C command: verifies the active tab is geoguessr.com, captures it with `chrome.tabs.captureVisibleTab` (jpeg data URL), calls the OpenAI Responses API, and broadcasts results. Contains the two prompt/schema pairs — "short answer" (city/region/country only) vs "coach" mode (guesses with confidence, reasons, clues, coordinates, tips). Requests use `text.format` with `json_schema` + `strict: true`, add `reasoning: { effort: 'low' }` for reasoning-capable models (`supportsReasoning`), and use a 60s abort timeout.
- `src/scripts/sidepanel.js` (+ `src/sidepanel.html`) — displays the screenshot and response. Listens for `startThinking`, `updateScreenshot`, and `captureResponseReceived`; parses the JSON string from background and renders it to HTML (all user-visible strings go through `escapeHtml`).
- `src/scripts/popup.js` (+ `src/popup.html`) — settings UI. Saves `apiKey` and `selectedModel` to `chrome.storage.local` (the only shared state besides messages). The model list and `DEFAULT_MODEL` live here; background has its own `DEFAULT_MODEL` constant that must match. `popup.html` also hardcodes the same `<option>` list as a pre-render fallback — update all three together.

- `src/scripts/content.js` — MAIN-world content script on `https://www.geoguessr.com/*` at `document_start`. Wraps the `google.maps.Map` constructor (via accessor watchers on `window.google` → `maps` → `Map`, with a polling fallback) to remember every map instance, and exposes `window.__geoguessrHelperPlaceGuess(lat, lng)`, which fires a synthetic `click` on the visible guess map so Geoguessr drops its own marker. Background calls it with `chrome.scripting.executeScript({ world: 'MAIN' })` (hence the `scripting` permission) and never submits the guess.

Message flow: hotkey/button → `captureScreen` → background broadcasts `startThinking` → `updateScreenshot` → `captureResponseReceived` (with `response` or `error`) → `guessPlaced` (with `ok`, `error`, `coords`) after attempting to pin the top guess on the map. Both schemas include `coordinates` (`{lat, lng}`); coach mode uses the first guess's.

## Conventions

- Keep `manifest.json` and `package.json` versions in sync when bumping (they're both at the same version and bumped together historically).
- Styling is Tailwind v4 utility classes in the HTML plus a few custom classes (e.g. `glowing-border`) in `src/styles/styles.css`. There is no `tailwind.config.js` — v4 config lives in the CSS (`@import "tailwindcss"` + `@source`). Note v4's `border` utility defaults to `currentColor`, so border colors are set explicitly.
