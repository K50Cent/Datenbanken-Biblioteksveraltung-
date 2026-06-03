import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

import bookRoutes       from "./routes/books.js";
import authorRoutes     from "./routes/authors.js";
import categoryRoutes   from "./routes/categories.js";
import loanRoutes       from "./routes/loans.js";
import userRoutes       from "./routes/users.js";

const app  = express();
const port = process.env.PORT || 3000;

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const publicPath = path.join(__dirname, "..", "public");

app.use(express.json());
app.use(express.static(publicPath));

app.use("/api/books",      bookRoutes);
app.use("/api/authors",    authorRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/loans",      loanRoutes);
app.use("/api/users",      userRoutes);

//Autor: Kjell
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// Autor: Kjell
app.listen(port, () => {
  console.log(`Bibliotheksverwaltung läuft unter http://localhost:${port}`);
});
