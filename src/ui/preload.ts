import { contextBridge, ipcRenderer } from "electron";
import type { SubtitleTrack } from "../subtitles.js";

export interface VideoSelection { inputPath: string; tracks: SubtitleTrack[] }
export interface MergeResult { assPath: string; mkvPath: string }

contextBridge.exposeInMainWorld("duoCaptions", {
  chooseVideo: (): Promise<VideoSelection | undefined> => ipcRenderer.invoke("choose-video"),
  createBilingual: (inputPath: string, firstIndex: number, secondIndex: number): Promise<MergeResult | undefined> =>
    ipcRenderer.invoke("create-bilingual", { inputPath, firstIndex, secondIndex }),
});
