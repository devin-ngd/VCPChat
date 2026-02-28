# VCPChat/modules — Core Frontend Logic

## Overview
Central module hub for VCPChat. 33 files across 3 subdirectories handling chat, rendering, IPC, file management, settings, UI, and utilities. All modules are plain JS (no TypeScript, no bundler).

## Structure
```text
modules/
├── chatManager.js          # Chat send/receive, SSE streaming, message history
├── vcpClient.js            # VCP server HTTP client, auth, endpoint config
├── messageRenderer.js      # Message rendering orchestrator (21 renderers)
├── fileManager.js          # File attach, read, multi-format parsing
├── settingsManager.js      # Per-agent settings persistence
├── global-settings-manager.js  # Global app settings
├── uiManager.js            # UI state, window management, layout
├── ui-helpers.js           # DOM utility functions
├── searchManager.js        # Global chat search (Ctrl+F)
├── filterManager.js        # Content filtering
├── contextSanitizer.js     # Context cleanup for AI requests
├── inputEnhancer.js        # Input box enhancements (@mentions, paste handling)
├── emoticonManager.js      # Emoji/sticker URL repair and management
├── event-listeners.js      # Global event binding
├── interruptHandler.js     # VCP tool call interruption
├── itemListManager.js      # Generic list UI component
├── topicListManager.js     # Chat topic list management
├── topicSummarizer.js      # AI-powered topic summarization
├── modelUsageTracker.js    # Token/model usage tracking
├── notificationRenderer.js # System notifications (Win/email)
├── lyricFetcher.js         # Cloud lyrics download
├── musicScannerWorker.js   # Music library scanner (worker)
├── speechRecognizer.js     # Speech-to-text (Puppeteer bridge)
├── SovitsTTS.js            # GPT-SoVITS TTS integration
├── todoReminderManager.js  # ★ Custom fork plugin — todo reminders
├── image-viewer.js/.html   # Standalone image viewer window
├── text-viewer.js/.html    # Standalone text viewer window
├── DASP.txt                # Audio processing config/data
├── ipc/                    # IPC handlers (18 files)
└── renderer/               # Stream/render modules (11 files)
    └── utils/              # Shared utilities
```

## IPC Handlers (`ipc/`)
Each file registers `ipcMain.handle` / `ipcMain.on` handlers for a specific domain:
- `agentHandlers.js` — Agent CRUD, config read/write
- `chatHandlers.js` — Chat history read/write/delete, topic management
- `canvasHandlers.js` — Canvas file operations, sandbox execution
- `musicHandlers.js` — Music player control, playlist management
- `noteHandlers.js` — Note CRUD, folder management
- `fileHandlers.js` — File system operations (read, write, search)
- `settingHandlers.js` — Settings read/write
- `groupHandlers.js` — Group chat management
- `themeHandlers.js` — Theme loading, generation
- `windowHandlers.js` — Window lifecycle, modals
- `searchHandlers.js` — Global search across chat history
- `clipboardHandlers.js` — Clipboard operations, paste parsing
- `exportHandlers.js` — Chat export (MD, HTML)
- `attachmentHandlers.js` — Attachment management
- `selectionHandlers.js` — Selection assistant (划词小助手)
- `distributedHandlers.js` — Distributed server node operations
- `desktopAwarenessHandlers.js` — Desktop system sensing/control
- `ttsHandlers.js` — TTS playback control

## Renderer Modules (`renderer/`)
Handle streaming SSE content and rendering pipeline:
- `streamManager.js` — SSE stream processing, chunk buffering
- `contentProcessor.js` — Content parsing (MD, HTML, code blocks)
- `domBuilder.js` — DOM node construction for chat bubbles
- `codeBlockHandler.js` — Code highlighting, copy, edit, execute buttons
- `mathRenderer.js` — KaTeX math rendering
- `mermaidRenderer.js` — Mermaid diagram rendering
- `htmlRenderer.js` — HTML/div bubble rendering
- `threeRenderer.js` — Three.js 3D preview
- `pythonRunner.js` — Pyodide Python execution
- `animeRenderer.js` — Anime.js animation rendering
- `diffRenderer.js` — Real-time chat history diff rendering

## Conventions
- **No module bundler**: Plain `require()` / direct script loading. No webpack/vite.
- **IPC naming**: Handler files map 1:1 to feature domains. Channel names follow `domain:action` pattern.
- **Renderer modules**: Imported by `messageRenderer.js` which orchestrates the rendering pipeline.
- **Fork-specific**: `todoReminderManager.js` is the only custom file — upstream merge-safe.

## Key Data Flows
```
User Input → chatManager.js → vcpClient.js → VCPToolBox Server
                                                    ↓
Server SSE → streamManager.js → contentProcessor.js → messageRenderer.js → DOM
                                                                              ↓
                                                              21 renderers (code, math, mermaid, html, ...)
```
