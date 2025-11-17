// src/routes/documents.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const { body, validationResult } = require("express-validator");
const { query, transaction } = require("../config/database");
const { authenticate } = require("../middleware/auth");
const logger = require("../utils/logger");

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || "./uploads";
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedExts = (
      process.env.ALLOWED_EXTENSIONS || "pdf,doc,docx,txt"
    ).split(",");
    const ext = path.extname(file.originalname).toLowerCase().replace(".", "");

    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Hanya file ${allowedExts.join(", ")} yang diizinkan`));
    }
  },
});

// All routes require authentication
router.use(authenticate);

// Extract text from uploaded file
async function extractText(filePath, mimetype) {
  try {
    if (mimetype === "application/pdf") {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text;
    } else if (
      mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } else if (mimetype === "text/plain") {
      return await fs.readFile(filePath, "utf-8");
    } else {
      throw new Error("Unsupported file type");
    }
  } catch (error) {
    logger.error("Text extraction error:", error);
    throw new Error("Gagal mengekstrak teks dari file");
  }
}

// Get all documents with pagination
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const status = req.query.status;
    const patientId = req.query.patient_id;

    let sql = `
      SELECT d.*, p.norm, p.name as patient_name, u.name as uploader_name
      FROM documents d
      LEFT JOIN patients p ON d.patient_id = p.id
      LEFT JOIN users u ON d.upload_by = u.id
      WHERE 1=1
    `;
    let countSql = "SELECT COUNT(*) as total FROM documents WHERE 1=1";
    const params = [];

    if (status) {
      sql += " AND d.status = ?";
      countSql += " AND status = ?";
      params.push(status);
    }

    if (patientId) {
      sql += " AND d.patient_id = ?";
      countSql += " AND patient_id = ?";
      params.push(patientId);
    }

    sql += " ORDER BY d.created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const [documents, [{ total }]] = await Promise.all([
      query(sql, params),
      query(countSql, status || patientId ? params.slice(0, -2) : []),
    ]);

    res.json({
      success: true,
      data: documents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error("Get documents error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data dokumen",
    });
  }
});

// Get document by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const documents = await query(
      `
      SELECT d.*, p.norm, p.name as patient_name, u.name as uploader_name
      FROM documents d
      LEFT JOIN patients p ON d.patient_id = p.id
      LEFT JOIN users u ON d.upload_by = u.id
      WHERE d.id = ?
    `,
      [id]
    );

    if (documents.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Dokumen tidak ditemukan",
      });
    }

    res.json({
      success: true,
      data: documents[0],
    });
  } catch (error) {
    logger.error("Get document error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data dokumen",
    });
  }
});

// Upload new document
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "File tidak ditemukan",
      });
    }

    const { patient_id, source = "upload" } = req.body;

    if (!patient_id) {
      // Delete uploaded file
      await fs.unlink(req.file.path);
      return res.status(400).json({
        success: false,
        message: "Patient ID wajib diisi",
      });
    }

    // Verify patient exists
    const patients = await query("SELECT id FROM patients WHERE id = ?", [
      patient_id,
    ]);
    if (patients.length === 0) {
      await fs.unlink(req.file.path);
      return res.status(404).json({
        success: false,
        message: "Pasien tidak ditemukan",
      });
    }

    // Extract text from file
    logger.info(`Extracting text from file: ${req.file.filename}`);
    const rawText = await extractText(req.file.path, req.file.mimetype);

    if (!rawText || rawText.trim().length === 0) {
      await fs.unlink(req.file.path);
      return res.status(400).json({
        success: false,
        message: "File tidak mengandung teks yang dapat dibaca",
      });
    }

    // Insert document
    const result = await query(
      "INSERT INTO documents (patient_id, source, raw_text, upload_by, status) VALUES (?, ?, ?, ?, ?)",
      [patient_id, source, rawText, req.user.id, "uploaded"]
    );

    // Delete physical file after extraction (optional)
    // await fs.unlink(req.file.path);

    logger.info(`Document uploaded: ${result.insertId} by user ${req.user.id}`);

    res.status(201).json({
      success: true,
      message: "Dokumen berhasil diupload",
      data: {
        id: result.insertId,
        patient_id,
        source,
        text_length: rawText.length,
        status: "uploaded",
      },
    });
  } catch (error) {
    logger.error("Upload document error:", error);

    // Clean up file on error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        logger.error("Failed to delete file:", unlinkError);
      }
    }

    res.status(500).json({
      success: false,
      message: error.message || "Gagal mengupload dokumen",
    });
  }
});

// Update document status
router.patch(
  "/:id/status",
  [
    body("status")
      .isIn([
        "uploaded",
        "processing",
        "ai_processing",
        "ai_completed",
        "finalized",
        "failed",
      ])
      .withMessage("Status tidak valid"),
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
      const { status } = req.body;

      const documents = await query("SELECT * FROM documents WHERE id = ?", [
        id,
      ]);
      if (documents.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Dokumen tidak ditemukan",
        });
      }

      await query("UPDATE documents SET status = ? WHERE id = ?", [status, id]);

      logger.info(`Document status updated: ${id} -> ${status}`);

      res.json({
        success: true,
        message: "Status dokumen berhasil diperbarui",
      });
    } catch (error) {
      logger.error("Update document status error:", error);
      res.status(500).json({
        success: false,
        message: "Gagal memperbarui status dokumen",
      });
    }
  }
);

// Delete document
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const documents = await query("SELECT * FROM documents WHERE id = ?", [id]);
    if (documents.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Dokumen tidak ditemukan",
      });
    }

    // Check if document can be deleted
    const codingCases = await query(
      "SELECT id FROM coding_cases WHERE document_id = ?",
      [id]
    );
    if (codingCases.length > 0 && codingCases[0].status === "finalized") {
      return res.status(400).json({
        success: false,
        message: "Tidak dapat menghapus dokumen yang sudah finalized",
      });
    }

    await query("DELETE FROM documents WHERE id = ?", [id]);

    logger.info(`Document deleted: ${id}`);

    res.json({
      success: true,
      message: "Dokumen berhasil dihapus",
    });
  } catch (error) {
    logger.error("Delete document error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus dokumen",
    });
  }
});

module.exports = router;
