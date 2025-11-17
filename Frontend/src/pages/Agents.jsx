import { useState } from "react";
import { useQuery, useMutation } from "react-query";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  Alert,
  CircularProgress,
  Paper,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  LinearProgress,
} from "@mui/material";
import {
  Psychology,
  CheckCircle,
  Code,
  Science,
  PlayArrow,
  Refresh,
  CheckCircleOutline,
  ErrorOutline,
  WarningAmber,
  Storage,
  Cloud,
  Memory,
  ExpandMore,
  Assignment,
  BugReport,
  Speed,
  TrendingUp,
} from "@mui/icons-material";
import { useSnackbar } from "notistack";
import { agentsAPI } from "@/services/api";

export default function Agents() {
  const { enqueueSnackbar } = useSnackbar();
  const [openTestDialog, setOpenTestDialog] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Queries
  const {
    data: healthData,
    isLoading: loadingHealth,
    refetch: refetchHealth,
  } = useQuery("agents-health", () => agentsAPI.getHealth(), {
    refetchInterval: 30000,
  });

  const { data: infoData, isLoading: loadingInfo } = useQuery(
    "agents-info",
    () => agentsAPI.getInfo()
  );

  const {
    data: statsData,
    isLoading: loadingStats,
    refetch: refetchStats,
  } = useQuery("agents-statistics", () => agentsAPI.getStatistics(), {
    refetchInterval: 60000,
  });

  // Mutation
  const testConnectionMutation = useMutation(agentsAPI.testConnection, {
    onSuccess: (data) => {
      setTestResult(data.data);
      if (data.data.success) {
        enqueueSnackbar("✅ Semua sistem operasional!", { variant: "success" });
      } else {
        enqueueSnackbar("⚠️ Beberapa sistem mengalami masalah", {
          variant: "warning",
        });
      }
      setOpenTestDialog(true);
    },
    onError: (error) => {
      enqueueSnackbar(
        error.response?.data?.message || "❌ Gagal menghubungi AI service",
        { variant: "error" }
      );
    },
  });

  const handleTestConnection = () => {
    testConnectionMutation.mutate();
  };

  const handleRefreshAll = () => {
    refetchHealth();
    refetchStats();
    enqueueSnackbar("Data berhasil di-refresh", { variant: "info" });
  };

  const health = healthData?.data?.data?.ai_service || healthData?.data?.data;
  const info = infoData?.data?.data;
  const stats = statsData?.data?.data;

  const getHealthColor = (status) => {
    return status ? "success" : "error";
  };

  const getHealthIcon = (status) => {
    return status ? <CheckCircleOutline /> : <ErrorOutline />;
  };

  const getSeverityStats = (severity) => {
    return stats?.mismatch_flags?.[severity] || 0;
  };

  return (
    <Box>
      {/* Header */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
      >
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Multi-Agent System Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Monitor dan kelola AI agents untuk validasi coding medis
          </Typography>
        </Box>
        <Box display="flex" gap={1}>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={handleRefreshAll}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<PlayArrow />}
            onClick={handleTestConnection}
            disabled={testConnectionMutation.isLoading}
          >
            {testConnectionMutation.isLoading
              ? "Testing..."
              : "Test Connection"}
          </Button>
        </Box>
      </Box>

      {/* System Health */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            System Health Status
          </Typography>
          {loadingHealth ? (
            <Box display="flex" justifyContent="center" py={3}>
              <CircularProgress />
            </Box>
          ) : (
            <Grid container spacing={2} mt={1}>
              <Grid item xs={12} sm={4}>
                <Paper
                  sx={{
                    p: 2,
                    bgcolor: health?.ollama_available
                      ? "success.light"
                      : "error.light",
                    textAlign: "center",
                  }}
                >
                  <Box
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    gap={1}
                    mb={1}
                  >
                    {getHealthIcon(health?.ollama_available)}
                    <Typography variant="h6" fontWeight={600}>
                      Ollama Service
                    </Typography>
                  </Box>
                  <Chip
                    label={health?.ollama_available ? "Online" : "Offline"}
                    size="small"
                    color={getHealthColor(health?.ollama_available)}
                  />
                  <Typography variant="caption" display="block" mt={1}>
                    LLM untuk entity extraction
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Paper
                  sx={{
                    p: 2,
                    bgcolor: health?.database_available
                      ? "success.light"
                      : "error.light",
                    textAlign: "center",
                  }}
                >
                  <Box
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    gap={1}
                    mb={1}
                  >
                    {getHealthIcon(health?.database_available)}
                    <Typography variant="h6" fontWeight={600}>
                      Database
                    </Typography>
                  </Box>
                  <Chip
                    label={
                      health?.database_available ? "Connected" : "Disconnected"
                    }
                    size="small"
                    color={getHealthColor(health?.database_available)}
                  />
                  <Typography variant="caption" display="block" mt={1}>
                    Medical records & ICD codes
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Paper
                  sx={{
                    p: 2,
                    bgcolor: health?.agents_available
                      ? "success.light"
                      : "error.light",
                    textAlign: "center",
                  }}
                >
                  <Box
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    gap={1}
                    mb={1}
                  >
                    {getHealthIcon(health?.agents_available)}
                    <Typography variant="h6" fontWeight={600}>
                      Agents
                    </Typography>
                  </Box>
                  <Chip
                    label={health?.agents_available ? "Ready" : "Not Ready"}
                    size="small"
                    color={getHealthColor(health?.agents_available)}
                  />
                  <Typography variant="caption" display="block" mt={1}>
                    Multi-agent validation system
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
          )}
        </CardContent>
      </Card>

      {/* Statistics Overview */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box
                display="flex"
                alignItems="center"
                justifyContent="space-between"
              >
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Total Validations
                  </Typography>
                  <Typography variant="h4" fontWeight={700}>
                    {stats?.validations?.total || 0}
                  </Typography>
                </Box>
                <CheckCircle color="primary" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box
                display="flex"
                alignItems="center"
                justifyContent="space-between"
              >
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Avg Quality Score
                  </Typography>
                  <Typography variant="h4" fontWeight={700} color="primary">
                    {stats?.validations?.average_score || 0}%
                  </Typography>
                </Box>
                <TrendingUp color="success" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box
                display="flex"
                alignItems="center"
                justifyContent="space-between"
              >
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Total Flags
                  </Typography>
                  <Typography variant="h4" fontWeight={700}>
                    {stats?.mismatch_flags?.total_flags || 0}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {stats?.mismatch_flags?.resolved || 0} resolved
                  </Typography>
                </Box>
                <WarningAmber color="warning" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box
                display="flex"
                alignItems="center"
                justifyContent="space-between"
              >
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Critical Issues
                  </Typography>
                  <Typography variant="h4" fontWeight={700} color="error">
                    {getSeverityStats("critical")}
                  </Typography>
                </Box>
                <ErrorOutline color="error" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Mismatch Flags Breakdown */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Mismatch Flags by Severity
          </Typography>
          <Grid container spacing={2} mt={1}>
            <Grid item xs={6} sm={3}>
              <Paper sx={{ p: 2, textAlign: "center", bgcolor: "error.light" }}>
                <ErrorOutline color="error" sx={{ fontSize: 32, mb: 1 }} />
                <Typography variant="h5" fontWeight={700} color="error.dark">
                  {getSeverityStats("critical")}
                </Typography>
                <Typography variant="caption" color="error.dark">
                  Critical
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Paper
                sx={{ p: 2, textAlign: "center", bgcolor: "warning.light" }}
              >
                <WarningAmber color="warning" sx={{ fontSize: 32, mb: 1 }} />
                <Typography variant="h5" fontWeight={700} color="warning.dark">
                  {getSeverityStats("high")}
                </Typography>
                <Typography variant="caption" color="warning.dark">
                  High
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Paper sx={{ p: 2, textAlign: "center", bgcolor: "info.light" }}>
                <BugReport color="info" sx={{ fontSize: 32, mb: 1 }} />
                <Typography variant="h5" fontWeight={700} color="info.dark">
                  {getSeverityStats("medium")}
                </Typography>
                <Typography variant="caption" color="info.dark">
                  Medium
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Paper
                sx={{ p: 2, textAlign: "center", bgcolor: "success.light" }}
              >
                <CheckCircle color="success" sx={{ fontSize: 32, mb: 1 }} />
                <Typography variant="h5" fontWeight={700} color="success.dark">
                  {getSeverityStats("low")}
                </Typography>
                <Typography variant="caption" color="success.dark">
                  Low
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Agents Information */}
      <Typography variant="h6" fontWeight={600} mb={2}>
        Multi-Agent System Components
      </Typography>

      <Grid container spacing={3} mb={3}>
        {/* Agent 1: MismatchChecker */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2} mb={2}>
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    bgcolor: "warning.light",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <WarningAmber color="warning" sx={{ fontSize: 32 }} />
                </Box>
                <Box>
                  <Typography variant="h6" fontWeight={600}>
                    MismatchChecker
                  </Typography>
                  <Chip label="Agent 1" size="small" color="warning" />
                </Box>
              </Box>

              <Typography variant="body2" color="text.secondary" paragraph>
                Memeriksa konsistensi diagnosis antara CPPT dan Resume Medis
                menggunakan semantic similarity
              </Typography>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Capabilities:
              </Typography>
              <List dense>
                <ListItem sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <CheckCircle fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Fuzzy string matching"
                    primaryTypographyProps={{ variant: "body2" }}
                  />
                </ListItem>
                <ListItem sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <CheckCircle fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Semantic similarity (Sentence-BERT)"
                    primaryTypographyProps={{ variant: "body2" }}
                  />
                </ListItem>
                <ListItem sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <CheckCircle fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Lab support verification"
                    primaryTypographyProps={{ variant: "body2" }}
                  />
                </ListItem>
                <ListItem sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <CheckCircle fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Vital signs consistency"
                    primaryTypographyProps={{ variant: "body2" }}
                  />
                </ListItem>
              </List>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Outputs:
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={0.5}>
                <Chip label="Mismatch flags" size="small" variant="outlined" />
                <Chip
                  label="Similarity scores"
                  size="small"
                  variant="outlined"
                />
                <Chip label="Recommendations" size="small" variant="outlined" />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Agent 2: ICDValidator */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2} mb={2}>
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    bgcolor: "info.light",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Code color="info" sx={{ fontSize: 32 }} />
                </Box>
                <Box>
                  <Typography variant="h6" fontWeight={600}>
                    ICDValidator
                  </Typography>
                  <Chip label="Agent 2" size="small" color="info" />
                </Box>
              </Box>

              <Typography variant="body2" color="text.secondary" paragraph>
                Validasi kode ICD-10/ICD-9-CM dan kelengkapan dokumentasi medis
              </Typography>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Capabilities:
              </Typography>
              <List dense>
                <ListItem sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <CheckCircle fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="ICD code verification"
                    primaryTypographyProps={{ variant: "body2" }}
                  />
                </ListItem>
                <ListItem sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <CheckCircle fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Semantic consistency check"
                    primaryTypographyProps={{ variant: "body2" }}
                  />
                </ListItem>
                <ListItem sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <CheckCircle fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Documentation completeness"
                    primaryTypographyProps={{ variant: "body2" }}
                  />
                </ListItem>
                <ListItem sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <CheckCircle fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Procedure validation"
                    primaryTypographyProps={{ variant: "body2" }}
                  />
                </ListItem>
              </List>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Outputs:
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={0.5}>
                <Chip label="ICD validation" size="small" variant="outlined" />
                <Chip
                  label="Documentation score"
                  size="small"
                  variant="outlined"
                />
                <Chip
                  label="Code suggestions"
                  size="small"
                  variant="outlined"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Agent 3: AutoChecklist */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2} mb={2}>
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    bgcolor: "success.light",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Assignment color="success" sx={{ fontSize: 32 }} />
                </Box>
                <Box>
                  <Typography variant="h6" fontWeight={600}>
                    AutoChecklist
                  </Typography>
                  <Chip label="Agent 3" size="small" color="success" />
                </Box>
              </Box>

              <Typography variant="body2" color="text.secondary" paragraph>
                Generate comprehensive validation checklist dengan 8+ quality
                checks
              </Typography>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Capabilities:
              </Typography>
              <List dense>
                <ListItem sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <CheckCircle fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Diagnosis match checking"
                    primaryTypographyProps={{ variant: "body2" }}
                  />
                </ListItem>
                <ListItem sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <CheckCircle fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Duration anomaly detection"
                    primaryTypographyProps={{ variant: "body2" }}
                  />
                </ListItem>
                <ListItem sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <CheckCircle fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="CPPT frequency analysis"
                    primaryTypographyProps={{ variant: "body2" }}
                  />
                </ListItem>
                <ListItem sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <CheckCircle fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Overall quality scoring"
                    primaryTypographyProps={{ variant: "body2" }}
                  />
                </ListItem>
              </List>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Outputs:
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={0.5}>
                <Chip label="8+ Checks" size="small" variant="outlined" />
                <Chip label="Quality score" size="small" variant="outlined" />
                <Chip label="Recommendations" size="small" variant="outlined" />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Integration Info */}
      <Card>
        <CardContent>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            System Integration
          </Typography>
          <Grid container spacing={2} mt={1}>
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 2, textAlign: "center" }}>
                <Cloud sx={{ fontSize: 48, color: "primary.main", mb: 1 }} />
                <Typography variant="body2" fontWeight={600}>
                  Orchestrator
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {info?.integration?.orchestrator || "MultiAgentOrchestrator"}
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 2, textAlign: "center" }}>
                <Memory sx={{ fontSize: 48, color: "success.main", mb: 1 }} />
                <Typography variant="body2" fontWeight={600}>
                  Execution Mode
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {info?.integration?.execution_mode || "Sequential"}
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 2, textAlign: "center" }}>
                <Speed sx={{ fontSize: 48, color: "info.main", mb: 1 }} />
                <Typography variant="body2" fontWeight={600}>
                  Avg Execution Time
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {info?.integration?.average_execution_time || "10-30 seconds"}
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Test Connection Dialog */}
      <Dialog
        open={openTestDialog}
        onClose={() => setOpenTestDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <Psychology color="primary" />
            <Typography variant="h6">Connection Test Results</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          {testResult && (
            <Box>
              <Alert
                severity={testResult.success ? "success" : "warning"}
                sx={{ mb: 2 }}
              >
                {testResult.success
                  ? "✅ All systems operational!"
                  : "⚠️ Some systems have issues"}
              </Alert>

              <Typography variant="subtitle2" gutterBottom>
                System Status:
              </Typography>
              <List>
                <ListItem>
                  <ListItemIcon>
                    {testResult.tests?.ai_service ? (
                      <CheckCircle color="success" />
                    ) : (
                      <ErrorOutline color="error" />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary="AI Service"
                    secondary={
                      testResult.tests?.ai_service
                        ? "Connected"
                        : "Not available"
                    }
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    {testResult.tests?.database ? (
                      <CheckCircle color="success" />
                    ) : (
                      <ErrorOutline color="error" />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary="Database"
                    secondary={
                      testResult.tests?.database ? "Connected" : "Not available"
                    }
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    {testResult.tests?.agents ? (
                      <CheckCircle color="success" />
                    ) : (
                      <ErrorOutline color="error" />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary="Agents"
                    secondary={testResult.tests?.agents ? "Ready" : "Not ready"}
                  />
                </ListItem>
              </List>

              <Typography
                variant="caption"
                color="text.secondary"
                mt={2}
                display="block"
              >
                Tested at: {testResult.timestamp || new Date().toLocaleString()}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenTestDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
