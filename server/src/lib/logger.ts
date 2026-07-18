// Minimal dependency-free structured logger. Emits one JSON object per line
// (level, time, message, and optional context) so a log aggregator can parse
// and filter fields instead of scraping free text. Errors passed in the
// context are serialized with name/message/stack (a plain JSON.stringify of an
// Error yields "{}", losing everything).

type Level = "info" | "warn" | "error";

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function emit(level: Level, message: string, context?: Record<string, unknown>): void {
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...(context ? { context } : {}),
  };
  const line = JSON.stringify(entry, replacer);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => emit("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => emit("error", message, context),
};
