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
        "OpenStreetMap": baseOSM,
        "Satelital": baseSatellite
      },
      {},
      { collapsed: false, position: "bottomleft" }
    )
    .addTo(map);

  L.control.scale({ metric: true, imperial: false }).addTo(map);

  addCoordinateControl(map);

  return { map, layerControl, baseLayers: { baseOSM, baseSatellite } };
}

function addCoordinateControl(map) {
  const CoordControl = L.Control.extend({
    options: { position: "bottomright" },
    onAdd() {
      this._div = L.DomUtil.create("div", "coord-control");
      this._div.innerHTML = "Lat: -, Lng: -";
      return this._div;
    },
    update(latlng) {
      if (!latlng) {
        this._div.innerHTML = "Lat: -, Lng: -";
        return;
      }
      this._div.innerHTML = `Lat: ${latlng.lat.toFixed(5)} | Lng: ${latlng.lng.toFixed(5)}`;
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
