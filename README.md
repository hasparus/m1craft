# mc-arm64

Run Minecraft Forge 1.18.2 natively on Apple Silicon — no Rosetta.

CurseForge and the vanilla Minecraft Launcher ship x86_64 LWJGL 3.2.1 natives and redownload them on every launch. This repo replaces them with LWJGL 3.3.3 arm64 and handles Microsoft authentication via OAuth device code flow.

## Quick start

1. Install [CurseForge](https://www.curseforge.com/download/app) and the modpack (e.g. Isle of Berk)
2. Clone and run setup:
   ```bash
   git clone git@github.com:hasparus/mc-arm64.git
   cd mc-arm64
   bash setup.sh
   ```
3. Launch:
   ```bash
   ~/Documents/curseforge/minecraft/mc-arm64-launch.sh
   ```

First launch opens your browser for Microsoft login. After that, auth is cached and refreshes automatically.

## What it does

### `setup.sh`
- Installs [Zulu JDK 17 ARM64](https://www.azul.com/downloads/?version=java-17-lts&os=macos&architecture=arm-64-bit) if not present
- Downloads LWJGL 3.3.3 Java JARs from Maven Central
- Downloads and extracts LWJGL 3.3.3 arm64 native dylibs
- Copies `launch.sh` and `mc-auth.py` into place
- Creates a `.command` desktop shortcut

### `launch.sh`
- Finds Zulu 17 ARM
- Authenticates via `mc-auth.py`
- Builds the classpath with LWJGL 3.3.3 instead of 3.2.1
- Points `-Dorg.lwjgl.librarypath` to the arm64 natives directory (which CurseForge doesn't touch)
- Launches Forge via `BootstrapLauncher`

### `mc-auth.py`
Microsoft OAuth device code flow — no dependencies beyond Python 3 stdlib.

```
MS device code (login.live.com)
  → Xbox Live token
    → XSTS token
      → Minecraft access token
        → Player profile (UUID + username)
```

Tokens cached at `~/.mc-auth-cache.json` (chmod 600). MC access token is valid for 24 hours; the refresh token renews it automatically without opening the browser again.

## Why not just use CurseForge / vanilla launcher?

| | CurseForge | Vanilla Launcher | mc-arm64 |
|---|---|---|---|
| ARM64 LWJGL | Redownloads x86_64 on every launch | Redownloads x86_64 on every launch | Uses 3.3.3 arm64 from a separate dir |
| Auth | Encrypted tokens | Clears tokens on exit | OAuth device code with cached refresh token |
| Performance | Rosetta (x86 emulation) | Rosetta | Native ARM64 |

## Requirements

- macOS on Apple Silicon (M1/M2/M3/M4)
- Python 3 (comes with macOS / Homebrew)
- CurseForge with the modpack installed
- A Microsoft account that owns Minecraft

## Configuration

Set `CF_BASE` to override the CurseForge path:
```bash
CF_BASE=~/Documents/curseforge/minecraft bash setup.sh
```

To change the instance, edit the `INSTANCE` variable in `launch.sh`.

## Prior art

- [m1-multimc-hack](https://github.com/yusefnapora/m1-multimc-hack) — archived, same LWJGL replacement approach for MultiMC
- [MSMC](https://github.com/Hanro50/MSMC) — Node.js Microsoft auth library for Minecraft
