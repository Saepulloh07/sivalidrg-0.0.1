// src/pages/Login.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  InputAdornment,
  IconButton,
  CircularProgress,
  Alert,
} from "@mui/material";
import {
  Visibility,
  VisibilityOff,
  Login as LoginIcon,
  Badge,
  Lock,
} from "@mui/icons-material";
import { useSnackbar } from "notistack";
import { authAPI } from "@/services/api";
import useAuthStore from "@/store/authStore";

export default function Login() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { login } = useAuthStore();

  const [formData, setFormData] = useState({ nip: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.nip || !formData.password) {
      setError("NIP dan password wajib diisi");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const response = await authAPI.login(formData.nip, formData.password);
      const { accessToken: token, user } = response.data;

      login(user, token);
      enqueueSnackbar("Login berhasil!", { variant: "success" });
      navigate("/");
    } catch (err) {
      const message =
        err.response?.data?.message ||
        err.response?.data?.error ||
        "Login gagal. Periksa kredensial atau server.";
      setError(message);
      enqueueSnackbar(message, { variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(135deg, #00A651 0%, #007A3D 50%, #0071BC 100%)",
        position: "relative",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: 0,
          background:
            'url(\'data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%23ffffff" fill-opacity="0.05"%3E%3Cpath d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\')',
        },
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={10}
          sx={{
            p: { xs: 3, sm: 5 },
            borderRadius: 3,
            position: "relative",
            zIndex: 1,
            background: "rgba(255,255,255,0.98)",
            backdropFilter: "blur(10px)",
          }}
        >
          {/* Logo Section */}
          <Box textAlign="center" mb={4}>
            <Box
              sx={{
                width: 80,
                height: 80,
                bgcolor: "primary.main",
                borderRadius: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mx: "auto",
                mb: 2,
                boxShadow: "0 8px 16px rgba(0,166,81,0.3)",
              }}
            >
              <Typography variant="h3" fontWeight={800} color="white">
                SI
              </Typography>
            </Box>

            <Typography
              variant="h4"
              fontWeight={800}
              color="primary"
              gutterBottom
              letterSpacing={1}
            >
              SIVALIDRG
            </Typography>
            <Typography variant="body1" color="text.secondary" fontWeight={500}>
              Sistem Validasi Resume Medis
            </Typography>
            <Typography variant="caption" color="text.secondary">
              BPJS Kesehatan Indonesia
            </Typography>
          </Box>

          {/* Error Alert */}
          {error && (
            <Alert severity="error" sx={{ mb: 3, fontWeight: 500 }}>
              {error}
            </Alert>
          )}

          {/* Login Form */}
          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="NIP (Nomor Induk Pegawai)"
              name="nip"
              value={formData.nip}
              onChange={handleChange}
              margin="normal"
              required
              autoFocus
              disabled={loading}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Badge color="primary" />
                  </InputAdornment>
                ),
              }}
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label="Password"
              name="password"
              type={showPassword ? "text" : "password"}
              value={formData.password}
              onChange={handleChange}
              margin="normal"
              required
              disabled={loading}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Lock color="primary" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      disabled={loading}
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={{ mb: 3 }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              startIcon={<LoginIcon />}
              disabled={loading}
              sx={{
                py: 1.5,
                fontWeight: 700,
                fontSize: "1rem",
                background: "linear-gradient(90deg, #00A651 0%, #007A3D 100%)",
                "&:hover": {
                  background:
                    "linear-gradient(90deg, #007A3D 0%, #005A2D 100%)",
                },
              }}
            >
              {loading ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                "Login"
              )}
            </Button>
          </Box>

          {/* Demo Credentials */}
          <Box mt={3} p={2} bgcolor="grey.100" borderRadius={2}>
            <Typography variant="caption" fontWeight={600} gutterBottom>
              Kredensial Demo:
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2 }}>
              <Typography component="li" variant="body2">
                Admin: <strong>admin</strong> / admin123
              </Typography>
              <Typography component="li" variant="body2">
                Coder: <strong>coder01</strong> / coder123
              </Typography>
              <Typography component="li" variant="body2">
                Reviewer: <strong>reviewer01</strong> / reviewer123
              </Typography>
            </Box>
          </Box>

          {/* Footer */}
          <Box textAlign="center" mt={3}>
            <Typography variant="caption" color="text.secondary">
              Â© 2025 BPJS Kesehatan. All rights reserved.
            </Typography>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
