const loginForm = document.querySelector("#loginForm");
const registerForm = document.querySelector("#registerForm");
const message = document.querySelector("#message");
const submitButton = document.querySelector("#submitButton");
const registerButton = document.querySelector("#registerButton");
const showLoginButton = document.querySelector("#showLogin");
const showRegisterButton = document.querySelector("#showRegister");
const introText = document.querySelector("#introText");

function showMessage(text, isError = false) {
  message.textContent = text;
  message.className = isError ? "message error" : "message";
  message.style.display = "block";
}

function clearMessage() {
  message.textContent = "";
  message.style.display = "none";
}

function showLoginForm() {
  loginForm.hidden = false;
  registerForm.hidden = true;
  showLoginButton.classList.add("active");
  showRegisterButton.classList.remove("active");
  introText.textContent = "Bitte melde dich mit deinem Loginname und Passwort an.";
  clearMessage();
}

function showRegisterForm() {
  loginForm.hidden = true;
  registerForm.hidden = false;
  showLoginButton.classList.remove("active");
  showRegisterButton.classList.add("active");
  introText.textContent = "Erstelle einen neuen Benutzeraccount fuer die Bibliotheksverwaltung.";
  clearMessage();
}

function saveLogin(data) {
  localStorage.setItem("libraryUser", JSON.stringify(data.user));
  localStorage.setItem("libraryToken", data.token);
}

function openLibraryPage() {
  window.location.href = "/library.html";
}

showLoginButton.addEventListener("click", showLoginForm);
showRegisterButton.addEventListener("click", showRegisterForm);

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  showMessage("Anmeldung wird geprueft...");

  const formData = new FormData(loginForm);

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loginname: formData.get("loginname"),
        password: formData.get("password"),
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || "Anmeldung fehlgeschlagen.");
    }

    saveLogin(data);
    openLibraryPage();
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  registerButton.disabled = true;
  showMessage("Account wird erstellt...");

  const formData = new FormData(registerForm);

  try {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loginname: formData.get("loginname"),
        vorname: formData.get("vorname"),
        name: formData.get("name"),
        password: formData.get("password"),
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || "Registrierung fehlgeschlagen.");
    }

    saveLogin(data);
    registerForm.reset();
    openLibraryPage();
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    registerButton.disabled = false;
  }
});
