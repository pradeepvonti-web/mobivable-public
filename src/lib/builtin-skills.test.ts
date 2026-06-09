import { describe, it, expect } from "vitest";
import { getBuiltinSkill, builtinSkillNames, BUILTIN_SKILLS } from "./builtin-skills";

describe("builtin skills", () => {
  it("exposes frontend-design", () => {
    expect(builtinSkillNames()).toContain("frontend-design");
    const body = getBuiltinSkill("frontend-design");
    expect(body).toBeTruthy();
    // Hits the key disciplines the build agent must follow.
    expect(body).toContain("constants/theme.ts");
    expect(body).toContain("react-native-svg");
    expect(body).toContain("StyleSheet");
  });

  it("resolves case-insensitively", () => {
    expect(getBuiltinSkill("Frontend-Design")).toBe(BUILTIN_SKILLS["frontend-design"]);
    expect(getBuiltinSkill("  frontend-design  ")).toBe(BUILTIN_SKILLS["frontend-design"]);
  });

  it("returns null for unknown skills", () => {
    expect(getBuiltinSkill("does-not-exist")).toBeNull();
    expect(getBuiltinSkill("")).toBeNull();
  });

  it("keeps each built-in body within the user-skill 8KB budget", () => {
    for (const [name, body] of Object.entries(BUILTIN_SKILLS)) {
      expect(body.length, `${name} should be < 8192 chars`).toBeLessThan(8192);
    }
  });
});
