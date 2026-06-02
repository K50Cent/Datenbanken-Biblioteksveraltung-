/**
 * routes/loans.js
 * Ausleihen-Routen: Buch ausleihen, alle Ausleihen anzeigen, Buch zurückgeben.
 * Alle Endpunkte unter /api/loans/
 * Kein Login erforderlich (Kirchberg-Version ohne Auth).
 */

import crypto from "node:crypto";
import express from "express";
import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../dynamodb.js";
import {
  booksTable,
  authorsTable,
  bookAuthorsTable,
  loansTable,
  scanAll,
} from "../helpers.js";

const router = express.Router();

// ─── Buch ausleihen ────────────────────────────────────────────────────────

/**
 * Autor: Ramona
 * POST /api/loans
 * Leiht ein Buch aus. Laufzeit: 14 Tage ab heute (dueDate).
 * Pflichtfeld: bookId
 * Optional: userId – verknüpft die Ausleihe mit einem Benutzer (für Empfehlungen)
 */
router.post("/", async (req, res) => {
  const bookId = String(req.body.bookId || "").trim();
  const userId = String(req.body.userId || "").trim() || null;

  if (!bookId) {
    return res.status(400).json({ message: "bookId ist ein Pflichtfeld." });
  }

  try {
    const bookResult = await docClient.send(new GetCommand({ TableName: booksTable, Key: { bookId } }));
    if (!bookResult.Item) {
      return res.status(404).json({ message: "Buch nicht gefunden." });
    }

    const book = bookResult.Item;

    if (book.availableCopies != null) {
      try {
        await docClient.send(
          new UpdateCommand({
            TableName:                 booksTable,
            Key:                       { bookId },
            UpdateExpression:          "SET availableCopies = availableCopies - :one",
            ConditionExpression:       "availableCopies > :zero",
            ExpressionAttributeValues: { ":one": 1, ":zero": 0 },
          }),
        );
      } catch (condErr) {
        if (condErr.name === "ConditionalCheckFailedException") {
          return res.status(409).json({ message: "Alle Exemplare dieses Buches sind aktuell ausgeliehen." });
        }
        throw condErr;
      }
    } else {
      if (book.available === false) {
        return res.status(409).json({ message: "Alle Exemplare dieses Buches sind aktuell ausgeliehen." });
      }
      await docClient.send(
        new UpdateCommand({
          TableName:                 booksTable,
          Key:                       { bookId },
          UpdateExpression:          "SET available = :false",
          ExpressionAttributeValues: { ":false": false },
        }),
      );
    }

    const now     = new Date();
    const dueDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const loan    = {
      loanId:     crypto.randomUUID(),
      bookId,
      borrowedAt: now.toISOString(),
      dueDate,
    };

    // userId nur speichern wenn vorhanden
    if (userId) loan.userId = userId;

    await docClient.send(new PutCommand({ TableName: loansTable, Item: loan }));
    return res.status(201).json({ message: "Buch erfolgreich ausgeliehen.", loan });
  } catch (error) {
    console.error("Fehler beim Ausleihen:", error);
    return res.status(500).json({ message: "Buch konnte nicht ausgeliehen werden." });
  }
});

// ─── Alle aktiven Ausleihen anzeigen ──────────────────────────────────────────

/**
 * Autor: Ramona
 * GET /api/loans
 * Gibt alle aktiven (nicht zurückgegebenen) Ausleihen zurück.
 * Jede Ausleihe wird mit dem Buchtitel angereichert.
 * Sortiert nach Fälligkeitsdatum aufsteigend.
 *
 * Optionaler Filter:
 *   ?author= → Suche nach Autorname (Vor- oder Nachname)
 *              Vierer-Kette: Loans → Books → BookAuthors → Authors
 */
