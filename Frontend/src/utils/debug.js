// Debug utility functions
export const logRequest = (config) => {
  if (import.meta.env.DEV) {
    console.group(`🔵 ${config.method?.toUpperCase()} ${config.url}`);
    console.log("Headers:", config.headers);
    console.log("Data:", config.data);
    console.groupEnd();
  }
};

export const logResponse = (response) => {
  if (import.meta.env.DEV) {
    console.group(
      `🟢 ${response.config.method?.toUpperCase()} ${response.config.url}`
    );
    console.log("Status:", response.status);
    console.log("Data:", response.data);
    console.groupEnd();
  }
};

export const logError = (error) => {
  if (import.meta.env.DEV) {
    console.group(
      `🔴 ${error.config?.method?.toUpperCase()} ${error.config?.url}`
    );
    console.error("Error:", error.message);
    console.error("Response:", error.response?.data);
    console.groupEnd();
  }
};

export const formatDate = (date) => {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

export const formatDateTime = (date) => {
  if (!date) return "-";
  return new Date(date).toLocaleString("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatNumber = (num) => {
  if (!num) return "0";
  return new Intl.NumberFormat("id-ID").format(num);
};

export const truncateText = (text, maxLength = 100) => {
  if (!text) return "-";
  return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
};
