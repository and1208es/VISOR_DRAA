# Geoportal Web SIG - Direccion Regional de Agricultura Ayacucho

Geoportal institucional moderno para visualizacion de proyectos productivos y zonas de intervencion, construido con Leaflet, GeoServer y PostGIS.

## 1) Estructura del proyecto

geoportal/
- index.html
- css/
  - estilos.css
  - responsive.css
- js/
  - app.js
  - mapa.js
  - capas.js
  - filtros.js
  - popup.js
  - carrusel.js
- assets/
  - img/
  - icons/
  - logos/
- data/
  - proyectos.geojson
  - sld/
    - proyectos.sld
- sql/
  - postgis.sql

## 2) Requisitos

- PostgreSQL 14+ (o superior)
- Extension PostGIS
- GeoServer 2.23+ (o superior)
- Java 11+ para GeoServer
- Navegador moderno
- Servidor web estatico (Apache, Nginx o Node HTTP server)

## 3) Instalacion PostgreSQL + PostGIS

### Windows (referencial)
1. Instalar PostgreSQL desde instalador oficial.
2. Instalar StackBuilder y agregar PostGIS.
3. Crear base de datos:
   - CREATE DATABASE draa_geoportal;
4. Ejecutar script:
   - psql -U postgres -d draa_geoportal -f sql/postgis.sql

### Ubuntu Server
1. Instalar paquetes:
   - sudo apt update
   - sudo apt install -y postgresql postgresql-contrib postgis
2. Crear base y habilitar PostGIS:
   - sudo -u postgres psql
   - CREATE DATABASE draa_geoportal;
   - \c draa_geoportal
   - CREATE EXTENSION postgis;
3. Cargar estructura:
   - psql -U postgres -d draa_geoportal -f /ruta/geoportal/sql/postgis.sql

## 4) Configuracion GeoServer paso a paso

### 4.1 Crear workspace
1. Ingresar a GeoServer: http://localhost:8080/geoserver
2. Navegar a Data > Workspaces > Add new workspace
3. Name: draa
4. Namespace URI: http://draa.ayacucho.gob.pe
5. Guardar

### 4.2 Crear Store PostGIS
1. Data > Stores > Add new Store > PostGIS
2. Workspace: draa
3. Data Source Name: draa_postgis
4. Host: localhost
5. Port: 5432
6. Database: draa_geoportal
7. Schema: sig_draa
8. User / Password: credenciales de PostgreSQL
9. Save

### 4.3 Publicar layers
Publicar al menos:
- sig_draa.proyectos
- ayacucho_provincias (si existe en DB o importado)
- ayacucho_distritos
- zonas_intervencion

Pasos por capa:
1. Data > Stores > draa_postgis > Publish
2. Elegir tabla
3. Definir Native SRS: EPSG:4326
4. Definir Declared SRS: EPSG:4326
5. Compute from data y Compute from native bounds
6. Save

### 4.4 Habilitar WMS y WFS
1. Services > WMS: Enabled = true
2. Services > WFS: Enabled = true
3. En cada layer:
   - Publishing > WFS settings > Enabled
   - Publishing > Default Style

### 4.5 Configurar estilos SLD
1. Styles > Add new style
2. Cargar contenido de data/sld/proyectos.sld
3. Validar y guardar como proyectos_estado
4. Ir al layer de proyectos y asignar ese estilo

## 5) Endpoints de consumo en el frontend

El frontend ya esta preparado para consumir:
- WMS provincias y distritos
- WFS para proyectos
- GeoJSON para zonas (via WFS outputFormat=application/json)

Configurable en js/app.js:
- geoserverUrl
- workspace
- nombres de capas

## 6) Funcionalidades implementadas

- Mapa base OpenStreetMap
- Mapa satelital Esri
- Zoom, escala y coordenadas del cursor
- Selector de capas y leyenda dinamica
- Carga de capas desde GeoServer (WMS/WFS/GeoJSON)
- Filtros por provincia, distrito y estado
- Busqueda de proyectos
- Popup con informacion completa
- Carrusel de imagenes en popup con Swiper
- Medicion de distancia y area (Leaflet Measure)
- Herramientas Draw
- Impresion de mapa (leaflet-easyprint)
- Exportar proyectos filtrados a GeoJSON
- Geolocalizacion de usuario
- Vista fullscreen
- Dashboard KPI
- Graficos con Chart.js

