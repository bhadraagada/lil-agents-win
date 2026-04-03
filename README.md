# lil agents for Windows

`lil agents` is a Windows desktop app that puts animated characters above the taskbar and opens a floating terminal-style AI chat when you click them.

![alt text](image.png)

This repo is the Electron + React + Vite Windows port.

## Features

- animated `Bruce` and `Jazz` desktop agents
- floating popover chat anchored to each agent
- provider support for `Claude Code`, `Codex`, `Copilot`, `Gemini`, and `OpenCode`
- tray icon and settings window
- workspace picker and persisted app settings
- themes, onboarding, thinking bubbles, and completion sounds
- per-provider global model settings with advanced fields
- portable and NSIS packaging via `electron-builder`

## Status

This project is currently an early Windows beta.

Working today:

- floating agent windows on the main display
- per-agent chat windows and buddy persona prompts
- Windows-friendly converted Bruce/Jazz animation assets
- per-agent provider selection, size controls, and visibility toggles
- provider selection for Claude Code, Codex, Copilot, Gemini, and OpenCode
- transcript rendering with user, assistant, tool-use, tool-result, and error messages
- markdown rendering with inline code, code blocks, bullets, and links
- manual lift/spread calibration for placement above the taskbar
- display pinning and per-agent dragging
- tray update checking and custom completion chimes
- persisted per-provider model text fields that fall back to each CLI default when left blank

Current limitations:

- taskbar auto-hide and multi-monitor edge cases are not fully handled yet
- signing and auto-update infrastructure are not configured yet
- walking behavior is still being tuned against the converted Windows assets

## Future Plans

- better taskbar auto-hide and multi-monitor visibility behavior
- full in-app auto-update flow instead of release-page handoff
- more iteration on walking behavior against the converted Windows assets

## Requirements

- Windows 11 x64
- Node.js 22+
- npm 10+
- at least one supported CLI installed and available on `PATH`

## Getting started

```bash
npm install
npm run dev
```

Notes:

- the renderer uses Vite HMR
- Electron main/preload changes currently require restarting `npm run dev`
- the app will prompt for a workspace folder the first time you send a real prompt

## Build

```bash
npm run build
npm run dist:portable
npm run dist:nsis
```

## Project structure

- `electron/main.ts`: window management, tray, persistence, animation loop, and provider process handling
- `electron/preload.ts`: safe renderer bridge
- `src/App.tsx`: renderer UI for settings, agents, bubbles, and popovers
- `src/lib/types.ts`: shared renderer/preload types
- `public/agents/`: converted Windows animation assets

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

MIT. See [`LICENSE`](./LICENSE).
