# lil agents for Windows

Animated desktop coding buddies for Windows.

`lil agents` puts Bruce and Jazz above your taskbar, gives each one a floating AI chat popover, and lets you work with local coding CLIs without living in a terminal full-time.

This repo is the Windows port of the original macOS app, built with Electron, React, and Vite.

## Why it exists

Most AI coding tools live in a browser tab or terminal pane. `lil agents` turns them into small desktop companions instead:

- animated characters that stay on your desktop
- quick popover chat instead of a full IDE panel
- per-agent provider selection and workspace-aware prompts
- lightweight settings for placement, theme, size, visibility, and model control

## What ships today

- animated `Bruce` and `Jazz` desktop agents
- floating popover chat anchored to each agent
- provider support for `Claude Code`, `Codex`, `Copilot`, `Gemini`, and `OpenCode`
- per-agent provider switching
- per-agent size controls: `large`, `medium`, `small`
- per-agent visibility toggles from settings and tray
- display pinning and per-agent dragging
- tray icon, settings window, and update checking
- workspace picker with persisted app settings
- markdown rendering for chat replies
- custom completion chimes
- portable and NSIS Windows builds via `electron-builder`

## Current status

This project is usable today and significantly closer to the original macOS experience than the first Windows beta.

Still in progress:

- taskbar auto-hide and multi-monitor behavior need more polish
- full in-app auto-update is not implemented yet
- walking behavior is still being tuned against the Windows animation assets

## Requirements

- Windows 11 x64
- Bun
- Node.js 22+
- at least one supported CLI installed and available on `PATH`

## Supported providers

- `Claude Code`
- `Codex`
- `Copilot`
- `Gemini`
- `OpenCode`

You can also set one global default model per provider from the advanced settings section. Leave a model field blank to use that provider CLI's own default.

## Development

Install dependencies:

```bash
bun install
```

Run the desktop app with the Vite dev server:

```bash
bun dev
```

Notes:

- renderer changes hot reload through Vite
- Electron main/preload changes still require a restart of `bun dev`
- the first real prompt will ask you to choose a workspace

## Run a built app locally

```bash
bun start
```

`bun start` rebuilds first, then launches the local production-style app.

## Build releases

```bash
bun run dist:portable
bun run dist:nsis
```

Artifacts are written to `release/`.

## Project structure

- `electron/main.ts`: tray, windows, persistence, animation loop, provider process handling
- `electron/preload.ts`: safe renderer bridge
- `src/App.tsx`: renderer UI for agents, popovers, bubbles, and settings
- `src/lib/types.ts`: shared renderer/preload types
- `public/agents/`: converted Bruce and Jazz animation assets
- `public/icons.ico`: Windows app, tray, and installer icon

## Roadmap

- improve taskbar auto-hide and multi-monitor behavior
- add a full in-app updater flow instead of release-page handoff
- keep refining movement, hit testing, and desktop feel

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

MIT. See [`LICENSE`](./LICENSE).
