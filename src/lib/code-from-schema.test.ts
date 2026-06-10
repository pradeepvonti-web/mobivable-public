import { describe, it, expect } from "vitest";
import { generateProjectFromSchema } from "./code-from-schema";

/**
 * The canonical schema nests all element content under `props` (see MElement
 * and MobileAppRenderer). These tests pin that the generator reads from
 * `props` — a regression on this rendered every element empty / as a literal
 * block-type placeholder in the live preview.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const schema: any = {
  name: "Culina",
  theme: { mode: "dark" },
  navigation: {
    items: [
      { label: "Feed", screen: "dashboard" },
      { label: "Explore", screen: "search" },
    ],
  },
  screens: [
    {
      id: "dashboard",
      title: "The Pass",
      elements: [
        {
          type: "parallax-hero",
          props: {
            eyebrow: "TRENDING NOW",
            title: "Aged Wagyu Tartare",
            subtitle: "By Chef Julianne Vance",
            image: "https://example.com/wagyu.png",
            buttonLabel: "View Recipe",
            action: { type: "navigate", screen: "recipe-detail" },
          },
        },
        {
          type: "stat-row",
          props: {
            // Field-name drift: data under `items`, canonical `stats` empty.
            stats: [],
            items: [
              { label: "Active Chefs", value: "1.2k" },
              { label: "New Recipes", value: "84" },
            ],
          },
        },
        {
          type: "grid-cards",
          props: {
            cards: [
              { title: "Saffron Risotto", subtitle: "Milanese Style", badge: "Michelin" },
              { title: "Charred Octopus", subtitle: "Lemon & Caper" },
            ],
          },
        },
      ],
    },
    { id: "search", title: "Discovery", elements: [] },
  ],
};

describe("code-from-schema reads element content from props", () => {
  const { files } = generateProjectFromSchema(schema);
  const dashboard = files["src/screens/Screen_dashboard.tsx"] ?? "";
  const app = files["src/App.tsx"] ?? "";

  it("renders the parallax-hero title/subtitle/eyebrow from props", () => {
    expect(dashboard).toContain("Aged Wagyu Tartare");
    expect(dashboard).toContain("By Chef Julianne Vance");
    expect(dashboard).toContain("TRENDING NOW");
  });

  it("renders the hero image and CTA from props", () => {
    expect(dashboard).toContain("https://example.com/wagyu.png");
    expect(dashboard).toContain("View Recipe");
  });

  it("renders stat-row data even when it arrives under `items`", () => {
    expect(dashboard).toContain("Active Chefs");
    expect(dashboard).toContain("1.2k");
  });

  it("renders grid-cards from props", () => {
    expect(dashboard).toContain("Saffron Risotto");
    expect(dashboard).toContain("Charred Octopus");
    expect(dashboard).toContain("Michelin");
  });

  it("wires the hero action to navigate", () => {
    expect(dashboard).toContain('setScreen("recipe-detail")');
  });

  it("uses real nav labels in App.tsx", () => {
    expect(app).toContain(">Feed<");
    expect(app).toContain(">Explore<");
  });

  it("never emits a literal block-type placeholder", () => {
    expect(/tracking-widest opacity-60">parallax-hero/.test(dashboard)).toBe(false);
    expect(dashboard).not.toContain(">stat-row<");
  });
});

describe("code-from-schema drops oversized inline data: URIs", () => {
  // A multi-MB base64 image in the schema must NOT be inlined into the source
  // (it bloats the file and chokes the Sandpack preview).
  const bigDataUri = "data:image/png;base64," + "A".repeat(2_000_000);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schema: any = {
    name: "Heavy",
    theme: { mode: "dark" },
    screens: [
      {
        id: "home",
        title: "Home",
        elements: [
          { type: "parallax-hero", props: { title: "Hero", image: bigDataUri } },
          { type: "image", props: { src: bigDataUri } },
        ],
      },
    ],
  };

  const { files } = generateProjectFromSchema(schema);
  const home = files["src/screens/Screen_home.tsx"] ?? "";

  it("does not inline the megabyte data URI", () => {
    expect(home).not.toContain("data:image/png;base64,AAAA");
    expect(home.length).toBeLessThan(20_000);
  });

  it("still passes through normal hosted URLs", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s: any = {
      name: "X",
      theme: { mode: "dark" },
      screens: [
        {
          id: "home",
          title: "H",
          elements: [{ type: "image", props: { src: "https://cdn.example.com/a.png" } }],
        },
      ],
    };
    const out = generateProjectFromSchema(s).files["src/screens/Screen_home.tsx"] ?? "";
    expect(out).toContain("https://cdn.example.com/a.png");
  });
});
