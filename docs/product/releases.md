---
id: speakease-releases
type: release
product: speakease
title: "SpeakEase — Releases"
status: active
updated: 2026-11-12
summary: "What each published SpeakEase version shipped, through which channel and with which rules; 0.1.2 (meeting notes, on-device AI models, live subtitles) shipped on 12 Nov 2026."
tags: [area/release, area/updater]
relations:
  presentedBy: [github:wblekhoa/speakease/releases]
---

# SpeakEase — Releases (newest first)

Source of truth for details: `CHANGELOG.md` (repo root) and `gh release list -R wblekhoa/speakease`.

## 0.1.2 — 2026-11-12

- **What changed for users**: meeting notes (beta, macOS 14.2+): Start recording on the new Meetings page, a shortcut
  or the menu bar records the meeting app and the microphone, or the microphone alone; a bar with a timer, Stop and
  live help; notes in a template with the transcript, questions about a meeting, and a switch for the "Take notes of
  this call?" question. On-device AI models downloaded inside the app. Live subtitles (beta, behind Experimental).
  History: rewrite with your own instruction, today and the last 14 days. Updates and the version moved to the
  sidebar and the App page; new app icon. Users of 0.1.0 and 0.1.1 get it through the in-app updater.
- **REQ-IDs shipped**: SE-MEET-001…023, SE-LIVE-001…015, SE-AI-012…013, SE-HIST-004; all earlier rules unchanged.
- **Channel**: GitHub release `v0.1.2` (tag on `31e422e`, 102 commits past 0.1.1) - `.dmg` / `.zip` (Developer ID
  signed, notarized, stapled), the updater archive with its signature, and `latest.json`. Built from `main`'s tip with
  `scripts/release-mac.sh` after CI was green on that commit, installed and started once, then published by hand with
  the script's own `gh release create` line and `--target` on that commit. Checked after publishing: the tag's commit
  through the API, the served `latest.json` (0.1.2, identical to the built one) and the served updater archive
  (same SHA-256 as the built one, signature valid against the key 0.1.1 trusts).
- **Not seen before release**: no meeting, call question, switch or live-subtitles session was run in the installed
  build; the only run was a hidden start (process alive, no error line, shortcuts registered, old settings loaded
  with the new switch on).
- **Shown in**: https://github.com/wblekhoa/speakease/releases/tag/v0.1.2

## 0.1.1 — 2026-10-15

- **What changed for users**: Files & links reads MKV and WebM videos and Opus audio, including Telegram/WhatsApp voice
  messages (.ogg, .opus); MP4/MOV files read about twice as fast. Users of 0.1.0 get it through the in-app updater.
- **REQ-IDs shipped**: SE-FILE-001 (widened: MKV/WebM containers, Opus codec); all 0.1.0 rules unchanged.
- **Channel**: GitHub release `v0.1.1` (tag on `f1f364e`) - `.dmg` / `.zip` (Developer ID signed, notarized, stapled),
  the updater archive with its signature, and `latest.json` (checked to answer 0.1.1 after publishing). Built and
  published with `scripts/release-mac.sh --publish`.
- **Shown in**: https://github.com/wblekhoa/speakease/releases/tag/v0.1.1

## 0.1.0 — 2026-10-15

- **What changed for users**: the first SpeakEase on top of Handy at `f6b3f82`: Vietnamese-first model suggestions,
  long dictations split at pauses, AI cleanup and translation with Apple Intelligence or the user's own key (switchable
  from the recording pill), Files & links (audio/video files and links to text, then rewrite or translate), the Speak
  page, settings in the order a dictation goes, a searchable History, a tray menu, an interface-language menu, and
  updates from SpeakEase's own feed (`CHANGELOG.md`).
- **REQ-IDs shipped**: SE-REC-001…008, SE-AI-001…011, SE-HIST-001…003, SE-APP-001…011, SE-FILE-001…006.
- **Channel**: GitHub release `v0.1.0` (tag on `f0cc17c`) - `SpeakEase-0.1.0-arm64.dmg` / `.zip` (Developer ID signed,
  notarized, stapled), the updater archive with its signature, and `latest.json` (the in-app updater's feed; checked to
  answer 0.1.0 after publishing). Built and published with `scripts/release-mac.sh --publish`.
- **Shown in**: https://github.com/wblekhoa/speakease/releases/tag/v0.1.0 · README Install (both languages).
