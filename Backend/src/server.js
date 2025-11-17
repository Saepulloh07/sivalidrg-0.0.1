// src/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const logger = require("./utils/logger");

// Import Middleware
const { authenticate, authorize } = require("./middleware/auth");

// Import Controllers (Hanya untuk Auth)
const {
  login,
  refresh,
  register,
  getProfile,
  updateUser,
  getAllUsers,
} = require("./services/auth-service/controller/auth.controller");

// Import Routes (Selain Auth)
const patientsRoutes = require("./routes/patients");
const documentsRoutes = require("./routes/documents");
const codingRoutes = require("./routes/coding");
const validationRoutes = require("./routes/validation");
const dashboardRoutes = require("./routes/dashboard");
const agentsRoutes = require("./routes/agents");

const app = express();
const PORT = process.env.PORT || 8001;

// ============= Middleware =============

// Security
app.use(helmet());
app.use(compression());

// CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);

// Logging
app.use(morgan("dev"));

// Body Parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    message: "Terlalu banyak request. Coba lagi nanti.",
  },
});
app.use("/api/", limiter);

// Request Logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  });
  next();
});

// ============= Public Routes (Auth) =============

app.post("/api/auth/login", login);
app.post("/api/auth/refresh", refresh);

// ============= Protected Routes (Auth dengan Controller) =============

app.get("/api/auth/profile", authenticate, getProfile);
app.post("/api/auth/register", authenticate, authorize("admin"), register);
app.put("/api/auth/users/:id", authenticate, authorize("admin"), updateUser);
app.get("/api/auth/users", authenticate, authorize("admin"), getAllUsers);

// ============= API Routes (Modular - BUKAN Controller) =============

app.use("/api/patients", patientsRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/coding", codingRoutes);
app.use("/api/validation", validationRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/agents", agentsRoutes);

// ============= Root & Health =============

app.get("/", (req, res) => {
  res.json({
    service: "SIVALIDRG Backend API",
    version: "1.0.0",
    status: "running",
    endpoints: {
      auth: "/api/auth/*",
      patients: "/api/patients",
      documents: "/api/documents",
      coding: "/api/coding",
      validation: "/api/validation",
      dashboard: "/api/dashboard",
      agents: "/api/agents",
    },
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    service: "sivalidrg-backend",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// ============= 404 & Error Handler =============

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint tidak ditemukan",
  });
});

app.use((err, req, res, next) => {
  logger.error("Unhandled error:", err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// ============= Start Server =============

const server = app.listen(PORT, () => {
  logger.info(`SIVALIDRG Backend API berjalan di port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
  logger.info(
    `CORS Origin: ${process.env.CORS_ORIGIN || "http://localhost:3000"}`
  );
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM diterima, menutup server...");
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  logger.info("SIGINT diterima, menutup server...");
  server.close(() => process.exit(0));
});

module.exports = app;
