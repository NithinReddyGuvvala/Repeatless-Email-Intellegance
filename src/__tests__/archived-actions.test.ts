import { describe, it, expect } from "vitest";

describe("Archived filters logic", () => {
  it("filters out INBOX and TRASH labels for archived emails", () => {
    const emails = [
      { id: "1", labels: ["INBOX", "UNREAD"] },
      { id: "2", labels: ["TRASH"] },
      { id: "3", labels: ["SPAM"] },
      { id: "4", labels: [] },
      { id: "5", labels: ["SENT"] },
    ];

    const isArchived = (labels: string[]) => {
      const upperLabels = (labels || []).map(l => l.toUpperCase());
      return !upperLabels.includes("INBOX") && !upperLabels.includes("TRASH");
    };

    const archivedEmails = emails.filter(e => isArchived(e.labels));
    expect(archivedEmails.map(e => e.id)).toEqual(["3", "4", "5"]);
  });

  it("calculates unread restored count correctly for event dispatching", () => {
    const emails = [
      { id: "1", labels: ["UNREAD"] },
      { id: "2", labels: [] },
      { id: "3", labels: ["UNREAD", "SENT"] },
    ];
    const idsToRestore = ["1", "2"];
    const restoredUnreadCount = emails.filter(
      (e) => idsToRestore.includes(e.id) && e.labels?.map((l: string) => l.toUpperCase()).includes("UNREAD")
    ).length;

    expect(restoredUnreadCount).toBe(1);
  });
});
