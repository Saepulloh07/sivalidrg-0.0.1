// backend/services/auth-service/model/user.model.js
const { pool } = require("../../../config/database");
const bcrypt = require("bcryptjs");

// Helper to convert BigInt to Number in objects
const sanitizeBigInt = (obj) => {
  if (!obj) return obj;

  const sanitized = Array.isArray(obj) ? [] : {};

  for (const key in obj) {
    if (typeof obj[key] === "bigint") {
      sanitized[key] = Number(obj[key]);
    } else if (typeof obj[key] === "object" && obj[key] !== null) {
      sanitized[key] = sanitizeBigInt(obj[key]);
    } else {
      sanitized[key] = obj[key];
    }
  }

  return sanitized;
};

class User {
  static async findByNip(nip) {
    const conn = await pool.getConnection();
    try {
      const rows = await conn.query(
        "SELECT id, nip, name, email, password_hash, role, is_active FROM users WHERE nip = ?",
        [nip]
      );
      return rows[0] ? sanitizeBigInt(rows[0]) : null;
    } finally {
      conn.release();
    }
  }

  static async findByEmail(email) {
    const conn = await pool.getConnection();
    try {
      const rows = await conn.query(
        "SELECT id, nip, name, email, password_hash, role, is_active FROM users WHERE email = ?",
        [email]
      );
      return rows[0] ? sanitizeBigInt(rows[0]) : null;
    } finally {
      conn.release();
    }
  }

  static async findById(id) {
    const conn = await pool.getConnection();
    try {
      const rows = await conn.query(
        "SELECT id, nip, name, email, role, is_active FROM users WHERE id = ?",
        [id]
      );
      return rows[0] ? sanitizeBigInt(rows[0]) : null;
    } finally {
      conn.release();
    }
  }

  static async create({ nip, name, email, password, role = "coder" }) {
    const conn = await pool.getConnection();
    try {
      const password_hash = await bcrypt.hash(password, 10);
      const result = await conn.query(
        "INSERT INTO users (nip, name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, ?)",
        [nip, name, email, password_hash, role, true]
      );
      return sanitizeBigInt({
        id: result.insertId,
        nip,
        name,
        email,
        role,
        is_active: true,
      });
    } finally {
      conn.release();
    }
  }

  static async update(id, data) {
    const conn = await pool.getConnection();
    try {
      const fields = [];
      const values = [];

      if (data.name !== undefined) {
        fields.push("name = ?");
        values.push(data.name);
      }
      if (data.email !== undefined) {
        fields.push("email = ?");
        values.push(data.email);
      }
      if (data.role !== undefined) {
        fields.push("role = ?");
        values.push(data.role);
      }
      if (data.is_active !== undefined) {
        fields.push("is_active = ?");
        values.push(data.is_active);
      }

      if (fields.length === 0) return null;

      values.push(id);
      const sql = `UPDATE users SET ${fields.join(", ")} WHERE id = ?`;

      const result = await conn.query(sql, values);
      if (result.affectedRows === 0) return null;

      return await this.findById(id);
    } finally {
      conn.release();
    }
  }

  static async findAll({ page = 1, limit = 20, search = "" }) {
    const offset = (page - 1) * limit;
    const conn = await pool.getConnection();
    try {
      let query = `SELECT id, nip, name, email, role, is_active, created_at 
                   FROM users`;
      let countQuery = `SELECT COUNT(*) as total FROM users`;
      const params = [];
      const countParams = [];

      if (search) {
        const like = `%${search}%`;
        query += ` WHERE nip LIKE ? OR name LIKE ? OR email LIKE ?`;
        countQuery += ` WHERE nip LIKE ? OR name LIKE ? OR email LIKE ?`;
        params.push(like, like, like);
        countParams.push(like, like, like);
      }

      query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const rows = await conn.query(query, params);
      const countResult = await conn.query(countQuery, countParams);
      const total = Number(countResult[0].total);

      return {
        data: sanitizeBigInt(rows),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } finally {
      conn.release();
    }
  }

  static async comparePassword(plain, hashed) {
    return bcrypt.compare(plain, hashed);
  }
}

module.exports = User;
