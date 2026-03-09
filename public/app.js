/* ── State ──────────────────────────────────────────────── */
const S = { jobs: [], selectedId: null, isProcessing: false, logoInteraction: null, doneIds: new Set() };
const isElectron = !!(window.electronAPI && window.electronAPI.isElectron);

/* ── DOM ───────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const el = {
  addBtn: $("addBtn"), browseBtn: $("browseBtn"), startBtn: $("startBtn"),
  stopBtn: $("stopBtn"), clearBtn: $("clearBtn"),
  dropZone: $("dropZone"), queueList: $("queueList"), queueCount: $("queueCount"),
  queueReadyCount: $("queueReadyCount"), queueDoneCount: $("queueDoneCount"), queueIssueCount: $("queueIssueCount"),
  manualPath: $("manualPath"), addPathBtn: $("addPathBtn"),
  emptyBrowseBtn: $("emptyBrowseBtn"),
  overallProgress: $("overallProgress"), overallFill: $("overallFill"), overallText: $("overallText"),
  emptyState: $("emptyState"), jobDetail: $("jobDetail"),
  jobTitle: $("jobTitle"), jobSubtitle: $("jobSubtitle"),
  heroStatus: $("heroStatus"), heroMode: $("heroMode"),
  selectedPresetProfile: $("selectedPresetProfile"), selectedOutputName: $("selectedOutputName"),
  stageImport: $("stageImport"), stageTune: $("stageTune"), stageExport: $("stageExport"),
  previewFrame: $("previewFrame"), previewImage: $("previewImage"),
  previewPlaceholder: $("previewPlaceholder"),
  logoOverlay: $("logoOverlay"),
  metaText: $("metaText"),
  cropSettings: $("cropSettings"), overlaySettings: $("overlaySettings"),
  modeNote: $("modeNote"),
  cropRight: $("cropRight"), cropBottom: $("cropBottom"), scaleOutput: $("scaleOutput"), cropPresetBtn: $("cropPresetBtn"),
  logoPath: $("logoPath"), browseLogoBtn: $("browseLogoBtn"),
  logoX: $("logoX"), logoY: $("logoY"), logoW: $("logoW"), logoH: $("logoH"),
  logoOpacity: $("logoOpacity"), opacityVal: $("opacityVal"),
  preset: $("preset"), crf: $("crf"), outputPath: $("outputPath"),
  browseOutputBtn: $("browseOutputBtn"), autoDownload: $("autoDownload"),
  resultActions: $("resultActions"), playResultBtn: $("playResultBtn"), downloadResultBtn: $("downloadResultBtn"),
  videoModal: $("videoModal"), videoBackdrop: $("videoBackdrop"), videoPlayer: $("videoPlayer"),
  videoTitle: $("videoTitle"), videoCloseBtn: $("videoCloseBtn"),
  applyAllBtn: $("applyAllBtn"), openOutputBtn: $("openOutputBtn"),
  statusText: $("statusText"), statusIcon: $("statusIcon"),
};
const modeTabs = document.querySelectorAll(".mode-tab");

/* ── Helpers ───────────────────────────────────────────── */
function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }
function normalizeMode(mode) { return mode === "overlay" ? "overlay" : "crop"; }
function basename(p) { return p.split(/[\\/]/).pop(); }
function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function dirnameLike(p) {
  const v = typeof p === "string" ? p.trim() : "";
  const m = v.match(/^(.*)[\\/][^\\/]+$/);
  return m ? m[1] : "";
}
function buildImagePreviewUrl(filePath) { return `/api/image?path=${encodeURIComponent(filePath)}`; }
function getStatusLabel(status) {
  return {
    pending: "Chờ",
    probing: "Đang đọc",
    ready: "Sẵn sàng",
    processing: "Đang xử lý",
    done: "Hoàn tất",
    error: "Lỗi",
    cancelled: "Đã dừng",
  }[status] || status;
}
function getModeLabel(mode) { return normalizeMode(mode) === "overlay" ? "Chèn logo" : "Cắt tự động"; }
function getOrientationLabel(meta) {
  if (!meta) return "";
  return meta.width >= meta.height ? "Ngang" : "Dọc";
}
function formatFrameRate(value) {
  if (!value) return "";
  const parts = String(value).split("/");
  if (parts.length === 2) {
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (num > 0 && den > 0) return (num / den).toFixed(num % den === 0 ? 0 : 2);
  }
  return String(value);
}
function formatPresetProfile(profile) {
  if (!profile) return "";
  const mode = profile.exact ? "khớp chính xác" : "co giãn theo tỉ lệ";
  return `${profile.label} · preset tự động (${mode})`;
}
function setWorkflowState(node, state) {
  if (!node) return;
  node.classList.remove("is-active", "is-done", "is-error");
  if (state) node.classList.add(`is-${state}`);
}
function updateWorkflow(job) {
  setWorkflowState(el.stageImport, null);
  setWorkflowState(el.stageTune, null);
  setWorkflowState(el.stageExport, null);
  if (!job) return;
  if (job.status === "pending" || job.status === "probing") {
    setWorkflowState(el.stageImport, "active");
    return;
  }
  setWorkflowState(el.stageImport, "done");
  if (job.status === "ready") {
    setWorkflowState(el.stageTune, "active");
    return;
  }
  setWorkflowState(el.stageTune, "done");
  if (job.status === "processing") {
    setWorkflowState(el.stageExport, "active");
    return;
  }
  if (job.status === "done") {
    setWorkflowState(el.stageExport, "done");
    return;
  }
  if (job.status === "error" || job.status === "cancelled") {
    setWorkflowState(el.stageExport, "error");
  }
}
function updateSelectedSummary(job) {
  if (!job) return;
  el.jobTitle.textContent = basename(job.inputPath);
  el.heroStatus.textContent = getStatusLabel(job.status);
  el.heroStatus.className = `hero-pill hero-pill-status is-${job.status}`;
  el.heroMode.textContent = getModeLabel(job.settings?.mode);
  el.heroMode.className = "hero-pill hero-pill-muted";
  const presetLabel = job.presetProfile ? formatPresetProfile(job.presetProfile) : "Đang chờ preset tự động";
  el.selectedPresetProfile.textContent = presetLabel;
  el.selectedPresetProfile.title = presetLabel;
  const outputLabel = job.outputPath ? basename(job.outputPath) : "Tự sinh";
  el.selectedOutputName.textContent = outputLabel;
  el.selectedOutputName.title = job.outputPath || outputLabel;

  const subtitle = [];
  if (job.metadata) {
    subtitle.push(`${job.metadata.width}x${job.metadata.height}`);
    subtitle.push(`Video ${getOrientationLabel(job.metadata).toLowerCase()}`);
    subtitle.push(`${job.metadata.duration.toFixed(1)} giây`);
  }
  if (job.status === "processing") subtitle.push(`Đã xuất ${job.progress}%`);
  else if (job.status === "done") subtitle.push("Kết quả đã sẵn sàng để kiểm tra");
  else if ((job.status === "error" || job.status === "cancelled") && job.error) subtitle.push(job.error);
  else subtitle.push(`Chế độ ${getModeLabel(job.settings?.mode).toLowerCase()}`);
  el.jobSubtitle.textContent = subtitle.join(" | ");
  updateWorkflow(job);
}
function setStatus(msg, tone) {
  el.statusText.textContent = msg;
  el.statusIcon.className = "status-dot" + (tone === "busy" ? " busy" : tone === "err" ? " err" : "");
}
async function api(method, url, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Yêu cầu thất bại");
  return data;
}
function getSelectedJob() { return S.jobs.find(j => j.id === S.selectedId) || null; }
function getCurrentMode() {
  const active = document.querySelector(".mode-tab.active");
  return normalizeMode(active ? active.dataset.mode : "crop");
}
function updateModeNote(mode) {
  const notes = {
    crop: {
      text: "Chất lượng tốt nhất cho watermark cố định ở góc. Cắt một phần mép nhỏ rồi phóng lại về kích thước gốc.",
      cls: "mode-note mode-note-good",
    },
    overlay: {
      text: "Dùng chế độ này khi bạn muốn đặt logo hoặc nhận diện thương hiệu mới đè lên video.",
      cls: "mode-note",
    },
  };
  const current = notes[mode] || notes.crop;
  el.modeNote.textContent = current.text;
  el.modeNote.className = current.cls;
}
function collectCurrentSettings({ includeOutputPath = false, includeOutputDir = false } = {}) {
  const settings = {
    mode: normalizeMode(getCurrentMode()),
    cropRight: Number(el.cropRight.value),
    cropBottom: Number(el.cropBottom.value),
    scaleOutput: el.scaleOutput.checked,
    logoPath: el.logoPath.value.trim(),
    logoX: Number(el.logoX.value),
    logoY: Number(el.logoY.value),
    logoW: Number(el.logoW.value),
    logoH: Number(el.logoH.value),
    logoOpacity: Number(el.logoOpacity.value),
    preset: el.preset.value,
    crf: Number(el.crf.value),
  };
  if (includeOutputPath) settings.outputPath = el.outputPath.value.trim();
  if (includeOutputDir) {
    const outputDir = dirnameLike(el.outputPath.value);
    if (outputDir) settings.outputDir = outputDir;
  }
  return settings;
}

