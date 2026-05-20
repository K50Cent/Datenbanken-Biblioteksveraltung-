/**
 * server.js
 * Einstiegspunkt der Bibliotheksverwaltung.
 * Initialisiert Express, bindet die statischen Dateien ein
 * und registriert alle API-Routen.
 *
 * Routen-Übersicht:
 *   /api/books/      → routes/books.js      (Bücher CRUD + Empfehlungen)
 *   /api/authors/    → routes/authors.js    (Autoren)
 *   /api/categories/ → routes/categories.js (Kategorien)
 *   /api/loans/      → routes/loans.js      (Ausleihen)
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

import bookRoutes       from "./routes/books.js";
import authorRoutes     from "./routes/authors.js";
import categoryRoutes   from "./routes/categories.js";
import loanRoutes       from "./routes/loans.js";

const app  = express();
const port = process.env.PORT || 3000;

// Pfad zum public-Ordner (eine Ebene über backend/)
const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const publicPath = path.join(__dirname, "..", "public");

// ─── Middleware ────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.static(publicPath));

// ─── API-Routen ────────────────────────────────────────────────────────────

app.use("/api/books",      bookRoutes);
app.use("/api/authors",    authorRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/loans",      loanRoutes);

/** GET /api/health – Einfacher Statuscheck für den Server */
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// ─── Server starten ────────────────────────────────────────────────────────

app.listen(port, () => {
  console.log(`Bibliotheksverwaltung läuft unter http://localhost:${port}`);
});
