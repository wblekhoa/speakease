---
id: speakease-releases
type: release
product: speakease
title: "SpeakEase — Releases"
status: active
updated: 2026-10-11
relations:
  presentedBy: [github:wblekhoa/speakease/releases]
---

# SpeakEase — Releases (newest first)

Source of truth for details: `CHANGELOG.md` (repo root) and `gh release list -R wblekhoa/speakease`.

**No release has been published yet.** `gh release list -R wblekhoa/speakease` returned nothing on 2026-10-11, and
`CHANGELOG.md` lists the first version as "Unreleased — 0.1.0". Until a release exists, users build from source
(`README.en.md` › Install). Add an entry here only when a GitHub release is actually published - never ahead of it.

## Unreleased (0.1.0, not published)

- **What changed for users**: the first SpeakEase on top of Handy at `f6b3f82`: Vietnamese-first model suggestions,
  AI cleanup and translation with Apple Intelligence or the user's own key, the Speak page, settings in the order a
  dictation goes, a searchable History, a tray menu, and updates from SpeakEase's own release feed (`CHANGELOG.md`).
- **REQ-IDs it will ship**: SE-REC-001…007, SE-AI-001…010, SE-HIST-001…003 (all `live` on `main` as of 2026-10-11).
- **Channel**: none yet - `scripts/release-mac.sh --publish` builds a signed, notarized Apple Silicon build and creates the GitHub release with the updater files; it has not been run for a release yet.
- **Shown in**: none yet.
