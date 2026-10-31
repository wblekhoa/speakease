import React, { useEffect, useRef, useState } from 'react';
import { content } from './content.js';
import { fallback, fetchRelease, mb, repository } from './release.js';
import { glyphs } from './icons.js';
import { createStory, keyboardIndex, lastStep, stepIds } from './story.js';

const Lines = ({ value }) => <>{value[0]}<br />{value[1]}</>;
const doc = name => `${repository}/blob/main/${name}`;

/* The GitHub mark: WAVE icon 36806:44460 (icon-filled, Logo · Github), path verbatim. */
const GITHUB = 'M12 1.5498C17.7711 1.5498 22.45 6.2885 22.4502 12.1338C22.4502 17.037 19.1576 21.1619 14.6904 22.3643C14.3828 22.4471 14.229 22.4881 14.1152 22.3994C14.0016 22.3107 14.001 22.1435 14.001 21.8086V17.6035C14.001 17.2501 13.8961 16.9426 13.7266 16.665C13.6104 16.4747 13.6904 16.2052 13.9004 16.1455C15.6403 15.6513 16.8603 14.8562 16.8604 12.2207C16.8604 11.5355 16.6427 10.8908 16.2607 10.3301C16.0708 10.0513 16.0758 10.0768 16.1553 9.74707C16.2949 9.16718 16.3064 8.5562 16.1504 7.98633C16.0991 7.79895 15.9882 7.68886 15.7891 7.70996C15.5307 7.7374 15.0838 7.86032 14.4209 8.28809C14.1605 8.45617 14.0297 8.54066 13.915 8.55957C13.8003 8.57838 13.6466 8.53874 13.3398 8.45996C12.9201 8.35217 12.4874 8.29395 12 8.29395C11.5126 8.29395 11.0798 8.35217 10.6602 8.45996C10.3534 8.53874 10.1997 8.57838 10.085 8.55957C9.97026 8.54065 9.83951 8.45615 9.5791 8.28809C8.9162 7.86032 8.46925 7.73739 8.21094 7.70996C8.01179 7.68886 7.90094 7.79895 7.84961 7.98633C7.6936 8.5562 7.70505 9.16719 7.84473 9.74707C7.92417 10.0768 7.92919 10.0513 7.73926 10.3301C7.35726 10.8908 7.13965 11.5355 7.13965 12.2207C7.13971 14.8562 8.35967 15.6513 10.0996 16.1455C10.3097 16.2052 10.3896 16.4747 10.2734 16.665C10.1039 16.9426 9.99902 17.2501 9.99902 17.6035C9.99907 17.7995 10.0576 18.1141 9.88867 18.25C9.69335 18.4071 9.2866 18.2292 9.07324 18.1553C8.38759 17.9175 7.79198 17.4407 7.32812 16.6719C7.11819 16.3239 6.66975 16.2141 6.32617 16.4268C5.98288 16.6394 5.87427 17.0935 6.08398 17.4414C6.70824 18.4762 7.56444 19.1932 8.60156 19.5527C8.87376 19.6471 9.15471 19.7162 9.44238 19.7598C9.99556 19.8435 9.99902 19.8583 9.99902 20.3789V21.8086C9.99902 22.1435 9.99842 22.3107 9.88477 22.3994C9.77096 22.4881 9.61719 22.4471 9.30957 22.3643C4.84238 21.1619 1.5498 17.037 1.5498 12.1338C1.55004 6.28851 6.22893 1.54981 12 1.5498Z';
const GithubMark = () => <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={GITHUB} /></svg>;
/* Glyphs: the app's own icon set, copied verbatim (provenance in icons.js). */
const Glyph = ({ name, className = 'glyph' }) =>
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    {glyphs[name].map(([d, extra], i) => <path key={i} d={d} {...extra} />)}</svg>;

