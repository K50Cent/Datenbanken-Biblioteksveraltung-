// ── Auth-Prüfung ──────────────────────────────────────────────────────────────
const token = localStorage.getItem("libraryToken");
const currentUser = JSON.parse(localStorage.getItem("libraryUser") || "null");

if (!token || !currentUser) {
  window.location.href = "/index.html";
}

// ── API-Helper ────────────────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;

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

// ── Zustand ───────────────────────────────────────────────────────────────────
let allBooks = [];
let allCategories = [];

// ── Init ──────────────────────────────────────────────────────────────────────
document.getElementById("navUserName").textContent =
  `${currentUser.vorname} ${currentUser.name}`;

if (currentUser.role === "admin") {
  document.getElementById("adminPanelBtn").hidden = false;
}

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

    if (tab === "loans") loadMyLoans();
    if (tab === "recommendations") loadRecommendations();
  });
});

// Tab-Contents initialisieren
document.querySelectorAll(".tab-content").forEach((c, i) => {
  c.style.display = i === 0 ? "block" : "none";
});

// ── Kategorien laden ──────────────────────────────────────────────────────────
async function loadCategories() {
  try {
    const res = await apiFetch("/api/categories");
    if (!res) return;
    allCategories = await res.json();

    const select = document.getElementById("categoryFilter");
    select.innerHTML = '<option value="">Alle Kategorien</option>';
    allCategories.forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat.categoryId;
      opt.textContent = cat.name;
      select.appendChild(opt);
    });
  } catch {
    // Kategorien konnten nicht geladen werden – kein kritischer Fehler
  }
}

function getCategoryName(categoryId) {
  const cat = allCategories.find((c) => c.categoryId === categoryId);
  return cat ? cat.name : categoryId || "-";
}

// ── Bücher laden & anzeigen ───────────────────────────────────────────────────
async function loadBooks(search = "", category = "") {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (category) params.set("category", category);

  const container = document.getElementById("booksList");
  container.innerHTML = '<div class="empty-state"><p>Bücher werden geladen …</p></div>';

  try {
    const res = await apiFetch(`/api/books?${params}`);
    if (!res) return;
    allBooks = await res.json();
    renderBooks(allBooks);
  } catch {
    container.innerHTML =
      '<div class="empty-state"><h3>Fehler</h3><p>Bücher konnten nicht geladen werden.</p></div>';
  }
}

function renderBooks(books) {
  const container = document.getElementById("booksList");

  if (!books.length) {
    container.innerHTML =
      '<div class="empty-state"><h3>Keine Bücher gefunden</h3><p>Versuche es mit anderen Suchbegriffen.</p></div>';
    return;
  }

  container.innerHTML = books.map((book) => bookCardHTML(book)).join("");

  container.querySelectorAll(".borrow-btn").forEach((btn) => {
    btn.addEventListener("click", () => borrowBook(btn.dataset.bookId, btn.dataset.title));
  });
}

function bookCardHTML(book) {
  const authorNames = book.authors?.length
    ? book.authors.map((a) => `${a.firstname} ${a.name}`).join(", ")
    : (book.author || "-");

  const categoryName = getCategoryName(book.categoryId);

  const isAvailable = book.availableCopies > 0 || (book.availableCopies === undefined && book.available !== false);
  let badgeHTML;
  if (isAvailable) {
    const count = book.availableCopies != null ? ` ${book.availableCopies}/${book.totalCopies || book.availableCopies}` : "";
    badgeHTML = `<span class="avail-badge available">Verfügbar${count}</span>`;
  } else {
    const nextDate = book.nextAvailable ? `– frei ab ${formatDate(book.nextAvailable)}` : "";
    badgeHTML = `<span class="avail-badge unavailable">Ausgeliehen ${nextDate}</span>`;
  }

  const borrowDisabled = isAvailable ? "" : "disabled";

  return `
    <div class="book-card">
      <div class="book-card-title">${escHtml(book.title)}</div>
      <div class="book-card-meta">
        <strong>Autor:</strong> ${escHtml(authorNames)}<br>
        <strong>Kategorie:</strong> ${escHtml(categoryName)}<br>
        <strong>ISBN:</strong> ${escHtml(book.isbn || "-")}&ensp;
        <strong>Jahr:</strong> ${book.year || "-"}
      </div>
      <div class="book-card-footer">
        ${badgeHTML}
        <button class="btn btn-primary btn-sm borrow-btn"
          data-book-id="${book.bookId}"
          data-title="${escAttr(book.title)}"
          ${borrowDisabled}>
          Ausleihen
        </button>
      </div>
    </div>`;
}

// ── Buch ausleihen ────────────────────────────────────────────────────────────
async function borrowBook(bookId, title) {
  try {
    const res = await apiFetch("/api/loans", {
      method: "POST",
      body: JSON.stringify({ bookId }),
    });
    if (!res) return;

    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || "Ausleihe fehlgeschlagen.", "error");
      return;
    }

    showToast(`„${title}" ausgeliehen – zurück bis ${formatDate(data.loan.dueDate)}.`, "success");
    loadBooks(
      document.getElementById("searchInput").value,
      document.getElementById("categoryFilter").value,
    );
    updateLoansBadge();
  } catch {
    showToast("Ausleihe konnte nicht durchgeführt werden.", "error");
  }
}

