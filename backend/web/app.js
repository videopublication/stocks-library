// Setu (सेतु) Creative Asset Bridge & Sangraha UI
document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("library-search-input");
  const clearSearchBtn = document.getElementById("clear-search-btn");
  const submitForm = document.getElementById("submit-form");
  const trackUrlInput = document.getElementById("track-url");
  const urlDetectedBadge = document.getElementById("url-detected-badge");
  const trackVariantSelect = document.getElementById("track-variant");
  const audioFormatSelect = document.getElementById("audio-format");
  const submitBtn = document.getElementById("submit-btn");
  const submitResult = document.getElementById("submit-result");
  const refreshBtn = document.getElementById("refresh-btn");

  const serverStatus = document.getElementById("server-status");
  const sessionStatus = document.getElementById("session-status");
  const quotaText = document.getElementById("quota-text");
  const quotaBar = document.getElementById("quota-bar");
  const cacheHitsVal = document.getElementById("cache-hits-val");
  const diskFreeVal = document.getElementById("disk-free-val");
  const queueDepthVal = document.getElementById("queue-depth-val");

  const inFlightContainer = document.getElementById("in-flight-container");
  const inFlightTitle = document.getElementById("in-flight-title");
  const inFlightVariant = document.getElementById("in-flight-variant");
  const inFlightPhase = document.getElementById("in-flight-phase");
  const inFlightElapsed = document.getElementById("in-flight-elapsed");
  const inFlightTimeout = document.getElementById("in-flight-timeout");
  const cancelInflightBtn = document.getElementById("cancel-inflight-btn");
  const phaseTrack = document.getElementById("phase-track");
  const dlProgress = document.getElementById("dl-progress");
  const dlBar = document.getElementById("dl-bar");
  const dlText = document.getElementById("dl-text");
  const dlPct = document.getElementById("dl-pct");
  const queueList = document.getElementById("queue-list");
  const recentSection = document.getElementById("recent-section");
  const recentList = document.getElementById("recent-list");
  const clearRecentBtn = document.getElementById("clear-recent-btn");
  const pausedBanner = document.getElementById("paused-banner");
  const pausedReason = document.getElementById("paused-reason");
  const resumeBtn = document.getElementById("resume-btn");
  const dldirBanner = document.getElementById("dldir-banner");
  const dldirDetail = document.getElementById("dldir-detail");
  const cooldownBanner = document.getElementById("cooldown-banner");
  const cooldownSeconds = document.getElementById("cooldown-seconds");
  const libraryTotal = document.getElementById("library-total");
  const libraryTbody = document.getElementById("library-tbody");
  const libraryCount = document.getElementById("library-count");
  const categoryFilterBar = document.getElementById("category-filter-bar");
  const toastBox = document.getElementById("toast-box");

  // Audio Player Elements
  const audioPlayerBar = document.getElementById("audio-player-bar");
  const playerPlayBtn = document.getElementById("player-play-btn");
  const playerPlayIcon = document.getElementById("player-play-icon");
  const playerTitle = document.getElementById("player-title");
  const playerSub = document.getElementById("player-sub");
  const playerCurrentTime = document.getElementById("player-current-time");
  const playerScrubber = document.getElementById("player-scrubber");
  const playerDuration = document.getElementById("player-duration");
  const playerCloseBtn = document.getElementById("player-close-btn");

  let currentAudio = new Audio();
  let currentPlayingTrackId = null;
  let currentPlayingVariant = null;
  let currentCategory = "all";
  let currentInFlightId = null;

  let clock = { elapsed: null, timeout: null, cooldown: 0, etas: new Map() };
  let searchTimeout = null;

  const TOKEN = window.RELAY_TOKEN || "";

  function authHeaders(extra) {
    return Object.assign({ Authorization: `Bearer ${TOKEN}` }, extra || {});
  }

  function apiFetch(path, options) {
    const opts = options || {};
    opts.headers = authHeaders(opts.headers);
    return fetch(path, opts);
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 MB";
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function shortTitle(raw) {
    let t = (raw || "").trim();
    t = t.replace(/\s*-\s*Royalty Free Music\s*\|\s*Artlist\s*$/i, "");
    t = t.replace(/\s*\|\s*Artlist\s*$/i, "");
    t = t.replace(/\s*\|\s*Envato Elements\s*$/i, "");
    const by = t.toLowerCase().lastIndexOf(" by ");
    if (by > 0) t = t.slice(0, by);
    return t.trim();
  }

  function splitError(err) {
    const text = (err || "").trim();
    const markers = ["Icon controls on page:", "PAGE STATE:", "CONTROLS:", "Rows present:"];
    let cut = text.length;
    for (const m of markers) {
      const i = text.indexOf(m);
      if (i > -1 && i < cut) cut = i;
    }
    const summary = text.slice(0, cut).trim().replace(/[.\s]+$/, "");
    return { summary: summary || text, detail: cut < text.length ? text : "" };
  }

  function relativeTime(iso) {
    if (!iso) return "";
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "";
    const diff = Math.floor((Date.now() - then) / 1000);
    if (diff < 45) return "just now";
    if (diff < 90) return "1 min ago";
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 7200) return "1 hour ago";
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    const days = Math.floor(diff / 86400);
    return days === 1 ? "yesterday" : `${days} days ago`;
  }

  function fileKind(filename) {
    const ext = (filename || "").split(".").pop().toLowerCase();
    if (ext === "zip") return { label: "ZIP Archive", cls: "kind-zip" };
    if (ext === "wav" || ext === "wave") return { label: "Lossless WAV", cls: "kind-wav" };
    if (ext === "mp3") return { label: "MP3 Audio", cls: "kind-mp3" };
    if (ext === "mov" || ext === "mp4") return { label: "Video Template", cls: "kind-zip" };
    return { label: ext.toUpperCase() || "FILE", cls: "kind-other" };
  }

  function showToast(msg) {
    if (!toastBox) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
      <span>${msg}</span>
    `;
    toastBox.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-6px)";
      toast.style.transition = "all 0.2s ease";
      setTimeout(() => toast.remove(), 200);
    }, 2400);
  }

  // --- Dynamic URL Provider Detector ---------------------------------------
  function detectProvider(url) {
    if (!url) return null;
    const u = url.toLowerCase();
    if (u.includes("artlist.io")) {
      if (u.includes("/sfx/") || u.includes("sound-effects")) {
        return { name: "Artlist", type: "sfx", badge: "🎵 Artlist • SFX", cls: "artlist" };
      }
      return { name: "Artlist", type: "music", badge: "🎵 Artlist • Music", cls: "artlist" };
    }
    if (u.includes("envato.com")) {
      if (u.includes("video-template")) {
        return { name: "Envato", type: "video-template", badge: "🎬 Envato • Video Template", cls: "envato" };
      } else if (u.includes("stock-video")) {
        return { name: "Envato", type: "stock-video", badge: "🎥 Envato • Stock Video", cls: "envato" };
      } else if (u.includes("graphic-template")) {
        return { name: "Envato", type: "graphic-template", badge: "🎨 Envato • Graphics", cls: "envato" };
      } else if (u.includes("sound-effect") || u.includes("/sfx")) {
        return { name: "Envato", type: "sfx", badge: "🔊 Envato • SFX", cls: "envato" };
      } else if (u.includes("music") || u.includes("audio")) {
        return { name: "Envato", type: "music", badge: "🎵 Envato • Music", cls: "envato" };
      }
      return { name: "Envato", type: "template", badge: "📦 Envato Elements", cls: "envato" };
    }
    return null;
  }

  function updateUrlBadge() {
    const val = trackUrlInput.value.trim();
    const info = detectProvider(val);
    if (info) {
      urlDetectedBadge.textContent = info.badge;
      urlDetectedBadge.className = `url-detected-badge badge-tag ${info.cls}`;
      urlDetectedBadge.classList.remove("hidden");
    } else {
      urlDetectedBadge.classList.add("hidden");
    }
  }

  trackUrlInput.addEventListener("input", updateUrlBadge);
  trackUrlInput.addEventListener("paste", () => setTimeout(updateUrlBadge, 50));

  // --- Audio Player Controller ----------------------------------------------
  function formatPlayerTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function updatePlayerPlayIcon(isPlaying) {
    if (isPlaying) {
      playerPlayIcon.innerHTML = `<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>`;
    } else {
      playerPlayIcon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"></polygon>`;
    }
    // Update any active row icon
    document.querySelectorAll(".btn-play").forEach(btn => {
      const isThis = btn.dataset.trackId === currentPlayingTrackId;
      btn.classList.toggle("is-playing", isThis && isPlaying);
      if (isThis && isPlaying) {
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
      } else {
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
      }
    });
  }

  function playAudioTrack(track) {
    if (currentPlayingTrackId === track.track_id && currentPlayingVariant === (track.variant || "main")) {
      if (currentAudio.paused) {
        currentAudio.play();
        updatePlayerPlayIcon(true);
      } else {
        currentAudio.pause();
        updatePlayerPlayIcon(false);
      }
      return;
    }

    currentPlayingTrackId = track.track_id;
    currentPlayingVariant = track.variant || "main";
    currentAudio.src = `/api/v1/library/stream/${encodeURIComponent(track.track_id)}?variant=${encodeURIComponent(currentPlayingVariant)}`;
    
    playerTitle.textContent = shortTitle(track.title) || track.filename;
    playerSub.textContent = `${(track.provider || "Artlist").toUpperCase()} • ${(track.variant || "Main").toUpperCase()}`;
    audioPlayerBar.classList.remove("hidden");

    currentAudio.play().then(() => {
      updatePlayerPlayIcon(true);
    }).catch(err => {
      console.error("Playback error:", err);
      showToast("Audio stream unavailable");
    });
  }

  playerPlayBtn.addEventListener("click", () => {
    if (currentAudio.src) {
      if (currentAudio.paused) {
        currentAudio.play();
        updatePlayerPlayIcon(true);
      } else {
        currentAudio.pause();
        updatePlayerPlayIcon(false);
      }
    }
  });

  playerCloseBtn.addEventListener("click", () => {
    currentAudio.pause();
    currentAudio.src = "";
    currentPlayingTrackId = null;
    currentPlayingVariant = null;
    updatePlayerPlayIcon(false);
    audioPlayerBar.classList.add("hidden");
  });

  currentAudio.addEventListener("timeupdate", () => {
    if (!isNaN(currentAudio.duration)) {
      const pct = (currentAudio.currentTime / currentAudio.duration) * 100;
      playerScrubber.value = pct || 0;
      playerCurrentTime.textContent = formatPlayerTime(currentAudio.currentTime);
      playerDuration.textContent = formatPlayerTime(currentAudio.duration);
    }
  });

  currentAudio.addEventListener("ended", () => {
    updatePlayerPlayIcon(false);
    playerScrubber.value = 0;
    playerCurrentTime.textContent = "0:00";
  });

  playerScrubber.addEventListener("input", (e) => {
    if (!isNaN(currentAudio.duration)) {
      const seekTo = (e.target.value / 100) * currentAudio.duration;
      currentAudio.currentTime = seekTo;
    }
  });

  // --- File Actions: Copy, Reveal, Download ---------------------------------
  function copyPath(path) {
    navigator.clipboard
      .writeText(path)
      .then(() => {
        showToast("Local path copied to clipboard!");
      })
      .catch((err) => console.error("Could not copy: ", err));
  }

  async function revealFile(track) {
    try {
      showToast("Opening in File Explorer...");
      await apiFetch(`/api/v1/library/${encodeURIComponent(track.track_id)}/reveal?variant=${encodeURIComponent(track.variant || 'main')}`, {
        method: "POST"
      });
    } catch (err) {
      console.error("Reveal error:", err);
    }
  }

  async function downloadFile(track, btn) {
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Downloading…";
    try {
      const res = await apiFetch(
        `/api/v1/library/file?track_id=${encodeURIComponent(track.track_id)}&variant=${encodeURIComponent(track.variant || 'main')}`
      );
      if (!res.ok) throw new Error("Download failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = track.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) {
      showResult("error", "Could not download that file", track.filename);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  function showResult(kind, heading, detail, pathToCopy) {
    submitResult.className = `result-banner ${kind}`;
    submitResult.textContent = "";

    const strong = document.createElement("strong");
    strong.textContent = heading;
    submitResult.appendChild(strong);

    if (detail) {
      submitResult.appendChild(document.createElement("br"));
      const code = document.createElement("code");
      code.textContent = detail;
      submitResult.appendChild(code);
    }

    if (pathToCopy) {
      submitResult.appendChild(document.createElement("br"));
      const btn = document.createElement("button");
      btn.className = "btn-secondary";
      btn.style.marginTop = "8px";
      btn.textContent = "Copy Path to Clipboard";
      btn.addEventListener("click", () => copyPath(pathToCopy));
      submitResult.appendChild(btn);
    }
  }

  function fmtClock(totalSeconds) {
    if (totalSeconds == null || totalSeconds < 0) return "--:--";
    const m = Math.floor(totalSeconds / 60);
    const sec = Math.floor(totalSeconds % 60);
    return m + ":" + String(sec).padStart(2, "0");
  }

  function renderPhaseTrack(phaseIndex, phaseTotal, failed) {
    if (phaseTrack.childElementCount !== phaseTotal) {
      phaseTrack.textContent = "";
      for (let i = 0; i < phaseTotal; i++) {
        const seg = document.createElement("div");
        seg.className = "phase-seg";
        phaseTrack.appendChild(seg);
      }
    }
    const children = phaseTrack.children;
    for (let i = 0; i < children.length; i++) {
      const seg = children[i];
      seg.className = "phase-seg";
      if (i < phaseIndex) seg.classList.add("done");
      else if (i === phaseIndex) seg.classList.add(failed ? "failed" : "active");
    }
  }

  function renderInFlight(job) {
    if (!job) {
      inFlightContainer.classList.add("hidden");
      clock.elapsed = null;
      clock.timeout = null;
      currentInFlightId = null;
      return;
    }

    currentInFlightId = job.job_id || job.id;
    inFlightContainer.classList.remove("hidden");
    inFlightTitle.textContent = shortTitle(job.extracted_title || job.title) || job.track_id;
    inFlightVariant.textContent = job.variant;
    inFlightPhase.textContent = job.phase_label || job.phase;

    clock.elapsed = job.elapsed_seconds || 0;
    clock.timeout = job.timeout_seconds || 180;
    inFlightElapsed.textContent = fmtClock(clock.elapsed);
    inFlightTimeout.textContent = fmtClock(clock.timeout);

    renderPhaseTrack(job.phase_index || 0, job.phase_total || 11, job.phase === "failed");

    if (job.phase === "downloading" && job.progress_bytes > 0) {
      dlProgress.classList.remove("hidden");
      const pct = job.total_bytes > 0 ? Math.round((job.progress_bytes / job.total_bytes) * 100) : 0;
      dlBar.style.width = pct > 0 ? `${pct}%` : "100%";
      dlPct.textContent = pct > 0 ? `${pct}%` : "";
      dlText.textContent = `${formatBytes(job.progress_bytes)} of ${formatBytes(job.total_bytes)}`;
    } else {
      dlProgress.classList.add("hidden");
    }
  }

  cancelInflightBtn.addEventListener("click", async () => {
    if (!currentInFlightId) return;
    cancelInflightBtn.disabled = true;
    cancelInflightBtn.textContent = "Cancelling…";
    try {
      await apiFetch(`/api/v1/jobs/${encodeURIComponent(currentInFlightId)}/cancel`, { method: "POST" });
      showToast("Job cancelled");
      await fetchQueue();
      await fetchStatus();
    } catch (e) {
      console.error(e);
    } finally {
      cancelInflightBtn.disabled = false;
      cancelInflightBtn.textContent = "Cancel";
    }
  });

  function renderQueued(jobs) {
    if (!jobs || jobs.length === 0) {
      queueList.innerHTML = '<div class="empty">Nothing queued</div>';
      clock.etas.clear();
      return;
    }

    queueList.textContent = "";
    for (const job of jobs) {
      const id = job.job_id || job.id;
      clock.etas.set(id, job.estimated_wait_seconds || 0);

      const row = document.createElement("div");
      row.className = "queue-row";

      const pos = document.createElement("div");
      pos.className = "queue-pos mono";
      pos.textContent = job.queue_position;

      const body = document.createElement("div");
      body.className = "queue-body";
      const title = document.createElement("div");
      title.className = "queue-title";
      title.textContent = shortTitle(job.extracted_title || job.title) || job.track_id;
      const sub = document.createElement("div");
      sub.className = "queue-sub";
      sub.textContent = `${job.variant} · ${job.format} · requested by ${job.requested_by}`;
      body.append(title, sub);

      const meta = document.createElement("div");
      meta.className = "queue-meta";
      const eta = document.createElement("span");
      eta.className = "queue-eta mono";
      eta.dataset.jobId = id;
      eta.textContent = `~${fmtClock(job.estimated_wait_seconds || 0)}`;

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn-icon";
      cancelBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
      cancelBtn.title = "Cancel";
      cancelBtn.addEventListener("click", async () => {
        cancelBtn.disabled = true;
        try {
          await apiFetch(`/api/v1/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
          showToast("Job cancelled");
          await fetchQueue();
        } catch (e) {
          console.error(e);
        }
      });

      meta.append(eta, cancelBtn);
      row.append(pos, body, meta);
      queueList.appendChild(row);
    }
  }

  function renderRecent(jobs) {
    if (!jobs || jobs.length === 0) {
      recentSection.classList.add("hidden");
      recentList.textContent = "";
      return;
    }

    recentSection.classList.remove("hidden");
    recentList.textContent = "";

    for (const job of jobs) {
      const ok = job.status === "done";
      const isInfo = !ok && job.error && /no stems/i.test(job.error);

      const row = document.createElement("div");
      row.className = `recent-row ${ok ? "is-done" : isInfo ? "is-info" : "is-failed"}`;

      const icon = document.createElement("div");
      icon.className = "recent-icon";
      icon.textContent = ok ? "✓" : isInfo ? "ℹ" : "✕";

      const body = document.createElement("div");
      body.className = "recent-body";

      const title = document.createElement("div");
      title.className = "recent-title";
      title.textContent = shortTitle(job.title || job.filename) || job.track_id;

      const sub = document.createElement("div");
      sub.className = "recent-sub";
      const bits = [job.variant];
      if (job.bytes) bits.push(formatBytes(job.bytes));
      if (job.completed_at) bits.push(relativeTime(job.completed_at));
      sub.textContent = bits.join(" · ");
      body.append(title, sub);

      if (!ok && job.error) {
        const parts = splitError(job.error);
        const e = document.createElement("div");
        e.className = "rerr";
        e.textContent = parts.summary;
        body.appendChild(e);
      }

      row.append(icon, body);
      recentList.appendChild(row);
    }
  }

  async function fetchQueue() {
    try {
      const res = await apiFetch("/api/v1/queue");
      if (!res.ok) return;
      const data = await res.json();

      renderInFlight(data.in_flight);
      renderQueued(data.queued || []);
      renderRecent(data.recent || []);

      clock.cooldown = data.cooldown_remaining_seconds || 0;
      if (clock.cooldown > 0 && !data.in_flight) {
        cooldownBanner.classList.remove("hidden");
        cooldownSeconds.textContent = clock.cooldown;
      } else {
        cooldownBanner.classList.add("hidden");
      }
    } catch (err) {}
  }

  function tickClocks() {
    if (clock.elapsed != null) {
      clock.elapsed += 1;
      inFlightElapsed.textContent = fmtClock(clock.elapsed);
    }

    if (clock.cooldown > 0) {
      clock.cooldown -= 1;
      cooldownSeconds.textContent = Math.max(0, clock.cooldown);
      if (clock.cooldown <= 0) cooldownBanner.classList.add("hidden");
    }

    for (const el of queueList.querySelectorAll(".queue-eta")) {
      const id = el.dataset.jobId;
      const remaining = Math.max(0, (clock.etas.get(id) || 0) - 1);
      clock.etas.set(id, remaining);
      el.textContent = `~${fmtClock(remaining)}`;
    }
  }

  clearRecentBtn.addEventListener("click", async () => {
    clearRecentBtn.disabled = true;
    try {
      await apiFetch("/api/v1/history/clear", { method: "POST" });
      await fetchQueue();
    } finally {
      clearRecentBtn.disabled = false;
    }
  });

  resumeBtn.addEventListener("click", async () => {
    resumeBtn.disabled = true;
    try {
      await apiFetch("/api/v1/resume", { method: "POST" });
      await Promise.all([fetchStatus(), fetchQueue()]);
    } finally {
      resumeBtn.disabled = false;
    }
  });

  // --- Fetch & Render Status ------------------------------------------------
  async function fetchStatus() {
    try {
      const res = await apiFetch("/api/v1/status");
      if (!res.ok) throw new Error("Status failed");
      const data = await res.json();

      quotaText.textContent = data.daily_usage;
      const pct = Math.min(100, Math.round((data.daily_downloads / data.daily_limit) * 100));
      quotaBar.style.width = `${pct}%`;

      if (data.chrome_download_dir && data.download_dir_ok === false) {
        dldirBanner.classList.remove("hidden");
        dldirDetail.textContent = `Chrome saves to ${data.chrome_download_dir} but Setu requires ${data.staging_path}.`;
      } else {
        dldirBanner.classList.add("hidden");
      }

      if (libraryTotal) {
        libraryTotal.textContent = `${data.library_count || 0} assets · ${formatBytes(data.library_bytes || 0)}`;
      }

      cacheHitsVal.textContent = data.today_cache_hits;
      diskFreeVal.textContent = `${data.disk_free_gb} GB`;
      queueDepthVal.textContent = data.queue_depth;

      if (data.queue_paused) {
        serverStatus.className = "pill danger";
        serverStatus.querySelector(".text").textContent = `Paused (${data.consecutive_failures} fails)`;
        pausedBanner.classList.remove("hidden");
        pausedReason.textContent = `${data.consecutive_failures} consecutive failures. Fix cause and resume.`;
      } else if (!data.storage_ok) {
        pausedBanner.classList.add("hidden");
        serverStatus.className = "pill danger";
        serverStatus.querySelector(".text").textContent = "Low disk space";
      } else {
        serverStatus.className = "pill online";
        serverStatus.querySelector(".text").textContent = "Setu Bridge Active";
        pausedBanner.classList.add("hidden");
      }

      const workerLabel = data.worker_type === "os_agent" ? "OS Agent" : "Extension";
      if (data.heartbeat_stale) {
        sessionStatus.className = "pill warning";
        sessionStatus.querySelector(".text").textContent = `${workerLabel}: Offline`;
      } else if (data.session_authenticated) {
        sessionStatus.className = "pill online";
        sessionStatus.querySelector(".text").textContent = `${workerLabel}: Ready`;
      } else {
        sessionStatus.className = "pill warning";
        sessionStatus.querySelector(".text").textContent = "Auth Required";
      }

    } catch (err) {
      serverStatus.className = "pill danger";
      serverStatus.querySelector(".text").textContent = "Server Offline";
    }
  }

  // --- Fetch & Render Library -----------------------------------------------
  async function fetchLibrary(query = "", category = currentCategory) {
    try {
      const res = await apiFetch(`/api/v1/library?q=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}`);
      const tracks = await res.json();

      libraryCount.textContent = `${tracks.length} assets`;
      libraryTbody.textContent = "";

      if (tracks.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 6;
        td.className = "empty-table";
        td.textContent = query
          ? "No matching assets found."
          : "No assets in Sangraha library yet. Queue your first item above!";
        tr.appendChild(td);
        libraryTbody.appendChild(tr);
        return;
      }

      for (const t of tracks) {
        const tr = document.createElement("tr");

        // 1. Play button / Stream trigger (if audio streamable)
        const playTd = document.createElement("td");
        if (t.streamable) {
          const playBtn = document.createElement("button");
          playBtn.type = "button";
          playBtn.className = "btn-icon btn-play";
          playBtn.dataset.trackId = t.track_id;
          playBtn.title = "Play / Preview Audio";
          const isThisPlaying = currentPlayingTrackId === t.track_id && !currentAudio.paused;
          playBtn.classList.toggle("is-playing", isThisPlaying);
          playBtn.innerHTML = isThisPlaying
            ? `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`
            : `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
          playBtn.addEventListener("click", () => playAudioTrack(t));
          playTd.appendChild(playBtn);
        } else {
          const icon = document.createElement("span");
          icon.style.cssText = "font-size:16px; opacity:0.6;";
          icon.textContent = t.is_archive ? "📦" : "🎬";
          playTd.appendChild(icon);
        }

        // 2. Name & Details
        const nameTd = document.createElement("td");
        const strong = t.url ? document.createElement("a") : document.createElement("strong");
        strong.className = "track-name";
        strong.textContent = shortTitle(t.title) || t.filename;
        if (t.url) {
          strong.href = t.url;
          strong.target = "_blank";
          strong.rel = "noreferrer";
          strong.title = "Open source link";
        }
        const sub = document.createElement("div");
        sub.style.cssText = "font-size: 11px; color: var(--ink-3); margin-top:2px;";
        const when = relativeTime(t.downloaded_at);
        sub.textContent = when ? `${t.filename} · ${when}` : t.filename;
        nameTd.append(strong, sub);

        // 3. Provider & Category Badges
        const sourceTd = document.createElement("td");
        const providerName = (t.provider || "artlist").toLowerCase();
        const categoryName = (t.category || "music").toLowerCase();
        
        const provBadge = document.createElement("span");
        provBadge.className = `badge-tag ${providerName}`;
        provBadge.textContent = providerName;

        const catBadge = document.createElement("span");
        catBadge.className = `badge-tag ${categoryName}`;
        catBadge.style.marginLeft = "6px";
        catBadge.textContent = categoryName;

        sourceTd.append(provBadge, catBadge);

        // 4. File Size & Container Kind
        const sizeTd = document.createElement("td");
        const sizeWrap = document.createElement("div");
        sizeWrap.className = "size-cell";
        const sizeVal = document.createElement("span");
        sizeVal.textContent = formatBytes(t.bytes);
        const kind = fileKind(t.filename);
        const kindTag = document.createElement("span");
        kindTag.className = `kind-tag ${kind.cls}`;
        kindTag.textContent = kind.label;
        sizeWrap.append(sizeVal, kindTag);
        sizeTd.appendChild(sizeWrap);

        // 5. Reuse Count
        const hitsTd = document.createElement("td");
        const hits = document.createElement("strong");
        hits.textContent = t.hit_count;
        hitsTd.appendChild(hits);

        // 6. Action Buttons: Copy Path, Reveal in Explorer, Download
        const actionTd = document.createElement("td");
        const actions = document.createElement("div");
        actions.className = "row-actions";

        // Copy Path Button (For Premiere Pro / DaVinci Resolve)
        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "btn-icon";
        copyBtn.title = "Copy local path for Premiere Pro / DaVinci Resolve";
        copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        copyBtn.addEventListener("click", () => copyPath(t.library_path));

        // Reveal in File Explorer Button
        const revealBtn = document.createElement("button");
        revealBtn.type = "button";
        revealBtn.className = "btn-icon";
        revealBtn.title = "Highlight in Windows File Explorer";
        revealBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
        revealBtn.addEventListener("click", () => revealFile(t));

        // Download to Browser Button
        const dlBtn = document.createElement("button");
        dlBtn.type = "button";
        dlBtn.className = "btn-icon";
        dlBtn.title = "Download copy to browser";
        dlBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
        dlBtn.addEventListener("click", () => downloadFile(t, dlBtn));

        actions.append(copyBtn, revealBtn, dlBtn);
        actionTd.appendChild(actions);

        tr.append(playTd, nameTd, sourceTd, sizeTd, hitsTd, actionTd);
        libraryTbody.appendChild(tr);
      }
    } catch (err) {
      console.error("Library fetch failed: ", err);
    }
  }

  // --- Category Filter Tabs -------------------------------------------------
  if (categoryFilterBar) {
    categoryFilterBar.querySelectorAll(".cat-pill").forEach(btn => {
      btn.addEventListener("click", () => {
        categoryFilterBar.querySelectorAll(".cat-pill").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentCategory = btn.dataset.cat;
        fetchLibrary(searchInput.value.trim(), currentCategory);
      });
    });
  }

  // Search input listener
  searchInput.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    const value = e.target.value.trim();
    searchTimeout = setTimeout(() => fetchLibrary(value, currentCategory), 250);
  });

  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    fetchLibrary("", currentCategory);
  });

  // --- Submit New Asset Job -------------------------------------------------
  submitForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = trackUrlInput.value.trim();
    if (!url) return;

    submitBtn.disabled = true;
    submitBtn.querySelector(".btn-text").textContent = "Bridging…";
    submitResult.className = "result-banner hidden";

    try {
      const res = await apiFetch("/api/v1/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url,
          variant: trackVariantSelect.value,
          format: audioFormatSelect.value,
          requested_by: "studio_editor",
        }),
      });

      const data = await res.json();

      if (res.status === 200 && data.status === "cached") {
        showResult("cached", "Already in Sangraha Library", data.filename, data.library_path);
        trackUrlInput.value = "";
        updateUrlBadge();
        fetchLibrary("", currentCategory);
        fetchStatus();
      } else if (res.status === 201) {
        showResult(
          "success",
          `Queued to Setu — position ${data.queue_position}`,
          `Estimated ~${Math.round(data.estimated_wait_seconds / 60) || 1} min · Provider: ${(data.provider || "Stock").toUpperCase()}`
        );
        trackUrlInput.value = "";
        updateUrlBadge();
        fetchStatus();
        fetchQueue();
      } else {
        showResult("error", data.detail || data.error || "Submission failed");
      }
    } catch (err) {
      showResult("error", "Network error: could not connect to Setu server.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.querySelector(".btn-text").textContent = "Bridge to Library";
    }
  });

  refreshBtn.addEventListener("click", () => {
    fetchStatus();
    fetchQueue();
    fetchLibrary(searchInput.value.trim(), currentCategory);
  });

  // --- Appearance / Theme ---------------------------------------------------
  const themeButtons = Array.from(document.querySelectorAll("[data-theme-choice]"));

  function currentThemeChoice() {
    try {
      const saved = localStorage.getItem("relay-theme");
      return saved === "light" || saved === "dark" ? saved : "dark";
    } catch (e) {
      return "dark";
    }
  }

  function applyTheme(choice) {
    if (choice === "auto") {
      document.documentElement.removeAttribute("data-theme");
      try { localStorage.removeItem("relay-theme"); } catch (e) {}
    } else {
      document.documentElement.setAttribute("data-theme", choice);
      try { localStorage.setItem("relay-theme", choice); } catch (e) {}
    }
    themeButtons.forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.themeChoice === choice));
    });
  }

  themeButtons.forEach((btn) => {
    btn.addEventListener("click", () => applyTheme(btn.dataset.themeChoice));
  });
  applyTheme(currentThemeChoice());

  // Initialization
  fetchStatus();
  fetchQueue();
  fetchLibrary();
  setInterval(fetchStatus, 3000);
  setInterval(fetchQueue, 2000);
  setInterval(tickClocks, 1000);
});
