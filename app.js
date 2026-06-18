window.onerror = function(message, source, lineno, colno, error) {
  console.error("JS Error:", message, "at", source + ":" + lineno + ":" + colno, error);
};

const screens = Array.from(document.querySelectorAll(".screen"));
const navLinks = Array.from(document.querySelectorAll("[data-target]"));
const prepForm = document.querySelector(".prep-form");
const stopsInlineContainer = document.querySelector("#stops-inline-container");
const addStopButton = document.querySelector("#add-stop");
const toast = document.querySelector("#toast");
const loadingOverlay = document.getElementById("loading-overlay");
const loadingMessageText = document.getElementById("loading-message");
const weatherWarningBanner = document.getElementById("weather-warning-banner");

const locationCache = new Map();
const tripStops = [];
let verdictReady = false;

// Temperature Unit state & caching
let currentUnit = localStorage.getItem("coatOrNope_unit") || "C";
let lastProcessedStops = null;
let lastHistoricalCities = null;

function formatTemp(celsiusVal) {
  if (currentUnit === "F") {
    const fahr = Math.round(celsiusVal * 9 / 5 + 32);
    return `${fahr}°F`;
  }
  return `${celsiusVal}°C`;
}

const btnUnitC = document.getElementById("unit-c");
const btnUnitF = document.getElementById("unit-f");

function updateUnitToggleUI() {
  if (btnUnitC && btnUnitF) {
    btnUnitC.classList.toggle("is-active", currentUnit === "C");
    btnUnitF.classList.toggle("is-active", currentUnit === "F");
  }
}

if (btnUnitC && btnUnitF) {
  btnUnitC.addEventListener("click", () => {
    if (currentUnit === "C") return;
    currentUnit = "C";
    localStorage.setItem("coatOrNope_unit", "C");
    updateUnitToggleUI();
    if (lastProcessedStops) {
      renderResults(lastProcessedStops, lastHistoricalCities);
    }
  });

  btnUnitF.addEventListener("click", () => {
    if (currentUnit === "F") return;
    currentUnit = "F";
    localStorage.setItem("coatOrNope_unit", "F");
    updateUnitToggleUI();
    if (lastProcessedStops) {
      renderResults(lastProcessedStops, lastHistoricalCities);
    }
  });
}

// Initial UI setup
updateUnitToggleUI();

// Packing Database
const PACKING_ITEMS_DATABASE = {
  essentials: [],
  weather: {
    freezing: [
      { name: "Heavy Winter Parka", desc: "You will look like a giant marshmallow, but at least you'll be alive.", reuse: false },
      { name: "Thermal Base Layers", desc: "It's what's on the inside that counts when it's freezing.", reuse: false }
    ],
    cold: [
      { name: "The \"Light\" Coat", desc: "The protagonist of this journey. Don't leave it on the plane.", reuse: false },
      { name: "Warm Hoodie", desc: "Layer this under the coat. It's called \"fashion,\" look it up.", reuse: true },
      { name: "Jeans", desc: "Classic, robust, hides tapas/coffee stains well.", reuse: true }
    ],
    rainy: [
      { name: "Raincoat", desc: "To stand out in the gloomy drizzle.", reuse: false },
      { name: "Waterproof Boots", desc: "Because puddles are portals to another dimension.", reuse: true },
      { name: "Extra Socks", desc: "Wet feet = bad mood. Pack double.", reuse: false }
    ],
    sunny: [
      { name: "Light Linen Shirt", desc: "To look like you belong on a yacht you can't afford.", reuse: false },
      { name: "Shorts / Skirts", desc: "Let those legs breathe!", reuse: false }
    ],
    moderate: [
      { name: "Cardigan / Light Sweater", desc: "For when the evening draft hits.", reuse: true },
      { name: "Comfortable Chinos", desc: "Versatile, smart-casual trousers.", reuse: true },
      { name: "Classic T-Shirts", desc: "Perfect for layering.", reuse: false }
    ]
  },
  activities: {
    dining: [
      { name: "Smart Button-Down / Blouse", desc: "One nice top for a fancy dinner.", reuse: false },
      { name: "Tailored Trousers / Dress Pants", desc: "Smart bottoms. Leave the denim behind.", reuse: false },
      { name: "Smart Shoes / Loafers", desc: "To get past the host at the entrance.", reuse: false }
    ],
    swimming: [
      { name: "Swimwear", desc: "One swimsuit or trunks for the pool/beach.", reuse: false },
      { name: "Light Cover-up / Rash Guard", desc: "For walking around the deck or beach.", reuse: false },
      { name: "Flip-flops / Slides", desc: "To protect your feet on hot tiles.", reuse: true }
    ],
    hiking: [
      { name: "Moisture-Wicking Tee", desc: "One synthetic shirt. No cotton (chills fast).", reuse: false },
      { name: "Athletic Shorts / Stretchy Pants", desc: "Flexible bottoms for climbing hills.", reuse: false },
      { name: "Hiking Socks", desc: "One pair of thick, cushioned socks.", reuse: false },
      { name: "Sturdy Trail Shoes", desc: "Sneakers with actual grip on the soles.", reuse: true }
    ],
    business: [
      { name: "Smart Blazer / Jacket", desc: "Instant professionalism booster.", reuse: true },
      { name: "Ironed Collared Shirt / Blouse", desc: "Crisp and clean for the meeting.", reuse: false },
      { name: "Dress Trousers / Chinos", desc: "Professional, smart-casual bottoms.", reuse: false },
      { name: "Smart Dress Shoes / Loafers", desc: "Flat, neat footwear.", reuse: true }
    ],
    workout: [
      { name: "Athletic Tee / Tank", desc: "Breathable shirt for one gym session.", reuse: false },
      { name: "Gym Shorts / Leggings", desc: "Flexible workout bottoms.", reuse: false },
      { name: "Workout Socks", desc: "Separate athletic socks.", reuse: false },
      { name: "Workout Sneakers", desc: "For the gym floor or running path.", reuse: true }
    ],
    snowsports: [
      { name: "Insulated Ski Jacket", desc: "Waterproof outer shell for the slopes.", reuse: false },
      { name: "Waterproof Ski Pants", desc: "Insulated snow pants to stay dry.", reuse: false },
      { name: "Thermal Base Layers", desc: "One set of top and bottom thermals.", reuse: false },
      { name: "Thick Ski Socks", desc: "One pair of long, warm socks.", reuse: false }
    ],
    nightlife: [
      { name: "Clubbing Top / Neat Shirt", desc: "One stylish top for the night out.", reuse: false },
      { name: "Sleek Dark Trousers / Nice Pants", desc: "Smart bottoms that pass club door code.", reuse: false },
      { name: "Nice Dancing Shoes", desc: "Clean shoes that are comfortable enough to stand in.", reuse: false }
    ]
  }
};

function getLocalTodayYmd() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Default setup helper
const todayYmd = getLocalTodayYmd();
document.getElementById("trip-start-date").value = todayYmd;

const defaultStops = [
  { location: "London, United Kingdom", days: 3 },
  { location: "Bali, Indonesia", days: 10 }
];

// Toggle laundry day input field
const laundryAccess = document.getElementById("laundry-access");
const laundryDayWrap = document.getElementById("laundry-day-wrap");
const laundryDayInput = document.getElementById("laundry-day");
const laundryFrequency = document.getElementById("laundry-frequency");
const laundryOptions = document.getElementById("laundry-options");

laundryAccess.addEventListener("change", () => {
  const isChecked = laundryAccess.checked;
  if (laundryOptions) {
    laundryOptions.style.display = isChecked ? "inline-flex" : "none";
  }
  if (laundryDayWrap) {
    laundryDayWrap.style.display = (isChecked && laundryFrequency && laundryFrequency.value === "custom") ? "inline-flex" : "none";
  }
  if (!isChecked) {
    if (laundryDayInput) laundryDayInput.value = "";
  }
});

if (laundryFrequency) {
  laundryFrequency.addEventListener("change", () => {
    if (laundryDayWrap) {
      laundryDayWrap.style.display = (laundryAccess.checked && laundryFrequency.value === "custom") ? "inline-flex" : "none";
    }
  });
}

// Re-wear Tolerance slider control
const rewearSlider = document.getElementById("rewear-slider");
const rewearBadge = document.getElementById("rewear-badge");

if (rewearSlider && rewearBadge) {
  const badgeLabels = {
    "1": "1 wear (Fresh Daily)",
    "2": "2 wears (Normal)",
    "3": "3 wears (Super Re-user)"
  };
  
  rewearSlider.addEventListener("input", (e) => {
    rewearBadge.textContent = badgeLabels[e.target.value] || `${e.target.value} wears`;
  });
  
  // Make tick labels clickable for ease of use
  const sliderLabels = document.querySelector(".slider-labels");
  if (sliderLabels) {
    Array.from(sliderLabels.children).forEach((label, idx) => {
      label.addEventListener("click", () => {
        rewearSlider.value = idx + 1;
        rewearSlider.dispatchEvent(new Event("input"));
      });
    });
  }
}

