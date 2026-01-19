function check() {
  const password = "imallowed";
  const userPw = document.getElementById("pw").value;

  if (userPw === password) {
    window.location.href = "home.html";
  } else {
    alert("Incorrect password");
  }
}