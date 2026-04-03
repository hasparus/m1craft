# mc-arm64 plan

## Status

- [x] M0: Scaffold (Bun + OpenTUI + subcommand dispatch)
- [x] M1: Auth (MS OAuth device code, cache-compatible with Python)
- [x] M2: Classpath resolver (dynamic, regression-tested against hardcoded launch.sh)
- [x] M3: Launcher (--dry-run verified, real launch untested with TS version)
- [x] M4: Config TUI (OpenTUI interactive screen)
- [x] M5: Setup (port setup.sh to TS)
- [x] M6: Polish (bun build --compile, README update)

## What works now

```bash
mc-arm64              # Launch Minecraft
mc-arm64 config       # Interactive config TUI
mc-arm64 setup        # Download JDK + LWJGL natives
mc-arm64 auth         # Full MS OAuth flow
mc-arm64 auth --check # Check token status
mc-arm64 resolve      # Print resolved classpath as JSON
mc-arm64 --help       # CLI help
```

Standalone 67MB binary via `bun run build`. No Bun/Node runtime needed.

First-launch experience: auto-detects missing setup, runs config TUI
if no instance configured, copies auth code to clipboard.

## Next: test real launch

Run `mc-arm64 launch` and verify the game boots.
If it works, the TS version fully replaces the bash scripts.

## Future

- Fabric support (different version JSON format)
- GitHub Releases with pre-built binary
- Homebrew tap
