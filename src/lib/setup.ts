import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import {
  createCliRenderer,
  BoxRenderable,
  TextRenderable,
  SliderRenderable,
} from "@opentui/core";
import { SpinnerRenderable } from "opentui-spinner";
import { INSTALL, NATIVES_DIR, LWJGL_VERSION } from "./paths.js";
import { findZuluDirs, JAVA_DIR } from "./java.js";

const LWJGL_DIR = join(INSTALL, "libraries/org/lwjgl");
const MAVEN = "https://repo1.maven.org/maven2/org/lwjgl";
const DEFAULT_JAVA_VERSION = "17";

const LWJGL_LIBS = [
  "lwjgl",
  "lwjgl-glfw",
  "lwjgl-jemalloc",
  "lwjgl-openal",
  "lwjgl-opengl",
  "lwjgl-stb",
  "lwjgl-tinyfd",
];

const NATIVE_DYLIB_MAP: Record<string, string> = {
  lwjgl: "liblwjgl.dylib",
  "lwjgl-glfw": "glfw/libglfw.dylib",
  "lwjgl-jemalloc": "jemalloc/libjemalloc.dylib",
  "lwjgl-openal": "openal/libopenal.dylib",
  "lwjgl-opengl": "opengl/liblwjgl_opengl.dylib",
  "lwjgl-stb": "stb/liblwjgl_stb.dylib",
  "lwjgl-tinyfd": "tinyfd/liblwjgl_tinyfd.dylib",
};

// -- Download helper with progress --

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function downloadWithProgress(
  url: string,
  destPath: string,
  onProgress?: (downloaded: number, total: number) => void,
): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);

  const total = Number(res.headers.get("content-length") ?? 0);
  if (!res.body || total === 0) {
    await Bun.write(destPath, res);
    onProgress?.(total, total);
    return;
  }

  let downloaded = 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    downloaded += value.byteLength;
    onProgress?.(downloaded, total);
  }

  const combined = new Uint8Array(downloaded);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  await Bun.write(destPath, combined);
}

// -- Check --

export interface SetupStatus {
  javaFound: boolean;
  nativesFound: boolean;
  jarsFound: boolean;
}

export async function checkSetup(javaVersion = DEFAULT_JAVA_VERSION): Promise<SetupStatus> {
  const javaFound = (await findZuluDirs(javaVersion)).length > 0;
  const nativesFound = await Bun.file(join(NATIVES_DIR, "liblwjgl.dylib")).exists();

  let jarsFound = true;
  for (const lib of LWJGL_LIBS) {
    const jarPath = join(LWJGL_DIR, lib, LWJGL_VERSION, `${lib}-${LWJGL_VERSION}.jar`);
    if (!(await Bun.file(jarPath).exists())) {
      jarsFound = false;
      break;
    }
  }

  return { javaFound, nativesFound, jarsFound };
}

// -- Setup steps --

interface StepUI {
  setStatus(icon: string, label: string): void;
  setProgress(downloaded: number, total: number): void;
  clearProgress(): void;
}

async function stepJava(ui: StepUI, javaVersion: string): Promise<string> {
  const label = `Zulu JDK ${javaVersion}`;
  const entries = await findZuluDirs(javaVersion);

  if (entries.length > 0) {
    const match = entries.at(-1)!;
    ui.setStatus("✓", `${label} — ${match}`);
    return join(JAVA_DIR, match, "bin/java");
  }

  ui.setStatus("↓", `${label} — fetching download URL...`);

  const apiUrl =
    `https://api.azul.com/metadata/v1/zulu/packages/?java_version=${javaVersion}&os=macos&arch=arm&archive_type=tar.gz&java_package_type=jdk&latest=true&crac_supported=false`;
  const pkgs = (await fetch(apiUrl).then((r) => r.json())) as Array<{
    name: string;
    download_url: string;
  }>;
  const pkg = pkgs.find(
    (p) => !p.name.includes("fx") && !p.name.includes("crac"),
  );
  if (!pkg) throw new Error(`Could not find Zulu ${javaVersion} ARM from Azul API`);

  ui.setStatus("↓", `${label} — downloading...`);
  const tarPath = `/tmp/zulu${javaVersion}-arm.tar.gz`;
  await downloadWithProgress(pkg.download_url, tarPath, (dl, total) => {
    ui.setProgress(dl, total);
  });

  ui.setStatus("⚙", `${label} — extracting...`);
  ui.clearProgress();
  await mkdir(JAVA_DIR, { recursive: true });
  const extract = Bun.spawn(["tar", "xzf", tarPath, "-C", JAVA_DIR], {
    stdio: ["ignore", "ignore", "ignore"],
  });
  if ((await extract.exited) !== 0) throw new Error("Failed to extract JDK");
  await Bun.file(tarPath).unlink();

  const newEntries = await findZuluDirs(javaVersion);
  const installed = newEntries.at(-1);
  if (!installed) throw new Error("JDK extraction succeeded but not found");

  ui.setStatus("✓", `${label} — ${installed}`);
  return join(JAVA_DIR, installed, "bin/java");
}

