// backend/services/auth-service/controller/auth.controller.js
const jwt = require("jsonwebtoken");
const User = require("../model/user.model");
require("dotenv").config();

const { JWT_SECRET, JWT_EXPIRES, JWT_REFRESH_EXPIRES } = process.env;

// Helper function to convert BigInt to Number
const sanitizeUser = (user) => {
  return {
    ...user,
    id: Number(user.id), // Convert BigInt to Number
  };
};

const parseExpiresIn = (value) => {
  if (!value) return 3600; // default 1 jam

  const num = parseInt(value, 10);
  if (!isNaN(num)) return num; // jika angka langsung

  const match = value.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid expiresIn format: ${value}`);

  const [, amount, unit] = match;
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * multipliers[unit];
};

const generateTokens = (user) => {
  const userData = sanitizeUser(user);

  const accessToken = jwt.sign(
    {
      id: userData.id,
      nip: userData.nip,
      name: userData.name,
      role: userData.role,
    },
    JWT_SECRET,
    { expiresIn: parseExpiresIn(JWT_EXPIRES) } // PARSE DULU!
  );

  const refreshToken = jwt.sign({ id: userData.id }, JWT_SECRET, {
    expiresIn: parseExpiresIn(JWT_REFRESH_EXPIRES),
  });

  return { accessToken, refreshToken };
};

exports.login = async (req, res) => {
  const { nip, password } = req.body;
  console.log("Login attempt:", {
    nip,
    password: password ? "[hidden]" : null,
  });
  if (!nip || !password) {
    return res.status(400).json({ message: "NIP dan password wajib diisi" });
  }

  try {
    const user = await User.findByNip(nip);
    if (!user) {
      return res.status(401).json({ message: "NIP atau password salah" });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: "Akun tidak aktif" });
    }

    const match = await User.comparePassword(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ message: "NIP atau password salah" });
    }

    const { accessToken, refreshToken } = generateTokens(user);

    // Sanitize user data for response
    const userData = sanitizeUser(user);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: userData.id,
        nip: userData.nip,
        name: userData.name,
        email: userData.email,
        role: userData.role,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.refresh = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ message: "Refresh token diperlukan" });
  }

  try {
    const payload = jwt.verify(refreshToken, JWT_SECRET);
    const user = await User.findById(payload.id);

    if (!user || !user.is_active) {
      return res.status(401).json({ message: "User tidak valid" });
    }

    const { accessToken } = generateTokens(user);
    res.json({ accessToken });
  } catch (err) {
    console.error("Refresh token error:", err);
    return res
      .status(401)
      .json({ message: "Refresh token tidak valid atau kadaluarsa" });
  }
};

// Register (hanya admin)
exports.register = async (req, res) => {
  const { nip, name, email, password, role } = req.body;

  if (!nip || !name || !email || !password) {
    return res.status(400).json({
      message: "NIP, nama, email, dan password wajib diisi",
    });
  }

  // Hanya admin yang boleh register
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Akses ditolak" });
  }

  try {
    const existing = await User.findByNip(nip);
    if (existing) {
      return res.status(400).json({ message: "NIP sudah digunakan" });
    }

    const existingEmail = await User.findByEmail(email);
    if (existingEmail) {
      return res.status(400).json({ message: "Email sudah digunakan" });
    }

    const user = await User.create({ nip, name, email, password, role });
    const userData = sanitizeUser(user);

    res.status(201).json({
      message: "User berhasil dibuat",
      user: {
        id: userData.id,
        nip: userData.nip,
        name: userData.name,
        email: userData.email,
        role: userData.role,
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Gagal membuat user" });
  }
};

// Get user profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User tidak ditemukan" });
    }

    const userData = sanitizeUser(user);

    res.json({
      id: userData.id,
      nip: userData.nip,
      name: userData.name,
      email: userData.email,
      role: userData.role,
      is_active: userData.is_active,
    });
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Update user (admin only)
exports.updateUser = async (req, res) => {
  const { id } = req.params;
  const { name, email, role, is_active } = req.body;

  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Akses ditolak" });
  }

  try {
    const user = await User.update(id, { name, email, role, is_active });
    if (!user) {
      return res.status(404).json({ message: "User tidak ditemukan" });
    }

    const userData = sanitizeUser(user);

    res.json({
      message: "User berhasil diperbarui",
      user: userData,
    });
  } catch (err) {
    console.error("Update user error:", err);
    res.status(500).json({ message: "Gagal memperbarui user" });
  }
};

// Get all users (admin only)
exports.getAllUsers = async (req, res) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Akses ditolak" });
  }

  try {
    const { page = 1, limit = 20, search = "" } = req.query;
    const result = await User.findAll({
      page: parseInt(page),
      limit: parseInt(limit),
      search,
    });

    // Sanitize all users in the data array
    const sanitizedData = result.data.map(sanitizeUser);

    res.json({
      ...result,
      data: sanitizedData,
    });
  } catch (err) {
    console.error("Get all users error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
