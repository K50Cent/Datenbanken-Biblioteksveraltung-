/**
 * routes/authors.js
 * Autoren-Routen: Auflisten und Anlegen.
 * Alle Endpunkte unter /api/authors/
 * Kein Login erforderlich (Kirchberg-Version ohne Auth).
 */

import crypto from "node:crypto";
import express from "express";
import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../dynamodb.js";
import { authorsTable, bookAuthorsTable, trimValue, scanAll } from "../helpers.js";

const router = express.Router();

// ─── Autoren auflisten ─────────────────────────────────────────────────────

/**
 * GET /api/authors
 * Gibt alle Autoren aus der Authors-Tabelle zurück.
 * Wird im Admin-Bereich für das Dropdown genutzt.
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
 * POST /api/authors  [Admin-Bereich]
 * Legt einen neuen Autor mit Vor- und Nachname an.
 * Der Primärschlüssel authorID folgt dem bestehenden Tabellenschema (Großbuchstabe D).
 */
router.post("/", async (req, res) => {
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

router.put("/:id", async (req, res) => {
  const authorID = req.params.id;
  const name = trimValue(req.body.name);
  const firstname = trimValue(req.body.firstname);

  if (!name || !firstname) {
    return res.status(400).json({ message: "Name und Vorname sind Pflichtfelder." });
  }

  try {
    const existing = await docClient.send(new GetCommand({ TableName: authorsTable, Key: { authorID } }));
    if (!existing.Item) {
      return res.status(404).json({ message: "Autor nicht gefunden." });
    }

    await docClient.send(
      new UpdateCommand({
        TableName: authorsTable,
        Key: { authorID },
        UpdateExpression: "SET #name = :name, firstname = :firstname",
        ExpressionAttributeNames: { "#name": "name" },
        ExpressionAttributeValues: { ":name": name, ":firstname": firstname },
      }),
    );

    return res.json({ message: "Autor erfolgreich aktualisiert." });
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Autors:", error);
    return res.status(500).json({ message: "Autor konnte nicht aktualisiert werden." });
  }
});

router.delete("/:id", async (req, res) => {
  const authorID = req.params.id;

  try {
    const links = await scanAll(bookAuthorsTable, "authorId = :authorId", { ":authorId": authorID });

    for (const link of links) {
      await docClient.send(
        new DeleteCommand({
          TableName: bookAuthorsTable,
          Key: { bookId: link.bookId, authorId: link.authorId },
        }),
      );
    }

    await docClient.send(new DeleteCommand({ TableName: authorsTable, Key: { authorID } }));
    return res.json({ message: "Autor erfolgreich gelöscht." });
  } catch (error) {
    console.error("Fehler beim Löschen des Autors:", error);
    return res.status(500).json({ message: "Autor konnte nicht gelöscht werden." });
  }
});

export default router;
