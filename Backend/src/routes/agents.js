// src/routes/agents.js
const express = require("express");
const axios = require("axios");
const { authenticate } = require("../middleware/auth");
const logger = require("../utils/logger");

const router = express.Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

// All routes require authentication
router.use(authenticate);

/**
 * Get AI service health status
 */
router.get("/health", async (req, res) => {
  try {
    const response = await axios.get(`${AI_SERVICE_URL}/api/v1/health`, {
      timeout: 5000,
    });

    res.json({
      success: true,
      data: {
        ai_service: response.data,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("AI service health check failed:", error.message);
    res.status(503).json({
      success: false,
      message: "AI service tidak tersedia",
      error: error.message,
    });
  }
});

/**
 * Get information about all agents
 */
router.get("/info", (req, res) => {
  res.json({
    success: true,
    data: {
      agents: [
        {
          id: 1,
          name: "MismatchChecker",
          description:
            "Memeriksa konsistensi diagnosis antara CPPT dan Resume Medis",
          capabilities: [
            "Fuzzy string matching untuk diagnosis",
            "Semantic similarity menggunakan Sentence-BERT",
            "Validasi dukungan hasil lab untuk diagnosis",
            "Pemeriksaan vital signs",
            "Deteksi medical synonyms",
          ],
          outputs: [
            "Mismatch flags dengan severity level",
            "Similarity scores",
            "Rekomendasi perbaikan",
          ],
        },
        {
          id: 2,
          name: "ICDValidator",
          description: "Memvalidasi kode ICD-10 dan ICD-9-CM",
          capabilities: [
            "Verifikasi kode ICD dalam master database",
            "Semantic consistency checking",
            "Pemeriksaan kelengkapan dokumentasi",
            "Validasi prosedur dengan laporan operasi",
            "ICD code suggestion dengan semantic search",
          ],
          outputs: [
            "ICD validation flags",
            "Documentation completeness score",
            "Alternative code suggestions",
          ],
        },
        {
          id: 3,
          name: "AutoChecklist",
          description: "Menghasilkan checklist validasi komprehensif",
          capabilities: [
            "Diagnosis match checking",
            "Lab support verification",
            "ICD code validity",
            "Documentation completeness",
            "Duration anomaly detection",
            "Vital signs recording check",
            "CPPT frequency analysis",
            "Procedure documentation validation",
          ],
          outputs: [
            "Comprehensive checklist dengan 8+ checks",
            "Overall quality score",
            "Quality level classification",
            "Detailed recommendations",
          ],
        },
      ],
      integration: {
        orchestrator: "MultiAgentOrchestrator",
        execution_mode: "Sequential with error handling",
        average_execution_time: "10-30 seconds",
      },
    },
  });
});

/**
 * Run single agent independently
 */
router.post("/run-single", async (req, res) => {
  try {
    const { agent_name, norm, coding_case_id } = req.body;

    if (!agent_name || !norm) {
      return res.status(400).json({
        success: false,
        message: "agent_name dan norm wajib diisi",
      });
    }

    const validAgents = ["mismatch", "icd", "checklist"];
    if (!validAgents.includes(agent_name.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Agent tidak valid. Pilih: ${validAgents.join(", ")}`,
      });
    }

    logger.info(`Running single agent: ${agent_name} for NoRM: ${norm}`);

    // This would call a dedicated endpoint in Python service
    // For now, we'll use the full validation endpoint
    const response = await axios.post(
      `${AI_SERVICE_URL}/api/v1/validate`,
      {
        norm,
        coding_case_id: coding_case_id || null,
      },
      {
        timeout: 60000,
      }
    );

    res.json({
      success: true,
      message: `Agent ${agent_name} berhasil dijalankan`,
      data: response.data,
    });
  } catch (error) {
    logger.error("Run single agent error:", error);

    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        message: "AI service error",
        error: error.response.data,
      });
    }

    res.status(500).json({
      success: false,
      message: "Gagal menjalankan agent",
    });
  }
});

/**
 * Get agent execution statistics
 */
router.get("/statistics", async (req, res) => {
  try {
    const { query } = require("../config/database");

    // Get validation statistics
    const [totalValidations] = await query(`
      SELECT COUNT(DISTINCT coding_case_id) as total
      FROM auto_checklists
    `);

    const [avgScore] = await query(`
      SELECT AVG(overall_score) as avg_score
      FROM auto_checklists
    `);

    const [qualityDistribution] = await query(`
      SELECT 
        SUM(CASE WHEN overall_score >= 90 THEN 1 ELSE 0 END) as excellent,
        SUM(CASE WHEN overall_score >= 80 AND overall_score < 90 THEN 1 ELSE 0 END) as good,
        SUM(CASE WHEN overall_score >= 70 AND overall_score < 80 THEN 1 ELSE 0 END) as fair,
        SUM(CASE WHEN overall_score >= 60 AND overall_score < 70 THEN 1 ELSE 0 END) as poor,
        SUM(CASE WHEN overall_score < 60 THEN 1 ELSE 0 END) as critical
      FROM auto_checklists
    `);

    const [mismatchStats] = await query(`
      SELECT 
        COUNT(*) as total_flags,
        SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END) as high,
        SUM(CASE WHEN severity = 'medium' THEN 1 ELSE 0 END) as medium,
        SUM(CASE WHEN severity = 'low' THEN 1 ELSE 0 END) as low,
        SUM(CASE WHEN is_resolved = 1 THEN 1 ELSE 0 END) as resolved
      FROM mismatch_flags
    `);

    const [mismatchTypeStats] = await query(`
      SELECT 
        mismatch_type,
        COUNT(*) as count
      FROM mismatch_flags
      GROUP BY mismatch_type
      ORDER BY count DESC
    `);

    res.json({
      success: true,
      data: {
        validations: {
          total: totalValidations.total || 0,
          average_score: parseFloat(avgScore.avg_score || 0).toFixed(2),
        },
        quality_distribution: qualityDistribution || {},
        mismatch_flags: mismatchStats || {},
        mismatch_by_type: mismatchTypeStats || [],
        last_updated: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("Get agent statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil statistik agent",
    });
  }
});

/**
 * Test agent connectivity
 */
router.post("/test-connection", async (req, res) => {
  try {
    const tests = {
      ai_service: false,
      database: false,
      agents: false,
    };

    // Test AI service
    try {
      const response = await axios.get(`${AI_SERVICE_URL}/health`, {
        timeout: 5000,
      });
      tests.ai_service = response.status === 200;
    } catch (error) {
      logger.error("AI service test failed:", error.message);
    }

    // Test database
    try {
      const { query } = require("../config/database");
      await query("SELECT 1");
      tests.database = true;
    } catch (error) {
      logger.error("Database test failed:", error.message);
    }

    // Test agents availability (via AI service health endpoint)
    try {
      const response = await axios.get(`${AI_SERVICE_URL}/api/v1/health`, {
        timeout: 5000,
      });
      tests.agents =
        response.data.ollama_available && response.data.agents_available;
    } catch (error) {
      logger.error("Agents test failed:", error.message);
    }

    const allHealthy = Object.values(tests).every((t) => t);

    res.json({
      success: allHealthy,
      message: allHealthy
        ? "Semua sistem operasional"
        : "Beberapa sistem mengalami masalah",
      tests,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Connection test error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal menjalankan test koneksi",
    });
  }
});

module.exports = router;
