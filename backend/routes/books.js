/**
 * routes/books.js
 * Bücher-Routen: Auflisten, Empfehlungen, Anlegen, Bearbeiten, Löschen.
 * Alle Endpunkte unter /api/books/
 * Alle Routen sind ohne Login zugänglich (Kirchberg-Version ohne Auth).
 */

import crypto from "node:crypto";
import express from "express";
import { GetCommand, PutCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../dynamodb.js";
import {
  booksTable,
  bookAuthorsTable,
  categoriesTable,
  loansTable,
  trimValue,
  scanAll,
  queryAll,
  enrichBooksWithAuthorsAndAvailability,
} from "../helpers.js";

const router = express.Router();

// ─── Empfehlungen ──────────────────────────────────────────────────────────
// WICHTIG: Vor GET /:id registriert, sonst matched Express "recommendations" als :id

/**
 * Autor: Ramona
 * GET /api/books/recommendations
 * Gibt die Top-5-Bücher der meistausgeliehenen Kategorie zurück.
 * Algorithmus:
 *   1. Alle Ausleihen zählen (aktiv + abgeschlossen) pro Buch
 *   2. Kategorie mit höchster Gesamt-Ausleihzahl ermitteln
 *   3. Top 5 Bücher dieser Kategorie nach Ausleihzahl zurückgeben
 * Fallback: 5 beliebige Bücher, wenn keine Ausleihen vorhanden.
 */
router.get("/recommendations/:userId", async (req, res) => {
  const userId = req.params.userId;

  try {
    // 1. Alle Ausleihen dieses Users laden
    const myLoans = await scanAll(loansTable, "userId = :u", { ":u": userId });

    if (!myLoans.length) {
      return res.json({ categoryName: null, books: [] });
    }

    // 2. Kategorien zählen
    const categoryCount = {};

    for (const loan of myLoans) {
      const book = await docClient.send(
        new GetCommand({ TableName: booksTable, Key: { bookId: loan.bookId } })
      );

      const cat = book.Item?.categoryId || "__none__";
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    }

    // 3. Lieblingskategorie bestimmen
    const topCategory = Object.entries(categoryCount)
      .sort((a, b) => b[1] - a[1])[0][0];

    // 4. Bücher aus dieser Kategorie laden
    const books = await queryAll(
      booksTable,
      "categoryId-index",
      "categoryId = :c",
      { ":c": topCategory }
    );

    // 5. Bücher anreichern
    const enriched = await enrichBooksWithAuthorsAndAvailability(books);

    return res.json({
      categoryName: topCategory,
      books: enriched.slice(0, 5),
    });

  } catch (error) {
    console.error("Fehler bei personalisierten Empfehlungen:", error);
    return res.status(500).json({ message: "Empfehlungen konnten nicht geladen werden." });
  }
});


// ─── Bücher auflisten ──────────────────────────────────────────────────────

/**
 * Autor: Kjell
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
 * Autor: Kjell
 * POST /api/books  [Admin-Bereich]
 * Legt ein neues Buch an und verknüpft es mit den angegebenen Autoren
 * über die BookAuthors-Tabelle.
 * Pflichtfelder: title, isbn, year
 */
router.post("/", async (req, res) => {
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
 * Autor: Kjell
 * PUT /api/books/:id  [Admin-Bereich]
 * Aktualisiert Buchdaten und ersetzt die Autoren-Verknüpfungen komplett.
 * Alte BookAuthors-Einträge werden gelöscht, neue werden angelegt.
 */
router.put("/:id", async (req, res) => {
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
 * Autor: Kjell
 * DELETE /api/books/:id  [Admin-Bereich]
 * Löscht ein Buch und alle zugehörigen BookAuthors-Einträge.
 */
router.delete("/:id", async (req, res) => {
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
