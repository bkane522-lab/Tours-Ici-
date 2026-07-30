(() => {
  "use strict";

  const PLACE_KEY = "toursIciCustomPlaces";
  const DRAFT_KEY = "toursIciDraftPlace";
  const TOTAL_STEPS = 4;
  const STEP_TITLES = ["Identité", "Ce qui le rend spécial", "Infos pratiques", "Photos et validation"];

  const TALK_ENDPOINT = "/api/parler-resumer";
  const TALK_KEY_SESSION = "toursIciAiAdminKey";
  const MAX_TALK_SECONDS = 60;
  const TALK_REQUEST_TIMEOUT_MS = 55000;

  const form = document.querySelector("#placeForm");
  const preview = document.querySelector("#photoPreview");
  const photos = document.querySelector("#photos");
  const savedPlaces = document.querySelector("#savedPlaces");
  const savedCount = document.querySelector("#savedCount");
  const successDialog = document.querySelector("#successDialog");
  const addAnother = document.querySelector("#addAnotherBtn");
  const saveError = document.querySelector("#saveError");
  const description = document.querySelector("#description");

  const wizardSteps = [...document.querySelectorAll(".wizard-step")];
  const wizardStepLabel = document.querySelector("#wizardStepLabel");
  const wizardDots = [...document.querySelectorAll(".wizard-dots span")];
  const wizardBackBtn = document.querySelector("#wizardBackBtn");
  const wizardNextBtn = document.querySelector("#wizardNextBtn");
  const wizardSummary = document.querySelector("#wizardSummary");
  const draftBanner = document.querySelector("#draftBanner");
  const resumeDraftBtn = document.querySelector("#resumeDraftBtn");
  const discardDraftBtn = document.querySelector("#discardDraftBtn");

  let currentStep = 1;

  // --- Parler et résumer (capture + IA) ---
  const talkButton = document.querySelector("#talkSummarizeBtn");
  const talkPanel = document.querySelector("#talkPanel");
  const talkAdminKey = document.querySelector("#talkAdminKey");
  const talkDot = document.querySelector("#talkDot");
  const talkStatusText = document.querySelector("#talkStatusText");
  const talkTimer = document.querySelector("#talkTimer");
  const talkStartBtn = document.querySelector("#talkStartBtn");
  const talkStopBtn = document.querySelector("#talkStopBtn");
  const talkCancelBtn = document.querySelector("#talkCancelBtn");
  const talkErrorBox = document.querySelector("#talkError");
  const talkPreview = document.querySelector("#talkPreview");
  const talkResultNotice = document.querySelector("#talkResultNotice");
  const talkResumeText = document.querySelector("#talkResumeText");
  const talkSuggestChips = document.querySelector("#talkSuggestChips");
  const talkInsertBtn = document.querySelector("#talkInsertBtn");
  const talkRestartBtn = document.querySelector("#talkRestartBtn");

  let talkMediaRecorder = null;
  let talkMediaStream = null;
  let talkChunks = [];
  let talkStartedAt = 0;
  let talkTimerId = null;
  let talkAbortController = null;
  let talkCancelled = false;
  let talkSelected = { activities: new Set(), cuisines: new Set(), keywords: new Set() };

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

  function setSelectedValues(name, values) {
    const wanted = new Set(values || []);
    form.querySelectorAll(`input[name="${name}"]`).forEach(input => {
      input.checked = wanted.has(input.value);
    });
  }

  function collectDraftData() {
    return {
      step: currentStep,
      name: form.name.value,
      category: form.category.value,
      district: form.district.value,
      address: form.address.value,
      services: selectedValues("services"),
      cuisines: selectedValues("cuisines"),
      description: description.value,
      open: form.open.value,
      close: form.close.value,
      price: form.price.value,
      phone: form.phone.value,
      website: form.website.value,
      tags: form.tags.value,
      verified: form.verified.checked
    };
  }

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(collectDraftData()));
    } catch (error) {
      console.warn(error);
    }
  }

  function readDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn(error);
      return null;
    }
  }

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch (error) {
      console.warn(error);
    }
  }

  function draftHasContent(draft) {
    return Boolean(draft && (draft.name || draft.address || draft.description));
  }

  function applyDraft(draft) {
    form.name.value = draft.name || "";
    form.category.value = draft.category || "restaurant";
    form.district.value = draft.district || "";
    form.address.value = draft.address || "";
    setSelectedValues("services", draft.services);
    setSelectedValues("cuisines", draft.cuisines);
    description.value = draft.description || "";
    form.open.value = draft.open || "10:00";
    form.close.value = draft.close || "22:00";
    form.price.value = draft.price || "€€";
    form.phone.value = draft.phone || "";
    form.website.value = draft.website || "";
    form.tags.value = draft.tags || "";
    form.verified.checked = Boolean(draft.verified);
    goToStep(draft.step || 1);
  }

  function renderWizardSummary() {
    const services = selectedValues("services");
    const cuisines = selectedValues("cuisines");
    const categoryLabel = form.category.selectedOptions[0]?.textContent || "";

    wizardSummary.innerHTML = `
      <p><strong>${escapeHtml(form.name.value || "Nom à compléter")}</strong> — ${escapeHtml(categoryLabel)}</p>
      <p>${escapeHtml(form.address.value || "Adresse à compléter")}${form.district.value ? " · " + escapeHtml(form.district.value) : ""}</p>
      ${services.length ? `<p>Activités : ${escapeHtml(services.join(", "))}</p>` : ""}
      ${cuisines.length ? `<p>Cuisine : ${escapeHtml(cuisines.join(", "))}</p>` : ""}
    `;
  }

  function updateWizardChrome() {
    wizardStepLabel.textContent = `Étape ${currentStep} sur ${TOTAL_STEPS} · ${STEP_TITLES[currentStep - 1]}`;
    wizardDots.forEach((dot, index) => dot.classList.toggle("active", index === currentStep - 1));
    wizardBackBtn.hidden = currentStep === 1;
    wizardBackBtn.disabled = currentStep === 1;

    const isLastStep = currentStep === TOTAL_STEPS;
    wizardNextBtn.textContent = isLastStep ? "Enregistrer la fiche" : "Suivant →";
    wizardNextBtn.type = isLastStep ? "submit" : "button";
    if (isLastStep) renderWizardSummary();
  }

  function goToStep(step) {
    currentStep = Math.min(TOTAL_STEPS, Math.max(1, step));
    wizardSteps.forEach(section => {
      section.hidden = Number(section.dataset.step) !== currentStep;
    });
    updateWizardChrome();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function currentStepInvalidField() {
    const activeSection = wizardSteps.find(section => Number(section.dataset.step) === currentStep);
    return [...activeSection.querySelectorAll("[required]")].find(field => !field.checkValidity());
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
            <button type="button" data-delete="${escapeHtml(place.id)}">Supprimer</button>
          </div>
        </div>
      `;
    }).join("") : "<small>Aucune fiche ajoutée pour le moment.</small>";
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

  // ---------- Parler et résumer ----------

  function readTalkAdminKey() {
    return String(talkAdminKey?.value || "").trim();
  }

  function restoreTalkAdminKey() {
    try {
      talkAdminKey.value = sessionStorage.getItem(TALK_KEY_SESSION) || "";
    } catch {
      talkAdminKey.value = "";
    }
  }

  function rememberTalkAdminKey() {
    try {
      const value = readTalkAdminKey();
      if (value) sessionStorage.setItem(TALK_KEY_SESSION, value);
      else sessionStorage.removeItem(TALK_KEY_SESSION);
    } catch {
      // Le navigateur peut bloquer le stockage de session ; l'appel reste possible.
    }
  }

  function clearTalkAdminKey() {
    talkAdminKey.value = "";
    try { sessionStorage.removeItem(TALK_KEY_SESSION); } catch {}
  }

  function formatTalkTimer(seconds) {
    const safeSeconds = Math.max(0, Math.min(MAX_TALK_SECONDS, seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const remaining = safeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  }

  function preferredAudioMimeType() {
    if (!window.MediaRecorder) return "";
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
    return candidates.find(type => MediaRecorder.isTypeSupported?.(type)) || "";
  }

  function stopTalkMediaTracks() {
    talkMediaStream?.getTracks().forEach(track => track.stop());
    talkMediaStream = null;
  }

  function clearTalkTimer() {
    if (talkTimerId) clearInterval(talkTimerId);
    talkTimerId = null;
  }

  function setTalkState(nextState, message) {
    talkPanel.dataset.state = nextState;
    talkDot.classList.toggle("active", nextState === "recording");

    const labels = {
      ready: "Prêt à enregistrer",
      recording: "Enregistrement en cours",
      transcribing: "Transcription en cours…",
      summarizing: "Rédaction du résumé…",
      result: "Résultat prêt",
      error: "Une erreur est survenue"
    };
    talkStatusText.textContent = message || labels[nextState] || "";

    talkStartBtn.hidden = nextState !== "ready" && nextState !== "error";
    talkStopBtn.hidden = nextState !== "recording";
    talkCancelBtn.hidden = !["recording", "transcribing", "summarizing"].includes(nextState);
    talkErrorBox.hidden = nextState !== "error";
    talkPreview.hidden = nextState !== "result";

    if (nextState === "error" && message) talkErrorBox.textContent = message;
  }

  function resetTalkCapture() {
    clearTalkTimer();
    stopTalkMediaTracks();
    talkChunks = [];
    talkMediaRecorder = null;
    talkTimer.textContent = "00:00";
  }

  function resetTalkFlow() {
    resetTalkCapture();
    talkSelected = { activities: new Set(), cuisines: new Set(), keywords: new Set() };
    talkResumeText.value = "";
    talkSuggestChips.innerHTML = "";
    talkResultNotice.hidden = true;
    talkResultNotice.textContent = "";
    setTalkState("ready");
  }

  async function startTalkRecording() {
    if (!readTalkAdminKey()) {
      talkPanel.hidden = false;
      setTalkState("error", "Saisissez d’abord votre code privé IA.");
      talkAdminKey.focus();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setTalkState("error", "L’enregistrement n’est pas pris en charge par ce navigateur.");
      return;
    }

    talkCancelled = false;
    talkAbortController?.abort();
    talkAbortController = null;

    try {
      talkMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredAudioMimeType();
      const recorder = mimeType
        ? new MediaRecorder(talkMediaStream, { mimeType })
        : new MediaRecorder(talkMediaStream);
      talkMediaRecorder = recorder;

      talkChunks = [];
      recorder.addEventListener("dataavailable", event => {
        if (event.data?.size) talkChunks.push(event.data);
      });

      recorder.addEventListener("stop", () => {
        clearTalkTimer();
        stopTalkMediaTracks();

        if (talkCancelled) {
          talkChunks = [];
          talkMediaRecorder = null;
          talkCancelled = false;
          setTalkState("ready");
          return;
        }

        if (!talkChunks.length) {
          talkMediaRecorder = null;
          setTalkState("error", "Aucun son enregistré. Réessayez.");
          return;
        }

        const blob = new Blob(talkChunks, {
          type: recorder.mimeType || talkChunks[0].type || "audio/webm"
        });
        talkChunks = [];
        talkMediaRecorder = null;
        sendTalkAudio(blob);
      });

      recorder.start(500);
      talkStartedAt = Date.now();
      talkPanel.hidden = false;
      setTalkState("recording");

      talkTimerId = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - talkStartedAt) / 1000);
        talkTimer.textContent = formatTalkTimer(elapsed);
        if (elapsed >= MAX_TALK_SECONDS && recorder.state === "recording") {
          setTalkState("transcribing");
          recorder.stop();
        }
      }, 250);
    } catch (error) {
      console.warn(error);
      resetTalkCapture();
      const deniedPermission = error?.name === "NotAllowedError" || error?.name === "SecurityError";
      setTalkState(
        "error",
        deniedPermission
          ? "Le microphone a été refusé. Autorisez-le dans les réglages du navigateur pour réessayer."
          : "Le microphone n’a pas pu être utilisé sur cet appareil."
      );
    }
  }

  function stopTalkRecordingAndProcess() {
    if (talkMediaRecorder?.state === "recording") {
      setTalkState("transcribing");
      talkMediaRecorder.stop();
    }
  }

  async function sendTalkAudio(blob) {
    const adminKey = readTalkAdminKey();
    if (!adminKey) {
      setTalkState("error", "Saisissez votre code privé IA, puis recommencez.");
      talkAdminKey.focus();
      return;
    }

    rememberTalkAdminKey();
    setTalkState("transcribing");
    const summarizingTimer = window.setTimeout(() => setTalkState("summarizing"), 1800);

    const controller = new AbortController();
    talkAbortController = controller;
    const abortTimer = window.setTimeout(() => controller.abort(), TALK_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(TALK_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": blob.type || "audio/webm",
          "x-admin-key": adminKey
        },
        body: blob,
        signal: controller.signal
      });

      if (!response.ok) {
        if (response.status === 401) {
          clearTalkAdminKey();
          talkAdminKey.focus();
        }
        const messages = {
          401: "Code privé IA incorrect. Vérifiez-le puis réessayez.",
          403: "Cet appel IA n’est pas autorisé depuis cette page.",
          413: "L’enregistrement est trop volumineux. Essayez une note plus courte.",
          415: "Format audio non pris en charge par cet appareil.",
          429: "Trop de demandes IA en ce moment. Réessayez dans une minute.",
          502: "Le service de transcription est momentanément indisponible.",
          504: "Le service IA met trop de temps à répondre. Réessayez."
        };
        setTalkState("error", messages[response.status] || "La reformulation a échoué. Vous pouvez réessayer.");
        return;
      }

      let payload;
      try {
        payload = await response.json();
      } catch {
        setTalkState("error", "Le service IA a renvoyé une réponse illisible. Réessayez.");
        return;
      }

      if (payload.warning === "empty_transcription") {
        setTalkState("error", "Aucune parole détectée. Réessayez en parlant plus près du micro.");
        return;
      }

      renderTalkResult(payload);
    } catch (error) {
      console.warn(error);
      if (talkCancelled) return;
      setTalkState(
        "error",
        error?.name === "AbortError"
          ? "Le service IA met trop de temps à répondre. Réessayez."
          : "Connexion impossible au service IA. Vérifiez votre réseau et réessayez."
      );
    } finally {
      window.clearTimeout(summarizingTimer);
      window.clearTimeout(abortTimer);
      if (talkAbortController === controller) talkAbortController = null;
      talkCancelled = false;
    }
  }

  function talkChip(type, value, alreadySelected) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "talk-chip";
    chip.textContent = value;
    chip.setAttribute("aria-pressed", String(alreadySelected));
    chip.classList.toggle("active", alreadySelected);
    chip.addEventListener("click", () => {
      const set = talkSelected[type];
      if (set.has(value)) set.delete(value);
      else set.add(value);
      chip.classList.toggle("active", set.has(value));
      chip.setAttribute("aria-pressed", String(set.has(value)));
    });
    return chip;
  }

  function renderTalkResult(payload) {
    if (!payload || typeof payload !== "object") {
      setTalkState("error", "Le résultat IA est invalide. Réessayez.");
      return;
    }

    talkResumeText.value = String(payload.resume || payload.transcription || "").trim();
    const warningMessages = {
      summary_failed: "La transcription a été récupérée, mais le résumé automatique est indisponible. Relisez le texte avant de l’insérer.",
      summary_timeout: "La transcription a été récupérée, mais le résumé a dépassé le délai. Relisez le texte avant de l’insérer.",
      summary_invalid: "La transcription a été récupérée, mais la réponse de résumé était invalide. Relisez le texte avant de l’insérer."
    };
    const warningMessage = warningMessages[payload.warning] || "";
    talkResultNotice.hidden = !warningMessage;
    talkResultNotice.textContent = warningMessage;

    talkSelected = { activities: new Set(), cuisines: new Set(), keywords: new Set() };
    talkSuggestChips.innerHTML = "";

    const groups = [
      ["activities", "Activités suggérées", payload.activities],
      ["cuisines", "Cuisines suggérées", payload.cuisines],
      ["keywords", "Mots-clés suggérés", payload.keywords]
    ];

    groups.forEach(([type, label, values]) => {
      if (!Array.isArray(values) || !values.length) return;
      const group = document.createElement("div");
      group.className = "talk-chip-group";
      const heading = document.createElement("small");
      heading.textContent = label;
      group.appendChild(heading);
      const row = document.createElement("div");
      row.className = "talk-chip-row";
      values.forEach(value => row.appendChild(talkChip(type, value, false)));
      group.appendChild(row);
      talkSuggestChips.appendChild(group);
    });

    setTalkState("result", warningMessage ? "Transcription prête — résumé à relire" : "Résultat prêt");
  }

  function applyTalkSuggestionsToForm() {
    if (talkSelected.activities.size) {
      setSelectedValues("services", uniqueValues([...selectedValues("services"), ...talkSelected.activities]));
    }
    if (talkSelected.cuisines.size) {
      setSelectedValues("cuisines", uniqueValues([...selectedValues("cuisines"), ...talkSelected.cuisines]));
    }
    if (talkSelected.keywords.size) {
      const existingTags = form.tags.value.split(",").map(v => v.trim()).filter(Boolean);
      form.tags.value = uniqueValues([...existingTags, ...talkSelected.keywords]).join(", ");
    }
  }

  restoreTalkAdminKey();
  talkAdminKey.addEventListener("input", rememberTalkAdminKey);

  talkButton.addEventListener("click", () => {
    talkPanel.hidden = false;
    talkPanel.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!talkPanel.dataset.state || talkPanel.dataset.state === "ready") setTalkState("ready");
  });

  talkStartBtn.addEventListener("click", startTalkRecording);
  talkStopBtn.addEventListener("click", stopTalkRecordingAndProcess);

  talkCancelBtn.addEventListener("click", () => {
    talkCancelled = true;
    talkAbortController?.abort();
    talkAbortController = null;
    if (talkMediaRecorder?.state === "recording") {
      talkMediaRecorder.stop();
      return;
    }
    resetTalkFlow();
    talkCancelled = false;
  });

  talkInsertBtn.addEventListener("click", () => {
    const cleanResume = talkResumeText.value.trim();
    if (cleanResume) {
      const prefix = description.value.trim();
      description.value = prefix
        ? `${prefix}${/[.!?]$/.test(prefix) ? " " : ". "}${cleanResume}`
        : cleanResume;
      description.dispatchEvent(new Event("input", { bubbles: true }));
    }
    applyTalkSuggestionsToForm();
    saveDraft();
    talkPanel.hidden = true;
    resetTalkFlow();
  });

  talkRestartBtn.addEventListener("click", resetTalkFlow);

  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (talkMediaRecorder?.state === "recording") {
      setTalkState("error", "Arrêtez d’abord l’enregistrement en cours.");
      talkPanel.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "Enregistrement…";

    const data = new FormData(form);
    const placeId = `local-${Date.now()}`;
    let photo = "";

    try {
      photo = await compressPhoto(photos.files?.[0]);
    } catch (error) {
      console.warn(error);
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
      createdAt: new Date().toISOString()
    };

    try {
      const places = readPlaces();
      places.unshift(place);
      writePlaces(places);
      renderSaved();
      form.reset();
      preview.innerHTML = "";
      talkPanel.hidden = true;
      resetTalkFlow();
      saveError.hidden = true;
      clearDraft();
      goToStep(1);
      successDialog.showModal();
    } catch (error) {
      console.warn(error);
      saveError.hidden = false;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Enregistrer la fiche";
    }
  });

  savedPlaces.addEventListener("click", event => {
    const deleteButton = event.target.closest("[data-delete]");
    if (!deleteButton) return;

    const places = readPlaces();
    const nextPlaces = places.filter(item => item.id !== deleteButton.dataset.delete);

    try {
      writePlaces(nextPlaces);
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
    clearTalkTimer();
    stopTalkMediaTracks();
  });

  wizardNextBtn.addEventListener("click", () => {
    if (wizardNextBtn.type === "submit") return;
    const invalidField = currentStepInvalidField();
    if (invalidField) {
      invalidField.reportValidity();
      invalidField.focus();
      return;
    }
    saveDraft();
    goToStep(currentStep + 1);
  });

  wizardBackBtn.addEventListener("click", () => {
    saveDraft();
    goToStep(currentStep - 1);
  });

  form.addEventListener("input", saveDraft);
  form.addEventListener("change", saveDraft);

  resumeDraftBtn.addEventListener("click", () => {
    const draft = readDraft();
    if (draft) applyDraft(draft);
    draftBanner.hidden = true;
  });

  discardDraftBtn.addEventListener("click", () => {
    clearDraft();
    form.reset();
    resetTalkFlow();
    goToStep(1);
    draftBanner.hidden = true;
  });

  form.querySelectorAll("input, select, textarea").forEach(field => {
    field.addEventListener("focus", () => {
      window.setTimeout(() => {
        field.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    });
  });

  goToStep(1);
  resetTalkFlow();
  const existingDraft = readDraft();
  if (draftHasContent(existingDraft)) draftBanner.hidden = false;

  renderSaved();
})();
