// ── Auth-Prüfung (Admin) ──────────────────────────────────────────────────────
const token = localStorage.getItem("libraryToken");
const currentUser = JSON.parse(localStorage.getItem("libraryUser") || "null");

if (!token || !currentUser) {
  window.location.href = "/index.html";
} else if (currentUser.role !== "admin") {
  window.location.href = "/library.html";
}

// ── API-Helper ────────────────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem("libraryToken");
    localStorage.removeItem("libraryUser");
    window.location.href = "/index.html";
    return null;
  }
  return res;
}

// ── Datums-Formatierung ───────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function isOverdue(dueDateIso) {
  return new Date(dueDateIso) < new Date();
}

// ── HTML-Escaping ─────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(text, type = "info") {
  let c = document.getElementById("toastContainer");
  if (!c) {
    c = document.createElement("div");
    c.id = "toastContainer";
    c.style.cssText =
      "position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;align-items:flex-end;";
    document.body.appendChild(c);
  }
  const toast = document.createElement("div");
  toast.className = `message message-${type === "success" ? "success" : type === "error" ? "error" : "info"}`;
  toast.style.cssText = "min-width:260px;max-width:400px;margin-bottom:10px;box-shadow:0 4px 12px rgba(0,0,0,.15);";
  toast.textContent = text;
  c.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.getElementById("navUserName").textContent =
  `${currentUser.vorname} ${currentUser.name}`;

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("libraryToken");
  localStorage.removeItem("libraryUser");
  window.location.href = "/index.html";
});

// ── Tab-Steuerung ─────────────────────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => {
      c.classList.remove("active");
      c.style.display = "none";
    });
    btn.classList.add("active");
    const content = document.getElementById(`tab-${tab}`);
    content.classList.add("active");
    content.style.display = "block";

    if (tab === "users") loadUsers();
    if (tab === "books") loadAdminBooks();
  });
});

// ── Statistiken ───────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const res = await apiFetch("/api/admin/stats");
    if (!res) return;
    const stats = await res.json();
    document.getElementById("statBooks").textContent = stats.totalBooks ?? "–";
    document.getElementById("statLoans").textContent = stats.totalLoans ?? "–";
    document.getElementById("statActive").textContent = stats.activeLoans ?? "–";
    document.getElementById("statUsers").textContent = stats.totalUsers ?? "–";
  } catch {
    // Statistiken nicht kritisch
  }
}

// ── Tab 1: Alle Ausleihen ─────────────────────────────────────────────────────
async function loadAllLoans() {
  const container = document.getElementById("loansTableContainer");
  container.innerHTML = "<p>Ausleihen werden geladen …</p>";

  try {
    const res = await apiFetch("/api/admin/loans");
    if (!res) return;
    const loans = await res.json();

    const badge = document.getElementById("loansCountBadge");
    if (loans.length > 0) {
      badge.textContent = loans.length;
      badge.hidden = false;
    }

    if (!loans.length) {
      container.innerHTML =
        '<div class="empty-state"><h3>Keine aktiven Ausleihen</h3><p>Momentan sind keine Bücher ausgeliehen.</p></div>';
      return;
    }

    const rows = loans.map((loan) => {
      const overdue = isOverdue(loan.dueDate);
      const rowClass = overdue ? "row-overdue" : "";
      const dueText = overdue
        ? `<strong style="color:var(--red-700)">⚠ ${formatDate(loan.dueDate)}</strong>`
        : formatDate(loan.dueDate);
      return `
        <tr class="${rowClass}">
          <td>${esc(loan.username)}</td>
          <td>${esc(loan.title)}</td>
          <td>${formatDate(loan.borrowedAt)}</td>
          <td>${dueText}</td>
        </tr>`;
    }).join("");

    container.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Benutzer</th>
              <th>Buch</th>
              <th>Ausgeliehen am</th>
              <th>Fällig am</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } catch {
    container.innerHTML =
      '<div class="empty-state"><h3>Fehler</h3><p>Ausleihen konnten nicht geladen werden.</p></div>';
  }
}

