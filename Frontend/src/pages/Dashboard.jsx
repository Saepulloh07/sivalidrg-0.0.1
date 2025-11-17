import { useState } from "react";
import { useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Paper,
  LinearProgress,
  IconButton,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
} from "@mui/material";
import {
  People,
  Description,
  Code,
  CheckCircle,
  TrendingUp,
  Refresh,
  Visibility,
  Psychology,
} from "@mui/icons-material";
import { dashboardAPI } from "@/services/api";
import { formatNumber, formatDateTime } from "@/utils/debug";
import useAuthStore from "@/store/authStore";

function StatCard({ title, value, icon, color = "primary", subtitle, trend }) {
  return (
    <Card sx={{ height: "100%", position: "relative", overflow: "visible" }}>
      <CardContent>
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="flex-start"
        >
          <Box>
            <Typography color="text.secondary" variant="body2" gutterBottom>
              {title}
            </Typography>
            <Typography variant="h4" fontWeight={700} color={color}>
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary">
                {subtitle}
              </Typography>
            )}
            {trend && (
              <Box display="flex" alignItems="center" mt={1}>
                <TrendingUp fontSize="small" color="success" />
                <Typography variant="caption" color="success.main" ml={0.5}>
                  {trend}
                </Typography>
              </Box>
            )}
          </Box>
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: 2,
              bgcolor: `${color}.light`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: `${color}.dark`,
            }}
          >
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

