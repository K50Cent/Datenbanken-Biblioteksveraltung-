import crypto from "node:crypto";
import express from "express";
import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../dynamodb.js";
import { authorsTable, trimValue, scanAll } from "../helpers.js";

const router = express.Router();

//Autor: Ramona Buchbinder
router.get("/", async (_req, res) => {
  try {
    const authors = await scanAll(authorsTable);
    return res.json(authors);
  } catch (error) {
    return res.status(500).json({ message: "Autoren konnten nicht geladen werden." });
  }
});

export default router;
