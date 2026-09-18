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

    let iconHtml = "";
    let colorClass = "text-primary";
    let bgBadge = "bg-primary-subtle text-primary";

    switch (options.type) {
      case "loading":
        iconHtml = `<div class="spinner-border text-primary" style="width: 4.5rem; height: 4.5rem;" role="status"></div>`;
        break;
      case "checkin":
        colorClass = "text-success";
        bgBadge = "bg-success-subtle text-success border border-success-subtle";
        iconHtml = `
          <div class="rounded-circle d-flex align-items-center justify-content-center bg-success text-white shadow-lg mx-auto mb-3" style="width: 90px; height: 90px; font-size: 2.8rem; animation: pulse 1s infinite alternate;">
            <i class="fa-solid fa-arrow-right-to-bracket"></i>
          </div>
        `;
        break;
      case "checkout":
        colorClass = "text-info";
        bgBadge = "bg-info-subtle text-info border border-info-subtle";
        iconHtml = `
          <div class="rounded-circle d-flex align-items-center justify-content-center bg-info text-white shadow-lg mx-auto mb-3" style="width: 90px; height: 90px; font-size: 2.8rem;">
            <i class="fa-solid fa-arrow-right-from-bracket"></i>
          </div>
        `;
        break;
      case "not_found":
        colorClass = "text-warning";
        bgBadge = "bg-warning-subtle text-warning-emphasis border border-warning-subtle";
        iconHtml = `
          <div class="rounded-circle d-flex align-items-center justify-content-center bg-warning text-dark shadow-lg mx-auto mb-3" style="width: 90px; height: 90px; font-size: 2.8rem;">
            <i class="fa-solid fa-id-card-clip"></i>
          </div>
        `;
        break;
      case "warning":
      case "error":
      default:
        colorClass = "text-danger";
        bgBadge = "bg-danger-subtle text-danger border border-danger-subtle";
        iconHtml = `
          <div class="rounded-circle d-flex align-items-center justify-content-center bg-danger text-white shadow-lg mx-auto mb-3" style="width: 90px; height: 90px; font-size: 2.8rem;">
            <i class="fa-solid fa-circle-exclamation"></i>
          </div>
        `;
        break;
    }

    overlay.innerHTML = `
      <div class="card border-0 shadow-2-strong text-center p-4 p-md-5 rounded-4 bg-body" style="max-width: 520px; width: 90%; transform: scale(0.95); transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);">
        ${iconHtml}
        <h2 class="fw-bold ${colorClass} mb-2">${options.title}</h2>
        <p class="text-secondary fs-5 mb-3">${options.subtitle}</p>
        
        ${
          options.user
            ? `
          <div class="p-3 bg-body-tertiary rounded-3 border mb-3 text-start">
            <div class="d-flex align-items-center justify-content-between">
              <span class="fw-semibold fs-5">${options.user.name} ${options.user.surname}</span>
              ${options.user.type ? `<span class="badge ${bgBadge} rounded-pill">${options.user.type}</span>` : ""}
            </div>
          </div>
        `
            : ""
        }

        ${
          options.rfid
            ? `
          <div class="mb-3">
            <span class="badge bg-secondary-subtle text-secondary font-monospace px-3 py-2 fs-6">
              <i class="fa-solid fa-fingerprint me-1"></i> UID: ${options.rfid}
            </span>
          </div>
        `
            : ""
        }

        <div class="mt-2">
          <button type="button" class="btn btn-outline-secondary px-4 py-2 rounded-pill" id="closeRfidOverlayBtn">
            Fermer
          </button>
        </div>
      </div>
    `;

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
