const routeControlPoints = [
  { x: 13, y: 79 },
  { x: 23, y: 66 },
  { x: 31, y: 58 },
  { x: 45, y: 47 },
  { x: 57, y: 39 },
  { x: 69, y: 30 },
  { x: 81, y: 16 },
];

const routeGeoPoints = [
  { latitude: 31.2397, longitude: 121.5004 },
  { latitude: 31.2284, longitude: 121.4952 },
  { latitude: 31.2176, longitude: 121.4904 },
  { latitude: 31.2032, longitude: 121.4847 },
  { latitude: 31.1874, longitude: 121.4795 },
  { latitude: 31.1712, longitude: 121.4736 },
  { latitude: 31.1545, longitude: 121.4684 },
];

const roomDefaults = {
  title: "滨江绿道晨骑",
  distanceKm: 18.6,
  etaMinutes: 52,
};
const fallbackAmapRoute = {
  origin: {
    name: "陆家嘴滨江骑行驿站",
    latitude: routeGeoPoints[0].latitude,
    longitude: routeGeoPoints[0].longitude,
  },
  destination: {
    name: "前滩休闲公园南门",
    latitude: routeGeoPoints[routeGeoPoints.length - 1].latitude,
    longitude: routeGeoPoints[routeGeoPoints.length - 1].longitude,
  },
};
const fallbackRouteDefinition = {
  title: roomDefaults.title,
  distanceKm: roomDefaults.distanceKm,
  etaMinutes: roomDefaults.etaMinutes,
  controlPoints: routeControlPoints,
  geoPoints: routeGeoPoints,
  origin: fallbackAmapRoute.origin,
  destination: fallbackAmapRoute.destination,
  source: "fallback",
};

const colorOptions = ["#1fa66f", "#3a8dde", "#ef8a43", "#d65d76", "#8157d8", "#0f8c86"];
const profilePresets = [
  { name: "我", role: "领骑", color: "#1fa66f", baseSpeed: 21.4 },
  { name: "阿岚", role: "跟骑", color: "#3a8dde", baseSpeed: 20.7 },
  { name: "小卓", role: "自由骑", color: "#ef8a43", baseSpeed: 19.9 },
  { name: "Rider K", role: "收队", color: "#d65d76", baseSpeed: 18.6 },
];
const demoProfiles = [
  { id: "demo-aze", name: "阿泽", role: "并行骑行", color: "#3a8dde", progress: 0.5, speed: 22.1, variance: 0.008 },
  { id: "demo-miao", name: "苗苗", role: "稳定跟队", color: "#ef8a43", progress: 0.39, speed: 19.3, variance: 0.006 },
  { id: "demo-kai", name: "阿凯", role: "收队观察", color: "#d65d76", progress: 0.31, speed: 17.1, variance: 0.004 },
];

const ROOM_STORAGE_PREFIX = "cycling-buddy-room:";
const LAST_ROOM_KEY = "cycling-buddy-last-room";
const PROFILE_KEY = "cycling-buddy-profile";
const PANEL_COLLAPSE_KEY = "cycling-buddy-panel-collapsed";
const REAL_LOCATION_KEY = "cycling-buddy-real-location-enabled";
const HEARTBEAT_MS = 2000;
const LIVE_TTL_MS = 12000;
const API_BASE = `${window.location.origin}/api`;

const memberList = document.getElementById("member-list");
const riderLayer = document.getElementById("rider-layer");
const mapStage = document.querySelector(".map-stage");
const amapCanvas = document.getElementById("amap-canvas");
const insightList = document.getElementById("insight-list");
const selfSpeed = document.getElementById("self-speed");
const nearestRider = document.getElementById("nearest-rider");
const riskLevel = document.getElementById("risk-level");
const toggleMotionButton = document.getElementById("toggle-motion");
const roomCodePill = document.getElementById("room-code-pill");
const roomSyncPill = document.getElementById("room-sync-pill");
const roomModeBadge = document.getElementById("room-mode-badge");
const statusRibbonCopy = document.getElementById("status-ribbon-copy");
const teamCount = document.getElementById("team-count");
const routeTitle = document.getElementById("route-title");
const routeOriginName = document.getElementById("route-origin-name");
const routeDestinationName = document.getElementById("route-destination-name");
const routeDistance = document.getElementById("route-distance");
const routeEta = document.getElementById("route-eta");
const roomHelper = document.getElementById("room-helper");
const displayNameInput = document.getElementById("display-name");
const riderRoleSelect = document.getElementById("rider-role");
const roomCodeInput = document.getElementById("room-code-input");
const createRoomButton = document.getElementById("create-room");
const joinRoomButton = document.getElementById("join-room");
const leaveRoomButton = document.getElementById("leave-room");
const copyRoomButton = document.getElementById("copy-room");
const shareRoomButton = document.getElementById("share-room");
const openTabButton = document.getElementById("open-tab");
const openAmapNavigationButton = document.getElementById("open-amap-navigation");
const colorSwatches = document.getElementById("color-swatches");
const demoToggle = document.getElementById("demo-toggle");
const appShell = document.getElementById("app-shell");
const collapsePanelButton = document.getElementById("collapse-panel");
const expandPanelButton = document.getElementById("expand-panel");
const railButtons = [...document.querySelectorAll(".rail-button")];
const liveLocationToggle = document.getElementById("live-location-toggle");
const locationStatus = document.getElementById("location-status");

const memberTemplate = document.getElementById("member-template");
const insightTemplate = document.getElementById("insight-template");

const memberNodes = new Map();
const riderNodes = new Map();

const storageAvailable = canUseStorage();
const sessionStore = window.sessionStorage;
const syncChannel = "BroadcastChannel" in window ? new BroadcastChannel("cycling-buddy-room-sync") : null;
const launchOverrides = getLaunchOverrides();
const clientId = launchOverrides.memberId
  ? `member-${launchOverrides.memberId}`
  : getOrCreateSessionValue("cycling-buddy-client-id", `client-${createId()}`);

let profile = loadProfile();
let currentRoomId = null;
let currentRoom = null;
let isRunning = true;
let frameCount = 0;
let isPanelCollapsed = false;
let activeRailTarget = "room-card";
let syncMode = "local";
let roomStream = null;
let useRealLocation = false;
let geoWatchId = null;
let amapMap = null;
let amapRouteLine = null;
let activeRoute = createActiveRoute(fallbackRouteDefinition);

