import { useState } from "react";
import { useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  InputAdornment,
  IconButton,
  Chip,
  MenuItem,
  Grid,
  Button,
  Tooltip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
} from "@mui/material";
import {
  Search,
  Visibility,
  Assignment,
  CheckCircle,
  Schedule,
  Error,
  Warning,
  Refresh,
  PlayArrow,
  Loop,
  AccessTime,
  HourglassEmpty,
} from "@mui/icons-material";
import { DataGrid } from "@mui/x-data-grid";
import { codingAPI } from "@/services/api";
import { formatDateTime } from "@/utils/debug";
import useAuthStore from "@/store/authStore";
import { useSnackbar } from "notistack";

export default function CodingCases({ myOnly = false }) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { enqueueSnackbar } = useSnackbar();

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Batch action states
  const [selectedRows, setSelectedRows] = useState([]);
  const [openBatchDialog, setOpenBatchDialog] = useState(false);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({});

  // Query
  const { data, isLoading, refetch } = useQuery(
    ["coding-cases", page, pageSize, statusFilter, search, myOnly],
    () =>
      codingAPI.getCases({
        page: page + 1,
        limit: pageSize,
        status: statusFilter || undefined,
        search,
        my_only: myOnly,
      }),
    {
      keepPreviousData: true,
      refetchInterval: 30000, // Auto refresh every 30 seconds
    }
  );

  const getStatusColor = (status) => {
    switch (status) {
      case "uploaded":
        return "default";
      case "ai_processing":
        return "info";
      case "ai_completed":
        return "warning";
      case "in_review":
        return "secondary";
      case "finalized":
        return "success";
      case "failed":
        return "error";
      default:
        return "default";
    }
  };

  const getStatusIcon = (status, isStuck) => {
    if (isStuck) return <Warning fontSize="small" />;

    switch (status) {
      case "finalized":
        return <CheckCircle fontSize="small" />;
      case "ai_processing":
        return <HourglassEmpty fontSize="small" className="rotating" />;
      case "ai_completed":
        return <CheckCircle fontSize="small" />;
      case "in_review":
        return <Assignment fontSize="small" />;
      case "failed":
        return <Error fontSize="small" />;
      case "uploaded":
        return <Schedule fontSize="small" />;
      default:
        return null;
    }
  };

  const getStatusLabel = (status) => {
    const labels = {
      uploaded: "Uploaded",
      ai_processing: "AI Processing",
      ai_completed: "AI Completed",
      in_review: "In Review",
      finalized: "Finalized",
      failed: "Failed",
    };
    return labels[status] || status;
  };

  const handleBatchReprocess = async () => {
    if (selectedRows.length === 0) {
      enqueueSnackbar("Pilih minimal 1 case untuk reprocess", {
        variant: "warning",
      });
      return;
    }

    if (!window.confirm(`Reprocess ${selectedRows.length} cases?`)) {
      return;
    }

    setBatchProcessing(true);
    const progress = {};
    selectedRows.forEach((id) => {
      progress[id] = { status: "waiting", message: "Waiting..." };
    });
    setBatchProgress(progress);

    for (const caseId of selectedRows) {
      try {
        // Update progress
        setBatchProgress((prev) => ({
          ...prev,
          [caseId]: { status: "processing", message: "Processing..." },
        }));

        // Get case detail to get document_id
        const caseRes = await codingAPI.getCaseById(caseId);
        const documentId = caseRes.data.data.case.document_id;

        // Check if stuck
        const isStuck = caseRes.data.data.case.is_stuck;

        // Reprocess
        await codingAPI.reprocessDocument(documentId, true, isStuck);

        setBatchProgress((prev) => ({
          ...prev,
          [caseId]: { status: "success", message: "Success!" },
        }));
      } catch (error) {
        setBatchProgress((prev) => ({
          ...prev,
          [caseId]: {
            status: "error",
            message: error.response?.data?.message || "Failed",
          },
        }));
      }

      // Small delay between requests
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    setBatchProcessing(false);
    enqueueSnackbar("Batch reprocess selesai", { variant: "info" });
    refetch();
  };

  const columns = [
    {
      field: "id",
      headerName: "Case ID",
      width: 100,
      renderCell: (params) => (
        <Typography variant="body2" fontWeight={600}>
          #{params.value}
        </Typography>
      ),
    },
    {
      field: "patient_name",
      headerName: "Pasien",
      flex: 1,
      minWidth: 200,
      renderCell: (params) => (
        <Box>
          <Typography variant="body2" fontWeight={600}>
            {params.value}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            NoRM: {params.row.norm}
          </Typography>
        </Box>
      ),
    },
    {
      field: "status",
      headerName: "Status",
      width: 200,
      renderCell: (params) => {
        const isStuck = params.row.is_stuck;
        const secondsSinceUpdate = params.row.seconds_since_update || 0;

        return (
          <Box display="flex" alignItems="center" gap={1}>
            <Chip
              icon={getStatusIcon(params.value, isStuck)}
              label={getStatusLabel(params.value)}
              size="small"
              color={getStatusColor(params.value)}
            />
            {isStuck && (
              <Tooltip
                title={`stuck ${Math.floor(
                  secondsSinceUpdate / 60
                )} menit. Perlu force reprocess!`}
                arrow
              >
                <Chip
                  label="stuck"
                  color="error"
                  size="small"
                  icon={<AccessTime fontSize="small" />}
                  sx={{
                    fontWeight: 700,
                    animation: "pulse 2s infinite",
                  }}
                />
              </Tooltip>
            )}
          </Box>
        );
      },
    },
    {
      field: "assignee_name",
      headerName: "Assigned To",
      width: 150,
      renderCell: (params) => params.value || "-",
    },
    {
      field: "ai_recommendations_count",
      headerName: "AI Codes",
      width: 100,
      align: "center",
      renderCell: (params) => (
        <Chip
          label={params.value || 0}
          size="small"
          color="info"
          variant="outlined"
        />
      ),
    },
    {
      field: "final_codes_count",
      headerName: "Final Codes",
      width: 120,
      align: "center",
      renderCell: (params) => (
        <Chip
          label={params.value || 0}
          size="small"
          color="success"
          variant="outlined"
        />
      ),
    },
    {
      field: "validation_score",
      headerName: "Score",
      width: 100,
      align: "center",
      renderCell: (params) => {
        if (!params.value) return "-";

        const score = parseFloat(params.value);
        let color = "default";
        if (score >= 85) color = "success";
        else if (score >= 70) color = "info";
        else if (score >= 60) color = "warning";
        else color = "error";

        return (
          <Chip
            label={`${score}%`}
            size="small"
            color={color}
            sx={{ fontWeight: 600 }}
          />
        );
      },
    },
    {
      field: "created_at",
      headerName: "Created",
      width: 180,
      renderCell: (params) => (
        <Typography variant="caption">
          {formatDateTime(params.value)}
        </Typography>
      ),
    },
    {
      field: "actions",
      headerName: "Aksi",
      width: 120,
      sortable: false,
      renderCell: (params) => (
        <Box>
          <Tooltip title="Lihat Detail">
            <IconButton
              size="small"
              color="primary"
              onClick={() => navigate(`/coding/${params.row.id}`)}
            >
              <Visibility fontSize="small" />
            </IconButton>
          </Tooltip>

          {params.row.is_stuck && (
            <Tooltip title="Force Reprocess">
              <IconButton
                size="small"
                color="error"
                onClick={async () => {
                  if (window.confirm("Force reprocess stuck document?")) {
                    try {
                      await codingAPI.reprocessDocument(
                        params.row.document_id,
                        true,
                        true
                      );
                      enqueueSnackbar("Reprocess dimulai", {
                        variant: "success",
                      });
                      refetch();
                    } catch (error) {
                      enqueueSnackbar(
                        error.response?.data?.message || "Reprocess gagal",
                        { variant: "error" }
                      );
                    }
                  }
                }}
              >
                <Loop fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      ),
    },
  ];

  // Calculate statistics
  const stats = {
    total: data?.data?.pagination?.total || 0,
    ai_processing:
      data?.data?.data?.filter((c) => c.status === "ai_processing").length || 0,
    in_review:
      data?.data?.data?.filter((c) => c.status === "in_review").length || 0,
    finalized:
      data?.data?.data?.filter((c) => c.status === "finalized").length || 0,
    stuck: data?.data?.data?.filter((c) => c.is_stuck).length || 0,
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
        <Typography variant="h5" fontWeight={700}>
          {myOnly ? "Kasus Saya" : "Semua Coding Cases"}
        </Typography>

        <Box display="flex" gap={1}>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={() => refetch()}
          >
            Refresh
          </Button>

          {selectedRows.length > 0 && (
            <Button
              variant="contained"
              color="warning"
              startIcon={<Loop />}
              onClick={() => setOpenBatchDialog(true)}
            >
              Batch Reprocess ({selectedRows.length})
            </Button>
          )}
        </Box>
      </Box>

      {/* stuck Warning */}
      {stats.stuck > 0 && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                const stuckCases = data?.data?.data?.filter((c) => c.is_stuck);
                setSelectedRows(stuckCases.map((c) => c.id));
                setOpenBatchDialog(true);
              }}
            >
              Reprocess All
            </Button>
          }
        >
          <Typography variant="subtitle2" fontWeight={600}>
            ⚠️ {stats.stuck} dokumen stuck dalam processing!
          </Typography>
          <Typography variant="body2">
            Dokumen stuck lebih dari 10 menit perlu di-force reprocess.
          </Typography>
        </Alert>
      )}

      {/* Stats */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent>
              <Box
                display="flex"
                alignItems="center"
                justifyContent="space-between"
              >
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Total Cases
                  </Typography>
                  <Typography variant="h5" fontWeight={700}>
                    {stats.total}
                  </Typography>
                </Box>
                <Assignment color="primary" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent>
              <Box
                display="flex"
                alignItems="center"
                justifyContent="space-between"
              >
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    AI Processing
                  </Typography>
                  <Typography variant="h5" fontWeight={700}>
                    {stats.ai_processing}
                  </Typography>
                </Box>
                <Schedule color="info" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent>
              <Box
                display="flex"
                alignItems="center"
                justifyContent="space-between"
              >
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    In Review
                  </Typography>
                  <Typography variant="h5" fontWeight={700}>
                    {stats.in_review}
                  </Typography>
                </Box>
                <Error color="warning" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent>
              <Box
                display="flex"
                alignItems="center"
                justifyContent="space-between"
              >
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Finalized
                  </Typography>
                  <Typography variant="h5" fontWeight={700}>
                    {stats.finalized}
                  </Typography>
                </Box>
                <CheckCircle color="success" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ bgcolor: stats.stuck > 0 ? "error.light" : "inherit" }}>
            <CardContent>
              <Box
                display="flex"
                alignItems="center"
                justifyContent="space-between"
              >
                <Box>
                  <Typography
                    variant="body2"
                    color={stats.stuck > 0 ? "error.dark" : "text.secondary"}
                  >
                    stuck
                  </Typography>
                  <Typography
                    variant="h5"
                    fontWeight={700}
                    color={stats.stuck > 0 ? "error.dark" : "inherit"}
                  >
                    {stats.stuck}
                  </Typography>
                </Box>
                <Warning
                  color={stats.stuck > 0 ? "error" : "disabled"}
                  sx={{ fontSize: 40 }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={8}>
              <TextField
                fullWidth
                placeholder="Cari berdasarkan NoRM atau nama pasien..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                select
                label="Filter Status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="">Semua Status</MenuItem>
                <MenuItem value="uploaded">Uploaded</MenuItem>
                <MenuItem value="ai_processing">AI Processing</MenuItem>
                <MenuItem value="ai_completed">AI Completed</MenuItem>
                <MenuItem value="in_review">In Review</MenuItem>
                <MenuItem value="finalized">Finalized</MenuItem>
                <MenuItem value="failed">Failed</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Data Grid */}
      <Card>
        <DataGrid
          rows={data?.data?.data || []}
          columns={columns}
          loading={isLoading}
          page={page}
          pageSize={pageSize}
          rowCount={data?.data?.pagination?.total || 0}
          paginationMode="server"
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          rowsPerPageOptions={[10, 25, 50]}
          autoHeight
          checkboxSelection
          disableSelectionOnClick
          onSelectionModelChange={(newSelection) => {
            setSelectedRows(newSelection);
          }}
          selectionModel={selectedRows}
          sx={{
            "& .MuiDataGrid-cell:focus": {
              outline: "none",
            },
            "& .MuiDataGrid-row.stuck": {
              bgcolor: "error.lighter",
            },
          }}
          getRowClassName={(params) => (params.row.is_stuck ? "stuck" : "")}
        />
      </Card>

      {/* Batch Reprocess Dialog */}
      <Dialog
        open={openBatchDialog}
        onClose={() => !batchProcessing && setOpenBatchDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Batch Reprocess ({selectedRows.length} cases)</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Reprocess akan menghapus AI recommendations dan validation results
            lama.
          </Alert>

          {batchProcessing && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" gutterBottom>
                Progress:
              </Typography>
              {Object.entries(batchProgress).map(([caseId, progress]) => (
                <Box
                  key={caseId}
                  display="flex"
                  alignItems="center"
                  gap={1}
                  mb={1}
                >
                  <Typography variant="caption" sx={{ minWidth: 80 }}>
                    Case #{caseId}
                  </Typography>
                  {progress.status === "processing" && (
                    <CircularProgress size={16} />
                  )}
                  {progress.status === "success" && (
                    <CheckCircle color="success" fontSize="small" />
                  )}
                  {progress.status === "error" && (
                    <Error color="error" fontSize="small" />
                  )}
                  <Typography variant="caption" color="text.secondary">
                    {progress.message}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setOpenBatchDialog(false)}
            disabled={batchProcessing}
          >
            {batchProcessing ? "Processing..." : "Batal"}
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleBatchReprocess}
            disabled={batchProcessing}
          >
            {batchProcessing ? <CircularProgress size={24} /> : "Reprocess All"}
          </Button>
        </DialogActions>
      </Dialog>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .rotating {
          animation: rotate 2s linear infinite;
        }
      `}</style>
    </Box>
  );
}
