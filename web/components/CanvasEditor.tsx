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

// Padding around a shape's bounding box for both the selection outline and
// the invisible drag hit-area for shapes with no filled interior (lines, pen).
const SELECTION_PADDING = 6;

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
    // In-progress rotation of a single rectangle item. center is the pivot in
    // logical canvas coords; original is the pre-rotation snapshot used to build
    // the undo entry when the gesture ends.
    const rotateDrag = useRef<{
        kind: "shape" | "note" | "text";
        id: string | number;
        center: Point;
        original: Shape | Note | TextBox;
    } | null>(null);
    const shapesRef = useRef<Shape[]>([]);
    const lastEmitTimeRef = useRef<number>(0); // Tells when the cursor was last emitted to the server. This is used to throttle the cursor move events.
    const emitInterval = 30; // milliseconds
    const [notes, setNotes] = useState<Note[]>([]);
    const [texts, setTexts] = useState<TextBox[]>([]);
    const [isDraggingItem, setIsDraggingItem] = useState(false);
    const [selectedTriangleId, setSelectedTriangleId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
    // The note/text currently in text-editing mode (entered via double-click).
    // Everything else keeps its textarea non-interactive so a plain click
    // selects the item (and a canvas drag can't select the text inside it).
    const [editingId, setEditingId] = useState<string | number | null>(null);
    const marqueeStart = useRef<Point | null>(null);
    const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const { socket } = useSocket();
    const auth = useAuth();
    const [userMap, setUserMap] = useState<Map<string, { x: number; y: number; name: string }>>(new Map());
    const [presentUsers, setPresentUsers] = useState<Map<string, string>>(new Map());
    const [past, setPast] = useState<HistoryEntry[]>([]);
    const [future, setFuture] = useState<HistoryEntry[]>([]);
    const isDeletedRef = useRef(false);
    const clipboard = useRef<{ shapes: Shape[]; notes: Note[]; texts: TextBox[] } | null>(null);

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

    // Derived from the actual current data, not a local counter — a local
    // counter would desync across clients, since each browser's own counter
    // starts independently and two users creating shapes around the same
    // time would produce colliding values that mean different things on
    // each screen.
    function getNextZIndex(): number {
        // ?? 0 guards against shapes persisted before zIndex existed (their
        // stored data has no zIndex, so it comes back undefined) — without
        // it, Math.max returns NaN and poisons every new shape's zIndex.
        const allZ = [
            ...shapes.map((s) => s.zIndex ?? 0),
            ...notes.map((n) => n.zIndex ?? 0),
            ...texts.map((t) => t.zIndex ?? 0),
        ];
        return allZ.length > 0 ? Math.max(...allZ) + 1 : 0;
    }

    function copySelection() {
        const selectedShapes = shapes.filter((s) => selectedIds.has(s.id));
        const selectedNotes = notes.filter((n) => selectedIds.has(n.id));
        const selectedTexts = texts.filter((t) => selectedIds.has(t.id));
        clipboard.current = { shapes: selectedShapes, notes: selectedNotes, texts: selectedTexts };
    }

    function pasteClipboard() {
        if (!clipboard.current) return;
        const { shapes: clippedShapes, notes: clippedNotes, texts: clippedTexts } = clipboard.current;
        const PASTE_OFFSET = 20; // Nudge pasted copies so they don't land exactly on the originals

        const doMessages: CanvasMessage[] = [];
        const undoMessages: CanvasMessage[] = [];
        const newSelectedIds = new Set<string | number>();

        // A single base value, incremented locally per item — calling
        // getNextZIndex() again per item would return the same value every
        // time, since state hasn't re-rendered between these calls.
        const zIndexBase = getNextZIndex();
        let zIndexCounter = 0;

        const newShapes: Shape[] = clippedShapes.map((s) => ({
            ...(shiftItemByDelta(s, PASTE_OFFSET, PASTE_OFFSET) as Shape),
            id: crypto.randomUUID(),
            zIndex: zIndexBase + zIndexCounter++,
        }));
        const newNotes: Note[] = clippedNotes.map((n, i) => ({
            ...(shiftItemByDelta(n, PASTE_OFFSET, PASTE_OFFSET) as Note),
            id: Date.now() + i, // +i avoids id collisions when pasting several notes at once
            zIndex: zIndexBase + zIndexCounter++,
        }));
        const newTexts: TextBox[] = clippedTexts.map((t) => ({
            ...(shiftItemByDelta(t, PASTE_OFFSET, PASTE_OFFSET) as TextBox),
            id: crypto.randomUUID(),
            zIndex: zIndexBase + zIndexCounter++,
        }));

        if (newShapes.length > 0) {
            setShapes((prev) => [...prev, ...newShapes]);
            newShapes.forEach((s) => {
                newSelectedIds.add(s.id);
                doMessages.push({ kind: "shape", action: "add", payload: s });
                undoMessages.push({ kind: "shape", action: "delete", id: s.id });
            });
        }
        if (newNotes.length > 0) {
            setNotes((prev) => [...prev, ...newNotes]);
            newNotes.forEach((n) => {
                newSelectedIds.add(n.id);
                doMessages.push({ kind: "note", action: "add", payload: n });
                undoMessages.push({ kind: "note", action: "delete", id: n.id });
            });
        }
        if (newTexts.length > 0) {
            setTexts((prev) => [...prev, ...newTexts]);
            newTexts.forEach((t) => {
                newSelectedIds.add(t.id);
                doMessages.push({ kind: "text", action: "add", payload: t });
                undoMessages.push({ kind: "text", action: "delete", id: t.id });
            });
        }

        if (doMessages.length === 0) return;
        doMessages.forEach((m) => broadcast(m));
        pushHistory(doMessages, undoMessages);
        setSelectedIds(newSelectedIds);
    }

    function deleteSelection() {
        if (selectedIds.size === 0) return;

        const doMessages: CanvasMessage[] = [];
        const undoMessages: CanvasMessage[] = [];

        const shapesToDelete = shapes.filter((s) => selectedIds.has(s.id));
        const notesToDelete = notes.filter((n) => selectedIds.has(n.id));
        const textsToDelete = texts.filter((t) => selectedIds.has(t.id));

        if (shapesToDelete.length > 0) {
            setShapes((prev) => prev.filter((s) => !selectedIds.has(s.id)));
            shapesToDelete.forEach((s) => {
                doMessages.push({ kind: "shape", action: "delete", id: s.id });
                undoMessages.push({ kind: "shape", action: "add", payload: s });
            });
        }
        if (notesToDelete.length > 0) {
            setNotes((prev) => prev.filter((n) => !selectedIds.has(n.id)));
            notesToDelete.forEach((n) => {
                doMessages.push({ kind: "note", action: "delete", id: n.id });
                undoMessages.push({ kind: "note", action: "add", payload: n });
            });
        }
        if (textsToDelete.length > 0) {
            setTexts((prev) => prev.filter((t) => !selectedIds.has(t.id)));
            textsToDelete.forEach((t) => {
                doMessages.push({ kind: "text", action: "delete", id: t.id });
                undoMessages.push({ kind: "text", action: "add", payload: t });
            });
        }

        if (doMessages.length === 0) return;
        doMessages.forEach((m) => broadcast(m));
        pushHistory(doMessages, undoMessages);
        setSelectedIds(new Set());
    }

    // Every shape/note/text combined, sorted by current zIndex — the shared
    // view the four z-order actions below all work from.
    function getAllItemsSorted(): { kind: "shape" | "note" | "text"; id: string | number; zIndex: number }[] {
        return [
            ...shapes.map((s) => ({ kind: "shape" as const, id: s.id, zIndex: s.zIndex ?? 0 })),
            ...notes.map((n) => ({ kind: "note" as const, id: n.id, zIndex: n.zIndex ?? 0 })),
            ...texts.map((t) => ({ kind: "text" as const, id: t.id, zIndex: t.zIndex ?? 0 })),
        ].sort((a, b) => a.zIndex - b.zIndex);
    }

    // Shared by all four z-order actions: looks up each item's current full
    // data, applies the new zIndex, updates state, and batches everything
    // into one broadcast/undo entry — same pattern as paste/delete.
    function applyZIndexUpdates(updates: { kind: "shape" | "note" | "text"; id: string | number; newZIndex: number }[]) {
        if (updates.length === 0) return;

        const doMessages: CanvasMessage[] = [];
        const undoMessages: CanvasMessage[] = [];

        updates.forEach(({ kind, id, newZIndex }) => {
            if (kind === "shape") {
                const current = shapes.find((s) => s.id === id);
                if (!current) return;
                const updated = { ...current, zIndex: newZIndex };
                setShapes((prev) => prev.map((s) => (s.id === id ? updated : s)));
                doMessages.push({ kind: "shape", action: "update", payload: updated });
                undoMessages.push({ kind: "shape", action: "update", payload: current });
            } else if (kind === "note") {
                const current = notes.find((n) => n.id === id);
                if (!current) return;
                const updated = { ...current, zIndex: newZIndex };
                setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
                doMessages.push({ kind: "note", action: "update", payload: updated });
                undoMessages.push({ kind: "note", action: "update", payload: current });
            } else {
                const current = texts.find((t) => t.id === id);
                if (!current) return;
                const updated = { ...current, zIndex: newZIndex };
                setTexts((prev) => prev.map((t) => (t.id === id ? updated : t)));
                doMessages.push({ kind: "text", action: "update", payload: updated });
                undoMessages.push({ kind: "text", action: "update", payload: current });
            }
        });

        if (doMessages.length === 0) return;
        doMessages.forEach((m) => broadcast(m));
        pushHistory(doMessages, undoMessages);
    }

    function bringSelectionToFront() {
        if (selectedIds.size === 0) return;
        const selectedInOrder = getAllItemsSorted().filter((entry) => selectedIds.has(entry.id));
        const base = getNextZIndex();
        applyZIndexUpdates(
            selectedInOrder.map((entry, i) => ({ kind: entry.kind, id: entry.id, newZIndex: base + i }))
        );
    }

    function sendSelectionToBack() {
        if (selectedIds.size === 0) return;
        const all = getAllItemsSorted();
        const selectedInOrder = all.filter((entry) => selectedIds.has(entry.id));
        const minZ = all.length > 0 ? all[0].zIndex : 0;
        const base = minZ - selectedInOrder.length;
        applyZIndexUpdates(
            selectedInOrder.map((entry, i) => ({ kind: entry.kind, id: entry.id, newZIndex: base + i }))
        );
    }

    // Swaps each selected item with its nearest non-selected neighbor one
    // step above/below. Correct for a single selected item or a scattered
    // multi-selection; two adjacent selected items sharing the same nearest
    // neighbor is a known edge case not handled here.
    function bringSelectionForward() {
        if (selectedIds.size === 0) return;
        const all = getAllItemsSorted();
        const updates: { kind: "shape" | "note" | "text"; id: string | number; newZIndex: number }[] = [];

        for (let i = all.length - 1; i >= 0; i--) {
            const entry = all[i];
            if (!selectedIds.has(entry.id)) continue;
            let j = i + 1;
            while (j < all.length && selectedIds.has(all[j].id)) j++;
            if (j < all.length) {
                const neighbor = all[j];
                updates.push({ kind: entry.kind, id: entry.id, newZIndex: neighbor.zIndex });
                updates.push({ kind: neighbor.kind, id: neighbor.id, newZIndex: entry.zIndex });
            }
        }
        applyZIndexUpdates(updates);
    }

    function sendSelectionBackward() {
        if (selectedIds.size === 0) return;
        const all = getAllItemsSorted();
        const updates: { kind: "shape" | "note" | "text"; id: string | number; newZIndex: number }[] = [];

        for (let i = 0; i < all.length; i++) {
            const entry = all[i];
            if (!selectedIds.has(entry.id)) continue;
            let j = i - 1;
            while (j >= 0 && selectedIds.has(all[j].id)) j--;
            if (j >= 0) {
                const neighbor = all[j];
                updates.push({ kind: entry.kind, id: entry.id, newZIndex: neighbor.zIndex });
                updates.push({ kind: neighbor.kind, id: neighbor.id, newZIndex: entry.zIndex });
            }
        }
        applyZIndexUpdates(updates);
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
            } else if (e.ctrlKey && e.key === "v") {
                e.preventDefault();
                pasteClipboard();
            } else if (e.ctrlKey && e.key === "c") {
                e.preventDefault();
                copySelection();
            } else if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                deleteSelection();
            } else if (e.ctrlKey && e.shiftKey && e.code === "BracketRight") {
                e.preventDefault();
                bringSelectionToFront();
            } else if (e.ctrlKey && e.shiftKey && e.code === "BracketLeft") {
                e.preventDefault();
                sendSelectionToBack();
            } else if (e.ctrlKey && e.code === "BracketRight") {
                e.preventDefault();
                bringSelectionForward();
            } else if (e.ctrlKey && e.code === "BracketLeft") {
                e.preventDefault();
                sendSelectionBackward();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [undo, redo, pasteClipboard, copySelection, deleteSelection, bringSelectionToFront, sendSelectionToBack, bringSelectionForward, sendSelectionBackward]);

    useEffect(() => {
        shapesRef.current = shapes;
    }, [shapes]);

    // Focus the textarea that just entered edit mode. Centralised here (rather
    // than in each double-click handler) so it also fires for freshly created
    // notes/texts, whose textarea only exists after the next render.
    useEffect(() => {
        if (editingId == null) return;
        const el = canvasRef.current?.querySelector(
            `textarea[data-item-id="${editingId}"]`
        ) as HTMLTextAreaElement | null;
        el?.focus();
    }, [editingId]);

    // A pointer drag on the canvas (drawing a pen stroke, marquee-selecting)
    // makes the browser start a *document* text selection anchored on the
    // canvas, which then sweeps across the text inside notes/text boxes as you
    // move — the flicker. user-select:none doesn't stop this for form controls,
    // so we cancel the gesture at its source: selectstart. We still allow it
    // when a textarea is genuinely being edited (its own text selection).
    useEffect(() => {
        const el = canvasRef.current;
        if (!el) return;
        const onSelectStart = (e: Event) => {
            if (document.activeElement?.tagName === "TEXTAREA") return;
            e.preventDefault();
        };
        el.addEventListener("selectstart", onSelectStart);
        return () => el.removeEventListener("selectstart", onSelectStart);
    }, []);

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
            setEditingId(null); // Leave text-edit mode when clicking the canvas
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
                zIndex: getNextZIndex(),
            };
            setTexts((prev) => [...prev, newText]);
            // We use the new array due to React's immutability
            broadcast({ kind: "text", action: "add", payload: newText });
            pushHistory({ kind: "text", action: "add", payload: newText }, { kind: "text", action: "delete", id: newText.id });
            setEditingId(newText.id); // Drop straight into editing the new text

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
                zIndex: getNextZIndex(),
            }
            setNotes((prev) => [...prev, newNote]);
            broadcast({ kind: "note", action: "add", payload: newNote });
            pushHistory({ kind: "note", action: "add", payload: newNote }, { kind: "note", action: "delete", id: newNote.id });
            setEditingId(newNote.id); // Drop straight into editing the new note
            return;
        }
        if (selectedTool === "pen") {
            const { x, y } = getCanvasPoint(e.clientX, e.clientY);
            const id = crypto.randomUUID();
            const newShape: Shape = { id, type: "pen", points: [{ x, y }], colour: selectedColour, zIndex: getNextZIndex() };
            setShapes((prev) => [...prev, newShape]);
            drawingId.current = id;
            startPoint.current = { x, y };
            setIsDrawing(true);
            return;
        }
        const { x, y } = getCanvasPoint(e.clientX, e.clientY);
        const id = crypto.randomUUID();

        const nextZIndex = getNextZIndex();
        const newShape: Shape = (
            selectedTool === "line"
                ? { id, type: "line", x1: x, y1: y, x2: x, y2: y, colour: selectedColour, zIndex: nextZIndex }
                : selectedTool === "triangle"
                    ? { id, type: "triangle", p1: { x, y }, p2: { x, y }, p3: { x, y }, colour: selectedColour, zIndex: nextZIndex }
                    : { id, type: selectedTool as any, x, y, width: 0, height: 0, colour: selectedColour, zIndex: nextZIndex }
        ) as Shape;

        setShapes((prev) => [...prev, newShape]);
        drawingId.current = id;
        startPoint.current = { x, y };
        setIsDrawing(true);
    }

    function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
        if (rotateDrag.current) {
            const current = getCanvasPoint(e.clientX, e.clientY);
            const { kind, id, center } = rotateDrag.current;
            // atan2 gives the angle from centre to pointer measured from the +x
            // axis; +90 rotates the frame so 0° means "handle pointing straight
            // up". Shift snaps to 15° increments.
            const raw = (Math.atan2(current.y - center.y, current.x - center.x) * 180) / Math.PI + 90;
            const angle = e.shiftKey ? Math.round(raw / 15) * 15 : raw;

            if (kind === "shape") {
                setShapes((prev) => prev.map((s) => (s.id === id ? { ...s, rotation: angle } : s)));
            } else if (kind === "note") {
                setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, rotation: angle } : n)));
            } else {
                setTexts((prev) => prev.map((t) => (t.id === id ? { ...t, rotation: angle } : t)));
            }
            return;
        }

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
        if (rotateDrag.current) {
            const { kind, id, original } = rotateDrag.current;
            rotateDrag.current = null;

            if (kind === "shape") {
                const current = shapesRef.current.find((s) => s.id === id);
                if (current) {
                    const doMessage: CanvasMessage = { kind: "shape", action: "update", payload: current };
                    broadcast(doMessage);
                    pushHistory(doMessage, { kind: "shape", action: "update", payload: original as Shape });
                }
            } else if (kind === "note") {
                const current = notes.find((n) => n.id === id);
                if (current) {
                    const doMessage: CanvasMessage = { kind: "note", action: "update", payload: current };
                    broadcast(doMessage);
                    pushHistory(doMessage, { kind: "note", action: "update", payload: original as Note });
                }
            } else {
                const current = texts.find((t) => t.id === id);
                if (current) {
                    const doMessage: CanvasMessage = { kind: "text", action: "update", payload: current };
                    broadcast(doMessage);
                    pushHistory(doMessage, { kind: "text", action: "update", payload: original as TextBox });
                }
            }
            return;
        }

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

    // Widened to SVGElement (not SVGLineElement) since this is also called
    // from the invisible drag hit-area rect, not just the visible line itself.
    function handleLinePointerDown(e: React.PointerEvent<SVGElement>, shape: LineShape) {
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

    // Widened to SVGElement (not SVGPolygonElement) since this is also
    // called from the invisible drag hit-area rect, not just the filled
    // triangle itself — the rect covers the bounding-box corners outside
    // the triangle's own fill.
    function handleTrianglePointerDown(e: React.PointerEvent<SVGElement>, shape: TriangleShape) {
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

    // Widened to SVGElement (not SVGPathElement) since this is also called
    // from the invisible drag hit-area rect, not just the visible stroke.
    function handlePenPointerDown(e: React.PointerEvent<SVGElement>, shape: PenShape) {
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

    // Bounding-box centre (the rotation pivot) and half-height (how far above
    // the centre the handle stem starts) for any rotatable item. Derived from
    // getBounds so it works uniformly for box shapes, triangles, pen strokes,
    // notes, and texts — whatever their underlying geometry.
    function rotatableGeometry(item: Shape | Note | TextBox): { center: Point; halfHeight: number } {
        const b = getBounds(item);
        return {
            center: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
            halfHeight: (b.maxY - b.minY) / 2,
        };
    }

    // The lone selected item that can be rotated, or null. Everything is
    // rotatable except lines (a line's angle is already fully expressed by its
    // two endpoints, so a rotate handle would be redundant), and only one item
    // at a time — multi-item rotation is a separate problem.
    type Rotatable = {
        kind: "shape" | "note" | "text";
        id: string | number;
        center: Point;
        halfHeight: number;
        rotation: number;
        original: Shape | Note | TextBox;
    };

    function getRotatableSelected(): Rotatable | null {
        if (selectedTool !== "select" || selectedIds.size !== 1) return null;
        const id = [...selectedIds][0];
        const shape = shapes.find((s) => s.id === id);
        if (shape && shape.type !== "line") {
            return { kind: "shape", id, ...rotatableGeometry(shape), rotation: shape.rotation ?? 0, original: shape };
        }
        const note = notes.find((n) => n.id === id);
        if (note) return { kind: "note", id, ...rotatableGeometry(note), rotation: note.rotation ?? 0, original: note };
        const text = texts.find((t) => t.id === id);
        if (text) return { kind: "text", id, ...rotatableGeometry(text), rotation: text.rotation ?? 0, original: text };
        return null;
    }

    // Starts a rotate gesture from the handle. Snapshots the pivot (centre) and
    // the item's current geometry so the canvas-level pointer-move can set a
    // live angle and pointer-up can record the undo pair — same shape as the
    // triangle-vertex drag, which also drives off the canvas move/up handlers.
    function handleRotateHandlePointerDown(
        e: React.PointerEvent<HTMLDivElement>,
        kind: "shape" | "note" | "text",
        id: string | number,
        center: Point,
        original: Shape | Note | TextBox
    ) {
        e.stopPropagation();
        rotateDrag.current = { kind, id, center, original };
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
        return (
            <rect
                x={bounds.minX - SELECTION_PADDING}
                y={bounds.minY - SELECTION_PADDING}
                width={bounds.maxX - bounds.minX + SELECTION_PADDING * 2}
                height={bounds.maxY - bounds.minY + SELECTION_PADDING * 2}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
            />
        );
    }

    // Invisible hit-area matching the same padded box the selection outline
    // draws — lines/pen have fill="none", so without this, only the thin
    // visible stroke itself is draggable, not the space around it.
    function renderDragHitArea(bounds: Bounds, onPointerDown: (e: React.PointerEvent<SVGRectElement>) => void) {
        return (
            <rect
                x={bounds.minX - SELECTION_PADDING}
                y={bounds.minY - SELECTION_PADDING}
                width={bounds.maxX - bounds.minX + SELECTION_PADDING * 2}
                height={bounds.maxY - bounds.minY + SELECTION_PADDING * 2}
                fill="transparent"
                className="pointer-events-auto"
                style={getObjectCursorStyle()}
                onPointerDown={onPointerDown}
            />
        );
    }

    function renderTriangleShape(shape: TriangleShape) {
        const points = `${shape.p1.x},${shape.p1.y} ${shape.p2.x},${shape.p2.y} ${shape.p3.x},${shape.p3.y}`;
        const bounds = getBounds(shape);
        const cx = (bounds.minX + bounds.maxX) / 2;
        const cy = (bounds.minY + bounds.maxY) / 2;
        // Rotate the whole group (fill, hit-area, outline, vertices) around the
        // bbox centre. The points are untouched — this is purely visual, so
        // bounds/marquee/vertex math stays correct.
        const rotation = shape.rotation ?? 0;
        const transform = rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined;

        return (
            <svg key={shape.id} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                <g transform={transform}>
                    {renderDragHitArea(bounds, (e) => handleTrianglePointerDown(e, shape))}
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
                    {renderSelectionOutline(shape.id, bounds)}
                    {/* Vertex editing is disabled while rotated — dragging a vertex
                        moves it in unrotated space, which reads as a jump on screen. */}
                    {selectedTriangleId === shape.id && !shape.rotation && (
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
                </g>
            </svg>
        );
    }

    function renderLineShape(shape: LineShape) {
        return (
            <svg key={shape.id} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                {renderDragHitArea(getBounds(shape), (e) => handleLinePointerDown(e, shape))}
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
        const editing = editingId === note.id;
        return (
            <textarea
                value={note.text}
                data-item-id={note.id}
                readOnly={!editing}
                tabIndex={editing ? 0 : -1}
                onPointerDown={(e) => {
                    if (selectedTool === "eraser") {
                        e.stopPropagation();
                        deleteNote(note.id);
                        return;
                    }
                    // While editing, stop the event reaching Rnd so click-dragging
                    // to select text doesn't move the note.
                    if (editing) e.stopPropagation();
                }}
                onBlur={() => setEditingId((cur) => (cur === note.id ? null : cur))}
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
                className={`h-full w-full resize-none p-2 text-sm outline-none ${editing ? "" : "select-none"}`}
                style={{
                    backgroundColor: note.color,
                    // Non-interactive until editing: clicks fall through to the
                    // Rnd wrapper (select + drag) and canvas drags can't select
                    // the text inside.
                    pointerEvents: editing ? "auto" : "none",
                    cursor: editing ? "text" : "move",
                }}
            />
        )
    }

    function renderText(textBox: TextBox) {
        const editing = editingId === textBox.id;
        return (
            <textarea
                value={textBox.text}
                data-item-id={textBox.id}
                readOnly={!editing}
                tabIndex={editing ? 0 : -1}
                onPointerDown={(e) => {
                    if (selectedTool === "eraser") {
                        e.stopPropagation();
                        deleteText(textBox.id);
                        return;
                    }
                    if (editing) e.stopPropagation();
                }}
                onBlur={() => setEditingId((cur) => (cur === textBox.id ? null : cur))}
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
                className={`h-full w-full resize-none bg-transparent p-1 text-base outline-none ${editing ? "" : "select-none"}`}
                style={{
                    color: textBox.colour,
                    pointerEvents: editing ? "auto" : "none",
                    cursor: editing ? "text" : "move",
                }}
            />
        );
    }

    function renderPenShape(shape: PenShape) {
        const bounds = getBounds(shape);
        const cx = (bounds.minX + bounds.maxX) / 2;
        const cy = (bounds.minY + bounds.maxY) / 2;
        const rotation = shape.rotation ?? 0;
        const transform = rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined;

        return (
            <svg key={shape.id} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                <g transform={transform}>
                    {/* Hit-area follows the stroke, not the bounding box — a fat
                        transparent polyline. Filling the whole bbox (as a rect
                        would) covers text/other items sitting inside the pen's
                        span and steals their clicks. */}
                    <polyline
                        points={shape.points.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill="none"
                        stroke="transparent"
                        strokeWidth="14"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="pointer-events-auto"
                        style={getObjectCursorStyle()}
                        onPointerDown={(e) => handlePenPointerDown(e, shape)}
                    />
                    <polyline
                        points={shape.points.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill="none"
                        stroke={shape.colour}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                        className="pointer-events-none"
                    />
                    {renderSelectionOutline(shape.id, bounds)}
                </g>
            </svg>
        )
    }

    function renderShapeItem(shape: Shape) {
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
                enableResizing={!isDrawing && !shape.rotation}
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
                onDrag={(e, data) => {
                    // Live position write so the rotate handle (rendered from
                    // state, outside Rnd) tracks the shape during the drag
                    // instead of jumping to the new spot only on release.
                    setShapes((prev) =>
                        prev.map((s) => (s.id === shape.id ? { ...s, x: data.x, y: data.y } : s))
                    );
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
                <div
                    className={`h-full w-full ${selectedIds.has(shape.id) ? "ring-2 ring-blue-500 ring-offset-2" : ""}`}
                    style={{ ...getObjectCursorStyle(), transform: `rotate(${shape.rotation ?? 0}deg)`, transformOrigin: "center center" }}
                >
                    {renderBoxShape(shape)}
                </div>
            </Rnd>
        );
    }

    function renderNoteItem(note: Note) {
        return (
            <Rnd
                key={note.id}
                size={{ width: note.width, height: note.height }}
                position={{ x: note.x, y: note.y }}
                bounds="parent"
                scale={scale}
                enableResizing={!note.rotation}
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
                onDrag={(e, data) => {
                    setNotes((prev) =>
                        prev.map((n) => (n.id === note.id ? { ...n, x: data.x, y: data.y } : n))
                    );
                }}
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
                <div
                    className={`h-full w-full ${selectedIds.has(note.id) ? "ring-2 ring-blue-500 ring-offset-2" : ""}`}
                    style={{ ...getObjectCursorStyle(), transform: `rotate(${note.rotation ?? 0}deg)`, transformOrigin: "center center" }}
                    onDoubleClick={() => {
                        if (selectedTool !== "select") return;
                        setEditingId(note.id);
                    }}
                >
                    {renderNote(note)}
                </div>
            </Rnd>
        );
    }

    function renderTextItem(textBox: TextBox) {
        return (
            <Rnd
                key={textBox.id}
                size={{ width: textBox.width, height: textBox.height }}
                position={{ x: textBox.x, y: textBox.y }}
                bounds="parent"
                scale={scale}
                enableResizing={!textBox.rotation}
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
                onDrag={(e, data) => {
                    setTexts((prev) =>
                        prev.map((text) => (text.id === textBox.id ? { ...text, x: data.x, y: data.y } : text))
                    );
                }}
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
                <div
                    className={`h-full w-full ${selectedIds.has(textBox.id) ? "ring-2 ring-blue-500 ring-offset-2" : ""}`}
                    style={{ ...getObjectCursorStyle(), transform: `rotate(${textBox.rotation ?? 0}deg)`, transformOrigin: "center center" }}
                    onDoubleClick={() => {
                        if (selectedTool !== "select") return;
                        setEditingId(textBox.id);
                    }}
                >
                    {renderText(textBox)}
                </div>
            </Rnd>
        );
    }

    // One combined, z-sorted list spanning all three kinds — this is what
    // actually fixes cross-kind stacking (previously notes always painted
    // over shapes and texts always painted over both, regardless of
    // z-index, since they were three separate sibling blocks in render order).
    type RenderEntry =
        | { kind: "shape"; item: Shape }
        | { kind: "note"; item: Note }
        | { kind: "text"; item: TextBox };

    const canvasItems: RenderEntry[] = [
        ...shapes.map((item): RenderEntry => ({ kind: "shape", item })),
        ...notes.map((item): RenderEntry => ({ kind: "note", item })),
        ...texts.map((item): RenderEntry => ({ kind: "text", item })),
    ].sort((a, b) => (a.item.zIndex ?? 0) - (b.item.zIndex ?? 0));

    return (
        <div
            ref={wrapperRef}
            className="mt-4 w-full overflow-hidden border"
            style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
        >
            <div
                ref={canvasRef}
                data-testid="canvas"
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
                {canvasItems.map((entry) => {
                    switch (entry.kind) {
                        case "shape":
                            return renderShapeItem(entry.item);
                        case "note":
                            return renderNoteItem(entry.item);
                        case "text":
                            return renderTextItem(entry.item);
                    }
                })}
                {(() => {
                    const rotatable = getRotatableSelected();
                    if (!rotatable) return null;
                    const { kind, id, center, halfHeight, rotation, original } = rotatable;
                    const cx = center.x;
                    const cy = center.y;
                    // -90 puts the handle straight up at rotation 0; it then swings
                    // around the centre as rotation changes, staying "above" the shape.
                    const rad = ((rotation - 90) * Math.PI) / 180;
                    const edgeDist = halfHeight;
                    const handleDist = edgeDist + 28;
                    const ex = cx + edgeDist * Math.cos(rad);
                    const ey = cy + edgeDist * Math.sin(rad);
                    const hx = cx + handleDist * Math.cos(rad);
                    const hy = cy + handleDist * Math.sin(rad);
                    return (
                        <>
                            <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                                <line
                                    x1={ex}
                                    y1={ey}
                                    x2={hx}
                                    y2={hy}
                                    stroke="#3b82f6"
                                    strokeWidth="1"
                                    vectorEffect="non-scaling-stroke"
                                />
                            </svg>
                            <div
                                onPointerDown={(e) => handleRotateHandlePointerDown(e, kind, id, center, original)}
                                className="absolute rounded-full border border-blue-500 bg-white shadow-sm"
                                style={{
                                    left: hx,
                                    top: hy,
                                    width: 14,
                                    height: 14,
                                    transform: "translate(-50%, -50%)",
                                    cursor: "grab",
                                    touchAction: "none",
                                }}
                            />
                        </>
                    );
                })()}
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
