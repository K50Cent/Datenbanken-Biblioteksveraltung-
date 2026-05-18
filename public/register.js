const registerForm = document.querySelector("#registerForm");
const submitBtn = document.querySelector("#submitBtn");
const messageEl = document.querySelector("#message");

function showMessage(text, type = "error") {
  messageEl.textContent = text;
  messageEl.className = `message message-${type}`;
  messageEl.hidden = false;
}

const existingToken = localStorage.getItem("libraryToken");
if (existingToken) {
  fetch("/api/auth/session", {
    headers: { Authorization: `Bearer ${existingToken}` },
  }).then((res) => {
    if (res.ok) {
      window.location.href = "/library.html";
      return;
    }

    localStorage.removeItem("libraryToken");
    localStorage.removeItem("libraryUser");
  }).catch(() => {
    localStorage.removeItem("libraryToken");
    localStorage.removeItem("libraryUser");
  });
}

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  messageEl.hidden = true;

  const formData = new FormData(registerForm);

  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loginname: formData.get("loginname"),
        vorname: formData.get("vorname"),
        name: formData.get("name"),
        password: formData.get("password"),
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) throw new Error(data.message || "Registrierung fehlgeschlagen.");

    localStorage.setItem("libraryToken", data.token);
    localStorage.setItem("libraryUser", JSON.stringify(data.user));

    window.location.href = "/library.html";
  } catch (err) {
    showMessage(err.message);
  } finally {
    submitBtn.disabled = false;
  }
});
