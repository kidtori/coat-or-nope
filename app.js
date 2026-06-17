const screens = Array.from(document.querySelectorAll(".screen"));
const navLinks = Array.from(document.querySelectorAll("[data-target]"));
const bagOptions = Array.from(document.querySelectorAll(".bag-option"));
const prepForm = document.querySelector(".prep-form");
const stopsList = document.querySelector("#stops-list");
const addStopButton = document.querySelector("#add-stop");
const toast = document.querySelector("#toast");

const locationCache = new Map();
const tripStops = [];
let verdictReady = false;
let stopId = 0;

const defaultStops = [
  { location: "Barcelona, Spain", date: "2026-07-14", days: 4 },
  { location: "London, United Kingdom", date: "2026-07-18", days: 3 }
];

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

function createStopRow(stop = {}) {
  stopId += 1;
  const row = document.createElement("div");
  row.className = "stop-row";
  row.dataset.stopId = String(stopId);

  row.innerHTML = `
    <span class="stop-number" aria-label="Stop number"></span>
    <span class="stop-word going">I am going to</span>
    <span class="location-wrap">
      <input class="text-field city-field location-input" type="text" value="${escapeAttribute(stop.location || "")}" placeholder="City, Country" autocomplete="off" aria-label="City and country">
    </span>
    <span class="stop-word on">on</span>
    <input class="text-field date-field" type="date" value="${escapeAttribute(stop.date || "")}" aria-label="Trip date">
    <span class="stop-word for">for</span>
    <input class="text-field days-field" type="number" min="1" max="30" value="${Number(stop.days || 3)}" aria-label="Number of days">
    <span class="stop-word days">days.</span>
    <button class="remove-stop" type="button" aria-label="Remove stop">&times;</button>
  `;

  stopsList.appendChild(row);
  attachLocationAutocomplete(row.querySelector(".location-input"));
  renumberStops();
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renumberStops() {
  const rows = Array.from(document.querySelectorAll(".stop-row"));

  rows.forEach((row, index) => {
    row.querySelector(".stop-number").textContent = String(index + 1);
    const removeButton = row.querySelector(".remove-stop");
    removeButton.disabled = rows.length === 1;
    removeButton.classList.toggle("is-disabled", rows.length === 1);
  });
}

async function fetchLocations(query) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  if (locationCache.has(trimmed.toLowerCase())) return locationCache.get(trimmed.toLowerCase());

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", trimmed);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "6");
  url.searchParams.set("accept-language", "en");

  try {
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error("Location lookup failed");
    const places = await response.json();
    const mapped = dedupePlaces(places.map(formatPlace).filter(Boolean));
    locationCache.set(trimmed.toLowerCase(), mapped);
    return mapped;
  } catch (error) {
    return [];
  }
}

function dedupePlaces(places) {
  const seen = new Set();
  return places.filter((place) => {
    const key = place.label.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatPlace(place) {
  const address = place.address || {};
  const city = address.city || address.town || address.village || address.municipality || address.county;
  const region = address.state || address.region || "";
  const country = address.country || "";
  const primary = city || place.name || place.display_name?.split(",")[0];
  if (!primary) return null;

  const parts = [primary, region, country].filter(Boolean);
  return {
    label: [...new Set(parts)].join(", "),
    detail: place.display_name,
    lat: place.lat,
    lon: place.lon
  };
}

function attachLocationAutocomplete(input) {
  if (!window.Awesomplete) return attachFallbackLocationAutocomplete(input);

  const autocomplete = new window.Awesomplete(input, {
    minChars: 2,
    maxItems: 6,
    autoFirst: true,
    list: []
  });

  let lookupTimer;
  input._locationOptions = [];

  input.addEventListener("input", () => {
    delete input.dataset.location;
    window.clearTimeout(lookupTimer);
    lookupTimer = window.setTimeout(async () => {
      const options = await fetchLocations(input.value);
      input._locationOptions = options;
      autocomplete.list = options.map((option) => option.label);
      autocomplete.evaluate();
    }, 350);
  });

  input.addEventListener("awesomplete-selectcomplete", () => {
    const selected = input._locationOptions.find((option) => option.label === input.value);
    if (selected) input.dataset.location = JSON.stringify(selected);
  });

  return autocomplete;
}

function attachFallbackLocationAutocomplete(input) {
  const list = document.createElement("ul");
  list.className = "location-suggestions";
  list.hidden = true;
  input.parentElement.appendChild(list);

  let lookupTimer;
  let options = [];

  input.addEventListener("input", () => {
    delete input.dataset.location;
    window.clearTimeout(lookupTimer);

    lookupTimer = window.setTimeout(async () => {
      options = await fetchLocations(input.value);
      renderLocationSuggestions(list, options);
    }, 350);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") list.hidden = true;
  });

  list.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  list.addEventListener("click", (event) => {
    const item = event.target.closest("[data-location-index]");
    if (!item) return;
    const selected = options[Number(item.dataset.locationIndex)];
    if (!selected) return;
    input.value = selected.label;
    input.dataset.location = JSON.stringify(selected);
    list.hidden = true;
  });

  document.addEventListener("click", (event) => {
    if (!input.parentElement.contains(event.target)) list.hidden = true;
  });
}

function renderLocationSuggestions(list, options) {
  list.innerHTML = "";

  if (!options.length) {
    list.hidden = true;
    return;
  }

  options.forEach((option, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.locationIndex = String(index);
    button.innerHTML = `<strong>${escapeHtml(option.label)}</strong><span>${escapeHtml(option.detail)}</span>`;
    item.appendChild(button);
    list.appendChild(item);
  });

  list.hidden = false;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function collectStops() {
  return Array.from(document.querySelectorAll(".stop-row")).map((row) => {
    const locationInput = row.querySelector(".location-input");
    return {
      location: locationInput.value.trim(),
      date: row.querySelector(".date-field").value,
      days: Number(row.querySelector(".days-field").value || 1),
      selectedLocation: locationInput.dataset.location ? JSON.parse(locationInput.dataset.location) : null
    };
  });
}

function syncResultsWithStops(stops) {
  const first = stops[0];
  const second = stops[1] || stops[0];
  const firstCity = shortPlaceName(first?.location || "Barcelona");
  const secondCity = shortPlaceName(second?.location || "London");

  const weatherLocations = document.querySelectorAll(".weather-card p");
  if (weatherLocations[0]) weatherLocations[0].textContent = `Warmest stop: ${firstCity}`;
  if (weatherLocations[1]) weatherLocations[1].textContent = `Chilliest stop: ${secondCity}`;

  const cityTitles = document.querySelectorAll(".city-list h3");
  if (cityTitles[0]) cityTitles[0].lastChild.textContent = ` ${firstCity} (Warm-ish)`;
  if (cityTitles[1]) cityTitles[1].lastChild.textContent = ` ${secondCity} (The Chilly Bit)`;
}

function shortPlaceName(location) {
  return location.split(",")[0].trim() || location;
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
  const stops = collectStops();

  if (stops.some((stop) => !stop.location)) {
    showToast("Name every stop first. The weather hates ambiguity.");
    return;
  }

  tripStops.splice(0, tripStops.length, ...stops);
  syncResultsWithStops(stops);
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
  createStopRow();
  showToast("Another stop added. The suitcase sighs.");
});

stopsList.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".remove-stop");
  if (!removeButton || removeButton.disabled) return;
  removeButton.closest(".stop-row").remove();
  renumberStops();
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

defaultStops.forEach(createStopRow);
setVerdictReady(false);
