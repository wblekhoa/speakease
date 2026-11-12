---
id: speakease-releases
type: release
product: speakease
title: "SpeakEase — Releases"
status: active
updated: 2026-11-12
summary: "What each published SpeakEase version shipped, through which channel and with which rules; 0.1.3 (a meeting's text stays on the Mac when the on-device model is picked) shipped on 12 Nov 2026, the same day as 0.1.2."
tags: [area/release, area/updater]
relations:
  presentedBy: [github:wblekhoa/speakease/releases]
---

# SpeakEase — Releases (newest first)

Source of truth for details: `CHANGELOG.md` (repo root) and `gh release list -R wblekhoa/speakease`.

## 0.1.3 — 2026-11-12

- **What changed for users**: on a Mac without Apple Intelligence, with On-device model picked in AI & Translate, a
  meeting's text no longer goes to a service a key is saved for. Meeting notes, questions about a meeting and live
  help run on Qwen3.5 4B on the Mac; if that model is not downloaded they are off and the app says why. 0.1.2 sent
  the text to the saved key's service in this case. With Apple Intelligence on the Mac, or with another service
  picked, nothing changes. The feed and the updater key are the ones 0.1.2 ships with.
- **REQ-IDs shipped**: SE-MEET-012 (engine order changed; the other 0.1.2 rules are unchanged).
- **Channel**: GitHub release `v0.1.3` (tag on `7b8ed98`, 7 commits past 0.1.2) - `.dmg` / `.zip` (Developer ID
  signed, notarized, stapled), the updater archive with its signature, and `latest.json`. Built from `main`'s tip with
  `scripts/release-mac.sh` (no `--publish`) and, with CI green on that commit, published by hand with the script's
  own `gh release create` line and `--target` on that commit. Before publishing: the updater signature checked
  against the key in 0.1.2's `tauri.conf.json`, the app inside the updater archive compared with the built app (no
  difference), and the built app started once hidden from its build folder. Checked after publishing: the tag's
  commit, `releases/latest` (v0.1.3), the served `latest.json`, updater archive, `.dmg` and `.zip` (each identical to
  the built file).
- **Not seen before release**: notes written by the on-device model from the app (the build Mac has no Qwen3.5 4B;
  the order is covered by `on_device_picked_never_falls_back_to_a_saved_key`), and the three new "model not
  downloaded" lines in the running app. As in 0.1.2, no meeting, call question, switch or live-subtitles session was
  run in the build; the only run was a hidden start (process alive, no error line, shortcuts registered, old
  settings loaded). The build was not installed: the build Mac stays on 0.1.2 so the first in-app update can be
  watched, and none has been watched yet.
- **Shown in**: https://github.com/wblekhoa/speakease/releases/tag/v0.1.3

## 0.1.2 — 2026-11-12

- **What changed for users**: meeting notes (beta, macOS 14.2+): Start recording on the new Meetings page, a shortcut
  or the menu bar records the meeting app and the microphone, or the microphone alone; a bar with a timer, Stop and
  live help; notes in a template with the transcript, questions about a meeting, and a switch for the "Take notes of
  this call?" question. On-device AI models (Apple silicon) downloaded inside the app. Live subtitles (beta, behind
  Experimental).
  History: rewrite with your own instruction, today and the last 14 days. Updates and the version moved to the
  sidebar and the App page; new app icon. 0.1.0 and 0.1.1 are offered it by the in-app updater (same key, same feed).
- **REQ-IDs shipped**: SE-MEET-001…023, SE-LIVE-001…015, SE-AI-012…013, SE-HIST-004.
- **Channel**: GitHub release `v0.1.2` (tag on `31e422e`, 102 commits past 0.1.1) - `.dmg` / `.zip` (Developer ID
  signed, notarized, stapled), the updater archive with its signature, and `latest.json`. Built from `main`'s tip with
  `scripts/release-mac.sh` (no `--publish`), installed and started once, then - with CI green on that commit -
  published by hand with the script's own `gh release create` line and `--target` on that commit. Checked after
  publishing: the tag's commit through the API, the served `latest.json` (0.1.2, identical to the built one) and the
  served updater archive (same SHA-256 as the built one, signature valid against the key 0.1.0 and 0.1.1 trust).
- **Not seen before release**: no meeting, call question, switch or live-subtitles session was run in the installed
  build; the only run was a hidden start (process alive, no error line, shortcuts registered, old settings loaded
  with the new switch on). No update from an installed 0.1.1 to 0.1.2 was watched either.
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
