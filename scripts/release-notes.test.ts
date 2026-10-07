import { describe, expect, it } from "vitest";
import { releaseNotes } from "./release-notes.ts";

describe("release notes", () => {
  const commits = [
    { sha: "1111111", subject: "✨ Add the watch party chat (#9)" },
    { sha: "2222222", subject: "🐛 Fix the resume position (#10)" },
    { sha: "3333333", subject: "👷 Run the tests on Windows (#11)" },
    { sha: "4444444", subject: ":arrow_up: Bump the npm group with 2 updates" },
    { sha: "5555555", subject: "🔖 Prepare 0.3.0" },
    { sha: "6666666", subject: "⚡️ Load the home rows in parallel (#12)" },
    { sha: "7777777", subject: "🚑 Fix the player on Safari (#13)" },
  ];
  const notes = releaseNotes(commits, "v0.3.0", "v0.2.0");

  it("groups the commits by gitmoji, in the server's order", () => {
    expect(notes.indexOf("## Features")).toBeLessThan(notes.indexOf("## Fixes"));
    expect(notes.indexOf("## Fixes")).toBeLessThan(notes.indexOf("## Performance"));
    expect(notes.indexOf("## Performance")).toBeLessThan(notes.indexOf("## Other changes"));
    expect(notes).toContain(
      "## Fixes\n\n- 🐛 Fix the resume position (#10) (2222222)\n- 🚑 Fix the player on Safari (#13) (7777777)\n",
    );
    expect(notes).toContain("## Other changes\n\n- :arrow_up: Bump the npm group with 2 updates (4444444)\n");
    expect(notes).not.toContain("## Security");
  });

  it("leaves out CI and release commits", () => {
    expect(notes).not.toContain("👷");
    expect(notes).not.toContain("🔖");
  });

  it("ends with how to install and the full changelog", () => {
    expect(notes).toContain("blob/v0.3.0/README.md#installing");
    expect(notes.trimEnd()).toMatch(/compare\/v0\.2\.0\.\.\.v0\.3\.0$/);
    expect(releaseNotes([], "v0.1.0", undefined)).not.toContain("Full changelog");
  });
});