function createActiveRoute(route) {
  return {
    ...route,
    controlPoints: route.controlPoints,
    geoPoints: route.geoPoints,
    metrics: createRouteGeoMetrics(route.geoPoints),
  };
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function canUseStorage() {
  try {
    window.localStorage.setItem("__cycling_test__", "1");
    window.localStorage.removeItem("__cycling_test__");
    return true;
  } catch {
    return false;
  }
}

function getOrCreateSessionValue(key, fallback) {
  const existing = sessionStore.getItem(key);
  if (existing) return existing;
  sessionStore.setItem(key, fallback);
  return fallback;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function getRoutePoint(progress) {
  const clamped = Math.max(0, Math.min(progress, 1));
  const segmentCount = activeRoute.controlPoints.length - 1;
  const scaled = clamped * segmentCount;
  const index = Math.min(segmentCount - 1, Math.floor(scaled));
  const localT = scaled - index;
  const start = activeRoute.controlPoints[index];
  const end = activeRoute.controlPoints[index + 1];

  return {
    x: lerp(start.x, end.x, localT),
    y: lerp(start.y, end.y, localT),
  };
}

function estimateDistanceGap(baseProgress, targetProgress) {
  return Math.abs(baseProgress - targetProgress) * activeRoute.distanceKm * 1000;
}

function haversineDistanceMeters(a, b) {
  if (!a || !b) return null;
  if (typeof a.latitude !== "number" || typeof a.longitude !== "number") return null;
  if (typeof b.latitude !== "number" || typeof b.longitude !== "number") return null;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const radius = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const hav =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * radius * Math.asin(Math.sqrt(hav));
}

function createRouteGeoMetrics(points) {
  const segmentMeters = [];
  const cumulativeMeters = [0];
  let totalMeters = 0;

  points.slice(0, -1).forEach((point, index) => {
    const length = haversineDistanceMeters(point, points[index + 1]) || 0;
    segmentMeters.push(length);
    totalMeters += length;
    cumulativeMeters.push(totalMeters);
  });

  return {
    origin: points[0],
    segmentMeters,
    cumulativeMeters,
    totalMeters: totalMeters || fallbackRouteDefinition.distanceKm * 1000,
  };
}

function projectGeoPoint(point) {
  const radius = 6371000;
  const originLat = (activeRoute.metrics.origin.latitude * Math.PI) / 180;
  const lat = (point.latitude * Math.PI) / 180;
  const lon = (point.longitude * Math.PI) / 180;
  const originLon = (activeRoute.metrics.origin.longitude * Math.PI) / 180;

  return {
    x: radius * (lon - originLon) * Math.cos(originLat),
    y: radius * (lat - originLat),
  };
}

function closestPointOnSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const segmentLengthSquared = dx * dx + dy * dy;
  const rawT = segmentLengthSquared
    ? ((point.x - start.x) * dx + (point.y - start.y) * dy) / segmentLengthSquared
    : 0;
  const t = Math.max(0, Math.min(1, rawT));
  const x = start.x + dx * t;
  const y = start.y + dy * t;
  const distanceMeters = Math.hypot(point.x - x, point.y - y);

  return { t, distanceMeters };
}

function projectLocationToRoute(location) {
  if (!isFiniteNumber(location?.latitude) || !isFiniteNumber(location?.longitude)) return null;

  const point = projectGeoPoint(location);
  const projectedRoute = activeRoute.geoPoints.map(projectGeoPoint);
  let best = null;

  projectedRoute.slice(0, -1).forEach((start, index) => {
    const candidate = closestPointOnSegment(point, start, projectedRoute[index + 1]);
    const routeDistanceMeters =
      activeRoute.metrics.cumulativeMeters[index] + activeRoute.metrics.segmentMeters[index] * candidate.t;

    if (!best || candidate.distanceMeters < best.offRouteMeters) {
      best = {
        routeDistanceMeters,
        offRouteMeters: candidate.distanceMeters,
      };
    }
  });

  if (!best) return null;

  return {
    ...best,
    routeProgress: Math.max(0, Math.min(1, best.routeDistanceMeters / activeRoute.metrics.totalMeters)),
  };
}

function hasRouteLocation(participant) {
  return (
    (participant?.locationSource === "gps" || participant?.locationSource === "test-gps") &&
    isFiniteNumber(participant.routeDistanceMeters)
  );
}

function getParticipantRouteProgress(participant) {
  if (isFiniteNumber(participant?.routeProgress)) return participant.routeProgress;
  return participant?.progress ?? 0;
}

function getParticipantRouteDistance(participant) {
  if (isFiniteNumber(participant?.routeDistanceMeters)) return participant.routeDistanceMeters;
  return getParticipantRouteProgress(participant) * activeRoute.distanceKm * 1000;
}

function signedRouteGapMeters(baseParticipant, targetParticipant) {
  if (hasRouteLocation(baseParticipant) && hasRouteLocation(targetParticipant)) {
    return getParticipantRouteDistance(targetParticipant) - getParticipantRouteDistance(baseParticipant);
  }

  return (
    (getParticipantRouteProgress(targetParticipant) - getParticipantRouteProgress(baseParticipant)) *
    activeRoute.distanceKm *
    1000
  );
}

function distanceBetweenParticipants(baseParticipant, targetParticipant) {
  if (hasRouteLocation(baseParticipant) && hasRouteLocation(targetParticipant)) {
    return Math.abs(signedRouteGapMeters(baseParticipant, targetParticipant));
  }
  return estimateDistanceGap(
    getParticipantRouteProgress(baseParticipant),
    getParticipantRouteProgress(targetParticipant),
  );
}

function getProfileLocationFields() {
  const routePosition = projectLocationToRoute(profile);

  return {
    latitude: profile.latitude ?? null,
    longitude: profile.longitude ?? null,
    accuracy: profile.accuracy ?? null,
    locationSource: profile.locationSource ?? null,
    routeProgress: routePosition?.routeProgress ?? null,
    routeDistanceMeters: routePosition?.routeDistanceMeters ?? null,
    offRouteMeters: routePosition?.offRouteMeters ?? null,
  };
}

function applyRoutePositionToProfile() {
  const routePosition = projectLocationToRoute(profile);
  if (!routePosition) return;
  profile.routeProgress = routePosition.routeProgress;
  profile.routeDistanceMeters = routePosition.routeDistanceMeters;
  profile.offRouteMeters = routePosition.offRouteMeters;
}

function riskText(gap) {
  if (gap < 180) return "低";
  if (gap < 380) return "中";
  return "高";
}

function shadeColor(hex, amount) {
  const value = hex.replace("#", "");
  const num = Number.parseInt(value, 16);
  const clamp = (channel) => Math.max(0, Math.min(255, channel + amount));
  const r = clamp(num >> 16);
  const g = clamp((num >> 8) & 0x00ff);
  const b = clamp(num & 0x0000ff);

  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function makeAvatar(name) {
  return (name.trim()[0] || "骑").toUpperCase();
}

function updateLocationStatus(copy) {
  locationStatus.textContent = copy;
}

function stopRealLocationWatch() {
  if (geoWatchId !== null && "geolocation" in navigator) {
    navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = null;
  }
}

function syncRealLocationToggle() {
  liveLocationToggle.checked = useRealLocation;
}

function hasProfileLocation() {
  return isFiniteNumber(profile.latitude) && isFiniteNumber(profile.longitude);
}

function handleGeoPosition(position) {
  const { latitude, longitude, accuracy, speed } = position.coords;
  profile.latitude = latitude;
  profile.longitude = longitude;
  profile.accuracy = accuracy;
  profile.locationSource = "gps";
  applyRoutePositionToProfile();
  if (typeof speed === "number" && Number.isFinite(speed)) {
    profile.baseSpeed = speed * 3.6;
  }
  saveProfile();
  updateLocationStatus(
    `已启用真实定位，当前精度约 ${Math.round(accuracy)} 米。队友距离会按骑行路线里程差计算，而不是直线距离。`,
  );
  void pushSelfUpdate(true);
}

function handleGeoError(error) {
  useRealLocation = false;
  syncRealLocationToggle();
  stopRealLocationWatch();
  if (storageAvailable) {
    window.localStorage.setItem(REAL_LOCATION_KEY, "0");
  }
  updateLocationStatus(
    `真实定位开启失败：${error?.message || "定位不可用"}。当前已自动回退到模拟骑行轨迹。`,
  );
}

function startRealLocationWatch() {
  if (profile.locationSource === "test-gps" && hasProfileLocation()) {
    updateLocationStatus("正在使用链接中的测试经纬度演示真实定位，刷新后可继续验证路线距离。");
    return;
  }

  if (!("geolocation" in navigator)) {
    handleGeoError(new Error("当前浏览器不支持定位"));
    return;
  }

  stopRealLocationWatch();
  updateLocationStatus("正在请求定位权限并等待首次 GPS 结果...");
  geoWatchId = navigator.geolocation.watchPosition(handleGeoPosition, handleGeoError, {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 3000,
  });
}

function setRealLocationEnabled(nextValue) {
  useRealLocation = nextValue;
  syncRealLocationToggle();
  if (storageAvailable) {
    window.localStorage.setItem(REAL_LOCATION_KEY, useRealLocation ? "1" : "0");
  }

  if (useRealLocation) {
    if (profile.locationSource === "test-gps" && hasProfileLocation()) {
      profile.locationSource = null;
      profile.latitude = null;
      profile.longitude = null;
      profile.accuracy = null;
      profile.routeProgress = null;
      profile.routeDistanceMeters = null;
      profile.offRouteMeters = null;
      saveProfile();
    }
    startRealLocationWatch();
    return;
  }

  stopRealLocationWatch();
  profile.latitude = null;
  profile.longitude = null;
  profile.accuracy = null;
  profile.locationSource = null;
  profile.routeProgress = null;
  profile.routeDistanceMeters = null;
  profile.offRouteMeters = null;
  saveProfile();
  updateLocationStatus("当前使用模拟骑行轨迹。开启后会申请浏览器定位权限，并把真实坐标同步给房间成员。");
  void pushSelfUpdate(true);
}

function applyLaunchLocationOverride() {
  if (!isFiniteNumber(launchOverrides.latitude) || !isFiniteNumber(launchOverrides.longitude)) return false;

  profile.latitude = launchOverrides.latitude;
  profile.longitude = launchOverrides.longitude;
  profile.accuracy = launchOverrides.accuracy ?? 8;
  profile.locationSource = "test-gps";
  applyRoutePositionToProfile();
  saveProfile();
  return true;
}

function loadProfile() {
  if (launchOverrides.name || launchOverrides.role || launchOverrides.color) {
    const preset = profilePresets[Math.floor(Math.random() * profilePresets.length)];
    const overrideProfile = {
      id: clientId,
      name: launchOverrides.name || preset.name,
      role: launchOverrides.role || preset.role,
      color: launchOverrides.color || preset.color,
      baseSpeed: preset.baseSpeed,
      variance: 0.012,
      latitude: null,
      longitude: null,
      accuracy: null,
      locationSource: null,
      routeProgress: null,
      routeDistanceMeters: null,
      offRouteMeters: null,
    };
    sessionStore.setItem(PROFILE_KEY, JSON.stringify(overrideProfile));
    return overrideProfile;
  }

  const stored = sessionStore.getItem(PROFILE_KEY);
  if (stored) {
    return JSON.parse(stored);
  }

  const preset = profilePresets[Math.floor(Math.random() * profilePresets.length)];
  const initial = {
    id: clientId,
    name: preset.name,
    role: preset.role,
    color: preset.color,
    baseSpeed: preset.baseSpeed,
    variance: 0.012,
    latitude: null,
    longitude: null,
    accuracy: null,
    locationSource: null,
    routeProgress: null,
    routeDistanceMeters: null,
    offRouteMeters: null,
  };
  sessionStore.setItem(PROFILE_KEY, JSON.stringify(initial));
  return initial;
}

function saveProfile() {
  sessionStore.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function roomStorageKey(roomId) {
  return `${ROOM_STORAGE_PREFIX}${roomId}`;
}

function loadPanelPreference() {
  if (!storageAvailable) return false;
  return window.localStorage.getItem(PANEL_COLLAPSE_KEY) === "1";
}

function savePanelPreference() {
  if (!storageAvailable) return;
  window.localStorage.setItem(PANEL_COLLAPSE_KEY, isPanelCollapsed ? "1" : "0");
}

function loadRealLocationPreference() {
  if (!storageAvailable) return false;
  return window.localStorage.getItem(REAL_LOCATION_KEY) === "1";
}

function renderPanelState() {
  appShell.classList.toggle("panel-collapsed", isPanelCollapsed);
  collapsePanelButton.setAttribute("aria-expanded", String(!isPanelCollapsed));
  expandPanelButton.setAttribute("aria-expanded", String(isPanelCollapsed));
  collapsePanelButton.textContent = "收起侧栏";
  expandPanelButton.textContent = "展开侧栏";
  railButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.panelTarget === activeRailTarget);
  });
}

