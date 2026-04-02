#!/bin/bash
# ARM64 Minecraft launcher for Forge 1.18.2 on Apple Silicon.
# Uses LWJGL 3.3.3 + Microsoft OAuth. Run setup.sh first.
set -euo pipefail

CF_BASE="${CF_BASE:-$HOME/Documents/curseforge/minecraft}"
INSTALL="$CF_BASE/Install"
INSTANCE="${INSTANCE:-$CF_BASE/Instances/Isle of Berk (Claws of Berk)}"

if [ ! -d "$INSTANCE" ]; then
  echo "ERROR: Instance not found: $INSTANCE"
  echo "Set INSTANCE to your modpack path, e.g.:"
  echo "  INSTANCE='$CF_BASE/Instances/Your Pack Name' $0"
  exit 1
fi
ARM64_NATIVES="$INSTALL/natives/arm64"
LWJGL33="$INSTALL/libraries/org/lwjgl"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

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

# Classpath — all Forge deps + LWJGL 3.3.3
CP=""
for jar in \
  cpw/mods/securejarhandler/1.0.8/securejarhandler-1.0.8.jar \
  org/ow2/asm/asm/9.7.1/asm-9.7.1.jar \
  org/ow2/asm/asm-commons/9.7.1/asm-commons-9.7.1.jar \
  org/ow2/asm/asm-tree/9.7.1/asm-tree-9.7.1.jar \
  org/ow2/asm/asm-util/9.7.1/asm-util-9.7.1.jar \
  org/ow2/asm/asm-analysis/9.7.1/asm-analysis-9.7.1.jar \
  net/minecraftforge/accesstransformers/8.0.4/accesstransformers-8.0.4.jar \
  org/antlr/antlr4-runtime/4.9.1/antlr4-runtime-4.9.1.jar \
  net/minecraftforge/eventbus/5.0.3/eventbus-5.0.3.jar \
  net/minecraftforge/forgespi/4.0.15-4.x/forgespi-4.0.15-4.x.jar \
  net/minecraftforge/coremods/5.2.5/coremods-5.2.5.jar \
  cpw/mods/modlauncher/9.1.3/modlauncher-9.1.3.jar \
  net/minecraftforge/unsafe/0.2.0/unsafe-0.2.0.jar \
  com/electronwill/night-config/core/3.6.4/core-3.6.4.jar \
  com/electronwill/night-config/toml/3.6.4/toml-3.6.4.jar \
  org/apache/maven/maven-artifact/3.6.3/maven-artifact-3.6.3.jar \
  net/jodah/typetools/0.8.3/typetools-0.8.3.jar \
  net/minecrell/terminalconsoleappender/1.2.0/terminalconsoleappender-1.2.0.jar \
  org/jline/jline-reader/3.12.1/jline-reader-3.12.1.jar \
  org/jline/jline-terminal/3.12.1/jline-terminal-3.12.1.jar \
  org/spongepowered/mixin/0.8.5/mixin-0.8.5.jar \
  org/openjdk/nashorn/nashorn-core/15.4/nashorn-core-15.4.jar \
  net/minecraftforge/JarJarSelector/0.3.19/JarJarSelector-0.3.19.jar \
  net/minecraftforge/JarJarMetadata/0.3.19/JarJarMetadata-0.3.19.jar \
  net/java/dev/jna/jna/5.12.1/jna-5.12.1.jar \
  net/java/dev/jna/jna-platform/5.12.1/jna-platform-5.12.1.jar \
  cpw/mods/bootstraplauncher/1.0.0/bootstraplauncher-1.0.0.jar \
  net/minecraftforge/JarJarFileSystems/0.3.19/JarJarFileSystems-0.3.19.jar \
  net/minecraftforge/fmlloader/1.18.2-40.3.0/fmlloader-1.18.2-40.3.0.jar \
  com/mojang/logging/1.0.0/logging-1.0.0.jar \
  com/mojang/blocklist/1.0.10/blocklist-1.0.10.jar \
  com/mojang/patchy/2.2.10/patchy-2.2.10.jar \
  com/github/oshi/oshi-core/5.8.5/oshi-core-5.8.5.jar \
  org/slf4j/slf4j-api/1.8.0-beta4/slf4j-api-1.8.0-beta4.jar \
  org/apache/logging/log4j/log4j-slf4j18-impl/2.17.0/log4j-slf4j18-impl-2.17.0.jar \
  com/ibm/icu/icu4j/70.1/icu4j-70.1.jar \
  com/mojang/javabridge/1.2.24/javabridge-1.2.24.jar \
  net/sf/jopt-simple/jopt-simple/5.0.4/jopt-simple-5.0.4.jar \
  io/netty/netty-all/4.1.68.Final/netty-all-4.1.68.Final.jar \
  com/google/guava/failureaccess/1.0.1/failureaccess-1.0.1.jar \
  com/google/guava/guava/31.0.1-jre/guava-31.0.1-jre.jar \
  org/apache/commons/commons-lang3/3.12.0/commons-lang3-3.12.0.jar \
  commons-io/commons-io/2.11.0/commons-io-2.11.0.jar \
  commons-codec/commons-codec/1.15/commons-codec-1.15.jar \
  com/mojang/brigadier/1.0.18/brigadier-1.0.18.jar \
  com/mojang/datafixerupper/4.1.27/datafixerupper-4.1.27.jar \
  com/google/code/gson/gson/2.8.9/gson-2.8.9.jar \
  com/mojang/authlib/3.3.39/authlib-3.3.39.jar \
  org/apache/commons/commons-compress/1.21/commons-compress-1.21.jar \
  org/apache/httpcomponents/httpclient/4.5.13/httpclient-4.5.13.jar \
  commons-logging/commons-logging/1.2/commons-logging-1.2.jar \
  org/apache/httpcomponents/httpcore/4.4.14/httpcore-4.4.14.jar \
  it/unimi/dsi/fastutil/8.5.6/fastutil-8.5.6.jar \
  org/apache/logging/log4j/log4j-api/2.17.0/log4j-api-2.17.0.jar \
  org/apache/logging/log4j/log4j-core/2.17.0/log4j-core-2.17.0.jar \
