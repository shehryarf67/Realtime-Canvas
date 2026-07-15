"use client";

import type { Tool, Shape, BoxShape, LineShape, TriangleShape, PenShape, Point, Note, TextBox } from "@/types/shape";
import { Rnd } from "react-rnd";
import { useEffect, useRef, useState, useCallback } from "react";
import { useSocket } from "@/contexts/SocketContext";
import { useAuth } from "@/contexts/AuthContext";
import type { CanvasMessage, CanvasState } from "@/types/shape";

type HistoryControls = {
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
};

export type PresentUser = {
    userId: string;
    name: string;
};

type CanvasEditorProps = {
    roomId: string;
    selectedTool: Tool | null;
    selectedColour: string;
    onHistoryChange?: (history: HistoryControls) => void;
    onPresenceChange?: (users: PresentUser[]) => void;
    onBoardDeleted?: () => void;
};

type HistoryEntry = {
    do: CanvasMessage | CanvasMessage[];
    undo: CanvasMessage | CanvasMessage[];
};

function upsert<T extends { id: string | number }>(list: T[], item: T): T[] {
    return list.some((el) => el.id === item.id)
        ? list.map((el) => (el.id === item.id ? item : el))
        : [...list, item];
}

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

// Bounding box for any selectable item — used by the marquee-select
// intersection test. Squares, circles, notes, and text boxes all share the
// same x/y/width/height shape, so one fallback branch covers all three.
function getBounds(item: Shape | Note | TextBox): Bounds {
    if ("points" in item) { // For pen strokes
        const xs = item.points.map((p) => p.x);
        const ys = item.points.map((p) => p.y);
        return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    }
    if ("x1" in item) { // For lines
        return {
            minX: Math.min(item.x1, item.x2),
            minY: Math.min(item.y1, item.y2),
            maxX: Math.max(item.x1, item.x2),
            maxY: Math.max(item.y1, item.y2),
        };
    }
    if ("p1" in item) { // For triangles
        const xs = [item.p1.x, item.p2.x, item.p3.x];
        const ys = [item.p1.y, item.p2.y, item.p3.y];
        return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    }
    return { // Normal shapes (Squares, Circles, Notes)
        minX: item.x,
        minY: item.y,
        maxX: item.x + item.width,
        maxY: item.y + item.height,
    };
}

