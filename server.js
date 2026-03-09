const crypto = require("crypto");
const fsp = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const express = require("express");

/* ── Utilities ─────────────────────────────────────────── */

function optionalRequire(id) {
  try { return require(id); } catch { return null; }
}

function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

function resolveUserPath(v) {
  return isNonEmptyString(v) ? path.resolve(v.trim()) : null;
}

function normalizeExecutablePath(v) {
  if (!isNonEmptyString(v)) return null;
  return v.includes("app.asar") ? v.replace("app.asar", "app.asar.unpacked") : v;
}

function resolveBundledBinary(name) {
  if (name === "ffmpeg") return normalizeExecutablePath(optionalRequire("ffmpeg-static"));
  if (name === "ffprobe") { const m = optionalRequire("ffprobe-static"); return normalizeExecutablePath(m && m.path); }
  return null;
}

function resolveExecutable(name) {
  const key = name === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH";
  const override = normalizeExecutablePath(process.env[key]);
  return override || resolveBundledBinary(name) || name;
}

function scaleFromBase(v, src, base) { return Math.max(1, Math.round((v * src) / base)); }
function clampInt(v, fb) { const p = Number.parseInt(v, 10); return Number.isFinite(p) ? p : fb; }
function isUnset(v) { return v === null || v === undefined; }
function getOrientation(w, h) { return w >= h ? "landscape" : "portrait"; }
function normalizeJobMode(mode) { return mode === "overlay" ? "overlay" : "crop"; }

const DOWNLOADABLE_EXTENSIONS = new Set([".dmg", ".zip", ".exe", ".appimage", ".deb"]);
const SHOWCASE_FIXTURES = [
  {
    id: "car-drive",
    title: "Làm sạch cảnh chạy phố",
    description: "Xoá watermark góc cố định trên video 4K ngang.",
    before: { kind: "video", file: "Car_drives_road_woman_jogs_delpmaspu_.mp4" },
    after: { kind: "video", file: "Car_drives_road_woman_jogs_delpmaspu__no_logo.mp4" },
  },
  {
    id: "wardrobe",
    title: "Video thời trang dọc",
    description: "Mẫu video dọc được xử lý bằng cùng pipeline ffmpeg cục bộ.",
    before: { kind: "video", file: "The_girl_stands_choosing_clothes_delpmaspu_.mp4" },
    after: { kind: "video", file: "The_girl_stands_choosing_clothes_delpmaspu__no_logo.mp4" },
  },
];

const PRESET_PROFILES = [
  {
    id: "landscape-4k",
    label: "Ngang 3840x2160",
    width: 3840,
    height: 2160,
    crop: { right: 240, bottom: 120, scaleOutput: true },
    delogo: { x: 3535, y: 1970, w: 300, h: 170 },
  },
  {
    id: "portrait-4k",
    label: "Dọc 2160x3840",
    width: 2160,
    height: 3840,
    crop: { right: 280, bottom: 180, scaleOutput: true },
    delogo: { x: 1830, y: 3600, w: 315, h: 190 },
  },
];

function makeOutputPath(input) {
  const p = path.parse(input);
  return path.join(p.dir, `${p.name}_no_logo${p.ext}`);
}

function selectPresetProfile(w, h) {
  const exact = PRESET_PROFILES.find(p => p.width === w && p.height === h);
  if (exact) return { profile: exact, exact: true };
  const orientation = getOrientation(w, h);
  const sameOrientation = PRESET_PROFILES.filter(p => getOrientation(p.width, p.height) === orientation);
  const pool = sameOrientation.length ? sameOrientation : PRESET_PROFILES;
  let best = pool[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const profile of pool) {
    const aspectDelta = Math.abs((w / h) - (profile.width / profile.height));
    const areaDelta = Math.abs(Math.log((w * h) / (profile.width * profile.height)));
    const score = aspectDelta * 10 + areaDelta;
    if (score < bestScore) {
      best = profile;
      bestScore = score;
    }
  }
  return { profile: best, exact: false };
}

