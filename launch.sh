#!/bin/bash
# ARM64 Minecraft launcher for Forge on Apple Silicon.
# Reads version info from CurseForge's JSONs — no hardcoded library versions.
set -euo pipefail

CF_BASE="${CF_BASE:-$HOME/Documents/curseforge/minecraft}"
INSTALL="$CF_BASE/Install"
INSTANCE="${INSTANCE:-$CF_BASE/Instances/Isle of Berk (Claws of Berk)}"
ARM64_NATIVES="$INSTALL/natives/arm64"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -d "$INSTANCE" ]; then
  echo "ERROR: Instance not found: $INSTANCE"
  echo "Set INSTANCE to your modpack path, e.g.:"
  echo "  INSTANCE='$CF_BASE/Instances/Your Pack Name' $0"
  exit 1
fi

# Find Zulu 17 ARM
JAVA=$(ls -d "$HOME/Library/Java"/zulu17.*-macosx_aarch64/bin/java 2>/dev/null | head -1)
if [ -z "$JAVA" ]; then
  echo "ERROR: Zulu 17 ARM not found. Run setup.sh first."
  exit 1
fi

# Auth
AUTH=$(python3 "$SCRIPT_DIR/mc-auth.py") || exit 1
MC_TOKEN=$(echo "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
MC_UUID=$(echo "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['uuid'])")
MC_USERNAME=$(echo "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['username'])")
echo "Auth: $MC_USERNAME ($MC_UUID)"

# Resolve classpath and launch args from Forge version JSONs
RESOLVED=$(python3 "$SCRIPT_DIR/resolve-classpath.py" "$INSTANCE" "$INSTALL") || exit 1
CP=$(echo "$RESOLVED" | python3 -c "import sys,json; print(json.load(sys.stdin)['classpath'])")
MAIN_CLASS=$(echo "$RESOLVED" | python3 -c "import sys,json; print(json.load(sys.stdin)['main_class'])")
ASSET_INDEX=$(echo "$RESOLVED" | python3 -c "import sys,json; print(json.load(sys.stdin)['asset_index'])")
FORGE_NAME=$(echo "$RESOLVED" | python3 -c "import sys,json; print(json.load(sys.stdin)['forge_name'])")

# Extract Forge JVM args (the -D flags and module path)
eval "$(echo "$RESOLVED" | python3 -c "
import sys, json, shlex
d = json.load(sys.stdin)
jvm = d['forge_jvm_args']
game = d['forge_game_args']

# Resolve variables in JVM args
lib_dir = '$INSTALL/libraries'
version_name = d['forge_name']
sep = ':'

resolved_jvm = []
skip_next = False
module_path = ''
for i, arg in enumerate(jvm):
    if skip_next:
        skip_next = False
        continue
    a = arg.replace('\${library_directory}', lib_dir)
    a = a.replace('\${classpath_separator}', sep)
    a = a.replace('\${version_name}', version_name)
    if a == '-p' or a == '--module-path':
        # next arg is the module path value
        skip_next = True
        val = jvm[i+1] if i+1 < len(jvm) else ''
        val = val.replace('\${library_directory}', lib_dir)
        val = val.replace('\${classpath_separator}', sep)
        module_path = val
        continue
    resolved_jvm.append(a)

print(f'MODULE_PATH={shlex.quote(module_path)}')
print(f'FORGE_JVM_ARGS=({\" \".join(shlex.quote(a) for a in resolved_jvm)})')
print(f'FORGE_GAME_ARGS=({\" \".join(shlex.quote(a) for a in game)})')
")"

echo "Launching $FORGE_NAME..."

cd "$INSTANCE"
exec "$JAVA" \
  -XstartOnFirstThread -Xss1M \
  -Dorg.lwjgl.librarypath="$ARM64_NATIVES" \
  -Djava.library.path="$ARM64_NATIVES" \
  -Dfml.earlyprogresswindow=false \
  -Dminecraft.launcher.brand=mc-arm64 \
  "${FORGE_JVM_ARGS[@]}" \
  -cp "$CP" \
  -p "$MODULE_PATH" \
  --add-modules ALL-MODULE-PATH \
  --add-opens java.base/java.util.jar=cpw.mods.securejarhandler \
  --add-opens java.base/java.lang.invoke=cpw.mods.securejarhandler \
  --add-exports java.base/sun.security.util=cpw.mods.securejarhandler \
  --add-exports jdk.naming.dns/com.sun.jndi.dns=java.naming \
  -Xmx8192m -Xms256m \
  -Dfml.ignorePatchDiscrepancies=true \
  -Dfml.ignoreInvalidMinecraftCertificates=true \
  -Duser.language=en \
  -Dlog4j2.formatMsgNoLookups=true \
  "$MAIN_CLASS" \
  --username "$MC_USERNAME" --version "$FORGE_NAME" \
  --gameDir "$INSTANCE/" \
  --assetsDir "$INSTALL/assets" \
  --assetIndex "$ASSET_INDEX" \
  --uuid "$MC_UUID" \
  --accessToken "$MC_TOKEN" \
  --userType msa --versionType release \
  --width 1024 --height 768 \
  "${FORGE_GAME_ARGS[@]}"
