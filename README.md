# m1craft

Run Minecraft Forge 1.18.2 natively on Apple Silicon — no Rosetta.

Forge 1.18.2 ships LWJGL 3.2.1, which has no arm64 macOS support. Both CurseForge and the vanilla Minecraft Launcher redownload the x86_64 libraries, so you're stuck on Rosetta emulation. This repo swaps in LWJGL 3.3.3 (which has arm64 natives) and launches Forge directly, bypassing both launchers.

## Quick start

Prerequisites:
- macOS on Apple Silicon (M1/M2/M3/M4)
- [CurseForge](https://www.curseforge.com/download/app) with the modpack installed
- **Launch the modpack through CurseForge at least once** (so it downloads all the library JARs)

### Option A: Pre-built binary (no dependencies)

Download `m1craft-macos-arm64.zip` from [Releases](https://github.com/hasparus/m1craft/releases), extract it, then run:

```bash
./m1craft
```

On first launch, m1craft will:
1. Check whether Java and LWJGL natives are installed
2. Run `setup` automatically if they are missing
3. Ask you to pick your modpack instance
4. Open your browser for Microsoft login
5. Launch Minecraft

After that, everything is cached. Later launches just start the game.

### Option B: From source

Requires [Bun](https://bun.sh/).

```bash
git clone https://github.com/hasparus/m1craft.git
cd m1craft
bun install
bun src/main.ts setup
bun src/main.ts
```

Build a standalone binary with `bun run build`. Build the release zip with `bun run package`.

## CLI

### Commands

```bash
m1craft              # Launch (default)
m1craft config       # Change modpack, memory, window size
m1craft setup        # Download JDK + LWJGL natives now
m1craft auth         # Sign in to Microsoft
m1craft auth --check # Check login status
m1craft --help       # Show all options
```

You usually only need `m1craft`. Run `m1craft setup` yourself only if you want to preinstall Java and the native libraries before the first launch.

### Flags

```bash
m1craft launch --instance "/path/to/instance"  # Override modpack
m1craft launch --dry-run                        # Print JVM command without launching
```

## Configuration

`~/.m1craft.json` (created by `m1craft config`):

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

**`m1craft setup`** downloads Zulu JDK 17 ARM64, LWJGL 3.3.3 JARs, and arm64 `.dylib` native libraries into a directory CurseForge doesn't manage, so they won't be overwritten.

**Classpath resolver** dynamically reads the Forge and Minecraft version JSONs, swaps LWJGL versions, filters libraries by OS/arch rules, and resolves placeholders in JVM arguments.

**Auth** uses Microsoft's device code flow (`login.live.com` -> Xbox Live -> XSTS -> Minecraft services). All API responses are validated with [arktype](https://arktype.io/). Tokens cached at `~/.m1craft-auth.json` and auto-refresh without opening a browser.

**Launcher** assembles the JVM command line and spawns Java with the correct classpath, module path, native library path, and game arguments.

## Limitations

- **CurseForge modpacks only.** Reads `minecraftinstance.json` for Forge version detection. Other launchers may work if they use the same directory layout.
- JVM flags (e.g. `-XstartOnFirstThread`) are macOS-specific.

## Prior art

- [m1-multimc-hack](https://github.com/yusefnapora/m1-multimc-hack) — archived, same LWJGL replacement approach
- [MSMC](https://github.com/Hanro50/MSMC) — Node.js Microsoft auth for Minecraft

## License

MIT
