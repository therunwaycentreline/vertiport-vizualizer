/**
 * Vertiport & OLS 3D Visualizer Main Application
 * Coordinates UI, MapLibre GL JS, Three.js 3D layer, and OLSEngine
 */

// Available Basemap Styles (Free, High-Speed, No API Key Required)
const MAP_STYLES = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  streets: 'https://tiles.openfreemap.org/styles/positron',
  satellite: {
    version: 8,
    sources: {
      'esri-satellite': {
        type: 'raster',
        tiles: [
          'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        ],
        tileSize: 256,
        attribution: 'Esri, Maxar, Earthstar Geographics'
      }
    },
    layers: [
      {
        id: 'esri-satellite-layer',
        type: 'raster',
        source: 'esri-satellite',
        minzoom: 0,
        maxzoom: 20
      }
    ]
  }
};

class VertiportApp {
  constructor() {
    this.currentUnit = 'metric'; // 'metric' or 'imperial'
    this.isPlacingMode = false;
    this.activeStyle = 'dark';
    this.marker = null;

    // Initialize OLS Engine with default Wisk Gen 6
    this.engine = new OLSEngine({
      aircraftKey: 'wisk-gen6',
      dValue: AIRCRAFT_PRESETS['wisk-gen6'].dValueMeters,
      lat: 37.77492,
      lng: -122.41941,
      elevationMeters: 0,
      renderBuilding: false,
      heading: 45,
      slopeRatio: 8.0,
      flareRate: 0.15,
      corridorLength: 3000,
      shape: 'square',
      opacity: 0.45
    });

    this.threeLayer = new ThreeMapLibreLayer('vertiport-ols-3d', this.engine);

    this.initMap();
    this.bindUI();
    this.updateUI();
  }

  // --- Map Initialization ---
  initMap() {
    this.map = new maplibregl.Map({
      container: 'map',
      style: MAP_STYLES[this.activeStyle],
      center: [this.engine.lng, this.engine.lat],
      zoom: 15.5,
      pitch: 65,
      bearing: -35,
      antialias: true,
      maxPitch: 85
    });

    // Navigation Controls
    this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    this.map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    // Create Vertiport Center Map Marker
    const markerEl = document.createElement('div');
    markerEl.className = 'vertiport-center-pin';
    markerEl.innerHTML = `
      <div class="relative flex items-center justify-center cursor-pointer group">
        <div class="absolute -inset-2 bg-sky-500 rounded-full opacity-30 animate-ping"></div>
        <div class="w-7 h-7 bg-sky-500 border-2 border-white rounded-full flex items-center justify-center shadow-lg shadow-sky-500/50 text-white font-bold text-xs group-hover:scale-110 transition-transform">
          H
        </div>
      </div>
    `;

    this.marker = new maplibregl.Marker({
      element: markerEl,
      draggable: true,
      anchor: 'center'
    })
      .setLngLat([this.engine.lng, this.engine.lat])
      .addTo(this.map);

    this.marker.on('drag', () => {
      const lngLat = this.marker.getLngLat();
      this.engine.lat = lngLat.lat;
      this.engine.lng = lngLat.lng;
      this.threeLayer.updateGeometry();
      this.updateUI();
    });

    this.marker.on('dragend', () => {
      const lngLat = this.marker.getLngLat();
      this.repositionVertiport(lngLat.lat, lngLat.lng);
    });

    // Map Event Listeners for Style & Layer Lifecycle
    this.map.on('load', () => {
      this.setupMapLayers();
    });

    this.map.on('styledata', () => {
      if (this.map.isStyleLoaded()) {
        this.setupMapLayers();
      }
    });

    // Map Click Handler for Vertiport Placement
    this.map.on('click', (e) => {
      if (this.isPlacingMode) {
        this.repositionVertiport(e.lngLat.lat, e.lngLat.lng);
        this.togglePlacingMode(false);
      }
    });
  }

