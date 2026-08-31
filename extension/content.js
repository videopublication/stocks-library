// Content script running inside the Artlist tab.
// Drives the download controls, reports pipeline phase and login state.
(function () {
  // Build stamp. Reported with the first phase of every job so the dashboard and
  // logs show exactly which build is live - "did the extension actually reload?"
  // is otherwise unanswerable from the outside, and has caused repeated
  // misdiagnosis.
  const BUILD = 'b21-dumpdom';

  const SELECTORS = window.ARTLIST_SELECTORS || {};

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Inclusive integer range. The "+1" is correct here: it makes `max` reachable
  // after Math.floor.
  const randomRange = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  // Continuous range [min, max). No "+1" - without Math.floor it would overshoot
  // `max`, which is what pushed click points outside the target element
  // (randomFloat(0.35, 0.65) returning up to 1.65).
  const randomFloat = (min, max) => Math.random() * (max - min) + min;

  let currentCursor = { x: randomRange(200, 500), y: randomRange(200, 400) };
  let currentJobId = null;
  let runningJobId = null;

  // ------------------------------------------------------------- pointer path

  function bezierPoint(p0, p1, p2, p3, t) {
    const cx = 3 * (p1.x - p0.x);
    const bx = 3 * (p2.x - p1.x) - cx;
    const ax = p3.x - p0.x - cx - bx;

    const cy = 3 * (p1.y - p0.y);
    const by = 3 * (p2.y - p1.y) - cy;
    const ay = p3.y - p0.y - cy - by;

    return {
      x: ax * t ** 3 + bx * t ** 2 + cx * t + p0.x,
      y: ay * t ** 3 + by * t ** 2 + cy * t + p0.y,
    };
  }

  async function movePointerTo(targetX, targetY, totalDurationMs = 600) {
    const start = { ...currentCursor };
    const end = { x: targetX, y: targetY };
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    const ctrl1 = {
      x: start.x + dx * randomFloat(0.1, 0.4) + randomRange(-40, 40),
      y: start.y + dy * randomFloat(0.1, 0.4) + randomRange(-40, 40),
    };
    const ctrl2 = {
      x: start.x + dx * randomFloat(0.6, 0.9) + randomRange(-30, 30),
      y: start.y + dy * randomFloat(0.6, 0.9) + randomRange(-30, 30),
    };

    const steps = Math.max(15, Math.floor(totalDurationMs / 20));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const easedT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const pos = bezierPoint(start, ctrl1, ctrl2, end, easedT);

      currentCursor.x = Math.round(pos.x);
      currentCursor.y = Math.round(pos.y);

      const under =
        document.elementFromPoint(currentCursor.x, currentCursor.y) || document.body;
      const init = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: currentCursor.x,
        clientY: currentCursor.y,
        screenX: currentCursor.x + window.screenX,
        screenY: currentCursor.y + window.screenY,
        buttons: 0,
      };

      under.dispatchEvent(new PointerEvent('pointermove', init));
      under.dispatchEvent(new MouseEvent('mousemove', init));

      await sleep(totalDurationMs / steps);
    }
  }

  // Move, hover, then a single press/release/click cycle.
  //
  // Exactly ONE click event is emitted. Dispatching MouseEvent('click') and also
  // calling element.click() delivers two clicks, which double-toggles dropdowns
  // and can start two downloads.
  async function humanClick(element) {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const targetX = rect.left + rect.width * randomFloat(0.35, 0.65);
    const targetY = rect.top + rect.height * randomFloat(0.35, 0.65);

    await movePointerTo(targetX, targetY, randomRange(450, 750));
    await sleep(randomRange(150, 300));

    const init = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: targetX,
      clientY: targetY,
      screenX: targetX + window.screenX,
      screenY: targetY + window.screenY,
      button: 0,
      buttons: 1,
      detail: 1,
    };

    element.dispatchEvent(new PointerEvent('pointerover', init));
    element.dispatchEvent(new MouseEvent('mouseover', init));
    element.dispatchEvent(new PointerEvent('pointerenter', init));
    element.dispatchEvent(new MouseEvent('mouseenter', init));
    element.dispatchEvent(new PointerEvent('pointerdown', init));
    element.dispatchEvent(new MouseEvent('mousedown', init));

    await sleep(randomRange(70, 130));

    const up = { ...init, buttons: 0 };
    element.dispatchEvent(new PointerEvent('pointerup', up));
    element.dispatchEvent(new MouseEvent('mouseup', up));
    element.dispatchEvent(new MouseEvent('click', up));
  }

  // ----------------------------------------------------------- phase reporting

  // A content script cannot post to the loopback API directly (cross-origin from
  // artlist.io), so progress goes through the service worker.
  function reportPhase(phase, detail) {
    if (!currentJobId) return;
    try {
      chrome.runtime.sendMessage({
        type: 'JOB_PHASE',
        jobId: currentJobId,
        phase,
        detail: detail || null,
      });
    } catch (e) {}
  }

  // ----------------------------------------------------------- element lookup

  function isVisible(el) {
    if (!el) return false;

    // checkVisibility accounts for ANCESTOR opacity/visibility/content-visibility.
    // getComputedStyle(el).opacity reports only the element's own value, so a
    // wrapper at opacity:0 - which is how the track dialog sits in the DOM before
    // it opens - let every child pass as "visible".
    if (typeof el.checkVisibility === 'function') {
      if (!el.checkVisibility({
        opacityProperty: true,
        visibilityProperty: true,
        contentVisibilityAuto: true,
      })) return false;
    }

    if (el.closest('[aria-hidden="true"], [inert]')) return false;

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // Would a click actually land on this element? Hit-tests the centre point, so
  // an element covered by an overlay or parked off-screen is rejected.
  function isInteractable(el) {
    if (!isVisible(el)) return false;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return false;
    if (r.right < 0 || r.left > window.innerWidth) return false;

    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
  }

  // A text match usually lands on the innermost span holding the label, while the
  // click handler lives on an ancestor button. Dispatching at the label does
  // nothing on many React UIs, so walk up to the real control.
  const CLICKABLE =
    'button, a, [role="button"], [role="tab"], [role="menuitem"], [role="option"], label';

  function resolveClickable(el) {
    if (!el) return el;
    if (el.matches && el.matches(CLICKABLE)) return el;
    const ancestor = el.closest && el.closest(CLICKABLE);
    if (ancestor && isVisible(ancestor)) return ancestor;
    return el;
  }

  // ':has-text("x")' is a Playwright construct, not CSS - querySelector throws on
  // it, so it is resolved here.
  const HAS_TEXT_RE = /^(.*?):has-text\(\s*["']?(.*?)["']?\s*\)$/;

  function findElement(selectorList) {
    if (!selectorList) return null;
    if (typeof selectorList === 'string') selectorList = [selectorList];

    for (const selector of selectorList) {
      try {
        const textMatch = selector.match(HAS_TEXT_RE);
        if (textMatch) {
          const tag = textMatch[1] || '*';
          const needle = textMatch[2].toLowerCase();

          // ROOT CAUSE: textContent aggregates the text of ALL descendants,
          // including hidden ones. Artlist renders the track dialog into the DOM
          // before it opens, so a *visible* ancestor of that hidden dialog
          // "contains" the string "Download All Stems" and matched here - even
          // with the dialog shut. resolveClickable then turned that ancestor into
          // some unrelated button. innerText reflects only rendered text, which
          // is the actual question being asked.
          //
          // textContent is used first as a cheap prefilter because innerText
          // forces layout.
          const rough = Array.from(document.querySelectorAll(tag)).filter(
            (el) => (el.textContent || '').toLowerCase().includes(needle)
          );
          const candidates = rough.filter(
            (el) => isVisible(el) && (el.innerText || '').toLowerCase().includes(needle)
          );

          if (candidates.length) {
            // Most specific match, not first in document order: document order
            // returns the outermost wrapper, and clicking a page-level div that
            // merely contains the word does nothing.
            candidates.sort(
              (a, b) => (a.innerText || '').length - (b.innerText || '').length
            );
            return resolveClickable(candidates[0]);
          }
        } else {
          const found = Array.from(document.querySelectorAll(selector)).find(isVisible);
          if (found) return resolveClickable(found);
        }
      } catch (e) {
        // Unsupported selector in this browser; try the next fallback.
      }
    }
    return null;
  }

  // Wait until ANY of several selector lists matches. Used where one of a few
  // different elements proves the same state was reached.
  async function waitForAny(selectorLists, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      for (const list of selectorLists) {
        const el = findElement(list);
        if (el) return el;
      }
      await sleep(400);
    }
    return null;
  }

  async function waitForElement(selectorList, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const el = findElement(selectorList);
      if (el) return el;
      await sleep(400);
    }
    return null;
  }

  function smoothScrollTo(element) {
    if (!element) return;
    try {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {}
  }

  // Only cookie/promo banners. Generic close buttons are deliberately excluded
  // from SELECTORS.dismissals so this never closes the stems modal.
  function dismissModals() {
    if (!SELECTORS.dismissals) return;
    for (const sel of SELECTORS.dismissals) {
      const btn = findElement(sel);
      if (btn) {
        try {
          btn.click();
        } catch (e) {}
      }
    }
  }

  function cleanDocumentTitle(raw) {
    let t = (raw || '').trim();
    // Artlist page titles look like:
    //   "Delicate Motions by Yair Cohen - Royalty Free Music | Artlist"
    t = t.replace(/\s*-\s*Royalty Free Music\s*\|\s*Artlist\s*$/i, '');
    t = t.replace(/\s*-\s*Sound Effects\s*\|\s*Artlist\s*$/i, '');
    t = t.replace(/\s*\|\s*Artlist\s*$/i, '');
    t = t.replace(/\s*-\s*Artlist\s*$/i, '');
    // Drop the trailing artist credit, keeping the track name.
    const byIndex = t.toLowerCase().lastIndexOf(' by ');
    if (byIndex > 0) t = t.slice(0, byIndex);
    return t.trim();
  }

  async function getTrackTitle() {
    // The h1 is not always present the moment the phase runs; wait briefly
    // rather than falling straight through to the SEO page title.
    const titleEl = await waitForElement(SELECTORS.trackTitle, 3000);
    if (titleEl && titleEl.textContent && titleEl.textContent.trim()) {
      return titleEl.textContent.trim();
    }
    return cleanDocumentTitle(document.title) || 'Artlist Track';
  }

  // Login detection. Returns true, false, or null for "cannot tell".
  // null must never flip a healthy session to logged out.
  function detectLoginState() {
    if (findElement(SELECTORS.loggedInMarker)) return true;
    if (findElement(SELECTORS.loggedOutMarker)) return false;
    return null;
  }

  // --------------------------------------------------------------- diagnostics

  // Compact description of the icon-only controls on the page.
  //
  // The stems trigger has no text, so it can only be identified by its
  // attributes - and guessing at those from a screenshot does not work. This
  // ships the real attributes back in the failure message so the selector can be
  // written against what is actually in the DOM.
  function describeIconControls(limit = 14) {
    const controls = Array.from(
      document.querySelectorAll('button, a[role="button"], [role="button"]')
    ).filter((el) => isVisible(el) && (el.textContent || '').trim().length <= 2);

    return controls
      .slice(0, limit)
      .map((el, i) => {
        const parts = [];
        for (const attr of ['aria-label', 'title', 'data-testid', 'data-test', 'id']) {
          const v = el.getAttribute(attr);
          if (v) parts.push(`${attr}=${JSON.stringify(v)}`);
        }
        const cls = String(el.className || '').trim().slice(0, 32);
        if (cls) parts.push(`class="${cls}"`);
        const svg = el.querySelector('svg');
        if (svg) {
          const t = (svg.getAttribute('data-testid') || svg.getAttribute('aria-label') || '').slice(0, 24);
          if (t) parts.push(`svg=${JSON.stringify(t)}`);
        }
        return `[${i}] ${parts.join(' ') || '(no identifying attrs)'}`;
      })
      .join(' || ');
  }

  // Distinguishes "the modal never opened" from "it opened and the selectors
  // missed it" - the two look identical from a failed waitFor.
  function describePageState() {
    const text = (document.body.innerText || '');
    const has = (needle) => (text.includes(needle) ? 'YES' : 'no');
    const count = (sel) => {
      try {
        return document.querySelectorAll(sel).length;
      } catch (e) {
        return '?';
      }
    };
    const renderButtons = Array.from(
      document.querySelectorAll('[data-testid="renderButton"]')
    ).filter(isVisible);

    return [
      `text"Download All Stems"=${has('Download All Stems')}`,
      `text"Song Versions"=${has('Song Versions')}`,
      `text"Stems"=${has('Stems')}`,
      `role=dialog:${count('[role="dialog"]')}`,
      `class~modal:${count('[class*="modal" i]')}`,
      `class~Dialog:${count('[class*="Dialog"]')}`,
      `viewport=${window.innerWidth}x${window.innerHeight}`,
      `renderButtons=${renderButtons.length}`,
      `unlabelled=${renderButtons.filter((b) => !b.getAttribute('aria-label')).length}`,
    ].join(' ');
  }

  // ------------------------------------------------------------- stems flow

  function getStemsTriggerCandidates() {
    const candidates = [];
    const seen = new Set();

    function add(el) {
      if (el && !seen.has(el) && isVisible(el)) {
        seen.add(el);
        candidates.push(el);
      }
    }

    // 1. Direct attribute selectors (aria-label, title, data-testid)
    for (const sel of (SELECTORS.stemsModalTrigger || [])) {
      try {
        document.querySelectorAll(sel).forEach(add);
      } catch (e) {}
    }

    // 2. Hero action bar (the row of circular buttons next to Play)
    const playBtn = findElement(SELECTORS.playButton);
    if (playBtn) {
      let parent = playBtn.parentElement;
      for (let i = 0; i < 4 && parent && parent !== document.body; i++) {
        const buttons = Array.from(
          parent.querySelectorAll('button, [role="button"], [data-testid="renderButton"]')
        ).filter(isVisible);

        if (buttons.length >= 3) {
          // Exclude Play button
          const actionButtons = buttons.filter(
            (b) => b !== playBtn && !b.contains(playBtn) && !playBtn.contains(b)
          );

          // On Artlist, hero buttons are: [Download], [Favorite], [Add], [Share], [Stems]
          // The Stems icon is the trailing button in this action row.
          if (actionButtons.length > 0) {
            add(actionButtons[actionButtons.length - 1]); // Last button (Stems)
          }

          // Also add other unlabelled action buttons as backup
          for (const btn of actionButtons) {
            const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (aria !== 'direct download' && aria !== 'save' && aria !== 'share' && aria !== 'add to artboard') {
              add(btn);
            }
          }
          break;
        }
        parent = parent.parentElement;
      }
    }

    // 3. Persistent bottom audio player bar (contains duplicate Stems icon)
    const playerBars = Array.from(
      document.querySelectorAll('footer, [data-testid*="player"], [class*="player" i], [class*="audio-bar" i]')
    ).filter(isVisible);
    for (const bar of playerBars) {
      const barButtons = Array.from(bar.querySelectorAll('button, [role="button"]')).filter(isVisible);
      for (const btn of barButtons) {
        const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
        const title = (btn.getAttribute('title') || '').toLowerCase();
        if (aria.includes('stem') || title.includes('stem')) {
          add(btn);
        }
      }
    }

    return candidates;
  }

  // Hover without clicking.
  function hover(el) {
    const r = el.getBoundingClientRect();
    const init = {
      bubbles: true, cancelable: true, view: window,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, buttons: 0,
    };
    el.dispatchEvent(new PointerEvent('pointerover', init));
    el.dispatchEvent(new MouseEvent('mouseover', init));
    el.dispatchEvent(new PointerEvent('pointerenter', init));
    el.dispatchEvent(new MouseEvent('mouseenter', init));
    el.dispatchEvent(new PointerEvent('pointermove', init));
    el.dispatchEvent(new MouseEvent('mousemove', init));
  }

  function unhover(el) {
    const init = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new PointerEvent('pointerout', init));
    el.dispatchEvent(new MouseEvent('mouseout', init));
    el.dispatchEvent(new PointerEvent('pointerleave', init));
    el.dispatchEvent(new MouseEvent('mouseleave', init));
  }

  // innerText, not textContent: the tooltip only counts once rendered.
  function stemsTooltipShowing() {
    return /stems available/i.test(document.body.innerText || '');
  }

  // Identify the stems control the way a person does - hover each candidate and
  // see which one reveals the "Stems available" tooltip.
  //
  // Position cannot be used: on one track the action row ends [... Share, stems],
  // on another [... stems, more]. There is no fixed index for it.
  async function findStemsTriggerByTooltip(candidates) {
    if (stemsTooltipShowing()) {
      candidates.forEach(unhover);
      await sleep(300);
    }

    for (const candidate of candidates) {
      hover(candidate);
      await sleep(450);
      if (stemsTooltipShowing()) {
        console.log('[Artlist Relay] Stems control identified by its tooltip');
        return candidate;
      }
      unhover(candidate);
      await sleep(120);
    }
    return null;
  }

  // A "more" (kebab) menu is three dots and no path; the stems icon is a glyph.
  // Used to keep the kebab out of the click list rather than discovering it by
  // clicking it.
  function looksLikeMoreMenu(el) {
    const svg = el.querySelector('svg');
    if (!svg) return false;
    const circles = svg.querySelectorAll('circle').length;
    const paths = svg.querySelectorAll('path').length;
    const rects = svg.querySelectorAll('rect').length;
    return circles >= 3 && paths === 0 && rects === 0;
  }

  // Buttons in the action row that change account state. Clicking these to find
  // out what they do favourites tracks and adds them to collections.
  const SIDE_EFFECT_LABELS = [
    'save', 'add to artboard', 'share', 'like', 'favorite', 'favourite',
    'add to collection', 'more', 'options',
  ];

  function hasSideEffect(el) {
    const label = (
      (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '')
    ).toLowerCase().trim();
    if (!label) return false;
    return SIDE_EFFECT_LABELS.some((l) => label.includes(l));
  }

  function pressEscape() {
    for (const type of ['keydown', 'keyup']) {
      document.dispatchEvent(
        new KeyboardEvent(type, { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true })
      );
    }
  }

  function modalProofFound(proofSelectorLists) {
    for (const list of proofSelectorLists) {
      const el = findElement(list);
      if (el && isInteractable(el)) return el;
    }
    return null;
  }

  async function openTrackModal(proofSelectorLists, wantStems = false) {
    if (modalProofFound(proofSelectorLists)) return true;

    let candidates = getStemsTriggerCandidates()
      .filter((el) => !hasSideEffect(el))
      .filter((el) => !looksLikeMoreMenu(el));

    // Trying six controls to find one means clicking five wrong ones, and in this
    // row the wrong ones favourite the track and add it to collections. Cap it.
    if (candidates.length > 2) candidates = candidates.slice(0, 2);

    console.log(`[Artlist Relay] ${candidates.length} candidate trigger(s) after filtering.`);

    if (!candidates.length) {
      throw new Error('No Stems trigger button found on page. ' + describeIconControls());
    }

    // Ask the page which control is the stems one, rather than guessing by index.
    reportPhase('locating_download', 'identifying stems control');
    const byTooltip = await findStemsTriggerByTooltip(candidates);

    if (byTooltip) {
      candidates = [byTooltip].concat(candidates.filter((c) => c !== byTooltip));
    }

    // Deliberately NOT short-circuiting on "the word stems is absent from the
    // page". The control is icon-only with a hover tooltip, so "stems" is missing
    // from the rendered text of most track pages - including ones that do have
    // stems - and that test rejected them. With the candidate list filtered of
    // side-effect controls and capped, simply trying them is both cheap and
    // honest.

    const tried = [];
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const desc =
        (candidate.getAttribute('aria-label') || '') +
        ' ' +
        (candidate.getAttribute('data-testid') || '') +
        (candidate.className ? '.' + String(candidate.className).split(' ')[0] : '');
      // Report the actual markup of each control tried. Inference from counts and
      // positions has been wrong repeatedly; this is the element itself.
      const html = (candidate.outerHTML || '').replace(/\s+/g, ' ').slice(0, 300);
      console.log(`[Artlist Relay] Candidate ${i + 1}/${candidates.length}:`, html);
      tried.push(`#${i}{${html.slice(0, 160)}}`);

      reportPhase('locating_download', `opening stems modal (${i + 1}/${candidates.length})`);

      smoothScrollTo(candidate);
      await sleep(randomRange(400, 700));
      await humanClick(candidate);

      // Only modalProofFound counts. The raw findElement fallbacks that used to
      // sit here skipped isInteractable, so a control that could not actually be
      // clicked satisfied "the modal opened".
      //
      // The budget is generous because the dialog loads a waveform for every
      // stem. At 4s a slow dialog was abandoned mid-open, Escape then shut the
      // very dialog that was appearing, and the flow moved on to the next
      // control - failing on a track whose stems button had been clicked
      // correctly.
      const proofs = proofSelectorLists.concat([SELECTORS.songVersionsTab]);
      const budget = i === 0 ? 12000 : 8000;
      const deadline = Date.now() + budget;
      let opened = null;
      while (Date.now() < deadline && !opened) {
        opened = modalProofFound(proofs);
        if (!opened) await sleep(250);
      }

      if (opened) {
        console.log('[Artlist Relay] Stems modal opened successfully!');
        await sleep(randomRange(600, 1200));
        return true;
      }

      // One last look before dismissing: Escape on a dialog that is still
      // rendering closes the thing being waited for.
      await sleep(1200);
      opened = modalProofFound(proofs);
      if (opened) {
        console.log('[Artlist Relay] Dialog appeared late; continuing');
        await sleep(randomRange(500, 900));
        return true;
      }

      console.log(`[Artlist Relay] Control ${i + 1} is not the stems trigger; trying next`);
      pressEscape();
      await sleep(randomRange(400, 800));
    }

    console.log('[Artlist Relay] No stems dialog. PAGE STATE:', describePageState());

    const narrow = window.innerWidth < 1400;
    // NO_STEMS marks this as a settled answer rather than a transient failure:
    // revisiting the page cannot make stems appear. The server keys off it to
    // skip the retry.
    throw new Error(
      narrow
        ? `NO_STEMS: the window is only ${window.innerWidth}px wide and Artlist ` +
          'hides the stems control at narrow widths - widen the browser window.'
        : 'NO_STEMS: this track has no stems on Artlist.'
    );
  }

  // Find the list row whose text carries `label`, preferring the tightest
  // container that still holds its own download control.
  function findRowByLabel(labels) {
    for (const label of labels) {
      const needle = label.toLowerCase();
      const candidates = Array.from(document.querySelectorAll('div, li, tr'))
        .filter(
          (el) => isVisible(el) && (el.textContent || '').toLowerCase().includes(needle)
        )
        .sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);

      for (const row of candidates) {
        const control = row.querySelector(
          'button, [role="button"], a, [data-testid="DownloadButton"]'
        );
        if (control && isVisible(control)) return { row, label };
      }
    }
    return null;
  }

  function listVisibleRowLabels(limit = 12) {
    return Array.from(document.querySelectorAll('[data-testid="DownloadButton"]'))
      .filter(isVisible)
      .slice(0, limit)
      .map((btn, i) => {
        const row = btn.closest('div, li, tr');
        const text = ((row && row.textContent) || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        return `[${i}] ${text || '(no text)'}`;
      })
      .join(' || ') || '(no per-row download controls found)';
  }

  // Download a specific song version (instrumental / short) from the modal's
  // "Song Versions" tab. These are NOT in a download popover - they are rows in
  // the same dialog that hosts stems.
  async function runVersionFlow(variantKey, trackTitle) {
    reportPhase('locating_download', trackTitle);

    await openTrackModal([SELECTORS.songVersionsTab, SELECTORS.stemsTab]);

    reportPhase('selecting_variant', variantKey);
    const tab = await waitForElement(SELECTORS.songVersionsTab, 4000);
    if (tab) {
      await humanClick(tab);
      await sleep(randomRange(900, 1500));
    }

    const labels = (SELECTORS.variantRowLabels || {})[variantKey];
    if (!labels) throw new Error(`Unknown variant requested: ${variantKey}`);

    const found = findRowByLabel(labels);
    if (!found) {
      throw new Error(
        `Version "${variantKey}" is not listed for this track. ` +
          `Rows present: ${listVisibleRowLabels()}`
      );
    }

    reportPhase('selecting_format', found.label);

    // Prefer an explicit download control inside the row.
    let control = null;
    for (const sel of SELECTORS.rowDownload) {
      try {
        const c = Array.from(found.row.querySelectorAll(sel)).find(isVisible);
        if (c) {
          control = c;
          break;
        }
      } catch (e) {}
    }
    if (!control) {
      throw new Error(`Found the "${found.label}" row but no download control inside it`);
    }

    smoothScrollTo(control);
    await sleep(randomRange(500, 900));
    await humanClick(control);
    await sleep(randomRange(1000, 1600));

    const formatOption = await waitForElement(SELECTORS.stemsFormatOption, 2500);
    if (formatOption) await humanClick(formatOption);
  }

  function findDownloadAllStemsButton() {
    const candidates = Array.from(
      document.querySelectorAll('button, a, [role="button"], div, span')
    ).filter((el) => {
      if (!isVisible(el)) return false;
      const text = (el.textContent || '').trim().toLowerCase();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      const title = (el.getAttribute('title') || '').toLowerCase();
      const testId = (el.getAttribute('data-testid') || '').toLowerCase();

      if (text.includes('download all stems') || text.includes('download all') || (text.includes('download') && text.includes('stems'))) {
        return true;
      }
      if (aria.includes('download all') || aria.includes('all stems') || aria.includes('download stems')) {
        return true;
      }
      if (title.includes('download all') || title.includes('all stems')) {
        return true;
      }
      if (testId.includes('download-all') || testId.includes('download-stems')) {
        return true;
      }
      return false;
    });

    if (candidates.length) {
      candidates.sort((a, b) => {
        const aIsBtn = a.tagName === 'BUTTON' || a.getAttribute('role') === 'button';
        const bIsBtn = b.tagName === 'BUTTON' || b.getAttribute('role') === 'button';
        if (aIsBtn && !bIsBtn) return -1;
        if (!aIsBtn && bIsBtn) return 1;
        return (a.textContent || '').length - (b.textContent || '').length;
      });
      return resolveClickable(candidates[0]);
    }

    return null;
  }

  async function runStemsFlow(trackTitle) {
    reportPhase('locating_download', trackTitle);

    // 1. Open the Stems dialog
    await openTrackModal(
      [SELECTORS.downloadAllStems, SELECTORS.stemsTab, SELECTORS.songVersionsTab],
      true
    );

    // 2. Click the "Stems" tab inside the modal to ensure we are viewing Stems
    const stemsTab = findElement(SELECTORS.stemsTab);
    if (stemsTab) {
      console.log('[Artlist Relay] Switching to Stems tab in modal...');
      reportPhase('selecting_variant', 'Stems tab');
      await humanClick(stemsTab);
      await sleep(randomRange(1000, 1600));
    }

    // 3. Locate "Download All Stems" button
    reportPhase('selecting_format', 'Download All Stems');
    let downloadAll = null;
    const startWait = Date.now();
    while (Date.now() - startWait < 8000) {
      downloadAll = findDownloadAllStemsButton() || findElement(SELECTORS.downloadAllStems);
      if (downloadAll && isVisible(downloadAll)) break;
      await sleep(350);
    }

    if (!downloadAll) {
      // Fallback: check for modal header download control
      const modalDownloadBtn = findElement([
        '[role="dialog"] [data-testid*="download"]',
        '[role="dialog"] button[aria-label*="download" i]',
        '[data-testid="modal"] [data-testid*="download"]'
      ]);
      if (modalDownloadBtn) {
        downloadAll = modalDownloadBtn;
      }
    }

    if (!downloadAll) {
      throw new Error(
        'Stems modal opened but no "Download All Stems" button was found. ' +
        `PAGE STATE: ${describePageState()}`
      );
    }

    console.log('[Artlist Relay] Found Download All Stems control. Clicking...');
    smoothScrollTo(downloadAll);
    await sleep(randomRange(500, 900));
    await humanClick(downloadAll);
    await sleep(randomRange(1000, 1600));

    // 4. Check if format popover opened (e.g. Lossless WAV ZIP / MP3)
    const formatOption = await waitForElement(SELECTORS.stemsFormatOption, 3000);
    if (formatOption) {
      console.log('[Artlist Relay] Selecting stems format option in dropdown...');
      await humanClick(formatOption);
    }

    console.log('[Artlist Relay] Stems download initiated.');
  }

  // ---------------------------------------------------------- standard flow

  // Main track: the hero control is aria-label="direct download" and starts the
  // download immediately - there is no popover to navigate.
  async function runMainFlow(format, trackTitle) {
    reportPhase('locating_download', trackTitle);
    const downloadBtn = await waitForElement(SELECTORS.downloadButton, 8000);
    if (!downloadBtn) {
      throw new Error(
        'Could not find the download control. Icon controls: ' + describeIconControls()
      );
    }

    smoothScrollTo(downloadBtn);
    await sleep(randomRange(800, 1400));
    await humanClick(downloadBtn);
    await sleep(randomRange(1000, 1600));

    // Some layouts still present a quality picker; take it if it shows up.
    const wavOption = await waitForElement(SELECTORS.formatWav, 2500);
    if (wavOption) {
      reportPhase('selecting_format', format || 'WAV');
      await humanClick(wavOption);
    } else {
      console.log('[Artlist Relay] No format picker; direct download assumed.');
    }
  }

  // ------------------------------------------------------------ entry point

  async function executeDownload(job) {
    const variantKey = (job.variant || 'main').toLowerCase();
    currentJobId = job.jobId;
    console.log(`[Artlist Relay] Starting job ${job.jobId} (variant: ${variantKey})`);

    // The tab can navigate mid-job - clicking a control took it to the Downloads
    // page once, where the flow happily downloaded a licence PDF. Refuse to act
    // on any page that is not this job's track.
    if (job.trackId && !location.href.includes(String(job.trackId))) {
      throw new Error(
        `Page is not track ${job.trackId} (now at ${location.pathname}) - aborting ` +
          'rather than acting on the wrong page'
      );
    }

    reportPhase('dismissing_modals', `build ${BUILD}`);
    dismissModals();
    await sleep(randomRange(3000, 4800));
    dismissModals();

    const authState = detectLoginState();
    if (authState === false) {
      throw new Error('Artlist session is logged out - re-authenticate on the relay node');
    }

    reportPhase('reading_title');
    const trackTitle = await getTrackTitle();
    console.log('[Artlist Relay] Track title:', trackTitle);
    reportPhase('reading_title', trackTitle);

    chrome.runtime.sendMessage({
      type: 'JOB_TITLE_RESOLVED',
      jobId: job.jobId,
      title: trackTitle,
      authenticated: authState,
    });

    // No preview playback.
    //
    // It was never functional - it existed only as "human mimicry" - and playing
    // a preview before every single download at a 100% rate is itself a rigid
    // pattern, not camouflage. Removing it also cuts one streaming request and
    // roughly six seconds per job.

    if (variantKey === 'stems') {
      await runStemsFlow(trackTitle);
    } else if (variantKey === 'main') {
      await runMainFlow(job.format, trackTitle);
    } else {
      // instrumental / short live in the modal's "Song Versions" tab, not in a
      // download popover.
      await runVersionFlow(variantKey, trackTitle);
    }

    chrome.runtime.sendMessage({
      type: 'JOB_CLICK_EXECUTED',
      jobId: job.jobId,
      title: trackTitle,
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_DOWNLOAD_JOB') {
      // Second line of defence against a duplicate dispatch: two concurrent runs
      // on one page click over each other.
      if (runningJobId) {
        // Expected on SPA re-navigation; the guard is doing its job.
        console.log('[Artlist Relay] Ignoring duplicate start; already running', runningJobId);
        sendResponse({ status: 'already_running' });
        return false;
      }
      runningJobId = message.job.jobId;

      executeDownload(message.job)
        .then(() => {
          runningJobId = null;
          sendResponse({ status: 'ok' });
        })
        .catch((err) => {
          runningJobId = null;
          const expected = /^NO_STEMS/.test(err && err.message);
          if (expected) {
            console.log('[Artlist Relay]', err.message);
          } else {
            console.error('[Artlist Relay] Execution failed:', err);
          }
          chrome.runtime.sendMessage({
            type: 'JOB_CLICK_FAILED',
            jobId: message.job.jobId,
            reason: err.message || 'Unknown content script error',
          });
          sendResponse({ status: 'error', error: err.message });
        });
      return true;
    }

    if (message.type === 'PROBE_LOGIN_STATE') {
      sendResponse({ authenticated: detectLoginState() });
      return false;
    }
  });

  console.log('[Artlist Relay] Content script loaded.');
})();
