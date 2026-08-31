// Artlist Relay Frontend Application
document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("library-search-input");
  const clearSearchBtn = document.getElementById("clear-search-btn");
  const submitForm = document.getElementById("submit-form");
  const trackUrlInput = document.getElementById("track-url");
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

  // Local clock state. The server is polled every 2s, but these tick every
  // second in between so countdowns move smoothly instead of jumping.
  let clock = { elapsed: null, timeout: null, cooldown: 0, etas: new Map() };

  let searchTimeout = null;

  // The token is injected server-side into the page head; it is never typed in
  // by hand and never leaves this origin.
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

  // Older rows recorded the whole SEO page title. Show the track, not the page.
  function shortTitle(raw) {
    let t = (raw || "").trim();
    t = t.replace(/\s*-\s*Royalty Free Music\s*\|\s*Artlist\s*$/i, "");
    t = t.replace(/\s*\|\s*Artlist\s*$/i, "");
    const by = t.toLowerCase().lastIndexOf(" by ");
    if (by > 0) t = t.slice(0, by);
    return t.trim();
  }

  // Split a failure into the part a person acts on and the DOM dump behind it.
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
    const mins = Math.floor((Date.now() - then) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  // Stems arrive as a multi-file ZIP bundle; everything else is a single audio
  // file. Worth distinguishing at a glance - they differ by ~10x in size.
  function fileKind(filename) {
    const ext = (filename || "").split(".").pop().toLowerCase();
    if (ext === "zip") return { label: "ZIP bundle", cls: "kind-zip" };
    if (ext === "wav") return { label: "WAV", cls: "kind-wav" };
    return { label: ext.toUpperCase() || "file", cls: "kind-other" };
  }

  // Fetch through apiFetch so the bearer token travels; a plain <a href> cannot
  // carry an Authorization header.
  async function downloadFile(track, btn) {
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Preparing…";
    try {
      const res = await apiFetch(
        `/api/v1/library/file?track_id=${encodeURIComponent(track.track_id)}` +
        `&variant=${encodeURIComponent(track.variant)}`
      );
      if (!res.ok) throw new Error(String(res.status));

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

  function copyPath(path) {
    navigator.clipboard
      .writeText(path)
      .then(() => {
        showResult("success", "Path copied", path);
      })
      .catch((err) => console.error("Could not copy: ", err));
  }

  // Build result banners as DOM nodes. Track titles and filenames come from
  // Artlist page content, so they are never interpolated into innerHTML.
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

  // Paint the phase stepper: filled for completed steps, pulsing on the current one.
  function renderPhaseTrack(phaseIndex, phaseTotal, failed) {
    if (phaseTrack.childElementCount !== phaseTotal) {
      phaseTrack.textContent = "";
      for (let i = 0; i < phaseTotal; i++) {
        const seg = document.createElement("div");
        seg.className = "phase-seg";
        phaseTrack.appendChild(seg);
      }
    }
    Array.from(phaseTrack.children).forEach((seg, i) => {
      let cls = "phase-seg";
      if (failed) {
        if (i <= phaseIndex) cls += " failed";
      } else if (i < phaseIndex) {
        cls += " filled";
      } else if (i === phaseIndex) {
        cls += " active";
      }
      seg.className = cls;
    });
  }

  const cancelInFlightBtn = document.getElementById("cancel-inflight-btn");
  let currentInFlightId = null;

  if (cancelInFlightBtn) {
    cancelInFlightBtn.addEventListener("click", async () => {
      if (!currentInFlightId) return;
      cancelInFlightBtn.disabled = true;
      cancelInFlightBtn.textContent = "Cancelling...";
      try {
        await apiFetch(`/api/v1/jobs/${currentInFlightId}/cancel`, { method: "POST" });
        await fetchQueue();
      } catch (err) {
        console.error("Cancel failed:", err);
      } finally {
        cancelInFlightBtn.disabled = false;
        cancelInFlightBtn.textContent = "Cancel";
      }
    });
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
    inFlightTitle.textContent = job.title || job.phase_detail || ("Track " + job.track_id);
    inFlightVariant.textContent = job.variant;
    inFlightPhase.textContent = job.phase_label;

    clock.elapsed = job.elapsed_seconds || 0;
    clock.timeout = job.timeout_seconds || 180;
    inFlightTimeout.textContent = fmtClock(clock.timeout);

    renderPhaseTrack(job.phase_index, job.phase_total, job.phase === "failed");

    if (job.phase === "downloading" && job.total_bytes > 0) {
      dlProgress.classList.remove("hidden");
      const pct = Math.min(100, Math.round((job.progress_bytes / job.total_bytes) * 100));
      dlBar.style.width = pct + "%";
      dlPct.textContent = pct + "%";
      dlText.textContent = formatBytes(job.progress_bytes) + " / " + formatBytes(job.total_bytes);
    } else if (job.phase === "downloading") {
      dlProgress.classList.remove("hidden");
      dlBar.style.width = "100%";
      dlPct.textContent = "";
      dlText.textContent = formatBytes(job.progress_bytes) + " received";
    } else {
      dlProgress.classList.add("hidden");
    }
  }

  function renderQueued(jobs) {
    clock.etas = new Map();
    queueList.textContent = "";

    if (!jobs.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No jobs currently in queue";
      queueList.appendChild(empty);
      return;
    }

    for (const job of jobs) {
      const row = document.createElement("div");
      row.className = "queue-row";

      const pos = document.createElement("div");
      pos.className = "queue-pos";
      pos.textContent = job.queue_position;

      const main = document.createElement("div");
      main.className = "queue-main";
      const title = document.createElement("div");
      title.className = "qtitle";
      title.textContent = job.title || ("Track " + job.track_id);
      const sub = document.createElement("div");
      sub.className = "qsub";
      sub.textContent = job.attempts > 0
        ? job.variant + " \u00b7 retry " + job.attempts
        : job.variant;
      main.append(title, sub);

      const rightBox = document.createElement("div");
      rightBox.style.display = "flex";
      rightBox.style.alignItems = "center";
      rightBox.style.gap = "8px";

      const existingEta = clock.etas.get(job.job_id);
      const targetEta = (existingEta != null && existingEta > 0 && Math.abs(existingEta - (job.eta_seconds || 0)) < 15)
        ? existingEta
        : (job.eta_seconds || 0);

      const eta = document.createElement("div");
      eta.className = "queue-eta";
      eta.dataset.jobId = job.job_id;
      eta.textContent = "~" + fmtClock(targetEta);
      clock.etas.set(job.job_id, targetEta);

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn-quiet";
      cancelBtn.style.padding = "2px 6px";
      cancelBtn.style.fontSize = "11px";
      cancelBtn.style.color = "#888";
      cancelBtn.title = "Cancel this queued job";
      cancelBtn.textContent = "\u2715";
      cancelBtn.addEventListener("click", async () => {
        cancelBtn.disabled = true;
        try {
          await apiFetch(`/api/v1/jobs/${job.id || job.job_id}/cancel`, { method: "POST" });
          await fetchQueue();
        } catch (e) {
          console.error("Cancel failed:", e);
        }
      });

      rightBox.append(eta, cancelBtn);
      row.append(pos, main, rightBox);
      queueList.appendChild(row);
    }
  }

  function renderRecent(jobs) {
    if (!jobs.length) {
      recentSection.classList.add("hidden");
      return;
    }
    recentSection.classList.remove("hidden");
    recentList.textContent = "";

    for (const job of jobs) {
      const ok = job.status === "done";
      // A track without stems is information, not a fault - it should not read
      // like something broke.
      const info = !ok && job.no_stems;

      const row = document.createElement("div");
      row.className = "recent-row " + (ok ? "is-ok" : info ? "is-info" : "is-bad");

      const icon = document.createElement("span");
      icon.className = "recent-icon";
      icon.textContent = ok ? "\u2713" : info ? "i" : "\u2717";

      const body = document.createElement("div");
      body.className = "recent-body";

      const head = document.createElement("div");
      head.className = "recent-head-row";

      const name = shortTitle(job.title) || "Track " + job.track_id;
      const t = job.url ? document.createElement("a") : document.createElement("span");
      t.className = "rtitle";
      t.textContent = name;
      if (job.url) {
        t.href = job.url;
        t.target = "_blank";
        t.rel = "noreferrer";
      }

      const chip = document.createElement("span");
      chip.className = "chip chip-sm";
      chip.textContent = job.variant;

      const when = document.createElement("span");
      when.className = "recent-when";
      when.textContent = relativeTime(job.completed_at || job.created_at);

      head.append(t, chip, when);
      body.appendChild(head);

      if (info) {
        const note = document.createElement("div");
        note.className = "rerr";
        note.textContent = job.error;
        body.appendChild(note);

        // One click to fetch the version that does exist.
        if (job.url) {
          const again = document.createElement("button");
          again.type = "button";
          again.className = "rerr-toggle";
          again.textContent = "Download main track instead";
          again.addEventListener("click", async () => {
            again.disabled = true;
            again.textContent = "Queueing...";
            try {
              const res = await apiFetch("/api/v1/jobs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: job.url, variant: "main", format: "WAV" }),
              });
              const data = await res.json();
              if (res.status === 200 && data.status === "cached") {
                showResult("cached", "Already in your library", data.filename, data.library_path);
              } else if (res.status === 201) {
                showResult("success", "Queued - position " + data.queue_position);
              } else {
                showResult("error", data.detail || "Could not queue that track");
              }
              fetchQueue();
              fetchStatus();
            } finally {
              again.disabled = false;
              again.textContent = "Download main track instead";
            }
          });
          body.appendChild(again);
        }
      } else if (!ok && job.error) {
        const parts = splitError(job.error);
        const e = document.createElement("div");
        e.className = "rerr";
        e.textContent = parts.summary;
        body.appendChild(e);

        if (parts.detail) {
          const toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "rerr-toggle";
          toggle.textContent = "Technical detail";
          let open = false;
          toggle.addEventListener("click", () => {
            open = !open;
            e.textContent = open ? parts.detail : parts.summary;
            e.classList.toggle("rerr-full", open);
            toggle.textContent = open ? "Hide detail" : "Technical detail";
          });
          body.appendChild(toggle);
        }
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
    } catch (err) {
      // Server unreachable; the status poll surfaces that separately.
    }
  }

  // Smooth 1s tick between server polls.
  function tickClocks() {
    if (clock.elapsed != null) {
      clock.elapsed += 1;
      inFlightElapsed.textContent = fmtClock(clock.elapsed);
      inFlightElapsed.style.color =
        clock.timeout && clock.elapsed > clock.timeout - 30 ? "var(--accent-amber)" : "";
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
      el.textContent = "~" + fmtClock(remaining);
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

  // 1. Fetch & Render Telemetry Status
  async function fetchStatus() {
    try {
      const res = await apiFetch("/api/v1/status");
      if (!res.ok) throw new Error("Status failed");
      const data = await res.json();

      quotaText.textContent = data.daily_usage;
      const pct = Math.min(100, Math.round((data.daily_downloads / data.daily_limit) * 100));
      quotaBar.style.width = `${pct}%`;
      if (pct >= 90) {
        quotaBar.style.background = "var(--accent-red)";
      } else if (pct >= 75) {
        quotaBar.style.background = "var(--accent-amber)";
      } else {
        quotaBar.style.background = "linear-gradient(90deg, var(--primary), var(--accent-green))";
      }

      if (data.chrome_download_dir && data.download_dir_ok === false) {
        dldirBanner.classList.remove("hidden");
        dldirDetail.textContent =
          "Chrome saves to " + data.chrome_download_dir +
          " but the relay only accepts files from " + data.staging_path +
          ". Downloads will succeed and then be rejected at the handoff.";
      } else {
        dldirBanner.classList.add("hidden");
      }

      if (libraryTotal) {
        libraryTotal.textContent =
          `${data.library_count || 0} tracks · ${formatBytes(data.library_bytes || 0)}`;
      }

      cacheHitsVal.textContent = data.today_cache_hits;
      diskFreeVal.textContent = `${data.disk_free_gb} GB`;
      queueDepthVal.textContent = data.queue_depth;

      if (data.queue_paused) {
        serverStatus.className = "pill danger";
        serverStatus.querySelector(".text").textContent =
          `Paused after ${data.consecutive_failures} failures`;
        pausedBanner.classList.remove("hidden");
        pausedReason.textContent =
          data.consecutive_failures + " consecutive failures. Fix the cause, then resume.";
      } else if (!data.storage_ok) {
        pausedBanner.classList.add("hidden");
        serverStatus.className = "pill danger";
        serverStatus.querySelector(".text").textContent = "Low disk space";
      } else {
        serverStatus.className = "pill online";
        serverStatus.querySelector(".text").textContent = "Relay Active";
        pausedBanner.classList.add("hidden");
      }

      const workerLabel = data.worker_type === "os_agent" ? "OS Agent" : "Extension";
      if (data.heartbeat_stale) {
        sessionStatus.className = "pill warning";
        sessionStatus.querySelector(".text").textContent = `${workerLabel}: No Heartbeat`;
      } else if (data.session_authenticated) {
        sessionStatus.className = "pill online";
        sessionStatus.querySelector(".text").textContent = `${workerLabel}: Active`;
      } else {
        sessionStatus.className = "pill warning";
        sessionStatus.querySelector(".text").textContent = "Artlist: Re-auth Required";
      }

    } catch (err) {
      serverStatus.className = "pill danger";
      serverStatus.querySelector(".text").textContent = "Server Offline";
    }
  }

  // 2. Fetch & Render Library
  async function fetchLibrary(query = "") {
    try {
      const res = await apiFetch(`/api/v1/library?q=${encodeURIComponent(query)}`);
      const tracks = await res.json();

      libraryCount.textContent = `${tracks.length} tracks`;
      libraryTbody.textContent = "";

      if (tracks.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 5;
        td.className = "empty-table";
        td.textContent = query
          ? "No matching tracks found."
          : "No tracks in library yet. Add your first track above!";
        tr.appendChild(td);
        libraryTbody.appendChild(tr);
        return;
      }

      for (const t of tracks) {
        const tr = document.createElement("tr");

        const nameTd = document.createElement("td");
        const strong = t.url ? document.createElement("a") : document.createElement("strong");
        strong.className = "track-name";
        strong.textContent = shortTitle(t.title) || t.filename;
        if (t.url) {
          strong.href = t.url;
          strong.target = "_blank";
          strong.rel = "noreferrer";
          strong.title = "Open on Artlist";
        }
        const sub = document.createElement("div");
        sub.style.cssText = "font-size: 11px; color: var(--text-dim);";
        const when = relativeTime(t.downloaded_at);
        sub.textContent = when ? `${t.filename} · ${when}` : t.filename;
        nameTd.append(strong, sub);

        const variantTd = document.createElement("td");
        const tag = document.createElement("span");
        tag.className = `status-tag variant-${String(t.variant).toLowerCase()}`;
        tag.textContent = t.variant;
        variantTd.appendChild(tag);

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

        const hitsTd = document.createElement("td");
        const hits = document.createElement("strong");
        hits.textContent = t.hit_count;
        hitsTd.appendChild(hits);

        const actionTd = document.createElement("td");
        const actions = document.createElement("div");
        actions.className = "row-actions";

        // Works from any machine and any OS.
        const dlBtn = document.createElement("button");
        dlBtn.type = "button";
        dlBtn.className = "btn-secondary btn-sm";
        dlBtn.textContent = "Download";
        dlBtn.addEventListener("click", () => downloadFile(t, dlBtn));

        // Only meaningful on the machine running the relay.
        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "btn-quiet btn-sm";
        copyBtn.textContent = "Path";
        copyBtn.title = "Copy the file path on the relay machine";
        copyBtn.addEventListener("click", () => copyPath(t.library_path));

        actions.append(dlBtn, copyBtn);
        actionTd.appendChild(actions);

        tr.append(nameTd, variantTd, sizeTd, hitsTd, actionTd);
        libraryTbody.appendChild(tr);
      }
    } catch (err) {
      console.error("Library fetch failed: ", err);
    }
  }

  // 3. Search input listener with debounce
  searchInput.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    const value = e.target.value.trim();
    searchTimeout = setTimeout(() => fetchLibrary(value), 250);
  });

  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    fetchLibrary("");
  });

  // 4. Submit New Job Handler
  submitForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = trackUrlInput.value.trim();
    if (!url) return;

    submitBtn.disabled = true;
    submitBtn.querySelector(".btn-text").textContent = "Adding…";
    submitResult.className = "result-banner hidden";

    try {
      const res = await apiFetch("/api/v1/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url,
          variant: trackVariantSelect.value,
          format: audioFormatSelect.value,
          requested_by: "web_editor",
        }),
      });

      const data = await res.json();

      if (res.status === 200 && data.status === "cached") {
        showResult("cached", "Already in your library", data.filename, data.library_path);
        trackUrlInput.value = "";
        fetchLibrary();
        fetchStatus();
      } else if (res.status === 201) {
        showResult(
          "success",
          `Queued — position ${data.queue_position}`,
          `About ${Math.round(data.estimated_wait_seconds / 60) || 1} min · ${data.daily_usage} used today`
        );
        trackUrlInput.value = "";
        fetchStatus();
        fetchQueue();
      } else {
        showResult("error", data.detail || data.error || "Submission failed");
      }
    } catch (err) {
      showResult("error", "Network error: could not connect to relay server.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.querySelector(".btn-text").textContent = "Add to library";
    }
  });

  refreshBtn.addEventListener("click", () => {
    fetchStatus();
    fetchQueue();
    fetchLibrary(searchInput.value.trim());
  });

  // --- Appearance -----------------------------------------------------------
  // Three states, as in System Settings. "auto" stores nothing and lets
  // prefers-color-scheme decide; an explicit choice wins in both directions.
  const themeButtons = Array.from(document.querySelectorAll("[data-theme-choice]"));

  function currentThemeChoice() {
    try {
      const saved = localStorage.getItem("relay-theme");
      return saved === "light" || saved === "dark" ? saved : "auto";
    } catch (e) {
      return "auto";
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

  fetchStatus();
  fetchQueue();
  fetchLibrary();
  setInterval(fetchStatus, 3000);
  setInterval(fetchQueue, 2000);
  setInterval(tickClocks, 1000);
});
