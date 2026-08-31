import path from "node:path";

export interface SubtitleTrack {
  index: number;
  codecName: string;
  language?: string;
  title?: string;
  isDefault: boolean;
  isForced: boolean;
}

const ASS_CONVERTIBLE_CODECS = new Set([
  "ass", "ssa", "subrip", "text", "webvtt", "mov_text", "microdvd", "mpl2",
  "jacosub", "sami", "realtext", "stl", "subviewer", "subviewer1", "vplayer", "pjs",
]);

interface FfprobeStream {
  index?: unknown;
  codec_name?: unknown;
  codec_type?: unknown;
  tags?: Record<string, unknown>;
  disposition?: Record<string, unknown>;
}

export function parseSubtitleTracks(value: unknown): SubtitleTrack[] {
  if (typeof value !== "object" || value === null) return [];
  const streams = (value as { streams?: unknown }).streams;
  if (!Array.isArray(streams)) return [];

  return (streams as FfprobeStream[])
    .filter((stream) => stream.codec_type === "subtitle" && typeof stream.index === "number")
    .map((stream) => ({
      index: stream.index as number,
      codecName: typeof stream.codec_name === "string" ? stream.codec_name : "unknown",
      language: stringValue(stream.tags?.language),
      title: stringValue(stream.tags?.title),
      isDefault: stream.disposition?.default === 1,
      isForced: stream.disposition?.forced === 1,
    }));
}

export function canConvertToAss(track: SubtitleTrack): boolean {
  return ASS_CONVERTIBLE_CODECS.has(track.codecName);
}

export function defaultOutputPath(inputPath: string, first: SubtitleTrack, second: SubtitleTrack): string {
  const parsed = path.parse(inputPath);
  const firstLanguage = safeNamePart(first.language ?? `stream${first.index}`);
  const secondLanguage = safeNamePart(second.language ?? `stream${second.index}`);
  return path.join(parsed.dir, `${parsed.name}.${firstLanguage}-${secondLanguage}.ass`);
}

export function defaultMkvOutputPath(inputPath: string): string {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}.bilingual.mkv`);
}

export function describeTrack(track: SubtitleTrack): string {
  const details = [track.language ?? "unknown language", track.codecName];
  if (track.title) details.push(track.title);
  if (track.isDefault) details.push("default");
  if (track.isForced) details.push("forced");
  if (!canConvertToAss(track)) details.push("bitmap; ASS conversion unavailable");
  return `Stream ${track.index}: ${details.join(", ")}`;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function safeNamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_");
}
