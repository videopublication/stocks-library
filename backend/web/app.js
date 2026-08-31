// Setu (सेतु) Creative Asset Bridge — Studio Application Engine
document.addEventListener("DOMContentLoaded", () => {
  // Navigation & Telemetry
  const serverStatus = document.getElementById("server-status");
  const sessionStatus = document.getElementById("session-status");
  const quotaText = document.getElementById("quota-text");
  const quotaPercent = document.getElementById("quota-percent");
  const quotaBar = document.getElementById("quota-bar");
  const cacheHitsVal = document.getElementById("cache-hits-val");
  const diskFreeVal = document.getElementById("disk-free-val");
  const queueDepthVal = document.getElementById("queue-depth-val");
  const todayDownloadsVal = document.getElementById("today-downloads-val");
  const libraryTotalCount = document.getElementById("library-total-count");

  // Queue Form
  const submitForm = document.getElementById("submit-form");
  const trackUrlInput = document.getElementById("track-url");
  const urlDetectedBadge = document.getElementById("url-detected-badge");
  const urlClearBtn = document.getElementById("url-clear-btn");
  const trackVariantSelect = document.getElementById("track-variant");
  const audioFormatSelect = document.getElementById("audio-format");
  const audioFormatGroup = document.getElementById("audio-format-group");
  const submitBtn = document.getElementById("submit-btn");
  const submitResult = document.getElementById("submit-result");
  const quickChips = document.querySelectorAll(".chip-hint");

  // In-Flight Automation Activity
  const refreshBtn = document.getElementById("refresh-btn");
  const cooldownBanner = document.getElementById("cooldown-banner");
  const cooldownSeconds = document.getElementById("cooldown-seconds");
  const inFlightContainer = document.getElementById("in-flight-container");
  const inFlightTitle = document.getElementById("in-flight-title");
  const inFlightVariant = document.getElementById("in-flight-variant");
  const inFlightElapsed = document.getElementById("in-flight-elapsed");
  const inFlightTimeout = document.getElementById("in-flight-timeout");
  const inFlightPhase = document.getElementById("in-flight-phase");
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

  // Notices
  const pausedBanner = document.getElementById("paused-banner");
  const pausedReason = document.getElementById("paused-reason");
  const resumeBtn = document.getElementById("resume-btn");
  const dldirBanner = document.getElementById("dldir-banner");
  const dldirDetail = document.getElementById("dldir-detail");

  // Sangraha Library
  const libraryCount = document.getElementById("library-count");
  const librarySearchInput = document.getElementById("library-search-input");
  const clearSearchBtn = document.getElementById("clear-search-btn");
  const categoryFilterBar = document.getElementById("category-filter-bar");
  const libraryTbody = document.getElementById("library-tbody");

  // Audio Player
  const audioPlayerBar = document.getElementById("audio-player-bar");
  const playerPlayBtn = document.getElementById("player-play-btn");
  const playerPlayIcon = document.getElementById("player-play-icon");
  const playerTitle = document.getElementById("player-title");
  const playerSub = document.getElementById("player-sub");
  const playerCurrentTime = document.getElementById("player-current-time");
  const playerScrubber = document.getElementById("player-scrubber");
  const playerDuration = document.getElementById("player-duration");
  const playerVolume = document.getElementById("player-volume");
  const playerCloseBtn = document.getElementById("player-close-btn");
  const toastBox = document.getElementById("toast-box");

  // Internal State
  let currentAudio = new Audio();
  let currentPlayingTrackId = null;
  let currentPlayingVariant = null;
  let currentCategory = "all";
  let currentInFlightId = null;
  let searchTimeout = null;
  let clock = { elapsed: null, timeout: null, cooldown: 0, etas: new Map() };

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

  function relativeTime(iso) {
    if (!iso) return "";
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "";
    const diff = Math.floor((Date.now() - then) / 1000);
    if (diff < 45) return "just now";
    if (diff < 90) return "1 min ago";
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 7200) return "1 hour ago";
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    const days = Math.floor(diff / 86400);
    return days === 1 ? "yesterday" : `${days}d ago`;
  }

  function showToast(msg) {
    if (!toastBox) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--copper-primary)" stroke-width="2.5">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
      <span>${msg}</span>
    `;
    toastBox.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
      toast.style.transition = "all 0.2s ease";
      setTimeout(() => toast.remove(), 200);
    }, 2500);
  }

  // --- Dynamic URL Provider Detector ---------------------------------------
  function detectProvider(url) {
    if (!url) return null;
    const u = url.trim().toLowerCase();
    if (u.includes("artlist.io")) {
      if (u.includes("/sfx/") || u.includes("sound-effects")) {
        return { name: "Artlist", type: "sfx", badge: "🎵 Artlist • SFX", cls: "artlist", isAudio: true };
      }
      return { name: "Artlist", type: "music", badge: "🎵 Artlist • Music", cls: "artlist", isAudio: true };
    }
    if (u.includes("envato.com")) {
      if (u.includes("video-template")) {
        return { name: "Envato", type: "video-template", badge: "🎬 Envato • Video Template", cls: "envato", isAudio: false };
      } else if (u.includes("stock-video")) {
        return { name: "Envato", type: "stock-video", badge: "🎥 Envato • Stock Video", cls: "envato", isAudio: false };
      } else if (u.includes("graphic-template")) {
        return { name: "Envato", type: "graphic-template", badge: "🎨 Envato • Graphics", cls: "envato", isAudio: false };
      } else if (u.includes("sound-effect") || u.includes("/sfx")) {
        return { name: "Envato", type: "sfx", badge: "🔊 Envato • SFX", cls: "envato", isAudio: true };
      } else if (u.includes("music") || u.includes("audio")) {
        return { name: "Envato", type: "music", badge: "🎵 Envato • Music", cls: "envato", isAudio: true };
      }
      return { name: "Envato", type: "template", badge: "📦 Envato Elements", cls: "envato", isAudio: false };
    }
    return null;
  }

  function updateUrlInputState() {
    const val = trackUrlInput.value.trim();
    if (val) {
      urlClearBtn.classList.remove("hidden");
    } else {
      urlClearBtn.classList.add("hidden");
    }

    const info = detectProvider(val);
    if (info) {
      urlDetectedBadge.textContent = info.badge;
      urlDetectedBadge.className = `url-detected-badge badge-tag ${info.cls}`;
      urlDetectedBadge.classList.remove("hidden");
      
      // Adapt audio format dropdown
      if (!info.isAudio) {
        if (audioFormatGroup) audioFormatGroup.style.display = "none";
        trackVariantSelect.innerHTML = `<option value="main">Main Asset Package (ZIP)</option>`;
      } else {
        if (audioFormatGroup) audioFormatGroup.style.display = "block";
        if (info.type === "music") {
          trackVariantSelect.innerHTML = `
            <option value="main">Main track</option>
            <option value="stems">Multi-Track Stems (ZIP)</option>
          `;
        } else {
          trackVariantSelect.innerHTML = `<option value="main">Main track</option>`;
        }
      }
    } else {
      urlDetectedBadge.classList.add("hidden");
      if (audioFormatGroup) audioFormatGroup.style.display = "block";
      trackVariantSelect.innerHTML = `
        <option value="main">Main track / Asset</option>
        <option value="stems">Stems (ZIP)</option>
      `;
    }
  }

  trackUrlInput.addEventListener("input", updateUrlInputState);
  trackUrlInput.addEventListener("paste", () => setTimeout(updateUrlInputState, 50));
  urlClearBtn.addEventListener("click", () => {
    trackUrlInput.value = "";
    updateUrlInputState();
    trackUrlInput.focus();
  });

  // Quick preset chips
  quickChips.forEach(chip => {
    chip.addEventListener("click", () => {
      const type = chip.dataset.type;
      if (type === "artlist") {
        trackUrlInput.value = "https://artlist.io/royalty-free-music/song/";
      } else if (type === "envato-templates") {
        trackUrlInput.value = "https://elements.envato.com/video-templates/";
      } else if (type === "envato-sfx") {
        trackUrlInput.value = "https://elements.envato.com/audio/sound-effects/";
      }
      updateUrlInputState();
      trackUrlInput.focus();
    });
  });

  // Global keyboard shortcut ('/' to search)
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== trackUrlInput && document.activeElement !== librarySearchInput) {
      e.preventDefault();
      librarySearchInput.focus();
    }
  });

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

    document.querySelectorAll(".btn-play-trigger").forEach(btn => {
      const isThis = btn.dataset.trackId === currentPlayingTrackId;
      btn.classList.toggle("is-playing", isThis && isPlaying);
      if (isThis && isPlaying) {
        btn.innerHTML = `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
      } else {
        btn.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
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

  if (playerVolume) {
    playerVolume.addEventListener("input", (e) => {
      currentAudio.volume = e.target.value / 100;
    });
  }

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
    const originalSvg = btn.innerHTML;
    btn.disabled = true;
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
      showToast("Download started");
    } catch (err) {
      showToast("Download failed");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalSvg;
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
      code.style.cssText = "font-size:11px; opacity:0.85; word-break:break-all;";
      submitResult.appendChild(code);
    }

    if (pathToCopy) {
      submitResult.appendChild(document.createElement("br"));
      const btn = document.createElement("button");
      btn.className = "btn-tool";
      btn.style.marginTop = "8px";
      btn.textContent = "📋 Copy Local Path";
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
    inFlightVariant.textContent = (job.variant || "MAIN").toUpperCase();
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
      queueList.innerHTML = '<div class="empty-state">No items currently queued</div>';
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
      pos.textContent = `#${job.queue_position}`;

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
      cancelBtn.className = "btn-icon-action";
      cancelBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
      cancelBtn.title = "Cancel Queue Item";
      cancelBtn.addEventListener("click", async () => {
        cancelBtn.disabled = true;
        try {
          await apiFetch(`/api/v1/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
          showToast("Item removed from queue");
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
      showToast("History cleared");
    } finally {
      clearRecentBtn.disabled = false;
    }
  });

  resumeBtn.addEventListener("click", async () => {
    resumeBtn.disabled = true;
    try {
      await apiFetch("/api/v1/resume", { method: "POST" });
      await Promise.all([fetchStatus(), fetchQueue()]);
      showToast("Queue resumed");
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
      if (quotaPercent) quotaPercent.textContent = `${pct}%`;

      if (todayDownloadsVal) todayDownloadsVal.textContent = data.daily_downloads;
      if (libraryTotalCount) libraryTotalCount.textContent = data.library_count || 0;

      if (data.chrome_download_dir && data.download_dir_ok === false) {
        dldirBanner.classList.remove("hidden");
        dldirDetail.textContent = `Chrome is saving to ${data.chrome_download_dir}, but Setu watches ${data.staging_path}.`;
      } else {
        dldirBanner.classList.add("hidden");
      }

      cacheHitsVal.textContent = data.today_cache_hits;
      diskFreeVal.textContent = `${data.disk_free_gb} GB`;
      queueDepthVal.textContent = data.queue_depth;

      if (data.queue_paused) {
        serverStatus.className = "pill-node danger";
        serverStatus.querySelector(".pill-label").textContent = `Paused (${data.consecutive_failures} fails)`;
        pausedBanner.classList.remove("hidden");
        pausedReason.textContent = `${data.consecutive_failures} consecutive failures detected. Fix the issue and resume.`;
      } else if (!data.storage_ok) {
        pausedBanner.classList.add("hidden");
        serverStatus.className = "pill-node danger";
        serverStatus.querySelector(".pill-label").textContent = "Low Disk Space";
      } else {
        serverStatus.className = "pill-node online";
        serverStatus.querySelector(".pill-label").textContent = "Bridge Active";
        pausedBanner.classList.add("hidden");
      }

      const workerLabel = data.worker_type === "os_agent" ? "OS Agent" : "Extension";
      if (data.heartbeat_stale) {
        sessionStatus.className = "pill-node warning";
        sessionStatus.querySelector(".pill-label").textContent = `${workerLabel}: Offline`;
      } else if (data.session_authenticated) {
        sessionStatus.className = "pill-node online";
        sessionStatus.querySelector(".pill-label").textContent = `${workerLabel}: Ready`;
      } else {
        sessionStatus.className = "pill-node warning";
        sessionStatus.querySelector(".pill-label").textContent = "Auth Required";
      }

    } catch (err) {
      serverStatus.className = "pill-node danger";
      serverStatus.querySelector(".pill-label").textContent = "Server Offline";
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
        td.className = "table-empty-row";
        td.innerHTML = `
          <div class="table-empty-state">
            <p>${query ? 'No matching assets found in Sangraha.' : 'No assets in this category yet. Bridge your first item on the left!'}</p>
          </div>
        `;
        tr.appendChild(td);
        libraryTbody.appendChild(tr);
        return;
      }

      for (const t of tracks) {
        const tr = document.createElement("tr");

        // 1. Play Trigger Button
        const playTd = document.createElement("td");
        playTd.className = "th-play";
        if (t.streamable) {
          const playBtn = document.createElement("button");
          playBtn.type = "button";
          playBtn.className = "btn-play-trigger";
          playBtn.dataset.trackId = t.track_id;
          playBtn.title = "Play audio stream";
          const isThisPlaying = currentPlayingTrackId === t.track_id && !currentAudio.paused;
          playBtn.classList.toggle("is-playing", isThisPlaying);
          playBtn.innerHTML = isThisPlaying
            ? `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`
            : `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
          playBtn.addEventListener("click", () => playAudioTrack(t));
          playTd.appendChild(playBtn);
        } else {
          const icon = document.createElement("span");
          icon.style.cssText = "font-size:18px; opacity:0.75; display:inline-block; margin-left:6px;";
          icon.textContent = t.is_archive ? "📦" : "🎬";
          playTd.appendChild(icon);
        }

        // 2. Asset Name & Source Link
        const nameTd = document.createElement("td");
        nameTd.className = "th-asset";
        const strong = t.url ? document.createElement("a") : document.createElement("strong");
        strong.className = "track-link";
        strong.textContent = shortTitle(t.title) || t.filename;
        if (t.url) {
          strong.href = t.url;
          strong.target = "_blank";
          strong.rel = "noreferrer";
          strong.title = "Open original stock link";
        }
        const sub = document.createElement("div");
        sub.className = "track-filename-sub";
        const when = relativeTime(t.downloaded_at);
        sub.textContent = when ? `${t.filename} · ${when}` : t.filename;
        nameTd.append(strong, sub);

        // 3. Platform & Category Badges
        const sourceTd = document.createElement("td");
        sourceTd.className = "th-source";
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

        // 4. Size & Extension
        const sizeTd = document.createElement("td");
        sizeTd.className = "th-size mono";
        sizeTd.textContent = formatBytes(t.bytes);

        // 5. Reuse Count
        const hitsTd = document.createElement("td");
        hitsTd.className = "th-reused mono";
        hitsTd.textContent = t.hit_count;

        // 6. Action Toolbar
        const actionTd = document.createElement("td");
        actionTd.className = "th-actions";
        const actionsGroup = document.createElement("div");
        actionsGroup.className = "row-actions-group";

        // Copy Path Button (For Premiere Pro / Resolve)
        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "btn-icon-action";
        copyBtn.title = "Copy local filepath for Premiere / DaVinci Resolve";
        copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        copyBtn.addEventListener("click", () => copyPath(t.library_path));

        // Reveal in File Explorer Button
        const revealBtn = document.createElement("button");
        revealBtn.type = "button";
        revealBtn.className = "btn-icon-action";
        revealBtn.title = "Highlight in Windows File Explorer";
        revealBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
        revealBtn.addEventListener("click", () => revealFile(t));

        // Download Copy Button
        const dlBtn = document.createElement("button");
        dlBtn.type = "button";
        dlBtn.className = "btn-icon-action";
        dlBtn.title = "Download copy to browser";
        dlBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
        dlBtn.addEventListener("click", () => downloadFile(t, dlBtn));

        actionsGroup.append(copyBtn, revealBtn, dlBtn);
        actionTd.appendChild(actionsGroup);

        tr.append(playTd, nameTd, sourceTd, sizeTd, hitsTd, actionTd);
        libraryTbody.appendChild(tr);
      }
    } catch (err) {
      console.error("Library fetch failed: ", err);
    }
  }

  // --- Category Filter Tabs -------------------------------------------------
  if (categoryFilterBar) {
    categoryFilterBar.querySelectorAll(".cat-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        categoryFilterBar.querySelectorAll(".cat-tab").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentCategory = btn.dataset.cat;
        fetchLibrary(librarySearchInput.value.trim(), currentCategory);
      });
    });
  }

  // Search input listener
  librarySearchInput.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    const value = e.target.value.trim();
    if (value) {
      clearSearchBtn.style.display = "block";
    } else {
      clearSearchBtn.style.display = "none";
    }
    searchTimeout = setTimeout(() => fetchLibrary(value, currentCategory), 200);
  });

  clearSearchBtn.addEventListener("click", () => {
    librarySearchInput.value = "";
    clearSearchBtn.style.display = "none";
    fetchLibrary("", currentCategory);
  });

  // --- Submit New Asset Job -------------------------------------------------
  submitForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = trackUrlInput.value.trim();
    if (!url) return;

    submitBtn.disabled = true;
    submitBtn.querySelector(".btn-text").textContent = "Bridging...";
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
        showResult("cached", "⚡ Instant Cache Hit — Already in Sangraha!", data.filename, data.library_path);
        trackUrlInput.value = "";
        updateUrlInputState();
        fetchLibrary("", currentCategory);
        fetchStatus();
      } else if (res.status === 201) {
        showResult(
          "success",
          `Queued to Setu — Queue Position #${data.queue_position}`,
          `Estimated ~${Math.round(data.estimated_wait_seconds / 60) || 1} min · Provider: ${(data.provider || "Stock").toUpperCase()}`
        );
        trackUrlInput.value = "";
        updateUrlInputState();
        fetchStatus();
        fetchQueue();
      } else {
        showResult("error", data.detail || data.error || "Submission failed");
      }
    } catch (err) {
      showResult("error", "Network error: unable to reach Setu local server.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.querySelector(".btn-text").textContent = "Bridge to Library";
    }
  });

  refreshBtn.addEventListener("click", () => {
    fetchStatus();
    fetchQueue();
    fetchLibrary(librarySearchInput.value.trim(), currentCategory);
    showToast("Telemetry refreshed");
  });

  // --- Theme Controller -----------------------------------------------------
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
    document.documentElement.setAttribute("data-theme", choice);
    try { localStorage.setItem("relay-theme", choice); } catch (e) {}
    themeButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.themeChoice === choice);
      btn.setAttribute("aria-pressed", String(btn.dataset.themeChoice === choice));
    });
  }

  themeButtons.forEach((btn) => {
    btn.addEventListener("click", () => applyTheme(btn.dataset.themeChoice));
  });
  applyTheme(currentThemeChoice());

  // Initialization & Periodic Polling
  updateUrlInputState();
  fetchStatus();
  fetchQueue();
  fetchLibrary();
  setInterval(fetchStatus, 3000);
  setInterval(fetchQueue, 2000);
  setInterval(tickClocks, 1000);
});