// Reset app button
document.getElementById("reset-button").addEventListener("click", (e) => {
  e.preventDefault();
  localStorage.removeItem("coatOrNope_tripState");
  location.reload();
});

// Add stop button listener
addStopButton.addEventListener("click", () => {
  createStopRow();
  showToast("Another stop added. Suitcase size adjusted.");
});

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
  }, 2500);
}

// Add days to ISO date string helper
function addDays(dateStr, days) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

// Check if a date string falls inside forecast window (next 14 days)
function isDateInForecastRange(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  
  const diffTime = target - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= 14;
}

// Shift dates back 1 year for archive comparison
function getArchiveDates(startStr, endStr) {
  const s = new Date(startStr);
  const e = new Date(endStr);
  s.setFullYear(s.getFullYear() - 1);
  e.setFullYear(e.getFullYear() - 1);
  return {
    archiveStart: s.toISOString().split("T")[0],
    archiveEnd: e.toISOString().split("T")[0]
  };
}

// Fetch with a hard timeout so we never hang forever
function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function fetchForecastWeather(lat, lon, startStr, endStr) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&start_date=${startStr}&end_date=${endStr}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=auto`;
  try {
    const response = await fetchWithTimeout(url, 8000);
    if (!response.ok) throw new Error("Forecast API failed");
    const json = await response.json();
    return json.daily || null;
  } catch (e) {
    console.error("Forecast fetch failed:", e);
    showToast(`Warning: Forecast API failed (${e.message}). Using fallback averages.`);
    return null;
  }
}

async function fetchArchiveWeather(lat, lon, startStr, endStr) {
  const { archiveStart, archiveEnd } = getArchiveDates(startStr, endStr);
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${archiveStart}&end_date=${archiveEnd}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=auto`;
  try {
    const response = await fetchWithTimeout(url, 8000);
    if (!response.ok) throw new Error("Archive API failed");
    const json = await response.json();
    if (json.daily) {
      // Map historical years back to the requested user dates
      const times = [];
      let cur = new Date(startStr);
      for (let i = 0; i < json.daily.time.length; i++) {
        times.push(cur.toISOString().split("T")[0]);
        cur.setDate(cur.getDate() + 1);
      }
      json.daily.time = times;
      return json.daily;
    }
    return null;
  } catch (e) {
    console.error("Archive fetch failed:", e);
    showToast(`Warning: Historical API failed (${e.message}). Using fallback averages.`);
    return null;
  }
}

// Open-Meteo API Fetcher with automatic split-and-merge for forecast boundary crossings
async function fetchWeather(lat, lon, startStr, endStr) {
  const todayStr = getLocalTodayYmd();
  const forecastMaxStr = addDays(todayStr, 13); // 14 days of forecast including today

  // Case 1: Entirely in the historical archive range
  if (startStr > forecastMaxStr) {
    const archiveDaily = await fetchArchiveWeather(lat, lon, startStr, endStr);
    if (!archiveDaily) return null;
    return { daily: archiveDaily, isHistorical: true, isPartialHistorical: false };
  }

  // Case 2: Entirely in the forecast range
  if (endStr <= forecastMaxStr) {
    const forecastDaily = await fetchForecastWeather(lat, lon, startStr, endStr);
    if (!forecastDaily) return null;
    return { daily: forecastDaily, isHistorical: false, isPartialHistorical: false };
  }

  // Case 3: Overlapping boundary (split & merge)
  try {
    const forecastPartPromise = fetchForecastWeather(lat, lon, startStr, forecastMaxStr);
    const archivePartPromise = fetchArchiveWeather(lat, lon, addDays(forecastMaxStr, 1), endStr);

    const [forecastDaily, archiveDaily] = await Promise.all([forecastPartPromise, archivePartPromise]);

    if (!forecastDaily && !archiveDaily) return null;
    if (!forecastDaily) return { daily: archiveDaily, isHistorical: true, isPartialHistorical: false };
    if (!archiveDaily) return { daily: forecastDaily, isHistorical: false, isPartialHistorical: false };

    // Merge daily arrays
    const mergedDaily = {
      time: [...(forecastDaily.time || []), ...(archiveDaily.time || [])],
      temperature_2m_max: [...(forecastDaily.temperature_2m_max || []), ...(archiveDaily.temperature_2m_max || [])],
      temperature_2m_min: [...(forecastDaily.temperature_2m_min || []), ...(archiveDaily.temperature_2m_min || [])],
      precipitation_sum: [...(forecastDaily.precipitation_sum || []), ...(archiveDaily.precipitation_sum || [])],
      weathercode: [...(forecastDaily.weathercode || []), ...(archiveDaily.weathercode || [])]
    };

    return {
      daily: mergedDaily,
      isHistorical: false,
      isPartialHistorical: true
    };
  } catch (error) {
    console.error("Split-and-merge weather fetch failed:", error);
    return null;
  }
}

// Nominatim Autocomplete & Geocoding Cache
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
    const response = await fetchWithTimeout(url.toString(), 6000);
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

async function geocodeCity(cityStr) {
  const query = cityStr.trim();
  if (query.length < 2) return null;
  const cacheKey = query.toLowerCase();
  
  if (locationCache.has(cacheKey)) {
    const list = locationCache.get(cacheKey);
    if (list && list.length > 0) return list[0];
  }
  
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");
  url.searchParams.set("accept-language", "en");

  try {
    const response = await fetchWithTimeout(url.toString(), 6000);
    if (!response.ok) return null;
    const data = await response.json();
    if (data && data.length > 0) {
      const place = formatPlace(data[0]);
      if (place) {
        locationCache.set(cacheKey, [place]);
        return place;
      }
    }
  } catch (e) {
    console.error("Geocoding failed", e);
  }
  return null;
}

function getDefaultCoordinates(cityName) {
  const name = cityName.toLowerCase();
  if (name.includes("bali")) return { lat: -8.4095, lon: 115.1889, label: "Bali, Indonesia" };
  if (name.includes("london")) return { lat: 51.5074, lon: -0.1278, label: "London, United Kingdom" };
  if (name.includes("barcelona")) return { lat: 41.3851, lon: 2.1734, label: "Barcelona, Spain" };
  if (name.includes("paris")) return { lat: 48.8566, lon: 2.3522, label: "Paris, France" };
  if (name.includes("tokyo")) return { lat: 35.6762, lon: 139.6503, label: "Tokyo, Japan" };
  if (name.includes("new york")) return { lat: 40.7128, lon: -74.0060, label: "New York, USA" };
  if (name.includes("rome")) return { lat: 41.9028, lon: 12.4964, label: "Rome, Italy" };
  if (name.includes("milan")) return { lat: 45.4642, lon: 9.1900, label: "Milan, Italy" };
  if (name.includes("venice")) return { lat: 45.4408, lon: 12.3155, label: "Venice, Italy" };
  if (name.includes("florence")) return { lat: 43.7696, lon: 11.2558, label: "Florence, Italy" };
  if (name.includes("madrid")) return { lat: 40.4168, lon: -3.7038, label: "Madrid, Spain" };
  if (name.includes("lisbon")) return { lat: 38.7223, lon: -9.1393, label: "Lisbon, Portugal" };
  if (name.includes("amsterdam")) return { lat: 52.3676, lon: 4.9041, label: "Amsterdam, Netherlands" };
  if (name.includes("berlin")) return { lat: 52.5200, lon: 13.4050, label: "Berlin, Germany" };
  if (name.includes("munich")) return { lat: 48.1351, lon: 11.5820, label: "Munich, Germany" };
  if (name.includes("vienna")) return { lat: 48.2082, lon: 16.3738, label: "Vienna, Austria" };
  if (name.includes("prague")) return { lat: 50.0755, lon: 14.4378, label: "Prague, Czech Republic" };
  if (name.includes("budapest")) return { lat: 47.4979, lon: 19.0402, label: "Budapest, Hungary" };
  if (name.includes("athens")) return { lat: 37.9838, lon: 23.7275, label: "Athens, Greece" };
  if (name.includes("istanbul")) return { lat: 41.0082, lon: 28.9784, label: "Istanbul, Turkey" };
  if (name.includes("dubai")) return { lat: 25.2048, lon: 55.2708, label: "Dubai, UAE" };
  if (name.includes("singapore")) return { lat: 1.3521, lon: 103.8198, label: "Singapore" };
  if (name.includes("bangkok")) return { lat: 13.7563, lon: 100.5018, label: "Bangkok, Thailand" };
  if (name.includes("seoul")) return { lat: 37.5665, lon: 126.9780, label: "Seoul, South Korea" };
  if (name.includes("sydney")) return { lat: -33.8688, lon: 151.2093, label: "Sydney, Australia" };
  if (name.includes("melbourne")) return { lat: -37.8136, lon: 144.9631, label: "Melbourne, Australia" };
  if (name.includes("los angeles") || name.includes("la ")) return { lat: 34.0522, lon: -118.2437, label: "Los Angeles, USA" };
  if (name.includes("miami")) return { lat: 25.7617, lon: -80.1918, label: "Miami, USA" };
  if (name.includes("san francisco") || name.includes("sf ")) return { lat: 37.7749, lon: -122.4194, label: "San Francisco, USA" };
  if (name.includes("chicago")) return { lat: 41.8781, lon: -87.6298, label: "Chicago, USA" };
  if (name.includes("toronto")) return { lat: 43.6532, lon: -79.3832, label: "Toronto, Canada" };
  if (name.includes("vancouver")) return { lat: 49.2827, lon: -123.1207, label: "Vancouver, Canada" };
  return { lat: 41.3851, lon: 2.1734, label: cityName }; // Fallback to Barcelona
}

