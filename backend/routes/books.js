/**
 * routes/books.js
 * Bücher-Routen: Auflisten, Anlegen, Bearbeiten, Löschen.
 * Alle Endpunkte unter /api/books/
 * Lesen ist öffentlich, Schreiben erfordert Admin-Rolle.
 */

import crypto from "node:crypto";
import express from "express";
import { GetCommand, PutCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../dynamodb.js";
import { verifyToken, requireAdmin } from "../auth.js";
import {
  booksTable,
  bookAuthorsTable,
  trimValue,
  scanAll,
  queryAll,
  enrichBooksWithAuthorsAndAvailability,
} from "../helpers.js";

const router = express.Router();

// ─── Bücher auflisten ──────────────────────────────────────────────────────

/**
 * GET /api/books
 * Gibt alle Bücher zurück, angereichert mit Autoren und Verfügbarkeit.
 * Optionale Filterparameter:
 *   ?search=   → Suche in Titel und Autor (Textfeld)
 *   ?category= → Filter nach categoryId
 *   ?author=   → Filter nach Autorname (Legacy-Feld)
 */
router.get("/", async (req, res) => {
  const { category, search, author } = req.query;

  try {
    // Wenn Kategorie angegeben: GSI nutzen, sonst alle scannen
    let books;
    if (category) {
      books = await queryAll(booksTable, "categoryId-index", "categoryId = :catId", { ":catId": category });
    } else {
      books = await scanAll(booksTable);
    }

    let result = await enrichBooksWithAuthorsAndAvailability(books);

    // Freitext-Suche in Titel und Autor
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (b) =>
          (b.title  || "").toLowerCase().includes(q) ||
          (b.author || "").toLowerCase().includes(q) ||
          b.authors.some(
            (a) => (a.name || "").toLowerCase().includes(q) || (a.firstname || "").toLowerCase().includes(q),
          ),
      );
    }

    // Autor-Filter (exakter Vergleich auf Legacy-Feld)
    if (author) {
      const sel = String(author).toLowerCase();
      result = result.filter((b) => (b.author || "").toLowerCase() === sel);
    }

    return res.json(result);
  } catch (error) {
    console.error("Fehler beim Laden der Bücher:", error);
    return res.status(500).json({ message: "Bücher konnten nicht geladen werden." });
  }
});

// ─── Buch anlegen ──────────────────────────────────────────────────────────

/**
 * POST /api/books  [Admin]
 * Legt ein neues Buch an und verknüpft es mit den angegebenen Autoren
 * über die BookAuthors-Tabelle.
 * Pflichtfelder: title, isbn, year
 */
router.post("/", verifyToken, requireAdmin, async (req, res) => {
  const { title, isbn, year, categoryId, authorIds = [], availableCopies = 1, totalCopies } = req.body;

  if (!title || !isbn || !year) {
    return res.status(400).json({ message: "Titel, ISBN und Jahr sind Pflichtfelder." });
  }

  const copies = Number(availableCopies) || 1;
  const book = {
    bookId:          crypto.randomUUID(),
    title:           trimValue(title),
    isbn:            trimValue(isbn),
    year:            Number(year),
    categoryId:      categoryId || "",
    availableCopies: copies,
    totalCopies:     Number(totalCopies) || copies,
    createdAt:       new Date().toISOString(),
  };

  try {
    await docClient.send(new PutCommand({ TableName: booksTable, Item: book }));

    // Autoren in BookAuthors-Tabelle verknüpfen
    for (const authorId of authorIds) {
      await docClient.send(
        new PutCommand({ TableName: bookAuthorsTable, Item: { bookId: book.bookId, authorId } }),
      );
    }

    return res.status(201).json({ message: "Buch erfolgreich angelegt.", book });
  } catch (error) {
    console.error("Fehler beim Anlegen des Buches:", error);
    return res.status(500).json({ message: "Buch konnte nicht gespeichert werden." });
  }
});

// ─── Buch bearbeiten ───────────────────────────────────────────────────────

/**
 * PUT /api/books/:id  [Admin]
 * Aktualisiert Buchdaten und ersetzt die Autoren-Verknüpfungen komplett.
 * Alte BookAuthors-Einträge werden gelöscht, neue werden angelegt.
 */
router.put("/:id", verifyToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { title, isbn, year, categoryId, authorIds = [], availableCopies, totalCopies } = req.body;

  if (!title || !isbn || !year) {
    return res.status(400).json({ message: "Titel, ISBN und Jahr sind Pflichtfelder." });
  }

  try {
    const existing = await docClient.send(new GetCommand({ TableName: booksTable, Key: { bookId: id } }));
    if (!existing.Item) {
      return res.status(404).json({ message: "Buch nicht gefunden." });
    }

    await docClient.send(
      new UpdateCommand({
        TableName:        booksTable,
        Key:              { bookId: id },
        UpdateExpression: "SET #title = :title, isbn = :isbn, #year = :year, categoryId = :categoryId, availableCopies = :available, totalCopies = :total",
        ExpressionAttributeNames:  { "#title": "title", "#year": "year" },
        ExpressionAttributeValues: {
          ":title":      trimValue(title),
          ":isbn":       trimValue(isbn),
          ":year":       Number(year),
          ":categoryId": categoryId || "",
          ":available":  Number(availableCopies) ?? existing.Item.availableCopies,
          ":total":      Number(totalCopies)      ?? existing.Item.totalCopies,
        },
      }),
    );

    // Autoren-Verknüpfungen aktualisieren: alte löschen, neue anlegen
    const oldAuthors = await queryAll(bookAuthorsTable, null, "bookId = :bookId", { ":bookId": id });
    for (const ba of oldAuthors) {
      await docClient.send(
        new DeleteCommand({ TableName: bookAuthorsTable, Key: { bookId: ba.bookId, authorId: ba.authorId } }),
      );
    }
    for (const authorId of authorIds) {
      await docClient.send(
        new PutCommand({ TableName: bookAuthorsTable, Item: { bookId: id, authorId } }),
      );
    }

    return res.json({ message: "Buch erfolgreich aktualisiert." });
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Buches:", error);
    return res.status(500).json({ message: "Buch konnte nicht aktualisiert werden." });
  }
});

// ─── Buch löschen ──────────────────────────────────────────────────────────

/**
 * DELETE /api/books/:id  [Admin]
 * Löscht ein Buch und alle zugehörigen BookAuthors-Einträge.
 */
router.delete("/:id", verifyToken, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const existing = await docClient.send(new GetCommand({ TableName: booksTable, Key: { bookId: id } }));
    if (!existing.Item) {
      return res.status(404).json({ message: "Buch nicht gefunden." });
    }

    await docClient.send(new DeleteCommand({ TableName: booksTable, Key: { bookId: id } }));

    // BookAuthors-Einträge für dieses Buch ebenfalls löschen
    const bookAuthors = await queryAll(bookAuthorsTable, null, "bookId = :bookId", { ":bookId": id });
    for (const ba of bookAuthors) {
      await docClient.send(
        new DeleteCommand({ TableName: bookAuthorsTable, Key: { bookId: ba.bookId, authorId: ba.authorId } }),
      );
    }

    return res.json({ message: "Buch erfolgreich gelöscht." });
  } catch (error) {
    console.error("Fehler beim Löschen des Buches:", error);
    return res.status(500).json({ message: "Buch konnte nicht gelöscht werden." });
  }
});

export default router;
