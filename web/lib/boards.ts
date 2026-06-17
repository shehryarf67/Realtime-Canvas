// TEMP: localStorage-backed. Swap for API/DB when persistence + auth land.
// Keep this interface stable.
//
// All board data access lives in this file only — nothing else should read or
// write board storage directly.

export type Board = {
  id: string;
  name: string;
  createdAt: number;
  lastEditedAt: number;
};

const STORAGE_KEY = "coboard.recentBoards";

export async function addBoard(board: Board): Promise<void> {
  if (typeof window === "undefined") return;
  const existing = readBoards().filter((b) => b.id !== board.id);
  const next = [board, ...existing];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

// Exported now for a future /boards screen; Screen A only calls addBoard.
export async function getRecentBoards(): Promise<Board[]> {
  if (typeof window === "undefined") return [];
  return readBoards().sort((a, b) => b.lastEditedAt - a.lastEditedAt);
}

function readBoards(): Board[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isBoard);
  } catch {
    return [];
  }
}

function isBoard(value: unknown): value is Board {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.createdAt === "number" &&
    typeof v.lastEditedAt === "number"
  );
}
