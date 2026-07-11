"use client";

import type { Tool, Shape, BoxShape, LineShape, TriangleShape, Point, Note, TextBox } from "@/types/shape";
import { Rnd } from "react-rnd";
import { useEffect, useRef, useState, useCallback } from "react";
import { useSocket } from "@/contexts/SocketContext";
import { useAuth } from "@/contexts/AuthContext";
import type { CanvasMessage, CanvasState } from "@/types/shape";
import { Circle } from "lucide-react";

type HistoryControls = {
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
};

type CanvasEditorProps = {
    roomId: string;
    selectedTool: Tool | null;
    selectedColour: string;
    onHistoryChange?: (history: HistoryControls) => void;
};

type HistoryEntry = {
    do: CanvasMessage;
    undo: CanvasMessage;
};

function upsert<T extends { id: string | number }>(list: T[], item: T): T[] {
    return list.some((el) => el.id === item.id)
        ? list.map((el) => (el.id === item.id ? item : el))
        : [...list, item];
}




const ERASER_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='5' fill='white' stroke='black' stroke-width='2'/%3E%3C/svg%3E") 8 8, auto`;

const TEXT_COLOUR = "#000000";
const NOTE_COLOUR = "#fff9b1";

const CURSOR_COLOURS = ["#14b8a6", "#8b5cf6", "#3b82f6", "#f43f5e", "#f59e0b"];

function getCursorColour(userId: string): string {
    const sum = userId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return CURSOR_COLOURS[sum % CURSOR_COLOURS.length];
}

