// Background service worker for the Artlist Relay extension.
//
// DESIGN NOTE - MV3 state.
// A Manifest V3 service worker is terminated after ~30s idle, which wipes every
// module-level variable. All job state therefore lives in chrome.storage.session
// (survives worker restarts, cleared on browser restart - correct, since an
// in-flight job cannot survive a browser restart either).
//
// Two consequences shape the code below:
//   * Timers are not used for anything that must outlive the worker. The
//     inter-job cooldown and the per-job timeout are stored as timestamps and
//     evaluated on each alarm tick.
//   * On every wake the worker reconciles against chrome.downloads, so a
//     download that finished while the worker was dead still gets reported.

const SERVER_BASE = 'http://127.0.0.1:5000';
const POLL_ALARM = 'poll_queue';
const HEARTBEAT_ALARM = 'session_heartbeat';

const DEFAULT_CONFIG = {
  cooldown_min_seconds: 45,
  cooldown_max_seconds: 90,
  job_timeout_seconds: 180,
};

const randomRange = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Artlist's hero action row is responsive: below roughly this width the stems
// control is dropped from the DOM entirely, so a narrow relay window makes every
// track look like it has no stems. tabs.create inherits whatever size the window
// happens to be, so the window is widened before the job runs.
const MIN_WINDOW_WIDTH = 1500;
const MIN_WINDOW_HEIGHT = 900;

async function ensureWindowWideEnough(windowId) {
  try {
    let win = await chrome.windows.get(windowId);
    if ((win.width || 0) >= MIN_WINDOW_WIDTH) return win.width;

    console.log(`[Artlist Relay] Window is ${win.width}px; widening for the stems control`);
    await chrome.windows.update(windowId, { state: 'maximized' });
    win = await chrome.windows.get(windowId);

    if ((win.width || 0) < MIN_WINDOW_WIDTH) {
      // Maximised is still too narrow (small display); force an explicit size.
      await chrome.windows.update(windowId, {
        state: 'normal',
        left: 0,
        top: 0,
        width: MIN_WINDOW_WIDTH,
        height: MIN_WINDOW_HEIGHT,
      });
      win = await chrome.windows.get(windowId);
    }

    if ((win.width || 0) < MIN_WINDOW_WIDTH) {
      console.warn(
        `[Artlist Relay] Window is still only ${win.width}px wide. Artlist may hide ` +
          'the stems control at this size.'
      );
    }
    return win.width;
  } catch (e) {
    return null;
  }
}

// ------------------------------------------------------------- state helpers

const EMPTY_STATE = {
  activeJob: null,      // { jobId, url, variant, format, startedAt }
  dispatched: false,    // START_DOWNLOAD_JOB already sent for this job
  activeTabId: null,
  downloadId: null,
  trackTitle: null,
  cooldownUntil: 0,
};

async function getState() {
  const stored = await chrome.storage.session.get('relayState');
  return { ...EMPTY_STATE, ...(stored.relayState || {}) };
}

async function setState(patch) {
  const current = await getState();
  const next = { ...current, ...patch };
  await chrome.storage.session.set({ relayState: next });
  return next;
}

async function clearJobState() {
  await setState({
    activeJob: null,
    dispatched: false,
    activeTabId: null,
    downloadId: null,
    trackTitle: null,
  });
}

async function getConfig() {
  const cached = await chrome.storage.session.get('relayConfig');
  if (cached.relayConfig) return cached.relayConfig;
  try {
    const res = await fetch(`${SERVER_BASE}/api/v1/worker/config`);
    if (res.ok) {
      const cfg = await res.json();
      await chrome.storage.session.set({ relayConfig: cfg });
      return cfg;
    }
  } catch (e) {
    // Server not up yet; fall through to defaults.
  }
  return DEFAULT_CONFIG;
}

// ------------------------------------------------------------------- alarms

function ensureAlarms() {
  // Created unconditionally on every worker wake so a lost alarm self-heals.
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 });
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 5.0 });
}

chrome.runtime.onInstalled.addListener(ensureAlarms);
chrome.runtime.onStartup.addListener(ensureAlarms);
ensureAlarms();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) {
    tick().catch((e) => console.warn('[Artlist Relay] tick failed:', e));
  } else if (alarm.name === HEARTBEAT_ALARM) {
    sendSessionHeartbeat().catch(() => {});
  }
});

// --------------------------------------------------------------- heartbeat

// Chrome exposes no API for the configured download directory, but the most
// recent download's absolute path reveals it. Reporting it lets the server warn
// about a misconfigured download location before it wastes a download.
async function detectDownloadDir() {
  try {
    const items = await chrome.downloads.search({ limit: 5, orderBy: ['-startTime'] });
    for (const item of items) {
      if (item.filename) {
        // Strip the final path segment. Handles Windows and POSIX separators,
        // including UNC paths such as \\server\share\folder\file.wav.
        const dir = item.filename.replace(/[\\/][^\\/]*$/, '');
        if (dir) return dir;
      }
    }
  } catch (e) {}
  return null;
}

