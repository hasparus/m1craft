# m1craft

**Run modded Minecraft natively on Apple Silicon -- no Rosetta.**

_should be called mc-arm64, but it's not funny_

Forge ships LWJGL builds that lack arm64 macOS natives. CurseForge and the vanilla launcher both redownload x86_64 libraries, forcing Rosetta emulation. m1craft swaps in LWJGL 3.3.3 arm64 natives and launches Forge directly, bypassing both launchers.

## Quick start

Prerequisites:
- macOS on Apple Silicon (M1/M2/M3/M4)
- [CurseForge](https://www.curseforge.com/download/app) with the modpack installed
- **Launch the modpack through CurseForge once** (to download all library JARs)

### Option A: Pre-built binary (no dependencies)

Download `m1craft-macos-arm64.zip` from [Releases](https://github.com/hasparus/m1craft/releases), extract, and run:

```bash
./m1craft
```

On first launch, m1craft will:
1. Check for Java and LWJGL natives
2. Run `setup` if either is missing
3. Prompt you to pick a modpack instance
4. Open your browser for Microsoft login
5. Launch Minecraft

Everything caches after the first run. Later launches start the game immediately.

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

You usually need only `m1craft`. Run `m1craft setup` only to preinstall Java and native libraries before the first launch.

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

**`m1craft setup`** downloads Zulu JDK ARM64 (configurable version), LWJGL 3.3.3 JARs, and arm64 `.dylib` natives into a directory CurseForge never touches.

**Classpath resolver** reads the Forge and Minecraft version JSONs, swaps LWJGL versions, filters libraries by OS/arch rules, and resolves JVM argument placeholders.

**Auth** uses Microsoft's device code flow (`login.live.com` -> Xbox Live -> XSTS -> Minecraft services). [arktype](https://arktype.io/) validates all API responses. Tokens cache at `~/.m1craft-auth.json` and auto-refresh without opening a browser.

**Launcher** assembles the full JVM command -- classpath, module path, native library path, game arguments -- and spawns Java.

## Limitations

- **CurseForge modpacks only.** Reads `minecraftinstance.json` for Forge version detection. Other launchers may work if they share the same directory layout.
- JVM flags (e.g. `-XstartOnFirstThread`) target macOS specifically.

## Prior art

- [m1-multimc-hack](https://github.com/yusefnapora/m1-multimc-hack) -- archived, same LWJGL replacement approach
- [MSMC](https://github.com/Hanro50/MSMC) -- Node.js Microsoft auth for Minecraft

## License

MIT
