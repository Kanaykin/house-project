/* План этажа — редактор
   Все размеры хранятся в миллиметрах.
   Y растёт вниз, координаты SVG в мм.
   Проект хранит два этажа: F1 и F2. Активный этаж определяется state.currentFloor.
*/
'use strict';

const STORAGE_KEY = 'planhouse.v3.state';
const DEFAULT_THICKNESS_EXT = 400;
const DEFAULT_THICKNESS_INT = 150;
const SOURCE_SCALE = 10; // 1 единица normalized_image = 10 мм

function m(value) {
  return { value };
}

// ---- Конвертер: source (input JSON) → внутренняя схема редактора ----
function convertSourceToEditor(src) {
  const vertices = [];
  const vertexSnap = 20; // допуск склеивания концов стен, единицы source
  const findOrAddVertex = (x, y) => {
    for (const v of vertices) {
      if (Math.abs(v._sx - x) <= vertexSnap && Math.abs(v._sy - y) <= vertexSnap) return v.id;
    }
    const id = 'v' + String(vertices.length + 1).padStart(3, '0');
    vertices.push({ id, x: Math.round(x * SOURCE_SCALE), y: Math.round(y * SOURCE_SCALE), _sx: x, _sy: y });
    return id;
  };
  const walls = (src.walls || []).map(w => {
    const v1 = findOrAddVertex(w.from[0], w.from[1]);
    const v2 = findOrAddVertex(w.to[0], w.to[1]);
    const isExt = w.kind === 'exterior';
    return {
      id: w.id, v1, v2, type: isExt ? 'exterior' : 'partition',
      thickness: m(isExt ? DEFAULT_THICKNESS_EXT : DEFAULT_THICKNESS_INT, 'estimated'),
      height: m(null, 'unknown'),
      note: w.kind === 'interface' ? 'граница выступа (interface)' : ''
    };
  });
  vertices.forEach(v => { delete v._sx; delete v._sy; });

  const wallById = (id) => walls.find(w => w.id === id);
  const vertById = (id) => vertices.find(v => v.id === id);
  const wallLen = (w) => {
    const a = vertById(w.v1), b = vertById(w.v2);
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  const rooms = (src.rooms || []).map(r => ({
    id: r.id, name: r.label || r.id,
    use: r.verifiedUse || (Array.isArray(r.possibleUse) ? r.possibleUse.join(' / ') : (r.possibleUse || '')),
    ceilingHeight: m(null, 'unknown'),
    walls: (r.boundaryWallIds || []).slice(),
    note: Array.isArray(r.notes) ? r.notes.join('; ') : ''
  }));

  const doors = (src.doors || []).map(d => {
    const w = wallById(d.nearWallId);
    const wl = w ? wallLen(w) : 2000;
    const width = d.widthMm || 900;
    const distance = Math.max(100, Math.round(wl / 2 - width / 2));
    return {
      id: d.id, wallId: d.nearWallId,
      distance: m(distance, 'estimated'),
      width: m(width, 'estimated'),
      height: m(2100, 'estimated'),
      hinge: 'left', swing: 'in',
      note: 'между: ' + (Array.isArray(d.between) ? d.between.join(' ↔ ') : '')
    };
  });

  const positionToFraction = (pos) => {
    if (!pos) return 0.5;
    const p = pos.toLowerCase();
    if (p.includes('upper_left') || p.includes('bottom_left') || p.includes('top_left')) return 0.2;
    if (p.includes('upper_right') || p.includes('bottom_right') || p.includes('top_right')) return 0.8;
    if (p.includes('upper') || p.includes('top') || p === 'left') return 0.3;
    if (p.includes('lower') || p.includes('bottom') || p === 'right') return 0.7;
    return 0.5;
  };
  const windows = (src.windows || []).map(o => {
    const w = wallById(o.wallId);
    const wl = w ? wallLen(w) : 2000;
    const width = o.widthMm || 900;
    const frac = positionToFraction(o.position);
    const distance = Math.max(100, Math.min(wl - width - 100, Math.round(frac * wl - width / 2)));
    return {
      id: o.id, wallId: o.wallId,
      distance: m(distance, 'estimated'),
      width: m(width, 'estimated'),
      height: m(o.heightMm || 1400, 'estimated'),
      sillHeight: m(o.sillHeightMm != null ? o.sillHeightMm : 900, 'estimated'),
      note: 'позиция по фото: ' + (o.position || '—')
    };
  });

  // Лестница: размещаем внутри своего помещения (в его bbox по source-полигону)
  const roomBBoxSrc = (roomId) => {
    const r = (src.rooms || []).find(x => x.id === roomId);
    if (!r || !r.estimatedPolygon) return null;
    const xs = r.estimatedPolygon.map(p => p[0]);
    const ys = r.estimatedPolygon.map(p => p[1]);
    return {
      x: Math.min(...xs) * SOURCE_SCALE, y: Math.min(...ys) * SOURCE_SCALE,
      w: (Math.max(...xs) - Math.min(...xs)) * SOURCE_SCALE,
      h: (Math.max(...ys) - Math.min(...ys)) * SOURCE_SCALE
    };
  };
  const stairs = (src.stairs || []).map(s => {
    const bb = roomBBoxSrc(s.roomId);
    let x = 1000, y = 1000, width = 2400, depth = 1200;
    if (bb) {
      width = Math.min(2400, Math.max(1200, bb.w * 0.5));
      depth = Math.min(1400, Math.max(800, bb.h * 0.35));
      x = bb.x + 200;
      y = bb.y + 200;
    }
    return {
      id: s.id, roomId: s.roomId,
      x: Math.round(x), y: Math.round(y),
      width: Math.round(width), depth: Math.round(depth),
      rotation: 0, flights: 2, direction: 'up',
      note: s.direction || ''
    };
  });

  return {
    schemaVersion: '2.0',
    units: 'mm',
    settings: { defaultCeilingHeight: null },
    sourceMeta: {
      floor: src.floor,
      image: src.source && src.source.file
    },
    vertices, walls, rooms, doors, windows, stairs,
    furniture: []
  };
}

function buildInitialFloors() {
  if (!window.SOURCE_PLANS) throw new Error('SOURCE_PLANS не загружен (проверь source-plans.js)');
  return {
    F1: convertSourceToEditor(window.SOURCE_PLANS.F1),
    F2: convertSourceToEditor(window.SOURCE_PLANS.F2)
  };
}

// ---- Состояние приложения ----
const state = {
  floors: null,           // { F1: plan, F2: plan }
  currentFloor: 'F1',
  plan: null,             // ссылка на активный этаж
  ui: {
    selected: null,
    mode: 'select',
    modeData: null,
    layers: { roomNames:true, roomAreas:true, wallNumbers:true, dimensions:true, doors:true, windows:true, furniture:true, stairs:true },
    view: { F1: { scale: 0.1, tx: 40, ty: 40 }, F2: { scale: 0.1, tx: 40, ty: 40 } }
  }
};

const historyByFloor = { F1: { past: [], future: [] }, F2: { past: [], future: [] } };
const HIST_MAX = 100;

// ---- Утилиты ----
const svg = document.getElementById('plan');
const viewport = document.getElementById('viewport');
const $ = (id) => document.getElementById(id);
const clone = (o) => JSON.parse(JSON.stringify(o));
function currentView() { return state.ui.view[state.currentFloor]; }
function currentHist() { return historyByFloor[state.currentFloor]; }

function nextId(prefix, existing) {
  const nums = existing.map(x => {
    const mm = String(x.id||'').match(new RegExp('(?:^|-)' + prefix + '(\\d+)$'));
    return mm ? parseInt(mm[1],10) : 0;
  });
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  // Сохраняем префикс этажа для новых элементов
  const floorPrefix = state.currentFloor + '-' + prefix;
  return floorPrefix + String(n).padStart(2,'0');
}

function findById(list, id) { return list.find(x => x.id === id); }
function vById(id) { return findById(state.plan.vertices, id); }
function wallLen(w) { const a=vById(w.v1),b=vById(w.v2); return Math.hypot(a.x-b.x,a.y-b.y); }
function wallAngle(w) { const a=vById(w.v1),b=vById(w.v2); return Math.atan2(b.y-a.y, b.x-a.x); }
function wallNormal(w) { const ang=wallAngle(w); return { x:-Math.sin(ang), y:Math.cos(ang) }; }
function wallMidpoint(w) { const a=vById(w.v1),b=vById(w.v2); return { x:(a.x+b.x)/2, y:(a.y+b.y)/2 }; }
function pointOnWall(w, dist) {
  const a=vById(w.v1),b=vById(w.v2);
  const L=Math.hypot(a.x-b.x,a.y-b.y); const t=L?dist/L:0;
  return { x: a.x + (b.x-a.x)*t, y: a.y + (b.y-a.y)*t };
}
function numOr(mo) { return mo && mo.value != null ? mo.value : null; }

// ========== v3: ЯКОРЯ И РАЗМЕРНАЯ ЦЕПОЧКА ==========
// Якорь — точка на стене с offsetMm от wall_start. Типы:
//   wall_start, wall_end — концы стены;
//   opening_start, opening_end — края окна/двери (со ссылкой objectId);
//   wall_junction — примыкание другой стены (со ссылкой objectId);
//   user_point — произвольная контрольная точка (со ссылкой label).
// Массив wall.anchors всегда отсортирован по offsetMm.
// Источник правды для позиции проёма пока остаётся door.distance/width (v2),
// якоря опережающего типа opening_* пересчитываются из этих полей.

function nextAnchorId(floor, walls) {
  const rx = new RegExp('^' + floor + '-A(\\d+)$');
  let max = 0;
  for (const w of walls) {
    for (const a of (w.anchors || [])) {
      const m = rx.exec(a.id);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  return floor + '-A' + String(max + 1).padStart(2, '0');
}

function openingsOnWall(wall, plan) {
  const doors = plan.doors.filter(d => d.wallId === wall.id).map(d => ({ obj: d, kind: 'door' }));
  const wins  = plan.windows.filter(o => o.wallId === wall.id).map(o => ({ obj: o, kind: 'window' }));
  return [...doors, ...wins];
}

// Пересчитывает якоря стены из текущих проёмов и её длины.
// Сохраняет пользовательские якоря (user_point), пересоздаёт остальные.
function rebuildWallAnchors(wall, plan, floor) {
  const L = Math.round(wallLen(wall));
  const oldAnchors = wall.anchors || [];
  const kept = oldAnchors.filter(a => a.type === 'user_point');

  const anchors = [];
  // wall_start / wall_end — сохраняем ID если существовали
  const oldStart = oldAnchors.find(a => a.type === 'wall_start');
  const oldEnd = oldAnchors.find(a => a.type === 'wall_end');
  anchors.push({ id: oldStart ? oldStart.id : nextAnchorId(floor, plan.walls), type: 'wall_start', offsetMm: 0 });
  anchors.push({ id: oldEnd ? oldEnd.id : nextAnchorId(floor, plan.walls), type: 'wall_end', offsetMm: L });

  // opening_start / opening_end для каждой двери/окна
  for (const { obj } of openingsOnWall(wall, plan)) {
    const dist = numOr(obj.distance) || 0;
    const width = numOr(obj.width) || 900;
    const oldOs = oldAnchors.find(a => a.type === 'opening_start' && a.objectId === obj.id);
    const oldOe = oldAnchors.find(a => a.type === 'opening_end' && a.objectId === obj.id);
    anchors.push({
      id: oldOs ? oldOs.id : nextAnchorId(floor, plan.walls),
      type: 'opening_start', objectId: obj.id, offsetMm: dist
    });
    anchors.push({
      id: oldOe ? oldOe.id : nextAnchorId(floor, plan.walls),
      type: 'opening_end', objectId: obj.id, offsetMm: dist + width
    });
  }

  // wall_junction: если внутри стены (не в её концах) заканчивается другая стена
  for (const other of plan.walls) {
    if (other.id === wall.id) continue;
    for (const vid of [other.v1, other.v2]) {
      // v уже конец текущей стены — не junction
      if (vid === wall.v1 || vid === wall.v2) continue;
      const v = plan.vertices.find(v => v.id === vid); if (!v) continue;
      // проекция v на стену
      const a = plan.vertices.find(x => x.id === wall.v1);
      const b = plan.vertices.find(x => x.id === wall.v2);
      if (!a || !b) continue;
      const ax = b.x - a.x, ay = b.y - a.y;
      const len2 = ax*ax + ay*ay; if (len2 < 1) continue;
      const t = ((v.x - a.x) * ax + (v.y - a.y) * ay) / len2;
      if (t <= 0.001 || t >= 0.999) continue;
      // расстояние точки до линии
      const px = a.x + t*ax, py = a.y + t*ay;
      const d = Math.hypot(v.x - px, v.y - py);
      if (d > 50) continue; // не на стене
      const offset = Math.round(t * Math.sqrt(len2));
      const oldJ = oldAnchors.find(a => a.type === 'wall_junction' && a.objectId === other.id);
      // избегаем дубликата
      if (anchors.find(a => a.type === 'wall_junction' && a.objectId === other.id)) continue;
      anchors.push({
        id: oldJ ? oldJ.id : nextAnchorId(floor, plan.walls),
        type: 'wall_junction', objectId: other.id, offsetMm: offset
      });
    }
  }

  // Сохранённые user_point, приведённые в границы [0..L]
  for (const up of kept) {
    if (up.offsetMm < 0 || up.offsetMm > L) continue;
    anchors.push(up);
  }

  anchors.sort((a, b) => a.offsetMm - b.offsetMm);
  wall.anchors = anchors;
}

function ensureAllAnchors(plan, floor) {
  for (const w of plan.walls) rebuildWallAnchors(w, plan, floor);
}

// Описание участка цепочки — короткая подпись.
function describeAnchor(a) {
  switch (a.type) {
    case 'wall_start': return 'начало стены';
    case 'wall_end':   return 'конец стены';
    case 'opening_start': return 'начало ' + (a.objectId || '?');
    case 'opening_end':   return 'конец '  + (a.objectId || '?');
    case 'wall_junction': return 'стык со ' + (a.objectId || '?');
    case 'user_point':    return a.label || 'точка ' + a.id;
    default: return a.id;
  }
}

// Заявленная длина стены = offsetMm якоря wall_end. Единый источник истины —
// размерная цепочка; отдельного поля declaredLength больше нет.
function chainDeclaredLen(wall) {
  const end = (wall && wall.anchors) ? wall.anchors.find(a => a.type === 'wall_end') : null;
  return end && end.offsetMm > 0 ? end.offsetMm : null;
}

function computeChainSegments(wall) {
  const anchors = [...(wall.anchors || [])].sort((a, b) => a.offsetMm - b.offsetMm);
  const out = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const from = anchors[i], to = anchors[i+1];
    const valueMm = Math.max(0, Math.round(to.offsetMm - from.offsetMm));
    // Специальный лейбл: если участок — ширина одного проёма
    let label;
    if (from.type === 'opening_start' && to.type === 'opening_end' && from.objectId && from.objectId === to.objectId) {
      label = 'Ширина ' + from.objectId;
    } else {
      label = describeAnchor(from) + ' → ' + describeAnchor(to);
    }
    out.push({ from, to, valueMm, label, isOpeningWidth: label.startsWith('Ширина ') });
  }
  return out;
}

// Применить изменение участка цепочки. Возвращает { changed, hint }.
function applyChainSegmentChange(wall, segment, newValueMm) {
  const from = segment.from, to = segment.to;
  const totalLen = wallLen(wall); // ← сохраняем общую длину стены неизменной

  // Хелпер: найти проём по objectId
  const findOpening = (id) => findById(state.plan.doors, id) || findById(state.plan.windows, id);

  // 1. Участок «ширина проёма» — меняем width, opening_start остаётся на месте,
  //    opening_end двигается на новую позицию → следующий участок компенсирует.
  if (segment.isOpeningWidth) {
    const obj = findOpening(from.objectId);
    if (!obj) return { changed:false, hint:'проём не найден' };
    const newWidth = Math.max(1, Math.round(newValueMm));
    const startOffset = from.offsetMm;
    if (startOffset + newWidth > totalLen - 1) {
      return { changed:false, hint:'новая ширина не помещается — проём выйдет за конец стены' };
    }
    pushHistory();
    obj.width = obj.width || m(900);
    obj.width.value = newWidth;
    return { changed:true, hint:'ширина '+obj.id+' обновлена (общая длина стены не изменилась)' };
  }

  // 2. Участок «... → opening_start/opening_end» — двигаем проём to.objectId
  if (to.type === 'opening_start' || to.type === 'opening_end') {
    const obj = findOpening(to.objectId);
    if (!obj) return { changed:false, hint:'проём не найден' };
    const width = numOr(obj.width) || 900;
    // Новая позиция начала проёма = from.offsetMm + newValueMm (если to = opening_start)
    // Если to = opening_end: newDist = from.offset + newValue - width
    let newDist = (to.type === 'opening_start')
      ? from.offsetMm + newValueMm
      : from.offsetMm + newValueMm - width;
    if (newDist < 0) return { changed:false, hint:'нельзя: проём выйдет за начало стены' };
    if (newDist + width > totalLen) return { changed:false, hint:'нельзя: проём выйдет за конец стены' };
    pushHistory();
    obj.distance = obj.distance || m(0);
    obj.distance.value = Math.round(newDist);
    return { changed:true, hint:'проём '+obj.id+' сдвинут (общая длина стены не изменилась)' };
  }

  // 3. Последний участок «opening_end → wall_end» — двигаем предыдущий проём НАЗАД
  //    так, чтобы новая длина остатка совпала с введённой, а общая длина стены не менялась.
  if (to.type === 'wall_end') {
    if (from.type === 'opening_end') {
      const obj = findOpening(from.objectId);
      if (!obj) return { changed:false, hint:'проём не найден' };
      const width = numOr(obj.width) || 900;
      // остаток = totalLen - (dist + width). Нужен = newValueMm.
      // → dist = totalLen - newValueMm - width
      const newDist = totalLen - newValueMm - width;
      if (newDist < 0) return { changed:false, hint:'нельзя: проём выйдет за начало стены' };
      if (newDist + width > totalLen) return { changed:false, hint:'нельзя: проём выйдет за конец стены' };
      pushHistory();
      obj.distance = obj.distance || m(0);
      obj.distance.value = Math.round(newDist);
      return { changed:true, hint:'проём '+obj.id+' сдвинут (общая длина стены не изменилась)' };
    }
    // from — wall_start, wall_junction или user_point. Двигать нечего, чтобы сохранить длину.
    return { changed:false, hint:'нет проёма перед концом стены — нечего сдвинуть, общая длина не может остаться неизменной. Для изменения длины стены редактируйте её геометрически.' };
  }

  // 4. Иное (junction, user_point) — пока не поддерживается через число
  return { changed:false, hint:'этот тип участка пока не редактируется числом' };
}

// Снап направления по шагу 45° от опорной точки (аналог Shift в графредакторах)
function snapAngle45(x0, y0, x, y) {
  const dx = x - x0, dy = y - y0;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return { x: x0, y: y0 };
  const step = Math.PI / 4;
  const snap = Math.round(Math.atan2(dy, dx) / step) * step;
  const len = Math.hypot(dx, dy);
  return { x: x0 + len * Math.cos(snap), y: y0 + len * Math.sin(snap) };
}
// Блокировка по доминирующей оси: остаётся движение либо только по X, либо только по Y
function axisLockDelta(dx, dy) {
  return Math.abs(dx) >= Math.abs(dy) ? { dx, dy: 0 } : { dx: 0, dy };
}
// Поиск ближайшей вершины к точке (x,y) в мировых мм. Радиус — 15 экранных px.
function findNearVertex(x, y, excludeId) {
  const rad = 15 / currentView().scale;
  let best = null, bestD = Infinity;
  for (const v of state.plan.vertices) {
    if (excludeId && v.id === excludeId) continue;
    const d = Math.hypot(v.x - x, v.y - y);
    if (d < rad && d < bestD) { best = v; bestD = d; }
  }
  return best;
}

// Слияние двух вершин: fromId → intoId. Все стены, ссылавшиеся на fromId, переезжают.
// Вырожденные стены (v1==v2) удаляются вместе с их проёмами. Помещения обновляются.
function mergeVertices(fromId, intoId) {
  if (fromId === intoId) return { walls:0, doors:0, windows:0 };
  const plan = state.plan;
  // Переписываем ссылки в стенах
  for (const w of plan.walls) {
    if (w.v1 === fromId) w.v1 = intoId;
    if (w.v2 === fromId) w.v2 = intoId;
  }
  // Вырожденные стены — удалить
  const degenerateIds = plan.walls.filter(w => w.v1 === w.v2).map(w => w.id);
  const doorsRemoved = plan.doors.filter(d => degenerateIds.includes(d.wallId)).map(d => d.id);
  const windowsRemoved = plan.windows.filter(o => degenerateIds.includes(o.wallId)).map(o => o.id);
  plan.walls = plan.walls.filter(w => !degenerateIds.includes(w.id));
  plan.doors = plan.doors.filter(d => !degenerateIds.includes(d.wallId));
  plan.windows = plan.windows.filter(o => !degenerateIds.includes(o.wallId));
  // Обновляем помещения: убираем удалённые стены из walls, переписываем vertices
  for (const r of plan.rooms) {
    if (Array.isArray(r.walls)) r.walls = r.walls.filter(id => !degenerateIds.includes(id));
    if (Array.isArray(r.vertices)) {
      r.vertices = r.vertices.map(v => v === fromId ? intoId : v);
      // убираем подряд идущие дубли
      const cleaned = [];
      for (const vid of r.vertices) {
        if (cleaned.length === 0 || cleaned[cleaned.length - 1] !== vid) cleaned.push(vid);
      }
      if (cleaned.length > 1 && cleaned[0] === cleaned[cleaned.length - 1]) cleaned.pop();
      r.vertices = cleaned;
    }
  }
  // Удаляем саму вершину
  plan.vertices = plan.vertices.filter(v => v.id !== fromId);
  // Если было выделено что-то по fromId — переключаем на intoId
  if (state.ui.selected && state.ui.selected.type === 'vertex' && state.ui.selected.id === fromId) {
    state.ui.selected = { type: 'vertex', id: intoId };
  }
  return { walls: degenerateIds, doors: doorsRemoved, windows: windowsRemoved };
}
function updateAddButtonStates() {
  document.querySelectorAll('[data-add]').forEach(b => {
    b.classList.toggle('active-mode', state.ui.mode === 'add-' + b.getAttribute('data-add'));
  });
}

// ---- Хранилище и история ----
function pushHistory() {
  const h = currentHist();
  h.past.push(JSON.stringify(state.plan));
  if (h.past.length > HIST_MAX) h.past.shift();
  h.future = [];
  saveLocal();
}
function undo() {
  const h = currentHist();
  if (!h.past.length) return;
  h.future.push(JSON.stringify(state.plan));
  const restored = JSON.parse(h.past.pop());
  state.floors[state.currentFloor] = restored;
  state.plan = restored;
  saveLocal(); render();
}
function redo() {
  const h = currentHist();
  if (!h.future.length) return;
  h.past.push(JSON.stringify(state.plan));
  const restored = JSON.parse(h.future.pop());
  state.floors[state.currentFloor] = restored;
  state.plan = restored;
  saveLocal(); render();
}
function saveLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: '3.0',
      currentFloor: state.currentFloor,
      floors: state.floors,
      ui: { layers: state.ui.layers, view: state.ui.view }
    }));
  } catch(e) { console.warn('localStorage save failed', e); }
}
function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s.floors) return false;
    for (const key of Object.keys(s.floors)) { migrateRoomUse(s.floors[key]); stripMeasureMeta(s.floors[key]); }
    state.floors = s.floors;
    state.currentFloor = s.currentFloor || 'F1';
    state.plan = state.floors[state.currentFloor];
    if (s.ui) {
      if (s.ui.layers) state.ui.layers = { ...state.ui.layers, ...s.ui.layers };
      if (s.ui.view) state.ui.view = { ...state.ui.view, ...s.ui.view };
    }
    return true;
  } catch(e) { console.warn('localStorage load failed', e); return false; }
}