function scaleCropPreset(preset, w, h, baseW, baseH) {
  return {
    right: scaleFromBase(preset.right, w, baseW),
    bottom: scaleFromBase(preset.bottom, h, baseH),
    scaleOutput: preset.scaleOutput !== false,
  };
}

function scaleDelogoPreset(preset, w, h, baseW, baseH) {
  return {
    x: scaleFromBase(preset.x, w, baseW),
    y: scaleFromBase(preset.y, h, baseH),
    w: scaleFromBase(preset.w, w, baseW),
    h: scaleFromBase(preset.h, h, baseH),
  };
}

function buildPresetBundle(w, h) {
  const { profile, exact } = selectPresetProfile(w, h);
  return {
    cropPreset: scaleCropPreset(profile.crop, w, h, profile.width, profile.height),
    delogoPreset: scaleDelogoPreset(profile.delogo, w, h, profile.width, profile.height),
    presetProfile: {
      id: profile.id,
      label: profile.label,
      baseWidth: profile.width,
      baseHeight: profile.height,
      exact,
    },
  };
}

function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", c => { stdout += c.toString(); });
    child.stderr.on("data", c => { stderr += c.toString(); });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) { resolve({ stdout, stderr }); return; }
      reject(new Error(stderr.trim() || `${cmd} exited with code ${code}`));
    });
  });
}

async function ensureFileExists(fp) {
  const s = await fsp.stat(fp);
  if (!s.isFile()) throw new Error("Đường dẫn không phải là tệp.");
  return s;
}

async function tryFile(fp) {
  try {
    return await ensureFileExists(fp);
  } catch {
    return null;
  }
}

function resolveShowcasePath(baseDir, id, variant) {
  const fixture = SHOWCASE_FIXTURES.find(item => item.id === id);
  if (!fixture || !["before", "after"].includes(variant)) return null;
  const entry = fixture[variant];
  return { fixture, entry, absPath: path.join(baseDir, entry.file) };
}

async function buildShowcase(baseDir) {
  const items = [];
  for (const fixture of SHOWCASE_FIXTURES) {
    const before = path.join(baseDir, fixture.before.file);
    const after = path.join(baseDir, fixture.after.file);
    const [beforeStat, afterStat] = await Promise.all([tryFile(before), tryFile(after)]);
    if (!beforeStat || !afterStat) continue;
    items.push({
      id: fixture.id,
      title: fixture.title,
      description: fixture.description,
      before: { kind: fixture.before.kind, url: `/demo/${fixture.id}/before`, size: beforeStat.size },
      after: { kind: fixture.after.kind, url: `/demo/${fixture.id}/after`, size: afterStat.size },
    });
  }
  return items;
}

function describeDownload(filename) {
  const lower = filename.toLowerCase();
  const ext = path.extname(lower);
  if (!DOWNLOADABLE_EXTENSIONS.has(ext)) return null;
  const platform = lower.includes("mac") || ext === ".dmg"
    ? "macOS"
    : lower.includes("win") || ext === ".exe"
      ? "Windows"
      : "Linux";
  const arch = lower.includes("arm64")
    ? "Apple Silicon"
    : lower.includes("x64") || lower.includes("amd64")
      ? "64-bit"
      : "";
  const format = ext === ".appimage" ? "AppImage" : ext.replace(".", "").toUpperCase();
  return { platform, arch, format };
}

async function listDownloadArtifacts(distDir) {
  try {
    const entries = await fsp.readdir(distDir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.name.endsWith(".blockmap")) continue;
      const meta = describeDownload(entry.name);
      if (!meta) continue;
      const absPath = path.join(distDir, entry.name);
      const stat = await ensureFileExists(absPath);
      files.push({
        filename: entry.name,
        url: `/download/${encodeURIComponent(entry.name)}`,
        size: stat.size,
        ...meta,
      });
    }
    return files.sort((a, b) => a.platform.localeCompare(b.platform) || a.format.localeCompare(b.format));
  } catch {
    return [];
  }
}

