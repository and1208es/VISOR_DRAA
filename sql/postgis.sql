-- ============================================================
-- BASE DE DATOS POSTGIS - GEOPORTAL DRAA AYACUCHO
-- ============================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Esquema opcional institucional
CREATE SCHEMA IF NOT EXISTS sig_draa;

-- ============================================================
-- TABLA: proyectos
-- ============================================================
DROP TABLE IF EXISTS sig_draa.proyectos CASCADE;

CREATE TABLE sig_draa.proyectos (
  id BIGSERIAL PRIMARY KEY,
  nombre_proyecto VARCHAR(250) NOT NULL,
  provincia VARCHAR(120) NOT NULL,
  distrito VARCHAR(120) NOT NULL,
  comunidad VARCHAR(180),
  estado VARCHAR(50) NOT NULL CHECK (estado IN ('En ejecucion', 'Finalizado', 'Planificado')),
  presupuesto NUMERIC(14,2) NOT NULL DEFAULT 0,
  beneficiarios INTEGER NOT NULL DEFAULT 0,
  descripcion TEXT,
  fecha_inicio DATE,
  fecha_fin DATE,
  foto1 TEXT,
  foto2 TEXT,
  foto3 TEXT,
  geom geometry(Point, 4326) NOT NULL,
  creado_en TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  actualizado_en TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- INDICES
-- ============================================================
CREATE INDEX idx_proyectos_geom_gist
  ON sig_draa.proyectos
  USING GIST (geom);

CREATE INDEX idx_proyectos_provincia ON sig_draa.proyectos (provincia);
CREATE INDEX idx_proyectos_distrito ON sig_draa.proyectos (distrito);
CREATE INDEX idx_proyectos_estado ON sig_draa.proyectos (estado);

-- ============================================================
-- TRIGGER para campo actualizado_en
-- ============================================================
CREATE OR REPLACE FUNCTION sig_draa.fn_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proyectos_set_timestamp ON sig_draa.proyectos;
CREATE TRIGGER trg_proyectos_set_timestamp
BEFORE UPDATE ON sig_draa.proyectos
FOR EACH ROW
EXECUTE FUNCTION sig_draa.fn_set_timestamp();

-- ============================================================
-- DATOS DE EJEMPLO
-- ============================================================
INSERT INTO sig_draa.proyectos
(nombre_proyecto, provincia, distrito, comunidad, estado, presupuesto, beneficiarios, descripcion, fecha_inicio, fecha_fin, foto1, foto2, foto3, geom)
VALUES
('Fortalecimiento de cadena productiva de quinua', 'Huamanga', 'Pacaycasa', 'Comunidad Campesina de Pacaycasa', 'En ejecucion', 450000, 230,
 'Asistencia tecnica, equipamiento y mejora de riego tecnificado para productores de quinua.', '2025-03-01', '2026-08-30',
 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=1000&q=60',
 'https://images.unsplash.com/photo-1492496913980-501348b61469?auto=format&fit=crop&w=1000&q=60',
 'https://images.unsplash.com/photo-1500595046743-cd271d694d30?auto=format&fit=crop&w=1000&q=60',
 ST_SetSRID(ST_MakePoint(-74.2052, -13.1524), 4326)),

('Mejoramiento de produccion de palta hass', 'Huanta', 'Luricocha', 'Centro Poblado de Luricocha', 'Planificado', 620000, 310,
 'Implementacion de viveros y capacitaciones en manejo fitosanitario de palta hass.', '2026-01-15', '2027-07-30',
 'https://images.unsplash.com/photo-1523741543316-beb7fc7023d8?auto=format&fit=crop&w=1000&q=60',
 'https://images.unsplash.com/photo-1598512752271-33f913a5af13?auto=format&fit=crop&w=1000&q=60',
 'https://images.unsplash.com/photo-1502741338009-cac2772e18bc?auto=format&fit=crop&w=1000&q=60',
 ST_SetSRID(ST_MakePoint(-74.2441, -12.9394), 4326)),

('Impulso de ganaderia lechera altoandina', 'Cangallo', 'Paras', 'Comunidad de Paras', 'Finalizado', 810000, 420,
 'Mejoramiento genetico bovino y centros de acopio de leche.', '2023-02-01', '2025-02-28',
 'https://images.unsplash.com/photo-1500595046743-ddf4d3d753fd?auto=format&fit=crop&w=1000&q=60',
 'https://images.unsplash.com/photo-1516466723877-e4ec1d736c8a?auto=format&fit=crop&w=1000&q=60',
 'https://images.unsplash.com/photo-1452378174528-3090a4bba7b2?auto=format&fit=crop&w=1000&q=60',
 ST_SetSRID(ST_MakePoint(-74.6151, -13.5521), 4326));

-- ============================================================
-- CONSULTAS ESPACIALES BASICAS
-- ============================================================

-- 1) Total de proyectos por provincia
SELECT provincia, COUNT(*) AS total_proyectos
FROM sig_draa.proyectos
GROUP BY provincia
ORDER BY total_proyectos DESC;

-- 2) Inversion acumulada por provincia
SELECT provincia, SUM(presupuesto) AS inversion_total
FROM sig_draa.proyectos
GROUP BY provincia
ORDER BY inversion_total DESC;

-- 3) Proyectos en un radio de 15 km alrededor de un punto
-- Reemplazar coordenadas segun necesidad
SELECT id, nombre_proyecto, provincia, distrito
FROM sig_draa.proyectos
WHERE ST_DWithin(
  geom::geography,
  ST_SetSRID(ST_MakePoint(-74.2236, -13.1631), 4326)::geography,
  15000
);

-- 4) Distancia de cada proyecto a un punto de referencia
SELECT
  id,
  nombre_proyecto,
  ROUND(
    ST_Distance(
      geom::geography,
      ST_SetSRID(ST_MakePoint(-74.2236, -13.1631), 4326)::geography
    )::numeric,
    2
  ) AS distancia_metros
FROM sig_draa.proyectos
ORDER BY distancia_metros ASC;

-- 5) Exportar proyectos a GeoJSON
SELECT jsonb_build_object(
  'type', 'FeatureCollection',
  'features', jsonb_agg(feature)
)
FROM (
  SELECT jsonb_build_object(
    'type', 'Feature',
    'geometry', ST_AsGeoJSON(geom)::jsonb,
    'properties', to_jsonb(row) - 'geom'
  ) AS feature
  FROM (
    SELECT id, nombre_proyecto, provincia, distrito, comunidad, estado, presupuesto,
           beneficiarios, descripcion, fecha_inicio, fecha_fin, foto1, foto2, foto3
    FROM sig_draa.proyectos
  ) AS row
) AS features;

-- 6) Proyectos por estado y provincia
SELECT provincia, estado, COUNT(*) AS total
FROM sig_draa.proyectos
GROUP BY provincia, estado
ORDER BY provincia, estado;