// Миграция старой схемы: suggestedUse + verifiedUse → одно поле use.
function migrateRoomUse(plan) {
  if (!plan || !Array.isArray(plan.rooms)) return;
  for (const r of plan.rooms) {
    if (r.use !== undefined) continue;
    r.use = r.verifiedUse || r.suggestedUse || '';
    delete r.verifiedUse;
    delete r.suggestedUse;
  }
}

// Миграция: убрать поля status/source/note у объектов-измерений (оставить только value).
// Также удаляем устаревшее поле wall.declaredLength (заменено размерной цепочкой).
function stripMeasureMeta(plan) {
  if (!plan) return;
  const clean = (mo) => { if (mo && typeof mo === 'object') { delete mo.status; delete mo.source; delete mo.note; } };
  const walk = (arr, keys) => (arr || []).forEach(o => keys.forEach(k => clean(o[k])));
  walk(plan.walls, ['thickness','height']);
  walk(plan.rooms, ['ceilingHeight']);
  walk(plan.doors, ['distance','width','height']);
  walk(plan.windows, ['distance','width','height','sillHeight']);
  (plan.walls || []).forEach(w => { delete w.declaredLength; });
}

// ---- Валидация плана ----
function validatePlan(p) {
  const errs = [];
  if (!p || typeof p !== 'object') { errs.push('plan не является объектом'); return errs; }
  ['vertices','walls','rooms','doors','windows','stairs','furniture'].forEach(k => {
    if (!Array.isArray(p[k])) errs.push(`нет массива ${k}`);
  });
  const vset = new Set((p.vertices||[]).map(v=>v.id));
  (p.walls||[]).forEach(w => {
    if (!vset.has(w.v1)) errs.push(`W ${w.id}: v1=${w.v1} не найден`);
    if (!vset.has(w.v2)) errs.push(`W ${w.id}: v2=${w.v2} не найден`);
  });
  const wset = new Set((p.walls||[]).map(w=>w.id));
  (p.doors||[]).forEach(d => { if (!wset.has(d.wallId)) errs.push(`D ${d.id}: стена ${d.wallId} не найдена`); });
  (p.windows||[]).forEach(o => { if (!wset.has(o.wallId)) errs.push(`O ${o.id}: стена ${o.wallId} не найдена`); });
  return errs;
}

function computeWarnings() {
  const warns = [];
  for (const r of state.plan.rooms) {
    // Новая модель — явный список вершин
    if (Array.isArray(r.vertices) && r.vertices.length) {
      if (r.vertices.length < 3) {
        warns.push({ type:'room-open', id:r.id, text:`Помещение ${r.id} (${r.name||''}): меньше 3 вершин в контуре` });
        continue;
      }
      // Уникальность вершин
      const unique = new Set(r.vertices);
      if (unique.size !== r.vertices.length) {
        warns.push({ type:'room-vertex-dup', id:r.id, text:`Помещение ${r.id}: в контуре повторяются вершины` });
      }
      // Отсутствующие стены между соседними вершинами (ищем цепочку — не только прямую стену)
      const missing = [];
      for (let i = 0; i < r.vertices.length; i++) {
        const a = r.vertices[i], b = r.vertices[(i + 1) % r.vertices.length];
        const chainIds = findWallChainBetween(a, b, state.plan);
        if (!chainIds || chainIds.length === 0) missing.push(`${a}↔${b}`);
      }
      if (missing.length) {
        warns.push({ type:'room-no-wall', id:r.id, text:`Помещение ${r.id}: нет стен между соседними вершинами (${missing.join(', ')})` });
      }
      // Самопересечение полигона
      if (polygonSelfIntersects(r.vertices.map(id => vById(id)).filter(Boolean))) {
        warns.push({ type:'room-self-intersect', id:r.id, text:`Помещение ${r.id}: контур самопересекается` });
      }
    } else {
      // Старая модель — цепочка стен
      const chain = (r.walls || []).map(id => findById(state.plan.walls, id)).filter(Boolean);
      if (chain.length < 3) {
        warns.push({ type:'room-open', id:r.id, text:`Помещение ${r.id} (${r.name||''}): недостаточно стен для контура (< 3)` });
        continue;
      }
      const verts = new Map();
      chain.forEach(w => { verts.set(w.v1, (verts.get(w.v1)||0)+1); verts.set(w.v2, (verts.get(w.v2)||0)+1); });
      let open = false;
      verts.forEach(cnt => { if (cnt !== 2) open = true; });
      if (open) warns.push({ type:'room-open', id:r.id, text:`Помещение ${r.id}: контур из стен не замкнут (нет явных вершин)` });
    }
  }
  for (const d of state.plan.doors) {
    const w = findById(state.plan.walls, d.wallId); if (!w) continue;
    const L = wallLen(w);
    const dist = numOr(d.distance) || 0, width = numOr(d.width) || 0;
    if (dist < 0 || dist + width > L) warns.push({ type:'door-out', id:d.id, text:`Дверь ${d.id} выходит за пределы стены ${w.id} (${Math.round(L)} мм)` });
  }
  for (const o of state.plan.windows) {
    const w = findById(state.plan.walls, o.wallId); if (!w) continue;
    const L = wallLen(w);
    const dist = numOr(o.distance) || 0, width = numOr(o.width) || 0;
    if (dist < 0 || dist + width > L) warns.push({ type:'window-out', id:o.id, text:`Окно ${o.id} выходит за пределы стены ${w.id} (${Math.round(L)} мм)` });
  }
  for (const w of state.plan.walls) {
    const declared = chainDeclaredLen(w);
    if (declared != null) {
      const diff = Math.abs(wallLen(w) - declared);
      if (diff > 5) warns.push({ type:'wall-len', id:w.id, text:`Стена ${w.id}: геометрия ${Math.round(wallLen(w))} мм ≠ заявленной ${declared} мм` });
    }
  }
  // v3: невязка суммы участков размерной цепочки
  const tol = (state.plan.settings && state.plan.settings.chainTolerance) || 5;
  for (const w of state.plan.walls) {
    const segs = computeChainSegments(w);
    if (segs.length < 1) continue;
    const sum = segs.reduce((s, x) => s + x.valueMm, 0);
    const L = Math.round(wallLen(w));
    const diff = Math.abs(sum - L);
    if (diff > tol) {
      warns.push({ type:'chain-sum', id: w.id, text:`Стена ${w.id}: сумма цепочки ${sum} мм ≠ длине ${L} мм (Δ=${sum - L} мм)` });
    }
  }
  return warns;
}

// ---- Рендеринг ----
function render() {
  // v3: перегенерировать якоря каждой стены (из door.distance/width + T-примыканий)
  ensureAllAnchors(state.plan, state.currentFloor);
  applyViewportTransform();
  renderRooms(); renderWalls(); renderStairs(); renderFurniture();
  renderOpenings(); renderVertices(); renderLabels();
  renderSelectedWallAnchors();
  renderSelectedRoomIssues();
  renderInspector(); renderUnknowns(); renderWarnings();
  applyLayerToggles(); updateFloorButtons();
}

