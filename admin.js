(() => {
  "use strict";
  const KEY = "toursIciCustomPlaces";
  const form = document.querySelector("#placeForm");
  const preview = document.querySelector("#photoPreview");
  const photos = document.querySelector("#photos");
  const locationButton = document.querySelector("#useLocationBtn");
  const savedPlaces = document.querySelector("#savedPlaces");
  const savedCount = document.querySelector("#savedCount");
  const successDialog = document.querySelector("#successDialog");
  const addAnother = document.querySelector("#addAnotherBtn");

  function readPlaces() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writePlaces(places) {
    localStorage.setItem(KEY, JSON.stringify(places));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function compressPhoto(file, maxSize = 800, quality = 0.7) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith("image/")) {
        resolve("");
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Lecture de l’image impossible."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("Image invalide."));
        image.onload = () => {
          const ratio = Math.min(1, maxSize / Math.max(image.width, image.height));
          const width = Math.max(1, Math.round(image.width * ratio));
          const height = Math.max(1, Math.round(image.height * ratio));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d", { alpha: false });
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function renderSaved() {
    const places = readPlaces();
    savedCount.textContent = `${places.length} adresse${places.length > 1 ? "s" : ""}`;
    savedPlaces.innerHTML = places.length ? places.map(place => `
      <div class="saved-card">
        <div>
          <strong>${escapeHtml(place.name)}</strong>
          <small>${escapeHtml(place.address)} · ${escapeHtml(place.category)}</small>
        </div>
        <button type="button" data-delete="${escapeHtml(place.id)}">Supprimer</button>
      </div>
    `).join("") : "<small>Aucune fiche ajoutée pour le moment.</small>";
  }

  photos.addEventListener("change", () => {
    preview.innerHTML = "";
    [...photos.files].slice(0, 6).forEach(file => {
      if (!file.type.startsWith("image/")) return;
      const img = document.createElement("img");
      img.alt = "Aperçu de la photo";
      img.src = URL.createObjectURL(file);
      img.onload = () => URL.revokeObjectURL(img.src);
      preview.appendChild(img);
    });
  });

  locationButton.addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("La géolocalisation n’est pas disponible.");
      return;
    }
    locationButton.textContent = "Localisation…";
    navigator.geolocation.getCurrentPosition(
      position => {
        form.lat.value = position.coords.latitude.toFixed(6);
        form.lng.value = position.coords.longitude.toFixed(6);
        locationButton.textContent = "✓ Position ajoutée";
      },
      () => {
        locationButton.textContent = "◎ Utiliser ma position actuelle";
        alert("Autorisez la localisation puis réessayez.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "Enregistrement…";
    const data = new FormData(form);
    let photo = "";
    try {
      photo = await compressPhoto(photos.files?.[0]);
    } catch (error) {
      console.warn(error);
    }
    const categoryColors = {
      restaurant: ["#EF6F61", "#F5B642"],
      bar: ["#159D99", "#3F75A2"],
      kebab: ["#E58B45", "#EF6F61"],
      pub: ["#6F9D88", "#159D99"],
      nightclub: ["#865D91", "#3F75A2"],
      cafe: ["#B77A5C", "#F5B642"],
      culture: ["#3F75A2", "#159D99"]
    };

    const place = {
      id: `local-${Date.now()}`,
      name: String(data.get("name") || "").trim(),
      category: String(data.get("category") || "restaurant"),
      address: String(data.get("address") || "").trim(),
      district: String(data.get("district") || "Tours").trim(),
      lat: Number(String(data.get("lat") || "").replace(",", ".")),
      lng: Number(String(data.get("lng") || "").replace(",", ".")),
      description: String(data.get("description") || "").trim(),
      tags: String(data.get("tags") || "")
        .split(",")
        .map(value => value.trim())
        .filter(Boolean)
        .slice(0, 6),
      price: String(data.get("price") || "€€"),
      phone: String(data.get("phone") || "").trim(),
      website: String(data.get("website") || "").trim(),
      verified: data.get("verified") === "on",
      hours: {
        open: String(data.get("open") || ""),
        close: String(data.get("close") || "")
      },
      colors: categoryColors[String(data.get("category"))] || ["#0E2233", "#159D99"],
      photo,
      createdAt: new Date().toISOString()
    };

    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) {
      alert("La latitude et la longitude doivent être valides.");
      submitButton.disabled = false;
      submitButton.textContent = "Enregistrer la fiche";
      return;
    }

    const places = readPlaces();
    places.unshift(place);
    writePlaces(places);
    renderSaved();
    form.reset();
    preview.innerHTML = "";
    submitButton.disabled = false;
    submitButton.textContent = "Enregistrer la fiche";
    successDialog.showModal();
  });

  savedPlaces.addEventListener("click", event => {
    const button = event.target.closest("[data-delete]");
    if (!button) return;
    const places = readPlaces().filter(place => place.id !== button.dataset.delete);
    writePlaces(places);
    renderSaved();
  });

  addAnother.addEventListener("click", () => {
    successDialog.close();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  renderSaved();
})();