function useEnhanced() {
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => { setEnhanced(true); }, []);
  return enhanced;
}
/* GSAP is loaded once, on demand, for the scroll-linked demo only. */
let motionEngine;
const loadMotion = () => (motionEngine ??= Promise.all([import('gsap'), import('gsap/ScrollTrigger')])
  .then(([{ gsap }, { ScrollTrigger }]) => { gsap.registerPlugin(ScrollTrigger); return { gsap, ScrollTrigger }; }));

function DownloadButton({ c, release, describedBy }) {
  return <a className="button" href={release?.dmg.browser_download_url || fallback} data-download={c.cta} aria-describedby={describedBy}>
    <Glyph name="apple" className="button-glyph" /><span>{c.cta}</span>
  </a>;
}
/* Light or dark by hand, like the ReadEase site: the page follows the system
   until the button is pressed; the choice is kept and stamped on <html> by the
   head script before the first paint. Which glyph shows is CSS's call. */
const THEME_KEY = 'speakease-site-theme';
function ThemeToggle({ label }) {
  const flip = () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* private window */ }
  };
  return <button type="button" className="theme-toggle" onClick={flip} aria-label={label} title={label}>
    <span className="theme-to-dark"><Glyph name="moon" /></span><span className="theme-to-light"><Glyph name="sun" /></span>
  </button>;
}
function Header({ c, prefix }) {
  return <header className="nav-shell"><div className="nav container">
    <a className="brand" href="./" aria-label={c.home}><img src={`${prefix}icon.svg`} alt="" width="28" height="28" /><span>SpeakEase</span></a>
    <nav className="nav-links" aria-label={c.nav}>
      {c.links.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
    </nav>
    <div className="nav-end">
      <a className="nav-github" href={repository} aria-label={c.github} title={c.github}><GithubMark /><span>GitHub</span></a>
      <ThemeToggle label={c.theme} />
      <a className="language" href={c.other === 'en' ? 'en/' : '../'} lang={c.other} hrefLang={c.other} aria-label={c.switchLabel}>{c.other.toUpperCase()}</a>
      <a className="nav-download" href={`#${c.downloadId}`}>{c.download}</a>
    </div>
  </div></header>;
}
/* The icon's three beats, drawn large above the headline: they rise and settle
   once on load, the way the app's pill moves under a voice, then rest. */
function Beats() {
  return <span className="beats" aria-hidden="true"><i /><i /><i /></span>;
}
function Hero({ c, release }) {
  return <section className="hero" aria-labelledby="hero-title">
    <Beats />
    <h1 id="hero-title">{c.hero[0]}<br /><span className="accent">{c.hero[1]}</span></h1>
    <p className="description">{c.description}</p>
    <div className="actions"><DownloadButton c={c} release={release} describedBy="compatibility" /></div>
    <p className="compatibility" id="compatibility">{c.meta.map((item, i) => <React.Fragment key={item}>{i > 0 && <span className="meta-dot" aria-hidden="true">·</span>}<span>{item}</span></React.Fragment>)}</p>
  </section>;
}
/* A MacBook drawn in CSS: bezel, camera notch, screen, hinge and base. */
function Laptop({ children }) {
  return <div className="laptop">
    <div className="laptop-lid"><span className="laptop-notch" aria-hidden="true" /><div className="laptop-screen">{children}</div></div>
    <div className="laptop-base" aria-hidden="true"><span /></div>
  </div>;
}
/* The app's compact recording overlay (src/overlay, 0.1.1): dot | nine level bars | cancel while you speak,
   spinner | "Transcribing…" | cancel after. Same zones, proportions and tokens, scaled to the drawn screen. */
function Pill({ c }) {
  const cancel = <span className="pill-x" />;
  return <div className="pill" aria-hidden="true">
    <span className="pill-rec"><span className="pill-dot" /><span className="pill-wave">{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</span>{cancel}</span>
    <span className="pill-work"><span className="pill-spinner" /><span className="pill-label">{c.working}</span>{cancel}</span>
  </div>;
}
/* A Notes window in the macOS layout: the note list beside the open note, which the dictation fills. */
function NotesWindow({ c, words }) {
  return <div className="note">
    <div className="note-list" aria-hidden="true">
      <p className="note-chrome"><span className="lights"><i /><i /><i /></span></p>
      <p className="list-head">{c.noteToday}</p>
      <p className="list-item is-open"><b>{c.noteTitle}</b><span><time>09:41</time> <span className="preview-empty">{c.noteEmpty}</span><span className="preview-text">{c.spoken}</span></span></p>
      {c.otherNotes.map(([title, when, preview]) => <p className="list-item" key={title}><b>{title}</b><span><time>{when}</time> {preview}</span></p>)}
    </div>
    <div className="note-page">
      <p className="note-chrome note-tools" aria-hidden="true"><span className="tool-aa">Aa</span><Glyph name="check" className="tool" /></p>
      <p className="note-stamp" aria-hidden="true">{c.noteStamp}</p>
      <div className="note-body">
        <p className="note-title">{c.noteTitle}</p>
        <p className="note-text">{words.map((word, i) => <span key={i} className="typed" style={{ '--i': i }}>{i > 0 ? ` ${word}` : word}</span>)}<span className="caret" aria-hidden="true" /></p>
      </div>
    </div>
  </div>;
}
/* The demo: a note in another app, the pill and the keys. Scroll walks it
   through hold → speak → let go where the window is large enough and motion is
   welcome; elsewhere the step tabs do. Without JavaScript, or before the page
   wakes, it shows the result: the sentence already in the note. */
function Demo({ c }) {
  const section = useRef(null);
  const story = useRef(null);
  const enhanced = useEnhanced();
  const [selected, setSelected] = useState(lastStep);
  useEffect(() => {
    if (!enhanced) return;
    let disposed = false;
    loadMotion().then(({ ScrollTrigger }) => {
      if (!disposed) story.current = createStory(section.current, { ScrollTrigger, onSelect: setSelected, onPinned: pinned => { if (!pinned) setSelected(lastStep); } });
    }).catch(() => { /* The step tabs remain if motion fails to load. */ });
    return () => { disposed = true; story.current?.destroy(); story.current = null; };
  }, [enhanced]);
  function navigate(index, focus = false) {
    if (story.current) story.current.navigate(index);
    else setSelected(index);
    if (focus) section.current.querySelector(`#step-${stepIds[index]}`).focus();
  }
  const words = c.spoken.split(' ');
  return <section className="demo" id="demo" aria-label={c.demo} ref={section}>
    <div className="demo-stage" data-stage="" data-step={stepIds[selected]}>
      <Laptop>
        <div className="desk" role={enhanced ? 'tabpanel' : undefined} id="demo-panel" aria-labelledby={enhanced ? `step-${stepIds[selected]}` : undefined}>
          <NotesWindow c={c} words={words} />
          <Pill c={c} />
        </div>
      </Laptop>
      <p className="keys" aria-hidden="true"><kbd className="key-option">⌥</kbd><kbd className="key-space">Space</kbd></p>
      <ol className="demo-steps" role={enhanced ? 'tablist' : undefined} aria-label={c.demoSteps}>
        {c.steps.map(([title, detail], i) => <li key={title} role={enhanced ? 'presentation' : undefined}>
          {enhanced
            ? <button id={`step-${stepIds[i]}`} type="button" role="tab" aria-controls="demo-panel" aria-selected={selected === i} tabIndex={selected === i ? 0 : -1} title={detail}
              onClick={() => navigate(i)} onKeyDown={event => { const next = keyboardIndex(event.key, i); if (next !== undefined) { event.preventDefault(); navigate(next, true); } }}>
              <span className="step-number" aria-hidden="true">{i + 1}</span><span>{title}</span></button>
            : <span className="step-static"><span className="step-number" aria-hidden="true">{i + 1}</span><span>{title}</span></span>}
        </li>)}
      </ol>
    </div>
  </section>;
}
function Card({ title, children }) {
  // Every card: a fixed-height illustration, then one title (owner: no eyebrow, no description).
  return <article className="way-card"><div className="way-visual">{children}</div><h3>{title}</h3></article>;
}
/* Wide windows show several cards, so the track ends before the last card reaches the left edge: the end is the last card. */
export const cardIndex = (left, max, stride, count) =>
  left >= max - 2 ? count - 1 : Math.max(0, Math.min(count - 1, Math.round(left / stride)));
/* Where a mouse drag lands: past 15% of a card in either direction moves to the next card that way, else back. */
export const dragTarget = (startLeft, left, max, stride) => {
  const moved = left - startLeft;
  const index = Math.abs(moved) < stride * .15 ? Math.round(startLeft / stride) : moved > 0 ? Math.ceil(left / stride) : Math.floor(left / stride);
  return Math.max(0, Math.min(max, index * stride));
};
/* Mouse drag scrolls the track (touch already swipes natively); a round "Kéo / Drag" cursor follows a fine pointer. */
function useDrag(track, cursor, enhanced) {
  useEffect(() => {
    const el = track.current; const bubble = cursor.current;
    if (!el || !bubble) return undefined;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let drag = null; let frame = 0; let settle = 0; let point = { x: 0, y: 0 };
    const place = () => { frame = 0; bubble.style.translate = `${point.x}px ${point.y}px`; };
    const follow = event => { point = { x: event.clientX, y: event.clientY }; if (!frame) frame = requestAnimationFrame(place); };
    const enter = event => { if (!fine.matches || event.pointerType !== 'mouse') return; follow(event); el.classList.add('has-cursor'); bubble.classList.add('is-on'); };
    const leave = () => { if (!drag) { el.classList.remove('has-cursor'); bubble.classList.remove('is-on'); } };
    const down = event => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      clearTimeout(settle);
      drag = { x: event.clientX, left: el.scrollLeft, moved: false, id: event.pointerId };
      el.setPointerCapture(event.pointerId); el.classList.add('is-dragging'); bubble.classList.add('is-pressed');
    };
    const move = event => {
      if (bubble.classList.contains('is-on')) follow(event);
      if (!drag) return;
      const dx = event.clientX - drag.x;
      if (Math.abs(dx) > 4) drag.moved = true;
      el.scrollLeft = drag.left - dx;
    };
    const up = event => {
      if (!drag) return;
      const { left, moved, id } = drag; drag = null;
      if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
      bubble.classList.remove('is-pressed');
      // Snap stays off until the glide ends, or the browser snaps to the nearest card before it starts.
      const stride = el.querySelector('.way-card').offsetWidth + 24;
      const target = dragTarget(left, el.scrollLeft, el.scrollWidth - el.clientWidth, stride);
      clearTimeout(settle);
      settle = setTimeout(() => el.classList.remove('is-dragging'), reduce.matches ? 0 : 700);
      el.scrollTo({ left: target, behavior: reduce.matches ? 'auto' : 'smooth' });
      if (moved) el.addEventListener('click', stop, { capture: true, once: true });
      if (!el.matches(':hover')) leave();
    };
    const stop = event => { event.preventDefault(); event.stopPropagation(); };
    const noNativeDrag = event => event.preventDefault();
    const on = [['pointerenter', enter], ['pointerleave', leave], ['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up], ['dragstart', noNativeDrag]];
    on.forEach(([type, handler]) => el.addEventListener(type, handler));
    return () => {
      on.forEach(([type, handler]) => el.removeEventListener(type, handler));
      el.removeEventListener('click', stop, { capture: true });
      cancelAnimationFrame(frame); clearTimeout(settle); el.classList.remove('has-cursor', 'is-dragging');
    };
  }, [track, cursor, enhanced]);
}
function Features({ c, screenshots }) {
  const track = useRef(null);
  const cursor = useRef(null);
  const enhanced = useEnhanced();
  const [current, setCurrent] = useState(0);
  const count = 4;
  useDrag(track, cursor, enhanced);
  const step = direction => {
    const el = track.current; const card = el.querySelector('.way-card');
    el.scrollBy({ left: direction * (card.offsetWidth + 24), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  const onScroll = () => {
    const el = track.current; const card = el.querySelector('.way-card');
    setCurrent(cardIndex(el.scrollLeft, el.scrollWidth - el.clientWidth, card.offsetWidth + 24, count));
  };
  return <section className="features section" id="features" aria-labelledby="features-title">
    <div className="heading container"><h2 id="features-title"><Lines value={c.features} /></h2></div>
    <div className="way-track" ref={track} onScroll={enhanced ? onScroll : undefined} role="group" aria-label={c.carousel} tabIndex={0}>
      <Card title={c.cleanupTitle}><figure className="sheet cleanup" aria-label={c.cleanupLabel}>
        <p className="sheet-label"><Glyph name="mic" />{c.original}</p><p className="raw">{c.raw}</p>
        <p className="sheet-label accent"><Glyph name="magic" />{c.cleaned}</p><p className="clean">{c.clean}</p>
        <p className="needs"><Glyph name="info" />{c.aiNeeds}</p>
      </figure></Card>
      <Card title={c.translateTitle}><figure className="sheet translate" aria-label={c.translateLabel}>
        <p className="sheet-label"><Glyph name="mic" />{c.said}</p><p className="bubble said" lang="vi">{c.saidText}</p>
        <p className="shortcut" aria-hidden="true"><kbd>⌃</kbd><kbd>⌥</kbd><kbd>Space</kbd></p>
        <p className="sheet-label accent"><Glyph name="translate" />{c.pasted}</p><p className="bubble pasted" lang="en">{c.pastedText}</p>
      </figure></Card>
      <Card title={c.filesTitle}><figure className="sheet files" aria-label={c.filesLabel}>
        <div className="dropzone"><Glyph name="folder" /><span>{c.dropHint}</span></div>
        <p className="file-chip"><span className="file-play" aria-hidden="true" /><b>{c.fileName}</b><span>{c.fileLength}</span><span className="file-done"><Glyph name="check" /></span></p>
        <p className="file-result">{c.fileResult}</p>
      </figure></Card>
      <Card title={c.historyTitle}><figure className="shot">
        <img src={`${screenshots}history.png`} width="1760" height="1240" loading="lazy" alt={c.historyAlt} />
      </figure></Card>
    </div>
    {enhanced && <span className="drag-cursor" ref={cursor} aria-hidden="true"><Glyph name="arrowLeft" /><Glyph name="arrowRight" /></span>}
    <div className="way-controls container" hidden={!enhanced}>
      <div className="way-dots" aria-hidden="true">{Array.from({ length: count }, (_, i) => <span key={i} className={i === current ? 'is-on' : undefined} />)}</div>
      <div className="way-arrows">
        <button type="button" aria-label={c.previous} onClick={() => step(-1)} disabled={current === 0}>←</button>
        <button type="button" aria-label={c.next} onClick={() => step(1)} disabled={current === count - 1}>→</button>
      </div>
    </div>
  </section>;
}
const MARKS = { yes: 'check', no: 'plus', na: null }; // 'no' turns the plus into ×; 'na' is a faint dash
function Compare({ c }) {
  const cell = kind => {
    const label = { yes: c.yes, no: c.no, na: c.na }[kind];
    return <span className={`mark mark-${kind}`}>{MARKS[kind] ? <Glyph name={MARKS[kind]} /> : <span className="mark-line" aria-hidden="true" />}<span className="sr-only">{label}</span></span>;
  };
  return <section className="compare section container" id="compare" aria-labelledby="compare-title">
    <div className="heading"><h2 id="compare-title"><Lines value={c.compare} /></h2></div>
    <div className="table-wrap"><table>
      <thead><tr><td />{c.columns.map((name, i) => <th key={name} scope="col" className={i === 2 ? 'ours' : undefined}>{name}</th>)}</tr></thead>
      <tbody>{c.rows.map(([label, values]) => <tr key={label}><th scope="row">{label}</th>{values.map((value, i) => <td key={i} className={i === 2 ? 'ours' : undefined}>{cell(value)}</td>)}</tr>)}</tbody>
    </table></div>
    <div className="notes">{c.notes.map(note => <p key={note}>{note}</p>)}</div>
  </section>;
}
function Install({ c }) {
  return <section className="install section container" id="install" aria-labelledby="install-title">
    <div className="heading"><h2 id="install-title">{c.install}</h2></div>
    <ol className="tile-grid" aria-label={c.installSteps}>{c.installItems.map(([icon, title], i) => <li key={title}>
      <span className="tile-icon"><Glyph name={icon} /></span><span className="tile-step" aria-hidden="true">{i + 1}</span><h3>{title}</h3></li>)}</ol>
  </section>;
}
function FAQ({ c }) {
  return <section className="faq section container" id="faq" aria-labelledby="faq-title">
    <div className="heading"><h2 id="faq-title">{c.faqTitle}</h2></div>
    <div className="questions">{c.faq.map(([question, answer, link]) => <details key={question}><summary>{question}<Glyph name="plus" className="summary-glyph" /></summary>
      <p>{answer}{link && <> <a href={doc(link[0])}>{link[1]}</a>.</>}</p></details>)}</div>
  </section>;
}
function Closing({ c, prefix, release }) {
  return <section className="closing" id={c.downloadId} aria-labelledby="download-title">
    <div className="download-block">
      <img className="app-icon" src={`${prefix}icon.svg`} width="84" height="84" alt="" loading="lazy" />
      <h2 id="download-title"><Lines value={c.closing} /></h2><p>{c.license}</p><DownloadButton c={c} release={release} />
      <p className="download-detail">{release
        ? <span data-download-detail="">{`${release.version} · ${mb(release.dmg.size)} MB · .dmg`}</span>
        : <a data-download-detail="" href={`${repository}/releases`}>{c.latest}</a>}</p>
    </div>
  </section>;
}
function Footer({ c, prefix, release }) {
  const targets = {
    download: release?.dmg.browser_download_url || fallback, releases: `${repository}/releases`,
    source: repository, issues: `${repository}/issues/new/choose`, handy: 'https://github.com/cjpais/Handy',
    privacy: doc('PRIVACY.md'), license: doc('LICENSE'), notice: doc('NOTICE.md'),
  };
  return <footer className="footer container">
    <div className="footer-about"><span className="footer-name"><img src={`${prefix}icon.svg`} alt="" width="24" height="24" loading="lazy" />SpeakEase</span><p>{c.made}</p></div>
    <nav className="footer-groups" aria-label={c.support}>{c.footerGroups.map(([title, links]) => <div key={title}><p>{title}</p>
      <ul>{links.map(([key, label]) => <li key={key}><a href={key.startsWith('#') ? key : targets[key]}>{label}</a></li>)}</ul></div>)}</nav>
    <p className="footer-rights">© SpeakEase · {c.rights}</p>
  </footer>;
}
export function App({ locale = 'vi' }) {
  const c = content[locale];
  const prefix = locale === 'en' ? '../' : '';
  const screenshots = `${prefix}screenshots/${locale}-`;
  const [release, setRelease] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchRelease(controller.signal).then(value => { if (!controller.signal.aborted) setRelease(value); });
    return () => controller.abort();
  }, []);
  return <><a className="skip-link" href="#main">{c.skip}</a><Header c={c} prefix={prefix} />
    <main id="main"><div className="container"><Hero c={c} release={release} /></div><Demo c={c} />
      <Features c={c} screenshots={screenshots} /><Compare c={c} /><Install c={c} /><FAQ c={c} /><Closing c={c} prefix={prefix} release={release} /></main>
    <Footer c={c} prefix={prefix} release={release} /></>;
}
