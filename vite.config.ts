import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the site from https://xvxsamuel.github.io/mock-algorithm/
  base: "/mock-algorithm/",
  plugins: [react()],
});