async function probeVideo(inputPath) {
  const bin = resolveExecutable("ffprobe");
  const args = ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", inputPath];
  const { stdout } = await runCommand(bin, args);
  const payload = JSON.parse(stdout);
  const vs = payload.streams.find(s => s.codec_type === "video");
  if (!vs) throw new Error("Không tìm thấy luồng video.");
  return { width: vs.width, height: vs.height, codec: vs.codec_name, duration: Number.parseFloat(payload.format.duration || "0"), frameRate: vs.r_frame_rate };
}

async function generatePreview(inputPath, dur, previewDir) {
  const bin = resolveExecutable("ffmpeg");
  const stats = await fsp.stat(inputPath);
  const digest = crypto.createHash("sha1").update(`${inputPath}:${stats.mtimeMs}`).digest("hex").slice(0, 12);
  const outName = `${digest}.jpg`;
  const outPath = path.join(previewDir, outName);
  const ts = Math.max(0, Math.min(3, Math.floor((dur || 0) / 2)));
  await runCommand(bin, ["-y", "-ss", String(ts), "-i", inputPath, "-frames:v", "1", "-update", "1", outPath]);
  return `/previews/${outName}`;
}

function buildVideoFilter(mode, body, meta) {
  mode = normalizeJobMode(mode);
  if (mode === "crop") {
    const cr = clampInt(body.cropRight, 0), cb = clampInt(body.cropBottom, 0);
    const cw = meta.width - cr, ch = meta.height - cb;
    if (cw <= 0 || ch <= 0) throw new Error("Thông số cắt lớn hơn kích thước video.");
    let f = `crop=${cw}:${ch}:0:0`;
    if (body.scaleOutput !== false) f += `,scale=${meta.width}:${meta.height},setsar=1`;
    return f;
  }
  throw new Error("Chế độ không được hỗ trợ.");
}

function buildFfmpegArgs(input, output, filter, s) {
  return ["-y", "-i", input, "-vf", filter, "-c:v", "libx264", "-preset",
    isNonEmptyString(s.preset) ? s.preset.trim() : "slow", "-crf", String(clampInt(s.crf, 16)), "-c:a", "copy", output];
}

function tailLines(t, n) { return t.trim().split("\n").slice(-n).join("\n"); }

async function revealInFolder(tp) {
  if (process.platform === "darwin") { await runCommand("open", ["-R", tp]); return; }
  if (process.platform === "win32") { await runCommand("explorer.exe", ["/select,", path.win32.normalize(tp)]); return; }
  await runCommand("xdg-open", [path.dirname(tp)]);
}

/* ── Job Queue ─────────────────────────────────────────── */

const jobs = new Map();
const jobOrder = [];
let queueRunning = false;
let currentChild = null;
let _previewDir = null;

function sanitizeJob(j) {
  if (!j) return null;
  const { _process, ...clean } = j;
  return clean;
}

function createJob(inputPath, settings) {
  const id = crypto.randomUUID();
  const job = {
    id, inputPath, outputPath: makeOutputPath(inputPath),
    status: "pending", progress: 0,
    metadata: null, previewUrl: null, cropPreset: null, delogoPreset: null, presetProfile: null,
    settings: { mode: "crop", crf: 16, preset: "slow", scaleOutput: true, cropRight: null, cropBottom: null, delogoX: null, delogoY: null, delogoW: null, delogoH: null, logoPath: "", logoX: 0, logoY: 0, logoW: 200, logoH: 200, logoOpacity: 1, ...settings, mode: normalizeJobMode(settings.mode) },
    error: null, result: null, addedAt: Date.now(),
  };
  jobs.set(id, job);
  jobOrder.push(id);
  return job;
}

function removeJob(id) {
  const j = jobs.get(id);
  if (!j) return false;
  if (j.status === "processing" && j._process) j._process.kill("SIGTERM");
  jobs.delete(id);
  const idx = jobOrder.indexOf(id);
  if (idx !== -1) jobOrder.splice(idx, 1);
  return true;
}

function clearDoneJobs() {
  const ids = [];
  for (const [id, j] of jobs) {
    if (["done", "error", "cancelled"].includes(j.status)) ids.push(id);
  }
  ids.forEach(removeJob);
  return ids.length;
}