/* ── Polling ───────────────────────────────────────────── */
let pollTimer = null;
function startPolling(interval = 800) {
  stopPolling();
  pollTimer = setInterval(fetchJobs, interval);
}
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

async function fetchJobs() {
  try {
    const data = await api("GET", "/api/jobs");
    S.jobs = data.jobs;
    S.isProcessing = data.isProcessing;
    if (!S.jobs.some(j => j.id === S.selectedId)) S.selectedId = S.jobs[0]?.id || null;
    // Auto-download newly completed
    if (el.autoDownload.checked) {
      for (const j of S.jobs) {
        if (j.status === "done" && j.outputPath && !S.doneIds.has(j.id)) {
          triggerDownload(j.outputPath, basename(j.inputPath));
        }
      }
    }
    // Track done IDs
    for (const j of S.jobs) {
      if (j.status === "done") S.doneIds.add(j.id);
    }
    renderQueue();
    renderDetail();
    updateToolbar();
    if (!S.isProcessing && !S.jobs.some(j => ["pending", "probing"].includes(j.status))) stopPolling();
  } catch { }
}

function triggerDownload(videoPath, title) {
  const a = document.createElement("a");
  a.href = `/api/video?path=${encodeURIComponent(videoPath)}`;
  a.download = title.replace(/\.[^.]+$/, "") + "_no_logo.mp4";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ── Add Jobs ──────────────────────────────────────────── */
async function addPaths(paths) {
  if (!paths.length) return;
  try {
    const selectedJob = getSelectedJob();
    const settings = selectedJob
      ? collectCurrentSettings()
      : { mode: getCurrentMode(), crf: Number(el.crf.value), preset: el.preset.value, scaleOutput: el.scaleOutput.checked };
    await api("POST", "/api/jobs/add", { paths, ...settings });
    setStatus(`Đã thêm ${paths.length} video`, "ok");
    startPolling(600);
    await fetchJobs();
  } catch (e) { setStatus(e.message, "err"); }
}

/* ── Render Queue ──────────────────────────────────────── */
function renderQueue() {
  const readyCount = S.jobs.filter(j => j.status === "ready").length;
  const doneCount = S.jobs.filter(j => j.status === "done").length;
  const issueCount = S.jobs.filter(j => ["error", "cancelled"].includes(j.status)).length;
  el.queueReadyCount.textContent = readyCount;
  el.queueDoneCount.textContent = doneCount;
  el.queueIssueCount.textContent = issueCount;
  el.queueCount.textContent = S.jobs.length;
  el.queueList.innerHTML = "";
  if (!S.jobs.length) {
    el.queueList.innerHTML = `
      <div class="queue-empty">
        <strong>Chưa có video trong hàng đợi</strong>
        <span>Thêm video ở cột trái để bắt đầu một lượt xử lý cục bộ.</span>
      </div>
    `;
  }
  for (const j of S.jobs) {
    const card = document.createElement("div");
    card.className = "job-card" + (j.id === S.selectedId ? " selected" : "");
    const badgeCls = `job-card-badge badge-${j.status}`;
    const statusLabel = getStatusLabel(j.status);
    let progressHTML = "";
    if (j.status === "processing") {
      progressHTML = `<div class="job-card-progress"><div class="prog-track"><div class="prog-fill" style="width:${j.progress}%"></div></div></div>`;
    }
    const meta = j.metadata ? `${j.metadata.width}×${j.metadata.height} · ${j.metadata.duration.toFixed(1)}s` : "";
    const thumbSrc = j.previewUrl ? (j.previewUrl + "?t=" + j.id) : "";
    const chips = [getOrientationLabel(j.metadata), getModeLabel(j.settings?.mode)]
      .filter(Boolean)
      .map(label => `<span class="job-meta-chip">${escapeHtml(label)}</span>`)
      .join("");
    const errorHTML = j.status === "error" && j.error ? `<p class="job-card-error">${escapeHtml(j.error)}</p>` : "";
    let actionsHTML = "";
    if (j.status === "done") {
      actionsHTML = `<div class="job-card-actions">
        <button class="play-btn" data-path="${j.outputPath}" title="Xem video">▶ Xem</button>
        <a class="dl-btn" href="/api/video?path=${encodeURIComponent(j.outputPath)}" download="${basename(j.outputPath)}" title="Tải về">⬇ Tải</a>
      </div>`;
    }
    card.innerHTML = `
      <div class="job-card-row">
        ${thumbSrc ? `<img class="job-card-thumb" src="${thumbSrc}" alt="">` : `<div class="job-card-thumb-ph">🎬</div>`}
        <div class="job-card-info">
          <div class="job-card-top">
            <span class="job-card-name" title="${escapeHtml(j.inputPath)}">${escapeHtml(basename(j.inputPath))}</span>
            <button class="remove-btn" data-id="${j.id}" title="Xoá">✕</button>
          </div>
          ${meta ? `<span class="job-card-meta">${meta}</span>` : ""}
          ${chips ? `<div class="job-card-chips">${chips}</div>` : ""}
          <span class="${badgeCls}">${statusLabel}${j.status === "processing" ? ` ${j.progress}%` : ""}</span>
          ${errorHTML}
        </div>
      </div>
      ${progressHTML}
      ${actionsHTML}
    `;
    card.addEventListener("click", (e) => {
      if (e.target.closest(".remove-btn") || e.target.closest(".play-btn") || e.target.closest(".dl-btn")) return;
      selectJob(j.id);
    });
    card.querySelector(".remove-btn").addEventListener("click", () => removeJob(j.id));
    const playBtn = card.querySelector(".play-btn");
    if (playBtn) playBtn.addEventListener("click", () => openVideoPlayer(j.outputPath, basename(j.inputPath)));
    el.queueList.appendChild(card);
  }
  // Overall progress
  const total = S.jobs.length;
  const done = S.jobs.filter(j => j.status === "done").length;
  const processing = S.jobs.find(j => j.status === "processing");
  if (total > 0 && S.isProcessing) {
    el.overallProgress.hidden = false;
    const pct = ((done + (processing ? processing.progress / 100 : 0)) / total * 100).toFixed(0);
    el.overallFill.style.width = pct + "%";
    el.overallFill.className = "prog-fill" + (done === total ? " done" : "");
    el.overallText.textContent = `${done} / ${total} đã hoàn tất`;
  } else if (done > 0 && done === total) {
    el.overallProgress.hidden = false;
    el.overallFill.style.width = "100%";
    el.overallFill.className = "prog-fill done";
    el.overallText.textContent = `${done} / ${total} đã hoàn tất`;
  } else {
    el.overallProgress.hidden = true;
  }
}

/* ── Select Job & Render Detail ────────────────────────── */
function selectJob(id) {
  S.selectedId = id;
  renderQueue();
  renderDetail();
}

function renderDetail() {
  const j = getSelectedJob();
  el.emptyState.hidden = !!j;
  el.jobDetail.hidden = !j;
  if (!j) { updateWorkflow(null); return; }
  updateSelectedSummary(j);
  // Preview
  if (j.previewUrl) {
    el.previewImage.src = j.previewUrl + "?t=" + j.id;
    el.previewImage.hidden = false;
    el.previewPlaceholder.hidden = true;
  } else {
    el.previewImage.hidden = true;
    el.previewPlaceholder.hidden = false;
    el.previewPlaceholder.textContent = j.status === "probing" ? "Đang tạo ảnh xem trước…" : j.status === "error" ? j.error : "Chưa có ảnh xem trước";
  }
  // Meta
  if (j.metadata) {
    el.metaText.textContent = `${j.metadata.width}×${j.metadata.height} | ${getOrientationLabel(j.metadata)} | ${j.metadata.codec} | ${j.metadata.duration.toFixed(2)} giây | ${formatFrameRate(j.metadata.frameRate)} fps`;
  } else { el.metaText.textContent = ""; }
  // Settings
  const s = j.settings;
  setActiveMode(s.mode);
  el.cropRight.value = s.cropRight ?? j.cropPreset?.right ?? 0;
  el.cropBottom.value = s.cropBottom ?? j.cropPreset?.bottom ?? 0;
  el.scaleOutput.checked = s.scaleOutput !== false;
  if (el.delogoX) el.delogoX.value = s.delogoX || 0;
  if (el.delogoY) el.delogoY.value = s.delogoY || 0;
  if (el.delogoW) el.delogoW.value = s.delogoW || 0;
  if (el.delogoH) el.delogoH.value = s.delogoH || 0;
  el.logoPath.value = s.logoPath || "";
  el.logoX.value = s.logoX || 0;
  el.logoY.value = s.logoY || 0;
  el.logoW.value = s.logoW || 200;
  el.logoH.value = s.logoH || 200;
  el.logoOpacity.value = s.logoOpacity || 1;
  el.opacityVal.textContent = Math.round((s.logoOpacity || 1) * 100) + "%";
  el.preset.value = s.preset || "slow";
  el.crf.value = s.crf ?? 16;
  el.outputPath.value = j.outputPath || "";
  // Result actions
  if (j.status === "done" && j.outputPath) {
    el.resultActions.hidden = false;
    el.downloadResultBtn.href = `/api/video?path=${encodeURIComponent(j.outputPath)}`;
    el.downloadResultBtn.download = basename(j.outputPath);
  } else {
    el.resultActions.hidden = true;
  }
  // Selection box
  renderSelectionBox();
  renderLogoOverlay();
}

/* ── Mode Switching ────────────────────────────────────── */
function setActiveMode(mode) {
  mode = normalizeMode(mode);
  modeTabs.forEach(t => t.classList.toggle("active", t.dataset.mode === mode));
  el.cropSettings.hidden = mode !== "crop";
  if (el.delogoSettings) el.delogoSettings.hidden = true;
  el.overlaySettings.hidden = mode !== "overlay";
  if (el.selectionLayer) el.selectionLayer.hidden = true;
  el.logoOverlay.hidden = mode !== "overlay";
  updateModeNote(mode);
  renderSelectionBox();
  renderLogoOverlay();
}

/* ── Save Settings to Server ───────────────────────────── */
async function saveJobSettings() {
  const j = getSelectedJob();
  if (!j || ["processing", "done"].includes(j.status)) return;
  const settings = collectCurrentSettings({ includeOutputPath: true });
  try { await api("POST", `/api/jobs/${j.id}/settings`, settings); }
  catch { }
}
let saveTimeout;
function debounceSave() { clearTimeout(saveTimeout); saveTimeout = setTimeout(saveJobSettings, 300); }

/* ── Selection Box (Delogo) ────────────────────────────── */
function hasPreview() {
  const j = getSelectedJob();
  return j && j.metadata && !el.previewImage.hidden && el.previewImage.complete && el.previewFrame.clientWidth > 0;
}
function getPreviewRect() { return el.previewImage.getBoundingClientRect(); }
function toSource(cx, cy) {
  if (!hasPreview()) return null;
  const j = getSelectedJob(), r = getPreviewRect();
  return { x: clamp(cx - r.left, 0, r.width) * j.metadata.width / r.width, y: clamp(cy - r.top, 0, r.height) * j.metadata.height / r.height };
}
function toDisplay(sel) {
  if (!hasPreview() || !sel) return null;
  const j = getSelectedJob(), r = getPreviewRect();
  const rx = r.width / j.metadata.width, ry = r.height / j.metadata.height;
  return { left: sel.x * rx, top: sel.y * ry, width: sel.w * rx, height: sel.h * ry };
}
function renderSelectionBox() {
  if (!el.selectionLayer || !el.selectionBox) return;
  el.selectionLayer.hidden = true;
  el.selectionBox.hidden = true;
}

// Pointer handlers for legacy delogo overlay (kept inert after crop-only UI)
function insideBox(cx, cy) {
  const d = toDisplay({ x: Number(el.delogoX?.value || 0), y: Number(el.delogoY?.value || 0), w: Number(el.delogoW?.value || 0), h: Number(el.delogoH?.value || 0) });
  if (!d) return false;
  const r = getPreviewRect(), lx = cx - r.left, ly = cy - r.top;
  return lx >= d.left && lx <= d.left + d.width && ly >= d.top && ly <= d.top + d.height;
}
if (el.selectionLayer && el.selectionBox) {
  el.selectionLayer.hidden = true;
  el.selectionBox.hidden = true;
}

// Pointer handlers for delogo
if (el.selectionLayer) el.selectionLayer.addEventListener("pointerdown", e => {
  if (getCurrentMode() !== "delogo" || !hasPreview()) return;
  el.selectionLayer.hidden = false;
  e.preventDefault();
  const sp = toSource(e.clientX, e.clientY);
  if (!sp) return;
  if (Number(el.delogoW.value) > 0 && insideBox(e.clientX, e.clientY)) {
    S.interaction = { type: "move", pid: e.pointerId, anchor: sp, origin: { x: Number(el.delogoX.value), y: Number(el.delogoY.value), w: Number(el.delogoW.value), h: Number(el.delogoH.value) } };
  } else {
    S.interaction = { type: "draw", pid: e.pointerId, start: sp };
    el.delogoX.value = Math.round(sp.x); el.delogoY.value = Math.round(sp.y);
    el.delogoW.value = 1; el.delogoH.value = 1;
  }
  el.selectionLayer.setPointerCapture(e.pointerId);
  renderSelectionBox();
});
if (el.selectionLayer) el.selectionLayer.addEventListener("pointermove", e => {
  if (!S.interaction || S.interaction.pid !== e.pointerId) return;
  const sp = toSource(e.clientX, e.clientY);
  if (!sp) return;
  const j = getSelectedJob();
  if (S.interaction.type === "draw") {
    const s = S.interaction.start;
    el.delogoX.value = Math.round(Math.min(s.x, sp.x));
    el.delogoY.value = Math.round(Math.min(s.y, sp.y));
    el.delogoW.value = Math.max(1, Math.round(Math.abs(sp.x - s.x)));
    el.delogoH.value = Math.max(1, Math.round(Math.abs(sp.y - s.y)));
  } else if (S.interaction.type === "move") {
    const { anchor, origin } = S.interaction;
    el.delogoX.value = Math.round(clamp(origin.x + sp.x - anchor.x, 0, j.metadata.width - origin.w));
    el.delogoY.value = Math.round(clamp(origin.y + sp.y - anchor.y, 0, j.metadata.height - origin.h));
  }
  renderSelectionBox();
  debounceSave();
});
if (el.selectionLayer) el.selectionLayer.addEventListener("pointerup", e => { if (S.interaction && S.interaction.pid === e.pointerId) { el.selectionLayer.releasePointerCapture(e.pointerId); S.interaction = null; debounceSave(); } });
if (el.selectionLayer) el.selectionLayer.addEventListener("pointercancel", e => { if (S.interaction && S.interaction.pid === e.pointerId) { S.interaction = null; } });

/* ── Logo Overlay (Add Logo mode) ──────────────────────── */
function renderLogoOverlay() {
  const logoPath = el.logoPath.value.trim();
  if (getCurrentMode() !== "overlay" || !hasPreview() || !logoPath) {
    el.logoOverlay.hidden = true;
    el.logoOverlay.removeAttribute("src");
    delete el.logoOverlay.dataset.sourcePath;
    return;
  }
  const j = getSelectedJob();
  if (!j || !j.metadata) { el.logoOverlay.hidden = true; return; }
  const r = getPreviewRect();
  const rx = r.width / j.metadata.width, ry = r.height / j.metadata.height;
  const lx = Number(el.logoX.value) * rx, ly = Number(el.logoY.value) * ry;
  const lw = Number(el.logoW.value) * rx, lh = Number(el.logoH.value) * ry;
  el.logoOverlay.hidden = false;
  el.logoOverlay.style.opacity = el.logoOpacity.value;
  Object.assign(el.logoOverlay.style, { left: lx + "px", top: ly + "px", width: lw + "px", height: lh + "px" });
  if (el.logoOverlay.dataset.sourcePath !== logoPath) {
    el.logoOverlay.dataset.sourcePath = logoPath;
    el.logoOverlay.src = buildImagePreviewUrl(logoPath);
  }
}

// Logo drag
el.logoOverlay.addEventListener("pointerdown", e => {
  e.preventDefault(); e.stopPropagation();
  const sp = toSource(e.clientX, e.clientY);
  if (!sp) return;
  S.logoInteraction = { pid: e.pointerId, anchor: sp, ox: Number(el.logoX.value), oy: Number(el.logoY.value) };
  el.logoOverlay.setPointerCapture(e.pointerId);
});
el.logoOverlay.addEventListener("pointermove", e => {
  if (!S.logoInteraction || S.logoInteraction.pid !== e.pointerId) return;
  const sp = toSource(e.clientX, e.clientY);
  if (!sp) return;
  const j = getSelectedJob();
  const { anchor, ox, oy } = S.logoInteraction;
  el.logoX.value = Math.round(clamp(ox + sp.x - anchor.x, 0, j.metadata.width - Number(el.logoW.value)));
  el.logoY.value = Math.round(clamp(oy + sp.y - anchor.y, 0, j.metadata.height - Number(el.logoH.value)));
  renderLogoOverlay();
  debounceSave();
});
el.logoOverlay.addEventListener("pointerup", e => { if (S.logoInteraction && S.logoInteraction.pid === e.pointerId) { el.logoOverlay.releasePointerCapture(e.pointerId); S.logoInteraction = null; debounceSave(); } });

/* ── Toolbar State ─────────────────────────────────────── */
function updateToolbar() {
  el.startBtn.disabled = S.isProcessing || !S.jobs.some(j => j.status === "ready");
  el.stopBtn.disabled = !S.isProcessing;
  if (S.isProcessing) setStatus("Đang xử lý…", "busy");
  else if (S.jobs.length && S.jobs.every(j => j.status === "done")) setStatus("Đã hoàn tất tất cả", "ok");
  else setStatus("Sẵn sàng", "ok");
}

/* ── Remove Job ────────────────────────────────────────── */
async function removeJob(id) {
  try {
    await api("DELETE", `/api/jobs/${id}`);
    if (S.selectedId === id) S.selectedId = null;
    await fetchJobs();
  } catch (e) { setStatus(e.message, "err"); }
}

/* ── Event Listeners ───────────────────────────────────── */
// Add / Browse
el.addBtn.addEventListener("click", () => el.dropZone.click());
el.emptyBrowseBtn.addEventListener("click", () => el.dropZone.click());
el.browseBtn.addEventListener("click", async () => {
  if (isElectron) {
    const paths = await window.electronAPI.openFileDialog();
    if (paths && paths.length) await addPaths(paths);
  } else { el.manualPath.focus(); }
});
el.addPathBtn.addEventListener("click", async () => {
  const p = el.manualPath.value.trim();
  if (p) { await addPaths([p]); el.manualPath.value = ""; }
});
el.manualPath.addEventListener("keydown", e => { if (e.key === "Enter") el.addPathBtn.click(); });

// Browse logo
el.browseLogoBtn.addEventListener("click", async () => {
  if (isElectron) {
    const paths = await window.electronAPI.openFileDialog("image");
    if (paths && paths.length) { el.logoPath.value = paths[0]; debounceSave(); renderLogoOverlay(); }
  }
});

// Drop zone
el.dropZone.addEventListener("dragover", e => { e.preventDefault(); el.dropZone.classList.add("drag-over"); });
el.dropZone.addEventListener("dragleave", () => el.dropZone.classList.remove("drag-over"));
el.dropZone.addEventListener("drop", async e => {
  e.preventDefault(); el.dropZone.classList.remove("drag-over");
  const paths = [];
  if (isElectron) {
    for (const f of e.dataTransfer.files) paths.push(window.electronAPI.getFilePath(f));
  } else {
    for (const f of e.dataTransfer.files) {
      if (f.path) paths.push(f.path);
      else if (f.name) { setStatus("Trong chế độ trình duyệt, hãy dán đầy đủ đường dẫn tệp", "err"); return; }
    }
  }
  if (paths.length) await addPaths(paths);
});
// Also allow clicking drop zone
el.dropZone.addEventListener("click", async () => {
  if (isElectron) {
    const paths = await window.electronAPI.openFileDialog();
    if (paths && paths.length) await addPaths(paths);
  } else { el.manualPath.focus(); }
});

// Queue controls
el.startBtn.addEventListener("click", async () => {
  try { await api("POST", "/api/queue/start"); startPolling(500); setStatus("Đang xử lý…", "busy"); } catch (e) { setStatus(e.message, "err"); }
});
el.stopBtn.addEventListener("click", async () => {
  try { await api("POST", "/api/queue/stop"); setStatus("Đã dừng", "err"); } catch (e) { setStatus(e.message, "err"); }
});
el.clearBtn.addEventListener("click", async () => {
  try { await api("POST", "/api/jobs/clear-done"); await fetchJobs(); } catch (e) { setStatus(e.message, "err"); }
});
el.applyAllBtn.addEventListener("click", async () => {
  const settings = collectCurrentSettings({ includeOutputDir: true });
  try { const r = await api("POST", "/api/jobs/apply-settings", settings); setStatus(`Đã áp dụng cho ${r.count} video`, "ok"); } catch (e) { setStatus(e.message, "err"); }
});

// Browse output folder
el.browseOutputBtn.addEventListener("click", async () => {
  if (isElectron && window.electronAPI.openFolderDialog) {
    const dir = await window.electronAPI.openFolderDialog();
    if (dir) {
      const j = getSelectedJob();
      if (j) {
        const fname = basename(el.outputPath.value || j.outputPath || "output.mp4");
        el.outputPath.value = dir + "/" + fname;
        debounceSave();
      }
    }
  } else {
    const dir = prompt("Nhập đường dẫn thư mục xuất:", el.outputPath.value.replace(/[/\\][^/\\]+$/, ""));
    if (dir) {
      const j = getSelectedJob();
      if (j) {
        const fname = basename(el.outputPath.value || j.outputPath || "output.mp4");
        el.outputPath.value = dir + "/" + fname;
        debounceSave();
      }
    }
  }
});

// Play result video
el.playResultBtn.addEventListener("click", () => {
  const j = getSelectedJob();
  if (j && j.outputPath) openVideoPlayer(j.outputPath, basename(j.inputPath));
});

// Open output folder
el.openOutputBtn.addEventListener("click", async () => {
  const j = getSelectedJob();
  if (!j) return;
  try { await fetch(`/api/open-output?path=${encodeURIComponent(j.outputPath)}`); } catch { }
});

// Auto-download persistence
el.autoDownload.checked = localStorage.getItem("autoDownload") === "true";
el.autoDownload.addEventListener("change", () => {
  localStorage.setItem("autoDownload", el.autoDownload.checked);
});

// Mode tabs
modeTabs.forEach(t => t.addEventListener("click", () => {
  setActiveMode(t.dataset.mode);
  debounceSave();
}));

// Settings inputs
[el.cropRight, el.cropBottom, el.scaleOutput].forEach(i => i.addEventListener("input", debounceSave));
[el.delogoX, el.delogoY, el.delogoW, el.delogoH].filter(Boolean).forEach(i => {
  i.addEventListener("input", () => { renderSelectionBox(); debounceSave(); });
});
[el.logoPath, el.logoX, el.logoY, el.logoW, el.logoH].forEach(i => {
  i.addEventListener("input", () => { renderLogoOverlay(); debounceSave(); });
});
el.logoOpacity.addEventListener("input", () => {
  el.opacityVal.textContent = Math.round(el.logoOpacity.value * 100) + "%";
  renderLogoOverlay(); debounceSave();
});
el.logoOverlay.addEventListener("error", () => {
  if (!el.logoPath.value.trim()) return;
  el.logoOverlay.hidden = true;
  setStatus("Không tải được ảnh xem trước của logo", "err");
});
[el.preset, el.crf, el.outputPath].forEach(i => i.addEventListener("input", debounceSave));

// Presets
el.cropPresetBtn.addEventListener("click", () => {
  const j = getSelectedJob();
  if (j && j.cropPreset) { el.cropRight.value = j.cropPreset.right; el.cropBottom.value = j.cropPreset.bottom; el.scaleOutput.checked = true; debounceSave(); }
});
if (el.delogoPresetBtn) el.delogoPresetBtn.addEventListener("click", () => {
  const j = getSelectedJob();
  if (j && j.delogoPreset) { el.delogoX.value = j.delogoPreset.x; el.delogoY.value = j.delogoPreset.y; el.delogoW.value = j.delogoPreset.w; el.delogoH.value = j.delogoPreset.h; renderSelectionBox(); debounceSave(); }
});

// Resize
window.addEventListener("resize", () => { renderSelectionBox(); renderLogoOverlay(); });
el.previewImage.addEventListener("load", () => { renderSelectionBox(); renderLogoOverlay(); });

// Initial fetch
fetchJobs();

// Hide browse button in web mode
if (!isElectron) {
  el.browseLogoBtn.style.display = "none";
}

/* ── Video Player ──────────────────────────────────────── */
function openVideoPlayer(videoPath, title) {
  el.videoTitle.textContent = title || "Xem video";
  el.videoPlayer.src = `/api/video?path=${encodeURIComponent(videoPath)}`;
  el.videoModal.hidden = false;
  el.videoPlayer.play().catch(() => { });
}

function closeVideoPlayer() {
  el.videoPlayer.pause();
  el.videoPlayer.src = "";
  el.videoModal.hidden = true;
}

el.videoCloseBtn.addEventListener("click", closeVideoPlayer);
el.videoBackdrop.addEventListener("click", closeVideoPlayer);
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !el.videoModal.hidden) closeVideoPlayer();
});
