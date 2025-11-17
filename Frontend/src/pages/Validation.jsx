import { useState } from "react";
import { useQuery } from "react-query";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  TextField,
  InputAdornment,
  Chip,
  Button,
  IconButton,
  Alert,
  LinearProgress,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import {
  Search,
  ExpandMore,
  CheckCircle,
  Warning,
  Error as ErrorIcon,
  Info,
  Visibility,
  Psychology,
  TrendingUp,
  TrendingDown,
  Assignment,
  Code,
  BugReport,
  Science,
} from "@mui/icons-material";
import { DataGrid } from "@mui/x-data-grid";
import { useNavigate } from "react-router-dom";
import { validationAPI, agentsAPI } from "@/services/api";
import { formatDateTime } from "@/utils/debug";

export default function Validation() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // Query agent statistics
  const { data: statsData, isLoading: loadingStats } = useQuery(
    "agent-statistics",
    () => agentsAPI.getStatistics(),
    { refetchInterval: 60000 }
  );

  const stats = statsData?.data?.data;

  const getSeverityColor = (severity) => {
    switch (severity) {
      case "critical":
        return "error";
      case "high":
        return "warning";
      case "medium":
        return "info";
      case "low":
        return "success";
      default:
        return "default";
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case "critical":
        return <ErrorIcon />;
      case "high":
        return <Warning />;
      case "medium":
        return <Info />;
      case "low":
        return <CheckCircle />;
      default:
        return null;
    }
  };

  const getQualityColor = (score) => {
    if (score >= 90) return "success";
    if (score >= 80) return "info";
    if (score >= 70) return "warning";
    return "error";
  };

  const mismatchByType = Array.isArray(stats?.mismatch_by_type)
    ? stats.mismatch_by_type
    : [];

  const totalFlags = stats?.mismatch_flags?.total_flags || 0;

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
            Multi-Agent Validation System
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Quality assurance menggunakan 3 AI agents untuk validasi
            komprehensif
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<Psychology />}
          onClick={() => navigate("/agents")}
        >
          Lihat Detail Agents
        </Button>
      </Box>

      {/* Overview Stats */}
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
                    Total Validasi
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
                    {totalFlags}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {stats?.mismatch_flags?.resolved || 0} resolved
                  </Typography>
                </Box>
                <Warning color="warning" sx={{ fontSize: 40 }} />
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
                    {stats?.mismatch_flags?.critical || 0}
                  </Typography>
                </Box>
                <ErrorIcon color="error" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Quality Distribution */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Quality Distribution
          </Typography>
          <Grid container spacing={2} mt={1}>
            <Grid item xs={12} sm={6} md={2.4}>
              <Paper
                sx={{ p: 2, textAlign: "center", bgcolor: "success.light" }}
              >
                <Typography variant="h5" fontWeight={700} color="success.dark">
                  {stats?.quality_distribution?.excellent || 0}
                </Typography>
                <Typography variant="caption" color="success.dark">
                  Excellent (≥90%)
                </Typography>
              </Paper>
            </Grid>

            <Grid item xs={12} sm={6} md={2.4}>
              <Paper sx={{ p: 2, textAlign: "center", bgcolor: "info.light" }}>
                <Typography variant="h5" fontWeight={700} color="info.dark">
                  {stats?.quality_distribution?.good || 0}
                </Typography>
                <Typography variant="caption" color="info.dark">
                  Good (80-89%)
                </Typography>
              </Paper>
            </Grid>

            <Grid item xs={12} sm={6} md={2.4}>
              <Paper
                sx={{ p: 2, textAlign: "center", bgcolor: "warning.light" }}
              >
                <Typography variant="h5" fontWeight={700} color="warning.dark">
                  {stats?.quality_distribution?.fair || 0}
                </Typography>
                <Typography variant="caption" color="warning.dark">
                  Fair (70-79%)
                </Typography>
              </Paper>
            </Grid>

            <Grid item xs={12} sm={6} md={2.4}>
              <Paper sx={{ p: 2, textAlign: "center", bgcolor: "error.light" }}>
                <Typography variant="h5" fontWeight={700} color="error.dark">
                  {stats?.quality_distribution?.poor || 0}
                </Typography>
                <Typography variant="caption" color="error.dark">
                  Poor (60-69%)
                </Typography>
              </Paper>
            </Grid>

            <Grid item xs={12} sm={6} md={2.4}>
              <Paper sx={{ p: 2, textAlign: "center", bgcolor: "grey.300" }}>
                <Typography variant="h5" fontWeight={700} color="text.primary">
                  {stats?.quality_distribution?.critical || 0}
                </Typography>
                <Typography variant="caption" color="text.primary">
                  Critical (&lt;60%)
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Mismatch Types */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Top Mismatch Types
          </Typography>
          {loadingStats ? (
            <LinearProgress />
          ) : mismatchByType.length > 0 ? (
            <Box>
              {mismatchByType.slice(0, 5).map((item, index) => {
                const percentage =
                  totalFlags > 0 ? (item.count / totalFlags) * 100 : 0;

                return (
                  <Box key={index} mb={2}>
                    <Box display="flex" justifyContent="space-between" mb={0.5}>
                      <Typography variant="body2" fontWeight={500}>
                        {item.mismatch_type.replace(/_/g, " ").toUpperCase()}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {item.count} issues
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={percentage}
                      sx={{
                        height: 8,
                        borderRadius: 4,
                      }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {percentage.toFixed(1)}% of total
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Tidak ada data mismatch yang tersedia.
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Agent Information */}
      <Card>
        <CardContent>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Multi-Agent System Components
          </Typography>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Box display="flex" alignItems="center" gap={2}>
                <Warning color="warning" />
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>
                    Agent 1: MismatchChecker
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Memeriksa konsistensi diagnosis dan lab support
                  </Typography>
                </Box>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" paragraph>
                Agent ini menggunakan fuzzy matching dan semantic similarity
                untuk mendeteksi:
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemIcon>
                    <BugReport fontSize="small" color="primary" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Ketidaksesuaian diagnosis antara CPPT dan Resume"
                    secondary="Menggunakan Sentence-BERT untuk semantic similarity"
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <Science fontSize="small" color="primary" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Dukungan hasil laboratorium untuk diagnosis"
                    secondary="Validasi lab values dengan diagnosis claims"
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <Psychology fontSize="small" color="primary" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Medical synonyms detection"
                    secondary="Deteksi variasi terminologi medis"
                  />
                </ListItem>
              </List>
              <Alert severity="info" sx={{ mt: 2 }}>
                <strong>Technology:</strong> Sentence-BERT untuk semantic
                similarity, Levenshtein distance untuk fuzzy matching
              </Alert>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Box display="flex" alignItems="center" gap={2}>
                <Code color="info" />
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>
                    Agent 2: ICDValidator
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Validasi kode ICD dan kelengkapan dokumentasi
                  </Typography>
                </Box>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" paragraph>
                Agent ini memvalidasi:
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemIcon>
                    <CheckCircle fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Keberadaan kode ICD dalam master database"
                    secondary="Verifikasi kode valid sesuai ICD-10/ICD-9-CM"
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <CheckCircle fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Konsistensi semantik antara kode dan deskripsi"
                    secondary="Semantic search untuk validasi matching"
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <CheckCircle fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Kelengkapan dokumentasi sesuai kategori ICD"
                    secondary="Rules-based validation untuk setiap kategori"
                  />
                </ListItem>
              </List>
              <Alert severity="info" sx={{ mt: 2 }}>
                <strong>Features:</strong> ICD code validation, documentation
                completeness checking, alternative code suggestions
              </Alert>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Box display="flex" alignItems="center" gap={2}>
                <Assignment color="success" />
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>
                    Agent 3: AutoChecklist
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Generate comprehensive quality checklist
                  </Typography>
                </Box>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" paragraph>
                Agent ini menghasilkan 8+ checks komprehensif:
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography
                      variant="subtitle2"
                      fontWeight={600}
                      gutterBottom
                    >
                      ✅ Diagnosis Match
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Konsistensi diagnosis antara CPPT dan Resume
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography
                      variant="subtitle2"
                      fontWeight={600}
                      gutterBottom
                    >
                      🧪 Lab Support
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Dukungan hasil lab untuk diagnosis
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography
                      variant="subtitle2"
                      fontWeight={600}
                      gutterBottom
                    >
                      📋 ICD Validity
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Validitas kode ICD-10/ICD-9-CM
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography
                      variant="subtitle2"
                      fontWeight={600}
                      gutterBottom
                    >
                      📄 Documentation
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Kelengkapan dokumentasi medis
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography
                      variant="subtitle2"
                      fontWeight={600}
                      gutterBottom
                    >
                      ⏱️ Duration Anomaly
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Deteksi anomali durasi rawat inap
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography
                      variant="subtitle2"
                      fontWeight={600}
                      gutterBottom
                    >
                      💉 Vital Signs
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Kelengkapan recording vital signs
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography
                      variant="subtitle2"
                      fontWeight={600}
                      gutterBottom
                    >
                      📝 CPPT Frequency
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Frekuensi pencatatan CPPT
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography
                      variant="subtitle2"
                      fontWeight={600}
                      gutterBottom
                    >
                      🔬 Procedure Docs
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Dokumentasi prosedur medis
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>
              <Alert severity="info" sx={{ mt: 2 }}>
                <strong>Scoring:</strong> Excellent (90-100%), Good (80-89%),
                Fair (70-79%), Poor (60-69%), Critical (&lt;60%)
              </Alert>
            </AccordionDetails>
          </Accordion>
        </CardContent>
      </Card>
    </Box>
  );
}
