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
  const authorText = book.authors?.length
    ? book.authors.map((a) => `${a.firstname || ""} ${a.name || ""}`.trim()).join(", ")
    : (book.author || "–");

  // Verfügbarkeits-Badge
  const isAvailable = book.availableCopies > 0
    || (book.availableCopies === undefined && book.available !== false);

  let availBadge;
  if (book.availableCopies != null) {
    if (isAvailable) {
      availBadge = `<span class="avail-badge available">Verfügbar ${book.availableCopies}/${book.totalCopies || book.availableCopies}</span>`;
    } else {
      const freeDate = book.nextAvailable ? ` – frei ab ${formatDate(book.nextAvailable)}` : "";
      availBadge = `<span class="avail-badge unavailable">Ausgeliehen${freeDate}</span>`;
    }
  } else {
    availBadge = isAvailable
      ? `<span class="avail-badge available">Verfügbar</span>`
      : `<span class="avail-badge unavailable">Ausgeliehen</span>`;
  }

  const loanCountBadge = showLoanCount && book.loanCount != null
    ? `<span class="loan-count-badge" title="Gesamte Ausleihen">${book.loanCount}×</span>`
    : "";

  return `
    <div class="book-card">
      <div class="book-card-title">${escHtml(book.title || "Unbekannter Titel")}${loanCountBadge}</div>
      <div class="book-card-meta">
        <div>Autor: ${escHtml(authorText)}</div>
        <div>ISBN: ${escHtml(book.isbn || "–")}</div>
        <div>Jahr: ${book.year || "–"}</div>
      </div>
      <div class="book-card-footer">
        ${availBadge}
        <button class="btn-sm" onclick="borrowBook('${book.bookId}')" ${isAvailable ? "" : "disabled"}>
          Ausleihen
        </button>
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
    const data = await apiFetch("/api/books/recommendations");
    recName.textContent = data.categoryName || "Alle Kategorien";

    if (!data.books?.length) {
      recBooks.innerHTML = `<div class="empty-state"><p>Noch keine Bücher vorhanden.</p></div>`;
      return;
    }
    recBooks.innerHTML = data.books.map((b) => bookCardHTML(b, true)).join("");
  } catch (err) {
    recBooks.innerHTML = `<div class="empty-state"><p>Empfehlungen konnten nicht geladen werden.</p></div>`;
    console.error(err);
  }
}

// ─── Bücher browsen ──────────────────────────────────────────────────────────

/**
 * Lädt Bücher gefiltert nach Suchtext und Kategorie
 * und zeigt sie im Bücher-Raster an.
 */
async function loadBooks() {
  const search   = document.getElementById("searchInput").value.trim();
  const category = document.getElementById("categoryFilter").value;
  const booksList = document.getElementById("booksList");

  booksList.innerHTML = `<p style="color:#667786">Bücher werden geladen…</p>`;

  const params = new URLSearchParams();
  if (search)   params.set("search", search);
  if (category) params.set("category", category);

  try {
    const books = await apiFetch(`/api/books?${params}`);
    if (!books.length) {
      booksList.innerHTML = `<div class="empty-state"><p>Keine Bücher gefunden.</p></div>`;
      return;
    }
    booksList.innerHTML = books.map((b) => bookCardHTML(b)).join("");
  } catch (err) {
    booksList.innerHTML = `<div class="empty-state"><p>Bücher konnten nicht geladen werden.</p></div>`;
    console.error(err);
  }
}

// ─── Kategorien-Dropdown befüllen ─────────────────────────────────────────────

/**
 * Lädt alle Kategorien und füllt alle Kategorie-Dropdowns auf der Seite.
 */
async function loadCategories() {
  try {
    const cats = await apiFetch("/api/categories");
    const filterSel  = document.getElementById("categoryFilter");
    const bookCatSel = document.getElementById("bookCategory");

    cats.sort((a, b) => a.name.localeCompare(b.name));
    for (const cat of cats) {
      const opt = new Option(cat.name, cat.categoryId);
      filterSel.add(opt.cloneNode(true));
      bookCatSel.add(opt.cloneNode(true));
    }
  } catch (err) {
    console.error("Kategorien konnten nicht geladen werden:", err);
  }
}

// ─── Autoren-Dropdown befüllen ────────────────────────────────────────────────

/**
 * Lädt alle Autoren und füllt das Autoren-Mehrfachauswahl-Dropdown im Admin-Bereich.
 */
async function loadAuthorsDropdown() {
  try {
    const authors = await apiFetch("/api/authors");
    const sel = document.getElementById("bookAuthors");
    sel.innerHTML = "";
    authors.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    for (const a of authors) {
      sel.add(new Option(`${a.firstname} ${a.name}`, a.authorID || a.authorId));
    }
  } catch (err) {
    console.error("Autoren konnten nicht geladen werden:", err);
  }
}

// ─── Aktive Ausleihen ─────────────────────────────────────────────────────────

/**
 * Lädt alle aktiven Ausleihen und zeigt sie mit Rückgabe-Button an.
 */
async function loadAllLoans() {
  const content = document.getElementById("loansContent");
  try {
    const loans = await apiFetch("/api/loans");
    if (!loans.length) {
      content.innerHTML = `<div class="empty-state"><p>Derzeit keine aktiven Ausleihen.</p></div>`;
      return;
    }

    const now = Date.now();
    content.innerHTML = `<div class="loans-list">${
      loans.map((loan) => {
        const due     = new Date(loan.dueDate);
        const overdue = due < now;
        return `
          <div class="loan-item${overdue ? " overdue" : ""}">
            <div>
              <div class="loan-item-title">${escHtml(loan.book?.title || "Unbekanntes Buch")}</div>
              <div class="loan-item-due${overdue ? " overdue-text" : ""}">
                Fällig: ${formatDate(loan.dueDate)}${overdue ? " – ÜBERFÄLLIG" : ""}
              </div>
              <div style="font-size:13px;color:#667786">
                Ausgeliehen: ${formatDate(loan.borrowedAt)}
              </div>
            </div>
            <div>
              <button class="btn-sm btn-outline" onclick="returnBook('${loan.loanId}')">
                Zurückgeben
              </button>
            </div>
          </div>`;
      }).join("")
    }</div>`;
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><p>Ausleihen konnten nicht geladen werden.</p></div>`;
    console.error(err);
  }
}

