// src/pages/CaseDetail.jsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Button,
  IconButton,
  Paper,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Tooltip,
  MenuItem,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Badge,
  Stepper,
  Step,
  StepLabel,
} from "@mui/material";
import {
  ArrowBack,
  PlayArrow,
  Add,
  Delete,
  CheckCircle,
  Science,
  Code,
  Verified,
  Warning,
  Info,
  Assignment,
  Psychology,
  Refresh,
  Error as ErrorIcon,
  AccessTime,
  Loop,
  CheckCircleOutline,
  HourglassEmpty,
  Edit,
  Save,
  Cancel,
  Upload,
  HelpOutline,
} from "@mui/icons-material";
import { useSnackbar } from "notistack";
import apiClient, { codingAPI, validationAPI } from "@/services/api";
import { formatDateTime, truncateText } from "@/utils/debug";
import useAuthStore from "@/store/authStore";
import QuickGuide from "@/components/QuickGuide";

function TabPanel({ children, value, index }) {
  return (
    <Box hidden={value !== index} sx={{ py: 3 }}>
      {value === index && children}
    </Box>
  );
}

export default function EnhancedCaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuthStore();

  const [activeTab, setActiveTab] = useState(0);
  const [codingCase, setCodingCase] = useState(null);
  const [codes, setCodes] = useState(null);
  const [validation, setValidation] = useState(null);
  const [documentStatus, setDocumentStatus] = useState(null);

  const [loadingCase, setLoadingCase] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [processingAction, setProcessingAction] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [processStep, setProcessStep] = useState(0);

  const [openInferenceDialog, setOpenInferenceDialog] = useState(false);
  const [openReprocessDialog, setOpenReprocessDialog] = useState(false);
  const [forceReprocess, setForceReprocess] = useState(false);
  const [runValidation, setRunValidation] = useState(true);

  const [editingCode, setEditingCode] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [openGuide, setOpenGuide] = useState(false);

  const processSteps = [
    "Checking status",
    "Extracting entities",
    "Matching ICD codes",
    "Running validation",
    "Finalizing results",
  ];

  // Load initial data
  useEffect(() => {
    loadCaseData();
  }, [id]);

  const loadCaseData = async () => {
    setLoadingCase(true);
    try {
      // 1. Load case detail
      const caseRes = await apiClient.get(`/api/coding/cases/${id}`);
      const caseData = caseRes.data;

      console.log("Case response:", caseData); // Debug log

      if (!caseData.success) {
        throw new Error(caseData.message || "Gagal memuat case");
      }

      // Handle different response structures
      const caseDetail = caseData.data?.case || caseData.data;

      if (!caseDetail) {
        throw new Error("Case data not found in response");
      }

      setCodingCase(caseDetail);

      // 2. Load codes
      try {
        const codesRes = await apiClient.get(`/api/coding/cases/${id}/codes`);
        const codesData = codesRes.data?.data || codesRes.data;

        // Handle different response structures
        if (codesData?.codes) {
          // If response has grouped codes
          const grouped = codesData.grouped || {};
          setCodes({
            diagnoses: grouped.diagnosis || [],
            procedures: grouped.procedure || [],
          });
        } else if (Array.isArray(codesData)) {
          // If response is array of codes
          setCodes({
            diagnoses: codesData.filter((c) => c.code_type === "diagnosis"),
            procedures: codesData.filter((c) => c.code_type === "procedure"),
          });
        } else {
          setCodes({ diagnoses: [], procedures: [] });
        }
      } catch (err) {
        console.warn("Codes not found:", err);
        setCodes({ diagnoses: [], procedures: [] });
      }

      // 3. Load validation - only if status is ai_completed or finalized
      const status = caseDetail.status;
      if (status === "ai_completed" || status === "finalized") {
        try {
          const validationRes = await validationAPI.getCaseValidation(id);
          const validationData = validationRes.data?.data || validationRes.data;

          if (validationData && validationData.has_validation !== false) {
            setValidation(validationData);
          } else {
            setValidation(null);
          }
        } catch (err) {
          console.warn("Validation not found:", err);
          setValidation(null);
        }
      } else {
        setValidation(null);
      }

      // 4. Load document status
      if (caseDetail.document_id) {
        await checkDocumentStatus(caseDetail.document_id);
      } else {
        setDocumentStatus(null);
      }
    } catch (err) {
      console.error("Failed to load case data:", err);
      console.error("Error details:", err.response?.data); // Debug log

      enqueueSnackbar(
        err.response?.data?.message || err.message || "Gagal memuat data case",
        {
          variant: "error",
        }
      );

      if (err.response?.status === 401) {
        navigate("/login");
      } else if (err.response?.status === 404) {
        // Case not found - set flag
        setCodingCase(null);
      }
    } finally {
      setLoadingCase(false);
    }
  };

  const checkDocumentStatus = async (documentId) => {
    setLoadingStatus(true);
    try {
      const statusRes = await apiClient.get(
        `/api/coding/documents/${documentId}/status`
      );
      const statusData = statusRes.data;
      if (statusData.success) {
        setDocumentStatus(statusData.data);
      }
    } catch (err) {
      console.error("Failed to check status:", err);
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleRunInference = async () => {
    if (!codingCase?.document_id) {
      enqueueSnackbar("Document ID tidak tersedia", { variant: "error" });
      return;
    }

    setProcessingAction(true);
    setProcessProgress(0);
    setProcessStep(0);

    const progressInterval = setInterval(() => {
      setProcessProgress((prev) => {
        const newProgress = Math.min(prev + 2, 95);
        const newStep = Math.floor((newProgress / 100) * processSteps.length);
        setProcessStep(Math.min(newStep, processSteps.length - 1));
        return newProgress;
      });
    }, 1000);

    try {
      const inferRes = await apiClient.post("/api/coding/infer", {
        document_id: codingCase.document_id,
        run_validation: runValidation,
      });

      if (!inferRes.data.success) throw new Error(inferRes.data.message);

      clearInterval(progressInterval);
      setProcessProgress(100);
      setProcessStep(processSteps.length - 1);

      console.log("Inference result:", inferRes.data); // Debug

      enqueueSnackbar(
        `AI inference berhasil! Ditemukan ${inferRes.data.data.total_recommendations} rekomendasi`,
        { variant: "success" }
      );

      await loadCaseData();
      setOpenInferenceDialog(false);
    } catch (err) {
      clearInterval(progressInterval);
      const errorMsg = err.response?.data?.message || "Inference gagal";
      enqueueSnackbar(errorMsg, { variant: "error" });

      // Show actionable solutions from error response
      if (err.response?.data?.error?.solutions) {
        const solutions = err.response.data.error.solutions;
        console.log("Available solutions:", solutions);
      }
    } finally {
      setProcessingAction(false);
      setProcessProgress(0);
      setProcessStep(0);
    }
  };

  const handleReprocess = async (force = false) => {
    if (!codingCase?.document_id) {
      enqueueSnackbar("Document ID tidak tersedia", { variant: "error" });
      return;
    }

    setProcessingAction(true);
    setProcessProgress(0);
    setProcessStep(0);

    const progressInterval = setInterval(() => {
      setProcessProgress((prev) => {
        const newProgress = Math.min(prev + 2, 95);
        const newStep = Math.floor((newProgress / 100) * processSteps.length);
        setProcessStep(Math.min(newStep, processSteps.length - 1));
        return newProgress;
      });
    }, 1000);

    try {
      const endpoint = force
        ? `/api/coding/infer/reprocess?force=true`
        : `/api/coding/infer/reprocess`;

      const reprocessRes = await apiClient.post(endpoint, {
        document_id: codingCase.document_id,
        run_validation: runValidation,
      });

      if (!reprocessRes.data.success)
        throw new Error(reprocessRes.data.message);

      clearInterval(progressInterval);
      setProcessProgress(100);
      setProcessStep(processSteps.length - 1);

      enqueueSnackbar(
        force
          ? "Force reprocess berhasil dimulai"
          : "Reprocess berhasil dimulai",
        { variant: "success" }
      );

      await loadCaseData();
      setOpenReprocessDialog(false);
    } catch (err) {
      clearInterval(progressInterval);
      enqueueSnackbar(err.response?.data?.message || "Reprocess gagal", {
        variant: "error",
      });
    } finally {
      setProcessingAction(false);
      setProcessProgress(0);
      setProcessStep(0);
    }
  };

  const handleFinalize = async () => {
    if (
      window.confirm(
        "Finalisasi case ini? Tindakan ini tidak dapat dibatalkan."
      )
    ) {
      try {
        await codingAPI.finalizeCase(id);
        enqueueSnackbar("Case berhasil difinalisasi", { variant: "success" });
        await loadCaseData();
      } catch (err) {
        enqueueSnackbar(err.response?.data?.message || "Finalisasi gagal", {
          variant: "error",
        });
      }
    }
  };

  const handleAddCode = async (type) => {
    const code = window.prompt(
      `Masukkan kode ${type === "diagnoses" ? "ICD-10" : "ICD-9-CM"}:`
    );
    if (!code) return;

    try {
      await codingAPI.addCode(id, { type, code });
      enqueueSnackbar("Kode berhasil ditambahkan", { variant: "success" });
      await loadCaseData();
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Gagal menambahkan kode", {
        variant: "error",
      });
    }
  };

  const handleDeleteCode = async (codeId) => {
    if (window.confirm("Hapus kode ini?")) {
      try {
        await codingAPI.deleteCode(id, codeId);
        enqueueSnackbar("Kode berhasil dihapus", { variant: "success" });
        await loadCaseData();
      } catch (err) {
        enqueueSnackbar(err.response?.data?.message || "Gagal menghapus kode", {
          variant: "error",
        });
      }
    }
  };

  const startEditCode = (code) => {
    setEditingCode(code.id);
    setEditForm({ ...code });
  };

  const cancelEdit = () => {
    setEditingCode(null);
    setEditForm({});
  };

  const saveEdit = async () => {
    try {
      await codingAPI.deleteCode(id, editingCode);
      await codingAPI.addCode(id, {
        type: editForm.type,
        code: editForm.code,
        description: editForm.description,
      });
      enqueueSnackbar("Kode berhasil diperbarui", { variant: "success" });
      setEditingCode(null);
      await loadCaseData();
    } catch (err) {
      enqueueSnackbar("Gagal memperbarui kode", { variant: "error" });
    }
  };

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

  const getStatusLabel = (status) => {
    switch (status) {
      case "uploaded":
        return "Uploaded";
      case "ai_processing":
        return "AI Processing";
      case "ai_completed":
        return "AI Selesai";
      case "in_review":
        return "Dalam Review";
      case "finalized":
        return "Finalized";
      case "failed":
        return "Gagal";
      default:
        return status;
    }
  };

  const isStuck =
    documentStatus?.is_stuck ||
    (codingCase?.status === "ai_processing" &&
      codingCase?.seconds_since_update > 600);

  if (loadingCase) {
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

  if (!codingCase) {
    return (
      <Box>
        <Box display="flex" alignItems="center" gap={2} mb={3}>
          <IconButton onClick={() => navigate(-1)} size="small">
            <ArrowBack />
          </IconButton>
          <Typography variant="h5" fontWeight={700}>
            Case Detail #{id}
          </Typography>
        </Box>
        <Alert severity="error">
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Case tidak ditemukan atau Anda tidak memiliki akses.
          </Typography>
          <Typography variant="body2">
            Pastikan ID case benar dan Anda memiliki permission untuk
            mengaksesnya.
          </Typography>
        </Alert>
        <Box mt={2}>
          <Button variant="outlined" onClick={() => navigate("/coding")}>
            Kembali ke Coding Cases
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
      >
        <Box display="flex" alignItems="center" gap={2}>
          <IconButton onClick={() => navigate(-1)} size="small">
            <ArrowBack />
          </IconButton>
          <Box>
            <Typography variant="h5" fontWeight={700}>
              Case Detail #{codingCase.id}
            </Typography>
            <Box display="flex" alignItems="center" gap={1} mt={0.5}>
              <Chip
                label={getStatusLabel(codingCase.status)}
                size="small"
                color={getStatusColor(codingCase.status)}
              />
              {isStuck && (
                <Chip
                  label="STUCK"
                  size="small"
                  color="error"
                  icon={<Warning />}
                />
              )}
              {validation && (
                <Chip
                  label={`Score: ${validation.overall_score?.toFixed(1)}%`}
                  size="small"
                  color={
                    validation.overall_score >= 90
                      ? "success"
                      : validation.overall_score >= 80
                      ? "info"
                      : "warning"
                  }
                />
              )}
            </Box>
          </Box>
        </Box>

        <Box display="flex" gap={1}>
          <Tooltip title="Panduan singkat cara menggunakan AI inference">
            <Button
              variant="outlined"
              startIcon={<HelpOutline />}
              onClick={() => setOpenGuide(true)}
              size="small"
              color="info"
            >
              Help
            </Button>
          </Tooltip>

          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={loadCaseData}
            size="small"
          >
            Refresh
          </Button>

          {codingCase.status === "ai_completed" && user.role !== "admin" && (
            <Button
              variant="contained"
              color="success"
              startIcon={<CheckCircle />}
              onClick={handleFinalize}
            >
              Finalisasi
            </Button>
          )}

          {(documentStatus?.can_process || codingCase?.status === "uploaded") &&
            codingCase?.document_id && (
              <Tooltip title="Jalankan AI untuk ekstraksi entitas medis dan matching ICD codes">
                <Button
                  variant="contained"
                  startIcon={<PlayArrow />}
                  onClick={() => setOpenInferenceDialog(true)}
                  disabled={loadingCase}
                  color="primary"
                  size="large"
                  sx={{ fontWeight: 700 }}
                >
                  Run AI Inference
                </Button>
              </Tooltip>
            )}

          {(documentStatus?.can_reprocess || documentStatus?.is_stuck) &&
            codingCase?.document_id && (
              <Tooltip
                title={
                  isStuck
                    ? "Dokumen застрял, perlu force reprocess"
                    : "Proses ulang dokumen ini"
                }
              >
                <Button
                  variant="outlined"
                  color="warning"
                  startIcon={<Loop />}
                  onClick={() => {
                    setForceReprocess(documentStatus?.is_stuck || false);
                    setOpenReprocessDialog(true);
                  }}
                  disabled={loadingCase}
                >
                  Reprocess
                </Button>
              </Tooltip>
            )}
        </Box>
      </Box>

      {/* Status & Action Guidance */}
      {codingCase.status === "uploaded" && (
        <Alert severity="info" sx={{ mb: 3 }} icon={<Info />}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            📄 Dokumen siap diproses
          </Typography>
          <Typography variant="body2">
            Dokumen telah diupload dan siap untuk AI inference. Klik tombol{" "}
            <strong>"Run AI Inference"</strong> di kanan atas untuk memulai
            proses ekstraksi entitas medis dan matching ICD codes.
          </Typography>
        </Alert>
      )}

      {codingCase.status === "ai_processing" && !isStuck && (
        <Alert
          severity="info"
          sx={{ mb: 3 }}
          icon={<HourglassEmpty className="rotating" />}
        >
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            ⏳ AI sedang memproses dokumen...
          </Typography>
          <Typography variant="body2">
            Proses ini membutuhkan waktu 30-120 detik. Silakan tunggu atau
            refresh halaman ini dalam beberapa saat.
          </Typography>
        </Alert>
      )}

      {isStuck && (
        <Alert severity="error" sx={{ mb: 3 }} icon={<Warning />}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            ⚠️ Dokumen застрял dalam processing!
          </Typography>
          <Typography variant="body2">
            Dokumen застрял lebih dari 10 menit. Klik tombol{" "}
            <strong>"Reprocess"</strong> dengan force option untuk memproses
            ulang dari awal.
          </Typography>
        </Alert>
      )}

      {codingCase.status === "ai_completed" && (
        <Alert severity="success" sx={{ mb: 3 }} icon={<CheckCircle />}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            ✅ AI inference selesai!
          </Typography>
          <Typography variant="body2">
            Ditemukan {codes?.diagnoses?.length || 0} diagnosis dan{" "}
            {codes?.procedures?.length || 0} prosedur.
            {validation &&
              validation.overall_score &&
              ` Quality Score: ${validation.overall_score.toFixed(1)}%`}
            {!validation &&
              " Review kode di tab 'Kode ICD' dan klik 'Finalisasi' jika sudah sesuai."}
          </Typography>
          {validation &&
            validation.mismatch_flags &&
            validation.mismatch_flags.length > 0 && (
              <Typography variant="body2" color="warning.dark" mt={1}>
                ⚠️ Terdapat {validation.mismatch_flags.length} validation
                findings. Check tab 'Validasi AI' untuk detail.
              </Typography>
            )}
        </Alert>
      )}

      {codingCase.status === "failed" && (
        <Alert severity="error" sx={{ mb: 3 }} icon={<ErrorIcon />}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            ❌ Processing gagal
          </Typography>
          <Typography variant="body2">
            Proses AI inference mengalami kegagalan. Coba lakukan reprocess atau
            hubungi administrator.
          </Typography>
        </Alert>
      )}

      {/* Patient & Document Info */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                gutterBottom
              >
                Informasi Pasien
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    NoRM
                  </Typography>
                  <Typography variant="body1" fontWeight={500}>
                    {codingCase.norm}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    Nama
                  </Typography>
                  <Typography variant="body1" fontWeight={500}>
                    {codingCase.patient_name}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    Jenis Kelamin
                  </Typography>
                  <Typography variant="body1" fontWeight={500}>
                    {codingCase.gender === "male" ? "Laki-laki" : "Perempuan"}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    Tanggal Lahir
                  </Typography>
                  <Typography variant="body1" fontWeight={500}>
                    {formatDateTime(codingCase.birth_date)}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                gutterBottom
              >
                Informasi Dokumen
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    File
                  </Typography>
                  <Typography variant="body1" fontWeight={500}>
                    {codingCase.document_filename || "-"}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    Uploaded
                  </Typography>
                  <Typography variant="body1" fontWeight={500}>
                    {formatDateTime(codingCase.created_at)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    Oleh
                  </Typography>
                  <Typography variant="body1" fontWeight={500}>
                    {codingCase.uploader_name}
                  </Typography>
                </Grid>
                {codingCase.updated_at && (
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">
                      Terakhir Update
                    </Typography>
                    <Typography variant="body1" fontWeight={500}>
                      {formatDateTime(codingCase.updated_at)}
                      {codingCase.seconds_since_update > 0 && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          component="span"
                          ml={1}
                        >
                          ({Math.floor(codingCase.seconds_since_update / 60)}{" "}
                          menit lalu)
                        </Typography>
                      )}
                    </Typography>
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Card>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{ borderBottom: 1, borderColor: "divider" }}
        >
          <Tab label="Kode ICD" />
          <Tab
            label="Validasi AI"
            disabled={!validation}
            icon={
              validation ? (
                <Badge
                  badgeContent={validation.mismatch_flags?.length || 0}
                  color="error"
                >
                  <Psychology />
                </Badge>
              ) : (
                <Psychology />
              )
            }
            iconPosition="start"
          />
          <Tab label="History" />
        </Tabs>

        {/* Tab 1: ICD Codes */}
        <TabPanel value={activeTab} index={0}>
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            mb={2}
          >
            <Typography variant="h6" fontWeight={600}>
              Kode ICD yang Ditemukan
            </Typography>
            <Box display="flex" gap={1}>
              <Button
                size="small"
                startIcon={<Add />}
                onClick={() => handleAddCode("diagnoses")}
              >
                ICD-10
              </Button>
              <Button
                size="small"
                startIcon={<Add />}
                onClick={() => handleAddCode("procedures")}
              >
                ICD-9-CM
              </Button>
            </Box>
          </Box>

          {/* Diagnoses */}
          <Typography variant="subtitle1" fontWeight={600} gutterBottom mt={3}>
            Diagnosis (ICD-10)
          </Typography>
          {codes?.diagnoses && codes.diagnoses.length > 0 ? (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Kode</TableCell>
                    <TableCell>Deskripsi</TableCell>
                    <TableCell>Confidence</TableCell>
                    <TableCell>Sumber</TableCell>
                    <TableCell width={100}>Aksi</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {codes.diagnoses.map((code) => (
                    <TableRow key={code.id}>
                      <TableCell>
                        {editingCode === code.id ? (
                          <TextField
                            size="small"
                            value={editForm.code || ""}
                            onChange={(e) =>
                              setEditForm({ ...editForm, code: e.target.value })
                            }
                          />
                        ) : (
                          <Typography fontWeight={600}>{code.code}</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingCode === code.id ? (
                          <TextField
                            size="small"
                            fullWidth
                            value={editForm.description || ""}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                description: e.target.value,
                              })
                            }
                          />
                        ) : (
                          code.description
                        )}
                      </TableCell>
                      <TableCell>
                        {code.confidence !== null &&
                        code.confidence !== undefined ? (
                          <Chip
                            label={`${(code.confidence * 100).toFixed(0)}%`}
                            size="small"
                            color={
                              code.confidence >= 0.8
                                ? "success"
                                : code.confidence >= 0.5
                                ? "warning"
                                : "error"
                            }
                          />
                        ) : (
                          <Chip label="N/A" size="small" variant="outlined" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={code.source || "unknown"}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        {editingCode === code.id ? (
                          <>
                            <IconButton size="small" onClick={saveEdit}>
                              <Save fontSize="small" />
                            </IconButton>
                            <IconButton size="small" onClick={cancelEdit}>
                              <Cancel fontSize="small" />
                            </IconButton>
                          </>
                        ) : (
                          <>
                            <IconButton
                              size="small"
                              onClick={() => startEditCode(code)}
                            >
                              <Edit fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteCode(code.id)}
                            >
                              <Delete fontSize="small" />
                            </IconButton>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Alert severity="info">
              Belum ada diagnosis ICD-10.
              {codingCase.status === "uploaded" &&
                " Jalankan AI inference untuk mendapatkan rekomendasi."}
            </Alert>
          )}

          {/* Procedures */}
          <Typography variant="subtitle1" fontWeight={600} gutterBottom mt={4}>
            Prosedur (ICD-9-CM)
          </Typography>
          {codes?.procedures && codes.procedures.length > 0 ? (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Kode</TableCell>
                    <TableCell>Deskripsi</TableCell>
                    <TableCell>Confidence</TableCell>
                    <TableCell>Sumber</TableCell>
                    <TableCell width={100}>Aksi</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {codes.procedures.map((code) => (
                    <TableRow key={code.id}>
                      <TableCell>
                        {editingCode === code.id ? (
                          <TextField
                            size="small"
                            value={editForm.code || ""}
                            onChange={(e) =>
                              setEditForm({ ...editForm, code: e.target.value })
                            }
                          />
                        ) : (
                          <Typography fontWeight={600}>{code.code}</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingCode === code.id ? (
                          <TextField
                            size="small"
                            fullWidth
                            value={editForm.description || ""}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                description: e.target.value,
                              })
                            }
                          />
                        ) : (
                          code.description
                        )}
                      </TableCell>
                      <TableCell>
                        {code.confidence !== null &&
                        code.confidence !== undefined ? (
                          <Chip
                            label={`${(code.confidence * 100).toFixed(0)}%`}
                            size="small"
                            color={
                              code.confidence >= 0.8
                                ? "success"
                                : code.confidence >= 0.5
                                ? "warning"
                                : "error"
                            }
                          />
                        ) : (
                          <Chip label="N/A" size="small" variant="outlined" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={code.source || "unknown"}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        {editingCode === code.id ? (
                          <>
                            <IconButton size="small" onClick={saveEdit}>
                              <Save fontSize="small" />
                            </IconButton>
                            <IconButton size="small" onClick={cancelEdit}>
                              <Cancel fontSize="small" />
                            </IconButton>
                          </>
                        ) : (
                          <>
                            <IconButton
                              size="small"
                              onClick={() => startEditCode(code)}
                            >
                              <Edit fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteCode(code.id)}
                            >
                              <Delete fontSize="small" />
                            </IconButton>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Alert severity="info">
              Belum ada prosedur ICD-9-CM.
              {codingCase.status === "uploaded" &&
                " Jalankan AI inference untuk mendapatkan rekomendasi."}
            </Alert>
          )}
        </TabPanel>

        {/* Tab 2: Validation */}
        <TabPanel value={activeTab} index={1}>
          {validation ? (
            <Box>
              <Box
                display="flex"
                alignItems="center"
                justifyContent="space-between"
                mb={3}
              >
                <Box display="flex" alignItems="center" gap={2}>
                  <Psychology sx={{ fontSize: 40, color: "primary.main" }} />
                  <Box>
                    <Typography variant="h6" fontWeight={600}>
                      Multi-Agent Validation Results
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Quality Score:{" "}
                      {validation.overall_score?.toFixed(1) || "N/A"}%
                    </Typography>
                  </Box>
                </Box>
                <Chip
                  label={
                    validation.overall_score >= 90
                      ? "EXCELLENT"
                      : validation.overall_score >= 80
                      ? "GOOD"
                      : validation.overall_score >= 70
                      ? "FAIR"
                      : "NEEDS REVIEW"
                  }
                  color={
                    validation.overall_score >= 90
                      ? "success"
                      : validation.overall_score >= 80
                      ? "info"
                      : validation.overall_score >= 70
                      ? "warning"
                      : "error"
                  }
                />
              </Box>

              {/* Checklist Summary */}
              {validation.checklist && (
                <Card sx={{ mb: 3, bgcolor: "grey.50" }}>
                  <CardContent>
                    <Typography variant="h6" fontWeight={600} gutterBottom>
                      Quality Checklist
                    </Typography>
                    <Grid container spacing={2} mt={1}>
                      {validation.checklist.checks?.map((check, index) => (
                        <Grid item xs={12} md={6} key={index}>
                          <Paper sx={{ p: 2 }}>
                            <Box
                              display="flex"
                              alignItems="center"
                              gap={1}
                              mb={1}
                            >
                              {check.status === "pass" && (
                                <CheckCircle color="success" fontSize="small" />
                              )}
                              {check.status === "warning" && (
                                <Warning color="warning" fontSize="small" />
                              )}
                              {check.status === "fail" && (
                                <ErrorIcon color="error" fontSize="small" />
                              )}
                              <Typography variant="subtitle2" fontWeight={600}>
                                {check.check_name}
                              </Typography>
                              <Chip
                                label={`${check.score}%`}
                                size="small"
                                color={
                                  check.status === "pass"
                                    ? "success"
                                    : check.status === "warning"
                                    ? "warning"
                                    : "error"
                                }
                              />
                            </Box>
                            <Typography variant="body2" color="text.secondary">
                              {check.message}
                            </Typography>
                          </Paper>
                        </Grid>
                      ))}
                    </Grid>
                  </CardContent>
                </Card>
              )}

              {/* Mismatch Flags */}
              {validation.mismatch_flags?.length > 0 && (
                <Box mt={3}>
                  <Typography variant="h6" fontWeight={600} gutterBottom>
                    Validation Findings ({validation.mismatch_flags.length})
                  </Typography>
                  <List>
                    {validation.mismatch_flags.map((mismatch, i) => (
                      <ListItem
                        key={i}
                        sx={{
                          mb: 1,
                          bgcolor: "background.paper",
                          borderRadius: 2,
                          border: 1,
                          borderColor:
                            mismatch.severity === "critical"
                              ? "error.light"
                              : mismatch.severity === "high"
                              ? "warning.light"
                              : "info.light",
                        }}
                      >
                        <ListItemIcon>
                          {mismatch.severity === "critical" && (
                            <ErrorIcon color="error" />
                          )}
                          {mismatch.severity === "high" && (
                            <Warning color="warning" />
                          )}
                          {mismatch.severity === "medium" && (
                            <Info color="info" />
                          )}
                          {mismatch.severity === "low" && (
                            <CheckCircleOutline color="success" />
                          )}
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Box display="flex" alignItems="center" gap={1}>
                              <Typography variant="subtitle2" fontWeight={600}>
                                {mismatch.type
                                  ?.replace(/_/g, " ")
                                  .toUpperCase()}
                              </Typography>
                              <Chip
                                label={mismatch.severity}
                                size="small"
                                color={
                                  mismatch.severity === "critical"
                                    ? "error"
                                    : mismatch.severity === "high"
                                    ? "warning"
                                    : mismatch.severity === "medium"
                                    ? "info"
                                    : "success"
                                }
                              />
                              {mismatch.similarity_score !== null && (
                                <Chip
                                  label={`Score: ${(
                                    mismatch.similarity_score * 100
                                  ).toFixed(0)}%`}
                                  size="small"
                                  variant="outlined"
                                />
                              )}
                            </Box>
                          }
                          secondary={
                            <Box mt={1}>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                <strong>Field:</strong> {mismatch.field}
                              </Typography>
                              {mismatch.expected_value && (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  <strong>Expected:</strong>{" "}
                                  {mismatch.expected_value}
                                </Typography>
                              )}
                              {mismatch.actual_value && (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  <strong>Actual:</strong>{" "}
                                  {mismatch.actual_value}
                                </Typography>
                              )}
                              <Typography
                                variant="body2"
                                color="primary.main"
                                mt={1}
                              >
                                <strong>Recommendation:</strong>{" "}
                                {mismatch.recommendation}
                              </Typography>
                            </Box>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}
            </Box>
          ) : (
            <Alert severity="info">
              Validasi belum dijalankan. Jalankan AI inference dengan validation
              terlebih dahulu.
            </Alert>
          )}
        </TabPanel>

        {/* Tab 3: History */}
        <TabPanel value={activeTab} index={2}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Activity History
          </Typography>
          <List>
            <ListItem>
              <ListItemIcon>
                <Upload />
              </ListItemIcon>
              <ListItemText
                primary="Dokumen diupload"
                secondary={`${codingCase.uploader_name} • ${formatDateTime(
                  codingCase.created_at
                )}`}
              />
            </ListItem>
            {codingCase.ai_started_at && (
              <ListItem>
                <ListItemIcon>
                  <PlayArrow />
                </ListItemIcon>
                <ListItemText
                  primary="AI inference dimulai"
                  secondary={formatDateTime(codingCase.ai_started_at)}
                />
              </ListItem>
            )}
            {codingCase.ai_completed_at && (
              <ListItem>
                <ListItemIcon>
                  <CheckCircle />
                </ListItemIcon>
                <ListItemText
                  primary="AI inference selesai"
                  secondary={formatDateTime(codingCase.ai_completed_at)}
                />
              </ListItem>
            )}
            {codingCase.finalized_at && (
              <ListItem>
                <ListItemIcon>
                  <Verified />
                </ListItemIcon>
                <ListItemText
                  primary="Case difinalisasi"
                  secondary={`${
                    codingCase.finalized_by_name
                  } • ${formatDateTime(codingCase.finalized_at)}`}
                />
              </ListItem>
            )}
          </List>
        </TabPanel>
      </Card>

      {/* Inference Dialog */}
      <Dialog
        open={openInferenceDialog}
        onClose={() => !processingAction && setOpenInferenceDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <Psychology color="primary" />
            <Typography variant="h6">Run AI Inference</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            AI akan mengekstrak entitas medis dan melakukan matching ke kode
            ICD-10/ICD-9-CM menggunakan semantic search.
          </Alert>

          <Box mb={2}>
            <Typography variant="subtitle2" gutterBottom>
              Process Steps:
            </Typography>
            <List dense>
              <ListItem>
                <ListItemIcon>
                  <CheckCircle fontSize="small" color="success" />
                </ListItemIcon>
                <ListItemText
                  primary="Entity Extraction"
                  secondary="Ekstraksi diagnosis & prosedur menggunakan LLM"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <CheckCircle fontSize="small" color="success" />
                </ListItemIcon>
                <ListItemText
                  primary="ICD Code Matching"
                  secondary="Semantic similarity dengan Sentence-BERT"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <CheckCircle fontSize="small" color="success" />
                </ListItemIcon>
                <ListItemText
                  primary="Multi-Agent Validation"
                  secondary="3 AI agents untuk quality checking"
                />
              </ListItem>
            </List>
          </Box>

          <Box mb={2}>
            <TextField
              select
              fullWidth
              label="Run Validation"
              value={runValidation}
              onChange={(e) => setRunValidation(e.target.value === "true")}
              helperText="Disarankan untuk menjalankan validasi langsung"
            >
              <MenuItem value="true">
                Yes - Run dengan validation (Recommended)
              </MenuItem>
              <MenuItem value="false">No - Skip validation</MenuItem>
            </TextField>
          </Box>

          {processingAction && (
            <Box>
              <Typography variant="body2" gutterBottom>
                Processing...
              </Typography>
              <Stepper activeStep={processStep} sx={{ mb: 2 }}>
                {processSteps.map((label) => (
                  <Step key={label}>
                    <StepLabel>{label}</StepLabel>
                  </Step>
                ))}
              </Stepper>
              <LinearProgress variant="determinate" value={processProgress} />
              <Typography variant="caption" color="text.secondary" mt={1}>
                {processProgress}% - {processSteps[processStep]}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setOpenInferenceDialog(false)}
            disabled={processingAction}
          >
            Batal
          </Button>
          <Button
            variant="contained"
            onClick={handleRunInference}
            disabled={processingAction}
            startIcon={
              processingAction ? <CircularProgress size={20} /> : <PlayArrow />
            }
          >
            {processingAction ? "Processing..." : "Run AI Inference"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reprocess Dialog */}
      <Dialog
        open={openReprocessDialog}
        onClose={() => !processingAction && setOpenReprocessDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <Loop color="warning" />
            <Typography variant="h6">
              {forceReprocess
                ? "Force Reprocess Document"
                : "Reprocess Document"}
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            {forceReprocess
              ? "⚠️ Force reprocess akan menghapus semua AI recommendations dan validation results yang ada, lalu memproses ulang dari awal."
              : "Reprocess akan menghapus AI recommendations lama dan menjalankan inference ulang."}
          </Alert>

          {documentStatus?.is_stuck && (
            <Alert severity="error" sx={{ mb: 2 }}>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Document is STUCK!
              </Typography>
              <Typography variant="body2">
                Dokumen застрял di processing lebih dari 10 menit. Force
                reprocess disarankan untuk mengatasi masalah ini.
              </Typography>
            </Alert>
          )}

          <Box mb={2}>
            <Typography variant="subtitle2" gutterBottom>
              What will happen:
            </Typography>
            <List dense>
              <ListItem>
                <ListItemIcon>
                  <Delete fontSize="small" color="error" />
                </ListItemIcon>
                <ListItemText
                  primary="Delete old AI recommendations"
                  secondary="Semua rekomendasi AI sebelumnya akan dihapus"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <Delete fontSize="small" color="error" />
                </ListItemIcon>
                <ListItemText
                  primary="Delete validation results"
                  secondary="Mismatch flags & checklist akan dihapus"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <PlayArrow fontSize="small" color="success" />
                </ListItemIcon>
                <ListItemText
                  primary="Process from scratch"
                  secondary="Dokumen akan diproses ulang dari awal"
                />
              </ListItem>
            </List>
          </Box>

          <Box mb={2}>
            <TextField
              select
              fullWidth
              label="Run Validation"
              value={runValidation}
              onChange={(e) => setRunValidation(e.target.value === "true")}
            >
              <MenuItem value="true">Yes - Run dengan validation</MenuItem>
              <MenuItem value="false">No - Skip validation</MenuItem>
            </TextField>
          </Box>

          {processingAction && (
            <Box>
              <Typography variant="body2" gutterBottom>
                Reprocessing...
              </Typography>
              <Stepper activeStep={processStep} sx={{ mb: 2 }}>
                {processSteps.map((label) => (
                  <Step key={label}>
                    <StepLabel>{label}</StepLabel>
                  </Step>
                ))}
              </Stepper>
              <LinearProgress variant="determinate" value={processProgress} />
              <Typography variant="caption" color="text.secondary" mt={1}>
                {processProgress}% - {processSteps[processStep]}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setOpenReprocessDialog(false)}
            disabled={processingAction}
          >
            Batal
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => handleReprocess(forceReprocess)}
            disabled={processingAction}
            startIcon={
              processingAction ? <CircularProgress size={20} /> : <Loop />
            }
          >
            {processingAction
              ? "Processing..."
              : forceReprocess
              ? "Force Reprocess"
              : "Reprocess"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Status Check Info */}
      {documentStatus && (
        <Box mt={3}>
          <Card variant="outlined">
            <CardContent>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                gutterBottom
              >
                Document Processing Status
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">
                    Status
                  </Typography>
                  <Box mt={0.5}>
                    <Chip
                      label={documentStatus.document_status}
                      size="small"
                      color={getStatusColor(documentStatus.document_status)}
                    />
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">
                    Can Process
                  </Typography>
                  <Box mt={0.5}>
                    {documentStatus.can_process ? (
                      <CheckCircle color="success" fontSize="small" />
                    ) : (
                      <Cancel color="error" fontSize="small" />
                    )}
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">
                    Can Reprocess
                  </Typography>
                  <Box mt={0.5}>
                    {documentStatus.can_reprocess ? (
                      <CheckCircle color="success" fontSize="small" />
                    ) : (
                      <Cancel color="error" fontSize="small" />
                    )}
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">
                    Stuck
                  </Typography>
                  <Box mt={0.5}>
                    {documentStatus.is_stuck ? (
                      <Warning color="error" fontSize="small" />
                    ) : (
                      <CheckCircle color="success" fontSize="small" />
                    )}
                  </Box>
                </Grid>
              </Grid>

              {documentStatus.available_actions?.length > 0 && (
                <Box mt={2}>
                  <Typography variant="caption" color="text.secondary">
                    Available Actions:
                  </Typography>
                  <Box mt={1} display="flex" gap={1} flexWrap="wrap">
                    {documentStatus.available_actions.map((action, i) => (
                      <Chip
                        key={i}
                        label={action.action.replace("_", " ")}
                        size="small"
                        color={action.recommended ? "primary" : "default"}
                        variant={action.recommended ? "filled" : "outlined"}
                        icon={action.recommended ? <CheckCircle /> : undefined}
                      />
                    ))}
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>
      )}

      <style>{`
        @keyframes rotating {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .rotating {
          animation: rotating 2s linear infinite;
        }
      `}</style>

      {/* Quick Guide Dialog */}
      <QuickGuide open={openGuide} onClose={() => setOpenGuide(false)} />
    </Box>
  );
}
