<script setup>
import { computed, onMounted, ref } from 'vue'

const books = ref([])
const members = ref([])
const loans = ref([])
const reviews = ref([])
const categories = ref([])
const payments = ref([])
const stats = ref({})
const user = ref(JSON.parse(localStorage.getItem('libraryUser') || 'null'))
const token = ref(localStorage.getItem('libraryToken') || '')
const authMode = ref('login')
const authForm = ref({
  username: '',
  displayName: '',
  password: '',
})
const profileForm = ref({
  displayName: user.value?.displayName || '',
})
const passwordForm = ref({
  currentPassword: '',
  newPassword: '',
})
const depositAmount = ref('')
const searchTerm = ref('')
const activeView = ref('books')
const message = ref('')
const isError = ref(false)
const isLoading = ref(false)
const editingBook = ref(null)
const editForm = ref({
  title: '',
  author: '',
  isbn: '',
  year: '',
  category: '',
  imageData: '',
})
const form = ref({
  title: '',
  author: '',
  isbn: '',
  year: '',
  category: '',
  imageData: '',
})

const views = [
  { id: 'books', label: 'Bücher' },
  { id: 'add-book', label: 'Buch anlegen' },
  { id: 'loans', label: 'Ausleihen' },
  { id: 'members', label: 'Mitglieder' },
  { id: 'stats', label: 'Auswertung' },
]

const filteredBooks = computed(() => {
  const query = searchTerm.value.trim().toLowerCase()

  if (!query) {
    return books.value
  }

  return books.value.filter((book) =>
    [book.title, book.author, book.isbn, book.category]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query)),
  )
})

const availableCount = computed(() => books.value.filter((book) => book.available).length)
const borrowedCount = computed(() => books.value.length - availableCount.value)
const topRatedBooks = computed(() =>
  [...books.value].sort((a, b) => Number(b.averageRating || 0) - Number(a.averageRating || 0)).slice(0, 5),
)
const martinBooks = computed(() =>
  books.value
    .filter((book) => book.author === 'George R. R. Martin')
    .sort((a, b) => String(a.year).localeCompare(String(b.year))),
)

function setMessage(text, error = false) {
  message.value = text
  isError.value = error
}

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const image = new Image()

      image.onload = () => {
        const maxWidth = 420
        const scale = Math.min(1, maxWidth / image.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(image.width * scale)
        canvas.height = Math.round(image.height * scale)
        const context = canvas.getContext('2d')
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.75))
      }

      image.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'))
      image.src = reader.result
    }

    reader.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'))
    reader.readAsDataURL(file)
  })
}

async function handleImageUpload(event, target) {
  const file = event.target.files?.[0]

  if (!file) {
    return
  }

  if (!file.type.startsWith('image/')) {
    setMessage('Bitte eine Bilddatei auswählen.', true)
    return
  }

  try {
    target.imageData = await resizeImage(file)
  } catch (error) {
    setMessage(error.message, true)
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token.value ? { Authorization: `Bearer ${token.value}` } : {}),
      ...(options.headers || {}),
    },
  })

  if (response.status === 204) {
    return null
  }

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.message || 'Anfrage fehlgeschlagen.')
  }

  return data
}

