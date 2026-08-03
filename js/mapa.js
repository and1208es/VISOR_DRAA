export function initMap() {
  const map = L.map("map", {
    center: [-13.1631, -74.2236],
    zoom: 8,
    zoomControl: true,
    preferCanvas: true
  });

  const baseOSM = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  });

  const baseSatellite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri"
    }
  );

  baseOSM.addTo(map);

  const layerControl = L.control
    .layers(
      {
        "Mapa claro / OpenStreetMap": baseOSM,
        "Satelital": baseSatellite
      },
      {},
      { collapsed: true, position: "topleft" }
    )
    .addTo(map);

  const layerControlContainer = layerControl.getContainer();
  const layerToggle = layerControlContainer?.querySelector(".leaflet-control-layers-toggle");
  if (layerToggle) {
    layerToggle.setAttribute("aria-label", "Seleccionar mapa base");
    layerToggle.setAttribute("title", "Seleccionar mapa base");
  }
  layerControlContainer?.addEventListener("change", () => {
    layerControl.collapse?.();
  });

  L.control.scale({ metric: true, imperial: false }).addTo(map);

  addCoordinateControl(map);

  return { map, layerControl, baseLayers: { baseOSM, baseSatellite } };
}

function addCoordinateControl(map) {
  const CoordControl = L.Control.extend({
    options: { position: "bottomright" },
    onAdd() {
      this._div = L.DomUtil.create("div", "coord-control");
      this._div.setAttribute("role", "status");
      this._div.setAttribute("aria-label", "Coordenadas del cursor");
      this._div.innerHTML = '<span class="coord-label">Lat:</span> <span class="coord-lat">-</span><span class="coord-divider"> | </span><span class="coord-label">Lng:</span> <span class="coord-lng">-</span>';
      return this._div;
    },
    update(latlng) {
      const latitude = this._div.querySelector(".coord-lat");
      const longitude = this._div.querySelector(".coord-lng");
      if (latitude) latitude.textContent = latlng ? latlng.lat.toFixed(5) : "-";
      if (longitude) longitude.textContent = latlng ? latlng.lng.toFixed(5) : "-";
    }
  });

  const coordControl = new CoordControl();
  map.addControl(coordControl);
  map.on("mousemove", (event) => coordControl.update(event.latlng));
}

export function addSearchControl(map, projectLayer, propertyName = "nombre_proyecto") {
  if (!L.Control?.Search || !projectLayer) {
    return null;
  }

  const searchControl = new L.Control.Search({
    layer: projectLayer,
    propertyName,
    marker: false,
    moveToLocation(latlng, title, mapInstance) {
      mapInstance.setView(latlng, 12);
    },
    textPlaceholder: "Buscar proyecto...",
    zoom: 12,
    initial: false
  });

  map.addControl(searchControl);
  return searchControl;
}

export function bindLocateButton(map, buttonId) {
  const btn = document.getElementById(buttonId);
  if (!btn) {
    return;
  }

  btn.addEventListener("click", () => {
    map.locate({ setView: true, maxZoom: 14, enableHighAccuracy: true });
  });

  map.on("locationfound", (event) => {
    const marker = L.circleMarker(event.latlng, {
      radius: 7,
      color: "#0b57d0",
      fillColor: "#4f83ff",
      fillOpacity: 0.85
    });

    marker.addTo(map).bindPopup("Tu ubicacion aproximada").openPopup();
    setTimeout(() => {
      map.removeLayer(marker);
    }, 5000);
  });

  map.on("locationerror", () => {
    window.alert("No fue posible obtener la ubicacion. Verifica permisos de geolocalizacion.");
  });
}