// Отрисовка якорей и размерных засечек на выделенной стене (v3)
function renderSelectedWallAnchors() {
  const overlay = $('layerOverlay');
  // Удаляем предыдущие маркеры/линии цепочки
  overlay.querySelectorAll('.chain-marker, .chain-line, .chain-tick, .chain-value').forEach(el => el.remove());
  const sel = state.ui.selected;
  if (!sel || sel.type !== 'wall') return;
  const w = findById(state.plan.walls, sel.id); if (!w) return;
  const a = vById(w.v1), b = vById(w.v2); if (!a || !b) return;
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const cx = Math.cos(ang), sy = Math.sin(ang);
  const nx = -sy, ny = cx;
  const th = numOr(w.thickness) || (w.type === 'exterior' ? DEFAULT_THICKNESS_EXT : DEFAULT_THICKNESS_INT);
  const off = th / 2 + 700; // размерная линия — 700 мм от стены наружу

  // Размерная линия
  const L = wallLen(w);
  const lx1 = a.x + nx * off, ly1 = a.y + ny * off;
  const lx2 = a.x + cx * L + nx * off, ly2 = a.y + sy * L + ny * off;
  overlay.appendChild(svgEl('line', {
    x1: lx1, y1: ly1, x2: lx2, y2: ly2,
    class:'chain-line', stroke:'#666', 'stroke-width': 40, 'pointer-events':'none'
  }));

  const anchors = [...(w.anchors || [])].sort((a1,a2) => a1.offsetMm - a2.offsetMm);
  const colorForType = (t) => (
    t === 'wall_start' || t === 'wall_end' ? '#2a6ed6' :
    t === 'opening_start' || t === 'opening_end' ? '#b56b00' :
    t === 'wall_junction' ? '#d4a017' :
    t === 'user_point' ? '#7b3fb7' : '#666'
  );
  // Маркеры якорей и засечки на размерной линии
  for (const anc of anchors) {
    const px = a.x + cx * anc.offsetMm;
    const py = a.y + sy * anc.offsetMm;
    // Круг на стене
    overlay.appendChild(svgEl('circle', {
      cx: px + nx*(th/2 + 100), cy: py + ny*(th/2 + 100), r: 90,
      class: 'chain-marker', fill: colorForType(anc.type),
      stroke:'#fff', 'stroke-width': 30, 'pointer-events':'none'
    }));
    // Засечка на размерной линии
    overlay.appendChild(svgEl('line', {
      x1: px + nx*(off - 120), y1: py + ny*(off - 120),
      x2: px + nx*(off + 120), y2: py + ny*(off + 120),
      class:'chain-tick', stroke:'#333', 'stroke-width': 40, 'pointer-events':'none'
    }));
  }
  // Значения участков — число между засечками
  const segs = computeChainSegments(w);
  for (const seg of segs) {
    const mid = (seg.from.offsetMm + seg.to.offsetMm) / 2;
    const px = a.x + cx * mid + nx * (off + 260);
    const py = a.y + sy * mid + ny * (off + 260);
    const txt = svgEl('text', {
      x: px, y: py,
      class:'chain-value', 'text-anchor':'middle', 'dominant-baseline':'middle',
      fill: seg.isOpeningWidth ? '#7a5a20' : '#333',
      'font-size': 220, 'paint-order':'stroke', stroke:'#fff', 'stroke-width': 60,
      'pointer-events':'none'
    });
    txt.textContent = seg.valueMm + ' мм';
    overlay.appendChild(txt);
  }
}

// Подсветка проблемных вершин выделенного помещения
function renderSelectedRoomIssues() {
  const overlay = $('layerOverlay');
  overlay.querySelectorAll('.room-issue').forEach(el => el.remove());
  const sel = state.ui.selected;
  if (!sel || sel.type !== 'room') return;
  const room = findById(state.plan.rooms, sel.id);
  if (!room || !Array.isArray(room.vertices) || room.vertices.length < 2) return;

  // Проверяем каждую пару соседних вершин
  const n = room.vertices.length;
  for (let i = 0; i < n; i++) {
    const aId = room.vertices[i], bId = room.vertices[(i + 1) % n];
    // Цепочка стен вдоль прямой a→b (даже через промежуточные вершины) — ребро закрыто
    const chainIds = findWallChainBetween(aId, bId, state.plan);
    if (chainIds && chainIds.length) continue;
    // Стены нет — проверим, проходит ли осевая какой-то стены через обе вершины (нужен ручной сплит)
    const spanning = findWallSpanningBoth(aId, bId, state.plan);
    const needsSplit = spanning && !spanning.direct;
    const color = needsSplit ? '#d4a017' : '#cc3333';
    const throughLabel = needsSplit ? '  разбейте ' + spanning.wall.id : '  нет стены';
    const va = vById(aId), vb = vById(bId);
    if (!va || !vb) continue;

    // Пунктирная линия между вершинами
    overlay.appendChild(svgEl('line', {
      x1: va.x, y1: va.y, x2: vb.x, y2: vb.y,
      class:'room-issue',
      stroke: color, 'stroke-width': 120, 'stroke-dasharray': '400 250',
      'pointer-events':'none', opacity: 0.9
    }));

    // Кольца на обеих вершинах
    for (const v of [va, vb]) {
      overlay.appendChild(svgEl('circle', {
        cx: v.x, cy: v.y, r: 250,
        class:'room-issue',
        fill: 'none', stroke: color, 'stroke-width': 100,
        'pointer-events':'none', opacity: 0.9
      }));
    }

    // Подпись у середины ребра
    const mx = (va.x + vb.x) / 2, my = (va.y + vb.y) / 2;
    const dx = vb.x - va.x, dy = vb.y - va.y;
    const len = Math.hypot(dx, dy) || 1;
    const nxL = -dy / len, nyL = dx / len;
    const lbl = svgEl('text', {
      x: mx + nxL * 400, y: my + nyL * 400,
      class:'room-issue', 'text-anchor':'middle', 'dominant-baseline':'central',
      fill: color, 'font-size': 220, 'font-weight':'700',
      'paint-order':'stroke', stroke:'#fff', 'stroke-width': 60,
      'pointer-events':'none'
    });
    lbl.textContent = aId + '↔' + bId + throughLabel;
    overlay.appendChild(lbl);
  }
}

function updateFloorButtons() {
  document.querySelectorAll('.floor-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-floor') === state.currentFloor);
  });
}

function applyViewportTransform() {
  const v = currentView();
  viewport.setAttribute('transform', `translate(${v.tx} ${v.ty}) scale(${v.scale})`);
  $('zoomLabel').textContent = `Этаж ${state.currentFloor} · Масштаб: ${(v.scale*1000).toFixed(1)} px/м`;
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function isSelected(type, id) { return state.ui.selected && state.ui.selected.type === type && state.ui.selected.id === id; }

function roomPolygon(room) {
  // Приоритет — явно заданный список вершин (новый способ создания помещения)
  if (Array.isArray(room.vertices) && room.vertices.length >= 3) {
    return room.vertices.map(id => vById(id)).filter(Boolean);
  }
  // Резервный вариант — цепочка стен через общие вершины (старые помещения)
  const chain = (room.walls || []).map(id => findById(state.plan.walls, id)).filter(Boolean);
  if (!chain.length) return null;
  const used = new Set();
  const verts = [];
  const first = chain[0];
  verts.push(first.v1, first.v2);
  used.add(first.id);
  let cur = first.v2;
  let safety = chain.length * 2;
  while (used.size < chain.length && safety-- > 0) {
    const nextW = chain.find(w => !used.has(w.id) && (w.v1 === cur || w.v2 === cur));
    if (!nextW) break;
    cur = nextW.v1 === cur ? nextW.v2 : nextW.v1;
    verts.push(cur);
    used.add(nextW.id);
  }
  if (verts.length > 2 && verts[verts.length-1] === verts[0]) verts.pop();
  return verts.map(id => vById(id)).filter(Boolean);
}

// Проекция точки на отрезок стены. Возвращает t ∈ [0..1] или null, если не на стене.
function projectOnWall(vertex, wall, tolerance = 20) {
  const a = vById(wall.v1), b = vById(wall.v2);
  if (!a || !b) return null;
  const ax = b.x - a.x, ay = b.y - a.y;
  const len2 = ax*ax + ay*ay;
  if (len2 < 1) return null;
  const t = ((vertex.x - a.x) * ax + (vertex.y - a.y) * ay) / len2;
  if (t < -0.002 || t > 1.002) return null;
  const px = a.x + t * ax, py = a.y + t * ay;
  const d = Math.hypot(vertex.x - px, vertex.y - py);
  if (d > tolerance) return null;
  return Math.max(0, Math.min(1, t));
}

// Ищем стену, на осевой которой лежат ОБЕ вершины aId и bId.
// Возвращает { wall, direct } или null.
// Ищем ЦЕПОЧКУ стен от aId до bId, где все промежуточные вершины лежат
// на прямой a→b (в допуске 20 мм). Возвращает массив wall id или null.
function findWallChainBetween(aId, bId, plan, tolerance = 20) {
  if (aId === bId) return [];
  const va = vById(aId), vb = vById(bId);
  if (!va || !vb) return null;
  const dx = vb.x - va.x, dy = vb.y - va.y;
  const len2 = dx*dx + dy*dy;
  if (len2 < 1) return null;
  const isOnLine = (v) => {
    if (v.id === aId || v.id === bId) return true;
    const t = ((v.x - va.x) * dx + (v.y - va.y) * dy) / len2;
    if (t < -0.001 || t > 1.001) return false;
    const px = va.x + t * dx, py = va.y + t * dy;
    return Math.hypot(v.x - px, v.y - py) <= tolerance;
  };
  // BFS с отслеживанием предшественников и стены, по которой пришли
  const prev = new Map(); // vertexId -> { fromVertexId, wallId }
  prev.set(aId, null);
  const queue = [aId];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === bId) break;
    for (const w of plan.walls) {
      let other = null;
      if (w.v1 === cur) other = w.v2;
      else if (w.v2 === cur) other = w.v1;
      if (!other || prev.has(other)) continue;
      const vo = vById(other);
      if (!vo) continue;
      if (!isOnLine(vo)) continue;
      prev.set(other, { fromVertexId: cur, wallId: w.id });
      queue.push(other);
      if (other === bId) break;
    }
    if (prev.has(bId)) break;
  }
  if (!prev.has(bId)) return null;
  // Восстанавливаем цепочку стен
  const chain = [];
  let cur = bId;
  while (cur !== aId) {
    const step = prev.get(cur);
    if (!step) return null;
    chain.unshift(step.wallId);
    cur = step.fromVertexId;
  }
  return chain;
}

function findWallSpanningBoth(aId, bId, plan) {
  // Сначала — прямая стена между этими вершинами
  const direct = plan.walls.find(w =>
    (w.v1 === aId && w.v2 === bId) || (w.v1 === bId && w.v2 === aId));
  if (direct) return { wall: direct, direct: true };
  const va = vById(aId), vb = vById(bId);
  if (!va || !vb) return null;
  for (const w of plan.walls) {
    if (w.v1 === aId || w.v1 === bId || w.v2 === aId || w.v2 === bId) {
      // Одна из вершин уже конец этой стены — но не обе (иначе direct нашли выше)
    }
    const ta = projectOnWall(va, w);
    const tb = projectOnWall(vb, w);
    if (ta == null || tb == null) continue;
    if (Math.abs(ta - tb) < 0.001) continue; // одна и та же точка
    return { wall: w, direct: false };
  }
  return null;
}

// Расщепление стены в указанных промежуточных вершинах.
// Оригинальная стена сохраняет свой id и становится ПЕРВЫМ сегментом;
// остальные создаются с новыми id. Двери/окна переезжают на соответствующий сегмент,
// distance пересчитывается относительно начала своего сегмента.
// Комнаты, у которых в walls был исходный wall.id, получают все id сегментов.
function splitWallAtVertices(wall, insertVertexIds, plan, floor) {
  const totalLen = wallLen(wall);
  if (totalLen < 1) return [wall.id];
  const uniqInserts = [];
  const seen = new Set();
  for (const vid of insertVertexIds) {
    if (vid === wall.v1 || vid === wall.v2 || seen.has(vid)) continue;
    const v = vById(vid); if (!v) continue;
    const t = projectOnWall(v, wall); if (t == null) continue;
    const offset = t * totalLen;
    if (offset < 1 || offset > totalLen - 1) continue;
    uniqInserts.push({ id: vid, offset });
    seen.add(vid);
  }
  if (!uniqInserts.length) return [wall.id];
  uniqInserts.sort((a, b) => a.offset - b.offset);

  // Собираем брейкпоинты: [v1, ...inserts..., v2]
  const breaks = [
    { id: wall.v1, offset: 0 },
    ...uniqInserts,
    { id: wall.v2, offset: totalLen }
  ];

  // Проёмы на этой стене — сохраняем ссылки для перераспределения
  const openings = [
    ...plan.doors.filter(d => d.wallId === wall.id),
    ...plan.windows.filter(o => o.wallId === wall.id)
  ];

  // Формируем сегменты. Соглашение: ПОСЛЕДНИЙ сегмент — это оригинальная стена
  // (её v1 сдвигается на позицию последнего инсерта). Все предыдущие сегменты — новые стены.
  const segments = [];
  const origId = wall.id;
  const nSeg = breaks.length - 1;
  for (let i = 0; i < nSeg; i++) {
    const from = breaks[i], to = breaks[i+1];
    if (i === nSeg - 1) {
      wall.v1 = from.id;
      wall.v2 = to.id;
      segments.push({ wall, from: from.offset, to: to.offset });
    } else {
      const newId = nextId('W', plan.walls);
      const nw = {
        id: newId,
        v1: from.id, v2: to.id,
        type: wall.type,
        thickness: JSON.parse(JSON.stringify(wall.thickness || m(DEFAULT_THICKNESS_INT))),
        height: JSON.parse(JSON.stringify(wall.height || m(null))),
        note: wall.note ? wall.note + ' (split из ' + origId + ')' : 'split из ' + origId,
        anchors: []
      };
      plan.walls.push(nw);
      segments.push({ wall: nw, from: from.offset, to: to.offset });
    }
  }

  // Перераспределяем проёмы
  for (const op of openings) {
    const dist = numOr(op.distance) || 0;
    const width = numOr(op.width) || 900;
    // Находим сегмент, в котором лежит НАЧАЛО проёма
    let host = segments[0];
    for (const seg of segments) {
      if (dist >= seg.from - 1 && dist < seg.to - 1) { host = seg; break; }
    }
    op.wallId = host.wall.id;
    op.distance = op.distance || m(0, 'estimated');
    op.distance.value = Math.max(0, Math.round(dist - host.from));
    // Если проём выходит за конец сегмента — валидатор потом покажет
  }

  // Обновляем ссылки в помещениях
  const segIds = segments.map(s => s.wall.id);
  for (const r of plan.rooms) {
    if (Array.isArray(r.walls)) {
      const idx = r.walls.indexOf(origId);
      if (idx >= 0) r.walls.splice(idx, 1, ...segIds);
    }
  }
  return segIds;
}

// Гарантируем, что между вершинами aId и bId существует стена.
// Возвращает id стены или null (если не удалось).
// mode: 'split' — расщеплять существующие сквозные; 'create' — создавать перегородку если нет.
// Прямая стена между aId и bId — если её нет, опционально создаёт новую перегородку.
// Автоматического разбиения существующих стен ЗДЕСЬ нет — сплит делается только
// вручную через инспектор стены («Разделить стену»).
function ensureWallBetween(aId, bId, plan, floor, opts = { create:true }) {
  const direct = plan.walls.find(w =>
    (w.v1 === aId && w.v2 === bId) || (w.v1 === bId && w.v2 === aId));
  if (direct) return direct.id;
  if (opts.create) {
    const newId = nextId('W', plan.walls);
    plan.walls.push({
      id: newId, v1: aId, v2: bId, type: 'partition',
      thickness: m(DEFAULT_THICKNESS_INT),
      height: m(null),
      note: 'создано при добавлении помещения', anchors: []
    });
    return newId;
  }
  return null;
}

