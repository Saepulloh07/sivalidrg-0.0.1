// src/routes/validation.js
const express = require("express");
const axios = require("axios");
const { body, validationResult } = require("express-validator");
const { query } = require("../config/database");
const { authenticate } = require("../middleware/auth");
const logger = require("../utils/logger");

const router = express.Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const VALIDATION_TIMEOUT = parseInt(process.env.VALIDATION_TIMEOUT) || 120000; // 2 minutes

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/validation/run
 * Run full multi-agent validation
 */
router.post(
  "/run",
  [
    body("norm").notEmpty().withMessage("NoRM wajib diisi"),
    body("coding_case_id")
      .isInt({ min: 1 })
      .withMessage("Coding case ID tidak valid"),
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

      const { norm, coding_case_id } = req.body;

      // Verify coding case exists
      const cases = await query(
        `SELECT cc.*, d.patient_id, p.norm as patient_norm
         FROM coding_cases cc
         LEFT JOIN documents d ON cc.document_id = d.id
         LEFT JOIN patients p ON d.patient_id = p.id
         WHERE cc.id = ?`,
        [coding_case_id]
      );

      if (cases.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Coding case tidak ditemukan",
        });
      }

      const codingCase = cases[0];

      // Verify NoRM matches
      if (codingCase.patient_norm !== norm) {
        return res.status(400).json({
          success: false,
          message: `NoRM tidak sesuai. Expected: ${codingCase.patient_norm}, Got: ${norm}`,
        });
      }

      // Check if patient has medical records
      const [cppt, resumes] = await Promise.all([
        query("SELECT COUNT(*) as count FROM cppt WHERE norm = ?", [norm]),
        query("SELECT COUNT(*) as count FROM resume_medis WHERE norm = ?", [
          norm,
        ]),
      ]);

      if (cppt[0].count === 0 && resumes[0].count === 0) {
        return res.status(400).json({
          success: false,
          message: "Tidak ada data medis (CPPT/Resume) untuk pasien ini",
        });
      }

      logger.info(
        `Starting multi-agent validation for NoRM: ${norm}, Case: ${coding_case_id}`
      );

      try {
        // Call AI service validation endpoint
        const response = await axios.post(
          `${AI_SERVICE_URL}/api/v1/validate`,
          {
            norm: norm,
            coding_case_id: parseInt(coding_case_id),
          },
          {
            timeout: VALIDATION_TIMEOUT,
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
          }
        );

        const validationResult = response.data;

        logger.info(
          `Validation completed for case ${coding_case_id}. ` +
            `Status: ${validationResult.validation_status}, ` +
            `Score: ${validationResult.checklist_score}, ` +
            `Mismatches: ${validationResult.total_mismatches}`
        );

        // Return standardized response
        res.json({
          success: true,
          message: "Validasi berhasil dijalankan",
          data: {
            norm: validationResult.norm,
            coding_case_id: validationResult.coding_case_id,
            validation_status: validationResult.validation_status,
            total_mismatches: validationResult.total_mismatches,
            critical_issues: validationResult.critical_issues,
            checklist_score: validationResult.checklist_score,
            report: validationResult.report,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (aiError) {
        logger.error("AI service validation error:", {
          message: aiError.message,
          response: aiError.response?.data,
          status: aiError.response?.status,
          code: aiError.code,
        });

        // Handle specific AI service errors
        if (aiError.response) {
          const status = aiError.response.status;
          const errorData = aiError.response.data;

          if (status === 404) {
            return res.status(404).json({
              success: false,
              message:
                errorData.detail || "Coding case tidak ditemukan di AI service",
              ai_error: errorData,
            });
          } else if (status === 400) {
            return res.status(400).json({
              success: false,
              message: errorData.detail || "Request tidak valid",
              ai_error: errorData,
            });
          }

          return res.status(status).json({
            success: false,
            message: "AI service validation error",
            ai_error: errorData,
          });
        }

        // Handle network errors
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
      logger.error("Validation endpoint error:", error);
      res.status(500).json({
        success: false,
        message: "Gagal menjalankan validasi",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * GET /api/validation/results/:coding_case_id
 * Get validation results for a coding case
 */
router.get("/results/:coding_case_id", async (req, res) => {
  try {
    const { coding_case_id } = req.params;

    // Validate coding_case_id
    const caseId = parseInt(coding_case_id, 10);
    if (isNaN(caseId) || caseId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Coding case ID tidak valid",
      });
    }

    logger.info(`Getting validation results for case: ${caseId}`);

    // Try to get from AI service first
    try {
      const response = await axios.get(
        `${AI_SERVICE_URL}/api/v1/validation/${caseId}`,
        {
          timeout: 10000,
          headers: {
            Accept: "application/json",
          },
        }
      );

      // AI service returns the complete validation data structure
      return res.json({
        success: true,
        data: response.data,
        source: "ai_service",
        timestamp: new Date().toISOString(),
      });
    } catch (aiError) {
      // If AI service returns 404, it means no validation exists
      if (aiError.response && aiError.response.status === 404) {
        logger.info(`No validation found in AI service for case ${caseId}`);
        return res.status(404).json({
          success: false,
          message:
            "Hasil validasi tidak ditemukan. Jalankan validasi terlebih dahulu menggunakan POST /api/validation/run",
        });
      }

      // For other errors, try database fallback
      logger.warn("AI service unavailable, trying database fallback", {
        error: aiError.message,
        status: aiError.response?.status,
      });

      // Fallback: query directly from database
      const [mismatchFlags, checklist] = await Promise.all([
        query(
          `SELECT * FROM mismatch_flags 
           WHERE coding_case_id = ? 
           ORDER BY 
             CASE severity
               WHEN 'critical' THEN 1
               WHEN 'high' THEN 2
               WHEN 'medium' THEN 3
               WHEN 'low' THEN 4
             END,
             created_at DESC`,
          [caseId]
        ),
        query(
          "SELECT * FROM auto_checklists WHERE coding_case_id = ? ORDER BY created_at DESC LIMIT 1",
          [caseId]
        ),
      ]);

      if (mismatchFlags.length === 0 && checklist.length === 0) {
        return res.status(404).json({
          success: false,
          message:
            "Hasil validasi tidak ditemukan. Jalankan validasi terlebih dahulu.",
        });
      }

      // Parse checklist JSON if exists
      let checklistData = null;
      if (checklist.length > 0 && checklist[0].checklist_data) {
        try {
          checklistData =
            typeof checklist[0].checklist_data === "string"
              ? JSON.parse(checklist[0].checklist_data)
              : checklist[0].checklist_data;
        } catch (parseError) {
          logger.error("Failed to parse checklist JSON:", parseError);
        }
      }

      // Return data in same format as AI service
      return res.json({
        success: true,
        data: {
          coding_case_id: caseId,
          mismatch_flags: mismatchFlags.map((f) => ({
            id: f.id,
            type: f.mismatch_type,
            severity: f.severity,
            field: f.field_name,
            expected: f.expected_value,
            actual: f.actual_value,
            similarity_score: f.similarity_score,
            recommendation: f.recommendation,
            is_resolved: Boolean(f.is_resolved),
            created_at: f.created_at,
          })),
          checklist: checklistData,
          overall_score: checklist[0] ? checklist[0].overall_score : null,
          total_checks: checklist[0] ? checklist[0].total_checks : 0,
          passed_checks: checklist[0] ? checklist[0].passed_checks : 0,
          failed_checks: checklist[0] ? checklist[0].failed_checks : 0,
          created_at: checklist[0] ? checklist[0].created_at : null,
          has_validation: true,
        },
        source: "database_fallback",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error("Get validation results error:", {
      message: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      message: "Gagal mengambil hasil validasi",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * GET /api/validation/mismatches/:coding_case_id
 * Get mismatch flags for a coding case
 */
router.get("/mismatches/:coding_case_id", async (req, res) => {
  try {
    const { coding_case_id } = req.params;
    const { severity, is_resolved, type } = req.query;

    const caseId = parseInt(coding_case_id, 10);
    if (isNaN(caseId) || caseId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Coding case ID tidak valid",
      });
    }

    let sql = "SELECT * FROM mismatch_flags WHERE coding_case_id = ?";
    const params = [caseId];

    if (severity) {
      sql += " AND severity = ?";
      params.push(severity);
    }

    if (type) {
      sql += " AND mismatch_type = ?";
      params.push(type);
    }

    if (is_resolved !== undefined) {
      sql += " AND is_resolved = ?";
      params.push(is_resolved === "true" ? 1 : 0);
    }

    sql += ` ORDER BY 
      CASE severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
      END,
      created_at DESC`;

    const flags = await query(sql, params);

    // Calculate summary statistics
    const summary = {
      total: flags.length,
      by_severity: {
        critical: flags.filter((f) => f.severity === "critical").length,
        high: flags.filter((f) => f.severity === "high").length,
        medium: flags.filter((f) => f.severity === "medium").length,
        low: flags.filter((f) => f.severity === "low").length,
      },
      by_type: {},
      resolved: flags.filter((f) => f.is_resolved).length,
      unresolved: flags.filter((f) => !f.is_resolved).length,
    };

    // Count by type
    const types = [...new Set(flags.map((f) => f.mismatch_type))];
    types.forEach((type) => {
      summary.by_type[type] = flags.filter(
        (f) => f.mismatch_type === type
      ).length;
    });

    res.json({
      success: true,
      data: flags,
      summary,
    });
  } catch (error) {
    logger.error("Get mismatch flags error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data mismatch flags",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * PATCH /api/validation/mismatches/:id/resolve
 * Resolve a mismatch flag
 */
router.patch("/mismatches/:id/resolve", async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution_note } = req.body;

    const flagId = parseInt(id, 10);
    if (isNaN(flagId) || flagId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Mismatch flag ID tidak valid",
      });
    }

    const flags = await query("SELECT * FROM mismatch_flags WHERE id = ?", [
      flagId,
    ]);

    if (flags.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Mismatch flag tidak ditemukan",
      });
    }

    if (flags[0].is_resolved) {
      return res.status(400).json({
        success: false,
        message: "Mismatch flag sudah di-resolve sebelumnya",
      });
    }

    await query(
      "UPDATE mismatch_flags SET is_resolved = true, resolution_note = ?, updated_at = NOW() WHERE id = ?",
      [resolution_note || null, flagId]
    );

    logger.info(
      `Mismatch flag ${flagId} resolved by user ${req.user.id}${
        resolution_note ? ` with note: ${resolution_note}` : ""
      }`
    );

    res.json({
      success: true,
      message: "Mismatch flag berhasil di-resolve",
      data: {
        id: flagId,
        resolved_at: new Date(),
        resolved_by: req.user.id,
      },
    });
  } catch (error) {
    logger.error("Resolve mismatch flag error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal resolve mismatch flag",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * GET /api/validation/checklist/:coding_case_id
 * Get auto-checklist for a coding case
 */
router.get("/checklist/:coding_case_id", async (req, res) => {
  try {
    const { coding_case_id } = req.params;

    const caseId = parseInt(coding_case_id, 10);
    if (isNaN(caseId) || caseId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Coding case ID tidak valid",
      });
    }

    const checklists = await query(
      "SELECT * FROM auto_checklists WHERE coding_case_id = ? ORDER BY created_at DESC LIMIT 1",
      [caseId]
    );

    if (checklists.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "Checklist belum di-generate. Jalankan validasi terlebih dahulu.",
      });
    }

    const checklist = checklists[0];

    // Parse checklist JSON data
    let checklistData = null;
    if (checklist.checklist_data) {
      try {
        checklistData =
          typeof checklist.checklist_data === "string"
            ? JSON.parse(checklist.checklist_data)
            : checklist.checklist_data;
      } catch (parseError) {
        logger.error("Failed to parse checklist JSON:", parseError);
      }
    }

    res.json({
      success: true,
      data: {
        coding_case_id: checklist.coding_case_id,
        checklist_data: checklistData,
        summary: {
          overall_score: checklist.overall_score,
          total_checks: checklist.total_checks,
          passed_checks: checklist.passed_checks,
          failed_checks: checklist.failed_checks,
          quality_level: getQualityLevel(checklist.overall_score),
        },
        created_at: checklist.created_at,
        updated_at: checklist.updated_at,
      },
    });
  } catch (error) {
    logger.error("Get checklist error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data checklist",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * GET /api/validation/summary/:coding_case_id
 * Get validation summary statistics
 */
router.get("/summary/:coding_case_id", async (req, res) => {
  try {
    const { coding_case_id } = req.params;

    const caseId = parseInt(coding_case_id, 10);
    if (isNaN(caseId) || caseId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Coding case ID tidak valid",
      });
    }

    const [flags, checklist] = await Promise.all([
      query("SELECT * FROM mismatch_flags WHERE coding_case_id = ?", [caseId]),
      query(
        "SELECT * FROM auto_checklists WHERE coding_case_id = ? ORDER BY created_at DESC LIMIT 1",
        [caseId]
      ),
    ]);

    const hasCriticalIssues = flags.some((f) => f.severity === "critical");
    const checklistScore = checklist[0] ? checklist[0].overall_score : 0;

    const summary = {
      coding_case_id: caseId,
      has_validation: flags.length > 0 || checklist.length > 0,
      mismatch_flags: {
        total: flags.length,
        by_severity: {
          critical: flags.filter((f) => f.severity === "critical").length,
          high: flags.filter((f) => f.severity === "high").length,
          medium: flags.filter((f) => f.severity === "medium").length,
          low: flags.filter((f) => f.severity === "low").length,
        },
        by_type: {},
        resolved: flags.filter((f) => f.is_resolved).length,
        unresolved: flags.filter((f) => !f.is_resolved).length,
      },
      checklist:
        checklist.length > 0
          ? {
              overall_score: checklist[0].overall_score,
              total_checks: checklist[0].total_checks,
              passed_checks: checklist[0].passed_checks,
              failed_checks: checklist[0].failed_checks,
              quality_level: getQualityLevel(checklist[0].overall_score),
            }
          : null,
      overall_status: determineOverallStatus(hasCriticalIssues, checklistScore),
    };

    // Count by type
    const types = [...new Set(flags.map((f) => f.mismatch_type))];
    types.forEach((type) => {
      summary.mismatch_flags.by_type[type] = flags.filter(
        (f) => f.mismatch_type === type
      ).length;
    });

    res.json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Get validation summary error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil ringkasan validasi",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * GET /api/validation/history/:norm
 * Get validation history for a patient
 */
router.get("/history/:norm", async (req, res) => {
  try {
    const { norm } = req.params;
    const { limit = 20 } = req.query;

    if (!norm || norm.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "NoRM tidak valid",
      });
    }

    const results = await query(
      `
      SELECT 
        cc.id as coding_case_id,
        cc.status,
        cc.created_at,
        cc.updated_at,
        cc.finalized_at,
        ac.overall_score,
        ac.total_checks,
        ac.passed_checks,
        ac.failed_checks,
        COUNT(DISTINCT mf.id) as total_flags,
        COUNT(DISTINCT CASE WHEN mf.severity = 'critical' THEN mf.id END) as critical_flags,
        COUNT(DISTINCT CASE WHEN mf.is_resolved = 0 THEN mf.id END) as unresolved_flags
      FROM coding_cases cc
      LEFT JOIN documents d ON cc.document_id = d.id
      LEFT JOIN patients p ON d.patient_id = p.id
      LEFT JOIN auto_checklists ac ON cc.id = ac.coding_case_id
      LEFT JOIN mismatch_flags mf ON cc.id = mf.coding_case_id
      WHERE p.norm = ?
      GROUP BY cc.id
      ORDER BY cc.created_at DESC
      LIMIT ?
    `,
      [norm, parseInt(limit)]
    );

    res.json({
      success: true,
      data: results.map((r) => ({
        ...r,
        quality_level: r.overall_score
          ? getQualityLevel(r.overall_score)
          : null,
      })),
      count: results.length,
    });
  } catch (error) {
    logger.error("Get validation history error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil riwayat validasi",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// ============= Helper Functions =============

function getQualityLevel(score) {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Good";
  if (score >= 70) return "Fair";
  if (score >= 60) return "Poor";
  return "Critical";
}

function determineOverallStatus(hasCriticalIssues, checklistScore) {
  if (hasCriticalIssues) return "critical";
  if (checklistScore < 70) return "needs_review";
  if (checklistScore < 85) return "acceptable";
  return "excellent";
}

module.exports = router;
