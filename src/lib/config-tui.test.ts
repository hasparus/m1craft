import {
  BoxRenderable,
  InputRenderable,
  SelectRenderable,
  TextRenderable,
} from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";
import { describe, expect, test } from "bun:test";

describe("config TUI", () => {
  test("renders title, instance selector, and java selector", async () => {
    const { captureCharFrame, renderer, renderOnce } = await createTestRenderer({
      height: 30,
      width: 60,
    });

    const root = new BoxRenderable(renderer, {
      flexDirection: "column", gap: 1, height: "100%", id: "root", padding: 1, width: "100%",
    });

    root.add(new TextRenderable(renderer, { content: "mc-arm64 config", height: 1, id: "title" }));
    root.add(new TextRenderable(renderer, { content: "Default instance:", height: 1, id: "instance-label" }));

    const select = new SelectRenderable(renderer, {
      height: 5,
      id: "instance-select",
      options: [
        { description: "/path/to/a", name: "Test Pack A" },
        { description: "/path/to/b", name: "Test Pack B" },
      ],
      selectedIndex: 0,
      showDescription: true,
      width: "100%",
    });
    root.add(select);

    root.add(new TextRenderable(renderer, { content: "Java version:", height: 1, id: "java-label" }));

    renderer.root.add(root);
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("mc-arm64 config");
    expect(frame).toContain("Default instance:");
    expect(frame).toContain("Test Pack A");
    expect(frame).toContain("Test Pack B");
    expect(frame).toContain("Java version:");

    renderer.destroy();
  });

  test("select navigates with arrow keys", async () => {
    const { mockInput, renderer, renderOnce } = await createTestRenderer({
      height: 20,
      width: 60,
    });

    const root = new BoxRenderable(renderer, {
      flexDirection: "column", height: "100%", id: "root", width: "100%",
    });

    const select = new SelectRenderable(renderer, {
      height: 6,
      id: "sel",
      options: [
        { description: "", name: "Option A" },
        { description: "", name: "Option B" },
        { description: "", name: "Option C" },
      ],
      selectedIndex: 0,
      width: "100%",
    });
    root.add(select);
    renderer.root.add(root);
    select.focus();

    await renderOnce();
    expect(select.getSelectedIndex()).toBe(0);

    mockInput.pressArrow("down");
    await renderOnce();
    expect(select.getSelectedIndex()).toBe(1);

    mockInput.pressArrow("down");
    await renderOnce();
    expect(select.getSelectedIndex()).toBe(2);

    renderer.destroy();
  });

  test("input field captures typed text", async () => {
    const { captureCharFrame, mockInput, renderer, renderOnce } = await createTestRenderer({
      height: 10,
      width: 40,
    });

    const root = new BoxRenderable(renderer, {
      flexDirection: "column", height: "100%", id: "root", width: "100%",
    });

    const input = new InputRenderable(renderer, {
      id: "mem-input",
      placeholder: "e.g. 8192m",
      value: "",
      width: "100%",
    });
    root.add(input);
    renderer.root.add(root);
    input.focus();

    await mockInput.typeText("4096m");
    await renderOnce();

    expect(input.value).toBe("4096m");
    const frame = captureCharFrame();
    expect(frame).toContain("4096m");

    renderer.destroy();
  });
});
