
async function loadBooks() {
  const list = document.getElementById("books-list");
  try{
    const response = await fetch("/api/books"); //ruft get routine auf (await wartet auf antwort) und wandelt in json um
    const books = await response.json();
    list.innerHTML = "";

    if(!books.length) {
      list.innerHTML = "keine Bücher gefunden";
      return;
    }

    books.forEach((book) => { //für jedes buch wird ein div erzeugt und in books-list gehängt
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
  } catch (error) {
    console.error("Fehler beim Laden der Bücher");
    list.innerHTML = "Fehler beim Laden der Bücher";
  }
}

document.addEventListener("DOMContentLoaded", () => { //DOM stellt sicher, dass das script erst läuft, wenn html fertig geladen ist
  if(window.location.pathname.endsWith("library.html")) {
    loadBooks();
  }
});