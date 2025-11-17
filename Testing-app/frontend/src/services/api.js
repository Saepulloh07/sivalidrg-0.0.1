// src/services/api.js
import axios from "axios";

const API_BASE_URL = "http://localhost:8000/api/v1";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// API Methods
export const apiService = {
  // Health Check
  healthCheck: async () => {
    const response = await api.get("/health");
    return response.data;
  },

  // Inference
  processInference: async (documentId, runValidation = true) => {
    const response = await api.post("/infer", {
      document_id: documentId,
      run_validation: runValidation,
    });
    return response.data;
  },

  // Reprocess
  reprocessInference: async (documentId, force = false) => {
    const response = await api.post(`/infer/reprocess?force=${force}`, {
      document_id: documentId,
      run_validation: true,
    });
    return response.data;
  },

  // Get Document Status
  getDocumentStatus: async (documentId) => {
    const response = await api.get(`/document/${documentId}/status`);
    return response.data;
  },

  // Get Validation Results
  getValidationResults: async (codingCaseId) => {
    const response = await api.get(`/validation/${codingCaseId}`);
    return response.data;
  },

  // Run Validation
  runValidation: async (norm, codingCaseId) => {
    const response = await api.post("/validate", {
      norm,
      coding_case_id: codingCaseId,
    });
    return response.data;
  },
};

export default api;
