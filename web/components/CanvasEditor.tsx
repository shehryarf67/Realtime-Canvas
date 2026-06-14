import type { Tool } from "@/types/shape";

type CanvasEditorProps = {
  selectedTool: Tool;
};

export default function CanvasEditor({ selectedTool }: CanvasEditorProps) {
    if (selectedTool === "select") {
        return <div className="border mt-4 w-full min-h-[85dvh] flex items-center justify-center text-gray-500">Select a tool to start drawing</div>;
    }   

    if (selectedTool === "eraser") {
        return <div className="border mt-4 w-full min-h-[85dvh] flex items-center justify-center text-gray-500">Eraser tool selected - functionality coming soon!</div>;
    }

    if (selectedTool === "text") {
        return <div className="border mt-4 w-full min-h-[85dvh] flex items-center justify-center text-gray-500">Text tool selected - functionality coming soon!</div>;
    }

    if (selectedTool === "note") {
        return <div className="border mt-4 w-full min-h-[85dvh] flex items-center justify-center text-gray-500">Sticky Note tool selected - functionality coming soon!</div>;
    }

    if (["square", "circle", "triangle", "line"].includes(selectedTool)) {
        return <div className="border mt-4 w-full min-h-[85dvh] flex items-center justify-center text-gray-500">{selectedTool.charAt(0).toUpperCase() + selectedTool.slice(1)} tool selected - functionality coming soon!</div>;
    }

    return (
        <div className="border mt-4 w-full min-h-[85dvh]">
            
        </div>
    )
}