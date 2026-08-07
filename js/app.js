import { initMap, addSearchControl } from "./mapa.js";
import { initCapas, getCapasConfig } from "./capas.js";
import {
  getFilterState,
  populateFilterOptions,
  applyFilters,
  attachFilterEvents,
  refreshDistrictFilter
} from "./filtros.js";
import { buildProjectPopup, initPopupCarouselFromElement } from "./popup.js";

const CONFIG = getCapasConfig();

const APP_STATE = {
  allProjects: { type: "FeatureCollection", features: [] },
  filteredProjects: { type: "FeatureCollection", features: [] },
  map: null,
  overlays: {},
  boundaryCatalog: { provincias: [], distritos: [] },
  baseLayers: {},
  projectLayer: null,
  setProjectFeatures: null,
  getBoundaryGeoJSON: null,
  panelClosed: false
};

let projectSearchIndex = [];
let projectSearchMeasurements = { total: 0, count: 0 };

const PROVINCE_DEFAULT_STYLE = {
  color: "#0b4f8a",
  weight: 3,
  opacity: 0.9,
  fillColor: "#4ea1d3",
  fillOpacity: 0.12
};

const PROVINCE_HIGHLIGHT_STYLE = {
  color: "#d9480f",
  weight: 4,
  opacity: 1,
  fillColor: "#ff922b",
  fillOpacity: 0.35
};

const DISTRICT_DEFAULT_STYLE = {
  color: "#a14b12",
  weight: 1.3,
  opacity: 0.85,
  dashArray: "4 3",
  fillColor: "#f2a65a",
  fillOpacity: 0.05
};

const DISTRICT_HIGHLIGHT_STYLE = {
  color: "#7b2cbf",
  weight: 2.4,
  opacity: 1,
  dashArray: "",
  fillColor: "#c77dff",
  fillOpacity: 0.28
};

document.addEventListener("DOMContentLoaded", async () => {
  setCurrentDate();

  const { map, baseLayers } = initMap();
  APP_STATE.map = map;
  APP_STATE.baseLayers = baseLayers || {};

  const {
    overlays,
    boundaryCatalog,
    allProjects,
    projectLayer,
    projectsLoadError,
    setProjectFeatures,
    getBoundaryGeoJSON
  } = await initCapas({
    config: CONFIG,
    map,
    popupBuilder: buildProjectPopup
  });

  APP_STATE.overlays = overlays;
  APP_STATE.boundaryCatalog = boundaryCatalog || { provincias: [], distritos: [], byProvinceDistricts: {} };
  APP_STATE.allProjects = allProjects;
  APP_STATE.filteredProjects = allProjects;
  APP_STATE.projectLayer = projectLayer;
  APP_STATE.setProjectFeatures = setProjectFeatures;
  APP_STATE.getBoundaryGeoJSON = getBoundaryGeoJSON;

  updateExecutiveDashboard(APP_STATE.allProjects);

  bindMapAndLayerEvents();
  bindGeoToolbar();
  addSearchControl(map, projectLayer, "proyecto");

  populateFilterOptions(APP_STATE.allProjects, APP_STATE.boundaryCatalog);
  initSmartProjectSearch(APP_STATE.allProjects);
  bindScrollableFilterSelects();
  bindFilterEvents();
  bindProvinceProjectsPanel();
  bindLayerToggles();

  map.on("popupopen", (event) => {
    initPopupCarouselFromElement(event.popup.getElement());
  });

  animateCards();
});

function bindMapAndLayerEvents() {
  const map = APP_STATE.map;
  if (!map) {
    return;
  }

  const invalidateMapSize = () => {
    map.invalidateSize({ pan: false, debounceMoveend: true });
  };

  const scheduleInvalidate = () => {
    requestAnimationFrame(() => invalidateMapSize());
    setTimeout(invalidateMapSize, 180);
  };

  scheduleInvalidate();
  window.addEventListener("resize", scheduleInvalidate, { passive: true });

  const sidebar = document.getElementById("sidebar");
  if (sidebar) {
    sidebar.addEventListener("shown.bs.offcanvas", scheduleInvalidate);
    sidebar.addEventListener("hidden.bs.offcanvas", scheduleInvalidate);
  }
}

function bindLayerToggles() {
  document.querySelectorAll(".layer-toggle").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const key = event.target.dataset.layer;
      const map = APP_STATE.map;
      const target = resolveOverlayByKey(key);
      if (!map || !target) {
        return;
      }

      if (event.target.checked) {
        target.addTo(map);
      } else if (map.hasLayer(target)) {
        map.removeLayer(target);
      }
    });
  });
}

function resolveOverlayByKey(key) {
  const mapByKey = {
    provincias: APP_STATE.overlays.Provincias,
    distritos: APP_STATE.overlays.Distritos,
    proyectos: APP_STATE.overlays.Proyectos
  };
  return mapByKey[key];
}

