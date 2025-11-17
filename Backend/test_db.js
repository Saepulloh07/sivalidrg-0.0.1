require('dotenv').config();
const mariadb = require('mariadb');

const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  port: +process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  connectionLimit: 5,
});

(async () => {
  let conn;
  try {
    conn = await pool.getConnection();
    console.log('Connected! Server version:', (await conn.query('SELECT VERSION()'))[0]['VERSION()']);
  } catch (e) {
    console.error('Connection failed:', e);
  } finally {
    if (conn) conn.release();
    process.exit();
  }
})();