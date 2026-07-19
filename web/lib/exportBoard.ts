import type { CanvasState, Shape, Note, TextBox } from "@/types/shape";

// Export uses the same 1600x900 space, rotation and stacking as the editor.

const VIEW_W = 1600;
const VIEW_H = 900;

// User text must not be able to add its own SVG markup.
function esc(s: string): string {
  return s.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

// Rotate around the same item centre used by the editor.
function rot(rotation: number | undefined, cx: number, cy: number): string {
  return rotation ? ` transform="rotate(${rotation} ${cx} ${cy})"` : "";
}

function shapeSvg(shape: Shape): string {
  switch (shape.type) {
    case "square": {
      const cx = shape.x + shape.width / 2;
      const cy = shape.y + shape.height / 2;
      return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" fill="${shape.colour}" stroke="#171717" stroke-width="2"${rot(shape.rotation, cx, cy)}/>`;
    }
    case "circle": {
      const cx = shape.x + shape.width / 2;
      const cy = shape.y + shape.height / 2;
      return `<ellipse cx="${cx}" cy="${cy}" rx="${shape.width / 2}" ry="${shape.height / 2}" fill="${shape.colour}" stroke="#171717" stroke-width="2"${rot(shape.rotation, cx, cy)}/>`;
    }
    case "triangle": {
      const xs = [shape.p1.x, shape.p2.x, shape.p3.x];
      const ys = [shape.p1.y, shape.p2.y, shape.p3.y];
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const points = `${shape.p1.x},${shape.p1.y} ${shape.p2.x},${shape.p2.y} ${shape.p3.x},${shape.p3.y}`;
      return `<polygon points="${points}" fill="${shape.colour}" stroke="#171717" stroke-width="2"${rot(shape.rotation, cx, cy)}/>`;
    }
    case "line":
      return `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" stroke="${shape.colour}" stroke-width="2"/>`;
    case "pen": {
      const xs = shape.points.map((p) => p.x);
      const ys = shape.points.map((p) => p.y);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const points = shape.points.map((p) => `${p.x},${p.y}`).join(" ");
      return `<polyline points="${points}" fill="none" stroke="${shape.colour}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${rot(shape.rotation, cx, cy)}/>`;
    }
    default:
      return "";
  }
}

// Explicit newlines become tspans. Long lines are clipped like the live canvas.
function textTspans(text: string, x: number, yStart: number, lineHeight: number): string {
  return text
    .split("\n")
    .map((line, i) => `<tspan x="${x}" y="${yStart + i * lineHeight}">${esc(line)}</tspan>`)
    .join("");
}

function noteSvg(note: Note): string {
  const cx = note.x + note.width / 2;
  const cy = note.y + note.height / 2;
  const clipId = `clip-note-${note.id}`;
  const tspans = textTspans(note.text, note.x + 10, note.y + 24, 18);
  return (
    `<g${rot(note.rotation, cx, cy)}>` +
    `<clipPath id="${clipId}"><rect x="${note.x}" y="${note.y}" width="${note.width}" height="${note.height}"/></clipPath>` +
    `<rect x="${note.x}" y="${note.y}" width="${note.width}" height="${note.height}" fill="${note.color}"/>` +
    `<text font-family="sans-serif" font-size="14" fill="#171717" clip-path="url(#${clipId})">${tspans}</text>` +
    `</g>`
  );
}

function textBoxSvg(t: TextBox): string {
  const cx = t.x + t.width / 2;
  const cy = t.y + t.height / 2;
  const clipId = `clip-text-${t.id}`;
  const tspans = textTspans(t.text, t.x + 4, t.y + 20, 20);
  return (
    `<g${rot(t.rotation, cx, cy)}>` +
    `<clipPath id="${clipId}"><rect x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}"/></clipPath>` +
    `<text font-family="sans-serif" font-size="16" fill="${t.colour}" clip-path="url(#${clipId})">${tspans}</text>` +
    `</g>`
  );
}

export function buildBoardSvg(state: CanvasState): string {
  // All item types share one z-order on the canvas and in exports.
  const entries: { z: number; svg: string }[] = [
    ...state.shapes.map((s) => ({ z: s.zIndex ?? 0, svg: shapeSvg(s) })),
    ...state.notes.map((n) => ({ z: n.zIndex ?? 0, svg: noteSvg(n) })),
    ...state.texts.map((t) => ({ z: t.zIndex ?? 0, svg: textBoxSvg(t) })),
  ].sort((a, b) => a.z - b.z);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEW_W}" height="${VIEW_H}" viewBox="0 0 ${VIEW_W} ${VIEW_H}">` +
    `<rect width="${VIEW_W}" height="${VIEW_H}" fill="#ffffff"/>` +
    entries.map((e) => e.svg).join("") +
    `</svg>`
  );
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Turn the board name into a safe download filename.
function safeName(name: string): string {
  const cleaned = name.trim().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "board";
}

export function downloadBoardSvg(state: CanvasState, boardName: string): void {
  const svg = buildBoardSvg(state);
  triggerDownload(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${safeName(boardName)}.svg`);
}

export async function downloadBoardPng(state: CanvasState, boardName: string): Promise<void> {
  const svg = buildBoardSvg(state);
  const blob = await svgToPngBlob(svg);
  triggerDownload(blob, `${safeName(boardName)}.png`);
}

// PNG export paints the SVG at 2x for a sharper result.
function svgToPngBlob(svg: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = VIEW_W * scale;
      canvas.height = VIEW_H * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(svgUrl);
        reject(new Error("Could not get 2D context"));
        return;
      }
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(svgUrl);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to encode PNG"));
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error("Failed to load SVG for PNG export"));
    };
    img.src = svgUrl;
  });
}
