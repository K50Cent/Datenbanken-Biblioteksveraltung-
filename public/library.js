const user = JSON.parse(localStorage.getItem("libraryUser") || "null");
const welcomeText = document.querySelector("#welcomeText");
const adminArea = document.querySelector("#adminArea");
const userArea = document.querySelector("#userArea");
const logoutButton = document.querySelector("#logoutButton");

if (!user) {
  window.location.href = "/";
}

if (user) {
  welcomeText.textContent = `Willkommen, ${user.vorname} ${user.name}. Rolle: ${user.role}`;

  if (user.role === "admin") {
    adminArea.hidden = false;
  } else {
    userArea.hidden = false;
  }
}

logoutButton.addEventListener("click", () => {
  localStorage.removeItem("libraryUser");
  localStorage.removeItem("libraryToken");
  window.location.href = "/";
});
