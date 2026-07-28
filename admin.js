(() => {
  "use strict";

  const PLACE_KEY = "toursIciCustomPlaces";
  const AUDIO_DB_NAME = "toursIciMedia";
  const AUDIO_STORE = "audioNotes";
  const MAX_RECORDING_SECONDS = 60;

  const form = document.querySelector("#placeForm");
  const preview = document.querySelector("#photoPreview");
  const photos = document.querySelector("#photos");
  const savedPlaces = document.querySelector("#savedPlaces");
  const savedCount = document.querySelector("#savedCount");
  const successDialog = document.querySelector("#successDialog");
  const addAnother = document.querySelector("#addAnotherBtn");
  const saveError = document.querySelector("#saveError");

  const recorderPanel = document.querySelector("#audioRecorderPanel");
  const toggleRecorder = document.querySelector("#toggleRecorderBtn");
  const startRecording = document.querySelector("#startRecordingBtn");
  const stopRecording = document.querySelector("#stopRecordingBtn");
  const deleteRecording = document.querySelector("#deleteRecordingBtn");
  const audioPlayback = document.querySelector("#audioPlayback");
  const audioStatus = document.querySelector("#audioStatus");
  const audioTimer = document.querySelector("#audioTimer");

  const speechButton = document.querySelector("#speechToTextBtn");
  const speechStatus = document.querySelector("#speechStatus");
  const description = document.querySelector("#description");

  let mediaRecorder = null;
  let mediaStream = null;
  let recordedChunks = [];
  let recordedAudioBlob = null;
  let recordedAudioUrl = "";
  let recordingStartedAt = 0;
  let recordingTimerId = null;
  let speechRecognition = null;

  const categoryColors = {
    restaurant: ["#EF6F61", "#F5B642"],
    bar: ["#159D99", "#3F75A2"],
    barrestaurant: ["#159D99", "#EF6F61"],
    kebab: ["#E58B45", "#EF6F61"],
    pub: ["#6F9D88", "#159D99"],
    nightclub: ["#865D91", "#3F75A2"],
    cafe: ["#B77A5C", "#F5B642"],
    culture: ["#3F75A2", "#159D99"],
    grocery: ["#D28B39", "#6F9D88"]
  };

  function readPlaces() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PLACE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writePlaces(places) {
    localStorage.setItem(PLACE_KEY, JSON.stringify(places));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function uniqueValues(values) {
    return [...new Set(values.map(value => String(value).trim()).filter(Boolean))];
  }

  function selectedValues(name) {
    return [...form.querySelectorAll(`input[name="${name}"]:checked`)]
      .map(input => input.value);
  }

  function openAudioDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("Le stockage audio n’est pas disponible sur ce navigateur."));
        return;
      }

      const request = indexedDB.open(AUDIO_DB_NAME, 1);
      request.onerror = () => reject(request.error || new Error("Ouverture du stockage audio impossible."));
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(AUDIO_STORE)) {
          db.createObjectStore(AUDIO_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
  }

  async function putAudio(id, blob) {
    const db = await openAudioDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(AUDIO_STORE, "readwrite");
      transaction.objectStore(AUDIO_STORE).put(blob, id);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error("Enregistrement audio impossible."));
      };
    });
  }

  async function getAudio(id) {
    const db = await openAudioDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(AUDIO_STORE, "readonly");
      const request = transaction.objectStore(AUDIO_STORE).get(id);
      request.onsuccess = () => {
        db.close();
        resolve(request.result || null);
      };
      request.onerror = () => {
        db.close();
        reject(request.error || new Error("Lecture audio impossible."));
      };
    });
  }

  async function removeAudio(id) {
    if (!id || !("indexedDB" in window)) return;
    const db = await openAudioDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(AUDIO_STORE, "readwrite");
      transaction.objectStore(AUDIO_STORE).delete(id);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error("Suppression audio impossible."));
      };
    });
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

  function formatTimer(seconds) {
    const safeSeconds = Math.max(0, Math.min(MAX_RECORDING_SECONDS, seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const remaining = safeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  }

  function preferredAudioMimeType() {
    if (!window.MediaRecorder) return "";
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/ogg;codecs=opus",
      "audio/mp4"
    ];
    return candidates.find(type => MediaRecorder.isTypeSupported?.(type)) || "";
  }

  function stopMediaTracks() {
    mediaStream?.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  function clearRecordingTimer() {
    if (recordingTimerId) clearInterval(recordingTimerId);
    recordingTimerId = null;
  }

  function resetAudioDraft() {
    clearRecordingTimer();
    stopMediaTracks();

    if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
    recordedAudioUrl = "";
    recordedAudioBlob = null;
    recordedChunks = [];
    mediaRecorder = null;

    audioPlayback.pause();
    audioPlayback.removeAttribute("src");
    audioPlayback.hidden = true;
    audioTimer.textContent = "00:00";
    audioStatus.textContent = "Prêt à enregistrer";
    recorderPanel.classList.remove("recording");
    startRecording.disabled = false;
    stopRecording.disabled = true;
    deleteRecording.hidden = true;
  }

  async function startAudioRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      alert("L’enregistrement audio n’est pas pris en charge par ce navigateur.");
      return;
    }

    try {
      resetAudioDraft();
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredAudioMimeType();
      mediaRecorder = mimeType
        ? new MediaRecorder(mediaStream, { mimeType })
        : new MediaRecorder(mediaStream);

      recordedChunks = [];
      mediaRecorder.addEventListener("dataavailable", event => {
        if (event.data?.size) recordedChunks.push(event.data);
      });

      mediaRecorder.addEventListener("stop", () => {
        clearRecordingTimer();
        stopMediaTracks();
        recorderPanel.classList.remove("recording");

        if (!recordedChunks.length) {
          audioStatus.textContent = "Aucun son enregistré";
          startRecording.disabled = false;
          return;
        }

        recordedAudioBlob = new Blob(recordedChunks, {
          type: mediaRecorder.mimeType || recordedChunks[0].type || "audio/webm"
        });
        recordedAudioUrl = URL.createObjectURL(recordedAudioBlob);
        audioPlayback.src = recordedAudioUrl;
        audioPlayback.hidden = false;
        deleteRecording.hidden = false;
        startRecording.disabled = false;
        stopRecording.disabled = true;
        audioStatus.textContent = "Note audio prête";
      });

      mediaRecorder.start(500);
      recordingStartedAt = Date.now();
      recorderPanel.classList.add("recording");
      audioStatus.textContent = "Enregistrement en cours";
      startRecording.disabled = true;
      stopRecording.disabled = false;
      deleteRecording.hidden = true;

      recordingTimerId = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartedAt) / 1000);
        audioTimer.textContent = formatTimer(elapsed);
        if (elapsed >= MAX_RECORDING_SECONDS && mediaRecorder?.state === "recording") {
          mediaRecorder.stop();
        }
      }, 250);
    } catch (error) {
      console.warn(error);
      resetAudioDraft();
      alert("Le microphone n’a pas pu être utilisé. Vérifiez l’autorisation du navigateur.");
    }
  }

  function stopAudioRecording() {
    if (mediaRecorder?.state === "recording") mediaRecorder.stop();
  }

  function renderSaved() {
    const places = readPlaces();
    savedCount.textContent = `${places.length} adresse${places.length === 1 ? "" : "s"}`;
    savedPlaces.innerHTML = places.length ? places.map(place => {
      const attributes = uniqueValues([
        ...(place.services || []),
        ...(place.cuisines || [])
      ]).slice(0, 3);

      return `
        <div class="saved-card">
          <div class="saved-card-main">
            <strong>${escapeHtml(place.name)}</strong>
            <small>
              ${escapeHtml(place.address)} · ${escapeHtml(place.category)}
              ${place.lat !== null && place.lat !== undefined && place.lng !== null && place.lng !== undefined ? "" : " · Carte à compléter"}
            </small>
            ${attributes.length ? `<small>${attributes.map(escapeHtml).join(" · ")}</small>` : ""}
          </div>
          <div class="saved-card-actions">
            ${place.audioId ? `<button class="play-note" type="button" data-play-audio="${escapeHtml(place.audioId)}">▶ Audio</button>` : ""}
            <button type="button" data-delete="${escapeHtml(place.id)}">Supprimer</button>
          </div>
        </div>
      `;
    }).join("") : "<small>Aucune fiche ajoutée pour le moment.</small>";
  }

  async function playStoredAudio(button, audioId) {
    try {
      const blob = await getAudio(audioId);
      if (!blob) {
        alert("La note audio n’est plus disponible sur ce téléphone.");
        return;
      }

      const existing = button.parentElement.querySelector("audio");
      if (existing) {
        existing.remove();
        button.textContent = "▶ Audio";
        return;
      }

      const player = document.createElement("audio");
      player.controls = true;
      player.autoplay = true;
      player.src = URL.createObjectURL(blob);
      player.addEventListener("ended", () => {
        URL.revokeObjectURL(player.src);
      }, { once: true });

      button.parentElement.appendChild(player);
      button.textContent = "Masquer";
    } catch (error) {
      console.warn(error);
      alert("Impossible de lire cette note audio.");
    }
  }

  photos.addEventListener("change", () => {
    preview.innerHTML = "";
    [...photos.files].slice(0, 6).forEach(file => {
      if (!file.type.startsWith("image/")) return;
      const image = document.createElement("img");
      image.alt = "Aperçu de la photo";
      image.src = URL.createObjectURL(file);
      image.onload = () => URL.revokeObjectURL(image.src);
      preview.appendChild(image);
    });
  });

  toggleRecorder.addEventListener("click", () => {
    const willOpen = recorderPanel.hidden;
    recorderPanel.hidden = !willOpen;
    toggleRecorder.setAttribute("aria-expanded", String(willOpen));
    toggleRecorder.classList.toggle("active", willOpen);
  });

  startRecording.addEventListener("click", startAudioRecording);
  stopRecording.addEventListener("click", stopAudioRecording);
  deleteRecording.addEventListener("click", resetAudioDraft);

  function setupSpeechRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return null;

    const recognition = new Recognition();
    recognition.lang = "fr-FR";
    recognition.continuous = false;
    recognition.interimResults = true;

    let finalTranscript = "";

    recognition.addEventListener("start", () => {
      finalTranscript = "";
      speechStatus.hidden = false;
      speechStatus.classList.add("listening");
      speechStatus.textContent = "Écoute en cours… Parlez naturellement.";
      speechButton.classList.add("active");
      speechButton.disabled = true;
    });

    recognition.addEventListener("result", event => {
      let interimTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0].transcript;
        if (event.results[index].isFinal) finalTranscript += `${transcript} `;
        else interimTranscript += transcript;
      }

      speechStatus.textContent = interimTranscript
        ? `Écoute : ${interimTranscript}`
        : "Transcription reçue…";
    });

    recognition.addEventListener("end", () => {
      speechStatus.classList.remove("listening");
      speechButton.classList.remove("active");
      speechButton.disabled = false;

      const cleanTranscript = finalTranscript.trim();
      if (cleanTranscript) {
        const prefix = description.value.trim();
        description.value = prefix
          ? `${prefix}${/[.!?]$/.test(prefix) ? " " : ". "}${cleanTranscript}`
          : cleanTranscript;
        description.dispatchEvent(new Event("input", { bubbles: true }));
        speechStatus.textContent = "Texte ajouté. Relisez-le avant d’enregistrer la fiche.";
      } else {
        speechStatus.textContent = "Aucun texte reconnu. Vous pouvez réessayer.";
      }
    });

    recognition.addEventListener("error", event => {
      console.warn(event.error);
      speechStatus.hidden = false;
      speechStatus.classList.remove("listening");
      speechButton.classList.remove("active");
      speechButton.disabled = false;
      speechStatus.textContent =
        event.error === "not-allowed"
          ? "Le microphone n’est pas autorisé pour la dictée."
          : "La dictée n’a pas fonctionné sur ce navigateur.";
    });

    return recognition;
  }

  speechButton.addEventListener("click", () => {
    if (!speechRecognition) speechRecognition = setupSpeechRecognition();

    if (!speechRecognition) {
      speechStatus.hidden = false;
      speechStatus.textContent =
        "La dictée vocale n’est pas disponible ici. La note audio locale reste utilisable.";
      return;
    }

    try {
      speechRecognition.start();
    } catch (error) {
      console.warn(error);
    }
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (mediaRecorder?.state === "recording") {
      alert("Arrêtez d’abord l’enregistrement audio.");
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "Enregistrement…";

    const data = new FormData(form);
    const placeId = `local-${Date.now()}`;
    let photo = "";
    let audioId = "";

    try {
      photo = await compressPhoto(photos.files?.[0]);
    } catch (error) {
      console.warn(error);
    }

    if (recordedAudioBlob) {
      try {
        audioId = `audio-${placeId}`;
        await putAudio(audioId, recordedAudioBlob);
      } catch (error) {
        console.warn(error);
        audioId = "";
        alert("La fiche sera enregistrée, mais la note audio n’a pas pu être conservée.");
      }
    }

    const services = uniqueValues(selectedValues("services"));
    const cuisines = uniqueValues(selectedValues("cuisines"));
    const customTags = uniqueValues(
      String(data.get("tags") || "")
        .split(",")
        .map(value => value.trim())
    ).slice(0, 10);

    const category = String(data.get("category") || "restaurant");

    const place = {
      id: placeId,
      name: String(data.get("name") || "").trim(),
      category,
      address: String(data.get("address") || "").trim(),
      district: String(data.get("district") || "Tours").trim(),
      lat: null,
      lng: null,
      description: String(data.get("description") || "").trim(),
      services,
      cuisines,
      tags: customTags,
      price: String(data.get("price") || "€€"),
      phone: String(data.get("phone") || "").trim(),
      website: String(data.get("website") || "").trim(),
      verified: data.get("verified") === "on",
      hours: {
        open: String(data.get("open") || ""),
        close: String(data.get("close") || "")
      },
      colors: categoryColors[category] || ["#0E2233", "#159D99"],
      photo,
      audioId,
      createdAt: new Date().toISOString()
    };

    try {
      const places = readPlaces();
      places.unshift(place);
      writePlaces(places);
      renderSaved();
      form.reset();
      preview.innerHTML = "";
      resetAudioDraft();
      recorderPanel.hidden = true;
      toggleRecorder.classList.remove("active");
      toggleRecorder.setAttribute("aria-expanded", "false");
      speechStatus.hidden = true;
      saveError.hidden = true;
      successDialog.showModal();
    } catch (error) {
      console.warn(error);
      if (audioId) await removeAudio(audioId).catch(() => {});
      saveError.hidden = false;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Enregistrer la fiche";
    }
  });

  savedPlaces.addEventListener("click", async event => {
    const playButton = event.target.closest("[data-play-audio]");
    if (playButton) {
      await playStoredAudio(playButton, playButton.dataset.playAudio);
      return;
    }

    const deleteButton = event.target.closest("[data-delete]");
    if (!deleteButton) return;

    const places = readPlaces();
    const place = places.find(item => item.id === deleteButton.dataset.delete);
    const nextPlaces = places.filter(item => item.id !== deleteButton.dataset.delete);

    try {
      writePlaces(nextPlaces);
      if (place?.audioId) await removeAudio(place.audioId).catch(() => {});
      renderSaved();
      saveError.hidden = true;
    } catch (error) {
      console.warn(error);
      saveError.hidden = false;
    }
  });

  addAnother.addEventListener("click", () => {
    successDialog.close();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("beforeunload", () => {
    clearRecordingTimer();
    stopMediaTracks();
    if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
  });

  renderSaved();
})();
