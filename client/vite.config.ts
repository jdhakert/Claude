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
        // Fall back to a friendly offline page if the shell is unavailable.
        offlineGoogleAnalytics: false,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === "document",
            handler: "NetworkFirst",
            options: {
              cacheName: "html-cache",
              networkTimeoutSeconds: 3,
            },
          },
        ],
      },
    }),
  ],
  server: { port: 5173 },
});