async function sendSessionHeartbeat() {
  let authenticated = null; // null = could not determine

  try {
    const tabs = await chrome.tabs.query({ url: '*://*.artlist.io/*' });
    if (tabs.length) {
      const reply = await chrome.tabs
        .sendMessage(tabs[0].id, { type: 'PROBE_LOGIN_STATE' })
        .catch(() => null);
      if (reply && typeof reply.authenticated !== 'undefined') {
        authenticated = reply.authenticated;
      }
    }
  } catch (e) {
    // No Artlist tab open, or the content script is not injected there.
  }

  try {
    const downloadDir = await detectDownloadDir();
    await fetch(`${SERVER_BASE}/api/v1/worker/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authenticated, download_dir: downloadDir }),
    });
  } catch (err) {
    console.warn('[Artlist Relay] Heartbeat post failed:', err);
  }
}

// ------------------------------------------------------------ main tick loop

async function tick() {
  const state = await getState();
  const config = await getConfig();

  if (state.activeJob) {
    await reconcileActiveJob(state, config);
    return;
  }

  if (Date.now() < (state.cooldownUntil || 0)) {
    return;
  }

  await claimNextJob();
}

// Recover a job that was in flight when the worker was last alive.
async function reconcileActiveJob(state, config) {
  const { activeJob, downloadId } = state;

  if (downloadId != null) {
    const [item] = await chrome.downloads.search({ id: downloadId });
    if (item) {
      if (item.state === 'complete') {
        console.log('[Artlist Relay] Reconciled a completed download for', activeJob.jobId);
        await reportDownloaded(activeJob.jobId, item, state.trackTitle, config);
        return;
      }
      if (item.state === 'interrupted') {
        await handleJobFailure(activeJob.jobId, `Download interrupted: ${item.error || 'unknown'}`, config);
        return;
      }
      // Still in progress - leave it alone.
      return;
    }
  }

  const ageMs = Date.now() - (activeJob.startedAt || 0);
  if (ageMs > config.job_timeout_seconds * 1000) {
    await handleJobFailure(
      activeJob.jobId,
      `Overall execution timeout exceeded (${config.job_timeout_seconds}s)`,
      config
    );
  }
}

async function claimNextJob() {
  let job;
  try {
    const res = await fetch(`${SERVER_BASE}/api/v1/worker/next`);
    if (res.status === 204 || !res.ok) return;
    job = await res.json();
  } catch (err) {
    return; // Server down or restarting.
  }

  if (!job || !job.job_id) return;

  await setState({
    activeJob: {
      jobId: job.job_id,
      url: job.url,
      variant: job.variant,
      format: job.format,
      startedAt: Date.now(),
      trackId: job.track_id,
    },
    dispatched: false,
    downloadId: null,
    trackTitle: null,
  });

  console.log('[Artlist Relay] Claimed job', job.job_id, job.url);
  await postCooldown('');
  await postPhase(job.job_id, 'opening_tab');

  try {
    const tab = await chrome.tabs.create({ url: job.url, active: true });
    await setState({ activeTabId: tab.id });
    const width = await ensureWindowWideEnough(tab.windowId);
    await postPhase(job.job_id, 'page_loading', width ? `window ${width}px` : null);
  } catch (err) {
    const config = await getConfig();
    await handleJobFailure(job.job_id, `Tab creation error: ${err.message}`, config);
  }
}

// Kick the content script once the job tab has finished loading.
//
// 'complete' fires more than once on a single-page app - interacting with the
// page re-triggers it - so without a guard the job is dispatched repeatedly and
// several copies of the flow run over each other on the same tab.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;

  const state = await getState();
  if (!state.activeJob || state.activeTabId !== tabId) return;
  if (state.dispatched) return;

  await setState({ dispatched: true });

  setTimeout(() => {
    chrome.tabs
      .sendMessage(tabId, {
        type: 'START_DOWNLOAD_JOB',
        job: {
          jobId: state.activeJob.jobId,
          variant: state.activeJob.variant,
          format: state.activeJob.format,
          trackId: state.activeJob.trackId,
        },
      })
      .catch(() => {
        // Tab closed or content script not ready; the timeout path will catch it.
      });
  }, 1500);
});

// --------------------------------------------------- content script messages

async function postPhase(jobId, phase, detail, progressBytes, totalBytes) {
  if (!jobId) return;
  try {
    await fetch(`${SERVER_BASE}/api/v1/worker/jobs/${jobId}/phase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phase,
        detail: detail || null,
        progress_bytes: progressBytes || 0,
        total_bytes: totalBytes || 0,
      }),
    });
  } catch (e) {}
}