function renderRooms() {
  const g = $('layerRooms'); g.innerHTML = '';
  for (const r of state.plan.rooms) {
    const poly = roomPolygon(r);
    if (!poly || poly.length < 3) continue;
    g.appendChild(svgEl('polygon', {
      points: poly.map(p => `${p.x},${p.y}`).join(' '),
      class: 'room-shape' + (isSelected('room', r.id) ? ' selected' : ''),
      'data-type':'room', 'data-id': r.id
    }));
  }
}
function renderWalls() {
  const g = $('layerWalls'); g.innerHTML = '';
  for (const w of state.plan.walls) {
    const a = vById(w.v1), b = vById(w.v2); if (!a || !b) continue;
    const th = numOr(w.thickness) || (w.type === 'exterior' ? DEFAULT_THICKNESS_EXT : DEFAULT_THICKNESS_INT);
    g.appendChild(svgEl('line', {
      x1:a.x, y1:a.y, x2:b.x, y2:b.y,
      class:'wall ' + w.type + (isSelected('wall', w.id) ? ' selected' : ''),
      'stroke-width': th, 'data-type':'wall', 'data-id': w.id
    }));
  }
}
function renderVertices() {
  const g = $('layerVertices'); g.innerHTML = '';
  for (const v of state.plan.vertices) {
    const sel = isSelected('vertex', v.id);
    g.appendChild(svgEl('circle', {
      cx: v.x, cy: v.y, r: sel ? 180 : 90,
      class: 'vertex' + (sel ? ' selected' : ''),
      'data-type':'vertex', 'data-id': v.id
    }));
  }
}
function renderStairs() {
  const g = $('layerStairs'); g.innerHTML = '';
  const defs = svg.querySelector('defs');
  if (!defs.querySelector('#arrowHead')) {
    const marker = svgEl('marker', {
      id:'arrowHead', viewBox:'0 0 10 10', refX:'10', refY:'5',
      markerWidth:'6', markerHeight:'6', orient:'auto-start-reverse'
    });
    marker.appendChild(svgEl('path', { d:'M 0 0 L 10 5 L 0 10 z', fill:'#333' }));
    defs.appendChild(marker);
  }
  for (const s of state.plan.stairs) {
    const grp = svgEl('g', { transform: `translate(${s.x} ${s.y}) rotate(${s.rotation||0})`, 'data-type':'stairs', 'data-id':s.id });
    grp.appendChild(svgEl('rect', { x:0, y:0, width:s.width, height:s.depth, class:'stairs' + (isSelected('stairs', s.id)?' selected':'') }));
    const steps = 8;
    for (let i=1;i<steps;i++) {
      grp.appendChild(svgEl('line', { x1:(s.width/steps)*i, y1:0, x2:(s.width/steps)*i, y2:s.depth, class:'stairs-step' }));
    }
    const arrowUp = s.direction !== 'down';
    const ax1 = arrowUp ? s.width*0.15 : s.width*0.85;
    const ax2 = arrowUp ? s.width*0.85 : s.width*0.15;
    grp.appendChild(svgEl('line', { x1: ax1, y1: s.depth*0.5, x2: ax2, y2: s.depth*0.5, class:'stairs-arrow' }));
    // Подпись направления рядом со стрелкой
    const dirLabel = svgEl('text', {
      x: s.width*0.5, y: s.depth*0.5 - 200,
      'text-anchor':'middle', 'dominant-baseline':'middle',
      fill: '#333', 'font-size': 220, 'pointer-events':'none',
      'paint-order':'stroke', stroke:'#fff', 'stroke-width':60
    });
    dirLabel.textContent = arrowUp ? '↑ вверх' : '↓ вниз';
    grp.appendChild(dirLabel);
    g.appendChild(grp);
    // Угловые маркеры для изменения размера (только для выделенной лестницы в режиме выбора)
    if (isSelected('stairs', s.id) && state.ui.mode === 'select') {
      const rot = (s.rotation||0) * Math.PI / 180;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const corners = [
        ['tl', 0,       0],
        ['tr', s.width, 0],
        ['br', s.width, s.depth],
        ['bl', 0,       s.depth]
      ];
      corners.forEach(([key, lx, ly]) => {
        const wx = s.x + lx * cos - ly * sin;
        const wy = s.y + lx * sin + ly * cos;
        g.appendChild(svgEl('circle', {
          cx: wx, cy: wy, r: 160,
          class: 'stairs-handle stairs-handle-' + key,
          'data-type': 'stairs-handle',
          'data-id': s.id + ':' + key
        }));
      });
    }
  }
}
function renderFurniture() {
  const g = $('layerFurniture'); g.innerHTML = '';
  for (const f of state.plan.furniture) {
    const grp = svgEl('g', { transform: `translate(${f.x} ${f.y}) rotate(${f.rotation||0})`, 'data-type':'furn', 'data-id': f.id });
    grp.appendChild(svgEl('rect', { x:0, y:0, width:f.width, height:f.depth, class: 'furniture' + (isSelected('furn', f.id) ? ' selected' : '') }));
    const label = svgEl('text', { x:f.width/2, y:f.depth/2, class:'furniture-label' });
    label.textContent = f.name || f.type;
    grp.appendChild(label);
    g.appendChild(grp);
  }
}
function renderOpenings() {
  const g = $('layerOpenings'); g.innerHTML = '';
  for (const d of state.plan.doors) {
    const w = findById(state.plan.walls, d.wallId); if (!w) continue;
    const th = numOr(w.thickness) || DEFAULT_THICKNESS_INT;
    const dist = numOr(d.distance) || 0;
    const wid = numOr(d.width) || 800;
    const ang = wallAngle(w);
    const p1 = pointOnWall(w, dist), p2 = pointOnWall(w, dist + wid);
    const doorSel = isSelected('door', d.id);
    const dy = d.swing === 'out' ? -wid : wid;
    const hingeRight = d.hinge === 'right';
    const leafHingeX = hingeRight ? wid : 0;
    // Оборачиваем все элементы двери в одну группу — чтобы toggle слоя скрывал её целиком
    const grp = svgEl('g', { class:'door-item', 'data-type':'door', 'data-id':d.id });
    grp.appendChild(svgEl('line', { x1:p1.x, y1:p1.y, x2:p2.x, y2:p2.y, class:'door-gap', stroke:'#fff', 'stroke-width': th + 40 }));
    // Подсветка выделенной двери — область открывания (квадрат стороной = ширине двери)
    if (doorSel) {
      const hlY = dy > 0 ? 0 : dy;
      grp.appendChild(svgEl('rect', {
        x: 0, y: hlY, width: wid, height: Math.abs(dy),
        transform: `translate(${p1.x} ${p1.y}) rotate(${ang*180/Math.PI})`,
        class:'door-highlight',
        fill: 'rgba(42,110,214,0.20)',
        stroke: '#2a6ed6', 'stroke-width': 100, 'stroke-dasharray': '250 150',
        'pointer-events':'none'
      }));
    }
    grp.appendChild(svgEl('rect', {
      x: leafHingeX - 40, y: Math.min(0, dy), width: 80, height: Math.abs(dy),
      transform: `translate(${p1.x} ${p1.y}) rotate(${ang*180/Math.PI})`,
      class:'door-leaf' + (doorSel ? ' selected' : ''),
      stroke: doorSel ? '#2a6ed6' : '#b56b00',
      'stroke-width': doorSel ? 120 : 60,
      fill: doorSel ? '#d4e5ff' : '#fff8e0'
    }));
    const arcPath = hingeRight
      ? `M 0 0 A ${wid} ${wid} 0 0 1 ${wid} ${dy}`
      : `M ${wid} 0 A ${wid} ${wid} 0 0 0 0 ${dy}`;
    grp.appendChild(svgEl('path', {
      d: arcPath,
      transform: `translate(${p1.x} ${p1.y}) rotate(${ang*180/Math.PI})`,
      class: 'door-arc' + (doorSel ? ' selected' : ''),
      stroke: doorSel ? '#2a6ed6' : '#b56b00'
    }));
    grp.appendChild(svgEl('rect', {
      x:0, y:-th, width: wid, height: th*2,
      transform: `translate(${p1.x} ${p1.y}) rotate(${ang*180/Math.PI})`,
      class:'door-hit'
    }));
    const mp = { x:(p1.x+p2.x)/2, y:(p1.y+p2.y)/2 };
    const lbl = svgEl('text', { x: mp.x, y: mp.y - 180, class:'wall-label door-label' });
    lbl.textContent = d.id;
    grp.appendChild(lbl);
    g.appendChild(grp);
  }
  for (const o of state.plan.windows) {
    const w = findById(state.plan.walls, o.wallId); if (!w) continue;
    const th = numOr(w.thickness) || DEFAULT_THICKNESS_INT;
    const dist = numOr(o.distance) || 0;
    const wid = numOr(o.width) || 900;
    const ang = wallAngle(w);
    const p1 = pointOnWall(w, dist), p2 = pointOnWall(w, dist + wid);
    const off = th * 0.25;
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    const winSel = isSelected('window', o.id);
    const winStroke = '#2a6ed6';
    const winWidth = winSel ? 100 : 40;
    const grp = svgEl('g', { class:'window-item', 'data-type':'window', 'data-id':o.id });
    grp.appendChild(svgEl('line', { x1:p1.x, y1:p1.y, x2:p2.x, y2:p2.y, class:'window-gap', stroke:'#fff', 'stroke-width': th + 20 }));
    // Подсветка выделенного окна
    if (winSel) {
      grp.appendChild(svgEl('rect', {
        x: 0, y: -th * 0.8, width: wid, height: th * 1.6,
        transform: `translate(${p1.x} ${p1.y}) rotate(${ang*180/Math.PI})`,
        class:'window-highlight',
        fill: 'rgba(42,110,214,0.28)',
        stroke: '#2a6ed6', 'stroke-width': 80,
        'pointer-events':'none'
      }));
    }
    grp.appendChild(svgEl('line', { x1:p1.x+nx*off, y1:p1.y+ny*off, x2:p2.x+nx*off, y2:p2.y+ny*off,
      class:'window-glass' + (winSel?' selected':''), stroke: winSel ? '#1a4a99' : '#2a6ed6', 'stroke-width': winWidth }));
    grp.appendChild(svgEl('line', { x1:p1.x-nx*off, y1:p1.y-ny*off, x2:p2.x-nx*off, y2:p2.y-ny*off,
      class:'window-glass' + (winSel?' selected':''), stroke: winSel ? '#1a4a99' : '#2a6ed6', 'stroke-width': winWidth }));
    grp.appendChild(svgEl('rect', {
      x:0, y:-th, width: wid, height: th*2,
      transform: `translate(${p1.x} ${p1.y}) rotate(${ang*180/Math.PI})`,
      class:'window-hit'
    }));
    const mp = { x:(p1.x+p2.x)/2, y:(p1.y+p2.y)/2 };
    const lbl = svgEl('text', { x: mp.x, y: mp.y + 260, class:'wall-label window-label' });
    lbl.textContent = o.id;
    grp.appendChild(lbl);
    g.appendChild(grp);
  }
}
function renderLabels() {
  const g = $('layerLabels'); g.innerHTML = '';
  for (const r of state.plan.rooms) {
    const poly = roomPolygon(r); if (!poly || poly.length < 3) continue;
    const c = centroid(poly);
    const t1 = svgEl('text', { x:c.x, y:c.y - 220, class:'room-label' }); t1.textContent = r.id; g.appendChild(t1);
    const t2 = svgEl('text', { x:c.x, y:c.y + 160, class:'room-sublabel' });
    t2.textContent = (r.name||'') + (r.use ? ' • ' + r.use : '');
    g.appendChild(t2);
    const t3 = svgEl('text', { x:c.x, y:c.y + 420, class:'room-area' });
    t3.textContent = (polyArea(poly)/1e6).toFixed(2) + ' м²'; g.appendChild(t3);
  }
  for (const w of state.plan.walls) {
    const a = vById(w.v1), b = vById(w.v2); if (!a || !b) continue;
    const mid = wallMidpoint(w);
    const n = wallNormal(w);
    const off = (numOr(w.thickness) || DEFAULT_THICKNESS_INT) * 1.6 + 120;
    const t1 = svgEl('text', { x: mid.x + n.x*off, y: mid.y + n.y*off, class:'wall-label wall-label-num' });
    t1.textContent = w.id; g.appendChild(t1);
    const L = wallLen(w);
    const declared = chainDeclaredLen(w);
    const dispLen = declared != null ? declared : Math.round(L);
    const t2 = svgEl('text', { x: mid.x - n.x*(off+220), y: mid.y - n.y*(off+220), class:'wall-length' });
    t2.textContent = dispLen + ' мм'; g.appendChild(t2);
  }
}
function centroid(pts) { let x=0,y=0; pts.forEach(p=>{x+=p.x;y+=p.y}); return { x:x/pts.length, y:y/pts.length }; }
function polyArea(pts) { let a=0; for (let i=0;i<pts.length;i++) { const p=pts[i],q=pts[(i+1)%pts.length]; a += p.x*q.y-q.x*p.y; } return Math.abs(a/2); }

function applyLayerToggles() {
  const L = state.ui.layers;
  $('layerOpenings').style.display = (L.doors || L.windows) ? 'block' : 'none';
  $('layerFurniture').style.display = L.furniture ? 'block' : 'none';
  $('layerStairs').style.display = L.stairs ? 'block' : 'none';
  // Каждый проём — отдельная <g> с классом .door-item / .window-item, скрываем целиком
  document.querySelectorAll('.door-item').forEach(el => el.style.display = L.doors ? '' : 'none');
  document.querySelectorAll('.window-item').forEach(el => el.style.display = L.windows ? '' : 'none');
  document.querySelectorAll('.room-label').forEach(el => el.style.display = L.roomNames ? '' : 'none');
  document.querySelectorAll('.room-sublabel').forEach(el => el.style.display = L.roomNames ? '' : 'none');
  document.querySelectorAll('.room-area').forEach(el => el.style.display = L.roomAreas ? '' : 'none');
  // Метки проёмов (door-label / window-label) внутри своих групп — учитываем оба флага
  document.querySelectorAll('.wall-label').forEach(el => {
    const isDoorLbl = el.classList.contains('door-label');
    const isWinLbl = el.classList.contains('window-label');
    let visible = L.wallNumbers;
    if (isDoorLbl && !L.doors) visible = false;
    if (isWinLbl && !L.windows) visible = false;
    el.style.display = visible ? '' : 'none';
  });
  document.querySelectorAll('.wall-length').forEach(el => el.style.display = L.dimensions ? '' : 'none');
}

// ---- Инспектор ----
function renderInspector() {
  const el = $('inspector'); el.innerHTML = '';
  const sel = state.ui.selected;
  if (!sel) { el.innerHTML = '<div class="empty">Ничего не выбрано. Кликните элемент на плане.</div>'; return; }
  if (sel.type === 'wall') renderWallInspector(el, findById(state.plan.walls, sel.id));
  else if (sel.type === 'room') renderRoomInspector(el, findById(state.plan.rooms, sel.id));
  else if (sel.type === 'door') renderDoorInspector(el, findById(state.plan.doors, sel.id));
  else if (sel.type === 'window') renderWindowInspector(el, findById(state.plan.windows, sel.id));
  else if (sel.type === 'furn') renderFurnitureInspector(el, findById(state.plan.furniture, sel.id));
  else if (sel.type === 'stairs') renderStairsInspector(el, findById(state.plan.stairs, sel.id));
  else if (sel.type === 'vertex') renderVertexInspector(el, findById(state.plan.vertices, sel.id));
}