function QualityBar({ label, value, total, color = "primary" }) {
  const percentage = total > 0 ? (value / total) * 100 : 0;

  return (
    <Box mb={2}>
      <Box display="flex" justifyContent="space-between" mb={0.5}>
        <Typography variant="body2" fontWeight={500}>
          {label}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {value} / {total}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={percentage}
        sx={{
          height: 8,
          borderRadius: 4,
          bgcolor: "grey.200",
          "& .MuiLinearProgress-bar": {
            bgcolor: `${color}.main`,
            borderRadius: 4,
          },
        }}
      />
      <Typography variant="caption" color="text.secondary">
        {percentage.toFixed(1)}%
      </Typography>
    </Box>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [period, setPeriod] = useState(30);
  const [activeTab, setActiveTab] = useState(0);

  // Queries
  const {
    data: overview,
    isLoading: loadingOverview,
    refetch: refetchOverview,
  } = useQuery(
    ["dashboard-overview", period],
    () => dashboardAPI.getOverview(period),
    { refetchInterval: 60000 }
  );

  const { data: performance, isLoading: loadingPerformance } = useQuery(
    ["dashboard-performance", period],
    () => dashboardAPI.getPerformance(period),
    { enabled: activeTab === 1 }
  );

  const { data: qualityTrends, isLoading: loadingQuality } = useQuery(
    ["dashboard-quality", period],
    () => dashboardAPI.getQualityTrends(period),
    { enabled: activeTab === 2 }
  );

  const { data: activities, isLoading: loadingActivities } = useQuery(
    ["dashboard-activities"],
    () => dashboardAPI.getActivities(20),
    { refetchInterval: 30000 }
  );

  const { data: myDashboard, isLoading: loadingMyDash } = useQuery(
    ["my-dashboard", period],
    () => dashboardAPI.getMyDashboard(period),
    { enabled: user?.role !== "admin" }
  );

  const getActivityIcon = (type) => {
    switch (type) {
      case "document_upload":
        return <Description fontSize="small" color="primary" />;
      case "coding_finalized":
        return <CheckCircle fontSize="small" color="success" />;
      case "validation_completed":
        return <Psychology fontSize="small" color="info" />;
      default:
        return <Code fontSize="small" />;
    }
  };

  const getActivityLabel = (type) => {
    switch (type) {
      case "document_upload":
        return "Dokumen Diupload";
      case "coding_finalized":
        return "Coding Finalized";
      case "validation_completed":
        return "Validasi Selesai";
      default:
        return type;
    }
  };

  if (loadingOverview) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="60vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  const stats = overview?.data?.data;

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
          <Typography variant="h4" fontWeight={700} gutterBottom>
            Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Selamat datang kembali, {user?.name}
          </Typography>
        </Box>
        <Box display="flex" gap={1}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setPeriod(7)}
            color={period === 7 ? "primary" : "inherit"}
          >
            7 Hari
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setPeriod(30)}
            color={period === 30 ? "primary" : "inherit"}
          >
            30 Hari
          </Button>
          <IconButton onClick={refetchOverview} color="primary">
            <Refresh />
          </IconButton>
        </Box>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Pasien"
            value={formatNumber(stats?.patients?.total || 0)}
            subtitle={`+${stats?.patients?.new_this_period || 0} pasien baru`}
            icon={<People sx={{ fontSize: 32 }} />}
            color="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Dokumen"
            value={formatNumber(stats?.documents?.total || 0)}
            subtitle={`${stats?.documents?.finalized || 0} finalized`}
            icon={<Description sx={{ fontSize: 32 }} />}
            color="info"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Coding Cases"
            value={formatNumber(stats?.coding_cases?.total || 0)}
            subtitle={`${stats?.coding_cases?.finalized || 0} finalized`}
            icon={<Code sx={{ fontSize: 32 }} />}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Avg Quality Score"
            value={`${stats?.validation?.avg_score || 0}%`}
            subtitle={`${stats?.validation?.total_validated || 0} validasi`}
            icon={<CheckCircle sx={{ fontSize: 32 }} />}
            color="warning"
          />
        </Grid>
      </Grid>

      {/* My Dashboard (for Coder/Reviewer) */}
      {user?.role !== "admin" && myDashboard?.data?.data && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              Dashboard Saya
            </Typography>
            <Grid container spacing={2} mt={1}>
              <Grid item xs={12} sm={4}>
                <Paper sx={{ p: 2, bgcolor: "primary.light" }}>
                  <Typography variant="body2" color="primary.dark">
                    Kasus Assigned
                  </Typography>
                  <Typography
                    variant="h4"
                    fontWeight={700}
                    color="primary.dark"
                  >
                    {myDashboard.data.data.summary.cases.total_assigned || 0}
                  </Typography>
                  <Typography variant="caption" color="primary.dark">
                    {myDashboard.data.data.summary.cases.finalized || 0} selesai
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Paper sx={{ p: 2, bgcolor: "success.light" }}>
                  <Typography variant="body2" color="success.dark">
                    Kode Ditambahkan
                  </Typography>
                  <Typography
                    variant="h4"
                    fontWeight={700}
                    color="success.dark"
                  >
                    {myDashboard.data.data.summary.codes.total_codes || 0}
                  </Typography>
                  <Typography variant="caption" color="success.dark">
                    {myDashboard.data.data.summary.codes.diagnosis_codes || 0}{" "}
                    diagnosis,{" "}
                    {myDashboard.data.data.summary.codes.procedure_codes || 0}{" "}
                    prosedur
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Paper sx={{ p: 2, bgcolor: "info.light" }}>
                  <Typography variant="body2" color="info.dark">
                    Dokumen Upload
                  </Typography>
                  <Typography variant="h4" fontWeight={700} color="info.dark">
                    {myDashboard.data.data.summary.documents.total_uploaded ||
                      0}
                  </Typography>
                  <Typography variant="caption" color="info.dark">
                    {myDashboard.data.data.summary.documents.finalized || 0}{" "}
                    finalized
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Tabs for Different Views */}
      <Card sx={{ mb: 3 }}>
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)}>
            <Tab label="Aktivitas Terkini" />
            <Tab label="Performance" />
            <Tab label="Quality Trends" />
          </Tabs>
        </Box>

        {/* Tab 0: Recent Activities */}
        {activeTab === 0 && (
          <CardContent>
            {loadingActivities ? (
              <Box display="flex" justifyContent="center" py={4}>
                <CircularProgress />
              </Box>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Aktivitas</TableCell>
                      <TableCell>Pasien</TableCell>
                      <TableCell>User</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Waktu</TableCell>
                      <TableCell align="center">Aksi</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {activities?.data?.data?.map((activity, index) => (
                      <TableRow key={index} hover>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            {getActivityIcon(activity.activity_type)}
                            <Typography variant="body2">
                              {getActivityLabel(activity.activity_type)}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>
                            {activity.patient_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {activity.patient_norm}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {activity.user_name || "-"}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={activity.status}
                            size="small"
                            color={
                              activity.status.includes("finalized")
                                ? "success"
                                : activity.status.includes("Score")
                                ? "info"
                                : "default"
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">
                            {formatDateTime(activity.created_at)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <IconButton
                            size="small"
                            onClick={() =>
                              navigate(`/coding/${activity.entity_id}`)
                            }
                          >
                            <Visibility fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        )}

        {/* Tab 1: Performance */}
        {activeTab === 1 && (
          <CardContent>
            {loadingPerformance ? (
              <Box display="flex" justifyContent="center" py={4}>
                <CircularProgress />
              </Box>
            ) : (
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Typography variant="h6" fontWeight={600} gutterBottom>
                    Waktu Pemrosesan
                  </Typography>
                  <Box mt={2}>
                    <QualityBar
                      label="Rata-rata"
                      value={
                        performance?.data?.data?.processing_time?.average || 0
                      }
                      total={
                        performance?.data?.data?.processing_time?.maximum || 100
                      }
                      color="info"
                    />
                    <Typography variant="caption" color="text.secondary">
                      Min:{" "}
                      {performance?.data?.data?.processing_time?.minimum || 0}s
                      | Max:{" "}
                      {performance?.data?.data?.processing_time?.maximum || 0}s
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="h6" fontWeight={600} gutterBottom>
                    AI Accuracy
                  </Typography>
                  <Box mt={2}>
                    <QualityBar
                      label="Acceptance Rate"
                      value={
                        performance?.data?.data?.ai_accuracy?.accepted || 0
                      }
                      total={
                        performance?.data?.data?.ai_accuracy
                          ?.total_recommendations || 100
                      }
                      color="success"
                    />
                    <Typography variant="caption" color="text.secondary">
                      {performance?.data?.data?.ai_accuracy?.acceptance_rate ||
                        0}
                      % rekomendasi diterima
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            )}
          </CardContent>
        )}

        {/* Tab 2: Quality Trends */}
        {activeTab === 2 && (
          <CardContent>
            {loadingQuality ? (
              <Box display="flex" justifyContent="center" py={4}>
                <CircularProgress />
              </Box>
            ) : qualityTrends?.data?.data?.quality_trends?.length > 0 ? (
              <Box>
                <Typography variant="h6" fontWeight={600} gutterBottom>
                  Trend Kualitas Validasi
                </Typography>
                <Box mt={2}>
                  {qualityTrends.data.data.quality_trends
                    .slice(0, 7)
                    .map((trend, index) => (
                      <Box key={index} mb={2}>
                        <Box
                          display="flex"
                          justifyContent="space-between"
                          mb={0.5}
                        >
                          <Typography variant="body2">
                            {new Date(trend.date).toLocaleDateString("id-ID")}
                          </Typography>
                          <Typography variant="body2" fontWeight={600}>
                            {trend.avg_score}%
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={parseFloat(trend.avg_score)}
                          sx={{
                            height: 6,
                            borderRadius: 3,
                            bgcolor: "grey.200",
                          }}
                        />
                        <Typography variant="caption" color="text.secondary">
                          {trend.total_validations} validasi ({trend.excellent}{" "}
                          excellent, {trend.good} good)
                        </Typography>
                      </Box>
                    ))}
                </Box>
              </Box>
            ) : (
              <Alert severity="info">Belum ada data trend kualitas</Alert>
            )}
          </CardContent>
        )}
      </Card>
    </Box>
  );
}
