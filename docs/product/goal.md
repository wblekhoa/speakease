---
id: speakease-goal
type: goal
product: speakease
title: "SpeakEase — Product goal"
status: active
updated: 2026-10-15
summary: "Why SpeakEase exists: on-device Vietnamese-first dictation for Mac users who write a lot, its promise, audience, success measures and non-goals."
tags: [area/audio, area/ai, surface/macos]
---

# SpeakEase — Product goal

## Problem

- Typing Vietnamese on a Mac is slow (tone marks through Telex or VNI input), and cloud dictation sends the user's
  voice to someone else's server. A Vietnamese speaker who writes all day has no dictation that hears Vietnamese well,
  tidies it up, and keeps the audio on the Mac.

## Audience

- Primary: a Vietnamese speaker on an Apple Silicon Mac who writes a lot - messages, email, notes, documents - in any app.
- Secondary: a bilingual speaker who speaks Vietnamese and wants English (or another language) pasted.
- Who pays: nobody today - the app is free under PolyForm Noncommercial 1.0.0 (the Handy code inside stays MIT, see
  `NOTICE.md`). An online AI service, if the user adds a key, bills the user's own account directly.

## Promise

- Hold a key, speak Vietnamese, let go: the text lands where the cursor is, in any app - recognised on the Mac, and
  cleaned up or translated on the Mac with Apple Intelligence unless the user chooses their own API key.

## Success measures

| Measure                                               | Today (observed 2026-10-11)                    | Target  | How it is measured (command, dashboard, store data)                                                                     |
| ----------------------------------------------------- | ---------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| Public releases shipped                               | 1 (v0.1.0, 2026-10-15)                         | not set | `gh release list -R wblekhoa/speakease`                                                                                 |
| Installer downloads                                   | 0 at publishing (2026-10-15)                   | not set | `gh api repos/wblekhoa/speakease/releases --paginate --jq '[.[].assets[].download_count] \| add'` once a release exists |
| GitHub stars / forks                                  | 0 / 0 (GitHub API, 2026-10-11)                 | not set | `gh api repos/wblekhoa/speakease --jq '{stars:.stargazers_count,forks:.forks_count}'`                                   |
| Vietnamese word error rate of the top suggested model | 6.3 % (Cohere Transcribe, 60 FLEURS sentences) | not set | measured with the app's own engine; figures in `src/lib/utils/vietnameseModels.ts` and the README table                 |
| Active users / retention                              | not measured                                   | not set | no method: the app has no usage tracking by design (`PRIVACY.md`)                                                       |

## Non-goals

- No SpeakEase account, no SpeakEase server, no usage tracking, no automatic crash reports.
- Audio never leaves the Mac; only text goes to an online AI service, and only to one the user added a key for.
- Interface languages are Vietnamese and English only.
- Apple Silicon Macs are the only target SpeakEase tests and documents; Handy's Windows and Linux code stays in the
  tree untouched.

## Links

- UX: `ux/dictation.md` · `ux/ai-cleanup.md` · `ux/history.md`
- Logic: `logic/dictation.md` · `logic/ai-cleanup.md` · `logic/history.md`
- Decisions: `decisions.md` · Releases: `releases.md`
- Public context: `README.en.md`, `PRIVACY.md`, `NOTICE.md`, `CHANGELOG.md` at the repo root

## Change log

- 2026-10-11: created (doc-engine rollout); measures read from the GitHub API on this date.
