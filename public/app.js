const form = document.querySelector("#loginForm");
const message = document.querySelector("#message");
const submitButton = document.querySelector("#submitButton");

function showMessage(text, isError = false) {
  message.textContent = text;
  message.className = isError ? "message error" : "message";
  message.style.display = "block";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  showMessage("Anmeldung wird geprueft...");

  const formData = new FormData(form);

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

    localStorage.setItem("libraryUser", JSON.stringify(data.user));
    localStorage.setItem("libraryToken", data.token);
    showMessage(`Angemeldet als ${data.user.vorname} ${data.user.name} (${data.user.role}).`);
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});
