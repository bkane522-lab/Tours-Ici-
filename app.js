(() => {
  "use strict";

  const STORAGE_KEYS = {
    favorites: "toursIciFavorites",
    customPlaces: "toursIciCustomPlaces"
  };

  const state = {
    category: "all",
    query: "",
    openNow: false,
    verifiedOnly: false,
    favoritesOnly: false,
    view: "list",
    userPosition: null,
    map: null,
    markersLayer: null,
    deferredPrompt: null
  };

  const categoryById = Object.fromEntries(
    window.TOURS_ICI_CATEGORIES.map(category => [category.id, category])
  );

  const els = {
    filters: document.querySelector("#categoryFilters"),
    search: document.querySelector("#searchInput"),
    clearSearch: document.querySelector("#clearSearch"),
    openNow: document.querySelector("#openNowBtn"),
    verified: document.querySelector("#verifiedBtn"),
    favorites: document.querySelector("#favoritesBtn"),
    nearMe: document.querySelector("#nearMeBtn"),
    listView: document.querySelector("#listViewBtn"),
    mapView: document.querySelector("#mapViewBtn"),
    list: document.querySelector("#placesList"),
    mapPanel: document.querySelector("#mapPanel"),
    resultCount: document.querySelector("#resultCount"),
    emptyState: document.querySelector("#emptyState"),
    resetFilters: document.querySelector("#resetFiltersBtn"),
    dialog: document.querySelector("#placeDialog"),
    dialogContent: document.querySelector("#dialogContent"),
    closeDialog: document.querySelector("#closeDialogBtn"),
    installBtn: document.querySelector("#installBtn")
  };

  const escapeHtml = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function getCustomPlaces() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.customPlaces) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function getPlaces() {
    const customPlaces = getCustomPlaces();
    return [...customPlaces, ...window.TOURS_ICI_DEMO_PLACES];
  }

  function getFavorites() {
    try {
      return new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.favorites) || "[]"));
    } catch {
      return new Set();
    }
  }

  function saveFavorites(set) {
    localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify([...set]));
  }

  function isOpenNow(place, date = new Date()) {
    const { open, close } = place.hours || {};
    if (!open || !close) return false;

    const toMinutes = time => {
      const [hours, minutes] = time.split(":").map(Number);
      return hours * 60 + minutes;
    };

    const now = date.getHours() * 60 + date.getMinutes();
    const start = toMinutes(open);
    const end = toMinutes(close);
    return end > start ? now >= start && now < end : now >= start || now < end;
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .trim();
  }

  function distanceKm(a, b) {
    const earthRadius = 6371;
    const toRadians = value => value * Math.PI / 180;
    const dLat = toRadians(b.lat - a.lat);
    const dLng = toRadians(b.lng - a.lng);
    const lat1 = toRadians(a.lat);
    const lat2 = toRadians(b.lat);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * earthRadius * Math.asin(Math.sqrt(h));
  }

  function filteredPlaces() {
    const favorites = getFavorites();
    const query = normalize(state.query);

    let places = getPlaces().filter(place => {
      const matchesCategory = state.category === "all" || place.category === state.category;
      const haystack = normalize([
        place.name,
        place.address,
        place.district,
        place.description,
        ...(place.tags || [])
      ].join(" "));
      const matchesQuery = !query || haystack.includes(query);
      const matchesOpen = !state.openNow || isOpenNow(place);
      const matchesVerified = !state.verifiedOnly || Boolean(place.verified);
      const matchesFavorite = !state.favoritesOnly || favorites.has(place.id);
      return matchesCategory && matchesQuery && matchesOpen && matchesVerified && matchesFavorite;
    });

    if (state.userPosition) {
      places = places
        .map(place => ({
          ...place,
          distance: distanceKm(state.userPosition, { lat: Number(place.lat), lng: Number(place.lng) })
        }))
        .sort((a, b) => a.distance - b.distance);
    }

    return places;
  }

  function renderFilters() {
    els.filters.innerHTML = window.TOURS_ICI_CATEGORIES.map(category => `
      <button
        class="category-chip ${state.category === category.id ? "active" : ""}"
        type="button"
        data-category="${escapeHtml(category.id)}"
        style="--cat:${category.color};--cat-dark:${category.dark}"
        aria-pressed="${state.category === category.id}"
      >
        <span class="cat-icon" aria-hidden="true">${category.icon}</span>
        <span class="cat-label">${escapeHtml(category.label)}</span>
      </button>
    `).join("");
  }

  function placeCard(place) {
    const category = categoryById[place.category] || categoryById.all;
    const favorites = getFavorites();
    const open = isOpenNow(place);
    const [coverA, coverB] = place.colors || [category.color, category.dark];
    const distanceText = typeof place.distance === "number"
      ? `${place.distance < 1 ? Math.round(place.distance * 1000) + " m" : place.distance.toFixed(1) + " km"}`
      : escapeHtml(place.district || "Tours");

    return `
      <article class="place-card" data-id="${escapeHtml(place.id)}">
        <button class="place-cover details-btn ${place.photo ? "has-photo" : ""}" type="button" style="--cover-a:${coverA};--cover-b:${coverB}" aria-label="Voir ${escapeHtml(place.name)}">
          ${place.photo ? `<img src="${place.photo}" alt="" loading="lazy" />` : ""}
          <span class="place-cover-icon">${category.icon}</span>
          ${place.verified ? '<span class="verified-badge">✓ VÉRIFIÉ SUR PLACE</span>' : ""}
        </button>
        <div class="place-card-content">
          <div class="place-topline">
            <div>
              <p class="place-category">${escapeHtml(category.label)}</p>
              <h3>${escapeHtml(place.name)}</h3>
            </div>
            <button class="favorite-button ${favorites.has(place.id) ? "active" : ""}" type="button" data-favorite="${escapeHtml(place.id)}" aria-label="Ajouter aux favoris">
              ${favorites.has(place.id) ? "♥" : "♡"}
            </button>
          </div>
          <div class="place-meta">
            <span>${distanceText}</span>
            <span>•</span>
            <span class="${open ? "open" : "closed"}">${open ? "Ouvert" : "Fermé"}</span>
            <span>•</span>
            <span>${escapeHtml(place.price || "Prix non indiqué")}</span>
          </div>
          <div class="place-tags">
            ${(place.tags || []).slice(0, 3).map(tag => `<span>${escapeHtml(tag)}</span>`).join("")}
          </div>
          <div class="place-actions">
            <button class="details-btn" type="button">Voir la fiche</button>
            <a href="${mapsUrl(place)}" target="_blank" rel="noopener">Itinéraire</a>
            <button class="share-btn" type="button">Partager</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderPlaces() {
    const places = filteredPlaces();
    els.resultCount.textContent = String(places.length);
    els.list.innerHTML = places.map(placeCard).join("");
    els.emptyState.hidden = places.length !== 0;
    els.list.hidden = state.view !== "list" || places.length === 0;
    els.mapPanel.hidden = state.view !== "map";

    if (state.view === "map") {
      requestAnimationFrame(() => renderMap(places));
    }
  }

  function mapsUrl(place) {
    const query = encodeURIComponent(`${place.name}, ${place.address || "Tours"}`);
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  }

  function renderMap(places) {
    if (!window.L) return;

    if (!state.map) {
      state.map = L.map("map", { zoomControl: false }).setView([47.3941, 0.6848], 14);
      L.control.zoom({ position: "bottomright" }).addTo(state.map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap"
      }).addTo(state.map);
      state.markersLayer = L.layerGroup().addTo(state.map);
    }

    state.markersLayer.clearLayers();
    const bounds = [];

    places.forEach(place => {
      const category = categoryById[place.category] || categoryById.all;
      const icon = L.divIcon({
        className: "",
        html: `<div class="custom-marker" style="background:${category.color}"><span>${category.icon}</span></div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36]
      });
      const marker = L.marker([place.lat, place.lng], { icon }).addTo(state.markersLayer);
      marker.bindPopup(`<strong>${escapeHtml(place.name)}</strong><br>${escapeHtml(place.address || "Tours")}`);
      marker.on("click", () => setTimeout(() => openPlace(place.id), 120));
      bounds.push([place.lat, place.lng]);
    });

    if (state.userPosition) {
      L.circleMarker([state.userPosition.lat, state.userPosition.lng], {
        radius: 7,
        color: "#0E2233",
        fillColor: "#ffffff",
        fillOpacity: 1,
        weight: 4
      }).addTo(state.markersLayer).bindPopup("Votre position");
      bounds.push([state.userPosition.lat, state.userPosition.lng]);
    }

    if (bounds.length > 1) state.map.fitBounds(bounds, { padding: [35, 35], maxZoom: 15 });
    else if (bounds.length === 1) state.map.setView(bounds[0], 15);

    setTimeout(() => state.map.invalidateSize(), 100);
  }

  function setView(view) {
    state.view = view;
    const listActive = view === "list";
    els.listView.classList.toggle("active", listActive);
    els.mapView.classList.toggle("active", !listActive);
    els.listView.setAttribute("aria-pressed", String(listActive));
    els.mapView.setAttribute("aria-pressed", String(!listActive));
    renderPlaces();
    document.querySelector(".view-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetFilters() {
    state.category = "all";
    state.query = "";
    state.openNow = false;
    state.verifiedOnly = false;
    state.favoritesOnly = false;
    els.search.value = "";
    syncQuickButtons();
    renderAll();
  }

  function syncQuickButtons() {
    els.openNow.setAttribute("aria-pressed", String(state.openNow));
    els.verified.setAttribute("aria-pressed", String(state.verifiedOnly));
    els.favorites.setAttribute("aria-pressed", String(state.favoritesOnly));
    els.clearSearch.hidden = !state.query;
  }

  function renderAll() {
    renderFilters();
    renderPlaces();
  }

  function toggleFavorite(id) {
    const favorites = getFavorites();
    favorites.has(id) ? favorites.delete(id) : favorites.add(id);
    saveFavorites(favorites);
    renderPlaces();
  }

  function sharePlace(place) {
    const shareData = {
      title: `${place.name} — Tours Ici`,
      text: `Découvrez ${place.name} sur Tours Ici.`,
      url: mapsUrl(place)
    };
    if (navigator.share) {
      navigator.share(shareData).catch(() => {});
    } else {
      navigator.clipboard?.writeText(`${shareData.text} ${shareData.url}`);
      alert("Le lien a été copié.");
    }
  }

  function openPlace(id) {
    const place = getPlaces().find(item => item.id === id);
    if (!place) return;

    const category = categoryById[place.category] || categoryById.all;
    const [coverA, coverB] = place.colors || [category.color, category.dark];
    const open = isOpenNow(place);

    els.dialogContent.innerHTML = `
      <div class="dialog-hero ${place.photo ? "has-photo" : ""}" style="--cover-a:${coverA};--cover-b:${coverB};${place.photo ? `background-image:url('${place.photo}')` : ""}">
        <span class="dialog-hero-icon">${category.icon}</span>
      </div>
      <div class="dialog-body">
        <p class="place-category">${escapeHtml(category.label)} ${place.verified ? "· ✓ Vérifié sur place" : ""}</p>
        <h2>${escapeHtml(place.name)}</h2>
        <p class="lead">${escapeHtml(place.description || "Informations à compléter.")}</p>

        <div class="place-tags">
          ${(place.tags || []).map(tag => `<span>${escapeHtml(tag)}</span>`).join("")}
        </div>

        <div class="info-grid">
          <div class="info-box"><small>ADRESSE</small><strong>${escapeHtml(place.address || "À compléter")}</strong></div>
          <div class="info-box"><small>STATUT</small><strong>${open ? "Ouvert maintenant" : "Fermé actuellement"}</strong></div>
          <div class="info-box"><small>HORAIRES</small><strong>${escapeHtml(place.hours?.open || "—")} – ${escapeHtml(place.hours?.close || "—")}</strong></div>
          <div class="info-box"><small>BUDGET</small><strong>${escapeHtml(place.price || "Non indiqué")}</strong></div>
        </div>

        <div class="dialog-actions">
          <a href="${mapsUrl(place)}" target="_blank" rel="noopener">Itinéraire</a>
          <button class="share-dialog-btn" type="button" data-share-dialog="${escapeHtml(place.id)}">Partager</button>
        </div>
      </div>
    `;
    els.dialog.showModal();
  }

  els.filters.addEventListener("click", event => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.category = button.dataset.category;
    renderAll();
  });

  els.search.addEventListener("input", event => {
    state.query = event.target.value;
    syncQuickButtons();
    renderPlaces();
  });

  els.clearSearch.addEventListener("click", () => {
    state.query = "";
    els.search.value = "";
    syncQuickButtons();
    renderPlaces();
  });

  els.openNow.addEventListener("click", () => {
    state.openNow = !state.openNow;
    syncQuickButtons();
    renderPlaces();
  });

  els.verified.addEventListener("click", () => {
    state.verifiedOnly = !state.verifiedOnly;
    syncQuickButtons();
    renderPlaces();
  });

  els.favorites.addEventListener("click", () => {
    state.favoritesOnly = !state.favoritesOnly;
    syncQuickButtons();
    renderPlaces();
  });

  els.nearMe.addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("La géolocalisation n’est pas disponible sur cet appareil.");
      return;
    }
    els.nearMe.textContent = "Localisation…";
    navigator.geolocation.getCurrentPosition(
      position => {
        state.userPosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        els.nearMe.textContent = "✓ Position trouvée";
        renderPlaces();
      },
      () => {
        els.nearMe.textContent = "◎ Autour de moi";
        alert("Autorisez la localisation pour classer les adresses par distance.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  els.listView.addEventListener("click", () => setView("list"));
  els.mapView.addEventListener("click", () => setView("map"));
  els.resetFilters.addEventListener("click", resetFilters);
  els.closeDialog.addEventListener("click", () => els.dialog.close());
  els.dialog.addEventListener("click", event => {
    if (event.target === els.dialog) els.dialog.close();
  });

  els.list.addEventListener("click", event => {
    const card = event.target.closest(".place-card");
    if (!card) return;
    const id = card.dataset.id;

    if (event.target.closest("[data-favorite]")) {
      toggleFavorite(id);
      return;
    }
    if (event.target.closest(".share-btn")) {
      const place = getPlaces().find(item => item.id === id);
      if (place) sharePlace(place);
      return;
    }
    if (event.target.closest(".details-btn")) openPlace(id);
  });

  els.dialogContent.addEventListener("click", event => {
    const button = event.target.closest("[data-share-dialog]");
    if (!button) return;
    const place = getPlaces().find(item => item.id === button.dataset.shareDialog);
    if (place) sharePlace(place);
  });

  document.querySelectorAll(".bottom-nav [data-action]").forEach(button => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "home") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (action === "map") {
        setView("map");
      } else if (action === "favorites") {
        state.favoritesOnly = true;
        syncQuickButtons();
        setView("list");
      }
    });
  });

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    state.deferredPrompt = event;
    els.installBtn.hidden = false;
  });

  els.installBtn.addEventListener("click", async () => {
    if (!state.deferredPrompt) return;
    state.deferredPrompt.prompt();
    await state.deferredPrompt.userChoice;
    state.deferredPrompt = null;
    els.installBtn.hidden = true;
  });

  window.addEventListener("storage", renderPlaces);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  renderAll();
})();
