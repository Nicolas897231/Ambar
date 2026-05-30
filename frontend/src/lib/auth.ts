"use client";

export type CurrentUser = {
  identification: string;
  name: string;
  email: string;
  roles: string[];
  permissions: string[];
};

const ACCESS_TOKEN_KEY = "ambar_access_token";
const REFRESH_TOKEN_KEY = "ambar_refresh_token";
const CURRENT_USER_KEY = "ambar_current_user";

export function saveSession(accessToken: string, refreshToken: string) {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function saveCurrentUser(user: CurrentUser) {
  window.localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
}

export function getRefreshToken() {
  return typeof window !== "undefined" ? window.localStorage.getItem(REFRESH_TOKEN_KEY) : null;
}

export function getCurrentUser(): CurrentUser | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(CURRENT_USER_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as CurrentUser;
  } catch {
    window.localStorage.removeItem(CURRENT_USER_KEY);
    return null;
  }
}

export function getStoredPermissions() {
  return getCurrentUser()?.permissions ?? [];
}

export function hasAnyPermission(permissions: string[], required: string[]) {
  if (permissions.includes("*")) return true;
  return required.some((item) => permissions.includes(item));
}

export function clearSession() {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(CURRENT_USER_KEY);
}

export function hasSession() {
  return typeof window !== "undefined" && Boolean(window.localStorage.getItem(ACCESS_TOKEN_KEY));
}
