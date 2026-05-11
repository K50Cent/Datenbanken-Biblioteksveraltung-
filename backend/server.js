import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "./dynamodb.js";

const app = express();
const port = process.env.PORT || 3000;
const usersTable = process.env.USERS_TABLE || "Users";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = path.join(__dirname, "..", "public");

app.use(express.json());
app.use(express.static(publicPath));

function trimValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function usernameKey(value) {
  return trimValue(value).toLowerCase();
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function signToken(user) {
  const payload = {
    userId: user.userId,
    loginname: user.username,
    name: user.name || "",
    vorname: user.vorname || "",
    role: user.role || "benutzer",
    exp: Date.now() + 1000 * 60 * 60 * 8,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", process.env.AUTH_SECRET || "local-library-secret")
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

function toPublicUser(user) {
  return {
    userId: user.userId,
    loginname: user.username,
    name: user.name || "",
    vorname: user.vorname || "",
    role: user.role || "benutzer",
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/auth/login", async (req, res) => {
  const loginname = trimValue(req.body.loginname);
  const password = trimValue(req.body.password);

  if (!loginname || !password) {
    return res.status(400).json({ message: "Bitte Loginname und Passwort eingeben." });
  }

  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: usersTable,
        Key: { usernameKey: usernameKey(loginname) },
      }),
    );

    const user = result.Item;

    if (!user || user.passwordHash !== hashPassword(password)) {
      return res.status(401).json({ message: "Loginname oder Passwort ist falsch." });
    }

    return res.json({
      user: toPublicUser(user),
      token: signToken(user),
    });
  } catch (error) {
    console.error("Login fehlgeschlagen:", error);
    return res.status(500).json({
      message: "Die Anmeldung konnte nicht mit der Datenbank geprueft werden.",
    });
  }
});

app.post("/api/auth/register", async (req, res) => {
  const loginname = trimValue(req.body.loginname);
  const password = trimValue(req.body.password);
  const name = trimValue(req.body.name);
  const vorname = trimValue(req.body.vorname);

  if (loginname.length < 3) {
    return res.status(400).json({ message: "Der Loginname muss mindestens 3 Zeichen lang sein." });
  }

  if (password.length < 4) {
    return res.status(400).json({ message: "Das Passwort muss mindestens 4 Zeichen lang sein." });
  }

  if (!name || !vorname) {
    return res.status(400).json({ message: "Bitte Vorname und Name eingeben." });
  }

  const user = {
    usernameKey: usernameKey(loginname),
    userId: crypto.randomUUID(),
    username: loginname,
    passwordHash: hashPassword(password),
    name,
    vorname,
    role: "benutzer",
    createdAt: new Date().toISOString(),
  };

  try {
    await docClient.send(
      new PutCommand({
        TableName: usersTable,
        Item: user,
        ConditionExpression: "attribute_not_exists(usernameKey)",
      }),
    );

    return res.status(201).json({
      user: toPublicUser(user),
      token: signToken(user),
    });
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      return res.status(409).json({ message: "Dieser Loginname ist schon vergeben." });
    }

    console.error("Registrierung fehlgeschlagen:", error);
    return res.status(500).json({
      message: "Die Registrierung konnte nicht in der Datenbank gespeichert werden.",
    });
  }
});

app.listen(port, () => {
  console.log(`Bibliotheksverwaltung laeuft unter http://localhost:${port}`);
});
