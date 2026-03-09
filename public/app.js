/* ── State ──────────────────────────────────────────────── */
const S = { jobs: [], selectedId: null, isProcessing: false, interaction: null, logoInteraction: null, doneIds: new Set() };
const isElectron = !!(window.electronAPI && window.electronAPI.isElectron);

/* ── DOM ───────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const el = {
  addBtn: $("addBtn"), browseBtn: $("browseBtn"), startBtn: $("startBtn"),
  stopBtn: $("stopBtn"), clearBtn: $("clearBtn"),
  dropZone: $("dropZone"), queueList: $("queueList"), queueCount: $("queueCount"),
  manualPath: $("manualPath"), addPathBtn: $("addPathBtn"),
  overallProgress: $("overallProgress"), overallFill: $("overallFill"), overallText: $("overallText"),
  emptyState: $("emptyState"), jobDetail: $("jobDetail"),
  previewFrame: $("previewFrame"), previewImage: $("previewImage"),
  previewPlaceholder: $("previewPlaceholder"),
  selectionLayer: $("selectionLayer"), selectionBox: $("selectionBox"),
  logoOverlay: $("logoOverlay"),
  metaText: $("metaText"),
  cropSettings: $("cropSettings"), delogoSettings: $("delogoSettings"), overlaySettings: $("overlaySettings"),
  cropRight: $("cropRight"), cropBottom: $("cropBottom"), scaleOutput: $("scaleOutput"), cropPresetBtn: $("cropPresetBtn"),
  delogoX: $("delogoX"), delogoY: $("delogoY"), delogoW: $("delogoW"), delogoH: $("delogoH"), delogoPresetBtn: $("delogoPresetBtn"),
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
function basename(p) { return p.split(/[\\/]/).pop(); }
function setStatus(msg, tone) {
  el.statusText.textContent = msg;
  el.statusIcon.className = "status-dot" + (tone === "busy" ? " busy" : tone === "err" ? " err" : "");
}
async function api(method, url, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
function getSelectedJob() { return S.jobs.find(j => j.id === S.selectedId) || null; }
function getCurrentMode() {
  const active = document.querySelector(".mode-tab.active");
  return active ? active.dataset.mode : "crop";
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
  const mode = getCurrentMode();
  try {
    await api("POST", "/api/jobs/add", { paths, mode, crf: Number(el.crf.value), preset: el.preset.value, scaleOutput: el.scaleOutput.checked });
    setStatus(`Added ${paths.length} video(s)`, "ok");
    startPolling(600);
    await fetchJobs();
  } catch (e) { setStatus(e.message, "err"); }
}

/* ── Render Queue ──────────────────────────────────────── */
function renderQueue() {
  el.queueCount.textContent = S.jobs.length;
  el.queueList.innerHTML = "";
  for (const j of S.jobs) {
    const card = document.createElement("div");
    card.className = "job-card" + (j.id === S.selectedId ? " selected" : "");
    const badgeCls = `job-card-badge badge-${j.status}`;
    const statusLabel = { pending: "Pending", probing: "Probing", ready: "Ready", processing: "Processing", done: "Done", error: "Error", cancelled: "Cancelled" }[j.status] || j.status;
    let progressHTML = "";
    if (j.status === "processing") {
      progressHTML = `<div class="job-card-progress"><div class="prog-track"><div class="prog-fill" style="width:${j.progress}%"></div></div></div>`;
    }
    const meta = j.metadata ? `${j.metadata.width}×${j.metadata.height} · ${j.metadata.duration.toFixed(1)}s` : "";
    const thumbSrc = j.previewUrl ? (j.previewUrl + "?t=" + j.id) : "";
    let actionsHTML = "";
    if (j.status === "done") {
      actionsHTML = `<div class="job-card-actions">
        <button class="play-btn" data-path="${j.outputPath}" title="Play">▶ Xem</button>
        <a class="dl-btn" href="/api/video?path=${encodeURIComponent(j.outputPath)}" download="${basename(j.outputPath)}" title="Download">⬇ Tải</a>
      </div>`;
    }
    card.innerHTML = `
      <div class="job-card-row">
        ${thumbSrc ? `<img class="job-card-thumb" src="${thumbSrc}" alt="">` : `<div class="job-card-thumb-ph">🎬</div>`}
        <div class="job-card-info">
          <div class="job-card-top">
            <span class="job-card-name" title="${j.inputPath}">${basename(j.inputPath)}</span>
            <button class="remove-btn" data-id="${j.id}" title="Remove">✕</button>
          </div>
          ${meta ? `<span class="job-card-meta">${meta}</span>` : ""}
          <span class="${badgeCls}">${statusLabel}${j.status === "processing" ? ` ${j.progress}%` : ""}</span>
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
    el.overallText.textContent = `${done} / ${total} completed`;
  } else if (done > 0 && done === total) {
    el.overallProgress.hidden = false;
    el.overallFill.style.width = "100%";
    el.overallFill.className = "prog-fill done";
    el.overallText.textContent = `${done} / ${total} completed`;
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
  if (!j) return;
  // Preview
  if (j.previewUrl) {
    el.previewImage.src = j.previewUrl + "?t=" + j.id;
    el.previewImage.hidden = false;
    el.previewPlaceholder.hidden = true;
  } else {
    el.previewImage.hidden = true;
    el.previewPlaceholder.hidden = false;
    el.previewPlaceholder.textContent = j.status === "probing" ? "Loading preview…" : j.status === "error" ? j.error : "No preview";
  }
  // Meta
  if (j.metadata) {
    el.metaText.textContent = `${j.metadata.width}×${j.metadata.height} | ${j.metadata.codec} | ${j.metadata.duration.toFixed(2)}s | ${j.metadata.frameRate} fps`;
  } else { el.metaText.textContent = ""; }
  // Settings
  const s = j.settings;
  setActiveMode(s.mode);
  el.cropRight.value = s.cropRight || 0;
  el.cropBottom.value = s.cropBottom || 0;
  el.scaleOutput.checked = s.scaleOutput !== false;
  el.delogoX.value = s.delogoX || 0;
  el.delogoY.value = s.delogoY || 0;
  el.delogoW.value = s.delogoW || 0;
  el.delogoH.value = s.delogoH || 0;
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
  modeTabs.forEach(t => t.classList.toggle("active", t.dataset.mode === mode));
  el.cropSettings.hidden = mode !== "crop";
  el.delogoSettings.hidden = mode !== "delogo";
  el.overlaySettings.hidden = mode !== "overlay";
  el.selectionLayer.hidden = mode !== "delogo";
  el.logoOverlay.hidden = mode !== "overlay";
  renderSelectionBox();
  renderLogoOverlay();
}

/* ── Save Settings to Server ───────────────────────────── */
async function saveJobSettings() {
  const j = getSelectedJob();
  if (!j || ["processing", "done"].includes(j.status)) return;
  const mode = getCurrentMode();
  const settings = {
    mode, cropRight: Number(el.cropRight.value), cropBottom: Number(el.cropBottom.value),
    scaleOutput: el.scaleOutput.checked,
    delogoX: Number(el.delogoX.value), delogoY: Number(el.delogoY.value),
    delogoW: Number(el.delogoW.value), delogoH: Number(el.delogoH.value),
    logoPath: el.logoPath.value, logoX: Number(el.logoX.value), logoY: Number(el.logoY.value),
    logoW: Number(el.logoW.value), logoH: Number(el.logoH.value),
    logoOpacity: Number(el.logoOpacity.value),
    preset: el.preset.value, crf: Number(el.crf.value),
  };
  try { await api("POST", `/api/jobs/${j.id}/settings`, { ...settings, outputPath: el.outputPath.value }); }
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
  if (getCurrentMode() !== "delogo" || !hasPreview()) { el.selectionLayer.hidden = true; el.selectionBox.hidden = true; return; }
  el.selectionLayer.hidden = false;
  const x = Number(el.delogoX.value), y = Number(el.delogoY.value);
  const w = Number(el.delogoW.value), h = Number(el.delogoH.value);
  if (w <= 0 || h <= 0) { el.selectionBox.hidden = true; return; }
  const d = toDisplay({ x, y, w, h });
  if (!d) { el.selectionBox.hidden = true; return; }
  el.selectionBox.hidden = false;
  Object.assign(el.selectionBox.style, { left: d.left + "px", top: d.top + "px", width: d.width + "px", height: d.height + "px" });
}

// Pointer handlers for delogo
function insideBox(cx, cy) {
  const d = toDisplay({ x: Number(el.delogoX.value), y: Number(el.delogoY.value), w: Number(el.delogoW.value), h: Number(el.delogoH.value) });
  if (!d) return false;
  const r = getPreviewRect(), lx = cx - r.left, ly = cy - r.top;
  return lx >= d.left && lx <= d.left + d.width && ly >= d.top && ly <= d.top + d.height;
}
el.selectionLayer.addEventListener("pointerdown", e => {
  if (getCurrentMode() !== "delogo" || !hasPreview()) return;
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
el.selectionLayer.addEventListener("pointermove", e => {
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
el.selectionLayer.addEventListener("pointerup", e => { if (S.interaction && S.interaction.pid === e.pointerId) { el.selectionLayer.releasePointerCapture(e.pointerId); S.interaction = null; debounceSave(); } });
el.selectionLayer.addEventListener("pointercancel", e => { if (S.interaction && S.interaction.pid === e.pointerId) { S.interaction = null; } });

/* ── Logo Overlay (Add Logo mode) ──────────────────────── */
function renderLogoOverlay() {
  if (getCurrentMode() !== "overlay" || !hasPreview() || !el.logoPath.value) { el.logoOverlay.hidden = true; return; }
  const j = getSelectedJob();
  if (!j || !j.metadata) { el.logoOverlay.hidden = true; return; }
  const r = getPreviewRect();
  const rx = r.width / j.metadata.width, ry = r.height / j.metadata.height;
  const lx = Number(el.logoX.value) * rx, ly = Number(el.logoY.value) * ry;
  const lw = Number(el.logoW.value) * rx, lh = Number(el.logoH.value) * ry;
  el.logoOverlay.hidden = false;
  el.logoOverlay.style.opacity = el.logoOpacity.value;
  Object.assign(el.logoOverlay.style, { left: lx + "px", top: ly + "px", width: lw + "px", height: lh + "px" });
  if (!el.logoOverlay.src || !el.logoOverlay.src.includes(el.logoPath.value)) {
    el.logoOverlay.src = `/previews/logo_placeholder.svg`;
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
  if (S.isProcessing) setStatus("Processing…", "busy");
  else if (S.jobs.length && S.jobs.every(j => j.status === "done")) setStatus("All done!", "ok");
  else setStatus("Ready", "ok");
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
    const paths = await window.electronAPI.openFileDialog();
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
      else if (f.name) { setStatus("Paste full path in browser mode", "err"); return; }
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
  try { await api("POST", "/api/queue/start"); startPolling(500); setStatus("Processing…", "busy"); } catch (e) { setStatus(e.message, "err"); }
});
el.stopBtn.addEventListener("click", async () => {
  try { await api("POST", "/api/queue/stop"); setStatus("Stopped", "err"); } catch (e) { setStatus(e.message, "err"); }
});
el.clearBtn.addEventListener("click", async () => {
  try { await api("POST", "/api/jobs/clear-done"); await fetchJobs(); } catch (e) { setStatus(e.message, "err"); }
});
el.applyAllBtn.addEventListener("click", async () => {
  const mode = getCurrentMode();
  const settings = { mode, crf: Number(el.crf.value), preset: el.preset.value, scaleOutput: el.scaleOutput.checked };
  try { const r = await api("POST", "/api/jobs/apply-settings", settings); setStatus(`Applied to ${r.count} job(s)`, "ok"); } catch (e) { setStatus(e.message, "err"); }
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
    const dir = prompt("Enter output folder path:", el.outputPath.value.replace(/[/\\][^/\\]+$/, ""));
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
[el.delogoX, el.delogoY, el.delogoW, el.delogoH].forEach(i => {
  i.addEventListener("input", () => { renderSelectionBox(); debounceSave(); });
});
[el.logoPath, el.logoX, el.logoY, el.logoW, el.logoH].forEach(i => {
  i.addEventListener("input", () => { renderLogoOverlay(); debounceSave(); });
});
el.logoOpacity.addEventListener("input", () => {
  el.opacityVal.textContent = Math.round(el.logoOpacity.value * 100) + "%";
  renderLogoOverlay(); debounceSave();
});
[el.preset, el.crf, el.outputPath].forEach(i => i.addEventListener("input", debounceSave));

// Presets
el.cropPresetBtn.addEventListener("click", () => {
  const j = getSelectedJob();
  if (j && j.cropPreset) { el.cropRight.value = j.cropPreset.right; el.cropBottom.value = j.cropPreset.bottom; el.scaleOutput.checked = true; debounceSave(); }
});
el.delogoPresetBtn.addEventListener("click", () => {
  const j = getSelectedJob();
  if (j && j.delogoPreset) { el.delogoX.value = j.delogoPreset.x; el.delogoY.value = j.delogoPreset.y; el.delogoW.value = j.delogoPreset.w; el.delogoH.value = j.delogoPreset.h; renderSelectionBox(); debounceSave(); }
});

// Resize
window.addEventListener("resize", () => { renderSelectionBox(); renderLogoOverlay(); });
el.previewImage.addEventListener("load", () => { renderSelectionBox(); renderLogoOverlay(); });

// Auto-select first job when queue updates
function autoSelectFirst() {
  if (!S.selectedId && S.jobs.length) selectJob(S.jobs[0].id);
}

// Initial fetch
fetchJobs().then(autoSelectFirst);

// Hide browse button in web mode
if (!isElectron) {
  el.browseLogoBtn.style.display = "none";
}

/* ── Video Player ──────────────────────────────────────── */
function openVideoPlayer(videoPath, title) {
  el.videoTitle.textContent = title || "Video Preview";
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
