// The dictation in three steps (owner, 31/10): hold the keys, speak, let go.
export const stepIds = ['hold', 'speak', 'release'];
export const lastStep = stepIds.length - 1;
// Tabs sit in a row under the laptop; both arrow axes move through them (WAI-ARIA tabs).
export function keyboardIndex(key, index) {
  const next = (index + 1) % 3, previous = (index + 2) % 3;
  return ({ ArrowRight: next, ArrowDown: next, ArrowLeft: previous, ArrowUp: previous, Home: 0, End: 2 })[key];
}
export const progressIndex = progress => Math.max(0, Math.min(2, Math.floor(progress * 3)));

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
  const start = () => section.getBoundingClientRect().top + win.scrollY +
    (parseFloat(win.getComputedStyle(section).paddingTop) || 0) - 24;
  const sync = progress => {
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
      if (trigger) win.scrollTo({ top: start() + step * index + step / 2, behavior: 'instant' });
    },
    destroy() {
      disposed = true;
      trigger?.kill();
      win.removeEventListener('resize', configure);
      motion.removeEventListener('change', configure);
      section.classList.remove('scroll-demo');
      section.style.removeProperty('--story-travel');
    },
  };
}
