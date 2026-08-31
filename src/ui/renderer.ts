import type { VideoSelection, MergeResult } from "./preload.js";

declare global {
  interface Window {
    duoCaptions: {
      chooseVideo(): Promise<VideoSelection | undefined>;
      createBilingual(inputPath: string, firstIndex: number, secondIndex: number): Promise<MergeResult | undefined>;
    };
  }
}

const chooseButton = element<HTMLButtonElement>("choose-video");
const createButton = element<HTMLButtonElement>("create");
const videoPath = element<HTMLElement>("video-path");
const form = element<HTMLElement>("track-form");
const firstSelect = element<HTMLSelectElement>("first-track");
const secondSelect = element<HTMLSelectElement>("second-track");
const status = element<HTMLElement>("status");
let selection: VideoSelection | undefined;

chooseButton.addEventListener("click", async () => {
  setStatus("Opening video…");
  try {
    const result = await window.duoCaptions.chooseVideo();
    if (!result) return setStatus("");
    selection = result;
    videoPath.textContent = result.inputPath;
    const tracks = result.tracks;
    populate(firstSelect, tracks);
    populate(secondSelect, tracks);
    if (tracks[1]) secondSelect.value = String(tracks[1].index);
    form.hidden = false;
    createButton.disabled = tracks.length < 2;
    setStatus(tracks.length < 2 ? "This video needs at least two text subtitle tracks." : `${tracks.length} text subtitle tracks available.`);
  } catch (error) {
    setStatus(message(error), true);
  }
});

createButton.addEventListener("click", async () => {
  if (!selection) return;
  const first = Number(firstSelect.value);
  const second = Number(secondSelect.value);
  if (first === second) return setStatus("Choose two different subtitle tracks.", true);
  createButton.disabled = true;
  setStatus("Converting and attaching subtitles… This may take a moment.");
  try {
    const result = await window.duoCaptions.createBilingual(selection.inputPath, first, second);
    if (result) setStatus(`Finished.\nASS: ${result.assPath}\nMKV: ${result.mkvPath}`, false, true);
    else setStatus("Save canceled.");
  } catch (error) {
    setStatus(message(error), true);
  } finally {
    createButton.disabled = false;
  }
});

function populate(select: HTMLSelectElement, tracks: VideoSelection["tracks"]): void {
  select.replaceChildren(...tracks.map((track) => {
    const option = document.createElement("option");
    option.value = String(track.index);
    option.textContent = `${track.language ?? "Unknown language"} — ${track.title ?? `Stream ${track.index}`} (${track.codecName})`;
    return option;
  }));
}

function setStatus(text: string, error = false, success = false): void {
  status.textContent = text;
  status.className = error ? "error" : success ? "success" : "";
}

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing UI element: ${id}`);
  return found as T;
}
