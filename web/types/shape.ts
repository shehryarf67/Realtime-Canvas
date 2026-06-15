export type Tool =
  | "select"
  | "square"
  | "circle"
  | "triangle"
  | "line"
  | "text"
  | "note"
  | "eraser";

export type Shape = {
  id: string;
  type: "square" | "circle" | "triangle" | "line";
  x: number;
  y: number;
  width: number;
  height: number;
};