/**
 * app.js
 * Frontend-Logik für die Bibliotheksverwaltung (Single-Page, kein Login).
 * Kommuniziert mit der Backend-API über fetch().
 *
 * Sektionen:
 *   - Empfehlungen     → GET /api/books/recommendations
 *   - Bücher browsen   → GET /api/books
 *   - Aktive Ausleihen → GET /api/loans
 *   - Admin-Bereich    → CRUD Bücher, Autoren, Kategorien
 */

"use strict";

let CURRENT_USER_ID = null;



let allCategories = [];
let allAuthors = [];

// ─── API-Hilfsfunktion ──────────────────────────────────────────────────────

/**
 * Führt einen API-Request aus und gibt die JSON-Antwort zurück.
 * Wirft einen Fehler mit dem Server-Fehlermeldungstext bei HTTP-Fehlern.
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 */
async function apiFetch(url, options = {}) {
  const defaults = {
    headers: { "Content-Type": "application/json" },
  };
  const res = await fetch(url, { ...defaults, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

// ─── Toast-Benachrichtigungen ────────────────────────────────────────────────

/**
 * Zeigt eine kurze Toast-Benachrichtigung am unteren Bildschirmrand.
 * @param {string} msg  - Nachrichtentext
 * @param {"success"|"error"|"info"} [type="info"]
 */
function showToast(msg, type = "info") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `message message-${type}`;
  toast.style.cssText = "margin-top:8px;";
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

/**
 * Zeigt eine Inline-Nachricht in einem Formular-Feedback-Element.
 * @param {string} elId - Element-ID
 * @param {string} msg
 * @param {"success"|"error"} type
 */
function showFormMsg(elId, msg, type) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.className = `message message-${type}`;
  el.textContent = msg;
}

// ─── Datum-Formatierung ─────────────────────────────────────────────────────

/**
 * Formatiert ein ISO-Datum als deutsches Datum (DD.MM.YYYY).
 * @param {string} iso
 * @returns {string}
 */
function formatDate(iso) {
  if (!iso) return "–";
  return new Date(iso).toLocaleDateString("de-DE");
}

// ─── Buchkarte ──────────────────────────────────────────────────────────────

/**
 * Erstellt das HTML für eine Buchkarte.
 * Zeigt Titel, Autoren, Kategorie, ISBN, Jahr, Verfügbarkeit und Ausleihen-Button.
 * @param {object} book
 * @param {boolean} [showLoanCount=false] - Zeigt die Ausleih-Häufigkeit an (Empfehlungen)
 * @returns {string} HTML-String
 */
function bookCardHTML(book, showLoanCount = false) {
  // Autoren: alle aus book.authors[], Fallback auf book.author
  let authorText = " ";
  if (book.authors && book.authors.length > 0) {
    authorText = book.authors
      .map(a => `${a.firstname || ""} ${a.name || ""}`)
      .join(", ");
  } else if (book.author) {
    authorText = book.author;
  }

  // Verfügbarkeits-Badge
  // Verfügbarkeit bestimmen
  let isAvailable;

  if (book.availableCopies != null) {
    isAvailable = book.availableCopies > 0;
  } else {
    isAvailable = book.available !== false;
  }

  // Badge erzeugen
  let availBadge;

  if (book.availableCopies == null) {
    // Altes Modell ohne Kopienzahl
    availBadge = `<span>${isAvailable ? "Verfügbar" : "Ausgeliehen"}</span>`;
  } else {
    // Neues Modell mit Kopienzahl
    if (isAvailable) {
      availBadge = `<span>Verfügbar ${book.availableCopies}/${book.totalCopies ?? book.availableCopies}</span>`;
    } else {
      const freeDate = book.nextAvailable
      ? ` – frei ab ${formatDate(book.nextAvailable)}`
      : "";
      availBadge = `<span>Ausgeliehen${freeDate}</span>`;
    }
  }

  let loanCountBadge = "";
  if (showLoanCount && book.loanCount != null) {
    loanCountBadge = ` – ${book.loanCount}× ausgeliehen`;
  }

  const categoryText = getCategoryName(book.categoryId);

  return `
    <div class="book-card">
      <div class="book-card-title">${escHtml(book.title)}${loanCountBadge}</div>
      <div class="book-card-meta">
        <div>Autor: ${escHtml(authorText)}</div>
        <div>Kategorie: ${escHtml(categoryText)}</div>
        <div>ISBN: ${escHtml(book.isbn || "–")}</div>
        <div>Jahr: ${book.year || "–"}</div>
      </div>
      <div class="book-card-footer">
        ${availBadge}
        <button class="btn-sm" onclick="borrowBook('${book.bookId}')" ${isAvailable ? "" : "disabled"}>Ausleihen</button>
      </div>
    </div>`;
}

/**
 * Escaped HTML-Sonderzeichen zur XSS-Prävention.
 * @param {string} str
 * @returns {string}
 */
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Empfehlungen ────────────────────────────────────────────────────────────

/**
 * Lädt die Empfehlungen (Top-5-Bücher der meistausgeliehenen Kategorie)
 * und zeigt sie in der Empfehlungs-Sektion an.
 */
async function loadRecommendations() {
  const recBooks = document.getElementById("recBooks");
  const recName  = document.getElementById("recCategoryName");

  try {
    // personalisierte Empfehlung laden
    const data = await apiFetch(`/api/books/recommendations/${CURRENT_USER_ID}`);

    recName.textContent = data.categoryName || "Keine Kategorie";

    if (!data.books || data.books.length === 0) {
      recBooks.innerHTML = "<p>Noch keine Empfehlungen vorhanden.</p>";
      return;
    }

    recBooks.innerHTML = data.books
      .map(b => bookCardHTML(b, true))
      .join("");

  } catch (err) {
    recBooks.innerHTML = "<p>Empfehlungen konnten nicht geladen werden.</p>";
    console.error(err);
  }
}


// ─── Bücher browsen ──────────────────────────────────────────────────────────

/**
 * Lädt Bücher gefiltert nach Suchtext und Kategorie
 * und zeigt sie im Bücher-Raster an.
 */
async function loadBooks() {
  const search = document.getElementById("searchInput").value.trim();
  const category = document.getElementById("categoryFilter").value;
  const booksList = document.getElementById("booksList");

  booksList.textContent = "Bücher werden geladen…";

  let url = "/api/books?";
  if (search) url += "search=" + search + "&";
  if (category) url += "category=" + category;

  try {
    const books = await apiFetch(url);

    if (!books.length) {
      booksList.textContent = "Keine Bücher gefunden.";
      return;
    }

    let html = "";
    for (const b of books) {
      html += bookCardHTML(b);
    }
    booksList.innerHTML = html;

  } catch {
    booksList.textContent = "Fehler beim Laden.";
  }
}


// ─── Kategorien-Dropdown befüllen ─────────────────────────────────────────────

/**
 * Lädt alle Kategorien und füllt alle Kategorie-Dropdowns auf der Seite.
 */
async function loadCategories() {
  try {
    const cats = await apiFetch("/api/categories");
    allCategories = cats;

    const filterSel = document.getElementById("categoryFilter");
    const bookCatSel = document.getElementById("bookCategory");

    cats.sort((a, b) => a.name.localeCompare(b.name));

    for (let c of cats) {
      const opt = new Option(c.name, c.categoryId);
      filterSel.add(new Option(c.name, c.categoryId));
      bookCatSel.add(new Option(c.name, c.categoryId));
    }

    renderAdminCategories();
  } catch (e) {
    console.error("Fehler beim Laden der Kategorien");
  }
}


/**
 * Gibt den Kategorienamen zur übergebenen ID zurück.
 * @param {string} categoryId
 * @returns {string}
 */
function getCategoryName(categoryId) {
  if (!categoryId) return "Unbekannte Kategorie";

  const category = allCategories.find(c => c.categoryId === categoryId);
  if (category) return category.name;

  return "Unbekannte Kategorie";
}

// ─── Autoren-Dropdown befüllen ────────────────────────────────────────────────

/**
 * Lädt alle Autoren und füllt das Autoren-Mehrfachauswahl-Dropdown im Admin-Bereich.
 */
async function loadAuthorsDropdown() {
  try {
    const authors = await apiFetch("/api/authors");
    allAuthors = authors;

    const sel = document.getElementById("bookAuthors");
    sel.innerHTML = "";

    authors.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    for (let a of authors) {
      const full = ((a.firstname || "") + " " + (a.name || ""));
      sel.add(new Option(full, a.authorId || a.authorID));
    }

  } catch (e) {
    console.error("Fehler beim Laden der Autoren");
  }
}

// ─── Aktive Ausleihen ─────────────────────────────────────────────────────────

/**
 * Lädt aktive Ausleihen, optional gefiltert nach Autorname.
 * Nutzt die Vierer-Kette: Loans → Books → BookAuthors → Authors.
 */
async function loadAllLoans() {
  const content = document.getElementById("loansContent");
  const authorQuery = document.getElementById("loansAuthorSearch")?.value.trim() || "";
  const url = authorQuery ? `/api/loans?author=${encodeURIComponent(authorQuery)}` : "/api/loans";

  try {
    const loans = await apiFetch(url);

    if (!loans.length) {
      content.innerHTML = "Derzeit keine aktiven Ausleihen.";
      return;
    }

    const now = Date.now();
    let html = "";

    for (let loan of loans) {
      const due = new Date(loan.dueDate);
      const overdue = due < now;

      html += `
        <div class="loan-item${overdue ? " overdue" : ""}">
          <div>
            <div class="loan-item-title">
              ${escHtml(loan.book?.title)}
            </div>
            <div class="loan-item-due${overdue ? " overdue-text" : ""}">
              Fällig: ${formatDate(loan.dueDate)}${overdue ? " – ÜBERFÄLLIG" : ""}
            </div>
            <div style="font-size:13px;color:#667786">
              Ausgeliehen: ${formatDate(loan.borrowedAt)}
            </div>
          </div>
          <div>
            <button class="btn-sm btn-outline" onclick="returnBook('${loan.loanId}')">Zurückgeben</button>
          </div>
        </div>
      `;
    }

    content.innerHTML = `<div class="loans-list">${html}</div>`;

  } catch (e) {
    content.innerHTML = "Ausleihen konnten nicht geladen werden.";
    console.error(e);
  }
}
/**
 * Leiht ein Buch aus und aktualisiert die Ansicht.
 * @param {string} bookId
 */
async function borrowBook(bookId) {
  try {
    await apiFetch("/api/loans", {
      method: "POST",
      body: JSON.stringify({ bookId, userId: CURRENT_USER_ID })
    });
    showToast("Buch erfolgreich ausgeliehen!", "success");
    loadBooks();
    loadAllLoans();
    loadRecommendations();

  } catch (e) {
    showToast("Ausleihe fehlgeschlagen.", "error");
  }
}


// ─── Buch zurückgeben ─────────────────────────────────────────────────────────

/**
 * Gibt ein ausgeliehenes Buch zurück und aktualisiert die Ansicht.
 * @param {string} loanId
 */
async function returnBook(loanId) {
  try {
    await apiFetch(`/api/loans/${loanId}/return`, {
      method: "POST"
    });

    showToast("Buch erfolgreich zurückgegeben.", "success");

    loadBooks();
    loadAllLoans();
    loadRecommendations();

  } catch (e) {
    showToast("Rückgabe fehlgeschlagen.", "error");
  }
}


// ─── Admin: Buch-Formular ─────────────────────────────────────────────────────

/**
 * Füllt das Buch-Formular zum Bearbeiten eines vorhandenen Buches vor.
 * @param {object} book
 */
function editBook(book) {
  document.getElementById("editBookId").value = book.bookId;
  document.getElementById("bookTitle").value  = book.title || "";
  document.getElementById("bookIsbn").value   = book.isbn  || "";
  document.getElementById("bookYear").value   = book.year  || "";
  document.getElementById("bookTotal").value  = book.totalCopies ?? 1;

  // Kategorie setzen
  const catSel = document.getElementById("bookCategory");
  for (let opt of catSel.options) {
    opt.selected = opt.value === (book.categoryId || "");
  }

  // Autoren setzen
  const authorIds = (book.authors || []).map(a => a.authorId);
  const authSel = document.getElementById("bookAuthors");
  for (let opt of authSel.options) {
    opt.selected = authorIds.includes(opt.value);
  }

  document.getElementById("adminSection").open = true;
  activateAdminTab("adminBooks");
  document.getElementById("bookTitle").focus();
}


/** Setzt das Buch-Formular zurück. */
function resetBookForm() {
  document.getElementById("bookForm").reset();
  document.getElementById("editBookId").value = "";
  document.getElementById("bookFormTitle").textContent = "Neues Buch anlegen";
  document.getElementById("bookSubmitBtn").textContent = "Buch speichern";
  document.getElementById("bookCancelBtn").hidden = true;
  document.getElementById("bookFormMsg").textContent = "";
}

document.getElementById("bookCancelBtn").addEventListener("click", resetBookForm);

document.getElementById("bookForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const bookId = document.getElementById("editBookId").value;
  const authorIds = Array.from(
    document.getElementById("bookAuthors").selectedOptions
  ).map(o => o.value);
  const payload = {
    title: document.getElementById("bookTitle").value.trim(),
    isbn: document.getElementById("bookIsbn").value.trim(),
    year: Number(document.getElementById("bookYear").value),
    categoryId: document.getElementById("bookCategory").value,
    availableCopies: Number(document.getElementById("bookAvailable").value),
    totalCopies: Number(document.getElementById("bookTotal").value),
    authorIds
  };
  try {
    if (bookId) {
      await apiFetch(`/api/books/${bookId}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      showFormMsg("bookFormMsg", "Buch erfolgreich aktualisiert.", "success");
    } else {
      await apiFetch("/api/books", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      showFormMsg("bookFormMsg", "Buch erfolgreich angelegt.", "success");
    }
    resetBookForm();
    loadBooks();
    loadRecommendations();
    loadAdminBookList();
  } catch (e) {
    showFormMsg("bookFormMsg", "Fehler beim Speichern.", "error");
  }
});
// ─── Admin: Bücher-Liste ──────────────────────────────────────────────────────

/**
 * Lädt die Bücherliste für den Admin-Tab und rendert eine Tabelle
 * mit Bearbeiten- und Löschen-Buttons.
 */
async function loadAdminBookList() {
  const content = document.getElementById("adminBookListContent");
  content.textContent = "Wird geladen…";

  try {
    const books = await apiFetch("/api/books");

    if (!books.length) {
      content.textContent = "Noch keine Bücher vorhanden.";
      return;
    }

    window._adminBooks = {};
    for (let b of books) window._adminBooks[b.bookId] = b;

    let html = "<table><thead><tr>" +
      "<th>Titel</th><th>Autor</th><th>ISBN</th><th>Jahr</th><th>Verfügbar</th><th>Aktionen</th>" +
      "</tr></thead><tbody>";

    for (let b of books) {
      const authorText = b.authors?.length
        ? b.authors.map(a => `${a.firstname || ""} ${a.name || ""}`.trim()).join(", ")
        : "–";

      html += `
        <tr>
          <td>${escHtml(b.title || "")}</td>
          <td>${escHtml(authorText)}</td>
          <td>${escHtml(b.isbn || "")}</td>
          <td>${b.year || "–"}</td>
          <td>${b.availableCopies ?? "–"}/${b.totalCopies ?? "–"}</td>
          <td>
            <button onclick="editBook(window._adminBooks['${b.bookId}'])">Bearbeiten</button>
            <button onclick="deleteBook('${b.bookId}')">Löschen</button>
          </td>
        </tr>`;
    }

    html += "</tbody></table>";
    content.innerHTML = html;

  } catch (e) {
    content.textContent = "Bücher konnten nicht geladen werden.";
  }
}

/**
 * Löscht ein Buch nach Bestätigung durch den Benutzer.
 * @param {string} bookId
 */
async function deleteBook(bookId) {
  if (!confirm("Buch wirklich löschen?")) return;

  try {
    await apiFetch(`/api/books/${bookId}`, { method: "DELETE" });
    showToast("Buch gelöscht.", "success");
    loadBooks();
    loadAdminBookList();
    loadRecommendations();
  } catch (e) {
    showToast("Löschen fehlgeschlagen.", "error");
  }
}
// ─── Suche ────────────────────────────────────────────────────────────────────

searchBtn.onclick = loadBooks;

searchInput.onkeydown = (e) => {
  if (e.key === "Enter") loadBooks();
};

document.getElementById("loansSearchBtn").onclick = loadAllLoans;

document.getElementById("loansAuthorSearch").onkeydown = (e) => {
  if (e.key === "Enter") loadAllLoans();
};
// ─── Initialisierung ──────────────────────────────────────────────────────────

/**
 * Lädt alle Daten beim Start der Seite.
 */
async function init() {
  await loadCategories();
  await loadAuthorsDropdown();
  const user = await apiFetch("/api/users/default");
  CURRENT_USER_ID = user.userId;
  loadRecommendations();
  loadBooks();
  loadAllLoans();
  loadAdminBookList();
}

init();

// Globale Funktionen für inline-onclick
window.borrowBook  = borrowBook;
window.returnBook  = returnBook;
window.editBook    = editBook;
window.deleteBook  = deleteBook;
window.editAuthor = editAuthor;
window.deleteAuthor = deleteAuthor;
window.editCategory = editCategory;
window.deleteCategory = deleteCategory;
