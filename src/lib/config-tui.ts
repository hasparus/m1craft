import {
  BoxRenderable,
  type CliRenderer,
  createCliRenderer,
  InputRenderable,
  type SelectOption,
  SelectRenderable,
  TextRenderable,
} from "@opentui/core";
import { join } from "node:path";

import type { UserConfig } from "./config.js";

import { discoverInstances, loadConfig, saveConfig } from "./config.js";
import { CF_BASE, getConfigPath } from "./paths.js";

const SELECT_STYLE = {
  backgroundColor: "#0f172a",
  descriptionColor: "#475569",
  focusedBackgroundColor: "#1e293b",
  focusedTextColor: "#e2e8f0",
  selectedBackgroundColor: "#2563eb",
  selectedDescriptionColor: "#93c5fd",
  selectedTextColor: "#ffffff",
  textColor: "#94a3b8",
} as const;

const INPUT_STYLE = {
  backgroundColor: "#0f172a",
  focusedBackgroundColor: "#1e293b",
  focusedTextColor: "#ffffff",
  textColor: "#e2e8f0",
} as const;

const JAVA_VERSIONS = [
  { description: "Minecraft 26.1+, latest vanilla", name: "Java 25", value: "25" },
  { description: "Forge 1.20.5+, NeoForge, newer Fabric", name: "Java 21", value: "21" },
  { description: "Forge 1.18–1.20.4, most modpacks", name: "Java 17", value: "17" },
  { description: "Legacy modpacks (MC 1.16 and below)",  name: "Java 8", value: "8" },
];

function createInstanceSelector(renderer: CliRenderer, instanceNames: string[], config: UserConfig) {
  const options: SelectOption[] = instanceNames.map((name) => ({
    description: join(CF_BASE, "Instances", name),
    name,
  }));
  const currentIdx = config.defaultInstance ? instanceNames.indexOf(config.defaultInstance) : 0;

  return new SelectRenderable(renderer, {
    height: Math.min(options.length * 2 + 1, 12),
    id: "instance-select",
    options,
    selectedIndex: Math.max(0, currentIdx),
    showDescription: true,
    showScrollIndicator: true,
    width: "100%",
    wrapSelection: true,
    ...SELECT_STYLE,
  });
}

function createJavaSelector(renderer: CliRenderer, config: UserConfig) {
  const options: SelectOption[] = JAVA_VERSIONS.map(({ description, name }) => ({ description, name }));
  const values = JAVA_VERSIONS.map((j) => j.value);
  const defaultIdx = values.indexOf("17");
  const currentIdx = values.indexOf(config.javaVersion ?? "17");

  const select = new SelectRenderable(renderer, {
    height: Math.min(options.length * 2 + 1, 8),
    id: "java-select",
    options,
    selectedIndex: currentIdx === -1 ? defaultIdx : currentIdx,
    showDescription: true,
    width: "100%",
    wrapSelection: true,
    ...SELECT_STYLE,
  });

  return { select, values };
}

function createLabeledInput(renderer: CliRenderer, id: string, label: string, value: string, placeholder: string) {
  const box = new BoxRenderable(renderer, { flexDirection: "column", flexGrow: 1, id: `${id}-box` });
  box.add(new TextRenderable(renderer, { content: label, height: 1, id: `${id}-label` }));
  const input = new InputRenderable(renderer, {
    id: `${id}-input`,
    placeholder,
    value,
    width: "100%",
    ...INPUT_STYLE,
  });
  box.add(input);
  return { box, input };
}

function createInputRow(renderer: CliRenderer, id: string, fields: { id: string; label: string; placeholder: string; value: string; }[]) {
  const row = new BoxRenderable(renderer, { flexDirection: "row", gap: 2, height: 3, id, width: "100%" });
  const inputs: InputRenderable[] = [];
  for (const f of fields) {
    const { box, input } = createLabeledInput(renderer, f.id, f.label, f.value, f.placeholder);
    row.add(box);
    inputs.push(input);
  }
  return { inputs, row };
}

interface MountOptions {
  config: UserConfig;
  instanceNames: string[];
  /** Persist the assembled config. Defaults to writing it to disk. */
  onSave?: (config: UserConfig) => Promise<void>;
  /** ms to leave the "Saved" banner on screen before destroying the renderer. */
  saveBannerMs?: number;
}

