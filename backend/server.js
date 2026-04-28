import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { docClient, tableName, tableNames } from "./dynamodb.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "..", "dist");

app.use(cors());
app.use(express.json({ limit: "2mb" }));

function trimValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function usernameKey(value) {
  return trimValue(value).toLowerCase();
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function toPublicUser(user) {
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    balance: Number(user.balance || 0),
  };
}

function signToken(user) {
  const payload = {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    balance: Number(user.balance || 0),
    exp: Date.now() + 1000 * 60 * 60 * 8,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", process.env.AUTH_SECRET || "local-library-secret")
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

function verifyToken(token) {
  const [encodedPayload, signature] = String(token || "").split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = crypto
    .createHmac("sha256", process.env.AUTH_SECRET || "local-library-secret")
    .update(encodedPayload)
    .digest("base64url");

  if (signature.length !== expectedSignature.length) {
    return null;
  }

  if (
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    )
  ) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));

  if (!payload.exp || payload.exp < Date.now()) {
    return null;
  }

  return payload;
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const user = verifyToken(token);

  if (!user) {
    return res.status(401).json({ message: "Bitte zuerst anmelden." });
  }

  req.user = user;
  next();
}

function canManageBook(user, book) {
  return user.role === "admin" || book.ownerId === user.userId;
}

function toBookResponse(book) {
  return {
    bookId: book.bookId,
    title: book.title,
    author: book.author,
    isbn: book.isbn || "",
    year: book.year || "",
    category: book.category || "",
    categoryId: book.categoryId || "",
    available: book.available !== false,
    borrowerName: book.borrowerName || "",
    borrowedAt: book.borrowedAt || "",
    averageRating: Number(book.averageRating || 0),
    reviewIds: book.reviewIds || [],
    ratingsCount: Number(book.ratingsCount || book.reviewIds?.length || 0),
    ownerId: book.ownerId || "",
    ownerName: book.ownerName || "Unbekannt",
    imageData: book.imageData || "",
    createdAt: book.createdAt || "",
  };
}

function normalizeBookInput(body) {
  const input = body || {};
  const title = trimValue(input.title);
  const author = trimValue(input.author);

  if (!title || !author) {
    const error = new Error("Titel und Autor sind Pflichtfelder.");
    error.statusCode = 400;
    throw error;
  }

  return {
    title,
    author,
    isbn: trimValue(input.isbn),
    year: trimValue(input.year),
    category: trimValue(input.category),
    categoryId: trimValue(input.categoryId),
    imageData: typeof input.imageData === "string" ? input.imageData : "",
  };
}

function normalizeRating(value) {
  const rating = Number(value);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    const error = new Error("Bewertung muss zwischen 1 und 5 Sternen liegen.");
    error.statusCode = 400;
    throw error;
  }

  return rating;
}

async function scanTable(name) {
  const result = await docClient.send(new ScanCommand({ TableName: name }));
  return result.Items || [];
}

async function getBookOrThrow(bookId) {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { bookId },
    }),
  );

  if (!result.Item) {
    const error = new Error("Buch wurde nicht gefunden.");
    error.statusCode = 404;
    throw error;
  }

  return result.Item;
}

