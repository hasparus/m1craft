# m1craft plan

## Status

All milestones complete. Desloppify branch under review.

- [x] M0: Scaffold (Bun + OpenTUI + subcommand dispatch)
- [x] M1: Auth (MS OAuth device code, arktype validation, errore errors)
- [x] M2: Classpath resolver (dynamic, handles conditional args + arch rules)
- [x] M3: Launcher (config-driven, token-safe --dry-run)
- [x] M4: Config TUI (instance picker, Java version, memory, window size)
- [x] M5: Setup TUI (opentui progress bars, streaming downloads, auto-detect)
- [x] M6: Binary (bun build --compile, standalone 67MB, no runtime needed)

## Next: test real launch

Run `m1craft` and verify the game boots.

## Desloppify PR review (28 commits, 40 files)

### What landed well

1. Type colocation -- deleted `types.ts` hub, moved types to domain modules
2. `prepareLaunch`/`redactCmd` extraction -- separates "what" from "how", makes launch testable
3. Auth callbacks -- `authenticate()` accepts `AuthCallbacks`, no more hardcoded `console.error`/`open`
4. arktype validation at trust boundaries (CurseForge instance, version JSONs, auth cache, config)
5. `osMatches([])` bug fix -- empty rules now returns `true` (include everywhere)
6. Exit code checks on `tar`/`unzip`/`cp` spawns
7. Real test coverage: MSW auth chain (6 endpoints), resolve fixtures, launch integration

### Issues to address

1. **PR too large** -- should be 4-5 independent PRs (rename, type colocation, auth callbacks, TUI refactor, CI/CD). Hard to review, impossible to bisect.
2. **Alphabetical key reordering noise** -- half the diff is lint-driven property reordering mixed with behavior changes. Separate PR next time.
3. **`AUTH_CACHE_PATH` vs `getAuthCachePath()`** -- constant exported alongside function, constant is a lie when env override is set. Pick one.
4. **`loadVersionJson` validates then casts** -- arktype schema uses `unknown[]` for inner arrays, then `as unknown as` to hand-written interface. False confidence. Either validate deeply or skip.
5. **`Record<LaunchStep, StepRow>` relies on insertion order** -- use array of tuples if TUI rendering order matters.
6. **Config-TUI tests test opentui, not our code** -- "select navigates with arrow keys" is opentui's job. Test the wiring instead.
7. **`RENDERER_TEARDOWN_MS = 50`** -- no justification. If opentui lacks a flush callback, file upstream issue and reference it.

### Done

- [x] Split CI: unit tests on `ubuntu-latest`, integration tests on `macos-latest` (10x cost savings)
- [x] Tag tests by extension: `*.unit.test.ts` / `*.integration.test.ts`

## Future

- Fabric support (different version JSON format)
- GitHub Releases with pre-built binary
- Homebrew tap
