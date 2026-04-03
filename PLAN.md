# mc-arm64 plan

## Status

All milestones complete.

- [x] M0: Scaffold (Bun + OpenTUI + subcommand dispatch)
- [x] M1: Auth (MS OAuth device code, arktype validation, errore errors)
- [x] M2: Classpath resolver (dynamic, handles conditional args + arch rules)
- [x] M3: Launcher (config-driven, token-safe --dry-run)
- [x] M4: Config TUI (instance picker, Java version, memory, window size)
- [x] M5: Setup TUI (opentui progress bars, streaming downloads, auto-detect)
- [x] M6: Binary (bun build --compile, standalone 67MB, no runtime needed)

## Next: test real launch

Run `mc-arm64` and verify the game boots.

## Future

- Fabric support (different version JSON format)
- GitHub Releases with pre-built binary
- Homebrew tap
