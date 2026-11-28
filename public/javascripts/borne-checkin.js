/**
 * FabtrackJS - Self-service Borne Check-in Controller (R-036)
 * Manages badge-only individual check-in confirmation, motif-specific fields,
 * double-submit protection, full form wipe on cancel or new badge, and inactivity reset.
 */
(function () {
  "use strict";

  const borneShell = document.getElementById("borneKioskShell");
  if (!borneShell) return;

  const standbyView = document.getElementById("borneStandbyView");
  const checkinView = document.getElementById("borneCheckinView");
  const checkinForm = document.getElementById("borneCheckinForm");
  const userNameEl = document.getElementById("borneUserName");
  const userTypeEl = document.getElementById("borneUserType");
  const rfidInput = document.getElementById("borneRfidInput");
  const workspaceInput = document.getElementById("borneWorkspaceIdInput");
  const projectTypeSelect = document.getElementById("borneProjecttype");
  const projectSection = document.getElementById("borneProjectSection");
  const projectSelect = document.getElementById("borneProjectSelect");
  const newDocWrap = document.getElementById("borneNewDocWrap");
  const docInput = document.getElementById("borneDocumentation");
  const repairCol = document.getElementById("borneRepairCol");
  const repairInput = document.getElementById("borneRepairObject");
  const workshopCol = document.getElementById("borneWorkshopCol");
  const workshopSelect = document.getElementById("borneWorkshopId");
  const ueRow = document.getElementById("borneUeRow");
  const ueSelect = document.getElementById("borneTeachingUnitId");
  const unregUeRow = document.getElementById("borneUnregisteredUeRow");
  const unregUeName = document.getElementById("borneUnregisteredUeName");
  const unregUeContact = document.getElementById("borneUnregisteredUeContact");
  const sorbonneRow = document.getElementById("borneSorbonneRow");
  const sorbonneInput = document.getElementById("borneSorbonneEntity");
  const commentsInput = document.getElementById("borneComments");
  const errorBox = document.getElementById("borneCheckinError");
  const cancelBtn = document.getElementById("borneCancelBtn");
  const confirmBtn = document.getElementById("borneConfirmBtn");

  let currentProjects = [];
  let isSubmitting = false;
  let inactivityTimer = null;
  const INACTIVITY_TIMEOUT_MS = 90000;

  function resolveUrl(relPath) {
    if (typeof window.getAppBaseUrl === "function") {
      return window.getAppBaseUrl(relPath);
    }
    return relPath.startsWith("/") ? relPath : "/" + relPath;
  }

  function showError(message) {
    if (!errorBox) return;
    if (!message) {
      errorBox.classList.add("d-none");
      errorBox.textContent = "";
      return;
    }
    errorBox.textContent = message;
    errorBox.classList.remove("d-none");
  }

  function clearInactivityTimer() {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
  }

  function armInactivityTimer() {
    clearInactivityTimer();
    inactivityTimer = setTimeout(() => {
      resetBorneToStandby();
    }, INACTIVITY_TIMEOUT_MS);
  }

  function checkUnregisteredUe() {
    if (!ueSelect || !unregUeRow) return;
    if (ueSelect.value === "unregistered") {
      unregUeRow.style.display = "";
      if (unregUeName) unregUeName.setAttribute("required", "required");
    } else {
      unregUeRow.style.display = "none";
      if (unregUeName) {
        unregUeName.removeAttribute("required");
        unregUeName.value = "";
      }
      if (unregUeContact) unregUeContact.value = "";
    }
  }

  function updateProjectInputVisibility() {
    if (!projectSelect || !newDocWrap || !docInput) return;
    const isProjectSectionVisible = !projectSection || projectSection.style.display !== "none";
    const isNewProject = !projectSelect.value || projectSelect.value === "new";

    if (isProjectSectionVisible && isNewProject) {
      newDocWrap.style.display = "";
      docInput.setAttribute("required", "required");
    } else {
      newDocWrap.style.display = "none";
      docInput.removeAttribute("required");
      if (isProjectSectionVisible && projectSelect.value && projectSelect.value !== "new") {
        docInput.value = "";
      }
    }
  }

  function updateMotifFields() {
    if (!projectTypeSelect) return;
    const selectedOpt = projectTypeSelect.options[projectTypeSelect.selectedIndex];
    const selectedText = selectedOpt ? (selectedOpt.text || "").trim().toLowerCase() : "";

    // Repair Café
    const isRepairEnabled = window.repairCafeConfig && window.repairCafeConfig.enabled;
    const repairName = (window.repairCafeConfig && window.repairCafeConfig.projectTypeName || "repair café").trim().toLowerCase();
    const isRepair = Boolean(isRepairEnabled && selectedOpt && (selectedText === repairName || selectedText.includes("repair")));

    // Workshop
    const isWorkshopEnabled = window.workshopConfig && window.workshopConfig.enabled;
    const workshopName = (window.workshopConfig && window.workshopConfig.projectTypeName || "atelier").trim().toLowerCase();
    const isWorkshop = Boolean(isWorkshopEnabled && selectedOpt && (selectedText === workshopName || selectedText.includes("atelier")));

    // UE / Academic
    const isUeEnabled = window.ueConfig ? window.ueConfig.enabled : false;
    const ueName = (window.ueConfig && window.ueConfig.projectTypeName || "academic").trim().toLowerCase();
    const isAcademic = Boolean(
      isUeEnabled &&
        selectedOpt &&
        (selectedText === ueName || selectedText.includes("academic") || selectedText.includes("académique") || selectedOpt.value === "2"),
    );

    // Sorbonne
    const isSorbonneEnabled = window.sorbonneConfig ? window.sorbonneConfig.enabled : false;
    const sorbonneName = (window.sorbonneConfig && window.sorbonneConfig.projectTypeName || "sorbonne").trim().toLowerCase();
    const isSorbonne = Boolean(
      isSorbonneEnabled && selectedOpt && (selectedText === sorbonneName || selectedText.includes("sorbonne")),
    );

    if (isRepair) {
      if (projectSection) projectSection.style.display = "none";
      if (repairCol) repairCol.style.display = "";
      if (workshopCol) workshopCol.style.display = "none";
      if (repairInput) repairInput.setAttribute("required", "required");
      if (workshopSelect) {
        workshopSelect.removeAttribute("required");
        workshopSelect.value = "";
      }
    } else if (isWorkshop) {
      if (projectSection) projectSection.style.display = "none";
      if (repairCol) repairCol.style.display = "none";
      if (workshopCol) workshopCol.style.display = "";
      if (workshopSelect) workshopSelect.setAttribute("required", "required");
      if (repairInput) {
        repairInput.removeAttribute("required");
        repairInput.value = "";
      }
    } else {
      if (projectSection) projectSection.style.display = "";
      if (repairCol) repairCol.style.display = "none";
      if (workshopCol) workshopCol.style.display = "none";
      if (repairInput) {
        repairInput.removeAttribute("required");
        repairInput.value = "";
      }
      if (workshopSelect) {
        workshopSelect.removeAttribute("required");
        workshopSelect.value = "";
      }
    }

    if (ueRow) {
      if (isAcademic) {
        ueRow.style.display = "";
        if (ueSelect) ueSelect.setAttribute("required", "required");
        checkUnregisteredUe();
      } else {
        ueRow.style.display = "none";
        if (ueSelect) {
          ueSelect.removeAttribute("required");
          ueSelect.value = "";
        }
        if (unregUeRow) unregUeRow.style.display = "none";
        if (unregUeName) {
          unregUeName.removeAttribute("required");
          unregUeName.value = "";
        }
        if (unregUeContact) unregUeContact.value = "";
      }
    }

    if (sorbonneRow) {
      if (isSorbonne) {
        sorbonneRow.style.display = "";
        if (sorbonneInput) sorbonneInput.setAttribute("required", "required");
      } else {
        sorbonneRow.style.display = "none";
        if (sorbonneInput) {
          sorbonneInput.removeAttribute("required");
          sorbonneInput.value = "";
        }
      }
    }

    updateProjectInputVisibility();
  }

  function wipeFormState() {
    clearInactivityTimer();
    isSubmitting = false;
    currentProjects = [];
    showError("");

    if (checkinForm) checkinForm.reset();
    if (rfidInput) rfidInput.value = "";
    if (userNameEl) userNameEl.textContent = "";
    if (userTypeEl) {
      userTypeEl.textContent = "";
      userTypeEl.classList.add("d-none");
    }
    if (projectSelect) {
      projectSelect.textContent = "";
    }
    if (docInput) docInput.value = "";
    if (commentsInput) commentsInput.value = "";
    if (repairInput) repairInput.value = "";
    if (workshopSelect) workshopSelect.value = "";
    if (ueSelect) ueSelect.value = "";
    if (unregUeName) unregUeName.value = "";
    if (unregUeContact) unregUeContact.value = "";
    if (sorbonneInput) sorbonneInput.value = "";
    if (confirmBtn) confirmBtn.disabled = false;
  }

  function resetBorneToStandby() {
    wipeFormState();
    if (checkinView) checkinView.style.display = "none";
    if (standbyView) standbyView.style.display = "";
  }

  function populateProjectSelect(projects) {
    if (!projectSelect) return;
    projectSelect.textContent = "";

    if (Array.isArray(projects) && projects.length > 0) {
      projects.forEach((proj) => {
        const opt = document.createElement("option");
        opt.value = String(proj.id);
        opt.textContent = proj.displayTitle || proj.url || `Projet #${proj.id}`;
        projectSelect.appendChild(opt);
      });
    }

    const newOpt = document.createElement("option");
    newOpt.value = "new";
    newOpt.textContent = "+ Nouveau projet (saisir un lien de documentation)";
    projectSelect.appendChild(newOpt);

    if (Array.isArray(projects) && projects.length > 0) {
      projectSelect.value = String(projects[0].id);
      applySelectedProjectDefaults(projects[0]);
    } else {
      projectSelect.value = "new";
    }
  }

  function applySelectedProjectDefaults(proj) {
    if (!proj) return;
    if (projectTypeSelect && proj.projecttypeId) {
      const hasOpt = Array.from(projectTypeSelect.options).some((o) => String(o.value) === String(proj.projecttypeId));
      if (hasOpt) {
        projectTypeSelect.value = String(proj.projecttypeId);
      }
    }
    updateMotifFields();
    if (ueSelect && proj.teachingUnitId) {
      ueSelect.value = String(proj.teachingUnitId);
      checkUnregisteredUe();
    } else if (ueSelect && proj.unregisteredUeName) {
      ueSelect.value = "unregistered";
      checkUnregisteredUe();
      if (unregUeName) unregUeName.value = proj.unregisteredUeName;
      if (unregUeContact) unregUeContact.value = proj.unregisteredUeContact || "";
    }
    if (sorbonneInput && proj.sorbonneEntity) {
      sorbonneInput.value = proj.sorbonneEntity;
    }
  }

  function openBorneCheckin(scanResult) {
    // Always wipe any prior contributor's input before showing the new badge holder
    wipeFormState();

    if (!scanResult || !scanResult.rfid || !scanResult.user) {
      resetBorneToStandby();
      return;
    }

    currentProjects = Array.isArray(scanResult.projects) ? scanResult.projects : [];
    if (rfidInput) rfidInput.value = scanResult.rfid;

    const fullName = `${scanResult.user.name || ""} ${scanResult.user.surname || ""}`.trim();
    if (userNameEl) userNameEl.textContent = fullName || "Contributeur";

    if (userTypeEl) {
      if (scanResult.user.type) {
        userTypeEl.textContent = scanResult.user.type;
        userTypeEl.classList.remove("d-none");
      } else {
        userTypeEl.textContent = "";
        userTypeEl.classList.add("d-none");
      }
    }

    if (projectTypeSelect && projectTypeSelect.options.length > 0) {
      // Pick first non-empty motif by default if present
      const firstValid = Array.from(projectTypeSelect.options).find((o) => o.value !== "");
      if (firstValid) projectTypeSelect.value = firstValid.value;
    }

    populateProjectSelect(currentProjects);
    updateMotifFields();

    if (standbyView) standbyView.style.display = "none";
    if (checkinView) checkinView.style.display = "";

    armInactivityTimer();
  }

  if (projectTypeSelect) {
    projectTypeSelect.addEventListener("change", () => {
      armInactivityTimer();
      updateMotifFields();
    });
  }

  if (projectSelect) {
    projectSelect.addEventListener("change", () => {
      armInactivityTimer();
      const selectedId = projectSelect.value;
      if (selectedId && selectedId !== "new") {
        const proj = currentProjects.find((p) => String(p.id) === String(selectedId));
        if (proj) applySelectedProjectDefaults(proj);
      } else if (
        docInput &&
        !docInput.value.trim() &&
        window.bookstackConfig &&
        window.bookstackConfig.enabled &&
        window.bookstackConfig.autoPrefill &&
        window.bookstackConfig.baseUrl
      ) {
        docInput.value = window.bookstackConfig.baseUrl;
      }
      updateProjectInputVisibility();
    });
  }

  if (ueSelect) {
    ueSelect.addEventListener("change", () => {
      armInactivityTimer();
      checkUnregisteredUe();
    });
  }

  if (checkinForm) {
    checkinForm.addEventListener("input", armInactivityTimer);
    checkinForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (isSubmitting) return;
      isSubmitting = true;
      showError("");
      if (confirmBtn) confirmBtn.disabled = true;

      try {
        const payload = {
          rfid: rfidInput ? rfidInput.value.trim() : "",
          workspaceId: workspaceInput && workspaceInput.value ? Number(workspaceInput.value) : null,
          projecttype: projectTypeSelect && projectTypeSelect.value ? Number(projectTypeSelect.value) : null,
          projectid: projectSelect && projectSelect.value && projectSelect.value !== "new" ? projectSelect.value : null,
          documentation: docInput ? docInput.value.trim() : null,
          comments: commentsInput ? commentsInput.value.trim() : null,
          teachingUnitId: ueSelect && ueSelect.value ? ueSelect.value : null,
          unregisteredUeName: unregUeName ? unregUeName.value.trim() : null,
          unregisteredUeContact: unregUeContact ? unregUeContact.value.trim() : null,
          repairObject: repairInput ? repairInput.value.trim() : null,
          workshopId: workshopSelect && workshopSelect.value ? workshopSelect.value : null,
          sorbonneEntity: sorbonneInput ? sorbonneInput.value.trim() : null,
        };

        const res = await fetch(resolveUrl("api/rfid/checkin"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (res.ok && data.success) {
          resetBorneToStandby();
          if (typeof window.showRfidFeedbackOverlay === "function") {
            window.showRfidFeedbackOverlay({
              type: "checkin",
              title: `Bienvenue, ${data.user && data.user.name ? data.user.name : ""} !`,
              subtitle: "Votre entrée dans l'atelier a bien été enregistrée.",
              user: data.user,
              autoCloseMs: 3000,
              reloadOnClose: false,
            });
          }
          return;
        }

        if (data.code === "ALREADY_CHECKED_IN") {
          resetBorneToStandby();
          if (typeof window.showRfidFeedbackOverlay === "function") {
            window.showRfidFeedbackOverlay({
              type: "warning",
              title: "Entrée déjà enregistrée",
              subtitle: data.message || "Votre entrée est déjà enregistrée.",
              autoCloseMs: 3000,
              reloadOnClose: false,
            });
          }
          return;
        }

        if (data.code === "USER_NOT_FOUND" || data.code === "TERMS_NOT_ACCEPTED") {
          resetBorneToStandby();
          if (typeof window.showRfidFeedbackOverlay === "function") {
            window.showRfidFeedbackOverlay({
              type: "not_found",
              title: data.code === "TERMS_NOT_ACCEPTED" ? "Charte non validée" : "Badge non reconnu",
              subtitle: data.message || "Veuillez vous présenter à l'accueil auprès d'un membre de l'équipe.",
              autoCloseMs: 4500,
              reloadOnClose: false,
            });
          }
          return;
        }

        showError(data.message || "Impossible d'enregistrer votre entrée. Veuillez réessayer ou vous adresser à l'accueil.");
        isSubmitting = false;
        if (confirmBtn) confirmBtn.disabled = false;
      } catch (err) {
        console.error("[Borne] Check-in submit error:", err);
        showError("Erreur de communication avec le serveur. Veuillez réessayer ou vous adresser à l'accueil.");
        isSubmitting = false;
        if (confirmBtn) confirmBtn.disabled = false;
      }
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      resetBorneToStandby();
    });
  }

  window.openBorneCheckin = openBorneCheckin;
  window.resetBorneToStandby = resetBorneToStandby;
})();
