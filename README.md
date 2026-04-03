# mc-arm64

Run Minecraft Forge 1.18.2 natively on Apple Silicon — no Rosetta.

Forge 1.18.2 ships LWJGL 3.2.1, which has no arm64 macOS support. Both CurseForge and the vanilla Minecraft Launcher redownload the x86_64 libraries, so you're stuck on Rosetta emulation. This repo swaps in LWJGL 3.3.3 (which has arm64 natives) and launches Forge directly, bypassing both launchers.

## Setup

Prerequisites:
- macOS on Apple Silicon (M1/M2/M3/M4)
- [CurseForge](https://www.curseforge.com/download/app) with the modpack installed
- **Launch the modpack through CurseForge at least once** (so it downloads all the library JARs)
- [Bun](https://bun.sh/) (`curl -fsSL https://bun.sh/install | bash`)

```bash
git clone https://github.com/hasparus/mc-arm64.git
cd mc-arm64
bun install
bash setup.sh
```

Setup will:
- Install [Zulu JDK 17 ARM64](https://www.azul.com/downloads/?version=java-17-lts&os=macos&architecture=arm-64-bit) if not already present
- Download LWJGL 3.3.3 JARs and arm64 native libraries from Maven Central
- Copy the launch script and auth helper into your CurseForge directory

## Usage

### Configure

```bash
bun src/main.ts config
```

Interactive TUI to set your default instance, memory allocation, and window size. Saves to `~/.mc-arm64.json`.

### Launch

```bash
bun src/main.ts launch
```

First run opens your browser for Microsoft login. After that, the token refreshes automatically.

Override instance or preview the JVM command:
```bash
bun src/main.ts launch --instance "/path/to/instance"
bun src/main.ts launch --dry-run
```

### Other commands

```bash
bun src/main.ts auth          # Authenticate with Microsoft
bun src/main.ts auth --check  # Check token status
bun src/main.ts resolve       # Print resolved classpath as JSON
bun src/main.ts --help        # Show help
```

## How it works

**`setup.sh`** downloads LWJGL 3.3.3 JARs + arm64 `.dylib` files into a directory CurseForge doesn't manage, so they won't be overwritten.

**`src/lib/resolve.ts`** dynamically resolves the classpath from the Forge and Minecraft version JSONs, swapping LWJGL versions and filtering libraries by OS/arch rules.

**`src/lib/auth.ts`** handles Microsoft authentication (device code flow via `login.live.com` -> Xbox Live -> XSTS -> Minecraft). All API responses are validated with [arktype](https://arktype.io/). Tokens cached at `~/.mc-auth-cache.json`.

**`src/lib/launch.ts`** assembles the JVM command line and spawns Java. Reads config from `~/.mc-arm64.json` (set via `config` command), with CLI flags as overrides.

## Configuration

`~/.mc-arm64.json` (created by `bun src/main.ts config`):

```json
{
  "defaultInstance": "Isle of Berk (Claws of Berk)",
  "xmx": "8192m",
  "xms": "256m",
  "width": 1024,
  "height": 768
}
```

All fields are optional. CLI flags (`--instance`) override config values.

## Limitations

- **Forge 1.18.2 only.** Other Forge versions need different library versions and may use argument formats not yet handled.
- **CurseForge Forge updates will break it.** If CurseForge updates Forge for your modpack, the resolved classpath may not match. Re-run `setup.sh` and test.
- Window size and memory are configurable via `config`, but some JVM flags (e.g. `-XstartOnFirstThread`) are hardcoded for macOS.

## Prior art

- [m1-multimc-hack](https://github.com/yusefnapora/m1-multimc-hack) — archived, same LWJGL replacement approach
- [MSMC](https://github.com/Hanro50/MSMC) — Node.js Microsoft auth for Minecraft

## License

MIT
