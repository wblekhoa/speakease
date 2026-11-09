---
id: speakease-contract-app-states
type: contract
product: speakease
title: "SpeakEase — App states registry (contract)"
status: active
updated: 2026-11-10
summary: "The JSON registry that owns SpeakEase's documented screens, flow arrows and states; UX tables cite these IDs and the index checks both ways."
tags: [area/testing, area/voice, stack/react, stack/tauri, surface/macos]
artifact: src/dev/screenStates.json
stateRegistry: true
relations:
  partOf: [speakease-goal]
  implements: [src/dev/screenStates.json]
---
# SpeakEase — App states registry (contract)

`src/dev/screenStates.json` is the one list of SpeakEase's screens and states. Docs cite these IDs and the index checks both ways.

| Field | Meaning |
|---|---|
| `flow[].screen`, `label`, `next` | left-to-right order, display name, arrows |
| `states[].id` | `<screen>/<state>`; never reused |
| `states[].label` | display name, Vietnamese and English |

A UX table cites a state in its "State ID" column. Format: doc-engine `docs/product/contracts/state-registry.md`.

The Quick choices row lists controls, not states, so it has no ID. The preview mock does not read these IDs yet, so they carry no steps or checkpoints.

## Consumers
| Consumer | Uses | Breaks if |
|---|---|---|
| The doc index | `flow`, `states[].id`, `label` | `id` changes form |
| The JAK Hub flow page | `flow`, `states` | a field is renamed |

## Change log
- 2026-11-10: created. The list comes from the existing UX tables; AI default, the owner has not confirmed it.
