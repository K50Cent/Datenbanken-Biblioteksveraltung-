/**
 * routes/auth.js
 * Authentifizierungs-Routen: Login und Registrierung.
 * Alle Endpunkte unter /api/auth/
 */

import crypto from "node:crypto";
import express from "express";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../dynamodb.js";
import { verifyToken } from "../auth.js";
import {
  usersTable,
  trimValue,
  usernameKey,
  hashPassword,
  signToken,
  toPublicUser,
} from "../helpers.js";

const router = express.Router();

// ─── Login ─────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Prüft Loginname und Passwort gegen die Users-Tabelle.
 * Bei Erfolg: gibt Benutzerdaten + signierten Token zurück.
 * Bei falschem Login: 401 mit deutschem Fehlertext.
 */
router.post("/login", async (req, res) => {
  const loginname = trimValue(req.body.loginname);
  const password  = trimValue(req.body.password);

  if (!loginname || !password) {
    return res.status(400).json({ message: "Bitte Loginname und Passwort eingeben." });
  }

  try {
    const result = await docClient.send(
      new GetCommand({ TableName: usersTable, Key: { usernameKey: usernameKey(loginname) } }),
    );
    const user = result.Item;

    if (!user || user.passwordHash !== hashPassword(password)) {
      return res.status(401).json({ message: "Loginname oder Passwort ist falsch." });
    }

    return res.json({ user: toPublicUser(user), token: signToken(user) });
  } catch (error) {
    console.error("Login fehlgeschlagen:", error);
    return res.status(500).json({ message: "Anmeldung konnte nicht geprüft werden." });
  }
});

// ─── Registrierung ─────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Legt einen neuen Benutzer mit Rolle "benutzer" an.
 * Loginname wird als Primärschlüssel (kleingeschrieben) gespeichert.
 * Gibt bei doppeltem Loginnamen 409 zurück.
 */
router.post("/register", async (req, res) => {
  const loginname = trimValue(req.body.loginname);
  const password  = trimValue(req.body.password);
  const name      = trimValue(req.body.name);
  const vorname   = trimValue(req.body.vorname);

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
    usernameKey:  usernameKey(loginname),
    userId:       crypto.randomUUID(),
    username:     loginname,
    passwordHash: hashPassword(password),
    name,
    vorname,
    role:         "benutzer",
    createdAt:    new Date().toISOString(),
  };

  try {
    await docClient.send(
      new PutCommand({
        TableName:           usersTable,
        Item:                user,
        ConditionExpression: "attribute_not_exists(usernameKey)",
      }),
    );
    return res.status(201).json({ user: toPublicUser(user), token: signToken(user) });
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      return res.status(409).json({ message: "Dieser Loginname ist schon vergeben." });
    }
    console.error("Registrierung fehlgeschlagen:", error);
    return res.status(500).json({ message: "Registrierung konnte nicht gespeichert werden." });
  }
});

// ─── Session prüfen ────────────────────────────────────────────────────────

/**
 * GET /api/auth/session
 * Gibt den aktuell eingeloggten Benutzer zurück (aus dem Token).
 * Wird vom Frontend genutzt um zu prüfen ob eine Session noch gültig ist.
 */
router.get("/session", verifyToken, (req, res) => {
  return res.json({ user: req.user });
});

export default router;
