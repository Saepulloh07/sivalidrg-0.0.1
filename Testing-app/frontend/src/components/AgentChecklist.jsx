// src/components/AgentChecklist.jsx
import React from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  Paper,
  Chip,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckIcon,
  Cancel as FailIcon,
  Warning as WarningIcon,
} from "@mui/icons-material";

const StatusIcon = ({ status }) => {
  switch (status) {
    case "pass":
      return <CheckIcon color="success" />;
    case "fail":
      return <FailIcon color="error" />;
    case "warning":
      return <WarningIcon color="warning" />;
    default:
      return <WarningIcon color="disabled" />;
  }
};

const CheckScore = ({ score }) => {
  const getColor = () => {
    if (score >= 90) return "success";
    if (score >= 75) return "primary";
    if (score >= 60) return "warning";
    return "error";
  };

  return (
    <Box sx={{ minWidth: 120 }}>
      <Box display="flex" justifyContent="space-between" mb={0.5}>
        <Typography variant="caption">Score</Typography>
        <Typography variant="caption" fontWeight="bold">
          {score}%
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={score}
        color={getColor()}
        sx={{ height: 6, borderRadius: 1 }}
      />
    </Box>
  );
};

const AgentChecklist = ({ checklist }) => {
  if (!checklist || !checklist.checks) {
    return <Alert severity="info">No checklist data available.</Alert>;
  }

  return (
    <Box>
      {/* Summary Banner */}
      <Paper
        sx={{
          p: 3,
          mb: 3,
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          color: "white",
        }}
      >
        <Typography variant="h5" gutterBottom>
          Multi-Agent Validation Summary
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.9 }}>
          Generated at:{" "}
          {new Date(checklist.generated_at).toLocaleString("id-ID")}
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.9 }}>
          Patient NoRM: {checklist.patient_norm}
        </Typography>

        <Box display="flex" gap={3} mt={3}>
          <Box>
            <Typography variant="h3" fontWeight="bold">
              {checklist.summary.overall_score.toFixed(1)}%
            </Typography>
            <Typography variant="caption">Overall Score</Typography>
          </Box>
          <Box>
            <Typography variant="h4">
              {checklist.summary.passed_checks}/{checklist.summary.total_checks}
            </Typography>
            <Typography variant="caption">Checks Passed</Typography>
          </Box>
          <Box>
            <Chip
              label={checklist.summary.quality_level}
              sx={{
                mt: 1,
                bgcolor: "rgba(255,255,255,0.2)",
                color: "white",
                fontWeight: "bold",
              }}
            />
          </Box>
        </Box>
      </Paper>

      {/* Individual Checks */}
      <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
        Detailed Checks ({checklist.checks.length})
      </Typography>

      {checklist.checks.map((check, index) => (
        <Accordion key={index} defaultExpanded={check.status !== "pass"}>
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              bgcolor:
                check.status === "pass"
                  ? "success.50"
                  : check.status === "fail"
                  ? "error.50"
                  : "warning.50",
            }}
          >
            <Box
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              width="100%"
              pr={2}
            >
              <Box display="flex" alignItems="center" gap={2}>
                <StatusIcon status={check.status} />
                <Box>
                  <Typography variant="subtitle1" fontWeight="bold">
                    {check.check_name}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    {check.message}
                  </Typography>
                </Box>
              </Box>
              <CheckScore score={check.score} />
            </Box>
          </AccordionSummary>

          <AccordionDetails>
            {check.details && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Details:
                </Typography>

                {/* Render different details based on check type */}
                {check.check_name === "Documentation Completeness" &&
                  check.details && (
                    <Box>
                      <List dense>
                        <ListItem>
                          <Typography variant="body2">
                            ✓ CPPT Records:{" "}
                            <strong>{check.details.cppt_count}</strong>
                          </Typography>
                        </ListItem>
                        <ListItem>
                          <Typography variant="body2">
                            ✓ Lab Results:{" "}
                            <strong>{check.details.lab_count}</strong>
                          </Typography>
                        </ListItem>
                        <ListItem>
                          <Typography variant="body2">
                            ✓ Vital Signs:{" "}
                            <strong>{check.details.vital_count}</strong>
                          </Typography>
                        </ListItem>
                      </List>
                      {check.details.issues &&
                        check.details.issues.length > 0 && (
                          <Alert severity="warning" sx={{ mt: 2 }}>
                            <Typography variant="body2" fontWeight="bold">
                              Issues Found:
                            </Typography>
                            <List dense>
                              {check.details.issues.map((issue, i) => (
                                <ListItem key={i}>
                                  <Typography variant="body2">
                                    • {issue}
                                  </Typography>
                                </ListItem>
                              ))}
                            </List>
                          </Alert>
                        )}
                    </Box>
                  )}

                {check.check_name === "Duration Anomaly" && check.details && (
                  <Box>
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: "grey.50" }}>
                      <Typography variant="body2" gutterBottom>
                        <strong>Duration:</strong> {check.details.duration_days}{" "}
                        days
                      </Typography>
                      <Typography variant="body2" gutterBottom>
                        <strong>Expected Range:</strong>{" "}
                        {check.details.expected_range}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Severity Level:</strong>{" "}
                        <Chip
                          label={check.details.severity}
                          size="small"
                          color={
                            check.details.severity === "critical"
                              ? "error"
                              : check.details.severity === "high"
                              ? "warning"
                              : "default"
                          }
                        />
                      </Typography>
                    </Paper>
                    {check.details.recommendation && (
                      <Alert severity="info" sx={{ mt: 2 }}>
                        {check.details.recommendation}
                      </Alert>
                    )}
                  </Box>
                )}

                {check.check_name === "Vital Signs Recording" &&
                  check.details && (
                    <Box>
                      <Paper
                        variant="outlined"
                        sx={{ p: 2, bgcolor: "grey.50" }}
                      >
                        <Typography variant="body2">
                          <strong>Complete Readings:</strong>{" "}
                          {check.details.complete_readings} /{" "}
                          {check.details.total_readings}
                        </Typography>
                        <Typography variant="body2" mt={1}>
                          <strong>Completeness:</strong>{" "}
                          {check.details.completeness_pct.toFixed(1)}%
                        </Typography>
                      </Paper>
                    </Box>
                  )}

                {check.check_name === "CPPT Frequency" && check.details && (
                  <Box>
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: "grey.50" }}>
                      <Typography variant="body2" gutterBottom>
                        <strong>CPPT Count:</strong> {check.details.cppt_count}
                      </Typography>
                      <Typography variant="body2" gutterBottom>
                        <strong>Hospital Stay:</strong>{" "}
                        {check.details.duration_days} days
                      </Typography>
                      <Typography variant="body2">
                        <strong>Frequency Ratio:</strong>{" "}
                        {check.details.frequency.toFixed(2)}x
                      </Typography>
                      <Typography
                        variant="caption"
                        color="textSecondary"
                        display="block"
                        mt={1}
                      >
                        Expected: At least 1 CPPT per day
                      </Typography>
                    </Paper>
                  </Box>
                )}

                {check.check_name === "ICD Code Validity" && check.details && (
                  <Box>
                    <Typography variant="body2">
                      Total ICD Codes:{" "}
                      <strong>{check.details.total_codes}</strong>
                    </Typography>
                  </Box>
                )}

                {check.check_name === "Lab Support" && check.details && (
                  <Box>
                    <Typography variant="body2">
                      Lab Examinations:{" "}
                      <strong>{check.details.lab_count}</strong>
                    </Typography>
                  </Box>
                )}

                {/* Generic details rendering */}
                {![
                  "Documentation Completeness",
                  "Duration Anomaly",
                  "Vital Signs Recording",
                  "CPPT Frequency",
                  "ICD Code Validity",
                  "Lab Support",
                ].includes(check.check_name) &&
                  check.details && (
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: "grey.50" }}>
                      <pre style={{ margin: 0, fontSize: "0.875rem" }}>
                        {JSON.stringify(check.details, null, 2)}
                      </pre>
                    </Paper>
                  )}
              </Box>
            )}
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
};

export default AgentChecklist;