  setupMapLayers() {
    if (!this.map || !this.map.isStyleLoaded()) return;

    // 1. Add 3D Extruded Buildings Layer (if vector style supports it)
    if (this.engine.showBuildings && !this.map.getLayer('3d-buildings') && this.map.getSource('openmaptiles')) {
      const layers = this.map.getStyle().layers || [];
      let labelLayerId;
      for (let i = 0; i < layers.length; i++) {
        if (layers[i].type === 'symbol' && layers[i].layout && layers[i].layout['text-field']) {
          labelLayerId = layers[i].id;
          break;
        }
      }

      try {
        this.map.addLayer(
          {
            id: '3d-buildings',
            source: 'openmaptiles',
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 13,
            paint: {
              'fill-extrusion-color': [
                'interpolate',
                ['linear'],
                ['get', 'render_height'],
                0, '#1e293b',
                50, '#334155',
                150, '#475569',
                300, '#64748b'
              ],
              'fill-extrusion-height': [
                'interpolate',
                ['linear'],
                ['zoom'],
                13, 0,
                14.05, ['get', 'render_height']
              ],
              'fill-extrusion-base': [
                'interpolate',
                ['linear'],
                ['zoom'],
                13, 0,
                14.05, ['get', 'render_min_height']
              ],
              'fill-extrusion-opacity': 0.8
            }
          },
          labelLayerId
        );
      } catch (err) {
        // Ignored if layer exists
      }
    }

    // 2. Add / Re-add Custom Three.js 3D Layer
    if (!this.map.getLayer(this.threeLayer.id)) {
      try {
        this.map.addLayer(this.threeLayer);
      } catch (err) {
        console.warn('Could not add Three.js layer:', err);
      }
    } else {
      this.threeLayer.updateGeometry();
    }

    // 3. Ensure Vertiport Center Marker is attached and positioned
    if (this.marker) {
      this.marker.setLngLat([this.engine.lng, this.engine.lat]);
      this.marker.addTo(this.map);
    }

    this.map.triggerRepaint();
  }

