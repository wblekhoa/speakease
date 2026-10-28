---
id: speakease-spec-2026-10-28-competitors
type: spec
product: speakease
title: "SpeakEase — Competitor comparison: OpenWhispr, Wispr Flow, macOS Dictation"
status: draft
updated: 2026-10-28
summary: "How SpeakEase compares with OpenWhispr, Wispr Flow and macOS Dictation on Vietnamese models, on-device versus cloud, privacy, insert UX, extra features, price, licence and platforms, ending in five proposals for the owner."
tags: [area/voice, area/ai, surface/macos]
relations:
  derivedFrom: [speakease-goal, speakease-releases]
  changes: []
---

# SpeakEase — Competitor comparison (research, draft)

Research, not a decision. Nothing here changes a rule; every idea at the end is a proposal for the owner.

## Why

- SpeakEase promises on-device, Vietnamese-first dictation on Apple Silicon Macs (`goal.md`). OpenWhispr, an MIT
  open-source app, now ships the same core loop (hotkey, speak, paste) with local models; Wispr Flow is the commercial
  product both are measured against; macOS Dictation is the free default every Vietnamese Mac user already has.
- No SpeakEase doc compared them before this one. It serves the owner when choosing what SpeakEase builds next and how
  to describe it.

## Sources

| Product         | What was read                                                                                                                                                                                                                                                                                         | Freshness            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| SpeakEase 0.1.1 | This repo at `976bb5b`: `src-tauri/src/catalog/catalog.json` (catalog v2, generated 2026-08-17), `src/lib/utils/vietnameseModels.ts`, `src-tauri/src/settings.rs`, `README.en.md`, `PRIVACY.md`, `logic/*.md`, `releases.md`                                                                          | read 2026-10-28      |
| OpenWhispr      | `github.com/OpenWhispr/openwhispr`, `main` at `ec58528` (2026-10-27; its CHANGELOG `[Unreleased]` is empty, so this is the shipped v1.10.4 of 2026-10-22): `README.md`, `CHANGELOG.md`, `src/models/modelRegistryData.json`, `src/config/languageRegistry.json`, `src/locales/`. Not installed or run | read 2026-10-28      |
| OpenWhispr      | `openwhispr.com/pricing`                                                                                                                                                                                                                                                                              | [fetched 2026-10-28] |
| Wispr Flow      | `wisprflow.ai` (home, `/pricing`, `/data-controls`) and the help article "Use Flow with multiple languages" on `docs.wisprflow.ai`. Closed source and not installed, so every claim is the vendor's own                                                                                               | [fetched 2026-10-28] |
| macOS Dictation | `apple.com/macos/feature-availability`                                                                                                                                                                                                                                                                | [fetched 2026-10-28] |

## At a glance

| Axis                       | SpeakEase                                 | OpenWhispr                                      | Wispr Flow                                   | macOS Dictation                      |
| -------------------------- | ----------------------------------------- | ----------------------------------------------- | -------------------------------------------- | ------------------------------------ |
| Vietnamese speech          | 15 of 69 models; 7 ranked on Vietnamese   | Whisper, Cohere Transcribe, Nemotron 3.5        | Named among auto-detected languages          | Listed, on-device                    |
| Published Vietnamese score | Yes: best 6.3 % WER (own test)            | None                                            | None                                         | None                                 |
| Where speech is recognised | On the Mac only                           | Local, own cloud key, or OpenWhispr Cloud       | Cloud only                                   | On the Mac                           |
| AI cleanup                 | Apple Intelligence on the Mac, or own key | Local LLM in the app, own key, or Cloud         | Cloud: fillers, punctuation, styles          | None; no Vietnamese auto-punctuation |
| Account needed             | No                                        | Only for Cloud, sync, team spaces               | Yes (plans are per user)                     | No                                   |
| Extras                     | Files & links, History, translate key     | Agent, meetings, speaker labels, notes, API/MCP | Notetaker, snippets, dictionary, team plans  | —                                    |
| Price                      | Free                                      | App free; Cloud Pro $80/user/year               | Free 2,000 words/week; Pro $12–15/user/month | Free with macOS                      |
| Licence                    | PolyForm Noncommercial (Handy parts MIT)  | MIT                                             | Proprietary                                  | Proprietary                          |
| Platforms                  | Apple Silicon Mac                         | macOS, Windows, Linux; iPhone/iPad in Pro       | Mac, Windows, iPhone, Android                | Mac                                  |
| Interface in Vietnamese    | Yes (Vietnamese and English only)         | No (11 locales, none Vietnamese)                | Not verified                                 | Yes (macOS language)                 |

## Details by axis

### Vietnamese accuracy and the models offered

