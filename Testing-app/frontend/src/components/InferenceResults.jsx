// src/components/InferenceResults.jsx
import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  Typography,
  Box,
  Grid,
  Chip,
  List,
  ListItem,
  ListItemText,
  Divider,
  LinearProgress,
  Paper,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Badge,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  MedicalServices as MedicalIcon,
  Code as CodeIcon,
  TrendingUp as TrendingUpIcon,
} from "@mui/icons-material";

const ConfidenceMeter = ({ confidence }) => {
  const percentage = confidence * 100;
  const color =
    percentage >= 90
      ? "success"
      : percentage >= 75
      ? "primary"
      : percentage >= 60
      ? "warning"
      : "error";

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" mb={0.5}>
        <Typography variant="caption" color="textSecondary">
          Confidence
        </Typography>
        <Typography variant="caption" fontWeight="bold">
          {percentage.toFixed(1)}%
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={percentage}
        color={color}
        sx={{ height: 8, borderRadius: 1 }}
      />
    </Box>
  );
};

const InferenceResults = ({ caseId }) => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  // Mock data
  const mockResults = {
    coding_case_id: 123,
    document_id: 5,
    total_recommendations: 4,
    inference_time: 3.45,
    status: "ai_completed",
    results: [
      {
        id: 1,
        code: "E11.2",
        code_type: "diagnosis",
        description: "Diabetes mellitus tipe 2 dengan komplikasi ginjal",
        confidence: 0.923,
        evidence:
          "diabetes mellitus tipe 2 tidak terkontrol dengan nefropati diabetik",
        highlight_ranges: [{ start: 45, end: 105 }],
      },
      {
        id: 2,
        code: "I11.9",
        code_type: "diagnosis",
        description: "Penyakit jantung hipertensi tanpa gagal jantung",
        confidence: 0.887,
        evidence: "hipertensi stage 2",
        highlight_ranges: [{ start: 120, end: 138 }],
      },
      {
        id: 3,
        code: "D50.9",
        code_type: "diagnosis",
        description: "Anemia defisiensi besi, tidak spesifik",
        confidence: 0.912,
        evidence: "anemia defisiensi besi",
        highlight_ranges: [{ start: 140, end: 162 }],
      },
      {
        id: 4,
        code: "N39.0",
        code_type: "diagnosis",
        description: "Infeksi saluran kemih, lokasi tidak spesifik",
        confidence: 0.895,
        evidence: "infeksi saluran kemih",
        highlight_ranges: [{ start: 165, end: 186 }],
      },
    ],
  };

  useEffect(() => {
    if (caseId) {
      setResults(mockResults);
    }
  }, [caseId]);

  if (!caseId) {
    return (
      <Alert severity="info">
        Select a document from the dashboard to view AI inference results.
      </Alert>
    );
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <LinearProgress sx={{ width: "100%" }} />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!results) {
    return <Alert severity="warning">No results available</Alert>;
  }

  // Group by code type
  const diagnosisCodes = results.results.filter(
    (r) => r.code_type === "diagnosis"
  );
  const procedureCodes = results.results.filter(
    (r) => r.code_type === "procedure"
  );

  return (
    <Box>
      {/* Summary Cards */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <MedicalIcon color="primary" fontSize="large" />
                <Box>
                  <Typography color="textSecondary" variant="caption">
                    Total Recommendations
                  </Typography>
                  <Typography variant="h4">
                    {results.total_recommendations}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <CodeIcon color="success" fontSize="large" />
                <Box>
                  <Typography color="textSecondary" variant="caption">
                    Diagnosis Codes
                  </Typography>
                  <Typography variant="h4">{diagnosisCodes.length}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <TrendingUpIcon color="info" fontSize="large" />
                <Box>
                  <Typography color="textSecondary" variant="caption">
                    Processing Time
                  </Typography>
                  <Typography variant="h4">
                    {results.inference_time}s
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Diagnosis Codes */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            <Badge badgeContent={diagnosisCodes.length} color="primary">
              Diagnosis Codes (ICD-10)
            </Badge>
          </Typography>
          <Divider sx={{ my: 2 }} />

          {diagnosisCodes.map((result, index) => (
            <Accordion key={result.id} defaultExpanded={index === 0}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box width="100%">
                  <Box
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Box>
                      <Typography variant="h6" component="span">
                        {result.code}
                      </Typography>
                      <Chip
                        label={result.code_type}
                        size="small"
                        color="primary"
                        sx={{ ml: 2 }}
                      />
                    </Box>
                    <Typography variant="caption" color="textSecondary">
                      Confidence: {(result.confidence * 100).toFixed(1)}%
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="textSecondary" mt={1}>
                    {result.description}
                  </Typography>
                </Box>
              </AccordionSummary>

              <AccordionDetails>
                <Box>
                  <ConfidenceMeter confidence={result.confidence} />

                  <Box mt={3}>
                    <Typography
                      variant="subtitle2"
                      color="textSecondary"
                      gutterBottom
                    >
                      Evidence from Document:
                    </Typography>
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: "grey.50" }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontStyle: "italic",
                          color: "text.secondary",
                        }}
                      >
                        "{result.evidence}"
                      </Typography>
                    </Paper>
                  </Box>

                  <Box mt={2}>
                    <Typography variant="caption" color="textSecondary">
                      Highlight ranges: {result.highlight_ranges.length}{" "}
                      location(s)
                    </Typography>
                  </Box>
                </Box>
              </AccordionDetails>
            </Accordion>
          ))}
        </CardContent>
      </Card>

      {/* Procedure Codes */}
      {procedureCodes.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <Badge badgeContent={procedureCodes.length} color="secondary">
                Procedure Codes (ICD-9-CM)
              </Badge>
            </Typography>
            <Divider sx={{ my: 2 }} />

            {procedureCodes.map((result) => (
              <Accordion key={result.id}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box width="100%">
                    <Box
                      display="flex"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Box>
                        <Typography variant="h6" component="span">
                          {result.code}
                        </Typography>
                        <Chip
                          label={result.code_type}
                          size="small"
                          color="secondary"
                          sx={{ ml: 2 }}
                        />
                      </Box>
                      <Typography variant="caption" color="textSecondary">
                        Confidence: {(result.confidence * 100).toFixed(1)}%
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="textSecondary" mt={1}>
                      {result.description}
                    </Typography>
                  </Box>
                </AccordionSummary>

                <AccordionDetails>
                  <Box>
                    <ConfidenceMeter confidence={result.confidence} />

                    <Box mt={3}>
                      <Typography
                        variant="subtitle2"
                        color="textSecondary"
                        gutterBottom
                      >
                        Evidence from Document:
                      </Typography>
                      <Paper
                        variant="outlined"
                        sx={{ p: 2, bgcolor: "grey.50" }}
                      >
                        <Typography variant="body2" fontStyle="italic">
                          "{result.evidence}"
                        </Typography>
                      </Paper>
                    </Box>
                  </Box>
                </AccordionDetails>
              </Accordion>
            ))}
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default InferenceResults;
