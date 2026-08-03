const UNAVAILABLE = "No disponible";
let panelEventsBound = false;
let previouslyFocusedElement = null;

function sanitize(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function meaningfulValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }

    const normalized = String(value).trim();
    if (normalized && normalized.toLowerCase() !== "null" && normalized.toLowerCase() !== "undefined") {
      return normalized;
    }
  }

  return UNAVAILABLE;
}

function formatCurrency(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return UNAVAILABLE;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return `S/ ${value.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;
  }

  const text = String(value).trim();
  const numeric = Number(text);
  return Number.isFinite(numeric)
    ? `S/ ${numeric.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`
    : text;
}

function getStatusClass(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "en ejecucion" || normalized === "en ejecución") {
    return "is-running";
  }
  if (normalized === "finalizado") {
    return "is-done";
  }
  if (normalized === "planificado") {
    return "is-planned";
  }
  return "is-unknown";
}

function isAllowedImageUrl(value) {
  const url = String(value || "").trim();
  if (!url || url.startsWith("//")) {
    return false;
  }

  if (/^https?:\/\//i.test(url)) {
    return true;
  }

  return !/^[a-z][a-z\d+.-]*:/i.test(url) && !/[<>\"']/g.test(url);
}

function getImages(properties) {
  return [properties.foto1, properties.foto2, properties.foto3]
    .map((value) => String(value || "").trim())
    .filter(isAllowedImageUrl);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = meaningfulValue(value);
  }
}

function notifyMapResize() {
  window.dispatchEvent(new Event("resize"));
  window.setTimeout(() => window.dispatchEvent(new Event("resize")), 180);
}

function closeProjectDetailPanel({ restoreFocus = true } = {}) {
  const panel = document.getElementById("project-detail-panel");
  if (!panel || !panel.classList.contains("is-open")) {
    return;
  }

  panel.classList.remove("is-open");
  panel.setAttribute("aria-hidden", "true");
  document.body.classList.remove("project-detail-open");
  notifyMapResize();

  if (restoreFocus && previouslyFocusedElement instanceof HTMLElement) {
    previouslyFocusedElement.focus({ preventScroll: true });
  }
}

function ensurePanelEvents() {
  if (panelEventsBound) {
    return;
  }

  const closeButton = document.getElementById("project-detail-close");
  if (!closeButton) {
    return;
  }

  closeButton.addEventListener("click", () => closeProjectDetailPanel());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeProjectDetailPanel();
    }
  });
  panelEventsBound = true;
}

function renderGallery(images, projectName) {
  const gallery = document.getElementById("project-detail-gallery");
  const track = document.getElementById("project-detail-gallery-track");
  if (!gallery || !track) {
    return;
  }

  track.replaceChildren();
  gallery.hidden = images.length === 0;

  images.forEach((url, index) => {
    const figure = document.createElement("figure");
    figure.className = "project-detail-photo";

    const image = document.createElement("img");
    image.src = url;
    image.alt = `Fotografía ${index + 1} de ${projectName}`;
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => {
      figure.remove();
      if (!track.children.length) {
        gallery.hidden = true;
      }
    }, { once: true });

    figure.appendChild(image);
    track.appendChild(figure);
  });
}

function openProjectDetailPanel(feature) {
  const panel = document.getElementById("project-detail-panel");
  if (!panel) {
    return;
  }

  ensurePanelEvents();
  const properties = feature?.properties || {};
  const projectName = meaningfulValue(properties.proyecto, properties.nombre_proyecto, properties.nombre);
  const status = meaningfulValue(properties.estado);

  setText("project-detail-title", projectName);
  setText("project-detail-province", properties.provincia);
  setText("project-detail-district", properties.distrito);
  setText("project-detail-beneficiaries", properties.beneficiarios);
  setText("project-detail-budget", formatCurrency(properties.presupuesto));
  setText("project-detail-description", meaningfulValue(properties.descripcion, properties["descripción"]));
  setText("project-detail-responsible", properties.responsable);
  setText("project-detail-start-date", meaningfulValue(properties.fecha_inicio, properties.inicio, properties.fecha_ini));
  setText(
    "project-detail-end-date",
    meaningfulValue(properties.fecha_fin, properties.culminacion, properties.fecha_culminacion)
  );

  const statusElement = document.getElementById("project-detail-status");
  if (statusElement) {
    statusElement.textContent = status;
    statusElement.className = `project-detail-status ${getStatusClass(status)}`;
  }

  renderGallery(getImages(properties), projectName);
  previouslyFocusedElement = document.activeElement;
  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
  document.body.classList.add("project-detail-open");
  notifyMapResize();

  window.setTimeout(() => {
    document.getElementById("project-detail-close")?.focus({ preventScroll: true });
  }, 180);
}

export function buildProjectPopup(feature) {
  const properties = feature?.properties || {};
  const projectName = meaningfulValue(properties.proyecto, properties.nombre_proyecto, properties.nombre);
  openProjectDetailPanel(feature);

  return `
    <div class="popup-selection-indicator" role="status">
      <span>Proyecto seleccionado</span>
      <strong>${sanitize(projectName)}</strong>
    </div>
  `;
}

export function initPopupCarouselFromElement(rootElement) {
  rootElement?.classList.add("has-selection-indicator");
}
