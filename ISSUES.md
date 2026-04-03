# Issues

## Critical

- [x] 1. Auth chain silently swallows HTTP errors — `postForm`/`postJson`/`getJson` never check `res.ok`, API failures produce cascading `undefined` access with garbage errors
- [x] 2. Auth API responses unvalidated — `xbl.Token`, `xsts.DisplayClaims.xui[0].uhs`, `mc.access_token`, `prof.id` all accessed without checking shape. Xbox/XSTS error codes (2148916233, 2148916238) never detected
- [x] 3. `arguments.jvm`/`arguments.game` typed as `string[]` but Mojang format allows conditional objects — would produce `[object Object]` as JVM args
- [x] 4. `osMatches` ignores `os.arch` — ARM64 project that can't distinguish x86 from arm64 rules
- [x] 5. Empty module path produces `-p ""` passed to JVM
- [x] 6. `--dry-run` and `mc-arm64 auth` leak access token to stdout

## Bugs

- [x] 7. `findJava` uses `process.env["HOME"]!` instead of `homedir()`
- [x] 8. `findJava` throws ENOENT instead of helpful message when `~/Library/Java` missing
- [x] 9. `parseMaven` returns `undefined!` for malformed coordinates
- [x] 10. `deviceCodeFlow` loops forever — no overall timeout
- [x] 11. `findJava` picks non-deterministic version when multiple Zulu 17 exist

## Dead code

- [x] 12. `index.ts` — scaffold leftover
- [x] 13. `mavenToPath` — never called
- [x] 14. `UserConfig` — defined, never used
- [x] 15. `LWJGL_DIR`, `CONFIG_PATH` — exported, never imported
- [x] 16. `@opentui/core` — dependency, never imported
- [x] 17. eslint-disable comment with no eslint

## Slop

- [x] 18. `await` on sync `findJava()`
- [x] 19. `resolve` closure recreated inside loop
- [x] 20. `readdirSync` from `node:fs` instead of Bun APIs
