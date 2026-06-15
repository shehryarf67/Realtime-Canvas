export type Tool =
  | "select"
  | "square"
  | "circle"
  | "triangle"
  | "line"
  | "text"
  | "note"
  | "eraser";

type BoxShapeBase = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SquareShape = BoxShapeBase & {
  type: "square";
};

export type CircleShape = BoxShapeBase & {
  type: "circle";
};

export type TriangleShape = BoxShapeBase & {
  type: "triangle";
};

export type BoxShape = SquareShape | CircleShape | TriangleShape;

export type LineShape = {
  id: string;
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type Shape = BoxShape | LineShape;