// Add stops inline inside natural sentence builder card
function createStopRow(stop = {}) {
  const index = stopsInlineContainer.querySelectorAll(".stop-inline-item").length;
  
  const stopItem = document.createElement("span");
  stopItem.className = "stop-inline-item";
  stopItem.dataset.index = index;

  stopItem.innerHTML = `
    ${index > 0 ? '<span class="sentence-arrow">→</span>' : ''}
    <span class="location-input-wrapper">
      <input class="text-field sentence-location-field location-input" type="text" value="${escapeAttribute(stop.location || "")}" placeholder="City, Country" autocomplete="off" aria-label="City and country" required>
    </span>
    <span class="sentence-word">for</span>
    <input class="text-field sentence-nights-field days-field" type="number" min="1" max="30" value="${Number(stop.days || 3)}" aria-label="Nights" required>
    <span class="sentence-word">nights</span>
    ${index > 0 ? '<button class="remove-stop-inline" type="button" aria-label="Remove stop">&times;</button>' : ''}
  `;

  stopsInlineContainer.appendChild(stopItem);

  const locInput = stopItem.querySelector(".location-input");
  if (stop.selectedLocation) {
    locInput.dataset.location = JSON.stringify(stop.selectedLocation);
  }
  attachLocationAutocomplete(locInput);

  if (index > 0) {
    stopItem.querySelector(".remove-stop-inline").addEventListener("click", () => {
      stopItem.remove();
      renumberInlineStops();
      showToast("Stop removed. Suitcase size adjusted.");
    });
  }
}

function renumberInlineStops() {
  const items = Array.from(stopsInlineContainer.querySelectorAll(".stop-inline-item"));
  items.forEach((item, index) => {
    item.dataset.index = index;
    
    // Fix Arrow
    const arrow = item.querySelector(".sentence-arrow");
    if (index === 0 && arrow) {
      arrow.remove();
    } else if (index > 0 && !arrow) {
      const arrowSpan = document.createElement("span");
      arrowSpan.className = "sentence-arrow";
      arrowSpan.textContent = "→";
      item.insertBefore(arrowSpan, item.firstChild);
    }

    // Fix Remove Button
    const removeBtn = item.querySelector(".remove-stop-inline");
    if (index === 0 && removeBtn) {
      removeBtn.remove();
    } else if (index > 0 && !removeBtn) {
      const btn = document.createElement("button");
      btn.className = "remove-stop-inline";
      btn.type = "button";
      btn.ariaLabel = "Remove stop";
      btn.innerHTML = "&times;";
      btn.addEventListener("click", () => {
        item.remove();
        renumberInlineStops();
        showToast("Stop removed. Suitcase size adjusted.");
      });
      item.appendChild(btn);
    }
  });
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function attachLocationAutocomplete(input) {
  if (!window.Awesomplete) return;

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
    if (selected) {
      input.dataset.location = JSON.stringify(selected);
    }
  });

  return autocomplete;
}

function collectStops() {
  return Array.from(stopsInlineContainer.querySelectorAll(".stop-inline-item")).map((item) => {
    const locationInput = item.querySelector(".location-input");
    const daysInput = item.querySelector(".days-field");
    return {
      location: locationInput.value.trim(),
      days: Number(daysInput.value || 1),
      selectedLocation: locationInput.dataset.location ? JSON.parse(locationInput.dataset.location) : null
    };
  });
}

function shortPlaceName(location) {
  return location.split(",")[0].trim() || location;
}

// Weather classification rules (Celsius)
function classifyWeather(maxTemp, minTemp, rainSum, weatherCodes) {
  if (minTemp < 0) return "freezing";
  if (minTemp < 11) return "cold";
  
  // WMO codes representing rain/snow showers or drizzle
  const rainCodes = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];
  const snowCodes = [71, 73, 75, 77, 85, 86];
  const hasRainCode = weatherCodes.some(code => rainCodes.includes(code) || snowCodes.includes(code));
  
  if (rainSum > 1.0 || hasRainCode) return "rainy";
  if (maxTemp > 24) return "sunny";
  return "moderate";
}

function getWeatherClassLabel(weatherClass) {
  switch (weatherClass) {
    case "freezing": return "Freezing Cold";
    case "cold": return "Chilly & Cool";
    case "rainy": return "Wet & Soggy";
    case "sunny": return "Sunny & Warm";
    default: return "Moderate Temps";
  }
}

function getWeatherEmojiAndDesc(code) {
  switch (code) {
    case 0: return { emoji: "☀️", desc: "Clear Sky" };
    case 1: return { emoji: "🌤️", desc: "Mainly Clear" };
    case 2: return { emoji: "⛅", desc: "Partly Cloudy" };
    case 3: return { emoji: "☁️", desc: "Overcast" };
    case 45:
    case 48: return { emoji: "🌫️", desc: "Foggy" };
    case 51:
    case 53:
    case 55: return { emoji: "🌧️", desc: "Drizzle" };
    case 56:
    case 57: return { emoji: "🌧️", desc: "Freezing Drizzle" };
    case 61:
    case 63:
    case 65: return { emoji: "🌧️", desc: "Rainy" };
    case 66:
    case 67: return { emoji: "🌧️", desc: "Freezing Rain" };
    case 71:
    case 73:
    case 75: return { emoji: "❄️", desc: "Snowing" };
    case 77: return { emoji: "❄️", desc: "Snow Grains" };
    case 80:
    case 81:
    case 82: return { emoji: "🌧️", desc: "Rain Showers" };
    case 85:
    case 86: return { emoji: "❄️", desc: "Snow Showers" };
    case 95: return { emoji: "⛈️", desc: "Thunderstorm" };
    case 96:
    case 99: return { emoji: "⛈️", desc: "Stormy w/ Hail" };
    default: return { emoji: "🌡️", desc: "Clear" };
  }
}