; do
  CP="$CP:$INSTALL/libraries/$jar"
done
# LWJGL 3.3.3
for lib in lwjgl lwjgl-jemalloc lwjgl-openal lwjgl-opengl lwjgl-glfw lwjgl-stb lwjgl-tinyfd; do
  CP="$CP:$LWJGL33/$lib/3.3.3/$lib-3.3.3.jar"
done
CP="$CP:$INSTALL/libraries/com/mojang/text2speech/1.12.4/text2speech-1.12.4.jar"
# Use 1.1 to match the universal (arm64) libjcocoa.dylib extracted by setup.sh.
# CurseForge ships 1.0.0 (x86 only) but 1.1 is already in the libraries dir.
CP="$CP:$INSTALL/libraries/ca/weblite/java-objc-bridge/1.1/java-objc-bridge-1.1.jar"
CP="$CP:$INSTALL/versions/forge-40.3.0/forge-40.3.0.jar"
CP="${CP#:}"

MODULE_PATH="$INSTALL/libraries/cpw/mods/bootstraplauncher/1.0.0/bootstraplauncher-1.0.0.jar"
MODULE_PATH="$MODULE_PATH:$INSTALL/libraries/cpw/mods/securejarhandler/1.0.8/securejarhandler-1.0.8.jar"
MODULE_PATH="$MODULE_PATH:$INSTALL/libraries/org/ow2/asm/asm-commons/9.7.1/asm-commons-9.7.1.jar"
MODULE_PATH="$MODULE_PATH:$INSTALL/libraries/org/ow2/asm/asm-util/9.7.1/asm-util-9.7.1.jar"
MODULE_PATH="$MODULE_PATH:$INSTALL/libraries/org/ow2/asm/asm-analysis/9.7.1/asm-analysis-9.7.1.jar"
MODULE_PATH="$MODULE_PATH:$INSTALL/libraries/org/ow2/asm/asm-tree/9.7.1/asm-tree-9.7.1.jar"
MODULE_PATH="$MODULE_PATH:$INSTALL/libraries/org/ow2/asm/asm/9.7.1/asm-9.7.1.jar"
MODULE_PATH="$MODULE_PATH:$INSTALL/libraries/net/minecraftforge/JarJarFileSystems/0.3.19/JarJarFileSystems-0.3.19.jar"

cd "$INSTANCE"
exec "$JAVA" \
  -XstartOnFirstThread -Xss1M \
  -Dorg.lwjgl.librarypath="$ARM64_NATIVES" \
  -Djava.library.path="$ARM64_NATIVES" \
  -Dfml.earlyprogresswindow=false \
  -Dminecraft.launcher.brand=mc-arm64 \
  -Djava.net.preferIPv6Addresses=system \
  -DignoreList=bootstraplauncher,securejarhandler,asm-commons,asm-util,asm-analysis,asm-tree,asm,JarJarFileSystems,client-extra,fmlcore,javafmllanguage,lowcodelanguage,mclanguage,forge-,forge-40.3.0.jar,forge-40.3.0 \
  -DmergeModules=jna-5.12.1.jar,jna-platform-5.12.1.jar,java-objc-bridge-1.0.0.jar \
  -DlibraryDirectory="$INSTALL/libraries" \
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
  cpw.mods.bootstraplauncher.BootstrapLauncher \
  --username "$MC_USERNAME" --version forge-40.3.0 \
  --gameDir "$INSTANCE/" \
  --assetsDir "$INSTALL/assets" \
  --assetIndex 1.18 \
  --uuid "$MC_UUID" \
  --accessToken "$MC_TOKEN" \
  --userType msa --versionType release \
  --width 1024 --height 768 \
  --launchTarget forgeclient \
  --fml.forgeVersion 40.3.0 --fml.mcVersion 1.18.2 \
  --fml.forgeGroup net.minecraftforge --fml.mcpVersion 20220404.173914