// Returns a copy of any selectable item shifted by (dx, dy) — the shared
// math used to move an entire multi-selection together, regardless of
// which of these four geometry shapes it happens to be.
function shiftItemByDelta(item: Shape | Note | TextBox, dx: number, dy: number): Shape | Note | TextBox {
    if ("points" in item) { // For pen strokes
        return { ...item, points: item.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    }
    if ("x1" in item) { // For lines
        return { ...item, x1: item.x1 + dx, y1: item.y1 + dy, x2: item.x2 + dx, y2: item.y2 + dy };
    }
    if ("p1" in item) { // For triangles
        return {
            ...item,
            p1: { x: item.p1.x + dx, y: item.p1.y + dy },
            p2: { x: item.p2.x + dx, y: item.p2.y + dy },
            p3: { x: item.p3.x + dx, y: item.p3.y + dy },
        };
    }
    return { ...item, x: item.x + dx, y: item.y + dy }; // Normal shapes (Squares, Circles, Notes)
}

// One entry in a group-drag snapshot — tagged with which state array it
// belongs to, since shapes/notes/texts are stored (and set) separately.
type GroupDragEntry =
    | { kind: "shape"; original: Shape }
    | { kind: "note"; original: Note }
    | { kind: "text"; original: TextBox };




const ERASER_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='5' fill='white' stroke='black' stroke-width='2'/%3E%3C/svg%3E") 8 8, auto`;

// Every board lives in one fixed logical coordinate space, scaled to fit the
// viewer's screen. Shapes are stored in these logical pixels, so all users see
// the same layout regardless of window size.
export const CANVAS_WIDTH = 1600;
export const CANVAS_HEIGHT = 900;

const TEXT_COLOUR = "#000000";
const NOTE_COLOUR = "#fff9b1";

const CURSOR_COLOURS = ["#14b8a6", "#8b5cf6", "#3b82f6", "#f43f5e", "#f59e0b"];

export function getCursorColour(userId: string): string {
    const sum = userId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return CURSOR_COLOURS[sum % CURSOR_COLOURS.length];
}

export default function CanvasEditor({ roomId, selectedTool, selectedColour, onHistoryChange, onPresenceChange, onBoardDeleted }: CanvasEditorProps) {
    const [shapes, setShapes] = useState<Shape[]>([]);
    const [isDrawing, setIsDrawing] = useState(false);
    const canvasRef = useRef<HTMLDivElement | null>(null);
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const [scale, setScale] = useState(1);
    const drawingId = useRef<string | null>(null);
    const startPoint = useRef<{ x: number; y: number } | null>(null);
    const lineDrag = useRef<{
        id: string;
        pointerStart: { x: number; y: number };
        lineStart: Pick<LineShape, "x1" | "y1" | "x2" | "y2">;
    } | null>(null);
    const triangleDrag = useRef<{
        id: string;
        pointerStart: Point;
        triangleStart: Pick<TriangleShape, "p1" | "p2" | "p3">;
    } | null>(null);
    const triangleVertexDrag = useRef<{
        id: string;
        vertex: "p1" | "p2" | "p3";
        vertexStart: Point;
    } | null>(null);
    const penDrag = useRef<{
        id: string;
        pointerStart: { x: number; y: number };
        pointsStart: Point[];
    } | null>(null);
    // Snapshot of every item in a multi-selection at the moment a group drag
    // starts. dx/dy computed from pointerStart get applied to every entry's
    // original geometry via shiftItemByDelta, regardless of which one you
    // actually clicked to start the drag.
    const groupDrag = useRef<{
        pointerStart: Point;
        items: GroupDragEntry[];
    } | null>(null);
    const shapesRef = useRef<Shape[]>([]);
    const lastEmitTimeRef = useRef<number>(0); // Tells when the cursor was last emitted to the server. This is used to throttle the cursor move events.
    const emitInterval = 30; // milliseconds
    const [notes, setNotes] = useState<Note[]>([]);
    const [texts, setTexts] = useState<TextBox[]>([]);
    const [isDraggingItem, setIsDraggingItem] = useState(false);
    const [selectedTriangleId, setSelectedTriangleId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
    const marqueeStart = useRef<Point | null>(null);
    const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const { socket } = useSocket();
    const auth = useAuth();
    const [userMap, setUserMap] = useState<Map<string, { x: number; y: number; name: string }>>(new Map());
    const [presentUsers, setPresentUsers] = useState<Map<string, string>>(new Map());
    const [past, setPast] = useState<HistoryEntry[]>([]);
    const [future, setFuture] = useState<HistoryEntry[]>([]);
    const isDeletedRef = useRef(false);

    const broadcast = useCallback(
        (message: CanvasMessage) => {
            if (isDeletedRef.current) return;
            socket?.emit("shape-message", { roomId, message });
        },
        [roomId, socket]
    )

    function pushHistory(doMessage: CanvasMessage | CanvasMessage[], undoMessage: CanvasMessage | CanvasMessage[]) {
        setPast((prev) => [...prev, { do: doMessage, undo: undoMessage }]);
        setFuture([]); // Clear future on new action which invalidates redo history
    }

    const applyMessage = useCallback((message: CanvasMessage) => {
        switch (message.kind) {
            case "shape":
                message.action === "delete"
                    ? setShapes((prev) => prev.filter((s) => s.id !== message.id))
                    : setShapes((prev) => upsert(prev, message.payload));
                break;
            case "note":
                message.action === "delete"
                    ? setNotes((prev) => prev.filter((s) => s.id !== message.id))
                    : setNotes((prev) => upsert(prev, message.payload));
                break;
            case "text":
                message.action === "delete"
                    ? setTexts((prev) => prev.filter((s) => s.id !== message.id))
                    : setTexts((prev) => upsert(prev, message.payload));
                break;
        }
    }, []);

    const undo = useCallback(() => {
        if (past.length === 0) return;
        const lastAction = past[past.length - 1];
        // Check if the items selected are single or multiple, and apply the undo messages accordingly
        // Same for Redo
        const messages = Array.isArray(lastAction.undo) ? lastAction.undo : [lastAction.undo];
        messages.forEach((m) => {
            applyMessage(m);
            broadcast(m);
        });
        setPast((prev) => prev.slice(0, -1));
        setFuture((prev) => [...prev, lastAction]);
    }, [past, future]);

    const redo = useCallback(() => {
        if (future.length === 0) return;
        const nextAction = future[future.length - 1];
        const messages = Array.isArray(nextAction.do) ? nextAction.do : [nextAction.do];
        messages.forEach((m) => {
            applyMessage(m);
            broadcast(m);
        });
        setFuture((prev) => prev.slice(0, -1));
        setPast((prev) => [...prev, nextAction]);
    }, [future, past]);

    useEffect(() => {
        onHistoryChange?.({
            undo,
            redo,
            canUndo: past.length > 0,
            canRedo: future.length > 0,
        });
    }, [undo, redo, past.length, future.length, onHistoryChange]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (document.activeElement?.tagName === "TEXTAREA") return; // Don't trigger undo/redo when typing in a textarea
            if (e.ctrlKey && e.key === "z") {
                e.preventDefault();
                undo();
            } else if (e.ctrlKey && e.key === "y") {
                e.preventDefault();
                redo();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [undo, redo]);

    useEffect(() => {
        shapesRef.current = shapes;
    }, [shapes]);

    // Keep the canvas scaled to whatever width its container currently has.
    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        const observer = new ResizeObserver((entries) => {
            const width = entries[0].contentRect.width;
            if (width > 0) setScale(width / CANVAS_WIDTH);
        });
        observer.observe(wrapper);

        return () => observer.disconnect();
    }, []);


    // Joining room effect. Checking if socket connected or not. 
    useEffect(() => {
        if (!socket) return;

        const joinRoom = () => socket.emit("join-room", roomId);

        if (socket.connected) joinRoom();
        socket.on("connect", joinRoom);

        return () => {
            socket.off("connect", joinRoom);
        }
    }, [socket, roomId]);

    useEffect(() => {
        if (!socket) return;

        const handleMessage = (message: CanvasMessage) => {
            applyMessage(message);
        };

        socket.on("shape-message", handleMessage);
        return () => {
            socket.off("shape-message", handleMessage);
        };
    }, [socket]);

    useEffect(() => {
        if (!socket) return;

        // We used the reduce function to handle the edge case where the user enters 
        // the room the split second a change is made, so that all changes are visible
        const handleState = (state: CanvasState) => {
            setShapes((prev) => state.shapes.reduce((acc, shape) => upsert(acc, shape), prev));
            setNotes((prev) => state.notes.reduce((acc, note) => upsert(acc, note), prev));
            setTexts((prev) => state.texts.reduce((acc, text) => upsert(acc, text), prev));
        };

        socket.on("canvas-state", handleState);
        return () => {
            socket.off("canvas-state", handleState);
        };
    }, [socket]);

    useEffect(() => {
        if (!socket) return;

        const handleCursorMove = (data: { userId: string; x: number; y: number; name: string }) => {
            setUserMap((prev) => new Map(prev.set(data.userId, { x: data.x, y: data.y, name: data.name })));
        };

        const handleCursorLeave = (data: { userId: string }) => {
            setUserMap((prev) => {
                const newUserMap = new Map(prev);
                newUserMap.delete(data.userId);
                return newUserMap;
            });
        };

        socket.on("cursor-move", handleCursorMove);
        socket.on("cursor-leave", handleCursorLeave);

        return () => {
            socket.off("cursor-move", handleCursorMove);
            socket.off("cursor-leave", handleCursorLeave);
        };
    }, [socket]);

    useEffect(() => {
        if (!socket) return;

        const handlePresenceState = (users: PresentUser[]) => {
            setPresentUsers(new Map(users.map((u) => [u.userId, u.name])));
        };

        const handleUserJoined = (user: PresentUser) => {
            setPresentUsers((prev) => new Map(prev).set(user.userId, user.name));
        };

        const handleUserLeft = ({ userId }: { userId: string }) => {
            setPresentUsers((prev) => {
                const next = new Map(prev);
                next.delete(userId);
                return next;
            });
        };

        socket.on("presence-state", handlePresenceState);
        socket.on("user-joined", handleUserJoined);
        socket.on("user-left", handleUserLeft);

        return () => {
            socket.off("presence-state", handlePresenceState);
            socket.off("user-joined", handleUserJoined);
            socket.off("user-left", handleUserLeft);
        };
    }, [socket]);

    useEffect(() => {
        onPresenceChange?.(
            Array.from(presentUsers.entries()).map(([userId, name]) => ({ userId, name }))
        );
    }, [presentUsers, onPresenceChange]);

    useEffect(() => {
        if (!socket) return;

        const handleBoardDeleted = () => {
            isDeletedRef.current = true;
            onBoardDeleted?.();
        };

        socket.on("board-deleted", handleBoardDeleted);
        return () => {
            socket.off("board-deleted", handleBoardDeleted);
        };
    }, [socket, onBoardDeleted]);

    function clamp(value: number, min: number, max: number) {
        return Math.max(min, Math.min(value, max));
    }

    function getCanvasPoint(clientX: number, clientY: number) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };

        // rect is post-transform, so divide by scale to get logical coordinates
        const rawX = (clientX - rect.left) / scale;
        const rawY = (clientY - rect.top) / scale;

        return {
            x: clamp(rawX, 0, CANVAS_WIDTH),
            y: clamp(rawY, 0, CANVAS_HEIGHT),
        };
    }

    function deleteShape(id: string) {
        const deleteMessage: CanvasMessage = { kind: "shape", action: "delete", id };
        setShapes((prev) => prev.filter((shape) => shape.id !== id));
        broadcast(deleteMessage);
        pushHistory(deleteMessage, { kind: "shape", action: "add", payload: shapes.find((s) => s.id === id)! });
    }

    function deleteNote(id: number) {
        const deleteMessage: CanvasMessage = { kind: "note", action: "delete", id };
        setNotes((prev) => prev.filter((note) => note.id !== id));
        broadcast(deleteMessage);
        pushHistory(deleteMessage, { kind: "note", action: "add", payload: notes.find((n) => n.id === id)! });
    }

    function deleteText(id: string) {
        const deleteMessage: CanvasMessage = { kind: "text", action: "delete", id };
        setTexts((prev) => prev.filter((text) => text.id !== id));
        broadcast(deleteMessage);
        pushHistory(deleteMessage, { kind: "text", action: "add", payload: texts.find((t) => t.id === id)! });
    }

    function getCanvasCursorStyle(): React.CSSProperties {
        if (isDrawing) return { cursor: "crosshair" };
        if (!selectedTool || selectedTool === "select") return { cursor: "default" };
        if (selectedTool === "eraser") return { cursor: ERASER_CURSOR };

        return { cursor: "crosshair" };
    }

    function getObjectCursorStyle(): React.CSSProperties {
        if (isDrawing) return { cursor: "crosshair" };
        if (selectedTool === "eraser") return { cursor: ERASER_CURSOR };

        return { cursor: "move" };
    }

    function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
        if (e.target !== e.currentTarget) {
            return;
        }
        else {
            setSelectedTriangleId(null);
            (document.activeElement as HTMLElement)?.blur(); // Remove focus from any active textarea when clicking on the canvas
        }
        if (selectedTool === "select") {
            const { x, y } = getCanvasPoint(e.clientX, e.clientY);
            marqueeStart.current = { x, y };
            setMarqueeRect({ x, y, width: 0, height: 0 });
            return;
        }
        if (!selectedTool || selectedTool === "eraser") {
            return;
        }
        if (selectedTool === "text") {
            const { x, y } = getCanvasPoint(e.clientX, e.clientY);
            const newText: TextBox = {
                id: crypto.randomUUID(),
                text: "Text",
                colour: TEXT_COLOUR,
                x,
                y,
                width: 200,
                height: 48,
            };
            setTexts((prev) => [...prev, newText]);
            // We use the new array due to React's immutability
            broadcast({ kind: "text", action: "add", payload: newText });
            pushHistory({ kind: "text", action: "add", payload: newText }, { kind: "text", action: "delete", id: newText.id });

            return;
        }
        if (selectedTool === "note") {
            const { x, y } = getCanvasPoint(e.clientX, e.clientY);
            const newNote: Note = {
                id: Date.now(),
                text: "New note",
                color: NOTE_COLOUR,
                x,
                y,
                width: 200,
                height: 200,
            }
            setNotes((prev) => [...prev, newNote]);
            broadcast({ kind: "note", action: "add", payload: newNote });
            pushHistory({ kind: "note", action: "add", payload: newNote }, { kind: "note", action: "delete", id: newNote.id });
            return;
        }
        if (selectedTool === "pen") {
            const { x, y } = getCanvasPoint(e.clientX, e.clientY);
            const id = crypto.randomUUID();
            const newShape: Shape = { id, type: "pen", points: [{ x, y }], colour: selectedColour };
            setShapes((prev) => [...prev, newShape]);
            drawingId.current = id;
            startPoint.current = { x, y };
            setIsDrawing(true);
            return;
        }
        const { x, y } = getCanvasPoint(e.clientX, e.clientY);
        const id = crypto.randomUUID();

        const newShape: Shape = (
            selectedTool === "line"
                ? { id, type: "line", x1: x, y1: y, x2: x, y2: y, colour: selectedColour }
                : selectedTool === "triangle"
                    ? { id, type: "triangle", p1: { x, y }, p2: { x, y }, p3: { x, y }, colour: selectedColour }
                    : { id, type: selectedTool as any, x, y, width: 0, height: 0, colour: selectedColour }
        ) as Shape;

        setShapes((prev) => [...prev, newShape]);
        drawingId.current = id;
        startPoint.current = { x, y };
        setIsDrawing(true);
    }

    function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
        if (marqueeStart.current) {
            const current = getCanvasPoint(e.clientX, e.clientY);
            const start = marqueeStart.current;
            setMarqueeRect({
                x: Math.min(start.x, current.x),
                y: Math.min(start.y, current.y),
                width: Math.abs(current.x - start.x),
                height: Math.abs(current.y - start.y),
            });
            return;
        }

        if (groupDrag.current) {
            const current = getCanvasPoint(e.clientX, e.clientY);
            const { pointerStart, items } = groupDrag.current;
            const dx = current.x - pointerStart.x;
            const dy = current.y - pointerStart.y;

            const shiftedShapes = new Map<string | number, Shape>();
            const shiftedNotes = new Map<string | number, Note>();
            const shiftedTexts = new Map<string | number, TextBox>();

            items.forEach((entry) => {
                const shifted = shiftItemByDelta(entry.original, dx, dy);
                if (entry.kind === "shape") shiftedShapes.set(entry.original.id, shifted as Shape);
                else if (entry.kind === "note") shiftedNotes.set(entry.original.id, shifted as Note);
                else shiftedTexts.set(entry.original.id, shifted as TextBox);
            });

            if (shiftedShapes.size > 0) {
                setShapes((prev) => prev.map((s) => shiftedShapes.get(s.id) ?? s));
            }
            if (shiftedNotes.size > 0) {
                setNotes((prev) => prev.map((n) => shiftedNotes.get(n.id) ?? n));
            }
            if (shiftedTexts.size > 0) {
                setTexts((prev) => prev.map((t) => shiftedTexts.get(t.id) ?? t));
            }
            return;
        }

        if (triangleVertexDrag.current) {
            const current = getCanvasPoint(e.clientX, e.clientY);
            const { id, vertex } = triangleVertexDrag.current;

            setShapes((prev) =>
                prev.map((s) =>
                    s.id === id && s.type === "triangle"
                        ? { ...s, [vertex]: current }
                        : s 
                )
            );
            return;
        }

        if (triangleDrag.current) {
            const current = getCanvasPoint(e.clientX, e.clientY);
            const { id, pointerStart, triangleStart } = triangleDrag.current;
            const points = [triangleStart.p1, triangleStart.p2, triangleStart.p3];
            const minX = Math.min(...points.map((point) => point.x));
            const maxX = Math.max(...points.map((point) => point.x));
            const minY = Math.min(...points.map((point) => point.y));
            const maxY = Math.max(...points.map((point) => point.y));
            const dx = clamp(current.x - pointerStart.x, -minX, CANVAS_WIDTH - maxX);
            const dy = clamp(current.y - pointerStart.y, -minY, CANVAS_HEIGHT - maxY);

            setShapes((prev) =>
                prev.map((s) =>
                    s.id === id && s.type === "triangle"
                        ? {
                            ...s,
                            p1: { x: triangleStart.p1.x + dx, y: triangleStart.p1.y + dy },
                            p2: { x: triangleStart.p2.x + dx, y: triangleStart.p2.y + dy },
                            p3: { x: triangleStart.p3.x + dx, y: triangleStart.p3.y + dy },
                        }
                        : s
                )
            );
            return;
        }

        if (lineDrag.current) {
            const current = getCanvasPoint(e.clientX, e.clientY);
            const { id, pointerStart, lineStart } = lineDrag.current;
            const minX = Math.min(lineStart.x1, lineStart.x2);
            const maxX = Math.max(lineStart.x1, lineStart.x2);
            const minY = Math.min(lineStart.y1, lineStart.y2);
            const maxY = Math.max(lineStart.y1, lineStart.y2);
            const dx = clamp(current.x - pointerStart.x, -minX, CANVAS_WIDTH - maxX);
            const dy = clamp(current.y - pointerStart.y, -minY, CANVAS_HEIGHT - maxY);

            setShapes((prev) =>
                prev.map((s) =>
                    s.id === id && s.type === "line"
                        ? {
                            ...s,
                            x1: lineStart.x1 + dx,
                            y1: lineStart.y1 + dy,
                            x2: lineStart.x2 + dx,
                            y2: lineStart.y2 + dy,
                        }
                        : s
                )
            );
            return;
        }
        if (penDrag.current) {
            const current = getCanvasPoint(e.clientX, e.clientY);
            const { id, pointerStart, pointsStart } = penDrag.current;
            const minX = Math.min(...pointsStart.map((p) => p.x));
            const maxX = Math.max(...pointsStart.map((p) => p.x));
            const minY = Math.min(...pointsStart.map((p) => p.y));
            const maxY = Math.max(...pointsStart.map((p) => p.y));
            const dx = clamp(current.x - pointerStart.x, -minX, CANVAS_WIDTH - maxX);
            const dy = clamp(current.y - pointerStart.y, -minY, CANVAS_HEIGHT - maxY);

            setShapes((prev) =>
                prev.map((s) =>
                    s.id === id && s.type === "pen"
                        ? { ...s, points: pointsStart.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
                        : s
                )
            );
            return;
        }
        const now = Date.now();
        if (now - lastEmitTimeRef.current > emitInterval) {
            const { x, y } = getCanvasPoint(e.clientX, e.clientY);
            socket?.emit("cursor-move", { roomId, x, y, name: auth?.user?.name ?? "Anonymous" });
            lastEmitTimeRef.current = now;
        }

        if (!drawingId.current || !startPoint.current) return;
        const { x: currentX, y: currentY } = getCanvasPoint(e.clientX, e.clientY);
        const start = startPoint.current;
        setShapes((prev) =>
            prev.map((s): Shape => {
                if (s.id !== drawingId.current) return s;

                if (s.type === "line") {
                    return { ...s, x2: currentX, y2: currentY } as Shape;
                }

                if (s.type === "triangle") {
                    const left = Math.min(start.x, currentX);
                    const right = Math.max(start.x, currentX);
                    const top = Math.min(start.y, currentY);
                    const bottom = Math.max(start.y, currentY);

                    return {
                        ...s,
                        p1: { x: left + (right - left) / 2, y: top },
                        p2: { x: left, y: bottom },
                        p3: { x: right, y: bottom },
                    } as Shape;
                }
                
                if (s.type === "pen") {
                    return { ...s, points: [...s.points, { x: currentX, y: currentY }] } as Shape;
                }

                return {
                    ...s,
                    x: Math.min(start.x, currentX),
                    y: Math.min(start.y, currentY),
                    width: Math.abs(currentX - start.x),
                    height: Math.abs(currentY - start.y),
                } as Shape;
            })
        );
    }

    function handlePointerUp() {
        if (marqueeStart.current) {
            const rect = marqueeRect;
            marqueeStart.current = null;
            setMarqueeRect(null);

            if (rect) {
                const marqueeMaxX = rect.x + rect.width;
                const marqueeMaxY = rect.y + rect.height;
                const matched = new Set<string | number>();

                const checkIntersect = (item: Shape | Note | TextBox) => {
                    const b = getBounds(item);
                    if (b.maxX >= rect.x && b.minX <= marqueeMaxX && b.maxY >= rect.y && b.minY <= marqueeMaxY) {
                        matched.add(item.id);
                    }
                };

                shapesRef.current.forEach(checkIntersect);
                notes.forEach(checkIntersect);
                texts.forEach(checkIntersect);

                setSelectedIds(matched);
            }
            return;
        }

        if (groupDrag.current) {
            const { items } = groupDrag.current;
            const doMessages: CanvasMessage[] = [];
            const undoMessages: CanvasMessage[] = [];

            items.forEach((entry) => {
                if (entry.kind === "shape") {
                    const current = shapesRef.current.find((s) => s.id === entry.original.id);
                    if (!current) return;
                    doMessages.push({ kind: "shape", action: "update", payload: current });
                    undoMessages.push({ kind: "shape", action: "update", payload: entry.original });
                } else if (entry.kind === "note") {
                    const current = notes.find((n) => n.id === entry.original.id);
                    if (!current) return;
                    doMessages.push({ kind: "note", action: "update", payload: current });
                    undoMessages.push({ kind: "note", action: "update", payload: entry.original });
                } else {
                    const current = texts.find((t) => t.id === entry.original.id);
                    if (!current) return;
                    doMessages.push({ kind: "text", action: "update", payload: current });
                    undoMessages.push({ kind: "text", action: "update", payload: entry.original });
                }
            });

            doMessages.forEach((m) => broadcast(m));
            pushHistory(doMessages, undoMessages);

            groupDrag.current = null;
            return;
        }

        // TODO: broadcast the finished shape (add or update)
        const wasDrawing = drawingId.current !== null;
        const moveId =
            drawingId.current ??
            lineDrag.current?.id ??
            triangleDrag.current?.id ??
            triangleVertexDrag.current?.id ??
            penDrag.current?.id ??
            null;

        if (moveId) {
            const shape = shapesRef.current.find((s) => s.id === moveId);
            if (shape) {
                const doMessage: CanvasMessage = {
                    kind: "shape",
                    action: wasDrawing ? "add" : "update",
                    payload: shape,
                };
                broadcast(doMessage);
                if (wasDrawing) {
                    pushHistory(doMessage, { kind: "shape", action: "delete", id: shape.id });
                }
                else if (lineDrag.current) {
                    const restoredShape = { ...shape, ...lineDrag.current.lineStart };
                    pushHistory(doMessage, { kind: "shape", action: "update", payload: restoredShape });
                }
                else if (triangleDrag.current) {
                    const restoredShape = { ...shape, ...triangleDrag.current.triangleStart };
                    pushHistory(doMessage, { kind: "shape", action: "update", payload: restoredShape });
                }
                else if (triangleVertexDrag.current) {
                    const restoredShape = { ...shape, [triangleVertexDrag.current.vertex]: triangleVertexDrag.current.vertexStart };
                    pushHistory(doMessage, { kind: "shape", action: "update", payload: restoredShape });
                }
                else if (penDrag.current) {
                    const restoredShape = { ...shape, points: penDrag.current.pointsStart };
                    pushHistory(doMessage, { kind: "shape", action: "update", payload: restoredShape });
                }
            }
        }

        drawingId.current = null;
        startPoint.current = null;
        lineDrag.current = null;
        triangleDrag.current = null;
        triangleVertexDrag.current = null;
        penDrag.current = null;
        setIsDrawing(false);
    }

    // Plain click replaces the selection with just this id — unless it's
    // already part of the current multi-selection, in which case we leave
    // the selection untouched, so a plain click-and-drag on one of several
    // already-selected shapes moves the whole group (standard convention).
    // Ctrl/Shift+click always toggles this id in/out of the selection.
    function handleShapeSelect(e: { ctrlKey: boolean; shiftKey: boolean }, id: string | number) {
        if (e.ctrlKey || e.shiftKey) {
            setSelectedIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
            });
        } else if (!selectedIds.has(id)) {
            setSelectedIds(new Set([id]));
        }
    }

    // Used to disable react-rnd's own built-in dragging for a shape that's
    // part of a multi-selection, so the canvas-level groupDrag mechanism
    // (shared with lines/triangles/pen) handles its movement instead —
    // otherwise Rnd's internal drag and our own would fight over position.
    function isGroupDragEligible(id: string | number): boolean {
        return selectedTool === "select" && selectedIds.size > 1 && selectedIds.has(id);
    }

    // If this id is part of a multi-selection, snapshot every selected
    // item's current geometry and start a group drag; returns true so the
    // caller can skip setting up its own individual drag ref. Returns false
    // (and does nothing) for a lone selection or no selection at all.
    function startGroupDrag(e: { clientX: number; clientY: number }, id: string | number): boolean {
        if (!(selectedIds.size > 1 && selectedIds.has(id))) return false;

        const items: GroupDragEntry[] = [];
        shapesRef.current.forEach((s) => {
            if (selectedIds.has(s.id)) items.push({ kind: "shape", original: s });
        });
        notes.forEach((n) => {
            if (selectedIds.has(n.id)) items.push({ kind: "note", original: n });
        });
        texts.forEach((t) => {
            if (selectedIds.has(t.id)) items.push({ kind: "text", original: t });
        });

        groupDrag.current = { pointerStart: getCanvasPoint(e.clientX, e.clientY), items };
        return true;
    }

    function handleLinePointerDown(e: React.PointerEvent<SVGLineElement>, shape: LineShape) {
        e.stopPropagation();
        if (selectedTool === "eraser") {
            deleteShape(shape.id);
            return;
        }
        if (selectedTool === "select") {
            handleShapeSelect(e, shape.id);
        }
        if (startGroupDrag(e, shape.id)) return;

        lineDrag.current = {
            id: shape.id,
            pointerStart: getCanvasPoint(e.clientX, e.clientY),
            lineStart: {
                x1: shape.x1,
                y1: shape.y1,
                x2: shape.x2,
                y2: shape.y2,
            },
        };
    }

    function handleTrianglePointerDown(e: React.PointerEvent<SVGPolygonElement>, shape: TriangleShape) {
        e.stopPropagation();
        if (selectedTool === "eraser") {
            deleteShape(shape.id);
            return;
        }
        if (selectedTool === "select") {
            handleShapeSelect(e, shape.id);
        }
        if (startGroupDrag(e, shape.id)) return;

        triangleDrag.current = {
            id: shape.id,
            pointerStart: getCanvasPoint(e.clientX, e.clientY),
            triangleStart: {
                p1: shape.p1,
                p2: shape.p2,
                p3: shape.p3,
            },
        };
        setSelectedTriangleId(shape.id);
    }

    function handlePenPointerDown(e: React.PointerEvent<SVGPathElement>, shape: PenShape) {
        e.stopPropagation();
        if (selectedTool === "eraser") {
            deleteShape(shape.id);
            return;
        }
        if (selectedTool === "select") {
            handleShapeSelect(e, shape.id);
        }
        if (startGroupDrag(e, shape.id)) return;

        penDrag.current = {
            id: shape.id,
            pointerStart: getCanvasPoint(e.clientX, e.clientY),
            pointsStart: shape.points,
        };
    }

    function handleTriangleVertexPointerDown(
        e: React.PointerEvent<SVGCircleElement>,
        shape: TriangleShape,
        vertex: "p1" | "p2" | "p3"
    ) {
        e.stopPropagation();
        triangleVertexDrag.current = {
            id: shape.id,
            vertex,
            vertexStart: shape[vertex],
        };
    }

    function renderBoxShape(shape: BoxShape) {
        switch (shape.type) {
            case "square":
                return <div className="h-full w-full border-2 border-black" style={{ backgroundColor: shape.colour }} />;
            case "circle":
                return <div className="h-full w-full rounded-full border-2 border-black" style={{ backgroundColor: shape.colour }} />;
            default: {
                const _exhaustive: never = shape;
                return _exhaustive;
            }
        }
    }

    // Dashed selection outline for shapes with no Rnd wrapper box to put a
    // ring on (lines/triangles/pen) — box shapes/notes/texts get a ring via
    // their own wrapper div's className instead.
    function renderSelectionOutline(id: string | number, bounds: Bounds) {
        if (!selectedIds.has(id)) return null;
        const PADDING = 6;
        return (
            <rect
                x={bounds.minX - PADDING}
                y={bounds.minY - PADDING}
                width={bounds.maxX - bounds.minX + PADDING * 2}
                height={bounds.maxY - bounds.minY + PADDING * 2}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
            />
        );
    }

    function renderTriangleShape(shape: TriangleShape) {
        const points = `${shape.p1.x},${shape.p1.y} ${shape.p2.x},${shape.p2.y} ${shape.p3.x},${shape.p3.y}`;

        return (
            <svg key={shape.id} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                <polygon
                    points={points}
                    fill={shape.colour}
                    stroke="black"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                    className="pointer-events-auto"
                    style={getObjectCursorStyle()}
                    onPointerDown={(e) => handleTrianglePointerDown(e, shape)}
                />
                {renderSelectionOutline(shape.id, getBounds(shape))}
                {selectedTriangleId === shape.id && (
                    <>
                        <circle
                            cx={shape.p1.x}
                            cy={shape.p1.y}
                            r="5"
                            fill="white"
                            stroke="black"
                            strokeWidth="2"
                            className="pointer-events-auto"
                            style={getObjectCursorStyle()}
                            onPointerDown={(e) => handleTriangleVertexPointerDown(e, shape, "p1")}
                        />
                        <circle
                            cx={shape.p2.x}
                            cy={shape.p2.y}
                            r="5"
                            fill="white"
                            stroke="black"
                            strokeWidth="2"
                            className="pointer-events-auto"
                            style={getObjectCursorStyle()}
                            onPointerDown={(e) => handleTriangleVertexPointerDown(e, shape, "p2")}
                        />
                        <circle
                            cx={shape.p3.x}
                            cy={shape.p3.y}
                            r="5"
                            fill="white"
                            stroke="black"
                            strokeWidth="2"
                            className="pointer-events-auto"
                            style={getObjectCursorStyle()}
                            onPointerDown={(e) => handleTriangleVertexPointerDown(e, shape, "p3")}
                        />
                    </>
                )}
            </svg>
        );
    }

    function renderLineShape(shape: LineShape) {
        return (
            <svg key={shape.id} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                <line
                    x1={shape.x1}
                    y1={shape.y1}
                    x2={shape.x2}
                    y2={shape.y2}
                    stroke={shape.colour}
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                    className="pointer-events-auto"
                    style={getObjectCursorStyle()}
                    onPointerDown={(e) => handleLinePointerDown(e, shape)}
                />
                {renderSelectionOutline(shape.id, getBounds(shape))}
            </svg>
        );
    }

    function renderNote(note: Note) {
        return (
            <textarea
                value={note.text}
                onPointerDown={(e) => {
                    e.stopPropagation();
                    if (selectedTool === "eraser") {
                        deleteNote(note.id);
                    }
                }}
                onChange={(e) => {
                    const value = e.target.value;
                    const updated = { ...note, text: value };

                    setNotes((prev) =>
                        prev.map((n) =>
                            n.id === note.id ? updated : n
                        )
                    );
                    broadcast({ kind: "note", action: "update", payload: updated });
                }}
                className="h-full w-full cursor-move resize-none p-2 text-sm outline-none focus:cursor-text"
                style={{
                    backgroundColor: note.color,
                    ...(selectedTool === "eraser" ? getObjectCursorStyle() : {}),
                    ...(isDraggingItem ? { cursor: "move" } : {}),
                }}
            />
        )
    }

    function renderText(textBox: TextBox) {
        return (
            <textarea
                value={textBox.text}
                onPointerDown={(e) => {
                    e.stopPropagation();
                    if (selectedTool === "eraser") {
                        deleteText(textBox.id);
                    }
                }}
                onChange={(e) => {
                    const value = e.target.value;
                    const updated = { ...textBox, text: value };

                    setTexts((prev) =>
                        prev.map((text) =>
                            text.id === textBox.id ? updated : text
                        )
                    );
                    broadcast({ kind: "text", action: "update", payload: updated });
                }}
                className="h-full w-full cursor-move resize-none bg-transparent p-1 text-base outline-none focus:cursor-text"
                style={{
                    color: textBox.colour,
                    ...(selectedTool === "eraser" ? getObjectCursorStyle() : {}),
                    ...(isDraggingItem ? { cursor: "move" } : {}),
                }}
            />
        );
    }

    function renderPenShape(shape: PenShape) {
        return (
            <svg key={shape.id} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                <polyline
                    points={shape.points.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={shape.colour}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    className="pointer-events-auto"
                    style={getObjectCursorStyle()}
                    onPointerDown={(e) => handlePenPointerDown(e, shape)}
                />
                {renderSelectionOutline(shape.id, getBounds(shape))}
            </svg>
        )
    }

    return (
        <div
            ref={wrapperRef}
            className="mt-4 w-full overflow-hidden border"
            style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
        >
        <div
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="relative origin-top-left"
            style={{
                width: CANVAS_WIDTH,
                height: CANVAS_HEIGHT,
                transform: `scale(${scale})`,
                ...getCanvasCursorStyle(),
            }}
        >
            {shapes.map((shape) => {
                if (shape.type === "line") {
                    return renderLineShape(shape);
                }
                if (shape.type === "triangle") {
                    return renderTriangleShape(shape);
                }
                if (shape.type === "pen") {
                    return renderPenShape(shape);
                }

                // Only render draggable/resizable boxes for shapes that have width/height
                if (!("width" in shape && "height" in shape)) {
                    return null;
                }

                return (
                    <Rnd
                        key={shape.id}
                        size={{ width: shape.width, height: shape.height }}
                        position={{ x: shape.x, y: shape.y }}
                        bounds="parent"
                        scale={scale}
                        disableDragging={isDrawing || isGroupDragEligible(shape.id)}
                        enableResizing={!isDrawing}
                        onPointerDown={(e: React.PointerEvent<HTMLElement>) => {
                            if (selectedTool === "eraser") {
                                e.stopPropagation();
                                deleteShape(shape.id);
                            } else if (selectedTool === "select") {
                                e.stopPropagation();
                                handleShapeSelect(e, shape.id);
                                startGroupDrag(e, shape.id);
                            }
                        }}
                        onDragStop={(e, data) => {
                            const updated = { ...shape, x: data.x, y: data.y };
                            setShapes((prev) =>
                                prev.map((s) => (s.id === shape.id ? updated : s))
                            );
                            const doMessage: CanvasMessage = { kind: "shape", action: "update", payload: updated };
                            broadcast(doMessage);
                            pushHistory(doMessage, { kind: "shape", action: "update", payload: shape });
                        }}
                        onResizeStop={(e, direction, ref, delta, position) => {
                            const updated = {
                                ...shape,
                                width: parseInt(ref.style.width),
                                height: parseInt(ref.style.height),
                                x: position.x,
                                y: position.y,
                            };
                            setShapes((prev) =>
                                prev.map((s) => (s.id === shape.id ? updated : s))
                            );
                            const doMessage: CanvasMessage = { kind: "shape", action: "update", payload: updated };
                            broadcast(doMessage);
                            pushHistory(doMessage, { kind: "shape", action: "update", payload: shape });
                        }}
                    >
                        <div className={`h-full w-full ${selectedIds.has(shape.id) ? "ring-2 ring-blue-500 ring-offset-2" : ""}`} style={getObjectCursorStyle()}>
                            {renderBoxShape(shape)}
                        </div>
                    </Rnd>
                );
            })}
            {notes.map((note) => (
                <Rnd
                    key={note.id}
                    size={{ width: note.width, height: note.height }}
                    position={{ x: note.x, y: note.y }}
                    bounds="parent"
                    scale={scale}
                    disableDragging={isGroupDragEligible(note.id)}
                    onPointerDown={(e: React.PointerEvent<HTMLElement>) => {
                        if (selectedTool === "eraser") {
                            e.stopPropagation();
                            deleteNote(note.id);
                        } else if (selectedTool === "select") {
                            e.stopPropagation();
                            handleShapeSelect(e, note.id);
                            startGroupDrag(e, note.id);
                        }
                    }}
                    onDragStart={() => setIsDraggingItem(true)}
                    onDragStop={(e, data) => {
                        setIsDraggingItem(false);
                        const updated = { ...note, x: data.x, y: data.y };
                        setNotes((prev) =>
                            prev.map((n) => (n.id === note.id ? updated : n))
                        );
                        const doMessage: CanvasMessage = { kind: "note", action: "update", payload: updated };
                        broadcast(doMessage);
                        pushHistory(doMessage, { kind: "note", action: "update", payload: note });
                    }}
                >
                    <div className={`h-full w-full ${selectedIds.has(note.id) ? "ring-2 ring-blue-500 ring-offset-2" : ""}`} style={getObjectCursorStyle()}>
                        {renderNote(note)}
                    </div>
                </Rnd>
            ))}
            {texts.map((textBox) => (
                <Rnd
                    key={textBox.id}
                    size={{ width: textBox.width, height: textBox.height }}
                    position={{ x: textBox.x, y: textBox.y }}
                    bounds="parent"
                    scale={scale}
                    disableDragging={isGroupDragEligible(textBox.id)}
                    onPointerDown={(e: React.PointerEvent<HTMLElement>) => {
                        if (selectedTool === "eraser") {
                            e.stopPropagation();
                            deleteText(textBox.id);
                        } else if (selectedTool === "select") {
                            e.stopPropagation();
                            handleShapeSelect(e, textBox.id);
                            startGroupDrag(e, textBox.id);
                        }
                    }}
                    onDragStart={() => setIsDraggingItem(true)}
                    onDragStop={(e, data) => {
                        setIsDraggingItem(false);
                        const updated = { ...textBox, x: data.x, y: data.y };
                        setTexts((prev) =>
                            prev.map((text) => (text.id === textBox.id ? updated : text))
                        );
                        const doMessage: CanvasMessage = { kind: "text", action: "update", payload: updated };
                        broadcast(doMessage);
                        pushHistory(doMessage, { kind: "text", action: "update", payload: textBox });
                    }}
                    onResizeStop={(e, direction, ref, delta, position) => {
                        const updated = {
                            ...textBox,
                            width: parseInt(ref.style.width),
                            height: parseInt(ref.style.height),
                            x: position.x,
                            y: position.y,
                        };
                        setTexts((prev) =>
                            prev.map((text) => (text.id === textBox.id ? updated : text))
                        );
                        const doMessage: CanvasMessage = { kind: "text", action: "update", payload: updated };
                        broadcast(doMessage);
                        pushHistory(doMessage, { kind: "text", action: "update", payload: textBox });
                    }}
                >
                    <div className={`h-full w-full ${selectedIds.has(textBox.id) ? "ring-2 ring-blue-500 ring-offset-2" : ""}`} style={getObjectCursorStyle()}>
                        {renderText(textBox)}
                    </div>
                </Rnd>
            ))}
            {Array.from(userMap.entries()).map(([userId, cursor]) => {
                const colour = getCursorColour(userId);
                return (
                    <div
                        key={userId}
                        style={{
                            position: "absolute",
                            left: cursor.x,
                            top: cursor.y,
                            pointerEvents: "none",
                        }}
                    >
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            style={{ filter: `drop-shadow(0 0 6px ${colour})` }}
                        >
                            <path
                                d="M1 1 L1 12 L4.2 9 L6.4 14 L8.4 13.1 L6.2 8.2 L11 8 Z"
                                fill={colour}
                            />
                        </svg>
                        <span
                            className="ml-3 inline-block px-2 py-0.5 text-[11px] font-medium text-white"
                            style={{ backgroundColor: colour }}
                        >
                            {cursor.name}
                        </span>
                    </div>
                );
            })}
            {marqueeRect && (
                <div
                    className="absolute border border-blue-500 bg-blue-500/10"
                    style={{
                        left: marqueeRect.x,
                        top: marqueeRect.y,
                        width: marqueeRect.width,
                        height: marqueeRect.height,
                        pointerEvents: "none",
                    }}
                />
            )}
        </div>
        </div>
    )
}