function formatDateShort(dateStr) {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const options = { weekday: 'short', month: 'short', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

// Master execution workflow
prepForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  
  // Validate clothing types selections
  const hasTop = document.querySelectorAll(".clothing-types-line input[id^='top-']:checked").length > 0;
  const hasBottom = document.querySelectorAll(".clothing-types-line input[id^='bot-']:checked").length > 0;
  const hasOnePiece = document.querySelectorAll(".clothing-types-line input[id^='one-']:checked").length > 0;
  
  if (!((hasTop && hasBottom) || hasOnePiece)) {
    showToast("Select at least one complete outfit type (either a top & bottom, or a one-piece / suit).");
    return;
  }

  const stops = collectStops();

  if (stops.some((stop) => !stop.location)) {
    showToast("Name every stop first. The weather hates ambiguity.");
    return;
  }

  // Validate laundry day
  const isLaundryChecked = laundryAccess.checked;
  const laundryFrequencyEl = document.getElementById("laundry-frequency");
  const laundryFrequencyVal = laundryFrequencyEl ? laundryFrequencyEl.value : "halfway";
  const laundryDayVal = Number(laundryDayInput.value);
  const totalNights = stops.reduce((sum, s) => sum + s.days, 0);

  if (isLaundryChecked && laundryFrequencyVal === "custom" && laundryDayVal && laundryDayVal > totalNights) {
    showToast(`Laundry day can't be after the trip ends (${totalNights} nights).`);
    return;
  }

  // Show loading screen
  loadingOverlay.hidden = false;
  const loadingMessages = [
    "Consulting the weather gods...",
    "Checking if you'll freeze in your destinations...",
    "Judging your fashion choices based on precipitation...",
    "Calculating exactly how many socks you'll lose...",
    "Analyzing luggage density vs. travel anxiety...",
    "Checking if your destinations are still there..."
  ];
  let msgIndex = 0;
  loadingMessageText.textContent = loadingMessages[0];
  const messageTimer = setInterval(() => {
    msgIndex = (msgIndex + 1) % loadingMessages.length;
    loadingMessageText.textContent = loadingMessages[msgIndex];
  }, 1100);

  function dismissLoading() {
    clearTimeout(safetyTimer);
    clearInterval(messageTimer);
    loadingOverlay.hidden = true;
  }

  // Hard safety — always dismiss after 12s no matter what
  const safetyTimer = setTimeout(() => dismissLoading(), 12000);

  // Parse starting date and continuous nights sequence
  let currentDate = document.getElementById("trip-start-date").value;
  if (!currentDate) currentDate = todayYmd;

  const processedStops = [];
  let historicalCities = [];

  try {
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      const stopStartDate = currentDate;
      const stopEndDate = addDays(stopStartDate, stop.days);
      currentDate = stopEndDate;

      // --- Resolve Coordinates ---
      // Use pre-selected coords if available (user picked from autocomplete dropdown)
      let lat, lon, displayName;
      if (stop.selectedLocation) {
        lat = parseFloat(stop.selectedLocation.lat);
        lon = parseFloat(stop.selectedLocation.lon);
        displayName = stop.selectedLocation.label;
      } else {
        // Try to geocode via API with a tight race, fall back to built-in lookup
        const geocodePromise = geocodeCity(stop.location);
        const raceTimeout = new Promise(resolve => setTimeout(() => resolve(null), 5000));
        const geocoded = await Promise.race([geocodePromise, raceTimeout]);
        if (geocoded) {
          lat = parseFloat(geocoded.lat);
          lon = parseFloat(geocoded.lon);
          displayName = geocoded.label;
        } else {
          const fallback = getDefaultCoordinates(stop.location);
          lat = fallback.lat;
          lon = fallback.lon;
          displayName = fallback.label;
        }
      }

      // --- Fetch Weather (race against timeout, fallback to heuristics) ---
      const weatherPromise = fetchWeather(lat, lon, stopStartDate, stopEndDate);
      const weatherTimeout = new Promise(resolve => setTimeout(() => resolve(null), 6000));
      const weatherResult = await Promise.race([weatherPromise, weatherTimeout]);

      let maxTemp = 18;
      let minTemp = 8;
      let totalRain = 0;
      let wmoCodes = [];
      let usedArchive = false;
      let usedPartial = false;
      let isFallbackUsed = false;
      let maxTempDate = stopStartDate;
      let minTempDate = stopStartDate;
      const stopDaysData = [];

      if (weatherResult && weatherResult.daily && weatherResult.daily.time) {
        const daily = weatherResult.daily;
        maxTemp = Math.max(...(daily.temperature_2m_max || [18]));
        minTemp = Math.min(...(daily.temperature_2m_min || [8]));

        if (daily.temperature_2m_max && daily.time) {
          const maxIdx = daily.temperature_2m_max.indexOf(maxTemp);
          if (maxIdx !== -1) maxTempDate = daily.time[maxIdx];
        }
        if (daily.temperature_2m_min && daily.time) {
          const minIdx = daily.temperature_2m_min.indexOf(minTemp);
          if (minIdx !== -1) minTempDate = daily.time[minIdx];
        }

        totalRain = (daily.precipitation_sum || []).reduce((a, b) => a + b, 0);
        wmoCodes = daily.weathercode || [];
        usedArchive = weatherResult.isHistorical;
        usedPartial = weatherResult.isPartialHistorical || false;

        const limit = Math.min(stop.days, daily.time ? daily.time.length : stop.days);
        for (let d = 0; d < limit; d++) {
          stopDaysData.push({
            date: daily.time[d],
            city: shortPlaceName(displayName),
            maxTemp: Math.round(daily.temperature_2m_max ? daily.temperature_2m_max[d] : 18),
            minTemp: Math.round(daily.temperature_2m_min ? daily.temperature_2m_min[d] : 8),
            precip: daily.precipitation_sum ? daily.precipitation_sum[d] : 0,
            wcode: daily.weathercode ? daily.weathercode[d] : 0
          });
        }
      } else {
        // Heuristic fallback when API unavailable
        isFallbackUsed = true;
        const n = displayName.toLowerCase();
        if (n.includes("bali") || n.includes("singapore") || n.includes("thailand") || n.includes("indonesia") || n.includes("malaysia") || n.includes("vietnam") || n.includes("cambodia") || n.includes("miami") || n.includes("dubai") || n.includes("cancun")) {
          maxTemp = 32; minTemp = 24; totalRain = 10;
        } else if (n.includes("london") || n.includes("manchester") || n.includes("edinburgh") || n.includes("dublin") || n.includes("amsterdam") || n.includes("brussels") || n.includes("oslo") || n.includes("reykjavik")) {
          maxTemp = 14; minTemp = 6; totalRain = 3;
        } else if (n.includes("new york") || n.includes("chicago") || n.includes("toronto") || n.includes("montreal") || n.includes("boston")) {
          maxTemp = 18; minTemp = 4; totalRain = 2;
        } else if (n.includes("paris") || n.includes("barcelona") || n.includes("madrid") || n.includes("rome") || n.includes("milan") || n.includes("lisbon")) {
          maxTemp = 22; minTemp = 12; totalRain = 1;
        } else if (n.includes("tokyo") || n.includes("osaka") || n.includes("seoul") || n.includes("beijing") || n.includes("shanghai")) {
          maxTemp = 20; minTemp = 10; totalRain = 2;
        } else if (n.includes("sydney") || n.includes("melbourne") || n.includes("auckland") || n.includes("perth")) {
          maxTemp = 24; minTemp = 14; totalRain = 1;
        }

        for (let d = 0; d < stop.days; d++) {
          stopDaysData.push({
            date: addDays(stopStartDate, d),
            city: shortPlaceName(displayName),
            maxTemp, minTemp,
            precip: totalRain / Math.max(stop.days, 1),
            wcode: totalRain > 3 ? 61 : 0
          });
        }
      }

      if (usedArchive) historicalCities.push(shortPlaceName(displayName));

      const weatherClass = classifyWeather(maxTemp, minTemp, totalRain, wmoCodes);
      processedStops.push({
        location: displayName,
        shortName: shortPlaceName(displayName),
        days: stop.days,
        maxTemp: Math.round(maxTemp),
        minTemp: Math.round(minTemp),
        maxTempDate,
        minTempDate,
        weatherClass,
        isHistorical: usedArchive,
        isPartialHistorical: usedPartial,
        isFallbackUsed: isFallbackUsed,
        daysForecast: stopDaysData
      });
    }

    // Save state
    try {
      localStorage.setItem("coatOrNope_tripState", JSON.stringify({
        startDate: document.getElementById("trip-start-date").value,
        stops,
        laundryChecked: laundryAccess.checked,
        laundryFrequency: laundryFrequency ? laundryFrequency.value : "halfway",
        laundryDay: laundryDayInput.value,
        bagLimit: document.getElementById("bag-limit").value,
        rewearTolerance: rewearSlider ? rewearSlider.value : "2",
        activities: Array.from(document.querySelectorAll(".activity-line input[type='checkbox']:checked")).map(el => el.id),
        clothingTypes: Array.from(document.querySelectorAll(".clothing-types-line input[type='checkbox']:checked")).map(el => el.id)
      }));
    } catch (e) {
      console.warn("Storage write blocked", e);
    }

    renderResults(processedStops, historicalCities);
    setVerdictReady(true);
    showScreen("results");

  } catch (error) {
    console.error("Pipeline failed:", error);
    if (processedStops.length > 0) {
      renderResults(processedStops, historicalCities);
      setVerdictReady(true);
      showScreen("results");
    } else {
      showToast("Something went wrong. Try again or check the browser console.");
    }
  } finally {
    dismissLoading();
  }
});

function shouldIncludeWeatherItem(itemName, selections, stops = []) {
  const name = itemName.toLowerCase();
  if (name.includes("hoodie")) return selections.topHoodie;
  if (name.includes("jeans")) return selections.botJeans;
  if (name.includes("linen shirt")) return selections.topShirt;
  if (name.includes("shorts / skirts")) return (selections.botShorts || selections.botSkirt);
  if (name.includes("cardigan") || name.includes("sweater")) return selections.topSweater;
  if (name.includes("chinos")) return selections.botChinos;
  if (name.includes("t-shirt")) return selections.topTshirt;

  // Rain gear weighting system
  const allDays = [];
  stops.forEach(s => {
    if (s.daysForecast) {
      allDays.push(...s.daysForecast);
    }
  });
  const WMO_RAIN_CODES = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99, 71, 73, 75, 77, 85, 86];
  const rainyDays = allDays.filter(day => day.precip > 1.0 || WMO_RAIN_CODES.includes(day.wcode));
  const rainyDaysCount = rainyDays.length;
  const totalDaysCount = allDays.length || 1;

  if (name.includes("waterproof boots")) {
    if (rainyDaysCount === 0) return false;
    
    // 1. Hiking activity checked and there's a rainy stop
    const isHiking = document.getElementById("act-hiking") && document.getElementById("act-hiking").checked;
    if (isHiking) return true;

    // 2. Trip is cold/freezing AND rainy
    const hasColdRain = stops.some(s => {
      const sRainy = s.daysForecast && s.daysForecast.some(day => day.precip > 1.0 || WMO_RAIN_CODES.includes(day.wcode));
      return s.minTemp < 10 && sRainy;
    });
    if (hasColdRain) return true;

    // 3. Proportion of rainy days is high (at least 3 days OR >= 30% of total days)
    if (rainyDaysCount >= 3 || (rainyDaysCount / totalDaysCount) >= 0.3) {
      return true;
    }

    return false;
  }

  if (name.includes("raincoat")) {
    return rainyDaysCount > 0;
  }

  if (name.includes("extra socks")) {
    return rainyDaysCount >= 2;
  }

  return true;
}