async function probeJob(job) {
  try {
    job.status = "probing";
    await ensureFileExists(job.inputPath);
    const meta = await probeVideo(job.inputPath);
    const preview = await generatePreview(job.inputPath, meta.duration, _previewDir);
    const presetBundle = buildPresetBundle(meta.width, meta.height);
    job.metadata = meta;
    job.previewUrl = preview;
    job.cropPreset = presetBundle.cropPreset;
    job.delogoPreset = presetBundle.delogoPreset;
    job.presetProfile = presetBundle.presetProfile;
    if (job.settings.mode === "crop" && (isUnset(job.settings.cropRight) || isUnset(job.settings.cropBottom))) {
      job.settings.cropRight = job.cropPreset.right;
      job.settings.cropBottom = job.cropPreset.bottom;
    }
    job.status = "ready";
  } catch (err) {
    job.status = "error";
    job.error = err.message;
  }
}

function probeNewJobsAsync(ids) {
  (async () => {
    for (const id of ids) {
      const j = jobs.get(id);
      if (j && j.status === "pending") await probeJob(j);
    }
  })().catch(e => console.error("Probe error:", e));
}

function buildOverlayArgs(input, output, s) {
  const lp = s.logoPath;
  if (!isNonEmptyString(lp)) throw new Error("Chế độ chèn logo yêu cầu đường dẫn ảnh logo.");
  const x = clampInt(s.logoX, 0), y = clampInt(s.logoY, 0);
  const w = clampInt(s.logoW, 100), h = clampInt(s.logoH, 100);
  const opacity = Math.max(0.01, Math.min(1, parseFloat(s.logoOpacity) || 1));
  let fc = `[1:v]scale=${w}:${h}`;
  if (opacity < 1) fc += `,format=rgba,colorchannelmixer=aa=${opacity}`;
  fc += `[logo];[0:v][logo]overlay=${x}:${y}`;
  return ["-y", "-i", input, "-i", lp, "-filter_complex", fc, "-c:v", "libx264",
    "-preset", isNonEmptyString(s.preset) ? s.preset.trim() : "slow",
    "-crf", String(clampInt(s.crf, 16)), "-c:a", "copy", output];
}

async function processJob(job) {
  job.status = "processing";
  job.progress = 0;
  try {
    const ffmpegPath = resolveExecutable("ffmpeg");
    await fsp.mkdir(path.dirname(job.outputPath), { recursive: true });
    let args;
    if (job.settings.mode === "overlay") {
      args = buildOverlayArgs(job.inputPath, job.outputPath, job.settings);
    } else {
      const filter = buildVideoFilter(job.settings.mode, job.settings, job.metadata);
      args = buildFfmpegArgs(job.inputPath, job.outputPath, filter, job.settings);
    }
    await new Promise((resolve, reject) => {
      const child = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
      job._process = child;
      currentChild = child;
      let stderr = "";
      child.stderr.on("data", chunk => {
        const t = chunk.toString();
        stderr += t;
        const m = t.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (m && job.metadata.duration > 0) {
          const sec = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
          job.progress = Math.min(99, Math.round((sec / job.metadata.duration) * 100));
        }
      });
      child.on("error", e => { currentChild = null; reject(e); });
      child.on("close", code => {
        currentChild = null;
        if (code === 0) { job.progress = 100; resolve({ stderr }); }
        else reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
      });
    });
    job.status = "done";
    job.result = { command: `ffmpeg ${args.map(a => JSON.stringify(a)).join(" ")}` };
  } catch (err) {
    if (job.status !== "cancelled") { job.status = "error"; job.error = err.message; }
  }
}

async function processQueue() {
  if (queueRunning) return;
  queueRunning = true;
  try {
    while (queueRunning) {
      let next = null;
      for (const id of jobOrder) {
        const j = jobs.get(id);
        if (!j) continue;
        if (j.status === "pending") await probeJob(j);
        if (j.status === "ready") { next = j; break; }
      }
      if (!next) break;
      await processJob(next);
    }
  } finally { queueRunning = false; }
}

function stopQueue() {
  queueRunning = false;
  if (currentChild) { try { currentChild.kill("SIGTERM"); } catch { } }
  for (const j of jobs.values()) {
    if (j.status === "processing") { j.status = "cancelled"; j.error = "Người dùng đã dừng xử lý"; }
  }
}

