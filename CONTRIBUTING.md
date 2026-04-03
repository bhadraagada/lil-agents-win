# Contributing

## Setup

```bash
npm install
npm run dev
```

## Before opening a PR

```bash
npm run lint
npm run build
```

## Guidelines

- keep changes focused and minimal
- preserve the floating desktop-agent interaction model
- avoid committing generated output such as `dist/`, `dist-electron/`, or `release/`
- test both the Electron shell behavior and the renderer UI when touching app flow
- document any Windows-specific limitations or assumptions in the PR

## Areas that need help

- better Windows taskbar detection and multi-monitor support
- more provider integrations
- packaging, signing, and auto-update support
- animation cleanup and movement tuning
