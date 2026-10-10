/** The side column's widths, and what a drag on its edge means.
 *
 * Open, the column is the person's to drag between MIN and MAX (ReadEase's
 * rule). The same edge also folds and unfolds it, the way Finder's does:
 * drag it past the halfway mark between the folded rail and MIN and the
 * column snaps shut; drag a folded rail's edge out past that mark and it
 * snaps open. Between the mark and MIN, and past MAX, the column follows
 * the cursor only a third of the way - a rubber band that says "this is
 * the end" - and lets go to the nearest real width.
 */
export const SIDEBAR_FOLDED_WIDTH = 76;
export const SIDEBAR_DEFAULT_WIDTH = 208;
export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 320;
/** Where a drag folds or unfolds the column. */
export const SIDEBAR_FOLD_AT = (SIDEBAR_FOLDED_WIDTH + SIDEBAR_MIN_WIDTH) / 2;
const STRETCH = 1 / 3;

export const clampSidebarWidth = (width: number) =>
  Number.isFinite(width)
    ? Math.round(
        Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width)),
      )
    : SIDEBAR_DEFAULT_WIDTH;

export interface SidebarDrag {
  /** Whether the column is folded at this point of the drag. */
  folded: boolean;
  /** The width to draw now, rubber band included. */
  shown: number;
  /** The width to keep if the hand lets go here. */
  settled: number;
}

/** Where the edge is (`edge`: the column's width the cursor asks for). */
export function sidebarDrag(edge: number): SidebarDrag {
  if (!Number.isFinite(edge) || edge < SIDEBAR_FOLD_AT) {
    return {
      folded: true,
      shown: SIDEBAR_FOLDED_WIDTH,
      settled: SIDEBAR_FOLDED_WIDTH,
    };
  }
  const settled = clampSidebarWidth(edge);
  const shown =
    edge < SIDEBAR_MIN_WIDTH
      ? SIDEBAR_MIN_WIDTH - (SIDEBAR_MIN_WIDTH - edge) * STRETCH
      : edge > SIDEBAR_MAX_WIDTH
        ? SIDEBAR_MAX_WIDTH + (edge - SIDEBAR_MAX_WIDTH) * STRETCH
        : settled;
  return { folded: false, shown: Math.round(shown), settled };
}