/* ── Express App ───────────────────────────────────────── */

function createServerApp(options = {}) {
  const app = express();
  const baseDir = options.baseDir || __dirname;
  const runtimeDir = options.runtimeDir || path.join(baseDir, "runtime");
  const previewDir = path.join(runtimeDir, "previews");
  const publicDir = options.publicDir || path.join(baseDir, "public");
  _previewDir = previewDir;

  app.use(express.json({ limit: "1mb" }));
  app.use("/previews", express.static(previewDir));
  app.use(express.static(publicDir));

  // ── Queue API ──

  app.post("/api/jobs/add", async (req, res) => {
    try {
      const paths = req.body.paths || [];
      const mode = normalizeJobMode(req.body.mode || "crop");
      const settings = {
        mode,
        crf: clampInt(req.body.crf, 16),
        preset: isNonEmptyString(req.body.preset) ? req.body.preset : "slow",
        scaleOutput: req.body.scaleOutput !== false,
        cropRight: isUnset(req.body.cropRight) ? null : clampInt(req.body.cropRight, 0),
        cropBottom: isUnset(req.body.cropBottom) ? null : clampInt(req.body.cropBottom, 0),
        delogoX: isUnset(req.body.delogoX) ? null : clampInt(req.body.delogoX, 0),
        delogoY: isUnset(req.body.delogoY) ? null : clampInt(req.body.delogoY, 0),
        delogoW: isUnset(req.body.delogoW) ? null : clampInt(req.body.delogoW, 0),
        delogoH: isUnset(req.body.delogoH) ? null : clampInt(req.body.delogoH, 0),
        logoPath: resolveUserPath(req.body.logoPath) || "",
        logoX: clampInt(req.body.logoX, 0),
        logoY: clampInt(req.body.logoY, 0),
        logoW: clampInt(req.body.logoW, 200),
        logoH: clampInt(req.body.logoH, 200),
        logoOpacity: Math.max(0.01, Math.min(1, parseFloat(req.body.logoOpacity) || 1)),
      };
      const added = [];
      for (const p of paths) {
        const r = resolveUserPath(p);
        if (r) added.push(createJob(r, settings));
      }
      res.json({ jobs: added.map(sanitizeJob) });
      probeNewJobsAsync(added.map(j => j.id));
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  app.get("/api/jobs", (_req, res) => {
    const list = jobOrder.map(id => sanitizeJob(jobs.get(id))).filter(Boolean);
    res.json({ jobs: list, isProcessing: queueRunning });
  });

  app.post("/api/jobs/:id/settings", (req, res) => {
    const j = jobs.get(req.params.id);
    if (!j) { res.status(404).json({ error: "Không tìm thấy tác vụ" }); return; }
    if (j.status === "processing" || j.status === "done") { res.status(400).json({ error: "Không thể chỉnh sửa tác vụ này" }); return; }
    const settings = { ...req.body };
    if ("mode" in settings) settings.mode = normalizeJobMode(settings.mode);
    Object.assign(j.settings, settings);
    if ("outputPath" in req.body) {
      const outputPath = resolveUserPath(req.body.outputPath);
      j.outputPath = outputPath || makeOutputPath(j.inputPath);
    }
    res.json({ job: sanitizeJob(j) });
  });

  app.post("/api/jobs/apply-settings", (req, res) => {
    const settings = { ...req.body };
    if ("mode" in settings) settings.mode = normalizeJobMode(settings.mode);
    const outputDir = resolveUserPath(settings.outputDir);
    delete settings.outputDir;
    let count = 0;
    for (const j of jobs.values()) {
      if (j.status === "ready" || j.status === "pending") {
        Object.assign(j.settings, settings);
        if (outputDir) {
          const outputName = path.basename(j.outputPath || makeOutputPath(j.inputPath));
          j.outputPath = path.join(outputDir, outputName);
        }
        count++;
      }
    }
    res.json({ ok: true, count });
  });

  app.delete("/api/jobs/:id", (req, res) => {
    removeJob(req.params.id);
    res.json({ ok: true });
  });

  app.post("/api/jobs/clear-done", (_req, res) => {
    const n = clearDoneJobs();
    res.json({ ok: true, cleared: n });
  });

  app.post("/api/queue/start", (_req, res) => {
    if (queueRunning) { res.json({ ok: true, already: true }); return; }
    processQueue().catch(e => console.error("Queue error:", e));
    res.json({ ok: true });
  });

  app.post("/api/queue/stop", (_req, res) => {
    stopQueue();
    res.json({ ok: true });
  });

  // ── Legacy single-video API ──

  app.post("/api/probe", async (req, res) => {
    try {
      const inputPath = resolveUserPath(req.body.inputPath);
      if (!inputPath) { res.status(400).json({ error: "Thiếu đường dẫn." }); return; }
      await ensureFileExists(inputPath);
      await fsp.mkdir(previewDir, { recursive: true });
      const meta = await probeVideo(inputPath);
      const previewUrl = await generatePreview(inputPath, meta.duration, previewDir);
      const presetBundle = buildPresetBundle(meta.width, meta.height);
      res.json({
        inputPath,
        metadata: meta,
        previewUrl,
        outputSuggestion: makeOutputPath(inputPath),
        cropPreset: presetBundle.cropPreset,
        delogoPreset: presetBundle.delogoPreset,
        presetProfile: presetBundle.presetProfile,
      });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  app.get("/api/open-output", async (req, res) => {
    try {
      const tp = resolveUserPath(req.query.path);
      if (!tp) { res.status(400).json({ error: "Thiếu đường dẫn." }); return; }
      await ensureFileExists(tp);
      await revealInFolder(tp);
      res.json({ ok: true });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  app.get("/api/video", async (req, res) => {
    try {
      const tp = resolveUserPath(req.query.path);
      if (!tp) { res.status(400).json({ error: "Thiếu đường dẫn." }); return; }
      const stats = await fsp.stat(tp);
      if (!stats.isFile()) { res.status(400).json({ error: "Đường dẫn không phải là tệp." }); return; }
      const ext = path.extname(tp).toLowerCase();
      const mimeMap = { ".mp4": "video/mp4", ".webm": "video/webm", ".mkv": "video/x-matroska", ".mov": "video/quicktime", ".avi": "video/x-msvideo" };
      const mime = mimeMap[ext] || "video/mp4";
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${stats.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Content-Type": mime });
        const { createReadStream } = require("fs");
        createReadStream(tp, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { "Content-Length": stats.size, "Content-Type": mime, "Accept-Ranges": "bytes" });
        const { createReadStream } = require("fs");
        createReadStream(tp).pipe(res);
      }
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  app.get("/api/image", async (req, res) => {
    try {
      const tp = resolveUserPath(req.query.path);
      if (!tp) { res.status(400).json({ error: "Thiếu đường dẫn." }); return; }
      await ensureFileExists(tp);
      res.sendFile(tp);
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  app.get("*", (_req, res) => { res.sendFile(path.join(publicDir, "index.html")); });

  return { app, runtimeDir, previewDir, publicDir };
}

async function startServer(options = {}) {
  const port = typeof options.port === "number" ? options.port : Number(process.env.PORT || 4173);
  const host = options.host || process.env.HOST || "127.0.0.1";
  const { app, previewDir, runtimeDir, publicDir } = createServerApp(options);
  await fsp.mkdir(previewDir, { recursive: true });
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host);
    server.once("error", reject);
    server.once("listening", () => {
      const addr = server.address();
      const lp = typeof addr === "object" && addr ? addr.port : port;
      resolve({ app, server, host, port: lp, url: `http://${host}:${lp}`, runtimeDir, publicDir, close: () => new Promise((r, rj) => { server.close(e => e ? rj(e) : r()); }) });
    });
  });
}

async function main() {
  const h = await startServer();
  console.log(`Remote Logo Remover đang chạy tại ${h.url}`);
}

if (require.main === module) { main().catch(e => { console.error(e); process.exit(1); }); }

module.exports = { createServerApp, makeOutputPath, startServer };
