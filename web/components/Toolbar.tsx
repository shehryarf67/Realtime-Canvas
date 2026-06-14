import {Square, Triangle, Minus, Text, Circle, StickyNote, Eraser} from "lucide-react"

type Tool = "select" | "square" | "circle" | "triangle" | "line" | "text" | "note" | "eraser";

type ToolbarProps = {
  selectedTool: Tool;
  onSelectTool: (tool: Tool) => void;
};

export default function Toolbar({ selectedTool, onSelectTool }: ToolbarProps) {

    return (
        <div className="flex gap-2">
            <button 
                className={`p-2 bg-gray-200 hover:bg-gray-300 text-black rounded ${selectedTool === "square" ? "border border-blue-500 text-white" : ""}`}
                onClick={() => onSelectTool("square")}
            >
                <Square size={18} />
            </button>
            <button 
                className={`p-2 bg-gray-200 hover:bg-gray-300 text-black rounded ${selectedTool === "circle" ? "border border-blue-500 text-white" : ""}`}
                onClick={() => onSelectTool("circle")}
            >
                <Circle size={18} />
            </button>
            <button 
                className={`p-2 bg-gray-200 hover:bg-gray-300 text-black rounded ${selectedTool === "triangle" ? "border border-blue-500 text-white" : ""}`}
                onClick={() => onSelectTool("triangle")}
            >
                <Triangle size={18} />
            </button>
            <button 
                className={`p-2 bg-gray-200 hover:bg-gray-300 text-black rounded ${selectedTool === "line" ? "border border-blue-500 text-white" : ""}`}
                onClick={() => onSelectTool("line")}
            >
                <Minus size={18} />
            </button>
            <button 
                className={`p-2 bg-gray-200 hover:bg-gray-300 text-black rounded ${selectedTool === "text" ? "border border-blue-500 text-white" : ""}`}
                onClick={() => onSelectTool("text")}
            >
                <Text size={18} />
            </button>
            <button 
                className={`p-2 bg-gray-200 hover:bg-gray-300 text-black rounded ${selectedTool === "note" ? "border border-blue-500 text-white" : ""}`}
                onClick={() => onSelectTool("note")}
            >
                <StickyNote size={18} />
            </button>
            <button 
                className={`p-2 bg-gray-200 hover:bg-gray-300 text-black rounded ${selectedTool === "eraser" ? "border border-blue-500 text-white" : ""}`}
                onClick={() => onSelectTool("eraser")}
            >
                <Eraser size={18} />
            </button>
        </div>
    )
}