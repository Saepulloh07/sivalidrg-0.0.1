// src/routes/dashboard.js
const express = require("express");
const { query, sanitizeBigInt } = require("../config/database");
const { authenticate } = require("../middleware/auth");
const logger = require("../utils/logger");
const moment = require("moment");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Dashboard Overview
router.get("/overview", async (req, res) => {
  try {
    const { period = "30" } = req.query;
    const startDate = moment()
      .subtract(parseInt(period), "days")
      .format("YYYY-MM-DD");

    const queries = await Promise.all([
      query(
        `SELECT COUNT(*) AS total, COUNT(CASE WHEN DATE(created_at) >= ? THEN 1 END) AS new_this_period FROM patients`,
        [startDate]
      ),
      query(
        `SELECT 
              COUNT(*) AS total,
              COUNT(CASE WHEN status = 'uploaded' THEN 1 END) AS uploaded,
              COUNT(CASE WHEN status = 'finalized' THEN 1 END) AS finalized,
              COUNT(CASE WHEN DATE(created_at) >= ? THEN 1 END) AS new_this_period
             FROM documents`,
        [startDate]
      ),
      query(
        `SELECT 
              COUNT(*) AS total,
              COUNT(CASE WHEN status = 'finalized' THEN 1 END) AS finalized,
              COUNT(CASE WHEN DATE(created_at) >= ? THEN 1 END) AS new_this_period
             FROM coding_cases`,
        [startDate]
      ),
      query(
        `SELECT 
              COUNT(DISTINCT coding_case_id) AS total_validated,
              AVG(overall_score) AS avg_score
             FROM auto_checklists WHERE DATE(created_at) >= ?`,
        [startDate]
      ),
    ]);

    const [patientStats, documentStats, codingStats, validationStats] =
      queries.map((r) => r[0] || {});

    res.json({
      success: true,
      data: sanitizeBigInt({
        period: `Last ${period} days`,
        patients: patientStats || { total: 0, new_this_period: 0 },
        documents: documentStats || {
          total: 0,
          uploaded: 0,
          finalized: 0,
          new_this_period: 0,
        },
        coding_cases: codingStats || {
          total: 0,
          finalized: 0,
          new_this_period: 0,
        },
        validation: {
          total_validated: validationStats.total_validated || 0,
          avg_score: parseFloat(validationStats.avg_score || 0).toFixed(2),
        },
      }),
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Dashboard overview error:", error);
    res
      .status(500)
      .json({ success: false, message: "Gagal mengambil data dashboard" });
  }
});

/**
 * Get coding performance metrics
 */
router.get("/performance", async (req, res) => {
  try {
    const { period = "30" } = req.query;
    const startDate = moment()
      .subtract(parseInt(period), "days")
      .format("YYYY-MM-DD");

    // Average processing time
    const [avgProcessingTime] = await query(
      `
      SELECT 
        AVG(TIMESTAMPDIFF(SECOND, cc.created_at, cc.updated_at)) as avg_seconds,
        MIN(TIMESTAMPDIFF(SECOND, cc.created_at, cc.updated_at)) as min_seconds,
        MAX(TIMESTAMPDIFF(SECOND, cc.created_at, cc.updated_at)) as max_seconds
      FROM coding_cases cc
      WHERE cc.status = 'finalized' AND DATE(cc.created_at) >= ?
    `,
      [startDate]
    );

    // AI recommendations accuracy (based on final codes)
    const [accuracyStats] = await query(
      `
      SELECT 
        COUNT(DISTINCT ar.id) as total_recommendations,
        COUNT(DISTINCT CASE WHEN fc.id IS NOT NULL THEN ar.id END) as accepted_recommendations,
        AVG(ar.confidence) as avg_confidence
      FROM ai_recommendations ar
      LEFT JOIN final_codes fc ON ar.coding_case_id = fc.coding_case_id 
        AND ar.code = fc.code 
        AND ar.code_type = fc.code_type
      JOIN coding_cases cc ON ar.coding_case_id = cc.id
      WHERE DATE(ar.created_at) >= ?
    `,
      [startDate]
    );

    // Daily throughput
    const dailyThroughput = await query(
      `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as cases_created,
        COUNT(CASE WHEN status = 'finalized' THEN 1 END) as cases_finalized
      FROM coding_cases
      WHERE DATE(created_at) >= ?
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `,
      [startDate]
    );

    // Code distribution
    const [codeDistribution] = await query(
      `
      SELECT 
        COUNT(CASE WHEN code_type = 'diagnosis' THEN 1 END) as diagnosis_codes,
        COUNT(CASE WHEN code_type = 'procedure' THEN 1 END) as procedure_codes,
        COUNT(CASE WHEN source = 'ai' THEN 1 END) as ai_sourced,
        COUNT(CASE WHEN source = 'manual' THEN 1 END) as manual_sourced
      FROM final_codes
      WHERE DATE(created_at) >= ?
    `,
      [startDate]
    );

    res.json({
      success: true,
      data: {
        period: `Last ${period} days`,
        processing_time: {
          average: Math.round(avgProcessingTime.avg_seconds || 0),
          minimum: Math.round(avgProcessingTime.min_seconds || 0),
          maximum: Math.round(avgProcessingTime.max_seconds || 0),
        },
        ai_accuracy: {
          total_recommendations: accuracyStats.total_recommendations || 0,
          accepted: accuracyStats.accepted_recommendations || 0,
          acceptance_rate:
            accuracyStats.total_recommendations > 0
              ? (
                  (accuracyStats.accepted_recommendations /
                    accuracyStats.total_recommendations) *
                  100
                ).toFixed(2)
              : 0,
          avg_confidence: parseFloat(accuracyStats.avg_confidence || 0).toFixed(
            3
          ),
        },
        throughput: dailyThroughput,
        code_distribution: codeDistribution,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Dashboard performance error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data performa",
    });
  }
});

/**
 * Get validation quality trends
 */
router.get("/quality-trends", async (req, res) => {
  try {
    const { period = "30" } = req.query;
    const startDate = moment()
      .subtract(parseInt(period), "days")
      .format("YYYY-MM-DD");

    // Quality score trends
    const qualityTrends = await query(
      `
      SELECT 
        DATE(ac.created_at) as date,
        AVG(ac.overall_score) as avg_score,
        COUNT(*) as total_validations,
        COUNT(CASE WHEN ac.overall_score >= 90 THEN 1 END) as excellent,
        COUNT(CASE WHEN ac.overall_score >= 80 AND ac.overall_score < 90 THEN 1 END) as good,
        COUNT(CASE WHEN ac.overall_score < 70 THEN 1 END) as needs_review
      FROM auto_checklists ac
      WHERE DATE(ac.created_at) >= ?
      GROUP BY DATE(ac.created_at)
      ORDER BY date ASC
    `,
      [startDate]
    );

    // Mismatch trends
    const mismatchTrends = await query(
      `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total_flags,
        COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical,
        COUNT(CASE WHEN severity = 'high' THEN 1 END) as high,
        COUNT(CASE WHEN mismatch_type = 'diagnosis_mismatch' THEN 1 END) as diagnosis_issues,
        COUNT(CASE WHEN mismatch_type = 'icd_inconsistent' THEN 1 END) as icd_issues
      FROM mismatch_flags
      WHERE DATE(created_at) >= ?
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `,
      [startDate]
    );

    // Top mismatch types
    const topMismatches = await query(
      `
      SELECT 
        mismatch_type,
        COUNT(*) as count,
        AVG(CASE WHEN is_resolved = 1 THEN 1 ELSE 0 END) * 100 as resolution_rate
      FROM mismatch_flags
      WHERE DATE(created_at) >= ?
      GROUP BY mismatch_type
      ORDER BY count DESC
    `,
      [startDate]
    );

    res.json({
      success: true,
      data: {
        period: `Last ${period} days`,
        quality_trends: qualityTrends.map((t) => ({
          ...t,
          avg_score: parseFloat(t.avg_score).toFixed(2),
        })),
        mismatch_trends: mismatchTrends,
        top_mismatch_types: topMismatches.map((m) => ({
          ...m,
          resolution_rate: parseFloat(m.resolution_rate).toFixed(2),
        })),
      },
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Dashboard quality trends error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data quality trends",
    });
  }
});

/**
 * Get recent activities
 */
router.get("/activities", async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const activities = await query(
      `
      SELECT 
        'document_upload' as activity_type,
        d.id as entity_id,
        d.created_at,
        u.name as user_name,
        p.norm as patient_norm,
        p.name as patient_name,
        d.status
      FROM documents d
      LEFT JOIN users u ON d.upload_by = u.id
      LEFT JOIN patients p ON d.patient_id = p.id
      
      UNION ALL
      
      SELECT 
        'coding_finalized' as activity_type,
        cc.id as entity_id,
        cc.finalized_at as created_at,
        u.name as user_name,
        p.norm as patient_norm,
        p.name as patient_name,
        cc.status
      FROM coding_cases cc
      LEFT JOIN users u ON cc.assigned_to = u.id
      LEFT JOIN documents d ON cc.document_id = d.id
      LEFT JOIN patients p ON d.patient_id = p.id
      WHERE cc.finalized_at IS NOT NULL
      
      UNION ALL
      
      SELECT 
        'validation_completed' as activity_type,
        ac.coding_case_id as entity_id,
        ac.created_at,
        NULL as user_name,
        p.norm as patient_norm,
        p.name as patient_name,
        CONCAT('Score: ', ROUND(ac.overall_score, 0), '%') as status
      FROM auto_checklists ac
      LEFT JOIN coding_cases cc ON ac.coding_case_id = cc.id
      LEFT JOIN documents d ON cc.document_id = d.id
      LEFT JOIN patients p ON d.patient_id = p.id
      
      ORDER BY created_at DESC
      LIMIT ?
    `,
      [parseInt(limit)]
    );

    res.json({
      success: true,
      data: activities,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Dashboard activities error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data aktivitas",
    });
  }
});

/**
 * Get user-specific dashboard
 */
router.get("/my-dashboard", async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = "30" } = req.query;
    const startDate = moment()
      .subtract(parseInt(period), "days")
      .format("YYYY-MM-DD");

    // User's cases
    const [myCases] = await query(
      `
      SELECT 
        COUNT(*) as total_assigned,
        COUNT(CASE WHEN cc.status = 'finalized' THEN 1 END) as finalized,
        COUNT(CASE WHEN cc.status IN ('uploaded', 'ai_completed') THEN 1 END) as pending
      FROM coding_cases cc
      WHERE cc.assigned_to = ? AND DATE(cc.created_at) >= ?
    `,
      [userId, startDate]
    );

    // User's uploaded documents
    const [myDocuments] = await query(
      `
      SELECT 
        COUNT(*) as total_uploaded,
        COUNT(CASE WHEN status = 'finalized' THEN 1 END) as finalized
      FROM documents
      WHERE upload_by = ? AND DATE(created_at) >= ?
    `,
      [userId, startDate]
    );

    // User's added codes
    const [myCodes] = await query(
      `
      SELECT 
        COUNT(*) as total_codes,
        COUNT(CASE WHEN code_type = 'diagnosis' THEN 1 END) as diagnosis_codes,
        COUNT(CASE WHEN code_type = 'procedure' THEN 1 END) as procedure_codes
      FROM final_codes
      WHERE added_by = ? AND DATE(created_at) >= ?
    `,
      [userId, startDate]
    );

    // Recent cases assigned to user
    const recentCases = await query(
      `
      SELECT 
        cc.id,
        cc.status,
        cc.created_at,
        cc.updated_at,
        p.norm,
        p.name as patient_name,
        ac.overall_score
      FROM coding_cases cc
      LEFT JOIN documents d ON cc.document_id = d.id
      LEFT JOIN patients p ON d.patient_id = p.id
      LEFT JOIN auto_checklists ac ON cc.id = ac.coding_case_id
      WHERE cc.assigned_to = ?
      ORDER BY cc.updated_at DESC
      LIMIT 10
    `,
      [userId]
    );

    res.json({
      success: true,
      data: {
        period: `Last ${period} days`,
        summary: {
          cases: myCases,
          documents: myDocuments,
          codes: myCodes,
        },
        recent_cases: recentCases,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("My dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data dashboard personal",
    });
  }
});

module.exports = router;
