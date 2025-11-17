import { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  Box,
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  Badge,
  Tooltip,
  useTheme,
  useMediaQuery,
  Chip,
} from "@mui/material";
import {
  Menu as MenuIcon,
  Dashboard,
  People,
  Description,
  Code,
  Assignment,
  CheckCircle,
  Psychology,
  AccountCircle,
  Logout,
  Settings,
  Notifications,
  ChevronLeft,
} from "@mui/icons-material";
import useAuthStore from "@/store/authStore";
import WelcomeGuide from "./WelcomeGuide";

const drawerWidth = 280;

const menuItems = [
  {
    title: "Dashboard",
    icon: <Dashboard />,
    path: "/",
    roles: ["admin", "coder", "reviewer"],
  },
  {
    title: "Pasien",
    icon: <People />,
    path: "/patients",
    roles: ["admin", "coder", "reviewer"],
  },
  {
    title: "Dokumen",
    icon: <Description />,
    path: "/documents",
    roles: ["admin", "coder", "reviewer"],
  },
  {
    title: "Coding Cases",
    icon: <Code />,
    path: "/coding",
    roles: ["admin", "coder", "reviewer"],
  },
  {
    title: "Kasus Saya",
    icon: <Assignment />,
    path: "/my-cases",
    roles: ["coder", "reviewer"],
  },
  {
    title: "Validasi",
    icon: <CheckCircle />,
    path: "/validation",
    roles: ["admin", "reviewer"],
  },
  {
    title: "Multi-Agent System",
    icon: <Psychology />,
    path: "/agents",
    roles: ["admin"],
  },
];

export default function MainLayout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleMenuClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleNavigate = (path) => {
    navigate(path);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case "admin":
        return "error";
      case "reviewer":
        return "warning";
      case "coder":
        return "success";
      default:
        return "default";
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case "admin":
        return "Administrator";
      case "reviewer":
        return "Reviewer";
      case "coder":
        return "Coder";
      default:
        return role;
    }
  };

  const drawer = (
    <Box>
      {/* Logo Section */}
      <Box
        sx={{
          p: 3,
          background: "linear-gradient(135deg, #00A651 0%, #007A3D 100%)",
          color: "white",
          textAlign: "center",
        }}
      >
        <Box
          sx={{
            width: 60,
            height: 60,
            bgcolor: "white",
            borderRadius: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            mx: "auto",
            mb: 2,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          <Typography variant="h4" fontWeight={800} color="primary">
            SI
          </Typography>
        </Box>
        <Typography variant="h6" fontWeight={700} letterSpacing={1}>
          SIVALIDRG
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.9 }}>
          Sistem Validasi Resume Medis
        </Typography>
      </Box>

      {/* User Info */}
      <Box sx={{ p: 2, bgcolor: "grey.50" }}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <Avatar
            sx={{
              bgcolor: "primary.main",
              width: 48,
              height: 48,
              fontWeight: 700,
            }}
          >
            {user?.name?.charAt(0) || "U"}
          </Avatar>
          <Box flex={1}>
            <Typography variant="subtitle2" fontWeight={600} noWrap>
              {user?.name || "User"}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {user?.nip || "-"}
            </Typography>
            <Box mt={0.5}>
              <Chip
                label={getRoleLabel(user?.role)}
                size="small"
                color={getRoleBadgeColor(user?.role)}
                sx={{ height: 20, fontSize: "0.7rem", fontWeight: 600 }}
              />
            </Box>
          </Box>
        </Box>
      </Box>

      <Divider />

      {/* Navigation Menu */}
      <List sx={{ px: 1, py: 2 }}>
        {menuItems
          .filter((item) => item.roles.includes(user?.role))
          .map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => handleNavigate(item.path)}
                  sx={{
                    borderRadius: 2,
                    bgcolor: isActive ? "primary.main" : "transparent",
                    color: isActive ? "white" : "text.primary",
                    "&:hover": {
                      bgcolor: isActive ? "primary.dark" : "grey.100",
                    },
                    py: 1.5,
                  }}
                >
                  <ListItemIcon
                    sx={{
                      color: isActive ? "white" : "primary.main",
                      minWidth: 40,
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.title}
                    primaryTypographyProps={{
                      fontSize: "0.95rem",
                      fontWeight: isActive ? 600 : 500,
                    }}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
      </List>

      {/* Footer */}
      <Box
        sx={{
          position: "absolute",
          bottom: 0,
          width: "100%",
          p: 2,
          borderTop: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          align="center"
          display="block"
        >
          © 2025 BPJS Kesehatan
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          align="center"
          display="block"
        >
          Version 1.0.0
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {/* App Bar */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          bgcolor: "white",
          color: "text.primary",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { md: "none" } }}
          >
            <MenuIcon />
          </IconButton>

          <Typography
            variant="h6"
            noWrap
            component="div"
            sx={{ flexGrow: 1, fontWeight: 600 }}
          >
            {menuItems.find((item) => item.path === location.pathname)?.title ||
              "Dashboard"}
          </Typography>

          {/* Notifications */}
          <Tooltip title="Notifikasi">
            <IconButton color="inherit" sx={{ mr: 1 }}>
              <Badge badgeContent={0} color="error">
                <Notifications />
              </Badge>
            </IconButton>
          </Tooltip>

          {/* User Menu */}
          <Tooltip title="Akun">
            <IconButton onClick={handleMenuClick} size="small">
              <Avatar
                sx={{
                  width: 36,
                  height: 36,
                  bgcolor: "primary.main",
                  fontSize: "1rem",
                }}
              >
                {user?.name?.charAt(0) || "U"}
              </Avatar>
            </IconButton>
          </Tooltip>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
            PaperProps={{
              sx: { width: 240, mt: 1 },
            }}
          >
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography variant="subtitle2" fontWeight={600}>
                {user?.name || "User"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {user?.email || "-"}
              </Typography>
            </Box>
            <Divider />
            <MenuItem onClick={handleMenuClose}>
              <ListItemIcon>
                <AccountCircle fontSize="small" />
              </ListItemIcon>
              <ListItemText>Profil Saya</ListItemText>
            </MenuItem>
            <MenuItem onClick={handleMenuClose}>
              <ListItemIcon>
                <Settings fontSize="small" />
              </ListItemIcon>
              <ListItemText>Pengaturan</ListItemText>
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <Logout fontSize="small" color="error" />
              </ListItemIcon>
              <ListItemText primaryTypographyProps={{ color: "error" }}>
                Logout
              </ListItemText>
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Sidebar Drawer */}
      <Box
        component="nav"
        sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}
      >
        {/* Mobile Drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: "block", md: "none" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: drawerWidth,
            },
          }}
        >
          {drawer}
        </Drawer>

        {/* Desktop Drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: "none", md: "block" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: drawerWidth,
              borderRight: 1,
              borderColor: "divider",
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          minHeight: "100vh",
          bgcolor: "background.default",
        }}
      >
        <Toolbar />
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
          <Outlet />
        </Box>
      </Box>

      {/* Welcome Guide */}
      <WelcomeGuide />
    </Box>
  );
}
