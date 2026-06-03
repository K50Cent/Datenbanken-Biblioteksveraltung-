import express from "express";
import { scanAll } from "../helpers.js";

const router = express.Router();

// Autor: Ramona
// Da kein Login erfolgt wird hier der fünfte User aus der User Tabelle geladen und für die weiteren Operationen benutzt
// der fünfte user wurde hierbei zufällig ausgewählt
router.get("/default", async (_req, res) => {
  try {
    const users = await scanAll("Users");
    const u = users[5];
    return res.json({ userId: u.userId || u.usernameKey, name: u.name });

  } catch (error) {
    return res.status(500).json({ message: "Benutzer konnte nicht geladen werden." });
  }
});

export default router;
