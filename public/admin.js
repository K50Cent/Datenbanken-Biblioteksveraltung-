const token = localStorage.getItem("libraryToken");
const currentUser = JSON.parse(localStorage.getItem("libraryUser") || "null");

if (!token || !currentUser) {
  window.location.href = "/index.html";
} else if (currentUser.role !== "admin") {
  window.location.href = "/library.html";
}

let books = [];
let categories = [];
let authors = [];

const messageEl = document.getElementById("bookFormMessage");
const formEl = document.getElementById("bookFormEl");

document.getElementById("navUserName").textContent = `${currentUser.vorname} ${currentUser.name}`;

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("libraryToken");
  localStorage.removeItem("libraryUser");
  window.location.href = "/index.html";
});

document.getElementById("clearBookBtn").addEventListener("click", resetForm);

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    localStorage.removeItem("libraryToken");
    localStorage.removeItem("libraryUser");
    window.location.href = "/index.html";
    return null;
  }

  return res;
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showMessage(text, type = "info") {
  messageEl.textContent = text;
  messageEl.className = `message message-${type}`;
  messageEl.hidden = false;
}

function resetForm() {
  formEl.reset();
  document.getElementById("editBookId").value = "";
  document.getElementById("bookCopies").value = 1;
  messageEl.hidden = true;
}

function fillSelects() {
  const categorySelect = document.getElementById("bookCategory");
  categorySelect.innerHTML = '<option value="">Keine Kategorie</option>';

  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.categoryId;
    option.textContent = category.name;
    categorySelect.appendChild(option);
  });

  const authorSelect = document.getElementById("bookAuthors");
  authorSelect.innerHTML = "";

  authors.forEach((author) => {
    const option = document.createElement("option");
    option.value = author.authorID || author.authorId;
    option.textContent = `${author.firstname || ""} ${author.name || ""}`.trim();
    authorSelect.appendChild(option);
  });
}

function getCategoryName(categoryId) {
  return categories.find((category) => category.categoryId === categoryId)?.name || "-";
}

function getAuthorText(book) {
  if (book.authors?.length) {
    return book.authors.map((author) => `${author.firstname || ""} ${author.name || ""}`.trim()).join(", ");
  }

  return book.author || "-";
}

async function loadData() {
  const container = document.getElementById("booksTableContainer");
  container.innerHTML = "<p>Buecher werden geladen ...</p>";

  try {
    const [booksRes, categoriesRes, authorsRes] = await Promise.all([
      apiFetch("/api/books"),
      apiFetch("/api/categories"),
      apiFetch("/api/authors"),
    ]);

    if (!booksRes || !categoriesRes || !authorsRes) return;

    books = await booksRes.json();
    categories = await categoriesRes.json();
    authors = await authorsRes.json();

    fillSelects();
    renderBooks();
  } catch {
    container.innerHTML = '<p class="message message-error">Buecher konnten nicht geladen werden.</p>';
  }
}

function renderBooks() {
  const container = document.getElementById("booksTableContainer");

  if (!books.length) {
    container.innerHTML = "<p>Noch keine Buecher vorhanden.</p>";
    return;
  }

  const rows = books.map((book) => `
    <tr>
      <td>${esc(book.title)}</td>
      <td>${esc(book.isbn || "-")}</td>
      <td>${esc(book.year || "-")}</td>
      <td>${esc(getCategoryName(book.categoryId))}</td>
      <td>${esc(getAuthorText(book))}</td>
      <td>${esc(book.availableCopies ?? "-")} / ${esc(book.totalCopies ?? "-")}</td>
      <td>
        <button class="btn btn-outline btn-sm edit-book-btn" data-id="${esc(book.bookId)}">Bearbeiten</button>
        <button class="btn btn-danger btn-sm delete-book-btn" data-id="${esc(book.bookId)}" data-title="${esc(book.title)}">Loeschen</button>
      </td>
    </tr>
  `).join("");

  container.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Titel</th>
            <th>ISBN</th>
            <th>Jahr</th>
            <th>Kategorie</th>
            <th>Autoren</th>
            <th>Exemplare</th>
            <th>Aktion</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  container.querySelectorAll(".edit-book-btn").forEach((button) => {
    button.addEventListener("click", () => editBook(button.dataset.id));
  });

  container.querySelectorAll(".delete-book-btn").forEach((button) => {
    button.addEventListener("click", () => deleteBook(button.dataset.id, button.dataset.title));
  });
}

function editBook(bookId) {
  const book = books.find((entry) => entry.bookId === bookId);
  if (!book) return;

  document.getElementById("editBookId").value = book.bookId;
  document.getElementById("bookTitle").value = book.title || "";
  document.getElementById("bookIsbn").value = book.isbn || "";
  document.getElementById("bookYear").value = book.year || "";
  document.getElementById("bookCategory").value = book.categoryId || "";
  document.getElementById("bookCopies").value = book.totalCopies || book.availableCopies || 1;

  const selectedAuthorIds = book.authors?.map((author) => author.authorId) || [];
  Array.from(document.getElementById("bookAuthors").options).forEach((option) => {
    option.selected = selectedAuthorIds.includes(option.value);
  });

  showMessage("Buch wird bearbeitet. Nach der Aenderung speichern.", "info");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  const bookId = document.getElementById("editBookId").value;
  const authorIds = Array.from(document.getElementById("bookAuthors").selectedOptions).map((option) => option.value);
  const copies = Number(document.getElementById("bookCopies").value) || 1;

  const payload = {
    title: document.getElementById("bookTitle").value.trim(),
    isbn: document.getElementById("bookIsbn").value.trim(),
    year: Number(document.getElementById("bookYear").value),
    categoryId: document.getElementById("bookCategory").value,
    authorIds,
    availableCopies: copies,
    totalCopies: copies,
  };

  const url = bookId ? `/api/books/${bookId}` : "/api/books";
  const method = bookId ? "PUT" : "POST";

  try {
    const res = await apiFetch(url, { method, body: JSON.stringify(payload) });
    if (!res) return;

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showMessage(data.message || "Buch konnte nicht gespeichert werden.", "error");
      return;
    }

    resetForm();
    showMessage(bookId ? "Buch wurde aktualisiert." : "Buch wurde angelegt.", "success");
    await loadData();
  } catch {
    showMessage("Verbindungsfehler. Bitte erneut versuchen.", "error");
  }
});

async function deleteBook(bookId, title) {
  if (!confirm(`Buch "${title}" wirklich loeschen?`)) return;

  try {
    const res = await apiFetch(`/api/books/${bookId}`, { method: "DELETE" });
    if (!res) return;

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showMessage(data.message || "Buch konnte nicht geloescht werden.", "error");
      return;
    }

    showMessage("Buch wurde geloescht.", "success");
    await loadData();
  } catch {
    showMessage("Loeschen konnte nicht durchgefuehrt werden.", "error");
  }
}

loadData();
