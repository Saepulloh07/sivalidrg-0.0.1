// src/routes/patients.js
const express = require("express");
const { body, validationResult } = require("express-validator");
const { query, sanitizeBigInt } = require("../config/database");
const { authenticate, authorize } = require("../middleware/auth");
const logger = require("../utils/logger");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all patients with pagination and search
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";

    let sql = "SELECT * FROM patients";
    let countSql = "SELECT COUNT(*) as total FROM patients";
    const params = [];

    if (search) {
      sql += " WHERE norm LIKE ? OR name LIKE ?";
      countSql += " WHERE norm LIKE ? OR name LIKE ?";
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const [patients, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, search ? [`%${search}%`, `%${search}%`] : []),
    ]);

    const total = countResult[0].total;

    res.json({
      success: true,
      data: sanitizeBigInt(patients),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error("Get patients error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data pasien",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Get patient by ID with full medical records
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const patients = await query("SELECT * FROM patients WHERE id = ?", [id]);

    if (patients.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pasien tidak ditemukan",
      });
    }

    const patient = patients[0];

    // Get related medical records
    const [cppt, surgeries, labs, vitals, resumes] = await Promise.all([
      query(
        "SELECT * FROM cppt WHERE norm = ? ORDER BY tanggal DESC, jam DESC LIMIT 10",
        [patient.norm]
      ),
      query(
        "SELECT * FROM laporan_operasi WHERE norm = ? ORDER BY tanggal_operasi DESC",
        [patient.norm]
      ),
      query(
        "SELECT * FROM penunjang WHERE norm = ? ORDER BY tanggal DESC LIMIT 10",
        [patient.norm]
      ),
      query(
        "SELECT * FROM observasi_vital WHERE norm = ? ORDER BY tanggal DESC, jam DESC LIMIT 10",
        [patient.norm]
      ),
      query(
        "SELECT * FROM resume_medis WHERE norm = ? ORDER BY created_at DESC LIMIT 5",
        [patient.norm]
      ),
    ]);

    res.json({
      success: true,
      data: sanitizeBigInt({
        patient,
        medical_records: {
          cppt,
          surgeries,
          labs,
          vitals,
          resumes,
        },
      }),
    });
  } catch (error) {
    logger.error("Get patient error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data pasien",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Get patient by NoRM
router.get("/norm/:norm", async (req, res) => {
  try {
    const { norm } = req.params;

    const patients = await query("SELECT * FROM patients WHERE norm = ?", [
      norm,
    ]);

    if (patients.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pasien tidak ditemukan",
      });
    }

    res.json({
      success: true,
      data: sanitizeBigInt(patients[0]),
    });
  } catch (error) {
    logger.error("Get patient by NoRM error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data pasien",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Create new patient
router.post(
  "/",
  [
    body("norm").notEmpty().withMessage("NoRM wajib diisi"),
    body("name").notEmpty().withMessage("Nama wajib diisi"),
    body("birth_date").isDate().withMessage("Tanggal lahir tidak valid"),
    body("gender")
      .isIn(["male", "female"])
      .withMessage("Jenis kelamin tidak valid"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { norm, name, birth_date, gender } = req.body;

      // Check if patient exists
      const existing = await query("SELECT id FROM patients WHERE norm = ?", [
        norm,
      ]);

      if (existing.length > 0) {
        return res.status(400).json({
          success: false,
          message: "NoRM sudah terdaftar",
        });
      }

      const result = await query(
        "INSERT INTO patients (norm, name, birth_date, gender) VALUES (?, ?, ?, ?)",
        [norm, name, birth_date, gender]
      );

      logger.info(`New patient created: ${norm}`);

      // Return sanitized data
      res.status(201).json({
        success: true,
        message: "Pasien berhasil ditambahkan",
        data: sanitizeBigInt({
          id: result.insertId,
          norm,
          name,
          birth_date,
          gender,
        }),
      });
    } catch (error) {
      logger.error("Create patient error:", error);
      res.status(500).json({
        success: false,
        message: "Gagal menambahkan pasien",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

// Update patient
router.put(
  "/:id",
  [
    body("name").optional().notEmpty().withMessage("Nama tidak boleh kosong"),
    body("birth_date")
      .optional()
      .isDate()
      .withMessage("Tanggal lahir tidak valid"),
    body("gender")
      .optional()
      .isIn(["male", "female"])
      .withMessage("Jenis kelamin tidak valid"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { id } = req.params;
      const { name, birth_date, gender } = req.body;

      const patients = await query("SELECT * FROM patients WHERE id = ?", [id]);

      if (patients.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Pasien tidak ditemukan",
        });
      }

      await query(
        "UPDATE patients SET name = ?, birth_date = ?, gender = ? WHERE id = ?",
        [
          name || patients[0].name,
          birth_date || patients[0].birth_date,
          gender || patients[0].gender,
          id,
        ]
      );

      logger.info(`Patient updated: ${id}`);

      res.json({
        success: true,
        message: "Data pasien berhasil diperbarui",
      });
    } catch (error) {
      logger.error("Update patient error:", error);
      res.status(500).json({
        success: false,
        message: "Gagal memperbarui data pasien",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

// Delete patient
router.delete("/:id", authorize("admin"), async (req, res) => {
  try {
    const { id } = req.params;

    const patients = await query("SELECT * FROM patients WHERE id = ?", [id]);

    if (patients.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pasien tidak ditemukan",
      });
    }

    // Check if patient has documents
    const documents = await query(
      "SELECT COUNT(*) as count FROM documents WHERE patient_id = ?",
      [id]
    );

    if (documents[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: "Tidak dapat menghapus pasien yang memiliki dokumen",
      });
    }

    await query("DELETE FROM patients WHERE id = ?", [id]);

    logger.info(`Patient deleted: ${id}`);

    res.json({
      success: true,
      message: "Pasien berhasil dihapus",
    });
  } catch (error) {
    logger.error("Delete patient error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus pasien",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

module.exports = router;
