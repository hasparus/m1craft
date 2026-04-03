# m1craft
_should be called mc-arm64, but it's not funny_

**Run Minecraft Forge 1.18.2 natively on Apple Silicon — no Rosetta.**

Forge 1.18.2 ships LWJGL 3.2.1, which has no arm64 macOS support. Both CurseForge and the vanilla Minecraft Launcher redownload the x86_64 libraries, so you're stuck on Rosetta emulation. This repo swaps in LWJGL 3.3.3 (which has arm64 natives) and launches Forge directly, bypassing both launchers.

## Quick start

Prerequisites:
- macOS on Apple Silicon (M1/M2/M3/M4)
- [CurseForge](https://www.curseforge.com/download/app) with the modpack installed
- **Launch the modpack through CurseForge at least once** (so it downloads all the library JARs)

### Option A: Pre-built binary (no dependencies)

Download `mc-arm64` from [Releases](https://github.com/hasparus/mc-arm64/releases), then:

```bash
chmod +x mc-arm64
./mc-arm64 setup
./mc-arm64
```

That's it. On first launch it will ask you to pick your modpack and sign in with Microsoft.

### Option B: From source

Requires [Bun](https://bun.sh/).

```bash
git clone https://github.com/hasparus/mc-arm64.git
cd mc-arm64
bun install
bun src/main.ts setup
bun src/main.ts
```

Build a standalone binary with `bun run build`.

## Usage

### Just run it

```bash
mc-arm64
```

On first run, mc-arm64 will:
1. Check if Java and LWJGL natives are installed (runs setup if not)
2. Ask you to pick your modpack instance
3. Open your browser for Microsoft login (the code is auto-copied to your clipboard)
4. Launch Minecraft

After that, everything is cached — subsequent launches just start the game.

### Commands

```bash
mc-arm64              # Launch (default)
mc-arm64 config       # Change modpack, memory, window size
mc-arm64 setup        # Download JDK + LWJGL natives
mc-arm64 auth         # Sign in to Microsoft
mc-arm64 auth --check # Check login status
mc-arm64 --help       # Show all options
```

### Flags

```bash
mc-arm64 launch --instance "/path/to/instance"  # Override modpack
mc-arm64 launch --dry-run                        # Print JVM command without launching
```

## Configuration

`~/.mc-arm64.json` (created by `mc-arm64 config`):

```json
{
  "defaultInstance": "Isle of Berk (Claws of Berk)",
  "xmx": "8192m",
  "xms": "256m",
  "width": 1024,
  "height": 768
}
```

All fields are optional. CLI flags override config values.

## How it works

**`mc-arm64 setup`** downloads Zulu JDK 17 ARM64, LWJGL 3.3.3 JARs, and arm64 `.dylib` native libraries into a directory CurseForge doesn't manage, so they won't be overwritten.

**Classpath resolver** dynamically reads the Forge and Minecraft version JSONs, swaps LWJGL versions, filters libraries by OS/arch rules, and resolves placeholders in JVM arguments.

**Auth** uses Microsoft's device code flow (`login.live.com` -> Xbox Live -> XSTS -> Minecraft services). All API responses are validated with [arktype](https://arktype.io/). Tokens cached at `~/.mc-auth-cache.json` and auto-refresh without opening a browser.

**Launcher** assembles the JVM command line and spawns Java with the correct classpath, module path, native library path, and game arguments.

## Limitations

- **Forge 1.18.2 only.** Other Forge versions need different library versions and may use argument formats not yet handled.
- **CurseForge Forge updates will break it.** If CurseForge updates Forge for your modpack, run `mc-arm64 setup` again.
- Some JVM flags (e.g. `-XstartOnFirstThread`) are hardcoded for macOS.

## Prior art

- [m1-multimc-hack](https://github.com/yusefnapora/m1-multimc-hack) — archived, same LWJGL replacement approach
- [MSMC](https://github.com/Hanro50/MSMC) — Node.js Microsoft auth for Minecraft

## License

MIT
