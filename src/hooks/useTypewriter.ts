import { useEffect, useState } from "react";

export function useTypewriter(phrases: string[], active: boolean) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!active) {
      setText("");
      return;
    }
    let phraseIdx = 0;
    let charIdx = 0;
    let deleting = false;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (cancelled) return;
      const current = phrases[phraseIdx];
      if (!deleting) {
        charIdx++;
        setText(current.slice(0, charIdx));
        if (charIdx === current.length) {
          deleting = true;
          timeout = setTimeout(tick, 1400);
          return;
        }
        timeout = setTimeout(tick, 55 + Math.random() * 50);
      } else {
        charIdx--;
        setText(current.slice(0, charIdx));
        if (charIdx === 0) {
          deleting = false;
          phraseIdx = (phraseIdx + 1) % phrases.length;
          timeout = setTimeout(tick, 350);
          return;
        }
        timeout = setTimeout(tick, 28);
      }
    };
    timeout = setTimeout(tick, 400);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [phrases, active]);
  return text;
}

export const APP_TYPED_PHRASES = [
  "add a dark mode toggle",
  "add push notifications",
  "add a profile screen",
  "make the onboarding smoother",
  "add Google sign-in",
  "add a settings page",
  "show a weekly summary chart",
  "add a search bar to the home screen",
  "add haptic feedback to buttons",
  "polish the empty states",
];
