---
type: lesson
category: error
scope: speakease
tags: [area/audio, area/capture, stack/swift, surface/macos, coreaudio]
summary: "To hear one app through a Core Audio process tap, include every process it is responsible for: browsers play from *.helper and WebKit apps from com.apple.WebKit.GPU."
status: active
superseded_by:
last_verified: 2026-10-20
---

# An app's sound does not come from the app's process

## Trigger

Live subtitles, Phase 0 (20/10): Core Audio's process list showed Chrome's sound coming from
`com.google.Chrome.helper`, and two `com.apple.WebKit.GPU` processes with no app name at all - a tap on the app's own
bundle id would have heard silence.

## Root cause

Chromium and WebKit render audio out of process. The helper's bundle id may extend the app's (`…Chrome.helper`) or
not name it at all (`com.apple.WebKit.GPU`, shared by Safari and every app with a web view).

## Fix

`swift/system_audio_tap.swift` `belongsToApp`: a process belongs to the app when its bundle id is or extends the app's,
or when `responsibility_get_pid_responsible_for_pid` names the app; SpeakEase's own processes are excluded. Checked: the
two WebKit.GPU processes resolved to SpeakEase and Google Drive, Chrome's helpers to Chrome. When an app runs twice
(two Chrome profiles), take the instance responsible for the sound.

## Guardrail

Before tapping, log the processes with `playing` and their responsible app (the probe's `start` line does), and treat
all-zero audio while the app plays as a matching or permission problem, not silence.
