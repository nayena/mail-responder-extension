// Reply Fast — service worker. Handles OAuth, Google Calendar, and Claude API.

chrome.runtime.onInstalled.addListener(() => {
  console.log("Reply Fast installed.");
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") {
    sendResponse({ ok: false, error: "Invalid message" });
    return true;
  }

  switch (msg.type) {
    case "GET_AUTH_TOKEN":
      getAuthToken(!!msg.interactive)
        .then((token) => sendResponse({ ok: true, token }))
        .catch((err) => sendResponse({ ok: false, error: String(err && err.message || err) }));
      return true;

    case "FETCH_CALENDAR":
      fetchCalendar(msg.token)
        .then((events) => sendResponse({ ok: true, events }))
        .catch((err) => sendResponse({ ok: false, error: String(err && err.message || err) }));
      return true;

    case "CALL_CLAUDE":
      callClaude(msg)
        .then((data) => sendResponse({ ok: true, data }))
        .catch((err) => sendResponse({ ok: false, error: String(err && err.message || err) }));
      return true;

    default:
      sendResponse({ ok: false, error: "Unknown message type: " + msg.type });
      return true;
  }
});

function getAuthToken(interactive) {
  return new Promise((resolve, reject) => {
    try {
      chrome.identity.getAuthToken({ interactive }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!token) {
          reject(new Error("No token returned"));
          return;
        }
        resolve(token);
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function fetchCalendar(token) {
  if (!token) throw new Error("Missing OAuth token");
  const now = new Date();
  const later = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: later.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Calendar API ${res.status}: ${text || res.statusText}`);
  }
  const json = await res.json();
  return Array.isArray(json.items) ? json.items : [];
}

async function callClaude({ apiKey, system, messages, model, max_tokens }) {
  if (!apiKey) throw new Error("Missing Anthropic API key");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: model || "claude-opus-4-5",
      max_tokens: max_tokens || 1024,
      system: system || "",
      messages: messages || [],
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json && json.error && json.error.message) || res.statusText || "Claude API error";
    throw new Error(`Claude API ${res.status}: ${msg}`);
  }
  return json;
}
