import crypto from "node:crypto";
import {
  CreateTableCommand,
  DescribeTableCommand,
} from "@aws-sdk/client-dynamodb";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { client, docClient } from "./dynamodb.js";

const usersTable = process.env.USERS_TABLE || "Users";

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

async function tableExists(tableName) {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (error) {
    if (error.name === "ResourceNotFoundException") {
      return false;
    }

    throw error;
  }
}

async function waitForTable(tableName) {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const result = await client.send(new DescribeTableCommand({ TableName: tableName }));

    if (result.Table?.TableStatus === "ACTIVE") {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Tabelle ${tableName} wurde nicht rechtzeitig aktiv.`);
}

async function createUsersTable() {
  if (await tableExists(usersTable)) {
    console.log(`Tabelle ${usersTable} existiert bereits.`);
    return;
  }

  await client.send(
    new CreateTableCommand({
      TableName: usersTable,
      AttributeDefinitions: [{ AttributeName: "usernameKey", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "usernameKey", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );

  await waitForTable(usersTable);
  console.log(`Tabelle ${usersTable} wurde erstellt.`);
}

async function createAdminUser() {
  await docClient.send(
    new PutCommand({
      TableName: usersTable,
      Item: {
        usernameKey: "admin",
        userId: "user-admin",
        username: "Admin",
        passwordHash: hashPassword("Admin"),
        name: "Bibliothek",
        vorname: "Admin",
        role: "admin",
        createdAt: new Date().toISOString(),
      },
    }),
  );

  console.log("Admin-Benutzer wurde angelegt oder aktualisiert.");
  console.log("Loginname: Admin");
  console.log("Passwort: Admin");
}

async function setupUsers() {
  await createUsersTable();
  await createAdminUser();
}

setupUsers().catch((error) => {
  console.error("Benutzer-Setup fehlgeschlagen:", error.message);
  process.exit(1);
});