function fieldMeasure(label, obj, onChange) {
  const wrap = document.createElement('div'); wrap.className = 'field';
  wrap.innerHTML = `<label>${label}</label>`;
  const row = document.createElement('div'); row.className = 'measure';
  const inp = document.createElement('input'); inp.type='number'; inp.step='any';
  inp.value = obj && obj.value != null ? obj.value : ''; inp.placeholder = '—';
  inp.addEventListener('change', () => {
    const v = inp.value === '' ? null : parseFloat(inp.value);
    onChange({ value: v });
  });
  row.appendChild(inp); wrap.appendChild(row);
  return wrap;
}
function fieldText(label, value, onChange, multiline=false) {
  const wrap = document.createElement('div'); wrap.className='field';
  wrap.innerHTML = `<label>${label}</label>`;
  const inp = document.createElement(multiline?'textarea':'input');
  if (!multiline) inp.type='text';
  inp.value = value || '';
  inp.addEventListener('change', () => onChange(inp.value));
  wrap.appendChild(inp); return wrap;
}
function fieldSelect(label, value, options, onChange) {
  const wrap = document.createElement('div'); wrap.className='field';
  wrap.innerHTML = `<label>${label}</label>`;
  const sel = document.createElement('select');
  options.forEach(o => { const opt=document.createElement('option'); opt.value=o.value; opt.textContent=o.label; if (o.value===value) opt.selected=true; sel.appendChild(opt); });
  sel.addEventListener('change', () => onChange(sel.value));
  wrap.appendChild(sel); return wrap;
}
function fieldNumber(label, value, onChange, step='any') {
  const wrap = document.createElement('div'); wrap.className='field';
  wrap.innerHTML = `<label>${label}</label>`;
  const inp = document.createElement('input'); inp.type='number'; inp.step=step;
  inp.value = value != null ? value : '';
  inp.addEventListener('change', () => { const v = inp.value===''?null:parseFloat(inp.value); onChange(v); });
  wrap.appendChild(inp); return wrap;
}
function actionsRow(el, buttons) {
  const row = document.createElement('div'); row.className='inspector-actions';
  buttons.forEach(b => { const btn=document.createElement('button'); btn.textContent=b.label; if (b.danger) btn.className='danger'; btn.addEventListener('click', b.onClick); row.appendChild(btn); });
  el.appendChild(row);
}

function renderWallInspector(el, w) {
  if (!w) return;
  const title = document.createElement('div'); title.className='inspector-title'; title.textContent='Стена ' + w.id; el.appendChild(title);
  el.appendChild(fieldSelect('Тип', w.type, [{value:'exterior',label:'наружная'},{value:'partition',label:'перегородка'}], v => { pushHistory(); w.type=v; render(); }));
  const declared = chainDeclaredLen(w);
  const info = document.createElement('div'); info.className='hint';
  info.textContent = 'Длина по цепочке: ' + (declared != null ? declared : '—') + ' мм · геометрия: ' + Math.round(wallLen(w)) + ' мм';
  el.appendChild(info);
  el.appendChild(fieldMeasure('Толщина (мм)', w.thickness, obj => { pushHistory(); w.thickness=obj; render(); }));
  el.appendChild(fieldMeasure('Высота (мм)', w.height, obj => { pushHistory(); w.height=obj; render(); }));
  el.appendChild(fieldText('Примечание', w.note, v => { pushHistory(); w.note=v; render(); }, true));

  // v3: секция размерной цепочки
  renderChainSection(el, w);

  actionsRow(el, [
    { label:'Разделить стену…', onClick: () => startSplitWallMode(w.id) },
    { label:'Удалить', danger:true, onClick: () => { if (confirm('Удалить стену '+w.id+'?')) { pushHistory(); removeWall(w.id); } } }
  ]);
}

// ---- Ручной сплит стены ----
function startSplitWallMode(wallId) {
  if (state.ui.mode === 'split-wall' && state.ui.modeData && state.ui.modeData.wallId === wallId) {
    exitAddMode('Режим сплита отменён.');
    return;
  }
  state.ui.mode = 'split-wall';
  state.ui.modeData = { wallId, pending: null };
  document.body.classList.remove('mode-add-wall','mode-add-room','mode-add-door','mode-add-window','mode-add-stairs');
  document.body.classList.add('mode-add', 'mode-add-split');
  clearWallPreview(); updateSnapMarker(null); clearRoomPreview();
  setHint('Клик по стене '+wallId+' → сплит в этой точке. Наведение на вершину, лежащую на осевой — снап (жёлтый). Esc — отмена.');
  updateAddButtonStates();
}

function performWallSplitAtDistance(wall, distMm, snapVertexId) {
  pushHistory();
  const a = vById(wall.v1), b = vById(wall.v2);
  const totalLen = wallLen(wall);
  const t = Math.max(0, Math.min(1, distMm / totalLen));
  let insertVid = snapVertexId;
  if (!insertVid) {
    // Создать новую вершину в точке сплита
    const px = a.x + (b.x - a.x) * t;
    const py = a.y + (b.y - a.y) * t;
    let vid = 'v' + String(state.plan.vertices.length + 1).padStart(3, '0');
    while (state.plan.vertices.find(v => v.id === vid)) vid = 'v' + Math.floor(Math.random() * 1e6);
    state.plan.vertices.push({ id: vid, x: Math.round(px), y: Math.round(py) });
    insertVid = vid;
  }
  const segIds = splitWallAtVertices(wall, [insertVid], state.plan, state.currentFloor);
  state.ui.selected = { type: 'wall', id: wall.id };
  render();
  return segIds;
}

function computeSplitPreview(e, wall) {
  const raw = screenToPlan(e.clientX, e.clientY);
  const a = vById(wall.v1), b = vById(wall.v2);
  const ax = b.x - a.x, ay = b.y - a.y;
  const len2 = ax*ax + ay*ay;
  if (len2 < 1) return null;
  const totalLen = Math.sqrt(len2);
  let t = ((raw.x - a.x) * ax + (raw.y - a.y) * ay) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + t * ax, py = a.y + t * ay;
  const distMm = t * totalLen;
  // Снап к существующей вершине на осевой
  const snapRadPx = 15;
  const snapRadWorld = snapRadPx / currentView().scale;
  let snap = null;
  for (const v of state.plan.vertices) {
    if (v.id === wall.v1 || v.id === wall.v2) continue;
    const tv = projectOnWall(v, wall);
    if (tv == null) continue;
    if (tv < 0.01 || tv > 0.99) continue;
    const dMouse = Math.hypot(v.x - raw.x, v.y - raw.y);
    if (dMouse > snapRadWorld) continue;
    if (!snap || dMouse < snap.dMouse) {
      snap = { id: v.id, x: v.x, y: v.y, dMouse, distMm: tv * totalLen };
    }
  }
  return snap ? { snap: true, vertexId: snap.id, x: snap.x, y: snap.y, distMm: snap.distMm } :
                { snap: false, x: px, y: py, distMm };
}

function drawSplitPreview(wall, p) {
  const overlay = $('layerOverlay');
  clearSplitPreview();
  const color = p.snap ? '#d4a017' : '#2a6ed6';
  const a = vById(wall.v1), b = vById(wall.v2);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const nx = -Math.sin(ang), ny = Math.cos(ang);
  const perp = 350;
  // Перпендикуляр-засечка
  overlay.appendChild(svgEl('line', {
    x1: p.x + nx*perp, y1: p.y + ny*perp,
    x2: p.x - nx*perp, y2: p.y - ny*perp,
    class:'split-preview', stroke: color, 'stroke-width': 80, 'pointer-events':'none'
  }));
  // Точка сплита
  overlay.appendChild(svgEl('circle', {
    cx: p.x, cy: p.y, r: 130, class:'split-preview',
    fill: color, stroke:'#fff', 'stroke-width': 40, 'pointer-events':'none'
  }));
  // Значение расстояния
  const label = svgEl('text', {
    x: p.x + nx*(perp + 200), y: p.y + ny*(perp + 200),
    class:'split-preview', 'text-anchor':'middle', 'dominant-baseline':'central',
    fill: color, 'font-size': 240, 'font-weight':'700',
    'paint-order':'stroke', stroke:'#fff', 'stroke-width': 70,
    'pointer-events':'none'
  });
  label.textContent = Math.round(p.distMm) + ' мм' + (p.snap ? ' (снап)' : '');
  overlay.appendChild(label);
}
function clearSplitPreview() {
  document.querySelectorAll('#layerOverlay .split-preview').forEach(el => el.remove());
}

function renderChainSection(el, wall) {
  const wrap = document.createElement('div');
  wrap.className = 'chain-section';
  const head = document.createElement('div');
  head.className = 'chain-head';
  head.textContent = 'Размерная цепочка';
  wrap.appendChild(head);

  const segs = computeChainSegments(wall);
  if (segs.length === 0) {
    const empty = document.createElement('div'); empty.className='hint';
    empty.textContent = 'Нет якорей. Добавьте окно/дверь или пользовательскую точку.';
    wrap.appendChild(empty);
  } else {
    segs.forEach((seg, i) => {
      const row = document.createElement('div');
      row.className = 'chain-row';
      const lab = document.createElement('div');
      lab.className = 'chain-lab';
      lab.textContent = (i+1) + '. ' + seg.label;
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = '0'; inp.step = '1';
      inp.className = 'chain-inp';
      inp.value = seg.valueMm;
      inp.addEventListener('change', () => {
        const v = parseInt(inp.value, 10);
        if (isNaN(v) || v < 0) { inp.value = seg.valueMm; return; }
        const res = applyChainSegmentChange(wall, seg, v);
        if (!res.changed) alert(res.hint || 'Не удалось применить');
        render();
      });
      row.appendChild(lab); row.appendChild(inp);
      wrap.appendChild(row);
    });
    const sum = segs.reduce((s, x) => s + x.valueMm, 0);
    const geomLen = Math.round(wallLen(wall));
    const total = document.createElement('div');
    total.className = 'chain-total';
    const diff = sum - geomLen;
    const tol = (state.plan.settings && state.plan.settings.chainTolerance) || 5;
    if (Math.abs(diff) <= tol) {
      total.innerHTML = `<span>Сумма: <b>${sum} мм</b></span>  <span style="color:var(--st-verified)">✓ = ${geomLen} мм</span>`;
    } else {
      total.innerHTML = `<span>Сумма: <b>${sum} мм</b></span>  <span style="color:var(--st-conflict)">⚠ ≠ ${geomLen} мм (Δ=${diff})</span>`;
    }
    wrap.appendChild(total);
  }

  el.appendChild(wrap);
}
function renderRoomInspector(el, r) {
  if (!r) return;
  const title = document.createElement('div'); title.className='inspector-title'; title.textContent='Помещение ' + r.id; el.appendChild(title);
  el.appendChild(fieldText('Название', r.name, v => { pushHistory(); r.name=v; render(); }));
  el.appendChild(fieldText('Назначение', r.use, v => { pushHistory(); r.use=v; render(); }));
  el.appendChild(fieldMeasure('Высота потолка (мм)', r.ceilingHeight, obj => { pushHistory(); r.ceilingHeight=obj; render(); }));
  const poly = roomPolygon(r);
  const areaEl = document.createElement('div'); areaEl.className='hint';
  areaEl.textContent = poly && poly.length>=3 ? ('Площадь: ' + (polyArea(poly)/1e6).toFixed(2) + ' м²') : 'Контур не замкнут';
  el.appendChild(areaEl);
  const wallsEl = document.createElement('div'); wallsEl.className='hint';
  wallsEl.textContent = 'Стены: ' + r.walls.join(', '); el.appendChild(wallsEl);
  el.appendChild(fieldText('Примечание', r.note, v => { pushHistory(); r.note=v; render(); }, true));
  actionsRow(el, [{ label:'Удалить', danger:true, onClick: () => { if (confirm('Удалить помещение '+r.id+'?')) { pushHistory(); state.plan.rooms = state.plan.rooms.filter(x=>x.id!==r.id); state.ui.selected=null; render(); } } }]);
}
function renderDoorInspector(el, d) {
  if (!d) return;
  const title = document.createElement('div'); title.className='inspector-title'; title.textContent='Дверь ' + d.id; el.appendChild(title);
  el.appendChild(fieldSelect('Родительская стена', d.wallId, state.plan.walls.map(w=>({value:w.id,label:w.id})), v => { pushHistory(); d.wallId=v; render(); }));
  el.appendChild(fieldMeasure('Расстояние от начала (мм)', d.distance, obj => { pushHistory(); d.distance=obj; render(); }));
  el.appendChild(fieldMeasure('Ширина (мм)', d.width, obj => { pushHistory(); d.width=obj; render(); }));
  el.appendChild(fieldMeasure('Высота (мм)', d.height, obj => { pushHistory(); d.height=obj; render(); }));
  el.appendChild(fieldSelect('Сторона петель', d.hinge, [{value:'left',label:'левая'},{value:'right',label:'правая'}], v => { pushHistory(); d.hinge=v; render(); }));
  el.appendChild(fieldSelect('Направление открывания', d.swing, [{value:'in',label:'внутрь'},{value:'out',label:'наружу'}], v => { pushHistory(); d.swing=v; render(); }));
  el.appendChild(fieldText('Примечание', d.note, v => { pushHistory(); d.note=v; render(); }, true));
  actionsRow(el, [{ label:'Удалить', danger:true, onClick: () => { if (confirm('Удалить дверь '+d.id+'?')) { pushHistory(); state.plan.doors = state.plan.doors.filter(x=>x.id!==d.id); state.ui.selected=null; render(); } } }]);
}
function renderWindowInspector(el, o) {
  if (!o) return;
  const title = document.createElement('div'); title.className='inspector-title'; title.textContent='Окно ' + o.id; el.appendChild(title);
  el.appendChild(fieldSelect('Родительская стена', o.wallId, state.plan.walls.map(w=>({value:w.id,label:w.id})), v => { pushHistory(); o.wallId=v; render(); }));
  el.appendChild(fieldMeasure('Расстояние от начала (мм)', o.distance, obj => { pushHistory(); o.distance=obj; render(); }));
  el.appendChild(fieldMeasure('Ширина (мм)', o.width, obj => { pushHistory(); o.width=obj; render(); }));
  el.appendChild(fieldMeasure('Высота (мм)', o.height, obj => { pushHistory(); o.height=obj; render(); }));
  el.appendChild(fieldMeasure('Высота подоконника (мм)', o.sillHeight, obj => { pushHistory(); o.sillHeight=obj; render(); }));
  el.appendChild(fieldText('Примечание', o.note, v => { pushHistory(); o.note=v; render(); }, true));
  actionsRow(el, [{ label:'Удалить', danger:true, onClick: () => { if (confirm('Удалить окно '+o.id+'?')) { pushHistory(); state.plan.windows = state.plan.windows.filter(x=>x.id!==o.id); state.ui.selected=null; render(); } } }]);
}
function renderFurnitureInspector(el, f) {
  if (!f) return;
  const title = document.createElement('div'); title.className='inspector-title'; title.textContent='Мебель ' + f.id; el.appendChild(title);
  el.appendChild(fieldText('Название', f.name, v => { pushHistory(); f.name=v; render(); }));
  el.appendChild(fieldSelect('Тип', f.type, [
    {value:'bed',label:'кровать'},{value:'sofa',label:'диван'},{value:'wardrobe',label:'шкаф'},
    {value:'desk',label:'стол'},{value:'chair',label:'стул'},{value:'cabinet',label:'тумба'},
    {value:'kitchen',label:'кухонный модуль'},{value:'sanitary',label:'сантехприбор'},{value:'other',label:'другое'}
  ], v => { pushHistory(); f.type=v; render(); }));
  el.appendChild(fieldSelect('Помещение', f.roomId, [{value:'',label:'—'}].concat(state.plan.rooms.map(r=>({value:r.id,label:r.id+' '+r.name}))), v => { pushHistory(); f.roomId=v||null; render(); }));
  const row = document.createElement('div'); row.className='field-row';
  row.appendChild(fieldNumber('Ширина (мм)', f.width, v => { pushHistory(); f.width=v||0; render(); }));
  row.appendChild(fieldNumber('Глубина (мм)', f.depth, v => { pushHistory(); f.depth=v||0; render(); }));
  row.appendChild(fieldNumber('Высота (мм)', f.height, v => { pushHistory(); f.height=v||0; render(); }));
  el.appendChild(row);
  el.appendChild(fieldNumber('Поворот (°)', f.rotation, v => { pushHistory(); f.rotation=v||0; render(); }, 1));
  const posRow = document.createElement('div'); posRow.className='field-row';
  posRow.appendChild(fieldNumber('X (мм)', f.x, v => { pushHistory(); f.x=v||0; render(); }));
  posRow.appendChild(fieldNumber('Y (мм)', f.y, v => { pushHistory(); f.y=v||0; render(); }));
  el.appendChild(posRow);
  el.appendChild(fieldText('Примечание', f.note, v => { pushHistory(); f.note=v; render(); }, true));
  actionsRow(el, [
    { label:'Повернуть 90°', onClick: () => { pushHistory(); f.rotation=((f.rotation||0)+90)%360; render(); } },
    { label:'Удалить', danger:true, onClick: () => { if (confirm('Удалить '+f.id+'?')) { pushHistory(); state.plan.furniture = state.plan.furniture.filter(x=>x.id!==f.id); state.ui.selected=null; render(); } } }
  ]);
}
function renderStairsInspector(el, s) {
  if (!s) return;
  const title = document.createElement('div'); title.className='inspector-title'; title.textContent='Лестница ' + s.id; el.appendChild(title);
  // s.width — длина марша (вдоль направления подъёма); s.depth — ширина прохода (перпендикулярно движению)
  const row = document.createElement('div'); row.className='field-row';
  row.appendChild(fieldNumber('Длина марша (мм)', s.width, v => { pushHistory(); s.width=v||0; render(); }));
  row.appendChild(fieldNumber('Ширина прохода (мм)', s.depth, v => { pushHistory(); s.depth=v||0; render(); }));
  el.appendChild(row);
  const hint = document.createElement('div'); hint.className='hint';
  hint.textContent='Длина — вдоль подъёма (обычно 3000–4500 мм на один марш). Ширина прохода — где проходят люди (обычно 900–1200 мм).';
  el.appendChild(hint);
  el.appendChild(fieldNumber('Число маршей', s.flights, v => { pushHistory(); s.flights=v||1; render(); }, 1));
  el.appendChild(fieldSelect('Направление подъёма', s.direction, [{value:'up',label:'вверх'},{value:'down',label:'вниз'}], v => { pushHistory(); s.direction=v; render(); }));
  el.appendChild(fieldNumber('Поворот (°)', s.rotation, v => { pushHistory(); s.rotation=v||0; render(); }, 1));
  const posRow = document.createElement('div'); posRow.className='field-row';
  posRow.appendChild(fieldNumber('X (мм)', s.x, v => { pushHistory(); s.x=v||0; render(); }));
  posRow.appendChild(fieldNumber('Y (мм)', s.y, v => { pushHistory(); s.y=v||0; render(); }));
  el.appendChild(posRow);
  el.appendChild(fieldText('Примечание', s.note, v => { pushHistory(); s.note=v; render(); }, true));
  actionsRow(el, [
    { label:'Повернуть 90°', onClick: () => { pushHistory(); s.rotation=((s.rotation||0)+90)%360; render(); } },
    { label:'Удалить', danger:true, onClick: () => { if (confirm('Удалить лестницу '+s.id+'?')) { pushHistory(); state.plan.stairs = state.plan.stairs.filter(x=>x.id!==s.id); state.ui.selected=null; render(); } } }
  ]);
}
function renderVertexInspector(el, v) {
  if (!v) return;
  const title = document.createElement('div'); title.className='inspector-title'; title.textContent='Вершина ' + v.id; el.appendChild(title);
  const row = document.createElement('div'); row.className='field-row';
  row.appendChild(fieldNumber('X (мм)', v.x, val => { pushHistory(); v.x=val||0; render(); }));
  row.appendChild(fieldNumber('Y (мм)', v.y, val => { pushHistory(); v.y=val||0; render(); }));
  el.appendChild(row);
  const linked = state.plan.walls.filter(w => w.v1===v.id || w.v2===v.id);
  const hint = document.createElement('div'); hint.className='hint';
  hint.textContent = 'Стены: ' + (linked.map(w=>w.id).join(', ') || '—'); el.appendChild(hint);
  actionsRow(el, [{
    label: linked.length ? `Удалить + ${linked.length} стену(-ы)` : 'Удалить',
    danger: true,
    onClick: () => deleteVertex(v.id)
  }]);
}

