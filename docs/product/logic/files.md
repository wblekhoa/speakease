---
id: speakease-logic-files
type: logic
product: speakease
title: "SpeakEase — Files (logic)"
status: active
updated: 2026-10-14
reqPrefix: SE-FILE
relations:
  specifiedBy: [speakease-ux-files]
  implements:
    - speakease:src-tauri/src/commands/files.rs
    - speakease:src-tauri/src/managers/history.rs
    - speakease:src/components/settings/files/FilesPage.tsx
---

# SpeakEase — Files (logic)

## Purpose

- Turn an audio or video file, or a link to one, into text quickly, then make that text better or move it into another
  language - the same recognition and AI steps dictation uses, applied to something already recorded.
- Success signal: a 10-minute video is text in about 12 seconds on an Apple Silicon Mac; no stretch of speech is
  dropped; nothing but the sound is processed.

## Rules

Status column: `live`, `not built`, or `blocked`. A live rule has its REQ-ID as a one-line comment next to the test
or code named in Evidence.

| REQ-ID      | Rule (behaviour-changing)                                                                                                                                                                                                                                                                                                                                                                           | Status (live / not built / blocked) | Evidence (code path or test)                                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| SE-FILE-001 | Only the sound is used: the audio track is decoded straight to 16 kHz mono in memory (channels averaged), with no re-encoding and the picture never decoded. Read: WAV, MP3, FLAC, Ogg Vorbis, and MP4 / M4A / MOV / M4V with AAC. Anything else (MKV, WebM, Opus) is refused with "unsupported".                                                                                                   | live                                | `src-tauri/src/commands/files.rs` (`stereo_44k_audio_becomes_16k_mono_of_the_same_length`, `a_file_that_is_not_audio_is_refused`) |
| SE-FILE-002 | A file becomes a History entry titled with the file's name, its audio kept as the 16 kHz WAV a dictation keeps (`file-….wav`, same limit and retention), recognised with the dictation pipeline including SE-REC-008, with progress per piece and Cancel. One file job runs at a time. No AI step runs on its own.                                                                                  | live                                | `src-tauri/src/commands/files.rs` (`transcribe_media`), `src-tauri/src/managers/history.rs` (`save_titled_entry`)                 |
| SE-FILE-003 | Rewrite (a prompt from AI & Translate) and Translate (the Speak page's languages) work on the original text a piece at a time, at most 1,200 characters, split at sentence ends, so a long transcript fits Apple Intelligence; the pieces are joined in order and saved as the entry's AI version. They work on any History entry (the card's Rewrite or translate button) and need AI switched on. | live                                | `src-tauri/src/commands/files.rs` (`long_text_splits_at_sentences_and_keeps_every_word`)                                          |
| SE-FILE-004 | A link to a media file is downloaded as it is. Any other link (YouTube and the like) goes through yt-dlp when it is installed, asking for the audio stream only (M4A); without yt-dlp the page says how to install it. Downloads go to a scratch folder that is deleted afterwards.                                                                                                                 | live                                | `src-tauri/src/commands/files.rs` (`media_links_are_told_apart_from_pages`, `fetch_link`)                                         |

## States and transitions

| State       | Trigger                               | Next state    | Edge case                                                  |
| ----------- | ------------------------------------- | ------------- | ---------------------------------------------------------- |
| idle        | drop a file, Choose a file, or a link | download/read | an unsupported extension is refused before any work        |
| download    | link fetched                          | read          | a web page without yt-dlp → "needs yt-dlp"                 |
| read        | audio decoded                         | transcribe    | no sound → "no audio"                                      |
| transcribe  | every piece done                      | result        | no words → "no speech", nothing saved                      |
| any working | Cancel                                | idle          | the worker stops; the model stays loaded                   |
| result      | Rewrite / Translate                   | enhance       | AI off → message with a link to AI & Translate             |
| enhance     | every piece done                      | result        | an AI piece fails → "ai failed", the original is untouched |

## Fixed vs flexible

- Fixed (logic the UI must not change): only the sound is processed; nothing is re-encoded; the original text is
  kept beside any AI version; no AI step runs without being asked; one job at a time.
- Flexible (UI may explore): where the Files page sits, the drop area, progress wording, how many recent files show.

## Open questions

- Bundling yt-dlp (so YouTube links work without installing it) is not done: it is a new third-party binary with its
  own update cadence, and downloading from a site is subject to that site's terms. Owner to decide.
- MKV and WebM (Opus) need a demuxer the bundled decoder does not have.

## Change log

- 2026-10-14: created; REQ-IDs added as one-line comments next to the evidence in the same commit.
