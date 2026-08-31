# DuoCaptions

A small interactive TypeScript CLI that selects two text subtitle languages from an MKV file, merges them into one bilingual ASS file, and attaches the result to a new MKV.

## Requirements

- Node.js 20 or newer
- `ffmpeg` and `ffprobe` available on your `PATH`

## Setup and use

```sh
npm install
npm run build
npm start -- path/to/video.mkv
```

For the desktop interface:

```sh
npm run ui
```

Use **Browse for video**, select the two language tracks, and choose **Create bilingual MKV**. Native save dialogs choose the standalone ASS and final MKV locations.

For development, run it directly from TypeScript:

```sh
npm run dev -- path/to/video.mkv
```

The CLI displays each subtitle stream's language, codec, title, and default/forced flags. Choose two different text tracks. Both languages are stacked at the bottom of the frame: the first appears in ochre above the second, which appears in white. Existing files are never overwritten.

FFmpeg converts each selected text track to ASS, then DuoCaptions combines and time-sorts their dialogue events. Bitmap formats such as PGS and VobSub cannot be selected because converting their images into text requires OCR.

The standalone ASS file is retained. A second output such as `movie.bilingual.mkv` contains every stream from the original MKV plus the new subtitle stream, tagged with the `mul` (multiple languages) language code. Neither output overwrites an existing file, and the source MKV is never modified.