// ── Tab 2: Mitglieder ─────────────────────────────────────────────────────────
async function loadUsers() {
  const container = document.getElementById("usersTableContainer");
  container.innerHTML = "<p>Benutzer werden geladen …</p>";

  try {
    const res = await apiFetch("/api/admin/users");
    if (!res) return;
    const users = await res.json();

    if (!users.length) {
      container.innerHTML =
        '<div class="empty-state"><h3>Keine Benutzer gefunden</h3></div>';
      return;
    }

    const rows = users.map((u) => `
      <tr>
        <td>${esc(u.loginname)}</td>
        <td>${esc(u.name)}</td>
        <td>${esc(u.vorname)}</td>
        <td>
          <span class="avail-badge ${u.role === "admin" ? "unavailable" : "available"}">
            ${esc(u.role)}
          </span>
        </td>
        <td>${formatDate(u.createdAt)}</td>
      </tr>`).join("");

    container.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Loginname</th>
              <th>Name</th>
              <th>Vorname</th>
              <th>Rolle</th>
              <th>Erstellt am</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } catch {
    container.innerHTML =
      '<div class="empty-state"><h3>Fehler</h3><p>Benutzer konnten nicht geladen werden.</p></div>';
  }
}

// ── Tab 3: Bücher verwalten ───────────────────────────────────────────────────
let adminCategories = [];
let adminAuthors = [];

async function loadAdminBooks() {
  const container = document.getElementById("booksTableContainer");
  container.innerHTML = "<p>Bücher werden geladen …</p>";

  try {
    const [booksRes, catsRes, authsRes] = await Promise.all([
      apiFetch("/api/books"),
      apiFetch("/api/categories"),
      apiFetch("/api/authors"),
    ]);
    if (!booksRes || !catsRes || !authsRes) return;

    const [books, cats, authors] = await Promise.all([
      booksRes.json(),
      catsRes.json(),
      authsRes.json(),
    ]);

    adminCategories = cats;
    adminAuthors = authors;

    populateFormDropdowns();

    if (!books.length) {
      container.innerHTML =
        '<div class="empty-state"><h3>Keine Bücher vorhanden</h3><p>Lege das erste Buch an.</p></div>';
      return;
    }

    const catMap = {};
    cats.forEach((c) => { catMap[c.categoryId] = c.name; });

    const rows = books.map((book) => {
      const authorNames = book.authors?.length
        ? book.authors.map((a) => `${a.firstname} ${a.name}`).join(", ")
        : (book.author || "-");
      const catName = catMap[book.categoryId] || "-";
      return `
        <tr>
          <td>${esc(book.title)}</td>
          <td>${esc(book.isbn || "-")}</td>
          <td>${book.year || "-"}</td>
          <td>${esc(catName)}</td>
          <td>${esc(authorNames)}</td>
          <td>${book.availableCopies ?? "-"} / ${book.totalCopies ?? "-"}</td>
          <td>
            <div class="td-actions">
              <button class="btn btn-outline btn-sm edit-book-btn"
                data-book-id="${book.bookId}">Bearbeiten</button>
              <button class="btn btn-danger btn-sm delete-book-btn"
                data-book-id="${book.bookId}"
                data-title="${esc(book.title)}">Löschen</button>
            </div>
          </td>
        </tr>`;
    }).join("");

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
              <th>Verfügbar</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    container.querySelectorAll(".edit-book-btn").forEach((btn) => {
      btn.addEventListener("click", () => openEditBook(btn.dataset.bookId, books));
    });
    container.querySelectorAll(".delete-book-btn").forEach((btn) => {
      btn.addEventListener("click", () => deleteBook(btn.dataset.bookId, btn.dataset.title));
    });
  } catch {
    container.innerHTML =
      '<div class="empty-state"><h3>Fehler</h3><p>Bücher konnten nicht geladen werden.</p></div>';
  }
}

function populateFormDropdowns() {
  const catSelect = document.getElementById("bookCategory");
  catSelect.innerHTML = '<option value="">– keine –</option>';
  adminCategories.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.categoryId;
    opt.textContent = c.name;
    catSelect.appendChild(opt);
  });

  const authSelect = document.getElementById("bookAuthors");
  authSelect.innerHTML = "";
  adminAuthors.forEach((a) => {
    const opt = document.createElement("option");
    opt.value = a.authorId;
    opt.textContent = `${a.firstname} ${a.name}`;
    authSelect.appendChild(opt);
  });
}

