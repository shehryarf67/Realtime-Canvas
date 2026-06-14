type Tool = "select" | "square" | "circle" | "triangle" | "line" | "text" | "note" | "eraser";

type CanvasEditorProps = {
  selectedTool: Tool;
};

export default function CanvasEditor({ selectedTool }: CanvasEditorProps) {

    return (
        <div className="border mt-4 w-full min-h-[85dvh]">
            
        </div>
    )
}