function removeWall(id) {
  removeWallData(id);
  state.ui.selected = null; render();
}
function removeWallData(id) {
  state.plan.walls = state.plan.walls.filter(w => w.id !== id);
  state.plan.rooms.forEach(r => r.walls = r.walls.filter(x => x !== id));
  state.plan.doors = state.plan.doors.filter(d => d.wallId !== id);
  state.plan.windows = state.plan.windows.filter(o => o.wallId !== id);
}
function deleteVertex(vid) {
  const v = findById(state.plan.vertices, vid);
  if (!v) return;
  const linkedWalls = state.plan.walls.filter(w => w.v1 === vid || w.v2 === vid);
  if (linkedWalls.length === 0) {
    if (!confirm(`Удалить вершину ${vid}? Она не используется ни одной стеной.`)) return;
    pushHistory();
    state.plan.vertices = state.plan.vertices.filter(x => x.id !== vid);
  } else {
    const wallIds = linkedWalls.map(w => w.id).join(', ');
    const msg = `Вершина ${vid} — конец стен: ${wallIds}.\nУдалить вершину вместе с этими стенами?\n(OK — удалить всё; Отмена — не удалять)`;
    if (!confirm(msg)) return;
    pushHistory();
    linkedWalls.forEach(w => removeWallData(w.id));
    state.plan.vertices = state.plan.vertices.filter(x => x.id !== vid);
  }
  state.ui.selected = null;
  render();
}

// ---- Списки ----
function renderUnknowns() {
  const el = $('unknownsList'); el.innerHTML = '';
  const items = [];
  state.plan.walls.forEach(w => {
    if (chainDeclaredLen(w) == null)
      items.push({ type:'wall', id:w.id, text:`Длина стены ${w.id} не задана` });
    if (!w.height || w.height.value == null)
      items.push({ type:'wall', id:w.id, text:`Высота стены ${w.id} не задана` });
  });
  state.plan.rooms.forEach(r => {
    if (!r.ceilingHeight || r.ceilingHeight.value == null)
      items.push({ type:'room', id:r.id, text:`Высота потолка ${r.id} не задана` });
  });
  if (!items.length) { el.innerHTML = '<div class="empty" style="color:#666;padding:6px;">Нет неизвестных значений 🎉</div>'; return; }
  items.forEach(it => {
    const d = document.createElement('div'); d.className='item';
    d.innerHTML = `<span class="id">${it.id}</span> ${it.text}`;
    d.addEventListener('click', () => { state.ui.selected = { type: it.type, id: it.id }; render(); });
    el.appendChild(d);
  });
}
function renderWarnings() {
  const el = $('warningsList'); el.innerHTML = '';
  const warns = computeWarnings();
  const jsonErrs = validatePlan(state.plan);
  jsonErrs.forEach(err => { const d = document.createElement('div'); d.className='item warn'; d.textContent='JSON: '+err; el.appendChild(d); });
  if (!warns.length && !jsonErrs.length) { el.innerHTML = '<div class="empty" style="color:#666;padding:6px;">Противоречий не найдено</div>'; return; }
  warns.forEach(w => {
    const d = document.createElement('div'); d.className='item warn';
    d.innerHTML = `<span class="id">${w.id}</span> ${w.text}`;
    d.addEventListener('click', () => {
      const type = w.type.startsWith('room') ? 'room' : (w.type.startsWith('door') ? 'door' : (w.type.startsWith('window') ? 'window' : 'wall'));
      state.ui.selected = { type, id: w.id }; render();
    });
    el.appendChild(d);
  });
}

// ---- Взаимодействия ----
function bindUI() {
  $('btnFit').addEventListener('click', fitToView);
  $('btnUndo').addEventListener('click', undo);
  $('btnRedo').addEventListener('click', redo);
  $('btnReset').addEventListener('click', () => {
    if (!confirm('Сбросить все данные обоих этажей? Это удалит все правки.')) return;
    state.floors = buildInitialFloors();
    state.plan = state.floors[state.currentFloor];
    historyByFloor.F1 = { past: [], future: [] };
    historyByFloor.F2 = { past: [], future: [] };
    saveLocal(); fitToView(); render();
  });
  $('btnExport').addEventListener('click', exportFloor);
  $('btnExportProject').addEventListener('click', exportProject);
  $('fileImport').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(r.result);
        // Формат: { floors: {F1, F2} } или один этаж (наш формат)
        if (parsed.floors && parsed.floors.F1 && parsed.floors.F2) {
          const errs1 = validatePlan(parsed.floors.F1), errs2 = validatePlan(parsed.floors.F2);
          const errs = [...errs1.map(e => 'F1: '+e), ...errs2.map(e => 'F2: '+e)];
          if (errs.length && !confirm('В проекте обнаружены ошибки:\n' + errs.slice(0,10).join('\n') + '\n\nВсё равно импортировать?')) return;
          pushHistory();
          migrateRoomUse(parsed.floors.F1); migrateRoomUse(parsed.floors.F2);
          stripMeasureMeta(parsed.floors.F1); stripMeasureMeta(parsed.floors.F2);
          state.floors = { F1: parsed.floors.F1, F2: parsed.floors.F2 };
          state.plan = state.floors[state.currentFloor];
        } else {
          const errs = validatePlan(parsed);
          if (errs.length && !confirm('В JSON ошибки:\n' + errs.slice(0,10).join('\n') + '\n\nВсё равно импортировать?')) return;
          pushHistory();
          migrateRoomUse(parsed);
          stripMeasureMeta(parsed);
          state.floors[state.currentFloor] = parsed;
          state.plan = parsed;
        }
        render();
      } catch(err) { alert('Ошибка чтения JSON: ' + err.message); }
    };
    r.readAsText(f); e.target.value = '';
  });
  // Слои
  const layerMap = { tglRoomNames:'roomNames', tglRoomAreas:'roomAreas', tglWallNumbers:'wallNumbers', tglDimensions:'dimensions', tglDoors:'doors', tglWindows:'windows', tglFurniture:'furniture', tglStairs:'stairs' };
  Object.entries(layerMap).forEach(([id,key]) => {
    $(id).addEventListener('change', e => { state.ui.layers[key] = e.target.checked; saveLocal(); applyLayerToggles(); });
    $(id).checked = state.ui.layers[key];
  });
  // Добавление
  document.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', () => startAddMode(btn.getAttribute('data-add'))));
  document.querySelectorAll('[data-add-furn]').forEach(btn => btn.addEventListener('click', () => addFurniture(btn.getAttribute('data-add-furn'))));
  // Переключатель этажей
  document.querySelectorAll('.floor-btn').forEach(btn => {
    btn.addEventListener('click', () => switchFloor(btn.getAttribute('data-floor')));
  });
  // SVG события
  svg.addEventListener('click', onSvgClick);
  svg.addEventListener('mousedown', onSvgMouseDown);
  svg.addEventListener('mousemove', onSvgMouseMove);
  svg.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  svg.addEventListener('contextmenu', e => e.preventDefault());
}

// Живой предпросмотр стены в режиме добавления и подсказка про Shift-снап
function onSvgMouseMove(e) {
  if (state.ui.mode === 'add-wall' && state.ui.modeData && state.ui.modeData.v1) {
    const v1 = vById(state.ui.modeData.v1);
    const raw = screenToPlan(e.clientX, e.clientY);
    let x = raw.x, y = raw.y;
    // Приоритеты: 1) снап к существующей вершине; 2) снап 45° при Shift; 3) свободно
    const near = findNearVertex(raw.x, raw.y);
    let mode = 'free';
    if (near && near.id !== v1.id) { x = near.x; y = near.y; mode = 'vertex'; }
    else if (e.shiftKey) { const s = snapAngle45(v1.x, v1.y, x, y); x = s.x; y = s.y; mode = 'angle'; }
    updateWallPreview(v1.x, v1.y, x, y, mode);
    updateSnapMarker(near && near.id !== v1.id ? near : null);
  } else if (state.ui.mode === 'add-wall' && !state.ui.modeData) {
    // Перед первым кликом — показываем маркер снапа под курсором
    const raw = screenToPlan(e.clientX, e.clientY);
    const near = findNearVertex(raw.x, raw.y);
    updateSnapMarker(near);
    clearWallPreview();
  } else if (state.ui.mode === 'split-wall' && state.ui.modeData) {
    const wall = findById(state.plan.walls, state.ui.modeData.wallId);
    if (wall) {
      const p = computeSplitPreview(e, wall);
      if (p) {
        drawSplitPreview(wall, p);
        state.ui.modeData.pending = p;
      }
    }
  } else {
    clearWallPreview();
    updateSnapMarker(null);
    clearSplitPreview();
  }
}
function onKeyUp(e) {
  // При отпускании Shift в режиме add-wall пересчитаем предпросмотр (снап уйдёт)
  if (e.key === 'Shift' && state.ui.mode === 'add-wall' && state.ui.modeData && state.ui.modeData.v1) {
    // Форсируем обновление на следующем движении мыши — здесь без координат ничего не делаем
  }
}

function updateWallPreview(x1, y1, x2, y2, mode) {
  const colorByMode = { free: '#2a6ed6', angle: '#2e8f3f', vertex: '#d4a017' };
  const color = colorByMode[mode] || colorByMode.free;
  let line = document.getElementById('wallPreviewLine');
  const overlay = $('layerOverlay');
  if (!line) {
    line = svgEl('line', { id:'wallPreviewLine' });
    line.setAttribute('stroke-width', 120);
    line.setAttribute('stroke-dasharray', '300 200');
    line.setAttribute('pointer-events', 'none');
    line.setAttribute('opacity', '0.75');
    overlay.appendChild(line);
  }
  line.setAttribute('x1', x1); line.setAttribute('y1', y1);
  line.setAttribute('x2', x2); line.setAttribute('y2', y2);
  line.setAttribute('stroke', color);
}
function clearWallPreview() {
  const line = document.getElementById('wallPreviewLine');
  if (line) line.remove();
}
function updateSnapMarker(vertex) {
  const overlay = $('layerOverlay');
  let m = document.getElementById('snapMarker');
  if (!vertex) { if (m) m.remove(); return; }
  if (!m) {
    m = svgEl('circle', { id:'snapMarker', r: 200, fill:'none', stroke:'#d4a017', 'stroke-width':60, 'pointer-events':'none', opacity:'0.9' });
    overlay.appendChild(m);
  }
  m.setAttribute('cx', vertex.x);
  m.setAttribute('cy', vertex.y);
}

