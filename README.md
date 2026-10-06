# Vertiport & OLS 3D Visualizer (FAA EB 105A)

An interactive, browser-based 3D geospatial tool for visualizing eVTOL vertiports, Final Approach and Take-Off areas (FATO), Touchdown and Lift-Off areas (TLOF), Safety Areas, and Obstacle Limitation Surfaces (OLS / Takeoff Climb and Approach surfaces) in accordance with **FAA Engineering Brief 105A**.

---

## ✨ Key Features

1. **FAA EB 105A Geometrical Modeling**:
   - **TLOF (Touchdown and Lift-Off Area)**: Sized to $1.0 \times D$.
   - **FATO (Final Approach and Take-Off Area)**: Sized to $1.5 \times D$ (or $2.0 \times D$, square or circular).
   - **Safety Area**: Sized to $2.0 \times D$ outer perimeter.
   - **Bidirectional Approach/Departure Surfaces**: Sloped 3D volumetric envelopes along primary and reciprocal headings ($+180^\circ$).
   - **Transitional Surfaces**: $2:1$ lateral side surfaces extending outwards and upwards from the safety area.

2. **Customizable Approach Slopes & Flare**:
   - Adjustable slope gradient (default $8:1 = 12.5\% = 7.125^\circ$, up to steep eVTOL trajectories like $3:1$ / $18.4^\circ$).
   - Adjustable lateral flare divergence rate (default $15\%$).
   - Adjustable corridor extent length ($500\,\text{m}$ to $5{,}000\,\text{m}$).

3. **Ground-Level & Elevated Vertiports**:
   - Deck elevation slider ($0$ to $150\,\text{m}$ / $500\,\text{ft}$ AGL).
   - **Greenfield Building Toggle**: When elevated, render a 3D structural building tower/pedestal underneath the deck from ground level. When disabled, easily place the elevated pad directly onto existing 3D OpenStreetMap building rooftops without duplicating geometry.

4. **Aircraft Library (Wisk Gen 6 Default)**:
   - ✨ **Wisk Gen 6** ($D = 15.24\,\text{m} / 50\,\text{ft}$, 4-passenger autonomous eVTOL)
   - **Joby S4** ($D = 10.7\,\text{m} / 35.1\,\text{ft}$)
   - **Archer Midnight** ($D = 14.3\,\text{m} / 47.0\,\text{ft}$)
   - **Beta Technologies ALIA-250** ($D = 15.2\,\text{m} / 50\,\text{ft}$)
   - **Lilium Jet** ($D = 14.0\,\text{m} / 45.9\,\text{ft}$)
   - **Custom eVTOL** ($D$-value input in meters or feet).

5. **3D Geospatial Engine & Controls**:
   - Powered by **MapLibre GL JS** + **Three.js** custom 3D WebGL layer.
   - Extruded 3D OpenStreetMap buildings.
   - Basemap switcher: 3D Dark, Satellite Imagery, 3D Light.
   - Global search bar with OpenStreetMap geocoding.
   - Camera presets: Top-Down 2D, 3D Isometric Orbit, and Pilot Glidepath View.
   - Real-time telemetry HUD with live dimension calculations.
   - Metric (meters) and Imperial (feet) unit toggles.
   - Export project configuration to JSON, load existing JSON files, or export 2D surface footprints as GeoJSON.

---

## 🚀 How to Run

### Method 1: Local Server (Recommended)
Run the bundled Python script:
```bash
python3 serve.py
```
Then open [http://localhost:8080](http://localhost:8080) in your web browser.

### Method 2: Direct Open
Simply double-click `index.html` to open it directly in Chrome, Safari, Firefox, or Edge.

---

## 📐 FAA EB 105A Geometric Reference Summary

| Parameter | Default (EB 105A) | Description |
|---|---|---|
| **Controlling Dimension ($D$)** | $15.24\,\text{m}$ ($50\,\text{ft}$) | Maximum overall dimension of aircraft with rotors operating |
| **TLOF Size** | $1.0 \times D$ | Load-bearing touchdown area |
| **FATO Size** | $1.5 \times D$ | Clear area for final approach and takeoff termination |
| **Safety Area Size** | $2.0 \times D$ | Cleared perimeter around FATO |
| **Approach/Departure Slope** | $8:1$ ($12.5\% / 7.125^\circ$) | Upward sloping obstacle clearance plane (adjustable) |
| **Lateral Flare Rate** | $15\%$ divergence | Surface widens $15\,\text{m}$ per $100\,\text{m}$ distance per side |
| **Transitional Slope** | $2:1$ | $50\%$ side slope extending upwards from safety area |
