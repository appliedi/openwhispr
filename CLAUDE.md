# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenWhispr is an Electron desktop dictation app using whisper.cpp and NVIDIA Parakeet (sherpa-onnx) for local speech-to-text, with cloud options via OpenAI API. Built with React 19, TypeScript, Tailwind CSS v4, Vite, and Electron 36.

## Development Commands

```bash
# Development (hot reload for renderer, compiles native helpers)
npm run dev

# Run Electron only (no renderer dev server)
npm run dev:main

# Run Vite dev server only (renderer)
npm run dev:renderer

# Lint (runs ESLint on both root and src/)
npm run lint

# Format (ESLint fix + Prettier)
npm run format

# Format check (CI-friendly, no writes)
npm run format:check

# TypeScript type checking (src/ only)
npm run typecheck

# Combined quality check (format:check + typecheck)
npm run quality-check

# Check i18n translation completeness
npm run i18n:check

# Build renderer only
npm run build:renderer

# Build unsigned app for local testing
npm run pack

# Full production build (requires signing certs)
npm run build

# Platform-specific builds
npm run build:mac
npm run build:win
npm run build:linux

# Download native binaries for current platform
npm run download:whisper-cpp
npm run download:llama-server
npm run download:sherpa-onnx

# Compile native helpers (globe listener, fast paste, key listener)
npm run compile:native
```

There is no test suite. Quality checks are `npm run quality-check` (lint + typecheck).

## Architecture

### Dual Window System
- **Main Window**: Minimal always-on-top overlay for dictation (draggable)
- **Control Panel**: Full settings/history window (normal window)
- Both render from the same React codebase, differentiated by URL parameters

### Process Separation
- **Main process** (`main.js`): Electron lifecycle, IPC handlers, database, all manager modules
- **Renderer process** (`src/`): React app with Vite, context isolation enforced
- **Preload script** (`preload.js`): Secure IPC bridge exposing `window.api`

### Audio Pipeline
MediaRecorder API → Blob → ArrayBuffer → IPC → temp file → whisper.cpp/sherpa-onnx → result → clipboard + auto-paste → temp file cleanup

### Key Directories
- `src/helpers/` — Main process modules (audio, clipboard, database, hotkeys, whisper, IPC, windows)
- `src/components/` — React components (App.jsx is main overlay, ControlPanel.tsx is settings)
- `src/hooks/` — React hooks (audio recording, settings, permissions, clipboard)
- `src/services/` — ReasoningService.ts for AI agent processing
- `src/models/` — Model registry (single source of truth for all AI models)
- `src/locales/{lang}/translation.json` — i18n translation files (9 languages)
- `resources/` — Native source code (Swift, C) and `bin/` for compiled binaries
- `scripts/` — Build/download scripts for native dependencies

### Model Registry
All AI model definitions live in `src/models/modelRegistryData.json` as the single source of truth. `ModelRegistry.ts` wraps it. Config files (`src/config/aiProvidersConfig.ts`, `src/utils/languages.ts`) derive from the registry — never hardcode model lists elsewhere.

### IPC Pattern
New IPC channels must be added in **both** `src/helpers/ipcHandlers.js` (handler) and `preload.js` (exposed method). The renderer accesses IPC via `window.api.*`.

### Anthropic API Routing
Anthropic calls route through IPC to the main process (to avoid CORS). OpenAI and Gemini call directly from the renderer.

## Critical Rules

### Internationalization (i18n) — MANDATORY
All user-facing strings must use the i18n system. Never hardcode UI text.

```tsx
import { useTranslation } from "react-i18next";
const { t } = useTranslation();
// t("notes.list.title")
// t("notes.upload.using", { model: "Whisper" })
```

- Every new string needs keys in `en/translation.json` AND all 8 other language files
- Do NOT translate: brand names (OpenWhispr, Pro), technical terms (Markdown), format names (MP3, WAV), AI system prompts
- Group keys by feature area (e.g., `notes.editor.*`, `referral.toasts.*`)
- Run `npm run i18n:check` to verify completeness

### Adding Features Checklist
1. **New IPC channel** → add to both `ipcHandlers.js` and `preload.js`
2. **New setting** → update `src/hooks/useSettings.ts` and `src/components/SettingsPage.tsx`
3. **New UI component** → follow shadcn/ui patterns in `src/components/ui/`
4. **New manager module** → create in `src/helpers/`, initialize in `main.js`
5. **New UI strings** → add translation keys to all 9 locale files

### TypeScript
New React components should be TypeScript (`.tsx`). Main process helpers remain `.js`.

## Platform-Specific Details

### macOS
- Requires accessibility permissions for auto-paste (AppleScript)
- Globe/Fn key listener compiled from Swift source (`resources/globe-listener.swift`)
- System settings opened via `x-apple.systempreferences:` URL scheme

### Windows
- Native `windows-key-listener.exe` enables true push-to-talk (low-level keyboard hook)
- Native `windows-fast-paste.exe` for reliable paste via Win32 SendInput
- Both binaries auto-downloaded from GitHub releases; fallback to tap mode if unavailable

### Linux
- Native `linux-fast-paste` binary (XTest/uinput) is primary paste mechanism
- Fallback chain: native binary → wtype → ydotool → xdotool
- GNOME Wayland: global hotkeys via D-Bus + gsettings (push-to-talk unavailable, tap-only)
- No URL scheme for system settings (privacy settings button hidden in UI)

## Database Schema

```sql
CREATE TABLE transcriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  original_text TEXT NOT NULL,
  processed_text TEXT,
  is_processed BOOLEAN DEFAULT 0,
  processing_method TEXT DEFAULT 'none',
  agent_name TEXT,
  error TEXT
);
```

## Settings Storage
- **localStorage**: UI settings (whisperModel, useLocalWhisper, language, hotkey, agentName, customDictionary, etc.)
- **`.env` file**: API keys and engine preferences (persisted via `saveAllKeysToEnvFile()`)

## Debug Mode
Enable with `--log-level=debug` or `OPENWHISPR_LOG_LEVEL=debug` in `.env`. Logs written to platform-specific app data directory.

## Vite Configuration
- Dev server runs on port 5183 (configurable via `VITE_DEV_SERVER_PORT`)
- Path alias: `@` maps to `src/` directory
- Renderer builds to `src/dist/`
- Node/Electron modules are externalized in Rollup config
