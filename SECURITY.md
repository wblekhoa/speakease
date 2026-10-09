# Security policy

## Supported version

Security fixes target the latest source revision on `main` and the latest
published SpeakEase release.

## Reporting a vulnerability

Report vulnerabilities privately through this repository's
[security advisory form](https://github.com/wblekhoa/speakease/security/advisories/new),
not in a public issue.

Do not include recordings, dictated text, clipboard contents, API keys or
other personal data. Useful evidence is the SpeakEase version, the macOS
version, steps to reproduce with made-up speech or text, and which part is
involved (recording, transcription, AI cleanup, pasting, history, the tray
menu, or model downloads).

If the problem is in code SpeakEase shares with
[Handy](https://github.com/cjpais/Handy), it may need fixing upstream as well;
say so in the report and it will be passed on with your permission.

## Boundaries

- API keys you add are stored in the app's settings file on your Mac and sent
  only to the service they belong to.
- Speech models are downloaded from their publishers on request and verified
  by the engine before use; they are not part of this repository.
- SpeakEase does not update itself. New versions are installed by hand from
  the Releases page.
