import express from "express";
import { scanAll } from "../helpers.js";
import { authorsTable } from "../helpers.js";

const router = express.Router();

// Nur Autorenliste für Dropdown
router.get("/", async (_req, res) => {
  try {
    const authors = await scanAll(authorsTable);
    return res.json(authors);
  } catch (error) {
    return res.status(500).json({ message: "Autoren konnten nicht geladen werden." });
  }
});

router.get("/api/users/default", async (_req, res) => {
  const users = await scanAll("Users");
  return res.json(users[0]); // ersten User zurückgeben
});


export default router;
