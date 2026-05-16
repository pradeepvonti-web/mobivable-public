import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { BrandMark } from "../BrandMark";

/**
 * Visual regression / snapshot tests for the Admin BrandMark.
 *
 * Goal: catch icon mismatches in the Admin sidebar and mobile tabs.
 * Strategy:
 *  - Snapshot the rendered BrandMark at every size/active combination.
 *  - Verify it never falls back to a lucide-react <svg> icon.
 *  - Re-run under the `.dark` theme to ensure the same primary-square mark
 *    is used in both light and dark mode (color comes from the `bg-primary`
 *    token, so the markup must be identical).
 */

const SIZES = ["xs", "sm", "md", "lg"] as const;

function renderMatrix() {
  return SIZES.flatMap((size) =>
    [true, false].map((active) => {
      const { container } = render(
        <BrandMark size={size} active={active} />,
      );
      return { key: `${size}-${active ? "active" : "inactive"}`, html: container.innerHTML };
    }),
  );
}

describe("BrandMark", () => {
  afterEach(() => {
    document.documentElement.classList.remove("dark");
  });

  it("renders a primary-square (never an svg icon)", () => {
    const { container } = render(<BrandMark />);
    const span = container.querySelector("span");
    expect(span).not.toBeNull();
    expect(container.querySelector("svg")).toBeNull();
    expect(span!.className).toContain("rounded-sm");
    expect(span!.className).toContain("bg-primary");
  });

  it("uses muted-foreground swatch when inactive", () => {
    const { container } = render(<BrandMark active={false} />);
    const span = container.querySelector("span")!;
    expect(span.className).toContain("bg-muted-foreground/40");
    expect(span.className).not.toMatch(/\bbg-primary\b/);
  });

  it("matches snapshot across every size/active combination (light)", () => {
    expect(renderMatrix()).toMatchSnapshot();
  });

  it("matches snapshot across every size/active combination (dark)", () => {
    document.documentElement.classList.add("dark");
    // Markup must be identical to light — only the resolved CSS token color changes.
    expect(renderMatrix()).toMatchSnapshot();
  });
});

describe("AdminDashboard brand-mark usage", () => {
  it("sidebar + mobile tabs + header all use BrandMark and not lucide icons", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.promises.readFile("src/components/admin/AdminDashboard.tsx", "utf-8"),
    );

    // Must import the shared component.
    expect(source).toMatch(/from\s+"\.\/BrandMark"/);

    // Must NOT import any lucide icons in the dashboard chrome.
    expect(source).not.toMatch(/from\s+"lucide-react"/);

    // Header (md) + sidebar (sm) + mobile tabs (xs) all present.
    expect(source).toMatch(/<BrandMark[^/]*size="md"/);
    expect(source).toMatch(/<BrandMark[^/]*size="sm"/);
    expect(source).toMatch(/<BrandMark[^/]*size="xs"/);

    // No stray hand-rolled brand squares left behind.
    expect(source).not.toMatch(/size-6 bg-primary rounded-sm/);
    expect(source).not.toMatch(/size-3 rounded-sm shrink-0/);
    expect(source).not.toMatch(/size-2\.5 rounded-sm shrink-0/);
  });
});