- **SpeakEase**: 15 of the 69 catalog models list Vietnamese. Seven were measured on Vietnamese with the app's own
  engine (60 Google FLEURS `vi_vn` sentences, word error rate): Cohere Transcribe 6.3 %, Qwen3-ASR 1.7B 6.8 %, Fun-ASR
  MLT Nano 7.4 %, Moonshine Base vi 7.8 %, Whisper Large v3 Turbo 8.2 %, Qwen3-ASR 0.6B 8.5 %, Nemotron 3.5 Streaming
  11.7 % (`vietnameseModels.ts`). For Vietnamese only measured models are suggested, best first (SE-REC-006). With
  Listen for = Auto and a model that cannot detect the language, Vietnamese and English are tried in turn (SE-REC-003).
- **OpenWhispr**: Vietnamese is a selectable dictation language (`languageRegistry.json`, with a cleanup instruction to
  keep Vietnamese diacritics). Local models whose `supportedLanguages` include `vi`: Cohere Transcribe 2B, Nemotron 3.5
  ASR Streaming 0.6B, and the six whisper.cpp sizes (tiny to large-v3, turbo). Parakeet TDT 0.6B v3 and Orukeet (its
  Parakeet fine-tune) list 25 European languages and no Vietnamese, so the Parakeet path does not help Vietnamese users.
  Cloud speech-to-text with the user's key: OpenAI, Groq, xAI, Mistral, Gemini, Deepgram, AssemblyAI, Tinfoil, Corti.
  The registry marks Cohere Transcribe "No auto language detection".
- **Wispr Flow**: "100+ languages"; the multiple-languages article names Vietnamese among languages Flow identifies from
  speech, one language per dictation. Models are not disclosed.
- **macOS Dictation**: "Vietnamese (Vietnam)" is listed under Dictation and under On-Device and Modeless Dictation, and is
  absent from the Auto-Punctuation list.
- **Scores are not comparable across apps.** OpenWhispr's model descriptions quote multi-language averages (Cohere
  Transcribe "5.42% avg WER, 14 languages"); SpeakEase's 6.3 % is Vietnamese only, on its own engine and test set. No
  competitor publishes a Vietnamese number.

### On-device or cloud, and privacy

- **SpeakEase**: audio is recognised on the Mac and never leaves it; only text goes to an AI service, and only to one the
  user added a key for; no account, server, telemetry or crash reports (`PRIVACY.md`, `goal.md` non-goals).
- **OpenWhispr**: the user chooses local (whisper.cpp, sherpa-onnx, llama.cpp) or cloud. The README says "No data
  collection, no telemetry"; OpenWhispr Cloud, cross-device sync and team spaces need sign-in. The Free plan lists zero
  data retention.
- **Wispr Flow**: "Transcription always occurs on the cloud" (`/data-controls`); no offline desktop mode was found.
  Settings decide whether Wispr stores dictation data on its servers and whether it is used to improve models; the
  pricing page claims SOC 2 Type II, ISO 27001 and HIPAA with a signed BAA.
- **macOS Dictation**: on-device for Vietnamese, per Apple's list.

### Hotkey and inserting text

- **SpeakEase**: hold or tap ⌥ Space (SE-REC-001, SE-REC-002); ⌃ ⌥ Space pastes a translation; ⌥ ⇧ Space rewrites with
  the AI prompt; Esc cancels. Text is pasted where the cursor is, in any app. Buttons on the recording pill switch the
  cleanup prompt or translation for the dictation in progress (SE-AI-011). Audio over 30 s is split at pauses so nothing
  is dropped (SE-REC-008).
- **OpenWhispr**: global hotkey with auto-paste; a separate translation hotkey; a voice-assistant hotkey that edits
  highlighted text in place or answers in a floating panel. Since 1.10.4, Tone & Style (off by default) picks the
  cleanup tone from the kind of app in front.
- **Wispr Flow**: dictation into any app that takes typing; removes fillers, adds punctuation and formats; a different
  style per kind of app (Formal, Casual, Very casual); a dictionary that learns names; spoken snippets that expand.

### Extra features

- **SpeakEase**: Files & links (audio, video and links to text, then rewrite or translate; SE-FILE-001…006); a
  searchable History with the original under the AI version and minutes saved (SE-HIST-001…003); custom words; menu-bar
  quick switches. A live-subtitles beta is planned (`decisions.md`, 2026-10-16) and not released.
- **OpenWhispr**: an AI agent (cloud or local models, optional screenshot as context); meeting transcription that detects
  Zoom, Teams and FaceTime calls; local speaker labels and voice fingerprints (pyannote segmentation 3.0 and an
  English-trained CAM++ speaker model, through sherpa-onnx); notes with folders, semantic search and cloud sync; team
  spaces and web sharing (sign-in); audio and video import including YouTube links; a public API and an MCP server;
  enterprise SSO and SCIM.
- **Wispr Flow**: Notetaker for meetings (Mac and Windows); meeting notes reachable from Claude and ChatGPT; team
  workspace with a shared dictionary and snippets.
- **macOS Dictation**: dictation only.

### Price, licence and platforms

