import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Installable PWA for beta (ADR 0001 app-access strategy).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "offline.html"],
      manifest: {
        name: "BarReady",
        short_name: "BarReady",
        description: "Adaptive bar exam preparation.",
        theme_color: "#0b3d2e",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        categories: ["education", "productivity"],
        // App-like quick actions from a long-press of the installed icon.
        shortcuts: [
          { name: "Dashboard", url: "/dashboard" },
          { name: "Practice", url: "/practice" },
          { name: "Review", url: "/review" },
        ],
        icons: [
          {
            src: "/icon.svg",
            sizes: "192x192 512x512 any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/icon-maskable.svg",
            sizes: "512x512 any",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // SPA: serve the cached app shell for navigations when offline.
        navigateFallback: "/index.html",
        // Never serve the SPA shell for API/auth/health calls — those must hit
        // the network (or fail) so we never cache a mutation or stale auth.
        navigateFallbackDenylist: [/^\/api/, /^\/auth/, /^\/health/],
        cleanupOutdatedCaches: true,
        offlineGoogleAnalytics: false,
        runtimeCaching: [
          {
            // App shell / navigations: prefer fresh, fall back to cache offline.
            urlPattern: ({ request }) => request.destination === "document",
            handler: "NetworkFirst",
            options: {
              cacheName: "html-cache",
              networkTimeoutSeconds: 3,
            },
          },
          {
            // Static assets (scripts, styles, workers): fast + revalidate.
            urlPattern: ({ request }) =>
              request.destination === "script" ||
              request.destination === "style" ||
              request.destination === "worker",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "asset-cache" },
          },
          {
            // Fonts/images: cache-first with a bounded, expiring cache.
            urlPattern: ({ request }) =>
              request.destination === "image" || request.destination === "font",
            handler: "CacheFirst",
            options: {
              cacheName: "media-cache",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  server: { port: 5173 },
});
