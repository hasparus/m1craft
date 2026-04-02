#!/usr/bin/env python3
"""ARM64 Minecraft Forge launcher for Apple Silicon."""
import glob, json, os, subprocess, sys

def find_java():
    matches = glob.glob(os.path.expanduser("~/Library/Java/zulu17.*-macosx_aarch64/bin/java"))
    if not matches:
        print("Zulu 17 ARM not found. Run setup.sh first.")
        sys.exit(1)
    return matches[0]

def load_json(path):
    with open(path) as f:
        return json.load(f)

def os_matches(rules):
    if not rules:
        return True
    result = False
    for rule in rules:
        action = rule["action"] == "allow"
        result = action if "os" not in rule else (action if rule["os"].get("name") == "osx" else result)
    return result

def resolve(instance_dir, install_dir, lwjgl_ver="3.3.3"):
    versions_dir = os.path.join(install_dir, "versions")
    libraries_dir = os.path.join(install_dir, "libraries")

    instance = load_json(os.path.join(instance_dir, "minecraftinstance.json"))
    forge_name = instance["baseModLoader"]["name"]
    mc_version = instance["gameVersion"]

    forge = load_json(os.path.join(versions_dir, forge_name, f"{forge_name}.json"))
    base = load_json(os.path.join(versions_dir, mc_version, f"{mc_version}.json"))

    cp = []
    for lib in base.get("libraries", []) + forge.get("libraries", []):
        if not os_matches(lib.get("rules")):
            continue
        if lib.get("natives", {}).get("osx"):
            continue

        parts = lib["name"].split(":")
        group, artifact, version = parts[0], parts[1], parts[2]

        if group == "org.lwjgl":
            version = lwjgl_ver
        if artifact == "java-objc-bridge":
            version = "1.1"

        dl = lib.get("downloads", {}).get("artifact", {})
        if dl.get("path") and group == "org.lwjgl":
            path = os.path.join(libraries_dir, "org/lwjgl", artifact, version, f"{artifact}-{version}.jar")
        elif dl.get("path") and artifact == "java-objc-bridge":
            path = os.path.join(libraries_dir, group.replace(".", "/"), artifact, version, f"{artifact}-{version}.jar")
        elif dl.get("path"):
            path = os.path.join(libraries_dir, dl["path"])
        else:
            path = os.path.join(libraries_dir, group.replace(".", "/"), artifact, version, f"{artifact}-{version}.jar")

        if path not in cp:
            cp.append(path)

    game_jar = os.path.join(versions_dir, forge_name, f"{forge_name}.jar")
    if os.path.exists(game_jar):
        cp.append(game_jar)

    # Resolve Forge JVM args
    jvm_args = []
    module_path = ""
    raw_jvm = forge.get("arguments", {}).get("jvm", [])
    lib_dir = libraries_dir
    i = 0
    while i < len(raw_jvm):
        arg = raw_jvm[i].replace("${library_directory}", lib_dir).replace("${classpath_separator}", ":").replace("${version_name}", forge_name)
        if arg in ("-p", "--module-path") and i + 1 < len(raw_jvm):
            module_path = raw_jvm[i + 1].replace("${library_directory}", lib_dir).replace("${classpath_separator}", ":")
            i += 2
            continue
        jvm_args.append(arg)
        i += 1

    game_args = forge.get("arguments", {}).get("game", [])
    asset_index = forge.get("assets") or base.get("assetIndex", {}).get("id", mc_version)
    main_class = forge.get("mainClass") or base.get("mainClass")

    return {
        "cp": ":".join(cp), "jvm_args": jvm_args, "module_path": module_path,
        "game_args": game_args, "asset_index": asset_index, "main_class": main_class,
        "forge_name": forge_name,
    }

def main():
    cf_base = os.environ.get("CF_BASE", os.path.expanduser("~/Documents/curseforge/minecraft"))
    install = os.path.join(cf_base, "Install")
    instance = os.environ.get("INSTANCE", os.path.join(cf_base, "Instances", "Isle of Berk (Claws of Berk)"))
    natives = os.path.join(install, "natives", "arm64")
    script_dir = os.path.dirname(os.path.abspath(__file__))

    if not os.path.isdir(instance):
        print(f"Instance not found: {instance}")
        print(f"Set INSTANCE env var to your modpack path.")
        sys.exit(1)

    java = find_java()

    # Auth
    auth_script = os.path.join(script_dir, "mc-auth.py")
    result = subprocess.run([sys.executable, auth_script], capture_output=True, text=True)
    if result.returncode != 0:
        sys.stderr.write(result.stderr)
        sys.exit(1)
    if result.stderr:
        sys.stderr.write(result.stderr)
    auth = json.loads(result.stdout)

    print(f"Auth: {auth['username']} ({auth['uuid'][:8]}...)")

    # Resolve classpath
    r = resolve(instance, install)
    print(f"Launching {r['forge_name']}...")

    cmd = [
        java,
        "-XstartOnFirstThread", "-Xss1M",
        f"-Dorg.lwjgl.librarypath={natives}",
        f"-Djava.library.path={natives}",
        "-Dfml.earlyprogresswindow=false",
        "-Dminecraft.launcher.brand=mc-arm64",
        *r["jvm_args"],
        "-cp", r["cp"],
        "-p", r["module_path"],
        "--add-modules", "ALL-MODULE-PATH",
        "--add-opens", "java.base/java.util.jar=cpw.mods.securejarhandler",
        "--add-opens", "java.base/java.lang.invoke=cpw.mods.securejarhandler",
        "--add-exports", "java.base/sun.security.util=cpw.mods.securejarhandler",
        "--add-exports", "jdk.naming.dns/com.sun.jndi.dns=java.naming",
        "-Xmx8192m", "-Xms256m",
        "-Dfml.ignorePatchDiscrepancies=true",
        "-Dfml.ignoreInvalidMinecraftCertificates=true",
        "-Duser.language=en",
        "-Dlog4j2.formatMsgNoLookups=true",
        r["main_class"],
        "--username", auth["username"],
        "--version", r["forge_name"],
        "--gameDir", instance,
        "--assetsDir", os.path.join(install, "assets"),
        "--assetIndex", r["asset_index"],
        "--uuid", auth["uuid"],
        "--accessToken", auth["accessToken"],
        "--userType", "msa",
        "--versionType", "release",
        "--width", "1024", "--height", "768",
        *r["game_args"],
    ]

    os.execv(java, cmd)

if __name__ == "__main__":
    main()
