# Changelog

All notable changes to SpeakEase. SpeakEase is built on Handy; changes that
come from merging Handy are summarised, not repeated.

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
