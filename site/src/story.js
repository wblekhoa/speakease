// The dictation in three steps (owner, 31/10): press the shortcut, it listens, it writes.
export const stepIds = ['press', 'listen', 'write'];
export const lastStep = stepIds.length - 1;
// Tabs sit in a row under the laptop; both arrow axes move through them (WAI-ARIA tabs).
export function keyboardIndex(key, index) {
  const next = (index + 1) % 3, previous = (index + 2) % 3;
  return ({ ArrowRight: next, ArrowDown: next, ArrowLeft: previous, ArrowUp: previous, Home: 0, End: 2 })[key];
}
// A tab follows what the laptop shows: the first chord until its keys are up, listening until the second press starts.
const stepStarts = [0, .23, .6];
export const progressIndex = progress => progress < stepStarts[1] ? 0 : progress < stepStarts[2] ? 1 : 2;

// One continuous timeline over the three steps (0 → 1), so the key presses move with
// the scroll (owner, 31/10). Phase: idle (no pill yet) → rec (the pill pops up and
// listens) → work (second press: "Transcribing…") → done (the sentence is in).
// The keys are a real chord, one at a time (owner, 31/10): ⌥ comes up and goes down,
// then Space; Space lets go first, then ⌥, and both leave. `alt`/`space` are how far
// each is pressed (0-1), `altShow`/`spaceShow` whether it is on screen; `typed` is how
// much of the sentence shows.
const ramp = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)));
const DOWN = .44;
function chord(x) {
  const hide = 1 - ramp(x, .72, .88);
  return {
    altShow: Math.min(ramp(x, 0, .1), hide), alt: Math.min(ramp(x, .1, .22), 1 - ramp(x, .6, .68)),
    spaceShow: Math.min(ramp(x, .22, .32), hide), space: Math.min(ramp(x, .32, DOWN), 1 - ramp(x, .55, .63)),
  };
}
// The first press fills the first step; the second starts late in "listen" and is down early in "write".
const second = p => (p - .6) / .22;
export function demoState(progress) {
  const p = Math.max(0, Math.min(1, progress));
  const keys = p < 1 / 3 ? chord(p * 3) : chord(second(p));
  const phase = p * 3 < DOWN ? 'idle' : second(p) < DOWN ? 'rec' : p < .95 ? 'work' : 'done';
  return { phase, ...keys, typed: ramp(p, .73, .95) };
}
const VARS = ['alt', 'altShow', 'space', 'spaceShow', 'typed'];
// Where each tab lands on the timeline: just after the press, mid-listen, the end.
export const stepTargets = [.17, .5, 1];

// Own only this section's trigger and listeners; safe to dispose on React unmount/HMR.
// CSS owns stickiness; GSAP measures three bounded scroll steps, not wheel input.
// Where it does not pin (reduced motion, a short or narrow window) the tabs
// alone switch the step and `onPinned(false)` lets the page show the result.
export function createStory(section, { ScrollTrigger, onSelect, onPinned = () => {}, win = window }) {
  const stage = section.querySelector('[data-stage]');
  const motion = win.matchMedia('(prefers-reduced-motion: no-preference) and (min-height: 600px) and (min-width: 720px)');
  let trigger;
  let disposed = false;
  let step = 1;
  let tween = 0;
  const apply = progress => {
    const state = demoState(progress);
    stage.dataset.phase = state.phase;
    for (const name of VARS) stage.style.setProperty(`--${name}`, state[name].toFixed(3));
  };
  // Without the pin, a tab plays its own stretch of the timeline (or jumps, with reduced motion).
  const play = index => {
    win.cancelAnimationFrame?.(tween);
    const to = stepTargets[index], from = stepStarts[index], still = !win.matchMedia('(prefers-reduced-motion: no-preference)').matches;
    if (still || !win.requestAnimationFrame) { apply(to); return; }
    const duration = [900, 700, 1800][index];
    let begin;
    const frame = now => {
      begin ??= now;
      const t = Math.min(1, (now - begin) / duration);
      apply(from + (to - from) * t);
      if (t < 1) tween = win.requestAnimationFrame(frame);
    };
    tween = win.requestAnimationFrame(frame);
  };
  const start = () => section.getBoundingClientRect().top + win.scrollY +
    (parseFloat(win.getComputedStyle(section).paddingTop) || 0) - 24;
  const sync = progress => {
    apply(progress);
    if (!stage.contains(section.ownerDocument.activeElement)) onSelect(progressIndex(progress));
  };
  function configure() {
    if (disposed) return;
    trigger?.kill();
    trigger = undefined;
    section.classList.toggle('scroll-demo', motion.matches);
    step = Math.max(280, win.innerHeight * .55);
    section.style.setProperty('--story-travel', `${step * 3}px`);
    if (!motion.matches || stage.getBoundingClientRect().height > win.innerHeight - 48) {
      section.classList.remove('scroll-demo');
      apply(1);
      onPinned(false);
      return;
    }
    trigger = ScrollTrigger.create({
      trigger: section, start, end: () => start() + step * 3,
      invalidateOnRefresh: true,
      onUpdate: self => sync(self.progress),
      onRefresh: self => sync(self.progress),
    });
    onPinned(true);
    sync(trigger.progress);
  }
  win.addEventListener('resize', configure);
  motion.addEventListener('change', configure);
  section.ownerDocument.fonts?.ready.then(configure);
  configure();
  return {
    navigate(index) {
      onSelect(index);
      if (trigger) win.scrollTo({ top: start() + step * 3 * Math.min(stepTargets[index], .999), behavior: 'instant' });
      else play(index);
    },
    destroy() {
      disposed = true;
      win.cancelAnimationFrame?.(tween);
      trigger?.kill();
      delete stage.dataset.phase;
      for (const name of VARS) stage.style.removeProperty(`--${name}`);
      win.removeEventListener('resize', configure);
      motion.removeEventListener('change', configure);
      section.classList.remove('scroll-demo');
      section.style.removeProperty('--story-travel');
    },
  };
}
