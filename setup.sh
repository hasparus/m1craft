#!/bin/bash
# Setup script for running Minecraft Forge 1.18.2 natively on Apple Silicon.
# Requires: CurseForge with the modpack already installed, Python 3, curl.
set -euo pipefail

CF_BASE="${CF_BASE:-$HOME/Documents/curseforge/minecraft}"
INSTALL="$CF_BASE/Install"
LWJGL_VER="3.3.3"
NATIVES_DIR="$INSTALL/natives/arm64"
LWJGL_DIR="$INSTALL/libraries/org/lwjgl"

echo "=== Minecraft ARM64 Setup ==="

# 1. Check/install Zulu 17 ARM
JAVA_DIR="$HOME/Library/Java"
ZULU_DIR=$(ls -d "$JAVA_DIR"/zulu17.*-macosx_aarch64 2>/dev/null | head -1)
if [ -n "$ZULU_DIR" ]; then
  echo "[OK] Zulu 17 ARM found: $ZULU_DIR"
else
  echo "[DL] Downloading Zulu 17 ARM..."
  ZULU_URL=$(curl -s "https://api.azul.com/metadata/v1/zulu/packages/?java_version=17&os=macos&arch=arm&archive_type=tar.gz&java_package_type=jdk&latest=true&crac_supported=false" \
    | python3 -c "import sys,json; pkgs=[p for p in json.load(sys.stdin) if 'fx' not in p.get('name','') and 'crac' not in p.get('name','')]; print(pkgs[0]['download_url'])")
  curl -L -o /tmp/zulu17-arm.tar.gz "$ZULU_URL"
  mkdir -p "$JAVA_DIR"
  tar xzf /tmp/zulu17-arm.tar.gz -C "$JAVA_DIR"
  ZULU_DIR=$(ls -d "$JAVA_DIR"/zulu17.*-macosx_aarch64 | head -1)
  rm /tmp/zulu17-arm.tar.gz
  echo "[OK] Installed: $ZULU_DIR"
fi
JAVA="$ZULU_DIR/bin/java"

# 2. Download LWJGL 3.3.3 JARs
echo "[DL] Downloading LWJGL $LWJGL_VER JARs..."
MAVEN="https://repo1.maven.org/maven2/org/lwjgl"
for lib in lwjgl lwjgl-glfw lwjgl-jemalloc lwjgl-openal lwjgl-opengl lwjgl-stb lwjgl-tinyfd; do
  dest="$LWJGL_DIR/$lib/$LWJGL_VER"
  if [ -f "$dest/$lib-$LWJGL_VER.jar" ]; then
    continue
  fi
  mkdir -p "$dest"
  curl -sL "$MAVEN/$lib/$LWJGL_VER/$lib-$LWJGL_VER.jar" -o "$dest/$lib-$LWJGL_VER.jar"
  echo "  $lib-$LWJGL_VER.jar"
done

# 3. Download + extract ARM64 native dylibs
if [ -f "$NATIVES_DIR/liblwjgl.dylib" ] && file "$NATIVES_DIR/liblwjgl.dylib" | grep -q arm64; then
  echo "[OK] ARM64 natives already in place"
else
  echo "[DL] Downloading LWJGL $LWJGL_VER ARM64 natives..."
  mkdir -p "$NATIVES_DIR" /tmp/lwjgl-arm64-setup
  for lib in lwjgl lwjgl-glfw lwjgl-jemalloc lwjgl-openal lwjgl-opengl lwjgl-stb lwjgl-tinyfd; do
    curl -sL "$MAVEN/$lib/$LWJGL_VER/$lib-$LWJGL_VER-natives-macos-arm64.jar" \
      -o "/tmp/lwjgl-arm64-setup/$lib-natives.jar"
  done
  cd /tmp/lwjgl-arm64-setup
  for jar in *.jar; do unzip -o "$jar" "*.dylib" >/dev/null 2>&1; done

  # Flat layout
  SRC="macos/arm64/org/lwjgl"
  cp "$SRC/liblwjgl.dylib"               "$NATIVES_DIR/"
  cp "$SRC/glfw/libglfw.dylib"           "$NATIVES_DIR/"
  cp "$SRC/jemalloc/libjemalloc.dylib"   "$NATIVES_DIR/"
  cp "$SRC/openal/libopenal.dylib"       "$NATIVES_DIR/"
  cp "$SRC/opengl/liblwjgl_opengl.dylib" "$NATIVES_DIR/"
  cp "$SRC/stb/liblwjgl_stb.dylib"       "$NATIVES_DIR/"
  cp "$SRC/tinyfd/liblwjgl_tinyfd.dylib" "$NATIVES_DIR/"

  # Subdirectory layout (LWJGL 3.3.3 looks here)
  for sub in "" glfw jemalloc openal opengl stb tinyfd; do
    mkdir -p "$NATIVES_DIR/macos/arm64/org/lwjgl/$sub"
  done
  cp -R "$SRC/"* "$NATIVES_DIR/macos/arm64/org/lwjgl/"

  # libjcocoa from java-objc-bridge 1.1 (universal binary with arm64)
  JCOCOA_JAR="$INSTALL/libraries/ca/weblite/java-objc-bridge/1.1/java-objc-bridge-1.1.jar"
  if [ -f "$JCOCOA_JAR" ]; then
    unzip -o "$JCOCOA_JAR" "libjcocoa.dylib" -d "$NATIVES_DIR/" >/dev/null
  fi

  rm -rf /tmp/lwjgl-arm64-setup
  echo "[OK] ARM64 natives installed"
fi

# 4. Copy launch files
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "$SCRIPT_DIR/mc-auth.py" "$CF_BASE/mc-auth.py"
cp "$SCRIPT_DIR/launch.sh" "$CF_BASE/mc-arm64-launch.sh"
chmod +x "$CF_BASE/mc-arm64-launch.sh"

# 5. Create desktop shortcut
cat > "$HOME/Desktop/Isle of Berk.command" << 'SHORTCUT'
#!/bin/bash
exec ~/Documents/curseforge/minecraft/mc-arm64-launch.sh
SHORTCUT
chmod +x "$HOME/Desktop/Isle of Berk.command"

echo ""
echo "=== Done! ==="
echo "Java:    $JAVA"
echo "Natives: $NATIVES_DIR"
echo "Launch:  $CF_BASE/mc-arm64-launch.sh"
echo "         or double-click 'Isle of Berk.command' on Desktop"
echo ""
echo "First launch will open your browser for Microsoft login."
