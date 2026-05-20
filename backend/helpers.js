/**
 * helpers.js
 * Gemeinsame Hilfsfunktionen für alle Backend-Module.
 * Enthält: DynamoDB-Abfragen und Buchaufbereitung
 * (Autoren + Verfügbarkeit).
 */

import { ScanCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "./dynamodb.js";

// ─── Tabellennamen (aus .env oder Standardwerte) ───────────────────────────

export const booksTable      = process.env.BOOKS_TABLE       || "Books";
export const authorsTable    = process.env.AUTHORS_TABLE     || "Authors";
export const bookAuthorsTable= process.env.BOOK_AUTHORS_TABLE|| "BookAuthors";
export const categoriesTable = process.env.CATEGORIES_TABLE  || "Categories";
export const loansTable      = process.env.LOANS_TABLE       || "Loans";

// ─── Text-Hilfsfunktionen ──────────────────────────────────────────────────

/**
 * Entfernt führende und nachfolgende Leerzeichen aus einem String.
 * Gibt leeren String zurück, wenn kein String übergeben wurde.
 * @param {*} value
 * @returns {string}
 */
export function trimValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

// ─── DynamoDB-Abfragen ─────────────────────────────────────────────────────

/**
 * Liest alle Einträge aus einer DynamoDB-Tabelle (paginiert mit LastEvaluatedKey).
 * Optionaler Filter über FilterExpression.
 * @param {string} tableName
 * @param {string} [filterExpression]
 * @param {object} [expressionValues]
 * @param {object} [expressionNames]
 * @returns {Promise<object[]>}
 */
export async function scanAll(tableName, filterExpression, expressionValues, expressionNames) {
  const items = [];
  let lastKey;
  do {
    const params = { TableName: tableName, ExclusiveStartKey: lastKey };
    if (filterExpression) params.FilterExpression = filterExpression;
    if (expressionValues) params.ExpressionAttributeValues = expressionValues;
    if (expressionNames)  params.ExpressionAttributeNames  = expressionNames;
    const result = await docClient.send(new ScanCommand(params));
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

/**
 * Führt eine paginierte Query auf einer DynamoDB-Tabelle oder einem Index durch.
 * @param {string} tableName
 * @param {string|null} indexName - GSI-Name oder null für Primärschlüssel
 * @param {string} keyCondition
 * @param {object} expressionValues
 * @param {object} [expressionNames]
 * @returns {Promise<object[]>}
 */
export async function queryAll(tableName, indexName, keyCondition, expressionValues, expressionNames) {
  const items = [];
  let lastKey;
  do {
    const params = {
      TableName:                 tableName,
      KeyConditionExpression:    keyCondition,
      ExpressionAttributeValues: expressionValues,
      ExclusiveStartKey:         lastKey,
    };
    if (indexName)      params.IndexName              = indexName;
    if (expressionNames) params.ExpressionAttributeNames = expressionNames;
    const result = await docClient.send(new QueryCommand(params));
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

// ─── Buch-Aufbereitung ─────────────────────────────────────────────────────

/**
 * Reichert eine Liste von Büchern mit Autoreninformationen und Verfügbarkeit an.
 * Lädt BookAuthors, Authors und aktive Ausleihen parallel und verknüpft sie im Speicher.
 * Fügt außerdem das Feld `nextAvailable` hinzu (frühestes Rückgabedatum bei ausgeliehenen Büchern).
 * @param {object[]} books
 * @returns {Promise<object[]>} Bücher mit `authors`-Array und `nextAvailable`
 */
export async function enrichBooksWithAuthorsAndAvailability(books) {
  if (!books.length) return [];

  const [allBookAuthors, allAuthors, allLoans] = await Promise.all([
    scanAll(bookAuthorsTable),
    scanAll(authorsTable),
    scanAll(loansTable),
  ]);
  const activeLoans = allLoans.filter((l) => !l.returnedAt);

  // Autoren-Map: authorId → Autor-Objekt
  const authorMap = {};
  for (const a of allAuthors) authorMap[a.authorID || a.authorId] = a;

  // BookAuthors-Map: bookId → [authorId, ...]
  const bookAuthorsMap = {};
  for (const ba of allBookAuthors) {
    if (!bookAuthorsMap[ba.bookId]) bookAuthorsMap[ba.bookId] = [];
    bookAuthorsMap[ba.bookId].push(ba.authorId);
  }

  // Nächstes Rückgabedatum pro Buch berechnen
  const nextAvailableMap = {};
  for (const loan of activeLoans) {
    const current = nextAvailableMap[loan.bookId];
    if (!current || loan.dueDate < current) {
      nextAvailableMap[loan.bookId] = loan.dueDate;
    }
  }

  return books.map((book) => {
    const authorIds = bookAuthorsMap[book.bookId] || [];
    const authors = authorIds
      .map((id) => authorMap[id])
      .filter(Boolean)
      .map((a) => ({ authorId: a.authorID || a.authorId, name: a.name, firstname: a.firstname }));

    return {
      ...book,
      authors,
      nextAvailable: book.availableCopies === 0 ? (nextAvailableMap[book.bookId] || null) : null,
    };
  });
}
