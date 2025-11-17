// src/middleware/auth.js
const jwt = require("jsonwebtoken");
const { query } = require("../config/database");
const logger = require("../utils/logger");
require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET;

// Middleware: Authenticate JWT + Validate User from DB
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Validasi header Authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Token tidak ditemukan. Silakan login terlebih dahulu.",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    // Verifikasi token
    const payload = jwt.verify(token, JWT_SECRET);

    // Validasi user di database
    const users = await query(
      "SELECT id, nip, name, email, role, is_active FROM users WHERE id = ?",
      [payload.id]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "User tidak ditemukan.",
      });
    }

    if (!users[0].is_active) {
      return res.status(401).json({
        success: false,
        message: "Akun Anda telah dinonaktifkan.",
      });
    }

    // Simpan user ke request
    req.user = {
      id: users[0].id,
      nip: users[0].nip,
      name: users[0].name,
      email: users[0].email,
      role: users[0].role,
    };

    next();
  } catch (error) {
    logger.error("Authentication error:", error);

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Token tidak valid.",
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token telah kadaluarsa. Silakan login kembali.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server.",
    });
  }
};

// Middleware: Role-based Authorization
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses ke resource ini.",
      });
    }
    next();
  };
};

module.exports = {
  authenticate,
  authorize,
};