function getSuggestedOutfitForDay(dayClass, selections) {
  const { topTshirt, topShirt, topSweater, topHoodie, botJeans, botChinos, botShorts, botSkirt, oneDress, oneJumpsuit, oneSuit } = selections;

  // 1. Check one-piece options
  if (dayClass === "sunny" || dayClass === "moderate") {
    if (oneDress) return [{ text: "Dress", type: "onepiece", icon: "👗" }];
    if (oneJumpsuit) return [{ text: "Jumpsuit / Romper", type: "onepiece", icon: "🥋" }];
    if (oneSuit) return [{ text: "Suit Combo", type: "onepiece", icon: "👔" }];
  } else if (dayClass === "cold" || dayClass === "freezing") {
    if (oneSuit) return [{ text: "Suit Combo (Layered)", type: "onepiece", icon: "👔" }];
  }

  // 2. Resolve Top
  let topItem = null;
  if (topTshirt && topShirt) {
    topItem = { text: dayClass === "sunny" ? "T-Shirt" : "Button-down", type: "top", icon: "👕" };
  } else if (topTshirt) {
    topItem = { text: "T-Shirt", type: "top", icon: "👕" };
  } else if (topShirt) {
    topItem = { text: "Button-down", type: "top", icon: "👕" };
  } else {
    // Fallbacks if no tops checked
    if (oneDress) return [{ text: "Dress", type: "onepiece", icon: "👗" }];
    if (oneJumpsuit) return [{ text: "Jumpsuit / Romper", type: "onepiece", icon: "🥋" }];
    if (oneSuit) return [{ text: "Suit Combo", type: "onepiece", icon: "👔" }];
    topItem = { text: "T-Shirt", type: "top", icon: "👕" };
  }

  // 3. Resolve Bottom
  let bottomItem = null;
  if (dayClass === "sunny") {
    if (botShorts) bottomItem = { text: "Shorts", type: "bottom", icon: "🩳" };
    else if (botSkirt) bottomItem = { text: "Skirt", type: "bottom", icon: "👗" };
    else if (botJeans) bottomItem = { text: "Jeans", type: "bottom", icon: "👖" };
    else if (botChinos) bottomItem = { text: "Chinos", type: "bottom", icon: "👖" };
    else bottomItem = { text: "Pants", type: "bottom", icon: "👖" };
  } else {
    if (botJeans) bottomItem = { text: "Jeans", type: "bottom", icon: "👖" };
    else if (botChinos) bottomItem = { text: "Chinos", type: "bottom", icon: "👖" };
    else if (botSkirt) bottomItem = { text: "Skirt", type: "bottom", icon: "👗" };
    else if (botShorts) bottomItem = { text: "Shorts", type: "bottom", icon: "🩳" };
    else bottomItem = { text: "Pants", type: "bottom", icon: "👖" };
  }

  const layers = [topItem, bottomItem];

  // 4. Resolve Layers
  if (dayClass === "freezing") {
    layers.push({ text: "Winter Parka", type: "outer", icon: "🧥" });
    if (topSweater) {
      topItem.text = "Thermal + Sweater";
    } else if (topHoodie) {
      topItem.text = "Thermal + Hoodie";
    } else {
      topItem.text = "Thermal + " + topItem.text;
    }
  } else if (dayClass === "cold") {
    layers.push({ text: "Light Coat", type: "outer", icon: "🧥" });
    if (topSweater) {
      layers.splice(0, 1, { text: "Sweater", type: "outer", icon: "🧶" }, topItem);
    } else if (topHoodie) {
      layers.splice(0, 1, { text: "Hoodie", type: "outer", icon: "🧥" }, topItem);
    }
  } else if (dayClass === "rainy") {
    layers.push({ text: "Raincoat", type: "outer", icon: "🧥" });
  } else if (dayClass === "moderate") {
    if (topSweater) {
      layers.push({ text: "Sweater", type: "outer", icon: "🧶" });
    } else if (topHoodie) {
      layers.push({ text: "Hoodie", type: "outer", icon: "🧥" });
    }
  }

  return layers;
}

