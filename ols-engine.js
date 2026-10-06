/**
 * FAA EB 105A Obstacle Limitation Surface (OLS) & Vertiport Geometry Engine
 * Implements 3D mathematical calculations for TLOF, FATO, Safety Area,
 * Takeoff Climb and Approach surfaces, Transitional surfaces, and Elevated structures.
 */

const AIRCRAFT_PRESETS = {
  'wisk-gen6': {
    name: 'Wisk Gen 6',
    description: 'Autonomous 4-Passenger eVTOL (6 Tilt-Rotors + 6 Lift-Rotors)',
    dValueMeters: 15.24, // 50.0 ft
    mtowKg: 2268,
    isDefault: true
  },
  'joby-s4': {
    name: 'Joby S4',
    description: 'Piloted 4-Passenger / 1-Pilot eVTOL (6 Tilt-Rotors)',
    dValueMeters: 10.70, // 35.1 ft
    mtowKg: 2177
  },
  'archer-midnight': {
    name: 'Archer Midnight',
    description: 'Piloted 4-Passenger eVTOL (12 Rotors: 6 Tilt, 6 Fixed)',
    dValueMeters: 14.33, // 47.0 ft
    mtowKg: 3175
  },
  'beta-alia': {
    name: 'Beta Technologies ALIA-250',
    description: 'Cargo & Passenger eVTOL (5 Rotors: 4 Lift, 1 Pusher)',
    dValueMeters: 15.24, // 50.0 ft
    mtowKg: 3175
  },
  'lilium-jet': {
    name: 'Lilium Jet',
    description: '6-Passenger Ducted Electric Vectored Thrust eVTOL',
    dValueMeters: 14.00, // 45.9 ft
    mtowKg: 3175
  },
  'custom': {
    name: 'Custom eVTOL',
    description: 'User-specified controlling dimension and parameters',
    dValueMeters: 15.24,
    mtowKg: 2500
  }
};

class OLSEngine {
  constructor(config = {}) {
    this.unit = config.unit || 'metric'; // 'metric' (meters) or 'imperial' (feet)
    
    // Core Vertiport Parameters
    this.aircraftKey = config.aircraftKey || 'wisk-gen6';
    this.dValue = config.dValue || AIRCRAFT_PRESETS['wisk-gen6'].dValueMeters; // meters
    
    // Position & Orientation
    this.lat = config.lat ?? 37.77492;
    this.lng = config.lng ?? -122.41941;
    this.elevationMeters = config.elevationMeters ?? 0; // AGL deck height in meters
    this.renderBuilding = config.renderBuilding ?? false; // Greenfield building toggle
    
    this.heading = config.heading ?? 45; // Degrees from True North (0-359)
    this.shape = config.shape || 'square'; // 'square' or 'circle'
    
    // Ratios & Dimensions (EB 105A recommendations)
    this.tlofRatio = config.tlofRatio ?? 1.0; // 1.0 * D
    this.fatoRatio = config.fatoRatio ?? 1.5; // 1.5 * D
    this.safetyAreaRatio = config.safetyAreaRatio ?? 2.0; // 2.0 * D
    
    // Approach / Departure OLS Surface Parameters
    this.slopeRatio = config.slopeRatio ?? 8.0; // e.g. 8:1 (horizontal:vertical), 12.5% = 7.125 deg
    this.flareRate = config.flareRate ?? 0.15; // 15% lateral divergence per side (EB 105A standard)
    this.corridorLength = config.corridorLength ?? 3000.0; // meters (approx 10,000 ft)
    this.maxOuterWidth = config.maxOuterWidth ?? null; // Optional outer width cap (meters)
    
    // Layer Visibility
    this.showPrimary = config.showPrimary ?? true;
    this.showReciprocal = config.showReciprocal ?? true;
    this.showTransitional = config.showTransitional ?? true;
    this.showPads = config.showPads ?? true;
    this.showBuildings = config.showBuildings ?? true;
    this.opacity = config.opacity ?? 0.45;
  }

  // --- Dimension Computations ---
  get tlofDimension() {
    return this.dValue * this.tlofRatio;
  }

  get fatoDimension() {
    return this.dValue * this.fatoRatio;
  }

