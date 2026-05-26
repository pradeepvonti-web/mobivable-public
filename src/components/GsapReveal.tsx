import { useRef, type ReactNode, type ElementType, type CSSProperties } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
}

type RevealProps = {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  /** ms-equivalent delay in seconds (default 0) */
  delay?: number;
  /** translate distance in px (default 24) */
  y?: number;
  /** animation duration in seconds (default 0.9) */
  duration?: number;
  /** stagger child elements selector */
  stagger?: string;
  /** disable scroll trigger and play immediately */
  immediate?: boolean;
};

export function GsapReveal({
  children,
  as: Tag = "div",
  className,
  style,
  delay = 0,
  y = 24,
  duration = 0.9,
  stagger,
  immediate = false,
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (!ref.current) return;
      const targets = stagger ? ref.current.querySelectorAll(stagger) : ref.current;
      gsap.from(targets, {
        y,
        opacity: 0,
        duration,
        delay,
        ease: "power3.out",
        stagger: stagger ? 0.08 : 0,
        scrollTrigger: immediate
          ? undefined
          : {
              trigger: ref.current,
              start: "top 85%",
              once: true,
            },
      });
    },
    { scope: ref },
  );

  return (
    <Tag ref={ref} className={className} style={style}>
      {children}
    </Tag>
  );
}
