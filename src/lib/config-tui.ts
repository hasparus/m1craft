import {
  createCliRenderer,
  BoxRenderable,
  TextRenderable,
  SelectRenderable,
  InputRenderable,
  type SelectOption,
} from "@opentui/core";
import type { UserConfig } from "./types.js";
import { loadConfig, saveConfig, discoverInstances } from "./config.js";
import { CF_BASE, CONFIG_PATH } from "./paths.js";
import { join } from "node:path";

/** Run the interactive config TUI. Resolves when user saves or quits. */
export async function configTui(): Promise<void> {
  const config = await loadConfig();
  const instanceNames = await discoverInstances();

  if (instanceNames.length === 0) {
    console.error(
      "No CurseForge instances found. Launch a modpack through CurseForge first.",
    );
    return;
  }

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useMouse: true,
  });

  // -- State --
  let currentField = 0;

  // -- Root --
  const root = new BoxRenderable(renderer, {
    id: "root",
    flexDirection: "column",
    padding: 1,
    gap: 1,
    width: "100%",
    height: "100%",
  });

  // -- Title --
  const title = new TextRenderable(renderer, {
    id: "title",
    content: "mc-arm64 config",
    height: 1,
  });
  root.add(title);

  // -- Instance selector --
  const instanceLabel = new TextRenderable(renderer, {
    id: "instance-label",
    content: "Default instance:",
    height: 1,
  });
  root.add(instanceLabel);

  const instanceOptions: SelectOption[] = instanceNames.map((name) => ({
    name,
    description: join(CF_BASE, "Instances", name),
  }));

  const currentInstanceIdx = config.defaultInstance
    ? instanceNames.indexOf(config.defaultInstance)
    : 0;

  const instanceSelect = new SelectRenderable(renderer, {
    id: "instance-select",
    options: instanceOptions,
    selectedIndex: Math.max(0, currentInstanceIdx),
    wrapSelection: true,
    showDescription: true,
    showScrollIndicator: true,
    height: Math.min(instanceOptions.length * 2 + 1, 12),
    width: "100%",
    selectedBackgroundColor: "#2563eb",
    selectedTextColor: "#ffffff",
    focusedBackgroundColor: "#1e293b",
    focusedTextColor: "#e2e8f0",
    backgroundColor: "#0f172a",
    textColor: "#94a3b8",
    descriptionColor: "#475569",
    selectedDescriptionColor: "#93c5fd",
  });
  root.add(instanceSelect);

  // -- Java version --
  const javaLabel = new TextRenderable(renderer, {
    id: "java-label",
    content: "Java version:",
    height: 1,
  });
  root.add(javaLabel);

  const javaVersionOptions: SelectOption[] = [
    { name: "Java 25", description: "Minecraft 26.1+, latest vanilla" },
    { name: "Java 21", description: "Forge 1.20.5+, NeoForge, newer Fabric" },
    { name: "Java 17", description: "Forge 1.18–1.20.4, most modpacks" },
    { name: "Java 8",  description: "Legacy modpacks (MC 1.16 and below)" },
  ];
  const javaVersionValues = ["25", "21", "17", "8"];
  const defaultJavaIdx = javaVersionValues.indexOf("17");
  const currentJavaIdx = javaVersionValues.indexOf(config.javaVersion ?? "17");

  const javaSelect = new SelectRenderable(renderer, {
    id: "java-select",
    options: javaVersionOptions,
    selectedIndex: currentJavaIdx >= 0 ? currentJavaIdx : defaultJavaIdx,
    wrapSelection: true,
    showDescription: true,
    height: Math.min(javaVersionOptions.length * 2 + 1, 8),
    width: "100%",
    selectedBackgroundColor: "#2563eb",
    selectedTextColor: "#ffffff",
    focusedBackgroundColor: "#1e293b",
    focusedTextColor: "#e2e8f0",
    backgroundColor: "#0f172a",
    textColor: "#94a3b8",
    descriptionColor: "#475569",
    selectedDescriptionColor: "#93c5fd",
  });
  root.add(javaSelect);

  // -- Memory inputs --
  const memRow = new BoxRenderable(renderer, {
    id: "mem-row",
    flexDirection: "row",
    gap: 2,
    height: 3,
    width: "100%",
  });
  root.add(memRow);

  const xmxBox = new BoxRenderable(renderer, {
    id: "xmx-box",
    flexDirection: "column",
    flexGrow: 1,
  });
  xmxBox.add(
    new TextRenderable(renderer, { id: "xmx-label", content: "Max memory (-Xmx):", height: 1 }),
  );
  const xmxInput = new InputRenderable(renderer, {
    id: "xmx-input",
    value: config.xmx ?? "8192m",
    placeholder: "e.g. 8192m",
    width: "100%",
    backgroundColor: "#0f172a",
    textColor: "#e2e8f0",
    focusedBackgroundColor: "#1e293b",
    focusedTextColor: "#ffffff",
  });
  xmxBox.add(xmxInput);
  memRow.add(xmxBox);

  const xmsBox = new BoxRenderable(renderer, {
    id: "xms-box",
    flexDirection: "column",
    flexGrow: 1,
  });
  xmsBox.add(
    new TextRenderable(renderer, { id: "xms-label", content: "Min memory (-Xms):", height: 1 }),
  );
  const xmsInput = new InputRenderable(renderer, {
    id: "xms-input",
    value: config.xms ?? "256m",
    placeholder: "e.g. 256m",
    width: "100%",
    backgroundColor: "#0f172a",
    textColor: "#e2e8f0",
    focusedBackgroundColor: "#1e293b",
    focusedTextColor: "#ffffff",
  });
  xmsBox.add(xmsInput);
  memRow.add(xmsBox);

  // -- Window size --
  const winRow = new BoxRenderable(renderer, {
    id: "win-row",
    flexDirection: "row",
    gap: 2,
    height: 3,
    width: "100%",
  });
  root.add(winRow);

  const widthBox = new BoxRenderable(renderer, {
    id: "width-box",
    flexDirection: "column",
    flexGrow: 1,
  });
  widthBox.add(
    new TextRenderable(renderer, { id: "width-label", content: "Window width:", height: 1 }),
  );
  const widthInput = new InputRenderable(renderer, {
    id: "width-input",
    value: String(config.width ?? 1024),
    placeholder: "e.g. 1024",
    width: "100%",
    backgroundColor: "#0f172a",
    textColor: "#e2e8f0",
    focusedBackgroundColor: "#1e293b",
    focusedTextColor: "#ffffff",
  });
  widthBox.add(widthInput);
  winRow.add(widthBox);

  const heightBox = new BoxRenderable(renderer, {
    id: "height-box",
    flexDirection: "column",
    flexGrow: 1,
  });
  heightBox.add(
    new TextRenderable(renderer, { id: "height-label", content: "Window height:", height: 1 }),
  );
  const heightInput = new InputRenderable(renderer, {
    id: "height-input",
    value: String(config.height ?? 768),
    placeholder: "e.g. 768",
    width: "100%",
    backgroundColor: "#0f172a",
    textColor: "#e2e8f0",
    focusedBackgroundColor: "#1e293b",
    focusedTextColor: "#ffffff",
  });
  heightBox.add(heightInput);
  winRow.add(heightBox);

  // -- Status bar --
  const statusBar = new TextRenderable(renderer, {
    id: "status",
    content: "Tab/Shift+Tab: navigate | Enter: select/confirm | Ctrl+S: save | Ctrl+C: quit",
    height: 1,
  });
  root.add(statusBar);

  // -- Focus management --
  const focusables = [instanceSelect, javaSelect, xmxInput, xmsInput, widthInput, heightInput];

  function focusField(index: number) {
    currentField = ((index % focusables.length) + focusables.length) % focusables.length;
    focusables[currentField]!.focus();
  }

  // -- Key handling --
  renderer.keyInput.on("keypress", async (key) => {
    if (key.name === "tab" && !key.shift) {
      focusField(currentField + 1);
    } else if (key.name === "tab" && key.shift) {
      focusField(currentField - 1);
    } else if (key.name === "s" && key.ctrl) {
      // Save
      const selected = instanceSelect.getSelectedOption();
      const javaIdx = javaSelect.getSelectedIndex();
      const newConfig: UserConfig = {
        defaultInstance: selected?.name,
        javaVersion: javaVersionValues[javaIdx] ?? "17",
        xmx: xmxInput.value || undefined,
        xms: xmsInput.value || undefined,
        width: parseInt(widthInput.value) || undefined,
        height: parseInt(heightInput.value) || undefined,
      };
      await saveConfig(newConfig);
      statusBar.content = `Saved to ${CONFIG_PATH}`;
      setTimeout(() => {
        renderer.destroy();
      }, 800);
    }
  });

  // Enter on input fields advances to next field
  // focusables: [instanceSelect(0), javaSelect(1), xmxInput(2), xmsInput(3), widthInput(4), heightInput(5)]
  for (const [i, input] of [xmxInput, xmsInput, widthInput, heightInput].entries()) {
    input.on("enter", () => {
      focusField(i + 3);
    });
  }

  renderer.root.add(root);
  renderer.start();
  focusField(0);

  // Wait for the renderer to be destroyed (Ctrl+C or after save)
  await new Promise<void>((resolve) => {
    renderer.on("destroy", resolve);
  });
}
