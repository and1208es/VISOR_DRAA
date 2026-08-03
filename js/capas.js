const PROJECT_POINT_FILL = "#f4c842";
const PROJECT_POINT_STROKE = "#7d6406";

const DEFAULT_CAPAS_CONFIG = {
  geoserverUrl: `${window.location.origin}/geoserver`,
  workspace: "draa",
  layers: {
    provincias: "ayacucho_provincias",
    distritos: "ayacucho_distritos",
    zonas: "zonas_intervencion",
    proyectos: "proyectos"
  }
};

export function getCapasConfig() {
  const runtimeConfig = window.DRAA_CONFIG || {};

  return {
    ...DEFAULT_CAPAS_CONFIG,
    ...runtimeConfig,
    layers: {
      ...DEFAULT_CAPAS_CONFIG.layers,
      ...(runtimeConfig.layers || {})
    }
  };
}

function buildWMSLayer(url, layerName, options = {}) {
  return L.tileLayer.wms(`${url}/wms`, {
    layers: layerName,
    format: "image/png",
    transparent: true,
    tiled: true,
    version: "1.1.1",
    ...options
  });
}

function safeUrl(base, pathAndQuery) {
  return `${String(base).replace(/\/$/, "")}${pathAndQuery}`;
}

function getProjectsWfsUrl(config, workspace, geoserverBase) {
  const directUrl = config?.wfs?.proyectosUrl;
  if (directUrl) {
    return directUrl;
  }

  return safeUrl(
    geoserverBase,
    `/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=${encodeURIComponent(`${workspace}:${config.layers.proyectos}`)}&outputFormat=application/json&srsName=EPSG:4326`
  );
}

