const screens = Array.from(document.querySelectorAll(".screen"));
const navLinks = Array.from(document.querySelectorAll("[data-target]"));
const bagOptions = Array.from(document.querySelectorAll(".bag-option"));
const prepForm = document.querySelector(".prep-form");
const addStopButton = document.querySelector("#add-stop");
const toast = document.querySelector("#toast");
let verdictReady = false;

function setVerdictReady(isReady) {
  verdictReady = isReady;

  navLinks
    .filter((link) => link.dataset.target === "results")
    .forEach((link) => {
      link.classList.toggle("is-disabled", !isReady);
      link.setAttribute("aria-disabled", String(!isReady));
    });
}

function showScreen(targetId) {
  if (targetId === "results" && !verdictReady) {
    showToast("Get your verdict first. We need something to judge.");
    return;
  }

  document.body.dataset.screen = targetId;

  screens.forEach((screen) => {
    screen.classList.toggle("is-active", screen.id === targetId);
  });

  navLinks.forEach((link) => {
    link.classList.toggle("is-active", link.dataset.target === targetId);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = link.dataset.target;
    if (!target) return;
    event.preventDefault();
    showScreen(target);
  });
});

prepForm.addEventListener("submit", (event) => {
  event.preventDefault();
  setVerdictReady(true);
  showScreen("results");
});

bagOptions.forEach((option) => {
  option.addEventListener("click", () => {
    bagOptions.forEach((item) => item.classList.remove("is-selected"));
    option.classList.add("is-selected");
  });
});

addStopButton.addEventListener("click", () => {
  showToast("Second stop added in spirit. London is already judging you.");
});

document.querySelectorAll(".secondary-button").forEach((button) => {
  button.addEventListener("click", () => {
    const label = button.textContent.trim();
    if (label.includes("Export")) {
      showToast("Packing list copied. Probably to somewhere useful.");
    } else if (label.includes("Email")) {
      showToast("Pretend email sent. Inbox chaos preserved.");
    } else {
      showToast("Grocery trip emotionally sponsored.");
    }
  });
});

setVerdictReady(false);