async function postCooldown(untilIso) {
  try {
    await fetch(`${SERVER_BASE}/api/v1/worker/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cooldown_until: untilIso }),
    });
  } catch (e) {}
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'JOB_PHASE') {
    postPhase(message.jobId, message.phase, message.detail);
  } else if (message.type === 'JOB_TITLE_RESOLVED' || message.type === 'JOB_CLICK_EXECUTED') {
    if (message.title) {
      setState({ trackTitle: message.title }).catch(() => {});
    }
  } else if (message.type === 'JOB_CLICK_FAILED') {
    getConfig().then((cfg) => handleJobFailure(message.jobId, message.reason, cfg));
  }
});

// ----------------------------------------------------- download lifecycle

chrome.downloads.onCreated.addListener(async (downloadItem) => {
  const state = await getState();
  if (!state.activeJob) return;
  if (state.downloadId != null) return; // already bound to this job

  // Bind only downloads that actually came from Artlist. Without this filter any
  // unrelated download in the browser hijacks the job.
  const source = `${downloadItem.url || ''} ${downloadItem.finalUrl || ''} ${downloadItem.referrer || ''}`;
  if (!/artlist/i.test(source)) {
    console.log('[Artlist Relay] Ignoring non-Artlist download:', downloadItem.url);
    return;
  }

  // Artlist issues a licence PDF alongside the audio. Binding the job to
  // whichever download starts first means binding to the PDF, then waiting on
  // it, reporting it, and failing verification - while the real audio download
  // goes unnoticed.
  const name = (downloadItem.filename || downloadItem.url || '').toLowerCase();
  const mime = (downloadItem.mime || '').toLowerCase();
  if (name.endsWith('.pdf') || mime === 'application/pdf' || /licen[cs]e/i.test(name)) {
    console.log('[Artlist Relay] Ignoring licence document:', downloadItem.filename);
    return;
  }

  console.log('[Artlist Relay] Bound download', downloadItem.id, 'to job', state.activeJob.jobId);
  await setState({ downloadId: downloadItem.id });
  sendSessionHeartbeat().catch(() => {});
  await postPhase(
    state.activeJob.jobId, 'downloading', state.trackTitle,
    downloadItem.bytesReceived, downloadItem.totalBytes
  );
});

chrome.downloads.onChanged.addListener(async (delta) => {
  try {
    const state = await getState();
    if (!state.activeJob || delta.id !== state.downloadId) return;

    const config = await getConfig();

    if (delta.state && delta.state.current === 'complete') {
      const [item] = await chrome.downloads.search({ id: delta.id });
      if (item) {
        await reportDownloaded(state.activeJob.jobId, item, state.trackTitle, config);
      }
    } else if (delta.bytesReceived) {
      // Live byte progress so the dashboard can show a real progress bar.
      const [item] = await chrome.downloads.search({ id: delta.id });
      if (item) {
        await postPhase(
          state.activeJob.jobId, 'downloading', state.trackTitle,
          item.bytesReceived, item.totalBytes
        );
      }
    } else if (delta.state && delta.state.current === 'interrupted') {
      const errStr = delta.error ? delta.error.current || String(delta.error) : 'interrupted';
      await handleJobFailure(state.activeJob.jobId, `Download interrupted: ${errStr}`, config);
    }
  } catch (outerErr) {
    console.warn('[Artlist Relay] Download event processing error:', outerErr);
  }
});

async function reportDownloaded(jobId, item, trackTitle, config) {
  await closeJobTab();
  await postPhase(jobId, 'moving', trackTitle, item.fileSize || 0, item.fileSize || 0);

  try {
    const res = await fetch(`${SERVER_BASE}/api/v1/worker/jobs/${jobId}/downloaded`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        temp_filename: item.filename,
        bytes: item.fileSize || item.totalBytes || 0,
        title: trackTitle,
      }),
    });
    if (!res.ok) {
      console.warn('[Artlist Relay] Server rejected the delivery:', res.status);
    } else {
      console.log('[Artlist Relay] Delivered', item.filename);
    }
  } catch (err) {
    // The server already fails the job on its side if the move throws; if it is
    // unreachable, the server-side reaper requeues on the stale-claim timeout.
    console.warn('[Artlist Relay] Could not report download:', err);
  }

  await startInterJobCooldown(config);
}

async function handleJobFailure(jobId, reason, config) {
  console.warn('[Artlist Relay] Job failed:', jobId, reason);
  await closeJobTab();

  if (jobId) {
    try {
      await fetch(`${SERVER_BASE}/api/v1/worker/jobs/${jobId}/failed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
    } catch (e) {}
  }

  await startInterJobCooldown(config || DEFAULT_CONFIG);
}

async function closeJobTab() {
  const state = await getState();
  if (state.activeTabId != null) {
    try {
      await chrome.tabs.remove(state.activeTabId);
    } catch (e) {}
    await setState({ activeTabId: null });
  }
}

// Cooldown is a stored deadline, not a sleep(). A timer would be discarded when
// the worker is terminated, silently skipping the pacing between jobs.
async function startInterJobCooldown(config) {
  const seconds = randomRange(config.cooldown_min_seconds, config.cooldown_max_seconds);
  const until = Date.now() + seconds * 1000;
  await clearJobState();
  await setState({ cooldownUntil: until });
  // Epoch milliseconds, not an ISO string. toISOString() serialises as UTC with
  // a trailing 'Z'; the server compares against local time, and the mismatch
  // used to crash the queue endpoint outright.
  await postCooldown(until);
  console.log(`[Artlist Relay] Cooldown ${seconds}s before next job.`);
}