function bindFilterEvents() {
  const hasActiveFilters = (filters) =>
    Boolean(filters?.provincia || filters?.distrito || filters?.estado || filters?.proyecto);

  const setProvinceInteractivity = (enabled) => {
    const provinceOverlay = APP_STATE.overlays.Provincias;
    if (!provinceOverlay || typeof provinceOverlay.eachLayer !== "function") {
      return;
    }

    provinceOverlay.eachLayer((layer) => {
      if (!layer?.feature || typeof layer.setStyle !== "function") {
        return;
      }

      layer.setStyle({ interactive: enabled });
      if (!enabled && typeof layer.closePopup === "function") {
        layer.closePopup();
      }
    });
  };

  const applyCurrentFilters = ({ doZoom = true } = {}) => {
    const filters = getFilterState();
    const filtered = applyFilters(APP_STATE.allProjects, filters);
    APP_STATE.filteredProjects = filtered;
    APP_STATE.setProjectFeatures(filtered);
    updateExecutiveDashboard(filtered, hasActiveFilters(filters));
    setProvinceInteractivity(!hasActiveFilters(filters));
    updateGeographicContext(filters.provincia, filters.distrito, filters.proyecto);

    if (doZoom) {
      zoomFromFilters(filters);
    }

    return filters;
  };

  attachFilterEvents({
    onApply: () => applyCurrentFilters({ doZoom: true }),
    onClear: () => {
      clearFilterUI();
      APP_STATE.filteredProjects = APP_STATE.allProjects;
      APP_STATE.setProjectFeatures(APP_STATE.allProjects);
      updateExecutiveDashboard(APP_STATE.allProjects);
      setProvinceInteractivity(true);
    },
    onProvinceChange: (province) => {
      refreshDistrictFilter(APP_STATE.allProjects, province, APP_STATE.boundaryCatalog);
      const districtSelect = document.getElementById("filtro-distrito");
      if (districtSelect) {
        districtSelect.value = "";
      }
      applyCurrentFilters({ doZoom: false });
      zoomToProvince(province);
    },
    onDistrictChange: (district) => {
      const filters = getFilterState();
      applyCurrentFilters({ doZoom: false });
      zoomToDistrict(filters.provincia, district);
    },
    onProjectChange: (project) => {
      applyCurrentFilters({ doZoom: false });
      zoomToProject(project);
    }
  });
}

const GEO_TOOL_PANEL_IDS = [
  "sidebar",
  "search-tools-panel",
  "layers-tools-panel",
  "legend-tools-panel",
  "info-tools-panel",
  "basemap-tools-panel"
];

function closeGeoToolPanels({ restoreFocus = false } = {}) {
  let activeButton = null;

  GEO_TOOL_PANEL_IDS.forEach((panelId) => {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");

    const button = panelId === "sidebar"
      ? document.getElementById("desktop-sidebar-show")
      : document.querySelector(`[data-tool-target="${panelId}"]`);
    if (button?.getAttribute("aria-expanded") === "true") activeButton = button;
    button?.setAttribute("aria-expanded", "false");
    button?.classList.remove("is-active");
  });

  const backdrop = document.getElementById("geo-tool-backdrop");
  if (backdrop) backdrop.hidden = true;
  const toolbar = document.querySelector(".geo-toolbar");
  toolbar?.classList.remove("tools-expanded");
  const moreButton = document.getElementById("geo-tool-more");
  moreButton?.setAttribute("aria-expanded", "false");
  moreButton?.classList.remove("is-active");
  requestAnimationFrame(() => APP_STATE.map?.invalidateSize({ pan: false }));
  if (restoreFocus) activeButton?.focus({ preventScroll: true });
}

