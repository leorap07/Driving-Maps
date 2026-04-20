(function () {
  const STORAGE_KEY = "cdm:routes:standalone";
  const SNAP_RADIUS_PIXELS = 28;
  const SAME_ROAD_TRACE_MAX_PIXELS = 8;
  const GRAPH_ENDPOINT_STITCH_PIXELS = 10;
  const ROUTER_BASE_URL = "https://router.project-osrm.org";
  const ROUTER_PROFILE = "driving";
  const ROUTER_MAX_WAYPOINTS = 24;
  const ROUTER_REQUEST_TIMEOUT_MS = 12000;
  const COVERAGE_SEGMENT_MAX_KM = 0.8;
  const COVERAGE_MATCH_THRESHOLD_KM = 0.11;
  const COLORADO_CENTER = [-105.55, 39.0];
  const COLORADO_BOUNDS = [
    [-109.12, 36.92],
    [-102.02, 41.08],
  ];
  const COLORADO_MAX_BOUNDS = [
    [-109.18, 36.86],
    [-101.96, 41.16],
  ];
  const COLORADO_RING = [
    [-109.05, 36.99],
    [-102.04, 36.99],
    [-102.04, 41.0],
    [-109.05, 41.0],
    [-109.05, 36.99],
  ];

  const SAMPLE_BOUNDARY = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "Colorado" },
        geometry: {
          type: "Polygon",
          coordinates: [COLORADO_RING],
        },
      },
    ],
  };

  const defaultInfo = {
    title: "Colorado Drive Map",
    description:
      "Click the map to inspect elevation, import GPX or GeoJSON routes, or use the road planner to mark driven roads in purple.",
  };

  const state = {
    basemapMode: "topo",
    overlays: {
      roads: true,
      labels: true,
      hillshade: true,
      drivenRoutes: true,
    },
    routes: [],
    selectedRouteId: null,
    drawMode: false,
    drawDraft: createEmptyDrawDraft(),
    statewideRoadNetwork: null,
    roadCoverage: {
      ready: false,
      totalKm: 0,
      drivenKm: 0,
      percent: 0,
    },
  };

  const elements = {};
  let map = null;
  let mapReady = false;

  window.addEventListener("DOMContentLoaded", initApp);

  function initApp() {
    cacheElements();
    bindUi();

    state.routes = loadRoutes();
    if (state.routes.length) {
      state.selectedRouteId = state.routes[0].id;
    }

    renderRouteList();
    renderRouteStats();
    renderRoadCoverage();
    updateDrawModeUi();

    if (state.selectedRouteId) {
      const route = findRoute(state.selectedRouteId);
      if (route) {
        setInfo(route.name, buildRouteDescription(route));
      }
    } else {
      setInfo(defaultInfo.title, defaultInfo.description);
    }

    setCursorReadout(
      "Cursor: move across Colorado to inspect approximate elevation."
    );

    if (!window.maplibregl) {
      setStatus(
        "Map library failed to load. Make sure you are online, then refresh this page."
      );
      return;
    }

    initMap();
  }

  function cacheElements() {
    elements.map = document.getElementById("map");
    elements.mapStage = document.querySelector(".map-stage");
    elements.routeFile = document.getElementById("route-file");
    elements.routeList = document.getElementById("route-list");
    elements.routeCount = document.getElementById("route-count");
    elements.totalDistance = document.getElementById("total-distance");
    elements.infoTitle = document.getElementById("info-title");
    elements.infoDescription = document.getElementById("info-description");
    elements.cursorReadout = document.getElementById("cursor-readout");
    elements.mapStatus = document.getElementById("map-status");
    elements.basemapTopo = document.getElementById("basemap-topo");
    elements.basemapSatellite = document.getElementById("basemap-satellite");
    elements.toggleRoads = document.getElementById("toggle-roads");
    elements.toggleLabels = document.getElementById("toggle-labels");
    elements.toggleHillshade = document.getElementById("toggle-hillshade");
    elements.toggleDriven = document.getElementById("toggle-driven");
    elements.toggleDrawMode = document.getElementById("toggle-draw-mode");
    elements.finishDraw = document.getElementById("finish-draw");
    elements.clearDraw = document.getElementById("clear-draw");
    elements.drawModePill = document.getElementById("draw-mode-pill");
    elements.drawModeStatus = document.getElementById("draw-mode-status");
    elements.coveragePercent = document.getElementById("coverage-percent");
    elements.coverageFill = document.getElementById("coverage-fill");
    elements.coverageDistance = document.getElementById("coverage-distance");
    elements.coverageNote = document.getElementById("coverage-note");
  }

  function bindUi() {
    elements.basemapTopo.addEventListener("change", function () {
      if (!elements.basemapTopo.checked) return;
      state.basemapMode = "topo";
      syncMapVisibility();
    });

    elements.basemapSatellite.addEventListener("change", function () {
      if (!elements.basemapSatellite.checked) return;
      state.basemapMode = "satellite";
      syncMapVisibility();
    });

    elements.toggleRoads.addEventListener("change", function () {
      state.overlays.roads = elements.toggleRoads.checked;
      syncMapVisibility();
    });

    elements.toggleLabels.addEventListener("change", function () {
      state.overlays.labels = elements.toggleLabels.checked;
      syncMapVisibility();
    });

    elements.toggleHillshade.addEventListener("change", function () {
      state.overlays.hillshade = elements.toggleHillshade.checked;
      syncMapVisibility();
    });

    elements.toggleDriven.addEventListener("change", function () {
      state.overlays.drivenRoutes = elements.toggleDriven.checked;
      syncMapVisibility();
    });

    elements.routeFile.addEventListener("change", handleRouteImport);
    elements.toggleDrawMode.addEventListener("click", toggleDrawMode);
    elements.finishDraw.addEventListener("click", finishDrawDraft);
    elements.clearDraw.addEventListener("click", clearDrawDraft);
  }

  function initMap() {
    setStatus("Loading Colorado map and terrain...");

    map = new maplibregl.Map({
      container: elements.map,
      style: buildMapStyle(),
      center: COLORADO_CENTER,
      zoom: 6.55,
      minZoom: 6.05,
      pitch: 48,
      bearing: -18,
      hash: true,
      antialias: true,
      renderWorldCopies: false,
      maxBounds: COLORADO_MAX_BOUNDS,
      maxPitch: 85,
    });

    configureMapMotion();
    map.fitBounds(COLORADO_BOUNDS, { padding: 38, duration: 0 });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 120, unit: "imperial" }),
      "bottom-right"
    );

    map.on("load", function () {
      mapReady = true;
      map.setTerrain({ source: "terrainDem", exaggeration: 1.72 });
      applySkyBackdrop();
      addStaticLayers();
      ensureRouteLayers();
      updateDrivenRoutesSource();
      updateDrawDraftSource();
      syncMapVisibility();
      bindMapInteractions();
      updateDrawModeUi();
      setStatus("Colorado map ready.");
      window.setTimeout(hideStatus, 1400);

      map.once("idle", function () {
        captureStatewideRoadNetwork(0);
      });
    });

    map.on("error", function (event) {
      console.error(event && event.error ? event.error : event);
      setStatus(
        "A map source failed to load. Check your internet connection or switch layers."
      );
    });
  }

  function configureMapMotion() {
    if (map.dragRotate && map.dragRotate.enable) {
      map.dragRotate.enable();
    }
    if (map.touchZoomRotate && map.touchZoomRotate.enableRotation) {
      map.touchZoomRotate.enableRotation();
    }
    if (map.scrollZoom && map.scrollZoom.setWheelZoomRate) {
      map.scrollZoom.setWheelZoomRate(1 / 800);
    }
    if (map.scrollZoom && map.scrollZoom.setZoomRate) {
      map.scrollZoom.setZoomRate(1 / 120);
    }
  }

  function buildMapStyle() {
    return {
      version: 8,
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        topoRaster: {
          type: "raster",
          tiles: ["https://tile.opentopomap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "OpenTopoMap, OpenStreetMap contributors",
        },
        satelliteRaster: {
          type: "raster",
          tiles: [
            "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          attribution: "Esri, Maxar, Earthstar Geographics",
        },
        osmVector: {
          type: "vector",
          tiles: ["https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf"],
          minzoom: 0,
          maxzoom: 14,
          attribution: "OpenStreetMap contributors",
        },
        terrainDem: {
          type: "raster-dem",
          tiles: [
            "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
          maxzoom: 14,
          encoding: "terrarium",
          attribution: "Mapzen Terrarium / AWS public dataset",
        },
      },
      layers: [
        {
          id: "map-background",
          type: "background",
          paint: {
            "background-color": "#eef2ea",
          },
        },
        {
          id: "topo-base",
          type: "raster",
          source: "topoRaster",
          layout: { visibility: "visible" },
          paint: {
            "raster-saturation": -0.48,
            "raster-contrast": 0.05,
            "raster-brightness-min": 0.04,
            "raster-brightness-max": 0.98,
          },
        },
        {
          id: "satellite-base",
          type: "raster",
          source: "satelliteRaster",
          layout: { visibility: "none" },
          paint: {
            "raster-saturation": -0.05,
            "raster-contrast": 0.12,
          },
        },
        {
          id: "hillshade",
          type: "hillshade",
          source: "terrainDem",
          layout: { visibility: "visible" },
          paint: {
            "hillshade-exaggeration": 0.62,
            "hillshade-highlight-color": "#ffffff",
            "hillshade-shadow-color": "#7c8694",
            "hillshade-accent-color": "#c1cad6",
          },
        },
        {
          id: "national-parks-fill",
          type: "fill",
          source: "osmVector",
          "source-layer": "park",
          filter: ["==", ["get", "class"], "national_park"],
          layout: { visibility: "visible" },
          paint: {
            "fill-color": "#4f8d5f",
            "fill-opacity": 0.06,
          },
        },
        {
          id: "national-parks-outline-casing",
          type: "line",
          source: "osmVector",
          "source-layer": "park",
          filter: ["==", ["get", "class"], "national_park"],
          layout: {
            visibility: "visible",
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "rgba(253, 248, 228, 0.9)",
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              5,
              1.4,
              8,
              2.4,
              12,
              4.2,
            ],
            "line-opacity": 0.9,
          },
        },
        {
          id: "roads-casing",
          type: "line",
          source: "osmVector",
          "source-layer": "transportation",
          layout: {
            visibility: "visible",
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": "#6f7a86",
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              5,
              1.2,
              9,
              2.3,
              13,
              5.2,
            ],
            "line-opacity": 0.94,
          },
        },
        {
          id: "roads",
          type: "line",
          source: "osmVector",
          "source-layer": "transportation",
          layout: {
            visibility: "visible",
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": [
              "match",
              ["get", "class"],
              "motorway",
              "#d7b14d",
              "trunk",
              "#dbc374",
              "primary",
              "#f7f3e8",
              "secondary",
              "#ffffff",
              "tertiary",
              "#f5f5f5",
              "#efefe9",
            ],
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              5,
              0.4,
              9,
              1.2,
              13,
              3.2,
            ],
            "line-opacity": 0.96,
          },
        },
        {
          id: "national-parks-outline",
          type: "line",
          source: "osmVector",
          "source-layer": "park",
          filter: ["==", ["get", "class"], "national_park"],
          layout: {
            visibility: "visible",
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#1f6b47",
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              5,
              0.9,
              8,
              1.5,
              12,
              2.6,
            ],
            "line-opacity": 0.96,
            "line-dasharray": [1.2, 0.5],
          },
        },
        {
          id: "place-labels",
          type: "symbol",
          source: "osmVector",
          "source-layer": "place",
          layout: {
            visibility: "visible",
            "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
            "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
            "text-size": [
              "interpolate",
              ["linear"],
              ["zoom"],
              6,
              11,
              10,
              13,
              13,
              16,
            ],
            "text-offset": [0, 0.2],
          },
          paint: {
            "text-color": "#2c3b4a",
            "text-halo-color": "#f8faf8",
            "text-halo-width": 1.35,
          },
        },
      ],
    };
  }

  function addStaticLayers() {
    map.addSource("colorado-boundary", {
      type: "geojson",
      data: SAMPLE_BOUNDARY,
    });

    map.addLayer({
      id: "co-boundary-line",
      type: "line",
      source: "colorado-boundary",
      paint: {
        "line-color": "#59b7ff",
        "line-width": 2.3,
      },
    });
  }

  function ensureRouteLayers() {
    if (!map.getSource("driven-routes")) {
      map.addSource("driven-routes", {
        type: "geojson",
        data: emptyFeatureCollection(),
      });

      map.addLayer({
        id: "driven-routes-line",
        type: "line",
        source: "driven-routes",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#b15cff",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            2.2,
            10,
            4.2,
            14,
            7.2,
          ],
          "line-opacity": 0.96,
        },
      });
    }

    if (!map.getSource("draw-draft")) {
      map.addSource("draw-draft", {
        type: "geojson",
        data: emptyFeatureCollection(),
      });

      map.addLayer({
        id: "draw-draft-line",
        type: "line",
        source: "draw-draft",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#f0b8ff",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            2.4,
            10,
            4.4,
            14,
            7.6,
          ],
          "line-opacity": 0.98,
          "line-dasharray": [0.8, 0.45],
        },
      });
    }

    if (!map.getSource("draw-anchor")) {
      map.addSource("draw-anchor", {
        type: "geojson",
        data: emptyFeatureCollection(),
      });

      map.addLayer({
        id: "draw-anchor-circle",
        type: "circle",
        source: "draw-anchor",
        paint: {
          "circle-radius": 6,
          "circle-color": "#f9ddff",
          "circle-stroke-color": "#7f2dff",
          "circle-stroke-width": 2,
        },
      });
    }
  }

  function bindMapInteractions() {
    map.on("click", "driven-routes-line", function (event) {
      if (state.drawMode) return;
      const feature = event.features && event.features[0];
      if (!feature || !feature.properties || !feature.properties.routeId) return;
      focusRoute(String(feature.properties.routeId), true);
    });

    map.on("mouseenter", "driven-routes-line", function () {
      if (state.drawMode) {
        map.getCanvas().style.cursor = "crosshair";
        return;
      }
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", "driven-routes-line", function () {
      map.getCanvas().style.cursor = state.drawMode ? "crosshair" : "";
    });

    map.on("click", function (event) {
      if (state.drawMode) {
        handleDrawClick(event);
        return;
      }

      const routeFeatures = map.queryRenderedFeatures(event.point, {
        layers: ["driven-routes-line"],
      });

      if (routeFeatures.length > 0) {
        return;
      }

      const elevation = safeTerrainElevation(event.lngLat);
      const description = elevation
        ? "Approx elevation: " + Math.round(elevation * 3.28084) + " ft."
        : "Elevation unavailable at this zoom level or location.";

      setInfo(
        "Point " +
          event.lngLat.lat.toFixed(4) +
          ", " +
          event.lngLat.lng.toFixed(4),
        description
      );
    });

    map.on("mousemove", function (event) {
      const elevation = safeTerrainElevation(event.lngLat);
      const suffix = elevation
        ? " • Elevation ~" + Math.round(elevation * 3.28084) + " ft"
        : "";

      setCursorReadout(
        "Cursor: " +
          event.lngLat.lat.toFixed(3) +
          ", " +
          event.lngLat.lng.toFixed(3) +
          suffix
      );
    });
  }

  function syncMapVisibility() {
    if (!mapReady) return;

    setLayerVisibility("map-background", true);
    setLayerVisibility("topo-base", state.basemapMode === "topo");
    setLayerVisibility("satellite-base", state.basemapMode === "satellite");
    setLayerVisibility("hillshade", state.overlays.hillshade);
    setLayerVisibility("national-parks-fill", true);
    setLayerVisibility("national-parks-outline-casing", true);
    setLayerVisibility("roads-casing", state.overlays.roads);
    setLayerVisibility("roads", state.overlays.roads);
    setLayerVisibility("national-parks-outline", true);
    setLayerVisibility("place-labels", state.overlays.labels);
    setLayerVisibility("driven-routes-line", state.overlays.drivenRoutes);
    setLayerVisibility(
      "draw-draft-line",
      state.drawDraft.coordinates.length > 1
    );
    setLayerVisibility(
      "draw-anchor-circle",
      Boolean(state.drawDraft.start) || Boolean(state.drawDraft.end)
    );
  }

  function setLayerVisibility(layerId, isVisible) {
    if (!map.getLayer(layerId)) return;
    map.setLayoutProperty(layerId, "visibility", isVisible ? "visible" : "none");
  }

  function toggleDrawMode() {
    state.drawMode = !state.drawMode;
    updateDrawModeUi();

    if (state.drawMode) {
      setStatus("Road pen enabled. Click a start point on the map.");
    } else {
      setStatus("Road pen paused.");
      window.setTimeout(hideStatus, 1100);
    }
  }

  function updateDrawModeUi() {
    const hasDraft =
      state.drawDraft.rawWaypoints.length > 0 ||
      state.drawDraft.coordinates.length > 1;

    elements.drawModePill.textContent = state.drawMode ? "Live" : "Off";
    elements.drawModePill.classList.toggle("is-live", state.drawMode);
    elements.toggleDrawMode.textContent = state.drawMode ? "Pause pen" : "Enable pen";
    elements.finishDraw.disabled =
      state.drawDraft.isRouting || state.drawDraft.coordinates.length < 2;
    elements.clearDraw.disabled = state.drawDraft.isRouting || !hasDraft;

    if (state.drawMode) {
      if (state.drawDraft.isRouting) {
        elements.drawModeStatus.textContent =
          "Routing the draft along Colorado roads...";
      } else if (!state.drawDraft.rawWaypoints.length) {
        elements.drawModeStatus.textContent =
          "Road pen is live. Click a start point on the map.";
      } else if (state.drawDraft.rawWaypoints.length === 1) {
        elements.drawModeStatus.textContent =
          "First stop set. Click another point to route the draft.";
      } else {
        elements.drawModeStatus.textContent =
          "Draft ready. Click another point to add a stop, save this route, or clear it.";
      }
    } else if (hasDraft) {
      elements.drawModeStatus.textContent =
        "Draft paused. Save this route or clear the draft.";
    } else {
      elements.drawModeStatus.textContent =
        "Enable the pen, click a start point, then keep clicking to add routed stops.";
    }

    if (mapReady) {
      if (map.doubleClickZoom) {
        if (state.drawMode) {
          map.doubleClickZoom.disable();
        } else {
          map.doubleClickZoom.enable();
        }
      }

      map.getCanvas().style.cursor = state.drawMode ? "crosshair" : "";
      elements.mapStage.classList.toggle("is-drawing", state.drawMode);
      syncMapVisibility();
    }
  }

  async function handleDrawClick(event) {
    if (state.drawDraft.isRouting) {
      setStatus("Routing the current draft...");
      return;
    }

    const clickCoord = [event.lngLat.lng, event.lngLat.lat];
    try {
      if (!state.drawDraft.rawWaypoints.length) {
        await setFirstDrawWaypoint(clickCoord, event.point);
        return;
      }

      await extendDrawDraftWithWaypoint(clickCoord, event.point);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The route draft could not be updated.";
      setInfo("Road planner issue", message);
      setStatus(message);
    }
  }

  function finishDrawDraft() {
    if (state.drawDraft.coordinates.length < 2) return;

    const finishedCoordinates = dedupeSequentialCoordinates(state.drawDraft.coordinates);
    const routeName = "Road Pen " + formatDate(new Date().toISOString());
    const route = buildImportedRoute(routeName, "drawn", {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: routeName },
          geometry: {
            type: "LineString",
            coordinates: finishedCoordinates,
          },
        },
      ],
    });

    state.routes.unshift(route);
    state.selectedRouteId = route.id;
    saveRoutes(state.routes);
    renderRouteList();
    renderRouteStats();
    updateDrivenRoutesSource();
    updateRoadCoverageStats();
    clearDrawDraft(false);
    focusRoute(route.id, false);
    setStatus("Saved the draft route to Driven Routes.");
    window.setTimeout(hideStatus, 1400);
  }

  function clearDrawDraft(shouldHideStatus) {
    state.drawDraft = createEmptyDrawDraft();
    updateDrawDraftSource();
    updateDrawModeUi();

    if (shouldHideStatus !== false) {
      setStatus("Draft cleared.");
      window.setTimeout(hideStatus, 1000);
    }
  }

  function updateDrivenRoutesSource() {
    if (!mapReady) return;

    const source = map.getSource("driven-routes");
    if (!source) return;
    source.setData(buildDrivenRoutesCollection(state.routes));
  }

  function updateDrawDraftSource() {
    if (!mapReady) return;

    const draftSource = map.getSource("draw-draft");
    const anchorSource = map.getSource("draw-anchor");
    if (draftSource) {
      if (state.drawDraft.coordinates.length > 1) {
        draftSource.setData({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { name: "Road Pen Draft" },
              geometry: {
                type: "LineString",
                coordinates: state.drawDraft.coordinates,
              },
            },
          ],
        });
      } else {
        draftSource.setData(emptyFeatureCollection());
      }
    }

    if (anchorSource) {
      const pointFeatures = [];
      const stopCoords = state.drawDraft.snappedWaypoints.length
        ? state.drawDraft.snappedWaypoints
        : [state.drawDraft.start, state.drawDraft.end].filter(Boolean);

      stopCoords.forEach(function (coord, index) {
        const isFirst = index === 0;
        const isLast = index === stopCoords.length - 1;
        pointFeatures.push({
          type: "Feature",
          properties: {
            name: isFirst
              ? "Road Pen Start"
              : isLast
              ? "Road Pen End"
              : "Road Pen Stop " + (index + 1),
          },
          geometry: {
            type: "Point",
            coordinates: coord,
          },
        });
      });

      if (pointFeatures.length) {
        anchorSource.setData({
          type: "FeatureCollection",
          features: pointFeatures,
        });
      } else {
        anchorSource.setData(emptyFeatureCollection());
      }
    }

    syncMapVisibility();
  }

  function buildDrivenRoutesCollection(routes) {
    const features = [];

    routes.forEach(function (route) {
      route.featureCollection.features.forEach(function (feature) {
        if (!feature.geometry) return;
        if (
          feature.geometry.type !== "LineString" &&
          feature.geometry.type !== "MultiLineString"
        ) {
          return;
        }

        features.push({
          type: "Feature",
          geometry: feature.geometry,
          properties: Object.assign({}, feature.properties || {}, {
            routeId: route.id,
            routeName: route.name,
            sourceType: route.sourceType,
            importedAt: route.importedAt,
            distanceKm: route.distanceKm,
          }),
        });
      });
    });

    return {
      type: "FeatureCollection",
      features: features,
    };
  }

  function captureStatewideRoadNetwork(attempt) {
    if (!mapReady) return;

    const canvas = map.getCanvas();
    const features = map.queryRenderedFeatures(
      [
        [0, 0],
        [canvas.width, canvas.height],
      ],
      { layers: ["roads"] }
    );
    const lines = extractRoadLines(features);

    if (!lines.length) {
      if (attempt < 4) {
        window.setTimeout(function () {
          captureStatewideRoadNetwork(attempt + 1);
        }, 600);
      } else {
        state.statewideRoadNetwork = { failed: true, totalKm: 0 };
        renderRoadCoverage();
      }
      return;
    }

    const coverageSegments = buildCoverageSegments(lines, COVERAGE_SEGMENT_MAX_KM);
    const totalKm = coverageSegments.reduce(function (sum, segment) {
      return sum + segment.lengthKm;
    }, 0);

    state.statewideRoadNetwork = {
      lines: lines,
      coverageSegments: coverageSegments,
      totalKm: totalKm,
    };

    updateRoadCoverageStats();
  }

  function buildRoadGraphFromViewport() {
    if (!mapReady) return null;

    const canvas = map.getCanvas();
    const features = map.queryRenderedFeatures(
      [
        [0, 0],
        [canvas.width, canvas.height],
      ],
      { layers: ["roads"] }
    );
    const lines = extractRoadLines(features);
    if (!lines.length) return null;

    return buildRoadGraph(lines);
  }

  function extractRoadLines(features) {
    const unique = new Map();

    features.forEach(function (feature) {
      if (!feature || !feature.geometry) return;

      if (feature.geometry.type === "LineString") {
        addLine(feature.geometry.coordinates);
      } else if (feature.geometry.type === "MultiLineString") {
        feature.geometry.coordinates.forEach(addLine);
      }
    });

    return Array.from(unique.values());

    function addLine(line) {
      const cleanLine = sanitizeLine(line);
      if (cleanLine.length < 2) return;
      const key = hashLine(cleanLine);
      if (!unique.has(key)) {
        unique.set(key, cleanLine);
      }
    }
  }

  function buildRoadGraph(lines) {
    const nodes = new Map();
    const adjacency = new Map();
    const segments = [];
    const seenEdges = new Set();
    const endpoints = [];

    lines.forEach(function (line) {
      if (line.length >= 2) {
        endpoints.push({
          key: nodeKey(line[0]),
          coord: line[0],
          point: map.project({ lng: line[0][0], lat: line[0][1] }),
        });
        endpoints.push({
          key: nodeKey(line[line.length - 1]),
          coord: line[line.length - 1],
          point: map.project({
            lng: line[line.length - 1][0],
            lat: line[line.length - 1][1],
          }),
        });
      }

      for (let index = 1; index < line.length; index += 1) {
        const a = line[index - 1];
        const b = line[index];
        const lengthKm = haversine(a, b);
        if (!lengthKm) continue;

        const aKey = nodeKey(a);
        const bKey = nodeKey(b);
        const edgeKey = aKey < bKey ? aKey + "|" + bKey : bKey + "|" + aKey;

        if (!nodes.has(aKey)) {
          nodes.set(aKey, a);
        }
        if (!nodes.has(bKey)) {
          nodes.set(bKey, b);
        }

        if (seenEdges.has(edgeKey)) continue;
        seenEdges.add(edgeKey);

        addGraphEdge(adjacency, aKey, bKey, lengthKm);
        addGraphEdge(adjacency, bKey, aKey, lengthKm);

        segments.push({
          id: "segment-" + segments.length,
          a: a,
          b: b,
          aKey: aKey,
          bKey: bKey,
          lengthKm: lengthKm,
          aPoint: map.project({ lng: a[0], lat: a[1] }),
          bPoint: map.project({ lng: b[0], lat: b[1] }),
        });
      }
    });

    stitchNearbyGraphEndpoints(adjacency, endpoints, GRAPH_ENDPOINT_STITCH_PIXELS);

    return {
      nodes: nodes,
      adjacency: adjacency,
      segments: segments,
    };
  }

  function stitchNearbyGraphEndpoints(adjacency, endpoints, maxPixelDistance) {
    if (!endpoints.length) return;

    const bucketSize = Math.max(1, maxPixelDistance);
    const buckets = new Map();
    const linkedPairs = new Set();

    endpoints.forEach(function (endpoint) {
      const bucketX = Math.floor(endpoint.point.x / bucketSize);
      const bucketY = Math.floor(endpoint.point.y / bucketSize);

      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          const bucketKey = bucketX + dx + ":" + (bucketY + dy);
          const bucket = buckets.get(bucketKey);
          if (!bucket) continue;

          bucket.forEach(function (other) {
            if (endpoint.key === other.key) return;

            const pairKey =
              endpoint.key < other.key
                ? endpoint.key + "|" + other.key
                : other.key + "|" + endpoint.key;

            if (linkedPairs.has(pairKey)) return;

            const pixelDistance = Math.hypot(
              endpoint.point.x - other.point.x,
              endpoint.point.y - other.point.y
            );

            if (pixelDistance > maxPixelDistance) return;

            linkedPairs.add(pairKey);

            const distanceKm = haversine(endpoint.coord, other.coord) || 0.001;
            addGraphEdge(adjacency, endpoint.key, other.key, distanceKm);
            addGraphEdge(adjacency, other.key, endpoint.key, distanceKm);
          });
        }
      }

      const currentBucketKey = bucketX + ":" + bucketY;
      if (!buckets.has(currentBucketKey)) {
        buckets.set(currentBucketKey, []);
      }
      buckets.get(currentBucketKey).push(endpoint);
    });
  }

  function snapToRoadGraph(graph, coord, point, maxPixelDistance) {
    const targetPoint =
      point ||
      map.project({
        lng: coord[0],
        lat: coord[1],
      });
    const maxDistance =
      typeof maxPixelDistance === "number" ? maxPixelDistance : SNAP_RADIUS_PIXELS;

    let best = null;

    graph.segments.forEach(function (segment) {
      const projected = projectPointToSegment(targetPoint, segment.aPoint, segment.bPoint);
      if (best && projected.distance >= best.pixelDistance) return;

      best = {
        pixelDistance: projected.distance,
        segment: segment,
        t: projected.t,
        coord: interpolateCoordinate(segment.a, segment.b, projected.t),
      };
    });

    if (!best || best.pixelDistance > maxDistance) {
      return null;
    }

    return {
      coord: best.coord,
      segmentId: best.segment.id,
      aKey: best.segment.aKey,
      bKey: best.segment.bKey,
      lengthKm: best.segment.lengthKm,
      t: best.t,
    };
  }

  function findPathBetweenSnaps(graph, startSnap, endSnap) {
    if (!startSnap || !endSnap) return null;

    if (startSnap.segmentId === endSnap.segmentId) {
      return dedupeSequentialCoordinates([startSnap.coord, endSnap.coord]);
    }

    const workingNodes = new Map(graph.nodes);
    const workingAdjacency = cloneAdjacency(graph.adjacency);
    const startKey = attachSnapNode(workingNodes, workingAdjacency, startSnap, "__start__");
    const endKey = attachSnapNode(workingNodes, workingAdjacency, endSnap, "__end__");

    if (startKey === endKey) {
      return dedupeSequentialCoordinates([startSnap.coord, endSnap.coord]);
    }

    const keyPath = runDijkstra(workingAdjacency, startKey, endKey);
    if (!keyPath) return null;

    const coordPath = keyPath
      .map(function (key) {
        return workingNodes.get(key);
      })
      .filter(Boolean);

    if (!coordPath.length) return null;
    coordPath[0] = startSnap.coord;
    coordPath[coordPath.length - 1] = endSnap.coord;
    return dedupeSequentialCoordinates(coordPath);
  }

  function attachSnapNode(nodes, adjacency, snap, tempKey) {
    if (snap.t <= 0.02) return snap.aKey;
    if (snap.t >= 0.98) return snap.bKey;

    nodes.set(tempKey, snap.coord);
    addGraphEdge(adjacency, tempKey, snap.aKey, snap.lengthKm * snap.t);
    addGraphEdge(adjacency, tempKey, snap.bKey, snap.lengthKm * (1 - snap.t));
    addGraphEdge(adjacency, snap.aKey, tempKey, snap.lengthKm * snap.t);
    addGraphEdge(adjacency, snap.bKey, tempKey, snap.lengthKm * (1 - snap.t));
    return tempKey;
  }

  function runDijkstra(adjacency, startKey, endKey) {
    const queue = [{ key: startKey, distance: 0 }];
    const distances = new Map([[startKey, 0]]);
    const previous = new Map();

    while (queue.length) {
      queue.sort(function (a, b) {
        return a.distance - b.distance;
      });

      const current = queue.shift();
      if (!current) break;

      if (current.key === endKey) {
        return reconstructPath(previous, endKey);
      }

      if (
        current.distance >
        (distances.has(current.key) ? distances.get(current.key) : Infinity)
      ) {
        continue;
      }

      const neighbors = adjacency.get(current.key) || [];
      neighbors.forEach(function (neighbor) {
        const nextDistance = current.distance + neighbor.distance;
        if (
          nextDistance >=
          (distances.has(neighbor.key) ? distances.get(neighbor.key) : Infinity)
        ) {
          return;
        }

        distances.set(neighbor.key, nextDistance);
        previous.set(neighbor.key, current.key);
        queue.push({ key: neighbor.key, distance: nextDistance });
      });
    }

    return null;
  }

  function reconstructPath(previous, endKey) {
    const path = [endKey];
    let current = endKey;

    while (previous.has(current)) {
      current = previous.get(current);
      path.unshift(current);
    }

    return path;
  }

  function addGraphEdge(adjacency, fromKey, toKey, distance) {
    if (!adjacency.has(fromKey)) {
      adjacency.set(fromKey, []);
    }
    adjacency.get(fromKey).push({ key: toKey, distance: distance });
  }

  function cloneAdjacency(adjacency) {
    const copy = new Map();
    adjacency.forEach(function (edges, key) {
      copy.set(key, edges.slice());
    });
    return copy;
  }

  function projectPointToSegment(point, aPoint, bPoint) {
    const dx = bPoint.x - aPoint.x;
    const dy = bPoint.y - aPoint.y;
    const lengthSquared = dx * dx + dy * dy;

    if (!lengthSquared) {
      const distance = Math.hypot(point.x - aPoint.x, point.y - aPoint.y);
      return {
        t: 0,
        distance: distance,
      };
    }

    const t = clamp(
      ((point.x - aPoint.x) * dx + (point.y - aPoint.y) * dy) / lengthSquared,
      0,
      1
    );
    const projectedX = aPoint.x + dx * t;
    const projectedY = aPoint.y + dy * t;

    return {
      t: t,
      distance: Math.hypot(point.x - projectedX, point.y - projectedY),
    };
  }

  function updateRoadCoverageStats() {
    if (!state.statewideRoadNetwork || !state.statewideRoadNetwork.totalKm) {
      state.roadCoverage = {
        ready: false,
        totalKm: 0,
        drivenKm: 0,
        percent: 0,
      };
      renderRoadCoverage();
      return;
    }

    const routeSegments = buildRouteSegments(state.routes);
    let drivenKm = 0;

    state.statewideRoadNetwork.coverageSegments.forEach(function (roadSegment) {
      if (isRoadSegmentCovered(roadSegment, routeSegments)) {
        drivenKm += roadSegment.lengthKm;
      }
    });

    state.roadCoverage = {
      ready: true,
      totalKm: state.statewideRoadNetwork.totalKm,
      drivenKm: drivenKm,
      percent: state.statewideRoadNetwork.totalKm
        ? (drivenKm / state.statewideRoadNetwork.totalKm) * 100
        : 0,
    };

    renderRoadCoverage();
  }

  function isRoadSegmentCovered(roadSegment, routeSegments) {
    const midpoint = interpolateCoordinate(roadSegment.a, roadSegment.b, 0.5);
    const thresholdDegreesLat = COVERAGE_MATCH_THRESHOLD_KM / 110.574;
    const thresholdDegreesLon =
      COVERAGE_MATCH_THRESHOLD_KM /
      Math.max(1, 111.32 * Math.cos((midpoint[1] * Math.PI) / 180));

    for (let index = 0; index < routeSegments.length; index += 1) {
      const routeSegment = routeSegments[index];
      if (
        midpoint[0] < routeSegment.minLng - thresholdDegreesLon ||
        midpoint[0] > routeSegment.maxLng + thresholdDegreesLon ||
        midpoint[1] < routeSegment.minLat - thresholdDegreesLat ||
        midpoint[1] > routeSegment.maxLat + thresholdDegreesLat
      ) {
        continue;
      }

      if (
        pointToSegmentDistanceKm(midpoint, routeSegment.a, routeSegment.b) <=
        COVERAGE_MATCH_THRESHOLD_KM
      ) {
        return true;
      }
    }

    return false;
  }

  function buildCoverageSegments(lines, maxKm) {
    const segments = [];

    lines.forEach(function (line) {
      for (let index = 1; index < line.length; index += 1) {
        const a = line[index - 1];
        const b = line[index];
        const lengthKm = haversine(a, b);
        if (!lengthKm) continue;

        const pieces = Math.max(1, Math.ceil(lengthKm / maxKm));
        for (let piece = 0; piece < pieces; piece += 1) {
          const start = interpolateCoordinate(a, b, piece / pieces);
          const end = interpolateCoordinate(a, b, (piece + 1) / pieces);
          segments.push({
            a: start,
            b: end,
            lengthKm: haversine(start, end),
          });
        }
      }
    });

    return segments;
  }

  function buildRouteSegments(routes) {
    const segments = [];

    routes.forEach(function (route) {
      route.featureCollection.features.forEach(function (feature) {
        if (!feature.geometry) return;

        if (feature.geometry.type === "LineString") {
          pushLineSegments(feature.geometry.coordinates);
        } else if (feature.geometry.type === "MultiLineString") {
          feature.geometry.coordinates.forEach(pushLineSegments);
        }
      });
    });

    return segments;

    function pushLineSegments(line) {
      for (let index = 1; index < line.length; index += 1) {
        const a = line[index - 1];
        const b = line[index];
        segments.push({
          a: a,
          b: b,
          minLng: Math.min(a[0], b[0]),
          maxLng: Math.max(a[0], b[0]),
          minLat: Math.min(a[1], b[1]),
          maxLat: Math.max(a[1], b[1]),
        });
      }
    }
  }

  async function handleRouteImport(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    setStatus("Importing " + file.name + "...");

    try {
      const route = await parseRouteFile(file);
      state.routes.unshift(route);
      state.selectedRouteId = route.id;
      saveRoutes(state.routes);
      renderRouteList();
      renderRouteStats();
      updateDrivenRoutesSource();
      updateRoadCoverageStats();
      syncMapVisibility();
      focusRoute(route.id, true);
      setStatus("Imported " + route.name + ".");
      window.setTimeout(hideStatus, 1400);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown import error.";
      setInfo("Import error", message);
      setStatus(message);
    } finally {
      event.target.value = "";
    }
  }

  function parseRouteFile(file) {
    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith(".gpx")) {
      return file.text().then(function (text) {
        const parsed = parseGpxText(text, stripExtension(file.name));
        const normalized = flattenToLineFeatures(parsed.featureCollection);
        return buildImportedRoute(
          parsed.name || stripExtension(file.name),
          "gpx",
          normalized
        );
      });
    }

    if (lowerName.endsWith(".geojson") || lowerName.endsWith(".json")) {
      return file.text().then(function (text) {
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (_error) {
          throw new Error("GeoJSON file could not be parsed.");
        }

        const normalized = flattenToLineFeatures(normalizeGeoJson(parsed));
        const routeName = deriveGeoJsonName(normalized, stripExtension(file.name));
        return buildImportedRoute(routeName, "geojson", normalized);
      });
    }

    return Promise.reject(
      new Error("Unsupported file type. Use GPX or GeoJSON.")
    );
  }

  function buildImportedRoute(name, sourceType, featureCollection) {
    if (!featureCollection.features.length) {
      throw new Error("No line features found in that file.");
    }

    return {
      id: toId(),
      name: name || "Imported route",
      sourceType: normalizeSourceType(sourceType),
      featureCollection: featureCollection,
      distanceKm: estimateDistanceKm(featureCollection),
      importedAt: new Date().toISOString(),
    };
  }

  function loadRoutes() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      const cleanedRoutes = parsed
        .map(normalizeStoredRoute)
        .filter(Boolean)
        .filter(function (route) {
          return route.id !== "sample-route" && route.sourceType !== "sample";
        });

      if (cleanedRoutes.length !== parsed.length) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanedRoutes));
      }

      return cleanedRoutes;
    } catch (_error) {
      return [];
    }
  }

  function normalizeStoredRoute(route) {
    if (!route || typeof route !== "object") return null;

    try {
      const featureCollection = flattenToLineFeatures(
        normalizeGeoJson(route.featureCollection)
      );
      if (!featureCollection.features.length) return null;

      return {
        id: typeof route.id === "string" ? route.id : toId(),
        name:
          typeof route.name === "string" && route.name.trim()
            ? route.name.trim()
            : "Imported route",
        sourceType: normalizeSourceType(route.sourceType),
        featureCollection: featureCollection,
        distanceKm: Number.isFinite(route.distanceKm)
          ? Number(route.distanceKm)
          : estimateDistanceKm(featureCollection),
        importedAt:
          typeof route.importedAt === "string"
            ? route.importedAt
            : new Date().toISOString(),
      };
    } catch (_error) {
      return null;
    }
  }

  function normalizeSourceType(sourceType) {
    if (
      sourceType === "gpx" ||
      sourceType === "geojson" ||
      sourceType === "drawn"
    ) {
      return sourceType;
    }

    return "geojson";
  }

  function saveRoutes(routes) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
    } catch (_error) {
      setStatus("Could not save routes to local storage in this browser.");
    }
  }

  function deleteRoute(routeId) {
    const route = findRoute(routeId);
    if (!route) return;

    state.routes = state.routes.filter(function (item) {
      return item.id !== routeId;
    });

    if (state.selectedRouteId === routeId) {
      state.selectedRouteId = state.routes.length ? state.routes[0].id : null;
    }

    saveRoutes(state.routes);
    renderRouteList();
    renderRouteStats();
    updateDrivenRoutesSource();
    updateRoadCoverageStats();

    if (state.selectedRouteId) {
      const selectedRoute = findRoute(state.selectedRouteId);
      if (selectedRoute) {
        setInfo(selectedRoute.name, buildRouteDescription(selectedRoute));
      } else {
        setInfo(defaultInfo.title, defaultInfo.description);
      }
    } else {
      setInfo(defaultInfo.title, defaultInfo.description);
    }

    setStatus("Deleted " + route.name + ".");
    window.setTimeout(hideStatus, 1200);
  }

  function renderRouteList() {
    elements.routeList.innerHTML = "";

    if (!state.routes.length) {
      const empty = document.createElement("li");
      empty.className = "route-empty";
      empty.textContent = "No routes imported yet.";
      elements.routeList.appendChild(empty);
      return;
    }

    state.routes.forEach(function (route) {
      const item = document.createElement("li");
      const row = document.createElement("div");
      const button = document.createElement("button");
      const deleteButton = document.createElement("button");
      const name = document.createElement("span");
      const meta = document.createElement("span");

      item.className = "route-item";
      row.className = "route-row";

      button.type = "button";
      button.className =
        "route-button" +
        (route.id === state.selectedRouteId ? " is-active" : "");
      button.addEventListener("click", function () {
        focusRoute(route.id, true);
      });

      name.className = "route-name";
      name.textContent = route.name;

      meta.className = "route-meta";
      meta.textContent =
        prettySource(route.sourceType) +
        " • " +
        formatDistance(route.distanceKm) +
        " • " +
        formatDate(route.importedAt);

      deleteButton.type = "button";
      deleteButton.className = "route-delete";
      deleteButton.setAttribute("aria-label", "Delete " + route.name);
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", function () {
        deleteRoute(route.id);
      });

      button.appendChild(name);
      button.appendChild(meta);
      row.appendChild(button);
      row.appendChild(deleteButton);
      item.appendChild(row);
      elements.routeList.appendChild(item);
    });
  }

  function applySkyBackdrop() {
    if (!map || typeof map.setSky !== "function") return;

    map.setSky({
      "sky-color": "#8dc4f3",
      "horizon-color": "#f9f1d8",
      "fog-color": "#d7ebff",
      "fog-ground-blend": 0.18,
      "horizon-fog-blend": 0.42,
      "sky-horizon-blend": 0.72,
      "atmosphere-blend": [
        "interpolate",
        ["linear"],
        ["zoom"],
        0,
        1,
        7,
        1,
        12,
        0.45,
      ],
    });
  }

  function renderRouteStats() {
    const totalDistance = state.routes.reduce(function (sum, route) {
      return sum + Number(route.distanceKm || 0);
    }, 0);

    elements.routeCount.textContent = String(state.routes.length);
    elements.totalDistance.textContent = formatDistance(totalDistance);
  }

  function renderRoadCoverage() {
    if (!state.roadCoverage.ready) {
      elements.coveragePercent.textContent = "--%";
      elements.coverageFill.style.width = "0%";
      elements.coverageDistance.textContent = "0.0 / 0.0 km";
      elements.coverageNote.textContent =
        state.statewideRoadNetwork && state.statewideRoadNetwork.failed
          ? "Coverage baseline could not be built from the current road tiles."
          : state.statewideRoadNetwork
          ? "Coverage baseline unavailable right now."
          : "Calculating a Colorado-wide road baseline from the loaded map tiles.";
      return;
    }

    const percent = clamp(state.roadCoverage.percent, 0, 100);
    elements.coveragePercent.textContent = percent.toFixed(1) + "%";
    elements.coverageFill.style.width = percent.toFixed(2) + "%";
    elements.coverageDistance.textContent =
      formatDistance(state.roadCoverage.drivenKm) +
      " / " +
      formatDistance(state.roadCoverage.totalKm);
    elements.coverageNote.textContent =
      "Approximate coverage based on Colorado roads visible in the statewide map view.";
  }

  function focusRoute(routeId, shouldFitBounds) {
    const route = findRoute(routeId);
    if (!route) return;

    state.selectedRouteId = route.id;
    renderRouteList();
    setInfo(route.name, buildRouteDescription(route));

    if (shouldFitBounds) {
      fitRouteToMap(route);
    }
  }

  function fitRouteToMap(route) {
    if (!mapReady) return;

    const bounds = getFeatureCollectionBounds(route.featureCollection);
    if (!bounds) return;

    map.fitBounds(bounds, {
      padding: 72,
      duration: 950,
      maxZoom: 12.8,
    });
  }

  function findRoute(routeId) {
    return state.routes.find(function (route) {
      return route.id === routeId;
    });
  }

  function parseGpxText(text, fallbackName) {
    const xml = new DOMParser().parseFromString(text, "application/xml");
    if (xml.getElementsByTagName("parsererror").length > 0) {
      throw new Error("GPX file could not be parsed.");
    }

    const features = [];
    let bestName = fallbackName;

    const trackNodes = Array.from(xml.getElementsByTagNameNS("*", "trk"));
    trackNodes.forEach(function (track, trackIndex) {
      const trackName =
        childText(track, "name") || bestName || "Track " + (trackIndex + 1);
      const segmentNodes = Array.from(track.getElementsByTagNameNS("*", "trkseg"));
      const segments = segmentNodes
        .map(function (segment) {
          return extractPoints(segment.getElementsByTagNameNS("*", "trkpt"));
        })
        .filter(function (segment) {
          return segment.length > 1;
        });

      if (!segments.length) return;
      bestName = bestName || trackName;

      features.push({
        type: "Feature",
        properties: { name: trackName },
        geometry:
          segments.length === 1
            ? { type: "LineString", coordinates: segments[0] }
            : { type: "MultiLineString", coordinates: segments },
      });
    });

    const routeNodes = Array.from(xml.getElementsByTagNameNS("*", "rte"));
    routeNodes.forEach(function (routeNode, routeIndex) {
      const routeName =
        childText(routeNode, "name") || bestName || "Route " + (routeIndex + 1);
      const points = extractPoints(routeNode.getElementsByTagNameNS("*", "rtept"));
      if (points.length < 2) return;
      bestName = bestName || routeName;

      features.push({
        type: "Feature",
        properties: { name: routeName },
        geometry: { type: "LineString", coordinates: points },
      });
    });

    if (!features.length) {
      throw new Error("No track or route geometry was found in that GPX file.");
    }

    return {
      name: bestName || fallbackName || "Imported GPX Route",
      featureCollection: {
        type: "FeatureCollection",
        features: features,
      },
    };
  }

  function normalizeGeoJson(value) {
    if (!value || typeof value !== "object") {
      throw new Error("GeoJSON file is empty or invalid.");
    }

    if (value.type === "FeatureCollection" && Array.isArray(value.features)) {
      return value;
    }

    if (value.type === "Feature") {
      return {
        type: "FeatureCollection",
        features: [value],
      };
    }

    if (value.type === "LineString" || value.type === "MultiLineString") {
      return {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: value,
          },
        ],
      };
    }

    throw new Error(
      "GeoJSON must contain a line FeatureCollection, Feature, or geometry."
    );
  }

  function flattenToLineFeatures(collection) {
    const features = (collection.features || []).filter(function (feature) {
      return (
        feature &&
        feature.geometry &&
        (feature.geometry.type === "LineString" ||
          feature.geometry.type === "MultiLineString")
      );
    });

    return {
      type: "FeatureCollection",
      features: features,
    };
  }

  function deriveGeoJsonName(collection, fallbackName) {
    const firstFeature = collection.features[0];
    if (
      firstFeature &&
      firstFeature.properties &&
      typeof firstFeature.properties.name === "string" &&
      firstFeature.properties.name.trim()
    ) {
      return firstFeature.properties.name.trim();
    }

    return fallbackName || "Imported GeoJSON Route";
  }

  function extractPoints(nodeList) {
    return Array.from(nodeList)
      .map(function (node) {
        const lat = Number(node.getAttribute("lat"));
        const lon = Number(node.getAttribute("lon"));
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        return [lon, lat];
      })
      .filter(Boolean);
  }

  function childText(parent, tagName) {
    const matches = parent.getElementsByTagNameNS("*", tagName);
    if (!matches.length) return "";
    const value = matches[0].textContent || "";
    return value.trim();
  }

  function estimateDistanceKm(featureCollection) {
    return Number(
      featureCollection.features
        .reduce(function (total, feature) {
          if (feature.geometry.type === "LineString") {
            return total + lineDistance(feature.geometry.coordinates);
          }

          return (
            total +
            feature.geometry.coordinates.reduce(function (sum, line) {
              return sum + lineDistance(line);
            }, 0)
          );
        }, 0)
        .toFixed(2)
    );
  }

  function lineDistance(line) {
    let total = 0;

    for (let index = 1; index < line.length; index += 1) {
      total += haversine(line[index - 1], line[index]);
    }

    return total;
  }

  function haversine(a, b) {
    const toRadians = function (value) {
      return (value * Math.PI) / 180;
    };

    const lon1 = a[0];
    const lat1 = a[1];
    const lon2 = b[0];
    const lat2 = b[1];
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const step =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return 6371 * 2 * Math.atan2(Math.sqrt(step), Math.sqrt(1 - step));
  }

  function pointToSegmentDistanceKm(point, a, b) {
    const referenceLat = (point[1] + a[1] + b[1]) / 3;
    const origin = toProjectedKm(a, referenceLat);
    const target = toProjectedKm(b, referenceLat);
    const test = toProjectedKm(point, referenceLat);
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const lengthSquared = dx * dx + dy * dy;

    if (!lengthSquared) {
      return Math.hypot(test.x - origin.x, test.y - origin.y);
    }

    const t = clamp(
      ((test.x - origin.x) * dx + (test.y - origin.y) * dy) / lengthSquared,
      0,
      1
    );
    const projectedX = origin.x + dx * t;
    const projectedY = origin.y + dy * t;

    return Math.hypot(test.x - projectedX, test.y - projectedY);
  }

  function toProjectedKm(coord, referenceLat) {
    return {
      x: coord[0] * 111.32 * Math.cos((referenceLat * Math.PI) / 180),
      y: coord[1] * 110.574,
    };
  }

  function getFeatureCollectionBounds(featureCollection) {
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;

    featureCollection.features.forEach(function (feature) {
      const geometry = feature.geometry;
      if (!geometry) return;

      if (geometry.type === "LineString") {
        geometry.coordinates.forEach(updateBounds);
      } else if (geometry.type === "MultiLineString") {
        geometry.coordinates.forEach(function (line) {
          line.forEach(updateBounds);
        });
      }
    });

    if (
      !Number.isFinite(minLng) ||
      !Number.isFinite(minLat) ||
      !Number.isFinite(maxLng) ||
      !Number.isFinite(maxLat)
    ) {
      return null;
    }

    return [
      [minLng, minLat],
      [maxLng, maxLat],
    ];

    function updateBounds(point) {
      if (!Array.isArray(point) || point.length < 2) return;
      minLng = Math.min(minLng, point[0]);
      minLat = Math.min(minLat, point[1]);
      maxLng = Math.max(maxLng, point[0]);
      maxLat = Math.max(maxLat, point[1]);
    }
  }

  function buildRouteDescription(route) {
    return (
      prettySource(route.sourceType) +
      " route • " +
      formatDistance(route.distanceKm) +
      " • Imported " +
      formatDate(route.importedAt) +
      ". Purple lines count toward the Colorado road coverage estimate."
    );
  }

  function sanitizeLine(line) {
    return dedupeSequentialCoordinates(
      (line || []).filter(function (point) {
        return (
          Array.isArray(point) &&
          point.length >= 2 &&
          Number.isFinite(point[0]) &&
          Number.isFinite(point[1])
        );
      })
    );
  }

  function dedupeSequentialCoordinates(line) {
    return line.filter(function (point, index) {
      if (!index) return true;
      const previous = line[index - 1];
      return previous[0] !== point[0] || previous[1] !== point[1];
    });
  }

  function hashLine(line) {
    const forward = line
      .map(function (point) {
        return point[0].toFixed(5) + "," + point[1].toFixed(5);
      })
      .join("|");
    const reversed = line
      .slice()
      .reverse()
      .map(function (point) {
        return point[0].toFixed(5) + "," + point[1].toFixed(5);
      })
      .join("|");
    return forward < reversed ? forward : reversed;
  }

  function nodeKey(coord) {
    return coord[0].toFixed(5) + "," + coord[1].toFixed(5);
  }

  function interpolateCoordinate(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
    ];
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function createEmptyDrawDraft() {
    return {
      rawWaypoints: [],
      snappedWaypoints: [],
      start: null,
      startSnapped: false,
      startRoadRef: null,
      end: null,
      endSnapped: false,
      endRoadRef: null,
      coordinates: [],
      distanceKm: 0,
      durationMin: 0,
      isRouting: false,
      routingMode: "idle",
    };
  }

  function emptyFeatureCollection() {
    return {
      type: "FeatureCollection",
      features: [],
    };
  }

  function setInfo(title, description) {
    elements.infoTitle.textContent = title;
    elements.infoDescription.textContent = description;
  }

  function setCursorReadout(text) {
    elements.cursorReadout.textContent = text;
  }

  function setStatus(text) {
    elements.mapStatus.textContent = text;
    elements.mapStatus.classList.remove("is-hidden");
  }

  function hideStatus() {
    elements.mapStatus.classList.add("is-hidden");
  }

  function safeTerrainElevation(lngLat) {
    try {
      return map && typeof map.queryTerrainElevation === "function"
        ? map.queryTerrainElevation(lngLat)
        : null;
    } catch (_error) {
      return null;
    }
  }

  function prettySource(sourceType) {
    if (sourceType === "gpx") return "GPX";
    if (sourceType === "geojson") return "GeoJSON";
    if (sourceType === "drawn") return "Road pen";
    return "Route";
  }

  function createDraftPoint(clickCoord, point) {
    const roadRef = findNearestRoadReference(clickCoord, point, SNAP_RADIUS_PIXELS);
    if (!roadRef) {
      return {
        coord: clickCoord,
        snapped: false,
        roadRef: null,
      };
    }

    return {
      coord: roadRef.coord,
      snapped: true,
      roadRef: roadRef,
    };
  }

  async function setFirstDrawWaypoint(clickCoord, point) {
    state.drawDraft = createEmptyDrawDraft();
    state.drawDraft.isRouting = true;
    updateDrawModeUi();
    setStatus("Snapping the first stop to the road network...");

    let firstStop = null;
    let routedBy = "router";

    try {
      firstStop = await requestNearestWaypoint(clickCoord);
    } catch (_error) {
      const localStart = createDraftPoint(clickCoord, point);
      firstStop = localStart.coord;
      routedBy = localStart.snapped ? "visible roads" : "click point";
    }

    state.drawDraft.rawWaypoints = [clickCoord];
    state.drawDraft.snappedWaypoints = [firstStop];
    state.drawDraft.start = firstStop;
    state.drawDraft.startSnapped = routedBy !== "click point";
    state.drawDraft.startRoadRef = null;
    state.drawDraft.end = null;
    state.drawDraft.endSnapped = false;
    state.drawDraft.coordinates = [];
    state.drawDraft.distanceKm = 0;
    state.drawDraft.durationMin = 0;
    state.drawDraft.isRouting = false;
    state.drawDraft.routingMode = routedBy === "router" ? "router" : "local";
    updateDrawDraftSource();
    updateDrawModeUi();

    setInfo(
      "Road pen start set",
      routedBy === "router"
        ? "First stop snapped to the road network. Click another point to build the route."
        : "First stop set. Click another point to build the route."
    );
    setStatus("First stop set. Click another point to route.");
  }

  async function extendDrawDraftWithWaypoint(clickCoord, point) {
    const nextWaypoints = state.drawDraft.rawWaypoints.concat([clickCoord]);
    if (nextWaypoints.length > ROUTER_MAX_WAYPOINTS) {
      setStatus("Draft stop limit reached. Save this route or clear it before adding more.");
      return;
    }

    state.drawDraft.isRouting = true;
    updateDrawModeUi();
    setStatus("Routing " + nextWaypoints.length + " stops across Colorado roads...");

    try {
      const routedDraft = await requestRoadRoute(nextWaypoints);
      applyRoutedDrawDraft(nextWaypoints, routedDraft, "router");
      setInfo("Road draft ready", buildDraftRouteDescription(state.drawDraft));
      setStatus("Draft ready. Click again to add another stop or save this route.");
    } catch (_error) {
      const fallbackDraft = buildLocalFallbackDraft(nextWaypoints, point);
      if (!fallbackDraft) {
        throw new Error(
          "No drivable route was found for that click. Try a spot closer to a visible road."
        );
      }

      applyRoutedDrawDraft(nextWaypoints, fallbackDraft, "local");
      setInfo(
        "Road draft ready",
        buildDraftRouteDescription(state.drawDraft) +
          " Routed from the visible road network as a fallback."
      );
      setStatus("Routing service missed that leg, so the draft used visible roads instead.");
    } finally {
      state.drawDraft.isRouting = false;
      updateDrawModeUi();
    }
  }

  function applyRoutedDrawDraft(rawWaypoints, routedDraft, routingMode) {
    const snappedWaypoints = routedDraft.waypoints && routedDraft.waypoints.length
      ? routedDraft.waypoints.slice()
      : rawWaypoints.slice();
    const coordinates = dedupeSequentialCoordinates(routedDraft.coordinates || []);

    state.drawDraft.rawWaypoints = rawWaypoints.slice();
    state.drawDraft.snappedWaypoints = snappedWaypoints;
    state.drawDraft.start = snappedWaypoints[0] || null;
    state.drawDraft.startSnapped = Boolean(snappedWaypoints[0]);
    state.drawDraft.startRoadRef = null;
    state.drawDraft.end =
      snappedWaypoints.length > 1 ? snappedWaypoints[snappedWaypoints.length - 1] : null;
    state.drawDraft.endSnapped = snappedWaypoints.length > 1;
    state.drawDraft.endRoadRef = null;
    state.drawDraft.coordinates = coordinates;
    state.drawDraft.distanceKm = Number(routedDraft.distanceKm || lineDistance(coordinates));
    state.drawDraft.durationMin = Number(routedDraft.durationMin || 0);
    state.drawDraft.routingMode = routingMode;
    updateDrawDraftSource();
  }

  function buildDraftRouteDescription(drawDraft) {
    const stopCount = drawDraft.snappedWaypoints.length || drawDraft.rawWaypoints.length;
    const distanceText = formatDistance(drawDraft.distanceKm || lineDistance(drawDraft.coordinates));
    const durationText = drawDraft.durationMin
      ? " • about " + formatDurationMinutes(drawDraft.durationMin)
      : "";
    return (
      formatStopCount(stopCount) +
      " • " +
      distanceText +
      durationText +
      " • Save this route to add it to Driven Routes."
    );
  }

  function buildLocalFallbackDraft(rawWaypoints, point) {
    const previousCoord =
      state.drawDraft.snappedWaypoints[state.drawDraft.snappedWaypoints.length - 1] ||
      state.drawDraft.start;
    if (!previousCoord) return null;

    const endCandidate = createDraftPoint(rawWaypoints[rawWaypoints.length - 1], point);
    const startPoint = map.project({
      lng: previousCoord[0],
      lat: previousCoord[1],
    });
    const startRoadRef = findNearestRoadReference(previousCoord, startPoint, SNAP_RADIUS_PIXELS * 1.5);
    const legPath = buildTwoClickDraftPath(
      {
        start: previousCoord,
        startSnapped: Boolean(startRoadRef),
        startRoadRef: startRoadRef,
      },
      endCandidate,
      point
    );

    if (!legPath || legPath.length < 2) {
      return null;
    }

    const existingCoordinates = state.drawDraft.coordinates.length
      ? state.drawDraft.coordinates.slice()
      : [previousCoord];
    const combinedCoordinates = dedupeSequentialCoordinates(
      existingCoordinates.concat(legPath.slice(1))
    );
    const snappedWaypoints = state.drawDraft.snappedWaypoints
      .slice()
      .concat([endCandidate.coord]);

    return {
      coordinates: combinedCoordinates,
      waypoints: snappedWaypoints,
      distanceKm: lineDistance(combinedCoordinates),
      durationMin: 0,
    };
  }

  async function requestNearestWaypoint(coord) {
    const url =
      ROUTER_BASE_URL +
      "/nearest/v1/" +
      ROUTER_PROFILE +
      "/" +
      formatRouterCoordinate(coord) +
      "?number=1";
    const response = await fetchRouterJson(url);
    if (!response || response.code !== "Ok" || !response.waypoints || !response.waypoints.length) {
      throw new Error("Nearest-road lookup failed.");
    }

    return normalizeRouterWaypoint(response.waypoints[0]);
  }

  async function requestRoadRoute(coords) {
    const url =
      ROUTER_BASE_URL +
      "/route/v1/" +
      ROUTER_PROFILE +
      "/" +
      coords.map(formatRouterCoordinate).join(";") +
      "?overview=full&geometries=geojson&steps=false&alternatives=false&continue_straight=true";
    const response = await fetchRouterJson(url);
    const route = response && response.routes && response.routes[0];

    if (!response || response.code !== "Ok" || !route || !route.geometry) {
      throw new Error("Road routing failed.");
    }

    const coordinates = sanitizeLine(route.geometry.coordinates);
    if (coordinates.length < 2) {
      throw new Error("Road routing returned an empty geometry.");
    }

    return {
      coordinates: coordinates,
      waypoints: (response.waypoints || []).map(normalizeRouterWaypoint).filter(Boolean),
      distanceKm: Number(route.distance || 0) / 1000,
      durationMin: Number(route.duration || 0) / 60,
    };
  }

  async function fetchRouterJson(url) {
    const controller =
      typeof AbortController === "function" ? new AbortController() : null;
    const timeoutId = controller
      ? window.setTimeout(function () {
          controller.abort();
        }, ROUTER_REQUEST_TIMEOUT_MS)
      : null;

    try {
      const response = await fetch(url, {
        method: "GET",
        mode: "cors",
        signal: controller ? controller.signal : undefined,
      });

      if (!response.ok) {
        throw new Error("Routing service returned HTTP " + response.status + ".");
      }

      return response.json();
    } finally {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    }
  }

  function normalizeRouterWaypoint(waypoint) {
    if (
      !waypoint ||
      !Array.isArray(waypoint.location) ||
      waypoint.location.length < 2 ||
      !Number.isFinite(waypoint.location[0]) ||
      !Number.isFinite(waypoint.location[1])
    ) {
      return null;
    }

    return [waypoint.location[0], waypoint.location[1]];
  }

  function formatRouterCoordinate(coord) {
    return coord[0].toFixed(6) + "," + coord[1].toFixed(6);
  }

  function buildTwoClickDraftPath(draft, endCandidate, endPoint) {
    const startCoord = draft.start;
    const endCoord = endCandidate.coord;

    if (!startCoord || !endCoord) {
      return dedupeSequentialCoordinates([startCoord, endCoord].filter(Boolean));
    }

    if (!draft.startSnapped || !endCandidate.snapped) {
      return dedupeSequentialCoordinates([startCoord, endCoord]);
    }

    const visibleRoadPath = buildPathAlongVisibleRoad(
      draft.startRoadRef,
      endCandidate.roadRef
    );
    if (visibleRoadPath && visibleRoadPath.length > 1 && lineDistance(visibleRoadPath) > 0) {
      return dedupeSequentialCoordinates(visibleRoadPath);
    }

    const graph = buildRoadGraphFromViewport();
    if (!graph || !graph.segments.length) {
      return dedupeSequentialCoordinates([startCoord, endCoord]);
    }

    const startPoint = map.project({
      lng: startCoord[0],
      lat: startCoord[1],
    });
    const startSnap = snapToRoadGraph(graph, startCoord, startPoint, SNAP_RADIUS_PIXELS * 2);
    const endSnap = snapToRoadGraph(graph, endCoord, endPoint, SNAP_RADIUS_PIXELS * 2);

    if (!startSnap || !endSnap) {
      return dedupeSequentialCoordinates([startCoord, endCoord]);
    }

    const path = findPathBetweenSnaps(graph, startSnap, endSnap);
    if (!path || path.length < 2 || lineDistance(path) === 0) {
      return dedupeSequentialCoordinates([startCoord, endCoord]);
    }

    return dedupeSequentialCoordinates(path);
  }

  function findNearestRoadReference(coord, point, maxPixelDistance) {
    if (!mapReady) return null;

    const targetPoint =
      point ||
      map.project({
        lng: coord[0],
        lat: coord[1],
      });
    const searchRadius =
      typeof maxPixelDistance === "number" ? maxPixelDistance : SNAP_RADIUS_PIXELS;
    const features = map.queryRenderedFeatures(
      [
        [targetPoint.x - searchRadius, targetPoint.y - searchRadius],
        [targetPoint.x + searchRadius, targetPoint.y + searchRadius],
      ],
      { layers: ["roads"] }
    );

    let best = null;

    features.forEach(function (feature) {
      if (!feature || !feature.geometry) return;

      if (feature.geometry.type === "LineString") {
        inspectLine(feature.geometry.coordinates);
      } else if (feature.geometry.type === "MultiLineString") {
        feature.geometry.coordinates.forEach(inspectLine);
      }
    });

    if (!best || best.pixelDistance > searchRadius) {
      return null;
    }

    return best;

    function inspectLine(rawLine) {
      const line = sanitizeLine(rawLine);
      if (line.length < 2) return;

      const projection = projectCoordinateOntoLine(line, coord, targetPoint);
      if (!projection) return;
      if (best && projection.pixelDistance >= best.pixelDistance) return;

      best = {
        coord: projection.coord,
        line: line,
        lineId: hashLine(line),
        segmentIndex: projection.segmentIndex,
        t: projection.t,
        pixelDistance: projection.pixelDistance,
      };
    }
  }

  function projectCoordinateOntoLine(line, coord, point) {
    if (!line || line.length < 2) return null;

    const targetPoint =
      point ||
      map.project({
        lng: coord[0],
        lat: coord[1],
      });
    let best = null;

    for (let index = 1; index < line.length; index += 1) {
      const a = line[index - 1];
      const b = line[index];
      const aPoint = map.project({ lng: a[0], lat: a[1] });
      const bPoint = map.project({ lng: b[0], lat: b[1] });
      const projected = projectPointToSegment(targetPoint, aPoint, bPoint);

      if (best && projected.distance >= best.pixelDistance) continue;

      best = {
        segmentIndex: index - 1,
        t: projected.t,
        coord: interpolateCoordinate(a, b, projected.t),
        pixelDistance: projected.distance,
      };
    }

    return best;
  }

  function buildPathAlongVisibleRoad(startRoadRef, endRoadRef) {
    if (!startRoadRef || !endRoadRef) return null;

    const candidateLines = [];
    const seen = new Set();

    [startRoadRef.line, endRoadRef.line].forEach(function (line) {
      if (!line || line.length < 2) return;
      const key = hashLine(line);
      if (seen.has(key)) return;
      seen.add(key);
      candidateLines.push(line);
    });

    const startPoint = map.project({
      lng: startRoadRef.coord[0],
      lat: startRoadRef.coord[1],
    });
    const endPoint = map.project({
      lng: endRoadRef.coord[0],
      lat: endRoadRef.coord[1],
    });
    let bestPath = null;

    candidateLines.forEach(function (line) {
      const startProjection = projectCoordinateOntoLine(line, startRoadRef.coord, startPoint);
      const endProjection = projectCoordinateOntoLine(line, endRoadRef.coord, endPoint);

      if (!startProjection || !endProjection) return;

      const totalPixelDistance =
        startProjection.pixelDistance + endProjection.pixelDistance;
      if (totalPixelDistance > SAME_ROAD_TRACE_MAX_PIXELS) return;

      const path = sliceLineBetweenProjectedPoints(line, startProjection, endProjection);
      if (!path || path.length < 2 || lineDistance(path) === 0) return;

      if (bestPath && totalPixelDistance >= bestPath.totalPixelDistance) return;

      bestPath = {
        coordinates: path,
        totalPixelDistance: totalPixelDistance,
      };
    });

    return bestPath ? bestPath.coordinates : null;
  }

  function sliceLineBetweenProjectedPoints(line, startProjection, endProjection) {
    const path = [startProjection.coord];
    const movingForward =
      startProjection.segmentIndex < endProjection.segmentIndex ||
      (startProjection.segmentIndex === endProjection.segmentIndex &&
        startProjection.t <= endProjection.t);

    if (movingForward) {
      for (
        let index = startProjection.segmentIndex + 1;
        index <= endProjection.segmentIndex;
        index += 1
      ) {
        path.push(line[index]);
      }
    } else {
      for (
        let index = startProjection.segmentIndex;
        index > endProjection.segmentIndex;
        index -= 1
      ) {
        path.push(line[index]);
      }
    }

    path.push(endProjection.coord);
    return dedupeSequentialCoordinates(path);
  }

  function formatDistance(distanceKm) {
    return Number(distanceKm || 0).toFixed(1) + " km";
  }

  function formatDurationMinutes(durationMin) {
    const roundedMinutes = Math.max(1, Math.round(durationMin || 0));
    if (roundedMinutes < 60) {
      return roundedMinutes + " min";
    }

    const hours = Math.floor(roundedMinutes / 60);
    const minutes = roundedMinutes % 60;
    return minutes ? hours + " hr " + minutes + " min" : hours + " hr";
  }

  function formatStopCount(count) {
    return count + " stop" + (count === 1 ? "" : "s");
  }

  function formatDate(isoDate) {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return "unknown date";
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function stripExtension(filename) {
    return filename.replace(/\.[^.]+$/, "");
  }

  function toId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return "route-" + window.crypto.randomUUID();
    }

    return "route-" + Math.random().toString(36).slice(2, 11);
  }
})();
