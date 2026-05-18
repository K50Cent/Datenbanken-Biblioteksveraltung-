import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  GetCommand,
  PutCommand,
  ScanCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { docClient } from "./dynamodb.js";
import { verifyToken, requireAdmin } from "./auth.js";

const app = express();
const port = process.env.PORT || 3000;

const usersTable = process.env.USERS_TABLE || "Users";
const booksTable = process.env.BOOKS_TABLE || "Books";
const authorsTable = process.env.AUTHORS_TABLE || "Authors";
const bookAuthorsTable = process.env.BOOK_AUTHORS_TABLE || "BookAuthors";
const categoriesTable = process.env.CATEGORIES_TABLE || "Categories";
const loansTable = process.env.LOANS_TABLE || "Loans";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = path.join(__dirname, "..", "public");

app.use(express.json());
app.use(express.static(publicPath));

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

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
    createdAt: user.createdAt,
  };
}

async function scanAll(tableName, filterExpression, expressionValues, expressionNames) {
  const items = [];
  let lastKey;
  do {
    const params = { TableName: tableName, ExclusiveStartKey: lastKey };
    if (filterExpression) params.FilterExpression = filterExpression;
    if (expressionValues) params.ExpressionAttributeValues = expressionValues;
    if (expressionNames) params.ExpressionAttributeNames = expressionNames;
    const result = await docClient.send(new ScanCommand(params));
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function queryAll(tableName, indexName, keyCondition, expressionValues, expressionNames) {
  const items = [];
  let lastKey;
  do {
    const params = {
      TableName: tableName,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: expressionValues,
      ExclusiveStartKey: lastKey,
    };
    if (indexName) params.IndexName = indexName;
    if (expressionNames) params.ExpressionAttributeNames = expressionNames;
    const result = await docClient.send(new QueryCommand(params));
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

// ─── Bücher-Hilfsfunktionen ───────────────────────────────────────────────────

async function enrichBooksWithAuthorsAndAvailability(books) {
  if (!books.length) return [];

  const [allBookAuthors, allAuthors, allLoans] = await Promise.all([
    scanAll(bookAuthorsTable),
    scanAll(authorsTable),
    scanAll(loansTable),
  ]);
  const activeLoans = allLoans.filter((l) => !l.returnedAt);

  const authorMap = {};
  for (const a of allAuthors) authorMap[a.authorID || a.authorId] = a;

  const bookAuthorsMap = {};
  for (const ba of allBookAuthors) {
    if (!bookAuthorsMap[ba.bookId]) bookAuthorsMap[ba.bookId] = [];
    bookAuthorsMap[ba.bookId].push(ba.authorId);
  }

  const nextAvailableMap = {};
  for (const loan of activeLoans) {
    if (!loan.returnedAt) {
      const current = nextAvailableMap[loan.bookId];
      if (!current || loan.dueDate < current) {
        nextAvailableMap[loan.bookId] = loan.dueDate;
      }
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

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// ─── Auth ─────────────────────────────────────────────────────────────────────

app.post("/api/auth/login", async (req, res) => {
  const loginname = trimValue(req.body.loginname);
  const password = trimValue(req.body.password);

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
    return res.status(201).json({ user: toPublicUser(user), token: signToken(user) });
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      return res.status(409).json({ message: "Dieser Loginname ist schon vergeben." });
    }
    console.error("Registrierung fehlgeschlagen:", error);
    return res.status(500).json({ message: "Registrierung konnte nicht gespeichert werden." });
  }
});

// ─── Bücher ───────────────────────────────────────────────────────────────────

app.get("/api/books", async (req, res) => {
  const { category, search, author } = req.query;

  try {
    let books;
    if (category) {
      books = await queryAll(
        booksTable,
        "categoryId-index",
        "categoryId = :catId",
        { ":catId": category },
      );
    } else {
      books = await scanAll(booksTable);
    }

    const enriched = await enrichBooksWithAuthorsAndAvailability(books);

    let result = enriched;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (b) =>
          (b.title || "").toLowerCase().includes(q) ||
          b.authors.some(
            (a) =>
              (a.name || "").toLowerCase().includes(q) ||
              (a.firstname || "").toLowerCase().includes(q),
          ),
      );
    }

    if (author) {
      result = result.filter((b) => b.authors.some((a) => a.authorId === author));
    }

    return res.json(result);
  } catch (error) {
    console.error("Fehler beim Laden der Bücher:", error);
    return res.status(500).json({ message: "Bücher konnten nicht geladen werden." });
  }
});

app.post("/api/books", verifyToken, requireAdmin, async (req, res) => {
  const { title, isbn, year, categoryId, authorIds = [], availableCopies = 1, totalCopies } = req.body;

  if (!title || !isbn || !year) {
    return res.status(400).json({ message: "Titel, ISBN und Jahr sind Pflichtfelder." });
  }

  const copies = Number(availableCopies) || 1;
  const book = {
    bookId: crypto.randomUUID(),
    title: trimValue(title),
    isbn: trimValue(isbn),
    year: Number(year),
    categoryId: categoryId || "",
    availableCopies: copies,
    totalCopies: Number(totalCopies) || copies,
    createdAt: new Date().toISOString(),
  };

  try {
    await docClient.send(new PutCommand({ TableName: booksTable, Item: book }));

    for (const authorId of authorIds) {
      await docClient.send(
        new PutCommand({ TableName: bookAuthorsTable, Item: { bookId: book.bookId, authorId } }),
      );
    }

    return res.status(201).json({ message: "Buch erfolgreich angelegt.", book });
  } catch (error) {
    console.error("Fehler beim Anlegen des Buches:", error);
    return res.status(500).json({ message: "Buch konnte nicht gespeichert werden." });
  }
});

app.put("/api/books/:id", verifyToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { title, isbn, year, categoryId, authorIds = [], availableCopies, totalCopies } = req.body;

  if (!title || !isbn || !year) {
    return res.status(400).json({ message: "Titel, ISBN und Jahr sind Pflichtfelder." });
  }

  try {
    const existing = await docClient.send(new GetCommand({ TableName: booksTable, Key: { bookId: id } }));
    if (!existing.Item) {
      return res.status(404).json({ message: "Buch nicht gefunden." });
    }

    await docClient.send(
      new UpdateCommand({
        TableName: booksTable,
        Key: { bookId: id },
        UpdateExpression:
          "SET #title = :title, isbn = :isbn, #year = :year, categoryId = :categoryId, availableCopies = :available, totalCopies = :total",
        ExpressionAttributeNames: { "#title": "title", "#year": "year" },
        ExpressionAttributeValues: {
          ":title": trimValue(title),
          ":isbn": trimValue(isbn),
          ":year": Number(year),
          ":categoryId": categoryId || "",
          ":available": Number(availableCopies) ?? existing.Item.availableCopies,
          ":total": Number(totalCopies) ?? existing.Item.totalCopies,
        },
      }),
    );

    const oldAuthors = await queryAll(
      bookAuthorsTable,
      null,
      "bookId = :bookId",
      { ":bookId": id },
    );
    for (const ba of oldAuthors) {
      await docClient.send(
        new DeleteCommand({ TableName: bookAuthorsTable, Key: { bookId: ba.bookId, authorId: ba.authorId } }),
      );
    }

    for (const authorId of authorIds) {
      await docClient.send(
        new PutCommand({ TableName: bookAuthorsTable, Item: { bookId: id, authorId } }),
      );
    }

    return res.json({ message: "Buch erfolgreich aktualisiert." });
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Buches:", error);
    return res.status(500).json({ message: "Buch konnte nicht aktualisiert werden." });
  }
});

app.delete("/api/books/:id", verifyToken, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const existing = await docClient.send(new GetCommand({ TableName: booksTable, Key: { bookId: id } }));
    if (!existing.Item) {
      return res.status(404).json({ message: "Buch nicht gefunden." });
    }

    await docClient.send(new DeleteCommand({ TableName: booksTable, Key: { bookId: id } }));

    const bookAuthors = await queryAll(
      bookAuthorsTable,
      null,
      "bookId = :bookId",
      { ":bookId": id },
    );
    for (const ba of bookAuthors) {
      await docClient.send(
        new DeleteCommand({ TableName: bookAuthorsTable, Key: { bookId: ba.bookId, authorId: ba.authorId } }),
      );
    }

    return res.json({ message: "Buch erfolgreich gelöscht." });
  } catch (error) {
    console.error("Fehler beim Löschen des Buches:", error);
    return res.status(500).json({ message: "Buch konnte nicht gelöscht werden." });
  }
});

