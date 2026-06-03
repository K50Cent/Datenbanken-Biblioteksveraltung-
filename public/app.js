"use strict";
let CURRENT_USER_ID = null;
let allCategories = [];
let allAuthors = [];

//Autor: Kjell
async function apiFetch(url, options = {}) {
  const defaults = {
    headers: { "Content-Type": "application/json" },
  };
  const res = await fetch(url, { ...defaults, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

//Autor: Ramona
function showToast(msg, type = "info") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `message message-${type}`;
  toast.style.cssText = "margin-top:8px;";
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

//Autor: Ramona
function formatDate(iso) {
  if (!iso) return "–";
  return new Date(iso).toLocaleDateString("de-DE");
}

//Autor: Kjell
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
  let isAvailable;

  if (book.availableCopies != null) {
    isAvailable = book.availableCopies > 0;
  } else {
    isAvailable = book.available !== false;
  }

  let availBadge;
  if (isAvailable) {
    availBadge = `<span>Verfügbar ${book.availableCopies}/${book.totalCopies ?? book.availableCopies}</span>`;
  } else {
    const freeDate = book.nextAvailable
    ? ` – frei ab ${formatDate(book.nextAvailable)}`
    : "";
    availBadge = `<span>Ausgeliehen${freeDate}</span>`;
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

//Autor: Kjell
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

//Autor: Ramona
async function loadRecommendations() {
  const recBooks = document.getElementById("recBooks");
  const recName  = document.getElementById("recCategoryName");

  recBooks.innerHTML = "";
  recName.textContent = "";

  try {
    const data = await apiFetch(`/api/books/recommendations/${CURRENT_USER_ID}`);
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

//Autor: Kjell
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


//Autor: Ramona
async function loadCategories() {
  try {
    const cats = await apiFetch("/api/categories");
    allCategories = cats.sort((a, b) => a.name.localeCompare(b.name));

    const filterSel = document.getElementById("categoryFilter");
    const bookCatSel = document.getElementById("bookCategory");

    for (const c of allCategories) {
      const opt = new Option(c.name, c.categoryId);
      filterSel.add(opt.cloneNode(true));
      bookCatSel.add(opt);
    }
    renderAdminCategories();
  } catch (e) {
    console.error("Fehler beim Laden der Kategorien");
  }
}



//Autor: Kjell
function getCategoryName(categoryId) {
  if (!categoryId) return "Unbekannte Kategorie";

  const category = allCategories.find(c => c.categoryId === categoryId);
  if (category) return category.name;

  return "Unbekannte Kategorie";
}

//Autor: Ramona
async function loadAuthorsDropdown() {
  try {
    const authors = await apiFetch("/api/authors");
    allAuthors = authors.sort((a, b) =>
      (a.name || "").localeCompare(b.name || "")
    );

    const sel = document.getElementById("bookAuthors");
    sel.innerHTML = "";

    for (const a of allAuthors) {
      const full = `${a.firstname || ""} ${a.name || ""}`.trim();
      sel.add(new Option(full, a.authorId ?? a.authorID));
    }

  } catch (e) {
    console.error("Fehler beim Laden der Autoren");
  }
}

//Autor: Ramona
async function loadAllLoans() {
  const content = document.getElementById("loansContent");
  const authorQuery = document.getElementById("loansAuthorSearch")?.value.trim() || "";
  const params = new URLSearchParams();
  if (CURRENT_USER_ID) params.set("userId", CURRENT_USER_ID);
  if (authorQuery) params.set("author", authorQuery);
  const url = `/api/loans?${params.toString()}`;

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
//Autor: Ramona
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

//Autor: Ramona
async function returnBook(loanId) {
  try {
    await apiFetch(`/api/loans/${loanId}/return`, {
      method: "POST"
    });

    showToast("Buch erfolgreich zurückgegeben.", "success");

    loadBooks();
    loadAllLoans();
    loadRecommendations();

  } catch (error) {
    showToast("Rückgabe fehlgeschlagen.", "error");
  }
}

//Autor: Kjell
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


//Autor: Kjell
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

//Autor: Kjell
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

//Autor: Kjell
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
//Autor: Kjell und Ramona

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

window.borrowBook  = borrowBook;
window.returnBook  = returnBook;
window.editBook    = editBook;
window.deleteBook  = deleteBook;
window.editAuthor = editAuthor;
window.deleteAuthor = deleteAuthor;
window.editCategory = editCategory;
window.deleteCategory = deleteCategory;
