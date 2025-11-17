// src/config/database.js
const mariadb = require("mariadb");
const logger = require("../utils/logger");

const pool = mariadb.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "sivalidrg",
  connectionLimit: 10,
  acquireTimeout: 30000,
  connectTimeout: 10000,
  timezone: "+07:00", // WIB
  // TAMBAHAN: Convert BigInt to Number automatically
  insertIdAsNumber: true,
  bigIntAsNumber: true,
});

// === HELPER: Convert BigInt to Number ===
const sanitizeBigInt = (obj) => {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === "bigint") {
    return Number(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeBigInt);
  }

  if (typeof obj === "object") {
    const result = {};
    for (const key in obj) {
      result[key] = sanitizeBigInt(obj[key]);
    }
    return result;
  }

  return obj;
};

// === TEST KONEKSI ===
(async () => {
  let conn;
  try {
    conn = await pool.getConnection();
    logger.info("Database connected successfully (MariaDB)");
    conn.release();
  } catch (err) {
    logger.error("Database connection failed:", {
      error: err.message,
      code: err.code,
      errno: err.errno,
    });
    process.exit(1);
  }
})();

// === QUERY HELPER ===
const query = async (sql, params = []) => {
  let conn;
  try {
    conn = await pool.getConnection();

    const result = await conn.execute(sql, params);

    // Sanitize BigInt before returning
    if (Array.isArray(result)) {
      return sanitizeBigInt(result);
    } else {
      return sanitizeBigInt({
        affectedRows: result.affectedRows,
        insertId: result.insertId,
        warningStatus: result.warningStatus,
      });
    }
  } catch (error) {
    logger.error("Query error:", {
      sql,
      params,
      error: error.message,
      code: error.code,
    });
    throw error; // Throw error instead of returning empty array
  } finally {
    if (conn) conn.release();
  }
};

// === TRANSACTION ===
const transaction = async (callback) => {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    const result = await callback(conn);
    await conn.commit();
    return sanitizeBigInt(result);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

module.exports = { pool, query, transaction, sanitizeBigInt };
