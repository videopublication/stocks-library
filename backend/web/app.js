// Setu (सेतु) Studio Creative Asset Bridge Engine
document.addEventListener("DOMContentLoaded", () => {
  // Navigation & Telemetry
  const serverStatus = document.getElementById("server-status");
  const sessionStatus = document.getElementById("session-status");
  const artlistLimitText = document.getElementById("artlist-limit-text");
  const artlistLimitPercent = document.getElementById("artlist-limit-percent");
  const artlistLimitBar = document.getElementById("artlist-limit-bar");
  const envatoLimitText = document.getElementById("envato-limit-text");
  const envatoLimitPercent = document.getElementById("envato-limit-percent");
  const envatoLimitBar = document.getElementById("envato-limit-bar");
  const cacheHitsVal = document.getElementById("cache-hits-val");
  const diskFreeVal = document.getElementById("disk-free-val");
  const queueDepthBadge = document.getElementById("queue-depth-badge");
  const todayDownloadsVal = document.getElementById("today-downloads-val");
  const libraryTotalCount = document.getElementById("library-total-count");

  // Auth & Session Elements
  const loginOverlay = document.getElementById("login-overlay");
  const loginForm = document.getElementById("login-form");
  const loginUsernameInput = document.getElementById("login-username");
  const loginPasswordInput = document.getElementById("login-password");
  const loginErrorBanner = document.getElementById("login-error-banner");
  const loginErrorText = document.getElementById("login-error-text");
  const loginBtn = document.getElementById("login-btn");
  const userSessionBlock = document.getElementById("user-session-block");
  const userProfileBadge = document.getElementById("user-profile-badge");
  const userDisplayName = document.getElementById("user-display-name");
  const userRoleChip = document.getElementById("user-role-chip");
  const adminPanelBtn = document.getElementById("admin-panel-btn");
  const btnOpenChangePassword = document.getElementById("btn-open-change-password");
  const logoutBtn = document.getElementById("logout-btn");

  // Page Views
  const libraryWorkspaceView = document.getElementById("library-workspace-view");
  const adminPageView = document.getElementById("admin-page-view");
  const btnBackToLibrary = document.getElementById("btn-back-to-library");

  // Admin Elements
  const adminModal = document.getElementById("admin-modal") || adminPageView;
  const adminModalClose = document.getElementById("admin-modal-close");
  const tabBtnReports = document.getElementById("tab-btn-reports");
  const tabBtnUsers = document.getElementById("tab-btn-users");
  const tabBtnUserDetail = document.getElementById("tab-btn-user-detail");
  const tabBtnSettings = document.getElementById("tab-btn-settings");
  const tabBtnBackup = document.getElementById("tab-btn-backup");
  const tabBtnAudit = document.getElementById("tab-btn-audit");
  const adminTabReports = document.getElementById("admin-tab-reports");
  const adminTabUsers = document.getElementById("admin-tab-users");
  const adminTabUserDetail = document.getElementById("admin-tab-user-detail");
  const adminTabSettings = document.getElementById("admin-tab-settings");
  const adminTabBackup = document.getElementById("admin-tab-backup");
  const adminTabAudit = document.getElementById("admin-tab-audit");
  const btnBackToUsers = document.getElementById("btn-back-to-users");
  const chartHoverInfo = document.getElementById("chart-hover-info");

  // User Detail Elements
  const userDetailAvatar = document.getElementById("user-detail-avatar");
  const userDetailFullname = document.getElementById("user-detail-fullname");
  const userDetailUsername = document.getElementById("user-detail-username");
  const userDetailRole = document.getElementById("user-detail-role");
  const userDetailStatus = document.getElementById("user-detail-status");
  const userDetailCreated = document.getElementById("user-detail-created");
  const userDetailLastLogin = document.getElementById("user-detail-last-login");
  const userDetailActiveDays = document.getElementById("user-detail-active-days");
  const userDetailBtnToggleStatus = document.getElementById("user-detail-btn-toggle-status");
  const userDetailBtnResetPass = document.getElementById("user-detail-btn-reset-pass");
  const userKpiTotalRequests = document.getElementById("user-kpi-total-requests");
  const userKpiCompletedDownloads = document.getElementById("user-kpi-completed-downloads");
  const userKpiFailedCount = document.getElementById("user-kpi-failed-count");
  const userKpiBandwidth = document.getElementById("user-kpi-bandwidth");
  const userKpiSuccessRate = document.getElementById("user-kpi-success-rate");
  const userKpiReuses = document.getElementById("user-kpi-reuses");
  const userKpiBandwidthSaved = document.getElementById("user-kpi-bandwidth-saved");
  const userKpiTeammateReuses = document.getElementById("user-kpi-teammate-reuses");
  const teamListView = document.getElementById("team-list-view");
  const teamDetailView = document.getElementById("team-detail-view");
  const btnBackToTeamList = document.getElementById("btn-back-to-team-list");
  const userPlatformBarArtlist = document.getElementById("user-platform-bar-artlist");
  const userPlatformBarEnvato = document.getElementById("user-platform-bar-envato");
  const userPlatformCountArtlist = document.getElementById("user-platform-count-artlist");
  const userPlatformCountEnvato = document.getElementById("user-platform-count-envato");
  const userCategoryPills = document.getElementById("user-category-pills");
  const userHistorySubtitle = document.getElementById("user-history-subtitle");
  const userHistorySearch = document.getElementById("user-history-search");
  const userHistoryTbody = document.getElementById("user-history-tbody");

  // Self-Service Change Password Elements
  const changePasswordModal = document.getElementById("change-password-modal");
  const changePasswordModalClose = document.getElementById("change-password-modal-close");
  const changePasswordForm = document.getElementById("change-password-form");
  const selfCurrentPassword = document.getElementById("self-current-password");
  const selfNewPassword = document.getElementById("self-new-password");
  const selfConfirmPassword = document.getElementById("self-confirm-password");
  const btnCancelChangePassword = document.getElementById("btn-cancel-change-password");
  const changePasswordErrorBanner = document.getElementById("change-password-error-banner");
  const changePasswordErrorText = document.getElementById("change-password-error-text");
  const adminUsersTbody = document.getElementById("admin-users-tbody");
  const btnShowAddUser = document.getElementById("btn-show-add-user");
  const addUserFormCard = document.getElementById("add-user-form-card");
  const createUserForm = document.getElementById("create-user-form");
  const btnCancelAddUser = document.getElementById("btn-cancel-add-user");
  const adminSettingsForm = document.getElementById("admin-settings-form");
  const settingArtlistLimit = document.getElementById("setting-artlist-limit");
  const settingEnvatoLimit = document.getElementById("setting-envato-limit");
  const settingWorkingHoursToggle = document.getElementById("setting-working-hours-toggle");
  const settingHoursStart = document.getElementById("setting-hours-start");
  const settingHoursEnd = document.getElementById("setting-hours-end");
  const settingCooldownMin = document.getElementById("setting-cooldown-min");
  const settingCooldownMax = document.getElementById("setting-cooldown-max");
  const settingLibraryPath = document.getElementById("setting-library-path");
  const adminAuditTbody = document.getElementById("admin-audit-tbody");
  const btnRefreshAudit = document.getElementById("btn-refresh-audit");

  // Analytics Elements
  const kpiPeriodBadge = document.getElementById("kpi-period-badge");
  const kpiTotalDownloads = document.getElementById("kpi-total-downloads");
  const kpiRequestsDetail = document.getElementById("kpi-requests-detail");
  const kpiTotalBandwidth = document.getElementById("kpi-total-bandwidth");
  const kpiSuccessRate = document.getElementById("kpi-success-rate");
  const kpiFailedCount = document.getElementById("kpi-failed-count");
  const kpiActiveEditors = document.getElementById("kpi-active-editors");
  const kpiTotalReuses = document.getElementById("kpi-total-reuses");
  const kpiReusesDetail = document.getElementById("kpi-reuses-detail");
  const kpiBandwidthSavedSub = document.getElementById("kpi-bandwidth-saved-sub");
  const topReusedBadgeTotal = document.getElementById("top-reused-badge-total");
  const topReusedList = document.getElementById("top-reused-list");
  const analyticsChartContainer = document.getElementById("analytics-chart-container");
  const platformBarArtlist = document.getElementById("platform-bar-artlist");
  const platformBarEnvato = document.getElementById("platform-bar-envato");
  const platformCountArtlist = document.getElementById("platform-count-artlist");
  const platformCountEnvato = document.getElementById("platform-count-envato");
  const analyticsCategoryPills = document.getElementById("analytics-category-pills");
  const analyticsLeaderboardTbody = document.getElementById("analytics-leaderboard-tbody");
  const btnExportAnalytics = document.getElementById("btn-export-analytics");
  const btnRefreshAnalytics = document.getElementById("btn-refresh-analytics");

  // Backup Elements
  const btnCreateBackupNow = document.getElementById("btn-create-backup-now");
  const btnRefreshBackups = document.getElementById("btn-refresh-backups");
  const btnDownloadBackupDirect = document.getElementById("btn-download-backup-direct");
  const settingBackupAutoToggle = document.getElementById("setting-backup-auto-toggle");
  const settingBackupDirectory = document.getElementById("setting-backup-directory");
  const btnSaveBackupDir = document.getElementById("btn-save-backup-dir");
  const backupDirectoryDisplay = document.getElementById("backup-directory-display");
  const adminBackupsTbody = document.getElementById("admin-backups-tbody");

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
  const inFlightUser = document.getElementById("in-flight-user");
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

  // Media Library Elements & State
  const libraryCount = document.getElementById("library-count");
  const categoryFilterBar = document.getElementById("category-filter-bar");
  const libraryTbody = document.getElementById("library-tbody");
  const libQuickSearch = document.getElementById("lib-quick-search");
  const libSearchClear = document.getElementById("lib-search-clear");
  let cachedLibraryTracks = [];
  let currentSortColumn = null;
  let currentSortDirection = "none"; // "asc", "desc", "none"
  let currentQuickSearchQuery = "";

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
  let searchTimeout = null;
  let clock = { elapsed: null, timeout: null, cooldown: 0, etas: new Map() };
  let lastLibraryCount = null;
  let lastRecentCompletedId = null;
  let hadInFlightJob = false;
  let currentUser = null;

  // Token management
  let userToken = localStorage.getItem("stocks_user_token") || sessionStorage.getItem("stocks_user_token") || "";

  function getActiveToken() {
    return userToken || window.RELAY_TOKEN || "";
  }

  function authHeaders(extra) {
    const t = getActiveToken();
    return Object.assign({ Authorization: `Bearer ${t}` }, extra || {});
  }

  async function apiFetch(path, options) {
    const opts = options || {};
    opts.headers = authHeaders(opts.headers);
    const res = await fetch(path, opts);
    if (res.status === 401 && !path.includes("/api/v1/auth/login")) {
      showLoginModal("Session expired. Please sign in.");
    }
    return res;
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
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      });
    } catch (e) {
      return String(iso).slice(0, 16);
    }
  }

  function showToast(msg) {
    if (!toastBox) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--act-ink)" stroke-width="2.5">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
      <span>${escapeHtml(msg)}</span>
    `;
    toastBox.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
      toast.style.transition = "all 0.2s ease";
      setTimeout(() => toast.remove(), 200);
    }, 2400);
  }

  // --- Auth & User Session Management ---------------------------------------

  function showLoginModal(errMsg = "") {
    if (loginErrorBanner) {
      if (errMsg) {
        loginErrorText.textContent = errMsg;
        loginErrorBanner.classList.remove("hidden");
      } else {
        loginErrorBanner.classList.add("hidden");
      }
    }
    const wasHidden = loginOverlay && loginOverlay.classList.contains("hidden");
    if (loginOverlay) loginOverlay.classList.remove("hidden");

    // Only focus username if modal was just revealed and user isn't already typing in password field
    if (wasHidden && loginUsernameInput && document.activeElement !== loginPasswordInput && document.activeElement !== loginUsernameInput) {
      loginUsernameInput.focus();
    }
  }

  function hideLoginModal() {
    if (loginOverlay) loginOverlay.classList.add("hidden");
    if (loginErrorBanner) loginErrorBanner.classList.add("hidden");
  }

  async function checkAuthAndInit() {
    if (!getActiveToken()) {
      showLoginModal();
      return;
    }

    try {
      const res = await apiFetch("/api/v1/auth/me");
      if (!res.ok) {
        showLoginModal();
        return;
      }
      currentUser = await res.json();
      hideLoginModal();
      updateUserSessionUI();
      fetchStatus();
      fetchQueue();
      fetchLibrary();
      if (currentUser.role === "admin" && window.location.hash.startsWith("#admin")) {
        handleHashRoute();
      }
    } catch (e) {
      showLoginModal("Unable to reach server. Please sign in.");
    }
  }

  function updateUserSessionUI() {
    if (!currentUser) return;
    if (userDisplayName) {
      userDisplayName.textContent = currentUser.full_name || currentUser.username;
    }
    if (userRoleChip) {
      userRoleChip.textContent = (currentUser.role || "editor").toUpperCase();
      userRoleChip.className = `role-chip ${currentUser.role === 'admin' ? 'admin' : ''}`;
    }
    if (adminPanelBtn) {
      adminPanelBtn.classList.toggle("hidden", currentUser.role !== "admin");
    }
  }

  // Handle Login Form Submit
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = loginUsernameInput.value.trim();
      const password = loginPasswordInput.value;
      if (!username || !password) return;

      loginBtn.disabled = true;
      loginBtn.querySelector(".btn-text").textContent = "Signing In…";
      loginErrorBanner.classList.add("hidden");

      try {
        const res = await fetch("/api/v1/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();

        if (res.ok && data.access_token) {
          userToken = data.access_token;
          localStorage.setItem("stocks_user_token", userToken);
          sessionStorage.setItem("stocks_user_token", userToken);
          currentUser = data.user;
          hideLoginModal();
          updateUserSessionUI();
          showToast(`Welcome back, ${currentUser.full_name || currentUser.username}!`);
          loginPasswordInput.value = "";
          fetchStatus();
          fetchQueue();
          fetchLibrary();
        } else {
          loginErrorText.textContent = data.detail || "Invalid username or password.";
          loginErrorBanner.classList.remove("hidden");
        }
      } catch (err) {
        loginErrorText.textContent = "Connection error. Is the server running?";
        loginErrorBanner.classList.remove("hidden");
      } finally {
        loginBtn.disabled = false;
        loginBtn.querySelector(".btn-text").textContent = "Sign In to Studio Hub";
      }
    });
  }

  // Handle Logout
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await apiFetch("/api/v1/auth/logout", { method: "POST" });
      } catch (e) {}
      userToken = "";
      currentUser = null;
      localStorage.removeItem("stocks_user_token");
      sessionStorage.removeItem("stocks_user_token");
      currentAudio.pause();
      currentAudio.src = "";
      if (audioPlayerBar) audioPlayerBar.classList.add("hidden");
      showLoginModal("You have been signed out.");
    });
  }

  // --- View Router (Media Library vs Admin Full-Screen Page) ----------------
  function showPageView(viewName, tabName = "reports", param = null) {
    if (viewName === "admin") {
      if (!currentUser || currentUser.role !== "admin") {
        showPageView("library");
        return;
      }
      if (libraryWorkspaceView) libraryWorkspaceView.classList.add("hidden");
      if (adminPageView) adminPageView.classList.remove("hidden");
      if (adminPanelBtn) adminPanelBtn.classList.add("active");
      window.scrollTo(0, 0);

      if (tabName === "user-detail" && param) {
        openUserDetailReport(param);
      } else {
        switchAdminTab(tabName || "reports");
      }
    } else {
      if (adminPageView) adminPageView.classList.add("hidden");
      if (libraryWorkspaceView) libraryWorkspaceView.classList.remove("hidden");
      if (adminPanelBtn) adminPanelBtn.classList.remove("active");
      if (window.location.hash.startsWith("#admin")) {
        history.replaceState(null, "", window.location.pathname);
      }
    }
  }

  function openAdminModal() {
    showPageView("admin", "reports");
  }

  function closeAdminModal() {
    showPageView("library");
  }

  if (adminPanelBtn) adminPanelBtn.addEventListener("click", () => showPageView("admin", "reports"));
  if (btnBackToLibrary) btnBackToLibrary.addEventListener("click", () => showPageView("library"));
  if (adminModalClose) adminModalClose.addEventListener("click", () => showPageView("library"));
  if (btnBackToUsers) {
    btnBackToUsers.addEventListener("click", () => {
      if (teamDetailView) teamDetailView.classList.add("hidden");
      if (teamListView) teamListView.classList.remove("hidden");
      switchAdminTab("users");
    });
  }
  if (btnBackToTeamList) {
    btnBackToTeamList.addEventListener("click", () => {
      if (teamDetailView) teamDetailView.classList.add("hidden");
      if (teamListView) teamListView.classList.remove("hidden");
      switchAdminTab("users");
    });
  }

  function switchAdminTab(tabName) {
    if (tabName === "backup") tabName = "settings";
    if (tabName === "user-detail") tabName = "users";

    if (tabName === "users" && teamListView && teamDetailView) {
      teamListView.classList.remove("hidden");
      teamDetailView.classList.add("hidden");
    }

    const tabs = [
      { name: "reports", btn: tabBtnReports, pane: adminTabReports, fn: () => fetchAdminAnalytics(currentAnalyticsPeriod) },
      { name: "users", btn: tabBtnUsers, pane: adminTabUsers, fn: fetchAdminUsers, renderCache: () => { if (cachedAdminUsers.length) applyAdminUserFilterAndRender(); } },
      { name: "audit", btn: tabBtnAudit, pane: adminTabAudit, fn: fetchAdminAudit, renderCache: () => { if (cachedAdminAuditLogs.length) applyAdminAuditFilterAndRender(); } },
      { name: "settings", btn: tabBtnSettings, pane: adminTabSettings, fn: () => { fetchAdminSettings(); fetchAdminBackups(); } },
    ];
    tabs.forEach(t => {
      const active = t.name === tabName;
      if (t.btn) {
        t.btn.classList.toggle("active", active);
        t.btn.setAttribute("aria-selected", String(active));
      }
      if (t.pane) {
        t.pane.classList.toggle("active", active);
        t.pane.classList.toggle("hidden", !active);
      }
      if (active) {
        if (typeof t.renderCache === "function") t.renderCache();
        if (typeof t.fn === "function") t.fn();
      }
    });
    history.replaceState(null, "", `#admin/${tabName}`);
  }

  if (tabBtnReports) tabBtnReports.addEventListener("click", () => switchAdminTab("reports"));
  if (tabBtnUsers) tabBtnUsers.addEventListener("click", () => switchAdminTab("users"));
  if (tabBtnAudit) tabBtnAudit.addEventListener("click", () => switchAdminTab("audit"));
  if (tabBtnSettings) tabBtnSettings.addEventListener("click", () => switchAdminTab("settings"));

  // --- Individual User Detailed Report Logic -------------------------------
  let cachedUserDetailReport = null;
  let currentUserHistorySearchQuery = "";

  async function openUserDetailReport(userIdentifier) {
    if (!userIdentifier) return;
    
    // Switch to users tab and reveal inline detail view
    const tabs = [
      { name: "reports", btn: tabBtnReports, pane: adminTabReports },
      { name: "users", btn: tabBtnUsers, pane: adminTabUsers },
      { name: "audit", btn: tabBtnAudit, pane: adminTabAudit },
      { name: "settings", btn: tabBtnSettings, pane: adminTabSettings },
    ];
    tabs.forEach(t => {
      const active = t.name === "users";
      if (t.btn) {
        t.btn.classList.toggle("active", active);
        t.btn.setAttribute("aria-selected", String(active));
      }
      if (t.pane) {
        t.pane.classList.toggle("active", active);
        t.pane.classList.toggle("hidden", !active);
      }
    });

    if (teamListView) teamListView.classList.add("hidden");
    if (teamDetailView) teamDetailView.classList.remove("hidden");
    history.replaceState(null, "", `#admin/user/${encodeURIComponent(userIdentifier)}`);

    if (userHistoryTbody) {
      userHistoryTbody.innerHTML = '<tr><td colspan="7" class="table-placeholder-cell">Loading user profile & download history…</td></tr>';
    }

    try {
      const res = await apiFetch(`/api/v1/users/${encodeURIComponent(userIdentifier)}/report`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.detail || `Failed to load report for ${userIdentifier}`);
        return;
      }
      cachedUserDetailReport = await res.json();
      renderUserDetailedReport(cachedUserDetailReport);
    } catch (e) {
      console.error("openUserDetailReport failed:", e);
      showToast("Error loading user report.");
    }
  }

  function renderUserDetailedReport(data) {
    if (!data) return;
    const u = data.user || {};
    const s = data.summary || {};

    if (userDetailAvatar) {
      userDetailAvatar.textContent = (u.full_name || u.username || "U").charAt(0).toUpperCase();
    }
    if (userDetailFullname) {
      userDetailFullname.textContent = u.full_name || u.username;
    }
    if (userDetailUsername) {
      userDetailUsername.textContent = `@${u.username}`;
    }
    if (userDetailRole) {
      userDetailRole.className = `role-chip ${u.role === 'admin' ? 'admin' : ''}`;
      userDetailRole.textContent = (u.role || 'editor').toUpperCase();
    }
    if (userDetailStatus) {
      userDetailStatus.className = u.is_active ? "status-badge-active" : "status-badge-disabled";
      userDetailStatus.textContent = u.is_active ? "Active" : "Disabled";
    }
    if (userDetailCreated) {
      userDetailCreated.textContent = formatDateTime(u.created_at);
    }
    if (userDetailLastLogin) {
      userDetailLastLogin.textContent = formatDateTime(u.last_login);
    }
    if (userDetailActiveDays) {
      userDetailActiveDays.textContent = s.active_days || 0;
    }

    if (userDetailBtnToggleStatus) {
      userDetailBtnToggleStatus.textContent = u.is_active ? "Disable Account" : "Enable Account";
      userDetailBtnToggleStatus.onclick = async () => {
        await apiFetch(`/api/v1/admin/users/${encodeURIComponent(u.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: !u.is_active }),
        });
        showToast(`User '${u.username}' status updated.`);
        openUserDetailReport(u.username);
      };
    }

    if (userDetailBtnResetPass) {
      userDetailBtnResetPass.onclick = () => {
        openResetPasswordModal(u);
      };
    }

    // KPI Cards
    if (userKpiTotalRequests) userKpiTotalRequests.textContent = (s.total_requests || 0).toLocaleString();
    if (userKpiCompletedDownloads) userKpiCompletedDownloads.textContent = (s.completed_downloads || 0).toLocaleString();
    if (userKpiFailedCount) userKpiFailedCount.textContent = `${(s.failed_downloads || 0) + (s.cancelled_downloads || 0)} failed / cancelled`;
    if (userKpiBandwidth) userKpiBandwidth.textContent = s.formatted_bytes || formatBytes(s.total_bytes || 0);
    if (userKpiSuccessRate) userKpiSuccessRate.textContent = `${s.success_rate != null ? s.success_rate : 100}%`;
    if (userKpiReuses) userKpiReuses.textContent = (s.personal_reuses || 0).toLocaleString();
    if (userKpiBandwidthSaved) userKpiBandwidthSaved.textContent = `${s.formatted_bandwidth_saved || formatBytes(s.bandwidth_saved || 0)} saved from cache`;
    if (userKpiTeammateReuses) userKpiTeammateReuses.textContent = (s.teammate_reuses || 0).toLocaleString();

    // Platform Split
    const artlist = (data.platforms && data.platforms.artlist) ? data.platforms.artlist : { count: 0, bytes: 0 };
    const envato = (data.platforms && data.platforms.envato) ? data.platforms.envato : { count: 0, bytes: 0 };
    const totalP = artlist.count + envato.count;
    const aPct = totalP > 0 ? Math.round((artlist.count / totalP) * 100) : 50;
    const ePct = totalP > 0 ? 100 - aPct : 50;

    if (userPlatformBarArtlist) userPlatformBarArtlist.style.width = `${aPct}%`;
    if (userPlatformBarEnvato) userPlatformBarEnvato.style.width = `${ePct}%`;
    if (userPlatformCountArtlist) userPlatformCountArtlist.textContent = `${artlist.count} (${aPct}%)`;
    if (userPlatformCountEnvato) userPlatformCountEnvato.textContent = `${envato.count} (${ePct}%)`;

    // Category Distribution Pills
    if (userCategoryPills) {
      userCategoryPills.textContent = "";
      const cats = data.categories || [];
      if (cats.length === 0) {
        userCategoryPills.innerHTML = '<span class="pane-subtitle">No categorized downloads</span>';
      } else {
        cats.forEach(c => {
          const pill = document.createElement("span");
          pill.className = "category-stat-chip";
          const catPretty = c.category.replace("-", " ").replace(/\b\w/g, l => l.toUpperCase());
          pill.innerHTML = `<span>${escapeHtml(catPretty)}</span> <strong>${c.count}</strong>`;
          userCategoryPills.appendChild(pill);
        });
      }
    }

    if (userHistorySubtitle) {
      userHistorySubtitle.textContent = `${(data.history || []).length} lifetime assets requested by @${u.username}`;
    }

    applyUserHistoryFilterAndRender();
  }

  function applyUserHistoryFilterAndRender() {
    if (!userHistoryTbody || !cachedUserDetailReport) return;
    const allHistory = cachedUserDetailReport.history || [];
    const q = (currentUserHistorySearchQuery || "").toLowerCase().trim();
    const u = (cachedUserDetailReport && cachedUserDetailReport.user) ? cachedUserDetailReport.user : {};

    const filtered = !q ? allHistory : allHistory.filter(h => {
      const title = (h.title || "").toLowerCase();
      const prov = (h.provider || "").toLowerCase();
      const stat = (h.status || "").toLowerCase();
      const url = (h.url || "").toLowerCase();
      const orig = (h.original_downloader || "").toLowerCase();
      return title.includes(q) || prov.includes(q) || stat.includes(q) || url.includes(q) || orig.includes(q);
    });

    if (filtered.length === 0) {
      userHistoryTbody.innerHTML = '<tr><td colspan="7" class="table-placeholder-cell">No matching assets found in history</td></tr>';
      return;
    }

    const frag = document.createDocumentFragment();
    filtered.forEach(h => {
      const tr = document.createElement("tr");

      // Time
      const timeTd = document.createElement("td");
      timeTd.style.fontSize = "11px";
      timeTd.style.color = "var(--n-8)";
      timeTd.textContent = formatDateTime(h.created_at);

      // Event Pill
      const eventTd = document.createElement("td");
      const evtType = h.event_type || (h.is_reuse ? "reuse" : (h.status === "cancelled" ? "cancelled" : "download"));
      if (evtType === "reuse") {
        eventTd.innerHTML = '<span class="pill-action reuse">♻️ Reuse</span>';
      } else if (evtType === "cancelled") {
        eventTd.innerHTML = '<span class="pill-action cancelled">🚫 Cancelled</span>';
      } else {
        eventTd.innerHTML = '<span class="pill-action download">⬇️ Download</span>';
      }

      // Title & Link
      const titleTd = document.createElement("td");
      const origDownloader = h.original_downloader;
      const isOtherUploader = origDownloader && origDownloader !== u.username && origDownloader !== "studio";
      const origSub = isOtherUploader ? `<div style="font-size:11px; color:var(--n-8); margin-top:2px;">Original: @${escapeHtml(origDownloader)}</div>` : "";
      if (h.url) {
        const link = document.createElement("a");
        link.href = h.url;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.className = "asset-title-link";
        link.textContent = shortTitle(h.title) || h.track_id;
        titleTd.appendChild(link);
        if (origSub) {
          const div = document.createElement("div");
          div.innerHTML = origSub;
          titleTd.appendChild(div);
        }
      } else {
        titleTd.innerHTML = `<strong>${escapeHtml(shortTitle(h.title) || h.track_id)}</strong>${origSub}`;
      }

      // Platform
      const provTd = document.createElement("td");
      const prov = (h.provider || "artlist").toLowerCase();
      provTd.innerHTML = `<span class="provider-badge ${prov}">${escapeHtml(prov)}</span>`;

      // Variant & Format
      const varTd = document.createElement("td");
      varTd.className = "mono";
      varTd.textContent = `${(h.variant || 'main').toUpperCase()} · ${(h.format || 'WAV').toUpperCase()}`;

      // Size
      const sizeTd = document.createElement("td");
      sizeTd.className = "mono";
      sizeTd.textContent = formatBytes(h.bytes);

      // Status
      const statTd = document.createElement("td");
      const st = (h.status || "").toLowerCase();
      if (st === "completed" || st === "done") {
        statTd.innerHTML = `<span class="status-badge-active">Completed</span>`;
      } else if (st === "failed") {
        statTd.innerHTML = `<span class="status-badge-disabled" title="${escapeHtml(h.error || '')}">Failed</span>`;
      } else if (st === "cancelled") {
        statTd.innerHTML = `<span class="pill-badge" style="background:var(--n-3); color:var(--n-8);">Cancelled</span>`;
      } else {
        statTd.innerHTML = `<span class="status-badge-active" style="background:var(--act-dim); color:var(--act-ink);">${escapeHtml(st)}</span>`;
      }

      tr.append(timeTd, eventTd, titleTd, provTd, varTd, sizeTd, statTd);
      frag.appendChild(tr);
    });

    userHistoryTbody.replaceChildren(frag);
  }

  if (userHistorySearch) {
    userHistorySearch.addEventListener("input", (e) => {
      currentUserHistorySearchQuery = e.target.value;
      applyUserHistoryFilterAndRender();
    });
  }

  // --- Self-Service Change Password Controller ------------------------------
  function openChangePasswordModal() {
    if (!currentUser) return;
    if (changePasswordForm) changePasswordForm.reset();
    if (changePasswordErrorBanner) changePasswordErrorBanner.classList.add("hidden");
    if (changePasswordModal) {
      changePasswordModal.classList.remove("hidden");
      if (selfCurrentPassword) selfCurrentPassword.focus();
    }
  }

  function closeChangePasswordModal() {
    if (changePasswordModal) changePasswordModal.classList.add("hidden");
  }

  if (btnOpenChangePassword) btnOpenChangePassword.addEventListener("click", openChangePasswordModal);
  if (userProfileBadge) {
    userProfileBadge.style.cursor = "pointer";
    userProfileBadge.addEventListener("click", () => {
      if (currentUser && currentUser.role === "admin") {
        showPageView("admin", "reports");
      } else {
        openChangePasswordModal();
      }
    });
  }
  if (changePasswordModalClose) changePasswordModalClose.addEventListener("click", closeChangePasswordModal);
  if (btnCancelChangePassword) btnCancelChangePassword.addEventListener("click", closeChangePasswordModal);

  if (changePasswordForm) {
    changePasswordForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (changePasswordErrorBanner) changePasswordErrorBanner.classList.add("hidden");

      const curPass = selfCurrentPassword ? selfCurrentPassword.value : "";
      const newPass = selfNewPassword ? selfNewPassword.value : "";
      const confirmPass = selfConfirmPassword ? selfConfirmPassword.value : "";

      if (newPass !== confirmPass) {
        if (changePasswordErrorText) changePasswordErrorText.textContent = "New passwords do not match.";
        if (changePasswordErrorBanner) changePasswordErrorBanner.classList.remove("hidden");
        return;
      }
      if (newPass.length < 4) {
        if (changePasswordErrorText) changePasswordErrorText.textContent = "Password must be at least 4 characters.";
        if (changePasswordErrorBanner) changePasswordErrorBanner.classList.remove("hidden");
        return;
      }

      try {
        const res = await apiFetch("/api/v1/auth/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ current_password: curPass, new_password: newPass }),
        });
        const data = await res.json();
        if (res.ok) {
          showToast("✓ Password changed successfully!");
          closeChangePasswordModal();
        } else {
          if (changePasswordErrorText) changePasswordErrorText.textContent = data.detail || "Failed to update password.";
          if (changePasswordErrorBanner) changePasswordErrorBanner.classList.remove("hidden");
        }
      } catch (err) {
        if (changePasswordErrorText) changePasswordErrorText.textContent = "Error updating password: " + err;
        if (changePasswordErrorBanner) changePasswordErrorBanner.classList.remove("hidden");
      }
    });
  }

  // --- URL Hash Routing ----------------------------------------------------
  function handleHashRoute() {
    const hash = window.location.hash;
    if (!hash || !hash.startsWith("#admin")) {
      showPageView("library");
      return;
    }
    if (hash.startsWith("#admin/user/")) {
      const targetUser = decodeURIComponent(hash.replace("#admin/user/", "").trim());
      if (targetUser) {
        showPageView("admin", "user-detail", targetUser);
        return;
      }
    }
    const tabPart = hash.replace("#admin/", "").replace("#admin", "").trim();
    showPageView("admin", tabPart || "reports");
  }

  window.addEventListener("hashchange", handleHashRoute);

  // --- Admin: Users Management Tab ---

  if (btnShowAddUser) {
    btnShowAddUser.addEventListener("click", () => {
      if (addUserFormCard) addUserFormCard.classList.remove("hidden");
      document.getElementById("new-username").focus();
    });
  }

  if (btnCancelAddUser) {
    btnCancelAddUser.addEventListener("click", () => {
      if (addUserFormCard) addUserFormCard.classList.add("hidden");
    });
  }

  if (createUserForm) {
    createUserForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = document.getElementById("new-username").value.trim();
      const full_name = document.getElementById("new-fullname").value.trim();
      const password = document.getElementById("new-password").value;
      const role = document.getElementById("new-role").value;

      try {
        const res = await apiFetch("/api/v1/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, full_name, password, role }),
        });
        const data = await res.json();
        if (res.ok) {
          showToast(`✓ User account '${username}' created!`);
          createUserForm.reset();
          if (addUserFormCard) addUserFormCard.classList.add("hidden");
          fetchAdminUsers();
        } else {
          showToast(data.detail || "Failed to create user.");
        }
      } catch (err) {
        showToast("Error creating user: " + err);
      }
    });
  }

  // --- Admin: Users Management Tab (With Sorting & Real-Time Search) ---
  let cachedAdminUsers = [];
  let adminUserSortCol = null;
  let adminUserSortDir = "none";
  let currentAdminUserSearchQuery = "";
  const adminUserSearchInput = document.getElementById("admin-user-search-input");
  const adminUserSearchClear = document.getElementById("admin-user-search-clear");

  function updateAdminUserSortHeaderUI() {
    document.querySelectorAll(".admin-data-table th[data-user-sort]").forEach(th => {
      const col = th.dataset.userSort;
      const icon = th.querySelector(".sort-icon");
      if (col === adminUserSortCol && adminUserSortDir !== "none") {
        th.classList.add("is-sorted");
        if (icon) icon.textContent = adminUserSortDir === "asc" ? "▲" : "▼";
      } else {
        th.classList.remove("is-sorted");
        if (icon) icon.textContent = "⇅";
      }
    });
  }

  function filterAdminUsers(users, query) {
    if (!query) return users;
    const q = query.toLowerCase().trim();
    return users.filter(u => {
      const username = (u.username || "").toLowerCase();
      const fullName = (u.full_name || "").toLowerCase();
      const role = (u.role || "").toLowerCase();
      const status = u.is_active ? "active" : "disabled";
      return username.includes(q) || fullName.includes(q) || role.includes(q) || status.includes(q);
    });
  }

  function applyAdminUserFilterAndRender() {
    const filtered = filterAdminUsers(cachedAdminUsers, currentAdminUserSearchQuery);
    const sorted = sortAdminUsersList(filtered, adminUserSortCol, adminUserSortDir);
    renderAdminUsersTable(sorted);
  }

  let adminUserSearchRAF = null;
  if (adminUserSearchInput) {
    adminUserSearchInput.addEventListener("input", (e) => {
      currentAdminUserSearchQuery = e.target.value;
      if (adminUserSearchClear) {
        adminUserSearchClear.classList.toggle("hidden", !currentAdminUserSearchQuery);
      }
      if (adminUserSearchRAF) cancelAnimationFrame(adminUserSearchRAF);
      adminUserSearchRAF = requestAnimationFrame(() => {
        applyAdminUserFilterAndRender();
      });
    });
  }

  if (adminUserSearchClear) {
    adminUserSearchClear.addEventListener("click", () => {
      if (adminUserSearchInput) {
        adminUserSearchInput.value = "";
        adminUserSearchInput.focus();
      }
      currentAdminUserSearchQuery = "";
      adminUserSearchClear.classList.add("hidden");
      applyAdminUserFilterAndRender();
    });
  }

  function sortAdminUsersList(users, col, dir) {
    if (!col || dir === "none") return users;
    return [...users].sort((a, b) => {
      let valA, valB;
      if (col === "username") {
        valA = (a.username || "").toLowerCase();
        valB = (b.username || "").toLowerCase();
        return dir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (col === "role") {
        valA = (a.role || "").toLowerCase();
        valB = (b.role || "").toLowerCase();
        return dir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (col === "total_downloads") {
        valA = Number(a.total_downloads || 0);
        valB = Number(b.total_downloads || 0);
        return dir === "asc" ? valA - valB : valB - valA;
      }
      if (col === "is_active") {
        valA = a.is_active ? 1 : 0;
        valB = b.is_active ? 1 : 0;
        return dir === "asc" ? valA - valB : valB - valA;
      }
      if (col === "created_at") {
        valA = new Date(a.created_at || 0).getTime();
        valB = new Date(b.created_at || 0).getTime();
        return dir === "asc" ? valA - valB : valB - valA;
      }
      return 0;
    });
  }

  function renderAdminUsersTable(users) {
    if (!adminUsersTbody) return;
    if (!users || users.length === 0) {
      adminUsersTbody.innerHTML = '<tr><td colspan="6" class="table-placeholder-cell">No users found</td></tr>';
      return;
    }

    const frag = document.createDocumentFragment();
    users.forEach(u => {
      const tr = document.createElement("tr");

      // User
      const userTd = document.createElement("td");
      userTd.innerHTML = `<button type="button" class="btn-user-link" title="Open @${escapeHtml(u.username)} detailed report"><strong>${escapeHtml(u.username)}</strong></button>${u.full_name ? `<div style="font-size:11px; color:var(--n-8);">${escapeHtml(u.full_name)}</div>` : ''}`;
      userTd.querySelector(".btn-user-link").addEventListener("click", () => openUserDetailReport(u.username));

      // Role
      const roleTd = document.createElement("td");
      roleTd.innerHTML = `<span class="role-chip ${u.role === 'admin' ? 'admin' : ''}">${escapeHtml(u.role.toUpperCase())}</span>`;

      // Downloads
      const dlTd = document.createElement("td");
      dlTd.className = "mono";
      dlTd.textContent = u.total_downloads || 0;

      // Status
      const statusTd = document.createElement("td");
      statusTd.innerHTML = u.is_active
        ? '<span class="status-badge-active">Active</span>'
        : '<span class="status-badge-disabled">Disabled</span>';

      // Created
      const createdTd = document.createElement("td");
      createdTd.style.fontSize = "11px";
      createdTd.style.color = "var(--n-8)";
      createdTd.textContent = formatDateTime(u.created_at);

      // Actions
      const actTd = document.createElement("td");
      actTd.style.whiteSpace = "nowrap";

      // Report button
      const reportBtn = document.createElement("button");
      reportBtn.type = "button";
      reportBtn.className = "user-report-action-btn";
      reportBtn.textContent = "📊 Report";
      reportBtn.title = "View user profile & full download report";
      reportBtn.style.marginRight = "6px";
      reportBtn.addEventListener("click", () => openUserDetailReport(u.username));

      // Toggle Active button
      const toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "table-action-btn";
      toggleBtn.textContent = u.is_active ? "Disable" : "Enable";
      toggleBtn.addEventListener("click", async () => {
        await apiFetch(`/api/v1/admin/users/${encodeURIComponent(u.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: !u.is_active }),
        });
        showToast(`User '${u.username}' ${u.is_active ? 'disabled' : 'enabled'}.`);
        fetchAdminUsers();
      });

      // Reset Password button
      const resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.className = "table-action-btn";
      resetBtn.textContent = "Reset Pass";
      resetBtn.addEventListener("click", () => openResetPasswordModal(u));

      // Delete button (Cannot delete own account or last admin)
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "table-action-btn danger";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", () => {
        openConfirmModal(
          "Delete User Account",
          "Permanent Account Deletion",
          `Are you sure you want to permanently delete user <strong>@${escapeHtml(u.username)}</strong>? This will revoke all studio access immediately.`,
          "Delete Account",
          true,
          async () => {
            const dRes = await apiFetch(`/api/v1/admin/users/${encodeURIComponent(u.id)}`, {
              method: "DELETE",
            });
            const dData = await dRes.json();
            if (dRes.ok) {
              showToast(`✓ User '${u.username}' deleted.`);
              fetchAdminUsers();
            } else {
              showToast(dData.detail || "Cannot delete user.");
            }
          }
        );
      });

      actTd.append(reportBtn, toggleBtn, resetBtn, delBtn);
      tr.append(userTd, roleTd, dlTd, statusTd, createdTd, actTd);
      frag.appendChild(tr);
    });

    adminUsersTbody.replaceChildren(frag);
  }

  async function fetchAdminUsers() {
    if (!adminUsersTbody) return;
    try {
      const res = await apiFetch("/api/v1/admin/users");
      if (!res.ok) return;
      cachedAdminUsers = await res.json();
      applyAdminUserFilterAndRender();
    } catch (e) {
      console.error("fetchAdminUsers failed:", e);
    }
  }

  // Admin User Header Click Listeners
  document.querySelectorAll(".admin-data-table th[data-user-sort]").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.dataset.userSort;
      if (adminUserSortCol === col) {
        if (adminUserSortDir === "asc") adminUserSortDir = "desc";
        else if (adminUserSortDir === "desc") {
          adminUserSortDir = "none";
          adminUserSortCol = null;
        } else {
          adminUserSortDir = "asc";
        }
      } else {
        adminUserSortCol = col;
        adminUserSortDir = "asc";
      }
      updateAdminUserSortHeaderUI();
      applyAdminUserFilterAndRender();
    });
  });

  // --- In-App Reset Password Modal Controllers ---
  const resetPasswordModal = document.getElementById("reset-password-modal");
  const resetModalClose = document.getElementById("reset-modal-close");
  const resetModalSubtitle = document.getElementById("reset-modal-subtitle");
  const resetPasswordForm = document.getElementById("reset-password-form");
  const resetUserIdInput = document.getElementById("reset-user-id");
  const resetNewPasswordInput = document.getElementById("reset-new-password");
  const btnCancelReset = document.getElementById("btn-cancel-reset");

  function openResetPasswordModal(user) {
    if (!resetPasswordModal) return;
    resetUserIdInput.value = user.id;
    resetModalSubtitle.textContent = `Set a new password for @${user.username}`;
    resetNewPasswordInput.value = "";
    resetPasswordModal.classList.remove("hidden");
    resetNewPasswordInput.focus();
  }

  function closeResetPasswordModal() {
    if (resetPasswordModal) resetPasswordModal.classList.add("hidden");
  }

  if (resetModalClose) resetModalClose.addEventListener("click", closeResetPasswordModal);
  if (btnCancelReset) btnCancelReset.addEventListener("click", closeResetPasswordModal);

  if (resetPasswordForm) {
    resetPasswordForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const userId = resetUserIdInput.value;
      const newPass = resetNewPasswordInput.value;
      if (!newPass || newPass.length < 4) {
        showToast("Password must be at least 4 characters long.");
        return;
      }
      try {
        const res = await apiFetch(`/api/v1/admin/users/${encodeURIComponent(userId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: newPass }),
        });
        const data = await res.json();
        if (res.ok) {
          showToast("✓ Password successfully updated!");
          closeResetPasswordModal();
        } else {
          showToast(data.detail || "Failed to update password.");
        }
      } catch (err) {
        showToast("Error updating password: " + err);
      }
    });
  }

  // --- In-App Confirm Action Modal Controllers ---
  const confirmActionModal = document.getElementById("confirm-action-modal");
  const confirmModalClose = document.getElementById("confirm-modal-close");
  const confirmModalTitle = document.getElementById("confirm-modal-title");
  const confirmModalSubtitle = document.getElementById("confirm-modal-subtitle");
  const confirmModalMessage = document.getElementById("confirm-modal-message");
  const btnCancelConfirm = document.getElementById("btn-cancel-confirm");
  const btnExecuteConfirm = document.getElementById("btn-execute-confirm");
  let onConfirmCallback = null;

  function openConfirmModal(title, subtitle, message, buttonText, isDanger, onConfirm) {
    if (!confirmActionModal) return;
    confirmModalTitle.textContent = title;
    confirmModalSubtitle.textContent = subtitle;
    confirmModalMessage.innerHTML = message;
    btnExecuteConfirm.textContent = buttonText || "Confirm";
    btnExecuteConfirm.className = isDanger ? "table-action-btn danger" : "btn-admin-action-primary";
    btnExecuteConfirm.style.padding = "8px 16px";
    btnExecuteConfirm.style.fontWeight = "600";
    onConfirmCallback = onConfirm;
    confirmActionModal.classList.remove("hidden");
  }

  function closeConfirmModal() {
    if (confirmActionModal) confirmActionModal.classList.add("hidden");
    onConfirmCallback = null;
  }

  if (confirmModalClose) confirmModalClose.addEventListener("click", closeConfirmModal);
  if (btnCancelConfirm) btnCancelConfirm.addEventListener("click", closeConfirmModal);
  if (btnExecuteConfirm) {
    btnExecuteConfirm.addEventListener("click", async () => {
      if (typeof onConfirmCallback === "function") {
        await onConfirmCallback();
      }
      closeConfirmModal();
    });
  }

  // --- Admin: Settings & Quota Tab ---

  async function fetchAdminSettings() {
    try {
      const res = await apiFetch("/api/v1/admin/settings");
      if (!res.ok) return;
      const s = await res.json();

      if (settingArtlistLimit) settingArtlistLimit.value = s.daily_limit_artlist || s.daily_safety_limit || 40;
      if (settingEnvatoLimit) settingEnvatoLimit.value = s.daily_limit_envato || 20;
      if (settingWorkingHoursToggle) {
        settingWorkingHoursToggle.checked = s.working_hours_enabled === "true";
      }
      if (settingHoursStart) settingHoursStart.value = s.working_hours_start || "09:00";
      if (settingHoursEnd) settingHoursEnd.value = s.working_hours_end || "21:00";
      if (settingCooldownMin) settingCooldownMin.value = s.cooldown_min_seconds || 0;
      if (settingCooldownMax) settingCooldownMax.value = s.cooldown_max_seconds || 0;
      if (settingLibraryPath) settingLibraryPath.value = s.library_download_path || "";
      if (settingBackupDirectory && s.backup_directory) settingBackupDirectory.value = s.backup_directory;
      if (settingBackupAutoToggle) settingBackupAutoToggle.checked = s.backup_auto_enabled !== "false";
    } catch (e) {
      console.error("fetchAdminSettings failed:", e);
    }
  }

  if (adminSettingsForm) {
    adminSettingsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        daily_limit_artlist: parseInt(settingArtlistLimit ? settingArtlistLimit.value : 40, 10),
        daily_limit_envato: parseInt(settingEnvatoLimit ? settingEnvatoLimit.value : 20, 10),
        working_hours_enabled: settingWorkingHoursToggle.checked,
        working_hours_start: settingHoursStart.value,
        working_hours_end: settingHoursEnd.value,
        cooldown_min_seconds: parseInt(settingCooldownMin.value, 10),
        cooldown_max_seconds: parseInt(settingCooldownMax.value, 10),
        library_download_path: settingLibraryPath ? settingLibraryPath.value.trim() : "",
      };

      try {
        const res = await apiFetch("/api/v1/admin/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok) {
          showToast("✓ System settings & storage path saved!");
          fetchStatus();
          fetchLibrary("", currentCategory, true);
        } else {
          showToast(data.detail || "Failed to save settings.");
        }
      } catch (err) {
        showToast("Settings error: " + err);
      }
    });
  }

  // --- Admin: Analytics & Reports Tab --------------------------------------
  let currentAnalyticsPeriod = "daily";
  let cachedAnalyticsData = null;

  async function fetchAdminAnalytics(period = currentAnalyticsPeriod) {
    currentAnalyticsPeriod = period;
    if (kpiPeriodBadge) {
      kpiPeriodBadge.textContent = period.charAt(0).toUpperCase() + period.slice(1);
    }
    document.querySelectorAll(".analytics-period-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.period === period);
    });

    try {
      const res = await apiFetch(`/api/v1/admin/analytics?period=${encodeURIComponent(period)}`);
      if (!res.ok) return;
      cachedAnalyticsData = await res.json();
      renderAnalyticsView(cachedAnalyticsData);
    } catch (err) {
      console.error("fetchAdminAnalytics error:", err);
    }
  }

  function renderAnalyticsView(data) {
    if (!data) return;
    const s = data.summary || {};

    if (kpiTotalDownloads) kpiTotalDownloads.textContent = (s.completed_downloads || 0).toLocaleString();
    if (kpiRequestsDetail) kpiRequestsDetail.textContent = `${(s.total_requests || 0).toLocaleString()} requests processed`;
    if (kpiTotalReuses) kpiTotalReuses.textContent = (s.total_reuses || 0).toLocaleString();
    if (kpiReusesDetail) kpiReusesDetail.textContent = `${s.bandwidth_saved_formatted || s.formatted_bandwidth_saved || formatBytes(s.bandwidth_saved || 0)} saved quota`;
    if (kpiTotalBandwidth) kpiTotalBandwidth.textContent = formatBytes(s.total_bytes || 0);
    if (kpiBandwidthSavedSub) kpiBandwidthSavedSub.textContent = `${s.bandwidth_saved_formatted || s.formatted_bandwidth_saved || formatBytes(s.bandwidth_saved || 0)} saved via reuse`;
    if (kpiSuccessRate) kpiSuccessRate.textContent = `${s.success_rate != null ? s.success_rate : 100}%`;
    if (kpiFailedCount) kpiFailedCount.textContent = `${s.failed_downloads || 0} failed / cancelled`;
    if (kpiActiveEditors) kpiActiveEditors.textContent = s.active_editors_count || 0;
    if (topReusedBadgeTotal) topReusedBadgeTotal.textContent = `${(s.total_reuses || 0).toLocaleString()} Reuses Recorded`;

    // Timeline Bar Chart
    if (analyticsChartContainer) {
      const timeline = data.timeline || [];
      if (timeline.length === 0) {
        analyticsChartContainer.innerHTML = '<div class="chart-loading">No activity recorded in this time range</div>';
      } else {
        const maxVal = Math.max(...timeline.map(t => t.requests || 0), 1);
        analyticsChartContainer.textContent = "";

        timeline.forEach(item => {
          const col = document.createElement("div");
          col.className = "chart-bar-col";

          const pct = Math.max(6, Math.round(((item.requests || 0) / maxVal) * 100));

          const tooltip = document.createElement("div");
          tooltip.className = "chart-bar-tooltip";
          tooltip.innerHTML = `<strong>${escapeHtml(item.bucket)}</strong><br>Requests: ${item.requests || 0}<br>Completed: ${item.completed || 0}<br>Reuses: ${item.reuses || 0}<br>Failed: ${item.failed || 0}<br>Volume: ${formatBytes(item.bytes || 0)}`;

          const bar = document.createElement("div");
          bar.className = "chart-bar-body";
          bar.style.height = `${pct}%`;
          if (item.failed > 0 && item.requests > 0) {
            const compPct = Math.round((item.completed / item.requests) * 100);
            bar.style.background = `linear-gradient(to top, var(--act) ${compPct}%, var(--bad-ink) 0%)`;
          }

          const label = document.createElement("div");
          label.className = "chart-bar-label";
          label.textContent = item.bucket.length > 7 ? item.bucket.slice(5) : item.bucket;

          col.addEventListener("mouseenter", () => {
            if (chartHoverInfo) {
              const comp = item.completed || 0;
              const fail = item.failed || 0;
              const reqs = item.requests || 0;
              const reuses = item.reuses || 0;
              const size = formatBytes(item.bytes || 0);
              chartHoverInfo.innerHTML = `<strong>${escapeHtml(item.bucket)}</strong> &nbsp;·&nbsp; 📥 <strong>${reqs}</strong> Requests &nbsp;·&nbsp; <span style="color:var(--good-ink);">✅ <strong>${comp}</strong> Done</span> &nbsp;·&nbsp; <span style="color:#10b981;">♻️ <strong>${reuses}</strong> Reuses</span> &nbsp;·&nbsp; <span style="color:var(--bad-ink);">❌ <strong>${fail}</strong> Failed</span> &nbsp;·&nbsp; 💾 <strong>${size}</strong>`;
              chartHoverInfo.classList.add("is-active");
            }
          });
          col.addEventListener("mouseleave", () => {
            if (chartHoverInfo) {
              chartHoverInfo.innerHTML = "Hover over any bar to inspect daily breakdown";
              chartHoverInfo.classList.remove("is-active");
            }
          });

          col.append(tooltip, bar, label);
          analyticsChartContainer.appendChild(col);
        });
      }
    }

    // Platform Split
    const artlistCount = (data.platforms && data.platforms.artlist) ? data.platforms.artlist.count : 0;
    const envatoCount = (data.platforms && data.platforms.envato) ? data.platforms.envato.count : 0;
    const totalPlatformCount = artlistCount + envatoCount;

    if (platformCountArtlist) platformCountArtlist.textContent = `${artlistCount} (${totalPlatformCount ? Math.round((artlistCount / totalPlatformCount) * 100) : 50}%)`;
    if (platformCountEnvato) platformCountEnvato.textContent = `${envatoCount} (${totalPlatformCount ? Math.round((envatoCount / totalPlatformCount) * 100) : 50}%)`;

    const artlistPct = totalPlatformCount ? Math.round((artlistCount / totalPlatformCount) * 100) : 50;
    const envatoPct = totalPlatformCount ? 100 - artlistPct : 50;
    if (platformBarArtlist) platformBarArtlist.style.width = `${artlistPct}%`;
    if (platformBarEnvato) platformBarEnvato.style.width = `${envatoPct}%`;

    // Category Distribution Pills
    if (analyticsCategoryPills) {
      analyticsCategoryPills.textContent = "";
      const cats = data.categories || [];
      if (cats.length === 0) {
        analyticsCategoryPills.innerHTML = '<span class="pane-subtitle">No categorized downloads</span>';
      } else {
        cats.forEach(c => {
          const pill = document.createElement("span");
          pill.className = "category-stat-chip";
          const catPretty = c.category.replace("-", " ").replace(/\b\w/g, l => l.toUpperCase());
          pill.innerHTML = `<span>${escapeHtml(catPretty)}</span> <strong>${c.count}</strong> <span style="opacity:0.6;">(${formatBytes(c.bytes)})</span>`;
          analyticsCategoryPills.appendChild(pill);
        });
      }
    }

    // Top Reused Studio Assets Showcase
    if (topReusedList) {
      topReusedList.textContent = "";
      const topReused = data.top_reused || [];
      if (topReused.length === 0) {
        topReusedList.innerHTML = '<div class="empty-placeholder is-inline">No reuse events recorded yet in this timeframe</div>';
      } else {
        topReused.forEach((item, idx) => {
          const row = document.createElement("div");
          row.className = "top-reused-item";

          const rankDiv = document.createElement("div");
          rankDiv.className = "top-reused-rank";
          rankDiv.textContent = `#${idx + 1}`;

          const infoDiv = document.createElement("div");
          infoDiv.className = "top-reused-info";

          const titleDiv = document.createElement("div");
          titleDiv.className = "top-reused-title";
          titleDiv.textContent = shortTitle(item.title) || item.filename || item.track_id;

          const metaDiv = document.createElement("div");
          metaDiv.className = "top-reused-meta";
          const prov = (item.provider || "artlist").toLowerCase();
          metaDiv.innerHTML = `
            <span class="provider-badge ${escapeHtml(prov)}">${escapeHtml(prov)}</span>
            ${item.category ? `<span>${escapeHtml(item.category)}</span>` : ''}
            ${item.original_downloader ? `<span>Licensed by: @${escapeHtml(item.original_downloader)}</span>` : ''}
          `;

          infoDiv.append(titleDiv, metaDiv);

          const metricDiv = document.createElement("div");
          metricDiv.className = "top-reused-metric";
          metricDiv.innerHTML = `
            <div class="top-reused-count">♻️ ${item.reuse_count} reuses</div>
            <div class="top-reused-savings">${item.bytes_saved_formatted || item.formatted_saved || formatBytes(item.bytes_saved || item.total_bytes_saved || 0)} saved</div>
          `;

          row.append(rankDiv, infoDiv, metricDiv);
          topReusedList.appendChild(row);
        });
      }
    }

    // Editor Utilization Leaderboard
    if (analyticsLeaderboardTbody) {
      analyticsLeaderboardTbody.textContent = "";
      const editors = data.leaderboard || [];
      if (editors.length === 0) {
        analyticsLeaderboardTbody.innerHTML = '<tr><td colspan="6" class="table-placeholder-cell">No editor activity recorded in this period</td></tr>';
      } else {
        editors.forEach((ed, idx) => {
          const tr = document.createElement("tr");

          const rankTd = document.createElement("td");
          rankTd.style.fontWeight = "700";
          rankTd.style.fontFamily = "var(--font-mono)";
          rankTd.style.color = idx === 0 ? "#ff6b2b" : idx === 1 ? "#82b440" : "var(--n-9)";
          rankTd.textContent = `#${idx + 1}`;

          const nameTd = document.createElement("td");
          nameTd.innerHTML = `<button type="button" class="btn-user-link" title="View @${escapeHtml(ed.username)} detailed report"><strong>${escapeHtml(ed.full_name || ed.username)}</strong></button> <span style="font-size:11px; color:var(--n-8);">(@${escapeHtml(ed.username)})</span>`;
          nameTd.querySelector(".btn-user-link").addEventListener("click", () => openUserDetailReport(ed.username));

          const reqTd = document.createElement("td");
          reqTd.className = "mono";
          reqTd.textContent = ed.total_requests;

          const compTd = document.createElement("td");
          compTd.className = "mono";
          compTd.innerHTML = `<span class="status-badge-active" style="display:inline-block; padding:2px 8px;">${ed.completed}</span>`;

          const bytesTd = document.createElement("td");
          bytesTd.className = "mono";
          bytesTd.textContent = formatBytes(ed.bytes);

          const activeTd = document.createElement("td");
          activeTd.style.fontSize = "11px";
          activeTd.style.color = "var(--n-8)";
          activeTd.textContent = formatDateTime(ed.last_active);

          tr.append(rankTd, nameTd, reqTd, compTd, bytesTd, activeTd);
          analyticsLeaderboardTbody.appendChild(tr);
        });
      }
    }
  }

  document.querySelectorAll(".analytics-period-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      fetchAdminAnalytics(btn.dataset.period);
    });
  });

  if (btnExportAnalytics) {
    btnExportAnalytics.addEventListener("click", () => {
      showToast("Exporting studio analytics report…");
      window.location.href = `/api/v1/admin/analytics/export?period=${encodeURIComponent(currentAnalyticsPeriod)}`;
    });
  }

  if (btnRefreshAnalytics) {
    btnRefreshAnalytics.addEventListener("click", () => fetchAdminAnalytics(currentAnalyticsPeriod));
  }

  // --- Admin: Disaster Recovery & Backup Tab --------------------------------
  let cachedBackupsData = [];

  async function fetchAdminBackups() {
    try {
      const res = await apiFetch("/api/v1/admin/backup/list");
      if (!res.ok) return;
      const data = await res.json();
      if (backupDirectoryDisplay) {
        backupDirectoryDisplay.textContent = `Location: ${data.backup_directory || './backups'}`;
      }
      if (settingBackupDirectory && !settingBackupDirectory.value) {
        settingBackupDirectory.value = data.backup_directory || "";
      }
      cachedBackupsData = data.backups || [];
      renderAdminBackupsTable(cachedBackupsData);
    } catch (err) {
      console.error("fetchAdminBackups failed:", err);
    }
  }

  function renderAdminBackupsTable(backups) {
    if (!adminBackupsTbody) return;
    if (!backups || backups.length === 0) {
      adminBackupsTbody.innerHTML = '<tr><td colspan="4" class="table-placeholder-cell">No backup snapshots found. Click "Create Local Snapshot Now" to generate one.</td></tr>';
      return;
    }

    const frag = document.createDocumentFragment();
    backups.forEach(b => {
      const tr = document.createElement("tr");

      const fileTd = document.createElement("td");
      fileTd.innerHTML = `<strong>📦 ${escapeHtml(b.filename)}</strong>`;

      const dateTd = document.createElement("td");
      dateTd.style.fontSize = "11px";
      dateTd.style.color = "var(--n-8)";
      dateTd.textContent = formatDateTime(b.created_at);

      const sizeTd = document.createElement("td");
      sizeTd.className = "mono";
      sizeTd.textContent = b.formatted_size || formatBytes(b.size_bytes);

      const actTd = document.createElement("td");
      actTd.className = "col-actions";

      const restoreBtn = document.createElement("button");
      restoreBtn.type = "button";
      restoreBtn.className = "table-action-btn danger";
      restoreBtn.textContent = "↻ Restore";
      restoreBtn.title = "Restore database from this snapshot";
      restoreBtn.addEventListener("click", () => {
        openConfirmModal(
          "Restore Database Backup",
          "Emergency Disaster Recovery",
          `Are you sure you want to restore the live database from <strong>${escapeHtml(b.filename)}</strong>?<br><br><span style="color:var(--n-10);">A safety snapshot of the current state will be created automatically before restoration.</span>`,
          "Confirm & Restore",
          true,
          async () => {
            try {
              showToast("Restoring database from snapshot…");
              const rRes = await apiFetch("/api/v1/admin/backup/restore", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: b.filename })
              });
              const rData = await rRes.json();
              if (rRes.ok) {
                showToast("✓ " + (rData.message || "Database restored successfully!"));
                await fetchAdminBackups();
                await fetchStatus();
                await fetchLibrary("", currentCategory, true);
              } else {
                showToast(rData.detail || "Restore failed.");
              }
            } catch (err) {
              showToast("Restore error: " + err);
            }
          }
        );
      });

      actTd.appendChild(restoreBtn);
      tr.append(fileTd, dateTd, sizeTd, actTd);
      frag.appendChild(tr);
    });

    adminBackupsTbody.replaceChildren(frag);
  }

  if (btnDownloadBackupDirect) {
    btnDownloadBackupDirect.addEventListener("click", () => {
      showToast("Generating live online database backup…");
      window.location.href = "/api/v1/admin/backup/download";
    });
  }

  if (btnCreateBackupNow) {
    btnCreateBackupNow.addEventListener("click", async () => {
      btnCreateBackupNow.disabled = true;
      btnCreateBackupNow.textContent = "Creating Snapshot…";
      try {
        const res = await apiFetch("/api/v1/admin/backup/create", { method: "POST" });
        const data = await res.json();
        if (res.ok) {
          showToast(`✓ Backup created: ${data.filename}`);
          fetchAdminBackups();
        } else {
          showToast(data.detail || "Backup creation failed");
        }
      } catch (e) {
        showToast("Backup error: " + e);
      } finally {
        btnCreateBackupNow.disabled = false;
        btnCreateBackupNow.textContent = "+ Create Local Snapshot Now";
      }
    });
  }

  if (btnRefreshBackups) {
    btnRefreshBackups.addEventListener("click", fetchAdminBackups);
  }

  if (btnSaveBackupDir) {
    btnSaveBackupDir.addEventListener("click", async () => {
      const bdir = settingBackupDirectory ? settingBackupDirectory.value.trim() : "";
      const autoE = settingBackupAutoToggle ? settingBackupAutoToggle.checked : true;
      try {
        const res = await apiFetch("/api/v1/admin/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backup_directory: bdir, backup_auto_enabled: autoE })
        });
        if (res.ok) {
          showToast("✓ Backup directory & schedule saved!");
          fetchAdminBackups();
        } else {
          const d = await res.json();
          showToast(d.detail || "Failed to save backup path");
        }
      } catch (e) {
        showToast("Error: " + e);
      }
    });
  }

  // --- Admin: Audit Tab (With Live Search & Multi-Column Sorting) ---
  const adminAuditSearch = document.getElementById("admin-audit-search");
  const adminAuditSearchClear = document.getElementById("admin-audit-search-clear");
  let cachedAdminAuditLogs = [];
  let adminAuditSortCol = "created_at";
  let adminAuditSortDir = "desc";
  let adminAuditSearchQuery = "";
  let currentAuditFilterType = "all";

  document.querySelectorAll(".activity-pill-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".activity-pill-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentAuditFilterType = btn.dataset.auditFilter || "all";
      applyAdminAuditFilterAndRender();
    });
  });

  function updateAdminAuditSortHeaderUI() {
    document.querySelectorAll(".admin-data-table th[data-audit-sort]").forEach(th => {
      const col = th.dataset.auditSort;
      const icon = th.querySelector(".sort-icon");
      if (col === adminAuditSortCol && adminAuditSortDir !== "none") {
        th.classList.add("is-sorted");
        if (icon) icon.textContent = adminAuditSortDir === "asc" ? "▲" : "▼";
      } else {
        th.classList.remove("is-sorted");
        if (icon) icon.textContent = "⇅";
      }
    });
  }

  function sortAdminAuditList(logs, col, dir) {
    if (!col || dir === "none") return logs;
    return [...logs].sort((a, b) => {
      let valA, valB;
      if (col === "created_at") {
        valA = new Date(a.created_at || 0).getTime();
        valB = new Date(b.created_at || 0).getTime();
        return dir === "asc" ? valA - valB : valB - valA;
      }
      if (col === "requested_by") {
        valA = (a.requested_by || "").toLowerCase();
        valB = (b.requested_by || "").toLowerCase();
        return dir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (col === "title") {
        valA = (a.title || a.filename || a.track_id || "").toLowerCase();
        valB = (b.title || b.filename || b.track_id || "").toLowerCase();
        return dir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (col === "provider") {
        valA = (a.provider || "").toLowerCase();
        valB = (b.provider || "").toLowerCase();
        return dir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (col === "bytes") {
        valA = Number(a.bytes || 0);
        valB = Number(b.bytes || 0);
        return dir === "asc" ? valA - valB : valB - valA;
      }
      if (col === "status") {
        valA = (a.status || "").toLowerCase();
        valB = (b.status || "").toLowerCase();
        return dir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return 0;
    });
  }

  function renderAdminAuditTable(logs) {
    if (!adminAuditTbody) return;
    if (!logs || logs.length === 0) {
      adminAuditTbody.innerHTML = '<tr><td colspan="7" class="table-placeholder-cell">No matching activity logs found</td></tr>';
      return;
    }

    const frag = document.createDocumentFragment();
    logs.forEach(l => {
      const tr = document.createElement("tr");

      const timeTd = document.createElement("td");
      timeTd.style.fontSize = "11px";
      timeTd.style.color = "var(--n-8)";
      timeTd.textContent = formatDateTime(l.created_at);

      const eventTd = document.createElement("td");
      const evtType = l.event_type || (l.is_reuse ? "reuse" : (l.status === "cancelled" ? "cancelled" : "download"));
      if (evtType === "reuse") {
        eventTd.innerHTML = '<span class="pill-action reuse">♻️ Reuse</span>';
      } else if (evtType === "cancelled") {
        eventTd.innerHTML = '<span class="pill-action cancelled">🚫 Cancelled</span>';
      } else {
        eventTd.innerHTML = '<span class="pill-action download">⬇️ Download</span>';
      }

      const userTd = document.createElement("td");
      const reqName = l.requested_by || 'studio';
      const origName = l.original_downloader;
      const showOrig = (evtType === "reuse" || l.is_reuse) && origName && origName !== reqName && origName !== "studio";
      userTd.innerHTML = `<button type="button" class="btn-user-link user-badge-chip" title="View @${escapeHtml(reqName)} report">👤 ${escapeHtml(reqName)}</button>${showOrig ? `<div style="font-size:11px; color:var(--n-8); margin-top:2px;">Orig: @${escapeHtml(origName)}</div>` : ''}`;
      userTd.querySelector(".btn-user-link").addEventListener("click", () => openUserDetailReport(reqName));

      const assetTd = document.createElement("td");
      assetTd.innerHTML = `<strong>${escapeHtml(shortTitle(l.title) || l.filename || l.track_id)}</strong>${l.filename ? `<div style="font-size:11px; color:var(--n-8);">${escapeHtml(l.filename)}</div>` : ''}`;

      const provTd = document.createElement("td");
      provTd.innerHTML = `<span class="provider-badge ${(l.provider || 'artlist').toLowerCase()}">${escapeHtml(l.provider || 'artlist')}</span>`;

      const sizeTd = document.createElement("td");
      sizeTd.className = "mono";
      sizeTd.textContent = formatBytes(l.bytes);

      const statusTd = document.createElement("td");
      if (l.status === 'completed' || l.status === 'done') {
        statusTd.innerHTML = '<span class="status-badge-active">Completed</span>';
      } else if (l.status === 'failed') {
        const cancelUser = l.cancelled_by || (l.error && l.error.toLowerCase().includes("cancelled by") ? l.error : null);
        const failLabel = cancelUser ? (l.cancelled_by ? `Cancelled (${escapeHtml(l.cancelled_by)})` : escapeHtml(l.error)) : "Failed";
        statusTd.innerHTML = `<span class="status-badge-disabled" title="${escapeHtml(l.error || 'Failed')}">${failLabel}</span>`;
        const resumeBtn = document.createElement("button");
        resumeBtn.type = "button";
        resumeBtn.className = "btn-retry-action is-compact";
        resumeBtn.textContent = "↻ Resume";
        resumeBtn.title = "Resume / re-queue this download for the team";
        resumeBtn.style.marginLeft = "8px";
        resumeBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          resumeBtn.disabled = true;
          resumeBtn.textContent = "Resuming…";
          try {
            const jobId = l.id || l.job_id;
            const res = await apiFetch(`/api/v1/jobs/${encodeURIComponent(jobId)}/retry`, { method: "POST" });
            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.detail || "Failed to resume download");
            }
            showToast(`↻ Resumed download for ${l.requested_by || 'studio'}`);
            await fetchAdminAudit();
            await fetchQueue();
          } catch (err) {
            showToast(err.message || String(err));
            resumeBtn.disabled = false;
            resumeBtn.textContent = "↻ Resume";
          }
        });
        statusTd.appendChild(resumeBtn);
      } else if (l.status === 'cancelled') {
        statusTd.innerHTML = `<span class="pill-badge" style="background:var(--n-3); color:var(--n-8);">${l.cancelled_by ? `Cancelled (${escapeHtml(l.cancelled_by)})` : 'Cancelled'}</span>`;
      } else {
        statusTd.innerHTML = `<span class="pill-badge">${escapeHtml(l.status)}</span>`;
      }

      tr.append(timeTd, eventTd, userTd, assetTd, provTd, sizeTd, statusTd);
      frag.appendChild(tr);
    });

    adminAuditTbody.replaceChildren(frag);
  }

  function applyAdminAuditFilterAndRender() {
    let list = cachedAdminAuditLogs;

    // Filter by Event Type Pill
    if (currentAuditFilterType === "download") {
      list = list.filter(l => (l.event_type === "download" || (!l.is_reuse && l.status !== "cancelled" && l.status !== "failed")));
    } else if (currentAuditFilterType === "reuse") {
      list = list.filter(l => (l.event_type === "reuse" || l.is_reuse || l.source === "web_library" || l.source === "cache_reuse"));
    } else if (currentAuditFilterType === "cancelled") {
      list = list.filter(l => (l.event_type === "cancelled" || l.status === "cancelled" || Boolean(l.cancelled_by)));
    }

    const q = adminAuditSearchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(l => {
        const u = (l.requested_by || "").toLowerCase();
        const c = (l.cancelled_by || "").toLowerCase();
        const o = (l.original_downloader || "").toLowerCase();
        const t = (l.title || "").toLowerCase();
        const f = (l.filename || "").toLowerCase();
        const p = (l.provider || "").toLowerCase();
        const s = (l.status || "").toLowerCase();
        const id = (l.track_id || "").toLowerCase();
        return u.includes(q) || c.includes(q) || o.includes(q) || t.includes(q) || f.includes(q) || p.includes(q) || s.includes(q) || id.includes(q);
      });
    }

    const sorted = sortAdminAuditList(list, adminAuditSortCol, adminAuditSortDir);
    renderAdminAuditTable(sorted);
  }

  async function fetchAdminAudit() {
    if (!adminAuditTbody) return;
    try {
      const res = await apiFetch("/api/v1/admin/audit");
      if (!res.ok) return;
      cachedAdminAuditLogs = await res.json();
      applyAdminAuditFilterAndRender();
      updateAdminAuditSortHeaderUI();
    } catch (e) {
      console.error("fetchAdminAudit failed:", e);
    }
  }

  let adminAuditSearchRAF = null;
  if (adminAuditSearch) {
    adminAuditSearch.addEventListener("input", (e) => {
      adminAuditSearchQuery = e.target.value;
      if (adminAuditSearchClear) {
        adminAuditSearchClear.classList.toggle("hidden", !adminAuditSearchQuery);
      }
      if (adminAuditSearchRAF) cancelAnimationFrame(adminAuditSearchRAF);
      adminAuditSearchRAF = requestAnimationFrame(() => {
        applyAdminAuditFilterAndRender();
      });
    });
  }

  if (adminAuditSearchClear) {
    adminAuditSearchClear.addEventListener("click", () => {
      if (adminAuditSearch) adminAuditSearch.value = "";
      adminAuditSearchQuery = "";
      adminAuditSearchClear.classList.add("hidden");
      applyAdminAuditFilterAndRender();
    });
  }

  document.querySelectorAll(".admin-data-table th[data-audit-sort]").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.dataset.auditSort;
      if (adminAuditSortCol === col) {
        if (adminAuditSortDir === "asc") adminAuditSortDir = "desc";
        else if (adminAuditSortDir === "desc") {
          adminAuditSortDir = "none";
          adminAuditSortCol = null;
        } else {
          adminAuditSortDir = "asc";
        }
      } else {
        adminAuditSortCol = col;
        adminAuditSortDir = "asc";
      }
      updateAdminAuditSortHeaderUI();
      applyAdminAuditFilterAndRender();
    });
  });

  if (btnRefreshAudit) btnRefreshAudit.addEventListener("click", fetchAdminAudit);

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
    if (u.includes("elements.envato.com")) {
      if (u.includes("/audio") || u.includes("/sound-effects")) {
        return { name: "Envato", type: "audio", badge: "Envato • Audio", cls: "envato", isAudio: true };
      }
      if (u.includes("/video-templates")) {
        return { name: "Envato", type: "video-template", badge: "Envato • Video Template", cls: "envato", isAudio: false };
      }
      if (u.includes("/stock-video")) {
        return { name: "Envato", type: "stock-video", badge: "Envato • Stock Video", cls: "envato", isAudio: false };
      }
      if (u.includes("/graphic-templates") || u.includes("/3d")) {
        return { name: "Envato", type: "graphic-template", badge: "Envato • Graphic / 3D", cls: "envato", isAudio: false };
      }
      return { name: "Envato", type: "elements", badge: "Envato Elements", cls: "envato", isAudio: false };
    }
    return null;
  }

  // --- Command Bar: Dual-Mode Controller -----------------------------------
  let commandMode = "search";
  let lastLookupUrl = null;

  function looksLikeUrl(text) {
    return /^https?:\/\//i.test(text.trim()) || /^(artlist\.io|elements\.envato\.com)/i.test(text.trim());
  }

  function setCommandMode(mode) {
    if (commandMode === mode) return;
    commandMode = mode;
    commandBar.classList.toggle("is-bridge", mode === "bridge");
    commandIcon.innerHTML = mode === "bridge" ? LINK_ICON : SEARCH_ICON;
    commandKbd.classList.toggle("hidden", mode === "bridge");
    commandOptions.classList.toggle("hidden", mode !== "bridge");
    if (mode === "search") {
      urlDetectedBadge.classList.add("hidden");
      hideResolution();
    }
  }

  function updateUrlInputState() {
    const val = commandInput.value.trim();
    urlClearBtn.classList.toggle("hidden", !val);

    if (looksLikeUrl(val)) {
      setCommandMode("bridge");
      const provider = detectProvider(val);
      if (provider) {
        urlDetectedBadge.textContent = provider.badge;
        urlDetectedBadge.className = `detected-badge ${provider.cls}`;
        urlDetectedBadge.classList.remove("hidden");
        if (audioFormatGroup) {
          audioFormatGroup.classList.toggle("hidden", !provider.isAudio);
        }
      } else {
        urlDetectedBadge.classList.add("hidden");
      }
      scheduleLookup(val);
    } else {
      setCommandMode("search");
      lastLookupUrl = null;
      hideResolution();
      isDisplayingSingleMatch = false;
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        fetchLibrary(val, currentCategory, true);
        updateFilterEcho(val);
      }, 120);
    }
  }

  function updateFilterEcho(query) {
    if (!filterEcho) return;
    if (query) {
      filterEcho.textContent = `filtering: “${query}”`;
      filterEcho.classList.remove("hidden");
    } else {
      filterEcho.classList.add("hidden");
    }
  }

  commandInput.addEventListener("input", updateUrlInputState);

  commandInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      commandInput.value = "";
      updateUrlInputState();
      commandInput.blur();
    }
  });

  urlClearBtn.addEventListener("click", () => {
    commandInput.value = "";
    updateUrlInputState();
    commandInput.focus();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== commandInput && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      commandInput.focus();
      commandInput.select();
    }
  });

  let lookupDebounce = null;
  let isDisplayingSingleMatch = false;

  function scheduleLookup(url) {
    clearTimeout(lookupDebounce);
    lookupDebounce = setTimeout(() => runLookup(url), 180);
  }

  async function runLookup(url) {
    if (!url || url === lastLookupUrl) return;
    lastLookupUrl = url;
    const variant = trackVariantSelect ? trackVariantSelect.value : "main";

    showResolution("checking", "Checking archive…", "Seeing if this asset is already licensed.");

    try {
      const res = await apiFetch(`/api/v1/library/lookup?url=${encodeURIComponent(url)}&variant=${encodeURIComponent(variant)}`);
      if (!res.ok) {
        hideResolution();
        return;
      }
      const data = await res.json();

      if (data.state === "cached") {
        const title = shortTitle(data.title) || data.filename || data.track_id;
        const actualBytes = data.bytes || data.file_size || 0;
        const sizeStr = formatBytes(actualBytes);
        const reqUser = data.requested_by || 'studio_editor';
        const provName = (data.provider || 'Artlist').toUpperCase();
        const catName = (data.category || 'Music').toUpperCase();

        const badgeHtml = `<span class="resolution-badge-pill">✓ Archive Hit</span>`;
        const sizePill = `<span class="resolution-meta-pill">${sizeStr}</span>`;
        const userPill = `<span class="resolution-meta-pill">👤 ${escapeHtml(reqUser)}</span>`;
        const provPill = `<span class="resolution-meta-pill">${provName} · ${catName}</span>`;

        const actionButtons = [
          { label: "▶ Play Preview", action: () => playFromLookup(data), isPrimary: true },
          { label: "⬇ Download File", action: (btn) => downloadFile(data, btn) },
        ];

        showResolution(
          "cached",
          `${badgeHtml} <strong>${escapeHtml(title)}</strong>`,
          `<span>${provPill} ${sizePill} ${userPill} · Reused ${data.hit_count || 0}×</span>`,
          actionButtons
        );
        submitBtn.classList.add("is-secondary");
        submitBtn.querySelector(".btn-text").textContent = "Re-Download Asset";

        // Strictly isolate and show ONLY this matched track in the table!
        isDisplayingSingleMatch = true;
        renderTracksInTable([data], true);
      } else if (data.state === "queued") {
        showResolution("queued", "Already queued", `Status: ${data.job_status}. Currently in transit.`);
        submitBtn.classList.remove("is-secondary");
        submitBtn.querySelector(".btn-text").textContent = "Download to Library";
        if (isDisplayingSingleMatch) {
          isDisplayingSingleMatch = false;
          fetchLibrary("", currentCategory, true);
        }
      } else if (data.state === "invalid") {
        showResolution("invalid", "Link not recognised", data.reason || "Unable to parse asset.");
        if (isDisplayingSingleMatch) {
          isDisplayingSingleMatch = false;
          fetchLibrary("", currentCategory, true);
        }
      } else {
        hideResolution();
        submitBtn.classList.remove("is-secondary");
        submitBtn.querySelector(".btn-text").textContent = "Download to Library";
        if (isDisplayingSingleMatch) {
          isDisplayingSingleMatch = false;
          fetchLibrary("", currentCategory, true);
        }
      }
    } catch (e) {
      hideResolution();
    }
  }

  function showResolution(state, titleHtml, detailHtml, actions) {
    resolutionStrip.className = `resolution-strip state-${state} is-${state}`;
    resolutionTitle.innerHTML = titleHtml;
    resolutionDetail.innerHTML = detailHtml || "";
    resolutionActions.textContent = "";

    if (actions && actions.length) {
      actions.forEach((a) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `btn-resolution-action ${a.isPrimary ? "primary" : ""}`;
        btn.textContent = a.label;
        btn.addEventListener("click", () => a.action(btn));
        resolutionActions.appendChild(btn);
      });
    }
    resolutionStrip.classList.remove("hidden");
  }

  function hideResolution() {
    resolutionStrip.classList.add("hidden");
    resolutionActions.textContent = "";
  }

  function playFromLookup(data) {
    playAudioTrack({
      track_id: data.track_id,
      title: data.title,
      filename: data.filename,
      variant: data.variant || "main",
      streamable: data.streamable !== false,
      category: data.category || "music",
    });
  }

  if (trackVariantSelect) {
    trackVariantSelect.addEventListener("change", () => {
      if (commandMode === "bridge") {
        lastLookupUrl = null;
        runLookup(commandInput.value.trim());
      }
    });
  }

  // --- Audio Player Controller ---------------------------------------------
  function formatPlayerTime(sec) {
    if (isNaN(sec) || sec === Infinity) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  function updatePlayerPlayIcon(isPlaying) {
    if (playerPlayIcon) {
      playerPlayIcon.innerHTML = isPlaying
        ? `<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>`
        : `<polygon points="6 4 20 12 6 20 6 4"></polygon>`;
    }
    document.querySelectorAll(".btn-table-play").forEach((btn) => {
      const isThisTrack = btn.dataset.trackId === currentPlayingTrackId;
      btn.classList.toggle("is-playing", isThisTrack && isPlaying);
      btn.innerHTML = isThisTrack && isPlaying
        ? `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`
        : `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    });
  }

  function describeAudioFailure(err) {
    if (!navigator.onLine) return "Preview failed: computer is offline";
    return "Preview unavailable: file missing from host disk";
  }

  function playAudioTrack(track) {
    if (!isAudioCategory(track.category)) {
      showToast("Audio preview only available for music/SFX tracks");
      return;
    }

    if (currentPlayingTrackId === track.track_id && currentPlayingVariant === track.variant) {
      if (currentAudio.paused) {
        currentAudio.play().catch((err) => showToast(describeAudioFailure(err)));
      } else {
        currentAudio.pause();
      }
      return;
    }

    currentPlayingTrackId = track.track_id;
    currentPlayingVariant = track.variant || "main";
    playerTitle.textContent = shortTitle(track.title) || track.filename;
    playerSub.textContent = `${track.filename} · Streaming from local library`;

    const streamUrl = `/api/v1/library/stream/${encodeURIComponent(track.track_id)}?variant=${encodeURIComponent(currentPlayingVariant)}&token=${encodeURIComponent(getActiveToken())}`;

    currentAudio.pause();
    currentAudio.src = streamUrl;
    currentAudio.load();

    audioPlayerBar.classList.remove("hidden");
    currentAudio.play().catch((err) => {
      console.warn("Autoplay block:", err);
      showToast(describeAudioFailure(err));
    });
  }

  if (playerPlayBtn) {
    playerPlayBtn.addEventListener("click", () => {
      if (currentAudio.src) {
        if (currentAudio.paused) {
          currentAudio.play().catch((err) => showToast(describeAudioFailure(err)));
        } else {
          currentAudio.pause();
        }
      }
    });
  }

  if (playerCloseBtn) {
    playerCloseBtn.addEventListener("click", () => {
      currentAudio.pause();
      currentAudio.src = "";
      currentPlayingTrackId = null;
      currentPlayingVariant = null;
      updatePlayerPlayIcon(false);
      audioPlayerBar.classList.add("hidden");
    });
  }

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

  currentAudio.addEventListener("loadedmetadata", () => {
    if (!isNaN(currentAudio.duration)) {
      playerDuration.textContent = formatPlayerTime(currentAudio.duration);
    }
  });

  currentAudio.addEventListener("error", () => {
    if (!currentAudio.src) return;
    showToast(describeAudioFailure(null));
    updatePlayerPlayIcon(false);
  });

  currentAudio.addEventListener("play", () => updatePlayerPlayIcon(true));
  currentAudio.addEventListener("pause", () => updatePlayerPlayIcon(false));

  if (playerScrubber) {
    playerScrubber.addEventListener("input", (e) => {
      if (!isNaN(currentAudio.duration)) {
        const seekTo = (e.target.value / 100) * currentAudio.duration;
        currentAudio.currentTime = seekTo;
      }
    });
  }

  // --- Tactile File Actions: Copy, Reveal, Download -------------------------
  function copyPath(path, btnEl) {
    function flashBtn() {
      if (btnEl) {
        const original = btnEl.innerHTML;
        btnEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--ok-ink)" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>`;
        setTimeout(() => { btnEl.innerHTML = original; }, 1400);
      }
    }

    function fallbackCopy(text) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "-9999px";
      ta.setAttribute("readonly", "");
      document.body.appendChild(ta);
      ta.select();
      try {
        const successful = document.execCommand("copy");
        if (successful) {
          showToast("Path copied to clipboard!");
          flashBtn();
        } else {
          showToast("Failed to copy path");
        }
      } catch (err) {
        showToast("Copy notice: " + err);
      }
      ta.remove();
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(path)
        .then(() => {
          showToast("Path copied to clipboard!");
          flashBtn();
        })
        .catch(() => fallbackCopy(path));
    } else {
      fallbackCopy(path);
    }
  }

  async function revealFile(track) {
    try {
      showToast("Opening folder on host machine...");
      const res = await apiFetch(`/api/v1/library/${encodeURIComponent(track.track_id)}/reveal?variant=${encodeURIComponent(track.variant || 'main')}`, {
        method: "POST"
      });
      const data = await res.json();
      if (data.status === "opened") {
        showToast("Opened in File Explorer on host machine!");
      }
    } catch (err) {
      showToast("Folder reveal notice: " + err);
    }
  }

  const activeDownloads = new Set();

  function downloadFile(track, btnEl) {
    const key = `${track.track_id}_${track.variant || 'main'}`;
    if (activeDownloads.has(key)) {
      showToast("Download already initiated, please wait a moment...");
      return;
    }
    activeDownloads.add(key);

    if (btnEl) {
      btnEl.disabled = true;
      const originalHtml = btnEl.innerHTML;
      btnEl.style.opacity = "0.7";
      btnEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: spin 0.8s linear infinite;"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg>`;
      setTimeout(() => {
        btnEl.disabled = false;
        btnEl.style.opacity = "";
        btnEl.innerHTML = originalHtml;
        activeDownloads.delete(key);
      }, 3500);
    } else {
      setTimeout(() => activeDownloads.delete(key), 3500);
    }
    showToast(`Downloading ${track.filename || 'asset'}...`);

    // Direct user-initiated attachment download stream
    const fileUrl = `/api/v1/library/file?track_id=${encodeURIComponent(track.track_id)}&variant=${encodeURIComponent(track.variant || 'main')}&token=${encodeURIComponent(getActiveToken())}`;

    const a = document.createElement("a");
    a.href = fileUrl;
    a.setAttribute("download", track.filename || "asset");
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      a.remove();
    }, 2000);
  }

  // --- Render In-Flight & Queue ---------------------------------------------
  const PHASE_NAMES = [
    "opening_tab", "page_loading", "dismissing_modals",
    "reading_title", "preview_playing", "locating_download",
    "selecting_variant", "selecting_format", "downloading", "moving"
  ];

  const PHASE_PERCENT_MAP = {
    "queued": 8,
    "opening_tab": 18,
    "page_loading": 32,
    "dismissing_modals": 42,
    "reading_title": 52,
    "preview_playing": 58,
    "locating_download": 68,
    "selecting_variant": 78,
    "selecting_format": 78,
    "downloading": 88,
    "moving": 96,
    "done": 100,
    "failed": 100
  };

  function renderInFlight(job) {
    hasActiveInFlight = !!job;
    if (!job) {
      inFlightContainer.classList.add("hidden");
      clock.elapsed = null;
      return;
    }

    inFlightContainer.classList.remove("hidden");
    inFlightTitle.textContent = shortTitle(job.title) || job.track_id;
    inFlightVariant.textContent = (job.variant || "MAIN").toUpperCase();
    if (inFlightUser) {
      const reqUser = job.requested_by || "studio";
      inFlightUser.textContent = `👤 ${reqUser}`;
      inFlightUser.title = `Requested by ${reqUser}`;
    }
    inFlightPhase.textContent = job.phase_detail || job.phase_label || "Processing…";

    if (clock.elapsed === null) {
      clock.elapsed = job.elapsed_seconds || 0;
    }
    inFlightElapsed.textContent = fmtClock(clock.elapsed);
    inFlightTimeout.textContent = fmtClock(job.timeout_seconds || 180);

    // Multi-segment Stepper Bar
    phaseTrack.textContent = "";
    const totalSteps = PHASE_NAMES.length;
    const curIdx = PHASE_NAMES.indexOf(job.phase);
    for (let i = 0; i < totalSteps; i++) {
      const pip = document.createElement("div");
      pip.className = `stepper-pip ${i < curIdx ? "is-done" : i === curIdx ? "is-active" : ""}`;
      phaseTrack.appendChild(pip);
    }

    // Always-Active Progress Bar Meter
    if (dlProgress) {
      dlProgress.classList.remove("hidden");
      
      let pct = PHASE_PERCENT_MAP[job.phase] || 40;
      if (job.phase === "downloading") {
        if (job.total_bytes > 0 && job.progress_bytes > 0) {
          const dlRatio = Math.min(1, job.progress_bytes / job.total_bytes);
          pct = Math.round(75 + (dlRatio * 20));
          dlText.textContent = `${formatBytes(job.progress_bytes)} / ${formatBytes(job.total_bytes)}`;
        } else if (job.progress_bytes > 0) {
          pct = 88;
          dlText.textContent = `${formatBytes(job.progress_bytes)} streamed`;
        } else {
          pct = 82;
          dlText.textContent = "Streaming download stream...";
        }
      } else if (job.phase === "moving") {
        pct = 96;
        dlText.textContent = "Archiving to studio library...";
      } else {
        dlText.textContent = job.phase_detail || job.phase_label || "Initializing relay...";
      }

      pct = Math.min(100, Math.max(5, pct));
      if (dlBar) dlBar.style.width = `${pct}%`;
      if (dlPct) dlPct.textContent = `${pct}%`;
    }

    cancelInflightBtn.onclick = async () => {
      cancelInflightBtn.disabled = true;
      try {
        await apiFetch(`/api/v1/jobs/${encodeURIComponent(job.id)}/cancel`, { method: "POST" });
        showToast("Job cancelled");
        await fetchQueue();
      } catch (e) {
        showToast("Cancel failed: " + e);
      } finally {
        cancelInflightBtn.disabled = false;
      }
    };
  }

  function fmtClock(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? "0" : ""}${rem}`;
  }

  function renderQueued(jobs) {
    queueList.textContent = "";
    if (!jobs || jobs.length === 0) {
      queueList.innerHTML = '<div class="empty-placeholder is-inline">Nothing queued</div>';
      return;
    }

    for (const job of jobs) {
      const row = document.createElement("div");
      row.className = "queue-row";

      const pos = document.createElement("div");
      pos.className = "queue-pos mono";
      pos.textContent = `#${job.queue_position}`;

      const body = document.createElement("div");
      body.className = "queue-body";

      const title = document.createElement("div");
      title.className = "queue-title";
      title.textContent = shortTitle(job.title) || job.track_id;

      const sub = document.createElement("div");
      sub.className = "queue-sub";
      sub.textContent = `${(job.variant || "main").toUpperCase()} · Requested by ${job.requested_by || "studio"}`;
      body.append(title, sub);

      const meta = document.createElement("div");
      meta.className = "queue-meta";

      const eta = document.createElement("span");
      eta.className = "queue-eta mono";
      eta.dataset.jobId = job.id;
      clock.etas.set(job.id, job.eta_seconds || 0);
      eta.textContent = `~${fmtClock(job.eta_seconds)}`;

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn-cancel-action is-compact";
      cancelBtn.textContent = "✕";
      cancelBtn.title = "Cancel queue item";
      cancelBtn.dataset.jobId = job.id;

      cancelBtn.addEventListener("click", async (e) => {
        const id = e.currentTarget.dataset.jobId;
        try {
          await apiFetch(`/api/v1/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
          showToast("Item removed from queue");
          await fetchQueue();
        } catch (err) {}
      });

      meta.append(eta, cancelBtn);
      row.append(pos, body, meta);
      queueList.appendChild(row);
    }
  }

  function renderRecent(jobs) {
    const username = currentUser?.username || "default";
    const clearedAt = localStorage.getItem(`recent_cleared_at_${username}`);
    const filteredJobs = (jobs || []).filter(job => {
      if (!clearedAt) return true;
      const jobTime = job.completed_at || job.created_at;
      return !jobTime || jobTime > clearedAt;
    });

    if (!filteredJobs || filteredJobs.length === 0) {
      recentList.innerHTML = '<div class="empty-placeholder is-inline">No transports yet</div>';
      return;
    }

    recentList.textContent = "";

    for (const job of filteredJobs) {
      const ok = job.status === "done" || job.status === "completed";
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
      const bits = [(job.variant || "main").toUpperCase()];
      if (job.bytes) bits.push(formatBytes(job.bytes));
      if (job.completed_at) bits.push(relativeTime(job.completed_at));
      if (job.requested_by) bits.push(`👤 ${escapeHtml(job.requested_by)}`);
      if (!ok) {
        if (job.cancelled_by) {
          bits.push(`<span style="color:var(--err-text, #f87171); font-weight:600;">🚫 Cancelled by ${escapeHtml(job.cancelled_by)}</span>`);
        } else if (job.error && job.error.toLowerCase().includes("cancelled by")) {
          bits.push(`<span style="color:var(--err-text, #f87171); font-weight:600;">🚫 ${escapeHtml(job.error)}</span>`);
        }
      }
      sub.innerHTML = bits.join(" · ");
      body.append(title, sub);

      row.append(icon, body);

      if (!ok) {
        const canResume = currentUser?.role === "admin" ||
                          job.requested_by === currentUser?.username ||
                          !job.requested_by ||
                          job.requested_by === "studio" ||
                          job.requested_by === "local_editor";
        if (canResume) {
          const resumeBtn = document.createElement("button");
          resumeBtn.type = "button";
          resumeBtn.className = "btn-retry-action";
          resumeBtn.textContent = "↻ Resume";
          resumeBtn.title = "Resume / re-queue this download without re-entering link";
          resumeBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            resumeBtn.disabled = true;
            resumeBtn.textContent = "Resuming…";
            try {
              const res = await apiFetch(`/api/v1/jobs/${encodeURIComponent(job.id)}/retry`, { method: "POST" });
              if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || "Failed to resume download");
              }
              showToast(`↻ Resumed: ${shortTitle(job.title || job.filename) || job.track_id}`);
              await fetchQueue();
            } catch (err) {
              showToast(err.message || String(err));
              resumeBtn.disabled = false;
              resumeBtn.textContent = "↻ Resume";
            }
          });
          row.appendChild(resumeBtn);
        }
      }

      recentList.appendChild(row);
    }
  }

  async function fetchQueue() {
    if (!currentUser) return;
    try {
      const res = await apiFetch("/api/v1/queue");
      if (!res.ok) return;
      const data = await res.json();

      renderInFlight(data.in_flight);
      renderQueued(data.queued || []);
      renderRecent(data.recent || []);

      const hasInFlight = !!data.in_flight;
      if (hadInFlightJob && !hasInFlight) {
        if (!isDisplayingSingleMatch) {
          fetchLibrary(commandMode === "search" ? commandInput.value.trim() : "", currentCategory);
        }
        fetchStatus();
      }
      hadInFlightJob = hasInFlight;

      const latestDone = (data.recent || []).find(j => j.status === "done" || j.status === "completed");
      if (latestDone && latestDone.id !== lastRecentCompletedId) {
        if (lastRecentCompletedId !== null && !isDisplayingSingleMatch) {
          fetchLibrary(commandMode === "search" ? commandInput.value.trim() : "", currentCategory);
          showToast(`✓ Downloaded: ${shortTitle(latestDone.title || latestDone.filename)}`);
        }
        lastRecentCompletedId = latestDone.id;
      }

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

  if (clearRecentBtn) {
    clearRecentBtn.addEventListener("click", async () => {
      clearRecentBtn.disabled = true;
      try {
        const username = currentUser?.username || "default";
        const nowIso = new Date().toISOString();
        localStorage.setItem(`recent_cleared_at_${username}`, nowIso);
        renderRecent([]);
        await apiFetch("/api/v1/history/clear", { method: "POST" });
        await fetchQueue();
        showToast("Recent transports cleared");
      } catch (err) {
        showToast("Failed to clear recent transports: " + (err.message || err), "error");
      } finally {
        clearRecentBtn.disabled = false;
      }
    });
  }

  if (resumeBtn) {
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
  }

  // --- Fetch & Render Status ------------------------------------------------
  async function fetchStatus() {
    if (!currentUser) return;
    try {
      const res = await apiFetch("/api/v1/status");
      if (!res.ok) throw new Error("Status failed");
      const data = await res.json();

      // Artlist Limit Meter
      const artlistDone = data.downloads_artlist ?? 0;
      const artlistLimit = data.daily_limit_artlist ?? 40;
      if (artlistLimitText) artlistLimitText.textContent = `${artlistDone}/${artlistLimit}`;
      const artlistPct = Math.min(100, Math.round((artlistDone / (artlistLimit || 1)) * 100));
      if (artlistLimitBar) {
        artlistLimitBar.style.width = `${artlistPct}%`;
        artlistLimitBar.classList.toggle("is-high", artlistPct >= 70 && artlistPct < 90);
        artlistLimitBar.classList.toggle("is-critical", artlistPct >= 90);
      }
      if (artlistLimitPercent) artlistLimitPercent.textContent = `${artlistPct}% used`;

      // Envato Limit Meter
      const envatoDone = data.downloads_envato ?? 0;
      const envatoLimit = data.daily_limit_envato ?? 20;
      if (envatoLimitText) envatoLimitText.textContent = `${envatoDone}/${envatoLimit}`;
      const envatoPct = Math.min(100, Math.round((envatoDone / (envatoLimit || 1)) * 100));
      if (envatoLimitBar) {
        envatoLimitBar.style.width = `${envatoPct}%`;
        envatoLimitBar.classList.toggle("is-high", envatoPct >= 70 && envatoPct < 90);
        envatoLimitBar.classList.toggle("is-critical", envatoPct >= 90);
      }
      if (envatoLimitPercent) envatoLimitPercent.textContent = `${envatoPct}% used`;

      if (todayDownloadsVal) todayDownloadsVal.textContent = data.daily_downloads;

      const currentLibCount = data.library_count || 0;
      if (libraryTotalCount) libraryTotalCount.textContent = currentLibCount;
      if (lastLibraryCount !== null && currentLibCount !== lastLibraryCount && !isDisplayingSingleMatch) {
        fetchLibrary(commandMode === "search" ? commandInput.value.trim() : "", currentCategory);
      }
      lastLibraryCount = currentLibCount;

      if (queueDepthBadge) queueDepthBadge.textContent = `${data.queue_depth} queued`;
      const activitySection = document.querySelector(".activity-section");
      if (activitySection) {
        activitySection.classList.toggle("is-live", (data.queue_depth || 0) > 0 || !!data.in_flight_job);
      }

      if (data.chrome_download_dir && data.download_dir_ok === false) {
        dldirBanner.classList.remove("hidden");
        dldirDetail.textContent = `Chrome is saving to ${data.chrome_download_dir}, but Library watches ${data.staging_path}.`;
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
        serverStatus.querySelector(".status-label").textContent = "Connection Ready";
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

  // --- Render Library Table (Unified) -----------------------------
  function updateSortHeaderUI() {
    document.querySelectorAll(".library-table th.sortable").forEach(th => {
      const col = th.dataset.sort;
      const icon = th.querySelector(".sort-icon");
      if (col === currentSortColumn && currentSortDirection !== "none") {
        th.classList.add("is-sorted");
        if (icon) icon.textContent = currentSortDirection === "asc" ? "▲" : "▼";
      } else {
        th.classList.remove("is-sorted");
        if (icon) icon.textContent = "⇅";
      }
    });
  }

  function sortTracksList(tracks, sortCol, sortDir) {
    if (!sortCol || sortDir === "none") return tracks;
    return [...tracks].sort((a, b) => {
      let valA, valB;
      if (sortCol === "title") {
        valA = (a.title || a.filename || a.track_id || "").toLowerCase();
        valB = (b.title || b.filename || b.track_id || "").toLowerCase();
        return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (sortCol === "provider") {
        valA = `${a.provider || ""} ${a.category || ""}`.toLowerCase();
        valB = `${b.provider || ""} ${b.category || ""}`.toLowerCase();
        return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (sortCol === "requested_by") {
        valA = (a.requested_by || "").toLowerCase();
        valB = (b.requested_by || "").toLowerCase();
        return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (sortCol === "bytes") {
        valA = Number(a.bytes || a.file_size || 0);
        valB = Number(b.bytes || b.file_size || 0);
        return sortDir === "asc" ? valA - valB : valB - valA;
      }
      if (sortCol === "hit_count") {
        valA = Number(a.hit_count || 0);
        valB = Number(b.hit_count || 0);
        return sortDir === "asc" ? valA - valB : valB - valA;
      }
      return 0;
    });
  }

  function applyLibraryFilterAndRender() {
    let list = cachedLibraryTracks;
    const q = currentQuickSearchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(t => {
        const titleStr = (t.title || "").toLowerCase();
        const fileStr = (t.filename || "").toLowerCase();
        const userStr = (t.requested_by || "").toLowerCase();
        const provStr = (t.provider || "").toLowerCase();
        const catStr = (t.category || "").toLowerCase();
        const idStr = (t.track_id || "").toLowerCase();
        return titleStr.includes(q) || fileStr.includes(q) || userStr.includes(q) || provStr.includes(q) || catStr.includes(q) || idStr.includes(q);
      });
    }

    const sortedList = sortTracksList(list, currentSortColumn, currentSortDirection);
    renderTracksInTable(sortedList, false, q ? `${sortedList.length} of ${cachedLibraryTracks.length} assets` : null);
  }

  function renderTracksInTable(tracks, isSingleMatch = false, customCountLabel = null) {
    libraryTbody.textContent = "";

    if (isSingleMatch) {
      libraryCount.textContent = "1 asset (Archive Match)";
      if (filterEcho) {
        filterEcho.innerHTML = `<span>🎯 Matched Archive Item</span> <button type="button" class="btn-clear-match" id="clear-match-btn">✕ Show All Assets</button>`;
        filterEcho.classList.remove("hidden");
        const cBtn = document.getElementById("clear-match-btn");
        if (cBtn) {
          cBtn.addEventListener("click", () => {
            isDisplayingSingleMatch = false;
            commandInput.value = "";
            updateUrlInputState();
            fetchLibrary("", currentCategory, true);
          });
        }
      }
    } else if (customCountLabel) {
      libraryCount.textContent = customCountLabel;
      if (filterEcho) filterEcho.classList.add("hidden");
    } else {
      libraryCount.textContent = `${tracks.length} assets`;
      if (!commandInput.value.trim() && filterEcho) {
        filterEcho.classList.add("hidden");
      }
    }

    if (!tracks || tracks.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 7;
      td.className = "table-placeholder-cell";
      const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.6-3.6"></path></svg>';
      td.innerHTML = `<div class="loading-state-wrap">${icon}<strong>Nothing found in archive</strong><span>Paste an asset link above to download it into the library.</span></div>`;
      tr.appendChild(td);
      libraryTbody.appendChild(tr);
      return;
    }

    for (const t of tracks) {
      const tr = document.createElement("tr");
      if (isSingleMatch) {
        tr.classList.add("is-highlighted-asset");
      }

      // 1. Play Trigger Button
      const playTd = document.createElement("td");
      playTd.className = "col-stream";
      if (t.streamable !== false) {
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
      strong.textContent = shortTitle(t.title) || t.filename || t.track_id;
      if (t.url) {
        strong.href = t.url;
        strong.target = "_blank";
        strong.rel = "noreferrer";
        strong.title = "Open original stock link";
      }
      const sub = document.createElement("div");
      sub.className = "asset-sub-meta";
      const when = relativeTime(t.downloaded_at);
      sub.textContent = when ? `${t.filename || t.track_id} · ${when}` : (t.filename || t.track_id);
      nameTd.append(strong, sub);

      // 3. Platform & Category Badges (Clean single-line row)
      const sourceTd = document.createElement("td");
      sourceTd.className = "col-provider";
      const providerName = (t.provider || "artlist").toLowerCase();
      const categoryName = (t.category || "music").toLowerCase();

      const tagGroup = document.createElement("div");
      tagGroup.className = "provider-tag-group";

      const provBadge = document.createElement("span");
      provBadge.className = `provider-badge ${providerName}`;
      provBadge.textContent = providerName;

      const catBadge = document.createElement("span");
      catBadge.className = "category-tag";
      catBadge.textContent = categoryName;

      tagGroup.append(provBadge, catBadge);
      sourceTd.appendChild(tagGroup);

      // 4. Requested By User
      const reqTd = document.createElement("td");
      reqTd.className = "col-requested";
      const userBadge = document.createElement("span");
      const uName = t.requested_by || "studio";
      userBadge.className = `user-badge-chip ${uName === 'admin' ? 'is-admin' : ''}`;
      userBadge.title = `Requested by ${uName}`;
      userBadge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg><span class="user-name-text">${escapeHtml(uName)}</span>`;
      reqTd.appendChild(userBadge);

      // 5. Size & Extension
      const sizeTd = document.createElement("td");
      sizeTd.className = "col-size mono";
      sizeTd.textContent = formatBytes(t.bytes || t.file_size);

      // 6. Reuse Count
      const hitsTd = document.createElement("td");
      hitsTd.className = "col-reused mono";
      const hitCount = t.hit_count != null ? t.hit_count : 0;
      hitsTd.textContent = `${hitCount}×`;
      hitsTd.title = `Reused ${hitCount} time${hitCount === 1 ? '' : 's'}`;

      // 7. Action Buttons: Download & Delete
      const actionTd = document.createElement("td");
      actionTd.className = "col-actions";

      const actionsWrap = document.createElement("div");
      actionsWrap.className = "actions-cell-wrap";

      const dlBtn = document.createElement("button");
      dlBtn.type = "button";
      dlBtn.className = "btn-action-icon btn-action-download";
      dlBtn.title = `Download ${t.filename || 'file'} to your computer`;
      dlBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
      dlBtn.addEventListener("click", () => downloadFile(t, dlBtn));
      actionsWrap.appendChild(dlBtn);

      const canDelete = Boolean(currentUser && currentUser.role === "admin");

      if (canDelete) {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "btn-action-icon btn-action-delete";
        delBtn.title = `Delete ${t.filename || 'file'} from library (Admin only)`;
        delBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          promptDeleteTrack(t);
        });
        actionsWrap.appendChild(delBtn);
      }

      actionTd.appendChild(actionsWrap);

      tr.append(playTd, nameTd, sourceTd, reqTd, sizeTd, hitsTd, actionTd);
      libraryTbody.appendChild(tr);
    }
  }

  function promptDeleteTrack(track) {
    const titleStr = shortTitle(track.title) || track.filename || track.track_id;
    const sizeStr = formatBytes(track.bytes || track.file_size);
    const variantStr = (track.variant || "main").toUpperCase();
    openConfirmModal(
      "Delete Library Asset",
      "Free Host Storage Space",
      `Are you sure you want to permanently delete <strong>${escapeHtml(titleStr)}</strong> (${escapeHtml(variantStr)})?<br><br>This will remove the file (<span class="mono">${sizeStr}</span>) from the studio host disk to free up space.`,
      "Delete Permanently",
      true,
      async () => {
        try {
          const res = await apiFetch(`/api/v1/library/${encodeURIComponent(track.track_id)}?variant=${encodeURIComponent(track.variant || 'main')}`, {
            method: "DELETE"
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || "Failed to delete item");
          }
          const data = await res.json();
          const freedText = data.bytes_freed ? ` (${formatBytes(data.bytes_freed)} freed)` : "";
          showToast(`✓ Deleted "${titleStr}"${freedText}`);

          if (currentPlayingTrackId === track.track_id && currentPlayingVariant === (track.variant || 'main')) {
            if (playerCloseBtn) playerCloseBtn.click();
          }

          await Promise.all([
            fetchLibrary("", currentCategory, true),
            fetchStatus()
          ]);
        } catch (err) {
          showToast("Delete failed: " + (err.message || err));
        }
      }
    );
  }

  // --- Fetch & Render Library (With Intelligent DOM Diffing) ----------------
  let lastLibraryFingerprint = "";

  async function fetchLibrary(query = "", category = currentCategory, force = false) {
    if (!currentUser) return;
    if (isDisplayingSingleMatch && !force && commandMode === "bridge") {
      return;
    }
    try {
      const q = query || currentQuickSearchQuery;
      const sortParam = currentSortColumn ? `&sort_by=${encodeURIComponent(currentSortColumn)}&sort_dir=${encodeURIComponent(currentSortDirection)}` : "";
      const res = await apiFetch(`/api/v1/library?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}${sortParam}`);
      if (!res.ok) return;
      const tracks = await res.json();
      isDisplayingSingleMatch = false;

      // Fingerprint check: skip destroying/rebuilding DOM table if tracks have not changed!
      const fingerprint = `${tracks.length}_${category}_${q}_${tracks.map(t => `${t.track_id}_${t.hit_count}`).join(",")}`;
      if (!force && fingerprint === lastLibraryFingerprint && cachedLibraryTracks.length === tracks.length) {
        return; // Pure zero-CPU skip!
      }
      lastLibraryFingerprint = fingerprint;
      cachedLibraryTracks = tracks;
      applyLibraryFilterAndRender();
    } catch (err) {
      console.error("Library fetch failed: ", err);
    }
  }

  // --- Dedicated Quick Search Input Event Listeners ---
  if (libQuickSearch) {
    let searchDebounceTimer = null;
    libQuickSearch.addEventListener("input", (e) => {
      currentQuickSearchQuery = e.target.value;
      if (libSearchClear) {
        libSearchClear.classList.toggle("hidden", !currentQuickSearchQuery);
      }
      isDisplayingSingleMatch = false;
      applyLibraryFilterAndRender();

      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        fetchLibrary(currentQuickSearchQuery, currentCategory);
      }, 250);
    });
  }

  if (libSearchClear) {
    libSearchClear.addEventListener("click", () => {
      if (libQuickSearch) libQuickSearch.value = "";
      currentQuickSearchQuery = "";
      libSearchClear.classList.add("hidden");
      isDisplayingSingleMatch = false;
      fetchLibrary("", currentCategory, true);
    });
  }

  // --- Sortable Table Column Click Listeners ---
  document.querySelectorAll(".library-table th.sortable").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.dataset.sort;
      if (currentSortColumn === col) {
        if (currentSortDirection === "asc") currentSortDirection = "desc";
        else if (currentSortDirection === "desc") {
          currentSortDirection = "none";
          currentSortColumn = null;
        } else {
          currentSortDirection = "asc";
        }
      } else {
        currentSortColumn = col;
        currentSortDirection = "asc";
      }
      updateSortHeaderUI();
      applyLibraryFilterAndRender();
    });
  });

  // --- Category Filter Tabs -------------------------------------------------
  if (categoryFilterBar) {
    categoryFilterBar.querySelectorAll(".category-pill").forEach(btn => {
      btn.addEventListener("click", () => {
        categoryFilterBar.querySelectorAll(".category-pill").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentCategory = btn.dataset.cat;
        isDisplayingSingleMatch = false;
        fetchLibrary(currentQuickSearchQuery || (commandMode === "search" ? commandInput.value.trim() : ""), currentCategory, true);
      });
    });
  }

  // --- Submit New Asset Job -------------------------------------------------
  submitForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = commandInput.value.trim();
    if (!url || commandMode !== "bridge") return;

    submitBtn.disabled = true;
    submitBtn.querySelector(".btn-text").textContent = "Downloading…";
    submitResult.className = "result-box hidden";

    try {
      const res = await apiFetch("/api/v1/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url,
          variant: trackVariantSelect.value,
          format: audioFormatSelect.value,
          requested_by: currentUser ? currentUser.username : "studio_editor",
        }),
      });

      const data = await res.json();

      if (res.status === 200 && data.status === "cached") {
        showResult("cached", "Instant Cache Hit — Already in Library", data.filename, data.library_path);
        commandInput.value = "";
        updateUrlInputState();
        fetchLibrary("", currentCategory, true);
        fetchStatus();
      } else if (res.status === 201) {
        showResult(
          "success",
          `Queued for Download — Position #${data.queue_position}`,
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
      showResult("error", "Network error: unable to connect to local Stocks Library server.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove("is-secondary");
      submitBtn.querySelector(".btn-text").textContent = "Download to Library";
      hideResolution();
    }
  });

  function showResult(type, title, subtitle, path) {
    submitResult.className = `result-box result-${type}`;
    submitResult.innerHTML = `
      <div class="result-header">
        <strong>${escapeHtml(title)}</strong>
        ${subtitle ? `<span class="result-sub">${escapeHtml(subtitle)}</span>` : ""}
      </div>
    `;
    submitResult.classList.remove("hidden");
  }

  if (sessionStatus) {
    sessionStatus.style.cursor = "pointer";
    sessionStatus.addEventListener("click", async () => {
      try {
        showToast("Re-verifying session auth...");
        await apiFetch("/api/v1/resume", { method: "POST" });
        await fetchStatus();
        await fetchQueue();
      } catch (e) {}
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.classList.add("is-busy");
      try {
        await Promise.all([
          apiFetch("/api/v1/resume", { method: "POST" }).catch(() => {}),
          fetchStatus(),
          fetchQueue(),
          fetchLibrary(commandMode === "search" ? commandInput.value.trim() : "", currentCategory),
        ]);
        showToast("Status & queue refreshed");
      } finally {
        refreshBtn.classList.remove("is-busy");
      }
    });
  }

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
  // Check Auth & Initialize
  checkAuthAndInit();
  updateUrlInputState();

  // --- Smart Adaptive Polling Engine (Zero-Lag LAN Architecture) -----------
  let isPollingBusy = false;
  let hasActiveInFlight = false;

  async function pollHeartbeat() {
    if (!currentUser || isPollingBusy) return;
    // Slow down in background tabs when no active job is downloading
    if (document.hidden && !hasActiveInFlight) return;

    isPollingBusy = true;
    try {
      await Promise.all([
        fetchStatus(),
        fetchQueue()
      ]);
    } catch (e) {
    } finally {
      isPollingBusy = false;
    }
  }

  // Adaptive Heartbeat: every 3.5s by default
  setInterval(pollHeartbeat, 3500);

  // Background Library Syncer: every 8s (with fingerprint zero-CPU check)
  setInterval(() => {
    if (currentUser && !document.hidden && !isDisplayingSingleMatch && (commandMode === "search" || !commandInput.value.trim())) {
      fetchLibrary("", currentCategory);
    }
  }, 8000);

  // Instant refresh when user switches back to this browser tab
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && currentUser) {
      pollHeartbeat();
      if (!isDisplayingSingleMatch && (commandMode === "search" || !commandInput.value.trim())) {
        fetchLibrary("", currentCategory);
      }
    }
  });

  setInterval(tickClocks, 1000);
});
