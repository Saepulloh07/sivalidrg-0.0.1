// src/routes/coding.js - COMPLETE MODIFIED VERSION
const express = require("express");
const axios = require("axios");
const { body, validationResult } = require("express-validator");
const { query } = require("../config/database");
const { authenticate, authorize } = require("../middleware/auth");
const logger = require("../utils/logger");

const router = express.Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const AI_TIMEOUT = parseInt(process.env.AI_SERVICE_TIMEOUT) || 120000;

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/coding/cases
 * Get all coding cases with pagination and filters
 */
router.get("/cases", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const status = req.query.status;
    const assignedTo = req.query.assigned_to;
    const search = req.query.search || "";
    const myOnly = req.query.my_only === "true" || req.query.my_only === true;

    let sql = `
      SELECT 
        cc.*,
        p.norm,
        p.name AS patient_name,
        u.name AS assignee_name,
        COUNT(DISTINCT ar.id) AS ai_recommendations_count,
        COUNT(DISTINCT fc.id) AS final_codes_count,
        ac.overall_score as validation_score,
        COUNT(DISTINCT mf.id) as mismatch_count,
        TIMESTAMPDIFF(SECOND, cc.updated_at, NOW()) as seconds_since_update
      FROM coding_cases cc
      LEFT JOIN documents d ON cc.document_id = d.id
      LEFT JOIN patients p ON d.patient_id = p.id
      LEFT JOIN users u ON cc.assigned_to = u.id
      LEFT JOIN ai_recommendations ar ON cc.id = ar.coding_case_id
      LEFT JOIN final_codes fc ON cc.id = fc.coding_case_id
      LEFT JOIN auto_checklists ac ON cc.id = ac.coding_case_id
      LEFT JOIN mismatch_flags mf ON cc.id = mf.coding_case_id
      WHERE 1=1
    `;

    let countSql = `
      SELECT COUNT(DISTINCT cc.id) AS total 
      FROM coding_cases cc
      LEFT JOIN documents d ON cc.document_id = d.id
      LEFT JOIN patients p ON d.patient_id = p.id 
      WHERE 1=1
    `;

    const params = [];
    const countParams = [];

    if (status) {
      sql += " AND cc.status = ?";
      countSql += " AND cc.status = ?";
      params.push(status);
      countParams.push(status);
    }

    if (assignedTo) {
      sql += " AND cc.assigned_to = ?";
      countSql += " AND cc.assigned_to = ?";
      params.push(assignedTo);
      countParams.push(assignedTo);
    }

    if (myOnly) {
      sql += " AND cc.assigned_to = ?";
      countSql += " AND cc.assigned_to = ?";
      params.push(req.user.id);
      countParams.push(req.user.id);
    }

    if (search) {
      sql += " AND (p.norm LIKE ? OR p.name LIKE ?)";
      countSql += " AND (p.norm LIKE ? OR p.name LIKE ?)";
      const like = `%${search}%`;
      params.push(like, like);
      countParams.push(like, like);
    }

    sql += ` GROUP BY cc.id ORDER BY cc.updated_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [cases, [{ total }]] = await Promise.all([
      query(sql, params),
      query(countSql, countParams),
    ]);

    const casesWithStuckFlag = cases.map((c) => ({
      ...c,
      is_stuck: c.status === "ai_processing" && c.seconds_since_update > 600,
    }));

    res.json({
      success: true,
      data: casesWithStuckFlag,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error("Get coding cases error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data coding cases",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * GET /api/coding/cases/:id
 * Get single coding case detail
 */
router.get("/cases/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const sql = `
      SELECT 
        cc.id,
        cc.document_id,
        cc.status,
        cc.assigned_to,
        cc.created_at,
        cc.updated_at,
        cc.finalized_at,
        p.norm,
        p.name AS patient_name,
        p.birth_date,
        p.gender,
        u.name AS assignee_name,
        d.raw_text AS document_text,
        d.status AS document_status,
        d.id AS document_ref_id,
        TIMESTAMPDIFF(SECOND, cc.updated_at, NOW()) AS seconds_since_update
      FROM coding_cases cc
      LEFT JOIN documents d ON cc.document_id = d.id
      LEFT JOIN patients p ON d.patient_id = p.id
      LEFT JOIN users u ON cc.assigned_to = u.id
      WHERE cc.id = ?
    `;

    const cases = await query(sql, [id]);

    if (!cases || cases.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Coding case tidak ditemukan",
      });
    }

    const codingCase = cases[0];
    const isStuck =
      codingCase.status === "ai_processing" &&
      codingCase.seconds_since_update > 600;

    const recommendations = await query(
      `SELECT 
         ar.id,
         ar.coding_case_id,
         ar.code,
         ar.code_type,
         ar.description AS ai_description,
         ar.confidence,
         ar.evidence,
         ar.highlight_start,
         ar.highlight_end,
         ar.created_at,
         icd.description AS icd_description,
         icd.category AS icd_category
       FROM ai_recommendations ar
       LEFT JOIN icd_master icd ON ar.code = icd.code AND ar.code_type = icd.code_type
       WHERE ar.coding_case_id = ?
       ORDER BY ar.confidence DESC`,
      [id]
    );

    const finalCodes = await query(
      `SELECT 
         fc.id,
         fc.coding_case_id,
         fc.code,
         fc.code_type,
         fc.description AS final_description,
         fc.source,
         fc.added_by,
         fc.created_at,
         u.name AS added_by_name,
         icd.description AS icd_description,
         icd.category AS icd_category
       FROM final_codes fc
       LEFT JOIN users u ON fc.added_by = u.id
       LEFT JOIN icd_master icd ON fc.code = icd.code AND fc.code_type = icd.code_type
       WHERE fc.coding_case_id = ?
       ORDER BY fc.code_type, fc.created_at DESC`,
      [id]
    );

    const [checklist] = await query(
      `SELECT * FROM auto_checklists WHERE coding_case_id = ?`,
      [id]
    );

    const mismatchFlags = await query(
      `SELECT 
         mf.id,
         mf.coding_case_id,
         mf.mismatch_type,
         mf.severity,
         mf.field_name,
         mf.expected_value,
         mf.actual_value,
         mf.similarity_score,
         mf.recommendation,
         mf.is_resolved,
         mf.created_at
       FROM mismatch_flags mf
       WHERE mf.coding_case_id = ?
       ORDER BY mf.severity DESC, mf.created_at DESC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...codingCase,
        is_stuck: isStuck,
        recommendations,
        final_codes: finalCodes,
        checklist: checklist || null,
        mismatch_flags: mismatchFlags,
      },
    });
  } catch (error) {
    logger.error("Get coding case detail error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil detail coding case",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * GET /api/coding/documents/:id/status
 * Check document status and available actions
 */
router.get("/documents/:id/status", async (req, res) => {
  try {
    const { id } = req.params;

    const documents = await query("SELECT * FROM documents WHERE id = ?", [id]);

    if (documents.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Dokumen tidak ditemukan",
      });
    }

    try {
      const response = await axios.get(
        `${AI_SERVICE_URL}/api/v1/document/${id}/status`,
        {
          timeout: 10000,
          headers: {
            Accept: "application/json",
          },
        }
      );

      res.json({
        success: true,
        data: response.data,
        timestamp: new Date().toISOString(),
      });
    } catch (aiError) {
      logger.warn("AI service unavailable for status check, using database", {
        error: aiError.message,
      });

      const doc = documents[0];
      const codingCase = await query(
        "SELECT * FROM coding_cases WHERE document_id = ? ORDER BY created_at DESC LIMIT 1",
        [id]
      );

      res.json({
        success: true,
        data: {
          document_id: doc.id,
          document_status: doc.status,
          coding_case: codingCase.length > 0 ? codingCase[0] : null,
          can_process: doc.status === "uploaded" || doc.status === "failed",
          can_reprocess: codingCase.length > 0,
          is_stuck: false,
          available_actions: [],
          source: "database_fallback",
        },
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error("Get document status error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil status dokumen",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * POST /api/coding/infer
 * Start AI inference for a document
 * MODIFIED: Support skip_icd_matching and handle manual entry
 */
router.post(
  "/infer",
  [
    body("document_id")
      .isInt({ min: 1 })
      .withMessage("Document ID tidak valid"),
    body("skip_icd_matching")
      .optional()
      .isBoolean()
      .withMessage("skip_icd_matching harus boolean"),
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

      const { document_id, skip_icd_matching = false } = req.body;

      const documents = await query(
        `SELECT d.*, p.norm, p.name as patient_name
         FROM documents d
         LEFT JOIN patients p ON d.patient_id = p.id
         WHERE d.id = ?`,
        [document_id]
      );

      if (documents.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Dokumen tidak ditemukan",
        });
      }

      const document = documents[0];

      logger.info(
        `🚀 Starting AI inference for document ${document_id}, NoRM: ${document.norm}, Skip ICD: ${skip_icd_matching}`
      );

      try {
        const aiResponse = await axios.post(
          `${AI_SERVICE_URL}/api/v1/infer`,
          {
            document_id,
            run_validation: true,
            skip_icd_matching,
          },
          { timeout: AI_TIMEOUT }
        );

        const aiResult = aiResponse.data;

        // MODIFIED: Handle manual_entry_required flag
        if (
          aiResult.manual_entry_required ||
          aiResult.total_recommendations === 0
        ) {
          logger.info(
            `⚠️ No ICD matches for document ${document_id}, manual entry required`
          );
          logger.info(
            `✅ Validation status: ${
              aiResult.validation_report?.overall_status || "N/A"
            }`
          );

          return res.json({
            success: true,
            data: aiResult,
            message:
              aiResult.message ||
              "⚠️ No ICD codes matched. Add codes manually. Validation completed.",
            manual_entry_required: true,
            validation_completed: Boolean(aiResult.validation_report),
            priority_message:
              "🔥 VALIDATION COMPLETED - Please add ICD codes manually",
          });
        }

        logger.info(
          `✅ Inference completed: ${aiResult.total_recommendations} recommendations`
        );

        res.json({
          success: true,
          data: aiResult,
          message: aiResult.message || "Inference berhasil diproses",
        });
      } catch (error) {
        if (error.response && error.response.status === 400) {
          const aiError = error.response.data.detail;

          if (
            aiError.error === "Document is currently being processed" &&
            aiError.is_stuck
          ) {
            logger.info(`Document ${document_id} is stuck, forcing reprocess`);

            const reprocessResponse = await axios.post(
              `${AI_SERVICE_URL}/api/v1/infer/reprocess?force=true`,
              { document_id, run_validation: true, skip_icd_matching },
              { timeout: AI_TIMEOUT }
            );

            return res.json({
              success: true,
              data: reprocessResponse.data,
              message: "Inference reprocessed due to stuck status",
            });
          } else {
            return res.status(409).json({
              success: false,
              message: "Dokumen sedang diproses",
              details: aiError,
            });
          }
        }

        logger.error("AI inference failed:", error);
        return res.status(error.response?.status || 500).json({
          success: false,
          message: "Gagal memproses inference",
          error: error.message,
        });
      }
    } catch (error) {
      logger.error("Inference request error:", error);
      res.status(500).json({
        success: false,
        message: "Gagal memproses request",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * POST /api/coding/infer/reprocess
 * Re-process document (AI Service v1.1 feature)
 * MODIFIED: Add skip_icd_matching parameter
 */
router.post(
  "/infer/reprocess",
  [
    body("document_id")
      .isInt({ min: 1 })
      .withMessage("Document ID tidak valid"),
    body("run_validation").optional().isBoolean(),
    body("skip_icd_matching").optional().isBoolean(),
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

      const {
        document_id,
        run_validation = true,
        skip_icd_matching = false,
      } = req.body;

      const force = req.query.force === "true";

      const documents = await query(
        `SELECT d.*, p.norm 
         FROM documents d
         LEFT JOIN patients p ON d.patient_id = p.id
         WHERE d.id = ?`,
        [document_id]
      );

      if (documents.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Dokumen tidak ditemukan",
        });
      }

      const document = documents[0];

      logger.info(
        `🔄 Reprocessing document ${document_id}, NoRM: ${document.norm}, Force: ${force}, Skip ICD: ${skip_icd_matching}`
      );

      try {
        const response = await axios.post(
          `${AI_SERVICE_URL}/api/v1/infer/reprocess${
            force ? "?force=true" : ""
          }`,
          {
            document_id: parseInt(document_id),
            run_validation: Boolean(run_validation),
            skip_icd_matching: Boolean(skip_icd_matching),
          },
          {
            timeout: AI_TIMEOUT,
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        const aiResult = response.data;

        logger.info(
          `✅ Reprocess completed for document ${document_id}. ` +
            `Coding case: ${aiResult.coding_case_id}, ` +
            `Recommendations: ${aiResult.total_recommendations}, ` +
            `Manual entry: ${aiResult.manual_entry_required || false}`
        );

        await query("UPDATE documents SET status = ? WHERE id = ?", [
          aiResult.status || "ai_completed",
          document_id,
        ]);

        res.json({
          success: true,
          message: "Dokumen berhasil diproses ulang",
          data: {
            ...aiResult,
            reprocessed: true,
            forced: force,
            manual_entry_required: aiResult.manual_entry_required || false,
          },
        });
      } catch (aiError) {
        logger.error("AI service reprocess error:", {
          message: aiError.message,
          response: aiError.response?.data,
          status: aiError.response?.status,
        });

        if (aiError.response) {
          const status = aiError.response.status;
          const errorData = aiError.response.data;

          if (status === 409) {
            return res.status(409).json({
              success: false,
              message:
                errorData.detail?.message ||
                "Dokumen tidak dapat diproses ulang",
              error: errorData.detail,
            });
          }

          if (status === 404) {
            return res.status(404).json({
              success: false,
              message: "Dokumen tidak ditemukan di AI service",
              ai_error: errorData,
            });
          }

          return res.status(status).json({
            success: false,
            message: "AI service reprocess error",
            ai_error: errorData,
          });
        }

        if (aiError.code === "ECONNREFUSED" || aiError.code === "ETIMEDOUT") {
          return res.status(503).json({
            success: false,
            message: "AI service tidak dapat dihubungi",
            error: "Service unavailable",
          });
        }

        throw aiError;
      }
    } catch (error) {
      logger.error("Reprocess endpoint error:", error);
      res.status(500).json({
        success: false,
        message: "Gagal melakukan reprocess",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * POST /api/coding/cases/:id/assign
 * Assign coding case to a user
 */
router.post(
  "/cases/:id/assign",
  [body("assigned_to").isInt({ min: 1 }).withMessage("User ID tidak valid")],
  authorize("admin", "reviewer"),
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
      const { assigned_to } = req.body;

      const cases = await query("SELECT * FROM coding_cases WHERE id = ?", [
        id,
      ]);
      if (cases.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Coding case tidak ditemukan",
        });
      }

      const users = await query(
        "SELECT * FROM users WHERE id = ? AND role IN (?, ?) AND is_active = true",
        [assigned_to, "coder", "reviewer"]
      );
      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User tidak ditemukan atau tidak memiliki role yang sesuai",
        });
      }

      await query(
        "UPDATE coding_cases SET assigned_to = ?, updated_at = NOW() WHERE id = ?",
        [assigned_to, id]
      );

      logger.info(
        `Coding case ${id} assigned to user ${assigned_to} by ${req.user.id}`
      );

      res.json({
        success: true,
        message: "Coding case berhasil diassign",
        data: {
          coding_case_id: id,
          assigned_to: assigned_to,
          assigned_to_name: users[0].name,
        },
      });
    } catch (error) {
      logger.error("Assign coding case error:", error);
      res.status(500).json({
        success: false,
        message: "Gagal assign coding case",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * POST /api/coding/cases/:id/codes
 * Add final code (manual or accept AI recommendation)
 */
router.post(
  "/cases/:id/codes",
  [
    body("code").notEmpty().withMessage("Kode ICD wajib diisi"),
    body("code_type")
      .isIn(["diagnosis", "procedure"])
      .withMessage("Code type tidak valid"),
    body("description").notEmpty().withMessage("Deskripsi wajib diisi"),
    body("source").isIn(["ai", "manual"]).withMessage("Source tidak valid"),
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
      const { code, code_type, description, source } = req.body;

      const cases = await query("SELECT * FROM coding_cases WHERE id = ?", [
        id,
      ]);
      if (cases.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Coding case tidak ditemukan",
        });
      }

      if (cases[0].status === "finalized") {
        return res.status(400).json({
          success: false,
          message:
            "Tidak dapat menambahkan kode pada case yang sudah finalized",
        });
      }

      const existing = await query(
        "SELECT id FROM final_codes WHERE coding_case_id = ? AND code = ? AND code_type = ?",
        [id, code, code_type]
      );

      if (existing.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Kode ICD sudah ditambahkan sebelumnya",
        });
      }

      const icdCodes = await query(
        "SELECT * FROM icd_master WHERE code = ? AND code_type = ?",
        [code, code_type]
      );

      if (icdCodes.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Kode ICD tidak ditemukan dalam master database",
        });
      }

      const result = await query(
        `INSERT INTO final_codes 
        (coding_case_id, code, code_type, description, source, added_by) 
        VALUES (?, ?, ?, ?, ?, ?)`,
        [id, code, code_type, description, source, req.user.id]
      );

      await query("UPDATE coding_cases SET updated_at = NOW() WHERE id = ?", [
        id,
      ]);

      logger.info(
        `Final code added to case ${id}: ${code} (${code_type}) by user ${req.user.id} - source: ${source}`
      );

      res.status(201).json({
        success: true,
        message: "Kode ICD berhasil ditambahkan",
        data: {
          id: result.insertId,
          code,
          code_type,
          description,
          source,
          icd_info: icdCodes[0],
        },
      });
    } catch (error) {
      logger.error("Add final code error:", error);
      res.status(500).json({
        success: false,
        message: "Gagal menambahkan kode ICD",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * DELETE /api/coding/cases/:id/codes/:codeId
 * Delete final code
 */
router.delete("/cases/:id/codes/:codeId", async (req, res) => {
  try {
    const { id, codeId } = req.params;

    const codes = await query(
      "SELECT * FROM final_codes WHERE id = ? AND coding_case_id = ?",
      [codeId, id]
    );

    if (codes.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Kode ICD tidak ditemukan",
      });
    }

    const cases = await query("SELECT status FROM coding_cases WHERE id = ?", [
      id,
    ]);
    if (cases[0].status === "finalized") {
      return res.status(400).json({
        success: false,
        message: "Tidak dapat menghapus kode dari case yang sudah finalized",
      });
    }

    await query("DELETE FROM final_codes WHERE id = ?", [codeId]);

    logger.info(
      `Final code ${codeId} deleted from case ${id} by user ${req.user.id}`
    );

    res.json({
      success: true,
      message: "Kode ICD berhasil dihapus",
    });
  } catch (error) {
    logger.error("Delete final code error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus kode ICD",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * POST /api/coding/cases/:id/finalize
 * Finalize coding case
 */
router.post(
  "/cases/:id/finalize",
  authorize("reviewer", "admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const cases = await query("SELECT * FROM coding_cases WHERE id = ?", [
        id,
      ]);
      if (cases.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Coding case tidak ditemukan",
        });
      }

      if (cases[0].status === "finalized") {
        return res.status(400).json({
          success: false,
          message: "Coding case sudah dalam status finalized",
        });
      }

      const finalCodes = await query(
        "SELECT COUNT(*) as count FROM final_codes WHERE coding_case_id = ?",
        [id]
      );
      if (finalCodes[0].count === 0) {
        return res.status(400).json({
          success: false,
          message:
            "Tidak ada kode ICD yang ditambahkan. Minimal harus ada 1 kode.",
        });
      }

      await query(
        "UPDATE coding_cases SET status = ?, finalized_at = NOW(), updated_at = NOW() WHERE id = ?",
        ["finalized", id]
      );

      await query(
        "UPDATE documents d JOIN coding_cases cc ON d.id = cc.document_id SET d.status = ? WHERE cc.id = ?",
        ["finalized", id]
      );

      logger.info(`Coding case ${id} finalized by user ${req.user.id}`);

      res.json({
        success: true,
        message: "Coding case berhasil di-finalize",
        data: {
          coding_case_id: id,
          finalized_at: new Date(),
        },
      });
    } catch (error) {
      logger.error("Finalize coding case error:", error);
      res.status(500).json({
        success: false,
        message: "Gagal finalize coding case",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * GET /api/coding/icd/search
 * Search ICD codes
 */
router.get("/icd/search", async (req, res) => {
  try {
    const { query: searchQuery, type, limit = 20 } = req.query;

    if (!searchQuery || searchQuery.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Query pencarian wajib diisi",
      });
    }

    let sql = `
      SELECT code, code_type, description, category
      FROM icd_master 
      WHERE description LIKE ? OR code LIKE ?
    `;
    const params = [`%${searchQuery}%`, `%${searchQuery}%`];

    if (type && (type === "diagnosis" || type === "procedure")) {
      sql += " AND code_type = ?";
      params.push(type);
    }

    sql +=
      " ORDER BY CASE WHEN code LIKE ? THEN 0 ELSE 1 END, description LIMIT ?";
    params.push(`${searchQuery}%`, parseInt(limit));

    const results = await query(sql, params);

    res.json({
      success: true,
      data: results,
      count: results.length,
      query: searchQuery,
    });
  } catch (error) {
    logger.error("ICD search error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mencari kode ICD",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * GET /api/coding/icd/:code
 * Get ICD code detail
 */
router.get("/icd/:code", async (req, res) => {
  try {
    const { code } = req.params;
    const { type } = req.query;

    let sql = "SELECT * FROM icd_master WHERE code = ?";
    const params = [code];

    if (type) {
      sql += " AND code_type = ?";
      params.push(type);
    }

    const results = await query(sql, params);

    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Kode ICD tidak ditemukan",
      });
    }

    res.json({
      success: true,
      data: results[0],
    });
  } catch (error) {
    logger.error("Get ICD code error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil detail kode ICD",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * GET /api/coding/cases/:id/codes
 * Get final codes for a coding case
 */
router.get("/cases/:id/codes", async (req, res) => {
  try {
    const { id } = req.params;

    const cases = await query("SELECT * FROM coding_cases WHERE id = ?", [id]);
    if (cases.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Coding case tidak ditemukan",
      });
    }

    const finalCodes = await query(
      `SELECT fc.*, u.name AS added_by_name, icd.description AS icd_description,
              icd.category
       FROM final_codes fc
       LEFT JOIN users u ON fc.added_by = u.id
       LEFT JOIN icd_master icd ON fc.code = icd.code AND fc.code_type = icd.code_type
       WHERE fc.coding_case_id = ?
       ORDER BY fc.code_type, fc.created_at DESC`,
      [id]
    );

    const groupedCodes = {
      diagnosis: finalCodes.filter((c) => c.code_type === "diagnosis"),
      procedure: finalCodes.filter((c) => c.code_type === "procedure"),
    };

    res.json({
      success: true,
      data: {
        codes: finalCodes,
        grouped: groupedCodes,
        summary: {
          total: finalCodes.length,
          diagnosis_count: groupedCodes.diagnosis.length,
          procedure_count: groupedCodes.procedure.length,
          ai_sourced: finalCodes.filter((c) => c.source === "ai").length,
          manual_sourced: finalCodes.filter((c) => c.source === "manual")
            .length,
        },
      },
    });
  } catch (error) {
    logger.error("Get final codes error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data kode ICD",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

module.exports = router;