// ─── Autoren ──────────────────────────────────────────────────────────────────

app.get("/api/authors", async (_req, res) => {
  try {
    const authors = await scanAll(authorsTable);
    return res.json(authors);
  } catch (error) {
    console.error("Fehler beim Laden der Autoren:", error);
    return res.status(500).json({ message: "Autoren konnten nicht geladen werden." });
  }
});

app.post("/api/authors", verifyToken, requireAdmin, async (req, res) => {
  const name = trimValue(req.body.name);
  const firstname = trimValue(req.body.firstname);

  if (!name || !firstname) {
    return res.status(400).json({ message: "Name und Vorname sind Pflichtfelder." });
  }

  const author = {
    authorID: crypto.randomUUID(),
    name,
    firstname,
    createdAt: new Date().toISOString(),
  };

  try {
    await docClient.send(new PutCommand({ TableName: authorsTable, Item: author }));
    return res.status(201).json({ message: "Autor erfolgreich angelegt.", author });
  } catch (error) {
    console.error("Fehler beim Anlegen des Autors:", error);
    return res.status(500).json({ message: "Autor konnte nicht gespeichert werden." });
  }
});

// ─── Kategorien ───────────────────────────────────────────────────────────────

app.get("/api/categories", async (_req, res) => {
  try {
    const categories = await scanAll(categoriesTable);
    return res.json(categories);
  } catch (error) {
    console.error("Fehler beim Laden der Kategorien:", error);
    return res.status(500).json({ message: "Kategorien konnten nicht geladen werden." });
  }
});