  // --- UI Event Binding ---
  bindUI() {
    // 1. Aircraft Selector
    const aircraftSelect = document.getElementById('aircraftSelect');
    aircraftSelect.addEventListener('change', (e) => {
      const key = e.target.value;
      const customDContainer = document.getElementById('customDContainer');
      
      if (key === 'custom') {
        customDContainer.classList.remove('hidden');
        const customD = parseFloat(document.getElementById('customDInput').value);
        this.engine.setAircraft('custom', this.toMeters(customD));
      } else {
        customDContainer.classList.add('hidden');
        this.engine.setAircraft(key);
      }
      this.onParameterChanged();
    });

    // Custom D Input
    document.getElementById('customDInput').addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val > 0) {
        this.engine.dValue = this.toMeters(val);
        this.onParameterChanged();
      }
    });

    // 2. Elevation & Greenfield Structure
    const elevationSlider = document.getElementById('vertiportElevationSlider');
    elevationSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.engine.elevationMeters = this.toMeters(val);
      this.onParameterChanged();
    });

    const buildingToggle = document.getElementById('renderBuildingToggle');
    buildingToggle.addEventListener('change', (e) => {
      this.engine.renderBuilding = e.target.checked;
      this.onParameterChanged();
    });

    // 3. Heading / Orientation
    const headingSlider = document.getElementById('headingSlider');
    headingSlider.addEventListener('input', (e) => {
      this.engine.heading = parseInt(e.target.value, 10);
      this.onParameterChanged();
    });

    // 4. Slope, Flare, Length
    const slopeSlider = document.getElementById('slopeSlider');
    slopeSlider.addEventListener('input', (e) => {
      this.engine.slopeRatio = parseFloat(e.target.value);
      this.onParameterChanged();
    });

    const flareSlider = document.getElementById('flareSlider');
    flareSlider.addEventListener('input', (e) => {
      this.engine.flareRate = parseFloat(e.target.value) / 100.0;
      this.onParameterChanged();
    });

    const lengthSlider = document.getElementById('corridorLengthSlider');
    lengthSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.engine.corridorLength = this.toMeters(val);
      this.onParameterChanged();
    });

    // 5. Shape Buttons (Square vs Circle)
    const shapeSquareBtn = document.getElementById('shapeSquareBtn');
    const shapeCircleBtn = document.getElementById('shapeCircleBtn');

    shapeSquareBtn.addEventListener('click', () => {
      this.engine.shape = 'square';
      shapeSquareBtn.classList.add('bg-sky-600', 'text-white');
      shapeSquareBtn.classList.remove('text-slate-400');
      shapeCircleBtn.classList.remove('bg-sky-600', 'text-white');
      shapeCircleBtn.classList.add('text-slate-400');
      this.onParameterChanged();
    });

    shapeCircleBtn.addEventListener('click', () => {
      this.engine.shape = 'circle';
      shapeCircleBtn.classList.add('bg-sky-600', 'text-white');
      shapeCircleBtn.classList.remove('text-slate-400');
      shapeSquareBtn.classList.remove('bg-sky-600', 'text-white');
      shapeSquareBtn.classList.add('text-slate-400');
      this.onParameterChanged();
    });

    // 6. Layer Visibility Toggles
    document.getElementById('showPrimaryToggle').addEventListener('change', (e) => {
      this.engine.showPrimary = e.target.checked;
      this.onParameterChanged();
    });

    document.getElementById('showReciprocalToggle').addEventListener('change', (e) => {
      this.engine.showReciprocal = e.target.checked;
      this.onParameterChanged();
    });

    document.getElementById('showTransitionalToggle').addEventListener('change', (e) => {
      this.engine.showTransitional = e.target.checked;
      this.onParameterChanged();
    });

    document.getElementById('showPadsToggle').addEventListener('change', (e) => {
      this.engine.showPads = e.target.checked;
      this.onParameterChanged();
    });

    document.getElementById('showBuildingsToggle').addEventListener('change', (e) => {
      this.engine.showBuildings = e.target.checked;
      if (this.map.getLayer('3d-buildings')) {
        this.map.setLayoutProperty('3d-buildings', 'visibility', e.target.checked ? 'visible' : 'none');
      } else if (e.target.checked) {
        this.setupMapLayers();
      }
    });

    // Opacity
    document.getElementById('opacitySlider').addEventListener('input', (e) => {
      this.engine.opacity = parseFloat(e.target.value) / 100.0;
      this.onParameterChanged();
    });

    // Click To Place / Reposition
    const placeBtn = document.getElementById('clickToPlaceBtn');
    placeBtn.addEventListener('click', () => {
      this.togglePlacingMode(!this.isPlacingMode);
    });

    document.getElementById('cancelPlacementBtn').addEventListener('click', () => {
      this.togglePlacingMode(false);
    });

    // Unit Toggle (Metric / Imperial)
    document.getElementById('unitToggleBtn').addEventListener('click', () => {
      this.currentUnit = this.currentUnit === 'metric' ? 'imperial' : 'metric';
      this.updateUnitUI();
      this.updateUI();
    });

    // Basemap Style Switcher Dropdown
    const styleMenuBtn = document.getElementById('styleMenuBtn');
    const styleDropdown = document.getElementById('styleDropdown');

    styleMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      styleDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
      styleDropdown.classList.add('hidden');
    });

    styleDropdown.querySelectorAll('button[data-style]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const styleKey = btn.getAttribute('data-style');
        this.switchStyle(styleKey);
      });
    });

    // Camera Preset Buttons
    document.getElementById('camTopDownBtn').addEventListener('click', () => {
      this.map.flyTo({ center: [this.engine.lng, this.engine.lat], pitch: 0, bearing: 0, zoom: 16 });
    });

    document.getElementById('camIsometricBtn').addEventListener('click', () => {
      this.map.flyTo({ center: [this.engine.lng, this.engine.lat], pitch: 65, bearing: -35, zoom: 15.5 });
    });

    document.getElementById('camGlidepathBtn').addEventListener('click', () => {
      this.flyToGlidepathView();
    });

    document.getElementById('camCenterVertiportBtn').addEventListener('click', () => {
      this.map.flyTo({ center: [this.engine.lng, this.engine.lat], zoom: 16.5 });
    });

    // Reset Defaults
    document.getElementById('resetDefaultsBtn').addEventListener('click', () => {
      this.resetToDefaults();
    });

    // Location Geocoding Search
    this.bindSearch();

    // Modals (Help, Export)
    this.bindModals();
  }

  // --- Fly To Pilot Glidepath Approach View ---
  flyToGlidepathView() {
    this.map.flyTo({
      center: [this.engine.lng, this.engine.lat],
      pitch: 75,
      bearing: (this.engine.heading + 180) % 360, // Looking towards vertiport
      zoom: 15.2,
      duration: 2000
    });
  }

  // --- Geocoding Search (OpenStreetMap Nominatim) ---
  bindSearch() {
    const searchInput = document.getElementById('locationSearchInput');
    const searchResults = document.getElementById('searchResults');
    const clearBtn = document.getElementById('clearSearchBtn');
    let debounceTimer = null;

    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      clearBtn.classList.toggle('hidden', q.length === 0);

      if (debounceTimer) clearTimeout(debounceTimer);
      if (q.length < 3) {
        searchResults.classList.add('hidden');
        return;
      }

      debounceTimer = setTimeout(() => {
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`)
          .then(res => res.json())
          .then(data => {
            searchResults.innerHTML = '';
            if (data && data.length > 0) {
              data.forEach(item => {
                const btn = document.createElement('button');
                btn.className = 'w-full text-left px-3.5 py-2 hover:bg-sky-600/20 text-xs border-b border-slate-800 last:border-b-0 flex items-start gap-2 text-slate-200 transition-colors';
                btn.innerHTML = `
                  <i data-lucide="map-pin" class="w-3.5 h-3.5 text-sky-400 mt-0.5 shrink-0"></i>
                  <span class="truncate">${item.display_name}</span>
                `;
                btn.addEventListener('click', () => {
                  const lat = parseFloat(item.lat);
                  const lon = parseFloat(item.lon);
                  this.repositionVertiport(lat, lon);
                  this.map.flyTo({ center: [lon, lat], zoom: 16 });
                  searchInput.value = item.display_name.split(',')[0];
                  searchResults.classList.add('hidden');
                });
                searchResults.appendChild(btn);
              });
              lucide.createIcons();
              searchResults.classList.remove('hidden');
            } else {
              searchResults.innerHTML = '<div class="px-3.5 py-2 text-slate-400 text-xs">No matching locations found</div>';
              searchResults.classList.remove('hidden');
            }
          })
          .catch(() => {
            searchResults.classList.add('hidden');
          });
      }, 350);
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearBtn.classList.add('hidden');
      searchResults.classList.add('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.classList.add('hidden');
      }
    });
  }

  // --- Modals (Help, Export) ---
  bindModals() {
    // Help Modal
    const helpModal = document.getElementById('helpModal');
    document.getElementById('openHelpBtn').addEventListener('click', () => helpModal.classList.remove('hidden'));
    document.getElementById('closeHelpModalBtn').addEventListener('click', () => helpModal.classList.add('hidden'));
    document.getElementById('closeHelpModalBtn2').addEventListener('click', () => helpModal.classList.add('hidden'));

    // Export Modal
    const exportModal = document.getElementById('exportModal');
    document.getElementById('openExportBtn').addEventListener('click', () => exportModal.classList.remove('hidden'));
    document.getElementById('closeExportModalBtn').addEventListener('click', () => exportModal.classList.add('hidden'));

    // Download JSON Project
    document.getElementById('downloadJsonBtn').addEventListener('click', () => {
      const data = {
        app: 'Vertiport & OLS Visualizer (FAA EB 105A)',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        configuration: {
          aircraftKey: this.engine.aircraftKey,
          dValueMeters: this.engine.dValue,
          lat: this.engine.lat,
          lng: this.engine.lng,
          elevationMeters: this.engine.elevationMeters,
          renderBuilding: this.engine.renderBuilding,
          heading: this.engine.heading,
          slopeRatio: this.engine.slopeRatio,
          flareRate: this.engine.flareRate,
          corridorLength: this.engine.corridorLength,
          shape: this.engine.shape,
          opacity: this.engine.opacity
        }
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vertiport-project-${this.engine.aircraftKey}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Import JSON Project
    document.getElementById('importJsonInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = JSON.parse(event.target.result);
          if (json.configuration) {
            const c = json.configuration;
            this.engine.aircraftKey = c.aircraftKey || 'wisk-gen6';
            this.engine.dValue = c.dValueMeters || 15.24;
            this.engine.lat = c.lat ?? this.engine.lat;
            this.engine.lng = c.lng ?? this.engine.lng;
            this.engine.elevationMeters = c.elevationMeters ?? 0;
            this.engine.renderBuilding = c.renderBuilding ?? false;
            this.engine.heading = c.heading ?? 45;
            this.engine.slopeRatio = c.slopeRatio ?? 8.0;
            this.engine.flareRate = c.flareRate ?? 0.15;
            this.engine.corridorLength = c.corridorLength ?? 3000;
            this.engine.shape = c.shape || 'square';
            this.engine.opacity = c.opacity ?? 0.45;

            this.map.flyTo({ center: [this.engine.lng, this.engine.lat], zoom: 16 });
            this.repositionVertiport(this.engine.lat, this.engine.lng);
            exportModal.classList.add('hidden');
          }
        } catch (err) {
          alert('Failed to parse project JSON file.');
        }
      };
      reader.readAsText(file);
    });

    // Export GeoJSON
    document.getElementById('exportGeoJsonBtn').addEventListener('click', () => {
      const geojson = this.engine.exportGeoJSON();
      const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vertiport-ols-footprints-${Date.now()}.geojson`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // --- Style Switcher ---
  switchStyle(styleKey) {
    if (!MAP_STYLES[styleKey] || styleKey === this.activeStyle) return;
    this.activeStyle = styleKey;

    document.getElementById('activeStyleName').innerText = 
      styleKey === 'dark' ? '3D Dark' : styleKey === 'satellite' ? 'Satellite' : '3D Light';

    document.querySelectorAll('.style-check').forEach(el => el.classList.add('hidden'));
    document.querySelector(`button[data-style="${styleKey}"] .style-check`)?.classList.remove('hidden');

    this.map.setStyle(MAP_STYLES[styleKey]);
  }

  // --- Vertiport Repositioning ---
  repositionVertiport(lat, lng) {
    this.engine.lat = lat;
    this.engine.lng = lng;
    if (this.marker) {
      this.marker.setLngLat([lng, lat]);
    }
    this.onParameterChanged();
  }

  togglePlacingMode(active) {
    this.isPlacingMode = active;
    const banner = document.getElementById('placementBanner');
    const placeBtnText = document.getElementById('placeBtnText');
    const canvas = this.map.getCanvasContainer();

    if (active) {
      banner.classList.remove('hidden');
      placeBtnText.innerText = 'Click Map';
      canvas.classList.add('placement-active-cursor');
    } else {
      banner.classList.add('hidden');
      placeBtnText.innerText = 'Reposition';
      canvas.classList.remove('placement-active-cursor');
    }
  }

  // --- Reset Defaults ---
  resetToDefaults() {
    this.engine.setAircraft('wisk-gen6');
    this.engine.elevationMeters = 0;
    this.engine.renderBuilding = false;
    this.engine.heading = 45;
    this.engine.slopeRatio = 8.0;
    this.engine.flareRate = 0.15;
    this.engine.corridorLength = 3000;
    this.engine.shape = 'square';
    this.engine.opacity = 0.45;
    this.engine.showPrimary = true;
    this.engine.showReciprocal = true;
    this.engine.showTransitional = true;
    this.engine.showPads = true;

    this.onParameterChanged();
  }

  // --- Unit Conversions ---
  toMeters(val) {
    return this.currentUnit === 'imperial' ? val * 0.3048 : val;
  }

  fromMeters(val) {
    return this.currentUnit === 'imperial' ? val / 0.3048 : val;
  }

  formatDist(meters, decimals = 1) {
    const val = this.fromMeters(meters);
    return `${val.toFixed(decimals)} ${this.currentUnit === 'imperial' ? 'ft' : 'm'}`;
  }

  updateUnitUI() {
    const isImp = this.currentUnit === 'imperial';
    document.getElementById('unitLabel').innerText = isImp ? 'Imperial (ft)' : 'Metric (m)';
    document.querySelectorAll('.unit-dist-label').forEach(el => {
      el.innerText = isImp ? 'ft' : 'm';
    });

    // Update Slider Ranges according to unit
    const elevSlider = document.getElementById('vertiportElevationSlider');
    const lengthSlider = document.getElementById('corridorLengthSlider');

    if (isImp) {
      elevSlider.max = 500;
      lengthSlider.min = 1500;
      lengthSlider.max = 16000;
      lengthSlider.step = 500;
    } else {
      elevSlider.max = 150;
      lengthSlider.min = 500;
      lengthSlider.max = 5000;
      lengthSlider.step = 100;
    }
  }

  // --- Parameter Change Trigger ---
  onParameterChanged() {
    this.threeLayer.updateGeometry();
    this.updateUI();
  }

  // --- Sync UI with Engine State ---
  updateUI() {
    const isImp = this.currentUnit === 'imperial';

    // Aircraft Selector
    document.getElementById('aircraftSelect').value = this.engine.aircraftKey;
    document.getElementById('aircraftDValBadge').innerText = `D = ${this.formatDist(this.engine.dValue)}`;

    // Custom D Input (if active)
    if (this.engine.aircraftKey === 'custom') {
      document.getElementById('customDContainer').classList.remove('hidden');
      document.getElementById('customDInput').value = this.fromMeters(this.engine.dValue).toFixed(1);
    } else {
      document.getElementById('customDContainer').classList.add('hidden');
    }

    // Coordinates
    document.getElementById('latDisplay').innerText = this.engine.lat.toFixed(5);
    document.getElementById('lonDisplay').innerText = this.engine.lng.toFixed(5);

    // Elevation & Building
    const elevVal = this.fromMeters(this.engine.elevationMeters);
    document.getElementById('vertiportElevationVal').innerText = Math.round(elevVal);
    document.getElementById('vertiportElevationSlider').value = Math.round(elevVal);
    document.getElementById('renderBuildingToggle').checked = this.engine.renderBuilding;

    // Heading
    const h = this.engine.heading;
    document.getElementById('headingVal').innerText = h.toString().padStart(3, '0');
    document.getElementById('headingSlider').value = h;
    document.getElementById('headingCardinal').innerText = `(${this.getCardinal(h)})`;
    document.getElementById('reciprocalHeadingVal').innerText = `${this.engine.reciprocalHeading.toString().padStart(3, '0')}° (${this.getCardinal(this.engine.reciprocalHeading)})`;

    // Slope
    const slope = this.engine.slopeRatio;
    document.getElementById('slopeSlider').value = slope;
    document.getElementById('slopeRatioBadge').innerText = `${slope.toFixed(1)}:1 (${this.engine.slopePercent.toFixed(1)}%)`;
    document.getElementById('slopeAngleDegVal').innerText = this.engine.slopeAngleDegrees.toFixed(1);
    document.getElementById('slopePctVal').innerText = this.engine.slopePercent.toFixed(1);

    // Flare & Length
    document.getElementById('flareVal').innerText = Math.round(this.engine.flareRate * 100);
    document.getElementById('flareSlider').value = Math.round(this.engine.flareRate * 100);

    const lengthVal = this.fromMeters(this.engine.corridorLength);
    document.getElementById('corridorLengthVal').innerText = Math.round(lengthVal);
    document.getElementById('corridorLengthSlider').value = Math.round(lengthVal);

    // Pad Dimension Displays
    document.getElementById('tlofDimDisplay').innerText = this.fromMeters(this.engine.tlofDimension).toFixed(1);
    document.getElementById('fatoDimDisplay').innerText = this.fromMeters(this.engine.fatoDimension).toFixed(1);
    document.getElementById('saDimDisplay').innerText = this.fromMeters(this.engine.safetyAreaDimension).toFixed(1);

    // Footer stats
    document.getElementById('corridorWidthMax').innerText = `Max W: ${this.formatDist(this.engine.corridorEndOuterWidth, 0)}`;

    // Opacity
    document.getElementById('opacityVal').innerText = `${Math.round(this.engine.opacity * 100)}%`;
    document.getElementById('opacitySlider').value = Math.round(this.engine.opacity * 100);

    // Live Telemetry HUD
    const aircraftPreset = AIRCRAFT_PRESETS[this.engine.aircraftKey];
    document.getElementById('hudAircraftName').innerText = aircraftPreset?.name || 'Custom';
    document.getElementById('hudDVal').innerText = `${this.formatDist(this.engine.dValue)} (${(this.engine.dValue / 0.3048).toFixed(0)} ft)`;
    document.getElementById('hudElevation').innerText = this.engine.elevationMeters > 0 
      ? `${this.formatDist(this.engine.elevationMeters, 0)} AGL (${this.engine.renderBuilding ? 'Building' : 'Rooftop'})` 
      : '0 m (Ground)';
    document.getElementById('hudHeading').innerText = `${h.toString().padStart(3, '0')}° / ${this.engine.reciprocalHeading.toString().padStart(3, '0')}°`;
    document.getElementById('hudSlope').innerText = `${slope.toFixed(1)}:1 (${this.engine.slopeAngleDegrees.toFixed(1)}°)`;
    document.getElementById('hudInnerWidth').innerText = this.formatDist(this.engine.safetyAreaDimension);
    document.getElementById('hudMaxHeight').innerText = this.formatDist(this.engine.corridorMaxHeight);
  }

  getCardinal(deg) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round((deg % 360) / 22.5) % 16;
    return directions[index];
  }
}

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new VertiportApp();
});