async function getUser(username) {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableNames.users,
      Key: { usernameKey: usernameKey(username) },
    }),
  );

  return result.Item;
}

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const username = trimValue(req.body.username);
    const displayName = trimValue(req.body.displayName) || username;
    const password = trimValue(req.body.password);

    if (username.length < 3 || password.length < 4) {
      return res.status(400).json({
        message: "Benutzername mindestens 3 Zeichen, Passwort mindestens 4 Zeichen.",
      });
    }

    if (usernameKey(username) === "admin") {
      return res.status(409).json({
        message: "Der Benutzername Admin ist reserviert.",
      });
    }

    const user = {
      usernameKey: usernameKey(username),
      userId: crypto.randomUUID(),
      username,
      displayName,
      role: "user",
      balance: 0,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };

    await docClient.send(
      new PutCommand({
        TableName: tableNames.users,
        Item: user,
        ConditionExpression: "attribute_not_exists(usernameKey)",
      }),
    );

    await docClient.send(
      new PutCommand({
        TableName: tableNames.members,
        Item: {
          memberId: user.userId,
          firstName: displayName,
          lastName: "",
          email: "",
          role: "Benutzer",
          balance: 0,
          activeLoanIds: [],
          createdAt: user.createdAt,
        },
      }),
    );

    res.status(201).json({
      user: toPublicUser(user),
      token: signToken(user),
    });
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      return res.status(409).json({ message: "Benutzername ist bereits vergeben." });
    }

    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const user = await getUser(req.body.username);

    if (!user || user.passwordHash !== hashPassword(req.body.password || "")) {
      return res.status(401).json({ message: "Benutzername oder Passwort ist falsch." });
    }

    res.json({
      user: toPublicUser(user),
      token: signToken(user),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", requireAuth, async (req, res, next) => {
  try {
    const user = await getUser(req.user.username);
    res.json({ user: toPublicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/profile", requireAuth, async (req, res, next) => {
  try {
    const displayName = trimValue(req.body.displayName);

    if (displayName.length < 2) {
      return res.status(400).json({
        message: "Der Anzeigename muss mindestens 2 Zeichen lang sein.",
      });
    }

    await docClient.send(
      new UpdateCommand({
        TableName: tableNames.users,
        Key: { usernameKey: usernameKey(req.user.username) },
        UpdateExpression: "SET displayName = :displayName",
        ExpressionAttributeValues: {
          ":displayName": displayName,
        },
      }),
    );

    const books = await scanTable(tableName);
    const ownBooks = books.filter((book) => book.ownerId === req.user.userId);

    await Promise.all(
      [
        ...ownBooks.map((book) =>
          docClient.send(
            new UpdateCommand({
              TableName: tableName,
              Key: { bookId: book.bookId },
              UpdateExpression: "SET ownerName = :ownerName",
              ExpressionAttributeValues: {
                ":ownerName": displayName,
              },
            }),
          ),
        ),
        docClient.send(
          new UpdateCommand({
            TableName: tableNames.members,
            Key: { memberId: req.user.userId },
            UpdateExpression: "SET firstName = :firstName",
            ExpressionAttributeValues: {
              ":firstName": displayName,
            },
          }),
        ).catch((error) => {
          if (error.name !== "ResourceNotFoundException") {
            throw error;
          }
        }),
      ],
    );

    const updatedUser = await getUser(req.user.username);

    res.json({
      user: toPublicUser(updatedUser),
      token: signToken(updatedUser),
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/profile/password", requireAuth, async (req, res, next) => {
  try {
    const currentPassword = trimValue(req.body.currentPassword);
    const newPassword = trimValue(req.body.newPassword);
    const user = await getUser(req.user.username);

    if (user.passwordHash !== hashPassword(currentPassword)) {
      return res.status(401).json({ message: "Das aktuelle Passwort ist falsch." });
    }

    if (newPassword.length < 4) {
      return res.status(400).json({
        message: "Das neue Passwort muss mindestens 4 Zeichen lang sein.",
      });
    }

    await docClient.send(
      new UpdateCommand({
        TableName: tableNames.users,
        Key: { usernameKey: usernameKey(req.user.username) },
        UpdateExpression: "SET passwordHash = :passwordHash",
        ExpressionAttributeValues: {
          ":passwordHash": hashPassword(newPassword),
        },
      }),
    );

    res.json({ message: "Passwort wurde geändert." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/profile/deposit", requireAuth, async (req, res, next) => {
  try {
    const amount = Number(req.body.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        message: "Der Einzahlungsbetrag muss groesser als 0 sein.",
      });
    }

    const roundedAmount = Math.round(amount * 100) / 100;

    await docClient.send(
      new UpdateCommand({
        TableName: tableNames.users,
        Key: { usernameKey: usernameKey(req.user.username) },
        UpdateExpression: "ADD #balance :amount",
        ExpressionAttributeNames: {
          "#balance": "balance",
        },
        ExpressionAttributeValues: {
          ":amount": roundedAmount,
        },
      }),
    );

    await docClient.send(
      new PutCommand({
        TableName: tableNames.payments,
        Item: {
          paymentId: crypto.randomUUID(),
          userId: req.user.userId,
          memberId: req.user.userId,
          type: "deposit",
          amount: roundedAmount,
          reason: "Geld eingezahlt",
          createdAt: new Date().toISOString(),
        },
      }),
    );

    await docClient.send(
      new UpdateCommand({
        TableName: tableNames.members,
        Key: { memberId: req.user.userId },
        UpdateExpression: "ADD #balance :amount",
        ExpressionAttributeNames: {
          "#balance": "balance",
        },
        ExpressionAttributeValues: {
          ":amount": roundedAmount,
        },
      }),
    ).catch((error) => {
      if (error.name !== "ResourceNotFoundException") {
        throw error;
      }
    });

    const updatedUser = await getUser(req.user.username);

    res.json({
      user: toPublicUser(updatedUser),
      token: signToken(updatedUser),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/health", async (req, res, next) => {
  try {
    const books = await scanTable(tableNames.books);
    res.json({
      ok: true,
      endpoint: process.env.DYNAMODB_ENDPOINT || "http://localhost:8000",
      books: books.length,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/books", requireAuth, async (req, res, next) => {
  try {
    const books = (await scanTable(tableNames.books))
      .map(toBookResponse)
      .sort((a, b) => a.title.localeCompare(b.title, "de"));

    res.json(books);
  } catch (error) {
    next(error);
  }
});

app.get("/api/books/:bookId", requireAuth, async (req, res, next) => {
  try {
    const book = await getBookOrThrow(req.params.bookId);
    res.json(toBookResponse(book));
  } catch (error) {
    next(error);
  }
});

app.post("/api/books", requireAuth, async (req, res, next) => {
  try {
    const bookInput = normalizeBookInput(req.body);
    const book = {
      bookId: crypto.randomUUID(),
      ...bookInput,
      available: true,
      borrowerName: "",
      borrowedAt: "",
      averageRating: 0,
      reviewIds: [],
      ratingsCount: 0,
      imageData: bookInput.imageData,
      ownerId: req.user.userId,
      ownerName: req.user.displayName,
      createdAt: new Date().toISOString(),
    };

    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: book,
      }),
    );

    res.status(201).json(toBookResponse(book));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/books/:bookId", requireAuth, async (req, res, next) => {
  try {
    const existingBook = await getBookOrThrow(req.params.bookId);

    if (!canManageBook(req.user, existingBook)) {
      return res.status(403).json({
        message: "Du darfst nur eigene Bücher bearbeiten. Admin darf alle Bücher bearbeiten.",
      });
    }

    const bookInput = normalizeBookInput(req.body);
    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { bookId: req.params.bookId },
        UpdateExpression:
          "SET title = :title, author = :author, isbn = :isbn, #year = :year, category = :category, categoryId = :categoryId, imageData = :imageData",
        ExpressionAttributeNames: {
          "#year": "year",
        },
        ExpressionAttributeValues: {
          ":title": bookInput.title,
          ":author": bookInput.author,
          ":isbn": bookInput.isbn,
          ":year": bookInput.year,
          ":category": bookInput.category,
          ":categoryId": bookInput.categoryId,
          ":imageData": bookInput.imageData,
        },
      }),
    );

    const updatedBook = await getBookOrThrow(req.params.bookId);
    res.json(toBookResponse(updatedBook));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/books/:bookId/borrow", requireAuth, async (req, res, next) => {
  try {
    const borrowerName = trimValue(req.body.borrowerName) || req.user.displayName;

    if (!borrowerName) {
      return res
        .status(400)
        .json({ message: "Name der ausleihenden Person ist erforderlich." });
    }

    await getBookOrThrow(req.params.bookId);

    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { bookId: req.params.bookId },
        UpdateExpression:
          "SET available = :available, borrowerName = :borrowerName, borrowedAt = :borrowedAt",
        ConditionExpression: "available = :isAvailable",
        ExpressionAttributeValues: {
          ":available": false,
          ":isAvailable": true,
          ":borrowerName": borrowerName,
          ":borrowedAt": new Date().toISOString(),
        },
      }),
    );

    const updatedBook = await getBookOrThrow(req.params.bookId);
    res.json(toBookResponse(updatedBook));
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      return res.status(409).json({
        message: "Dieses Buch ist bereits ausgeliehen.",
      });
    }

    next(error);
  }
});

app.patch("/api/books/:bookId/return", requireAuth, async (req, res, next) => {
  try {
    const book = await getBookOrThrow(req.params.bookId);

    if (
      req.user.role !== "admin" &&
      book.ownerId !== req.user.userId &&
      book.borrowerName !== req.user.displayName
    ) {
      return res.status(403).json({
        message: "Nur Admin, Anbieter oder ausleihende Person darf zurückgeben.",
      });
    }

    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { bookId: req.params.bookId },
        UpdateExpression:
          "SET available = :available, borrowerName = :borrowerName, borrowedAt = :borrowedAt",
        ExpressionAttributeValues: {
          ":available": true,
          ":borrowerName": "",
          ":borrowedAt": "",
        },
      }),
    );

    const updatedBook = await getBookOrThrow(req.params.bookId);
    res.json(toBookResponse(updatedBook));
  } catch (error) {
    next(error);
  }
});

app.post("/api/books/:bookId/rate", requireAuth, async (req, res, next) => {
  try {
    const book = await getBookOrThrow(req.params.bookId);
    const rating = normalizeRating(req.body.rating);
    const comment = trimValue(req.body.comment);
    const review = {
      reviewId: crypto.randomUUID(),
      bookId: book.bookId,
      userId: req.user.userId,
      reviewerName: req.user.displayName,
      rating,
      comment,
      createdAt: new Date().toISOString(),
    };

    await docClient.send(
      new PutCommand({
        TableName: tableNames.reviews,
        Item: review,
      }),
    );

    const reviews = await scanTable(tableNames.reviews);
    const bookReviews = reviews.filter((item) => item.bookId === book.bookId);
    const averageRating =
      bookReviews.reduce((sum, item) => sum + Number(item.rating || 0), 0) /
      bookReviews.length;
    const reviewIds = bookReviews.map((item) => item.reviewId);

    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { bookId: book.bookId },
        UpdateExpression:
          "SET averageRating = :averageRating, ratingsCount = :ratingsCount, reviewIds = :reviewIds",
        ExpressionAttributeValues: {
          ":averageRating": Number(averageRating.toFixed(2)),
          ":ratingsCount": bookReviews.length,
          ":reviewIds": reviewIds,
        },
      }),
    );

    const updatedBook = await getBookOrThrow(book.bookId);
    res.status(201).json({
      book: toBookResponse(updatedBook),
      review,
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/books/:bookId", requireAuth, async (req, res, next) => {
  try {
    const book = await getBookOrThrow(req.params.bookId);

    if (!canManageBook(req.user, book)) {
      return res.status(403).json({
        message: "Du darfst nur eigene Bücher löschen. Admin darf alle Bücher löschen.",
      });
    }

    await docClient.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { bookId: req.params.bookId },
      }),
    );

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.get("/api/library", requireAuth, async (req, res, next) => {
  try {
    const [books, members, loans, reviews, categories, payments, currentUser] =
      await Promise.all([
        scanTable(tableNames.books),
        scanTable(tableNames.members),
        scanTable(tableNames.loans),
        scanTable(tableNames.reviews),
        scanTable(tableNames.categories),
        scanTable(tableNames.payments),
        getUser(req.user.username),
      ]);

    const normalizedBooks = books.map(toBookResponse);
    const borrowedBooks = normalizedBooks.filter((book) => !book.available);
    const availableBooks = normalizedBooks.length - borrowedBooks.length;
    const itBooks = normalizedBooks.filter(
      (book) => book.category === "Informatik",
    );
    const avgInformatikRating = itBooks.length
      ? itBooks.reduce((sum, book) => sum + Number(book.averageRating || 0), 0) /
        itBooks.length
      : 0;
    const feeSum = payments
      .filter((payment) => payment.type === "fee")
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

    res.json({
      books: normalizedBooks.sort((a, b) => a.title.localeCompare(b.title, "de")),
      members,
      loans,
      reviews,
      categories,
      payments,
      stats: {
        totalBooks: normalizedBooks.length,
        availableBooks,
        borrowedBooks: borrowedBooks.length,
        members: members.length,
        activeLoans: loans.filter((loan) => loan.status === "active").length,
        overdueLoans: loans.filter((loan) => loan.status === "overdue").length,
        avgInformatikRating: Number(avgInformatikRating.toFixed(2)),
        feeSum,
      },
      chainExample: {
        memberId: "member-kjell",
        loanId: "loan-001",
        bookId: "book-clean-code",
        categoryId: "cat-it",
      },
      currentUser: toPublicUser(currentUser),
    });
  } catch (error) {
    next(error);
  }
});

app.use(express.static(distPath));

app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.use((error, req, res, next) => {
  console.error(error);

  const missingTable =
    error.name === "ResourceNotFoundException" ||
    error.message?.includes("Cannot do operations on a non-existent table");

  if (missingTable) {
    return res.status(500).json({
      message:
        "Die DynamoDB-Tabellen fehlen. Bitte `npm run create-tables` und `npm run seed` ausfuehren.",
    });
  }

  res.status(error.statusCode || 500).json({
    message: error.message || "Interner Serverfehler.",
  });
});

app.listen(port, () => {
  console.log(`Backend laeuft auf http://localhost:${port}`);
});