function switchFloor(floorId) {
  if (!state.floors[floorId] || state.currentFloor === floorId) return;
  state.currentFloor = floorId;
  state.plan = state.floors[floorId];
  state.ui.selected = null;
  saveLocal();
  render();
}
function planBBox() {
  const xs = state.plan.vertices.map(v=>v.x), ys = state.plan.vertices.map(v=>v.y);
  return { x:Math.min(...xs), y:Math.min(...ys), w:Math.max(...xs)-Math.min(...xs), h:Math.max(...ys)-Math.min(...ys) };
}
function fitToView() {
  const bb = planBBox();
  const rect = svg.getBoundingClientRect();
  const marg = 60;
  const sx = (rect.width - 2*marg) / bb.w, sy = (rect.height - 2*marg) / bb.h;
  const s = Math.min(sx, sy);
  const v = currentView();
  v.scale = s; v.tx = marg - bb.x * s; v.ty = marg - bb.y * s;
  saveLocal(); render();
}

function screenToPlan(x, y) {
  const v = currentView();
  const rect = svg.getBoundingClientRect();
  return { x: ((x - rect.left) - v.tx) / v.scale, y: ((y - rect.top) - v.ty) / v.scale };
}

let dragState = null;
function addDragListeners(e) {
  if (dragState && e && typeof e.clientX === 'number') {
    dragState.lastMouseX = e.clientX;
    dragState.lastMouseY = e.clientY;
  }
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);
  document.addEventListener('keydown', onDragKey);
  document.addEventListener('keyup', onDragKey);
}
function removeDragListeners() {
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
  document.removeEventListener('keydown', onDragKey);
  document.removeEventListener('keyup', onDragKey);
}
// Пересчёт позиции при нажатии/отпускании Shift во время drag'а без движения мыши
function onDragKey(e) {
  if (e.key !== 'Shift') return;
  if (!dragState || dragState.lastMouseX == null) return;
  onDragMove({ clientX: dragState.lastMouseX, clientY: dragState.lastMouseY, shiftKey: e.shiftKey });
}
// Ищем ближайший вверх по дереву SVG-элемент с data-type (для правильного event-делегирования)
function findInteractiveTarget(el) {
  while (el && el !== svg) {
    if (el.getAttribute && el.getAttribute('data-type')) return el;
    el = el.parentElement || el.parentNode;
  }
  return null;
}
function onSvgMouseDown(e) {
  if (e.button === 1 || e.button === 2 || e.altKey) {
    const v = currentView();
    dragState = { type:'pan', startX: e.clientX, startY: e.clientY, tx0: v.tx, ty0: v.ty };
    e.preventDefault();
    addDragListeners(e);
    return;
  }
  if (e.button !== 0) return;
  const t = findInteractiveTarget(e.target);
  const type = t && t.getAttribute('data-type');
  const id = t && t.getAttribute('data-id');
  // В режимах добавления не начинаем drag элементов — клик обработается в onSvgClick → handleAddModeClick
  if (state.ui.mode !== 'select') {
    if (!type) {
      const v = currentView();
      dragState = { type:'pan', startX: e.clientX, startY: e.clientY, tx0: v.tx, ty0: v.ty, mightBeClick: true };
      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', onDragEnd);
    }
    return;
  }
  if (type === 'vertex') {
    pushHistory();
    const vObj = vById(id);
    dragState = { type:'vertex', id, moved:false, x0: vObj.x, y0: vObj.y };
    addDragListeners(e);
    e.preventDefault(); return;
  }
  if (type === 'furn') {
    pushHistory();
    const f = findById(state.plan.furniture, id);
    dragState = { type:'furn', id, moved:false, x0:f.x, y0:f.y, startX:e.clientX, startY:e.clientY };
    addDragListeners(e);
    return;
  }
  if (type === 'stairs') {
    pushHistory();
    const s = findById(state.plan.stairs, id);
    dragState = { type:'stairs', id, moved:false, x0:s.x, y0:s.y, startX:e.clientX, startY:e.clientY };
    addDragListeners(e);
    return;
  }
  if (type === 'door' || type === 'window') {
    pushHistory();
    dragState = { type, id, moved:false };
    addDragListeners(e);
    e.preventDefault(); return;
  }
  if (type === 'stairs-handle') {
    const [sid, corner] = String(id).split(':');
    const s = findById(state.plan.stairs, sid);
    if (!s) return;
    pushHistory();
    const rot = (s.rotation||0) * Math.PI / 180;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    // Локальные координаты противоположного угла (в системе прямоугольника, до поворота)
    const oppMap = { tl: [s.width, s.depth], tr: [0, s.depth], br: [0, 0], bl: [s.width, 0] };
    const [oppLx, oppLy] = oppMap[corner];
    const oppWx = s.x + oppLx * cos - oppLy * sin;
    const oppWy = s.y + oppLx * sin + oppLy * cos;
    dragState = { type:'stairs-handle', id: sid, corner, moved:false, oppWx, oppWy, cos, sin };
    addDragListeners(e);
    e.preventDefault(); return;
  }
  if (!type) {
    const v = currentView();
    dragState = { type:'pan', startX: e.clientX, startY: e.clientY, tx0: v.tx, ty0: v.ty, mightBeClick: true };
    addDragListeners(e);
  }
}
function onDragMove(e) {
  if (!dragState) return;
  // Запоминаем последнюю позицию мыши, чтобы key-события Shift могли пересчитать без движения
  if (typeof e.clientX === 'number') { dragState.lastMouseX = e.clientX; dragState.lastMouseY = e.clientY; }
  if (dragState.type === 'pan') {
    const dx = e.clientX - dragState.startX, dy = e.clientY - dragState.startY;
    if (Math.abs(dx)+Math.abs(dy) > 3) dragState.mightBeClick = false;
    const v = currentView();
    v.tx = dragState.tx0 + dx; v.ty = dragState.ty0 + dy;
    applyViewportTransform(); return;
  }
  const p = screenToPlan(e.clientX, e.clientY);
  if (dragState.type === 'vertex') {
    const v = vById(dragState.id);
    let nx = p.x, ny = p.y;
    if (e.shiftKey) {
      // Ищем варианты «сохранить одну из смежных стен строго ортогональной».
      // Кандидаты: по оси Y соседей (стена станет горизонтальной)
      //           по оси X соседей (стена станет вертикальной)
      const walls = state.plan.walls.filter(w => w.v1 === dragState.id || w.v2 === dragState.id);
      let best = null, bestD = Infinity;
      for (const w of walls) {
        const otherId = w.v1 === dragState.id ? w.v2 : w.v1;
        const other = vById(otherId);
        if (!other) continue;
        // Сохранить x соседа → стена вертикальна
        const dxCand = Math.abs(other.x - nx);
        if (dxCand < bestD) { bestD = dxCand; best = { x: other.x, y: ny, orient:'vertical', otherId }; }
        // Сохранить y соседа → стена горизонтальна
        const dyCand = Math.abs(other.y - ny);
        if (dyCand < bestD) { bestD = dyCand; best = { x: nx, y: other.y, orient:'horizontal', otherId }; }
      }
      if (best) {
        nx = best.x; ny = best.y;
      } else {
        // Нет смежных стен — фолбэк на снап 45° от исходной позиции
        const s = snapAngle45(dragState.x0, dragState.y0, nx, ny);
        nx = s.x; ny = s.y;
      }
    }
    // Снап к другой существующей вершине (для склейки при отпускании)
    const near = findNearVertex(nx, ny, dragState.id);
    if (near) {
      nx = near.x; ny = near.y;
      dragState.mergeTarget = near.id;
      updateSnapMarker(near);
    } else {
      dragState.mergeTarget = null;
      updateSnapMarker(null);
    }
    v.x = Math.round(nx); v.y = Math.round(ny);
    dragState.moved = true; render();
  }
  if (dragState.type === 'furn') {
    const f = findById(state.plan.furniture, dragState.id);
    const s = currentView().scale;
    let dx = (e.clientX - dragState.startX)/s, dy = (e.clientY - dragState.startY)/s;
    if (e.shiftKey) ({ dx, dy } = axisLockDelta(dx, dy));
    f.x = Math.round(dragState.x0 + dx);
    f.y = Math.round(dragState.y0 + dy);
    dragState.moved = true; render();
  }
  if (dragState.type === 'stairs') {
    const st = findById(state.plan.stairs, dragState.id);
    const s = currentView().scale;
    let dx = (e.clientX - dragState.startX)/s, dy = (e.clientY - dragState.startY)/s;
    if (e.shiftKey) ({ dx, dy } = axisLockDelta(dx, dy));
    st.x = Math.round(dragState.x0 + dx);
    st.y = Math.round(dragState.y0 + dy);
    dragState.moved = true; render();
  }
  if (dragState.type === 'stairs-handle') {
    const s = findById(state.plan.stairs, dragState.id);
    if (!s) return;
    const { cos, sin, oppWx, oppWy } = dragState;
    // Переводим мышь и опорную (противоположную) точку в «выровненный» с прямоугольником базис
    const rotBack = (x, y) => ({ x: x*cos + y*sin, y: -x*sin + y*cos });
    const rotFwd  = (x, y) => ({ x: x*cos - y*sin, y:  x*sin + y*cos });
    const mLocal = rotBack(p.x, p.y);
    const oLocal = rotBack(oppWx, oppWy);
    const minX = Math.min(mLocal.x, oLocal.x);
    const minY = Math.min(mLocal.y, oLocal.y);
    const w = Math.max(200, Math.abs(mLocal.x - oLocal.x));
    const d = Math.max(200, Math.abs(mLocal.y - oLocal.y));
    const origin = rotFwd(minX, minY);
    s.x = Math.round(origin.x);
    s.y = Math.round(origin.y);
    s.width = Math.round(w);
    s.depth = Math.round(d);
    dragState.moved = true; render();
    return;
  }
  if (dragState.type === 'door' || dragState.type === 'window') {
    const list = dragState.type === 'door' ? state.plan.doors : state.plan.windows;
    const item = findById(list, dragState.id);
    if (!item) return;
    const wall = findById(state.plan.walls, item.wallId);
    if (!wall) return;
    const a = vById(wall.v1), b = vById(wall.v2);
    const L = Math.hypot(b.x-a.x, b.y-a.y);
    if (L < 1) return;
    // Проекция мыши на ось стены → доля вдоль стены [0..1]
    const t01 = ((p.x-a.x)*(b.x-a.x) + (p.y-a.y)*(b.y-a.y)) / (L*L);
    const width = numOr(item.width) || 900;
    // Центрируем проём на курсоре и зажимаем в пределы стены
    let dist = t01 * L - width / 2;
    dist = Math.max(0, Math.min(L - width, dist));
    item.distance = { value: Math.round(dist) };
    dragState.moved = true; render();
  }
}
function onDragEnd() {
  removeDragListeners();
  if (!dragState) return;
  if (dragState.type === 'pan' && dragState.mightBeClick) {
    state.ui.selected = null;
    render();
  }
  // Слияние вершин при отпускании на другой вершине
  if (dragState.type === 'vertex' && dragState.mergeTarget && dragState.mergeTarget !== dragState.id) {
    const affected = mergeVertices(dragState.id, dragState.mergeTarget);
    updateSnapMarker(null);
    const parts = [];
    if (affected.walls && affected.walls.length) parts.push('удалено вырожденных стен: ' + affected.walls.length);
    if (affected.doors && affected.doors.length) parts.push('дверей: ' + affected.doors.length);
    if (affected.windows && affected.windows.length) parts.push('окон: ' + affected.windows.length);
    setHint('Вершина слита с ' + dragState.mergeTarget + (parts.length ? ' (' + parts.join(', ') + ')' : ''));
    render();
  }
  if (dragState.moved) saveLocal();
  dragState = null;
}
function onSvgClick(e) {
  const t = findInteractiveTarget(e.target);
  const type = t && t.getAttribute('data-type');
  const id = t && t.getAttribute('data-id');
  if (state.ui.mode !== 'select') { handleAddModeClick(e); return; }
  if (type && id) { state.ui.selected = { type, id }; render(); }
}
function onWheel(e) {
  e.preventDefault();
  const p = screenToPlan(e.clientX, e.clientY);
  const factor = e.deltaY < 0 ? 1.15 : 1/1.15;
  const v = currentView();
  const s1 = Math.max(0.005, Math.min(2, v.scale * factor));
  const rect = svg.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  v.tx = sx - p.x * s1; v.ty = sy - p.y * s1; v.scale = s1;
  applyViewportTransform(); saveLocal();
  $('zoomLabel').textContent = `Этаж ${state.currentFloor} · Масштаб: ${(s1*1000).toFixed(1)} px/м`;
}
function onKey(e) {
  if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
  if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z') { e.preventDefault(); undo(); }
  else if ((e.ctrlKey||e.metaKey) && (e.key.toLowerCase()==='y' || (e.shiftKey && e.key.toLowerCase()==='z'))) { e.preventDefault(); redo(); }
  else if (e.key === 'Escape') {
    exitAddMode('Готово');
    state.ui.selected=null; render();
  } else if (e.key === '1') { switchFloor('F1'); }
  else if (e.key === '2') { switchFloor('F2'); }
  else if (e.key === 'Delete' || e.key === 'Backspace') {
    const s = state.ui.selected; if (!s) return;
    if (s.type === 'vertex') { deleteVertex(s.id); return; }
    if (!confirm('Удалить '+s.type+' '+s.id+'?')) return;
    pushHistory();
    if (s.type === 'wall') removeWall(s.id);
    else if (s.type === 'room') state.plan.rooms = state.plan.rooms.filter(x=>x.id!==s.id);
    else if (s.type === 'door') state.plan.doors = state.plan.doors.filter(x=>x.id!==s.id);
    else if (s.type === 'window') state.plan.windows = state.plan.windows.filter(x=>x.id!==s.id);
    else if (s.type === 'furn') state.plan.furniture = state.plan.furniture.filter(x=>x.id!==s.id);
    else if (s.type === 'stairs') state.plan.stairs = state.plan.stairs.filter(x=>x.id!==s.id);
    state.ui.selected = null; render();
  } else if (state.ui.mode === 'add-room' && e.key === 'Enter' && state.ui.modeData) {
    finalizeRoomFromVertices();
  }
}
function setHint(text) { $('hint').textContent = text; }

// ---- Режимы добавления ----
function startAddMode(kind) {
  // Повторный клик по активной кнопке — выход из режима
  if (state.ui.mode === 'add-' + kind) {
    exitAddMode('Режим отменён.');
    return;
  }
  state.ui.mode = 'add-' + kind; state.ui.modeData = null;
  document.body.classList.remove('mode-add-wall','mode-add-room','mode-add-door','mode-add-window');
  document.body.classList.add('mode-add', 'mode-add-' + kind);
  clearWallPreview(); updateSnapMarker(null);
  if (kind === 'wall') setHint('Кликните первую точку новой стены (клик по вершине = переиспользовать её, клик на пустое место = новая; Shift на втором клике = снап 45°). Esc — отмена.');
  if (kind === 'room') setHint('Кликайте вершины по контуру помещения (в порядке обхода). Enter — создать. Клик по последней — убрать её. Клик по первой (после 3+) — замкнуть. Esc — отмена.');
  if (kind === 'door') setHint('Кликните на стену для размещения двери. Esc — отмена.');
  if (kind === 'window') setHint('Кликните на стену для размещения окна. Esc — отмена.');
  if (kind === 'stairs') setHint('Кликните точку размещения лестницы. Esc — отмена.');
  updateAddButtonStates();
}
function exitAddMode(hint) {
  state.ui.mode = 'select'; state.ui.modeData = null;
  document.body.classList.remove('mode-add','mode-add-wall','mode-add-room','mode-add-door','mode-add-window','mode-add-stairs','mode-add-split');
  clearWallPreview(); updateSnapMarker(null);
  clearRoomPreview();
  clearSplitPreview();
  if (hint) setHint(hint);
  updateAddButtonStates();
}

