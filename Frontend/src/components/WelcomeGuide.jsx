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
  Paper,
  IconButton,
} from "@mui/material";
import {
  Close,
  Dashboard,
  Upload,
  Code,
  CheckCircle,
  Psychology,
} from "@mui/icons-material";
import useAuthStore from "@/store/authStore";

const steps = [
  {
    label: "Selamat Datang",
    icon: <Dashboard />,
    title: "Selamat Datang di SIVALIDRG",
    description:
      "Sistem Validasi Resume Medis berbasis AI untuk coding ICD-10 dan ICD-9-CM yang akurat dan efisien.",
    features: [
      "AI-powered entity extraction menggunakan LLM",
      "Semantic matching dengan Sentence-BERT",
      "Multi-Agent validation system",
      "Real-time quality scoring",
    ],
  },
  {
    label: "Upload Dokumen",
    icon: <Upload />,
    title: "Upload Resume Medis",
    description: "Unggah dokumen resume medis pasien untuk diproses oleh AI.",
    features: [
      "Support format PDF, DOCX, dan TXT",
      "Automatic text extraction",
      "Document validation",
      "Batch processing",
    ],
  },
  {
    label: "AI Coding",
    icon: <Code />,
    title: "AI Inference & Coding",
    description:
      "Sistem AI akan mengekstrak entitas medis dan memetakan ke kode ICD.",
    features: [
      "Entity extraction (diagnosis & prosedur)",
      "ICD code matching dengan confidence score",
      "Evidence highlighting",
      "Manual code review & editing",
    ],
  },
  {
    label: "Validasi",
    icon: <CheckCircle />,
    title: "Multi-Agent Validation",
    description: "Tiga agent AI bekerja untuk memvalidasi kualitas coding.",
    features: [
      "MismatchChecker: Konsistensi diagnosis",
      "ICDValidator: Validasi kode ICD",
      "AutoChecklist: Quality scoring",
      "Comprehensive validation report",
    ],
  },
  {
    label: "Finalisasi",
    icon: <Psychology />,
    title: "Review & Finalisasi",
    description: "Tinjau hasil coding dan validasi sebelum finalisasi.",
    features: [
      "Interactive code review",
      "Validation findings",
      "Quality metrics",
      "Final approval workflow",
    ],
  },
];

export default function WelcomeGuide() {
  const { showWelcomeGuide, hideWelcomeGuide } = useAuthStore();
  const [activeStep, setActiveStep] = useState(0);

  const handleNext = () => {
    if (activeStep === steps.length - 1) {
      handleClose();
    } else {
      setActiveStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const handleClose = () => {
    hideWelcomeGuide();
  };

  const currentStep = steps[activeStep];

  return (
    <Dialog
      open={showWelcomeGuide}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 3 },
      }}
    >
      <DialogTitle sx={{ pb: 0 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h5" fontWeight={700} color="primary">
            Panduan SIVALIDRG
          </Typography>
          <IconButton onClick={handleClose} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ py: 3 }}>
        {/* Stepper */}
        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map((step) => (
            <Step key={step.label}>
              <StepLabel>{step.label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/* Content */}
        <Paper
          elevation={0}
          sx={{
            p: 4,
            bgcolor: "grey.50",
            borderRadius: 2,
            textAlign: "center",
          }}
        >
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              bgcolor: "primary.main",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mx: "auto",
              mb: 3,
              color: "white",
              "& svg": { fontSize: 40 },
            }}
          >
            {currentStep.icon}
          </Box>

          <Typography variant="h5" fontWeight={700} gutterBottom>
            {currentStep.title}
          </Typography>

          <Typography variant="body1" color="text.secondary" paragraph>
            {currentStep.description}
          </Typography>

          <Box sx={{ textAlign: "left", mt: 3 }}>
            {currentStep.features.map((feature, index) => (
              <Box key={index} display="flex" alignItems="center" mb={1}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    bgcolor: "success.main",
                    mr: 2,
                  }}
                />
                <Typography variant="body2">{feature}</Typography>
              </Box>
            ))}
          </Box>
        </Paper>

        {/* Progress Indicator */}
        <Box display="flex" justifyContent="center" gap={1} mt={3}>
          {steps.map((_, index) => (
            <Box
              key={index}
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: index === activeStep ? "primary.main" : "grey.300",
                transition: "all 0.3s",
              }}
            />
          ))}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={handleClose} color="inherit">
          Lewati
        </Button>
        <Box flex={1} />
        <Button onClick={handleBack} disabled={activeStep === 0}>
          Sebelumnya
        </Button>
        <Button onClick={handleNext} variant="contained">
          {activeStep === steps.length - 1 ? "Mulai" : "Selanjutnya"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
