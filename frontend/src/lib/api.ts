"use client";

import axios from "axios";
import { clearSession, getRefreshToken, saveSession } from "@/lib/auth";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1",
  timeout: 15000,
  withCredentials: true
});

const apiBaseURL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

api.interceptors.request.use((config) => {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("ambar_access_token") : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
    const authRequest = typeof originalRequest?.url === "string" && ["/auth/login", "/auth/refresh"].some((path) => originalRequest.url?.includes(path));
    if (error.response?.status === 401 && typeof window !== "undefined" && originalRequest && !originalRequest._retry && !authRequest) {
      originalRequest._retry = true;
      refreshPromise ??= axios
        .post(`${apiBaseURL}/auth/refresh`, { refresh_token: getRefreshToken() }, { withCredentials: true })
        .then((response) => {
          saveSession(response.data.access_token, response.data.refresh_token);
          return response.data.access_token as string;
        })
        .catch(() => null)
        .finally(() => {
          refreshPromise = null;
        });
      const token = await refreshPromise;
      if (token) {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      }
    }
    if (error.response?.status === 401 && typeof window !== "undefined" && !authRequest) {
      clearSession();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
