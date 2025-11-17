// // src/routes/auth.js
// const express = require("express");
// const bcrypt = require("bcryptjs");
// const jwt = require("jsonwebtoken");
// const { body, validationResult } = require("express-validator");
// const { query } = require("../config/database");
// const { authenticate } = require("../middleware/auth");
// const logger = require("../utils/logger");

// const router = express.Router();

// // Register new user (admin only in production)
// router.post(
//   "/register",
//   [
//     body("nip").notEmpty().withMessage("NIP wajib diisi"),
//     body("name").notEmpty().withMessage("Nama wajib diisi"),
//     body("email").isEmail().withMessage("Email tidak valid"),
//     body("password")
//       .isLength({ min: 6 })
//       .withMessage("Password minimal 6 karakter"),
//     body("role")
//       .isIn(["admin", "coder", "reviewer"])
//       .withMessage("Role tidak valid"),
//   ],
//   async (req, res) => {
//     try {
//       const errors = validationResult(req);
//       if (!errors.isEmpty()) {
//         return res.status(400).json({
//           success: false,
//           errors: errors.array(),
//         });
//       }

//       const { nip, name, email, password, role } = req.body;

//       // Check if user exists
//       const existing = await query(
//         "SELECT id FROM users WHERE nip = ? OR email = ?",
//         [nip, email]
//       );

//       if (existing.length > 0) {
//         return res.status(400).json({
//           success: false,
//           message: "NIP atau email sudah terdaftar",
//         });
//       }

//       // Hash password
//       const hashedPassword = await bcrypt.hash(password, 10);

//       // Insert user
//       const result = await query(
//         "INSERT INTO users (nip, name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, ?)",
//         [nip, name, email, hashedPassword, role, true]
//       );

//       logger.info(`New user registered: ${email}`);

//       res.status(201).json({
//         success: true,
//         message: "User berhasil didaftarkan",
//         data: {
//           id: result.insertId,
//           nip,
//           name,
//           email,
//           role,
//         },
//       });
//     } catch (error) {
//       logger.error("Registration error:", error);
//       res.status(500).json({
//         success: false,
//         message: "Gagal mendaftarkan user",
//       });
//     }
//   }
// );

// // Login
// // POST /api/auth/login
// router.post(
//   "/login",
//   [
//     body("nip").notEmpty().withMessage("NIP wajib diisi"),
//     body("password").notEmpty().withMessage("Password wajib diisi"),
//   ],
//   async (req, res) => {
//     try {
//       // 1. Validasi input
//       const errors = validationResult(req);
//       if (!errors.isEmpty()) {
//         return res.status(400).json({
//           success: false,
//           errors: errors.array(),
//         });
//       }

//       const { nip, password } = req.body;

//       // 2. Cari user
//       const users = await query(
//         "SELECT * FROM users WHERE nip = ? AND is_active = true",
//         [nip]
//       );

//       // 3. User tidak ditemukan
//       if (!users || users.length === 0) {
//         return res.status(401).json({
//           success: false,
//           message: "NIP atau password salah",
//         });
//       }

//       const user = users[0];

//       // 4. Verifikasi password
//       const isValid = await bcrypt.compare(password, user.password_hash);
//       if (!isValid) {
//         return res.status(401).json({
//           success: false,
//           message: "NIP atau password salah",
//         });
//       }

//       // 5. Generate JWT
//       const token = jwt.sign(
//         { id: user.id, nip: user.nip, role: user.role },
//         process.env.JWT_SECRET,
//         { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
//       );

//       logger.info(`User logged in: ${user.nip}`);

//       // 6. Response sukses
//       return res.json({
//         success: true,
//         message: "Login berhasil",
//         data: {
//           token,
//           user: {
//             id: user.id,
//             nip: user.nip,
//             name: user.name,
//             email: user.email,
//             role: user.role,
//           },
//         },
//       });
//     } catch (error) {
//       logger.error("Login error:", error);
//       return res.status(500).json({
//         success: false,
//         message: "Gagal melakukan login",
//       });
//     }
//   }
// );

// // Get current user
// router.get("/me", authenticate, async (req, res) => {
//   try {
//     res.json({
//       success: true,
//       data: {
//         id: req.user.id,
//         nip: req.user.nip,
//         name: req.user.name,
//         email: req.user.email,
//         role: req.user.role,
//       },
//     });
//   } catch (error) {
//     logger.error("Get user error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Gagal mengambil data user",
//     });
//   }
// });

// // Change password
// router.post(
//   "/change-password",
//   authenticate,
//   [
//     body("currentPassword").notEmpty().withMessage("Password lama wajib diisi"),
//     body("newPassword")
//       .isLength({ min: 6 })
//       .withMessage("Password baru minimal 6 karakter"),
//   ],
//   async (req, res) => {
//     try {
//       const errors = validationResult(req);
//       if (!errors.isEmpty()) {
//         return res.status(400).json({
//           success: false,
//           errors: errors.array(),
//         });
//       }

//       const { currentPassword, newPassword } = req.body;

//       // Get user with password
//       const users = await query(
//         "SELECT password_hash FROM users WHERE id = ?",
//         [req.user.id]
//       );

//       // Verify current password
//       const isValid = await bcrypt.compare(
//         currentPassword,
//         users[0].password_hash
//       );
//       if (!isValid) {
//         return res.status(401).json({
//           success: false,
//           message: "Password lama salah",
//         });
//       }

//       // Hash new password
//       const hashedPassword = await bcrypt.hash(newPassword, 10);

//       // Update password
//       await query("UPDATE users SET password_hash = ? WHERE id = ?", [
//         hashedPassword,
//         req.user.id,
//       ]);

//       logger.info(`Password changed for user: ${req.user.email}`);

//       res.json({
//         success: true,
//         message: "Password berhasil diubah",
//       });
//     } catch (error) {
//       logger.error("Change password error:", error);
//       res.status(500).json({
//         success: false,
//         message: "Gagal mengubah password",
//       });
//     }
//   }
// );

// module.exports = router;
