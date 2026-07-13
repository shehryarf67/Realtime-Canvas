"use client";

import { useEffect, useState } from "react";
import type { CanvasState, Shape, Note, TextBox } from "@/types/shape";
import { getBoardState } from "@/lib/boards";

// Matches the fixed logical canvas space in CanvasEditor (CANVAS_WIDTH/HEIGHT).
// SVG scales the whole drawing down to whatever size the card gives it.
// Nothing here is interactive — it's a picture of the data.
const VIEW_W = 1600;
const VIEW_H = 900;

function renderShape(shape: Shape) {
    switch (shape.type) {
        case "square":
            return (
                <rect
                    key={shape.id}
                    x={shape.x}
                    y={shape.y}
                    width={shape.width}
                    height={shape.height}
                    fill={shape.colour}
                    stroke="#171717"
                    strokeWidth={2}
                />
            );
        case "circle":
            return (
                <ellipse
                    key={shape.id}
                    cx={shape.x + shape.width / 2}
                    cy={shape.y + shape.height / 2}
                    rx={shape.width / 2}
                    ry={shape.height / 2}
                    fill={shape.colour}
                    stroke="#171717"
                    strokeWidth={2}
                />
            );
        case "triangle":
            return (
                <polygon
                    key={shape.id}
                    points={`${shape.p1.x},${shape.p1.y} ${shape.p2.x},${shape.p2.y} ${shape.p3.x},${shape.p3.y}`}
                    fill={shape.colour}
                    stroke="#171717"
                    strokeWidth={2}
                />
            );
        case "line":
            return (
                <line
                    key={shape.id}
                    x1={shape.x1}
                    y1={shape.y1}
                    x2={shape.x2}
                    y2={shape.y2}
                    stroke={shape.colour}
                    strokeWidth={2}
                />
            );
    }
}

function renderNote(note: Note) {
    return (
        <g key={note.id}>
            <rect
                x={note.x}
                y={note.y}
                width={note.width}
                height={note.height}
                fill={note.color}
            />
            <text
                x={note.x + 10}
                y={note.y + 22}
                fontSize={14}
                fill="#78716c"
            >
                {note.text.split("\n")[0].slice(0, 22)}
            </text>
        </g>
    );
}

function renderText(textBox: TextBox) {
    return (
        <text
            key={textBox.id}
            x={textBox.x + 4}
            y={textBox.y + 20}
            fontSize={16}
            fill={textBox.colour}
        >
            {textBox.text.split("\n")[0].slice(0, 28)}
        </text>
    );
}

export default function BoardThumbnail({ roomId }: { roomId: string }) {
    const [state, setState] = useState<CanvasState | null>(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        getBoardState(roomId).then((s) => {
            if (cancelled) return;
            setState(s);
            setLoaded(true);
        });
        return () => {
            cancelled = true;
        };
    }, [roomId]);

    if (!loaded) {
        return <div className="h-full w-full animate-pulse bg-neutral-100" />;
    }

    const isEmpty =
        !state ||
        (state.shapes.length === 0 && state.notes.length === 0 && state.texts.length === 0);

    return (
        <div
            aria-hidden="true"
            className="pointer-events-none relative h-full w-full select-none overflow-hidden bg-white bg-[radial-gradient(circle,_#cbd5e1_1px,_transparent_1.1px)] bg-[length:14px_14px]"
        >
            {isEmpty ? (
                <span className="absolute inset-0 grid place-items-center font-mono text-[11px] text-neutral-400">
                    empty board
                </span>
            ) : (
                <svg
                    viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                    preserveAspectRatio="xMidYMid meet"
                    className="h-full w-full"
                >
                    {state.shapes.map(renderShape)}
                    {state.notes.map(renderNote)}
                    {state.texts.map(renderText)}
                </svg>
            )}
        </div>
    );
}
