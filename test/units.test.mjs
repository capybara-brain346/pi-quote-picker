import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { quote, replaceLine, splitUnits } = await jiti.import("../extensions/units.ts");

assert.deepEqual(splitUnits("Intro\n\n- `prune` *does not* delete\n- Running `list`\n\n```sh\necho hi\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |"), [
  "Intro",
  "- `prune` *does not* delete",
  "- Running `list`",
  "```sh\necho hi\n```",
  "| A | B |\n|---|---|\n| 1 | 2 |",
]);
assert.deepEqual(splitUnits("Heading\n---\nbody"), ["Heading\n---\nbody"]);
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
console.log("quote units OK");
