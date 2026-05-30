function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function sortUnique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

export function getFilterState() {
  return {
    provincia: document.getElementById("filtro-provincia")?.value || "",
    distrito: document.getElementById("filtro-distrito")?.value || "",
    estado: document.getElementById("filtro-estado")?.value || "",
    proyecto: document.getElementById("filtro-proyecto")?.value || ""
  };
}

export function populateFilterOptions(featureCollection, catalogs = {}) {
  const features = featureCollection?.features || [];
  const provincias = sortUnique([
    ...features.map((f) => f?.properties?.provincia),
    ...(catalogs.provincias || [])
  ]);
  const distritos = sortUnique([
    ...features.map((f) => f?.properties?.distrito),
    ...(catalogs.distritos || [])
  ]);
  const proyectos = sortUnique(
    features.map((f) => f?.properties?.proyecto || f?.properties?.nombre_proyecto)
  );

  const provinciaSelect = document.getElementById("filtro-provincia");
  const distritoSelect = document.getElementById("filtro-distrito");
  const proyectoSelect = document.getElementById("filtro-proyecto");

  if (provinciaSelect) {
    provinciaSelect.innerHTML = '<option value="">Todas</option>';
    provincias.forEach((prov) => {
      provinciaSelect.insertAdjacentHTML("beforeend", `<option value="${prov}">${prov}</option>`);
    });
  }

  if (distritoSelect) {
    distritoSelect.innerHTML = '<option value="">Todos</option>';
    distritos.forEach((dist) => {
      distritoSelect.insertAdjacentHTML("beforeend", `<option value="${dist}">${dist}</option>`);
    });
  }

  if (proyectoSelect) {
    proyectoSelect.innerHTML = '<option value="">Todos</option>';
    proyectos.forEach((proy) => {
      proyectoSelect.insertAdjacentHTML("beforeend", `<option value="${proy}">${proy}</option>`);
    });
  }

}

export function refreshDistrictFilter(featureCollection, province, catalogs = {}) {
  const distritoSelect = document.getElementById("filtro-distrito");
  if (!distritoSelect) {
    return;
  }

  const mappedDistricts = catalogs?.byProvinceDistricts?.[province] || null;
  if (province && Array.isArray(mappedDistricts) && mappedDistricts.length) {
    distritoSelect.innerHTML = '<option value="">Todos</option>';
    mappedDistricts.forEach((dist) => {
      distritoSelect.insertAdjacentHTML("beforeend", `<option value="${dist}">${dist}</option>`);
    });
    return;
  }

  const features = featureCollection?.features || [];
  const source = province
    ? features.filter((f) => f?.properties?.provincia === province)
    : features;

  const distritos = sortUnique(source.map((f) => f?.properties?.distrito));
  distritoSelect.innerHTML = '<option value="">Todos</option>';
  distritos.forEach((dist) => {
    distritoSelect.insertAdjacentHTML("beforeend", `<option value="${dist}">${dist}</option>`);
  });
}

export function applyFilters(featureCollection, filters) {
  const features = featureCollection?.features || [];
  const filtered = features.filter((feature) => {
    const p = feature?.properties || {};
    const projectName = p.proyecto || p.nombre_proyecto || "";

    const matchProvince = !filters.provincia || p.provincia === filters.provincia;
    const matchDistrict = !filters.distrito || p.distrito === filters.distrito;
    const matchEstado = !filters.estado || p.estado === filters.estado;
    const matchProject = !filters.proyecto || projectName === filters.proyecto;

    return matchProvince && matchDistrict && matchEstado && matchProject;
  });

  return {
    type: "FeatureCollection",
    features: filtered
  };
}

export function attachFilterEvents({ onApply, onClear, onProvinceChange, onDistrictChange, onProjectChange }) {
  document.getElementById("btn-aplicar-filtros")?.addEventListener("click", onApply);
  document.getElementById("btn-limpiar-filtros")?.addEventListener("click", onClear);

  document.getElementById("filtro-provincia")?.addEventListener("change", (event) => {
    onProvinceChange?.(event.target.value);
  });

  document.getElementById("filtro-distrito")?.addEventListener("change", (event) => {
    onDistrictChange?.(event.target.value);
  });

  document.getElementById("filtro-proyecto")?.addEventListener("change", (event) => {
    onProjectChange?.(event.target.value);
  });
}
