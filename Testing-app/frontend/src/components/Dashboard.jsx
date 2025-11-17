// src/components/Dashboard.jsx
import React, { useState, useEffect } from "react";
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Button,
  CircularProgress,
  Alert,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  PlayArrow as PlayIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
} from "@mui/icons-material";
import { apiService } from "../services/api";

const StatusChip = ({ status }) => {
  const statusConfig = {
    uploaded: { color: "info", icon: <InfoIcon />, label: "Uploaded" },
    processing: {
      color: "warning",
      icon: <WarningIcon />,
      label: "Processing",
    },
    ai_processing: {
      color: "warning",
      icon: <WarningIcon />,
      label: "AI Processing",
    },
    ai_completed: { color: "success", icon: <CheckIcon />, label: "Completed" },
    failed: { color: "error", icon: <ErrorIcon />, label: "Failed" },
    finalized: { color: "default", icon: <CheckIcon />, label: "Finalized" },
  };

  const config = statusConfig[status] || statusConfig.uploaded;

  return (
    <Chip
      icon={config.icon}
      label={config.label}
      color={config.color}
      size="small"
    />
  );
};

const Dashboard = ({ onSelectCase }) => {
  const [systemHealth, setSystemHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);

  // Mock data - replace with real API call
  const mockDocuments = [
    {
      id: 1,
      patient_name: "Ibu Siti Aisyah",
      norm: "RM-2024-001234",
      status: "uploaded",
      created_at: "2025-01-15T08:00:00",
      coding_case_id: 1,
    },
    {
      id: 2,
      patient_name: "Bapak Ahmad Wijaya",
      norm: "RM-2024-001235",
      status: "ai_completed",
      created_at: "2025-01-16T10:30:00",
      coding_case_id: 2,
    },
    {
      id: 3,
      patient_name: "Ibu Nur Hasanah",
      norm: "RM-2024-001236",
      status: "processing",
      created_at: "2025-01-17T09:15:00",
      coding_case_id: 3,
    },
  ];

  useEffect(() => {
    fetchSystemHealth();
    setDocuments(mockDocuments);
  }, []);

  const fetchSystemHealth = async () => {
    try {
      const health = await apiService.healthCheck();
      setSystemHealth(health);
    } catch (error) {
      console.error("Health check failed:", error);
      setSystemHealth({ status: "degraded" });
    } finally {
      setLoading(false);
    }
  };

  const handleProcessDocument = async (docId) => {
    try {
      setLoading(true);
      const result = await apiService.processInference(docId, true);
      console.log("Inference result:", result);

      // Update document status
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === docId ? { ...doc, status: "ai_completed" } : doc
        )
      );

      // Select case for viewing
      onSelectCase(result.coding_case_id);
    } catch (error) {
      console.error("Processing failed:", error);
      alert(`Error: ${error.response?.data?.detail || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReprocess = async (docId) => {
    try {
      setLoading(true);
      const result = await apiService.reprocessInference(docId, true);
      console.log("Reprocess result:", result);

      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === docId ? { ...doc, status: "ai_completed" } : doc
        )
      );

      onSelectCase(result.coding_case_id);
    } catch (error) {
      console.error("Reprocess failed:", error);
      alert(`Error: ${error.response?.data?.detail || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !systemHealth) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="400px"
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* System Health Cards */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                System Status
              </Typography>
              <Box
                display="flex"
                alignItems="center"
                justifyContent="space-between"
              >
                <Typography variant="h5">
                  {systemHealth?.status === "healthy"
                    ? "✅ Healthy"
                    : "⚠️ Degraded"}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Ollama AI
              </Typography>
              <Typography variant="h5">
                {systemHealth?.ollama_available ? "✅ Online" : "❌ Offline"}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Database
              </Typography>
              <Typography variant="h5">
                {systemHealth?.database_available
                  ? "✅ Connected"
                  : "❌ Disconnected"}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                AI Agents
              </Typography>
              <Typography variant="h5">
                {systemHealth?.agents_available ? "✅ Ready" : "❌ Not Ready"}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Documents Table */}
      <Card>
        <CardContent>
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            mb={2}
          >
            <Typography variant="h5" component="h2">
              Documents
            </Typography>
            <Button
              startIcon={<RefreshIcon />}
              onClick={fetchSystemHealth}
              disabled={loading}
            >
              Refresh
            </Button>
          </Box>

          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Document ID</TableCell>
                  <TableCell>Patient Name</TableCell>
                  <TableCell>NoRM</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created At</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow
                    key={doc.id}
                    hover
                    selected={selectedDoc === doc.id}
                    onClick={() => setSelectedDoc(doc.id)}
                    sx={{ cursor: "pointer" }}
                  >
                    <TableCell>{doc.id}</TableCell>
                    <TableCell>{doc.patient_name}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">
                        {doc.norm}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <StatusChip status={doc.status} />
                    </TableCell>
                    <TableCell>
                      {new Date(doc.created_at).toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell align="right">
                      <Box display="flex" gap={1} justifyContent="flex-end">
                        {doc.status === "uploaded" && (
                          <Tooltip title="Process with AI">
                            <IconButton
                              color="primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleProcessDocument(doc.id);
                              }}
                              disabled={loading}
                            >
                              <PlayIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        {doc.status === "ai_completed" && (
                          <Tooltip title="Reprocess">
                            <IconButton
                              color="secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReprocess(doc.id);
                              }}
                              disabled={loading}
                            >
                              <RefreshIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        {doc.status === "failed" && (
                          <Tooltip title="Retry">
                            <IconButton
                              color="error"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReprocess(doc.id);
                              }}
                              disabled={loading}
                            >
                              <RefreshIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Dashboard;
