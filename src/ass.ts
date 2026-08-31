export interface AssSource {
  content: string;
  style: "Primary" | "Secondary";
}

export function mergeAssTracks(sources: AssSource[], title: string): string {
  const events = deduplicateEvents(
    sources.flatMap(({ content, style }) => extractDialogue(content, style)),
  );
  events.sort((left, right) => startTime(left).localeCompare(startTime(right)));

  return `[Script Info]
Title: ${title}
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Primary,Arial,52,&H002277CC,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,60,60,110,1
Style: Secondary,Arial,52,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,60,60,48,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
`;
}

function deduplicateEvents(events: string[]): string[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const fields = event.slice("Dialogue:".length).split(",");
    const key = [
      fields[1]?.trim(),
      fields[2]?.trim(),
      fields[3]?.trim(),
      fields.slice(9).join(",").trim(),
    ].join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractDialogue(content: string, style: AssSource["style"]): string[] {
  return content
    .split(/\r?\n/)
    .filter((line) => line.startsWith("Dialogue:"))
    .map((line) => {
      const fields = line.slice("Dialogue:".length).split(",");
      if (fields.length < 10) throw new Error("FFmpeg produced an invalid ASS dialogue event.");
      fields[3] = style;
      return `Dialogue:${fields.join(",")}`;
    });
}

function startTime(dialogue: string): string {
  return dialogue.split(",", 3)[1]?.trim().padStart(12, "0") ?? "";
}
