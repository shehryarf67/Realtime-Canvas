export type Tool =
  | "select"
  | "square"
  | "circle"
  | "triangle"
  | "line"
  | "text"
  | "note"
  | "eraser"
  | "pen";

type BoxShapeBase = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  colour: string;
};

export type SquareShape = BoxShapeBase & {
  type: "square";
};

export type CircleShape = BoxShapeBase & {
  type: "circle";
};

export type BoxShape = SquareShape | CircleShape;

export type Point = {
  x: number;
  y: number;
};

export type TriangleShape = {
  id: string;
  type: "triangle";
  p1: Point;
  p2: Point;
  p3: Point;
  colour: string;
};

export type LineShape = {
  id: string;
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  colour: string;
};

export type PenShape = { id: string; type: "pen"; points: Point[]; colour: string }

export type Shape = BoxShape | TriangleShape | LineShape | PenShape;

export interface Note {
  id: number,
  text: string,
  color: string,
  x: number,
  y: number,
  width: number,
  height: number,
}

export type TextBox = {
  id: string;
  text: string;
  colour: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasMessage =
  | { kind: "shape"; action: "add" | "update"; payload: Shape }
  | { kind: "shape"; action: "delete"; id: string }
  | { kind: "note"; action: "add" | "update"; payload: Note }
  | { kind: "note"; action: "delete"; id: number }
  | { kind: "text"; action: "add" | "update"; payload: TextBox }
  | { kind: "text"; action: "delete"; id: string }
  | { kind: "shape"; action: "add" | "update"; payload: PenShape }
  | { kind: "shape"; action: "delete"; id: string }

export type CanvasState = {
  shapes: Shape[];
  notes: Note[];
  texts: TextBox[];
};