export default function CanvasEditor({ roomId, selectedTool, selectedColour, onHistoryChange }: CanvasEditorProps) {
    const [shapes, setShapes] = useState<Shape[]>([]);
    const [isDrawing, setIsDrawing] = useState(false);
    const canvasRef = useRef<HTMLDivElement | null>(null);
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
    const shapesRef = useRef<Shape[]>([]);
    const lastEmitTimeRef = useRef<number>(0); // Tells when the cursor was last emitted to the server. This is used to throttle the cursor move events.
    const emitInterval = 30; // milliseconds
    const [notes, setNotes] = useState<Note[]>([]);
    const [texts, setTexts] = useState<TextBox[]>([]);
    const [isDraggingItem, setIsDraggingItem] = useState(false);
    const [selectedTriangleId, setSelectedTriangleId] = useState<string | null>(null);
    const socket = useSocket();
    const auth = useAuth();
    const [userMap, setUserMap] = useState<Map<string, { x: number; y: number; name: string }>>(new Map());
    const [past, setPast] = useState<HistoryEntry[]>([]);
    const [future, setFuture] = useState<HistoryEntry[]>([]);

    const broadcast = useCallback(
        (message: CanvasMessage) => {
            socket?.emit("shape-message", { roomId, message });
        },
        [roomId, socket]
    )

    function pushHistory(doMessage: CanvasMessage, undoMessage: CanvasMessage) {
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
        applyMessage(lastAction.undo);
        broadcast(lastAction.undo);
        setPast((prev) => prev.slice(0, -1));
        setFuture((prev) => [...prev, lastAction]);
    }, [past, future]);

    const redo = useCallback(() => {
        if (future.length === 0) return;
        const nextAction = future[future.length - 1];
        applyMessage(nextAction.do);
        broadcast(nextAction.do);
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

    function clamp(value: number, min: number, max: number) {
        return Math.max(min, Math.min(value, max));
    }

    function getCanvasPoint(clientX: number, clientY: number) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };

        const rawX = clientX - rect.left;
        const rawY = clientY - rect.top;

        return {
            x: clamp(rawX, 0, rect.width),
            y: clamp(rawY, 0, rect.height),
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
        if (!selectedTool || selectedTool === "select" || selectedTool === "eraser") {
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
        const { x, y } = getCanvasPoint(e.clientX, e.clientY);
        const id = crypto.randomUUID();

        const newShape: Shape = selectedTool === "line"
            ? { id, type: "line", x1: x, y1: y, x2: x, y2: y, colour: selectedColour }
            : selectedTool === "triangle"
                ? { id, type: "triangle", p1: { x, y }, p2: { x, y }, p3: { x, y }, colour: selectedColour }
                : { id, type: selectedTool, x, y, width: 0, height: 0, colour: selectedColour };

        setShapes((prev) => [...prev, newShape]);
        drawingId.current = id;
        startPoint.current = { x, y };
        setIsDrawing(true);
    }

    function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
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
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;

            const current = getCanvasPoint(e.clientX, e.clientY);
            const { id, pointerStart, triangleStart } = triangleDrag.current;
            const points = [triangleStart.p1, triangleStart.p2, triangleStart.p3];
            const minX = Math.min(...points.map((point) => point.x));
            const maxX = Math.max(...points.map((point) => point.x));
            const minY = Math.min(...points.map((point) => point.y));
            const maxY = Math.max(...points.map((point) => point.y));
            const dx = clamp(current.x - pointerStart.x, -minX, rect.width - maxX);
            const dy = clamp(current.y - pointerStart.y, -minY, rect.height - maxY);

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
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;

            const current = getCanvasPoint(e.clientX, e.clientY);
            const { id, pointerStart, lineStart } = lineDrag.current;
            const minX = Math.min(lineStart.x1, lineStart.x2);
            const maxX = Math.max(lineStart.x1, lineStart.x2);
            const minY = Math.min(lineStart.y1, lineStart.y2);
            const maxY = Math.max(lineStart.y1, lineStart.y2);
            const dx = clamp(current.x - pointerStart.x, -minX, rect.width - maxX);
            const dy = clamp(current.y - pointerStart.y, -minY, rect.height - maxY);

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
                    return { ...s, x2: currentX, y2: currentY };
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
                    };
                }

                return {
                    ...s,
                    x: Math.min(start.x, currentX),
                    y: Math.min(start.y, currentY),
                    width: Math.abs(currentX - start.x),
                    height: Math.abs(currentY - start.y),
                };
            })
        );
    }

    function handlePointerUp() {
        // TODO: broadcast the finished shape (add or update)
        const wasDrawing = drawingId.current !== null;
        const moveId =
            drawingId.current ??
            lineDrag.current?.id ??
            triangleDrag.current?.id ??
            triangleVertexDrag.current?.id ??
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
            }
        }

        drawingId.current = null;
        startPoint.current = null;
        lineDrag.current = null;
        triangleDrag.current = null;
        triangleVertexDrag.current = null;
        setIsDrawing(false);
    }

    function handleLinePointerDown(e: React.PointerEvent<SVGLineElement>, shape: LineShape) {
        e.stopPropagation();
        if (selectedTool === "eraser") {
            deleteShape(shape.id);
            return;
        }

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

                    setNotes((prev) =>
                        prev.map((n) =>
                            n.id === note.id ? { ...n, text: value } : n
                        )
                    );
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

                    setTexts((prev) =>
                        prev.map((text) =>
                            text.id === textBox.id ? { ...text, text: value } : text
                        )
                    );
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

    return (
        <div
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="relative mt-4 min-h-[85dvh] w-full border"
            style={getCanvasCursorStyle()}
        >
            {shapes.map((shape) => {
                if (shape.type === "line") {
                    return renderLineShape(shape);
                }
                if (shape.type === "triangle") {
                    return renderTriangleShape(shape);
                }

                return (
                    <Rnd
                        key={shape.id}
                        size={{ width: shape.width, height: shape.height }}
                        position={{ x: shape.x, y: shape.y }}
                        bounds="parent"
                        disableDragging={isDrawing}
                        enableResizing={!isDrawing}
                        onPointerDown={(e: React.PointerEvent<HTMLElement>) => {
                            if (selectedTool === "eraser") {
                                e.stopPropagation();
                                deleteShape(shape.id);
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
                        <div className="h-full w-full" style={getObjectCursorStyle()}>
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
                    onPointerDown={(e: React.PointerEvent<HTMLElement>) => {
                        if (selectedTool === "eraser") {
                            e.stopPropagation();
                            deleteNote(note.id);
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
                    <div className="h-full w-full" style={getObjectCursorStyle()}>
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
                    onPointerDown={(e: React.PointerEvent<HTMLElement>) => {
                        if (selectedTool === "eraser") {
                            e.stopPropagation();
                            deleteText(textBox.id);
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
                    <div className="h-full w-full" style={getObjectCursorStyle()}>
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
        </div>
    )
}
