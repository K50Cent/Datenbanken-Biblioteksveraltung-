const loginForm = document.querySelector("#loginForm");
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
  }).then(async (res) => {
    if (!res.ok) {
      localStorage.removeItem("libraryToken");
      localStorage.removeItem("libraryUser");
      return;
    }

    const data = await res.json();
    window.location.href = data.user.role === "admin" ? "/admin.html" : "/library.html";
  }).catch(() => {
    localStorage.removeItem("libraryToken");
    localStorage.removeItem("libraryUser");
  });
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  messageEl.hidden = true;

  const formData = new FormData(loginForm);

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loginname: formData.get("loginname"),
        password: formData.get("password"),
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) throw new Error(data.message || "Anmeldung fehlgeschlagen.");

    localStorage.setItem("libraryToken", data.token);
    localStorage.setItem("libraryUser", JSON.stringify(data.user));

    window.location.href = data.user.role === "admin" ? "/admin.html" : "/library.html";
  } catch (err) {
    showMessage(err.message);
  } finally {
    submitBtn.disabled = false;
  }
});
