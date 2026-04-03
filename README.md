# m1craft

Run Minecraft Forge 1.18.2 natively on Apple Silicon — no Rosetta.

Forge 1.18.2 ships LWJGL 3.2.1, which has no arm64 macOS support. Both CurseForge and the vanilla Minecraft Launcher redownload the x86_64 libraries, so you're stuck on Rosetta emulation. This repo swaps in LWJGL 3.3.3 (which has arm64 natives) and launches Forge directly, bypassing both launchers.

## Quick start

Prerequisites:
- macOS on Apple Silicon (M1/M2/M3/M4)
- [CurseForge](https://www.curseforge.com/download/app) with the modpack installed
- **Launch the modpack through CurseForge at least once** (so it downloads all the library JARs)

### Option A: Pre-built binary (no dependencies)

Download `m1craft-macos-arm64.zip` from [Releases](https://github.com/hasparus/m1craft/releases), extract it, then:

```bash
./m1craft setup
./m1craft
```

That's it. On first launch it will ask you to pick your modpack and sign in with Microsoft.

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

## Usage

### Just run it

```bash
m1craft
```

On first run, m1craft will:
1. Check if Java and LWJGL natives are installed (runs setup if not)
2. Ask you to pick your modpack instance
3. Open your browser for Microsoft login (the code is auto-copied to your clipboard)
4. Launch Minecraft

After that, everything is cached — subsequent launches just start the game.

### Commands

```bash
m1craft              # Launch (default)
m1craft config       # Change modpack, memory, window size
m1craft setup        # Download JDK + LWJGL natives
m1craft auth         # Sign in to Microsoft
m1craft auth --check # Check login status
m1craft --help       # Show all options
```

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

- **Forge 1.18.2 only.** Other Forge versions need different library versions and may use argument formats not yet handled.
- **CurseForge Forge updates will break it.** If CurseForge updates Forge for your modpack, run `m1craft setup` again.
- Some JVM flags (e.g. `-XstartOnFirstThread`) are hardcoded for macOS.

## Prior art

- [m1-multimc-hack](https://github.com/yusefnapora/m1-multimc-hack) — archived, same LWJGL replacement approach
- [MSMC](https://github.com/Hanro50/MSMC) — Node.js Microsoft auth for Minecraft

## License

MIT
