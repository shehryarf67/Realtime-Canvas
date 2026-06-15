"use client";

import type { Tool, Shape } from "@/types/shape";
import { Rnd } from "react-rnd";
import { useState, useRef } from "react";

type CanvasEditorProps = {
    selectedTool: Tool;
};

export default function CanvasEditor({ selectedTool }: CanvasEditorProps) {
    const [shapes, setShapes] = useState<Shape[]>([]);
    const drawingId = useRef<string | null>(null);
    const startPoint = useRef<{ x: number; y: number } | null>(null);

    function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
        if (selectedTool === "select" || selectedTool === "eraser" || selectedTool === "text" || selectedTool === "note") {
            return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const id = crypto.randomUUID();

        const newShape: Shape = {
            id,
            type: selectedTool,
            x,
            y,
            width: 0,
            height: 0,
        };
        setShapes((prev) => [...prev, newShape]);
        drawingId.current = id;
        startPoint.current = { x, y };
    }

    function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
        if (!drawingId.current || !startPoint.current) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        const start = startPoint.current;
        setShapes((prev) =>
            prev.map((s) =>
                s.id === drawingId.current
                    ? {
                        ...s,
                        x: Math.min(start.x, currentX),
                        y: Math.min(start.y, currentY),
                        width: Math.abs(currentX - start.x),
                        height: Math.abs(currentY - start.y),
                    }
                    : s
            )
        );
    }

    function handlePointerUp() {
        drawingId.current = null;
        startPoint.current = null;
    }


    function renderShape(shape: Shape) {
        if (shape.type === "circle") {
            return <div className="h-full w-full rounded-full border-2 border-black" />;
        }
        if (shape.type === "triangle") {
            return <svg viewBox="0 0 100 100" className="h-full w-full">
                <polygon
                    points="50,5 5,95 95,95"
                    fill="transparent"
                    stroke="black"
                    strokeWidth="2"
                />
            </svg>;
        }
        if (shape.type === "line") {
            return <div className="h-px w-full border border-black"></div>
        }

        return <div className="h-full w-full border-2 border-black" />;
    }

    return (
        <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="relative mt-4 min-h-[85dvh] w-full border"
        >
            {shapes.map((shape) => (
                <Rnd
                    key={shape.id}
                    size={{ width: shape.width, height: shape.height }}
                    position={{ x: shape.x, y: shape.y }}
                    bounds="parent"
                    onDragStop={(e, data) => {
                        setShapes((prev) =>
                            prev.map((s) =>
                                s.id === shape.id ? { ...s, x: data.x, y: data.y } : s
                            )
                        );
                    }}
                    onResizeStop={(e, direction, ref, delta, position) => {
                        setShapes((prev) =>
                            prev.map((s) =>
                                s.id === shape.id
                                    ? {
                                        ...s,
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
                    {renderShape(shape)}
                </Rnd>
            ))}
        </div>
    )
}
