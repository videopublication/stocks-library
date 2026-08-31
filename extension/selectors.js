// Artlist DOM Selector Strategy Dictionary with Ordered Fallbacks
const ARTLIST_SELECTORS = {
  // Pre-flight dismissal of cookie banners and promos.
  // Generic close buttons are excluded so they don't dismiss the stems modal.
  dismissals: [
    'button[id*="onetrust-accept"]',
    'button:has-text("Accept All Cookies")',
    'button:has-text("Accept")',
    'button:has-text("Got it")',
    'button:has-text("Dismiss")'
  ],

  // Track Play / Audio Preview Trigger
  playButton: [
    'button:has-text("Play")',
    'button:has-text("Pause")',
    'button[data-testid="play-button"]',
    'button[data-testid*="play"]',
    'button[aria-label*="Play track" i]',
    'button[aria-label*="Play" i]',
    'button[data-testid="song-play-btn"]',
    'button[data-testid="media-player-play"]',
    'div[data-testid="waveform-container"] button',
    '[data-testid="track-item"] button[aria-label*="play" i]',
    '.play-button',
    '.waveform-play-btn',
    'button.play'
  ],

  // Main song direct download button
  downloadButton: [
    '[data-testid="renderButton"][aria-label="direct download"]',
    'button[aria-label="direct download"]',
    'button[data-testid="download-button"]',
    'button[data-testid="song-download-btn"]',
    'button[data-testid*="sfx-download"]',
    'button[data-testid*="download"]',
    'button[aria-label*="download" i]',
    'button[title*="download" i]',
    'a[data-testid="download-link"]',
    'a[aria-label*="download" i]',
    '[data-testid="track-item"] button[aria-label*="download" i]',
    'button:has-text("Download")',
    '.download-button'
  ],

  // ---------------------------------------------------------------- STEMS
  // The Stems icon button on Artlist (present in both Hero action row and Bottom Player)
  stemsModalTrigger: [
    'button[aria-label*="stem" i]',
    'button[title*="stem" i]',
    '[data-testid*="stem" i]',
    'button[aria-label*="stems available" i]',
    'button[title*="stems available" i]',
    'a[aria-label*="stem" i]',
    '[aria-label*="stems" i]',
    '[title*="stems" i]',
    '[data-testid="renderButton"]:not([aria-label]):not([title])',
    'footer button[aria-label*="stem" i]',
    'div[data-testid*="player"] button[aria-label*="stem" i]'
  ],

  // Confirms the modal actually opened
  stemsModal: [
    '[role="dialog"]',
    '[data-testid*="modal"]',
    '[class*="modal" i]',
    '[class*="Dialog"]',
    '[data-testid*="dialog"]'
  ],

  // "Song Versions" tab inside modal
  songVersionsTab: [
    '[role="tab"]:has-text("Song Versions")',
    'button[role="tab"]:has-text("Song Versions")',
    '[data-testid*="versions-tab"]',
    'button:has-text("Song Versions")',
    ':has-text("Song Versions")'
  ],

  // Per-row download control inside modal
  rowDownload: [
    '[data-testid="DownloadButton"]',
    'button[aria-label*="download" i]',
    '[data-testid="renderButton"][aria-label*="download" i]',
    'button',
    '[role="button"]'
  ],

  // "Stems" tab inside the modal
  stemsTab: [
    '[role="tab"]:has-text("Stems")',
    'button[role="tab"]:has-text("Stems")',
    'div[role="tab"]:has-text("Stems")',
    'button:has-text("Stems")',
    'span:has-text("Stems")',
    '[data-testid*="stems-tab"]',
    '[role="dialog"] button:has-text("Stems")'
  ],

  // "Download All Stems" button inside Stems tab
  downloadAllStems: [
    'button:has-text("Download All Stems")',
    'button:has-text("Download all stems")',
    'button[data-testid*="download-all-stems"]',
    'button[data-testid*="download-all"]',
    'button[aria-label*="download all" i]',
    'button:has-text("Download Stems")',
    'button:has-text("Download All")',
    '[role="dialog"] button:has-text("Download All")'
  ],

  // Entries in format dropdown (WAV ZIP / MP3 ZIP)
  stemsFormatOption: [
    '[role="menuitem"]:has-text("WAV")',
    '[role="option"]:has-text("WAV")',
    '[role="dialog"] button:has-text("WAV")',
    'button:has-text("WAV")',
    'li:has-text("WAV")',
    '[role="menuitem"]:has-text("Download")'
  ],

  // ------------------------------------------------------- SONG VARIANTS
  variantRowLabels: {
    instrumental: ['Instrumental'],
    short: ['Short Version', 'Short', '30 Sec', '15 Sec'],
    main: ['Main Version', 'Full Version', 'Main']
  },

  // Lossless Audio WAV Quality Option
  formatWav: [
    'button[data-testid="download-wav"]',
    'div[data-testid="download-option-wav"]',
    'button:has-text("WAV")',
    'span:has-text("WAV")',
    'div:has-text("Lossless WAV")',
    'label:has-text("WAV")'
  ],

  // Track Title Metadata on Page
  trackTitle: [
    'h1[data-testid="song-title"]',
    'h1[data-testid="track-title"]',
    'h1[data-testid*="title"]',
    'h1',
    '.track-title',
    '.song-title'
  ],

  // Login-state markers
  loggedInMarker: [
    'button[data-testid="user-menu"]',
    '[data-testid="user-avatar"]',
    'button[aria-label*="account" i]',
    'a[href*="/logout"]',
    'a[href*="/my-account"]'
  ],

  loggedOutMarker: [
    'a[href*="/login"]',
    'a[href*="/signin"]',
    'button:has-text("Log in")',
    'button:has-text("Sign in")',
    'a:has-text("Log in")'
  ]
};

if (typeof window !== 'undefined') {
  window.ARTLIST_SELECTORS = ARTLIST_SELECTORS;
}