async function authenticate() {
  const mode = authMode.value
  const endpoint = authMode.value === 'login' ? '/api/auth/login' : '/api/auth/register'
  const payload =
    authMode.value === 'login'
      ? { username: authForm.value.username, password: authForm.value.password }
      : authForm.value

  try {
    const result = await requestJson(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    user.value = result.user
    token.value = result.token
    localStorage.setItem('libraryUser', JSON.stringify(result.user))
    localStorage.setItem('libraryToken', result.token)
    authForm.value = { username: '', displayName: '', password: '' }
    await loadLibrary({ keepMessage: true })
    setMessage(
      mode === 'register'
        ? `Registrierung erfolgreich. Du bist jetzt als ${result.user.displayName} angemeldet.`
        : `Angemeldet als ${result.user.displayName}.`,
    )
  } catch (error) {
    setMessage(error.message, true)
  }
}

function logout() {
  user.value = null
  token.value = ''
  books.value = []
  members.value = []
  loans.value = []
  reviews.value = []
  categories.value = []
  payments.value = []
  stats.value = {}
  localStorage.removeItem('libraryUser')
  localStorage.removeItem('libraryToken')
  setMessage('Du wurdest abgemeldet.')
}

async function loadLibrary({ keepMessage = false } = {}) {
  if (!token.value) {
    return
  }

  isLoading.value = true

  try {
    const data = await requestJson('/api/library')
    books.value = data.books
    members.value = data.members
    loans.value = data.loans
    reviews.value = data.reviews
    categories.value = data.categories
    payments.value = data.payments
    stats.value = data.stats
    user.value = data.currentUser
    profileForm.value.displayName = data.currentUser.displayName
    localStorage.setItem('libraryUser', JSON.stringify(data.currentUser))
    if (!keepMessage) {
      setMessage('')
    }
  } catch (error) {
    setMessage(error.message, true)
  } finally {
    isLoading.value = false
  }
}

function persistAuth(result) {
  user.value = result.user

  if (result.token) {
    token.value = result.token
    localStorage.setItem('libraryToken', result.token)
  }

  profileForm.value.displayName = result.user.displayName
  localStorage.setItem('libraryUser', JSON.stringify(result.user))
}

async function saveProfile() {
  try {
    const result = await requestJson('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(profileForm.value),
    })
    persistAuth(result)
    await loadLibrary({ keepMessage: true })
    setMessage('Profil wurde aktualisiert.')
  } catch (error) {
    setMessage(error.message, true)
  }
}

async function changePassword() {
  try {
    await requestJson('/api/profile/password', {
      method: 'PATCH',
      body: JSON.stringify(passwordForm.value),
    })
    passwordForm.value = { currentPassword: '', newPassword: '' }
    setMessage('Passwort wurde geändert.')
  } catch (error) {
    setMessage(error.message, true)
  }
}

async function depositMoney() {
  try {
    const result = await requestJson('/api/profile/deposit', {
      method: 'POST',
      body: JSON.stringify({ amount: depositAmount.value }),
    })
    persistAuth(result)
    depositAmount.value = ''
    await loadLibrary({ keepMessage: true })
    setMessage('Geld wurde eingezahlt.')
  } catch (error) {
    setMessage(error.message, true)
  }
}

async function addBook() {
  try {
    await requestJson('/api/books', {
      method: 'POST',
      body: JSON.stringify(form.value),
    })
    form.value = { title: '', author: '', isbn: '', year: '', category: '', imageData: '' }
    await loadLibrary()
    activeView.value = 'books'
    setMessage('Buch wurde hinzugefügt.')
  } catch (error) {
    setMessage(error.message, true)
  }
}

function canManageBook(book) {
  return user.value?.role === 'admin' || book.ownerId === user.value?.userId
}

function startEdit(book) {
  editingBook.value = book
  editForm.value = {
    title: book.title,
    author: book.author,
    isbn: book.isbn,
    year: book.year,
    category: book.category,
    imageData: book.imageData,
  }
}

function cancelEdit() {
  editingBook.value = null
}

async function saveEdit() {
  if (!editingBook.value) {
    return
  }

  try {
    await requestJson(`/api/books/${editingBook.value.bookId}`, {
      method: 'PATCH',
      body: JSON.stringify(editForm.value),
    })
    editingBook.value = null
    await loadLibrary()
    setMessage('Buch wurde bearbeitet.')
  } catch (error) {
    setMessage(error.message, true)
  }
}

