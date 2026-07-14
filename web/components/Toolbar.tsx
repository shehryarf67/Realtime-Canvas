import { MousePointer2, Square, Triangle, Minus, Type, Circle, StickyNote, Eraser, Undo2, Redo2, Pen } from "lucide-react"
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

export default function Toolbar({ selectedTool, onSelectTool, selectedColour, onSelectedColourChange, onUndo, onRedo, canUndo, canRedo }: ToolbarProps) {

    return (
        <div className="flex flex-wrap items-center gap-2">
            <button
                className={`p-2 bg-gray-200 hover:bg-gray-300 text-black rounded border ${selectedTool === "select" ? "ring-2 ring-blue-500 text-white" : "border-transparent"}`}
                onClick={() => onSelectTool("select")}
            >
                <MousePointer2 size={18} />
            </button>
            <button
                className={`p-2 bg-gray-200 hover:bg-gray-300 text-black rounded border ${selectedTool === "square" ? "ring-2 ring-blue-500 text-white" : "border-transparent"}`}
                onClick={() => onSelectTool("square")}
            >
                <Square size={18} />
            </button>
            <button
                className={`p-2 bg-gray-200 hover:bg-gray-300 text-black rounded border ${selectedTool === "circle" ? "ring-2 ring-blue-500 text-white" : "border-transparent"}`}
                onClick={() => onSelectTool("circle")}
            >
                <Circle size={18} />
            </button>
            <button
                className={`p-2 bg-gray-200 hover:bg-gray-300 text-black rounded border ${selectedTool === "triangle" ? "ring-2 ring-blue-500 text-white" : "border-transparent"}`}
                onClick={() => onSelectTool("triangle")}
            >
                <Triangle size={18} />
            </button>
            <button
                className={`p-2 bg-gray-200 hover:bg-gray-300 text-black rounded border ${selectedTool === "pen" ? "ring-2 ring-blue-500 text-white" : "border-transparent"}`}
                onClick={() => onSelectTool("pen")}
            >
                <Pen size={18} />
            </button>
            <button
                className={`p-2 bg-gray-200 hover:bg-gray-300 text-black rounded border ${selectedTool === "line" ? "ring-2 ring-blue-500 text-white" : "border-transparent"}`}
                onClick={() => onSelectTool("line")}
            >
                <Minus size={18} />
            </button>
            <button
                className={`p-2 bg-gray-200 hover:bg-gray-300 text-black rounded border ${selectedTool === "text" ? "ring-2 ring-blue-500 text-white" : "border-transparent"}`}
                onClick={() => onSelectTool("text")}
            >
                <Type size={18} />
            </button>
            <button
                className={`p-2 bg-gray-200 hover:bg-gray-300 text-black rounded border ${selectedTool === "note" ? "ring-2 ring-blue-500 text-white" : "border-transparent"}`}
                onClick={() => onSelectTool("note")}
            >
                <StickyNote size={18} />
            </button>
            <button
                className={`p-2 bg-gray-200 hover:bg-gray-300 text-black rounded border ${selectedTool === "eraser" ? "ring-2 ring-blue-500 text-white" : "border-transparent"}`}
                onClick={() => onSelectTool("eraser")}
            >
                <Eraser size={18} />
            </button>
            <div className="mx-1 h-10 w-px bg-gray-300" />
            {colours.map((colour) => (
                <button
                    key={colour}
                    className={`h-10 w-10 rounded-full border hover:ring-2 hover:ring-blue-500 ${selectedColour === colour ? "ring-2 ring-blue-500" : "border-gray-300"}`}
                    style={{ backgroundColor: colour }}
                    onClick={() => onSelectedColourChange(colour)}
                />
            ))}
            <div className="mx-1 h-10 w-px bg-gray-300" />
            <button
                className="p-2 bg-gray-200 hover:bg-gray-300 text-black rounded border border-transparent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-gray-200"
                onClick={onUndo}
                disabled={!canUndo}
            >
                <Undo2 size={18} />
            </button>
            <button
                className="p-2 bg-gray-200 hover:bg-gray-300 text-black rounded border border-transparent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-gray-200"
                onClick={onRedo}
                disabled={!canRedo}
            >
                <Redo2 size={18} />
            </button>
        </div>
    )
}
