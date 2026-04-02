# mc-arm64

Run Minecraft Forge natively on Apple Silicon. Doubled my FPS (30 → 70) by eliminating Rosetta.

Forge 1.18.2 ships LWJGL 3.2.1, which has no arm64 macOS support. Both CurseForge and the vanilla Minecraft Launcher redownload the x86_64 libraries, so you're stuck on Rosetta emulation. This repo swaps in LWJGL 3.3.3 (which has arm64 natives) and launches Forge directly, bypassing both launchers.

## Setup

Prerequisites:
- macOS on Apple Silicon (M1/M2/M3/M4)
- [CurseForge](https://www.curseforge.com/download/app) with the modpack installed
- **Launch the modpack through CurseForge at least once** (so it downloads all the library JARs)
- Python 3.6+

```bash
git clone https://github.com/hasparus/mc-arm64.git
cd mc-arm64
bash setup.sh
```

Setup will:
- Install [Zulu JDK 17 ARM64](https://www.azul.com/downloads/?version=java-17-lts&os=macos&architecture=arm-64-bit) if not already present
- Download LWJGL 3.3.3 JARs and arm64 native libraries from Maven Central
- Copy the launch script and auth helper into your CurseForge directory

## Usage

```bash
~/Documents/curseforge/minecraft/mc-arm64-launch.sh
```

First run opens your browser for Microsoft login. After that, the token refreshes automatically — no browser needed.

For a different modpack instance:
```bash
INSTANCE="$HOME/Documents/curseforge/minecraft/Instances/Your Pack Name" \
  ~/Documents/curseforge/minecraft/mc-arm64-launch.sh
```

## How it works

**`setup.sh`** downloads LWJGL 3.3.3 JARs + arm64 `.dylib` files into a directory CurseForge doesn't manage, so they won't be overwritten.

**`launch.sh`** reads the Forge version JSONs from your CurseForge install to build the classpath automatically — no hardcoded library versions. It swaps LWJGL 3.2.x for 3.3.3, points `-Dorg.lwjgl.librarypath` at the arm64 natives, and launches Forge.

**`mc-auth.py`** handles Microsoft authentication (device code flow via `login.live.com` → Xbox Live → XSTS → Minecraft). Zero dependencies beyond Python stdlib. Tokens cached at `~/.mc-auth-cache.json`.

**`resolve-classpath.py`** parses the Forge and base Minecraft version JSONs to produce the classpath, module path, and launch arguments. This means the script adapts when CurseForge updates Forge — no manual classpath editing needed.

## Limitations

- The default instance is "Isle of Berk (Claws of Berk)". Set the `INSTANCE` env var for other modpacks.
- Window size (1024x768) and memory (-Xmx8G) are hardcoded in `launch.sh`. Edit as needed.
- Tested with Forge 1.18.2. Should work with other Forge versions that use LWJGL 3.2.x, but hasn't been verified.

## Prior art

- [m1-multimc-hack](https://github.com/yusefnapora/m1-multimc-hack) — archived, same LWJGL replacement approach
- [MSMC](https://github.com/Hanro50/MSMC) — Node.js Microsoft auth for Minecraft

## License

MIT
