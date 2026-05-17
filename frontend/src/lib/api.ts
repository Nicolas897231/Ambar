"use client";

import axios from "axios";
import { clearSession } from "@/lib/auth";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1",
  timeout: 15000,
  withCredentials: true
});

api.interceptors.request.use((config) => {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("ambar_access_token") : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      clearSession();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
