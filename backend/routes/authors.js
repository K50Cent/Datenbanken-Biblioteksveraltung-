/**
 * routes/authors.js
 * Autoren-Routen: Auflisten und Anlegen.
 * Alle Endpunkte unter /api/authors/
 * Lesen ist öffentlich, Anlegen erfordert Admin-Rolle.
 */

import crypto from "node:crypto";
import express from "express";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../dynamodb.js";
import { verifyToken, requireAdmin } from "../auth.js";
import { authorsTable, trimValue, scanAll } from "../helpers.js";

const router = express.Router();

// ─── Autoren auflisten ─────────────────────────────────────────────────────

/**
 * GET /api/authors
 * Gibt alle Autoren aus der Authors-Tabelle zurück.
 * Wird im Admin-Formular für das Dropdown genutzt.
 */
router.get("/", async (_req, res) => {
  try {
    const authors = await scanAll(authorsTable);
    return res.json(authors);
  } catch (error) {
    console.error("Fehler beim Laden der Autoren:", error);
    return res.status(500).json({ message: "Autoren konnten nicht geladen werden." });
  }
});

// ─── Autor anlegen ─────────────────────────────────────────────────────────

/**
 * POST /api/authors  [Admin]
 * Legt einen neuen Autor mit Vor- und Nachname an.
 * Der Primärschlüssel authorID folgt dem bestehenden Tabellenschema (Großbuchstabe D).
 */
router.post("/", verifyToken, requireAdmin, async (req, res) => {
  const name      = trimValue(req.body.name);
  const firstname = trimValue(req.body.firstname);

  if (!name || !firstname) {
    return res.status(400).json({ message: "Name und Vorname sind Pflichtfelder." });
  }

  const author = {
    authorID:  crypto.randomUUID(),
    name,
    firstname,
    createdAt: new Date().toISOString(),
  };

  try {
    await docClient.send(new PutCommand({ TableName: authorsTable, Item: author }));
    return res.status(201).json({ message: "Autor erfolgreich angelegt.", author });
  } catch (error) {
    console.error("Fehler beim Anlegen des Autors:", error);
    return res.status(500).json({ message: "Autor konnte nicht gespeichert werden." });
  }
});

export default router;
