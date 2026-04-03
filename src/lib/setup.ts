import {
  BoxRenderable,
  type CliRenderer,
  createCliRenderer,
  SliderRenderable,
  TextRenderable,
} from "@opentui/core";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { SpinnerRenderable } from "opentui-spinner";

import { findZuluJavaBin, JAVA_DIR } from "./java.js";
import { INSTALL, LWJGL_VERSION, NATIVES_DIR } from "./paths.js";

const ACCENT = "#2563eb";
const SURFACE = "#1e293b";
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
  jarsFound: boolean;
  javaFound: boolean;
  nativesFound: boolean;
}

export async function checkSetup(javaVersion = DEFAULT_JAVA_VERSION): Promise<SetupStatus> {
  const javaFound = (await findZuluJavaBin(javaVersion)) !== null;
  const nativesFound = await Bun.file(join(NATIVES_DIR, "liblwjgl.dylib")).exists();

  let jarsFound = true;
  for (const lib of LWJGL_LIBS) {
    const jarPath = join(LWJGL_DIR, lib, LWJGL_VERSION, `${lib}-${LWJGL_VERSION}.jar`);
    if (!(await Bun.file(jarPath).exists())) {
      jarsFound = false;
      break;
    }
  }

  return { jarsFound, javaFound, nativesFound };
}

// -- Setup steps --

interface StepUI {
  clearProgress(): void;
  setProgress(downloaded: number, total: number): void;
  setStatus(icon: string, label: string): void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-function -- intentional no-op for headless mode
const NOOP_UI: StepUI = { clearProgress() {}, setProgress() {}, setStatus() {} };

/** Install Zulu JDK if not present. Returns path to java binary. */
export async function installJava(javaVersion = DEFAULT_JAVA_VERSION): Promise<string> {
  return stepJava(NOOP_UI, javaVersion);
}

async function stepJava(ui: StepUI, javaVersion: string): Promise<string> {
  const label = `Zulu JDK ${javaVersion}`;
  const existing = await findZuluJavaBin(javaVersion);

  if (existing) {
    ui.setStatus("✓", `${label} — found`);
    return existing;
  }

  ui.setStatus("↓", `${label} — fetching download URL...`);

  const apiUrl =
    `https://api.azul.com/metadata/v1/zulu/packages/?java_version=${javaVersion}&os=macos&arch=arm&archive_type=tar.gz&java_package_type=jdk&latest=true&crac_supported=false`;
  const pkgs = (await fetch(apiUrl).then((r) => r.json())) as {
    download_url: string;
    name: string;
  }[];
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

  const javaBin = await findZuluJavaBin(javaVersion);
  if (!javaBin) throw new Error("JDK extraction succeeded but not found");

  ui.setStatus("✓", `${label} — installed`);
  return javaBin;
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
      stderr: "ignore",
      stdout: "ignore",
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
      { stderr: "ignore", stdout: "ignore" },
    );
    await unzip.exited;
  }

  Bun.spawn(["rm", "-rf", tmpDir]);
  ui.setStatus("✓", "ARM64 natives — installed");
}

// -- TUI --

interface SetupTUI {
  alive: boolean;
  makeUI(step: StepRow): StepUI;
  renderer: CliRenderer;
  showProgress(visible: boolean): void;
  statusLine: TextRenderable;
}

interface StepRow {
  icon: TextRenderable;
  row: BoxRenderable;
  text: TextRenderable;
}

function makeStepRow(renderer: CliRenderer, root: BoxRenderable, id: string, label: string): StepRow {
  const row = new BoxRenderable(renderer, {
    flexDirection: "row", gap: 1, height: 1, id: `${id}-row`, width: "100%",
  });
  const icon = new TextRenderable(renderer, { content: " · ", height: 1, id: `${id}-icon`, width: 3 });
  const text = new TextRenderable(renderer, { content: label, height: 1, id: `${id}-text` });
  row.add(icon);
  row.add(text);
  root.add(row);
  return { icon, row, text };
}

