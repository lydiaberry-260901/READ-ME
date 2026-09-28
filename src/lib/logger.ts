// Readable logs. One line per event, as JSON in production so the host can search them.
// Never pass secrets, tokens or personal details in `data`.
import { formatTime } from "@/lib/format";

type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, message: string, data?: Record<string, unknown>) {
  const entry = { time: new Date().toISOString(), level, message, ...data };
  const line =
    process.env.NODE_ENV === "production"
      ? JSON.stringify(entry)
      : `[${formatTime(entry.time)}] ${level.toUpperCase()} ${message}${data ? ` ${JSON.stringify(data)}` : ""}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (m: string, d?: Record<string, unknown>) => (process.env.NODE_ENV !== "production" ? write("debug", m, d) : undefined),
  info: (m: string, d?: Record<string, unknown>) => write("info", m, d),
  warn: (m: string, d?: Record<string, unknown>) => write("warn", m, d),
  error: (m: string, d?: Record<string, unknown>) => write("error", m, d),
};
