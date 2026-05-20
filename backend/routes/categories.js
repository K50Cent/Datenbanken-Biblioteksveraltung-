/**
 * routes/categories.js
 * Kategorien-Routen: Auflisten und Anlegen.
 * Alle Endpunkte unter /api/categories/
 * Kein Login erforderlich (Kirchberg-Version ohne Auth).
 */

import crypto from "node:crypto";
import express from "express";
import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
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

router.put("/:id", async (req, res) => {
  const categoryId = req.params.id;
  const name = trimValue(req.body.name);

  if (!name) {
    return res.status(400).json({ message: "Name ist ein Pflichtfeld." });
  }

  try {
    const existing = await docClient.send(new GetCommand({ TableName: categoriesTable, Key: { categoryId } }));
    if (!existing.Item) {
      return res.status(404).json({ message: "Kategorie nicht gefunden." });
    }

    await docClient.send(
      new UpdateCommand({
        TableName: categoriesTable,
        Key: { categoryId },
        UpdateExpression: "SET #name = :name",
        ExpressionAttributeNames: { "#name": "name" },
        ExpressionAttributeValues: { ":name": name },
      }),
    );

    return res.json({ message: "Kategorie erfolgreich aktualisiert." });
  } catch (error) {
    console.error("Fehler beim Aktualisieren der Kategorie:", error);
    return res.status(500).json({ message: "Kategorie konnte nicht aktualisiert werden." });
  }
});

router.delete("/:id", async (req, res) => {
  const categoryId = req.params.id;

  try {
    await docClient.send(new DeleteCommand({ TableName: categoriesTable, Key: { categoryId } }));
    return res.json({ message: "Kategorie erfolgreich gelöscht." });
  } catch (error) {
    console.error("Fehler beim Löschen der Kategorie:", error);
    return res.status(500).json({ message: "Kategorie konnte nicht gelöscht werden." });
  }
});

export default router;