  get safetyAreaDimension() {
    return this.dValue * this.safetyAreaRatio;
  }

  get slopeAngleDegrees() {
    return Math.atan(1.0 / this.slopeRatio) * (180.0 / Math.PI);
  }

  get slopePercent() {
    return (1.0 / this.slopeRatio) * 100.0;
  }

  get corridorMaxHeight() {
    return this.elevationMeters + (this.corridorLength / this.slopeRatio);
  }

  get corridorEndOuterWidth() {
    const innerWidth = this.safetyAreaDimension;
    const computedOuter = innerWidth + (2.0 * this.flareRate * this.corridorLength);
    if (this.maxOuterWidth && computedOuter > this.maxOuterWidth) {
      return this.maxOuterWidth;
    }
    return computedOuter;
  }

  get reciprocalHeading() {
    return (this.heading + 180) % 360;
  }

  // Set aircraft preset
  setAircraft(key, customD = null) {
    this.aircraftKey = key;
    if (key === 'custom' && customD) {
      this.dValue = customD;
    } else if (AIRCRAFT_PRESETS[key]) {
      this.dValue = AIRCRAFT_PRESETS[key].dValueMeters;
    }
  }

  /**
   * Generates 3D geometric mesh data in local East-North-Up (ENU) coordinates (in meters)
   * origin at the vertiport center ground (z = 0) or deck level (z = elevationMeters)
   */
  generateGeometry() {
    const geom = {
      tlof: this._generatePadGeometry(this.tlofDimension, this.elevationMeters),
      fato: this._generatePadGeometry(this.fatoDimension, this.elevationMeters),
      safetyArea: this._generatePadGeometry(this.safetyAreaDimension, this.elevationMeters),
      primaryCorridor: this._generateApproachSurface(this.heading, this.elevationMeters),
      reciprocalCorridor: this._generateApproachSurface(this.reciprocalHeading, this.elevationMeters),
      transitionalSurfaces: this._generateTransitionalSurfaces(this.elevationMeters),
      buildingStructure: this.renderBuilding && this.elevationMeters > 0 
        ? this._generateBuildingStructure(this.safetyAreaDimension, this.elevationMeters) 
        : null
    };

    return geom;
  }

  /**
   * Generates a 2D/3D pad polygon in local coordinates (centered at 0,0,z)
   */
  _generatePadGeometry(dim, z) {
    const half = dim / 2.0;
    const radHeading = (this.heading * Math.PI) / 180.0;
    const cosH = Math.cos(radHeading);
    const sinH = Math.sin(radHeading);

    if (this.shape === 'circle') {
      const segments = 36;
      const vertices = [];
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const x = half * Math.cos(theta);
        const y = half * Math.sin(theta);
        vertices.push({ x, y, z });
      }
      return { type: 'circle', vertices, radius: half, z };
    }

    // Square pad aligned with heading
    const corners = [
      { x: -half, y: -half },
      { x: half, y: -half },
      { x: half, y: half },
      { x: -half, y: half }
    ];

    const rotatedCorners = corners.map(c => ({
      x: c.x * cosH - c.y * sinH,
      y: c.x * sinH + c.y * cosH,
      z: z
    }));