async function stepLwjglJars(ui: StepUI): Promise<void> {
  let skipped = 0;
  for (const lib of LWJGL_LIBS) {
    const dest = join(LWJGL_DIR, lib, LWJGL_VERSION);
    const jarName = `${lib}-${LWJGL_VERSION}.jar`;
    const jarPath = join(dest, jarName);
    if (await Bun.file(jarPath).exists()) {
      skipped++;
      continue;
    }

    await mkdir(dest, { recursive: true });
    const url = `${MAVEN}/${lib}/${LWJGL_VERSION}/${jarName}`;
    ui.setStatus("↓", `LWJGL ${LWJGL_VERSION} JARs — ${lib}...`);
    await downloadWithProgress(url, jarPath, (dl, total) => {
      ui.setProgress(dl, total);
    });
  }

  ui.clearProgress();
  if (skipped === LWJGL_LIBS.length) {
    ui.setStatus("✓", `LWJGL ${LWJGL_VERSION} JARs — already present`);
  } else {
    ui.setStatus("✓", `LWJGL ${LWJGL_VERSION} JARs — ${LWJGL_LIBS.length} libraries`);
  }
}

async function stepNatives(ui: StepUI): Promise<void> {
  const marker = join(NATIVES_DIR, "liblwjgl.dylib");
  if (await Bun.file(marker).exists()) {
    const file = Bun.spawn(["file", marker], { stdout: "pipe" });
    const output = await new Response(file.stdout).text();
    if (output.includes("arm64")) {
      ui.setStatus("✓", "ARM64 natives — already in place");
      return;
    }
  }

  await mkdir(NATIVES_DIR, { recursive: true });
  const tmpDir = "/tmp/lwjgl-arm64-setup";
  await mkdir(tmpDir, { recursive: true });

  for (const lib of LWJGL_LIBS) {
    const jarName = `${lib}-${LWJGL_VERSION}-natives-macos-arm64.jar`;
    const url = `${MAVEN}/${lib}/${LWJGL_VERSION}/${jarName}`;
    ui.setStatus("↓", `ARM64 natives — ${lib}...`);
    await downloadWithProgress(url, join(tmpDir, `${lib}-natives.jar`), (dl, total) => {
      ui.setProgress(dl, total);
    });
  }

  ui.setStatus("⚙", "ARM64 natives — extracting dylibs...");
  ui.clearProgress();

  for (const lib of LWJGL_LIBS) {
    const jarPath = join(tmpDir, `${lib}-natives.jar`);
    const unzip = Bun.spawn(["unzip", "-o", jarPath, "*.dylib", "-d", tmpDir], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await unzip.exited;
  }

  const src = join(tmpDir, "macos/arm64/org/lwjgl");
  for (const [, dylibPath] of Object.entries(NATIVE_DYLIB_MAP)) {
    const srcFile = join(src, dylibPath);
    const destFile = join(NATIVES_DIR, dylibPath.split("/").pop()!);
    if (await Bun.file(srcFile).exists()) {
      await Bun.write(destFile, Bun.file(srcFile));
    }
  }

  for (const sub of ["", "glfw", "jemalloc", "openal", "opengl", "stb", "tinyfd"]) {
    await mkdir(join(NATIVES_DIR, "macos/arm64/org/lwjgl", sub), { recursive: true });
  }
  const cpTree = Bun.spawn(
    ["cp", "-R", `${src}/`, join(NATIVES_DIR, "macos/arm64/org/lwjgl/")],
    { stdio: ["ignore", "ignore", "ignore"] },
  );
  await cpTree.exited;

  const jcocoaJar = join(INSTALL, "libraries/ca/weblite/java-objc-bridge/1.1/java-objc-bridge-1.1.jar");
  if (await Bun.file(jcocoaJar).exists()) {
    const unzip = Bun.spawn(
      ["unzip", "-o", jcocoaJar, "libjcocoa.dylib", "-d", NATIVES_DIR],
      { stdout: "ignore", stderr: "ignore" },
    );
    await unzip.exited;
  }

  Bun.spawn(["rm", "-rf", tmpDir]);
  ui.setStatus("✓", "ARM64 natives — installed");
}

// -- TUI --

export async function runSetup(javaVersion = DEFAULT_JAVA_VERSION): Promise<void> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useMouse: false,
  });

  const root = new BoxRenderable(renderer, {
    id: "root",
    flexDirection: "column",
    padding: 1,
    gap: 0,
    width: "100%",
    height: "100%",
  });

  const title = new TextRenderable(renderer, {
    id: "title",
    content: "mc-arm64 Setup",
    height: 2,
  });
  root.add(title);

  // Step rows — each holds a spinner/icon + label
  function makeStepRow(id: string, label: string) {
    const row = new BoxRenderable(renderer, {
      id: `${id}-row`,
      flexDirection: "row",
      gap: 1,
      height: 1,
      width: "100%",
    });
    const icon = new TextRenderable(renderer, {
      id: `${id}-icon`,
      content: " · ",
      width: 3,
      height: 1,
    });
    const text = new TextRenderable(renderer, {
      id: `${id}-text`,
      content: label,
      height: 1,
    });
    row.add(icon);
    row.add(text);
    return { row, icon, text };
  }

  const step1 = makeStepRow("step1", `Zulu JDK ${javaVersion} ARM64`);
  const step2 = makeStepRow("step2", "LWJGL 3.3.3 JARs");
  const step3 = makeStepRow("step3", "ARM64 native libraries");
  root.add(step1.row);
  root.add(step2.row);
  root.add(step3.row);

  // Spacer
  root.add(new TextRenderable(renderer, { id: "spacer", content: "", height: 1 }));

  // Progress bar area
  const progressRow = new BoxRenderable(renderer, {
    id: "progress-row",
    flexDirection: "row",
    gap: 1,
    height: 1,
    width: "100%",
    paddingLeft: 4,
  });

  const progressBar = new SliderRenderable(renderer, {
    id: "progress-bar",
    orientation: "horizontal",
    value: 0,
    min: 0,
    max: 100,
    viewPortSize: 1,
    height: 1,
    width: 30,
    foregroundColor: "#2563eb",
    backgroundColor: "#1e293b",
  });

  const progressLabel = new TextRenderable(renderer, {
    id: "progress-label",
    content: "",
    height: 1,
  });

  progressRow.add(progressBar);
  progressRow.add(progressLabel);
  root.add(progressRow);

  // Active spinner (shown next to current step)
  let activeSpinner: SpinnerRenderable | null = null;

  // Status
  const statusLine = new TextRenderable(renderer, {
    id: "status",
    content: "",
    height: 1,
  });
  root.add(statusLine);

  renderer.root.add(root);
  renderer.start();

  let alive = true;
  renderer.on("destroy", () => { alive = false; });

  function showProgress(visible: boolean) {
    if (!alive) return;
    progressBar.value = 0;
    progressLabel.content = "";
    // Show/hide by adjusting height
    progressRow.height = visible ? 1 : 0;
  }

  function makeUI(step: { row: BoxRenderable; icon: TextRenderable; text: TextRenderable }): StepUI {
    return {
      setStatus(icon: string, label: string) {
        if (!alive) return;
        // Remove spinner if active
        if (activeSpinner) {
          activeSpinner.stop();
          try { step.row.remove(activeSpinner.id); } catch {}
          activeSpinner = null;
        }
        step.icon.content = ` ${icon} `;
        step.text.content = label;

        // Add spinner for active states
        if (icon === "↓" || icon === "⚙") {
          activeSpinner = new SpinnerRenderable(renderer, {
            name: "dots",
            color: "#2563eb",
          });
          step.row.add(activeSpinner);
        }
      },
      setProgress(downloaded: number, total: number) {
        if (!alive) return;
        const pct = total > 0 ? Math.round((downloaded / total) * 100) : 0;
        progressBar.value = pct;
        progressLabel.content = `${pct}%  ${formatBytes(downloaded)} / ${formatBytes(total)}`;
      },
      clearProgress() {
        showProgress(false);
      },
    };
  }

  showProgress(true);

  try {
    const ui1 = makeUI(step1);
    await stepJava(ui1, javaVersion);
    ui1.clearProgress();
    showProgress(true);

    const ui2 = makeUI(step2);
    await stepLwjglJars(ui2);
    showProgress(true);

    const ui3 = makeUI(step3);
    await stepNatives(ui3);

    showProgress(false);
    if (alive) statusLine.content = "  Setup complete!";
    if (alive) await new Promise((r) => setTimeout(r, 1500));
  } catch (err) {
    showProgress(false);
    if (alive) statusLine.content = `  Error: ${err instanceof Error ? err.message : err}`;
    if (alive) await new Promise((r) => setTimeout(r, 3000));
    throw err;
  } finally {
    renderer.destroy();
    await new Promise((r) => setTimeout(r, 50));
  }
}
