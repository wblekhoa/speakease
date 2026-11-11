---
type: session-brief
last_updated: 2026-11-12
updated_by: claude (meeting lane 4, ask switch)
summary: "Open threads for SpeakEase: meeting notes built through phase 5 and Files; what waits for the owner."
---

# SpeakEase — session brief

## Open threads

- **Meeting notes** (spec `docs/product/specs/2026-10-28-meeting-notes.md` on `origin/speakease`, plans
  `ai-memory/plans/meeting-notes-build.md`, `ai-memory/plans/meeting-open-start.md`): phases 1-5 and Files, the
  microphone-only meeting (#12, SE-MEET-020), the Meetings page's Start control with notes out of Experimental
  (#13, SE-MEET-021/022) and the three "Take notes of this call?" races (#14) are on `main` at `8a23225`. A test
  build from `8a23225` was installed on 2026-11-11 and starts cleanly; no meeting has been run in it. Lane 4 PR
  (branch `claude/meeting-ask-switch-2280af`): the "Ask when a call starts" switch (SE-MEET-023, on by default,
  decided by the coordinator under the owner's delegation), the panic guard armed before `show()`, the Start/Stop
  focus fix and the list's load error. Unverified: no real call or file in the installed app; levels 3-5 with a real
  AI; heat and battery. Waiting for the owner: the `.docx` dependency, a real call to measure, release 0.1.2. Next:
  merge lane 4, then release 0.1.2 and the owner's two-minute microphone-only meeting.
