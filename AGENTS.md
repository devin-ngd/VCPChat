# VCPChat — Electron Desktop AI Chat Client

## Overview
Electron desktop app serving as the official frontend for VCPToolBox. Communicates via HTTP/SSE (chat) and WebSocket (notifications, logs, real-time sync). Not a thin client — contains substantial local logic: audio engine, file management, rendering engines, Canvas IDE, music player, CLI terminal, and 15+ feature modules.

**Entry**: `main.js` → `main.html` (preload: `preload.js`, renderer: `renderer.js`)
**Tech**: Electron 37, Node.js, HTML/CSS/JS, Python (audio engine), Rust (audio engine)
**License**: CC BY-NC-SA 4.0

## Directory Structure
```text
VCPChat/
├── main.js                # Electron main process entry
├── preload.js             # Context bridge (main↔renderer IPC)
├── renderer.js            # Renderer process entry
├── main.html              # Main window HTML
├── style.css / themes.css # Global styles
├── modules/               # Core logic (33 files) — see modules/AGENTS.md
│   ├── ipc/               # 18 IPC handler modules
│   ├── renderer/          # 11 stream/render modules
│   └── utils/             # Shared utilities
├── Assistantmodules/      # Agent management UI
├── Canvasmodules/         # Collaborative Canvas/IDE workspace
├── Dicemodules/           # 3D physics dice system
├── Flowlockmodules/       # Flow Lock (AI autonomous mode)
├── Forummodules/          # VCP Forum client
├── Groupmodules/          # Agent group chat
├── Memomodules/           # Deep recall/memory visualization
├── Musicmodules/          # Music player + Hi-Res audio
├── Notemodules/           # Note-taking system
├── Promptmodules/         # Prompt/preset management
├── RAGmodules/            # RAG visualization
├── Themesmodules/         # Theme system + generator
├── Translatormodules/     # Translation window
├── VchatManager/          # Chat history data manager (sub-Electron app)
├── VCPHumanToolBox/       # User-facing VCP tool GUI + workflow engine
├── Voicechatmodules/      # Voice chat (Puppeteer-based STT)
├── audio_engine/          # Python audio engine (WASAPI, DSD)
├── rust_audio_engine/     # Rust audio engine (SIMD, resampling)
├── VCPDistributedServer/  # Embedded distributed server node
├── AppData/               # User data (agents, groups, notes, themes, attachments)
├── public/                # Static assets served locally
├── assets/                # App icons, images
└── styles/                # Additional CSS
```

## Quick Locator
| Task | Location | Notes |
|------|----------|-------|
| App lifecycle, window creation | `main.js` | BrowserWindow config, IPC setup |
| IPC bridge definitions | `preload.js` | contextBridge.exposeInMainWorld |
| Renderer bootstrap | `renderer.js` | Module initialization order |
| Chat send/receive logic | `modules/chatManager.js` | HTTP/SSE communication |
| Message rendering pipeline | `modules/messageRenderer.js` + `modules/renderer/` | 21 renderers (MD, KaTeX, HTML, Mermaid, Three.js, Anime.js, etc.) |
| Stream processing | `modules/renderer/streamManager.js` | SSE chunk handling, diff rendering |
| File handling (attach, read) | `modules/fileManager.js` | Multi-format: PDF, DOCX, images, video |
| Settings persistence | `modules/settingsManager.js` + `modules/global-settings-manager.js` | Per-agent and global settings |
| VCP server communication | `modules/vcpClient.js` | API calls, auth, server config |
| Agent CRUD | `Assistantmodules/` | Agent create/edit/delete, avatar, model params |
| Group chat orchestration | `Groupmodules/` | Sequential, natural-random, invite-only modes |
| Canvas collaborative IDE | `Canvasmodules/` | Real-time co-editing, sandbox execution, version control |
| Music player | `Musicmodules/` | WASAPI, DSD 256bit, IIR EQ, AI lyrics |
| Custom plugin (todo) | `modules/todoReminderManager.js` | Fork-specific — todo reminder system |

## Conventions
- **No `src/` directory**: All source files at root or in feature module directories.
- **Feature modules pattern**: Each major feature has its own `*modules/` directory at root level (15 total).
- **IPC pattern**: Main process handlers in `modules/ipc/*.js`, renderer calls via `preload.js` bridge.
- **Data directory**: `AppData/` stores all persistent user data — agents, chat history, notes, themes, attachments.
- **Rendering**: 21 renderers (Markdown, KaTeX, HTML, Mermaid, Python/Pyodide, Three.js, Anime.js, draw.io, CSV, PDF, etc.). All support streaming.
- **Chinese comments**: Code comments and UI strings are primarily in Chinese. Identifiers are English.
- **No test suite**: No formal tests. Manual/production validation only.
- **Electron-specific**: Uses `contextBridge` for secure IPC. No `nodeIntegration` in renderer.

## Anti-Patterns
- **Never commit** `AppData/` user data or `config.env` to version control.
- **Never modify** upstream feature module files for custom features — create new files (like `todoReminderManager.js`).
- **Never assume** renderer has Node.js access — all Node APIs go through `preload.js` IPC bridge.
- **Audio engine**: Requires Python + Rust dependencies installed separately (`pip install -r requirements.txt`).

## Build Commands
```bash
npm install                  # Install Node dependencies
pip install -r requirements.txt  # Audio engine dependencies
npm start                    # Dev mode (electron .)
npm run pack                 # Build unpacked (electron-builder --dir)
npm run dist                 # Build installer (electron-builder)
```

## Notes
- This is a `devin-ngd` fork of `lioensky/VCPChat`. Custom code: `modules/todoReminderManager.js`.
- Wallpaper pack and audio decoder pack must be downloaded separately from GitHub releases.
- GPT-SoVITS integration requires separate engine download and patched files from `SovitsTest/`.
- Parent doc: `../AGENTS.md` (monorepo root). Backend: `../VCPToolBox/AGENTS.md`.
