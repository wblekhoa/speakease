export const repository = 'https://github.com/wblekhoa/speakease';
// Where a visitor lands when the API does not answer (60 calls an hour per
// address, 403 after): the newest release's page, which lists the .dmg.
// Releases upload only versioned names (SpeakEase-0.1.1-arm64.dmg), so there
// is no fixed /releases/latest/download/<name> link to guess.
export const fallback = `${repository}/releases/latest`;
export function resolveRelease(release) {
  if (!release || release.draft || release.prerelease || typeof release.tag_name !== 'string') return null;
  const version = release.tag_name.replace(/^v/, '').trim();
  if (!version) return null;
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const dmg = assets.find(asset => {
    if (typeof asset?.name !== 'string' || !asset.name.endsWith('-arm64.dmg')) return false;
    try {
      const url = new URL(asset.browser_download_url);
      return url.protocol === 'https:' && url.hostname === 'github.com' && !url.port &&
        url.pathname.startsWith('/wblekhoa/speakease/releases/download/') &&
        !url.username && !url.password && Number.isFinite(asset.size) && asset.size > 0;
    } catch { return false; }
  });
  return dmg ? { version, dmg } : null;
}
export async function fetchRelease(signal, request = fetch) {
  try {
    const response = await request('https://api.github.com/repos/wblekhoa/speakease/releases/latest', {
      signal, headers: { Accept: 'application/vnd.github+json' },
    });
    return response.ok ? resolveRelease(await response.json()) : null;
  } catch { return null; }
}
export const mb = bytes => Math.round(bytes / 1e6);
