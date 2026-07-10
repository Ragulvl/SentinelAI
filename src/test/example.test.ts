import { describe, it, expect } from "vitest";
import { cn } from "../lib/utils";

describe("cn class merge utility", () => {
  it("should merge tailwind classes properly", () => {
    expect(cn("px-2 py-1", "bg-red-500")).toBe("px-2 py-1 bg-red-500");
  });

  it("should override conflicting tailwind classes", () => {
    expect(cn("p-4", "p-2")).toBe("p-2");
  });

  it("should handle conditional flags", () => {
    expect(cn("text-sm", true && "font-bold", false && "underline")).toBe("text-sm font-bold");
  });
});
