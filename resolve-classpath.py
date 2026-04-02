#!/usr/bin/env python3
"""Resolve Forge classpath from version JSONs. Replaces LWJGL 3.2.x with 3.3.3."""
import json, os, platform, sys

LWJGL_OVERRIDE = "3.3.3"

def load_version(versions_dir, version_id):
    path = os.path.join(versions_dir, version_id, f"{version_id}.json")
    with open(path) as f:
        return json.load(f)

def os_matches(rules):
    """Evaluate Mojang library rules. Returns True if the library should be included."""
    if not rules:
        return True
    result = False
    for rule in rules:
        action = rule["action"] == "allow"
        if "os" in rule:
            if rule["os"].get("name") == "osx":
                result = action
        else:
            result = action
    return result

def resolve(instance_dir, install_dir, lwjgl_ver=LWJGL_OVERRIDE):
    versions_dir = os.path.join(install_dir, "versions")
    libraries_dir = os.path.join(install_dir, "libraries")
    lwjgl_dir = os.path.join(libraries_dir, "org", "lwjgl")

    # Read instance metadata to find Forge version
    instance_json = os.path.join(instance_dir, "minecraftinstance.json")
    with open(instance_json) as f:
        instance = json.load(f)
    forge_name = instance["baseModLoader"]["name"]  # e.g. "forge-40.3.0"
    mc_version = instance["gameVersion"]             # e.g. "1.18.2"

    # Load Forge version JSON (has inheritsFrom → base MC version)
    forge = load_version(versions_dir, forge_name)
    base = load_version(versions_dir, mc_version)

    # Collect libraries from base + forge, resolving OS rules
    cp_entries = []
    natives_to_extract = []

    for lib in base.get("libraries", []) + forge.get("libraries", []):
        if not os_matches(lib.get("rules")):
            continue

        name = lib["name"]
        parts = name.split(":")
        # parts: [group, artifact, version] or [group, artifact, version, classifier]
        group, artifact = parts[0], parts[1]
        version = parts[2]

        # Swap LWJGL to our override version
        is_lwjgl = group == "org.lwjgl"
        if is_lwjgl:
            version = lwjgl_ver

        # Swap java-objc-bridge to 1.1 (has universal binary with arm64)
        is_jcocoa = artifact == "java-objc-bridge"
        if is_jcocoa:
            version = "1.1"

        # Build path from maven coordinates
        group_path = group.replace(".", "/")
        jar_path = os.path.join(libraries_dir, group_path, artifact, version, f"{artifact}-{version}.jar")

        # Handle natives
        natives_key = lib.get("natives", {}).get("osx")
        if natives_key:
            # This is a natives-only entry, skip classpath but note it
            continue

        downloads = lib.get("downloads", {})
        artifact_dl = downloads.get("artifact", {})
        if artifact_dl:
            path = artifact_dl.get("path", "")
            if is_lwjgl and path:
                jar_path = os.path.join(lwjgl_dir, artifact, lwjgl_ver, f"{artifact}-{lwjgl_ver}.jar")
            elif is_jcocoa and path:
                jar_path = os.path.join(libraries_dir, group_path, artifact, version, f"{artifact}-{version}.jar")
            elif path:
                jar_path = os.path.join(libraries_dir, path)

        if jar_path not in cp_entries:
            cp_entries.append(jar_path)

    # Add the game jar
    game_jar = os.path.join(versions_dir, forge_name, f"{forge_name}.jar")
    if os.path.exists(game_jar):
        cp_entries.append(game_jar)

    # Build module path from Forge JVM args
    module_path_entries = []
    forge_jvm_args = forge.get("arguments", {}).get("jvm", [])
    forge_game_args = forge.get("arguments", {}).get("game", [])

    # Extract key info
    result = {
        "classpath": ":".join(cp_entries),
        "forge_name": forge_name,
        "mc_version": mc_version,
        "asset_index": forge.get("assets") or base.get("assetIndex", {}).get("id", mc_version),
        "main_class": forge.get("mainClass") or base.get("mainClass"),
        "forge_jvm_args": forge_jvm_args,
        "forge_game_args": forge_game_args,
    }
    json.dump(result, sys.stdout)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <instance_dir> <install_dir>", file=sys.stderr)
        sys.exit(1)
    resolve(sys.argv[1], sys.argv[2])