- **SpeakEase**: free; PolyForm Noncommercial 1.0.0 for SpeakEase's own code, MIT for the Handy code inside
  (`NOTICE.md`), so use at work is not allowed; Apple Silicon Macs only.
- **OpenWhispr** [fetched 2026-10-28]: the app is free and unlimited with local models or the user's own keys. OpenWhispr
  Cloud: Free (2,000 cloud words a week, 5 meeting hours a month), Pro $80 per user per year (20 meeting hours, agent
  mode, sync, API, MCP, iPhone and iPad app), Business $160 per user per year, Enterprise custom. MIT, "free for personal
  and commercial use". macOS (Intel loses live speaker labels), Windows, Linux.
- **Wispr Flow** [fetched 2026-10-28]: Free (2,000 words a week on desktop, limited on mobile); Pro $15 per user per
  month, or $12 billed yearly; Growth $23, or $18 yearly (the page also shows $33 and $26, probably earlier prices);
  Enterprise custom. Proprietary. Mac, Windows, iPhone, Android.
- **macOS Dictation**: free with macOS.

## What the comparison shows (inference)

- On raw on-device accuracy SpeakEase and OpenWhispr are level: both can run Cohere Transcribe on the Mac. SpeakEase's
  lead is what surrounds the model: a Vietnamese ranking and suggestions, the Vietnamese-then-English retry for models
  without language detection such as Cohere, Vietnamese cleanup prompts and a Vietnamese interface.
- Against Wispr Flow, SpeakEase wins on privacy (no cloud speech) and price (free against $12–15 a month), and loses on
  reach (Windows, phones) and on polish (snippets, style per app, meeting notes).
- Against macOS Dictation, the free default, SpeakEase's case is cleanup: Apple lists no auto-punctuation for
  Vietnamese, while SpeakEase adds punctuation, capitalised names and digits, removes fillers and can translate.
- OpenWhispr's MIT licence and Wispr Flow's team plans both allow use at work; SpeakEase's licence does not.
- Not gaps, by choice (`goal.md` non-goals): accounts, cloud sync, team spaces, usage tracking, and Windows, Linux or
  phones.

## Gaps and ideas — proposals for the owner, not decisions

1. **Proposal: cleanup style by app.** Choose the cleanup prompt from the app in front (chat apps casual, Mail as an
   email), decided on the Mac and off by default. Wispr Flow and OpenWhispr (1.10.4) both ship this; SpeakEase switches
   prompts only by shortcut or the pill buttons (SE-AI-011). To decide: build or not, and the default app groups.
2. **Proposal: on-device cleanup for Macs without Apple Intelligence.** Such a Mac now needs an API key or a server the
   user runs behind the Custom provider (default `http://localhost:11434/v1`). OpenWhispr downloads local LLMs inside
   the app. Option: one small multilingual model, downloaded and managed like speech models. Costs: size, a new runtime
   dependency (owner approval), and Vietnamese cleanup quality, which must be measured first.
3. **Proposal: speaker labels for long Vietnamese files.** OpenWhispr labels speakers locally; SpeakEase's Files & links
   returns one undivided text. Local labels would serve interviews and meetings and the planned live subtitles. First
   check whether an English-trained speaker model separates Vietnamese voices on a small test set.
4. **Proposal: measure macOS Dictation on the same Vietnamese test.** Run Apple's on-device Vietnamese recogniser on the
   60 FLEURS sentences and add the result to the README table, so the comparison with the free default is a number, not
   a claim.
5. **Proposal (owner's call only): use at work.** The PolyForm Noncommercial licence keeps SpeakEase out of offices
   where OpenWhispr (MIT) and Wispr Flow (business plans) are allowed. Options: keep it; offer a separate commercial
   licence; relicense SpeakEase's own code. Any change needs a new entry in `decisions.md` (see 2026-10-09).

## Change

- None. This doc adds or changes no REQ-ID; `relations.changes` stays empty until the owner picks a proposal, which then
  gets its own spec.

## Acceptance (how to re-check the facts)

- Catalog counts, from the repo root:
  `node -e "const c=require('./src-tauri/src/catalog/catalog.json');console.log(c.models.length,c.models.filter(m=>m.languages.includes('vi')).length)"`
  prints `69 15`.
- OpenWhispr release and licence: `gh api repos/OpenWhispr/openwhispr/releases/latest --jq .tag_name` prints `v1.10.4`;
  `gh api repos/OpenWhispr/openwhispr --jq .license.spdx_id` prints `MIT`.
- OpenWhispr local models that read Vietnamese, in a clone at `ec58528`:
  `jq -r '.parakeetModels | to_entries[] | select(.value.supportedLanguages | index("vi")) | .key' src/models/modelRegistryData.json`
  prints `nemotron-3.5-asr-streaming-0.6b` and `cohere-transcribe-03-2026`; whisper.cpp models are multilingual.
- Web facts (prices, cloud-only transcription, language lists): re-fetch the pages under Sources; they change without
  notice.

## Change log

- 2026-10-28: created (draft) from the sources above.
