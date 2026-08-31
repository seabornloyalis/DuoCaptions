#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import path from "node:path";
import {
  canConvertToAss,
  defaultMkvOutputPath,
  defaultOutputPath,
  describeTrack,
  parseSubtitleTracks,
  type SubtitleTrack,
} from "./subtitles.js";
import { mergeAssTracks } from "./ass.js";

async function run(command: string, args: string[], inherit = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    let errorOutput = "";
    child.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => (errorOutput += chunk.toString()));
    child.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error(`${command} was not found. Install FFmpeg and ensure it is on your PATH.`));
      } else {
        reject(error);
      }
    });
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${command} exited with code ${code}.${errorOutput ? `\n${errorOutput.trim()}` : ""}`));
    });
  });
}

async function inspect(inputPath: string): Promise<SubtitleTrack[]> {
  const json = await run("ffprobe", [
    "-v", "error",
    "-select_streams", "s",
    "-show_entries", "stream=index,codec_name,codec_type:stream_tags=language,title:stream_disposition=default,forced",
    "-of", "json",
    inputPath,
  ]);
  return parseSubtitleTracks(JSON.parse(json) as unknown);
}

async function main(): Promise<void> {
  const inputArgument = process.argv[2];
  if (!inputArgument || inputArgument === "--help" || inputArgument === "-h") {
    console.log("Usage: duocaptions <video.mkv>");
    console.log("Merge two MKV subtitle languages into ASS and attach it to a new MKV.");
    process.exitCode = inputArgument ? 0 : 1;
    return;
  }

  const inputPath = path.resolve(inputArgument);
  if (path.extname(inputPath).toLowerCase() !== ".mkv") {
    throw new Error("Input must be an .mkv file.");
  }
  await access(inputPath);

  const tracks = await inspect(inputPath);
  const convertibleTracks = tracks.filter(canConvertToAss);
  if (convertibleTracks.length < 2) throw new Error("At least two text subtitle tracks are required. Bitmap subtitles need OCR before they can be merged into ASS.");

  console.log(`Found ${tracks.length} subtitle track${tracks.length === 1 ? "" : "s"}:`);
  tracks.forEach((track, index) => console.log(`  ${index + 1}) ${describeTrack(track)}`));

  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const first = await selectTrack(prompt, tracks, "first");
    const second = await selectTrack(prompt, tracks, "second", first);
    const suggestedPath = defaultOutputPath(inputPath, first, second);
    const outputAnswer = (await prompt.question(`Output file [${suggestedPath}]: `)).trim();
    const outputPath = path.resolve(outputAnswer || suggestedPath);
    if (path.extname(outputPath).toLowerCase() !== ".ass") throw new Error("The output filename must use the .ass extension.");
    const suggestedMkvPath = defaultMkvOutputPath(inputPath);
    const mkvAnswer = (await prompt.question(`MKV output file [${suggestedMkvPath}]: `)).trim();
    const mkvOutputPath = path.resolve(mkvAnswer || suggestedMkvPath);
    if (path.extname(mkvOutputPath).toLowerCase() !== ".mkv") throw new Error("The MKV output filename must use the .mkv extension.");
    if (mkvOutputPath === inputPath) throw new Error("The MKV output must differ from the input so the original remains untouched.");

    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "duocaptions-"));
    try {
      const firstPath = path.join(temporaryDirectory, "first.ass");
      const secondPath = path.join(temporaryDirectory, "second.ass");
      await run("ffmpeg", ["-y", "-v", "error", "-i", inputPath, "-map", `0:${first.index}`, "-c:s", "ass", firstPath]);
      await run("ffmpeg", ["-y", "-v", "error", "-i", inputPath, "-map", `0:${second.index}`, "-c:s", "ass", secondPath]);
      const [firstAss, secondAss] = await Promise.all([
        readFile(firstPath, "utf8"),
        readFile(secondPath, "utf8"),
      ]);
      const merged = mergeAssTracks([
        { content: firstAss, style: "Primary" },
        { content: secondAss, style: "Secondary" },
      ], `${first.language ?? `stream ${first.index}`} + ${second.language ?? `stream ${second.index}`}`);
      await writeFile(outputPath, merged, { encoding: "utf8", flag: "wx" });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
    const bilingualTitle = `Bilingual: ${first.language ?? `stream ${first.index}`} + ${second.language ?? `stream ${second.index}`}`;
    await run("ffmpeg", [
      "-n", "-v", "error",
      "-i", inputPath,
      "-i", outputPath,
      "-map", "0",
      "-map", "1:0",
      "-c", "copy",
      `-metadata:s:s:${tracks.length}`, "language=mul",
      `-metadata:s:s:${tracks.length}`, `title=${bilingualTitle}`,
      mkvOutputPath,
    ]);
    console.log(`Created ${outputPath}`);
    console.log(`Attached it as "${bilingualTitle}" in ${mkvOutputPath}`);
  } finally {
    prompt.close();
  }
}

async function selectTrack(
  prompt: ReturnType<typeof createInterface>,
  tracks: SubtitleTrack[],
  label: string,
  excluded?: SubtitleTrack,
): Promise<SubtitleTrack> {
  const answer = (await prompt.question(`Select the ${label} language [1-${tracks.length}]: `)).trim();
  const selection = Number(answer);
  const track = Number.isInteger(selection) ? tracks[selection - 1] : undefined;
  if (!track) throw new Error(`Please enter a number between 1 and ${tracks.length}.`);
  if (track === excluded) throw new Error("Select two different subtitle tracks.");
  if (!canConvertToAss(track)) throw new Error(`${describeTrack(track)} cannot be converted to ASS without OCR.`);
  return track;
}

main().catch((error: unknown) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
