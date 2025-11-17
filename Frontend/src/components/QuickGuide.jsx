import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Alert,
  Chip,
} from "@mui/material";
import {
  Upload,
  PlayArrow,
  Psychology,
  CheckCircle,
  Code,
  Assignment,
  Verified,
  Info,
} from "@mui/icons-material";

const steps = [
  {
    label: "Upload Dokumen Resume Medis",
    icon: <Upload color="primary" />,
    description:
      "Langkah pertama adalah mengupload dokumen resume medis pasien",
    details: [
      "Buka halaman Documents",
      "Klik 'Upload Dokumen'",
      "Pilih pasien dan file (PDF/DOCX/TXT)",
      "Status dokumen akan menjadi 'uploaded'",
    ],
    tip: "Pastikan dokumen berisi informasi lengkap: CPPT, diagnosis, prosedur, hasil lab, dan vital signs.",
  },
  {
    label: "Run AI Inference",
    icon: <PlayArrow color="primary" />,
    description:
      "Jalankan AI untuk ekstraksi entitas medis dan matching ICD codes",
    details: [
      "Buka case yang berstatus 'uploaded'",
      "Klik tombol 'Run AI Inference'",
      "Pilih 'Yes' untuk run dengan validation (recommended)",
      "Tunggu proses selesai (30-120 detik)",
    ],
    tip: "AI akan mengekstrak diagnosis & prosedur menggunakan LLM, lalu matching ke ICD codes dengan semantic search.",
  },
  {
    label: "AI Processing",
    icon: <Psychology color="info" />,
    description: "AI melakukan 3 tahap processing utama",
    details: [
      "Entity Extraction: LLM mengekstrak diagnosis & prosedur",
      "ICD Matching: Semantic similarity dengan Sentence-BERT",
      "Validation: 3 AI agents melakukan quality checking",
    ],
    tip: "Proses berjalan di background. Status akan berubah dari 'ai_processing' menjadi 'ai_completed' jika berhasil.",
  },
  {
    label: "Review Hasil AI",
    icon: <Code color="warning" />,
    description: "Review AI recommendations dan validation results",
    details: [
      "Tab 'Kode ICD': Lihat semua rekomendasi ICD-10 & ICD-9-CM",
      "Tab 'Validasi AI': Lihat hasil 3 agents validation",
      "Accept atau edit kode sesuai kebutuhan",
      "Check mismatch flags dan quality score",
    ],
    tip: "Confidence score ≥80% biasanya akurat. Review yang <80% lebih teliti.",
  },
  {
    label: "Multi-Agent Validation",
    icon: <Assignment color="success" />,
    description: "3 AI agents melakukan comprehensive validation",
    details: [
      "Agent 1 - MismatchChecker: Konsistensi diagnosis",
      "Agent 2 - ICDValidator: Validitas kode ICD",
      "Agent 3 - AutoChecklist: 8+ quality checks",
    ],
    tip: "Quality score ≥85% = Excellent, ≥70% = Good. Prioritaskan fix untuk critical & high severity issues.",
  },
  {
    label: "Finalisasi",
    icon: <Verified color="success" />,
    description: "Finalisasi case setelah review selesai",
    details: [
      "Pastikan semua kode sudah benar",
      "Resolve mismatch flags jika ada",
      "Klik 'Finalisasi' untuk lock case",
      "Case tidak bisa diubah setelah finalisasi",
    ],
    tip: "Hanya reviewer/admin yang bisa finalisasi. Pastikan quality score minimal 70%.",
  },
];

export default function QuickGuide({ open, onClose }) {
  const [activeStep, setActiveStep] = useState(0);

  const handleNext = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleReset = () => {
    setActiveStep(0);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <Info color="primary" />
          <Typography variant="h6" fontWeight={700}>
            Quick Guide - SIVALIDRG Workflow
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2">
            Panduan singkat untuk menjalankan AI inference dan validasi coding
            medis.
          </Typography>
        </Alert>

        <Stepper activeStep={activeStep} orientation="vertical">
          {steps.map((step, index) => (
            <Step key={step.label}>
              <StepLabel
                optional={
                  index === steps.length - 1 ? (
                    <Typography variant="caption">Last step</Typography>
                  ) : null
                }
              >
                <Box display="flex" alignItems="center" gap={1}>
                  {step.icon}
                  <Typography variant="subtitle1" fontWeight={600}>
                    {step.label}
                  </Typography>
                </Box>
              </StepLabel>
              <StepContent>
                <Typography variant="body2" color="text.secondary" paragraph>
                  {step.description}
                </Typography>

                <Paper elevation={0} sx={{ p: 2, bgcolor: "grey.50", mb: 2 }}>
                  <List dense>
                    {step.details.map((detail, i) => (
                      <ListItem key={i} sx={{ py: 0.5 }}>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <CheckCircle fontSize="small" color="success" />
                        </ListItemIcon>
                        <ListItemText
                          primary={detail}
                          primaryTypographyProps={{ variant: "body2" }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Paper>

                <Alert severity="success" icon={<Info />} sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    <strong>💡 Tip:</strong> {step.tip}
                  </Typography>
                </Alert>

                <Box sx={{ mb: 2 }}>
                  <div>
                    <Button
                      variant="contained"
                      onClick={handleNext}
                      sx={{ mt: 1, mr: 1 }}
                    >
                      {index === steps.length - 1 ? "Finish" : "Continue"}
                    </Button>
                    <Button
                      disabled={index === 0}
                      onClick={handleBack}
                      sx={{ mt: 1, mr: 1 }}
                    >
                      Back
                    </Button>
                  </div>
                </Box>
              </StepContent>
            </Step>
          ))}
        </Stepper>

        {activeStep === steps.length && (
          <Paper square elevation={0} sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              🎉 Selesai!
            </Typography>
            <Typography variant="body2" paragraph>
              Anda sudah siap menggunakan SIVALIDRG. Mulai dengan upload dokumen
              resume medis dan jalankan AI inference.
            </Typography>
            <Box display="flex" gap={1}>
              <Button onClick={handleReset} variant="outlined">
                Reset
              </Button>
              <Button onClick={onClose} variant="contained">
                Tutup
              </Button>
            </Box>
          </Paper>
        )}

        <Box mt={3}>
          <Alert severity="warning">
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              ⚠️ Troubleshooting
            </Typography>
            <List dense>
              <ListItem sx={{ py: 0 }}>
                <ListItemText
                  primary="Dokumen застрял > 10 menit"
                  secondary="Gunakan 'Reprocess' dengan force option"
                  primaryTypographyProps={{ variant: "body2", fontWeight: 600 }}
                  secondaryTypographyProps={{ variant: "caption" }}
                />
              </ListItem>
              <ListItem sx={{ py: 0 }}>
                <ListItemText
                  primary="Tidak ada rekomendasi AI"
                  secondary="Pastikan dokumen berisi diagnosis/prosedur yang jelas"
                  primaryTypographyProps={{ variant: "body2", fontWeight: 600 }}
                  secondaryTypographyProps={{ variant: "caption" }}
                />
              </ListItem>
              <ListItem sx={{ py: 0 }}>
                <ListItemText
                  primary="AI service unavailable (503)"
                  secondary="Pastikan Ollama service running di port 11434"
                  primaryTypographyProps={{ variant: "body2", fontWeight: 600 }}
                  secondaryTypographyProps={{ variant: "caption" }}
                />
              </ListItem>
            </List>
          </Alert>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Tutup</Button>
      </DialogActions>
    </Dialog>
  );
}