// ─── Buch ausleihen ───────────────────────────────────────────────────────────

/**
 * Leiht ein Buch aus und aktualisiert die Ansicht.
 * @param {string} bookId
 */
async function borrowBook(bookId) {
  try {
    await apiFetch("/api/loans", {
      method: "POST",
      body: JSON.stringify({ bookId }),
    });
    showToast("Buch erfolgreich ausgeliehen!", "success");
    loadBooks();
    loadAllLoans();
    loadRecommendations();
  } catch (err) {
    showToast(err.message || "Ausleihe fehlgeschlagen.", "error");
  }
}

// ─── Buch zurückgeben ─────────────────────────────────────────────────────────

/**
 * Gibt ein ausgeliehenes Buch zurück und aktualisiert die Ansicht.
 * @param {string} loanId
 */
async function returnBook(loanId) {
  try {
    await apiFetch(`/api/loans/${loanId}/return`, { method: "POST" });
    showToast("Buch erfolgreich zurückgegeben.", "success");
    loadBooks();
    loadAllLoans();
    loadRecommendations();
  } catch (err) {
    showToast(err.message || "Rückgabe fehlgeschlagen.", "error");
  }
}

// ─── Admin: Buch-Formular ─────────────────────────────────────────────────────

/**
 * Füllt das Buch-Formular zum Bearbeiten eines vorhandenen Buches vor.
 * @param {object} book
 */