// ── Meine Ausleihen ───────────────────────────────────────────────────────────
async function loadMyLoans() {
  const container = document.getElementById("loansContent");
  container.innerHTML = "<p>Ausleihen werden geladen …</p>";

  try {
    const res = await apiFetch("/api/loans/my");
    if (!res) return;
    const loans = await res.json();

    updateLoansBadge(loans.length);

    if (!loans.length) {
      container.innerHTML =
        '<div class="empty-state"><h3>Keine aktiven Ausleihen</h3><p>Du hast aktuell keine ausgeliehenen Bücher.</p></div>';
      return;
    }

    const listHTML = loans.map((loan) => loanItemHTML(loan)).join("");
    container.innerHTML = `
      <div class="loan-count-info">Du hast aktuell ${loans.length} Buch${loans.length === 1 ? "" : "bücher"} ausgeliehen.</div>
      <div class="loans-list">${listHTML}</div>`;

    container.querySelectorAll(".return-btn").forEach((btn) => {
      btn.addEventListener("click", () => returnBook(btn.dataset.loanId, btn.dataset.title));
    });
  } catch {
    container.innerHTML =
      '<div class="empty-state"><h3>Fehler</h3><p>Ausleihen konnten nicht geladen werden.</p></div>';
  }
}

function loanItemHTML(loan) {
  const overdue = isOverdue(loan.dueDate);
  const dueLabelClass = overdue ? "overdue-text" : "";
  const itemClass = overdue ? "loan-item overdue" : "loan-item";
  const dueLine = overdue
    ? `Überfällig seit ${formatDate(loan.dueDate)}`
    : `Fällig am ${formatDate(loan.dueDate)}`;
  const title = loan.book?.title || "Unbekanntes Buch";

  return `
    <div class="${itemClass}">
      <div class="loan-item-info">
        <div class="loan-item-title">${escHtml(title)}</div>
        <div class="loan-item-due ${dueLabelClass}">${dueLine}</div>
      </div>
      <button class="btn btn-outline btn-sm return-btn"
        data-loan-id="${loan.loanId}"
        data-title="${escAttr(title)}">
        Zurückgeben
      </button>
    </div>`;
}

// ── Buch zurückgeben ──────────────────────────────────────────────────────────
async function returnBook(loanId, title) {
  try {
    const res = await apiFetch(`/api/loans/${loanId}/return`, { method: "POST" });
    if (!res) return;

    const data = await res.json();
    if (!res.ok) {
      showToast(data.message || "Rückgabe fehlgeschlagen.", "error");
      return;
    }

    showToast(`„${title}" erfolgreich zurückgegeben.`, "success");
    loadMyLoans();
    loadBooks(
      document.getElementById("searchInput").value,
      document.getElementById("categoryFilter").value,
    );
  } catch {
    showToast("Rückgabe konnte nicht durchgeführt werden.", "error");
  }
}

// ── Ausleihen-Badge aktualisieren ─────────────────────────────────────────────
async function updateLoansBadge(count) {
  const badge = document.getElementById("loansBadge");
  if (count === undefined) {
    try {
      const res = await apiFetch("/api/loans/my");
      if (!res) return;
      const loans = await res.json();
      count = loans.length;
    } catch {
      return;
    }
  }
  if (count > 0) {
    badge.textContent = count;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

// ── Empfehlungen ──────────────────────────────────────────────────────────────
async function loadRecommendations() {
  const container = document.getElementById("recommendationsContent");
  container.innerHTML = "<p>Empfehlungen werden geladen …</p>";

  try {
    const res = await apiFetch("/api/recommendations");
    if (!res) return;
    const books = await res.json();

    if (!books.length) {
      container.innerHTML =
        '<div class="empty-state"><h3>Noch keine Empfehlungen</h3><p>Leih mehr Bücher aus, damit wir passende Empfehlungen finden können.</p></div>';
      return;
    }

    container.innerHTML = `<div class="books-grid">${books.map((b) => bookCardHTML(b)).join("")}</div>`;

    container.querySelectorAll(".borrow-btn").forEach((btn) => {
      btn.addEventListener("click", () => borrowBook(btn.dataset.bookId, btn.dataset.title));
    });
  } catch {
    container.innerHTML =
      '<div class="empty-state"><h3>Fehler</h3><p>Empfehlungen konnten nicht geladen werden.</p></div>';
  }
}

// ── Such-Steuerung ────────────────────────────────────────────────────────────
document.getElementById("searchBtn").addEventListener("click", () => {
  loadBooks(
    document.getElementById("searchInput").value.trim(),
    document.getElementById("categoryFilter").value,
  );
});

document.getElementById("searchInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("searchBtn").click();
});

// ── Toast-Nachrichten ─────────────────────────────────────────────────────────
function showToast(text, type = "info") {
  const container = getOrCreateToastContainer();
  const toast = document.createElement("div");
  toast.className = `message message-${type === "success" ? "success" : type === "error" ? "error" : "info"}`;
  toast.style.cssText =
    "position:relative; min-width:260px; max-width:400px; margin-bottom:10px; box-shadow:0 4px 12px rgba(0,0,0,.15);";
  toast.textContent = text;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function getOrCreateToastContainer() {
  let c = document.getElementById("toastContainer");
  if (!c) {
    c = document.createElement("div");
    c.id = "toastContainer";
    c.style.cssText =
      "position:fixed; bottom:24px; right:24px; z-index:9999; display:flex; flex-direction:column; align-items:flex-end;";
    document.body.appendChild(c);
  }
  return c;
}

// ── HTML-Escaping ─────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escAttr(str) {
  return String(str ?? "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ── Start ─────────────────────────────────────────────────────────────────────
Promise.all([loadCategories(), updateLoansBadge()]).then(() => loadBooks());
