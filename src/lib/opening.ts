export const OPENING_SESSION_KEY = "afi-opening-played";
export const OPENING_DURATION_MS = 7_200;

function prefersReducedMotion(win: Window): boolean {
  return win.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function shouldPlayOpening(win: Window): boolean {
  if (prefersReducedMotion(win)) {
    return false;
  }

  try {
    return win.sessionStorage.getItem(OPENING_SESSION_KEY) === null;
  } catch {
    return true;
  }
}

export function claimOpening(win: Window): boolean {
  if (prefersReducedMotion(win)) {
    return false;
  }

  try {
    if (win.sessionStorage.getItem(OPENING_SESSION_KEY) !== null) {
      return false;
    }

    win.sessionStorage.setItem(OPENING_SESSION_KEY, "1");
    return true;
  } catch {
    return true;
  }
}
