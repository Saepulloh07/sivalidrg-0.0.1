// hooks/useDocumentProcessing.js
import { useState } from "react";
import { codingAPI, documentsAPI } from "@/services/api";

export const useDocumentProcessing = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [progress, setProgress] = useState(0);

  const checkStatus = async (documentId) => {
    try {
      const response = await documentsAPI.checkStatus(documentId);
      setStatus(response.data.data);
      return response.data.data;
    } catch (err) {
      setError(err.response?.data?.message || "Failed to check status");
      throw err;
    }
  };

  const processDocument = async (documentId, runValidation = true) => {
    setLoading(true);
    setError(null);
    setProgress(0);

    // Progress simulation
    const progressInterval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 5, 90));
    }, 2000);

    try {
      // Check status first
      const docStatus = await checkStatus(documentId);

      let response;

      if (docStatus.can_process) {
        response = await codingAPI.runInference(documentId, runValidation);
      } else if (docStatus.is_stuck) {
        // Auto force reprocess for stuck documents
        response = await codingAPI.reprocessDocument(
          documentId,
          runValidation,
          true
        );
      } else if (docStatus.can_reprocess) {
        response = await codingAPI.reprocessDocument(
          documentId,
          runValidation,
          false
        );
      } else {
        throw new Error("Document cannot be processed");
      }

      clearInterval(progressInterval);
      setProgress(100);
      return response.data.data;
    } catch (err) {
      clearInterval(progressInterval);
      const errorMessage = err.response?.data?.message || "Processing failed";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const forceReprocess = async (documentId, runValidation = true) => {
    setLoading(true);
    setError(null);
    setProgress(0);

    const progressInterval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 5, 90));
    }, 2000);

    try {
      const response = await codingAPI.reprocessDocument(
        documentId,
        runValidation,
        true
      );
      clearInterval(progressInterval);
      setProgress(100);
      return response.data.data;
    } catch (err) {
      clearInterval(progressInterval);
      const errorMessage = err.response?.data?.message || "Reprocess failed";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    checkStatus,
    processDocument,
    forceReprocess,
    loading,
    error,
    status,
    progress,
  };
};
