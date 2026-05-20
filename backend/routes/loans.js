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
import { booksTable, loansTable, scanAll } from "../helpers.js";

const router = express.Router();

// ─── Buch ausleihen ────────────────────────────────────────────────────────

/**
 * POST /api/loans
 * Leiht ein Buch aus. Laufzeit: 14 Tage ab heute (dueDate).
 * Unterstützt beide Datenbankschemas:
 *   - Neu: availableCopies (atomares Dekrement mit ConditionExpression)
 *   - Legacy: available (Boolean, wird auf false gesetzt)
 */
router.post("/", async (req, res) => {
  const bookId = String(req.body.bookId || "").trim();

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
      // Neues Schema: atomares Dekrement mit Prüfung ob Exemplare verfügbar
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
      // Legacy-Schema: available Boolean
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

    // Ausleihe-Datensatz anlegen (ohne userId – kein Login erforderlich)
    const now     = new Date();
    const dueDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const loan    = {
      loanId:     crypto.randomUUID(),
      bookId,
      borrowedAt: now.toISOString(),
      dueDate,
    };

    await docClient.send(new PutCommand({ TableName: loansTable, Item: loan }));
    return res.status(201).json({ message: "Buch erfolgreich ausgeliehen.", loan });
  } catch (error) {
    console.error("Fehler beim Ausleihen:", error);
    return res.status(500).json({ message: "Buch konnte nicht ausgeliehen werden." });
  }
});

// ─── Alle aktiven Ausleihen anzeigen ──────────────────────────────────────────

/**
 * GET /api/loans
 * Gibt alle aktiven (nicht zurückgegebenen) Ausleihen zurück.
 * Jede Ausleihe wird mit dem Buchtitel angereichert.
 * Sortiert nach Fälligkeitsdatum aufsteigend.
 */
router.get("/", async (_req, res) => {
  try {
    const loans = await scanAll(loansTable);
    const activeLoans = loans.filter((l) => !l.returnedAt);

    // Buchtitel zu jeder Ausleihe laden
    const enriched = await Promise.all(
      activeLoans.map(async (loan) => {
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

    // Ausleihe als zurückgegeben markieren
    await docClient.send(
      new UpdateCommand({
        TableName:                 loansTable,
        Key:                       { loanId: id },
        UpdateExpression:          "SET returnedAt = :now",
        ExpressionAttributeValues: { ":now": new Date().toISOString() },
      }),
    );

    // Verfügbarkeit des Buches wiederherstellen
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
