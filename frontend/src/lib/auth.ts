"use client";

export function saveSession(accessToken: string, refreshToken: string) {
  window.localStorage.setItem("ambar_access_token", accessToken);
  window.localStorage.setItem("ambar_refresh_token", refreshToken);
}

export function clearSession() {
  window.localStorage.removeItem("ambar_access_token");
  window.localStorage.removeItem("ambar_refresh_token");
}

export function hasSession() {
  return typeof window !== "undefined" && Boolean(window.localStorage.getItem("ambar_access_token"));
}
