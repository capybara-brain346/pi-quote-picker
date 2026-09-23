import assert from "node:assert/strict";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { assistantText, quote, replaceLine, splitUnits } = await jiti.import("../extensions/units.ts");
const { default: registerQuotePicker } = await jiti.import("../extensions/quote-picker.ts");

assert.deepEqual(splitUnits("Intro\n\n- `prune` *does not* delete\n- Running `list`\n\n```sh\necho hi\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |"), [
  "Intro",
  "- `prune` *does not* delete",
  "- Running `list`",
  "```sh\necho hi\n```",
  "| A | B |\n|---|---|\n| 1 | 2 |",
]);
assert.deepEqual(splitUnits("Heading\n---\nbody"), ["Heading\n---", "body"]);
assert.deepEqual(splitUnits("## Heading\nbody\n\nNext paragraph"), [
  "## Heading",
  "body",
  "Next paragraph",
]);
assert.deepEqual(splitUnits("before\n~~~~js\n- not a list\n\n~~~~\nafter"), [
  "before",
  "~~~~js\n- not a list\n\n~~~~",
  "after",
]);
assert.deepEqual(splitUnits("| a | b |\n|---|---|\n| 1 | 2 |\nnext\n- first\n- second"), [
  "| a | b |\n|---|---|\n| 1 | 2 |",
  "next",
  "- first",
  "- second",
]);
assert.equal(quote("one\n\ntwo"), "> one\n>\n> two");
assert.equal(quote("one\ntwo"), "> one\n> two");
assert.equal(replaceLine([">", ""], 0, "> quote"), "> quote\n");

const session = SessionManager.inMemory();
const append = (role, content) => session.appendMessage({ role, content, timestamp: Date.now() });
append("user", "request one");
append("assistant", [
  { type: "text", text: "Opening paragraph.\n\n## Details\nAn early paragraph." },
  { type: "thinking", thinking: "not selectable" },
]);
const branchPoint = session.getLeafId();
append("user", "alternate request");
append("assistant", [{ type: "text", text: "Abandoned branch paragraph." }]);
session.branch(branchPoint);
append("user", "request two");
append("toolResult", [{ type: "text", text: "tool output" }]);
append("assistant", [{ type: "text", text: "- First item\n- Second item\n\n| A | B |\n|---|---|\n| 1 | 2 |" }]);
append("assistant", [{ type: "text", text: "Final paragraph.\n\n```js\nconst answer = 42;\n```" }]);
const units = splitUnits(assistantText(session.getBranch()));
assert.deepEqual(units, [
  "Opening paragraph.",
  "## Details",
  "An early paragraph.",
  "- First item",
  "- Second item",
  "| A | B |\n|---|---|\n| 1 | 2 |",
  "Final paragraph.",
  "```js\nconst answer = 42;\n```",
]);
assert.equal(quote(units[0]), "> Opening paragraph.");
assert.equal(units.at(-2), "Final paragraph.");

class FakeEditor {
  text = "";
  cursor = { line: 0, col: 0 };
  baseEnters = 0;

  getCursor() { return this.cursor; }
  getLines() { return this.text.split("\n"); }
  getText() { return this.text; }
  setText(text) {
    this.text = text;
    const lines = this.getLines();
    this.cursor = { line: lines.length - 1, col: lines.at(-1).length };
  }
  handleInput(data) {
    if (data === "\r") {
      this.baseEnters++;
      return;
    }
    const lines = this.getLines();
    lines[this.cursor.line] += data;
    this.text = lines.join("\n");
    this.cursor.col += data.length;
  }
}

const editor = new FakeEditor();
let createEditor;
let pickerWidget;
let onSessionStart;
registerQuotePicker({ on: (event, handler) => { if (event === "session_start") onSessionStart = handler; } });
onSessionStart({}, {
  mode: "tui",
  ui: {
    getEditorComponent: () => () => editor,
    setEditorComponent: (factory) => { createEditor = factory; },
    setWidget: (_key, widget) => { pickerWidget = widget; },
  },
  sessionManager: {
    getBranch: () => [{
      type: "message",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "A selectable paragraph.\n\nAnother selectable paragraph." }],
      },
    }],
  },
});
createEditor({}, {}, {});
editor.handleInput(">");
assert.ok(pickerWidget, "typing > opens picker");
editor.handleInput("\r");
assert.equal(editor.text, "> A selectable paragraph.\n\n");
assert.equal(pickerWidget, undefined, "selection closes picker and leaves a blank line");
editor.handleInput(">");
assert.ok(pickerWidget, "typing > on the new line opens picker for another quote");
editor.handleInput("\x1b[B");
editor.handleInput("\r");
assert.equal(editor.text, "> A selectable paragraph.\n\n> Another selectable paragraph.\n\n");
editor.handleInput("Explain these quotes");
assert.equal(pickerWidget, undefined, "ordinary prompt text does not reopen picker");
editor.handleInput("\r");
assert.equal(editor.baseEnters, 1, "final prompt Enter reaches the normal editor handler");
console.log("quote picker multi-quote flow OK");