## 7) Seguridad y buenas practicas aplicadas

- Sanitizacion basica de campos en popup para evitar inyeccion HTML.
- Separacion frontend y servicios geoespaciales.
- Parametros de endpoints construidos con encodeURIComponent.
- Arquitectura modular JS (ES6 modules).
- Fallback de datos local si GeoServer no esta disponible.

Recomendaciones adicionales para produccion:
- Colocar GeoServer detras de proxy reverso con HTTPS.
- Habilitar autenticacion para WFS transaccional.
- Restringir CORS a dominios institucionales.
- Implementar cache de teselas (GeoWebCache).

## 8) Ejecucion local del frontend

Desde la carpeta geoportal, levantar servidor estatico.
Ejemplo con Python:
- python -m http.server 8085

Abrir:
- http://localhost:8085

### Arranque local recomendado (Windows)
Para evitar errores intermitentes de conexion entre visor y GeoServer:

1. Desde la carpeta del proyecto, ejecutar:
   - powershell -ExecutionPolicy Bypass -File .\start-local.ps1
2. El script:
   - Verifica si GeoServer responde en http://localhost:8080
   - Inicia Tomcat si GeoServer no esta activo
   - Levanta el visor + proxy en http://localhost:5500
3. Abrir:
   - http://localhost:5500

## 9) Despliegue en Apache (Ubuntu)

1. Instalar Apache:
- sudo apt install -y apache2

2. Copiar geoportal a /var/www/geoportal
- sudo mkdir -p /var/www/geoportal
- sudo cp -r /ruta/geoportal/* /var/www/geoportal/

3. VirtualHost ejemplo /etc/apache2/sites-available/geoportal.conf
- ServerName geoportal.draa.local
- DocumentRoot /var/www/geoportal
- <Directory /var/www/geoportal>
-   AllowOverride All
-   Require all granted
- </Directory>

4. Activar sitio y recargar:
- sudo a2ensite geoportal.conf
- sudo systemctl reload apache2

## 10) Despliegue en Nginx (Ubuntu)

1. Instalar Nginx:
- sudo apt install -y nginx

2. Configurar server block /etc/nginx/sites-available/geoportal
- server {
-   listen 80;
-   server_name geoportal.draa.local;
-   root /var/www/geoportal;
-   index index.html;
-   location / {
-     try_files $uri $uri/ =404;
-   }
- }

3. Activar y reiniciar:
- sudo ln -s /etc/nginx/sites-available/geoportal /etc/nginx/sites-enabled/
- sudo nginx -t
- sudo systemctl restart nginx

## 11) Arquitectura recomendada (escalable)

- Frontend estatico en Apache/Nginx
- GeoServer en host dedicado o contenedor
- PostgreSQL/PostGIS en servidor de datos separado
- Respaldo y monitoreo de base de datos
- Versionado de estilos SLD y scripts SQL en Git

## 12) Integracion final

1. Crear base de datos y ejecutar sql/postgis.sql
2. Publicar capas en GeoServer con workspace draa
3. Revisar nombres de capa en js/app.js
4. Levantar frontend
5. Validar filtros, popups, dashboard y graficos

## 13) Levantar con Docker

### Requisitos
- Docker Desktop (Windows/macOS) o Docker Engine + Compose (Linux)

### Opcion A: usando docker compose (recomendada)
Desde la carpeta del proyecto:
- docker compose up -d --build

Abrir en navegador:
- http://localhost:5500

Parar contenedor:
- docker compose down

### Opcion B: usando docker run
1. Construir imagen:
- docker build -t visor-draa .

2. Ejecutar contenedor:
- docker run --name visor-draa -p 5500:5500 -e GEOSERVER_BASE=http://host.docker.internal:8080 --add-host=host.docker.internal:host-gateway visor-draa

### Variable importante
- GEOSERVER_BASE: URL base de GeoServer (sin barra final).
- Por defecto: http://host.docker.internal:8080

Ejemplo si GeoServer esta en otro host:
- GEOSERVER_BASE=http://192.168.1.50:8080

Con esto tienes un geoportal profesional, modular y listo para evolucionar a entorno institucional.