function editBook(book) {
  document.getElementById("editBookId").value     = book.bookId;
  document.getElementById("bookTitle").value      = book.title || "";
  document.getElementById("bookIsbn").value       = book.isbn  || "";
  document.getElementById("bookYear").value       = book.year  || "";
  document.getElementById("bookAvailable").value  = book.availableCopies ?? 1;
  document.getElementById("bookTotal").value      = book.totalCopies    ?? 1;
  document.getElementById("bookFormTitle").textContent = "Buch bearbeiten";
  document.getElementById("bookSubmitBtn").textContent = "Änderungen speichern";
  document.getElementById("bookCancelBtn").hidden = false;

  // Kategorie setzen
  const catSel = document.getElementById("bookCategory");
  for (const opt of catSel.options) {
    opt.selected = opt.value === (book.categoryId || "");
  }

  // Autoren setzen
  const authorIds = (book.authors || []).map((a) => a.authorId);
  const authSel   = document.getElementById("bookAuthors");
  for (const opt of authSel.options) {
    opt.selected = authorIds.includes(opt.value);
  }

  // Zur Admin-Sektion scrollen und Bücher-Tab aktivieren
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

  const authorSel = document.getElementById("bookAuthors");
  const authorIds = Array.from(authorSel.selectedOptions).map((o) => o.value);

  const payload = {
    title:           document.getElementById("bookTitle").value.trim(),
    isbn:            document.getElementById("bookIsbn").value.trim(),
    year:            Number(document.getElementById("bookYear").value),
    categoryId:      document.getElementById("bookCategory").value,
    availableCopies: Number(document.getElementById("bookAvailable").value),
    totalCopies:     Number(document.getElementById("bookTotal").value),
    authorIds,
  };

  try {
    if (bookId) {
      await apiFetch(`/api/books/${bookId}`, { method: "PUT", body: JSON.stringify(payload) });
      showFormMsg("bookFormMsg", "Buch erfolgreich aktualisiert.", "success");
    } else {
      await apiFetch("/api/books", { method: "POST", body: JSON.stringify(payload) });
      showFormMsg("bookFormMsg", "Buch erfolgreich angelegt.", "success");
    }
    resetBookForm();
    loadBooks();
    loadRecommendations();
    loadAdminBookList();
  } catch (err) {
    showFormMsg("bookFormMsg", err.message || "Fehler beim Speichern.", "error");
  }
});

// ─── Admin: Autoren-Formular ──────────────────────────────────────────────────

document.getElementById("authorForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    firstname: document.getElementById("authorFirstname").value.trim(),
    name:      document.getElementById("authorName").value.trim(),
  };
  try {
    await apiFetch("/api/authors", { method: "POST", body: JSON.stringify(payload) });
    showFormMsg("authorFormMsg", "Autor erfolgreich angelegt.", "success");
    document.getElementById("authorForm").reset();
    loadAuthorsDropdown();
  } catch (err) {
    showFormMsg("authorFormMsg", err.message || "Fehler beim Speichern.", "error");
  }
});

// ─── Admin: Kategorien-Formular ───────────────────────────────────────────────

document.getElementById("categoryForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = { name: document.getElementById("categoryName").value.trim() };
  try {
    await apiFetch("/api/categories", { method: "POST", body: JSON.stringify(payload) });
    showFormMsg("categoryFormMsg", "Kategorie erfolgreich angelegt.", "success");
    document.getElementById("categoryForm").reset();
    // Dropdowns neu laden
    document.getElementById("categoryFilter").innerHTML = '<option value="">Alle Kategorien</option>';
    document.getElementById("bookCategory").innerHTML   = '<option value="">Keine Kategorie</option>';
    loadCategories();
  } catch (err) {
    showFormMsg("categoryFormMsg", err.message || "Fehler beim Speichern.", "error");
  }
});

// ─── Admin: Bücher-Liste ──────────────────────────────────────────────────────