    return { type: 'polygon', vertices: rotatedCorners, dimension: dim, z };
  }

  /**
   * Generates the Takeoff Climb & Approach OLS trapezoidal ramp surface in 3D
   */
  _generateApproachSurface(azimuthDeg, baseZ) {
    const saHalf = this.safetyAreaDimension / 2.0;
    const length = this.corridorLength;
    const endZ = baseZ + (length / this.slopeRatio);
    const innerHalfWidth = saHalf;
    const outerHalfWidth = (this.safetyAreaDimension + (2.0 * this.flareRate * length)) / 2.0;

    // Azimuth direction vector (North = +Y, East = +X)
    const rad = (azimuthDeg * Math.PI) / 180.0;
    const dirX = Math.sin(rad);
    const dirY = Math.cos(rad);

    // Perpendicular vector (right side of flight path)
    const rightX = dirY;
    const rightY = -dirX;

    // Origin starts at the outer edge of the Safety Area along the azimuth
    const originCenterX = dirX * saHalf;
    const originCenterY = dirY * saHalf;

    // 4 Key Corners of the 3D surface:
    // P0: Origin Left (z = baseZ)
    // P1: Origin Right (z = baseZ)
    // P2: End Right (z = endZ)
    // P3: End Left (z = endZ)
    const p0 = {
      x: originCenterX - rightX * innerHalfWidth,
      y: originCenterY - rightY * innerHalfWidth,
      z: baseZ
    };
    const p1 = {
      x: originCenterX + rightX * innerHalfWidth,
      y: originCenterY + rightY * innerHalfWidth,
      z: baseZ
    };

    // End centerline point
    const endCenterX = originCenterX + dirX * length;
    const endCenterY = originCenterY + dirY * length;

    const p2 = {
      x: endCenterX + rightX * outerHalfWidth,
      y: endCenterY + rightY * outerHalfWidth,
      z: endZ
    };
    const p3 = {
      x: endCenterX - rightX * outerHalfWidth,
      y: endCenterY - rightY * outerHalfWidth,
      z: endZ
    };

    // Generate intermediate slice steps for clean wireframe ribs
    const steps = 10;
    const ribs = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const curDist = t * length;
      const curZ = baseZ + (curDist / this.slopeRatio);
      const curHalfW = innerHalfWidth + (this.flareRate * curDist);
      const cX = originCenterX + dirX * curDist;
      const cY = originCenterY + dirY * curDist;

      ribs.push({
        left: { x: cX - rightX * curHalfW, y: cY - rightY * curHalfW, z: curZ },
        right: { x: cX + rightX * curHalfW, y: cY + rightY * curHalfW, z: curZ },
        center: { x: cX, y: cY, z: curZ },
        dist: curDist,
        z: curZ
      });
    }

    return {
      corners: [p0, p1, p2, p3],
      ribs: ribs,
      azimuthDeg,
      length,
      baseZ,
      endZ,
      innerHalfWidth,
      outerHalfWidth
    };
  }

  /**
   * Generates 2:1 Transitional side surfaces extending from the Safety Area side edges
   */
  _generateTransitionalSurfaces(baseZ) {
    const saHalf = this.safetyAreaDimension / 2.0;
    const radHeading = (this.heading * Math.PI) / 180.0;
    const dirX = Math.sin(radHeading);
    const dirY = Math.cos(radHeading);
    const rightX = dirY;
    const rightY = -dirX;

    // Transitional slope is 2:1 (rises 1m for every 2m horizontal)
    // Transitional surfaces extend laterally until reaching a certain height/distance (e.g. 45m height or meeting OLS)
    const transHeight = 35.0; // meters rise
    const transHorizDist = transHeight * 2.0; // 70m lateral extension

    // Side 1 (Right flank of Safety Area)
    const rightStart1 = { x: dirX * saHalf + rightX * saHalf, y: dirY * saHalf + rightY * saHalf, z: baseZ };
    const rightStart2 = { x: -dirX * saHalf + rightX * saHalf, y: -dirY * saHalf + rightY * saHalf, z: baseZ };
    const rightEnd1 = { x: rightStart1.x + rightX * transHorizDist, y: rightStart1.y + rightY * transHorizDist, z: baseZ + transHeight };
    const rightEnd2 = { x: rightStart2.x + rightX * transHorizDist, y: rightStart2.y + rightY * transHorizDist, z: baseZ + transHeight };

    // Side 2 (Left flank of Safety Area)
    const leftStart1 = { x: dirX * saHalf - rightX * saHalf, y: dirY * saHalf - rightY * saHalf, z: baseZ };
    const leftStart2 = { x: -dirX * saHalf - rightX * saHalf, y: -dirY * saHalf - rightY * saHalf, z: baseZ };
    const leftEnd1 = { x: leftStart1.x - rightX * transHorizDist, y: leftStart1.y - rightY * transHorizDist, z: baseZ + transHeight };
    const leftEnd2 = { x: leftStart2.x - rightX * transHorizDist, y: leftStart2.y - rightY * transHorizDist, z: baseZ + transHeight };

    return [
      { side: 'right', corners: [rightStart1, rightStart2, rightEnd2, rightEnd1] },
      { side: 'left', corners: [leftStart1, leftStart2, leftEnd2, leftEnd1] }
    ];
  }

  /**
   * Generates a 3D structural building tower/pedestal underneath the elevated deck
   */
  _generateBuildingStructure(deckDimension, height) {
    const half = (deckDimension * 0.95) / 2.0; // Slightly recessed under the safety area cantilever
    const radHeading = (this.heading * Math.PI) / 180.0;
    const cosH = Math.cos(radHeading);
    const sinH = Math.sin(radHeading);

    const baseCorners = [
      { x: -half, y: -half, z: 0 },
      { x: half, y: -half, z: 0 },
      { x: half, y: half, z: 0 },
      { x: -half, y: half, z: 0 }
    ].map(c => ({
      x: c.x * cosH - c.y * sinH,
      y: c.x * sinH + c.y * cosH,
      z: 0
    }));

    const topCorners = baseCorners.map(c => ({ ...c, z: height }));

    return {
      baseCorners,
      topCorners,
      height,
      dimension: deckDimension * 0.95
    };
  }

  /**
   * Converts local ENU coordinate {x, y, z} into WGS84 [lng, lat, alt]
   */
  enuToLngLat(x, y, z) {
    const earthRadius = 6378137.0; // WGS84 Equatorial Radius in meters
    const dLat = (y / earthRadius) * (180.0 / Math.PI);
    const dLng = (x / (earthRadius * Math.cos((this.lat * Math.PI) / 180.0))) * (180.0 / Math.PI);

    return {
      lng: this.lng + dLng,
      lat: this.lat + dLat,
      alt: z
    };
  }

  /**
   * Exports 2D footprints of all key surfaces to GeoJSON FeatureCollection
   */
  exportGeoJSON() {
    const geom = this.generateGeometry();
    const features = [];

    // Helper to format polygon
    const toGeoJsonPolygon = (coords, name, properties = {}) => {
      const ring = coords.map(c => {
        const pt = this.enuToLngLat(c.x, c.y, c.z);
        return [pt.lng, pt.lat];
      });
      ring.push(ring[0]); // Close ring
      return {
        type: 'Feature',
        properties: { name, ...properties },
        geometry: {
          type: 'Polygon',
          coordinates: [ring]
        }
      };
    };

    // Safety Area
    if (geom.safetyArea.vertices) {
      features.push(toGeoJsonPolygon(geom.safetyArea.vertices, 'Safety Area (2.0 D)', {
        type: 'SafetyArea',
        dimensionMeters: this.safetyAreaDimension
      }));
    }

    // FATO
    if (geom.fato.vertices) {
      features.push(toGeoJsonPolygon(geom.fato.vertices, 'FATO (1.5 D)', {
        type: 'FATO',
        dimensionMeters: this.fatoDimension
      }));
    }

    // TLOF
    if (geom.tlof.vertices) {
      features.push(toGeoJsonPolygon(geom.tlof.vertices, 'TLOF (1.0 D)', {
        type: 'TLOF',
        dimensionMeters: this.tlofDimension
      }));
    }

    // Primary Corridor
    if (geom.primaryCorridor.corners) {
      features.push(toGeoJsonPolygon(geom.primaryCorridor.corners, 'Primary Approach Corridor OLS', {
        type: 'ApproachSurface',
        heading: this.heading,
        slopeRatio: `${this.slopeRatio}:1`,
        lengthMeters: this.corridorLength
      }));
    }

    // Reciprocal Corridor
    if (geom.reciprocalCorridor.corners) {
      features.push(toGeoJsonPolygon(geom.reciprocalCorridor.corners, 'Reciprocal Corridor OLS', {
        type: 'DepartureSurface',
        heading: this.reciprocalHeading,
        slopeRatio: `${this.slopeRatio}:1`,
        lengthMeters: this.corridorLength
      }));
    }

    return {
      type: 'FeatureCollection',
      vertiport: {
        aircraft: AIRCRAFT_PRESETS[this.aircraftKey]?.name || 'Custom',
        dValueMeters: this.dValue,
        deckElevationMeters: this.elevationMeters,
        renderBuilding: this.renderBuilding,
        center: [this.lng, this.lat]
      },
      features
    };
  }
}

// Attach to window
window.AIRCRAFT_PRESETS = AIRCRAFT_PRESETS;
window.OLSEngine = OLSEngine;
