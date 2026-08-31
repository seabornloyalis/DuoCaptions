import assert from "node:assert/strict";
import test from "node:test";
import { canConvertToAss, defaultMkvOutputPath, defaultOutputPath, parseSubtitleTracks } from "./subtitles.js";

test("parses subtitle metadata from ffprobe output", () => {
  const tracks = parseSubtitleTracks({ streams: [{
    index: 3,
    codec_name: "subrip",
    codec_type: "subtitle",
    tags: { language: "eng", title: "English SDH" },
    disposition: { default: 1, forced: 0 },
  }] });
  assert.deepEqual(tracks, [{
    index: 3,
    codecName: "subrip",
    language: "eng",
    title: "English SDH",
    isDefault: true,
    isForced: false,
  }]);
});

test("builds a non-destructive output MKV name", () => {
  assert.equal(defaultMkvOutputPath("C:\\videos\\movie.mkv"), "C:\\videos\\movie.bilingual.mkv");
});

test("recognizes bitmap subtitles as unavailable for ASS conversion", () => {
  const track = { index: 2, codecName: "hdmv_pgs_subtitle", isDefault: false, isForced: false };
  assert.equal(canConvertToAss(track), false);
  assert.equal(canConvertToAss({ ...track, codecName: "subrip" }), true);
});

test("builds an output name containing language and stream index", () => {
  const first = {
    index: 4,
    codecName: "subrip",
    language: "en-US",
    isDefault: false,
    isForced: false,
  };
  const second = { ...first, index: 5, language: "es" };
  const result = defaultOutputPath("C:\\videos\\movie.mkv", first, second);
  assert.equal(result, "C:\\videos\\movie.en-US-es.ass");
});
