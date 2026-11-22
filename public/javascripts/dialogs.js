/**
 * FabtrackJS - Reusable Bootstrap 5 Dialogs (Confirm / Alert / Prompt)
 * Replaces all native browser confirm(), alert(), and prompt() dialogs.
 * Accessible (WCAG focus management, Escape/Enter), dark-mode compatible, CSP-safe.
 */
(() => {
  "use strict";

  if (window.__fabtrackDialogsLoaded) return;
  window.__fabtrackDialogsLoaded = true;

  const VARIANT_CONFIG = {
    danger: {
      iconClass: "fa-solid fa-triangle-exclamation",
      iconWrapClass: "bg-danger-subtle text-danger",
      btnClass: "btn-danger",
      defaultTitleAttr: "data-label-confirm",
      fallbackTitle: "Confirmation",
    },
    warning: {
      iconClass: "fa-solid fa-triangle-exclamation",
      iconWrapClass: "bg-warning-subtle text-warning-emphasis",
      btnClass: "btn-warning",
      defaultTitleAttr: "data-label-warning",
      fallbackTitle: "Avertissement",
    },
    primary: {
      iconClass: "fa-solid fa-circle-question",
      iconWrapClass: "bg-primary-subtle text-primary",
      btnClass: "btn-primary",
      defaultTitleAttr: "data-label-confirm",
      fallbackTitle: "Confirmation",
    },
    info: {
      iconClass: "fa-solid fa-circle-info",
      iconWrapClass: "bg-info-subtle text-info-emphasis",
      btnClass: "btn-primary",
      defaultTitleAttr: "data-label-info",
      fallbackTitle: "Information",
    },
    success: {
      iconClass: "fa-solid fa-circle-check",
      iconWrapClass: "bg-success-subtle text-success",
      btnClass: "btn-success",
      defaultTitleAttr: "data-label-info",
      fallbackTitle: "Information",
    },
  };

  let pendingQueue = Promise.resolve();

  function getDialogElements() {
    const modalEl = document.getElementById("fabtrackDialogModal");
    if (!modalEl) return null;
    return {
      modalEl,
      titleTextEl: document.getElementById("fabtrackDialogTitleText"),
      iconWrapEl: document.getElementById("fabtrackDialogIconWrap"),
      iconEl: document.getElementById("fabtrackDialogIcon"),
      messageEl: document.getElementById("fabtrackDialogMessage"),
      inputWrapEl: document.getElementById("fabtrackDialogInputWrapper"),
      inputLabelEl: document.getElementById("fabtrackDialogInputLabel"),
      inputEl: document.getElementById("fabtrackDialogInput"),
      cancelBtn: document.getElementById("fabtrackDialogCancelBtn"),
      confirmBtn: document.getElementById("fabtrackDialogConfirmBtn"),
    };
  }

  function normalizeOptions(optionsOrMessage, defaults) {
    if (typeof optionsOrMessage === "string") {
      return Object.assign({}, defaults, { message: optionsOrMessage });
    }
    return Object.assign({}, defaults, optionsOrMessage || {});
  }

  function openDialog(mode, rawOptions) {
    const run = () =>
      new Promise((resolve) => {
        const els = getDialogElements();
        const bs = typeof window.bootstrap !== "undefined" ? window.bootstrap : null;

        if (!els || !bs || !bs.Modal) {
          // Graceful headless fallback without native browser popups
          if (mode === "confirm") return resolve(false);
          if (mode === "prompt") return resolve(null);
          return resolve();
        }

        const defaultVariant = mode === "confirm" ? "danger" : mode === "prompt" ? "primary" : "warning";
        const opts = normalizeOptions(rawOptions, {
          variant: defaultVariant,
          title: "",
          message: "",
          confirmLabel: "",
          cancelLabel: "",
          placeholder: "",
          defaultValue: "",
          inputLabel: "",
        });

        const variantCfg = VARIANT_CONFIG[opts.variant] || VARIANT_CONFIG.primary;
        const defaultConfirm = els.modalEl.getAttribute("data-label-confirm") || "Confirmer";
        const defaultCancel = els.modalEl.getAttribute("data-label-cancel") || "Annuler";
        const defaultClose = els.modalEl.getAttribute("data-label-close") || "Fermer";
        const defaultTitle =
          els.modalEl.getAttribute(variantCfg.defaultTitleAttr) || variantCfg.fallbackTitle;

        const previouslyFocused = document.activeElement;

        // Populate icon & title safely via textContent
        if (els.titleTextEl) {
          els.titleTextEl.textContent = opts.title || defaultTitle;
        }
        if (els.iconWrapEl) {
          els.iconWrapEl.className =
            "d-inline-flex align-items-center justify-content-center rounded-circle " +
            variantCfg.iconWrapClass;
        }
        if (els.iconEl) {
          els.iconEl.className = variantCfg.iconClass;
        }
        if (els.messageEl) {
          els.messageEl.textContent = String(opts.message || "");
        }

        // Configure prompt input visibility
        if (els.inputWrapEl && els.inputEl) {
          if (mode === "prompt") {
            els.inputWrapEl.classList.remove("d-none");
            els.inputEl.value = opts.defaultValue !== undefined && opts.defaultValue !== null ? String(opts.defaultValue) : "";
            els.inputEl.placeholder = opts.placeholder || "";
            if (els.inputLabelEl) {
              els.inputLabelEl.textContent = opts.inputLabel || opts.title || "Saisie";
            }
          } else {
            els.inputWrapEl.classList.add("d-none");
            els.inputEl.value = "";
          }
        }

        // Configure buttons
        if (els.cancelBtn) {
          if (mode === "alert") {
            els.cancelBtn.classList.add("d-none");
          } else {
            els.cancelBtn.classList.remove("d-none");
            els.cancelBtn.textContent = opts.cancelLabel || defaultCancel;
          }
        }

        if (els.confirmBtn) {
          els.confirmBtn.className = "btn rounded-pill px-4 fw-semibold " + variantCfg.btnClass;
          els.confirmBtn.textContent =
            opts.confirmLabel || opts.okLabel || (mode === "alert" ? defaultClose : defaultConfirm);
        }

        const modalInstance = bs.Modal.getOrCreateInstance(els.modalEl, {
          backdrop: true,
          keyboard: true,
        });

        let resolved = false;
        let accepted = false;

        function cleanup() {
          if (els.confirmBtn) els.confirmBtn.removeEventListener("click", onConfirm);
          if (els.inputEl) els.inputEl.removeEventListener("keydown", onInputKeydown);
          els.modalEl.removeEventListener("shown.bs.modal", onShown);
          els.modalEl.removeEventListener("hidden.bs.modal", onHidden);
        }

        function onConfirm() {
          accepted = true;
          modalInstance.hide();
        }

        function onInputKeydown(event) {
          if (event.key === "Enter") {
            event.preventDefault();
            onConfirm();
          }
        }

        function onShown() {
          if (mode === "prompt" && els.inputEl) {
            els.inputEl.focus();
            els.inputEl.select();
          } else if (mode === "confirm" && opts.variant === "danger" && els.cancelBtn) {
            // For destructive actions, focus Cancel first to prevent accidental Enter confirmation
            els.cancelBtn.focus();
          } else if (els.confirmBtn) {
            els.confirmBtn.focus();
          }
        }

        function onHidden() {
          if (resolved) return;
          resolved = true;
          cleanup();

          if (previouslyFocused && typeof previouslyFocused.focus === "function") {
            try {
              previouslyFocused.focus();
            } catch (_err) {
              // Ignore focus restoration errors if element left the DOM
            }
          }

          if (mode === "confirm") {
            resolve(Boolean(accepted));
          } else if (mode === "prompt") {
            resolve(accepted && els.inputEl ? els.inputEl.value : null);
          } else {
            resolve();
          }
        }

        if (els.confirmBtn) els.confirmBtn.addEventListener("click", onConfirm);
        if (mode === "prompt" && els.inputEl) {
          els.inputEl.addEventListener("keydown", onInputKeydown);
        }
        els.modalEl.addEventListener("shown.bs.modal", onShown);
        els.modalEl.addEventListener("hidden.bs.modal", onHidden);

        modalInstance.show();
      });

    pendingQueue = pendingQueue.then(run, run);
    return pendingQueue;
  }

  window.fabtrackConfirm = function fabtrackConfirm(optionsOrMessage) {
    return openDialog("confirm", optionsOrMessage);
  };

  window.fabtrackAlert = function fabtrackAlert(optionsOrMessage) {
    return openDialog("alert", optionsOrMessage);
  };

  window.fabtrackPrompt = function fabtrackPrompt(optionsOrMessage) {
    return openDialog("prompt", optionsOrMessage);
  };
})();
