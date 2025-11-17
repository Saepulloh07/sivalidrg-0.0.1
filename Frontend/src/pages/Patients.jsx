import { useState } from "react";
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
} from "@mui/material";
import { Search, Add, Edit, Visibility, PersonAdd } from "@mui/icons-material";
import { DataGrid } from "@mui/x-data-grid";
import { useSnackbar } from "notistack";
import { patientsAPI } from "@/services/api";
import { formatDate } from "@/utils/debug";
import useAuthStore from "@/store/authStore";

export default function Patients() {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [formData, setFormData] = useState({
    norm: "",
    name: "",
    birth_date: "",
    gender: "male",
  });

  // Query
  const { data, isLoading } = useQuery(
    ["patients", page, pageSize, search],
    () =>
      patientsAPI.getAll({
        page: page + 1,
        limit: pageSize,
        search,
      }),
    { keepPreviousData: true }
  );

  // Mutations
  const createMutation = useMutation(patientsAPI.create, {
    onSuccess: () => {
      queryClient.invalidateQueries("patients");
      enqueueSnackbar("Pasien berhasil ditambahkan", { variant: "success" });
      handleCloseDialog();
    },
    onError: (error) => {
      enqueueSnackbar(
        error.response?.data?.message || "Gagal menambahkan pasien",
        { variant: "error" }
      );
    },
  });

  const updateMutation = useMutation(
    ({ id, data }) => patientsAPI.update(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries("patients");
        enqueueSnackbar("Pasien berhasil diperbarui", { variant: "success" });
        handleCloseDialog();
      },
      onError: (error) => {
        enqueueSnackbar(
          error.response?.data?.message || "Gagal memperbarui pasien",
          { variant: "error" }
        );
      },
    }
  );

  const handleOpenDialog = (patient = null) => {
    if (patient) {
      setSelectedPatient(patient);
      setFormData({
        norm: patient.norm,
        name: patient.name,
        birth_date: patient.birth_date,
        gender: patient.gender,
      });
    } else {
      setSelectedPatient(null);
      setFormData({
        norm: "",
        name: "",
        birth_date: "",
        gender: "male",
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedPatient(null);
    setFormData({
      norm: "",
      name: "",
      birth_date: "",
      gender: "male",
    });
  };

  const handleSubmit = () => {
    if (selectedPatient) {
      updateMutation.mutate({ id: selectedPatient.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const calculateAge = (birthDate) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birth.getDate())
    ) {
      age--;
    }
    return age;
  };

  const columns = [
    {
      field: "norm",
      headerName: "NoRM",
      width: 150,
      renderCell: (params) => (
        <Typography variant="body2" fontWeight={600}>
          {params.value}
        </Typography>
      ),
    },
    {
      field: "name",
      headerName: "Nama Pasien",
      flex: 1,
      minWidth: 200,
    },
    {
      field: "birth_date",
      headerName: "Tanggal Lahir",
      width: 150,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: "age",
      headerName: "Usia",
      width: 100,
      renderCell: (params) => `${calculateAge(params.row.birth_date)} tahun`,
    },
    {
      field: "gender",
      headerName: "Jenis Kelamin",
      width: 130,
      renderCell: (params) => (
        <Chip
          label={params.value === "male" ? "Laki-laki" : "Perempuan"}
          size="small"
          color={params.value === "male" ? "primary" : "secondary"}
        />
      ),
    },
    {
      field: "created_at",
      headerName: "Terdaftar",
      width: 180,
      renderCell: (params) => (
        <Typography variant="caption">{formatDate(params.value)}</Typography>
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
            onClick={() => handleOpenDialog(params.row)}
            color="primary"
          >
            <Edit fontSize="small" />
          </IconButton>
          <IconButton size="small" color="info">
            <Visibility fontSize="small" />
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
          Data Pasien
        </Typography>
        <Button
          variant="contained"
          startIcon={<PersonAdd />}
          onClick={() => handleOpenDialog()}
        >
          Tambah Pasien
        </Button>
      </Box>

      {/* Search */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <TextField
            fullWidth
            placeholder="Cari berdasarkan NoRM atau Nama..."
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

      {/* Dialog Form */}
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {selectedPatient ? "Edit Pasien" : "Tambah Pasien Baru"}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="NoRM (Nomor Rekam Medis)"
                value={formData.norm}
                onChange={(e) =>
                  setFormData({ ...formData, norm: e.target.value })
                }
                disabled={!!selectedPatient}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Nama Lengkap"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="date"
                label="Tanggal Lahir"
                value={formData.birth_date}
                onChange={(e) =>
                  setFormData({ ...formData, birth_date: e.target.value })
                }
                InputLabelProps={{ shrink: true }}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label="Jenis Kelamin"
                value={formData.gender}
                onChange={(e) =>
                  setFormData({ ...formData, gender: e.target.value })
                }
                required
              >
                <MenuItem value="male">Laki-laki</MenuItem>
                <MenuItem value="female">Perempuan</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Batal</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={createMutation.isLoading || updateMutation.isLoading}
          >
            {createMutation.isLoading || updateMutation.isLoading ? (
              <CircularProgress size={24} />
            ) : selectedPatient ? (
              "Update"
            ) : (
              "Simpan"
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
