"use client";

import type { Tool, Shape, BoxShape, LineShape } from "@/types/shape";
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

    function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
        if (e.target !== e.currentTarget) return;
        if (selectedTool === "select" || selectedTool === "eraser" || selectedTool === "text" || selectedTool === "note") {
            return;
        }
        const { x, y } = getCanvasPoint(e.clientX, e.clientY);
        const id = crypto.randomUUID();

        const newShape: Shape = selectedTool === "line"
            ? { id, type: "line", x1: x, y1: y, x2: x, y2: y }
            : { id, type: selectedTool, x, y, width: 0, height: 0 };

        setShapes((prev) => [...prev, newShape]);
        drawingId.current = id;
        startPoint.current = { x, y };
    }

    function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
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
    }


    function handleLinePointerDown(e: React.PointerEvent<SVGLineElement>, shape: LineShape) {
        e.stopPropagation();
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

    function renderBoxShape(shape: BoxShape) {
        switch (shape.type) {
            case "square":
                return <div className="h-full w-full border-2 border-black" />;
            case "circle":
                return <div className="h-full w-full rounded-full border-2 border-black" />;
            case "triangle":
                return <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
                    <polygon
                        points="50,2 2,98 98,98"
                        fill="transparent"
                        stroke="black"
                        strokeWidth="2"
                        vectorEffect="non-scaling-stroke"
                    />
                </svg>;
            default: {
                const _exhaustive: never = shape;
                return _exhaustive;
            }
        }
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

                return (
                    <Rnd
                        key={shape.id}
                        size={{ width: shape.width, height: shape.height }}
                        position={{ x: shape.x, y: shape.y }}
                        bounds="parent"
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
        </div>
    )
}
