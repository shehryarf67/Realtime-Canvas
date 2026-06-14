import {Square, Triangle, Minus, Text, Circle, StickyNote, Eraser} from "lucide-react"

export default function Toolbar() {

    return (
        <div className="flex gap-2">
            <button className="p-2 bg-gray-200 hover:bg-gray-300 text-black rounded"><Square size={18} /></button>
            <button className="p-2 bg-gray-200 hover:bg-gray-300 text-black rounded"><Circle size={18} /></button>
            <button className="p-2 bg-gray-200 hover:bg-gray-300 text-black rounded"><Triangle size={18} /></button>
            <button className="p-2 bg-gray-200 hover:bg-gray-300 text-black rounded"><Minus size={18} /></button>
            <button className="p-2 bg-gray-200 hover:bg-gray-300 text-black rounded"><Text size={18} /></button>
            <button className="p-2 bg-gray-200 hover:bg-gray-300 text-black rounded"><StickyNote size={18} /></button>
            <button className="p-2 bg-gray-200 hover:bg-gray-300 text-black rounded"><Eraser size={18} /></button>
        </div>
    )
}