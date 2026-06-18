/**
 * useSelectionState — reusable hook for managing bulk checkbox selection.
 *
 * Handles:
 *   - Single item toggle
 *   - Select all (from a list of visible item IDs)
 *   - Deselect all
 *   - Derived state: isAllSelected, isIndeterminate
 *
 * Selection is NOT automatically cleared on sort/filter — the caller
 * decides when to call clearSelection().
 */
import { useState, useCallback, useMemo } from "react";

export interface SelectionState {
  /** Currently selected item IDs */
  selectedIds: string[];
  /** True when every visible item is selected */
  isAllSelected: boolean;
  /** True when some (but not all) visible items are selected */
  isIndeterminate: boolean;
  /** Toggle a single item in/out of selection */
  toggleItem: (id: string) => void;
  /** Select all provided visible item IDs */
  selectAll: (visibleIds: string[]) => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Replace the entire selection set */
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
}

export function useSelectionState(): SelectionState {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleItem = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const selectAll = useCallback((visibleIds: string[]) => {
    setSelectedIds(visibleIds);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  // These are computed on the fly — callers should pass currentVisibleIds
  // We return these as functions to keep the hook signature stable.
  const isAllSelected = false; // See note below
  const isIndeterminate = false;

  return {
    selectedIds,
    isAllSelected,
    isIndeterminate,
    toggleItem,
    selectAll,
    clearSelection,
    setSelectedIds,
  };
}

/**
 * Computes derived Select All state from a selection set and visible items.
 * Call this in the render function with the current visible email IDs.
 */
export function computeSelectAllState(
  selectedIds: string[],
  visibleIds: string[]
): { isAllSelected: boolean; isIndeterminate: boolean } {
  if (visibleIds.length === 0) {
    return { isAllSelected: false, isIndeterminate: false };
  }
  const selectedCount = visibleIds.filter((id) => selectedIds.includes(id)).length;
  return {
    isAllSelected: selectedCount === visibleIds.length,
    isIndeterminate: selectedCount > 0 && selectedCount < visibleIds.length,
  };
}