// ── Buchformular öffnen (neu) ─────────────────────────────────────────────────
document.getElementById("newBookBtn").addEventListener("click", () => {
  document.getElementById("bookFormTitle").textContent = "Neues Buch anlegen";
  document.getElementById("editBookId").value = "";
  document.getElementById("bookFormEl").reset();
  document.getElementById("bookFormMessage").hidden = true;
  document.getElementById("bookFormCard").hidden = false;
  document.getElementById("bookFormCard").scrollIntoView({ behavior: "smooth" });
});

document.getElementById("cancelBookBtn").addEventListener("click", () => {
  document.getElementById("bookFormCard").hidden = true;
});

// ── Buchformular öffnen (bearbeiten) ─────────────────────────────────────────
function openEditBook(bookId, books) {
  const book = books.find((b) => b.bookId === bookId);
  if (!book) return;

  document.getElementById("bookFormTitle").textContent = "Buch bearbeiten";
  document.getElementById("editBookId").value = book.bookId;
  document.getElementById("bookTitle").value = book.title || "";
  document.getElementById("bookIsbn").value = book.isbn || "";
  document.getElementById("bookYear").value = book.year || "";
  document.getElementById("bookCopies").value = book.totalCopies ?? book.availableCopies ?? 1;
  document.getElementById("bookFormMessage").hidden = true;

  const catSelect = document.getElementById("bookCategory");
  catSelect.value = book.categoryId || "";

  const authSelect = document.getElementById("bookAuthors");
  const selectedAuthorIds = book.authors?.map((a) => a.authorId) || [];
  Array.from(authSelect.options).forEach((opt) => {
    opt.selected = selectedAuthorIds.includes(opt.value);
  });

  document.getElementById("bookFormCard").hidden = false;
  document.getElementById("bookFormCard").scrollIntoView({ behavior: "smooth" });
}

// ── Buchformular absenden ─────────────────────────────────────────────────────
document.getElementById("bookFormEl").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById("bookFormSubmitBtn");
  const msgEl = document.getElementById("bookFormMessage");
  submitBtn.disabled = true;
  msgEl.hidden = true;

  const bookId = document.getElementById("editBookId").value;
  const authSelect = document.getElementById("bookAuthors");
  const authorIds = Array.from(authSelect.selectedOptions).map((o) => o.value);

  const copies = parseInt(document.getElementById("bookCopies").value, 10) || 1;

  const payload = {
    title: document.getElementById("bookTitle").value.trim(),
    isbn: document.getElementById("bookIsbn").value.trim(),
    year: parseInt(document.getElementById("bookYear").value, 10),
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
    const data = await res.json();

    if (!res.ok) {
      msgEl.textContent = data.message || "Fehler beim Speichern.";
      msgEl.className = "message message-error";
      msgEl.hidden = false;
      return;
    }

    document.getElementById("bookFormCard").hidden = true;
    document.getElementById("bookFormEl").reset();
    showToast(bookId ? "Buch erfolgreich aktualisiert." : "Buch erfolgreich angelegt.", "success");
    loadAdminBooks();
    loadStats();
  } catch {
    msgEl.textContent = "Verbindungsfehler. Bitte erneut versuchen.";
    msgEl.className = "message message-error";
    msgEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

// ── Buch löschen ──────────────────────────────────────────────────────────────
async function deleteBook(bookId, title) {
  if (!confirm(`Buch „${title}" wirklich löschen?\nDieser Vorgang kann nicht rückgängig gemacht werden.`)) {
    return;
  }

  try {
    const res = await apiFetch(`/api/books/${bookId}`, { method: "DELETE" });
    if (!res) return;
    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || "Löschen fehlgeschlagen.", "error");
      return;
    }

    showToast(`„${title}" wurde gelöscht.`, "success");
    loadAdminBooks();
    loadStats();
  } catch {
    showToast("Löschen konnte nicht durchgeführt werden.", "error");
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
loadStats();
loadAllLoans();
