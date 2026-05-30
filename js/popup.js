import { initPopupSwiper } from "./carrusel.js";

function sanitize(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatCurrency(value) {
  const number = Number(value || 0);
  return `S/ ${number.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;
}

function getStatusClass(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "en ejecucion") {
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

function hasMeaningfulStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return Boolean(normalized) && normalized !== "sin dato" && normalized !== "-";
}

function getImages(properties) {
  const fallback = [
    "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=60",
    "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=800&q=60",
    "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=800&q=60"
  ];

  const imgs = [properties.foto1, properties.foto2, properties.foto3]
    .map((url) => (url ? String(url).trim() : ""))
    .filter(Boolean);

  return imgs.length ? imgs : fallback;
}

export function buildProjectPopup(feature) {
  const p = feature?.properties || {};
  const popupId = `swiper-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const images = getImages(p);
  const projectName = p.nombre_proyecto || p.proyecto || "Proyecto sin nombre";
  const district = p.distrito || "-";
  const province = p.provincia || "-";
  const sector = p.sector || p.localidad || p.comunidad || "-";
  const status = p.estado || "";
  const beneficiaries = p.beneficiarios ?? "Sin dato";
  const budget = p.presupuesto != null ? formatCurrency(p.presupuesto) : "Sin dato";
  const statusClass = getStatusClass(status);
  const statusBadge = hasMeaningfulStatus(status)
    ? `<span class="popup-status ${statusClass}">${sanitize(status)}</span>`
    : "";

  const slides = images
    .map((img) => `<div class="swiper-slide"><img src="${sanitize(img)}" alt="Foto del proyecto"></div>`)
    .join("");

  return `
    <article class="popup-project">
      <header class="popup-header">
        <h3 class="popup-title">${sanitize(projectName)}</h3>
        ${statusBadge}
      </header>

      <div class="popup-grid">
        <div class="popup-row">
          <span class="popup-label">Provincia</span>
          <span class="popup-value">${sanitize(province)}</span>
        </div>
        <div class="popup-row">
          <span class="popup-label">Distrito</span>
          <span class="popup-value">${sanitize(district)}</span>
        </div>
        <div class="popup-row">
          <span class="popup-label">Sector</span>
          <span class="popup-value">${sanitize(sector)}</span>
        </div>
        <div class="popup-row">
          <span class="popup-label">Beneficiarios</span>
          <span class="popup-value">${sanitize(beneficiaries)}</span>
        </div>
        <div class="popup-row">
          <span class="popup-label">Presupuesto</span>
          <span class="popup-value">${sanitize(budget)}</span>
        </div>
      </div>

      <div class="popup-media-section">
        <button type="button" class="popup-media-toggle" data-popup-toggle="gallery" aria-expanded="false">
          Ver fotos
        </button>

        <div class="popup-media-panel" data-popup-gallery>
          <div id="${popupId}" class="swiper popup-swiper">
            <div class="swiper-wrapper">${slides}</div>
            <div class="swiper-pagination"></div>
            <div class="swiper-button-prev"></div>
            <div class="swiper-button-next"></div>
          </div>
        </div>
      </div>
    </article>
  `;
}

export function initPopupCarouselFromElement(rootElement) {
  if (!rootElement) {
    return;
  }

  const toggleButton = rootElement.querySelector('[data-popup-toggle="gallery"]');
  const mediaPanel = rootElement.querySelector("[data-popup-gallery]");
  const swiperContainer = rootElement.querySelector(".popup-swiper");

  if (!toggleButton || !mediaPanel || !swiperContainer || !swiperContainer.id) {
    return;
  }

  let swiperInstance = null;

  const ensureSwiper = () => {
    if (!swiperInstance) {
      swiperInstance = initPopupSwiper(`#${swiperContainer.id}`);
    }

    if (swiperInstance?.update) {
      swiperInstance.update();
    }
  };

  toggleButton.addEventListener("click", () => {
    const isOpen = mediaPanel.classList.toggle("is-open");
    toggleButton.setAttribute("aria-expanded", String(isOpen));
    toggleButton.textContent = isOpen ? "Ocultar fotos" : "Ver fotos";

    if (isOpen) {
      ensureSwiper();
    }
  });
}
