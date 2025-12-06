import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token expiration
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Don't intercept login/register requests - let them handle their own errors
    if (
      originalRequest.url?.includes("/auth/login") ||
      originalRequest.url?.includes("/auth/register")
    ) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Try to refresh token or logout
      const refreshToken = localStorage.getItem("refresh_token");
      if (refreshToken) {
        try {
          // Implement token refresh logic here if your backend supports it
          // For now, just logout
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          window.location.href = "/login";
        } catch (refreshError) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          window.location.href = "/login";
        }
      } else {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (data: {
    email: string;
    username: string;
    password: string;
    chess_com_username?: string;
  }) => api.post("/auth/register", data),

  login: (data: { username: string; password: string }) =>
    api.post("/auth/login", data),

  me: () => api.get("/auth/me"),

  updateProfile: (data: { chess_com_username?: string }) =>
    api.put("/auth/me", data),
};

// Games API
export const gamesAPI = {
  getGames: (params?: {
    skip?: number;
    limit?: number;
    time_class?: string;
    result?: string;
    opening_eco?: string;
  }) => api.get("/games/", { params }),

  getGame: (gameId: number) => api.get(`/games/${gameId}`),

  importGames: (data?: {
    chess_com_username?: string;
    import_all?: boolean;
    from_year?: number;
    from_month?: number;
    to_year?: number;
    to_month?: number;
  }) => api.post("/games/import", data),

  getImportStatus: (jobId: number) => api.get(`/games/import/status/${jobId}`),

  analyzeGame: (gameId: number) => api.post(`/games/${gameId}/analyze`),

  analyzePosition: (fen: string) =>
    api.post("/games/analyze/position", { fen }),

  analyzeAllGames: () => api.post("/games/analyze/all"),

  getAnalysisStatus: (jobId: number) =>
    api.get(`/games/analyze/status/${jobId}`),

  cancelAnalysisJob: (jobId: number) =>
    api.post(`/games/analyze/cancel/${jobId}`),

  deleteGame: (gameId: number) => api.delete(`/games/${gameId}`),
};

// Stats API
export const statsAPI = {
  getUserStats: () => api.get("/stats/"),

  getOpeningStats: (params?: { limit?: number }) =>
    api.get("/stats/openings", { params }),

  getTimeControlStats: () => api.get("/stats/time-controls"),

  getPerformanceOverTime: (params?: { months?: number }) =>
    api.get("/stats/performance-over-time", { params }),

  getDashboardStats: () => api.get("/stats/dashboard"),

  recalculateStats: () => api.post("/stats/recalculate"),
};