async function borrowBook(book) {
  const borrowerName = window.prompt(`Wer leiht "${book.title}" aus?`, user.value?.displayName || '')

  if (!borrowerName?.trim()) {
    return
  }

  try {
    await requestJson(`/api/books/${book.bookId}/borrow`, {
      method: 'PATCH',
      body: JSON.stringify({ borrowerName }),
    })
    await loadLibrary()
    setMessage('Buch wurde ausgeliehen.')
  } catch (error) {
    setMessage(error.message, true)
  }
}

async function returnBook(book) {
  try {
    await requestJson(`/api/books/${book.bookId}/return`, {
      method: 'PATCH',
    })
    await askForRating(book)
  } catch (error) {
    setMessage(error.message, true)
  }
}

async function askForRating(book) {
  const ratingInput = window.prompt(`Bewerte "${book.title}" von 1 bis 5 Sternen:`, '5')

  if (!ratingInput) {
    await loadLibrary()
    setMessage('Buch wurde zurückgegeben.')
    return
  }

  const rating = Number(ratingInput)

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    await loadLibrary()
    setMessage('Buch wurde zurückgegeben. Bewertung wurde übersprungen, weil sie nicht zwischen 1 und 5 lag.', true)
    return
  }

  try {
    await requestJson(`/api/books/${book.bookId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    })
    await loadLibrary()
    setMessage(`Buch wurde zurückgegeben und mit ${rating} Sternen bewertet.`)
  } catch (error) {
    await loadLibrary()
    setMessage(`Buch wurde zurückgegeben, aber die Bewertung konnte nicht gespeichert werden: ${error.message}`, true)
  }
}

async function deleteBook(book) {
  if (!window.confirm(`"${book.title}" wirklich löschen?`)) {
    return
  }

  try {
    await requestJson(`/api/books/${book.bookId}`, {
      method: 'DELETE',
    })
    await loadLibrary()
    setMessage('Buch wurde gelöscht.')
  } catch (error) {
    setMessage(error.message, true)
  }
}

function formatDate(value) {
  if (!value) {
    return 'offen'
  }

  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function memberName(memberId) {
  const member = members.value.find((item) => item.memberId === memberId)
  return member ? `${member.firstName} ${member.lastName}` : memberId
}

function bookTitle(bookId) {
  return books.value.find((book) => book.bookId === bookId)?.title || bookId
}

onMounted(() => {
  if (token.value) {
    loadLibrary()
  }
})
</script>

<template>
  <main class="app-shell">
    <header class="hero">
      <div>
        <p class="eyebrow">DynamoDB Local · Express · Vue</p>
        <h1>Bibliotheksverwaltung</h1>
        <p class="hero-copy">
          Bücher, Mitglieder, Ausleihen, Bewertungen und Kennzahlen aus deiner lokalen
          DynamoDB-Datenbank.
        </p>
      </div>
      <button class="refresh-button" type="button" :disabled="isLoading" @click="loadLibrary">
        Aktualisieren
      </button>
    </header>

    <section v-if="!user" class="auth-layout">
      <form class="panel auth-panel" @submit.prevent="authenticate">
        <div class="auth-switch">
          <button type="button" :class="{ active: authMode === 'login' }" @click="authMode = 'login'">
            Anmelden
          </button>
          <button
            type="button"
            :class="{ active: authMode === 'register' }"
            @click="authMode = 'register'"
          >
            Registrieren
          </button>
        </div>
        <h2>{{ authMode === 'login' ? 'Anmeldung' : 'Registrierung' }}</h2>
        <label>
          Benutzername
          <input v-model="authForm.username" required autocomplete="username" />
        </label>
        <label v-if="authMode === 'register'">
          Anzeigename
          <input v-model="authForm.displayName" autocomplete="name" />
        </label>
        <label>
          Passwort
          <input v-model="authForm.password" required type="password" autocomplete="current-password" />
        </label>
        <button class="primary-button" type="submit">
          {{ authMode === 'login' ? 'Anmelden' : 'Account erstellen' }}
        </button>
        <p v-if="message" class="message auth-message" :class="{ 'is-error': isError }">{{ message }}</p>
        <p class="hint">Admin-Zugang: Benutzername <strong>Admin</strong>, Passwort <strong>Admin</strong></p>
      </form>
    </section>

    <template v-else>
      <section class="user-bar">
        <div>
          <span>Angemeldet als</span>
          <strong>{{ user.displayName }}</strong>
          <em>{{ user.role === 'admin' ? 'Admin' : 'Benutzer' }}</em>
          <em>{{ Number(user.balance || 0).toFixed(2) }} €</em>
        </div>
        <div class="user-actions">
          <button class="secondary-button" type="button" @click="activeView = 'profile'">Profil</button>
          <button class="secondary-button" type="button" @click="logout">Abmelden</button>
        </div>
      </section>

    <section class="stats-grid" aria-label="Status">
      <article class="stat-card">
        <span>Gesamt</span>
        <strong>{{ books.length }}</strong>
      </article>
      <article class="stat-card is-available">
        <span>Verfügbar</span>
        <strong>{{ availableCount }}</strong>
      </article>
      <article class="stat-card is-borrowed">
        <span>Ausgeliehen</span>
        <strong>{{ borrowedCount }}</strong>
      </article>
      <article class="stat-card">
        <span>Mitglieder</span>
        <strong>{{ members.length }}</strong>
      </article>
    </section>

    <p v-if="message" class="message" :class="{ 'is-error': isError }">{{ message }}</p>

    <section class="toolbar">
      <div class="tabs" role="tablist" aria-label="Ansichten">
        <button
          v-for="view in views"
          :key="view.id"
          type="button"
          :class="{ active: activeView === view.id }"
          @click="activeView = view.id"
        >
          {{ view.label }}
        </button>
      </div>
      <label class="search-field">
        Suche
        <input v-model="searchTerm" type="search" placeholder="Titel, Autor, ISBN oder Kategorie" />
      </label>
    </section>

    <section v-if="activeView === 'add-book'" class="add-book-page">
      <form class="panel book-form" @submit.prevent="addBook">
        <h2>Buch hinzufügen</h2>
        <label>
          Titel *
          <input v-model="form.title" required autocomplete="off" />
        </label>
        <label>
          Autor *
          <input v-model="form.author" required autocomplete="off" />
        </label>
        <label>
          ISBN
          <input v-model="form.isbn" autocomplete="off" />
        </label>
        <label>
          Erscheinungsjahr
          <input v-model="form.year" type="number" min="0" max="9999" />
        </label>
        <label>
          Kategorie
          <input v-model="form.category" list="categories" autocomplete="off" />
          <datalist id="categories">
            <option v-for="category in categories" :key="category.categoryId" :value="category.name" />
          </datalist>
        </label>
        <label>
          Buchbild
          <input type="file" accept="image/*" @change="handleImageUpload($event, form)" />
        </label>
        <img v-if="form.imageData" class="image-preview" :src="form.imageData" alt="Vorschau des Buchbilds" />
        <button class="primary-button" type="submit">Hinzufügen</button>
      </form>
    </section>

    <section v-if="activeView === 'profile'" class="profile-grid">
      <article class="panel profile-summary">
        <h2>Profil</h2>
        <dl class="large-list">
          <div>
            <dt>Benutzername</dt>
            <dd>{{ user.username }}</dd>
          </div>
          <div>
            <dt>Anzeigename</dt>
            <dd>{{ user.displayName }}</dd>
          </div>
          <div>
            <dt>Rolle</dt>
            <dd>{{ user.role === 'admin' ? 'Admin' : 'Benutzer' }}</dd>
          </div>
          <div>
            <dt>Guthaben</dt>
            <dd>{{ Number(user.balance || 0).toFixed(2) }} €</dd>
          </div>
        </dl>
      </article>

      <form class="panel profile-form" @submit.prevent="saveProfile">
        <h2>Anzeigename ändern</h2>
        <label>
          Anzeigename
          <input v-model="profileForm.displayName" required autocomplete="name" />
        </label>
        <button class="primary-button" type="submit">Speichern</button>
      </form>

      <form class="panel profile-form" @submit.prevent="changePassword">
        <h2>Passwort ändern</h2>
        <label>
          Aktuelles Passwort
          <input v-model="passwordForm.currentPassword" required type="password" autocomplete="current-password" />
        </label>
        <label>
          Neues Passwort
          <input v-model="passwordForm.newPassword" required type="password" autocomplete="new-password" />
        </label>
        <button class="primary-button" type="submit">Passwort ändern</button>
      </form>

      <form class="panel profile-form" @submit.prevent="depositMoney">
        <h2>Geld einzahlen</h2>
        <label>
          Betrag
          <input v-model="depositAmount" required type="number" min="0.01" step="0.01" />
        </label>
        <button class="primary-button" type="submit">Einzahlen</button>
      </form>
    </section>

    <section v-if="activeView === 'books'">
      <div class="books-grid">
        <article v-for="book in filteredBooks" :key="book.bookId" class="book-card">
          <img v-if="book.imageData" class="book-cover" :src="book.imageData" :alt="`Cover von ${book.title}`" />
          <div v-else class="book-cover placeholder-cover">Kein Bild</div>
          <span class="status-pill" :class="book.available ? 'available' : 'borrowed'">
            {{ book.available ? 'Verfügbar' : 'Ausgeliehen' }}
          </span>
          <div>
            <h3>{{ book.title }}</h3>
            <p>{{ book.author }}</p>
          </div>
          <dl>
            <div>
              <dt>Bereitgestellt von</dt>
              <dd>{{ book.ownerName }}</dd>
            </div>
            <div v-if="book.isbn">
              <dt>ISBN</dt>
              <dd>{{ book.isbn }}</dd>
            </div>
            <div v-if="book.year">
              <dt>Jahr</dt>
              <dd>{{ book.year }}</dd>
            </div>
            <div v-if="book.category">
              <dt>Kategorie</dt>
              <dd>{{ book.category }}</dd>
            </div>
            <div>
              <dt>Bewertung</dt>
              <dd>{{ book.averageRating || '0' }} ★ ({{ book.ratingsCount || 0 }})</dd>
            </div>
            <div v-if="!book.available">
              <dt>Ausgeliehen an</dt>
              <dd>{{ book.borrowerName }}</dd>
            </div>
          </dl>
          <div class="actions">
            <button v-if="book.available" class="secondary-button" type="button" @click="borrowBook(book)">
              Ausleihen
            </button>
            <button v-else class="return-button" type="button" @click="returnBook(book)">
              Zurückgeben
            </button>
            <button
              v-if="canManageBook(book)"
              class="secondary-button"
              type="button"
              @click="startEdit(book)"
            >
              Bearbeiten
            </button>
            <button v-if="canManageBook(book)" class="delete-button" type="button" @click="deleteBook(book)">
              Löschen
            </button>
          </div>
        </article>
      </div>
    </section>

    <section v-if="editingBook" class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-book-title">
      <form class="modal-panel edit-book-form" @submit.prevent="saveEdit">
        <div class="modal-heading">
          <div>
            <p class="eyebrow dark">Buch bearbeiten</p>
            <h2 id="edit-book-title">{{ editingBook.title }}</h2>
          </div>
          <button class="icon-button" type="button" aria-label="Schließen" @click="cancelEdit">×</button>
        </div>

        <div class="edit-layout">
          <div class="cover-editor">
            <img
              v-if="editForm.imageData"
              class="edit-cover-preview"
              :src="editForm.imageData"
              alt="Vorschau des Buchbilds"
            />
            <div v-else class="edit-cover-preview placeholder-cover">Kein Bild</div>
            <label>
              Buchbild ändern
              <input type="file" accept="image/*" @change="handleImageUpload($event, editForm)" />
            </label>
          </div>

          <div class="edit-fields">
            <label>
              Titel *
              <input v-model="editForm.title" required autocomplete="off" />
            </label>
            <label>
              Autor *
              <input v-model="editForm.author" required autocomplete="off" />
            </label>
            <label>
              ISBN
              <input v-model="editForm.isbn" autocomplete="off" />
            </label>
            <label>
              Erscheinungsjahr
              <input v-model="editForm.year" type="number" min="0" max="9999" />
            </label>
            <label>
              Kategorie
              <input v-model="editForm.category" list="categories" autocomplete="off" />
            </label>
          </div>
        </div>

        <div class="modal-actions">
          <button class="secondary-button" type="button" @click="cancelEdit">Abbrechen</button>
          <button class="primary-button" type="submit">Änderungen speichern</button>
        </div>
      </form>
    </section>

    <section v-if="activeView === 'loans'" class="panel">
      <h2>Ausleihprozess</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Buch</th>
              <th>Mitglied</th>
              <th>Status</th>
              <th>Ausgeliehen</th>
              <th>Fällig</th>
              <th>Rückgabe</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="loan in loans" :key="loan.loanId">
              <td>{{ bookTitle(loan.bookId) }}</td>
              <td>{{ memberName(loan.memberId) }}</td>
              <td><span class="status-chip">{{ loan.status }}</span></td>
              <td>{{ formatDate(loan.borrowedAt) }}</td>
              <td>{{ formatDate(loan.dueAt) }}</td>
              <td>{{ formatDate(loan.returnedAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="activeView === 'members'" class="cards-grid">
      <article v-for="member in members" :key="member.memberId" class="panel member-card">
        <h2>{{ member.firstName }} {{ member.lastName }}</h2>
        <p>{{ member.email }}</p>
        <div class="member-meta">
          <span>{{ member.role }}</span>
          <strong>{{ Number(member.balance || 0).toFixed(2) }} €</strong>
        </div>
        <p>Aktive Ausleihen: {{ member.activeLoanIds?.length || 0 }}</p>
      </article>
    </section>

    <section v-if="activeView === 'stats'" class="analytics-grid">
      <article class="panel">
        <h2>Aggregation mit Filter</h2>
        <dl class="large-list">
          <div>
            <dt>Durchschnittsbewertung Informatik</dt>
            <dd>{{ stats.avgInformatikRating }}</dd>
          </div>
          <div>
            <dt>Aktive Ausleihen</dt>
            <dd>{{ stats.activeLoans }}</dd>
          </div>
          <div>
            <dt>Überfällige Ausleihen</dt>
            <dd>{{ stats.overdueLoans }}</dd>
          </div>
          <div>
            <dt>Gebühren gesamt</dt>
            <dd>{{ Number(stats.feeSum || 0).toFixed(2) }} €</dd>
          </div>
        </dl>
      </article>

      <article class="panel">
        <h2>4er-Kette</h2>
        <ol class="chain">
          <li>Mitglied: {{ memberName('member-kjell') }}</li>
          <li>Ausleihe: loan-001</li>
          <li>Buch: {{ bookTitle('book-clean-code') }}</li>
          <li>Kategorie: Informatik</li>
        </ol>
      </article>

      <article class="panel">
        <h2>Top bewertet</h2>
        <ol class="rank-list">
          <li v-for="book in topRatedBooks" :key="book.bookId">
            <span>{{ book.title }}</span>
            <strong>{{ book.averageRating }}</strong>
          </li>
        </ol>
      </article>

      <article class="panel">
        <h2>George R. R. Martin</h2>
        <ol class="rank-list">
          <li v-for="book in martinBooks" :key="book.bookId">
            <span>{{ book.year }} · {{ book.title }}</span>
            <strong>{{ book.available ? 'frei' : 'raus' }}</strong>
          </li>
        </ol>
      </article>
    </section>
    </template>
  </main>
</template>
