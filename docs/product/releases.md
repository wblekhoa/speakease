---
id: speakease-releases
type: release
product: speakease
title: "SpeakEase — Releases"
status: active
updated: 2026-10-15
summary: "What each published SpeakEase version shipped, through which channel and with which rules; 0.1.0 and 0.1.1 shipped on 15 Oct 2026."
tags: [area/release, area/updater]
relations:
  presentedBy: [github:wblekhoa/speakease/releases]
---

# SpeakEase — Releases (newest first)

Source of truth for details: `CHANGELOG.md` (repo root) and `gh release list -R wblekhoa/speakease`.

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