function bindGeoToolbar() {
  const map = APP_STATE.map;
  const mainButton = document.getElementById("desktop-sidebar-show");
  const closeMain = document.getElementById("desktop-sidebar-hide");
  const backdrop = document.getElementById("geo-tool-backdrop");
  const toolbar = document.querySelector(".geo-toolbar");

  const openPanel = (panelId, button) => {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const willOpen = !panel.classList.contains("is-open");
    closeGeoToolPanels();
    if (!willOpen) return;

    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    button?.setAttribute("aria-expanded", "true");
    button?.classList.add("is-active");
    if (backdrop) backdrop.hidden = false;
    window.setTimeout(() => {
      map?.invalidateSize({ pan: false });
      panel.querySelector("input, select, button")?.focus({ preventScroll: true });
    }, 140);
  };

  mainButton?.addEventListener("click", () => openPanel("sidebar", mainButton));
  closeMain?.addEventListener("click", () => closeGeoToolPanels({ restoreFocus: true }));
  document.querySelectorAll("[data-tool-target]").forEach((button) => {
    button.addEventListener("click", () => openPanel(button.dataset.toolTarget, button));
  });
  document.querySelectorAll("[data-close-tool-panel]").forEach((button) => {
    button.addEventListener("click", () => closeGeoToolPanels({ restoreFocus: true }));
  });
  backdrop?.addEventListener("click", () => closeGeoToolPanels());

  document.getElementById("geo-tool-more")?.addEventListener("click", (event) => {
    const expanded = toolbar?.classList.toggle("tools-expanded") || false;
    event.currentTarget.setAttribute("aria-expanded", String(expanded));
    event.currentTarget.classList.toggle("is-active", expanded);
  });

  document.getElementById("geo-tool-home")?.addEventListener("click", () => {
    closeGeoToolPanels();
    const boundsLayers = [APP_STATE.overlays.Provincias, APP_STATE.overlays.Distritos]
      .filter((layer) => layer && typeof layer.getBounds === "function");
    const group = boundsLayers.length ? L.featureGroup(boundsLayers) : null;
    const bounds = group?.getBounds();
    if (bounds?.isValid()) map?.fitBounds(bounds, { padding: [24, 24], maxZoom: 10 });
  });

  document.querySelectorAll("[data-basemap]").forEach((button) => {
    button.addEventListener("click", () => {
      const selected = APP_STATE.baseLayers[button.dataset.basemap];
      if (!selected || !map) return;
      Object.values(APP_STATE.baseLayers).forEach((layer) => {
        if (layer !== selected && map.hasLayer(layer)) map.removeLayer(layer);
      });
      selected.addTo(map);
      document.querySelectorAll("[data-basemap]").forEach((option) => {
        option.classList.toggle("is-active", option === button);
      });
      closeGeoToolPanels();
    });
  });

  const syncInfoTotals = () => {
    document.querySelectorAll("[data-stat-source]").forEach((target) => {
      target.textContent = document.getElementById(target.dataset.statSource)?.textContent || "—";
    });
  };
  syncInfoTotals();
  const statistics = document.querySelector(".panel-statistics");
  if (statistics) new MutationObserver(syncInfoTotals).observe(statistics, { childList: true, subtree: true, characterData: true });
  const updateDate = document.getElementById("geoportal-update-date");
  if (updateDate) updateDate.textContent = new Intl.DateTimeFormat("es-PE", { dateStyle: "long" }).format(new Date());

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeGeoToolPanels({ restoreFocus: true });
  });

  new MutationObserver(() => {
    if (document.body.classList.contains("project-detail-open")) closeGeoToolPanels();
  }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
}

const DASHBOARD_INTEGER_FORMAT = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
const DASHBOARD_CURRENCY_FORMAT = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  maximumFractionDigits: 0
});

function parseDashboardNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value !== "string") {
    return 0;
  }

  let normalized = value.trim().replace(/[^\d,.-]/g, "");
  if (!normalized) {
    return 0;
  }

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const groups = normalized.split(",");
    normalized = groups.length > 2 || groups.at(-1).length === 3
      ? groups.join("")
      : normalized.replace(",", ".");
  } else if (lastDot >= 0) {
    const groups = normalized.split(".");
    if (groups.length > 2 || groups.at(-1).length === 3) {
      normalized = groups.join("");
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function setDashboardValue(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function classifyProjectStatus(value) {
  const status = normalizeKey(value);
  if (status === "en ejecucion") {
    return "execution";
  }
  if (status === "en proceso") {
    return "process";
  }
  if (status === "finalizado") {
    return "completed";
  }
  return "other";
}

function updateExecutiveDashboard(geojson, isFiltered = false) {
  const startedAt = performance.now();
  const features = Array.isArray(geojson?.features) ? geojson.features : [];
  const provinces = new Set();
  const districts = new Set();
  const statuses = { execution: 0, process: 0, completed: 0, other: 0 };
  let beneficiaries = 0;
  let budget = 0;

  features.forEach((feature) => {
    const properties = feature?.properties || {};
    const province = normalizeKey(properties.provincia);
    const district = normalizeKey(properties.distrito);
    if (province) provinces.add(province);
    if (district) districts.add(district);

    beneficiaries += parseDashboardNumber(properties.beneficiarios);
    budget += parseDashboardNumber(properties.presupuesto);
    statuses[classifyProjectStatus(properties.estado)] += 1;
  });

  setDashboardValue("stat-projects", DASHBOARD_INTEGER_FORMAT.format(features.length));
  setDashboardValue("stat-provinces", DASHBOARD_INTEGER_FORMAT.format(provinces.size));
  setDashboardValue("stat-districts", DASHBOARD_INTEGER_FORMAT.format(districts.size));
  setDashboardValue("stat-beneficiaries", DASHBOARD_INTEGER_FORMAT.format(beneficiaries));
  setDashboardValue("stat-budget", DASHBOARD_CURRENCY_FORMAT.format(budget));
  setDashboardValue("stat-status-execution", DASHBOARD_INTEGER_FORMAT.format(statuses.execution));
  setDashboardValue("stat-status-process", DASHBOARD_INTEGER_FORMAT.format(statuses.process));
  setDashboardValue("stat-status-completed", DASHBOARD_INTEGER_FORMAT.format(statuses.completed));
  setDashboardValue("stat-status-other", DASHBOARD_INTEGER_FORMAT.format(statuses.other));

  const note = document.getElementById("statistics-note");
  if (note) {
    note.textContent = isFiltered
      ? "Indicadores de los proyectos visibles"
      : "Datos consolidados de los proyectos registrados";
  }

  const dashboard = document.querySelector(".panel-statistics");
  if (dashboard) {
    dashboard.dataset.recalculationMs = (performance.now() - startedAt).toFixed(3);
  }
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getSearchProjectName(properties) {
  return String(properties?.proyecto || properties?.nombre_proyecto || properties?.nombre || "").trim();
}

function buildProjectSearchIndex(featureCollection) {
  return (featureCollection?.features || []).map((feature, index) => {
    const properties = feature?.properties || {};
    const name = getSearchProjectName(properties) || "Proyecto sin nombre";
    const province = String(properties.provincia || "").trim();
    const district = String(properties.distrito || "").trim();
    const status = String(properties.estado || "").trim();

    return {
      id: index,
      feature,
      name,
      province,
      district,
      status,
      searchable: normalizeKey([name, province, district, status].join(" "))
    };
  });
}

function searchProjects(query) {
  const startedAt = performance.now();
  const normalizedQuery = normalizeKey(query);
  const results = [];

  if (normalizedQuery) {
    for (const item of projectSearchIndex) {
      if (item.searchable.includes(normalizedQuery)) {
        results.push(item);
        if (results.length === 8) {
          break;
        }
      }
    }
  }

  const elapsed = performance.now() - startedAt;
  projectSearchMeasurements.total += elapsed;
  projectSearchMeasurements.count += 1;
  const input = document.getElementById("smart-project-search-input");
  if (input) {
    input.dataset.lastSearchMs = elapsed.toFixed(3);
    input.dataset.averageSearchMs = (
      projectSearchMeasurements.total / projectSearchMeasurements.count
    ).toFixed(3);
  }

  return results;
}

function closeSmartSearchResults() {
  const input = document.getElementById("smart-project-search-input");
  const results = document.getElementById("smart-project-search-results");
  if (results) {
    results.hidden = true;
    results.replaceChildren();
  }
  input?.setAttribute("aria-expanded", "false");
}

function renderSmartSearchResults(query) {
  const container = document.getElementById("smart-project-search-results");
  const input = document.getElementById("smart-project-search-input");
  if (!container || !input) {
    return;
  }

  const normalizedQuery = normalizeKey(query);
  container.replaceChildren();
  if (!normalizedQuery) {
    closeSmartSearchResults();
    return;
  }

  const matches = searchProjects(normalizedQuery);
  if (!matches.length) {
    const empty = document.createElement("p");
    empty.className = "smart-search-empty";
    empty.textContent = "No se encontraron proyectos.";
    container.appendChild(empty);
  } else {
    matches.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "smart-search-result";
      button.setAttribute("role", "option");
      button.dataset.searchResultId = String(item.id);

      const name = document.createElement("strong");
      name.className = "smart-result-name";
      name.textContent = `🌱 ${item.name}`;

      const location = document.createElement("span");
      location.className = "smart-result-location";
      location.textContent = `📍 ${[item.province, item.district].filter(Boolean).join(" - ") || "No disponible"}`;

      const status = document.createElement("span");
      status.className = "smart-result-status";
      status.textContent = `🟢 ${item.status || "No disponible"}`;

      button.append(name, location, status);
      button.addEventListener("click", () => selectSmartSearchResult(item));
      container.appendChild(button);
    });
  }

  container.hidden = false;
  input.setAttribute("aria-expanded", "true");
}

function openSelectedProjectPopup(feature) {
  requestAnimationFrame(() => {
    let selectedLayer = null;
    APP_STATE.projectLayer?.eachLayer((layer) => {
      if (!selectedLayer && layer?.feature === feature) {
        selectedLayer = layer;
      }
    });

    if (!selectedLayer) {
      return;
    }

    const target = typeof selectedLayer.getLatLng === "function"
      ? selectedLayer.getLatLng()
      : selectedLayer.getBounds?.().getCenter();
    if (target) {
      APP_STATE.map.setView(target, Math.max(APP_STATE.map.getZoom(), 14));
    }
    selectedLayer.openPopup?.();
    selectedLayer.bringToFront?.();
  });
}

function selectSmartSearchResult(item) {
  const featureCollection = { type: "FeatureCollection", features: [item.feature] };
  clearFilterUI();
  APP_STATE.filteredProjects = featureCollection;
  APP_STATE.setProjectFeatures(featureCollection);
  updateExecutiveDashboard(featureCollection, true);
  updateGeographicContext(item.province, item.district, item.name);
  closeSmartSearchResults();

  const input = document.getElementById("smart-project-search-input");
  if (input) {
    input.value = item.name;
  }
  document.getElementById("smart-project-search-clear")?.removeAttribute("hidden");
  openSelectedProjectPopup(item.feature);
  closeGeoToolPanels();
}

function initSmartProjectSearch(featureCollection) {
  projectSearchIndex = buildProjectSearchIndex(featureCollection);
  projectSearchMeasurements = { total: 0, count: 0 };

  const input = document.getElementById("smart-project-search-input");
  const clearButton = document.getElementById("smart-project-search-clear");
  const container = document.querySelector(".smart-project-search");
  if (!input || !clearButton || !container) {
    return;
  }

  input.addEventListener("input", () => {
    clearButton.hidden = !input.value;
    renderSmartSearchResults(input.value);
  });

  input.addEventListener("keydown", (event) => {
    const options = [...document.querySelectorAll(".smart-search-result")];
    if (event.key === "ArrowDown" && options.length) {
      event.preventDefault();
      options[0].focus();
    } else if (event.key === "Enter" && options.length) {
      event.preventDefault();
      options[0].click();
    } else if (event.key === "Escape") {
      closeSmartSearchResults();
    }
  });

  clearButton.addEventListener("click", () => {
    input.value = "";
    clearButton.hidden = true;
    closeSmartSearchResults();
    input.focus();
  });

  document.addEventListener("click", (event) => {
    if (!container.contains(event.target)) {
      closeSmartSearchResults();
    }
  });
}

function zoomFromFilters(filters) {
  if (!filters) {
    return;
  }

  if (filters.proyecto) {
    zoomToProject(filters.proyecto);
    return;
  }

  if (filters.distrito) {
    zoomToDistrict(filters.provincia, filters.distrito);
    return;
  }

  if (filters.provincia) {
    zoomToProvince(filters.provincia);
  }
}

function zoomToProvince(province) {
  if (!province || !APP_STATE.map) {
    return;
  }

  const provinceOverlay = APP_STATE.overlays.Provincias;
  if (provinceOverlay && typeof provinceOverlay.eachLayer === "function") {
    const matches = [];
    provinceOverlay.eachLayer((layer) => {
      const value = layer?.feature?.properties?.provincia || "";
      if (normalizeText(value) === normalizeText(province) && typeof layer.getBounds === "function") {
        matches.push(layer);
      }
    });

    if (matches.length) {
      const group = L.featureGroup(matches);
      APP_STATE.map.fitBounds(group.getBounds(), { padding: [24, 24], maxZoom: 12 });
      return;
    }
  }

  zoomUsingProjectPoints((p) => normalizeText(p.provincia) === normalizeText(province), 12);
}

function zoomToDistrict(province, district) {
  if (!district || !APP_STATE.map) {
    return;
  }

  const districtOverlay = APP_STATE.overlays.Distritos;
  if (districtOverlay && typeof districtOverlay.eachLayer === "function") {
    const matches = [];
    districtOverlay.eachLayer((layer) => {
      const lp = layer?.feature?.properties?.provincia || "";
      const ld = layer?.feature?.properties?.distrito || "";
      const sameDistrict = normalizeText(ld) === normalizeText(district);
      const sameProvince = !province || normalizeText(lp) === normalizeText(province);
      if (sameDistrict && sameProvince && typeof layer.getBounds === "function") {
        matches.push(layer);
      }
    });

    if (matches.length) {
      const group = L.featureGroup(matches);
      APP_STATE.map.fitBounds(group.getBounds(), { padding: [24, 24], maxZoom: 13 });
      return;
    }
  }

  zoomUsingProjectPoints(
    (p) =>
      normalizeText(p.distrito) === normalizeText(district) &&
      (!province || normalizeText(p.provincia) === normalizeText(province)),
    13
  );
}

function zoomToProject(project) {
  if (!project || !APP_STATE.map) {
    return;
  }

  zoomUsingProjectPoints(
    (p) => normalizeText(p.proyecto || p.nombre_proyecto || "") === normalizeText(project),
    14
  );
}

function zoomUsingProjectPoints(predicate, maxZoom) {
  const matches = (APP_STATE.allProjects?.features || []).filter((feature) =>
    predicate(feature?.properties || {})
  );

  if (!matches.length) {
    return;
  }

  const fc = { type: "FeatureCollection", features: matches };
  const tempLayer = L.geoJSON(fc);
  if (tempLayer.getLayers().length) {
    APP_STATE.map.fitBounds(tempLayer.getBounds(), { padding: [24, 24], maxZoom });
  }
}

function setMinimizeButtonState(button, isMinimized) {
  if (!button) {
    return;
  }

  const icon = isMinimized ? "+" : "-";
  const label = isMinimized ? "Expandir panel" : "Minimizar panel";
  button.innerHTML = `<span class="panel-btn-icon" aria-hidden="true">${icon}</span>`;
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
}

function bindProvinceProjectsPanel() {
  document.getElementById("btn-panel-close")?.addEventListener("click", () => {
    APP_STATE.panelClosed = true;
    hideProvincePanel();
  });

  document.getElementById("btn-panel-minimize")?.addEventListener("click", () => {
    const panel = document.getElementById("province-project-panel");
    const btn = document.getElementById("btn-panel-minimize");
    if (!panel || !btn) {
      return;
    }

    panel.classList.toggle("is-minimized");
    setMinimizeButtonState(btn, panel.classList.contains("is-minimized"));
  });
}

function updateGeographicContext(province, district, project) {
  const projectScope = getProjectScope(project);

  applyProvinceHighlight(province, projectScope.provinces);
  applyDistrictHighlight(province, district, projectScope.districts);

  if (district) {
    renderDistrictProjectsPanel(province, district);
    return;
  }

  if (project) {
    renderProjectScopePanel(project, projectScope);
    return;
  }

  renderProvinceProjectsPanel(province);
}

function applyProvinceHighlight(province, scopedProvinces = new Set()) {
  const provinceOverlay = APP_STATE.overlays.Provincias;
  if (!provinceOverlay || typeof provinceOverlay.eachLayer !== "function") {
    return;
  }

  provinceOverlay.eachLayer((layer) => {
    if (!layer?.feature || typeof layer.setStyle !== "function") {
      return;
    }

    const layerProvince = layer.feature?.properties?.provincia || "";
    const isSelectedByFilter =
      Boolean(province) && normalizeText(layerProvince) === normalizeText(province);
    const isSelectedByProject =
      !province && [...scopedProvinces].some((item) => normalizeText(item) === normalizeText(layerProvince));
    const isSelected = isSelectedByFilter || isSelectedByProject;
    layer.setStyle(isSelected ? PROVINCE_HIGHLIGHT_STYLE : PROVINCE_DEFAULT_STYLE);

    if (isSelected && typeof layer.bringToFront === "function") {
      layer.bringToFront();
    }
  });

  if (APP_STATE.projectLayer && typeof APP_STATE.projectLayer.bringToFront === "function") {
    APP_STATE.projectLayer.bringToFront();
  }
}

function applyDistrictHighlight(province, district, scopedDistricts = new Set()) {
  const districtOverlay = APP_STATE.overlays.Distritos;
  if (!districtOverlay || typeof districtOverlay.eachLayer !== "function") {
    return;
  }

  districtOverlay.eachLayer((layer) => {
    if (!layer?.feature || typeof layer.setStyle !== "function") {
      return;
    }

    const layerProvince = layer.feature?.properties?.provincia || "";
    const layerDistrict = layer.feature?.properties?.distrito || "";
    const isSelectedByFilter =
      Boolean(district) &&
      normalizeText(layerDistrict) === normalizeText(district) &&
      (!province || normalizeText(layerProvince) === normalizeText(province));
    const isSelectedByProject =
      !district && [...scopedDistricts].some((item) => normalizeText(item) === normalizeText(layerDistrict));
    const isSelected = isSelectedByFilter || isSelectedByProject;

    layer.setStyle(isSelected ? DISTRICT_HIGHLIGHT_STYLE : DISTRICT_DEFAULT_STYLE);

    if (isSelected && typeof layer.bringToFront === "function") {
      layer.bringToFront();
    }
  });

  if (APP_STATE.projectLayer && typeof APP_STATE.projectLayer.bringToFront === "function") {
    APP_STATE.projectLayer.bringToFront();
  }
}

function renderProvinceProjectsPanel(province) {
  if (!province) {
    hideProvincePanel();
    return;
  }

  APP_STATE.panelClosed = false;

  const panel = document.getElementById("province-project-panel");
  const title = document.getElementById("province-panel-title");
  const subtitle = document.getElementById("province-panel-subtitle");
  const list = document.getElementById("province-project-list");
  const minimizeBtn = document.getElementById("btn-panel-minimize");
  if (!panel || !title || !list || !minimizeBtn) {
    return;
  }

  const uniqueProjects = new Map();
  const byProject = {};

  (APP_STATE.allProjects?.features || [])
    .filter((feature) => normalizeText(feature?.properties?.provincia) === normalizeText(province))
    .forEach((feature) => {
      const p = feature?.properties || {};
      const locality = String(p.sector || p.localidad || p.comunidad || "Sin localidad").trim() || "Sin localidad";
      const projectName = String(p.proyecto || p.nombre_proyecto || "Proyecto sin nombre").trim();
      const projectKey = normalizeKey(projectName || "Proyecto sin nombre");

      if (!byProject[projectKey]) {
        byProject[projectKey] = {
          projectName: projectName || "Proyecto sin nombre",
          localities: new Set()
        };
      }

      byProject[projectKey].localities.add(locality);

      if (projectName) {
        if (!uniqueProjects.has(projectKey)) {
          uniqueProjects.set(projectKey, projectName);
        }
      }
    });

  const projectEntries = Object.values(byProject).sort((a, b) =>
    a.projectName.localeCompare(b.projectName, "es")
  );
  const totalLocalities = projectEntries.reduce((acc, item) => acc + (item.localities?.size || 0), 0);

  title.textContent = `Proyectos en ${province}`;
  title.removeAttribute("title");
  if (subtitle) {
    subtitle.textContent = projectEntries.length
      ? `${projectEntries.length} proyecto(s) | ${totalLocalities} localidad(es)`
      : "No hay proyectos registrados para la provincia seleccionada";
    subtitle.removeAttribute("title");
  }

  if (!projectEntries.length) {
    list.innerHTML = `<li class="project-item-empty">No se encontraron proyectos en esta provincia.</li>`;
  } else {
    list.innerHTML = projectEntries
      .map((entry) => {
        const localities = [...(entry.localities || new Set())].sort((a, b) =>
          a.localeCompare(b, "es")
        );

        return `<li class="province-project-item">
            <p class="project-item-name">Proyecto: ${escapeHtml(entry.projectName)}</p>
            <p class="project-item-meta">Localidades: <span class="project-item-localidad">${escapeHtml(
              localities.join(", ")
            )}</span></p>
          </li>`;
      })
      .join("");
  }

  panel.classList.remove("is-hidden");
  panel.classList.remove("is-minimized");
  setMinimizeButtonState(minimizeBtn, false);
}

function renderDistrictProjectsPanel(province, district) {
  if (!district) {
    hideProvincePanel();
    return;
  }

  APP_STATE.panelClosed = false;

  const panel = document.getElementById("province-project-panel");
  const title = document.getElementById("province-panel-title");
  const subtitle = document.getElementById("province-panel-subtitle");
  const list = document.getElementById("province-project-list");
  const minimizeBtn = document.getElementById("btn-panel-minimize");
  if (!panel || !title || !list || !minimizeBtn) {
    return;
  }

  const byProject = {};

  (APP_STATE.allProjects?.features || [])
    .filter((feature) => {
      const p = feature?.properties || {};
      const matchDistrict = normalizeText(p.distrito) === normalizeText(district);
      const matchProvince = !province || normalizeText(p.provincia) === normalizeText(province);
      return matchDistrict && matchProvince;
    })
    .forEach((feature) => {
      const p = feature?.properties || {};
      const projectName = String(p.proyecto || p.nombre_proyecto || "Proyecto sin nombre").trim();
      const locality = String(p.sector || p.localidad || p.comunidad || "Sin localidad").trim() || "Sin localidad";
      const projectKey = normalizeKey(projectName || "Proyecto sin nombre");

      if (!byProject[projectKey]) {
        byProject[projectKey] = {
          projectName: projectName || "Proyecto sin nombre",
          localities: new Set()
        };
      }

      byProject[projectKey].localities.add(locality);
    });

  const projectEntries = Object.values(byProject).sort((a, b) =>
    a.projectName.localeCompare(b.projectName, "es")
  );
  const totalLocalities = projectEntries.reduce((acc, item) => acc + (item.localities?.size || 0), 0);

  const scopeTitle = province ? `${district} - ${province}` : district;
  title.textContent = `Proyectos en ${scopeTitle}`;
  title.removeAttribute("title");
  if (subtitle) {
    subtitle.textContent = projectEntries.length
      ? `${projectEntries.length} proyecto(s) | ${totalLocalities} localidad(es)`
      : "No hay proyectos registrados para el distrito seleccionado";
    subtitle.removeAttribute("title");
  }

  if (!projectEntries.length) {
    list.innerHTML = `<li class="project-item-empty">No se encontraron proyectos en este distrito.</li>`;
  } else {
    list.innerHTML = projectEntries
      .map((entry) => {
        const localities = [...(entry.localities || new Set())].sort((a, b) =>
          a.localeCompare(b, "es")
        );

        return `<li class="province-project-item">
            <p class="project-item-name">Proyecto: ${escapeHtml(entry.projectName)}</p>
            <p class="project-item-meta">Localidades: <span class="project-item-localidad">${escapeHtml(
              localities.join(", ")
            )}</span></p>
          </li>`;
      })
      .join("");
  }

  panel.classList.remove("is-hidden");
  panel.classList.remove("is-minimized");
  setMinimizeButtonState(minimizeBtn, false);
}

function renderProjectScopePanel(project, projectScope) {
  if (!project) {
    hideProvincePanel();
    return;
  }

  APP_STATE.panelClosed = false;

  const panel = document.getElementById("province-project-panel");
  const title = document.getElementById("province-panel-title");
  const subtitle = document.getElementById("province-panel-subtitle");
  const list = document.getElementById("province-project-list");
  const minimizeBtn = document.getElementById("btn-panel-minimize");
  if (!panel || !title || !list || !minimizeBtn) {
    return;
  }

  const provinces = [...(projectScope?.provinces || new Set())].sort((a, b) =>
    a.localeCompare(b, "es")
  );

  const byProvince = {};
  (APP_STATE.allProjects?.features || []).forEach((feature) => {
    const p = feature?.properties || {};
    const name = p.proyecto || p.nombre_proyecto || "";
    if (normalizeText(name) !== normalizeText(project)) {
      return;
    }

    const province = String(p.provincia || "").trim();
    const district = String(p.distrito || "").trim();
    if (!province) {
      return;
    }

    if (!byProvince[province]) {
      byProvince[province] = new Set();
    }

    if (district) {
      byProvince[province].add(district);
    }
  });

  title.textContent = "Ambito del proyecto";
  title.setAttribute("title", project);
  if (subtitle) {
    subtitle.textContent = provinces.length
      ? `${project} | ${provinces.length} provincia(s) forman parte del ambito del proyecto`
      : "No hay provincias asociadas a este proyecto";
    subtitle.setAttribute("title", project);
  }

  if (!provinces.length) {
    list.innerHTML = `<li class="project-item-empty">No hay provincias asociadas a este proyecto.</li>`;
  } else {
    list.innerHTML = provinces
      .map((province) => {
        const districts = [...(byProvince[province] || new Set())].sort((a, b) =>
          a.localeCompare(b, "es")
        );
        const districtsText = districts.length ? districts.join(", ") : "Sin distritos registrados";
        return `<li class="province-project-item province-scope-item">
          <p class="project-item-name">${escapeHtml(province)}</p>
          <p class="project-item-meta project-item-districts">Distritos: ${escapeHtml(districtsText)}</p>
        </li>`;
      })
      .join("");
  }

  panel.classList.remove("is-hidden");
  panel.classList.remove("is-minimized");
  setMinimizeButtonState(minimizeBtn, false);
}

function hideProvincePanel() {
  const panel = document.getElementById("province-project-panel");
  if (!panel) {
    return;
  }

  panel.classList.add("is-hidden");
}

function getProjectScope(project) {
  if (!project) {
    return { provinces: new Set(), districts: new Set() };
  }

  const provinces = new Set();
  const districts = new Set();

  (APP_STATE.allProjects?.features || []).forEach((feature) => {
    const p = feature?.properties || {};
    const name = p.proyecto || p.nombre_proyecto || "";
    if (normalizeText(name) !== normalizeText(project)) {
      return;
    }

    if (p.provincia) {
      provinces.add(p.provincia);
    }
    if (p.distrito) {
      districts.add(p.distrito);
    }
  });

  return { provinces, districts };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function bindScrollableFilterSelects() {
  enableScrollableSelect("filtro-provincia", 6);
  enableScrollableSelect("filtro-distrito", 8);
}

function enableScrollableSelect(selectId, visibleRows = 6) {
  const select = document.getElementById(selectId);
  if (!select) {
    return;
  }

  const open = () => {
    if ((select.options?.length || 0) <= 1) {
      return;
    }

    const rows = Math.min(visibleRows, Math.max(2, select.options.length));
    select.size = rows;
    select.classList.add("expanded-select");
  };

  const close = () => {
    select.size = 1;
    select.classList.remove("expanded-select");
  };

  select.addEventListener("mousedown", (event) => {
    if (select.size === 1) {
      event.preventDefault();
      open();
    }
  });

  select.addEventListener("focus", open);
  select.addEventListener("change", close);
  select.addEventListener("blur", close);

  select.addEventListener("keydown", (event) => {
    if (event.key === "Escape" || event.key === "Enter" || event.key === "Tab") {
      close();
    }
  });
}

function clearFilterUI() {
  const provincia = document.getElementById("filtro-provincia");
  const distrito = document.getElementById("filtro-distrito");
  const estado = document.getElementById("filtro-estado");
  const proyecto = document.getElementById("filtro-proyecto");

  if (provincia) provincia.value = "";
  if (distrito) distrito.value = "";
  if (estado) estado.value = "";
  if (proyecto) proyecto.value = "";

  refreshDistrictFilter(APP_STATE.allProjects, "", APP_STATE.boundaryCatalog);
  updateGeographicContext("", "", "");
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  }
}


function setCurrentDate() {
  const now = new Date();
  const format = new Intl.DateTimeFormat("es-PE", {
    dateStyle: "full"
  });
  setText("fecha-actual", format.format(now));
}

function animateCards() {
  document
    .querySelectorAll(".panel-block")
    .forEach((card, idx) => {
      card.style.animationDelay = `${idx * 40}ms`;
      card.classList.add("fade-in-up");
    });
}
