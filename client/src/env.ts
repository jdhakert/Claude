/** Client-side config from Vite env vars (validated, with safe defaults). */
export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000",
} as const;
