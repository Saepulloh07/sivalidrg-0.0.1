// src/utils/logger.js
const winston = require("winston");
const path = require("path");
const fs = require("fs");

// Create logs directory if not exists
const logDir = process.env.LOG_DIR || "./logs";
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// --- SAFE STRINGIFY HANDLER (anti circular) ---
function safeStringify(obj) {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }
      return value;
    },
    2
  );
}

// Formatter untuk console
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;

    if (Object.keys(meta).length > 0) {
      // Jika meta adalah Error
      if (meta instanceof Error) {
        msg +=
          " " +
          safeStringify({
            message: meta.message,
            stack: meta.stack,
            name: meta.name,
            code: meta.code,
          });
      } else {
        msg += " " + safeStringify(meta);
      }
    }

    return msg;
  })
);

// JSON file format (tetap aman)
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  // pakai safeStringify untuk keamanan
  winston.format((info) => {
    if (info instanceof Error) {
      info.message = info.message;
      info.stack = info.stack;
    }
    // hindari crash saat stringify metadata
    info.meta = info.meta ? safeStringify(info.meta) : undefined;
    return info;
  })(),
  winston.format.json()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  defaultMeta: { service: "sivalidrg-backend" },
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, "combined.log"),
      maxsize: 5242880,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

// Add console transport in development
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

module.exports = logger;