app.post("/api/categories", verifyToken, requireAdmin, async (req, res) => {
  const name = trimValue(req.body.name);

  if (!name) {
    return res.status(400).json({ message: "Name ist ein Pflichtfeld." });
  }

  const category = {
    categoryId: crypto.randomUUID(),
    name,
  };

  try {
    await docClient.send(new PutCommand({ TableName: categoriesTable, Item: category }));
    return res.status(201).json({ message: "Kategorie erfolgreich angelegt.", category });
  } catch (error) {
    console.error("Fehler beim Anlegen der Kategorie:", error);
    return res.status(500).json({ message: "Kategorie konnte nicht gespeichert werden." });
  }
});

// ─── Ausleihen ────────────────────────────────────────────────────────────────

app.post("/api/loans", verifyToken, async (req, res) => {
  const bookId = trimValue(req.body.bookId);

  if (!bookId) {
    return res.status(400).json({ message: "bookId ist ein Pflichtfeld." });
  }

  try {
    const bookResult = await docClient.send(new GetCommand({ TableName: booksTable, Key: { bookId } }));
    if (!bookResult.Item) {
      return res.status(404).json({ message: "Buch nicht gefunden." });
    }

    const book = bookResult.Item;
    const hasNewSchema = book.availableCopies != null;

    if (hasNewSchema) {
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: booksTable,
            Key: { bookId },
            UpdateExpression: "SET availableCopies = availableCopies - :one",
            ConditionExpression: "availableCopies > :zero",
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
          TableName: booksTable,
          Key: { bookId },
          UpdateExpression: "SET available = :false",
          ExpressionAttributeValues: { ":false": false },
        }),
      );
    }

    const now = new Date();
    const dueDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const loan = {
      loanId: crypto.randomUUID(),
      userId: req.user.userId,
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

app.get("/api/loans/my", verifyToken, async (req, res) => {
  try {
    const loans = await queryAll(
      loansTable,
      "userId-index",
      "userId = :uid",
      { ":uid": req.user.userId },
    );

    const activeLoans = loans.filter((l) => !l.returnedAt);

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
    console.error("Fehler beim Laden der eigenen Ausleihen:", error);
    return res.status(500).json({ message: "Ausleihen konnten nicht geladen werden." });
  }
});

app.post("/api/loans/:id/return", verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    const loanResult = await docClient.send(
      new GetCommand({ TableName: loansTable, Key: { loanId: id } }),
    );

    const loan = loanResult.Item;
    if (!loan) {
      return res.status(404).json({ message: "Ausleihe nicht gefunden." });
    }
    if (loan.userId !== req.user.userId) {
      return res.status(403).json({ message: "Diese Ausleihe gehört nicht zu deinem Konto." });
    }
    if (loan.returnedAt) {
      return res.status(409).json({ message: "Dieses Buch wurde bereits zurückgegeben." });
    }

    const now = new Date().toISOString();
    await docClient.send(
      new UpdateCommand({
        TableName: loansTable,
        Key: { loanId: id },
        UpdateExpression: "SET returnedAt = :now",
        ExpressionAttributeValues: { ":now": now },
      }),
    );

    const returnedBook = await docClient.send(
      new GetCommand({ TableName: booksTable, Key: { bookId: loan.bookId } }),
    );
    if (returnedBook.Item?.availableCopies != null) {
      await docClient.send(
        new UpdateCommand({
          TableName: booksTable,
          Key: { bookId: loan.bookId },
          UpdateExpression: "SET availableCopies = availableCopies + :one",
          ExpressionAttributeValues: { ":one": 1 },
        }),
      );
    } else {
      await docClient.send(
        new UpdateCommand({
          TableName: booksTable,
          Key: { bookId: loan.bookId },
          UpdateExpression: "SET available = :true",
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

app.get("/api/loans/book/:bookId", async (req, res) => {
  const { bookId } = req.params;

  try {
    const bookResult = await docClient.send(new GetCommand({ TableName: booksTable, Key: { bookId } }));
    if (!bookResult.Item) {
      return res.status(404).json({ message: "Buch nicht gefunden." });
    }

    const book = bookResult.Item;
    const available = book.availableCopies > 0;

    if (available) {
      return res.json({ available: true, nextAvailable: null });
    }

    const loans = await queryAll(
      loansTable,
      "bookId-index",
      "bookId = :bid",
      { ":bid": bookId },
    );

    const activeLoans = loans.filter((l) => !l.returnedAt);
    const nextAvailable =
      activeLoans.length > 0
        ? activeLoans.reduce((min, l) => (l.dueDate < min ? l.dueDate : min), activeLoans[0].dueDate)
        : null;

    return res.json({ available: false, nextAvailable });
  } catch (error) {
    console.error("Fehler beim Prüfen der Verfügbarkeit:", error);
    return res.status(500).json({ message: "Verfügbarkeit konnte nicht geprüft werden." });
  }
});

// ─── Admin ────────────────────────────────────────────────────────────────────

app.get("/api/admin/loans", verifyToken, requireAdmin, async (req, res) => {
  try {
    const allLoans = await scanAll(loansTable);
    const activeLoans = allLoans.filter((l) => !l.returnedAt);

    const userIds = [...new Set(activeLoans.map((l) => l.userId))];
    const bookIds = [...new Set(activeLoans.map((l) => l.bookId))];

    const [allUsers, allBooks] = await Promise.all([
      scanAll(usersTable),
      scanAll(booksTable),
    ]);

    const userMap = {};
    for (const u of allUsers) userMap[u.userId] = u;

    const bookMap = {};
    for (const b of allBooks) bookMap[b.bookId] = b;

    const enriched = activeLoans.map((loan) => ({
      loanId: loan.loanId,
      userId: loan.userId,
      username: userMap[loan.userId]?.username || "Unbekannt",
      bookId: loan.bookId,
      title: bookMap[loan.bookId]?.title || "Unbekanntes Buch",
      borrowedAt: loan.borrowedAt,
      dueDate: loan.dueDate,
    }));

    enriched.sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));

    return res.json(enriched);
  } catch (error) {
    console.error("Fehler beim Laden aller Ausleihen:", error);
    return res.status(500).json({ message: "Ausleihen konnten nicht geladen werden." });
  }
});

app.get("/api/admin/users", verifyToken, requireAdmin, async (req, res) => {
  try {
    const users = await scanAll(usersTable);
    return res.json(users.map(toPublicUser));
  } catch (error) {
    console.error("Fehler beim Laden der Benutzer:", error);
    return res.status(500).json({ message: "Benutzer konnten nicht geladen werden." });
  }
});

app.get("/api/admin/stats", verifyToken, requireAdmin, async (req, res) => {
  try {
    const [books, loans, users] = await Promise.all([
      scanAll(booksTable),
      scanAll(loansTable),
      scanAll(usersTable),
    ]);

    return res.json({
      totalBooks: books.length,
      totalLoans: loans.length,
      activeLoans: loans.filter((l) => !l.returnedAt).length,
      totalUsers: users.length,
    });
  } catch (error) {
    console.error("Fehler beim Laden der Statistiken:", error);
    return res.status(500).json({ message: "Statistiken konnten nicht geladen werden." });
  }
});

// ─── Empfehlungen ─────────────────────────────────────────────────────────────

app.get("/api/recommendations", verifyToken, async (req, res) => {
  try {
    const userLoans = await queryAll(
      loansTable,
      "userId-index",
      "userId = :uid",
      { ":uid": req.user.userId },
    );

    if (!userLoans.length) {
      return res.json([]);
    }

    const borrowedBookIds = [...new Set(userLoans.map((l) => l.bookId))];

    const borrowedBooks = await Promise.all(
      borrowedBookIds.map((bookId) =>
        docClient.send(new GetCommand({ TableName: booksTable, Key: { bookId } })),
      ),
    );

    const categoryIds = [
      ...new Set(borrowedBooks.map((r) => r.Item?.categoryId).filter(Boolean)),
    ];

    if (!categoryIds.length) {
      return res.json([]);
    }

    const booksByCategory = await Promise.all(
      categoryIds.map((catId) =>
        queryAll(booksTable, "categoryId-index", "categoryId = :catId", { ":catId": catId }),
      ),
    );

    const allCandidates = booksByCategory.flat();
    const seen = new Set();
    const unique = allCandidates.filter((b) => {
      if (seen.has(b.bookId) || borrowedBookIds.includes(b.bookId)) return false;
      seen.add(b.bookId);
      return true;
    });

    const enriched = await enrichBooksWithAuthorsAndAvailability(unique.slice(0, 12));

    return res.json(enriched.slice(0, 6));
  } catch (error) {
    console.error("Fehler beim Laden der Empfehlungen:", error);
    return res.status(500).json({ message: "Empfehlungen konnten nicht geladen werden." });
  }
});

// ─── Server ───────────────────────────────────────────────────────────────────

app.listen(port, () => {
  console.log(`Bibliotheksverwaltung läuft unter http://localhost:${port}`);
});
