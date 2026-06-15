"use client";

import type { Tool, Shape, BoxShape, LineShape, TriangleShape, Point, Note } from "@/types/shape";
import { Rnd } from "react-rnd";
import { useState, useRef } from "react";

type CanvasEditorProps = {
    selectedTool: Tool;
};

export default function CanvasEditor({ selectedTool }: CanvasEditorProps) {
    const [shapes, setShapes] = useState<Shape[]>([]);
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

    function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
        if (e.target !== e.currentTarget) return;
        if (selectedTool === "select" || selectedTool === "eraser" || selectedTool === "text") {
            return;
        }
        if (selectedTool === "note") {
            const { x, y } = getCanvasPoint(e.clientX, e.clientY);
            const newNote: Note = {
                id: Date.now(),
                text: "New note",
                color: "#fff",
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
            ? { id, type: "line", x1: x, y1: y, x2: x, y2: y }
            : selectedTool === "triangle"
                ? { id, type: "triangle", p1: { x, y }, p2: { x, y }, p3: { x, y } }
            : { id, type: selectedTool, x, y, width: 0, height: 0 };

        setShapes((prev) => [...prev, newShape]);
        drawingId.current = id;
        startPoint.current = { x, y };
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
                return <div className="h-full w-full border-2 border-black" />;
            case "circle":
                return <div className="h-full w-full rounded-full border-2 border-black" />;
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
                    fill="transparent"
                    stroke="black"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                    className="pointer-events-auto cursor-move"
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
                    stroke="black"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                    className="pointer-events-auto cursor-move"
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
                className="h-full w-full resize-none bg-yellow-100 p-2 text-sm outline-none"
            />
        )
    }

    return (
        <div
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="relative mt-4 min-h-[85dvh] w-full border"
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
                        {renderBoxShape(shape)}
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
                >
                    {renderNote(note)}
                </Rnd>
            ))}
        </div>
    )
}