async function fetchGeoJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status} al consultar ${url}`);
  }
  return response.json();
}

function getPointRadiusByZoom(zoom = 8) {
  if (zoom <= 8) {
    return 5;
  }
  if (zoom <= 10) {
    return 6;
  }
  return 7;
}

function projectStyle(feature, mapZoom = 8, isHighlighted = false) {
  const radius = getPointRadiusByZoom(mapZoom);

  return {
    radius: isHighlighted ? radius + 1.5 : radius,
    fillColor: PROJECT_POINT_FILL,
    color: PROJECT_POINT_STROKE,
    weight: isHighlighted ? 2.2 : 1.4,
    opacity: 1,
    fillOpacity: isHighlighted ? 0.96 : 0.8
  };
}

function projectPolygonStyle(feature) {
  return {
    color: PROJECT_POINT_STROKE,
    weight: 2,
    opacity: 0.95,
    fillColor: PROJECT_POINT_FILL,
    fillOpacity: 0.32
  };
}

function projectLineStyle(feature) {
  return {
    color: PROJECT_POINT_STROKE,
    weight: 3,
    opacity: 0.95
  };
}

function provinceStyle() {
  return {
    color: "#0b4f8a",
    weight: 3,
    opacity: 0.9,
    fillColor: "#4ea1d3",
    fillOpacity: 0.12
  };
}

function districtStyle() {
  return {
    color: "#a14b12",
    weight: 1.3,
    opacity: 0.85,
    dashArray: "4 3",
    fillColor: "#f2a65a",
    fillOpacity: 0.05
  };
}

function sortUniqueStrings(values) {
  return [...new Set((values || []).filter(Boolean).map((v) => String(v).trim()))].sort((a, b) =>
    a.localeCompare(b, "es")
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildProvincePopup(feature) {
  const p = feature?.properties || {};

  return `
    <div class="popup-project">
      <h3 class="popup-title">Provincia: ${escapeHtml(p.provincia || "Sin dato")}</h3>
      <table class="table table-sm table-bordered mb-0">
        <tbody>
          <tr><th>Departamento</th><td>${escapeHtml(p.departamen || "-")}</td></tr>
          <tr><th>Provincia</th><td>${escapeHtml(p.provincia || "-")}</td></tr>
          <tr><th>ID Provincia</th><td>${escapeHtml(p.id_prov || "-")}</td></tr>
        </tbody>
      </table>
    </div>
  `;
}

export async function initCapas({ config, map, popupBuilder }) {
  const geojsonProvinciasUrl = "./data/provincias.geojson";
  const geojsonDistritosUrl = "./data/distritos.geojson";
  const geojsonProyectosUrl = "./data/proyectos.geojson";

  if (!map.getPane("boundariesPane")) {
    map.createPane("boundariesPane");
    map.getPane("boundariesPane").style.zIndex = "420";
    map.getPane("boundariesPane").style.pointerEvents = "none";
  }

  if (!map.getPane("projectsPane")) {
    map.createPane("projectsPane");
    map.getPane("projectsPane").style.zIndex = "650";
  }

  const projectLayer = L.geoJSON(null, {
    pane: "projectsPane",
    pointToLayer(feature, latlng) {
      return L.circleMarker(latlng, projectStyle(feature, map.getZoom()));
    },
    style(feature) {
      const type = feature?.geometry?.type || "";
      if (type.includes("Polygon")) {
        return projectPolygonStyle(feature);
      }
      if (type.includes("LineString")) {
        return projectLineStyle(feature);
      }
      return projectPolygonStyle(feature);
    },
    onEachFeature(feature, layer) {
      layer.bindPopup(() => popupBuilder(feature), { maxWidth: 340 });

      if (layer instanceof L.CircleMarker) {
        layer.on("mouseover", () => {
          layer.setStyle(projectStyle(feature, map.getZoom(), true));
          if (typeof layer.bringToFront === "function") {
            layer.bringToFront();
          }
        });

        layer.on("mouseout", () => {
          layer.setStyle(projectStyle(feature, map.getZoom()));
        });
      }
    }
  }).addTo(map);

  function restyleProjectPointsByZoom() {
    const zoom = map.getZoom();
    projectLayer.eachLayer((layer) => {
      if (!(layer instanceof L.CircleMarker)) {
        return;
      }

      layer.setStyle(projectStyle(layer.feature, zoom));
    });
  }

  map.on("zoomend", restyleProjectPointsByZoom);

  let allProjects = { type: "FeatureCollection", features: [] };
  let projectsLoadError = null;
  let boundaryCatalog = { provincias: [], distritos: [], byProvinceDistricts: {} };
  let provincesGeoJSON = null;
  let districtsGeoJSON = null;
  const emptyFeatureCollection = () => ({ type: "FeatureCollection", features: [] });

  let provincesLayer = L.geoJSON(null, {
    pane: "boundariesPane",
    style: provinceStyle,
    interactive: false
  }).addTo(map);
  let districtsLayer = L.geoJSON(null, {
    pane: "boundariesPane",
    style: districtStyle,
    interactive: false
  }).addTo(map);

  try {
    const [provincesData, districtsData] = await Promise.all([
      fetchGeoJSON(geojsonProvinciasUrl).catch((error) => {
        console.error(`No se pudo cargar ${geojsonProvinciasUrl}.`, error);
        return emptyFeatureCollection();
      }),
      fetchGeoJSON(geojsonDistritosUrl).catch((error) => {
        console.error(`No se pudo cargar ${geojsonDistritosUrl}.`, error);
        return emptyFeatureCollection();
      })
    ]);

    const byProvinceDistricts = {};
    (districtsData?.features || []).forEach((feature) => {
      const province = String(feature?.properties?.provincia || "").trim();
      const district = String(feature?.properties?.distrito || "").trim();
      if (!province || !district) {
        return;
      }

      if (!byProvinceDistricts[province]) {
        byProvinceDistricts[province] = [];
      }

      byProvinceDistricts[province].push(district);
    });

    Object.keys(byProvinceDistricts).forEach((province) => {
      byProvinceDistricts[province] = sortUniqueStrings(byProvinceDistricts[province]);
    });

    boundaryCatalog = {
      provincias: sortUniqueStrings(
        (provincesData?.features || []).map((feature) => feature?.properties?.provincia)
      ),
      distritos: sortUniqueStrings(
        (districtsData?.features || []).map((feature) => feature?.properties?.distrito)
      ),
      byProvinceDistricts
    };

    provincesGeoJSON = provincesData;
    districtsGeoJSON = districtsData;

    provincesLayer.addData(provincesData);
    districtsLayer.addData(districtsData);

    projectLayer.bringToFront();
  } catch (boundaryError) {
    console.error("No se pudieron procesar los GeoJSON locales de provincias y distritos.", boundaryError);
  }

  async function refreshProjects({ fitToData = false } = {}) {
    let latestProjects = null;
    projectsLoadError = null;

    try {
      latestProjects = await fetchGeoJSON(geojsonProyectosUrl);
    } catch (projectError) {
      projectsLoadError = `No se pudo cargar la capa de proyectos desde ${geojsonProyectosUrl}.`;
      console.error(projectsLoadError, projectError);
      latestProjects = emptyFeatureCollection();
    }

    allProjects = latestProjects;
    projectLayer.clearLayers();
    projectLayer.addData(allProjects);
    projectLayer.bringToFront();
    restyleProjectPointsByZoom();
    console.info(`[GeoJSON] Proyectos cargados: ${allProjects?.features?.length || 0}`);

    if (fitToData && projectLayer.getLayers().length > 0) {
      map.fitBounds(projectLayer.getBounds(), { padding: [20, 20], maxZoom: 14 });
    }

    return allProjects;
  }

  await refreshProjects({ fitToData: true });

  function setProjectFeatures(featureCollection) {
    projectLayer.clearLayers();
    projectLayer.addData(featureCollection);
    projectLayer.bringToFront();
    restyleProjectPointsByZoom();
  }

  function cloneGeoJSON(featureCollection) {
    if (!featureCollection) {
      return { type: "FeatureCollection", features: [] };
    }
    return JSON.parse(JSON.stringify(featureCollection));
  }

  function getBoundaryGeoJSON() {
    const provinces = provincesGeoJSON ||
      (provincesLayer && typeof provincesLayer.toGeoJSON === "function"
        ? provincesLayer.toGeoJSON()
        : { type: "FeatureCollection", features: [] });

    const districts = districtsGeoJSON ||
      (districtsLayer && typeof districtsLayer.toGeoJSON === "function"
        ? districtsLayer.toGeoJSON()
        : { type: "FeatureCollection", features: [] });

    return {
      provincias: cloneGeoJSON(provinces),
      distritos: cloneGeoJSON(districts)
    };
  }

  return {
    overlays: {
      Provincias: provincesLayer,
      Distritos: districtsLayer,
      Proyectos: projectLayer
    },
    boundaryCatalog,
    allProjects,
    projectLayer,
    projectsLoadError,
    setProjectFeatures,
    refreshProjects,
    getBoundaryGeoJSON
  };
}

export function getLegendItems() {
  return [
    { key: "provincias", label: "Provincias", color: "#2a6fb8" },
    { key: "distritos", label: "Distritos", color: "#6c757d" },
    { key: "proyectos", label: "Proyectos productivos", color: "#f4c842" }
  ];
}
