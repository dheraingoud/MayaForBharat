// F3 regression guard: terminal stick-to-bottom during a fast write flood.
//
// Root cause (Terminal.tsx:119-137): onWriteParsed trusted userScrolledUpRef
// (cached from the last onScroll) instead of re-querying the actual bottom.
// During an npm-install flood, xterm can fire a transient onScroll with
// viewportY < baseY before the viewport re-pins → ref flips true → every
// later write sees ref=true and skips scrollToBottom → the terminal "doesn't
// scroll down" for the rest of the flood, even though no user scrolled.
//
// Fix: at write time, query isAtBottom() fresh. If we're truly at the bottom,
// follow AND self-heal the stuck ref. If not, the user is reading history.
// The ref becomes an advisory hint; the live bottom check is authoritative.
import { describe, expect, it } from 'vitest';
import { decideFollowOnWrite } from './terminal-scroll';

describe('decideFollowOnWrite — terminal stick-to-bottom (F3)', () => {
  it('follows when the user is at the bottom regardless of a stuck ref', () => {
    // The race: ref got stuck true during a transient xterm onScroll, but the
    // viewport is actually at the bottom. Must follow + self-heal the ref.
    expect(decideFollowOnWrite(true, true)).toEqual({ follow: true, newRef: false });
  });

  it('follows when ref is false and at the bottom (normal happy path)', () => {
    expect(decideFollowOnWrite(false, true)).toEqual({ follow: true, newRef: false });
  });

  it('does NOT follow when the user genuinely scrolled up', () => {
    // isAtBottom=false = user is reading history. Honor the scroll-up.
    expect(decideFollowOnWrite(true, false)).toEqual({ follow: false, newRef: true });
  });

  it('does NOT follow when ref is false but viewport is somehow off-bottom', () => {
    // Edge: ref lies (false) but the real viewport is off-bottom. The live
    // bottom check wins — don't follow, and mark the ref true so a later
    // write at the bottom self-heals correctly.
    expect(decideFollowOnWrite(false, false)).toEqual({ follow: false, newRef: true });
  });
});
