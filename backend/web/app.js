// Setu (सेतु) Studio Creative Asset Bridge Engine
document.addEventListener("DOMContentLoaded", () => {
  // Navigation & Telemetry
  const serverStatus = document.getElementById("server-status");
  const sessionStatus = document.getElementById("session-status");
  const quotaText = document.getElementById("quota-text");
  const quotaPercent = document.getElementById("quota-percent");
  const quotaBar = document.getElementById("quota-bar");
  const cacheHitsVal = document.getElementById("cache-hits-val");
  const diskFreeVal = document.getElementById("disk-free-val");
  const queueDepthBadge = document.getElementById("queue-depth-badge");
  const todayDownloadsVal = document.getElementById("today-downloads-val");
  const libraryTotalCount = document.getElementById("library-total-count");

  // Queue Form
  const submitForm = document.getElementById("command-form");
  const commandBar = submitForm;
  const commandInput = document.getElementById("command-input");
  const commandOptions = document.getElementById("command-options");
  const commandIcon = document.getElementById("command-icon");
  const commandKbd = document.getElementById("command-kbd");
  const urlDetectedBadge = document.getElementById("url-detected-badge");
  const urlClearBtn = document.getElementById("command-clear-btn");
  const resolutionStrip = document.getElementById("resolution-strip");
  const resolutionTitle = document.getElementById("resolution-title");
  const resolutionDetail = document.getElementById("resolution-detail");
  const resolutionActions = document.getElementById("resolution-actions");
  const filterEcho = document.getElementById("filter-echo");
  // The two verbs share one field, so both aliases point at the same element.
  const trackUrlInput = commandInput;
  const librarySearchInput = commandInput;
  const trackVariantSelect = document.getElementById("track-variant");
  const audioFormatSelect = document.getElementById("audio-format");
  const audioFormatGroup = document.getElementById("audio-format-group");
  const submitBtn = document.getElementById("submit-btn");
  const submitResult = document.getElementById("submit-result");
  const refreshBtn = document.getElementById("refresh-btn");

  // In-Flight Automation
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
  const SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.6-3.6"></path></svg>';
  const LINK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>';
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
  const categoryFilterBar = document.getElementById("category-filter-bar");
  const libraryTbody = document.getElementById("library-tbody");

  // Audio Player Elements
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

  // State
  let currentAudio = new Audio();
  currentAudio.preload = "metadata";

  function isAudioCategory(category) {
    return ["music", "sfx", "sound-effects", "audio"].includes(
      String(category || "music").toLowerCase()
    );
  }
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

  function escapeHtml(value) {
    const d = document.createElement("div");
    d.textContent = String(value == null ? "" : value);
    return d.innerHTML;
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
    if (diff < 90) return "1m ago";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 7200) return "1h ago";
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    const days = Math.floor(diff / 86400);
    return days === 1 ? "yesterday" : `${days}d ago`;
  }

  function showToast(msg) {
    if (!toastBox) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent-copper)" stroke-width="2.5">
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
    }, 2400);
  }

  // --- Dynamic URL Provider Detector ---------------------------------------
  function detectProvider(url) {
    if (!url) return null;
    const u = url.trim().toLowerCase();
    if (u.includes("artlist.io")) {
      if (u.includes("/sfx/") || u.includes("sound-effects")) {
        return { name: "Artlist", type: "sfx", badge: "Artlist • SFX", cls: "artlist", isAudio: true };
      }
      return { name: "Artlist", type: "music", badge: "Artlist • Music", cls: "artlist", isAudio: true };
    }
    if (u.includes("envato.com")) {
      if (u.includes("video-template")) {
        return { name: "Envato", type: "video-template", badge: "Envato • Video Template", cls: "envato", isAudio: false };
      } else if (u.includes("stock-video")) {
        return { name: "Envato", type: "stock-video", badge: "Envato • Stock Video", cls: "envato", isAudio: false };
      } else if (u.includes("graphic-template")) {
        return { name: "Envato", type: "graphic-template", badge: "Envato • Graphics", cls: "envato", isAudio: false };
      } else if (u.includes("sound-effect") || u.includes("/sfx")) {
        return { name: "Envato", type: "sfx", badge: "Envato • SFX", cls: "envato", isAudio: true };
      } else if (u.includes("music") || u.includes("audio")) {
        return { name: "Envato", type: "music", badge: "Envato • Music", cls: "envato", isAudio: true };
      }
      return { name: "Envato", type: "template", badge: "Envato Elements", cls: "envato", isAudio: false };
    }
    return null;
  }

  // --- Unified Command Controller -------------------------------------------
  // One field, two verbs. A recognised link means "bridge this"; anything else
  // means "search the archive". The app decides, so the editor never has to.
  let commandMode = "search";
  let lookupTimer = null;
  let lookupSeq = 0;
  let lastResolution = null;

  function looksLikeUrl(value) {
    if (!value) return false;
    if (/^https?:\/\//i.test(value)) return true;
    return /(^|\.)(artlist\.io|elements\.envato\.com|envato\.com)\//i.test(value);
  }

  function setResolution(state, title, detail, actions) {
    resolutionStrip.className = `resolution-strip is-${state}`;
    resolutionTitle.textContent = title;
    resolutionDetail.textContent = detail || "";
    resolutionActions.textContent = "";
    (actions || []).forEach(a => resolutionActions.appendChild(a));
  }

  function hideResolution() {
    lastResolution = null;
    resolutionStrip.className = "resolution-strip hidden";
    resolutionActions.textContent = "";
  }

  function ghostButton(label, iconPath, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn-ghost";
    if (iconPath) {
      b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg>`;
    }
    b.appendChild(document.createTextNode(label));
    b.addEventListener("click", onClick);
    return b;
  }

  // Variant and quality options depend on what kind of asset the link is, so
  // they are rebuilt rather than offering choices the provider cannot honour.
  function applyProviderOptions(info) {
    if (!info) return;
    if (!info.isAudio) {
      if (audioFormatGroup) audioFormatGroup.classList.add("hidden");
      trackVariantSelect.innerHTML = '<option value="main">Main package (ZIP)</option>';
      return;
    }
    if (audioFormatGroup) audioFormatGroup.classList.remove("hidden");
    if (info.type === "music") {
      trackVariantSelect.innerHTML =
        '<option value="main">Main track</option><option value="stems">Stems (ZIP)</option>';
    } else {
      trackVariantSelect.innerHTML = '<option value="main">Main track</option>';
    }
  }

  async function runLookup() {
    const url = commandInput.value.trim();
    if (!looksLikeUrl(url)) return;

    const seq = ++lookupSeq;
    setResolution("checking", "Checking archive…", "");
    resolutionStrip.classList.remove("hidden");

    try {
      const variant = trackVariantSelect.value || "main";
      const res = await apiFetch(
        `/api/v1/library/lookup?url=${encodeURIComponent(url)}&variant=${encodeURIComponent(variant)}`
      );
      if (seq !== lookupSeq) return;          // a newer keystroke already won
      if (!res.ok) { hideResolution(); return; }
      const data = await res.json();
      if (seq !== lookupSeq) return;
      renderResolution(data);
    } catch (err) {
      if (seq === lookupSeq) hideResolution();
    }
  }

  function renderResolution(data) {
    lastResolution = data;
    const btnText = submitBtn.querySelector(".btn-text");

    if (data.state === "invalid") {
      setResolution("invalid", "Unrecognised link", data.reason || "");
      submitBtn.disabled = true;
      return;
    }

    submitBtn.disabled = false;

    if (data.state === "cached") {
      // Already held. Re-fetching is still allowed, but it stops being the
      // default: the button drops out of gold and the archive copy is offered.
      const size = data.file_size ? formatBytes(data.file_size) : "";
      const reuse = data.hit_count ? `reused ${data.hit_count}×` : "never reused";
      const bits = [size, reuse].filter(Boolean).join(" · ");
      const actions = [];

      const track = {
        track_id: data.track_id,
        variant: data.variant,
        title: data.title || data.filename,
        filename: data.filename,
        provider: data.provider,
        category: data.category,
      };

      if (isAudioCategory(data.category)) {
        actions.push(ghostButton("Play", '<polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none"></polygon>', () => playAudioTrack(track)));
      }
      actions.push(ghostButton("Reveal", '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>', () => revealFile(track)));

      setResolution("cached", "Already in Sangraha", `${shortTitle(data.title || data.filename)} · ${bits}`, actions);
      btnText.textContent = "Download again";
      submitBtn.classList.add("is-secondary");
      return;
    }

    submitBtn.classList.remove("is-secondary");

    if (data.state === "queued") {
      setResolution("queued", "Already in the queue", `Status: ${data.job_status || "queued"}`);
      btnText.textContent = "Queue again";
      return;
    }

    const info = detectProvider(commandInput.value.trim());
    setResolution("new", "Not in the archive", info ? `${info.badge} · will download` : "Will download");
    btnText.textContent = "Bridge to Sangraha";
  }

  function updateUrlInputState() {
    const raw = commandInput.value;
    const val = raw.trim();

    urlClearBtn.classList.toggle("hidden", !val);
    if (commandKbd) commandKbd.classList.toggle("hidden", !!val);

    const isUrl = looksLikeUrl(val);
    const nextMode = isUrl ? "bridge" : "search";
    const modeChanged = nextMode !== commandMode;
    commandMode = nextMode;

    commandBar.classList.toggle("mode-bridge", isUrl);
    commandOptions.classList.toggle("hidden", !isUrl);
    if (commandIcon) commandIcon.innerHTML = isUrl ? LINK_ICON : SEARCH_ICON;

    const info = isUrl ? detectProvider(val) : null;
    if (info) {
      urlDetectedBadge.textContent = info.badge;
      urlDetectedBadge.className = `detected-badge ${info.cls}`;
      applyProviderOptions(info);
    } else {
      urlDetectedBadge.className = "detected-badge hidden";
    }

    clearTimeout(lookupTimer);
    clearTimeout(searchTimeout);

    if (isUrl) {
      // A link is not a search term, so the archive goes back to unfiltered.
      if (modeChanged) {
        filterEcho.classList.add("hidden");
        fetchLibrary("", currentCategory);
      }
      lookupSeq++;
      hideResolution();
      lookupTimer = setTimeout(runLookup, 260);
    } else {
      hideResolution();
      submitBtn.classList.remove("is-secondary");
      searchTimeout = setTimeout(() => {
        if (val) {
          filterEcho.textContent = `matching “${val}”`;
          filterEcho.classList.remove("hidden");
        } else {
          filterEcho.classList.add("hidden");
        }
        fetchLibrary(val, currentCategory);
      }, 180);
    }
  }

  commandInput.addEventListener("input", updateUrlInputState);
  commandInput.addEventListener("paste", () => setTimeout(updateUrlInputState, 30));
  // Changing the package re-asks the archive: stems and main are separate rows.
  trackVariantSelect.addEventListener("change", () => {
    if (commandMode === "bridge") runLookup();
  });
  urlClearBtn.addEventListener("click", () => {
    commandInput.value = "";
    updateUrlInputState();
    commandInput.focus();
  });

  // Global Keyboard Shortcut ('/' to search)
  document.addEventListener("keydown", (e) => {
    const typing = document.activeElement === commandInput ||
                   (document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName));
    if (e.key === "/" && !typing) {
      e.preventDefault();
      commandInput.focus();
      commandInput.select();
    }
    if (e.key === "Escape" && document.activeElement === commandInput && commandInput.value) {
      commandInput.value = "";
      updateUrlInputState();
    }
  });

  // --- Audio Player Controller ----------------------------------------------
  function describeAudioFailure(err) {
    const media = currentAudio.error;
    if (media) {
      switch (media.code) {
        case 1: return "Preview aborted";
        case 2: return "Network error while streaming preview";
        case 3: return "This file could not be decoded by the browser";
        case 4: return "Browser cannot play this format (try the MP3 variant)";
      }
    }
    if (err && err.name === "NotAllowedError") return "Click play again to allow audio";
    return "Preview unavailable";
  }

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

    document.querySelectorAll(".btn-table-play").forEach(btn => {
      const isThis = btn.dataset.trackId === currentPlayingTrackId;
      btn.classList.toggle("is-playing", isThis && isPlaying);
      const row = btn.closest("tr");
      if (row) row.classList.toggle("is-active-row", isThis);
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
    currentAudio.src =
      `/api/v1/library/stream/${encodeURIComponent(track.track_id)}` +
      `?variant=${encodeURIComponent(currentPlayingVariant)}` +
      `&token=${encodeURIComponent(TOKEN)}`;
    
    playerTitle.textContent = shortTitle(track.title) || track.filename;
    playerSub.textContent = `${(track.provider || "Artlist").toUpperCase()} • ${(track.variant || "Main").toUpperCase()}`;
    audioPlayerBar.classList.remove("hidden");

    currentAudio.play().then(() => {
      updatePlayerPlayIcon(true);
    }).catch(err => {
      console.error("Playback error:", err);
      showToast(describeAudioFailure(err));
      updatePlayerPlayIcon(false);
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

  // Duration is known before the first timeupdate, so the scrubber is not
  // stuck showing 0:00 while the file streams.
  currentAudio.addEventListener("loadedmetadata", () => {
    if (!isNaN(currentAudio.duration)) {
      playerDuration.textContent = formatPlayerTime(currentAudio.duration);
    }
  });

  // play() can resolve and the stream still fail afterwards, so the failure is
  // reported from the element rather than only from the promise.
  currentAudio.addEventListener("error", () => {
    if (!currentAudio.src) return;
    showToast(describeAudioFailure(null));
    updatePlayerPlayIcon(false);
  });

  // Keeps the icon honest when playback is changed from outside the page
  // (media keys, the OS mixer, another tab taking the audio focus).
  currentAudio.addEventListener("play", () => updatePlayerPlayIcon(true));
  currentAudio.addEventListener("pause", () => updatePlayerPlayIcon(false));

  playerScrubber.addEventListener("input", (e) => {
    if (!isNaN(currentAudio.duration)) {
      const seekTo = (e.target.value / 100) * currentAudio.duration;
      currentAudio.currentTime = seekTo;
    }
  });

  // --- Tactile File Actions: Copy, Reveal, Download -------------------------
  function copyPath(path, btnEl) {
    navigator.clipboard
      .writeText(path)
      .then(() => {
        showToast("Path copied to clipboard!");
        if (btnEl) {
          const original = btnEl.innerHTML;
          btnEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--status-emerald)" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>`;
          setTimeout(() => { btnEl.innerHTML = original; }, 1400);
        }
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
    submitResult.className = `result-box ${kind}`;
    submitResult.textContent = "";

    const strong = document.createElement("strong");
    strong.textContent = heading;
    submitResult.appendChild(strong);

    if (detail) {
      submitResult.appendChild(document.createElement("br"));
      const code = document.createElement("code");
      code.textContent = detail;
      code.style.cssText = "font-size:0.6875rem; opacity:0.85; word-break:break-all;";
      submitResult.appendChild(code);
    }

    if (pathToCopy) {
      submitResult.appendChild(document.createElement("br"));
      const btn = document.createElement("button");
      btn.className = "btn-notice-action";
      btn.style.cssText = "margin-top:8px;";
      btn.textContent = "Copy Filepath";
      btn.addEventListener("click", () => copyPath(pathToCopy, btn));
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
      queueList.innerHTML = '<div class="empty-placeholder is-inline">Nothing queued</div>';
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
      cancelBtn.className = "btn-remove-queue";
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
      recentList.innerHTML = '<div class="empty-placeholder is-inline">No transports yet</div>';
      return;
    }

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
      quotaBar.classList.toggle("is-high", pct >= 70 && pct < 90);
      quotaBar.classList.toggle("is-critical", pct >= 90);
      if (quotaPercent) quotaPercent.textContent = `${pct}% used`;

      if (todayDownloadsVal) todayDownloadsVal.textContent = data.daily_downloads;
      if (libraryTotalCount) libraryTotalCount.textContent = data.library_count || 0;
      if (queueDepthBadge) queueDepthBadge.textContent = `${data.queue_depth} queued`;
      const activitySection = document.querySelector(".activity-section");
      if (activitySection) {
        activitySection.classList.toggle("is-live", (data.queue_depth || 0) > 0 || !!data.in_flight_job);
      }

      if (data.chrome_download_dir && data.download_dir_ok === false) {
        dldirBanner.classList.remove("hidden");
        dldirDetail.textContent = `Chrome is saving to ${data.chrome_download_dir}, but Setu watches ${data.staging_path}.`;
      } else {
        dldirBanner.classList.add("hidden");
      }

      cacheHitsVal.textContent = data.today_cache_hits;
      diskFreeVal.textContent = `${data.disk_free_gb} GB`;

      if (data.queue_paused) {
        serverStatus.className = "status-node danger";
        serverStatus.querySelector(".status-label").textContent = `Paused (${data.consecutive_failures} fails)`;
        pausedBanner.classList.remove("hidden");
        pausedReason.textContent = `${data.consecutive_failures} consecutive failures detected. Fix the issue and resume.`;
      } else if (!data.storage_ok) {
        pausedBanner.classList.add("hidden");
        serverStatus.className = "status-node danger";
        serverStatus.querySelector(".status-label").textContent = "Low Disk Space";
      } else {
        serverStatus.className = "status-node online";
        serverStatus.querySelector(".status-label").textContent = "Bridge Ready";
        pausedBanner.classList.add("hidden");
      }

      const workerLabel = data.worker_type === "os_agent" ? "OS Agent" : "Extension";
      if (data.heartbeat_stale) {
        sessionStatus.className = "status-node warning";
        sessionStatus.querySelector(".status-label").textContent = `${workerLabel}: Offline`;
      } else if (data.session_authenticated) {
        sessionStatus.className = "status-node online";
        sessionStatus.querySelector(".status-label").textContent = `${workerLabel}: Active`;
      } else {
        sessionStatus.className = "status-node warning";
        sessionStatus.querySelector(".status-label").textContent = "Auth Required";
      }

    } catch (err) {
      serverStatus.className = "status-node danger";
      serverStatus.querySelector(".status-label").textContent = "Server Offline";
    }
  }

  // --- Fetch & Render Sangraha Library --------------------------------------
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
        td.className = "table-placeholder-cell";
        // Empty because of a filter and empty because nothing was ever bridged
        // are different problems, so they get different next steps.
        const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.6-3.6"></path></svg>';
        td.innerHTML = query
          ? `<div class="loading-state-wrap">${icon}<strong>No match for “${escapeHtml(query)}”</strong><span>Try a different word, or clear the filter with Esc.</span></div>`
          : `<div class="loading-state-wrap">${icon}<strong>Nothing here yet</strong><span>Paste an Artlist or Envato link in the bar above to bridge your first asset.</span></div>`;
        tr.appendChild(td);
        libraryTbody.appendChild(tr);
        return;
      }

      for (const t of tracks) {
        const tr = document.createElement("tr");

        // 1. Play Trigger Button
        const playTd = document.createElement("td");
        playTd.className = "col-stream";
        if (t.streamable) {
          const playBtn = document.createElement("button");
          playBtn.type = "button";
          playBtn.className = "btn-table-play";
          playBtn.dataset.trackId = t.track_id;
          playBtn.title = "Play / Preview Audio";
          const isThisPlaying = currentPlayingTrackId === t.track_id && !currentAudio.paused;
          playBtn.classList.toggle("is-playing", isThisPlaying);
          playBtn.innerHTML = isThisPlaying
            ? `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`
            : `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
          playBtn.addEventListener("click", () => playAudioTrack(t));
          playTd.appendChild(playBtn);
        } else {
          const icon = document.createElement("span");
          icon.style.cssText = "font-size:16px; opacity:0.6; display:inline-block; margin-left:4px;";
          icon.textContent = t.is_archive ? "📦" : "🎬";
          playTd.appendChild(icon);
        }

        // 2. Asset Name & Source Link
        const nameTd = document.createElement("td");
        nameTd.className = "col-asset";
        const strong = t.url ? document.createElement("a") : document.createElement("strong");
        strong.className = "asset-title-link";
        strong.textContent = shortTitle(t.title) || t.filename;
        if (t.url) {
          strong.href = t.url;
          strong.target = "_blank";
          strong.rel = "noreferrer";
          strong.title = "Open original stock link";
        }
        const sub = document.createElement("div");
        sub.className = "asset-sub-meta";
        const when = relativeTime(t.downloaded_at);
        sub.textContent = when ? `${t.filename} · ${when}` : t.filename;
        nameTd.append(strong, sub);

        // 3. Platform & Category Badges
        const sourceTd = document.createElement("td");
        sourceTd.className = "col-provider";
        const providerName = (t.provider || "artlist").toLowerCase();
        const categoryName = (t.category || "music").toLowerCase();
        
        const provBadge = document.createElement("span");
        provBadge.className = `provider-badge ${providerName}`;
        provBadge.textContent = providerName;

        const catBadge = document.createElement("span");
        catBadge.className = "category-tag";
        catBadge.textContent = categoryName;

        sourceTd.append(provBadge, catBadge);

        // 4. Size & Extension
        const sizeTd = document.createElement("td");
        sizeTd.className = "col-size mono";
        sizeTd.textContent = formatBytes(t.bytes);

        // 5. Reuse Count
        const hitsTd = document.createElement("td");
        hitsTd.className = "col-reused mono";
        hitsTd.textContent = t.hit_count;

        // 6. Action Toolbar
        const actionTd = document.createElement("td");
        actionTd.className = "col-actions";
        const actionsGroup = document.createElement("div");
        actionsGroup.className = "row-actions-container";

        // Copy Path Button (For Premiere Pro / Resolve)
        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "btn-action-icon";
        copyBtn.title = "Copy local filepath for Premiere / DaVinci Resolve";
        copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        copyBtn.addEventListener("click", () => copyPath(t.library_path, copyBtn));

        // Reveal in File Explorer Button
        const revealBtn = document.createElement("button");
        revealBtn.type = "button";
        revealBtn.className = "btn-action-icon";
        revealBtn.title = "Highlight in Windows File Explorer";
        revealBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
        revealBtn.addEventListener("click", () => revealFile(t));

        // Download Copy Button
        const dlBtn = document.createElement("button");
        dlBtn.type = "button";
        dlBtn.className = "btn-action-icon";
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
    categoryFilterBar.querySelectorAll(".category-pill").forEach(btn => {
      btn.addEventListener("click", () => {
        categoryFilterBar.querySelectorAll(".category-pill").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentCategory = btn.dataset.cat;
        fetchLibrary(commandMode === "search" ? commandInput.value.trim() : "", currentCategory);
      });
    });
  }

  // --- Submit New Asset Job -------------------------------------------------
  submitForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = commandInput.value.trim();
    if (!url || commandMode !== "bridge") return;

    submitBtn.disabled = true;
    submitBtn.querySelector(".btn-text").textContent = "Bridging…";
    submitResult.className = "result-box hidden";

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
        showResult("cached", "Instant Cache Hit — Already in Sangraha", data.filename, data.library_path);
        commandInput.value = "";
        updateUrlInputState();
        fetchLibrary("", currentCategory);
        fetchStatus();
      } else if (res.status === 201) {
        showResult(
          "success",
          `Queued to Setu — Queue Position #${data.queue_position}`,
          `Estimated ~${Math.round(data.estimated_wait_seconds / 60) || 1} min · Platform: ${(data.provider || "Stock").toUpperCase()}`
        );
        commandInput.value = "";
        updateUrlInputState();
        fetchStatus();
        fetchQueue();
      } else {
        showResult("error", data.detail || data.error || "Submission failed");
      }
    } catch (err) {
      showResult("error", "Network error: unable to connect to Setu local server.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove("is-secondary");
      submitBtn.querySelector(".btn-text").textContent = "Bridge to Sangraha";
      hideResolution();
    }
  });

  refreshBtn.addEventListener("click", async () => {
    refreshBtn.classList.add("is-busy");
    try {
      await Promise.all([
        fetchStatus(),
        fetchQueue(),
        fetchLibrary(commandMode === "search" ? commandInput.value.trim() : "", currentCategory),
      ]);
      showToast("Telemetry refreshed");
    } finally {
      refreshBtn.classList.remove("is-busy");
    }
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
