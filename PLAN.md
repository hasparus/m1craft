# mc-arm64 plan

## Status

- [x] M0: Scaffold (Bun + OpenTUI + subcommand dispatch)
- [x] M1: Auth (MS OAuth device code, cache-compatible with Python)
- [x] M2: Classpath resolver (dynamic, regression-tested against hardcoded launch.sh)
- [x] M3: Launcher (--dry-run verified, real launch untested with TS version)
- [ ] M4: Config TUI (OpenTUI interactive screen)
- [ ] M5: Setup (port setup.sh to TS)
- [ ] M6: Polish (bun build --compile, README update)

## What works now

```bash
bun src/main.ts --help          # CLI help
bun src/main.ts auth --check    # Check cached token status
bun src/main.ts auth            # Full MS OAuth flow
bun src/main.ts resolve         # Print resolved classpath as JSON
bun src/main.ts launch --dry-run # Print JVM command without launching
bun src/main.ts launch          # Launch Minecraft (untested — test next)
```

The bash+python scripts still work and are deployed at
`~/Documents/curseforge/minecraft/mc-arm64-launch.sh`. The TS version
reads the same auth cache and CurseForge install directory. It never
writes to the CurseForge directory.

## Next: test real launch

Run `bun src/main.ts launch` and verify the game boots.
If it works, the TS version replaces the bash scripts.

## M4: Config TUI

Use @opentui/core to build an interactive config screen:

```
mc-arm64 config
```

- Select default instance (auto-discover from CurseForge Instances dir)
- Set memory (-Xmx/-Xms)
- Set window size
- Set LWJGL override version
- Saves to `~/.mc-arm64.json`
- `launch` reads config as defaults, CLI flags override

## M5: Setup

Port `setup.sh` to `mc-arm64 setup`:
- Download Zulu JDK 17 ARM64 via Azul API
- Download LWJGL 3.3.3 JARs + arm64 native dylibs from Maven Central
- Extract natives to `Install/natives/arm64/`
- OpenTUI progress bars for downloads

## M6: Polish

- `bun build --compile src/main.ts --outfile mc-arm64` — single binary, no Bun needed
- Update README for TS version
- Consider: Fabric support (different version JSON format)
