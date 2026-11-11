# Changelog

All notable changes to SpeakEase. SpeakEase is built on Handy; changes that
come from merging Handy are summarised, not repeated.

## 0.1.2 — 2026-11-12

- **Meeting notes (beta)**, on macOS 14.2 and later: press **Start recording**
  on the new Meetings page (or ⌃⌥⌘M, or the menu bar) and SpeakEase records the
  app you are meeting in and your microphone - or the microphone alone when no
  call app is running, for a talk in the room. A bar at the top of the screen
  shows a timer, Stop, Help and a reminder to tell everyone; Help opens live
  help under the bar: the transcript as it goes, a catch-up on what you missed,
  a running summary and suggestions. When you stop, the notes write themselves
  in a template that fits a meeting, a call, a lecture or an interview (for a
  meeting: a short summary, decisions, proposals and action items), with the
  full transcript. Ask questions about a meeting and get answers that point to the
  lines they used; copy the notes or save them as .md or .txt. A menu beside
  Start picks what to record. When a call app takes the microphone the bar asks
  whether to take notes; a switch in Settings turns that question off. A
  recording brought in through Files & links can become a meeting too.
- **On-device AI models**: on an Apple silicon Mac the AI steps can run on a
  model you download inside the app, with no key and no Apple Intelligence.
  Pick it under AI & Translate like a speech model. (Meeting notes use
  Qwen3.5-4B, and only when the Mac has no Apple Intelligence and no key is
  saved.)
- **Live subtitles (beta)**: turn on Experimental on the App page, then open
  Live subtitles in the sidebar. Pick an app (a browser, Zoom, a podcast or
  video player), the language it speaks and the one you read, and a floating
  panel subtitles it as it plays, translated on the Mac.
  It reads what is playing (a video's title, a file's name) so names and terms
  come out right, fixes a sentence once it is complete, and saves the session
  to History. Needs macOS 14.2+ and asks once to record system audio.
- **History**: rewrite a transcript with your own instruction, and see today's
  additions and the last 14 days above the list.
- **Updates and the version moved** from the footer to the sidebar and the App
  page; models are picked on the Speak page only.
- **New app icon** that macOS 26 and later show whole, instead of inside a grey
  box: the pink speech bubble now sits, in white, on a pink rounded square.

## 0.1.1 — 2026-10-15

- **More formats in Files & links**: MKV and WebM videos, and Opus audio -
  including voice messages from Telegram or WhatsApp (.ogg, .opus).
- MP4 and MOV files are read about twice as fast.

## 0.1.0 — 2026-10-15

The first version of SpeakEase, on top of Handy at `f6b3f82`. Apple Silicon Macs.

- **Vietnamese first.** Models ranked by how well they hear Vietnamese
  (measured on Google FLEURS); custom words; a Vietnamese and English interface
  that follows the Mac's language, with its own menu at the foot of the sidebar.
- **AI cleanup and translation** with Apple Intelligence on the Mac, or with
  your own API key: _Vietnamese cleanup_ and _Write as an email_ prompts, and
  translation into 12 languages (anything other than English goes through
  English, which translates far better on-device).
- **Change the output while you speak**: two buttons inside the recording pill
  switch AI cleanup and translation for the dictation in progress.
- **Long dictations stay whole**: audio is split at pauses, so nothing is dropped
  whatever the model.
- **Files & links**: drop audio or video files on the window (several at once),
  choose them, or paste a link, and get the words in seconds - only the sound is
  read, so a 10-minute video takes about 11 s. Then rewrite or translate the
  text, copy it or save it as .txt. YouTube links need yt-dlp; the app shows the
  one command to install it.
- **Speak page**: the microphone, model, language, AI cleanup and translation
  one click away, and a microphone button that dictates without the shortcut.
- **Settings in the order a dictation goes**: Recording, Recognition,
  AI & Translate, App. One switch turns every AI step off.
- **History**: search, counters, one card per dictation or file with the
  original under the AI version, playback, re-transcription, and rewrite or
  translate after the fact.
- **Tray menu**: listening language, model, AI cleanup and translation.
- **Updates from SpeakEase's own releases**: Check for Updates… in the app
  menu and the tray, an automatic check that can be switched off in App, and
  updates signed with SpeakEase's own key.
- Removed what only made sense for Handy: donation links and its update feed.