router.get("/", async (req, res) => {
  const { author } = req.query;

  try {
    const loans = await scanAll(loansTable);
    const activeLoans = loans.filter((l) => !l.returnedAt);

    // Autorenfilter: Vierer-Kette Loans → Books → BookAuthors → Authors
    let filteredBookIds = null;
    if (author) {
      const q = author.toLowerCase();
      const [allAuthors, allBookAuthors] = await Promise.all([
        scanAll(authorsTable),
        scanAll(bookAuthorsTable),
      ]);

      // Schritt 1: passende Autoren-IDs finden
      const matchingAuthorIds = new Set(
        allAuthors
          .filter((a) =>
            (a.name      || "").toLowerCase().includes(q) ||
            (a.firstname || "").toLowerCase().includes(q) ||
            `${a.firstname || ""} ${a.name || ""}`.toLowerCase().includes(q),
          )
          .map((a) => a.authorID || a.authorId),
      );

      // Schritt 2: zugehörige Buch-IDs ermitteln
      filteredBookIds = new Set(
        allBookAuthors
          .filter((ba) => matchingAuthorIds.has(ba.authorId))
          .map((ba) => ba.bookId),
      );
    }

    const relevantLoans = filteredBookIds
      ? activeLoans.filter((l) => filteredBookIds.has(l.bookId))
      : activeLoans;

    // Buchtitel zu jeder Ausleihe laden
    const enriched = await Promise.all(
      relevantLoans.map(async (loan) => {
        const bookResult = await docClient.send(
          new GetCommand({ TableName: booksTable, Key: { bookId: loan.bookId } }),
        );
        return {
          ...loan,
          book: bookResult.Item
            ? { bookId: bookResult.Item.bookId, title: bookResult.Item.title }
            : { bookId: loan.bookId, title: "Unbekanntes Buch" },
        };
      }),
    );

    enriched.sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
    return res.json(enriched);
  } catch (error) {
    console.error("Fehler beim Laden der Ausleihen:", error);
    return res.status(500).json({ message: "Ausleihen konnten nicht geladen werden." });
  }
});

// ─── Buch zurückgeben ──────────────────────────────────────────────────────

/**
 * Autor: Ramona
 * POST /api/loans/:id/return
 * Markiert eine Ausleihe als zurückgegeben (returnedAt) und
 * erhöht die verfügbaren Exemplare des Buches wieder.
 */
router.post("/:id/return", async (req, res) => {
  const { id } = req.params;

  try {
    const loanResult = await docClient.send(
      new GetCommand({ TableName: loansTable, Key: { loanId: id } }),
    );

    const loan = loanResult.Item;
    if (!loan) {
      return res.status(404).json({ message: "Ausleihe nicht gefunden." });
    }
    if (loan.returnedAt) {
      return res.status(409).json({ message: "Dieses Buch wurde bereits zurückgegeben." });
    }

    await docClient.send(
      new UpdateCommand({
        TableName:                 loansTable,
        Key:                       { loanId: id },
        UpdateExpression:          "SET returnedAt = :now",
        ExpressionAttributeValues: { ":now": new Date().toISOString() },
      }),
    );

    const returnedBook = await docClient.send(
      new GetCommand({ TableName: booksTable, Key: { bookId: loan.bookId } }),
    );

    if (returnedBook.Item?.availableCopies != null) {
      await docClient.send(
        new UpdateCommand({
          TableName:                 booksTable,
          Key:                       { bookId: loan.bookId },
          UpdateExpression:          "SET availableCopies = availableCopies + :one",
          ExpressionAttributeValues: { ":one": 1 },
        }),
      );
    } else {
      await docClient.send(
        new UpdateCommand({
          TableName:                 booksTable,
          Key:                       { bookId: loan.bookId },
          UpdateExpression:          "SET available = :true",
          ExpressionAttributeValues: { ":true": true },
        }),
      );
    }

    return res.json({ message: "Buch erfolgreich zurückgegeben." });
  } catch (error) {
    console.error("Fehler beim Zurückgeben:", error);
    return res.status(500).json({ message: "Buch konnte nicht zurückgegeben werden." });
  }
});

export default router;
