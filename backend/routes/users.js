/**
 * routes/users.js
 * User-Routen: Standardbenutzer laden.
 * Alle Endpunkte unter /api/users/
 */

import express from "express";
import { scanAll } from "../helpers.js";

const router = express.Router();

/**
 * Autor: Ramona
 * GET /api/users/default
 * Gibt den ersten (Demo-)Benutzer zurück.
 * Normalisiert usernameKey → userId für Frontend-Kompatibilität.
 */
router.get("/default", async (_req, res) => {
  try {
    const users = await scanAll("Users");
    if (!users.length) {
      return res.status(404).json({ message: "Kein Benutzer gefunden." });
    }
    const u = users[0];
    return res.json({ userId: u.userId || u.usernameKey, name: u.name });
  } catch (err) {
    console.error("Fehler beim Laden des Benutzers:", err);
    return res.status(500).json({ message: "Benutzer konnte nicht geladen werden." });
  }
});

export default router;
