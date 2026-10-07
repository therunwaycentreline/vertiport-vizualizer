/**
 * Three.js Custom 3D Layer for MapLibre GL JS
 * Renders accurate, semi-transparent FAA EB 105A Obstacle Limitation Surfaces (OLS),
 * FATO, TLOF, Safety Area, Transitional Surfaces, and Greenfield elevated building in 3D.
 */

class ThreeMapLibreLayer {
  constructor(id = 'ols-3d-layer', engine = null) {
    this.id = id;
    this.type = 'custom';
    this.renderingMode = '3d';
    this.engine = engine;

    // Three.js Core Objects
    this.camera = new THREE.Camera();
    this.scene = new THREE.Scene();
    this.renderer = null;
    this.map = null;
    this.gl = null;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.95);
    dirLight1.position.set(200, 300, 500);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x90b0e0, 0.55);
    dirLight2.position.set(-200, -300, 200);
    this.scene.add(dirLight2);

    // Root Group for all Vertiport Meshes
    this.rootGroup = new THREE.Group();
    this.rootGroup.matrixAutoUpdate = false;
    this.scene.add(this.rootGroup);

    // Track active meshes
    this.meshes = [];
  }

  onAdd(map, gl) {
    this.map = map;
    this.gl = gl;

    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true
      });
      this.renderer.autoClear = false;
    } else {
      this.renderer.resetState();
    }

    // Force full geometry rebuild and matrix sync
    this.updateGeometry();
  }

  onRemove() {
    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  /**
   * Recursively disables frustum culling on all child meshes/lines
   * so Three.js doesn't mistakenly cull them in MapLibre Mercator space
   */
  _disableFrustumCulling(obj) {
    obj.frustumCulled = false;
    if (obj.children && obj.children.length > 0) {
      obj.children.forEach(child => this._disableFrustumCulling(child));
    }
  }

  /**
   * Rebuilds all 3D Three.js meshes when engine parameters change
   */
  updateGeometry() {
    if (!this.engine) return;

    // Clear previous meshes
    while (this.rootGroup.children.length > 0) {
      const obj = this.rootGroup.children[0];
      this.rootGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    }
    this.meshes = [];

    const geomData = this.engine.generateGeometry();
    const opacity = this.engine.opacity;

    // 1. TLOF Pad
    if (this.engine.showPads && geomData.tlof) {
      const tlofMesh = this._createPadMesh(geomData.tlof, 0x06b6d4, 0xffffff, 'TLOF', 0.9);
      this._disableFrustumCulling(tlofMesh);
      this.rootGroup.add(tlofMesh);
    }

    // 2. FATO Pad
    if (this.engine.showPads && geomData.fato) {
      const fatoMesh = this._createPadMesh(geomData.fato, 0xeab308, 0xfacc15, 'FATO', 0.6);
      this._disableFrustumCulling(fatoMesh);
      this.rootGroup.add(fatoMesh);
    }

    // 3. Safety Area
    if (this.engine.showPads && geomData.safetyArea) {
      const saMesh = this._createPadMesh(geomData.safetyArea, 0xef4444, 0xf87171, 'SA', 0.35);
      this._disableFrustumCulling(saMesh);
      this.rootGroup.add(saMesh);
    }

    // 4. Primary Takeoff Climb & Approach Surface (OLS)
    if (this.engine.showPrimary && geomData.primaryCorridor) {
      const primaryMesh = this._createCorridorMesh(geomData.primaryCorridor, 0x10b981, 0x34d399, opacity);
      this._disableFrustumCulling(primaryMesh);
      this.rootGroup.add(primaryMesh);
    }

    // 5. Reciprocal Takeoff Climb & Approach Surface (OLS)
    if (this.engine.showReciprocal && geomData.reciprocalCorridor) {
      const recipMesh = this._createCorridorMesh(geomData.reciprocalCorridor, 0xf59e0b, 0xfbbf24, opacity);
      this._disableFrustumCulling(recipMesh);
      this.rootGroup.add(recipMesh);
    }

    // 6. Transitional Side Surfaces (2:1 slope)
    if (this.engine.showTransitional && geomData.transitionalSurfaces) {
      geomData.transitionalSurfaces.forEach(trans => {
        const transMesh = this._createTransitionalMesh(trans, 0x8b5cf6, 0xa78bfa, opacity * 0.85);
        this._disableFrustumCulling(transMesh);
        this.rootGroup.add(transMesh);
      });
    }

    // 7. Greenfield 3D Supporting Building Structure
    if (geomData.buildingStructure) {
      const bldgMesh = this._createBuildingMesh(geomData.buildingStructure);
      this._disableFrustumCulling(bldgMesh);
      this.rootGroup.add(bldgMesh);
    }

    // Force matrix world update
    this.rootGroup.matrixWorldNeedsUpdate = true;
    this.rootGroup.updateMatrixWorld(true);

    // Request repaint on map
    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  /**
   * Creates 3D Pad geometry (TLOF / FATO / Safety Area) with markings
   */
  _createPadMesh(padData, fillColor, borderColor, label, fillOpacity) {
    const group = new THREE.Group();

    if (padData.type === 'circle') {
      const geom = new THREE.BufferGeometry();
      const pos = [];
      const segs = padData.vertices.length - 1;
      const center = { x: 0, y: 0, z: padData.z + 0.1 };

      for (let i = 0; i < segs; i++) {
        const v1 = padData.vertices[i];
        const v2 = padData.vertices[i + 1];
        pos.push(center.x, center.y, center.z);
        pos.push(v1.x, v1.y, v1.z + 0.1);
        pos.push(v2.x, v2.y, v2.z + 0.1);
      }

      geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geom.computeVertexNormals();

      const mat = new THREE.MeshBasicMaterial({
        color: fillColor,
        transparent: true,
        opacity: fillOpacity * 0.4,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      group.add(new THREE.Mesh(geom, mat));

      // Perimeter line
      const linePos = [];
      padData.vertices.forEach(v => linePos.push(v.x, v.y, v.z + 0.2));
      const lineGeom = new THREE.BufferGeometry();
      lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
      const lineMat = new THREE.LineBasicMaterial({ color: borderColor, linewidth: 2 });
      group.add(new THREE.Line(lineGeom, lineMat));

    } else {
      // Polygon / Square pad
      const v = padData.vertices;
      const geom = new THREE.BufferGeometry();
      const pos = [
        v[0].x, v[0].y, v[0].z + 0.1,
        v[1].x, v[1].y, v[1].z + 0.1,
        v[2].x, v[2].y, v[2].z + 0.1,

        v[0].x, v[0].y, v[0].z + 0.1,
        v[2].x, v[2].y, v[2].z + 0.1,
        v[3].x, v[3].y, v[3].z + 0.1
      ];

      geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geom.computeVertexNormals();

      const mat = new THREE.MeshBasicMaterial({
        color: fillColor,
        transparent: true,
        opacity: fillOpacity * 0.35,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      group.add(new THREE.Mesh(geom, mat));

      // Perimeter wireframe
      const linePos = [
        v[0].x, v[0].y, v[0].z + 0.2,
        v[1].x, v[1].y, v[1].z + 0.2,
        v[2].x, v[2].y, v[2].z + 0.2,
        v[3].x, v[3].y, v[3].z + 0.2,
        v[0].x, v[0].y, v[0].z + 0.2
      ];
      const lineGeom = new THREE.BufferGeometry();
      lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
      const lineMat = new THREE.LineBasicMaterial({ color: borderColor, linewidth: 2 });
      group.add(new THREE.Line(lineGeom, lineMat));

      // If TLOF, add a touchdown 'H' symbol
      if (label === 'TLOF') {
        const hSize = padData.dimension * 0.45;
        const radH = (this.engine.heading * Math.PI) / 180.0;
        const cosH = Math.cos(radH);
        const sinH = Math.sin(radH);
        const rot = (px, py) => ({
          x: px * cosH - py * sinH,
          y: px * sinH + py * cosH,
          z: padData.z + 0.3
        });

        const hLines = [
          // Left vertical
          rot(-hSize / 2, -hSize / 2), rot(-hSize / 2, hSize / 2),
          // Right vertical
          rot(hSize / 2, -hSize / 2), rot(hSize / 2, hSize / 2),
          // Crossbar
          rot(-hSize / 2, 0), rot(hSize / 2, 0)
        ];

        const hPos = [];
        hLines.forEach(pt => hPos.push(pt.x, pt.y, pt.z));
        const hGeom = new THREE.BufferGeometry();
        hGeom.setAttribute('position', new THREE.Float32BufferAttribute(hPos, 3));
        const hMat = new THREE.LineSegments(hGeom, new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 3 }));
        group.add(hMat);
      }
    }

    return group;
  }

  /**
   * Creates 3D Volumetric Takeoff Climb and Approach OLS ramp mesh
   */
  _createCorridorMesh(corridor, fillColor, wireColor, opacity) {
    const group = new THREE.Group();
    const c = corridor.corners;

    // 1. Top inclined plane surface (2 triangles: 0,1,2 and 0,2,3)
    const geom = new THREE.BufferGeometry();
    const pos = [
      c[0].x, c[0].y, c[0].z,
      c[1].x, c[1].y, c[1].z,
      c[2].x, c[2].y, c[2].z,

      c[0].x, c[0].y, c[0].z,
      c[2].x, c[2].y, c[2].z,
      c[3].x, c[3].y, c[3].z
    ];

    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.computeVertexNormals();

    const mat = new THREE.MeshPhongMaterial({
      color: fillColor,
      transparent: true,
      opacity: opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      shininess: 30
    });
    group.add(new THREE.Mesh(geom, mat));

    // 2. Glowing Boundary Edges
    const borderPos = [
      c[0].x, c[0].y, c[0].z,
      c[1].x, c[1].y, c[1].z,
      c[2].x, c[2].y, c[2].z,
      c[3].x, c[3].y, c[3].z,
      c[0].x, c[0].y, c[0].z
    ];
    const borderGeom = new THREE.BufferGeometry();
    borderGeom.setAttribute('position', new THREE.Float32BufferAttribute(borderPos, 3));
    const borderMat = new THREE.LineBasicMaterial({ color: wireColor, linewidth: 2 });
    group.add(new THREE.Line(borderGeom, borderMat));

    // 3. Ribs & Centerline (Elevation bands / distance milestones)
    if (corridor.ribs && corridor.ribs.length > 0) {
      const ribPos = [];
      const centerPos = [];

      corridor.ribs.forEach((rib, idx) => {
        // Cross rib line (left to right)
        ribPos.push(rib.left.x, rib.left.y, rib.left.z + 0.1);
        ribPos.push(rib.right.x, rib.right.y, rib.right.z + 0.1);

        // Centerline
        centerPos.push(rib.center.x, rib.center.y, rib.center.z + 0.2);
      });

      // Ribs line segments
      const ribGeom = new THREE.BufferGeometry();
      ribGeom.setAttribute('position', new THREE.Float32BufferAttribute(ribPos, 3));
      const ribMat = new THREE.LineSegments(ribGeom, new THREE.LineBasicMaterial({
        color: wireColor,
        transparent: true,
        opacity: 0.6
      }));
      group.add(ribMat);

      // Flight Centerline
      const centerGeom = new THREE.BufferGeometry();
      centerGeom.setAttribute('position', new THREE.Float32BufferAttribute(centerPos, 3));
      const centerMat = new THREE.Line(centerGeom, new THREE.LineBasicMaterial({
        color: 0xffffff,
        linewidth: 2,
        transparent: true,
        opacity: 0.85
      }));
      group.add(centerMat);
    }

    return group;
  }

  /**
   * Creates 2:1 Transitional side slope surfaces
   */
  _createTransitionalMesh(trans, fillColor, wireColor, opacity) {
    const group = new THREE.Group();
    const c = trans.corners;

    const geom = new THREE.BufferGeometry();
    const pos = [
      c[0].x, c[0].y, c[0].z,
      c[1].x, c[1].y, c[1].z,
      c[2].x, c[2].y, c[2].z,

      c[0].x, c[0].y, c[0].z,
      c[2].x, c[2].y, c[2].z,
      c[3].x, c[3].y, c[3].z
    ];

    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.computeVertexNormals();

    const mat = new THREE.MeshPhongMaterial({
      color: fillColor,
      transparent: true,
      opacity: opacity * 0.7,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    group.add(new THREE.Mesh(geom, mat));

    // Outer border
    const borderPos = [
      c[0].x, c[0].y, c[0].z,
      c[1].x, c[1].y, c[1].z,
      c[2].x, c[2].y, c[2].z,
      c[3].x, c[3].y, c[3].z,
      c[0].x, c[0].y, c[0].z
    ];
    const borderGeom = new THREE.BufferGeometry();
    borderGeom.setAttribute('position', new THREE.Float32BufferAttribute(borderPos, 3));
    const borderMat = new THREE.LineBasicMaterial({ color: wireColor, linewidth: 1.5 });
    group.add(new THREE.Line(borderGeom, borderMat));

    return group;
  }

  /**
   * Creates 3D extruded Greenfield Building / Pedestal structure under elevated vertiport
   */
  _createBuildingMesh(bldg) {
    const group = new THREE.Group();
    const b = bldg.baseCorners;
    const t = bldg.topCorners;

    // 4 vertical wall quads (each quad has 2 triangles)
    const wallPos = [];
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      // Triangle 1: b[i], b[next], t[next]
      wallPos.push(b[i].x, b[i].y, b[i].z);
      wallPos.push(b[next].x, b[next].y, b[next].z);
      wallPos.push(t[next].x, t[next].y, t[next].z);

      // Triangle 2: b[i], t[next], t[i]
      wallPos.push(b[i].x, b[i].y, b[i].z);
      wallPos.push(t[next].x, t[next].y, t[next].z);
      wallPos.push(t[i].x, t[i].y, t[i].z);
    }

    const wallGeom = new THREE.BufferGeometry();
    wallGeom.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
    wallGeom.computeVertexNormals();

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x334155, // Architectural slate
      roughness: 0.6,
      metalness: 0.2,
      side: THREE.DoubleSide
    });
    group.add(new THREE.Mesh(wallGeom, wallMat));

    // Structural Wireframe Edges
    const edgePos = [];
    // Base ring
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      edgePos.push(b[i].x, b[i].y, b[i].z);
      edgePos.push(b[next].x, b[next].y, b[next].z);
    }
    // Top ring
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      edgePos.push(t[i].x, t[i].y, t[i].z);
      edgePos.push(t[next].x, t[next].y, t[next].z);
    }
    // 4 Vertical corner pillars
    for (let i = 0; i < 4; i++) {
      edgePos.push(b[i].x, b[i].y, b[i].z);
      edgePos.push(t[i].x, t[i].y, t[i].z);
    }

    const edgeGeom = new THREE.BufferGeometry();
    edgeGeom.setAttribute('position', new THREE.Float32BufferAttribute(edgePos, 3));
    const edgeMat = new THREE.LineSegments(edgeGeom, new THREE.LineBasicMaterial({
      color: 0x94a3b8,
      linewidth: 2
    }));
    group.add(edgeMat);

    return group;
  }

  /**
   * MapLibre Render Callback: syncs Three.js projection matrix with MapLibre camera matrix
   */
  render(gl, matrix) {
    if (!this.engine || !this.map || !this.renderer) return;

    // Convert Vertiport Lat/Lng into MapLibre Mercator Coordinates
    const centerMercator = maplibregl.MercatorCoordinate.fromLngLat(
      { lng: this.engine.lng, lat: this.engine.lat },
      0
    );

    // Mercator coordinate meter scale factor at this latitude
    const meterScale = centerMercator.meterInMercatorCoordinateUnits();

    // Build transformation matrix for Three.js root object
    const transform = new THREE.Matrix4();
    transform.makeTranslation(centerMercator.x, centerMercator.y, centerMercator.z);

    // Scale from ENU meters to Mercator units (note: Y in WebGL is +Z in ENU or flipped Mercator)
    const scale = new THREE.Matrix4();
    scale.makeScale(meterScale, -meterScale, meterScale); // flip Y because Mercator Y goes downwards
    transform.multiply(scale);

    // Explicitly update and apply matrix and matrixWorld to root group
    this.rootGroup.matrix.copy(transform);
    this.rootGroup.matrixWorld.copy(transform);
    this.rootGroup.matrixWorldNeedsUpdate = true;
    this.rootGroup.updateMatrixWorld(true);

    // Update Three.js camera from MapLibre camera matrix
    this.camera.projectionMatrix.fromArray(matrix);
    if (this.camera.projectionMatrixInverse) {
      this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    }

    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.map.triggerRepaint();
  }
}

// Attach to window
window.ThreeMapLibreLayer = ThreeMapLibreLayer;
