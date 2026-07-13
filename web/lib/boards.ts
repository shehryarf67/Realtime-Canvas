import type { CanvasState } from "@/types/shape";

export type Board = {
  id: string;
  name: string;
  createdAt: number;
  lastEditedAt: number;
};

type ServerBoard = {
  roomId: string;
  name: string;
  ownerId: string;
  createdAt: number;
  lastEditedAt: number;
};

function toBoard(serverBoard: ServerBoard): Board {
  return {
    id: serverBoard.roomId,
    name: serverBoard.name,
    createdAt: serverBoard.createdAt,
    lastEditedAt: serverBoard.lastEditedAt,
  };
}

export async function addBoard(board: Board): Promise<void> {
  await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/boards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ roomId: board.id, name: board.name }),
  });
}

export async function joinBoard(roomId: string): Promise<void> {
  await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/boards/${encodeURIComponent(roomId)}/join`, {
    method: "POST",
    credentials: "include",
  });
}

export async function getRecentBoards(): Promise<Board[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/boards`, {
    credentials: "include",
  });
  if (!res.ok) return [];

  const serverBoards: ServerBoard[] = await res.json();
  return serverBoards.map(toBoard);
}

export async function getBoard(roomId: string): Promise<Board | null> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SERVER_URL}/boards/${encodeURIComponent(roomId)}`,
    { credentials: "include" }
  );
  if (!res.ok) return null;
  return toBoard(await res.json());
}

export async function renameBoard(roomId: string, name: string): Promise<void> {
  await fetch(
    `${process.env.NEXT_PUBLIC_SERVER_URL}/boards/${encodeURIComponent(roomId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name }),
    }
  );
}

export async function deleteBoard(roomId: string): Promise<void> {
  await fetch(
    `${process.env.NEXT_PUBLIC_SERVER_URL}/boards/${encodeURIComponent(roomId)}`,
    { method: "DELETE", credentials: "include" }
  );
}

export async function getBoardState(roomId: string): Promise<CanvasState | null> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SERVER_URL}/boards/${encodeURIComponent(roomId)}/items`,
    { credentials: "include" }
  );
  if (!res.ok) return null;
  return res.json();
}