function setPanelCollapsed(nextValue) {
  isPanelCollapsed = nextValue;
  renderPanelState();
  savePanelPreference();
}

function setActiveRailTarget(target) {
  activeRailTarget = target;
  railButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.panelTarget === target);
  });
}

function revealPanelFromRail(target) {
  setActiveRailTarget(target);
  setPanelCollapsed(false);
  const panel = document.querySelector(`.${target}`);
  if (panel) {
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function getLaunchOverrides() {
  const params = new URLSearchParams(window.location.search);
  const latitude = Number.parseFloat(params.get("lat") || "");
  const longitude = Number.parseFloat(params.get("lng") || params.get("lon") || "");
  const accuracy = Number.parseFloat(params.get("accuracy") || "");

  return {
    memberId: params.get("member")?.trim() || "",
    name: params.get("name")?.trim() || "",
    role: params.get("role")?.trim() || "",
    color: params.get("color")?.trim() || "",
    demo: params.get("demo")?.trim() || "",
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
  };
}

function getRuntimeConfig() {
  return window.CYCLING_BUDDY_CONFIG || {};
}

function getPublicBaseUrl() {
  const configured = getRuntimeConfig().PUBLIC_BASE_URL?.trim();
  return configured || window.location.origin;
}

function formatDistanceKm(distanceKm) {
  return `${distanceKm.toFixed(1)} km`;
}

function updateRouteSummary() {
  routeTitle.textContent = `A 点到 B 点 · ${activeRoute.title}`;
  routeOriginName.textContent = activeRoute.origin.name;
  routeDestinationName.textContent = activeRoute.destination.name;
  routeDistance.textContent = formatDistanceKm(activeRoute.distanceKm);
  routeEta.textContent = `${Math.round(activeRoute.etaMinutes)} min`;
}

function getRouteBoundsPoints() {
  return activeRoute.geoPoints.map((point) => [point.longitude, point.latitude]);
}

function mapGeoPointsToControlPoints(points) {
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const lngSpan = Math.max(maxLng - minLng, 0.0001);
  const latSpan = Math.max(maxLat - minLat, 0.0001);

  return points.map((point) => {
    const x = 13 + ((point.longitude - minLng) / lngSpan) * 68;
    const y = 79 - ((point.latitude - minLat) / latSpan) * 63;
    return {
      x: Math.max(8, Math.min(92, x)),
      y: Math.max(10, Math.min(86, y)),
    };
  });
}

function applyRouteDefinition(route) {
  activeRoute = createActiveRoute(route);
  updateRouteSummary();
  applyRoutePositionToProfile();
  if (amapMap) {
    const path = getRouteBoundsPoints();
    if (amapRouteLine) {
      amapRouteLine.setPath(path);
    } else if (window.AMap?.Polyline) {
      amapRouteLine = new window.AMap.Polyline({
        map: amapMap,
        path,
        strokeColor: "#23a36d",
        strokeOpacity: 0.9,
        strokeWeight: 7,
        lineJoin: "round",
        lineCap: "round",
      });
    }
    amapMap.setFitView(amapRouteLine ? [amapRouteLine] : undefined);
  }
}

function extractRidingPath(result) {
  const candidateRoutes = [
    ...(Array.isArray(result?.routes) ? result.routes : []),
    ...(Array.isArray(result?.rides) ? result.rides : []),
  ];
  const route = candidateRoutes[0] || result?.route || result;
  const steps = Array.isArray(route?.steps) ? route.steps : [];
  const path = [];

  steps.forEach((step) => {
    const stepPath = Array.isArray(step?.path) ? step.path : [];
    stepPath.forEach((point) => {
      const lng = typeof point?.lng === "number" ? point.lng : point?.longitude;
      const lat = typeof point?.lat === "number" ? point.lat : point?.latitude;
      if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return;
      const previous = path[path.length - 1];
      if (previous && previous.latitude === lat && previous.longitude === lng) return;
      path.push({ latitude: lat, longitude: lng });
    });
  });

  const distanceMeters =
    route?.distance ??
    route?.routes?.[0]?.distance ??
    (path.length > 1 ? createRouteGeoMetrics(path).totalMeters : fallbackRouteDefinition.distanceKm * 1000);
  const durationSeconds = route?.time ?? route?.duration ?? route?.routes?.[0]?.time ?? null;

  if (path.length < 2) return null;

  return {
    title: roomDefaults.title,
    distanceKm: distanceMeters / 1000,
    etaMinutes: durationSeconds ? durationSeconds / 60 : Math.max(1, distanceMeters / 1000 / 20 * 60),
    controlPoints: mapGeoPointsToControlPoints(path),
    geoPoints: path,
    origin: {
      name: fallbackAmapRoute.origin.name,
      latitude: path[0].latitude,
      longitude: path[0].longitude,
    },
    destination: {
      name: fallbackAmapRoute.destination.name,
      latitude: path[path.length - 1].latitude,
      longitude: path[path.length - 1].longitude,
    },
    source: "amap-riding",
  };
}

async function loadAmapRidingRoute() {
  if (!window.AMap?.Riding) return false;

  return new Promise((resolve) => {
    try {
      const riding = new window.AMap.Riding({
        map: false,
        panel: false,
        hideMarkers: true,
      });

      riding.search(
        [fallbackAmapRoute.origin.longitude, fallbackAmapRoute.origin.latitude],
        [fallbackAmapRoute.destination.longitude, fallbackAmapRoute.destination.latitude],
        (status, result) => {
          if (status !== "complete") {
            resolve(false);
            return;
          }

          const route = extractRidingPath(result);
          if (!route) {
            resolve(false);
            return;
          }

          applyRouteDefinition(route);
          resolve(true);
        },
      );
    } catch {
      resolve(false);
    }
  });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      if (window.AMap) resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function initAmap() {
  const config = getRuntimeConfig();
  if (!config.AMAP_KEY || !amapCanvas) return;

  try {
    if (config.AMAP_PROXY_ENABLED) {
      window._AMapSecurityConfig = {
        serviceHost: `${window.location.origin}/_AMapService`,
      };
    } else if (config.AMAP_SECURITY_JS_CODE) {
      window._AMapSecurityConfig = {
        securityJsCode: config.AMAP_SECURITY_JS_CODE,
      };
    }

    await loadScript(
      `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(config.AMAP_KEY)}&plugin=AMap.Riding`,
    );
    amapMap = new window.AMap.Map("amap-canvas", {
      zoom: 12,
      center: [activeRoute.origin.longitude, activeRoute.origin.latitude],
      viewMode: "2D",
      mapStyle: "amap://styles/whitesmoke",
      resizeEnable: true,
    });

    const path = getRouteBoundsPoints();
    amapRouteLine = new window.AMap.Polyline({
      map: amapMap,
      path,
      strokeColor: "#23a36d",
      strokeOpacity: 0.9,
      strokeWeight: 7,
      lineJoin: "round",
      lineCap: "round",
    });
    amapMap.setFitView([amapRouteLine]);
    const didLoadRidingRoute = await loadAmapRidingRoute();
    if (!didLoadRidingRoute) {
      applyRouteDefinition(fallbackRouteDefinition);
    }
    roomHelper.textContent = config.AMAP_PROXY_ENABLED
      ? "当前高德地图能力已通过服务端代理启用，安全密钥不会直接暴露到前端。"
      : roomHelper.textContent;
    mapStage?.classList.add("has-amap");
  } catch {
    mapStage?.classList.remove("has-amap");
  }
}

function openAmapNavigation() {
  const { origin, destination } = activeRoute;
  const params = new URLSearchParams({
    sourceApplication: "cycling-buddy-live-sync",
    slat: String(origin.latitude),
    slon: String(origin.longitude),
    sname: origin.name,
    dlat: String(destination.latitude),
    dlon: String(destination.longitude),
    dname: destination.name,
    dev: "0",
    t: "0",
    mode: "ride",
    callnative: "1",
  });

  window.location.href = `https://uri.amap.com/navigation?${params.toString()}`;
}

function readRoom(roomId) {
  if (!storageAvailable || !roomId) return null;
  const raw = window.localStorage.getItem(roomStorageKey(roomId));
  return raw ? JSON.parse(raw) : null;
}

function writeRoom(room) {
  if (!storageAvailable || !room?.id) return;
  window.localStorage.setItem(roomStorageKey(room.id), JSON.stringify(room));
  window.localStorage.setItem(LAST_ROOM_KEY, room.id);
  if (syncChannel) {
    syncChannel.postMessage({ type: "room-updated", roomId: room.id });
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

async function createRemoteRoom() {
  const payload = {
    title: roomDefaults.title,
    hostId: profile.id,
    demoEnabled: demoToggle.checked,
  };
  const result = await requestJson(`${API_BASE}/rooms`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return result.room;
}

async function fetchRemoteRoom(roomId) {
  const result = await requestJson(`${API_BASE}/rooms/${roomId}`);
  return result.room;
}

async function upsertRemoteParticipant(roomId, participant, options = {}) {
  const result = await requestJson(`${API_BASE}/rooms/${roomId}/participants`, {
    method: "POST",
    body: JSON.stringify({
      demoEnabled: demoToggle.checked,
      participant: {
        ...participant,
        isHost: options.isHost || false,
      },
    }),
  });
  return result.room;
}

async function removeRemoteParticipant(roomId, participantId) {
  const result = await requestJson(`${API_BASE}/rooms/${roomId}/participants/${encodeURIComponent(participantId)}`, {
    method: "DELETE",
  });
  return result.room;
}

function disconnectRoomStream() {
  if (roomStream) {
    roomStream.close();
    roomStream = null;
  }
}

function connectRoomStream(roomId) {
  disconnectRoomStream();
  roomStream = new EventSource(`${API_BASE}/rooms/${roomId}/stream`);
  roomStream.addEventListener("room", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "room-closed") {
      currentRoomId = null;
      currentRoom = null;
      roomCodeInput.value = "";
      clearRoomLocation();
      renderDisconnectedState("当前房间已结束共享。你可以新建房间，或加入其他骑行队伍。");
      disconnectRoomStream();
      return;
    }
    currentRoom = payload.room;
    renderRoom(currentRoom);
  });
  roomStream.addEventListener("error", () => {
    roomHelper.textContent = `房间 ${roomId} 的服务端连接暂时中断，页面仍会尝试重新同步。`;
  });
}

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function getRoomIdFromLocation() {
  const hash = window.location.hash.replace("#", "").trim().toUpperCase();
  return hash || null;
}

function setRoomLocation(roomId) {
  window.location.hash = roomId;
}

function clearRoomLocation() {
  const url = new URL(window.location.href);
  url.hash = "";
  window.history.replaceState({}, "", url);
}

function createParticipant(overrides = {}) {
  const locationFields = getProfileLocationFields();
  const progress = locationFields.routeProgress ?? 0.42;

  return {
    id: profile.id,
    name: profile.name,
    role: profile.role,
    color: profile.color,
    avatar: makeAvatar(profile.name),
    progress,
    speed: profile.baseSpeed,
    variance: profile.variance,
    ...locationFields,
    isBot: false,
    updatedAt: Date.now(),
    lastSeen: Date.now(),
    ...overrides,
  };
}

function ensureSelfParticipant(room) {
  const existing = room.participants[profile.id];
  const locationFields = getProfileLocationFields();
  const locationProgress = locationFields.routeProgress;
  room.participants[profile.id] = {
    ...createParticipant(),
    ...existing,
    id: profile.id,
    name: profile.name,
    role: profile.role,
    color: profile.color,
    avatar: makeAvatar(profile.name),
    speed: profile.baseSpeed,
    progress: locationProgress ?? existing?.progress ?? 0.42,
    ...locationFields,
    smartRole: null,
    isBot: false,
    updatedAt: Date.now(),
    lastSeen: Date.now(),
  };
  return room;
}

function buildDemoParticipants() {
  return demoProfiles.map((demo) => ({
    ...demo,
    avatar: makeAvatar(demo.name),
    isBot: true,
    updatedAt: Date.now(),
    lastSeen: Date.now(),
  }));
}

function ensureDemoParticipants(room) {
  buildDemoParticipants().forEach((demo) => {
    if (!room.demoEnabled) {
      delete room.participants[demo.id];
      return;
    }

    if (!room.participants[demo.id]) {
      room.participants[demo.id] = demo;
    }
  });
  return room;
}

function hasHumanParticipants(room) {
  return Object.values(room.participants || {}).some((participant) => !participant.isBot);
}

function deleteLocalRoom(roomId) {
  if (!storageAvailable || !roomId) return;
  window.localStorage.removeItem(roomStorageKey(roomId));
  if (window.localStorage.getItem(LAST_ROOM_KEY) === roomId) {
    window.localStorage.removeItem(LAST_ROOM_KEY);
  }
  if (syncChannel) {
    syncChannel.postMessage({ type: "room-updated", roomId });
  }
}

function adoptHostIfNeeded(room) {
  const liveParticipants = Object.values(room.participants)
    .filter((participant) => !participant.isBot)
    .sort((a, b) => b.lastSeen - a.lastSeen);
  if (!room.hostId || !room.participants[room.hostId]) {
    room.hostId = liveParticipants[0]?.id || profile.id;
  }
}

function createLocalRoom() {
  const roomId = makeRoomCode();
  const room = {
    id: roomId,
    title: roomDefaults.title,
    hostId: profile.id,
    demoEnabled: demoToggle.checked,
    createdAt: Date.now(),
    participants: {},
  };

  ensureSelfParticipant(room);
  ensureDemoParticipants(room);
  writeRoom(room);
  return room;
}

function getLiveParticipants(room) {
  const now = Date.now();
  return Object.values(room.participants)
    .filter((participant) => participant.isBot || now - participant.lastSeen < LIVE_TTL_MS)
    .sort((a, b) => {
      if (a.id === profile.id) return -1;
      if (b.id === profile.id) return 1;
      return getParticipantRouteProgress(b) - getParticipantRouteProgress(a);
    });
}

function getSelfParticipant(room) {
  return room.participants[profile.id];
}

function applySmartRoles(participants) {
  const realRouteParticipants = participants
    .filter((participant) => !participant.isBot && hasRouteLocation(participant))
    .sort((a, b) => getParticipantRouteDistance(a) - getParticipantRouteDistance(b));

  if (realRouteParticipants.length < 2) {
    participants.forEach((participant) => {
      participant.smartRole = null;
    });
    return participants;
  }

  realRouteParticipants.forEach((participant, index) => {
    if (index === realRouteParticipants.length - 1) {
      participant.smartRole = "智能领骑";
    } else if (index === 0) {
      participant.smartRole = "智能收队";
    } else {
      participant.smartRole = "智能跟骑";
    }
  });

  participants.forEach((participant) => {
    if (participant.isBot || !hasRouteLocation(participant)) {
      participant.smartRole = null;
    }
  });

  return participants;
}

function getDisplayRole(participant) {
  return participant.smartRole || participant.role;
}

function createMemberCard(rider) {
  const fragment = memberTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".member-card");
  const avatar = fragment.querySelector(".avatar");
  const name = fragment.querySelector(".member-name");
  const role = fragment.querySelector(".member-role");
  const distance = fragment.querySelector(".member-distance");
  const speed = fragment.querySelector(".member-speed");

  avatar.textContent = rider.avatar;
  avatar.style.background = `linear-gradient(180deg, ${rider.color}, ${shadeColor(rider.color, -18)})`;
  name.textContent = rider.name;
  role.textContent = rider.role;
  distance.textContent = "与我相距 0 m";
  speed.textContent = `${rider.speed.toFixed(1)} km/h`;

  memberNodes.set(rider.id, { card, role, distance, speed, avatar, name });
  return fragment;
}

function createRiderMarker(rider) {
  const marker = document.createElement("article");
  marker.className = `rider${rider.id === profile.id ? " self" : ""}`;
  marker.innerHTML = `
    <div class="rider-pin"></div>
    <div class="rider-label">
      <strong>${rider.name}</strong>
      <span>${rider.id === profile.id ? "正在领骑" : "与我相距 0 m"}</span>
    </div>
  `;

  marker.querySelector(".rider-pin").style.background = rider.color;
  riderNodes.set(rider.id, marker);
  riderLayer.appendChild(marker);
}

function createInsightItem({ icon, title, copy, color }) {
  const fragment = insightTemplate.content.cloneNode(true);
  const item = fragment.querySelector(".insight-item");
  const iconNode = fragment.querySelector(".insight-icon");
  const titleNode = fragment.querySelector(".insight-title");
  const copyNode = fragment.querySelector(".insight-copy");

  iconNode.style.background = color;
  iconNode.textContent = icon;
  iconNode.style.display = "grid";
  iconNode.style.placeItems = "center";
  iconNode.style.color = "#fff";
  iconNode.style.fontWeight = "700";
  titleNode.textContent = title;
  copyNode.textContent = copy;

  insightList.appendChild(item);
}

function syncProfileControls() {
  displayNameInput.value = profile.name;
  riderRoleSelect.value = profile.role;
  colorSwatches.innerHTML = "";

  colorOptions.forEach((color) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = `swatch${profile.color === color ? " active" : ""}`;
    swatch.style.background = color;
    swatch.setAttribute("aria-label", `选择颜色 ${color}`);
    swatch.addEventListener("click", () => {
      profile.color = color;
      saveProfile();
      syncProfileControls();
      pushSelfUpdate(true);
    });
    colorSwatches.appendChild(swatch);
  });
}

function ensureParticipantNodes(participants) {
  const activeIds = new Set(participants.map((participant) => participant.id));

  participants.forEach((participant) => {
    if (!memberNodes.has(participant.id)) {
      memberList.appendChild(createMemberCard(participant));
    }
    if (!riderNodes.has(participant.id)) {
      createRiderMarker(participant);
    }
  });

  [...memberNodes.keys()].forEach((id) => {
    if (!activeIds.has(id)) {
      memberNodes.get(id).card.remove();
      memberNodes.delete(id);
    }
  });

  [...riderNodes.keys()].forEach((id) => {
    if (!activeIds.has(id)) {
      riderNodes.get(id).remove();
      riderNodes.delete(id);
    }
  });
}

function updateInsights(participants, selfParticipant) {
  insightList.innerHTML = "";
  const others = participants.filter((participant) => participant.id !== selfParticipant.id);

  if (others.length === 0) {
    createInsightItem({
      icon: "邀",
      title: "邀请伙伴加入房间",
      copy: "点击微信分享或复制邀请，把同一路线房间发给同行伙伴，对方打开后即可共享轨迹。",
      color: "linear-gradient(180deg, #4c9eea, #3475d7)",
    });
    return;
  }

  const nearest = others
    .map((participant) => ({
      participant,
      gap: distanceBetweenParticipants(selfParticipant, participant),
    }))
    .sort((a, b) => a.gap - b.gap)[0];

  const farthestBehind = others
    .map((participant) => ({
      participant,
      gap: signedRouteGapMeters(selfParticipant, participant),
    }))
    .filter(({ gap }) => gap < 0)
    .sort((a, b) => a.gap - b.gap)[0]?.participant;

  if (farthestBehind) {
    createInsightItem({
      icon: "慢",
      title: `${farthestBehind.name}略有掉队`,
      copy: `与您相距 ${Math.round(
        distanceBetweenParticipants(selfParticipant, farthestBehind),
      )} 米，建议在世博大道口前减速等待。`,
      color: "linear-gradient(180deg, #f0a356, #de6f4d)",
    });
  }

  if (nearest) {
    createInsightItem({
      icon: "稳",
      title: `离你最近的是${nearest.participant.name}`,
      copy: `当前相距 ${Math.round(nearest.gap)} 米，队伍仍保持在可感知范围内，无需频繁回头。`,
      color: "linear-gradient(180deg, #2dbb86, #159664)",
    });
  }

  createInsightItem({
    icon: "点",
    title: "共享点位适合补给",
    copy: "前方 1.2 公里的桥下阴凉区依然适合作为临时等待点，能减少主路停留风险。",
    color: "linear-gradient(180deg, #4c9eea, #3475d7)",
  });
}

function renderRoom(room) {
  if (!room) return;

  const participants = applySmartRoles(getLiveParticipants(room));
  const selfParticipant = getSelfParticipant(room);
  if (!selfParticipant) return;

  ensureParticipantNodes(participants);

  participants.forEach((participant) => {
    const point = getRoutePoint(getParticipantRouteProgress(participant));
    const marker = riderNodes.get(participant.id);
    const pin = marker.querySelector(".rider-pin");
    const label = marker.querySelector(".rider-label");
    const labelTitle = label.querySelector("strong");
    const labelCopy = label.querySelector("span");
    const memberNode = memberNodes.get(participant.id);

    marker.className = `rider${participant.id === selfParticipant.id ? " self" : ""}`;
    marker.style.left = `${point.x}%`;
    marker.style.top = `${point.y}%`;
    pin.style.background = participant.color;
    labelTitle.textContent = participant.name;

    memberNode.avatar.textContent = participant.avatar;
    memberNode.avatar.style.background = `linear-gradient(180deg, ${participant.color}, ${shadeColor(
      participant.color,
      -18,
    )})`;
    memberNode.name.textContent = participant.name;

    if (participant.id === selfParticipant.id) {
      memberNode.distance.textContent = hasRouteLocation(participant) ? "路线里程基准" : "当前位置基准";
      memberNode.role.textContent = `${getDisplayRole(participant)} · 共享中`;
      memberNode.speed.textContent = `${participant.speed.toFixed(1)} km/h`;
      label.classList.remove("warn");
      labelCopy.textContent = hasRouteLocation(participant)
        ? "按路线计算距离"
        : `速度 ${participant.speed.toFixed(1)} km/h`;
      return;
    }

    const gap = distanceBetweenParticipants(selfParticipant, participant);
    const signedGap = signedRouteGapMeters(selfParticipant, participant);
    const isBehind = signedGap < 0;
    const distanceText = `${Math.round(gap)} m`;

    memberNode.distance.textContent = `与我相距 ${distanceText}`;
    memberNode.role.textContent = `${getDisplayRole(participant)} · ${isBehind ? "后方" : "前方"} ${distanceText}`;
    memberNode.speed.textContent = `${participant.speed.toFixed(1)} km/h`;
    labelCopy.textContent = `${isBehind ? "后方" : "前方"} ${distanceText}`;
    label.classList.toggle("warn", gap > 280 && isBehind);
  });

  const others = participants.filter((participant) => participant.id !== selfParticipant.id);
  const nearest = others
    .map((participant) => ({
      participant,
      gap: distanceBetweenParticipants(selfParticipant, participant),
    }))
    .sort((a, b) => a.gap - b.gap)[0];
  const maxGap = Math.max(
    0,
    ...others.map((participant) => distanceBetweenParticipants(selfParticipant, participant)),
  );

  selfSpeed.textContent = `${selfParticipant.speed.toFixed(1)} km/h`;
  nearestRider.textContent = nearest
    ? `${nearest.participant.name} · ${Math.round(nearest.gap)} m`
    : "等待队友加入";
  riskLevel.textContent = others.length ? riskText(maxGap) : "低";
  teamCount.textContent = `${participants.length} 人`;
  roomCodePill.textContent = `房间 ${room.id}`;
  roomSyncPill.textContent = `${participants.length} 人同步中`;
  roomModeBadge.textContent = useRealLocation ? "真实定位" : `房间 ${room.id}`;
  statusRibbonCopy.textContent = useRealLocation
    ? `房间 ${room.id} 正在共享真实定位，距离按骑行路线里程差计算`
    : `房间 ${room.id} 正在共享位置，${participants.length} 位骑友沿同一路线同步`;
  roomHelper.textContent = `当前房间 ${room.id} 已连接。打开新标签后输入同一邀请码，就能看到新的骑友实时出现在地图上。`;

  updateInsights(participants, selfParticipant);
}

function clearRenderedParticipants() {
  memberList.innerHTML = "";
  riderLayer.innerHTML = "";
  memberNodes.clear();
  riderNodes.clear();
}

function renderDisconnectedState(copy = "你已退出共享房间。可以重新新建房间，或输入邀请码加入其他骑行队伍。") {
  clearRenderedParticipants();
  insightList.innerHTML = "";
  createInsightItem({
    icon: "房",
    title: "当前未共享位置",
    copy: "新建房间后可邀请同行骑友加入；也可以输入邀请码重新接入已有队伍。",
    color: "linear-gradient(180deg, #4c9eea, #3475d7)",
  });

  selfSpeed.textContent = `${profile.baseSpeed.toFixed(1)} km/h`;
  nearestRider.textContent = "等待加入房间";
  riskLevel.textContent = "低";
  teamCount.textContent = "0 人";
  roomCodePill.textContent = "未共享";
  roomSyncPill.textContent = "等待连接";
  roomModeBadge.textContent = "未共享";
  statusRibbonCopy.textContent = "当前未在共享房间中，创建或加入房间后会每 2 秒同步一次位置";
  roomHelper.textContent = copy;
}

function updateBots(room) {
  if (!room.demoEnabled || room.hostId !== profile.id) return;

  demoProfiles.forEach((demo, index) => {
    const participant = room.participants[demo.id];
    if (!participant) return;
    const paceOffset = Math.sin(frameCount / 18 + index * 1.1) * participant.variance;
    participant.progress = Math.min(0.92, participant.progress + 0.001 + paceOffset * 0.04);
    participant.speed = Math.max(15.2, Math.min(23.4, participant.speed + paceOffset * 10));
    participant.updatedAt = Date.now();
    participant.lastSeen = Date.now();
  });
}

async function pushSelfUpdate(forceRender = false) {
  if (!currentRoomId) return;
  const room = syncMode === "remote" ? currentRoom : readRoom(currentRoomId) || currentRoom;
  if (!room) return;

  frameCount += 1;
  room.demoEnabled = demoToggle.checked;
  adoptHostIfNeeded(room);
  ensureSelfParticipant(room);
  ensureDemoParticipants(room);

  const selfParticipant = room.participants[profile.id];
  const paceOffset = Math.sin(frameCount / 20) * selfParticipant.variance;

  if (isRunning) {
    if (!hasRouteLocation(selfParticipant)) {
      selfParticipant.progress = Math.min(0.94, selfParticipant.progress + 0.0016 + paceOffset * 0.04);
    }
    selfParticipant.speed = Math.max(16.8, Math.min(25.2, selfParticipant.speed + paceOffset * 10));
  }

  selfParticipant.updatedAt = Date.now();
  selfParticipant.lastSeen = Date.now();

  updateBots(room);

  if (syncMode === "remote") {
    currentRoom = await upsertRemoteParticipant(currentRoomId, selfParticipant, {
      isHost: room.hostId === profile.id,
    });
  } else {
    writeRoom(room);
    currentRoom = room;
  }

  if (forceRender) {
    renderRoom(currentRoom);
  }
}

async function joinLocalRoom(roomId) {
  const normalized = roomId.trim().toUpperCase();
  const room = readRoom(normalized);
  if (!room) {
    roomHelper.textContent = `房间 ${normalized} 不存在。请先在一个标签页里新建房间，再输入同样的邀请码。`;
    return;
  }

  room.demoEnabled = demoToggle.checked;
  adoptHostIfNeeded(room);
  ensureSelfParticipant(room);
  ensureDemoParticipants(room);
  writeRoom(room);

  currentRoomId = room.id;
  currentRoom = room;
  roomCodeInput.value = room.id;
  setRoomLocation(room.id);
  renderRoom(room);
}

async function joinRemoteRoom(roomId) {
  const normalized = roomId.trim().toUpperCase();
  const room = await fetchRemoteRoom(normalized);
  const participant = {
    ...createParticipant(),
    updatedAt: Date.now(),
    lastSeen: Date.now(),
  };
  const syncedRoom = await upsertRemoteParticipant(normalized, participant);
  currentRoomId = syncedRoom.id;
  currentRoom = syncedRoom;
  roomCodeInput.value = syncedRoom.id;
  setRoomLocation(syncedRoom.id);
  connectRoomStream(syncedRoom.id);
  renderRoom(syncedRoom);
}

async function leaveLocalRoom() {
  if (!currentRoomId) return;
  const room = readRoom(currentRoomId) || currentRoom;
  if (!room) return;

  delete room.participants[profile.id];
  adoptHostIfNeeded(room);

  if (hasHumanParticipants(room)) {
    ensureDemoParticipants(room);
    writeRoom(room);
  } else {
    deleteLocalRoom(currentRoomId);
  }
}

async function leaveRemoteRoom(options = {}) {
  if (!currentRoomId) return;

  if (options.useBeacon && navigator.sendBeacon) {
    navigator.sendBeacon(
      `${API_BASE}/rooms/${currentRoomId}/participants/${encodeURIComponent(profile.id)}?_method=DELETE`,
      new Blob([], { type: "application/json" }),
    );
    return;
  }

  await removeRemoteParticipant(currentRoomId, profile.id);
}

async function leaveRoom(options = {}) {
  const roomId = currentRoomId;
  if (!roomId) {
    renderDisconnectedState();
    return;
  }

  disconnectRoomStream();

  try {
    if (syncMode === "remote") {
      await leaveRemoteRoom(options);
    } else {
      await leaveLocalRoom();
    }
  } catch {
    if (!options.silent) {
      roomHelper.textContent = `退出房间 ${roomId} 失败，请稍后重试。`;
    }
    return;
  }

  currentRoomId = null;
  currentRoom = null;
  roomCodeInput.value = "";
  clearRoomLocation();
  renderDisconnectedState(
    options.silent
      ? "共享已自动结束。重新打开页面后可以继续创建或加入房间。"
      : `你已退出房间 ${roomId}。可以重新新建房间，或输入邀请码加入其他骑行队伍。`,
  );
}

async function createRoom() {
  if (currentRoomId) {
    await leaveRoom({ silent: true });
  }

  if (syncMode === "remote") {
    const room = await createRemoteRoom();
    const syncedRoom = await upsertRemoteParticipant(room.id, createParticipant(), { isHost: true });
    currentRoomId = syncedRoom.id;
    currentRoom = syncedRoom;
    roomCodeInput.value = syncedRoom.id;
    setRoomLocation(syncedRoom.id);
    connectRoomStream(syncedRoom.id);
    renderRoom(syncedRoom);
    return syncedRoom;
  }

  const room = createLocalRoom();
  currentRoomId = room.id;
  currentRoom = room;
  roomCodeInput.value = room.id;
  setRoomLocation(room.id);
  renderRoom(room);
  return room;
}

async function joinRoom(roomId) {
  const normalized = roomId.trim().toUpperCase();
  if (!normalized) return null;

  if (currentRoomId && currentRoomId !== normalized) {
    await leaveRoom({ silent: true });
  }

  if (syncMode === "remote") {
    return joinRemoteRoom(normalized);
  }
  return joinLocalRoom(normalized);
}

function openCurrentRoomInNewTab() {
  const roomId = currentRoomId || currentRoom?.id;
  if (!roomId) return;
  const nextMember = `guest${Math.random().toString(36).slice(2, 5)}`;
  const params = new URLSearchParams(window.location.search);
  params.set("member", nextMember);
  params.set("name", "新队友");
  params.set("role", "跟骑");
  params.set("demo", "0");
  const target = `${window.location.pathname}?${params.toString()}#${roomId}`;
  window.open(target, "_blank", "noopener,noreferrer");
}

function buildGuestInviteUrl(roomId) {
  const params = new URLSearchParams(window.location.search);
  params.set("member", `guest-${roomId.toLowerCase()}`);
  params.set("name", "骑行伙伴");
  params.set("role", "跟骑");
  params.set("demo", demoToggle.checked ? "1" : "0");
  params.delete("lat");
  params.delete("lng");
  params.delete("lon");
  params.delete("accuracy");

  return `${getPublicBaseUrl()}${window.location.pathname}?${params.toString()}#${roomId}`;
}

function buildInviteText(roomId) {
  return `我正在高德骑行路线里共享实时位置，点击加入骑行房间 ${roomId}：\n${buildGuestInviteUrl(roomId)}`;
}

async function copyTextToClipboard(text) {
  await navigator.clipboard.writeText(text);
}

async function copyRoomInvite() {
  const roomId = currentRoomId || currentRoom?.id;
  if (!roomId) return;
  const inviteText = buildInviteText(roomId);

  try {
    await copyTextToClipboard(inviteText);
    roomHelper.textContent = `微信邀请文案已复制。发给同行伙伴后，对方打开链接即可进入同一房间共享轨迹。`;
  } catch {
    roomHelper.textContent = `当前浏览器不支持直接复制，请手动记录邀请码 ${roomId}。`;
  }
}

async function shareRoomInvite() {
  const roomId = currentRoomId || currentRoom?.id;
  if (!roomId) return;

  const shareData = {
    title: `加入骑行房间 ${roomId}`,
    text: "我正在骑行路线上共享实时位置，一起进入房间看队友位置和路线距离。",
    url: buildGuestInviteUrl(roomId),
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      roomHelper.textContent = `已打开系统分享面板。选择微信发送给骑行伙伴即可加入房间 ${roomId}。`;
      return;
    }

    await copyTextToClipboard(buildInviteText(roomId));
    roomHelper.textContent = "当前浏览器没有系统分享面板，已复制微信邀请文案。";
  } catch (error) {
    if (error?.name === "AbortError") {
      roomHelper.textContent = "分享已取消，房间仍在同步中。";
      return;
    }

    roomHelper.textContent = "分享面板不可用，建议使用“复制邀请”后粘贴到微信。";
  }
}

function bindEvents() {
  collapsePanelButton.addEventListener("click", () => {
    setPanelCollapsed(!isPanelCollapsed);
  });

  expandPanelButton.addEventListener("click", () => {
    setPanelCollapsed(false);
  });

  railButtons.forEach((button) => {
    button.addEventListener("click", () => {
      revealPanelFromRail(button.dataset.panelTarget);
    });
  });

  toggleMotionButton.addEventListener("click", () => {
    isRunning = !isRunning;
    toggleMotionButton.textContent = isRunning ? "暂停模拟" : "继续模拟";
  });

  displayNameInput.addEventListener("change", () => {
    profile.name = displayNameInput.value.trim() || "我";
    saveProfile();
    syncProfileControls();
    void pushSelfUpdate(true);
  });

  riderRoleSelect.addEventListener("change", () => {
    profile.role = riderRoleSelect.value;
    saveProfile();
    void pushSelfUpdate(true);
  });

  demoToggle.addEventListener("change", () => {
    void pushSelfUpdate(true);
  });

  liveLocationToggle.addEventListener("change", () => {
    setRealLocationEnabled(liveLocationToggle.checked);
  });

  createRoomButton.addEventListener("click", () => {
    void createRoom().catch(() => {
      roomHelper.textContent = "创建房间失败，已回退到本地演示同步模式。";
      syncMode = "local";
    });
  });

  joinRoomButton.addEventListener("click", () => {
    if (roomCodeInput.value.trim()) {
      void joinRoom(roomCodeInput.value).catch(() => {
        roomHelper.textContent = `加入房间 ${roomCodeInput.value.trim().toUpperCase()} 失败，请确认服务端已启动。`;
      });
    }
  });

  copyRoomButton.addEventListener("click", () => {
    copyRoomInvite();
  });

  shareRoomButton.addEventListener("click", () => {
    shareRoomInvite();
  });

  leaveRoomButton.addEventListener("click", () => {
    void leaveRoom();
  });

  openTabButton.addEventListener("click", () => {
    openCurrentRoomInNewTab();
  });

  openAmapNavigationButton.addEventListener("click", () => {
    openAmapNavigation();
  });

  window.addEventListener("storage", (event) => {
    if (!currentRoomId) return;
    if (event.key === roomStorageKey(currentRoomId)) {
      const room = readRoom(currentRoomId);
      if (room) {
        currentRoom = room;
        renderRoom(room);
      }
    }
  });

  if (syncChannel) {
    syncChannel.addEventListener("message", (event) => {
      if (event.data?.roomId !== currentRoomId) return;
      const room = readRoom(currentRoomId);
      if (room) {
        currentRoom = room;
        renderRoom(room);
        return;
      }

      currentRoomId = null;
      currentRoom = null;
      roomCodeInput.value = "";
      clearRoomLocation();
      renderDisconnectedState("当前房间已结束共享。你可以新建房间，或加入其他骑行队伍。");
    });
  }

  window.addEventListener("beforeunload", () => {
    if (!currentRoomId) return;
    void leaveRoom({ silent: true, useBeacon: true });
  });
}

function bootstrap() {
  isPanelCollapsed = loadPanelPreference() && window.innerWidth > 1180;
  useRealLocation = loadRealLocationPreference();
  renderPanelState();
  syncRealLocationToggle();
  syncProfileControls();
  updateRouteSummary();
  bindEvents();
  void initAmap();
  updateLocationStatus("当前使用模拟骑行轨迹。开启后会申请浏览器定位权限，并把真实坐标同步给房间成员。");

  const boot = async () => {
    const hasTestLocation = applyLaunchLocationOverride();
    const roomId = getRoomIdFromLocation();

    try {
      await fetchRemoteRoom(roomId || "PING").catch(() => null);
      syncMode = "remote";
      if (launchOverrides.demo === "0") {
        demoToggle.checked = false;
      }
      if (roomId) {
        await joinRemoteRoom(roomId);
      } else {
        renderDisconnectedState("还未进入共享房间。点击“新建房间”开始共享，或输入邀请码加入同行队伍。");
      }
      if (hasTestLocation) {
        useRealLocation = true;
        syncRealLocationToggle();
        updateLocationStatus(
          `已使用链接中的测试经纬度进入真实定位演示，距离会按骑行路线里程差计算。`,
        );
      } else if (useRealLocation) {
        startRealLocationWatch();
      }
      if (roomId) {
        roomHelper.textContent = `当前已连接服务端同步。房间状态会在不同浏览器实例之间实时共享。`;
      }
    } catch {
      syncMode = "local";
      if (!storageAvailable) {
        roomHelper.textContent = "服务端未连接，且当前页面环境不支持本地房间同步。建议通过 npm start 启动服务端后访问。";
      } else {
        roomHelper.textContent = "服务端未连接，当前回退到本地演示同步模式。启动服务端后刷新页面即可切到真实同步。";
      }
      if (roomId) {
        const room = readRoom(roomId);
        if (room) {
          room.demoEnabled = room.demoEnabled ?? true;
          adoptHostIfNeeded(room);
          ensureSelfParticipant(room);
          ensureDemoParticipants(room);
          writeRoom(room);
          currentRoomId = room.id;
          currentRoom = room;
          roomCodeInput.value = room.id;
          demoToggle.checked = room.demoEnabled ?? true;
          setRoomLocation(room.id);
          renderRoom(room);
        } else {
          clearRoomLocation();
          renderDisconnectedState(`房间 ${roomId} 暂不可用。你可以新建房间，或确认邀请码后重新加入。`);
        }
      } else {
        renderDisconnectedState("当前处于本地演示模式。点击“新建房间”开始共享，或输入邀请码加入已有房间。");
      }
      if (hasTestLocation) {
        useRealLocation = true;
        syncRealLocationToggle();
        updateLocationStatus(
          `已使用链接中的测试经纬度进入真实定位演示，距离会按骑行路线里程差计算。`,
        );
      } else if (useRealLocation) {
        startRealLocationWatch();
      }
    }

    window.setInterval(() => {
      void pushSelfUpdate();
    }, HEARTBEAT_MS);

    if (hasTestLocation) {
      void pushSelfUpdate(true);
    }
  };

  void boot();
}

bootstrap();

function isLocalDevelopmentHost() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  window.addEventListener("load", async () => {
    if (isLocalDevelopmentHost()) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
        if ("caches" in window) {
          const keys = await window.caches.keys();
          await Promise.all(keys.filter((key) => key.startsWith("cycling-buddy-")).map((key) => window.caches.delete(key)));
        }
      } catch {
        // Local development should still continue even if cache cleanup fails.
      }
      return;
    }

    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // The app still works without offline caching, so registration failures are non-blocking.
    });
  });
}
