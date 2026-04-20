(function () {
  const STORAGE_KEY = "cdm:routes:standalone";
  const COLORADO_CENTER = [-105.55, 39.0];
  const COLORADO_BOUNDS = [
    [-109.1, 36.9],
    [-102.0, 41.1],
  ];

  const SAMPLE_BOUNDARY = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "Colorado" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-109.05, 36.99],
              [-102.04, 36.99],
              [-102.04, 41.0],
              [-109.05, 41.0],
              [-109.05, 36.99],
            ],
          ],
        },
      },
    ],
  };

  const SAMPLE_OVERLAY = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "Sample Scenic Area" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-106.2, 39.5],
              [-105.9, 39.5],
              [-105.9, 39.8],
              [-106.2, 39.8],
              [-106.2, 39.5],
            ],
          ],
        },
      },
    ],
  };

  const SAMPLE_ROUTE_GEOJSON = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "Front Range Loop" },
        geometry: {
          type: "LineString",
          coordinates: [
            [-104.9903, 39.7392],
            [-105.2705, 40.015],
            [-104.8214, 38.8339],
            [-104.9903, 39.7392],
          ],
        },
      },
    ],
  };

  const defaultInfo = {
    title: "Colorado Drive Map",
    description:
      "Import GPX or GeoJSON routes to highlight roads you have driven across Colorado.",
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
  };

  const elements = {};
  let map = null;
  let mapReady = false;

  window.addEventListener("DOMContentLoaded", initApp);

  function initApp() {
    cacheElements();
    bindUi();
    state.routes = loadRoutes();

    if (state.routes.length === 0) {
      const sampleRoute = createSampleRoute();
      state.routes = [sampleRoute];
      state.selectedRouteId = sampleRoute.id;
      saveRoutes(state.routes);
    } else {
      state.selectedRouteId = state.routes[0].id;
    }

    renderRouteList();
    renderRouteStats();

    if (state.selectedRouteId) {
      const route = findRoute(state.selectedRouteId);
      if (route) {
        setInfo(
          route.name,
          buildRouteDescription(route)
        );
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
  }

  function initMap() {
    setStatus("Connecting to free map and terrain sources…");

    map = new maplibregl.Map({
      container: elements.map,
      style: buildMapStyle(),
      center: COLORADO_CENTER,
      zoom: 6.5,
      hash: true,
      maxPitch: 70,
    });

    map.fitBounds(COLORADO_BOUNDS, { padding: 40, duration: 0 });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 120, unit: "imperial" }),
      "bottom-right"
    );

    map.on("load", function () {
      mapReady = true;
      map.setTerrain({ source: "terrainDem", exaggeration: 1.15 });
      addStaticLayers();
      updateDrivenRoutesSource();
      syncMapVisibility();
      bindMapInteractions();
      setStatus("Map ready.");
      window.setTimeout(hideStatus, 1400);

      if (state.selectedRouteId) {
        focusRoute(state.selectedRouteId, false);
      }
    });

    map.on("error", function (event) {
      console.error(event && event.error ? event.error : event);
      setStatus(
        "A map source failed to load. Check your internet connection or switch layers."
      );
    });
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
          attribution: "© OpenTopoMap © OpenStreetMap contributors",
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
          attribution: "© OpenStreetMap contributors",
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
          id: "background",
          type: "background",
          paint: {
            "background-color": "#ccd5cd",
          },
        },
        {
          id: "satellite-base",
          type: "raster",
          source: "satelliteRaster",
          layout: { visibility: "none" },
        },
        {
          id: "topo-base",
          type: "raster",
          source: "topoRaster",
          layout: { visibility: "visible" },
        },
        {
          id: "hillshade",
          type: "hillshade",
          source: "terrainDem",
          layout: { visibility: "visible" },
          paint: {
            "hillshade-exaggeration": 0.4,
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
            "line-color": "#fbf7f0",
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              5,
              0.4,
              10,
              1.2,
              14,
              2.8,
            ],
            "line-opacity": 0.9,
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
            "text-color": "#fffaf0",
            "text-halo-color": "#203226",
            "text-halo-width": 1.2,
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
        "line-color": "#d98a2f",
        "line-width": 2.2,
      },
    });

    map.addSource("sample-overlay", {
      type: "geojson",
      data: SAMPLE_OVERLAY,
    });

    map.addLayer({
      id: "sample-overlay-fill",
      type: "fill",
      source: "sample-overlay",
      paint: {
        "fill-color": "#2f8d95",
        "fill-opacity": 0.14,
      },
    });

    map.addLayer({
      id: "sample-overlay-outline",
      type: "line",
      source: "sample-overlay",
      paint: {
        "line-color": "#2f8d95",
        "line-width": 1.4,
      },
    });
  }

  function bindMapInteractions() {
    map.on("click", "driven-routes-line", function (event) {
      const feature = event.features && event.features[0];
      if (!feature || !feature.properties || !feature.properties.routeId) return;
      focusRoute(String(feature.properties.routeId), true);
    });

    map.on("mouseenter", "driven-routes-line", function () {
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", "driven-routes-line", function () {
      map.getCanvas().style.cursor = "";
    });

    map.on("click", function (event) {
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

    setLayerVisibility("topo-base", state.basemapMode === "topo");
    setLayerVisibility("satellite-base", state.basemapMode === "satellite");
    setLayerVisibility("roads", state.overlays.roads);
    setLayerVisibility("place-labels", state.overlays.labels);
    setLayerVisibility("hillshade", state.overlays.hillshade);
    setLayerVisibility("driven-routes-line", state.overlays.drivenRoutes);
  }

  function setLayerVisibility(layerId, isVisible) {
    if (!map.getLayer(layerId)) return;
    map.setLayoutProperty(layerId, "visibility", isVisible ? "visible" : "none");
  }

  function updateDrivenRoutesSource() {
    if (!mapReady) return;

    const data = buildDrivenRoutesCollection(state.routes);
    const source = map.getSource("driven-routes");

    if (!source) {
      map.addSource("driven-routes", {
        type: "geojson",
        data: data,
      });

      map.addLayer({
        id: "driven-routes-line",
        type: "line",
        source: "driven-routes",
        layout: {
          "line-cap": "round",
          "line-join": "round",
          visibility: state.overlays.drivenRoutes ? "visible" : "none",
        },
        paint: {
          "line-color": "#21b35f",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            2,
            10,
            4,
            14,
            7,
          ],
          "line-opacity": 0.92,
        },
      });
    } else {
      source.setData(data);
    }
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

  function renderRouteList() {
    elements.routeList.innerHTML = "";

    if (state.routes.length === 0) {
      const empty = document.createElement("li");
      empty.className = "route-empty";
      empty.textContent = "No routes imported yet.";
      elements.routeList.appendChild(empty);
      return;
    }

    state.routes.forEach(function (route) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      const name = document.createElement("span");
      const meta = document.createElement("span");

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

      button.appendChild(name);
      button.appendChild(meta);
      item.appendChild(button);
      elements.routeList.appendChild(item);
    });
  }

  function renderRouteStats() {
    const totalDistance = state.routes.reduce(function (sum, route) {
      return sum + Number(route.distanceKm || 0);
    }, 0);

    elements.routeCount.textContent = String(state.routes.length);
    elements.totalDistance.textContent = formatDistance(totalDistance);
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
      padding: 60,
      duration: 900,
    });
  }

  async function handleRouteImport(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    setStatus("Importing " + file.name + "…");

    try {
      const route = await parseRouteFile(file);
      state.routes.unshift(route);
      state.selectedRouteId = route.id;
      saveRoutes(state.routes);
      renderRouteList();
      renderRouteStats();
      updateDrivenRoutesSource();
      syncMapVisibility();
      focusRoute(route.id, true);
      setStatus("Imported " + route.name + ".");
      window.setTimeout(hideStatus, 1600);
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
        } catch (error) {
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
      sourceType: sourceType,
      featureCollection: featureCollection,
      distanceKm: estimateDistanceKm(featureCollection),
      importedAt: new Date().toISOString(),
    };
  }

  function createSampleRoute() {
    const normalized = flattenToLineFeatures(SAMPLE_ROUTE_GEOJSON);
    return {
      id: "sample-route",
      name: "Front Range Loop",
      sourceType: "sample",
      featureCollection: normalized,
      distanceKm: estimateDistanceKm(normalized),
      importedAt: new Date().toISOString(),
    };
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

    throw new Error("GeoJSON must contain a line FeatureCollection, Feature, or geometry.");
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
      }

      if (geometry.type === "MultiLineString") {
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
      ". Future-ready for road matching."
    );
  }

  function findRoute(routeId) {
    return state.routes.find(function (route) {
      return route.id === routeId;
    });
  }

  function loadRoutes() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }

  function saveRoutes(routes) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
    } catch (_error) {
      setStatus("Could not save routes to local storage in this browser.");
    }
  }

  function toId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return "route-" + window.crypto.randomUUID();
    }

    return "route-" + Math.random().toString(36).slice(2, 11);
  }

  function formatDistance(distanceKm) {
    return Number(distanceKm || 0).toFixed(1) + " km";
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

  function prettySource(sourceType) {
    if (sourceType === "gpx") return "GPX";
    if (sourceType === "geojson") return "GeoJSON";
    return "Sample";
  }

  function stripExtension(filename) {
    return filename.replace(/\.[^.]+$/, "");
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
})();
