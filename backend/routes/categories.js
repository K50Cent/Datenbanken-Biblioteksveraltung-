/**
 * routes/categories.js
 * Kategorien-Routen: Auflisten und Anlegen.
 * Alle Endpunkte unter /api/categories/
 * Kein Login erforderlich (Kirchberg-Version ohne Auth).
 */

import crypto from "node:crypto";
import express from "express";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../dynamodb.js";
import { categoriesTable, trimValue, scanAll } from "../helpers.js";

const router = express.Router();

// ─── Kategorien auflisten ──────────────────────────────────────────────────

/**
 * GET /api/categories
 * Gibt alle Kategorien zurück.
 * Wird im Bücher-Filter und im Admin-Bereich genutzt.
 */
router.get("/", async (_req, res) => {
  try {
    const categories = await scanAll(categoriesTable);
    return res.json(categories);
  } catch (error) {
    console.error("Fehler beim Laden der Kategorien:", error);
    return res.status(500).json({ message: "Kategorien konnten nicht geladen werden." });
  }
});

// ─── Kategorie anlegen ─────────────────────────────────────────────────────

/**
 * POST /api/categories  [Admin-Bereich]
 * Legt eine neue Kategorie mit einem automatisch generierten categoryId an.
 */
router.post("/", async (req, res) => {
  const name = trimValue(req.body.name);

  if (!name) {
    return res.status(400).json({ message: "Name ist ein Pflichtfeld." });
  }

  const category = {
    categoryId: crypto.randomUUID(),
    name,
  };

  try {
    await docClient.send(new PutCommand({ TableName: categoriesTable, Item: category }));
    return res.status(201).json({ message: "Kategorie erfolgreich angelegt.", category });
  } catch (error) {
    console.error("Fehler beim Anlegen der Kategorie:", error);
    return res.status(500).json({ message: "Kategorie konnte nicht gespeichert werden." });
  }
});

export default router;
