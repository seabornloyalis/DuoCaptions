import assert from "node:assert/strict";
import test from "node:test";
import { mergeAssTracks } from "./ass.js";

test("merges dialogue from two ASS tracks with separate positions", () => {
  const first = "[Events]\nDialogue: 0,0:00:02.00,0:00:03.00,Default,,0,0,0,,Hello";
  const second = "[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hola, amigo";
  const merged = mergeAssTracks([
    { content: first, style: "Primary" },
    { content: second, style: "Secondary" },
  ], "English + Spanish");

  assert.match(merged, /Style: Primary,Arial,52,&H002277CC,.*?,2,60,60,110,1/);
  assert.match(merged, /Style: Secondary,Arial,52,&H00FFFFFF,.*?,2,60,60,48,1/);
  assert.match(merged, /Dialogue: 0,0:00:01\.00,0:00:02\.00,Secondary.*Hola, amigo/);
  assert.match(merged, /Dialogue: 0,0:00:02\.00,0:00:03\.00,Primary.*Hello/);
  assert.ok(merged.indexOf("Hola") < merged.indexOf("Hello"));
});

test("removes duplicate events from one converted subtitle track", () => {
  const duplicate = "Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hola";
  const merged = mergeAssTracks([
    { content: `[Events]\n${duplicate}\n${duplicate}`, style: "Secondary" },
  ], "Spanish");

  assert.equal(merged.match(/,,Hola$/gm)?.length, 1);
});

test("does not collapse the same text at different times or in different languages", () => {
  const first = "Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,No";
  const later = "Dialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,No";
  const merged = mergeAssTracks([
    { content: `[Events]\n${first}\n${later}`, style: "Primary" },
    { content: `[Events]\n${first}`, style: "Secondary" },
  ], "Two languages");

  assert.equal(merged.match(/,,No$/gm)?.length, 3);
});
