/**
 * FabtrackJS - RFID Kiosk Listener
 * Detects rapid USB HID keyboard wedge RFID scans globally on the kiosk page.
 * Displays real-time audio-visual feedback and triggers check-in/check-out.
 */

(function () {
  let buffer = "";
  let lastKeyTime = 0;
  let resetTimer = null;
  let isScanning = false;

  // Keypress threshold in milliseconds to distinguish hardware RFID readers from human typing
  const SCAN_THRESHOLD_MS = 60;
  const MIN_RFID_LENGTH = 4;

  // Active workspace from page
  function getActiveWorkspaceId() {
    const wsEl = document.querySelector("[data-workspace-id]");
    if (wsEl && wsEl.dataset.workspaceId) {
      return wsEl.dataset.workspaceId;
    }
    return null;
  }

  // Global keydown listener
  document.addEventListener(
    "keydown",
    function (e) {
      // If user is typing in a standard form input (e.g. searching a project or typing comments),
      // we only capture if the input is abnormally fast (RFID scanner) or in an explicit RFID field.
      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.isContentEditable);
      const isExplicitRfidInput = isInput && activeEl.id === "rfid" || activeEl.id === "newrfid";

      const now = Date.now();
      const diff = now - lastKeyTime;
      lastKeyTime = now;

      // When Enter key is pressed
      if (e.key === "Enter") {
        if (buffer.length >= MIN_RFID_LENGTH) {
          // If typed in an input that isn't specifically RFID and typing was slow, ignore
          if (isInput && !isExplicitRfidInput && diff > 120) {
            buffer = "";
            return;
          }

          // Hardware scan detected!
          e.preventDefault();
          e.stopPropagation();

          const rfidCode = buffer.trim();
          buffer = "";

          // If on user edit/create form with explicit field, populate it
          if (isExplicitRfidInput) {
            activeEl.value = rfidCode;
            activeEl.dispatchEvent(new Event("input", { bubbles: true }));
            showToastFeedback("Badge détecté : " + rfidCode, "success");
            return;
          }

          // Otherwise trigger Kiosk scan
          triggerKioskRfidScan(rfidCode);
          return;
        }
        buffer = "";
        return;
      }

      // Single printable character
      if (e.key.length === 1) {
        if (diff > 180 && !isExplicitRfidInput) {
          // Reset buffer if delay too long between keystrokes (human typing)
          buffer = e.key;
        } else {
          buffer += e.key;
        }

        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
          buffer = "";
        }, 300);
      }
    },
    true // Capture phase
  );

  /**
   * Send RFID code to API and show visual feedback
   */
  async function triggerKioskRfidScan(rfidCode) {
    if (isScanning) return;
    isScanning = true;

    showRfidOverlay({
      type: "loading",
      title: "Lecture du badge...",
      subtitle: "Traitement de l'identifiant " + rfidCode,
    });

    try {
      const rfidUrl = window.getAppBaseUrl ? window.getAppBaseUrl("api/rfid/scan") : "/api/rfid/scan";
      const response = await fetch(rfidUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          rfid: rfidCode,
          workspaceId: getActiveWorkspaceId(),
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        if (result.action === "checkin") {
          // Check-in success
          showRfidOverlay({
            type: "checkin",
            title: `Bienvenue, ${result.user.name} !`,
            subtitle: "Votre entrée dans l'atelier a bien été enregistrée.",
            user: result.user,
            autoCloseMs: 3000,
            reloadOnClose: true,
          });
        } else if (result.action === "checkout") {
          // Check-out success
          showRfidOverlay({
            type: "checkout",
            title: `Au revoir, ${result.user.name} !`,
            subtitle: `Votre sortie a été enregistrée. Durée : ${result.durationFormatted || result.durationMinutes + ' min'}.`,
            user: result.user,
            autoCloseMs: 3000,
            reloadOnClose: true,
          });
        }
      } else {
        // Error / User not found / Debounce
        if (result.code === "USER_NOT_FOUND") {
          showRfidOverlay({
            type: "not_found",
            title: "Badge non reconnu",
            subtitle: "Ce badge n'est pas encore associé à un profil. Veuillez vous rapprocher d'un médiateur.",
            rfid: rfidCode,
            autoCloseMs: 4500,
            reloadOnClose: false,
          });
        } else if (result.code === "DEBOUNCE") {
          showRfidOverlay({
            type: "warning",
            title: "Scan trop rapide",
            subtitle: "Votre badge vient déjà d'être scanné. Veuillez patienter un instant.",
            autoCloseMs: 2500,
            reloadOnClose: false,
          });
        } else {
          showRfidOverlay({
            type: "error",
            title: "Erreur de scan",
            subtitle: result.message || "Une erreur est survenue lors de la lecture du badge.",
            autoCloseMs: 3500,
            reloadOnClose: false,
          });
        }
      }
    } catch (err) {
      console.error("RFID Scan error:", err);
      showRfidOverlay({
        type: "error",
        title: "Erreur de communication",
        subtitle: "Impossible de joindre le serveur pour valider le badge.",
        autoCloseMs: 3000,
        reloadOnClose: false,
      });
    } finally {
      setTimeout(() => {
        isScanning = false;
      }, 500);
    }
  }

  /**
   * Fullscreen / Modal Visual Overlay for Kiosk Feedback
   */
  function showRfidOverlay(options) {
    let overlay = document.getElementById("rfidFeedbackOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "rfidFeedbackOverlay";
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(15, 23, 42, 0.85);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.25s ease-in-out;
      `;
      document.body.appendChild(overlay);
    }

    let colorClass = "text-primary";
    let bgBadge = "bg-primary-subtle text-primary";
    let iconEl = null;

    function createCircleIcon(circleClasses, faClass, extraStyle) {
      const circle = document.createElement("div");
      circle.className = `rounded-circle d-flex align-items-center justify-content-center ${circleClasses} shadow-lg mx-auto mb-3`;
      circle.style.width = "90px";
      circle.style.height = "90px";
      circle.style.fontSize = "2.8rem";
      if (extraStyle) {
        circle.style.animation = extraStyle;
      }
      const icon = document.createElement("i");
      icon.className = faClass;
      circle.appendChild(icon);
      return circle;
    }

    switch (options.type) {
      case "loading": {
        const spinner = document.createElement("div");
        spinner.className = "spinner-border text-primary mx-auto mb-3";
        spinner.style.width = "4.5rem";
        spinner.style.height = "4.5rem";
        spinner.setAttribute("role", "status");
        iconEl = spinner;
        break;
      }
      case "checkin":
        colorClass = "text-success";
        bgBadge = "bg-success-subtle text-success border border-success-subtle";
        iconEl = createCircleIcon("bg-success text-white", "fa-solid fa-arrow-right-to-bracket", "pulse 1s infinite alternate");
        break;
      case "checkout":
        colorClass = "text-info";
        bgBadge = "bg-info-subtle text-info border border-info-subtle";
        iconEl = createCircleIcon("bg-info text-white", "fa-solid fa-arrow-right-from-bracket");
        break;
      case "not_found":
        colorClass = "text-warning";
        bgBadge = "bg-warning-subtle text-warning-emphasis border border-warning-subtle";
        iconEl = createCircleIcon("bg-warning text-dark", "fa-solid fa-id-card-clip");
        break;
      case "warning":
      case "error":
      default:
        colorClass = "text-danger";
        bgBadge = "bg-danger-subtle text-danger border border-danger-subtle";
        iconEl = createCircleIcon("bg-danger text-white", "fa-solid fa-circle-exclamation");
        break;
    }

    overlay.textContent = "";

    const card = document.createElement("div");
    card.className = "card border-0 shadow-2-strong text-center p-4 p-md-5 rounded-4 bg-body";
    card.style.maxWidth = "520px";
    card.style.width = "90%";
    card.style.transform = "scale(0.95)";
    card.style.transition = "transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)";

    if (iconEl) {
      card.appendChild(iconEl);
    }

    const titleEl = document.createElement("h2");
    titleEl.className = `fw-bold ${colorClass} mb-2`;
    titleEl.textContent = options.title || "";
    card.appendChild(titleEl);

    const subtitleEl = document.createElement("p");
    subtitleEl.className = "text-secondary fs-5 mb-3";
    subtitleEl.textContent = options.subtitle || "";
    card.appendChild(subtitleEl);

    if (options.user) {
      const userBox = document.createElement("div");
      userBox.className = "p-3 bg-body-tertiary rounded-3 border mb-3 text-start";

      const userRow = document.createElement("div");
      userRow.className = "d-flex align-items-center justify-content-between";

      const fullNameSpan = document.createElement("span");
      fullNameSpan.className = "fw-semibold fs-5";
      fullNameSpan.textContent = `${options.user.name || ""} ${options.user.surname || ""}`.trim();
      userRow.appendChild(fullNameSpan);

      if (options.user.type) {
        const typeBadge = document.createElement("span");
        typeBadge.className = `badge ${bgBadge} rounded-pill`;
        typeBadge.textContent = String(options.user.type);
        userRow.appendChild(typeBadge);
      }

      userBox.appendChild(userRow);
      card.appendChild(userBox);
    }

    if (options.rfid) {
      const rfidWrap = document.createElement("div");
      rfidWrap.className = "mb-3";

      const rfidBadge = document.createElement("span");
      rfidBadge.className = "badge bg-secondary-subtle text-secondary font-monospace px-3 py-2 fs-6";

      const fpIcon = document.createElement("i");
      fpIcon.className = "fa-solid fa-fingerprint me-1";
      rfidBadge.appendChild(fpIcon);
      rfidBadge.appendChild(document.createTextNode(" UID: " + String(options.rfid)));

      rfidWrap.appendChild(rfidBadge);
      card.appendChild(rfidWrap);
    }

    const btnWrap = document.createElement("div");
    btnWrap.className = "mt-2";

    const closeBtnEl = document.createElement("button");
    closeBtnEl.type = "button";
    closeBtnEl.className = "btn btn-outline-secondary px-4 py-2 rounded-pill";
    closeBtnEl.id = "closeRfidOverlayBtn";
    closeBtnEl.textContent = "Fermer";
    btnWrap.appendChild(closeBtnEl);
    card.appendChild(btnWrap);

    overlay.appendChild(card);

    // Display
    overlay.style.display = "flex";
    requestAnimationFrame(() => {
      overlay.style.opacity = "1";
      const card = overlay.querySelector(".card");
      if (card) card.style.transform = "scale(1)";
    });

    const closeOverlay = () => {
      overlay.style.opacity = "0";
      const card = overlay.querySelector(".card");
      if (card) card.style.transform = "scale(0.95)";
      setTimeout(() => {
        overlay.style.display = "none";
        if (options.reloadOnClose) {
          window.location.reload();
        }
      }, 250);
    };

    const closeBtn = document.getElementById("closeRfidOverlayBtn");
    if (closeBtn) closeBtn.addEventListener("click", closeOverlay);

    if (options.autoCloseMs) {
      setTimeout(() => {
        if (overlay.style.display !== "none") {
          closeOverlay();
        }
      }, options.autoCloseMs);
    }
  }

  function showToastFeedback(message, type = "info") {
    // Optional light toast
    console.log(`[RFID] ${type.toUpperCase()}: ${message}`);
  }

  // Expose trigger globally for manual tests
  window.triggerKioskRfidScan = triggerKioskRfidScan;
})();
