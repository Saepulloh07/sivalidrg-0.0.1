// src/components/ValidationReport.jsx
import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  Typography,
  Box,
  Grid,
  Alert,
  Chip,
  CircularProgress,
  Tabs,
  Tab,
  LinearProgress,
} from "@mui/material";
import {
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
} from "@mui/icons-material";
import AgentChecklist from "./AgentChecklist";
import MismatchFlags from "./MismatchFlags";
import { apiService } from "../services/api";

function TabPanel({ children, value, index }) {
  return (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

const ValidationReport = ({ caseId }) => {
  const [loading, setLoading] = useState(false);
  const [validation, setValidation] = useState(null);
  const [tabValue, setTabValue] = useState(0);

  // Mock validation data
  const mockValidation = {
    coding_case_id: 123,
    overall_score: 98.1,
    total_checks: 8,
    passed_checks: 8,
    failed_checks: 0,
    has_validation: true,
    mismatch_flags: [],
    checklist: {
      patient_norm: "RM-2024-001234",
      generated_at: new Date().toISOString(),
      checks: [
        {
          check_name: "Diagnosis Match",
          status: "pass",
          score: 100,
          message: "Diagnosis di CPPT dan Resume konsisten",
          details: null,
        },
        {
          check_name: "Lab Support",
          status: "pass",
          score: 100,
          message: "Hasil lab (5 pemeriksaan) mendukung diagnosis",
          details: { lab_count: 5 },
        },
        {
          check_name: "ICD Code Validity",
          status: "pass",
          score: 100,
          message: "Semua 4 kode ICD valid dan konsisten",
          details: { total_codes: 4 },
        },
        {
          check_name: "Documentation Completeness",
          status: "pass",
          score: 90,
          message: "Kelengkapan dokumentasi 90%",
          details: {
            cppt_count: 5,
            lab_count: 3,
            vital_count: 10,
            issues: [],
          },
        },
        {
          check_name: "Duration Anomaly",
          status: "pass",
          score: 100,
          message: "Durasi rawat 5 hari sesuai dengan diagnosis",
          details: {
            duration_days: 5,
            expected_range: "3-14 hari",
            severity: "moderate",
          },
        },
        {
          check_name: "Vital Signs Recording",
          status: "pass",
          score: 95,
          message: "9/10 pengukuran vital lengkap",
          details: {
            total_readings: 10,
            complete_readings: 9,
            completeness_pct: 95,
          },
        },
        {
          check_name: "CPPT Frequency",
          status: "pass",
          score: 100,
          message: "5 CPPT untuk 5 hari rawat",
          details: {
            cppt_count: 5,
            duration_days: 5,
            frequency: 1.0,
          },
        },
        {
          check_name: "Procedure Documentation",
          status: "pass",
          score: 100,
          message: "Tidak ada prosedur (N/A)",
          details: null,
        },
      ],
      summary: {
        total_checks: 8,
        passed_checks: 8,
        failed_checks: 0,
        overall_score: 98.1,
        quality_level: "Excellent",
      },
    },
  };

  useEffect(() => {
    if (caseId) {
      setValidation(mockValidation);
    }
  }, [caseId]);

  if (!caseId) {
    return (
      <Alert severity="info">
        Select a document to view validation report.
      </Alert>
    );
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (!validation || !validation.has_validation) {
    return (
      <Alert severity="warning">
        No validation results available for this case.
      </Alert>
    );
  }

  const getQualityColor = (score) => {
    if (score >= 90) return "success";
    if (score >= 80) return "primary";
    if (score >= 70) return "warning";
    return "error";
  };

  return (
    <Box>
      {/* Summary Cards */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" variant="caption" gutterBottom>
                Overall Quality Score
              </Typography>
              <Box display="flex" alignItems="baseline" gap={1}>
                <Typography
                  variant="h3"
                  color={getQualityColor(validation.overall_score)}
                >
                  {validation.overall_score.toFixed(1)}
                </Typography>
                <Typography variant="h6" color="textSecondary">
                  / 100
                </Typography>
              </Box>
              <Box mt={2}>
                <LinearProgress
                  variant="determinate"
                  value={validation.overall_score}
                  color={getQualityColor(validation.overall_score)}
                  sx={{ height: 8, borderRadius: 1 }}
                />
              </Box>
              <Typography
                variant="caption"
                color="textSecondary"
                mt={1}
                display="block"
              >
                Quality Level: {validation.checklist?.summary?.quality_level}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <CheckIcon color="success" fontSize="large" />
                <Box>
                  <Typography color="textSecondary" variant="caption">
                    Passed Checks
                  </Typography>
                  <Typography variant="h4">
                    {validation.passed_checks}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <ErrorIcon color="error" fontSize="large" />
                <Box>
                  <Typography color="textSecondary" variant="caption">
                    Failed Checks
                  </Typography>
                  <Typography variant="h4">
                    {validation.failed_checks}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <WarningIcon color="warning" fontSize="large" />
                <Box>
                  <Typography color="textSecondary" variant="caption">
                    Mismatch Flags
                  </Typography>
                  <Typography variant="h4">
                    {validation.mismatch_flags.length}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Card>
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)}>
            <Tab label="Agent Checklist" />
            <Tab
              label={`Mismatch Flags (${validation.mismatch_flags.length})`}
            />
          </Tabs>
        </Box>

        <CardContent>
          <TabPanel value={tabValue} index={0}>
            <AgentChecklist checklist={validation.checklist} />
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <MismatchFlags flags={validation.mismatch_flags} />
          </TabPanel>
        </CardContent>
      </Card>
    </Box>
  );
};

export default ValidationReport;
