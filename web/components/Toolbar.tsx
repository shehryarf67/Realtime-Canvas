export default function Toolbar() {

    return (
        <div className="flex gap-2">
            <button className="p-2 bg-gray-200 hover:bg-gray-300 text-black rounded">Rectangle</button>
            <button className="p-2 bg-gray-200 hover:bg-gray-300 text-black rounded">Circle</button>
            <button className="p-2 bg-gray-200 hover:bg-gray-300 text-black rounded">Line</button>
        </div>
    )
}