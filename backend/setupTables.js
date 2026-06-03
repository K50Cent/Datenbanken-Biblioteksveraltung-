import { CreateTableCommand, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { client } from "./dynamodb.js";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import crypto from "node:crypto";
import { docClient } from "./dynamodb.js";

// Autor: Kjell
async function tableExists(tableName) {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (error) {
    if (error.name === "ResourceNotFoundException") return false;
    throw error;
  }
}

//Autor: Kjell
async function waitForTable(tableName) {
  for (let attempt = 1; attempt <= 20; attempt++) {
    const result = await client.send(new DescribeTableCommand({ TableName: tableName }));
    if (result.Table?.TableStatus === "ACTIVE") return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Tabelle ${tableName} wurde nicht rechtzeitig aktiv.`);
}

//Autor: Kjell
async function createTable(tableName, tableConfig) {
  if (await tableExists(tableName)) {
    console.log(`  ✓ ${tableName} existiert bereits.`);
    return;
  }

  await client.send(new CreateTableCommand({ TableName: tableName, ...tableConfig }));
  await waitForTable(tableName);
  console.log(`  ✓ ${tableName} wurde erstellt.`);
}

//Autor: Kjell
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

//Autor: Kjell
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

//Autor: Kjell
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

//Autor: Kjell
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

//Autor: Kjell

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

//Autor: Kjell
async function createUsersTable() {
  await createTable("Users", {
    AttributeDefinitions: [
      { AttributeName: "usernameKey", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "usernameKey", KeyType: "HASH" },
    ],
    BillingMode: "PAY_PER_REQUEST",
  });
}

//Autor: Kjell

async function createDefaultUser() {
  const user = {
    usernameKey: crypto.randomUUID(),
    name: "Demo User",
    createdAt: new Date().toISOString(),
  };

  await docClient.send(
    new PutCommand({
      TableName: "Users",
      Item: user,
    })
  );

  console.log("  ✓ Default-User angelegt:", user.usernameKey);
}


//Autor: Kjell
async function setupAllTables() {
  console.log("Bibliotheksverwaltung – Tabellen-Setup");
  console.log("─".repeat(40));

  await createBooksTable();
  await createAuthorsTable();
  await createBookAuthorsTable();
  await createCategoriesTable();
  await createLoansTable();
  await createUsersTable();
  await createDefaultUser();

  console.log("─".repeat(40));
  console.log("Setup abgeschlossen.");
}

setupAllTables().catch((error) => {
  console.error("Setup fehlgeschlagen:", error.message);
  process.exit(1);
});
