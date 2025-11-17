// seed.js
require("dotenv").config();
const { query } = require("./src/config/database");
const bcrypt = require("bcryptjs");

// Tunggu 3 detik agar koneksi stabil
setTimeout(async () => {
  console.log("Menjalankan seed admin...");

  try {
    const hash = await bcrypt.hash("admin123", 10);

    const users = await query("SELECT id FROM users WHERE nip = ?", ["admin"]);
    console.log("User ditemukan:", users.length);

    if (users.length > 0) {
      await query(
        `UPDATE users SET password_hash = ?, updated_at = NOW() WHERE nip = ?`,
        [hash, "admin"]
      );
      console.log("Admin diperbarui: admin / admin123");
    } else {
      await query(
        `INSERT INTO users 
         (nip, name, email, password_hash, role, is_active, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())`,
        ["admin", "Administrator", "admin@sivalidrg.com", hash, "admin"]
      );
      console.log("Admin dibuat: admin / admin123");
    }
  } catch (err) {
    console.error("Seed gagal:", err.message);
  } finally {
    process.exit();
  }
}, 3000);
