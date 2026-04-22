// Reply Fast — Gmail content script. Injects the floating trigger and side panel.
(() => {
  if (window.__replyFastLoaded) return;
  window.__replyFastLoaded = true;

  const TONES = ["Professional", "Friendly", "Brief", "Formal"];
  const STORAGE_KEY = "rf_api_key";
  const THEME_KEY = "rf_theme";

  const state = {
    tone: "Professional",
    email: { subject: "", fromName: "", fromEmail: "", body: "" },
    events: [],
    useCalendar: false,
    apiKey: "",
    draft: "",
    busy: false,
    theme: "dark",
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
        <div class="rf-header-right">
          <button class="rf-icon-btn rf-theme-toggle" type="button" aria-label="Toggle theme" title="Toggle theme">&#9788;</button>
          <button class="rf-icon-btn rf-close" type="button" aria-label="Close">&#x2715;</button>
        </div>
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
        <div class="rf-section-label">Gemini API key</div>
        <div class="rf-settings-row">
          <input type="password" class="rf-input rf-api-key" placeholder="AIza..." autocomplete="off">
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
    panelEl.querySelector(".rf-theme-toggle").addEventListener("click", toggleTheme);

    loadApiKey();
    loadTheme();
  }

  function applyTheme(theme) {
    state.theme = theme === "light" ? "light" : "dark";
    if (!panelEl) return;
    panelEl.classList.toggle("rf-theme-light", state.theme === "light");
    const btn = panelEl.querySelector(".rf-theme-toggle");
    if (btn) {
      // Show the icon of the OTHER mode — i.e. what clicking will switch to.
      btn.innerHTML = state.theme === "dark" ? "&#9788;" : "&#9790;";
      btn.setAttribute(
        "aria-label",
        state.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
      );
    }
  }

  function loadTheme() {
    chrome.storage.local.get(THEME_KEY, (res) => {
      if (chrome.runtime.lastError) { applyTheme("dark"); return; }
      applyTheme(res && res[THEME_KEY] === "light" ? "light" : "dark");
    });
  }

  function toggleTheme() {
    const next = state.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    chrome.storage.local.set({ [THEME_KEY]: next }, () => {
      void chrome.runtime.lastError;
    });
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

  // --- Messaging ----------------------------------------------------------

  function sendMessage(payload) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(payload, (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!res) {
            reject(new Error("No response from background"));
            return;
          }
          if (!res.ok) {
            reject(new Error(res.error || "Unknown error"));
            return;
          }
          resolve(res);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  // --- Calendar -----------------------------------------------------------

  async function onCalendarToggle(e) {
    state.useCalendar = e.target.checked;
    const wrap = panelEl.querySelector(".rf-events");
    if (!state.useCalendar) {
      state.events = [];
      renderEvents();
      return;
    }
    showError("");
    wrap.style.display = "block";
    wrap.innerHTML = `<div class="rf-event-time">Loading calendar…</div>`;
    try {
      const tokRes = await sendMessage({ type: "GET_AUTH_TOKEN", interactive: true });
      const calRes = await sendMessage({ type: "FETCH_CALENDAR", token: tokRes.token });
      state.events = calRes.events || [];
      renderEvents();
      if (!state.events.length) {
        wrap.style.display = "block";
        wrap.innerHTML = `<div class="rf-event-time">No events in the next 7 days.</div>`;
      }
    } catch (err) {
      state.useCalendar = false;
      e.target.checked = false;
      wrap.style.display = "none";
      wrap.innerHTML = "";
      showError("Calendar: " + err.message);
    }
  }

  // --- Gemini drafting ----------------------------------------------------

  const AVAILABILITY_RE = /\b(availab\w*|free|meet(ing)?|schedul\w*|calendar|call|chat|sync|catch up|time(s)? (to|that|work)|when (are|can|would|is|should)|let me know.*time|best time|propose.*time|suggest.*time)\b/i;

  function formatEventForPrompt(ev) {
    const start = ev.start && (ev.start.dateTime || ev.start.date);
    const end = ev.end && (ev.end.dateTime || ev.end.date);
    if (!start) return null;
    const s = new Date(start);
    if (isNaN(s.getTime())) return null;
    const day = s.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    if (ev.start.date && !ev.start.dateTime) {
      return `• ${ev.summary || "(event)"}: ${day} (all day)`;
    }
    const sTime = s.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).toLowerCase().replace(" ", "");
    let eTime = "";
    if (end) {
      const e = new Date(end);
      if (!isNaN(e.getTime())) {
        eTime = e.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).toLowerCase().replace(" ", "");
      }
    }
    const range = eTime ? `${sTime} – ${eTime}` : sTime;
    return `• ${ev.summary || "(event)"}: ${day}, ${range}`;
  }

  function buildUserPrompt({ email, tone, instruction, events, includeAvailability }) {
    const parts = [];
    parts.push(`Incoming email:`);
    const from = email.fromName
      ? `${email.fromName}${email.fromEmail ? ` <${email.fromEmail}>` : ""}`
      : (email.fromEmail || "(unknown sender)");
    parts.push(`From: ${from}`);
    parts.push(`Subject: ${email.subject || "(no subject)"}`);
    parts.push(`Body:\n${email.body || "(empty)"}`);
    parts.push("");
    parts.push(`Tone: ${tone}`);
    if (instruction) parts.push(`Custom instruction from me: ${instruction}`);

    if (events && events.length) {
      const bullets = events.map(formatEventForPrompt).filter(Boolean).join("\n");
      parts.push("");
      parts.push("My calendar for the next 7 days (busy blocks):");
      parts.push(bullets || "(none)");
      if (includeAvailability) {
        parts.push("");
        parts.push("This email appears to ask about availability. Reference my calendar above and propose specific free slots — weekdays 9:00am–6:00pm local time are preferred. Avoid anything that collides with the busy blocks. Offer 2–3 concrete options (weekday, date, and time range).");
      }
    }

    parts.push("");
    parts.push("Write the reply now. Return only the reply body.");
    return parts.join("\n");
  }

  async function onGenerate() {
    if (state.busy) return;

    if (!state.apiKey) {
      showError("Add your Gemini API key below, then try again.");
      return;
    }
    if (!state.email.subject && !state.email.body) {
      showError("Open an email first — I couldn't find one on the page.");
      return;
    }

    const instructionEl = panelEl.querySelector(".rf-instruction");
    const instruction = (instructionEl.value || "").trim();
    const asksAboutAvailability = AVAILABILITY_RE.test(`${state.email.subject} ${state.email.body}`);

    const systemPrompt = "You are an expert email assistant. Write clear, natural email replies. Return ONLY the reply body — no subject line, no preamble.";
    const userPrompt = buildUserPrompt({
      email: state.email,
      tone: state.tone,
      instruction,
      events: state.useCalendar ? state.events : [],
      includeAvailability: state.useCalendar && asksAboutAvailability,
    });

    const generateBtn = panelEl.querySelector(".rf-generate");
    const draftSection = panelEl.querySelector(".rf-draft-section");
    const draftEl = panelEl.querySelector(".rf-draft");

    state.busy = true;
    showError("");
    generateBtn.disabled = true;
    const prevLabel = generateBtn.textContent;
    generateBtn.textContent = "Drafting…";

    try {
      const res = await sendMessage({
        type: "CALL_GEMINI",
        apiKey: state.apiKey,
        system: systemPrompt,
        userText: userPrompt,
        model: "gemini-2.5-flash",
        maxOutputTokens: 1024,
      });
      const text = extractGeminiText(res.data);
      if (!text) throw new Error("Gemini returned no text.");
      state.draft = text;
      draftSection.style.display = "block";
      draftEl.value = text;
    } catch (err) {
      showError(err.message || String(err));
    } finally {
      state.busy = false;
      generateBtn.disabled = false;
      generateBtn.innerHTML = "&#10022; Generate draft";
    }
  }

  function extractGeminiText(data) {
    if (!data || !Array.isArray(data.candidates) || !data.candidates.length) return "";
    const parts = data.candidates[0]?.content?.parts;
    if (!Array.isArray(parts)) return "";
    return parts
      .filter((p) => p && typeof p.text === "string")
      .map((p) => p.text)
      .join("\n")
      .trim();
  }

  // --- Copy / Insert ------------------------------------------------------

  function flashSuccess(btn, label) {
    const prev = btn.textContent;
    btn.textContent = label;
    btn.classList.add("rf-success");
    setTimeout(() => {
      btn.textContent = prev;
      btn.classList.remove("rf-success");
    }, 2000);
  }

  function currentDraft() {
    const el = panelEl.querySelector(".rf-draft");
    return el ? el.value : "";
  }

  async function onCopy() {
    const text = currentDraft();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      flashSuccess(panelEl.querySelector(".rf-copy"), "✓ Copied");
    } catch (err) {
      showError("Copy failed: " + (err.message || err));
    }
  }

  function findReplyButton() {
    return (
      document.querySelector('[data-tooltip="Reply"]') ||
      document.querySelector('button[aria-label="Reply"]') ||
      document.querySelector('[aria-label^="Reply"]')
    );
  }

  function findComposeBody() {
    return (
      document.querySelector('[aria-label="Message Body"]') ||
      document.querySelector('.Am.Al.editable') ||
      document.querySelector('[contenteditable="true"][role="textbox"]')
    );
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function onInsert() {
    const text = currentDraft();
    if (!text) return;
    const insertBtn = panelEl.querySelector(".rf-insert");

    try {
      let composeBody = findComposeBody();
      if (!composeBody) {
        const replyBtn = findReplyButton();
        if (replyBtn) {
          replyBtn.click();
          await wait(600);
          composeBody = findComposeBody();
        }
      }
      if (!composeBody) throw new Error("Couldn't find the Gmail reply editor.");

      composeBody.focus();
      composeBody.innerHTML = escapeHtml(text).replace(/\n/g, "<br>");
      composeBody.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true }));
      flashSuccess(insertBtn, "✓ Inserted");
    } catch (err) {
      try {
        await navigator.clipboard.writeText(text);
        showError(`${err.message} Copied to clipboard instead — paste into the reply.`);
      } catch {
        showError(err.message || String(err));
      }
    }
  }

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