function renderResults(stops, historicalCities) {
  lastProcessedStops = stops;

  const realHistoricalCities = [...new Set(stops.filter(s => s.isHistorical).map(s => s.shortName))];
  const partialHistoricalCities = [...new Set(stops.filter(s => s.isPartialHistorical).map(s => s.shortName))];
  lastHistoricalCities = realHistoricalCities;

  // Calculate first historical day for banner description
  const allDays = [];
  stops.forEach(s => {
    if (s.daysForecast) {
      allDays.push(...s.daysForecast);
    }
  });

  const todayStr = getLocalTodayYmd();
  const forecastMaxStr = addDays(todayStr, 13);
  let firstHistoricalDayNumber = null;
  let firstHistoricalDateFormatted = null;

  for (let i = 0; i < allDays.length; i++) {
    if (allDays[i].date > forecastMaxStr) {
      firstHistoricalDayNumber = i + 1;
      firstHistoricalDateFormatted = formatDateFriendly(allDays[i].date);
      break;
    }
  }

  const fallbackCities = [...new Set(stops.filter(s => s.isFallbackUsed).map(s => s.shortName))];

  // 1. Show Historical average weather warning banner if any stop is archive-based or failed
  if (fallbackCities.length > 0) {
    const listStr = fallbackCities.join(" & ");
    weatherWarningBanner.innerHTML = `⚠️ Warning: We couldn't reach the live weather service for <strong>${listStr}</strong>. Showing fallback regional climate averages.`;
    weatherWarningBanner.style.display = "block";
  } else if (realHistoricalCities.length > 0 && partialHistoricalCities.length === 0) {
    const listStr = realHistoricalCities.join(" & ");
    weatherWarningBanner.innerHTML = `⚠️ Note: Your trip to <strong>${listStr}</strong> is far in the future. We used historical averages from previous years. Pack according to averages and check back closer to your departure!`;
    weatherWarningBanner.style.display = "block";
  } else if (partialHistoricalCities.length > 0 || realHistoricalCities.length > 0) {
    const listStr = [...new Set([...realHistoricalCities, ...partialHistoricalCities])].join(" & ");
    const dayText = firstHistoricalDayNumber 
      ? `From <strong>Day ${firstHistoricalDayNumber} (${firstHistoricalDateFormatted})</strong> onwards, we are predicting using historical climate averages.`
      : `We merged real-time forecasts with historical averages for the later dates.`;
    
    weatherWarningBanner.innerHTML = `⚠️ Note: Part of your trip to <strong>${listStr}</strong> is beyond our 14-day forecast window. ${dayText}`;
    weatherWarningBanner.style.display = "block";
  } else {
    weatherWarningBanner.style.display = "none";
  }

  // 1.5. Render Trip Summary Header
  const tripSummaryHeader = document.getElementById("trip-summary-header");
  const totalNights = stops.reduce((sum, s) => sum + s.days, 0);
  const startDateVal = document.getElementById("trip-start-date").value || todayYmd;
  const endDateVal = addDays(startDateVal, totalNights);
  const formattedStart = formatDateFriendly(startDateVal);
  const formattedEnd = formatDateFriendly(endDateVal);
  const stopsSummary = stops.map(s => `${s.shortName} (${s.days} night${s.days > 1 ? 's' : ''})`).join(" → ");
  tripSummaryHeader.innerHTML = `
    <h3>Trip to ${stopsSummary}</h3>
    <p>From ${formattedStart} to ${formattedEnd} &bull; Total duration: ${totalNights} night${totalNights > 1 ? 's' : ''}</p>
  `;

  // 2. Compute extremes for Outlook cards
  let absoluteMax = -100;
  let absoluteMin = 100;
  let hottestStop = stops[0];
  let coldestStop = stops[0];
  let absoluteMaxDate = stops[0].maxTempDate;
  let absoluteMinDate = stops[0].minTempDate;

  stops.forEach((s) => {
    if (s.maxTemp > absoluteMax) {
      absoluteMax = s.maxTemp;
      hottestStop = s;
      absoluteMaxDate = s.maxTempDate;
    }
    if (s.minTemp < absoluteMin) {
      absoluteMin = s.minTemp;
      coldestStop = s;
      absoluteMinDate = s.minTempDate;
    }
  });

  const maxDateFormatted = formatDateFriendly(absoluteMaxDate);
  const minDateFormatted = formatDateFriendly(absoluteMinDate);



  const WMO_RAIN_CODES = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99, 71, 73, 75, 77, 85, 86];
  const rainyDays = allDays.filter(day => day.precip > 1.0 || WMO_RAIN_CODES.includes(day.wcode));
  const rainyDaysCount = rainyDays.length;
  const totalDaysCount = allDays.length;

  const weatherGrid = document.querySelector(".outlook .weather-grid");
  weatherGrid.innerHTML = `
    <article class="weather-card heat">
      <span>Max Heat</span>
      <strong>${formatTemp(absoluteMax)}</strong>
      <p>Expected on ${maxDateFormatted} in ${hottestStop.shortName}</p>
      <svg aria-hidden="true"><use href="#icon-sun"></use></svg>
    </article>
    <article class="weather-card freeze">
      <span>Deep Freeze</span>
      <strong>${formatTemp(absoluteMin)}</strong>
      <p>Expected on ${minDateFormatted} in ${coldestStop.shortName}</p>
      <svg aria-hidden="true"><use href="#icon-snow"></use></svg>
    </article>
    <article class="weather-card rain">
      <span>Rainy Days</span>
      <strong>${rainyDaysCount}</strong>
      <b>/ ${totalDaysCount}</b>
      <p>${rainyDaysCount > 0 ? `${rainyDaysCount} day${rainyDaysCount > 1 ? 's' : ''} of rain expected` : 'Dry skies forecast!'}</p>
      <svg aria-hidden="true"><use href="#icon-rain"></use></svg>
    </article>
  `;

  // Build and render day-by-day table
  const forecastTableBody = document.getElementById("forecast-table-body");
  forecastTableBody.innerHTML = "";

  const selections = {
    topTshirt: document.getElementById("top-tshirt").checked,
    topShirt: document.getElementById("top-shirt").checked,
    topSweater: document.getElementById("top-sweater").checked,
    topHoodie: document.getElementById("top-hoodie").checked,
    botJeans: document.getElementById("bot-jeans").checked,
    botChinos: document.getElementById("bot-chinos").checked,
    botShorts: document.getElementById("bot-shorts").checked,
    botSkirt: document.getElementById("bot-skirt").checked,
    oneDress: document.getElementById("one-dress").checked,
    oneJumpsuit: document.getElementById("one-jumpsuit").checked,
    oneSuit: document.getElementById("one-suit").checked,
    undUnderwear: document.getElementById("und-underwear").checked,
    undSocks: document.getElementById("und-socks").checked,
    undBras: document.getElementById("und-bras").checked
  };



  allDays.forEach((day, index) => {
    const { emoji, desc: condDesc } = getWeatherEmojiAndDesc(day.wcode);
    const dateFormatted = formatDateShort(day.date);
    const dayClass = classifyWeather(day.maxTemp, day.minTemp, day.precip, [day.wcode]);
    const suggestedOutfit = getSuggestedOutfitForDay(dayClass, selections);
    const outfitHtml = suggestedOutfit.map(item => `
      <span class="outfit-tag tag-${item.type}">${item.icon} ${item.text}</span>
    `).join(" ");
    
    const isDayHistorical = day.date > forecastMaxStr;
    const typeBadge = isDayHistorical 
      ? `<span class="data-source-badge historical">Climate Avg</span>`
      : `<span class="data-source-badge forecast">Forecast</span>`;
    
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>Day ${index + 1}</td>
      <td>${dateFormatted}</td>
      <td><strong>${day.city}</strong></td>
      <td class="temp-col">${formatTemp(day.maxTemp)} / ${formatTemp(day.minTemp)}</td>
      <td class="rain-col">${day.precip > 0 ? `${day.precip.toFixed(1)} mm` : '0 mm'}</td>
      <td>${emoji} ${condDesc} ${typeBadge}</td>
      <td>${outfitHtml}</td>
    `;
    forecastTableBody.appendChild(tr);
  });

  const forecastExpandable = document.getElementById("forecast-expandable");
  forecastExpandable.style.display = "block";

  // 3. Generate Verdict
  const hasFreezing = stops.some(s => s.weatherClass === "freezing");
  const hasCold = stops.some(s => s.weatherClass === "cold");
  const hasRainy = stops.some(s => s.weatherClass === "rainy");
  
  let verdictTitle = "Verdict: Pack a light coat, you big baby.";
  let verdictDesc = "It's going to be breezy in the evenings. Don't say we didn't warn you when you're shivering.";
  let verdictClass = "";

  if (hasFreezing) {
    verdictTitle = "Verdict: Pack a heavy winter coat, you shivering leaf.";
    verdictDesc = `It's literally freezing in ${coldestStop.shortName}. Layer a thick winter parka or you'll turn into a human popsicle. We don't want to hear you whining.`;
  } else if (hasCold && hasRainy) {
    verdictTitle = "Verdict: Yes. Pack a raincoat and warm layers.";
    verdictDesc = `Chilly and wet. Double misery. Bring a waterproof outer layer and a warm hoodie to wear underneath.`;
  } else if (hasCold) {
    verdictTitle = "Verdict: Pack a light coat, you big baby.";
    verdictDesc = `Temps are dropping in ${coldestStop.shortName}. A jacket is mandatory unless you enjoy shivering in coffee shops looking like an amateur.`;
  } else if (hasRainy) {
    verdictTitle = "Verdict: Bring a rain mac. You're going to get soggy.";
    verdictDesc = `Wet stop forecast. A good raincoat is highly advised. Unless you enjoy looking like a wet stray cat.`;
  } else {
    // Only sunny/moderate
    verdictTitle = "Verdict: Nope. Leave the coat at home.";
    verdictDesc = `Warm skies and clear paths ahead. Carrying a coat is a waste of precious suitcase volume. Sweating in outerwear is not a fashion statement.`;
    verdictClass = "nope";
  }

  const isLaundryChecked = laundryAccess.checked;
  const bagLimit = document.getElementById("bag-limit").value;

  if (bagLimit === "personal") {
    if (totalNights > 3) {
      if (verdictClass === "nope") {
        verdictDesc += " Keep in mind you selected a 7kg Under-seat Personal Item limit. Since no coat is needed, packing will be a breeze, but keep those shirts rolled tight to fit everything in.";
      } else {
        verdictDesc += " Keep in mind you selected a 7kg Under-seat Personal Item limit. You'll need to wear that coat, two hoodies, and four shirts on the plane to avoid gate check fees.";
      }
    } else {
      if (verdictClass === "nope") {
        verdictDesc += " Small personal item? Keep it light. No coat needed means extra room for snacks.";
      } else {
        verdictDesc += " Small personal item? Keep it light. Leave the just-in-cases behind.";
      }
    }
  } else if (bagLimit === "checked") {
    if (verdictClass === "nope") {
      verdictDesc += " Since you chose a Checked Bag, you'll probably pack a jacket anyway 'just in case'. We see you, overpacker.";
    } else {
      verdictDesc += " Since you chose a Checked Bag, you'll probably pack three extra jackets anyway 'just in case'. We see you, overpacker.";
    }
  } else if (bagLimit === "carryon") {
    if (totalNights > 7) {
      verdictDesc += " Carry-on only for a week? Roll everything, use packing cubes, and pray you don't buy souvenirs.";
    } else {
      verdictDesc += " Standard carry-on is plenty of space for a short trip. No gate-check anxiety for you.";
    }
  } else if (bagLimit === "duffel") {
    verdictDesc += " Packing in a duffel bag is pure chaos. Prepare for everything to be a wrinkled mess.";
  }

  // Long trip no laundry warning
  if (totalNights > 14 && !isLaundryChecked) {
    verdictDesc += " Also, traveling for over two weeks without laundry? You'll need a giant suitcase or prepare to smell a bit ripe by day 10. Seriously, find a laundromat.";
  }

  const verdictCard = document.querySelector(".results-screen .verdict");
  verdictCard.className = `verdict ${verdictClass}`;
  document.querySelector(".verdict h1").textContent = verdictTitle;
  document.querySelector("#results-desc").innerHTML = verdictDesc;

  // 4. Generate Checklist columns
  const packingGrid = document.querySelector(".packing-grid");
  packingGrid.innerHTML = "";

  // Essentials Quantity depending on laundry Access & Frequency
  let essentialsQty = totalNights + 1;
  let laundryNote = "";

  if (isLaundryChecked) {
    const freqVal = laundryFrequency ? laundryFrequency.value : "halfway";
    let cycleDays = Math.ceil(totalNights / 2);
    let freqLabel = "once halfway through";

    if (freqVal === "3days") {
      cycleDays = 3;
      freqLabel = "every 3 days";
    } else if (freqVal === "7days") {
      cycleDays = 7;
      freqLabel = "every 7 days";
    } else if (freqVal === "custom") {
      const customVal = Number(laundryDayInput.value);
      if (customVal && customVal <= totalNights) {
        cycleDays = customVal;
        freqLabel = `on day ${customVal}`;
      } else {
        freqLabel = "once halfway through";
      }
    }

    essentialsQty = Math.max(2, Math.min(totalNights + 1, cycleDays + 1));
    laundryNote = `<em>Laundry access available ${freqLabel}, so we cut clothes to a ${essentialsQty} day supply.</em>`;
  }

  // Set to keep track of packed items to avoid duplicates
  const packedNames = new Set([
    "Underwear", "Socks", "Everyday Sneakers / Walking Shoes", "Sleepwear / Pajamas", "Bras"
  ]);

  const rewearTolerance = rewearSlider ? Number(rewearSlider.value) : 2;

  // Column: Underwear (Briefcase icon)
  const undUnderwear = document.getElementById("und-underwear").checked;
  const undSocks = document.getElementById("und-socks").checked;
  const undBras = document.getElementById("und-bras").checked;

  const colUnderwear = document.createElement("article");
  colUnderwear.className = "city-list";
  colUnderwear.innerHTML = `
    <h3><svg><use href="#icon-briefcase"></use></svg> Underwear</h3>
    <div class="checklist"></div>
  `;
  const underwearChecklist = colUnderwear.querySelector(".checklist");

  if (undUnderwear) {
    underwearChecklist.appendChild(createCountChecklistItem(`Underwear (${essentialsQty} pairs)`, `Count: ${essentialsQty} total. ${laundryNote}`));
  }
  if (undSocks) {
    underwearChecklist.appendChild(createCountChecklistItem(`Socks (${essentialsQty} pairs)`, `Count: ${essentialsQty} total. ${laundryNote}`));
  }
  if (undBras) {
    const brasQty = Math.max(1, Math.min(3, Math.ceil(essentialsQty / rewearTolerance)));
    underwearChecklist.appendChild(createCountChecklistItem(`Bras (${brasQty})`, `Count: ${brasQty} total. Supportive layers.`));
  }

  if (underwearChecklist.children.length > 0) {
    packingGrid.appendChild(colUnderwear);
  }

  // Column A: Basic (Luggage icon)
  const colBase = document.createElement("article");
  colBase.className = "city-list";
  colBase.innerHTML = `
    <h3><svg><use href="#icon-luggage"></use></svg> Basic</h3>
    <div class="checklist"></div>
  `;
  const baseChecklist = colBase.querySelector(".checklist");

  // A.2. Add footwear and sleepwear
  const hasRainyStop = stops.some(s => s.weatherClass === "rainy");
  const sneakersDesc = hasRainyStop
    ? "Wear these on the plane. (And maybe don't wear your pristine white sneakers in the wet weather)."
    : "Wear these on the plane to save precious suitcase space.";
  baseChecklist.appendChild(createCountChecklistItem(`Everyday Sneakers / Walking Shoes (1 pair)`, sneakersDesc));
  baseChecklist.appendChild(createCountChecklistItem(`Sleepwear / Pajamas (1-2 sets)`, "For getting some shut-eye. Do not sleep in your jeans."));

  // A.3. Dynamic clothes selections
  const topTshirt = document.getElementById("top-tshirt").checked;
  const topShirt = document.getElementById("top-shirt").checked;
  const topSweater = document.getElementById("top-sweater").checked;
  const topHoodie = document.getElementById("top-hoodie").checked;
  const oneDress = document.getElementById("one-dress").checked;
  const oneJumpsuit = document.getElementById("one-jumpsuit").checked;
  const oneSuit = document.getElementById("one-suit").checked;

  const dailyCategories = [];
  if (topTshirt) dailyCategories.push({ id: "top-tshirt", name: "T-Shirts" });
  if (topShirt) dailyCategories.push({ id: "top-shirt", name: "Button-downs / Blouses" });
  if (oneDress) dailyCategories.push({ id: "one-dress", name: "Dresses" });
  if (oneJumpsuit) dailyCategories.push({ id: "one-jumpsuit", name: "Jumpsuits / Rompers" });
  if (oneSuit) dailyCategories.push({ id: "one-suit", name: "Suits / Matching Sets" });

  const dailyQuantities = {};
  let topsQty = 0;

  if (dailyCategories.length > 0) {
    const baseQty = Math.floor(essentialsQty / dailyCategories.length);
    let remainder = essentialsQty % dailyCategories.length;
    
    dailyCategories.forEach((cat, idx) => {
      let qty = baseQty;
      if (idx < remainder) qty += 1;
      if (qty === 0 && essentialsQty > 0) qty = 1;

      let allowedWears = 1;
      if (cat.id === "top-tshirt") {
        allowedWears = Math.min(rewearTolerance, 2); // sweat prone, max 2 wears
      } else if (cat.id === "top-shirt") {
        allowedWears = rewearTolerance; // max 3 wears
      } else if (cat.id === "one-dress") {
        allowedWears = rewearTolerance; // max 3 wears
      } else if (cat.id === "one-jumpsuit") {
        allowedWears = Math.min(rewearTolerance, 2); // rompers max 2 wears
      } else if (cat.id === "one-suit") {
        allowedWears = rewearTolerance; // suits max 3 wears
      }

      dailyQuantities[cat.id] = Math.ceil(qty / allowedWears);
    });

    if (topTshirt) {
      const qty = dailyQuantities["top-tshirt"];
      baseChecklist.appendChild(createCountChecklistItem(`T-Shirts (${qty})`, `Count: ${qty} total. Daily wear.`));
      packedNames.add("T-Shirts");
      packedNames.add("Classic T-Shirts");
      topsQty += qty;
    }
    if (topShirt) {
      const qty = dailyQuantities["top-shirt"];
      baseChecklist.appendChild(createCountChecklistItem(`Button-downs / Blouses (${qty})`, `Count: ${qty} total. Daily wear.`));
      packedNames.add("Button-downs / Blouses");
      packedNames.add("Button-down / Blouse");
      topsQty += qty;
    }
    if (oneDress) {
      const qty = dailyQuantities["one-dress"];
      baseChecklist.appendChild(createCountChecklistItem(`Dresses (${qty})`, `Count: ${qty} total. Daily wear one-piece.`));
      packedNames.add("Dresses");
      packedNames.add("Dress");
    }
    if (oneJumpsuit) {
      const qty = dailyQuantities["one-jumpsuit"];
      baseChecklist.appendChild(createCountChecklistItem(`Jumpsuits / Rompers (${qty})`, `Count: ${qty} total. Daily wear one-piece.`));
      packedNames.add("Jumpsuits / Rompers");
    }
    if (oneSuit) {
      const qty = dailyQuantities["one-suit"];
      baseChecklist.appendChild(createCountChecklistItem(`Suits / Matching Sets (${qty})`, `Count: ${qty} total. Matching suit outfits.`));
      packedNames.add("Suits / Matching Sets");
    }
  }

  // Repeatable layers (Sweaters & Hoodies)
  const repeatableQty = Math.max(1, Math.min(3, Math.ceil(essentialsQty / rewearTolerance)));
  if (topSweater) {
    baseChecklist.appendChild(createCountChecklistItem(`Sweaters / Knitwear (${repeatableQty})`, `Count: ${repeatableQty} total. Repeatable layer.`));
    packedNames.add("Sweaters / Knitwear");
    packedNames.add("Cardigan / Light Sweater");
  }
  if (topHoodie) {
    baseChecklist.appendChild(createCountChecklistItem(`Hoodies (${repeatableQty})`, `Count: ${repeatableQty} total. Repeatable layer.`));
    packedNames.add("Hoodies");
    packedNames.add("Warm Hoodie");
  }

  // Bottoms (repeatable, scaled dynamically based on separate topsQty)
  const botJeans = document.getElementById("bot-jeans").checked;
  const botChinos = document.getElementById("bot-chinos").checked;
  const botShorts = document.getElementById("bot-shorts").checked;
  const botSkirt = document.getElementById("bot-skirt").checked;

  const bottomsQty = Math.max(1, Math.min(3, Math.ceil(topsQty / rewearTolerance)));
  const finalBottomsQty = topsQty === 0 ? 0 : bottomsQty;

  if (finalBottomsQty > 0) {
    if (botJeans) {
      baseChecklist.appendChild(createCountChecklistItem(`Jeans (${finalBottomsQty})`, `Count: ${finalBottomsQty} total. Repeatable bottom.`));
      packedNames.add("Jeans");
    }
    if (botChinos) {
      baseChecklist.appendChild(createCountChecklistItem(`Chinos / Dress Pants (${finalBottomsQty})`, `Count: ${finalBottomsQty} total. Repeatable bottom.`));
      packedNames.add("Chinos / Dress Pants");
      packedNames.add("Comfortable Chinos");
    }
    if (botShorts) {
      baseChecklist.appendChild(createCountChecklistItem(`Shorts (${finalBottomsQty})`, `Count: ${finalBottomsQty} total. Repeatable bottom.`));
      packedNames.add("Shorts");
      packedNames.add("Shorts / Skirts");
    }
    if (botSkirt) {
      baseChecklist.appendChild(createCountChecklistItem(`Skirts (${finalBottomsQty})`, `Count: ${finalBottomsQty} total. Repeatable bottom.`));
      packedNames.add("Skirts");
    }
  }

  if (baseChecklist.children.length > 0) {
    packingGrid.appendChild(colBase);
  }

  // Column B: Weather Specific (Sun icon)
  const colWeather = document.createElement("article");
  colWeather.className = "city-list";
  colWeather.innerHTML = `
    <h3><svg><use href="#icon-sun"></use></svg> Weather Specific</h3>
    <div class="checklist"></div>
  `;
  const weatherChecklist = colWeather.querySelector(".checklist");

  // Track reusables to prevent duplicates
  const packedReusables = new Set();

  // B.1. Collect weather-specific items across all unique weather classes on the trip
  const uniqueWeatherClasses = [...new Set(stops.map(s => s.weatherClass))];
  uniqueWeatherClasses.forEach((wClass) => {
    const weatherItems = PACKING_ITEMS_DATABASE.weather[wClass] || [];
    weatherItems.forEach((item) => {
      // Respect style checkboxes
      if (!shouldIncludeWeatherItem(item.name, selections, stops)) return;
      // Deduplicate
      if (packedNames.has(item.name)) return;
      if (packedReusables.has(item.name)) return;
      weatherChecklist.appendChild(createChecklistItemElement(item, packedReusables));
    });
  });

  if (weatherChecklist.children.length > 0) {
    packingGrid.appendChild(colWeather);
  }

  // Column C: Activity Extras (Tools icon)
  const colExtras = document.createElement("article");
  colExtras.className = "city-list";
  colExtras.innerHTML = `
    <h3><svg><use href="#icon-tools"></use></svg> Activity Extras</h3>
    <div class="checklist"></div>
  `;
  const extrasChecklist = colExtras.querySelector(".checklist");

  // C.1. Collect activity-specific items if checked
  const checkedActivities = [
    { id: "act-dining", dbKey: "dining" },
    { id: "act-swimming", dbKey: "swimming" },
    { id: "act-hiking", dbKey: "hiking" },
    { id: "act-business", dbKey: "business" },
    { id: "act-workout", dbKey: "workout" },
    { id: "act-snowsports", dbKey: "snowsports" },
    { id: "act-nightlife", dbKey: "nightlife" }
  ];

  checkedActivities.forEach((act) => {
    if (document.getElementById(act.id).checked) {
      const actItems = PACKING_ITEMS_DATABASE.activities[act.dbKey] || [];
      actItems.forEach((item) => {
        if (packedNames.has(item.name)) return;
        if (packedReusables.has(item.name)) return;
        extrasChecklist.appendChild(createChecklistItemElement(item, packedReusables));
      });
    }
  });

  if (extrasChecklist.children.length > 0) {
    packingGrid.appendChild(colExtras);
  }

  // Render Lookbook
  renderLookbook(stops, selections);
}

