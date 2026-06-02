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
 * Autor: Kjell
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
 * Autor: Ramona
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
 * Autor: Ramona
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
 * Autor: Ramona
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
 * Autor: Kjell
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
 * Autor: Kjell
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
 * Autor: Ramona
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
 * Autor: Kjell
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
 * Autor: Ramona
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
 * Autor: Kjell
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
 * Autor: Ramona
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
 * Autor: Ramona
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
 * Autor: Ramona
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
 * Autor: Ramona
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


// ─── Admin: Tab-Navigation ────────────────────────────────────────────────────

/**
 * Autor: Ramona
 * Wechselt den aktiven Tab im Admin-Bereich.
 * @param {"adminBooks"|"adminAuthors"|"adminCategories"} tabId
 */
function activateAdminTab(tabId) {
  const tabs = ["adminBooks", "adminAuthors", "adminCategories"];
  const btnIds = { adminBooks: "tabBtnBooks", adminAuthors: "tabBtnAuthors", adminCategories: "tabBtnCategories" };

  for (const id of tabs) {
    const panel = document.getElementById(id);
    if (panel) panel.hidden = (id !== tabId);
    const btn = document.getElementById(btnIds[id]);
    if (btn) btn.classList.toggle("active", id === tabId);
  }
}

// ─── Admin: Buch-Formular ─────────────────────────────────────────────────────

/**
 * Autor: Kjell
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


/**
 * Autor: Kjell
 * Setzt das Buch-Formular zurück.
 */
function resetBookForm() {
  document.getElementById("bookForm").reset();
  document.getElementById("editBookId").value = "";
  document.getElementById("bookFormTitle").textContent = "Neues Buch anlegen";
  document.getElementById("bookSubmitBtn").textContent = "Buch speichern";
  document.getElementById("bookCancelBtn").hidden = true;
  document.getElementById("bookFormMsg").textContent = "";
}

// Autor: Kjell
document.getElementById("bookCancelBtn").addEventListener("click", resetBookForm);

// Autor: Kjell
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
 * Autor: Kjell
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
 * Autor: Kjell
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
// ─── Admin: Autoren ───────────────────────────────────────────────────────────

/**
 * Autor: Ramona
 * Füllt das Autoren-Formular zum Bearbeiten eines vorhandenen Autors vor.
 * @param {object} author
 */
function editAuthor(author) {
  document.getElementById("editAuthorId").value    = author.authorID || author.authorId;
  document.getElementById("authorFirstname").value = author.firstname || "";
  document.getElementById("authorName").value      = author.name || "";
  document.getElementById("authorFormTitle").textContent = "Autor bearbeiten";
  document.getElementById("authorSubmitBtn").textContent  = "Änderungen speichern";
  document.getElementById("authorCancelBtn").hidden       = false;
  activateAdminTab("adminAuthors");
  document.getElementById("authorName").focus();
}

/**
 * Autor: Ramona
 * Setzt das Autoren-Formular zurück.
 */
function resetAuthorForm() {
  document.getElementById("authorForm").reset();
  document.getElementById("editAuthorId").value           = "";
  document.getElementById("authorFormTitle").textContent  = "Neuen Autor anlegen";
  document.getElementById("authorSubmitBtn").textContent  = "Autor speichern";
  document.getElementById("authorCancelBtn").hidden       = true;
  document.getElementById("authorFormMsg").textContent    = "";
}

/**
 * Autor: Ramona
 * Löscht einen Autor nach Bestätigung.
 * @param {string} authorId
 */
async function deleteAuthor(authorId) {
  if (!confirm("Autor wirklich löschen?")) return;

  try {
    await apiFetch(`/api/authors/${authorId}`, { method: "DELETE" });
    showToast("Autor gelöscht.", "success");
    loadAdminAuthorList();
    loadAuthorsDropdown();
  } catch (e) {
    showToast("Löschen fehlgeschlagen.", "error");
  }
}

/**
 * Autor: Ramona
 * Lädt die Autorenliste für den Admin-Tab und rendert eine Tabelle
 * mit Bearbeiten- und Löschen-Buttons.
 */
async function loadAdminAuthorList() {
  const content = document.getElementById("adminAuthorListContent");
  content.textContent = "Wird geladen…";

  try {
    const authors = await apiFetch("/api/authors");

    if (!authors.length) {
      content.textContent = "Noch keine Autoren vorhanden.";
      return;
    }

    window._adminAuthors = {};
    for (let a of authors) window._adminAuthors[a.authorID || a.authorId] = a;

    let html = "<table><thead><tr><th>Vorname</th><th>Nachname</th><th>Aktionen</th></tr></thead><tbody>";

    for (let a of authors) {
      const id = a.authorID || a.authorId;
      html += `
        <tr>
          <td>${escHtml(a.firstname || "–")}</td>
          <td>${escHtml(a.name || "")}</td>
          <td>
            <button onclick="editAuthor(window._adminAuthors['${id}'])">Bearbeiten</button>
            <button onclick="deleteAuthor('${id}')">Löschen</button>
          </td>
        </tr>`;
    }

    html += "</tbody></table>";
    content.innerHTML = html;

  } catch (e) {
    content.textContent = "Autoren konnten nicht geladen werden.";
  }
}

// Autor: Ramona
document.getElementById("authorCancelBtn").addEventListener("click", resetAuthorForm);

