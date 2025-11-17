// services/api.js
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";

// Create axios instance
const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 120000, // 2 minutes for long operations
  headers: {
    "Content-Type": "application/json",
  },
});

// Helper function to get token from storage
const getAuthToken = () => {
  try {
    const authData = localStorage.getItem("auth-storage");
    if (!authData) return null;

    const parsed = JSON.parse(authData);
    const token = parsed?.state?.token;

    if (token && typeof token === "string") {
      const parts = token.split(".");
      if (parts.length === 3) return token;
    }

    console.warn("Invalid token format detected");
    return null;
  } catch (error) {
    console.error("Error parsing auth data:", error);
    return null;
  }
};

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.error("Authentication failed:", error.response?.data?.message);
      localStorage.removeItem("auth-storage");
      if (!window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// ============= AUTH API =============
export const authAPI = {
  login: (nip, password) =>
    apiClient.post("/api/auth/login", { nip, password }),
  refresh: (refreshToken) =>
    apiClient.post("/api/auth/refresh", { refreshToken }),
  getProfile: () => apiClient.get("/api/auth/profile"),
  register: (data) => apiClient.post("/api/auth/register", data),
  updateUser: (id, data) => apiClient.put(`/api/auth/users/${id}`, data),
  getAllUsers: (params) => apiClient.get("/api/auth/users", { params }),
};

// ============= PATIENTS API =============
export const patientsAPI = {
  getAll: (params) => apiClient.get("/api/patients", { params }),
  getById: (id) => apiClient.get(`/api/patients/${id}`),
  getByNorm: (norm) => apiClient.get(`/api/patients/norm/${norm}`),
  create: (data) => apiClient.post("/api/patients", data),
  update: (id, data) => apiClient.put(`/api/patients/${id}`, data),
  delete: (id) => apiClient.delete(`/api/patients/${id}`),
};

// ============= DOCUMENTS API =============
export const documentsAPI = {
  getAll: (params) => apiClient.get("/api/documents", { params }),
  getById: (id) => apiClient.get(`/api/documents/${id}`),
  upload: (formData) =>
    apiClient.post("/api/documents/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  updateStatus: (id, status) =>
    apiClient.patch(`/api/documents/${id}/status`, { status }),
  delete: (id) => apiClient.delete(`/api/documents/${id}`),
  checkStatus: (id) => apiClient.get(`/api/coding/documents/${id}/status`),
};

// ============= CODING API =============
export const codingAPI = {
  getCases: (params) => apiClient.get("/api/coding/cases", { params }),
  getCaseById: (id) => apiClient.get(`/api/coding/cases/${id}`),
  getCodes: (caseId) => apiClient.get(`/api/coding/cases/${caseId}/codes`),
  getCodeDetail: (caseId, codeId) =>
    apiClient.get(`/api/coding/cases/${caseId}/codes/${codeId}`),
  updateCode: (caseId, codeId, data) =>
    apiClient.put(`/api/coding/cases/${caseId}/codes/${codeId}`, data),

  // Updated endpoints
  runInference: (documentId, runValidation = true) =>
    apiClient.post("/api/coding/infer", {
      document_id: documentId,
      run_validation: runValidation,
    }),

  reprocessDocument: (documentId, runValidation = true, force = false) =>
    apiClient.post(`/api/coding/infer/reprocess${force ? "?force=true" : ""}`, {
      document_id: documentId,
      run_validation: runValidation,
    }),

  checkDocumentStatus: (documentId) =>
    apiClient.get(`/api/coding/documents/${documentId}/status`),

  assignCase: (caseId, userId) =>
    apiClient.post(`/api/coding/cases/${caseId}/assign`, {
      assigned_to: userId,
    }),
  addCode: (caseId, data) =>
    apiClient.post(`/api/coding/cases/${caseId}/codes`, data),
  deleteCode: (caseId, codeId) =>
    apiClient.delete(`/api/coding/cases/${caseId}/codes/${codeId}`),
  finalizeCase: (caseId) =>
    apiClient.post(`/api/coding/cases/${caseId}/finalize`),
  searchICD: (params) => apiClient.get("/api/coding/icd/search", { params }),
};

// ============= VALIDATION API =============
export const validationAPI = {
  runValidation: (norm, codingCaseId) =>
    apiClient.post("/api/validation/run", {
      norm,
      coding_case_id: codingCaseId,
    }),

  getResults: (codingCaseId) =>
    apiClient.get(`/api/validation/results/${codingCaseId}`),

  getCaseValidation: (codingCaseId) =>
    apiClient.get(`/api/validation/results/${codingCaseId}`),

  getMismatches: (codingCaseId, params) =>
    apiClient.get(`/api/validation/mismatches/${codingCaseId}`, { params }),

  resolveMismatch: (mismatchId) =>
    apiClient.patch(`/api/validation/mismatches/${mismatchId}/resolve`),

  getChecklist: (codingCaseId) =>
    apiClient.get(`/api/validation/checklist/${codingCaseId}`),

  getSummary: (codingCaseId) =>
    apiClient.get(`/api/validation/summary/${codingCaseId}`),

  getHistory: (norm) => apiClient.get(`/api/validation/history/${norm}`),
};

// ============= DASHBOARD API =============
export const dashboardAPI = {
  getOverview: (period = 30) =>
    apiClient.get("/api/dashboard/overview", { params: { period } }),
  getPerformance: (period = 30) =>
    apiClient.get("/api/dashboard/performance", { params: { period } }),
  getQualityTrends: (period = 30) =>
    apiClient.get("/api/dashboard/quality-trends", { params: { period } }),
  getActivities: (limit = 20) =>
    apiClient.get("/api/dashboard/activities", { params: { limit } }),
  getMyDashboard: (period = 30) =>
    apiClient.get("/api/dashboard/my-dashboard", { params: { period } }),
};

// ============= AGENTS API =============
export const agentsAPI = {
  getHealth: () => apiClient.get("/api/agents/health"),
  getInfo: () => apiClient.get("/api/agents/info"),
  runSingle: (data) => apiClient.post("/api/agents/run-single", data),
  getStatistics: () => apiClient.get("/api/agents/statistics"),
  testConnection: () => apiClient.post("/api/agents/test-connection"),
};

export default apiClient;
