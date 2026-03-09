# Remote Logo Remover

Local web app to remove fixed corner watermarks from videos with `ffmpeg`.

## Requirements

- Node.js 20+
- `ffmpeg`
- `ffprobe`

## Run

```bash
npm install
npm start
```

Open `http://localhost:4173`.

## Desktop app

Run the Electron desktop shell locally:

```bash
npm install
npm run desktop
```

Build packaged desktop apps:

```bash
npm run dist:mac
npm run dist:win
```

Notes:

- macOS builds are intended to be created on macOS.
- Windows build config is included, but building a polished signed Windows installer is most reliable on Windows CI or a Windows machine.
- Desktop builds now bundle `ffmpeg` and `ffprobe`, so end users do not need to install them separately.
- You can still override the bundled binaries with `FFMPEG_PATH` and `FFPROBE_PATH` if needed.

## CI build

A GitHub Actions workflow is included at `.github/workflows/build-desktop.yml`.

- macOS job produces `.dmg` and mac zip artifacts
- Windows job produces unsigned `.exe` installer and zip artifacts

## What it does

- Reads a local video by absolute path
- Probes resolution, duration, and codec
- Generates a preview frame
- Exports a processed copy with either:
  - `Auto Crop`: crops the right/bottom edges and can scale back to the original size
  - `Delogo Box`: runs `ffmpeg` `delogo` over a fixed rectangle
- Lets you drag a box directly on the preview to set `x/y/w/h` for `Delogo Box`

## Default presets

The built-in presets are based on the sample `Veo` watermark removed in this folder:

- Crop preset for `3840x2160`: `right=240`, `bottom=120`
- Delogo preset for `3840x2160`: `x=3535`, `y=1970`, `w=300`, `h=170`

The app scales these defaults proportionally for other video sizes.
