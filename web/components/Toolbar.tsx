import {MousePointer2, Square, Triangle, Minus, Type, Circle, StickyNote, Eraser} from "lucide-react"
import type { Tool } from "@/types/shape";

type ToolbarProps = {
  selectedTool: Tool | null;
  onSelectTool: (tool: Tool | null) => void;
};

export default function Toolbar({ selectedTool, onSelectTool }: ToolbarProps) {

    return (
        <div className="inline-flex gap-2">
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
        </div>
    )
}
