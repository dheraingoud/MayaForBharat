// Terminal stick-to-bottom decision logic, extracted pure for testing (F3).
//
// Terminal.tsx's onWriteParsed used to trust userScrolledUpRef (cached from the
// last onScroll) and skip scrollToBottom when it was true. During a fast write
// flood (npm install), xterm can fire a transient onScroll with viewportY <
// baseY before the viewport re-pins, flipping the ref true even though no user
// scrolled — then every later write skipped scrollToBottom and the terminal
// "didn't scroll down" for the rest of the flood.
//
// Fix: at write time, query isAtBottom() fresh. The live bottom check is
// authoritative; the ref is only an advisory hint. If we're truly at the
// bottom, follow AND self-heal the stuck ref. If not, the user is reading
// history — don't follow, and mark the ref true so the hint matches reality.
export function decideFollowOnWrite(
  refValue: boolean,
  isAtBottomNow: boolean,
): { follow: boolean; newRef: boolean } {
  if (isAtBottomNow) return { follow: true, newRef: false };
  return { follow: false, newRef: true };
}