function createChecklistItemElement(item, packedReusables) {
  const label = document.createElement("label");
  label.className = "pack-item";

  let displayName = item.name;
  let isReused = false;

  if (item.reuse) {
    if (packedReusables.has(item.name)) {
      isReused = true;
      displayName = `${item.name} <b>Reuse</b>`;
    } else {
      packedReusables.add(item.name);
    }
  }

  label.innerHTML = `
    <input type="checkbox">
    <span>
      <strong>${displayName}</strong>
      <em>${item.desc || ""}</em>
    </span>
  `;

  label.querySelector("input").addEventListener("change", (e) => {
    label.classList.toggle("is-packed", e.target.checked);
  });

  return label;
}

function createCountChecklistItem(name, desc) {
  const label = document.createElement("label");
  label.className = "pack-item";

  label.innerHTML = `
    <input type="checkbox">
    <span>
      <strong>${name}</strong>
      <em>${desc}</em>
    </span>
  `;

  label.querySelector("input").addEventListener("change", (e) => {
    label.classList.toggle("is-packed", e.target.checked);
  });

  return label;
}

function renderLookbook(stops, selections) {
  const lookbookSection = document.getElementById("lookbook-section");
  const lookbookGrid = document.getElementById("lookbook-grid");
  if (!lookbookSection || !lookbookGrid) return;

  // Gather all days
  const allDays = [];
  stops.forEach(s => {
    if (s.daysForecast) {
      allDays.push(...s.daysForecast);
    }
  });

  if (allDays.length === 0) {
    lookbookSection.style.display = "none";
    return;
  }

  // Get unique weather classes present on this trip
  const uniqueClasses = [...new Set(allDays.map(day => classifyWeather(day.maxTemp, day.minTemp, day.precip, [day.wcode])))];

  lookbookGrid.innerHTML = "";

  const descriptions = {
    freezing: "Designed for sub-zero temperatures. Lock in heat with thermal base layers under a heavy parka or ski jacket.",
    cold: "Chilly weather layering. Combine a light outer coat with a warm hoodie or sweater underneath to stay comfortable.",
    rainy: "Rain-ready layer. A waterproof raincoat keeps you dry, paired with appropriate tops and bottoms for the temp.",
    sunny: "Breathable and warm-weather friendly. Choose light tops, shorts, skirts, or flowy one-pieces.",
    moderate: "Smart-casual layering. Perfect for mild temperatures—a light sweater or cardigan keeps the draft away."
  };

  const weatherIcons = {
    freezing: "❄️",
    cold: "🧥",
    rainy: "🌧️",
    sunny: "☀️",
    moderate: "🌤️"
  };

  uniqueClasses.forEach(wClass => {
    const label = getWeatherClassLabel(wClass);
    const desc = descriptions[wClass] || "Optimal outfit combination for this weather.";
    const icon = weatherIcons[wClass] || "👕";
    const suggestedOutfit = getSuggestedOutfitForDay(wClass, selections);

    const outfitHtml = suggestedOutfit.map(item => `
      <span class="outfit-tag tag-${item.type}">${item.icon} ${item.text}</span>
    `).join("");

    // Also check if waterproof boots are recommended for this weather class.
    let extraTags = "";
    if (wClass === "rainy" && shouldIncludeWeatherItem("Waterproof Boots", selections, stops)) {
      extraTags += `<span class="outfit-tag tag-footwear">🥾 Waterproof Boots</span>`;
    }

    const card = document.createElement("article");
    card.className = "lookbook-card";
    card.innerHTML = `
      <div class="lookbook-card-header">
        <span class="lookbook-card-title">${icon} Style Guide</span>
        <h3 class="lookbook-card-weather">${label}</h3>
      </div>
      <div class="lookbook-outfit-container">
        ${outfitHtml}
        ${extraTags}
      </div>
      <p class="lookbook-card-desc">${desc}</p>
    `;
    lookbookGrid.appendChild(card);
  });

  lookbookSection.style.display = "block";
}