/**
 * Lädt die Bücherliste für den Admin-Tab und rendert eine Tabelle
 * mit Bearbeiten- und Löschen-Buttons.
 */
async function loadAdminBookList() {
  const content = document.getElementById("adminBookListContent");
  content.innerHTML = `<p style="color:#667786">Wird geladen…</p>`;
  try {
    const books = await apiFetch("/api/books");
    if (!books.length) {
      content.innerHTML = `<div class="empty-state"><p>Noch keine Bücher vorhanden.</p></div>`;
      return;
    }

    // Bücher in window speichern für editBook()-Zugriff
    window._adminBooks = {};
    for (const b of books) window._adminBooks[b.bookId] = b;

    content.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Titel</th>
              <th>Autor</th>
              <th>ISBN</th>
              <th>Jahr</th>
              <th>Verfügbar</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            ${books.map((b) => {
              const authorText = b.authors?.length
                ? b.authors.map((a) => `${a.firstname || ""} ${a.name || ""}`.trim()).join(", ")
                : (b.author || "–");
              return `
                <tr>
                  <td>${escHtml(b.title || "")}</td>
                  <td>${escHtml(authorText)}</td>
                  <td>${escHtml(b.isbn || "")}</td>
                  <td>${b.year || "–"}</td>
                  <td>${b.availableCopies ?? "–"}/${b.totalCopies ?? "–"}</td>
                  <td>
                    <div class="td-actions">
                      <button class="btn-sm btn-outline" onclick="editBook(window._adminBooks['${b.bookId}'])">Bearbeiten</button>
                      <button class="btn-sm btn-danger"  onclick="deleteBook('${b.bookId}')">Löschen</button>
                    </div>
                  </td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><p>Bücher konnten nicht geladen werden.</p></div>`;
    console.error(err);
  }
}

/**
 * Löscht ein Buch nach Bestätigung durch den Benutzer.
 * @param {string} bookId
 */
async function deleteBook(bookId) {
  if (!confirm("Buch wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.")) return;
  try {
    await apiFetch(`/api/books/${bookId}`, { method: "DELETE" });
    showToast("Buch gelöscht.", "success");
    loadBooks();
    loadAdminBookList();
    loadRecommendations();
  } catch (err) {
    showToast(err.message || "Löschen fehlgeschlagen.", "error");
  }
}

// ─── Admin-Tab-Navigation ──────────────────────────────────────────────────────

/**
 * Aktiviert einen Admin-Tab und deaktiviert alle anderen.
 * @param {string} tabId
 */
function activateAdminTab(tabId) {
  document.querySelectorAll(".admin-tabs .tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  document.querySelectorAll(".admin-inner .tab-content").forEach((panel) => {
    panel.classList.toggle("active", panel.id === tabId);
  });
  // Bücherliste bei Tab-Wechsel nachladen
  if (tabId === "adminBookList") loadAdminBookList();
}

document.querySelectorAll(".admin-tabs .tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => activateAdminTab(btn.dataset.tab));
});

// ─── Suche ────────────────────────────────────────────────────────────────────

document.getElementById("searchBtn").addEventListener("click", loadBooks);
document.getElementById("searchInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadBooks();
});

// ─── Admin-Bereich: Daten nachladen wenn aufgeklappt ─────────────────────────

document.getElementById("adminSection").addEventListener("toggle", (e) => {
  if (e.target.open) loadAdminBookList();
});

// ─── Initialisierung ──────────────────────────────────────────────────────────

/**
 * Lädt alle Daten beim Start der Seite.
 */
async function init() {
  await loadCategories();
  await loadAuthorsDropdown();
  loadRecommendations();
  loadBooks();
  loadAllLoans();
}

init();

// Globale Funktionen für inline-onclick
window.borrowBook  = borrowBook;
window.returnBook  = returnBook;
window.editBook    = editBook;
window.deleteBook  = deleteBook;
