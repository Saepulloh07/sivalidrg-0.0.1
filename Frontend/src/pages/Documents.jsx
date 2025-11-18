import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  InputAdornment,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Chip,
  Alert,
  CircularProgress,
  MenuItem,
  Paper,
  LinearProgress,
} from "@mui/material";
import {
  Search,
  Upload,
  Visibility,
  CloudUpload,
  Description,
  CheckCircle,
  Error,
  Delete,
} from "@mui/icons-material";
import { DataGrid } from "@mui/x-data-grid";
import { useSnackbar } from "notistack";
import { documentsAPI, patientsAPI } from "@/services/api";
import { formatDateTime, truncateText } from "@/utils/debug";

export default function Documents() {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [openUploadDialog, setOpenUploadDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedPatient, setSelectedPatient] = useState("");
  const [viewDocument, setViewDocument] = useState(null);

  // Query documents
  const { data, isLoading } = useQuery(
    ["documents", page, pageSize, statusFilter],
    () =>
      documentsAPI.getAll({
        page: page + 1,
        limit: pageSize,
        status: statusFilter || undefined,
      }),
    { keepPreviousData: true }
  );

  // Query patients for dropdown
  const { data: patientsData } = useQuery("patients-list", () =>
    patientsAPI.getAll({ page: 1, limit: 1000 })
  );

  // Upload mutation
  const uploadMutation = useMutation(documentsAPI.upload, {
    onSuccess: () => {
      queryClient.invalidateQueries("documents");
      enqueueSnackbar("Dokumen berhasil diupload", { variant: "success" });
      handleCloseUploadDialog();
    },
    onError: (error) => {
      enqueueSnackbar(error.response?.data?.message || "Gagal upload dokumen", {
        variant: "error",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation(documentsAPI.delete, {
    onSuccess: () => {
      queryClient.invalidateQueries("documents");
      enqueueSnackbar("Dokumen berhasil dihapus", { variant: "success" });
    },
    onError: (error) => {
      enqueueSnackbar(
        error.response?.data?.message || "Gagal menghapus dokumen",
        { variant: "error" }
      );
    },
  });

  const handleRunInference = async (documentId) => {
    try {
      // Check status first
      const statusRes = await documentsAPI.checkStatus(documentId);
      const status = statusRes.data.data;

      if (!status.can_process) {
        if (status.is_stuck) {
          if (window.confirm("Document stuck. Force reprocess?")) {
            await codingAPI.reprocessDocument(documentId, true, true);
          }
        } else {
          alert(
            "Document tidak dapat diproses: " +
              status.available_actions[0]?.description
          );
        }
        return;
      }

      // Normal processing
      await codingAPI.runInference(documentId, true);
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        enqueueSnackbar("Ukuran file maksimal 10MB", { variant: "error" });
        return;
      }

      // Validate file type
      const allowedTypes = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
      ];
      if (!allowedTypes.includes(file.type)) {
        enqueueSnackbar(
          "Format file tidak didukung. Gunakan PDF, DOCX, atau TXT",
          {
            variant: "error",
          }
        );
        return;
      }

      setSelectedFile(file);
    }
  };

  const handleUpload = () => {
    if (!selectedFile || !selectedPatient) {
      enqueueSnackbar("Pilih file dan pasien terlebih dahulu", {
        variant: "warning",
      });
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("patient_id", selectedPatient);
    formData.append("source", "upload");

    uploadMutation.mutate(formData);
  };

  const handleCloseUploadDialog = () => {
    setOpenUploadDialog(false);
    setSelectedFile(null);
    setSelectedPatient("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleViewDocument = (doc) => {
    setViewDocument(doc);
  };

  const handleDelete = (id) => {
    if (window.confirm("Yakin ingin menghapus dokumen ini?")) {
      deleteMutation.mutate(id);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "uploaded":
        return "default";
      case "processing":
      case "ai_processing":
        return "info";
      case "ai_completed":
        return "warning";
      case "finalized":
        return "success";
      case "failed":
        return "error";
      default:
        return "default";
    }
  };

  const getStatusLabel = (status) => {
    const labels = {
      uploaded: "Uploaded",
      processing: "Processing",
      ai_processing: "AI Processing",
      ai_completed: "AI Completed",
      finalized: "Finalized",
      failed: "Failed",
    };
    return labels[status] || status;
  };

  const columns = [
    {
      field: "id",
      headerName: "ID",
      width: 80,
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
      field: "source",
      headerName: "Sumber",
      width: 120,
      renderCell: (params) => <Chip label={params.value} size="small" />,
    },
    {
      field: "status",
      headerName: "Status",
      width: 150,
      renderCell: (params) => (
        <Chip
          label={getStatusLabel(params.value)}
          size="small"
          color={getStatusColor(params.value)}
        />
      ),
    },
    {
      field: "uploader_name",
      headerName: "Diupload Oleh",
      width: 150,
    },
    {
      field: "created_at",
      headerName: "Tanggal Upload",
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
          <IconButton
            size="small"
            onClick={() => handleViewDocument(params.row)}
            color="primary"
          >
            <Visibility fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => handleDelete(params.row.id)}
            color="error"
            disabled={params.row.status === "finalized"}
          >
            <Delete fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

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
          Dokumen Resume Medis
        </Typography>
        <Button
          variant="contained"
          startIcon={<CloudUpload />}
          onClick={() => setOpenUploadDialog(true)}
        >
          Upload Dokumen
        </Button>
      </Box>

      {/* Filters */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={8}>
              <TextField
                fullWidth
                placeholder="Cari dokumen..."
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
          disableSelectionOnClick
          sx={{
            "& .MuiDataGrid-cell:focus": {
              outline: "none",
            },
          }}
        />
      </Card>

      {/* Upload Dialog */}
      <Dialog
        open={openUploadDialog}
        onClose={handleCloseUploadDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Upload Dokumen Resume Medis</DialogTitle>
        <DialogContent>
          <Box mt={2}>
            <Alert severity="info" sx={{ mb: 3 }}>
              Format yang didukung: PDF, DOCX, TXT (Max 10MB)
            </Alert>

            <TextField
              fullWidth
              select
              label="Pilih Pasien"
              value={selectedPatient}
              onChange={(e) => setSelectedPatient(e.target.value)}
              sx={{ mb: 3 }}
              required
            >
              <MenuItem value="">-- Pilih Pasien --</MenuItem>
              {patientsData?.data?.data?.map((patient) => (
                <MenuItem key={patient.id} value={patient.id}>
                  {patient.name} ({patient.norm})
                </MenuItem>
              ))}
            </TextField>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />

            <Paper
              sx={{
                p: 3,
                textAlign: "center",
                border: "2px dashed",
                borderColor: selectedFile ? "primary.main" : "grey.300",
                bgcolor: selectedFile ? "primary.light" : "grey.50",
                cursor: "pointer",
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <Description
                sx={{
                  fontSize: 48,
                  color: selectedFile ? "primary.main" : "grey.400",
                  mb: 2,
                }}
              />
              {selectedFile ? (
                <>
                  <Typography variant="body1" fontWeight={600} gutterBottom>
                    {selectedFile.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </Typography>
                </>
              ) : (
                <>
                  <Typography variant="body1" gutterBottom>
                    Klik untuk memilih file
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    atau drag & drop file di sini
                  </Typography>
                </>
              )}
            </Paper>

            {uploadMutation.isLoading && (
              <Box mt={2}>
                <LinearProgress />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  align="center"
                  mt={1}
                >
                  Mengupload dan mengekstrak teks...
                </Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseUploadDialog}>Batal</Button>
          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={
              !selectedFile || !selectedPatient || uploadMutation.isLoading
            }
            startIcon={
              uploadMutation.isLoading ? (
                <CircularProgress size={20} />
              ) : (
                <Upload />
              )
            }
          >
            Upload
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Document Dialog */}
      <Dialog
        open={Boolean(viewDocument)}
        onClose={() => setViewDocument(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Detail Dokumen</DialogTitle>
        <DialogContent>
          {viewDocument && (
            <Box>
              <Grid container spacing={2} mb={3}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    Pasien
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {viewDocument.patient_name}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    NoRM
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {viewDocument.norm}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    Status
                  </Typography>
                  <Box mt={0.5}>
                    <Chip
                      label={getStatusLabel(viewDocument.status)}
                      size="small"
                      color={getStatusColor(viewDocument.status)}
                    />
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    Diupload Oleh
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {viewDocument.uploader_name}
                  </Typography>
                </Grid>
              </Grid>

              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Raw Text Preview
              </Typography>
              <Paper
                sx={{
                  p: 2,
                  maxHeight: 400,
                  overflow: "auto",
                  bgcolor: "grey.50",
                  fontSize: "0.875rem",
                  fontFamily: "monospace",
                }}
              >
                {viewDocument.raw_text ? (
                  viewDocument.raw_text
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Tidak ada teks tersedia
                  </Typography>
                )}
              </Paper>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDocument(null)}>Tutup</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
