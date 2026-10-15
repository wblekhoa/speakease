# SpeakEase licensing notice

Required Notice: Copyright © 2026 Lê Khoa. SpeakEase changes and additions. Noncommercial use only under PolyForm Noncommercial 1.0.0.

Required Notice: Copyright © 2025 CJ Pais. Handy, licensed under the MIT License (see `LICENSE-MIT-HANDY`).

SpeakEase is built on [Handy](https://github.com/cjpais/Handy), an open-source
speech-to-text app by CJ Pais. The repository therefore holds work under two
licences, and which one applies depends on who wrote the part:

| Part | Licence | Where |
| --- | --- | --- |
| Handy, as published upstream: every commit up to and including `f6b3f82`, and any later Handy commit merged in from upstream | MIT | `LICENSE-MIT-HANDY` |
| SpeakEase's own changes and additions: the commits made on top of Handy in this repository | PolyForm Noncommercial 1.0.0 | `LICENSE` |

So you may use SpeakEase as a whole only for noncommercial purposes, while the
Handy code inside it stays available to you under MIT exactly as upstream
publishes it. Commercial use of SpeakEase, of modified versions, or of products
based on its own changes requires a separate written licence from the copyright
holder.

Speech recognition models, the AI services you choose to connect, fonts and
other third-party components keep their own licences. Models are downloaded at
your request from their publishers and are not part of this repository.

Native code compiled into the app keeps its own licence too. One library asks
for its notice to travel with the app:

| Library | Licence | Notice |
| --- | --- | --- |
| libopus (Opus audio decoding, built from source by `opusic-sys`) | BSD-3-Clause | `licenses/libopus-COPYING.txt`, also inside the app at `Contents/Resources/legal/` |

The root `LICENSE` controls if this summary differs from the licence text.
