/**
 * FabtrackJS - Flash & Client-Side Toast Notifications (R-027)
 * Strips raw "Success:", "Error:", "Warning:", "Info:" prefixes and renders
 * semantic icons safely via DOM APIs (XSS-safe).
 */
(() => {
  "use strict";

  const TYPE_STYLES = {
    error: {
      bgClass: "text-bg-danger",
      iconClass: "fa-solid fa-circle-exclamation",
      closeWhite: true,
    },
    warning: {
      bgClass: "text-bg-warning",
      iconClass: "fa-solid fa-triangle-exclamation",
      closeWhite: false,
    },
    success: {
      bgClass: "text-bg-success",
      iconClass: "fa-solid fa-circle-check",
      closeWhite: true,
    },
    info: {
      bgClass: "text-bg-info",
      iconClass: "fa-solid fa-circle-info",
      closeWhite: false,
    },
  };

  const ALL_BG_CLASSES = [
    "text-bg-secondary",
    "text-bg-danger",
    "text-bg-warning",
    "text-bg-success",
    "text-bg-info",
  ];

  function parseNotificationMessage(rawText) {
    const trimmed = String(rawText || "").trim();
    if (!trimmed) {
      return { type: null, text: "" };
    }
    const match = trimmed.match(/^(Error|Warning|Success|Info)\s*:\s*([\s\S]*)$/i);
    if (!match) {
      return { type: null, text: trimmed };
    }
    return {
      type: match[1].toLowerCase(),
      text: match[2].trim(),
    };
  }

  function renderToast(message, type) {
    const toastLiveMessage = document.getElementById("liveToastMessage");
    if (!toastLiveMessage || typeof window.bootstrap === "undefined" || !window.bootstrap.Toast) {
      return false;
    }

    const normalizedType = String(type || "info").toLowerCase();
    const style = TYPE_STYLES[normalizedType] || TYPE_STYLES.info;
    const cleanText = String(message || "").trim();
    if (!cleanText) return false;

    const toastBody = toastLiveMessage.querySelector(".toast-body");
    if (toastBody) {
      toastBody.textContent = "";
      const wrapper = document.createElement("span");
      wrapper.className = "d-inline-flex align-items-center gap-2";

      const icon = document.createElement("i");
      icon.className = style.iconClass;
      icon.setAttribute("aria-hidden", "true");

      const textSpan = document.createElement("span");
      textSpan.textContent = cleanText;

      wrapper.appendChild(icon);
      wrapper.appendChild(textSpan);
      toastBody.appendChild(wrapper);
    }

    ALL_BG_CLASSES.forEach((cls) => toastLiveMessage.classList.remove(cls));
    toastLiveMessage.classList.add(style.bgClass);

    const closeBtn = toastLiveMessage.querySelector(".btn-close");
    if (closeBtn) {
      if (style.closeWhite) {
        closeBtn.classList.add("btn-close-white");
      } else {
        closeBtn.classList.remove("btn-close-white");
      }
    }

    const toastBootstrap = window.bootstrap.Toast.getOrCreateInstance(toastLiveMessage);
    toastBootstrap.show();
    return true;
  }

  function showNotification() {
    const toastLiveMessage = document.getElementById("liveToastMessage");
    if (!toastLiveMessage) return;

    const toastBody = toastLiveMessage.querySelector(".toast-body");
    if (!toastBody) return;

    const rawText = toastBody.textContent || "";
    const parsed = parseNotificationMessage(rawText);
    if (!parsed.type || !parsed.text) return;

    renderToast(parsed.text, parsed.type);
  }

  window.parseAppNotification = parseNotificationMessage;
  window.showAppToast = function showAppToast(message, type) {
    const parsed = parseNotificationMessage(message);
    if (parsed.type && parsed.text) {
      return renderToast(parsed.text, type || parsed.type);
    }
    return renderToast(message, type || "info");
  };

  showNotification();
})();