// Navigation links handler
navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = link.dataset.target;
    if (!target) return;
    event.preventDefault();
    showScreen(target);
  });
});

// Secondary Action Buttons on results screen
document.querySelectorAll(".secondary-button").forEach((button) => {
  button.addEventListener("click", () => {
    const label = button.textContent.trim();
    if (label.includes("Export")) {
      const items = Array.from(document.querySelectorAll(".pack-item")).map(label => {
        const checked = label.querySelector("input").checked ? "[x]" : "[ ]";
        const title = label.querySelector("strong").textContent;
        return `${checked} ${title}`;
      }).join("\n");
      
      navigator.clipboard.writeText(items).then(() => {
        showToast("Packing list copied to clipboard! Ready to paste.");
      }).catch(() => {
        showToast("Failed to copy list automatically.");
      });
    } else if (label.includes("Email")) {
      showToast("Email sending simulated. Inbox chaos avoided.");
    } else {
      showToast("Grocery trip successfully sponsored. Potassium level +100.");
    }
  });
});

// Initialize form layout state from cache or default stops
try {
  const savedState = localStorage.getItem("coatOrNope_tripState");
  if (savedState) {
    const parsed = JSON.parse(savedState);
    document.getElementById("trip-start-date").value = parsed.startDate || todayYmd;
    laundryAccess.checked = parsed.laundryChecked || false;
    
    if (laundryFrequency && parsed.laundryFrequency) {
      laundryFrequency.value = parsed.laundryFrequency;
    }
    
    if (laundryOptions) {
      laundryOptions.style.display = parsed.laundryChecked ? "inline-flex" : "none";
    }
    
    laundryDayWrap.style.display = (parsed.laundryChecked && (parsed.laundryFrequency || "halfway") === "custom") ? "inline-flex" : "none";
    laundryDayInput.value = parsed.laundryDay || "";
    document.getElementById("bag-limit").value = parsed.bagLimit || "carryon";
    
    // Restore re-wear slider tolerance
    if (parsed.rewearTolerance && rewearSlider) {
      rewearSlider.value = parsed.rewearTolerance;
      rewearSlider.dispatchEvent(new Event("input"));
    }
    
    // Restore activities checkboxes
    if (parsed.activities) {
      document.querySelectorAll(".activity-line input[type='checkbox']").forEach(el => {
        el.checked = parsed.activities.includes(el.id);
      });
    }

    // Restore clothing types checkboxes
    if (parsed.clothingTypes) {
      document.querySelectorAll(".clothing-types-line input[type='checkbox']").forEach(el => {
        el.checked = parsed.clothingTypes.includes(el.id);
      });
    }

    if (parsed.stops && parsed.stops.length > 0) {
      parsed.stops.forEach(s => createStopRow(s));
    } else {
      defaultStops.forEach(s => createStopRow(s));
    }
  } else {
    // Fill defaults
    defaultStops.forEach(s => createStopRow(s));
  }
} catch (e) {
  defaultStops.forEach(s => createStopRow(s));
}

setVerdictReady(false);

function formatDateFriendly(dateStr) {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const options = { weekday: 'long', month: 'short', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}


/* --- Outfit Planner Step 1.5 --- */
// Outfit Planner screen removed
