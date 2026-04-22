# Reply Fast

An AI-powered Gmail assistant. Open any email in Gmail, click the ✦
floating button, and draft a reply with Google Gemini in one click.
If the email asks about availability, Reply Fast checks your Google
Calendar and weaves real free/busy slots into the reply.

- Manifest V3 Chrome extension
- Plain JS / HTML / CSS — no build step, no bundler
- Google Gemini (AI Studio) for drafting — has a free tier
- Google Calendar read-only for availability checks

## Install

1. **Download** this folder (or `git clone` it) to a stable location on
   your machine.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (toggle, top right).
4. Click **Load unpacked** and select this folder.

The extension will appear in the toolbar. It only activates on
`https://mail.google.com/*`.

## Configure the Google OAuth client ID

Reply Fast uses `chrome.identity` for the Google sign-in flow, so you
need a Google OAuth client ID bound to your extension's ID.

1. Load the unpacked extension once (step 4 above). Copy the generated
   extension ID from `chrome://extensions` (long string of letters).
2. Go to the [Google Cloud Console](https://console.cloud.google.com/)
   and create (or pick) a project.
3. Under **APIs & Services → Library**, enable:
   - **Gmail API**
   - **Google Calendar API**
4. Under **APIs & Services → OAuth consent screen**, configure a
   consent screen (External is fine). Add the scopes
   `https://www.googleapis.com/auth/gmail.readonly` and
   `https://www.googleapis.com/auth/calendar.readonly`. Add your own
   Google account as a test user.
5. Under **APIs & Services → Credentials**, create an **OAuth client
   ID** of type **Chrome Extension**. Paste the extension ID from
   step 1 into the "Application ID" field.
6. Copy the client ID (looks like `1234-abc...apps.googleusercontent.com`)
   and paste it into `manifest.json`, replacing the placeholder:

   ```json
   "oauth2": {
     "client_id": "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com",
     ...
   }
   ```

7. In `chrome://extensions`, click the refresh icon on Reply Fast so
   Chrome picks up the new manifest.

## Configure your Gemini API key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey) and
   sign in with any Google account.
2. Click **Create API key**. Copy it — it looks like `AIza...`.
3. Open Gmail. Click the gold **✦** button at the bottom-right.
4. At the bottom of the side panel under **Gemini API key**, paste the
   key and hit **Save**. It's stored in `chrome.storage.local` and
   stays on your machine.

The free tier of AI Studio is usually plenty for personal email use.
No billing setup required.

## Using Reply Fast

1. Open an email conversation in Gmail.
2. Click the ✦ floating button to open the panel.
3. Pick a tone (Professional / Friendly / Brief / Formal).
4. Optionally type a custom instruction (e.g. *"decline politely"*,
   *"ask for more details"*) — leave blank and Gemini will figure it
   out.
5. Check **Check my calendar availability** if the email involves
   scheduling — you'll see the next week's events appear below.
6. Click **Generate draft**. The reply appears in a textarea you can
   edit.
7. Click **Insert in Gmail** to drop it into the reply editor, or
   **Copy** to clipboard, or **↺ Redo** to regenerate.

The sun/moon icon at the top-right of the panel toggles between dark
and light themes. Your choice is remembered across sessions.

## Notes

- Reply Fast only runs on `https://mail.google.com/*`. It has no
  effect on any other site.
- No data leaves your browser except: (a) calendar reads straight to
  Google, (b) the email subject/body/tone/instruction sent to the
  Gemini API as part of the draft prompt (also Google).
- The API key is stored in Chrome's local extension storage, not
  synced across devices.
