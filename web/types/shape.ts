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
};

export type LineShape = {
  id: string;
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type Shape = BoxShape | TriangleShape | LineShape;

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
  x: number;
  y: number;
  width: number;
  height: number;
};
