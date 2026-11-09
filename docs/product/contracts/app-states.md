---
id: speakease-contract-app-states
type: contract
product: speakease
title: "SpeakEase — App states registry (contract)"
status: active
updated: 2026-11-10
summary: "The JSON registry that owns SpeakEase's documented screens, flow arrows and states; UX tables cite these IDs and the index checks both ways."
tags: [area/testing, area/voice, stack/react, stack/tauri, surface/macos]
artifact: docs/product/contracts/app-states.json
stateRegistry: true
relations:
  partOf: [speakease-goal]
  implements: [docs/product/contracts/app-states.json]
---

# SpeakEase — App states registry (contract)

`docs/product/contracts/app-states.json` is the one list of SpeakEase's documented screens and states. Docs cite these IDs and the index checks both ways.

| Field                            | Meaning                                   |
| -------------------------------- | ----------------------------------------- |
| `flow[].screen`, `label`, `next` | left-to-right order, display name, arrows |
| `states[].id`                    | `<screen>/<state>`; never reused          |
| `states[].label`                 | display name, Vietnamese and English      |

A UX table cites a state in its "State ID" column. The ID format is set by the docs tooling's state registry contract.

A screen row with no states of its own keeps one default ID; a row that only lists controls has none. The preview mock does not read these IDs yet, so they carry no steps or checkpoints.

## Consumers

| Consumer               | Uses                           | Breaks if          |
| ---------------------- | ------------------------------ | ------------------ |
| The doc index          | `flow`, `states[].id`, `label` | `id` changes form  |
| The internal flow page | `flow`, `states`               | a field is renamed |

## Change log

- 2026-11-10: created. The list comes from the existing UX tables and has not been confirmed yet.
- 2026-11-10: reviewer fixes: control rows lose their IDs, arrows added, registry moved out of `src`.