// Превью полигона помещения при выборе вершин
function renderRoomPreview() {
  const overlay = $('layerOverlay');
  clearRoomPreview();
  if (state.ui.mode !== 'add-room' || !state.ui.modeData) return;
  const ids = state.ui.modeData.vertices || [];
  const pts = ids.map(id => vById(id)).filter(Boolean);
  if (pts.length === 0) return;
  // Полигон-заливка (открытая, если < 3 точек)
  if (pts.length >= 2) {
    const el = pts.length >= 3
      ? svgEl('polygon', { points: pts.map(p=>`${p.x},${p.y}`).join(' '),
          class:'room-preview', fill:'rgba(42,110,214,0.18)',
          stroke:'#2a6ed6', 'stroke-width':100, 'stroke-dasharray':'250 150',
          'pointer-events':'none' })
      : svgEl('polyline', { points: pts.map(p=>`${p.x},${p.y}`).join(' '),
          class:'room-preview', fill:'none',
          stroke:'#2a6ed6', 'stroke-width':100, 'stroke-dasharray':'250 150',
          'pointer-events':'none' });
    overlay.appendChild(el);
  }
  // Кружки выбранных вершин с номерами шагов
  pts.forEach((p, i) => {
    overlay.appendChild(svgEl('circle', {
      cx: p.x, cy: p.y, r: 130,
      class:'room-preview', fill:'#2a6ed6', stroke:'#fff', 'stroke-width':40,
      'pointer-events':'none'
    }));
    const t = svgEl('text', {
      x: p.x, y: p.y, class:'room-preview',
      'text-anchor':'middle', 'dominant-baseline':'central',
      fill:'#fff', 'font-size':160, 'font-weight':'700', 'pointer-events':'none'
    });
    t.textContent = String(i + 1);
    overlay.appendChild(t);
  });
}
function clearRoomPreview() {
  document.querySelectorAll('#layerOverlay .room-preview').forEach(el => el.remove());
}

// Создание помещения из выбранных вершин.
// Автосплит убран — если между парой вершин нет прямой стены, но осевая другой стены
// проходит через обе точки, показываем сообщение о необходимости ручного сплита.
function finalizeRoomFromVertices() {
  const d = state.ui.modeData;
  if (!d || !Array.isArray(d.vertices) || d.vertices.length < 3) {
    alert('Нужно минимум 3 вершины для помещения.');
    return;
  }
  const vertexIds = d.vertices.slice();
  const plan = state.plan;
  const floor = state.currentFloor;

  // Анализ пар БЕЗ модификации данных
  const pairs = [];
  for (let i = 0; i < vertexIds.length; i++) {
    const aId = vertexIds[i], bId = vertexIds[(i + 1) % vertexIds.length];
    // Ищем цепочку стен вдоль прямой a→b (допускаются промежуточные вершины на линии)
    const chainIds = findWallChainBetween(aId, bId, plan);
    if (chainIds && chainIds.length) {
      pairs.push({ aId, bId, kind: 'chain', wallIds: chainIds });
      continue;
    }
    // Цепочки нет — проверим, проходит ли осевая какой-то стены через обе вершины (кандидат на сплит)
    const spanning = findWallSpanningBoth(aId, bId, plan);
    if (spanning && !spanning.direct) {
      pairs.push({ aId, bId, kind:'needs-split', throughWallId: spanning.wall.id });
    } else {
      pairs.push({ aId, bId, kind:'no-wall' });
    }
  }

  const needSplit = pairs.filter(p => p.kind === 'needs-split');
  const noWall = pairs.filter(p => p.kind === 'no-wall');

  // Сообщение о необходимости ручного сплита
  if (needSplit.length) {
    const list = needSplit.map(p =>
      `  • ${p.aId}↔${p.bId}  —  разбейте ${p.throughWallId}`
    ).join('\n');
    alert(
      'Нельзя создать помещение автоматически.\n\n' +
      'Между следующими парами вершин нет прямой стены, но их можно разделить, ' +
      'разбив соответствующую существующую стену:\n\n' + list +
      '\n\nВыделите нужную стену → в инспекторе нажмите «Разделить стену» → ' +
      'кликните нужную точку. После этого повторите создание помещения.'
    );
    return; // Не создаём помещение до ручного сплита
  }

  // Спросить про создание перегородок для «no-wall» пар
  let createdCount = 0;
  if (noWall.length) {
    const list = noWall.map(p => p.aId + '↔' + p.bId).join(', ');
    const ok = confirm(
      'Между парами вершин (' + list + ') нет стен.\n' +
      'Создать для них тонкие перегородки автоматически?\n\n' +
      'Отмена — рёбра останутся без стен, валидатор покажет предупреждение.');
    if (ok) {
      pushHistory();
      for (const p of noWall) {
        p.wallId = ensureWallBetween(p.aId, p.bId, plan, floor, { create: true });
        if (p.wallId) createdCount++;
      }
    } else {
      pushHistory();
    }
  } else {
    pushHistory();
  }

  const walls = [];
  for (const p of pairs) {
    // Из цепочки берём все стены; из direct/create — одну.
    if (p.kind === 'chain' && Array.isArray(p.wallIds)) {
      for (const wid of p.wallIds) if (wid && !walls.includes(wid)) walls.push(wid);
    } else if (p.wallId && !walls.includes(p.wallId)) {
      walls.push(p.wallId);
    }
  }

  const rid = nextId('R', plan.rooms);
  plan.rooms.push({
    id: rid, name: rid, use: '',
    ceilingHeight: m(null,'unknown'),
    vertices: vertexIds,
    walls,
    note: ''
  });
  state.ui.selected = { type:'room', id: rid };
  const parts = ['вершин: '+vertexIds.length, 'стен: '+walls.length];
  if (createdCount) parts.push('новых перегородок: '+createdCount);
  exitAddMode('Помещение '+rid+' создано ('+parts.join(', ')+')');
  render();
}
function handleAddModeClick(e) {
  const t = findInteractiveTarget(e.target);
  const type = t && t.getAttribute('data-type');
  const id = t && t.getAttribute('data-id');
  const raw = screenToPlan(e.clientX, e.clientY);
  if (state.ui.mode === 'split-wall') {
    const wall = findById(state.plan.walls, state.ui.modeData && state.ui.modeData.wallId);
    if (!wall) { exitAddMode('Стена не найдена'); return; }
    const p = state.ui.modeData.pending || computeSplitPreview(e, wall);
    if (!p) { setHint('Наведите на стену'); return; }
    const totalLen = wallLen(wall);
    if (p.distMm < 100 || p.distMm > totalLen - 100) {
      setHint('Слишком близко к концу стены. Минимум 100 мм от края.');
      return;
    }
    const segIds = performWallSplitAtDistance(wall, p.distMm, p.snap ? p.vertexId : null);
    exitAddMode('Стена разбита: ' + (segIds || []).join(' + '));
    return;
  }
  if (state.ui.mode === 'add-wall') {
    // Приоритеты: 1) существующая вершина рядом с курсором; 2) снап 45° при Shift для второго клика; 3) свободная позиция
    let vid;
    const v1id = state.ui.modeData && state.ui.modeData.v1;
    const near = findNearVertex(raw.x, raw.y);
    if (near && near.id !== v1id) {
      vid = near.id;
    } else {
      let px = raw.x, py = raw.y;
      if (v1id && e.shiftKey) {
        const v1 = vById(v1id);
        const s = snapAngle45(v1.x, v1.y, raw.x, raw.y);
        px = s.x; py = s.y;
      }
      vid = 'v' + (state.plan.vertices.length + 1).toString().padStart(3,'0');
      while (state.plan.vertices.find(v => v.id === vid)) vid = 'v' + Math.floor(Math.random()*1e6);
      pushHistory();
      state.plan.vertices.push({ id: vid, x: Math.round(px), y: Math.round(py) });
    }
    if (!state.ui.modeData) {
      state.ui.modeData = { v1: vid };
      setHint('Первая точка задана. Кликните вторую (наведите на существующую вершину — привяжется; Shift = снап 45°).');
      render();
    } else {
      const v1 = state.ui.modeData.v1;
      if (v1 === vid) { setHint('Нулевая длина, отмена.'); return; }
      pushHistory();
      const wid = nextId('W', state.plan.walls);
      state.plan.walls.push({
        id: wid, v1, v2: vid, type:'partition',
        thickness: m(DEFAULT_THICKNESS_INT),
        height: m(null), note: ''
      });
      state.ui.selected = { type:'wall', id: wid };
      exitAddMode('Стена '+wid+' добавлена.');
      render();
    }
  } else if (state.ui.mode === 'add-door' || state.ui.mode === 'add-window') {
    if (type !== 'wall') { setHint('Нужно кликнуть на стену.'); return; }
    const w = findById(state.plan.walls, id);
    if (!w) { setHint('Стена не найдена.'); return; }
    const a = vById(w.v1), b = vById(w.v2);
    const L = Math.hypot(b.x-a.x, b.y-a.y);
    const openWidth = 900;
    if (L < openWidth + 100) { setHint(`Стена ${w.id} слишком короткая (${Math.round(L)} мм) для проёма 900 мм.`); return; }
    // Проецируем клик на стену: t01 ∈ [0..1] — позиция вдоль оси
    const t01 = ((raw.x-a.x)*(b.x-a.x) + (raw.y-a.y)*(b.y-a.y)) / (L*L);
    const dist = Math.max(50, Math.min(L - openWidth - 50, t01 * L - openWidth/2));
    pushHistory();
    if (state.ui.mode === 'add-door') {
      const did = nextId('D', state.plan.doors);
      state.plan.doors.push({
        id: did, wallId: w.id,
        distance: m(Math.round(dist),'entered','user'),
        width: m(900,'entered','user'), height: m(2100,'entered','user'),
        hinge:'left', swing:'in', note:''
      });
      state.ui.selected = { type:'door', id: did };
    } else {
      const oid = nextId('O', state.plan.windows);
      state.plan.windows.push({
        id: oid, wallId: w.id,
        distance: m(Math.round(dist),'entered','user'),
        width: m(900,'entered','user'), height: m(1400,'entered','user'),
        sillHeight: m(900,'entered','user'), note:''
      });
      state.ui.selected = { type:'window', id: oid };
    }
    exitAddMode(); render();
  } else if (state.ui.mode === 'add-room') {
    if (type !== 'vertex') { setHint('Нужно кликнуть по вершине (белый кружок в углу стены).'); return; }
    if (!state.ui.modeData) state.ui.modeData = { vertices: [] };
    const list = state.ui.modeData.vertices;
    // Клик по последней добавленной — убрать её (отмена шага)
    if (list.length && list[list.length - 1] === id) {
      list.pop();
    }
    // Клик по первой вершине с 3+ уже выбранными — трактуем как закрытие контура и создание
    else if (list.length >= 3 && list[0] === id) {
      finalizeRoomFromVertices();
      return;
    }
    // Иначе добавить, если не дубликат подряд
    else if (!list.length || list[list.length - 1] !== id) {
      list.push(id);
    }
    renderRoomPreview();
    setHint('Выбрано вершин: ' + list.length + '. Кликните по первой вершине или Enter — создать. Клик по последней — убрать. Esc — отмена.');
  } else if (state.ui.mode === 'add-stairs') {
    pushHistory();
    const sid = nextId('S', state.plan.stairs);
    const width = 2400, depth = 1200;
    // Определяем помещение под точкой клика
    let roomId = null;
    for (const r of state.plan.rooms) {
      const poly = roomPolygon(r);
      if (poly && poly.length >= 3 && pointInPolygon(raw, poly)) { roomId = r.id; break; }
    }
    state.plan.stairs.push({
      id: sid, roomId,
      x: Math.round(raw.x - width/2),
      y: Math.round(raw.y - depth/2),
      width, depth,
      rotation: 0, flights: 2, direction: 'up', note: ''
    });
    state.ui.selected = { type:'stairs', id: sid };
    exitAddMode('Лестница '+sid+' добавлена.'); render();
  }
}
// Проверка самопересечения замкнутого полигона: сравниваем каждую пару рёбер, не соседних
function polygonSelfIntersects(pts) {
  if (!pts || pts.length < 4) return false;
  const seg = (i) => [pts[i], pts[(i+1) % pts.length]];
  const cross = (ax, ay, bx, by) => ax * by - ay * bx;
  const segSeg = (p1, p2, p3, p4) => {
    const d1 = cross(p4.x - p3.x, p4.y - p3.y, p1.x - p3.x, p1.y - p3.y);
    const d2 = cross(p4.x - p3.x, p4.y - p3.y, p2.x - p3.x, p2.y - p3.y);
    const d3 = cross(p2.x - p1.x, p2.y - p1.y, p3.x - p1.x, p3.y - p1.y);
    const d4 = cross(p2.x - p1.x, p2.y - p1.y, p4.x - p1.x, p4.y - p1.y);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
           ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      // Соседние по кругу рёбра пропускаем
      if (i === 0 && j === n - 1) continue;
      const [a, b] = seg(i), [c, d] = seg(j);
      if (segSeg(a, b, c, d)) return true;
    }
  }
  return false;
}

// Классический ray-casting: точка внутри многоугольника
function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y)) &&
      (p.x < (xj - xi) * (p.y - yi) / (yj - yi + 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function addFurniture(kind) {
  const defaults = {
    bed:{w:1600,d:2000,h:500,name:'кровать'}, sofa:{w:2000,d:900,h:850,name:'диван'},
    wardrobe:{w:1200,d:600,h:2200,name:'шкаф'}, desk:{w:1200,d:600,h:750,name:'стол'},
    chair:{w:500,d:500,h:900,name:'стул'}, cabinet:{w:600,d:400,h:600,name:'тумба'},
    kitchen:{w:2400,d:600,h:900,name:'кухонный модуль'}, sanitary:{w:600,d:600,h:400,name:'сантехприбор'}
  };
  const d = defaults[kind] || defaults.desk;
  pushHistory();
  const fid = nextId('F', state.plan.furniture);
  const bb = planBBox();
  state.plan.furniture.push({
    id: fid, type: kind, name: d.name, roomId: null,
    x: Math.round(bb.x + bb.w/2 - d.w/2), y: Math.round(bb.y + bb.h/2 - d.d/2),
    width: d.w, depth: d.d, height: d.h, rotation: 0, note:''
  });
  state.ui.selected = { type:'furn', id: fid }; render();
}

// ---- Экспорт ----
function exportFloor() {
  const blob = new Blob([JSON.stringify(state.plan, null, 2)], { type:'application/json' });
  triggerDownload(blob, `plan-${state.currentFloor.toLowerCase()}.json`);
}
function exportProject() {
  const project = {
    version: '3.0',
    exportedFloors: ['F1','F2'],
    floors: state.floors
  };
  const blob = new Blob([JSON.stringify(project, null, 2)], { type:'application/json' });
  triggerDownload(blob, 'plan-project.json');
}
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}

// ---- Инициализация ----
function init() {
  if (!loadLocal()) {
    state.floors = buildInitialFloors();
    state.currentFloor = 'F1';
    state.plan = state.floors.F1;
  }
  ['F1','F2'].forEach(f => {
    if (!state.floors[f].stairs) state.floors[f].stairs = [];
    if (!state.floors[f].furniture) state.floors[f].furniture = [];
  });
  bindUI();
  window.requestAnimationFrame(() => { fitToView(); render(); });
  render();
}
document.addEventListener('DOMContentLoaded', init);
