/**
 * setupTables.js
 * Erstellt alle benötigten DynamoDB-Tabellen für die Bibliotheksverwaltung,
 * falls sie noch nicht existieren. Skript ist idempotent (safe to re-run).
 *
 * Tabellen: Books, Authors, BookAuthors, Categories, Loans
 *
 * Aufruf: npm run setup
 */

import { CreateTableCommand, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { client } from "./dynamodb.js";

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

/**
 * Prüft ob eine Tabelle bereits existiert.
 * @param {string} tableName
 * @returns {Promise<boolean>}
 */
async function tableExists(tableName) {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (error) {
    if (error.name === "ResourceNotFoundException") return false;
    throw error;
  }
}

/**
 * Wartet bis eine Tabelle den Status ACTIVE hat (max. 10 Sekunden).
 * @param {string} tableName
 */
async function waitForTable(tableName) {
  for (let attempt = 1; attempt <= 20; attempt++) {
    const result = await client.send(new DescribeTableCommand({ TableName: tableName }));
    if (result.Table?.TableStatus === "ACTIVE") return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Tabelle ${tableName} wurde nicht rechtzeitig aktiv.`);
}

/**
 * Erstellt eine Tabelle und wartet bis sie ACTIVE ist.
 * Überspringt die Erstellung wenn die Tabelle bereits existiert.
 * @param {string} tableName
 * @param {object} tableConfig - CreateTableCommand-Parameter (ohne TableName)
 */
async function createTable(tableName, tableConfig) {
  if (await tableExists(tableName)) {
    console.log(`  ✓ ${tableName} existiert bereits.`);
    return;
  }

  await client.send(new CreateTableCommand({ TableName: tableName, ...tableConfig }));
  await waitForTable(tableName);
  console.log(`  ✓ ${tableName} wurde erstellt.`);
}

// ─── Tabellen-Definitionen ─────────────────────────────────────────────────────

/**
 * Books-Tabelle
 * PK: bookId (String)
 * GSI: categoryId-index → für Abfragen nach Kategorie
 */
async function createBooksTable() {
  await createTable("Books", {
    AttributeDefinitions: [
      { AttributeName: "bookId",     AttributeType: "S" },
      { AttributeName: "categoryId", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "bookId", KeyType: "HASH" },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "categoryId-index",
        KeySchema: [{ AttributeName: "categoryId", KeyType: "HASH" }],
        Projection: { ProjectionType: "ALL" },
      },
    ],
    BillingMode: "PAY_PER_REQUEST",
  });
}

/**
 * Authors-Tabelle
 * PK: authorID (String) – Großbuchstabe D, bestehendes Schema beibehalten
 */
async function createAuthorsTable() {
  await createTable("Authors", {
    AttributeDefinitions: [
      { AttributeName: "authorID", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "authorID", KeyType: "HASH" },
    ],
    BillingMode: "PAY_PER_REQUEST",
  });
}

/**
 * BookAuthors-Tabelle (Junction-Tabelle Buch ↔ Autor)
 * PK: bookId (String), SK: authorId (String)
 * GSI: bookId-index → für queryAll nach bookId
 */
async function createBookAuthorsTable() {
  await createTable("BookAuthors", {
    AttributeDefinitions: [
      { AttributeName: "bookId",   AttributeType: "S" },
      { AttributeName: "authorId", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "bookId",   KeyType: "HASH" },
      { AttributeName: "authorId", KeyType: "RANGE" },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "bookId-index",
        KeySchema: [{ AttributeName: "bookId", KeyType: "HASH" }],
        Projection: { ProjectionType: "ALL" },
      },
    ],
    BillingMode: "PAY_PER_REQUEST",
  });
}

/**
 * Categories-Tabelle
 * PK: categoryId (String)
 */
async function createCategoriesTable() {
  await createTable("Categories", {
    AttributeDefinitions: [
      { AttributeName: "categoryId", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "categoryId", KeyType: "HASH" },
    ],
    BillingMode: "PAY_PER_REQUEST",
  });
}

/**
 * Loans-Tabelle
 * PK: loanId (String)
 * GSI: bookId-index → für Empfehlungsalgorithmus (Ausleihfrequenz pro Buch)
 */
async function createLoansTable() {
  await createTable("Loans", {
    AttributeDefinitions: [
      { AttributeName: "loanId", AttributeType: "S" },
      { AttributeName: "bookId", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "loanId", KeyType: "HASH" },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "bookId-index",
        KeySchema: [{ AttributeName: "bookId", KeyType: "HASH" }],
        Projection: { ProjectionType: "ALL" },
      },
    ],
    BillingMode: "PAY_PER_REQUEST",
  });
}

// ─── Hauptfunktion ─────────────────────────────────────────────────────────────

async function setupAllTables() {
  console.log("Bibliotheksverwaltung – Tabellen-Setup");
  console.log("─".repeat(40));

  await createBooksTable();
  await createAuthorsTable();
  await createBookAuthorsTable();
  await createCategoriesTable();
  await createLoansTable();

  console.log("─".repeat(40));
  console.log("Setup abgeschlossen.");
}

setupAllTables().catch((error) => {
  console.error("Setup fehlgeschlagen:", error.message);
  process.exit(1);
});