// Autor: Ramona
document.getElementById("authorForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const authorId = document.getElementById("editAuthorId").value;
  const payload  = {
    firstname: document.getElementById("authorFirstname").value.trim(),
    name:      document.getElementById("authorName").value.trim(),
  };

  try {
    if (authorId) {
      await apiFetch(`/api/authors/${authorId}`, { method: "PUT", body: JSON.stringify(payload) });
      showFormMsg("authorFormMsg", "Autor erfolgreich aktualisiert.", "success");
    } else {
      await apiFetch("/api/authors", { method: "POST", body: JSON.stringify(payload) });
      showFormMsg("authorFormMsg", "Autor erfolgreich angelegt.", "success");
    }
    resetAuthorForm();
    loadAdminAuthorList();
    loadAuthorsDropdown();
  } catch (e) {
    showFormMsg("authorFormMsg", "Fehler beim Speichern.", "error");
  }
});

// ─── Admin: Kategorien ────────────────────────────────────────────────────────

/**
 * Autor: Ramona
 * Füllt das Kategorien-Formular zum Bearbeiten einer vorhandenen Kategorie vor.
 * @param {object} cat
 */
function editCategory(cat) {
  document.getElementById("editCategoryId").value          = cat.categoryId;
  document.getElementById("categoryName").value            = cat.name || "";
  document.getElementById("categoryFormTitle").textContent = "Kategorie bearbeiten";
  document.getElementById("categorySubmitBtn").textContent = "Änderungen speichern";
  document.getElementById("categoryCancelBtn").hidden      = false;
  activateAdminTab("adminCategories");
  document.getElementById("categoryName").focus();
}

/**
 * Autor: Ramona
 * Setzt das Kategorien-Formular zurück.
 */
function resetCategoryForm() {
  document.getElementById("categoryForm").reset();
  document.getElementById("editCategoryId").value           = "";
  document.getElementById("categoryFormTitle").textContent  = "Neue Kategorie anlegen";
  document.getElementById("categorySubmitBtn").textContent  = "Kategorie speichern";
  document.getElementById("categoryCancelBtn").hidden       = true;
  document.getElementById("categoryFormMsg").textContent    = "";
}

/**
 * Autor: Ramona
 * Löscht eine Kategorie nach Bestätigung.
 * @param {string} categoryId
 */
async function deleteCategory(categoryId) {
  if (!confirm("Kategorie wirklich löschen?")) return;

  try {
    await apiFetch(`/api/categories/${categoryId}`, { method: "DELETE" });
    showToast("Kategorie gelöscht.", "success");
    renderAdminCategories();
    loadCategories();
  } catch (e) {
    showToast("Löschen fehlgeschlagen.", "error");
  }
}

/**
 * Autor: Ramona
 * Lädt und rendert die Kategorieliste im Admin-Tab.
 */
async function renderAdminCategories() {
  const content = document.getElementById("adminCategoryListContent");
  content.textContent = "Wird geladen…";

  try {
    const categories = await apiFetch("/api/categories");

    if (!categories.length) {
      content.textContent = "Noch keine Kategorien vorhanden.";
      return;
    }

    window._adminCategories = {};
    for (let c of categories) window._adminCategories[c.categoryId] = c;

    let html = "<table><thead><tr><th>Name</th><th>Aktionen</th></tr></thead><tbody>";

    for (let c of categories) {
      html += `
        <tr>
          <td>${escHtml(c.name || "")}</td>
          <td>
            <button onclick="editCategory(window._adminCategories['${c.categoryId}'])">Bearbeiten</button>
            <button onclick="deleteCategory('${c.categoryId}')">Löschen</button>
          </td>
        </tr>`;
    }

    html += "</tbody></table>";
    content.innerHTML = html;

  } catch (e) {
    content.textContent = "Kategorien konnten nicht geladen werden.";
  }
}

// Autor: Ramona
document.getElementById("categoryCancelBtn").addEventListener("click", resetCategoryForm);

// Autor: Ramona
document.getElementById("categoryForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const categoryId = document.getElementById("editCategoryId").value;
  const payload    = { name: document.getElementById("categoryName").value.trim() };

  try {
    if (categoryId) {
      await apiFetch(`/api/categories/${categoryId}`, { method: "PUT", body: JSON.stringify(payload) });
      showFormMsg("categoryFormMsg", "Kategorie erfolgreich aktualisiert.", "success");
    } else {
      await apiFetch("/api/categories", { method: "POST", body: JSON.stringify(payload) });
      showFormMsg("categoryFormMsg", "Kategorie erfolgreich angelegt.", "success");
    }
    resetCategoryForm();
    renderAdminCategories();
    loadCategories();
  } catch (e) {
    showFormMsg("categoryFormMsg", "Fehler beim Speichern.", "error");
  }
});

// ─── Suche ────────────────────────────────────────────────────────────────────

// Autor: Kjell
searchBtn.onclick = loadBooks;

// Autor: Kjell
searchInput.onkeydown = (e) => {
  if (e.key === "Enter") loadBooks();
};

// Autor: Ramona
document.getElementById("loansSearchBtn").onclick = loadAllLoans;

// Autor: Ramona
document.getElementById("loansAuthorSearch").onkeydown = (e) => {
  if (e.key === "Enter") loadAllLoans();
};
// ─── Initialisierung ──────────────────────────────────────────────────────────

/**
 * Autor: Kjell und Ramona
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
  loadAdminAuthorList();
  renderAdminCategories();
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
