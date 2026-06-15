"use client";

import type { Tool, Shape } from "@/types/shape";
import { Rnd } from "react-rnd";
import { useState } from "react";

type CanvasEditorProps = {
    selectedTool: Tool;
};

export default function CanvasEditor({ selectedTool }: CanvasEditorProps) {
    const [shapes, setShapes] = useState<Shape[]>([]);

    function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
        if (selectedTool === "select" || selectedTool === "eraser" || selectedTool === "text" || selectedTool === "note") {
            return;
        }
        const rect = e.currentTarget.getBoundingClientRect();

        const newShape: Shape = {
            id: crypto.randomUUID(),
            type: selectedTool,
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            width: 100,
            height: 100,
        }
        setShapes([...shapes, newShape]);
    }


    function renderShape(shape: Shape) {
        if (shape.type === "circle") {
            return <div className="h-full w-full rounded-full border-2 border-black" />;
        }

        return <div className="h-full w-full border-2 border-black" />;
    }

    return (
        <div
            onClick={handleCanvasClick}
            className="relative mt-4 min-h-[85dvh] w-full border"
        >
            {shapes.map((shape) => (
                <Rnd
                    key={shape.id}
                    default={{
                        x: shape.x,
                        y: shape.y,
                        width: shape.width,
                        height: shape.height,
                    }}
                    bounds="parent"
                >
                    {renderShape(shape)}
                </Rnd>
            ))}
        </div>
    )
}
