/**
 * routes/authors.js
 * Autoren-Routen: Auflisten, Anlegen, Aktualisieren, Löschen.
 * Alle Endpunkte unter /api/authors/
 */

import crypto from "node:crypto";
import express from "express";
import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../dynamodb.js";
import { authorsTable, trimValue, scanAll } from "../helpers.js";

const router = express.Router();

// ─── Autoren auflisten ────────────────────────────────────────────────────────

/**
 * Autor: Ramona
 * GET /api/authors
 * Gibt alle Autoren zurück (für Dropdowns und Filterauswahl).
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

// ─── Autor anlegen ────────────────────────────────────────────────────────────

/**
 * Autor: Ramona
 * POST /api/authors  [Admin-Bereich]
 * Legt einen neuen Autor an.
 * Pflichtfeld: name (Nachname)
 * Optional: firstname (Vorname)
 */
router.post("/", async (req, res) => {
  const name      = trimValue(req.body.name);
  const firstname = trimValue(req.body.firstname) || "";

  if (!name) {
    return res.status(400).json({ message: "Nachname ist ein Pflichtfeld." });
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

// ─── Autor aktualisieren ──────────────────────────────────────────────────────

/**
 * Autor: Ramona
 * PUT /api/authors/:id  [Admin-Bereich]
 * Aktualisiert Vor- und Nachname eines Autors.
 * @param {string} req.params.id - Die authorID des zu ändernden Autors
 */
router.put("/:id", async (req, res) => {
  const authorID  = req.params.id;
  const name      = trimValue(req.body.name);
  const firstname = trimValue(req.body.firstname) ?? "";

  if (!name) {
    return res.status(400).json({ message: "Nachname ist ein Pflichtfeld." });
  }

  try {
    const existing = await docClient.send(
      new GetCommand({ TableName: authorsTable, Key: { authorID } }),
    );
    if (!existing.Item) {
      return res.status(404).json({ message: "Autor nicht gefunden." });
    }

    await docClient.send(
      new UpdateCommand({
        TableName:                 authorsTable,
        Key:                       { authorID },
        UpdateExpression:          "SET #name = :name, firstname = :firstname",
        ExpressionAttributeNames:  { "#name": "name" },
        ExpressionAttributeValues: { ":name": name, ":firstname": firstname },
      }),
    );

    return res.json({ message: "Autor erfolgreich aktualisiert." });
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Autors:", error);
    return res.status(500).json({ message: "Autor konnte nicht aktualisiert werden." });
  }
});

// ─── Autor löschen ────────────────────────────────────────────────────────────

/**
 * Autor: Ramona
 * DELETE /api/authors/:id  [Admin-Bereich]
 * Löscht einen Autor anhand seiner ID.
 * @param {string} req.params.id - Die authorID des zu löschenden Autors
 */
router.delete("/:id", async (req, res) => {
  const authorID = req.params.id;

  try {
    await docClient.send(new DeleteCommand({ TableName: authorsTable, Key: { authorID } }));
    return res.json({ message: "Autor erfolgreich gelöscht." });
  } catch (error) {
    console.error("Fehler beim Löschen des Autors:", error);
    return res.status(500).json({ message: "Autor konnte nicht gelöscht werden." });
  }
});

export default router;