/** Mount the config TUI onto an existing renderer. Returns refs for tests. */
export function mountConfigTui(renderer: CliRenderer, opts: MountOptions) {
  const { config, instanceNames, onSave = saveConfig, saveBannerMs = 800 } = opts;

  const root = new BoxRenderable(renderer, {
    flexDirection: "column", gap: 1, height: "100%", id: "root", padding: 1, width: "100%",
  });

  root.add(new TextRenderable(renderer, { content: "m1craft config", height: 1, id: "title" }));

  root.add(new TextRenderable(renderer, { content: "Default instance:", height: 1, id: "instance-label" }));
  const instanceSelect = createInstanceSelector(renderer, instanceNames, config);
  root.add(instanceSelect);

  root.add(new TextRenderable(renderer, { content: "Java version:", height: 1, id: "java-label" }));
  const { select: javaSelect, values: javaVersionValues } = createJavaSelector(renderer, config);
  root.add(javaSelect);

  const { inputs: [xmxInput, xmsInput], row: memRow } = createInputRow(renderer, "mem-row", [
    { id: "xmx", label: "Max memory (-Xmx):", placeholder: "e.g. 8192m", value: config.xmx ?? "8192m" },
    { id: "xms", label: "Min memory (-Xms):", placeholder: "e.g. 256m", value: config.xms ?? "256m" },
  ]);
  root.add(memRow);

  const { inputs: [widthInput, heightInput], row: winRow } = createInputRow(renderer, "win-row", [
    { id: "width", label: "Window width:", placeholder: "e.g. 1024", value: String(config.width ?? 1024) },
    { id: "height", label: "Window height:", placeholder: "e.g. 768", value: String(config.height ?? 768) },
  ]);
  root.add(winRow);

  let saving = false;
  let saved = false;
  async function save() {
    if (saving || saved) return;
    saving = true;
    const selected = instanceSelect.getSelectedOption();
    const javaIdx = javaSelect.getSelectedIndex();
    const newConfig: UserConfig = {
      defaultInstance: selected?.name,
      height: Number.parseInt(heightInput!.value) || undefined,
      javaVersion: javaVersionValues[javaIdx] ?? "17",
      width: Number.parseInt(widthInput!.value) || undefined,
      xms: xmsInput!.value || undefined,
      xmx: xmxInput!.value || undefined,
    };
    try {
      await onSave(newConfig);
      saved = true;
      statusBar.content = `Saved to ${getConfigPath()}`;
      setTimeout(() => { renderer.destroy(); }, saveBannerMs);
    } catch (error) {
      statusBar.content = `  Save failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      saving = false;
    }
  }

  const saveButton = new TextRenderable(renderer, {
    bg: "#1e293b",
    content: "  [ Save ]  ",
    fg: "#e2e8f0",
    height: 1,
    id: "save-button",
    onKeyDown: (key) => {
      if (key.name === "return" || key.name === "space") void save();
    },
    onMouseDown: () => { void save(); },
  });
  saveButton.focusable = true;
  saveButton.on("focused", () => { saveButton.bg = "#2563eb"; });
  saveButton.on("blurred", () => { saveButton.bg = "#1e293b"; });
  root.add(saveButton);

  const statusBar = new TextRenderable(renderer, {
    content: "Tab: navigate | Enter: confirm | Ctrl+S / Cmd+S: save | Ctrl+C: quit",
    height: 1,
    id: "status",
  });
  root.add(statusBar);

  // Focus management
  const focusables = [instanceSelect, javaSelect, xmxInput!, xmsInput!, widthInput!, heightInput!, saveButton];
  let currentField = 0;

  function focusField(index: number) {
    currentField = ((index % focusables.length) + focusables.length) % focusables.length;
    focusables[currentField]!.focus();
  }

  renderer.keyInput.on("keypress", async (key) => {
    if (key.name === "tab" && !key.shift) {
      focusField(currentField + 1);
    } else if (key.name === "tab" && key.shift) {
      focusField(currentField - 1);
    } else if (key.name === "s" && (key.ctrl || key.meta)) {
      await save();
    }
  });

  for (const [i, input] of [xmxInput!, xmsInput!, widthInput!, heightInput!].entries()) {
    input.on("enter", () => { focusField(i + 3); });
  }

  renderer.root.add(root);
  focusField(0);

  return { focusField, root, save, saveButton, statusBar };
}

/** Run the interactive config TUI. Resolves when user saves or quits. */
export async function configTui(): Promise<void> {
  const config = await loadConfig();
  const instanceNames = await discoverInstances();

  if (instanceNames.length === 0) {
    console.error("No CurseForge instances found. Launch a modpack through CurseForge first.");
    return;
  }

  const renderer = await createCliRenderer({ exitOnCtrlC: true, useMouse: true });
  mountConfigTui(renderer, { config, instanceNames });
  renderer.start();
  await new Promise<void>((resolve) => { renderer.on("destroy", resolve); });
}
