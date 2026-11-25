import { describe, expect, it, vi } from "vitest";
import type { TestingPullRequest } from "../../types";

vi.mock("@decky/ui", () => ({
  ButtonItem: "ButtonItem",
  ConfirmModal: "ConfirmModal",
  DialogButton: "DialogButton",
  DialogControlsSection: "DialogControlsSection",
  DialogControlsSectionHeader: "DialogControlsSectionHeader",
  Field: "Field",
  Focusable: "Focusable",
  Menu: "Menu",
  MenuItem: "MenuItem",
  NavEntryPositionPreferences: { MAINTAIN_X: 1 },
  Navigation: { NavigateToExternalWeb: vi.fn() },
  Spinner: "Spinner",
  showContextMenu: vi.fn(),
  showModal: vi.fn(),
}));
vi.mock("@decky/api", () => ({
  callable: () => vi.fn(),
  toaster: { toast: vi.fn() },
}));

import { sortTestingPullRequests } from "./TestingSection";

const pr = (overrides: Partial<TestingPullRequest>): TestingPullRequest => ({
  id: 1,
  name: "Default PR",
  link: "https://github.com/beallio/Decky-Metadata/pull/1",
  head_sha: "a".repeat(40),
  created_at: "2026-11-20T00:00:00Z",
  updated_at: "2026-11-21T00:00:00Z",
  author: "beallio",
  is_fork: false,
  draft: false,
  ...overrides,
});

describe("sortTestingPullRequests", () => {
  const items: TestingPullRequest[] = [
    pr({
      id: 10,
      name: "Beta feature",
      author: "zoe",
      created_at: "2026-11-18T00:00:00Z",
      updated_at: "2026-11-24T00:00:00Z",
    }),
    pr({
      id: 12,
      name: "Alpha fix",
      author: "alex",
      created_at: "2026-11-22T00:00:00Z",
      updated_at: "2026-11-23T00:00:00Z",
    }),
    pr({
      id: 11,
      name: "Gamma tweak",
      author: "alex",
      created_at: "2026-11-19T00:00:00Z",
      updated_at: "2026-11-25T00:00:00Z",
    }),
  ];

  it("sorts by updated timestamp descending by default", () => {
    expect(sortTestingPullRequests(items, "updated", true).map((item) => item.id)).toEqual([
      11, 10, 12,
    ]);
    expect(sortTestingPullRequests(items, "updated", false).map((item) => item.id)).toEqual([
      12, 10, 11,
    ]);
  });

  it("sorts by opened date, PR number, author, and title with newest-PR tie-breaking", () => {
    expect(sortTestingPullRequests(items, "opened", true).map((item) => item.id)).toEqual([
      12, 11, 10,
    ]);
    expect(sortTestingPullRequests(items, "number", true).map((item) => item.id)).toEqual([
      12, 11, 10,
    ]);
    expect(sortTestingPullRequests(items, "author", false).map((item) => item.id)).toEqual([
      12, 11, 10,
    ]);
    expect(sortTestingPullRequests(items, "title", false).map((item) => item.id)).toEqual([
      12, 10, 11,
    ]);
  });
});
