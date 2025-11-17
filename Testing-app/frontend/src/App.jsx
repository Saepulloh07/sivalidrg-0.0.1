// src/App.jsx
import React, { useState } from "react";
import {
  ThemeProvider,
  CssBaseline,
  Container,
  AppBar,
  Toolbar,
  Typography,
  Box,
  Tab,
  Tabs,
} from "@mui/material";
import {
  Dashboard as DashboardIcon,
  Science as ScienceIcon,
  Assessment as AssessmentIcon,
} from "@mui/icons-material";
import theme from "./theme";
import Dashboard from "./components/Dashboard";
import InferenceResults from "./components/InferenceResults";
import ValidationReport from "./components/ValidationReport";

function TabPanel({ children, value, index }) {
  return (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

function App() {
  const [tabValue, setTabValue] = useState(0);
  const [selectedCaseId, setSelectedCaseId] = useState(null);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ flexGrow: 1 }}>
        <AppBar position="static">
          <Toolbar>
            <ScienceIcon sx={{ mr: 2 }} />
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              SIVALIDRG AI - Multi-Agent Medical Coding System
            </Typography>
          </Toolbar>
        </AppBar>

        <Container maxWidth="xl" sx={{ mt: 3 }}>
          <Tabs value={tabValue} onChange={handleTabChange} centered>
            <Tab icon={<DashboardIcon />} label="Dashboard" />
            <Tab icon={<ScienceIcon />} label="AI Inference" />
            <Tab icon={<AssessmentIcon />} label="Validation Report" />
          </Tabs>

          <TabPanel value={tabValue} index={0}>
            <Dashboard onSelectCase={setSelectedCaseId} />
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <InferenceResults caseId={selectedCaseId} />
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            <ValidationReport caseId={selectedCaseId} />
          </TabPanel>
        </Container>
      </Box>
    </ThemeProvider>
  );
}

export default App;
