import crypto from "node:crypto";
import express from "express";
import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../dynamodb.js";
import {booksTable,authorsTable,bookAuthorsTable,loansTable,scanAll,} from "../helpers.js";

const router = express.Router();

//Autor: Ramona Buchbinder
router.post("/", async (req, res) => {
  const bookId = String(req.body.bookId || "").trim();
  const userId = String(req.body.userId || "").trim();
  try {
    const bookObject = await docClient.send(new GetCommand({ TableName: booksTable, Key: { bookId } }));
    const book = bookObject.Item;

    if (!book) {
      return res.status(404).json({ message: "Buch nicht gefunden." });
    }

    if (book.availableCopies != null) {
      await docClient.send(
        new UpdateCommand({TableName: booksTable, Key: { bookId },
          UpdateExpression: "SET availableCopies = availableCopies - :one",
          ConditionExpression: "availableCopies > :zero",
          ExpressionAttributeValues: { ":one": 1, ":zero": 0 }, //Platzhalter
        })
      );
    } else {
      return res.status(409).json({message: "kein Exemplar verfügbar"});
    }

    const now = new Date();
    const loan = {loanId: crypto.randomUUID(),
      bookId,userId,
      borrowedAt: now.toISOString(),
      dueDate: new Date(now.getTime() + 14 * 86400000).toISOString(),
    };

    await docClient.send(new PutCommand({ TableName: loansTable, Item: loan }));
    res.status(201).json({ message: "Buch erfolgreich ausgeliehen.", loan });
  
  } catch (error) {
    res.status(500).json({ message: "Buch konnte nicht ausgeliehen werden." });
  }
});

//Autor: Ramona Buchbinder
router.get("/", async (req, res) => {
  try {
    const { author, userId } = req.query;

    let loans = (await scanAll(loansTable)).filter(l => !l.returnedAt && l.userId === userId); // alle nicht zurückgegeben Ausleihen des Users

    if (author) {
      const q = author.toLowerCase();

      const authors = await scanAll(authorsTable);
      const bookAuthors = await scanAll(bookAuthorsTable);

      //Set entfernt automatisch doppelte werte (fehlerhafte Daten)
      const authorIds = new Set(
        authors.filter(a =>`${a.firstname || ""} ${a.name || ""}`.toLowerCase().includes(q)).map(a => a.authorId ?? a.authorID)
      ); //map macht aus objekten nur die Ids

      const bookIds = new Set(
        bookAuthors.filter(ba => authorIds.has(ba.authorId)).map(ba => ba.bookId)
      );

      //alle loans wurden angezeigt und nun werden nur die gefilterten bookids geladen
      loans = loans.filter(l => bookIds.has(l.bookId));
    }

    const result = [];
    for (const loan of loans) {
      const book = await docClient.send(new GetCommand({TableName: booksTable,Key: { bookId: loan.bookId }}));
      result.push({ ...loan, book: book.Item });
    }

    result.sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
    res.json(result);

  } catch (error) {
    res.status(500).json({ message: "Ausleihen konnten nicht geladen werden." });
  }
});

//Autor: Ramona Buchbinder
//id, weil es sich um einen bestimmten Datensatz handelt
router.post("/:id/return", async (req, res) => {
  const { id } = req.params;

  try {
    const loanObject = await docClient.send(new GetCommand({ TableName: loansTable, Key: { loanId: id } }));
    const loan = loanObject.Item;

    if (loan.returnedAt) {
      return res.status(409).json({ message: "Dieses Buch wurde bereits zurückgegeben" });
    }

    await docClient.send(
      new UpdateCommand({TableName: loansTable, Key: { loanId: id },
        UpdateExpression: "SET returnedAt = :now", ExpressionAttributeValues: { ":now": new Date().toISOString() },
      })
    );

    const bookObject = await docClient.send(new GetCommand({ TableName: booksTable, Key: { bookId: loan.bookId } }));
    const book = bookObject.Item;

    await docClient.send(
      new UpdateCommand({
        TableName: booksTable, Key: { bookId: loan.bookId },
        UpdateExpression: "SET availableCopies = availableCopies + :one",
        ExpressionAttributeValues: { ":one": 1 }, //Platzhalter
      })
    );
    return res.json({ message: "Buch erfolgreich zurückgegeben." });
  
  } catch (error) {
    return res.status(500).json({ message: "Buch konnte nicht zurückgegeben werden." });
  }
});

export default router;
