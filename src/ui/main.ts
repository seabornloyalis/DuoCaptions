import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeAssTracks } from "../ass.js";
import {
  canConvertToAss,
  defaultMkvOutputPath,
  defaultOutputPath,
  parseSubtitleTracks,
  type SubtitleTrack,
} from "../subtitles.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

function createWindow(): void {
  const window = new BrowserWindow({
    width: 760,
    height: 650,
    minWidth: 620,
    minHeight: 560,
    title: "DuoCaptions",
    backgroundColor: "#171813",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(currentDirectory, "preload.js"),
    },
  });
  void window.loadFile(path.resolve(currentDirectory, "../../src/ui/index.html"));
  window.setMenuBarVisibility(false);
}

ipcMain.handle("choose-video", async (): Promise<VideoSelection | undefined> => {
  const result = await dialog.showOpenDialog({
    title: "Choose an MKV video",
    properties: ["openFile"],
    filters: [{ name: "Matroska video", extensions: ["mkv"] }],
  });
  const inputPath = result.filePaths[0];
  if (result.canceled || !inputPath) return undefined;
  const tracks = await inspect(inputPath);
  return { inputPath, tracks: tracks.filter(canConvertToAss) };
});

ipcMain.handle("create-bilingual", async (_event, request: MergeRequest): Promise<MergeResult | undefined> => {
  const tracks = await inspect(request.inputPath);
  const first = tracks.find((track) => track.index === request.firstIndex);
  const second = tracks.find((track) => track.index === request.secondIndex);
  if (!first || !second || first.index === second.index) throw new Error("Select two different subtitle tracks.");
  if (!canConvertToAss(first) || !canConvertToAss(second)) throw new Error("Both selections must be text subtitle tracks.");

  const assDialog = await dialog.showSaveDialog({
    title: "Save bilingual ASS file",
    defaultPath: defaultOutputPath(request.inputPath, first, second),
    filters: [{ name: "ASS subtitles", extensions: ["ass"] }],
  });
  if (assDialog.canceled || !assDialog.filePath) return undefined;
  const mkvDialog = await dialog.showSaveDialog({
    title: "Save MKV with bilingual subtitles",
    defaultPath: defaultMkvOutputPath(request.inputPath),
    filters: [{ name: "Matroska video", extensions: ["mkv"] }],
  });
  if (mkvDialog.canceled || !mkvDialog.filePath) return undefined;
  if (path.resolve(mkvDialog.filePath) === path.resolve(request.inputPath)) throw new Error("The output MKV must differ from the source file.");

  await createBilingualFiles(request.inputPath, tracks.length, first, second, assDialog.filePath, mkvDialog.filePath);
  return { assPath: assDialog.filePath, mkvPath: mkvDialog.filePath };
});

async function inspect(inputPath: string): Promise<SubtitleTrack[]> {
  const json = await run("ffprobe", [
    "-v", "error", "-select_streams", "s",
    "-show_entries", "stream=index,codec_name,codec_type:stream_tags=language,title:stream_disposition=default,forced",
    "-of", "json", inputPath,
  ]);
  return parseSubtitleTracks(JSON.parse(json) as unknown);
}

async function createBilingualFiles(
  inputPath: string,
  subtitleCount: number,
  first: SubtitleTrack,
  second: SubtitleTrack,
  assPath: string,
  mkvPath: string,
): Promise<void> {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "duocaptions-ui-"));
  try {
    const firstPath = path.join(temporaryDirectory, "first.ass");
    const secondPath = path.join(temporaryDirectory, "second.ass");
    await run("ffmpeg", ["-y", "-v", "error", "-i", inputPath, "-map", `0:${first.index}`, "-c:s", "ass", firstPath]);
    await run("ffmpeg", ["-y", "-v", "error", "-i", inputPath, "-map", `0:${second.index}`, "-c:s", "ass", secondPath]);
    const [firstAss, secondAss] = await Promise.all([readFile(firstPath, "utf8"), readFile(secondPath, "utf8")]);
    const firstName = first.language ?? `stream ${first.index}`;
    const secondName = second.language ?? `stream ${second.index}`;
    const merged = mergeAssTracks([
      { content: firstAss, style: "Primary" },
      { content: secondAss, style: "Secondary" },
    ], `${firstName} + ${secondName}`);
    await writeFile(assPath, merged, "utf8");
    await run("ffmpeg", [
      "-y", "-v", "error", "-i", inputPath, "-i", assPath,
      "-map", "0", "-map", "1:0", "-c", "copy",
      `-metadata:s:s:${subtitleCount}`, "language=mul",
      `-metadata:s:s:${subtitleCount}`, `title=Bilingual: ${firstName} + ${secondName}`,
      mkvPath,
    ]);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let output = "";
    let errorOutput = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (errorOutput += chunk.toString()));
    child.on("error", (error: NodeJS.ErrnoException) => reject(
      error.code === "ENOENT" ? new Error(`${command} was not found. Install FFmpeg and add it to PATH.`) : error,
    ));
    child.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(errorOutput.trim() || `${command} exited with code ${code}.`)));
  });
}

interface VideoSelection { inputPath: string; tracks: SubtitleTrack[] }
interface MergeRequest { inputPath: string; firstIndex: number; secondIndex: number }
interface MergeResult { assPath: string; mkvPath: string }

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
