import { describe, it, expect } from "vitest";
import {
  expoScaffold,
  SCAFFOLD_MARKER,
  EXPO_SCAFFOLD_VERSION,
  type FileMap,
} from "./expo-scaffold";

/** Parse a JSON file from the scaffold map, asserting it's present + valid. */
function json(map: FileMap, path: string): Record<string, unknown> {
  expect(map[path], `${path} should exist`).toBeTruthy();
  return JSON.parse(map[path]) as Record<string, unknown>;
}

describe("expoScaffold", () => {
  it("emits every file the Expo app needs to compile and run", () => {
    const map = expoScaffold("Budgeteye");
    const expected = [
      SCAFFOLD_MARKER,
      "package.json",
      "app.json",
      "tsconfig.json",
      "babel.config.js",
      ".eslintrc.js",
      "expo-env.d.ts",
      "app/_layout.tsx",
      "app/(tabs)/_layout.tsx",
      "app/(tabs)/index.tsx",
    ];
    for (const path of expected) {
      expect(map[path], `missing ${path}`).toBeTruthy();
    }
  });

  it("stamps the scaffold marker with the current version", () => {
    const map = expoScaffold("X");
    expect(map[SCAFFOLD_MARKER]).toBe(`${EXPO_SCAFFOLD_VERSION}\n`);
  });

  it("produces valid JSON config files", () => {
    const map = expoScaffold("Budgeteye");
    expect(() => json(map, "package.json")).not.toThrow();
    expect(() => json(map, "app.json")).not.toThrow();
    expect(() => json(map, "tsconfig.json")).not.toThrow();
  });

  it("wires package.json for expo-router + the web preview build", () => {
    const pkg = json(expoScaffold("Budgeteye"), "package.json");
    expect(pkg.main).toBe("expo-router/entry");
    const deps = pkg.dependencies as Record<string, string>;
    // Required by `expo export -p web` — the live preview build.
    expect(deps["react-native-web"]).toBeTruthy();
    expect(deps["@expo/metro-runtime"]).toBeTruthy();
    expect(deps["expo-router"]).toBeTruthy();
  });

  it("slugifies the app name into name/slug/scheme", () => {
    const map = expoScaffold("My Cool App!!");
    const pkg = json(map, "package.json");
    const app = json(map, "app.json").expo as Record<string, unknown>;
    expect(pkg.name).toBe("my-cool-app");
    expect(app.slug).toBe("my-cool-app");
    expect(app.scheme).toBe("my-cool-app");
    // The human-readable display name keeps the original text.
    expect(app.name).toBe("My Cool App!!");
  });

  it("renders the display name into the home screen", () => {
    const map = expoScaffold("Budgeteye");
    expect(map["app/(tabs)/index.tsx"]).toContain("Budgeteye");
  });

  it("falls back to a default slug + name when given empty input", () => {
    const map = expoScaffold("");
    const pkg = json(map, "package.json");
    const app = json(map, "app.json").expo as Record<string, unknown>;
    expect(pkg.name).toBe("mobivable-app");
    expect(app.name).toBe("Mobivable App");
  });

  it("falls back the slug when the name slugifies to nothing, keeping the display text", () => {
    const map = expoScaffold("   !!!   ");
    const app = json(map, "app.json").expo as Record<string, unknown>;
    // Slug has no usable characters → default slug.
    expect(app.slug).toBe("mobivable-app");
    // The display name keeps the (trimmed) original text.
    expect(app.name).toBe("!!!");
  });

  it("falls back the display name on whitespace-only input", () => {
    const app = json(expoScaffold("   "), "app.json").expo as Record<string, unknown>;
    expect(app.slug).toBe("mobivable-app");
    expect(app.name).toBe("Mobivable App");
  });

  it("caps the slug at 40 characters", () => {
    const long = "a".repeat(100);
    const app = json(expoScaffold(long), "app.json").expo as Record<string, unknown>;
    expect((app.slug as string).length).toBeLessThanOrEqual(40);
  });

  it("never produces leading/trailing dashes in the slug", () => {
    const app = json(expoScaffold("--Edge Case--"), "app.json").expo as Record<string, unknown>;
    const slug = app.slug as string;
    expect(slug.startsWith("-")).toBe(false);
    expect(slug.endsWith("-")).toBe(false);
  });
});
