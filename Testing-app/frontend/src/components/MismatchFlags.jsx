// src/components/MismatchFlags.jsx
import React from "react";
import {
  Box,
  Typography,
  Alert,
  Chip,
  Paper,
  List,
  ListItem,
  ListItemText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  LinearProgress,
  Divider,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
} from "@mui/icons-material";

const SeverityChip = ({ severity }) => {
  const config = {
    critical: { color: "error", icon: <ErrorIcon fontSize="small" /> },
    high: { color: "warning", icon: <WarningIcon fontSize="small" /> },
    medium: { color: "info", icon: <InfoIcon fontSize="small" /> },
    low: { color: "default", icon: <InfoIcon fontSize="small" /> },
  };

  const { color, icon } = config[severity] || config.medium;

  return (
    <Chip
      icon={icon}
      label={severity.toUpperCase()}
      color={color}
      size="small"
      sx={{ fontWeight: "bold" }}
    />
  );
};

const MismatchTypeChip = ({ type }) => {
  const labels = {
    diagnosis_mismatch: "Diagnosis Mismatch",
    lab_unsupported: "Lab Unsupported",
    duration_anomaly: "Duration Anomaly",
    icd_inconsistent: "ICD Inconsistent",
    missing_documentation: "Missing Documentation",
  };

  return <Chip label={labels[type] || type} variant="outlined" size="small" />;
};

const MismatchFlags = ({ flags }) => {
  if (!flags || flags.length === 0) {
    return (
      <Alert severity="success" icon={<ErrorIcon />}>
        <Typography variant="body1" fontWeight="bold">
          🎉 No Mismatch Flags Found!
        </Typography>
        <Typography variant="body2">
          All validation checks passed successfully. The medical record is
          consistent and complete.
        </Typography>
      </Alert>
    );
  }

  // Group flags by severity
  const flagsBySeverity = {
    critical: flags.filter((f) => f.severity === "critical"),
    high: flags.filter((f) => f.severity === "high"),
    medium: flags.filter((f) => f.severity === "medium"),
    low: flags.filter((f) => f.severity === "low"),
  };

  return (
    <Box>
      {/* Summary Alert */}
      <Alert
        severity={
          flagsBySeverity.critical.length > 0
            ? "error"
            : flagsBySeverity.high.length > 0
            ? "warning"
            : "info"
        }
        sx={{ mb: 3 }}
      >
        <Typography variant="body1" fontWeight="bold" gutterBottom>
          Found {flags.length} Validation Issue(s)
        </Typography>
        <Typography variant="body2">
          Critical: {flagsBySeverity.critical.length} | High:{" "}
          {flagsBySeverity.high.length} | Medium:{" "}
          {flagsBySeverity.medium.length} | Low: {flagsBySeverity.low.length}
        </Typography>
      </Alert>

      {/* Critical Flags */}
      {flagsBySeverity.critical.length > 0 && (
        <Box mb={3}>
          <Typography variant="h6" color="error" gutterBottom>
            🚨 Critical Issues ({flagsBySeverity.critical.length})
          </Typography>
          {flagsBySeverity.critical.map((flag) => (
            <MismatchCard key={flag.id} flag={flag} />
          ))}
        </Box>
      )}

      {/* High Priority Flags */}
      {flagsBySeverity.high.length > 0 && (
        <Box mb={3}>
          <Typography variant="h6" color="warning.main" gutterBottom>
            ⚠️ High Priority Issues ({flagsBySeverity.high.length})
          </Typography>
          {flagsBySeverity.high.map((flag) => (
            <MismatchCard key={flag.id} flag={flag} />
          ))}
        </Box>
      )}

      {/* Medium Priority Flags */}
      {flagsBySeverity.medium.length > 0 && (
        <Box mb={3}>
          <Typography variant="h6" color="info.main" gutterBottom>
            ℹ️ Medium Priority Issues ({flagsBySeverity.medium.length})
          </Typography>
          {flagsBySeverity.medium.map((flag) => (
            <MismatchCard key={flag.id} flag={flag} />
          ))}
        </Box>
      )}

      {/* Low Priority Flags */}
      {flagsBySeverity.low.length > 0 && (
        <Box mb={3}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            Low Priority Issues ({flagsBySeverity.low.length})
          </Typography>
          {flagsBySeverity.low.map((flag) => (
            <MismatchCard key={flag.id} flag={flag} />
          ))}
        </Box>
      )}
    </Box>
  );
};

const MismatchCard = ({ flag }) => {
  return (
    <Accordion sx={{ mb: 2 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          width="100%"
          pr={2}
        >
          <Box>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <MismatchTypeChip type={flag.type} />
              <SeverityChip severity={flag.severity} />
            </Box>
            <Typography variant="body2" color="textSecondary">
              Field: <strong>{flag.field}</strong>
            </Typography>
          </Box>
          {flag.similarity_score !== null &&
            flag.similarity_score !== undefined && (
              <Box minWidth={100}>
                <Typography variant="caption" display="block" textAlign="right">
                  Similarity: {(flag.similarity_score * 100).toFixed(1)}%
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={flag.similarity_score * 100}
                  color={
                    flag.similarity_score >= 0.7
                      ? "success"
                      : flag.similarity_score >= 0.5
                      ? "warning"
                      : "error"
                  }
                  sx={{ height: 4, borderRadius: 1 }}
                />
              </Box>
            )}
        </Box>
      </AccordionSummary>

      <AccordionDetails>
        <Box>
          {/* Expected vs Actual */}
          {flag.expected && (
            <Box mb={2}>
              <Typography
                variant="subtitle2"
                color="textSecondary"
                gutterBottom
              >
                Expected Value:
              </Typography>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: "success.50" }}>
                <Typography variant="body2">{flag.expected}</Typography>
              </Paper>
            </Box>
          )}

          {flag.actual && (
            <Box mb={2}>
              <Typography
                variant="subtitle2"
                color="textSecondary"
                gutterBottom
              >
                Actual Value:
              </Typography>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: "error.50" }}>
                <Typography variant="body2">{flag.actual}</Typography>
              </Paper>
            </Box>
          )}

          {/* Recommendation */}
          {flag.recommendation && (
            <Box>
              <Divider sx={{ my: 2 }} />
              <Alert severity="info">
                <Typography variant="subtitle2" gutterBottom>
                  💡 Recommendation:
                </Typography>
                <Typography variant="body2">{flag.recommendation}</Typography>
              </Alert>
            </Box>
          )}

          {/* Evidence (if available) */}
          {flag.evidence && Object.keys(flag.evidence).length > 0 && (
            <Box mt={2}>
              <Typography
                variant="subtitle2"
                color="textSecondary"
                gutterBottom
              >
                Evidence:
              </Typography>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: "grey.50" }}>
                <pre
                  style={{
                    margin: 0,
                    fontSize: "0.75rem",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {JSON.stringify(flag.evidence, null, 2)}
                </pre>
              </Paper>
            </Box>
          )}

          {/* Resolution Status */}
          <Box mt={2}>
            <Chip
              label={flag.is_resolved ? "Resolved" : "Unresolved"}
              color={flag.is_resolved ? "success" : "warning"}
              size="small"
            />
          </Box>
        </Box>
      </AccordionDetails>
    </Accordion>
  );
};

export default MismatchFlags;