async function createSetupTUI(javaVersion: string): Promise<{ steps: [StepRow, StepRow, StepRow]; tui: SetupTUI; }> {
  const renderer = await createCliRenderer({ exitOnCtrlC: true, useMouse: false });

  const root = new BoxRenderable(renderer, {
    flexDirection: "column", gap: 0, height: "100%", id: "root", padding: 1, width: "100%",
  });
  root.add(new TextRenderable(renderer, { content: "mc-arm64 Setup", height: 2, id: "title" }));

  const step1 = makeStepRow(renderer, root, "step1", `Zulu JDK ${javaVersion} ARM64`);
  const step2 = makeStepRow(renderer, root, "step2", "LWJGL 3.3.3 JARs");
  const step3 = makeStepRow(renderer, root, "step3", "ARM64 native libraries");

  root.add(new TextRenderable(renderer, { content: "", height: 1, id: "spacer" }));

  const progressRow = new BoxRenderable(renderer, {
    flexDirection: "row", gap: 1, height: 1, id: "progress-row", paddingLeft: 4, width: "100%",
  });
  const progressBar = new SliderRenderable(renderer, {
    backgroundColor: SURFACE, foregroundColor: ACCENT, height: 1, id: "progress-bar", max: 100,
    min: 0, orientation: "horizontal", value: 0, viewPortSize: 1, width: 30,
  });
  const progressLabel = new TextRenderable(renderer, { content: "", height: 1, id: "progress-label" });
  progressRow.add(progressBar);
  progressRow.add(progressLabel);
  root.add(progressRow);

  let activeSpinner: SpinnerRenderable | null = null;
  const statusLine = new TextRenderable(renderer, { content: "", height: 1, id: "status" });
  root.add(statusLine);

  renderer.root.add(root);
  renderer.start();

  let alive = true;
  renderer.on("destroy", () => { alive = false; });

  function showProgress(visible: boolean) {
    if (!alive) return;
    progressBar.value = 0;
    progressLabel.content = "";
    progressRow.height = visible ? 1 : 0;
  }

  function makeUI(step: StepRow): StepUI {
    return {
      clearProgress() { showProgress(false); },
      setProgress(downloaded: number, total: number) {
        if (!alive) return;
        const pct = total > 0 ? Math.round((downloaded / total) * 100) : 0;
        progressBar.value = pct;
        progressLabel.content = `${pct}%  ${formatBytes(downloaded)} / ${formatBytes(total)}`;
      },
      setStatus(icon: string, label: string) {
        if (!alive) return;
        if (activeSpinner) {
          activeSpinner.stop();
          try { step.row.remove(activeSpinner.id); } catch { /* may already be removed */ }
          activeSpinner = null;
        }
        step.icon.content = ` ${icon} `;
        step.text.content = label;
        if (icon === "↓" || icon === "⚙") {
          activeSpinner = new SpinnerRenderable(renderer, { color: ACCENT, name: "dots" });
          step.row.add(activeSpinner);
        }
      },
    };
  }

  const tui: SetupTUI = {
    get alive() { return alive; }, makeUI, renderer,
    showProgress,
    statusLine,
  };

  return { steps: [step1, step2, step3], tui };
}

export async function runSetup(javaVersion = DEFAULT_JAVA_VERSION): Promise<void> {
  const { steps: [step1, step2, step3], tui } = await createSetupTUI(javaVersion);

  tui.showProgress(true);

  try {
    const ui1 = tui.makeUI(step1);
    await stepJava(ui1, javaVersion);
    ui1.clearProgress();
    tui.showProgress(true);

    const ui2 = tui.makeUI(step2);
    await stepLwjglJars(ui2);
    tui.showProgress(true);

    const ui3 = tui.makeUI(step3);
    await stepNatives(ui3);

    tui.showProgress(false);
    if (tui.alive) tui.statusLine.content = "  Setup complete!";
    if (tui.alive) await new Promise((r) => setTimeout(r, 1500));
  } catch (error) {
    tui.showProgress(false);
    if (tui.alive) tui.statusLine.content = `  Error: ${error instanceof Error ? error.message : error}`;
    if (tui.alive) await new Promise((r) => setTimeout(r, 3000));
    throw error;
  } finally {
    tui.renderer.destroy();
    await new Promise((r) => setTimeout(r, 50));
  }
}
