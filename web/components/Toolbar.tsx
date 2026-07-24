import { MousePointer2, Square, Triangle, Minus, Type, Circle, StickyNote, Eraser, Undo2, Redo2, Pen } from "lucide-react"
import type { ReactNode } from "react";
import type { Tool } from "@/types/shape";

type ToolbarProps = {
    selectedTool: Tool | null;
    onSelectTool: (tool: Tool | null) => void;
    selectedColour: string;
    onSelectedColourChange: (colour: string) => void;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo: boolean;
    canRedo: boolean;
};

const colours = [
    "#ffffff",
    "#000000",
    "#ef4444",
    "#f97316",
    "#eab308",
    "#22c55e",
    "#3b82f6",
    "#a855f7",
];

// Labels are also accessible names; descriptions are shown in tooltips.
const tools: { tool: Tool; label: string; description: string; icon: ReactNode }[] = [
    { tool: "select", label: "Select", description: "Select, move & resize items", icon: <MousePointer2 size={18} /> },
    { tool: "square", label: "Square", description: "Draw a rectangle", icon: <Square size={18} /> },
    { tool: "circle", label: "Circle", description: "Draw a circle", icon: <Circle size={18} /> },
    { tool: "triangle", label: "Triangle", description: "Draw a triangle", icon: <Triangle size={18} /> },
    { tool: "pen", label: "Pen", description: "Freehand drawing", icon: <Pen size={18} /> },
    { tool: "line", label: "Line", description: "Draw a straight line", icon: <Minus size={18} /> },
    { tool: "text", label: "Text", description: "Add a text box", icon: <Type size={18} /> },
    { tool: "note", label: "Note", description: "Add a sticky note", icon: <StickyNote size={18} /> },
    { tool: "eraser", label: "Eraser", description: "Erase items", icon: <Eraser size={18} /> },
];

// CSS group states handle tooltips without extra React state.
function ToolButton({
    label,
    description,
    active,
    disabled,
    align = "left",
    onClick,
    children,
}: {
    label: string;
    description: string;
    active?: boolean;
    disabled?: boolean;
    // Tooltips open inward so edge buttons do not overflow the screen.
    align?: "left" | "right";
    onClick?: () => void;
    children: ReactNode;
}) {
    return (
        <div className="relative flex">
            <button
                type="button"
                aria-label={label}
                aria-pressed={active ?? undefined}
                disabled={disabled}
                className={`peer p-2 bg-gray-200 hover:bg-gray-300 text-black rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-gray-200 ${active ? "ring-2 ring-blue-500 text-white" : "border-transparent"}`}
                onClick={onClick}
            >
                {children}
            </button>
            <span
                role="tooltip"
                className={`pointer-events-none absolute top-full z-50 mt-2 max-w-[60vw] whitespace-nowrap rounded bg-neutral-800 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-md transition-opacity duration-150 peer-hover:opacity-100 peer-focus-visible:opacity-100 ${align === "right" ? "right-0" : "left-0"}`}
            >
                {description}
            </span>
        </div>
    );
}

export default function Toolbar({ selectedTool, onSelectTool, selectedColour, onSelectedColourChange, onUndo, onRedo, canUndo, canRedo }: ToolbarProps) {

    return (
        <div className="flex flex-wrap items-center gap-2">
            {tools.map(({ tool, label, description, icon }) => (
                <ToolButton
                    key={tool}
                    label={label}
                    description={description}
                    active={selectedTool === tool}
                    onClick={() => onSelectTool(tool)}
                >
                    {icon}
                </ToolButton>
            ))}
            <div className="mx-1 h-10 w-px bg-gray-300" />
            {colours.map((colour) => (
                <button
                    key={colour}
                    aria-label={`Colour ${colour}`}
                    aria-pressed={selectedColour === colour}
                    className={`h-10 w-10 rounded-full border hover:ring-2 hover:ring-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${selectedColour === colour ? "ring-2 ring-blue-500" : "border-gray-300"}`}
                    style={{ backgroundColor: colour }}
                    onClick={() => onSelectedColourChange(colour)}
                />
            ))}
            <div className="mx-1 h-10 w-px bg-gray-300" />
            <ToolButton label="Undo" description="Undo (Ctrl+Z)" align="right" disabled={!canUndo} onClick={onUndo}>
                <Undo2 size={18} />
            </ToolButton>
            <ToolButton label="Redo" description="Redo (Ctrl+Y)" align="right" disabled={!canRedo} onClick={onRedo}>
                <Redo2 size={18} />
            </ToolButton>
        </div>
    )
}
