let allBooks = [];
let cathegorys = [];

async function loadBooks() {
  try {
    const response = await fetch("/api/books");
    allBooks = await response.json();
    cathegorys = [...new Set(allBooks.map(book => book.category))];
    const select = document.getElementById("categoryFilter");
    select.innerHTML = '<option value="">Alle Kategorien</option>';
    cathegorys.forEach(category => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      select.appendChild(option);
    });
    renderBooks(allBooks);
  } catch (error) {
    document.getElementById("books-list").innerHTML = "Fehler beim Laden";
  }
}

function renderBooks(books) {
  const list = document.getElementById("books-list");
  list.innerHTML = "";

  if (!books.length) {
    list.innerHTML = "Keine Bücher gefunden";
    return;
  }

  books.forEach(book => {
    const div = document.createElement("div");
    div.className = "book-item";
    div.innerHTML = `
      <div class="book-title">${book.title}</div>
      <div class="book-meta">
        ISBN: ${book.isbn}<br>
        Jahr: ${book.year}<br>
        Kategorie: ${book.category || "-"}<br>
        Autor: ${book.author || "-"}
      </div>
    `;
    list.appendChild(div);
  });
}

document.addEventListener("DOMContentLoaded", loadBooks);

document.getElementById("searchButton").addEventListener("click", () => {
  const query = document.getElementById("searchInput").value.toLowerCase();
  const category = document.getElementById("categoryFilter").value;

  const filtered = allBooks.filter(book => {
    const matchSearch = 
    book.title.toLowerCase().includes(query) ||
    book.author.toLowerCase().includes(query) ||
    book.category.toLowerCase().includes(query) ||
    book.isbn.includes(query);

    const matchCategory = category === "" || book.category === category;
    return matchCategory && matchSearch;
});

  renderBooks(filtered);
});
