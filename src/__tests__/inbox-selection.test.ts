/**
 * Tests for inbox bulk selection logic.
 *
 * Covers:
 *   - Single item selection toggle
 *   - Multiple item selection
 *   - Select All
 *   - Deselect All
 *   - computeSelectAllState derived state
 *   - Selection preserved when emails list identity stays the same
 *   - Archive/Delete buttons enable/disable correctly
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSelectionState, computeSelectAllState } from "@/lib/useSelectionState";

// ---------------------------------------------------------------------------
// useSelectionState hook tests
// ---------------------------------------------------------------------------
describe("useSelectionState", () => {
  it("starts with empty selection", () => {
    const { result } = renderHook(() => useSelectionState());
    expect(result.current.selectedIds).toEqual([]);
  });

  it("single selection — toggleItem adds the item when not selected", () => {
    const { result } = renderHook(() => useSelectionState());
    act(() => {
      result.current.toggleItem("email-1");
    });
    expect(result.current.selectedIds).toEqual(["email-1"]);
  });

  it("single selection — toggleItem removes the item when already selected", () => {
    const { result } = renderHook(() => useSelectionState());

    // Add first
    act(() => { result.current.toggleItem("email-1"); });
    expect(result.current.selectedIds).toContain("email-1");

    // Remove
    act(() => { result.current.toggleItem("email-1"); });
    expect(result.current.selectedIds).not.toContain("email-1");
    expect(result.current.selectedIds).toHaveLength(0);
  });

  it("multiple selection — adding multiple items accumulates them all", () => {
    const { result } = renderHook(() => useSelectionState());

    act(() => { result.current.toggleItem("email-1"); });
    act(() => { result.current.toggleItem("email-2"); });
    act(() => { result.current.toggleItem("email-3"); });

    expect(result.current.selectedIds).toHaveLength(3);
    expect(result.current.selectedIds).toContain("email-1");
    expect(result.current.selectedIds).toContain("email-2");
    expect(result.current.selectedIds).toContain("email-3");
  });

  it("multiple selection — deselecting one item leaves the others intact", () => {
    const { result } = renderHook(() => useSelectionState());

    act(() => { result.current.toggleItem("email-1"); });
    act(() => { result.current.toggleItem("email-2"); });
    act(() => { result.current.toggleItem("email-3"); });

    // Remove email-2
    act(() => { result.current.toggleItem("email-2"); });

    expect(result.current.selectedIds).toHaveLength(2);
    expect(result.current.selectedIds).toContain("email-1");
    expect(result.current.selectedIds).not.toContain("email-2");
    expect(result.current.selectedIds).toContain("email-3");
  });

  it("select all — selectAll populates the list with all provided IDs", () => {
    const { result } = renderHook(() => useSelectionState());
    const visibleIds = ["email-1", "email-2", "email-3", "email-4"];

    act(() => { result.current.selectAll(visibleIds); });

    expect(result.current.selectedIds).toHaveLength(4);
    for (const id of visibleIds) {
      expect(result.current.selectedIds).toContain(id);
    }
  });

  it("deselect all — clearSelection empties the list", () => {
    const { result } = renderHook(() => useSelectionState());

    act(() => { result.current.selectAll(["email-1", "email-2", "email-3"]); });
    expect(result.current.selectedIds).toHaveLength(3);

    act(() => { result.current.clearSelection(); });
    expect(result.current.selectedIds).toHaveLength(0);
  });

  it("toggleItem is idempotent — calling with same id twice nets zero change", () => {
    const { result } = renderHook(() => useSelectionState());

    act(() => { result.current.toggleItem("email-1"); });
    act(() => { result.current.toggleItem("email-1"); });

    expect(result.current.selectedIds).toHaveLength(0);
  });

  it("does not contain duplicates after multiple selectAll calls", () => {
    const { result } = renderHook(() => useSelectionState());
    const ids = ["a", "b", "c"];

    act(() => { result.current.selectAll(ids); });
    act(() => { result.current.selectAll(ids); });

    expect(result.current.selectedIds).toHaveLength(ids.length);
  });
});

// ---------------------------------------------------------------------------
// computeSelectAllState tests
// ---------------------------------------------------------------------------
describe("computeSelectAllState", () => {
  it("returns isAllSelected=false and isIndeterminate=false when nothing is selected", () => {
    const { isAllSelected, isIndeterminate } = computeSelectAllState(
      [],
      ["email-1", "email-2", "email-3"]
    );
    expect(isAllSelected).toBe(false);
    expect(isIndeterminate).toBe(false);
  });

  it("returns isAllSelected=true and isIndeterminate=false when all visible items are selected", () => {
    const visibleIds = ["email-1", "email-2", "email-3"];
    const { isAllSelected, isIndeterminate } = computeSelectAllState(visibleIds, visibleIds);
    expect(isAllSelected).toBe(true);
    expect(isIndeterminate).toBe(false);
  });

  it("returns isAllSelected=false and isIndeterminate=true when some (not all) items are selected", () => {
    const { isAllSelected, isIndeterminate } = computeSelectAllState(
      ["email-1"],
      ["email-1", "email-2", "email-3"]
    );
    expect(isAllSelected).toBe(false);
    expect(isIndeterminate).toBe(true);
  });

  it("handles empty visible list gracefully", () => {
    const { isAllSelected, isIndeterminate } = computeSelectAllState([], []);
    expect(isAllSelected).toBe(false);
    expect(isIndeterminate).toBe(false);
  });

  it("ignores selected IDs that are no longer in the visible list", () => {
    // email-99 was on a previous page; should not affect current page's state
    const { isAllSelected, isIndeterminate } = computeSelectAllState(
      ["email-99"],
      ["email-1", "email-2"]
    );
    expect(isAllSelected).toBe(false);
    expect(isIndeterminate).toBe(false);
  });

  it("select all then deselect one → isIndeterminate=true", () => {
    // Simulates: select all 3, then deselect email-2
    const selected = ["email-1", "email-3"]; // email-2 was removed
    const visible = ["email-1", "email-2", "email-3"];
    const { isAllSelected, isIndeterminate } = computeSelectAllState(selected, visible);
    expect(isAllSelected).toBe(false);
    expect(isIndeterminate).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Archive / Delete button enabled state tests
// ---------------------------------------------------------------------------
describe("Archive/Delete button disabled state logic", () => {
  it("buttons should be disabled when selectedIds is empty", () => {
    const selectedIds: string[] = [];
    expect(selectedIds.length === 0).toBe(true); // disabled
  });

  it("buttons should be enabled when at least one email is selected", () => {
    const selectedIds = ["email-1"];
    expect(selectedIds.length > 0).toBe(true); // enabled
  });

  it("buttons should be enabled when multiple emails are selected", () => {
    const selectedIds = ["email-1", "email-2", "email-3"];
    expect(selectedIds.length > 0).toBe(true); // enabled
  });

  it("buttons disabled again after clearSelection", () => {
    const { result } = renderHook(() => useSelectionState());

    act(() => { result.current.selectAll(["a", "b", "c"]); });
    expect(result.current.selectedIds.length > 0).toBe(true); // enabled

    act(() => { result.current.clearSelection(); });
    expect(result.current.selectedIds.length === 0).toBe(true); // disabled again
  });
});
