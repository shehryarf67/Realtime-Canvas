"use client";

import type { Tool, Shape, BoxShape, LineShape, TriangleShape, Point, Note, TextBox } from "@/types/shape";
import { Rnd } from "react-rnd";
import { useState, useRef } from "react";

type CanvasEditorProps = {
    selectedTool: Tool | null;
    selectedColour: string;
};

const ERASER_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='5' fill='white' stroke='black' stroke-width='2'/%3E%3C/svg%3E") 8 8, auto`;

const TEXT_COLOUR = "#000000";
const NOTE_COLOUR = "#fff9b1";

export default function CanvasEditor({ selectedTool, selectedColour }: CanvasEditorProps) {
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
    } | null>(null);
    const [notes, setNotes] = useState<Note[]>([]);
    const [texts, setTexts] = useState<TextBox[]>([]);
    const [isDraggingItem, setIsDraggingItem] = useState(false);

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
        setShapes((prev) => prev.filter((shape) => shape.id !== id));
    }

    function deleteNote(id: number) {
        setNotes((prev) => prev.filter((note) => note.id !== id));
    }

    function deleteText(id: string) {
        setTexts((prev) => prev.filter((text) => text.id !== id));
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
        if (e.target !== e.currentTarget) return;
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
                {/* TODO: per-endpoint handles */}
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
                            setShapes((prev) =>
                                prev.map((s) =>
                                    s.id === shape.id ? { ...shape, x: data.x, y: data.y } : s
                                )
                            );
                        }}
                        onResizeStop={(e, direction, ref, delta, position) => {
                            setShapes((prev) =>
                                prev.map((s) =>
                                    s.id === shape.id
                                        ? {
                                            ...shape,
                                            width: parseInt(ref.style.width),
                                            height: parseInt(ref.style.height),
                                            x: position.x,
                                            y: position.y,
                                        }
                                        : s
                                )
                            );
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
                    onDragStop={() => setIsDraggingItem(false)}
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
                        setTexts((prev) =>
                            prev.map((text) =>
                                text.id === textBox.id ? { ...textBox, x: data.x, y: data.y } : text
                            )
                        );
                    }}
                    onResizeStop={(e, direction, ref, delta, position) => {
                        setTexts((prev) =>
                            prev.map((text) =>
                                text.id === textBox.id
                                    ? {
                                        ...textBox,
                                        width: parseInt(ref.style.width),
                                        height: parseInt(ref.style.height),
                                        x: position.x,
                                        y: position.y,
                                    }
                                    : text
                            )
                        );
                    }}
                >
                    <div className="h-full w-full" style={getObjectCursorStyle()}>
                        {renderText(textBox)}
                    </div>
                </Rnd>
            ))}
        </div>
    )
}
