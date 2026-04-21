// Reply Fast — Gmail content script. Injects the floating trigger and side panel.
(() => {
  if (window.__replyFastLoaded) return;
  window.__replyFastLoaded = true;

  const TONES = ["Professional", "Friendly", "Brief", "Formal"];
  const STORAGE_KEY = "rf_api_key";

  const state = {
    tone: "Professional",
    email: { subject: "", fromName: "", fromEmail: "", body: "" },
    events: [],
    useCalendar: false,
    apiKey: "",
    draft: "",
    busy: false,
  };

  let panelEl = null;
  let triggerEl = null;
  let domObserver = null;

  // --- DOM extraction -----------------------------------------------------

  function extractEmail() {
    const subjectEl =
      document.querySelector('h2[data-legacy-thread-id]') ||
      document.querySelector('.hP') ||
      document.querySelector('[role="main"] h2');
    const senderEl =
      document.querySelector('.gD[email]') ||
      document.querySelector('[email]');
    const bodyEls = document.querySelectorAll('.a3s.aiL, .ii.gt .a3s');
    const bodyEl = bodyEls.length ? bodyEls[bodyEls.length - 1] : null;

    const subject = subjectEl ? subjectEl.innerText.trim() : "";
    const fromName = senderEl ? (senderEl.getAttribute("name") || senderEl.innerText || "").trim() : "";
    const fromEmail = senderEl ? (senderEl.getAttribute("email") || "").trim() : "";
    const body = bodyEl ? bodyEl.innerText.trim().slice(0, 600) : "";

    return { subject, fromName, fromEmail, body };
  }

  function refreshEmailContext() {
    const next = extractEmail();
    const changed =
      next.subject !== state.email.subject ||
      next.fromEmail !== state.email.fromEmail ||
      next.body !== state.email.body;
    if (changed) {
      state.email = next;
      renderContext();
    }
  }

  // --- Render -------------------------------------------------------------

  function renderContext() {
    if (!panelEl) return;
    const el = panelEl.querySelector(".rf-context");
    if (!el) return;
    const subject = state.email.subject;
    const from = state.email.fromName || state.email.fromEmail;
    if (!subject && !from) {
      el.classList.add("rf-empty");
      el.querySelector(".rf-context-subject").textContent = "Open an email to get started";
      el.querySelector(".rf-context-from").textContent = "";
    } else {
      el.classList.remove("rf-empty");
      el.querySelector(".rf-context-subject").textContent = subject || "(no subject)";
      el.querySelector(".rf-context-from").textContent = from ? `from ${from}` : "";
    }
  }

  function renderEvents() {
    if (!panelEl) return;
    const wrap = panelEl.querySelector(".rf-events");
    if (!wrap) return;
    if (!state.useCalendar || !state.events.length) {
      wrap.style.display = "none";
      wrap.innerHTML = "";
      return;
    }
    wrap.style.display = "block";
    const items = state.events.slice(0, 10).map((ev) => {
      const name = escapeHtml(ev.summary || "(untitled event)");
      const time = escapeHtml(formatEventTime(ev));
      return `<div class="rf-event"><span class="rf-event-name">${name}</span> &middot; <span class="rf-event-time">${time}</span></div>`;
    });
    wrap.innerHTML = items.join("");
  }

  function formatEventTime(ev) {
    const start = ev.start && (ev.start.dateTime || ev.start.date);
    if (!start) return "";
    const d = new Date(start);
    if (isNaN(d.getTime())) return "";
    const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    if (ev.start.date && !ev.start.dateTime) return `${day} (all day)`;
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${day}, ${time}`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  // --- Build panel --------------------------------------------------------

  function buildPanel() {
    triggerEl = document.createElement("button");
    triggerEl.id = "reply-fast-trigger";
    triggerEl.type = "button";
    triggerEl.setAttribute("aria-label", "Open Reply Fast");
    triggerEl.textContent = "✦";
    triggerEl.addEventListener("click", togglePanel);
    document.body.appendChild(triggerEl);

    panelEl = document.createElement("div");
    panelEl.id = "reply-fast-panel";
    panelEl.innerHTML = `
      <div class="rf-header">
        <div class="rf-header-left"><span class="rf-dot"></span><span>Reply Fast</span></div>
        <button class="rf-close" type="button" aria-label="Close">&#x2715;</button>
      </div>
      <div class="rf-body">
        <div class="rf-section">
          <div class="rf-section-label">Current email</div>
          <div class="rf-context rf-empty">
            <div class="rf-context-subject">Open an email to get started</div>
            <div class="rf-context-from"></div>
          </div>
        </div>

        <div class="rf-section">
          <div class="rf-section-label">Tone</div>
          <div class="rf-tones">
            ${TONES.map((t) => `<button class="rf-tone${t === state.tone ? " rf-active" : ""}" data-tone="${t}" type="button">${t}</button>`).join("")}
          </div>
        </div>

        <div class="rf-section">
          <div class="rf-section-label">Custom instruction</div>
          <textarea class="rf-textarea rf-instruction" placeholder="e.g. 'decline politely', 'ask for more details', or leave blank to auto-draft"></textarea>
        </div>

        <div class="rf-section">
          <label class="rf-checkbox-row">
            <input type="checkbox" class="rf-checkbox rf-calendar-toggle">
            <span class="rf-checkbox-label">Check my calendar availability</span>
          </label>
          <div class="rf-events" style="display:none"></div>
        </div>

        <div class="rf-section">
          <button class="rf-generate" type="button">&#10022; Generate draft</button>
        </div>

        <div class="rf-section rf-draft-section" style="display:none">
          <div class="rf-section-label">Draft</div>
          <textarea class="rf-textarea rf-draft" placeholder="Your draft will appear here"></textarea>
          <div class="rf-actions">
            <button class="rf-action rf-copy" type="button">Copy</button>
            <button class="rf-action rf-insert" type="button">Insert in Gmail</button>
            <button class="rf-action rf-redo" type="button">&#8634; Redo</button>
          </div>
        </div>

        <div class="rf-error"></div>
      </div>

      <div class="rf-settings">
        <div class="rf-section-label">Anthropic API key</div>
        <div class="rf-settings-row">
          <input type="password" class="rf-input rf-api-key" placeholder="sk-ant-..." autocomplete="off">
          <button class="rf-save" type="button">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(panelEl);

    // Wire events
    panelEl.querySelector(".rf-close").addEventListener("click", closePanel);

    panelEl.querySelectorAll(".rf-tone").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.tone = btn.dataset.tone;
        panelEl.querySelectorAll(".rf-tone").forEach((b) => b.classList.toggle("rf-active", b === btn));
      });
    });

    const calToggle = panelEl.querySelector(".rf-calendar-toggle");
    calToggle.addEventListener("change", onCalendarToggle);

    panelEl.querySelector(".rf-generate").addEventListener("click", onGenerate);
    panelEl.querySelector(".rf-copy").addEventListener("click", onCopy);
    panelEl.querySelector(".rf-insert").addEventListener("click", onInsert);
    panelEl.querySelector(".rf-redo").addEventListener("click", onGenerate);

    panelEl.querySelector(".rf-save").addEventListener("click", onSaveApiKey);

    loadApiKey();
  }

  function togglePanel() {
    if (!panelEl) return;
    const open = panelEl.classList.toggle("rf-open");
    triggerEl.classList.toggle("rf-open", open);
    if (open) refreshEmailContext();
  }

  function closePanel() {
    if (!panelEl) return;
    panelEl.classList.remove("rf-open");
    triggerEl.classList.remove("rf-open");
  }

  // --- Settings -----------------------------------------------------------

  function loadApiKey() {
    chrome.storage.local.get(STORAGE_KEY, (res) => {
      if (chrome.runtime.lastError) return;
      const key = res && res[STORAGE_KEY];
      if (key) {
        state.apiKey = key;
        const input = panelEl.querySelector(".rf-api-key");
        if (input) input.placeholder = "•".repeat(16);
      }
    });
  }

  function onSaveApiKey() {
    const input = panelEl.querySelector(".rf-api-key");
    const btn = panelEl.querySelector(".rf-save");
    const value = input.value.trim();
    if (!value) return;
    chrome.storage.local.set({ [STORAGE_KEY]: value }, () => {
      if (chrome.runtime.lastError) {
        showError("Could not save key: " + chrome.runtime.lastError.message);
        return;
      }
      state.apiKey = value;
      input.value = "";
      input.placeholder = "•".repeat(16) + " ✓";
      const prev = btn.textContent;
      btn.textContent = "Saved ✓";
      btn.classList.add("rf-success");
      setTimeout(() => {
        btn.textContent = prev;
        btn.classList.remove("rf-success");
        input.placeholder = "•".repeat(16);
      }, 1500);
    });
  }

  // --- Stubs (filled in later commits) ------------------------------------

  function onCalendarToggle(e) {
    state.useCalendar = e.target.checked;
    renderEvents();
  }

  function onGenerate() {
    showError("Drafting not wired up yet.");
  }

  function onCopy() {}
  function onInsert() {}

  function showError(msg) {
    const el = panelEl.querySelector(".rf-error");
    if (!el) return;
    if (!msg) {
      el.classList.remove("rf-show");
      el.textContent = "";
      return;
    }
    el.textContent = msg;
    el.classList.add("rf-show");
  }

  // --- Observer -----------------------------------------------------------

  function startObserver() {
    domObserver = new MutationObserver(() => {
      if (panelEl && panelEl.classList.contains("rf-open")) refreshEmailContext();
    });
    domObserver.observe(document.body, { childList: true, subtree: true });
  }

  function destroy() {
    if (domObserver) { domObserver.disconnect(); domObserver = null; }
    if (panelEl) { panelEl.remove(); panelEl = null; }
    if (triggerEl) { triggerEl.remove(); triggerEl = null; }
  }

  // --- Init ---------------------------------------------------------------

  function init() {
    if (!document.body) return setTimeout(init, 200);
    buildPanel();
    startObserver();
  }

  window.addEventListener("beforeunload", destroy);
  init();
})();
