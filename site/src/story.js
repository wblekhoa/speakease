// The dictation in three steps (owner, 31/10): press the shortcut, it listens, it writes.
export const stepIds = ['press', 'listen', 'write'];
export const lastStep = stepIds.length - 1;
// Tabs sit in a row under the laptop; both arrow axes move through them (WAI-ARIA tabs).
export function keyboardIndex(key, index) {
  const next = (index + 1) % 3, previous = (index + 2) % 3;
  return ({ ArrowRight: next, ArrowDown: next, ArrowLeft: previous, ArrowUp: previous, Home: 0, End: 2 })[key];
}
export const progressIndex = progress => Math.max(0, Math.min(2, Math.floor(progress * 3)));

// One continuous timeline over the three steps (0 → 1), so the key press moves with
// the scroll (owner, 31/10). Phase: idle (no pill yet) → rec (the pill pops up and
// listens) → work (second press: "Transcribing…") → done (the sentence is in).
// `key` is how far the keys are pressed (0-1); `show` whether they are on screen at all (they come
// up for a press and leave once it is done, owner 31/10); `typed` how much of the sentence shows.
const ramp = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)));
export function demoState(progress) {
  const p = Math.max(0, Math.min(1, progress));
  if (p < 1 / 3) {
    const a = p * 3;
    return { phase: a < .45 ? 'idle' : 'rec', key: a < .5 ? ramp(a, .15, .45) : 1 - ramp(a, .55, .8), show: Math.min(ramp(a, 0, .15), 1 - ramp(a, .75, .9)), typed: 0 };
  }
  if (p < 2 / 3) return { phase: 'rec', key: 0, show: ramp((p - 1 / 3) * 3, .8, 1), typed: 0 };
  const c = (p - 2 / 3) * 3;
  return { phase: c < .15 ? 'rec' : c < .85 ? 'work' : 'done', key: c < .2 ? ramp(c, 0, .15) : 1 - ramp(c, .2, .35), show: 1 - ramp(c, .4, .55), typed: ramp(c, .3, .85) };
}
// Where each tab lands on the timeline: just after the press, mid-listen, the end.
export const stepTargets = [.3, .5, 1];

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
    const { phase, key, show, typed } = demoState(progress);
    stage.dataset.phase = phase;
    stage.style.setProperty('--key', key.toFixed(3));
    stage.style.setProperty('--show', show.toFixed(3));
    stage.style.setProperty('--typed', typed.toFixed(3));
  };
  // Without the pin, a tab plays its own stretch of the timeline (or jumps, with reduced motion).
  const play = index => {
    win.cancelAnimationFrame?.(tween);
    const to = stepTargets[index], from = index / 3, still = !win.matchMedia('(prefers-reduced-motion: no-preference)').matches;
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
      stage.style.removeProperty('--key');
      stage.style.removeProperty('--show');
      stage.style.removeProperty('--typed');
      win.removeEventListener('resize', configure);
      motion.removeEventListener('change', configure);
      section.classList.remove('scroll-demo');
      section.style.removeProperty('--story-travel');
    },
  };
}
