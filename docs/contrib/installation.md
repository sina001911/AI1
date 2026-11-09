---
description: How to install AI1 — prebuilt desktop downloads, system requirements, first-run setup, and in-app updates
---

# 📦 Installation

AI1 is a desktop application for Windows, macOS, and Linux. Choose the path that fits your needs: the prebuilt installer for everyday use, or building from source for development and contribution.

## Prebuilt Desktop Installation

Download the installer for your operating system from the [official download page](https://cherryai.com/download). Each platform ships its own package format:

| Platform | Package | Notes |
|----------|---------|-------|
| Windows | `.exe` installer (NSIS) | Supports x64 and ARM64; runs with standard user privileges |
| macOS | `.dmg` and `.zip` | Universal binary (Intel + Apple Silicon); requires macOS 12 or later |
| Linux | `.AppImage`, `.deb`, and `.rpm` | AppImage runs without installation; deb/rpm for Debian-, Red Hat-, and Arch-based distributions |

### System Requirements

- **Windows** — Windows 10 or later (x64 or ARM64)
- **macOS** — macOS 12 or later (Intel or Apple Silicon)
- **Linux** — glibc 2.28 or later (AppImage), or a compatible package manager for deb/rpm
- **Recommended** — 4 GB RAM, 2 GB free disk space, and an internet connection for model downloads

AI1 runs locally: your conversations, knowledge bases, and settings are stored on your machine. Cloud model providers require your own API credentials.

### First Run

1. Open the downloaded installer and follow the setup wizard.
2. Launch AI1 from the Start menu, Applications folder, or desktop shortcut.
3. On first launch, AI1 opens the **Getting Started** guide. Complete the setup flow to connect your first model provider.
4. By default, AI1 stores its data in your user profile. To keep dev and production data separate, see the [development guide](./development.md).

## In-App Updates

AI1 checks for updates automatically and notifies you when a new release is available. You can also check manually at any time.

- **Stable channel** — recommended for daily use; receives tested releases.
- **Beta channel** — early access to features that have not yet shipped to stable.
- **Release history** — every shipped version is documented in the in-app release notes, including the built-in history and the remote update feed.

To change channels or review the release history, open **Settings → About → Release Notes**.

## Building from Source

For development, testing, or contribution, build AI1 from the repository. The full setup is documented in the [development guide](./development.md); the essential steps are:

```bash
# 1. Install Node.js (version pinned in .node-version)
nvm install

# 2. Enable corepack so pnpm resolves to the locked version
corepack enable

# 3. Install dependencies
pnpm install

# 4. Run in development mode
pnpm dev
```

### Platform Builds

```bash
# Windows
pnpm build:win

# macOS
pnpm build:mac

# Linux
pnpm build:linux
```

Prebuilt binaries are produced by `electron-builder` from the compiled renderer and main-process bundles. The Linux packaging flow uses pinned `better-sqlite3` prebuilds; see [Linux Packaging](./linux-packaging.md) for the full workflow.

## Where Data Is Stored

AI1 keeps your data on your device:

| Data | Default location |
|------|------------------|
| Conversation history and knowledge bases | Your user profile (managed by Electron `userData`) |
| Settings and preferences | Synced locally across windows on the same machine |
| Application logs | Your user profile, under the app's log directory |

Backups are supported through local and WebDAV exports. For an isolated development profile, set `CS_DEV_PROFILE_ROOT` in `.env` — see the [development guide](./development.md).

## Getting Help

- [User documentation](https://cherryai.com/docs/en/) — guides, references, and FAQs
- [GitHub Issues](https://github.com/sina001911/cherry-studio-ai1/issues) — report bugs and request features
- [Contributing](../../CONTRIBUTING.md) — how to contribute code, docs, and translations