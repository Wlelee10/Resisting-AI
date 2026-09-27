/* =========================================
   BUILD YOUR OWN GARDEN
   BUILDER
   떨어진 fragment → AI ASSET LIBRARY로 정리 → 캔버스에 끌어와 정원 만들기
========================================= */

(() => {
  const builder = document.querySelector("#builder");
  if (!builder) return;

  const $ = (selector) => builder.querySelector(selector);

  const builderBg = $("#builderBg");
  const pileLayer = $("#pileLayer");
  const dragLayer = $("#dragLayer");
  const library = $("#library");
  const libraryScroll = $("#libraryScroll");
  const libraryGrid = $("#libraryGrid");
  const workPanel = $("#workPanel");
  const preview = $("#preview");
  const previewImage = $("#previewImage");
  const previewNumber = $("#previewNumber");
  const previewEmpty = $("#previewEmpty");
  const toolbar = $("#toolbar");
  const layersPanel = $("#layers");
  const layersList = $("#layersList");
  const layersEmpty = $("#layersEmpty");
  const groupButton = $("#groupButton");
  const canvas = $("#canvas");
  const stage = $("#canvasStage");
  const overlay = $("#canvasOverlay");
  const selFrame = $("#selFrame");
  const selOutlines = $("#selOutlines");
  const selLabel = $("#selLabel");
  const marquee = $("#marquee");
  const penPath = $("#penPath");
  const guideX = $("#guideX");
  const guideY = $("#guideY");
  const info = $("#info");
  const timerText = $("#timerText");
  const selectedCount = $("#selectedCount");
  const finishButton = $("#finishButton");
  const colorPopover = $("#colorPopover");
  const swatchBox = $("#swatches");
  const colorInput = $("#colorInput");
  const eyedropperButton = $("#eyedropperButton");
  const currentColor = $("#currentColor");
  const loupe = $("#loupe");
  const loupeSwatch = $("#loupeSwatch");
  const loupeHex = $("#loupeHex");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const isMac = /Mac|iPhone|iPad/.test(navigator.userAgentData?.platform ?? navigator.platform);
  const MOD_LABEL = isMac ? "⌘" : "Ctrl+";

  /* =========================================
     SETTINGS
  ========================================= */

  const FRAGMENT_COUNT = 200;
  const UNITS = 1000;            // 캔버스 내부 좌표 (화면 크기가 바뀌어도 그대로)
  const TOOL_SIZE = 38;          // 툴 버튼 한 칸
  const GAP = 16;                // 캔버스와 양옆 칸 사이
  const RIGHT_W = 170;           // 오른쪽 칸 (툴바 · 숫자)
  const DEFAULT_ITEM = 0.32;     // 캔버스에 처음 놓일 때 크기 (캔버스 대비)
  const MIN_ITEM = 16;           // 캔버스 조각 최소 크기 (units)
  const SNAP_PX = 6;             // 중앙 정렬에 붙는 거리
  const DRAG_START_PX = 4;       // 라이브러리에서 이만큼 움직이면 끌기 시작 (아니면 클릭 = 미리보기)

  const SWATCHES = [
    "#ffffff", "#f4f1ea", "#e8e8e8", "#9a9a9a", "#111111",
    "#f6d9d4", "#fbe8c8", "#dcebd3", "#d5e5f5", "#e3dbf2"
  ];

  /* =========================================
     HELPERS
  ========================================= */

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const lerp = (from, to, amount) => from + (to - from) * amount;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const now = () => performance.now();
  const instant = () => reduceMotion.matches;

  function normalizeAngle(angle) {
    let a = angle % 360;
    if (a > 180) a -= 360;
    if (a <= -180) a += 360;
    return a;
  }

  const pad2 = (id) => (id < 100 ? String(id).padStart(2, "0") : String(id));
  const fragmentFile = (id) => encodeURIComponent(`#${pad2(id)}.png`);
  const smallSrc = (id) => `fragments-small/${fragmentFile(id)}`;
  const largeSrc = (id) => `fragments-large/${fragmentFile(id)}`;

  // 회전된 상자의 가로/세로 절반 크기
  function extents(w, h, rotation) {
    const angle = (rotation * Math.PI) / 180;
    const sin = Math.abs(Math.sin(angle));
    const cos = Math.abs(Math.cos(angle));
    return { hw: (w * cos + h * sin) / 2, hh: (w * sin + h * cos) / 2 };
  }

  function rotate(point, degrees) {
    const angle = (degrees * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
  }

  // 비율을 유지하며 size 안에 맞추기
  function fit(aspect, size) {
    return aspect >= 1 ? { w: size, h: size / aspect } : { w: size * aspect, h: size };
  }

  function drawBox(element, x, y, w, h, rotation) {
    element.style.width = `${w.toFixed(1)}px`;
    element.style.height = `${h.toFixed(1)}px`;
    element.style.transform =
      `translate3d(${(x - w / 2).toFixed(1)}px, ${(y - h / 2).toFixed(1)}px, 0) ` +
      `rotate(${rotation.toFixed(2)}deg)`;
  }

  // 점이 다각형 안에 있는지 (모양으로 자른 영역 판별)
  function insidePolygon(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /* =========================================
     STATE
  ========================================= */

  let active = false;
  let rects = null;               // 현재 레이아웃
  let canvasRect = null;          // 캔버스의 실제 화면 위치 (매 프레임)

  const pieces = [];              // 떨어진 조각 (fragment 1개당 1개) → 라이브러리로 날아감
  const cells = [];               // 라이브러리 칸
  let previewId = null;

  // 캔버스 위 조각 (배열 순서 = 레이어 순서, 마지막이 맨 위)
  // { uid, id, x, y, w, h, rotation, flip, crop: { l, t, r, b }, mask, locked, hidden, group, name }
  const items = [];
  // 그룹 (⌘/Ctrl + G) — 같은 그룹의 조각은 레이어에서 항상 붙어 있음
  // { gid, name, collapsed }
  const groups = [];
  let nextGid = 1;
  const itemElements = new Map();
  const selection = new Set();    // 선택된 uid
  let nextUid = 1;
  let background = "#ffffff";

  const history = [];
  let historyIndex = -1;

  let timerElapsed = 0;           // 지금까지 쌓인 시간 (ms)
  let timerRunningSince = null;   // 재고 있는 중이면 시작한 시각
  let lastTimerText = "";

  let press = null;               // 라이브러리/미리보기를 누른 상태 (아직 끌기 전)
  let drag = null;                // 라이브러리에서 들고 있는 조각
  let action = null;              // 캔버스 위 이동/크기/회전/영역 선택/자르기/모양 자르기
  let cropping = null;            // 네모 자르기 모드
  let cutting = null;             // 모양 자르기 모드
  let sampling = false;           // 스포이드 모드
  let layerDrag = null;
  let layerRows = [];             // 지금 레이어 패널에 보이는 줄
  let layerAnchor = null;         // 마지막으로 누른 줄 (⇧ 범위 선택 · Enter 이름 바꾸기 기준)
  let layersFocused = false;      // 마지막으로 누른 곳이 레이어 패널인지
  let renaming = null;            // 이름을 바꾸는 중인 줄

  /* =========================================
     LAYOUT
     [라이브러리] [미리보기·레이어 | 캔버스 | 툴바·숫자]
  ========================================= */

  function computeLayout() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = clamp(vw * 0.012, 10, 22);
    const libraryWidth = clamp(vw * 0.19, 250, 380);

    const panelLeft = margin + libraryWidth + 14;
    const panel = { left: panelLeft, top: margin, width: vw - panelLeft - margin, height: vh - margin * 2 };

    // 캔버스 크기: 높이 기준, 폭이 모자라면 줄임 (미리보기 = 캔버스의 약 1/4)
    const pad = clamp(panel.height * 0.07, 22, 70);
    const previewRatio = 0.31;
    const byHeight = panel.height - pad * 2;
    const byWidth = (panel.width - pad * 2 - GAP * 2 - RIGHT_W) / (1 + previewRatio);
    const size = Math.max(240, Math.min(byHeight, byWidth));
    const previewSize = clamp(size * previewRatio, 130, 320);

    const groupWidth = previewSize + GAP + size + GAP + RIGHT_W;
    const groupLeft = panelLeft + Math.max(pad, (panel.width - groupWidth) / 2);
    const top = margin + (panel.height - size) / 2;

    const canvasBox = { left: groupLeft + previewSize + GAP, top, width: size, height: size };
    const right = canvasBox.left + size + GAP;
    const layersWidth = previewSize * 0.86;
    const layersHeight = Math.max(140, size * 0.4);

    rects = {
      library: { left: margin, top: margin, width: libraryWidth, height: vh - margin * 2 },
      panel,
      canvas: canvasBox,
      preview: { left: groupLeft, top, width: previewSize, height: previewSize },
      layers: {
        left: canvasBox.left - GAP - layersWidth,
        top: top + size - layersHeight,
        width: layersWidth,
        height: layersHeight
      },
      toolbar: { left: right, top, width: TOOL_SIZE },
      info: {
        left: right + TOOL_SIZE * 0.6,
        top: top + size * 0.72,
        width: RIGHT_W - TOOL_SIZE * 0.6,
        height: size * 0.28
      }
    };
  }

  function place(element, rect) {
    element.style.left = `${rect.left}px`;
    element.style.top = `${rect.top}px`;
    if (rect.width != null) element.style.width = `${rect.width}px`;
    if (rect.height != null) element.style.height = `${rect.height}px`;
  }

  function applyLayout(immediate) {
    if (immediate) builder.classList.add("no-anim");

    place(library, rects.library);
    place(workPanel, rects.panel);
    place(preview, rects.preview);
    place(canvas, rects.canvas);
    place(overlay, rects.canvas);
    place(layersPanel, rects.layers);
    place(toolbar, rects.toolbar);
    place(info, rects.info);
    stage.style.transform = `scale(${rects.canvas.width / UNITS})`;

    if (immediate) {
      builder.offsetWidth; // 즉시 반영
      builder.classList.remove("no-anim");
    }
  }

  function readCanvasRect() {
    canvasRect = canvas.getBoundingClientRect();
  }

  const canvasScale = () => canvasRect.width / UNITS;

  function insideCanvas(x, y) {
    const r = canvasRect;
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function toUnits(x, y) {
    const scale = canvasScale();
    return { x: (x - canvasRect.left) / scale, y: (y - canvasRect.top) / scale };
  }

  /* =========================================
     LIBRARY (#01 ~ #200)
  ========================================= */

  function buildLibrary() {
    const fragment = document.createDocumentFragment();

    for (let id = 1; id <= FRAGMENT_COUNT; id++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "library-cell is-empty";
      cell.dataset.id = id;
      cell.setAttribute("aria-label", `Fragment ${pad2(id)}`);

      const art = document.createElement("span");
      art.className = "cell-art";

      const image = document.createElement("img");
      image.src = smallSrc(id);
      image.alt = "";
      image.draggable = false;

      const number = document.createElement("span");
      number.className = "cell-number";
      number.textContent = `#${pad2(id)}`;

      art.appendChild(image);
      cell.append(art, number);
      fragment.appendChild(cell);
      cells.push(cell);
    }

    libraryGrid.appendChild(fragment);
  }

  function aspectOf(id) {
    return pieces[id - 1]?.aspect ?? 1;
  }

  // 칸의 그림 영역 안에 비율을 유지하며 들어가는 크기와 위치
  function cellBox(id) {
    const rect = cells[id - 1].firstChild.getBoundingClientRect();
    const { w, h } = fit(aspectOf(id), rect.width);
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, w, h, rect };
  }

  function previewBox(id) {
    const rect = preview.getBoundingClientRect();
    const { w, h } = fit(aspectOf(id), rect.width * 0.8);
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, w, h };
  }

  function showPreview(id) {
    previewId = id;
    previewImage.src = largeSrc(id);
    previewImage.hidden = false;
    previewNumber.textContent = `#${pad2(id)}`;
    previewEmpty.hidden = true;
    cells.forEach((cell) => cell.classList.toggle("is-previewed", Number(cell.dataset.id) === id));
  }

  /* =========================================
     ENTRY: 떨어진 조각이 라이브러리 칸으로 날아감
  ========================================= */

  function flyToLibrary() {
    const start = now() + (instant() ? 0 : 450);
    const scrollRect = libraryScroll.getBoundingClientRect();

    pieces.forEach((piece) => {
      piece.from = { x: piece.x, y: piece.y, w: piece.w, h: piece.h, rotation: piece.rotation };
      piece.startAt = start + Math.min((piece.id - 1) * 5, 520) + Math.random() * 90;
      piece.duration = instant() ? 1 : 780 + Math.random() * 180;
      piece.arc = 30 + Math.random() * 70;
      piece.flying = true;
      piece.element.classList.add("is-flying");
      dragLayer.appendChild(piece.element);
    });

    function step(time) {
      // 목적지(칸)를 먼저 한꺼번에 읽고 나서 그림
      const targets = pieces.map((piece) => (piece.flying ? cellBox(piece.id) : null));
      let flying = 0;

      pieces.forEach((piece, index) => {
        if (!piece.flying) return;
        flying++;
        if (time < piece.startAt) return;

        const target = targets[index];
        const visible = target.rect.bottom > scrollRect.top && target.rect.top < scrollRect.bottom;
        const t = clamp((time - piece.startAt) / piece.duration, 0, 1);
        const e = easeInOut(t);
        const { from } = piece;

        drawBox(
          piece.element,
          lerp(from.x, target.x, e),
          lerp(from.y, target.y, e) - Math.sin(Math.PI * t) * piece.arc,
          lerp(from.w, target.w, e),
          lerp(from.h, target.h, e),
          lerp(from.rotation, 0, e)
        );
        piece.element.style.opacity = visible ? "" : String(1 - e);

        if (t >= 1) {
          piece.flying = false;
          piece.element.style.display = "none";
          pileLayer.appendChild(piece.element);
          cells[piece.id - 1].classList.remove("is-empty");
        }
      });

      if (flying) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  /* =========================================
     DRAG: 라이브러리 / 미리보기에서 조각 들기
     누르고 움직이지 않으면 클릭 → 미리보기
  ========================================= */

  function canvasDims(aspect) {
    return fit(aspect, DEFAULT_ITEM * canvasRect.width);
  }

  libraryGrid.addEventListener("pointerdown", (event) => {
    const cell = event.target.closest(".library-cell");
    if (!cell || drag || action || event.button !== 0) return;
    if (cell.classList.contains("is-empty")) return;

    event.preventDefault();
    const id = Number(cell.dataset.id);
    press = { id, x: event.clientX, y: event.clientY, box: () => cellBox(id) };
  });

  preview.addEventListener("pointerdown", (event) => {
    if (!previewId || drag || action || event.button !== 0) return;
    event.preventDefault();
    const id = previewId;
    press = { id, x: event.clientX, y: event.clientY, box: () => previewBox(id) };
  });

  // 두 번 클릭하면 캔버스 가운데에 바로 놓기
  libraryGrid.addEventListener("dblclick", (event) => {
    const cell = event.target.closest(".library-cell");
    if (!cell || cell.classList.contains("is-empty")) return;
    const id = Number(cell.dataset.id);
    const size = canvasDims(aspectOf(id));
    const scale = canvasScale();
    addItem(id, UNITS / 2, UNITS / 2, size.w / scale, size.h / scale);
  });

  function movePress(event) {
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_START_PX) return;

    const { id, box, x: pressX, y: pressY } = press;
    const start = box();
    press = null;
    showPreview(id);

    drag = {
      element: makeGhost(id),
      id,
      aspect: aspectOf(id),
      x: start.x, y: start.y, w: start.w, h: start.h,
      rotation: 0,
      base: { w: start.w, h: start.h },
      returnTo: box,
      // 처음 누른 자리 기준으로 잡음 (빠르게 끌어도 조각이 커서에서 벗어나지 않게)
      fx: clamp((pressX - start.x) / start.w, -0.5, 0.5),
      fy: clamp((pressY - start.y) / start.h, -0.5, 0.5),
      px: event.clientX,
      py: event.clientY,
      over: false
    };
    builder.classList.add("is-dragging");
    closePopovers();
    exitModes();
    stepDrag(1);
  }

  function endPress() {
    showPreview(press.id);
    press = null;
  }

  function makeGhost(id, item = null) {
    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";

    if (item) {
      // 캔버스에서 끌어낸 조각은 잘린 모양 그대로
      ghost.classList.add("is-cropped");
      ghost.appendChild(createItemImage(item));
    } else {
      const image = document.createElement("img");
      image.src = smallSrc(id);
      image.alt = "";
      image.draggable = false;
      ghost.appendChild(image);
    }

    dragLayer.appendChild(ghost);
    return ghost;
  }

  function moveDrag(event) {
    drag.px = event.clientX;
    drag.py = event.clientY;
    drag.over = insideCanvas(event.clientX, event.clientY);
  }

  // 캔버스 위에 올리면 캔버스에 놓일 크기로 커짐
  function stepDrag(dt) {
    if (!drag) return;

    const target = drag.over ? canvasDims(drag.aspect) : drag.base;
    const k = instant() ? 1 : Math.min(1, dt * 14);

    drag.w += (target.w - drag.w) * k;
    drag.h += (target.h - drag.h) * k;
    drag.x = drag.px - drag.fx * drag.w;
    drag.y = drag.py - drag.fy * drag.h;
    drawBox(drag.element, drag.x, drag.y, drag.w, drag.h, drag.rotation);
  }

  function endDrag() {
    const state = drag;
    drag = null;
    builder.classList.remove("is-dragging");

    if (state.over) {
      const size = canvasDims(state.aspect);
      const scale = canvasScale();
      const center = toUnits(state.px - state.fx * size.w, state.py - state.fy * size.h);
      state.element.remove();
      addItem(state.id, center.x, center.y, size.w / scale, size.h / scale);
      return;
    }

    // 캔버스 밖에 놓으면 제자리로 돌아감
    returnGhost(state.element, state.returnTo(), state);
  }

  function returnGhost(element, box, from) {
    const start = { x: from.x, y: from.y, w: from.w, h: from.h, rotation: from.rotation };
    const began = now();
    const duration = instant() ? 1 : 360;
    const fade = element.classList.contains("is-cropped");

    (function frame() {
      const t = clamp((now() - began) / duration, 0, 1);
      const e = easeOut(t);
      drawBox(
        element,
        lerp(start.x, box.x, e), lerp(start.y, box.y, e),
        lerp(start.w, box.w, e), lerp(start.h, box.h, e),
        lerp(start.rotation, 0, e)
      );
      element.style.opacity = fade ? String(1 - e) : "";
      if (t < 1) requestAnimationFrame(frame);
      else element.remove();
    })();
  }

  /* =========================================
     CANVAS ITEMS
  ========================================= */

  function addItem(id, x, y, w, h) {
    const item = {
      uid: nextUid++,
      id,
      x, y, w, h,
      rotation: 0,
      flip: false,
      crop: { l: 0, t: 0, r: 0, b: 0 },
      mask: null,
      locked: false,
      hidden: false,
      group: null,
      name: ""
    };

    items.push(item);
    exitModes();
    setSelection([item.uid]);
    startTimer();
    renderItems();
    commit();
  }

  const itemByUid = (uid) => items.find((item) => item.uid === uid) ?? null;
  const usedIds = () => new Set(items.map((item) => item.id));
  // 숨긴 조각은 레이어에서는 선택돼도 캔버스 편집 대상에서는 빠짐
  const selectedItems = () => items.filter((item) => selection.has(item.uid) && !item.hidden);
  const editableSelection = () => selectedItems().filter((item) => !item.locked);

  const groupByGid = (gid) => groups.find((group) => group.gid === gid) ?? null;
  const membersOf = (gid) => items.filter((item) => item.group === gid);
  // 캔버스에서 누르면 그룹은 통째로 선택
  const unitOf = (item) => (item.group ? membersOf(item.group).map((member) => member.uid) : [item.uid]);

  function normalizeGroups() {
    items.forEach((item) => {
      if (item.group && !groupByGid(item.group)) item.group = null;
    });

    // 조각이 하나만 남은 그룹은 풀림
    for (let i = groups.length - 1; i >= 0; i--) {
      const members = membersOf(groups[i].gid);
      if (members.length < 2) {
        members.forEach((member) => { member.group = null; });
        groups.splice(i, 1);
      }
    }

    // 떨어져 있는 멤버는 가장 위 멤버 자리로 모음
    groups.forEach((group) => {
      const indexes = items.flatMap((item, index) => (item.group === group.gid ? [index] : []));
      const top = indexes[indexes.length - 1];
      if (top - indexes[0] + 1 === indexes.length) return;

      const members = indexes.map((index) => items[index]);
      const rest = items.filter((item) => item.group !== group.gid);
      const below = items.slice(0, top).filter((item) => item.group !== group.gid).length;
      rest.splice(below, 0, ...members);
      items.splice(0, items.length, ...rest);
    });
  }

  // 자른 부분(화면 기준): 뒤집혀 있으면 좌우가 바뀜
  function displayCrop(item) {
    const { l, t, r, b } = item.crop;
    return item.flip ? { l: r, t, r: l, b } : { l, t, r, b };
  }

  // 자르기 전 전체 이미지의 크기와 중심
  function fullFrame(item) {
    const crop = displayCrop(item);
    const fw = item.w / (1 - crop.l - crop.r);
    const fh = item.h / (1 - crop.t - crop.b);
    const offset = rotate({ x: ((crop.r - crop.l) * fw) / 2, y: ((crop.b - crop.t) * fh) / 2 }, item.rotation);
    return { x: item.x + offset.x, y: item.y + offset.y, w: fw, h: fh, crop };
  }

  // 전체 이미지는 그대로 두고 보이는 네모(화면 기준 0~1)만 바꿈
  function setDisplayCrop(item, frame, x0, x1, y0, y1) {
    const offset = rotate(
      { x: ((x0 + x1) / 2 - 0.5) * frame.w, y: ((y0 + y1) / 2 - 0.5) * frame.h },
      item.rotation
    );

    item.w = (x1 - x0) * frame.w;
    item.h = (y1 - y0) * frame.h;
    item.x = frame.x + offset.x;
    item.y = frame.y + offset.y;

    const display = { l: x0, t: y0, r: 1 - x1, b: 1 - y1 };
    item.crop = item.flip
      ? { l: display.r, t: display.t, r: display.l, b: display.b }
      : display;
  }

  const maskPath = (mask) =>
    mask ? `polygon(${mask.map(([x, y]) => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`).join(", ")})` : "";

  const loadedLarge = new Set();

  // 잘린 상자 안에 전체 이미지를 배치 (모양 자르기는 이미지 기준 clip-path)
  function layoutItemImage(image, item) {
    const frame = fullFrame(item);
    image.style.width = `${frame.w}px`;
    image.style.height = `${frame.h}px`;
    image.style.left = `${-frame.crop.l * frame.w}px`;
    image.style.top = `${-frame.crop.t * frame.h}px`;
    image.style.transform = item.flip ? "scaleX(-1)" : "";
    image.style.clipPath = maskPath(item.mask);
  }

  function createItemImage(item) {
    const image = document.createElement("img");
    image.alt = "";
    image.draggable = false;
    image.className = "item-image";
    image.dataset.id = item.id;
    image.src = loadedLarge.has(item.id) ? largeSrc(item.id) : smallSrc(item.id);

    // 캔버스에서는 고해상도로 교체
    if (!loadedLarge.has(item.id)) {
      const large = new Image();
      large.onload = () => {
        loadedLarge.add(item.id);
        builder.querySelectorAll(`.item-image[data-id="${item.id}"]`).forEach((img) => {
          img.src = large.src;
        });
      };
      large.src = largeSrc(item.id);
    }

    return image;
  }

  function renderItems() {
    normalizeGroups();
    const alive = new Set();
    const cropGhost = stage.querySelector(".crop-ghost, .cut-ghost");
    const ghostUid = cropping?.uid ?? cutting?.uid;
    let index = 0;

    items.forEach((item) => {
      let element = itemElements.get(item.uid);
      if (!element) {
        element = document.createElement("div");
        element.className = "canvas-item";
        element.dataset.uid = item.uid;
        element.appendChild(createItemImage(item));
        itemElements.set(item.uid, element);
      }

      // 자르는 중인 조각 바로 아래에 전체 이미지를 흐리게 보여줌
      if (cropGhost && ghostUid === item.uid) {
        if (stage.children[index] !== cropGhost) stage.insertBefore(cropGhost, stage.children[index] ?? null);
        index++;
      }

      if (stage.children[index] !== element) stage.insertBefore(element, stage.children[index] ?? null);
      index++;

      element.style.width = `${item.w}px`;
      element.style.height = `${item.h}px`;
      element.style.transform =
        `translate(${item.x - item.w / 2}px, ${item.y - item.h / 2}px) rotate(${item.rotation}deg)`;
      element.style.display = item.hidden ? "none" : "";
      element.classList.toggle("is-locked", item.locked);
      layoutItemImage(element.firstChild, item);
      alive.add(item.uid);
    });

    itemElements.forEach((element, uid) => {
      if (!alive.has(uid)) {
        element.remove();
        itemElements.delete(uid);
      }
    });

    if (cropping) drawCropGhost();
    if (cutting) drawCutGhost();

    // 지워진 조각은 선택에서도 빠짐
    selection.forEach((uid) => {
      if (!itemByUid(uid)) selection.delete(uid);
    });

    renderLayers();
    updateUI();
  }

  function setSelection(uids) {
    selection.clear();
    uids.forEach((uid) => selection.add(uid));
    if (cropping && !selection.has(cropping.uid)) exitCrop();
    if (cutting && !selection.has(cutting.uid)) exitCut();
    renderLayers();
    updateUI();
  }

  // 화면 위치 → 조각의 전체 이미지 안 위치 (이미지 기준 0~1, 뒤집힘 반영)
  function imagePoint(item, x, y) {
    const point = toUnits(x, y);
    const frame = fullFrame(item);
    const local = rotate({ x: point.x - frame.x, y: point.y - frame.y }, -item.rotation);
    let fx = local.x / frame.w + 0.5;
    if (item.flip) fx = 1 - fx;
    return { fx, fy: local.y / frame.h + 0.5 };
  }

  // 커서 아래에서 잠기지 않은 가장 위의 조각 (모양으로 자른 바깥은 통과)
  function itemAt(x, y) {
    for (const element of document.elementsFromPoint(x, y)) {
      if (!element.classList.contains("canvas-item")) continue;
      const item = itemByUid(Number(element.dataset.uid));
      if (!item || item.locked || item.hidden) continue;
      if (item.mask) {
        const { fx, fy } = imagePoint(item, x, y);
        if (!insidePolygon(fx, fy, item.mask)) continue;
      }
      return item;
    }
    return null;
  }

  function exitModes() {
    exitCrop();
    exitCut();
  }

  /* =========================================
     CANVAS: 누르기
     왼쪽 클릭: 선택 · 이동 (그룹은 통째로)
     ⇧ + 클릭: 선택 추가 / 빼기 · ⇧ + 드래그: 가로나 세로로만 이동
     ⌘/Ctrl + 클릭: 선택 추가 / 빼기
     ⌥/Alt + 드래그: 복제하면서 이동 (⇧도 함께 가능)
     빈 곳 드래그 · 오른쪽 클릭 드래그: 영역 선택
  ========================================= */

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  overlay.addEventListener("contextmenu", (event) => event.preventDefault());

  canvas.addEventListener("pointerdown", (event) => {
    if (!active || drag || action || sampling) return;
    if (event.button !== 0 && event.button !== 2) return;

    event.preventDefault();
    event.stopPropagation();
    closePopovers();

    // 모양 자르기: 캔버스 위에 자유롭게 그리기
    if (cutting) {
      if (event.button === 0) startCutPath(event);
      return;
    }

    const item = event.button === 0 ? itemAt(event.clientX, event.clientY) : null;
    const toggleKey = event.metaKey || event.ctrlKey;
    const shift = event.shiftKey;

    if (cropping && item?.uid !== cropping.uid) exitCrop();

    if (!item) {
      startMarquee(event, shift || toggleKey);
      return;
    }

    if (cropping) return;

    // 캔버스로 돌아와 조각을 누르면 타이머가 이어서 흐름
    startTimer();

    const unit = unitOf(item);
    const unitSelected = unit.every((uid) => selection.has(uid));
    let narrowTo = null;
    let deselect = null;

    if (toggleKey) {
      if (unitSelected) {
        setSelection([...selection].filter((uid) => !unit.includes(uid)));
        return;
      }
      setSelection([...selection, ...unit]);
    } else if (shift) {
      // 이미 선택된 것: 끌면 이동, 끌지 않고 떼면 선택에서 빠짐
      if (unitSelected) deselect = unit;
      else setSelection([...selection, ...unit]);
    } else if (selection.has(item.uid)) {
      // 여러 개 선택된 상태에서 그중 하나를 끌지 않고 클릭하면 그것(그룹)만 선택
      const own = unitSelected ? unit : [item.uid];
      if (selection.size > own.length) narrowTo = own;
    } else {
      setSelection(unit);
    }

    const duplicated = event.altKey && duplicateSelection(false);
    startMove(event);
    if (action) {
      action.duplicated = duplicated;
      action.narrowTo = duplicated ? null : narrowTo;
      action.deselect = duplicated ? null : deselect;
    }
  });

  canvas.addEventListener("dblclick", (event) => {
    if (cutting) return;
    const item = itemAt(event.clientX, event.clientY);
    if (item && !cropping) {
      setSelection([item.uid]);
      enterCrop();
    }
  });

  function startMove(event) {
    const moving = editableSelection();
    if (!moving.length) return;

    const point = toUnits(event.clientX, event.clientY);
    const box = boundsOf(moving);

    action = {
      type: "move",
      start: point,
      items: moving.map((item) => ({ item, x: item.x, y: item.y })),
      center: { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 },
      single: moving.length === 1 ? moving[0] : null,
      changed: false,
      ghost: null
    };
  }

  function startMarquee(event, additive) {
    const point = toUnits(event.clientX, event.clientY);
    action = {
      type: "marquee",
      start: point,
      end: point,
      base: additive ? [...selection] : [],
      changed: false
    };
    if (!additive) setSelection([]);
  }

  /* ---------- 핸들: 크기 · 회전 · 자르기 ---------- */

  selFrame.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest(".sel-handle, .sel-edge, .sel-rotate");
    if (!handle || drag || action || cutting || event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    closePopovers();

    const sx = Number(handle.dataset.sx);
    const sy = Number(handle.dataset.sy);
    const point = toUnits(event.clientX, event.clientY);

    if (cropping) {
      if (!handle.classList.contains("sel-rotate")) action = { type: "crop", sx, sy, changed: false };
      return;
    }

    const targets = editableSelection();
    if (!targets.length) return;

    startTimer();

    const snapshotOf = (item) => ({ item, x: item.x, y: item.y, w: item.w, h: item.h, rotation: item.rotation });

    if (handle.classList.contains("sel-rotate")) {
      const box = selectionFrame();
      action = {
        type: "rotate",
        center: { x: box.x, y: box.y },
        startAngle: Math.atan2(point.y - box.y, point.x - box.x),
        frameRotation: box.rotation,
        items: targets.map(snapshotOf),
        changed: false
      };
      return;
    }

    if (targets.length === 1) {
      // 한 조각: 모서리는 자유롭게, 변은 그 방향으로만 (⇧: 비율 유지)
      const item = targets[0];
      const anchor = rotate({ x: -sx * item.w / 2, y: -sy * item.h / 2 }, item.rotation);
      action = {
        type: "resize",
        item,
        sx, sy,
        edge: handle.classList.contains("sel-edge"),
        anchor: { x: item.x + anchor.x, y: item.y + anchor.y },
        w: item.w,
        h: item.h,
        changed: false
      };
      return;
    }

    // 여러 조각: 전체를 감싸는 상자를 반대쪽 변/모서리 기준으로 함께 조절 (⇧: 비율 유지)
    const box = boundsOf(targets);
    const side = (sign, low, high) => (sign > 0 ? low : sign < 0 ? high : (low + high) / 2);
    action = {
      type: "group-resize",
      sx, sy,
      anchor: { x: side(sx, box.left, box.right), y: side(sy, box.top, box.bottom) },
      w: box.right - box.left,
      h: box.bottom - box.top,
      items: targets.map(snapshotOf),
      changed: false
    };
  });

  /* ---------- 움직이는 중 ---------- */

  function moveAction(event) {
    const point = toUnits(event.clientX, event.clientY);
    action.changed = true;

    switch (action.type) {
      case "move": moveItems(event, point); break;
      case "marquee": updateMarquee(point); break;
      case "resize": resizeItem(event, point); break;
      case "group-resize": resizeGroup(event, point); break;
      case "rotate": rotateItems(event, point); break;
      case "crop": updateCrop(point); break;
      case "pen": dragPenHandle(event); return;
    }

    if (action.type !== "marquee") renderItems();
  }

  function moveItems(event, point) {
    const single = action.single;

    // 한 조각만 들고 캔버스 밖으로 나가면 잘리지 않은 모습으로 들고 다님
    if (single && !insideCanvas(event.clientX, event.clientY)) {
      const scale = canvasScale();
      const offsetX = action.start.x - action.items[0].x;
      const offsetY = action.start.y - action.items[0].y;

      if (!action.ghost) {
        action.ghost = makeGhost(single.id, single);
        itemElements.get(single.uid)?.classList.add("is-lifted");
      }

      action.ghostBox = {
        x: event.clientX - offsetX * scale,
        y: event.clientY - offsetY * scale,
        w: single.w * scale,
        h: single.h * scale,
        rotation: single.rotation
      };
      const box = action.ghostBox;
      drawBox(action.ghost, box.x, box.y, box.w, box.h, box.rotation);
      layoutItemImage(action.ghost.firstChild, { ...single, w: box.w, h: box.h });
      showGuides(false, false);
      return;
    }

    if (action.ghost) {
      action.ghost.remove();
      action.ghost = null;
      itemElements.get(single.uid)?.classList.remove("is-lifted");
    }

    let dx = point.x - action.start.x;
    let dy = point.y - action.start.y;

    // ⇧: 더 많이 움직인 방향(가로 또는 세로)으로만 곧게 이동
    const lockX = event.shiftKey && Math.abs(dx) < Math.abs(dy);
    const lockY = event.shiftKey && !lockX;
    if (lockX) dx = 0;
    if (lockY) dy = 0;

    // 캔버스 가운데에 붙음
    const snap = SNAP_PX / canvasScale();
    const cx = action.center.x + dx;
    const cy = action.center.y + dy;
    const snapX = !lockX && Math.abs(cx - UNITS / 2) < snap;
    const snapY = !lockY && Math.abs(cy - UNITS / 2) < snap;
    if (snapX) dx += UNITS / 2 - cx;
    if (snapY) dy += UNITS / 2 - cy;
    showGuides(snapX, snapY);

    action.items.forEach(({ item, x, y }) => {
      item.x = x + dx;
      item.y = y + dy;
    });
  }

  function resizeItem(event, point) {
    const { item, sx, sy } = action;
    const local = rotate({ x: point.x - action.anchor.x, y: point.y - action.anchor.y }, -item.rotation);

    if (event.shiftKey) {
      // ⇧: 비율 유지 (변을 끌면 반대쪽 변의 가운데를 기준으로)
      let scale = action.edge
        ? (sx ? (local.x * sx) / action.w : (local.y * sy) / action.h)
        : (local.x * sx * action.w + local.y * sy * action.h) / (action.w * action.w + action.h * action.h);
      scale = Math.max(scale, MIN_ITEM / Math.min(action.w, action.h));
      item.w = action.w * scale;
      item.h = action.h * scale;
    } else {
      // 모서리: 자유롭게 / 변: 그 방향으로만
      item.w = sx ? Math.max(MIN_ITEM, local.x * sx) : action.w;
      item.h = sy ? Math.max(MIN_ITEM, local.y * sy) : action.h;
    }

    const offset = rotate({ x: (sx * item.w) / 2, y: (sy * item.h) / 2 }, item.rotation);
    item.x = action.anchor.x + offset.x;
    item.y = action.anchor.y + offset.y;
  }

  function resizeGroup(event, point) {
    const { anchor, sx, sy, w, h } = action;
    const smallest = Math.min(...action.items.map((entry) => Math.min(entry.w, entry.h)));
    const least = MIN_ITEM / smallest;

    let kx = sx ? ((point.x - anchor.x) * sx) / w : 1;
    let ky = sy ? ((point.y - anchor.y) * sy) / h : 1;

    if (event.shiftKey) {
      // ⇧: 비율 유지 (모서리는 대각선 방향으로 끈 만큼)
      const k = sx && sy
        ? ((point.x - anchor.x) * sx * w + (point.y - anchor.y) * sy * h) / (w * w + h * h)
        : (sx ? kx : ky);
      kx = ky = k;
    }

    kx = Math.max(kx, least);
    ky = Math.max(ky, least);

    action.items.forEach((entry) => {
      const { item } = entry;
      item.x = anchor.x + (entry.x - anchor.x) * kx;
      item.y = anchor.y + (entry.y - anchor.y) * ky;

      if (kx === ky) {
        item.w = entry.w * kx;
        item.h = entry.h * ky;
        return;
      }

      // 돌아간 조각은 자기 가로/세로 방향으로 늘어난 만큼
      const angle = (entry.rotation * Math.PI) / 180;
      const cos = Math.abs(Math.cos(angle));
      const sin = Math.abs(Math.sin(angle));
      item.w = Math.max(MIN_ITEM, entry.w * Math.hypot(cos * kx, sin * ky));
      item.h = Math.max(MIN_ITEM, entry.h * Math.hypot(sin * kx, cos * ky));
    });
  }

  function rotateItems(event, point) {
    const { center } = action;
    const angle = Math.atan2(point.y - center.y, point.x - center.x);
    const base = action.items.length === 1 ? action.items[0].rotation : action.frameRotation;
    let target = base + ((angle - action.startAngle) * 180) / Math.PI;

    if (event.shiftKey) {
      target = Math.round(target / 15) * 15;
    } else {
      // 수평/수직 근처에서 살짝 붙음
      const nearest = Math.round(target / 90) * 90;
      if (Math.abs(target - nearest) < 3) target = nearest;
    }

    const delta = target - base;
    action.delta = delta;

    action.items.forEach((entry) => {
      const offset = rotate({ x: entry.x - center.x, y: entry.y - center.y }, delta);
      entry.item.x = center.x + offset.x;
      entry.item.y = center.y + offset.y;
      entry.item.rotation = entry.rotation + delta;
    });
  }

  function updateMarquee(point) {
    action.end = point;

    const left = Math.min(action.start.x, point.x);
    const right = Math.max(action.start.x, point.x);
    const top = Math.min(action.start.y, point.y);
    const bottom = Math.max(action.start.y, point.y);

    // 영역에 걸친 조각은 모두 선택 (그룹은 통째로)
    const hits = items.filter((item) => {
      if (item.locked || item.hidden) return false;
      const { hw, hh } = extents(item.w, item.h, item.rotation);
      return item.x + hw > left && item.x - hw < right && item.y + hh > top && item.y - hh < bottom;
    });

    setSelection([...new Set([...action.base, ...hits.flatMap(unitOf)])]);
  }

  /* ---------- 놓기 ---------- */

  function endAction() {
    const current = action;
    action = null;
    showGuides(false, false);
    marquee.hidden = true;

    // 펜: 손을 떼도 그리던 모양은 그대로 (첫 점을 누르거나 Enter로 적용)
    if (current.type === "pen") return;

    if (current.type === "move" && current.ghost) {
      dropOutOfCanvas(current);
      return;
    }

    if (current.type === "move" && !current.changed && current.narrowTo) {
      setSelection(current.narrowTo);
      return;
    }

    if (current.type === "move" && !current.changed && current.deselect) {
      setSelection([...selection].filter((uid) => !current.deselect.includes(uid)));
      return;
    }

    if (current.type === "rotate") {
      current.items.forEach(({ item }) => { item.rotation = normalizeAngle(item.rotation); });
    }

    if (current.type === "marquee" || current.type === "crop") {
      renderItems();
      return;
    }

    if (current.changed || current.duplicated) {
      renderItems();
      commit();
    }
  }

  // 캔버스 밖에 놓음 → 캔버스에서 빠지고 라이브러리 칸으로 돌아감
  function dropOutOfCanvas(current) {
    const { single: item, ghost, ghostBox } = current;
    items.splice(items.indexOf(item), 1);
    selection.delete(item.uid);
    renderItems();
    commit();
    returnGhost(ghost, cellBox(item.id), ghostBox);
  }

  function showGuides(x, y) {
    guideX.classList.toggle("is-visible", x);
    guideY.classList.toggle("is-visible", y);
  }

  /* =========================================
     CROP (네모 자르기)
     전체 이미지는 제자리에 두고 보이는 영역만 조절
  ========================================= */

  function enterCrop() {
    const targets = selectedItems();
    if (targets.length !== 1 || targets[0].locked || cropping) return;

    exitCut();
    const item = targets[0];
    const frame = fullFrame(item);

    cropping = {
      uid: item.uid,
      frame: { x: frame.x, y: frame.y, w: frame.w, h: frame.h },
      x0: frame.crop.l,
      x1: 1 - frame.crop.r,
      y0: frame.crop.t,
      y1: 1 - frame.crop.b,
      before: JSON.stringify(item)
    };

    const ghost = document.createElement("div");
    ghost.className = "crop-ghost";
    const image = createItemImage(item);
    image.style.transform = item.flip ? "scaleX(-1)" : "";
    image.style.clipPath = maskPath(item.mask);
    ghost.appendChild(image);
    stage.appendChild(ghost);

    builder.classList.add("is-cropping");
    closePopovers();
    renderItems();
  }

  function exitCrop() {
    if (!cropping) return;

    const item = itemByUid(cropping.uid);
    const changed = item && JSON.stringify(item) !== cropping.before;

    stage.querySelector(".crop-ghost")?.remove();
    builder.classList.remove("is-cropping");
    cropping = null;

    renderItems();
    if (changed) commit();
  }

  function drawCropGhost() {
    const ghost = stage.querySelector(".crop-ghost");
    const item = itemByUid(cropping.uid);
    const { frame } = cropping;
    ghost.style.width = `${frame.w}px`;
    ghost.style.height = `${frame.h}px`;
    ghost.style.transform =
      `translate(${frame.x - frame.w / 2}px, ${frame.y - frame.h / 2}px) rotate(${item.rotation}deg)`;
  }

  function updateCrop(point) {
    const item = itemByUid(cropping.uid);
    const { frame } = cropping;
    const local = rotate({ x: point.x - frame.x, y: point.y - frame.y }, -item.rotation);
    const fx = clamp(local.x / frame.w + 0.5, 0, 1);
    const fy = clamp(local.y / frame.h + 0.5, 0, 1);
    const minX = MIN_ITEM / frame.w;
    const minY = MIN_ITEM / frame.h;

    if (action.sx < 0) cropping.x0 = Math.min(fx, cropping.x1 - minX);
    if (action.sx > 0) cropping.x1 = Math.max(fx, cropping.x0 + minX);
    if (action.sy < 0) cropping.y0 = Math.min(fy, cropping.y1 - minY);
    if (action.sy > 0) cropping.y1 = Math.max(fy, cropping.y0 + minY);

    setDisplayCrop(item, frame, cropping.x0, cropping.x1, cropping.y0, cropping.y1);
  }

  /* =========================================
     CUT (모양 자르기) — 펜 툴
     클릭: 꼭짓점 · 클릭한 채 끌기: 곡선 핸들
     첫 점을 다시 누르거나 Enter: 그 모양으로 자르기
     Backspace: 마지막 점 지우기 / Esc: 취소
     그리는 동안 안쪽은 원본 그대로, 바깥은 흐리게
  ========================================= */

  const CLOSE_PX = 9;             // 첫 점에 이만큼 가까우면 닫기
  const CURVE_STEPS = 24;         // 곡선 한 구간을 몇 개의 점으로 자를지

  function enterCut() {
    const targets = selectedItems();
    if (targets.length !== 1 || targets[0].locked) return;

    exitCrop();
    const item = targets[0];
    cutting = { uid: item.uid, points: [], hover: null, closable: false, drawn: "" };

    // 네모 자르기처럼: 바깥으로 남을 부분을 흐리게 보여줄 복제본
    const ghost = document.createElement("div");
    ghost.className = "cut-ghost";
    ghost.appendChild(createItemImage(item));
    stage.appendChild(ghost);

    builder.classList.add("is-cutting");
    closePopovers();
    renderItems();
  }

  function exitCut() {
    if (!cutting) return;
    const element = itemElements.get(cutting.uid);
    if (element) element.style.clipPath = "";
    stage.querySelector(".cut-ghost")?.remove();
    cutting = null;
    builder.classList.remove("is-cutting", "is-pen-closing");
    penPath.toggleAttribute("hidden", true);
    renderItems();
  }

  const hasHandle = (point) => point.hx !== 0 || point.hy !== 0;

  function nearFirstPoint(point) {
    const first = cutting.points[0];
    return Boolean(first) && Math.hypot(point.x - first.x, point.y - first.y) * canvasScale() < CLOSE_PX;
  }

  // 닫을 수 있는 모양인지 (점 3개 이상, 또는 곡선이 있는 점 2개)
  const canClose = (points) => points.length >= 3 || (points.length === 2 && points.some(hasHandle));

  function updatePenHover(event) {
    cutting.hover = toUnits(event.clientX, event.clientY);
    cutting.closable = canClose(cutting.points) && nearFirstPoint(cutting.hover);
    builder.classList.toggle("is-pen-closing", cutting.closable);
  }

  // 누르면 꼭짓점, 누른 채 끌면 그 점에서 곡선 핸들이 나옴
  function startCutPath(event) {
    const point = toUnits(event.clientX, event.clientY);

    if (canClose(cutting.points) && nearFirstPoint(point)) {
      applyCut();
      return;
    }

    const anchor = { x: point.x, y: point.y, hx: 0, hy: 0 };
    cutting.points.push(anchor);
    cutting.closable = false;
    builder.classList.remove("is-pen-closing");
    action = { type: "pen", anchor };
  }

  function dragPenHandle(event) {
    const point = toUnits(event.clientX, event.clientY);
    const { anchor } = action;
    let hx = point.x - anchor.x;
    let hy = point.y - anchor.y;
    if (Math.hypot(hx, hy) * canvasScale() < 3) hx = hy = 0;
    anchor.hx = hx;
    anchor.hy = hy;
    cutting.hover = point;
  }

  // a → b 구간 (a의 나가는 핸들, b의 들어오는 핸들)
  function penSegment(a, b, out) {
    if (!hasHandle(a) && !hasHandle(b)) {
      out.push({ x: b.x, y: b.y });
      return;
    }
    const c1 = { x: a.x + a.hx, y: a.y + a.hy };
    const c2 = { x: b.x - b.hx, y: b.y - b.hy };
    for (let i = 1; i <= CURVE_STEPS; i++) {
      const t = i / CURVE_STEPS;
      const u = 1 - t;
      out.push({
        x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
        y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y
      });
    }
  }

  // 펜으로 그린 모양 → 닫힌 다각형 (곡선은 잘게 나눔)
  function penPolygon(points) {
    if (!points.length) return [];
    const out = [{ x: points[0].x, y: points[0].y }];
    for (let i = 1; i < points.length; i++) penSegment(points[i - 1], points[i], out);
    penSegment(points[points.length - 1], points[0], out);
    out.pop();
    return out;
  }

  // 그리는 중인 모양 안쪽만 원본 그대로 (조각 상자 기준 clip-path)
  function previewCut(polygon) {
    const item = itemByUid(cutting.uid);
    const element = itemElements.get(cutting.uid);
    if (!item || !element) return;

    if (polygon.length < 3) {
      element.style.clipPath = "";
      return;
    }

    const path = polygon.map((p) => {
      const local = rotate({ x: p.x - item.x, y: p.y - item.y }, -item.rotation);
      const x = ((local.x + item.w / 2) / item.w) * 100;
      const y = ((local.y + item.h / 2) / item.h) * 100;
      return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
    });
    element.style.clipPath = `polygon(${path.join(", ")})`;
  }

  function drawCutGhost() {
    const ghost = stage.querySelector(".cut-ghost");
    const item = itemByUid(cutting.uid);
    if (!ghost || !item) return;
    ghost.style.width = `${item.w}px`;
    ghost.style.height = `${item.h}px`;
    ghost.style.transform =
      `translate(${item.x - item.w / 2}px, ${item.y - item.h / 2}px) rotate(${item.rotation}deg)`;
    layoutItemImage(ghost.firstChild, item);
  }

  function drawCutPath() {
    if (!cutting || !cutting.points.length) {
      penPath.toggleAttribute("hidden", true);
      if (cutting) {
        cutting.drawn = "";
        previewCut([]);
      }
      return;
    }

    const scale = canvasScale();
    const { points, hover, closable } = cutting;
    const dragging = action?.type === "pen";
    const last = points[points.length - 1];

    // 매 프레임 같은 모양이면 다시 그리지 않음
    const signature = JSON.stringify([points, hover, closable, dragging, scale]);
    if (signature === cutting.drawn) return;
    cutting.drawn = signature;

    const f = (value) => (value * scale).toFixed(1);
    const segment = (a, b) => (hasHandle(a) || hasHandle(b)
      ? ` C${f(a.x + a.hx)} ${f(a.y + a.hy)} ${f(b.x - b.hx)} ${f(b.y - b.hy)} ${f(b.x)} ${f(b.y)}`
      : ` L${f(b.x)} ${f(b.y)}`);

    const [fill, closing, line, rubber, handles, anchors] = penPath.children;
    penPath.toggleAttribute("hidden", false);

    // 그린 선
    let d = `M${f(points[0].x)} ${f(points[0].y)}`;
    for (let i = 1; i < points.length; i++) d += segment(points[i - 1], points[i]);
    line.setAttribute("d", d);

    // 마지막 점 → 커서 (다음 구간 미리보기)
    const target = closable ? points[0] : hover && !dragging ? { ...hover, hx: 0, hy: 0 } : null;
    rubber.setAttribute("d", target ? `M${f(last.x)} ${f(last.y)}${segment(last, target)}` : "");

    // 커서 → 첫 점 (닫힐 모양)
    const shape = target && !closable ? [...points, target] : points;
    closing.setAttribute("d", shape.length > 1 && !closable
      ? `M${f(shape[shape.length - 1].x)} ${f(shape[shape.length - 1].y)}${segment(shape[shape.length - 1], points[0])}`
      : "");

    const polygon = penPolygon(shape);
    fill.setAttribute("d", polygon.length > 2
      ? `M${polygon.map((p) => `${f(p.x)} ${f(p.y)}`).join(" L")} Z`
      : "");

    // 마지막 점의 곡선 핸들
    handles.innerHTML = hasHandle(last)
      ? [1, -1].map((sign) => {
        const hx = f(last.x + sign * last.hx);
        const hy = f(last.y + sign * last.hy);
        return `<line x1="${f(last.x)}" y1="${f(last.y)}" x2="${hx}" y2="${hy}" />` +
          `<circle cx="${hx}" cy="${hy}" r="3" />`;
      }).join("")
      : "";

    // 꼭짓점: 첫 점은 닫을 수 있을 때 커짐, 마지막 점은 채워짐
    anchors.innerHTML = points.map((p, index) => {
      const classes = [
        index === 0 ? "is-first" : "",
        index === 0 && closable ? "is-closable" : "",
        index === points.length - 1 ? "is-last" : ""
      ].join(" ").trim();
      const size = index === 0 && closable ? 9 : 7;
      return `<rect class="${classes}" x="${(p.x * scale - size / 2).toFixed(1)}" y="${(p.y * scale - size / 2).toFixed(1)}" width="${size}" height="${size}" />`;
    }).join("");

    // 펜 툴처럼: 커서 위치까지 포함한 모양으로 미리보기
    previewCut(polygon);
  }

  function applyCut() {
    const current = cutting;
    exitCut();

    const item = current && itemByUid(current.uid);
    if (!item || !canClose(current.points)) return;

    const polygon = penPolygon(current.points);
    if (polygon.length < 3) return;

    // 캔버스 좌표 → 이미지 기준 0~1
    const scale = canvasScale();
    const points = polygon.map((p) => {
      const { fx, fy } = imagePoint(item, canvasRect.left + p.x * scale, canvasRect.top + p.y * scale);
      return [clamp(fx, 0, 1), clamp(fy, 0, 1)];
    });

    // 너무 작은 모양은 무시
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const frame = fullFrame(item);
    if ((maxX - minX) * frame.w < MIN_ITEM || (maxY - minY) * frame.h < MIN_ITEM) return;

    // 선택 테두리가 잘린 모양에 딱 맞도록 보이는 네모도 줄임 (이미 잘린 범위 안에서)
    const shown = { x0: frame.crop.l, x1: 1 - frame.crop.r, y0: frame.crop.t, y1: 1 - frame.crop.b };
    const x0 = Math.max(shown.x0, item.flip ? 1 - maxX : minX);
    const x1 = Math.max(x0 + MIN_ITEM / frame.w, Math.min(shown.x1, item.flip ? 1 - minX : maxX));
    const y0 = Math.max(shown.y0, minY);
    const y1 = Math.max(y0 + MIN_ITEM / frame.h, Math.min(shown.y1, maxY));

    item.mask = points.map(([x, y]) => [Number(x.toFixed(4)), Number(y.toFixed(4))]);
    setDisplayCrop(item, frame, x0, x1, y0, y1);
    renderItems();
    commit();
  }

  /* ---------- 선택 테두리 그리기 ---------- */

  const RESIZE_CURSORS = ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"];

  function boundsOf(list) {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    list.forEach((item) => {
      const { hw, hh } = extents(item.w, item.h, item.rotation);
      left = Math.min(left, item.x - hw);
      right = Math.max(right, item.x + hw);
      top = Math.min(top, item.y - hh);
      bottom = Math.max(bottom, item.y + hh);
    });
    return { left, top, right, bottom };
  }

  // 한 조각이면 그 조각 모양 그대로, 여러 개면 전체를 감싸는 상자
  function selectionFrame() {
    const list = selectedItems();
    if (!list.length) return null;

    if (list.length === 1) {
      const item = list[0];
      return { x: item.x, y: item.y, w: item.w, h: item.h, rotation: item.rotation };
    }

    if (action?.type === "rotate") {
      // 여러 조각을 돌리는 중에는 상자도 같이 회전
      const box = action.box ?? (action.box = boundsOf(action.items.map((entry) => ({
        x: entry.x, y: entry.y, w: entry.w, h: entry.h, rotation: entry.rotation
      }))));
      return {
        x: action.center.x,
        y: action.center.y,
        w: box.right - box.left,
        h: box.bottom - box.top,
        rotation: action.frameRotation + (action.delta ?? 0)
      };
    }

    const box = boundsOf(list);
    return {
      x: (box.left + box.right) / 2,
      y: (box.top + box.bottom) / 2,
      w: box.right - box.left,
      h: box.bottom - box.top,
      rotation: 0
    };
  }

  function drawSelection() {
    const scale = canvasScale();

    // 영역 선택 상자
    if (action?.type === "marquee") {
      const left = Math.min(action.start.x, action.end.x) * scale;
      const top = Math.min(action.start.y, action.end.y) * scale;
      marquee.hidden = false;
      marquee.style.transform = `translate(${left}px, ${top}px)`;
      marquee.style.width = `${Math.abs(action.end.x - action.start.x) * scale}px`;
      marquee.style.height = `${Math.abs(action.end.y - action.start.y) * scale}px`;
    }

    const box = selectionFrame();

    if (!box || action?.ghost) {
      selFrame.hidden = true;
      selLabel.hidden = true;
      selOutlines.replaceChildren();
      return;
    }

    const list = selectedItems();
    const locked = list.length > 0 && list.every((item) => item.locked);
    const w = box.w * scale;
    const h = box.h * scale;
    const x = box.x * scale;
    const y = box.y * scale;

    selFrame.hidden = false;
    selFrame.classList.toggle("is-group", list.length > 1 && !cropping);
    selFrame.classList.toggle("is-locked", locked && !cropping);
    selFrame.classList.toggle("is-crop", Boolean(cropping));
    selFrame.classList.toggle("is-cut", Boolean(cutting));
    selFrame.style.width = `${w}px`;
    selFrame.style.height = `${h}px`;
    selFrame.style.transform = `translate(${x - w / 2}px, ${y - h / 2}px) rotate(${box.rotation}deg)`;

    // 회전 각도에 맞는 크기 조절 커서
    selFrame.querySelectorAll(".sel-handle, .sel-edge").forEach((handle) => {
      const angle =
        (Math.atan2(handle.dataset.sy * h, handle.dataset.sx * w) * 180) / Math.PI + box.rotation;
      const index = Math.round((((angle % 180) + 180) % 180) / 45) % 4;
      handle.style.cursor = RESIZE_CURSORS[index];
    });

    // 여러 개 선택: 각 조각의 윤곽도 표시
    drawOutlines(list.length > 1 && !cropping ? list : [], scale);

    // 크기 / 각도 표시
    const kind = action?.type;
    const showLabel = kind === "resize" || kind === "group-resize" || kind === "rotate" || kind === "crop";
    selLabel.hidden = !showLabel;

    if (showLabel) {
      const { hh } = extents(w, h, box.rotation);
      selLabel.textContent = kind === "rotate"
        ? `${Math.round(normalizeAngle(box.rotation))}°`
        : `${Math.round(box.w)} × ${Math.round(box.h)}`;
      selLabel.style.transform = `translate(calc(${x}px - 50%), ${y + hh + 12}px)`;
    }
  }

  function drawOutlines(list, scale) {
    while (selOutlines.children.length < list.length) {
      selOutlines.appendChild(document.createElement("div")).className = "sel-outline";
    }
    while (selOutlines.children.length > list.length) selOutlines.lastChild.remove();

    list.forEach((item, index) => {
      const outline = selOutlines.children[index];
      const w = item.w * scale;
      const h = item.h * scale;
      outline.style.width = `${w}px`;
      outline.style.height = `${h}px`;
      outline.style.transform =
        `translate(${item.x * scale - w / 2}px, ${item.y * scale - h / 2}px) rotate(${item.rotation}deg)`;
    });
  }

  /* =========================================
     LAYERS
     위에 있는 줄 = 캔버스에서 위에 있는 조각
  ========================================= */

  const ICONS = {
    lock: '<svg viewBox="0 0 16 16"><rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7"/></svg>',
    unlock: '<svg viewBox="0 0 16 16"><rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 4.9-.7"/></svg>',
    eye: '<svg viewBox="0 0 16 16"><path d="M1.8 8S4.2 3.8 8 3.8 14.2 8 14.2 8 11.8 12.2 8 12.2 1.8 8 1.8 8z"/><circle cx="8" cy="8" r="1.9"/></svg>',
    eyeOff: '<svg viewBox="0 0 16 16"><path d="M1.8 8S4.2 3.8 8 3.8 14.2 8 14.2 8 11.8 12.2 8 12.2 1.8 8 1.8 8z"/><path d="M2.5 13.5l11-11"/></svg>'
  };

  ICONS.caret = '<svg viewBox="0 0 16 16"><path d="M6 4.5 9.5 8 6 11.5"/></svg>';
  ICONS.folder = '<svg viewBox="0 0 16 16"><path d="M2.5 4.8a1 1 0 0 1 1-1h3l1.3 1.5h4.7a1 1 0 0 1 1 1v5.9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z"/></svg>';

  // 같은 조각을 여러 번 쓰면 #70, #70 2, #70 3 … (이름을 바꾸면 그 이름)
  function layerName(item) {
    if (item.name) return item.name;
    const same = items.filter((entry) => entry.id === item.id).sort((a, b) => a.uid - b.uid);
    const order = same.indexOf(item) + 1;
    return `#${pad2(item.id)}${order > 1 ? ` ${order}` : ""}`;
  }

  // 레이어 패널의 줄 (위 → 아래)
  // uids: 이 줄을 누르면 선택되는 조각 / own: 이 줄이 화면에서 차지하는 조각 (순서 계산용)
  function buildLayerRows() {
    const rows = [];
    const seen = new Set();

    [...items].reverse().forEach((item) => {
      if (!item.group) {
        rows.push({ kind: "item", key: `i${item.uid}`, item, uids: [item.uid], own: [item.uid], child: false });
        return;
      }
      if (seen.has(item.group)) return;
      seen.add(item.group);

      const group = groupByGid(item.group);
      const members = membersOf(group.gid).reverse().map((member) => member.uid);
      rows.push({
        kind: "group", key: `g${group.gid}`, group,
        uids: members, own: group.collapsed ? members : [], child: false
      });
      if (group.collapsed) return;
      members.forEach((uid) => {
        rows.push({ kind: "item", key: `i${uid}`, item: itemByUid(uid), uids: [uid], own: [uid], child: true, gid: group.gid });
      });
    });

    return rows;
  }

  const rowName = (row) => (row.kind === "group" ? row.group.name : layerName(row.item));

  function renderLayers() {
    updateGroupButton();
    if (renaming) return;

    const rows = buildLayerRows();
    layerRows = rows;
    layersEmpty.hidden = rows.length > 0;

    while (layersList.children.length < rows.length) {
      const row = document.createElement("div");
      row.className = "layer-row";
      row.setAttribute("role", "option");
      row.innerHTML =
        '<button class="layer-caret" type="button" tabindex="-1"></button>' +
        '<span class="layer-icon"><img class="layer-thumb" alt="" draggable="false" /></span>' +
        '<span class="layer-name"></span>' +
        '<button class="layer-button" type="button" data-toggle="locked"></button>' +
        '<button class="layer-button" type="button" data-toggle="hidden"></button>';
      layersList.appendChild(row);
    }
    while (layersList.children.length > rows.length) layersList.lastChild.remove();

    rows.forEach((data, index) => {
      const row = layersList.children[index];
      const [caret, icon, name, lock, eye] = row.children;
      const members = data.uids.map(itemByUid);
      const selected = data.uids.every((uid) => selection.has(uid));
      const locked = members.every((item) => item.locked);
      const hidden = members.every((item) => item.hidden);
      const isGroup = data.kind === "group";

      row.dataset.key = data.key;
      row.classList.toggle("is-group", isGroup);
      row.classList.toggle("is-child", data.child);
      row.classList.toggle("is-open", isGroup && !data.group.collapsed);
      row.classList.toggle("is-selected", selected);
      row.classList.toggle("is-locked", locked);
      row.classList.toggle("is-hidden", hidden);
      row.setAttribute("aria-selected", selected);

      if (caret.dataset.kind !== data.kind) {
        caret.innerHTML = isGroup ? ICONS.caret : "";
        caret.dataset.kind = data.kind;
        caret.setAttribute("aria-label", isGroup ? "Expand or collapse group" : "");
        icon.innerHTML = isGroup ? ICONS.folder : '<img class="layer-thumb" alt="" draggable="false" />';
      }

      if (!isGroup) {
        const thumb = icon.firstChild;
        const src = smallSrc(data.item.id);
        if (thumb.dataset.src !== src) {
          thumb.src = src;
          thumb.dataset.src = src;
        }
        thumb.style.transform = data.item.flip ? "scaleX(-1)" : "";
      }

      name.textContent = rowName(data);

      if (lock.dataset.state !== String(locked)) {
        lock.innerHTML = locked ? ICONS.lock : ICONS.unlock;
        lock.dataset.state = locked;
        lock.setAttribute("aria-label", locked ? "Unlock" : "Lock");
      }
      if (eye.dataset.state !== String(hidden)) {
        eye.innerHTML = hidden ? ICONS.eyeOff : ICONS.eye;
        eye.dataset.state = hidden;
        eye.setAttribute("aria-label", hidden ? "Show" : "Hide");
      }
    });
  }

  const rowByKey = (key) => layerRows.find((row) => row.key === key) ?? null;

  layersList.addEventListener("pointerdown", (event) => {
    const element = event.target.closest(".layer-row");
    if (!element || event.button !== 0 || drag || action || renaming) return;

    const row = rowByKey(element.dataset.key);
    if (!row) return;

    // 그룹 펼치기 / 접기
    if (event.target.closest(".layer-caret") && row.kind === "group") {
      event.preventDefault();
      row.group.collapsed = !row.group.collapsed;
      renderLayers();
      return;
    }

    // 잠금 / 보기 (그룹은 멤버 전체)
    const toggle = event.target.closest(".layer-button");
    if (toggle) {
      event.preventDefault();
      const key = toggle.dataset.toggle;
      const members = row.uids.map(itemByUid);
      const value = !members.every((item) => item[key]);
      members.forEach((item) => { item[key] = value; });
      if (value) exitModes();
      renderItems();
      commit();
      return;
    }

    event.preventDefault();
    exitModes();

    const toggleKey = event.metaKey || event.ctrlKey;
    const rowSelected = row.uids.every((uid) => selection.has(uid));

    // ⇧: 마지막으로 누른 줄부터 이 줄까지 전부
    if (event.shiftKey) {
      const rows = layerRows;
      const from = Math.max(0, rows.findIndex((entry) => entry.key === layerAnchor));
      const to = rows.indexOf(row);
      const range = rows.slice(Math.min(from, to), Math.max(from, to) + 1).flatMap((entry) => entry.uids);
      setSelection(toggleKey ? [...selection, ...range] : range);
      return;
    }

    layerAnchor = row.key;

    // ⌘/Ctrl: 떨어진 줄도 하나씩 골라서 추가 / 빼기
    if (toggleKey) {
      setSelection(rowSelected
        ? [...selection].filter((uid) => !row.uids.includes(uid))
        : [...selection, ...row.uids]);
      return;
    }

    const narrowTo = rowSelected && selection.size > row.uids.length;
    if (!rowSelected) setSelection(row.uids);

    // 끌어서 순서 바꾸기 (펼친 그룹은 그 안의 줄까지 함께)
    const index = layerRows.indexOf(row);
    const size = row.kind === "group" && !row.group.collapsed ? row.uids.length + 1 : 1;
    const rect = element.getBoundingClientRect();
    layerDrag = {
      row,
      index,
      size,
      startY: event.clientY,
      rowHeight: rect.height,
      target: null,
      moved: false,
      narrowTo
    };
  });

  // 줄 이름을 두 번 누르면 이름 바꾸기
  layersList.addEventListener("dblclick", (event) => {
    const element = event.target.closest(".layer-row");
    if (!element || event.target.closest(".layer-button, .layer-caret")) return;
    startRename(element.dataset.key);
  });

  function moveLayerDrag(event) {
    const dy = event.clientY - layerDrag.startY;
    if (!layerDrag.moved && Math.abs(dy) < 4) return;

    if (!layerDrag.moved) {
      layerDrag.moved = true;
      layersPanel.classList.add("is-reordering");
    }

    const { index, size, rowHeight } = layerDrag;
    const others = layerRows.length - size;
    const target = clamp(Math.round(index + dy / rowHeight), 0, others);
    layerDrag.target = target;

    // 끌고 있는 줄(들)은 손을 따라가고, 다른 줄들은 비켜 줌
    [...layersList.children].forEach((row, j) => {
      const inBlock = j >= index && j < index + size;
      row.classList.toggle("is-dragging", inBlock);
      if (inBlock) {
        row.style.transform = `translateY(${dy}px)`;
        return;
      }
      const rest = j < index ? j : j - size;
      const final = rest < target ? rest : rest + size;
      row.style.transform = final !== j ? `translateY(${(final - j) * rowHeight}px)` : "";
    });
  }

  function endLayerDrag() {
    const state = layerDrag;
    layerDrag = null;
    layersPanel.classList.remove("is-reordering");
    [...layersList.children].forEach((row) => {
      row.style.transform = "";
      row.classList.remove("is-dragging");
    });

    if (!state.moved) {
      if (state.narrowTo) setSelection(state.row.uids);
      return;
    }

    const { row, index, size } = state;
    if (state.target === null || state.target === index) return;

    const block = layerRows.slice(index, index + size);
    const remaining = layerRows.filter((_, j) => j < index || j >= index + size);
    let target = state.target;

    if (row.kind === "group") {
      // 그룹 안에 그룹은 넣지 않음 → 그 그룹 위로
      while (target > 0 && remaining[target]?.child) target--;
    } else {
      // 펼친 그룹의 줄 사이에 놓으면 그 그룹으로 들어가고, 밖에 놓으면 그룹에서 빠짐
      const below = remaining[target];
      row.item.group = below?.child ? below.gid : null;
    }

    // 줄 순서(위에서부터) → items 배열 순서(아래에서부터)
    const order = [...remaining.slice(0, target), ...block, ...remaining.slice(target)]
      .flatMap((entry) => entry.own)
      .reverse()
      .map(itemByUid);
    items.splice(0, items.length, ...order);
    renderItems();
    commit();
  }

  /* ---------- 이름 바꾸기 (Enter 또는 두 번 클릭) ---------- */

  function startRename(key) {
    const row = rowByKey(key);
    const element = layersList.querySelector(`[data-key="${key}"]`);
    if (!row || !element || renaming) return;

    const name = element.querySelector(".layer-name");
    const input = document.createElement("input");
    input.className = "layer-rename";
    input.type = "text";
    input.maxLength = 40;
    input.spellcheck = false;
    input.autocomplete = "off";
    input.value = rowName(row);

    renaming = key;
    layerAnchor = key;
    name.hidden = true;
    name.after(input);
    input.focus();
    input.select();

    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      renaming = null;
      input.remove();
      name.hidden = false;

      const value = input.value.trim().replace(/\s+/g, " ");
      let changed = false;
      if (save && row.kind === "group" && value && value !== row.group.name) {
        row.group.name = value;
        changed = true;
      }
      if (save && row.kind === "item" && value !== layerName(row.item)) {
        row.item.name = value;          // 비우면 원래 이름(#번호)으로
        changed = true;
      }

      renderLayers();
      if (changed) commit();
    };

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("pointerdown", (event) => event.stopPropagation());
  }

  /* ---------- 그룹 (⌘/Ctrl + G) · 그룹 풀기 (⌘/Ctrl + ⇧ + G) ---------- */

  function groupSelection() {
    const list = items.filter((item) => selection.has(item.uid));
    if (list.length < 2) return;

    exitModes();
    const gid = nextGid++;
    const count = groups.length + 1;
    groups.push({ gid, name: `GROUP ${count}`, collapsed: false });
    list.forEach((item) => { item.group = gid; });

    layerAnchor = `g${gid}`;
    renderItems();
    commit();
  }

  function ungroupSelection() {
    const gids = new Set(items.filter((item) => selection.has(item.uid) && item.group).map((item) => item.group));
    if (!gids.size) return;

    exitModes();
    items.forEach((item) => {
      if (gids.has(item.group)) item.group = null;
    });
    renderItems();
    commit();
  }

  // 선택이 딱 한 그룹 전체면 UNGROUP, 두 개 이상이면 GROUP
  function selectionIsOneGroup() {
    const list = items.filter((item) => selection.has(item.uid));
    const gid = list[0]?.group;
    return Boolean(gid) && list.every((item) => item.group === gid) && membersOf(gid).length === list.length;
  }

  function updateGroupButton() {
    const one = selectionIsOneGroup();
    groupButton.textContent = one ? "UNGROUP" : "GROUP";
    groupButton.disabled = !one && selection.size < 2;
    groupButton.title = one ? `Ungroup (${MOD_LABEL}⇧G)` : `Group (${MOD_LABEL}G)`;
  }

  groupButton.addEventListener("click", () => {
    if (selectionIsOneGroup()) ungroupSelection();
    else groupSelection();
  });

  /* =========================================
     TOOLS
  ========================================= */

  function duplicateSelection(offset = true) {
    const list = selectedItems();
    if (!list.length) return false;

    const copies = [];

    // 그룹 전체를 복제하면 복제본끼리 새 그룹
    const newGroups = new Map();
    groups.forEach((group) => {
      const members = membersOf(group.gid);
      if (!members.every((member) => list.includes(member))) return;
      const gid = nextGid++;
      newGroups.set(group.gid, gid);
      groups.push({ gid, name: `${group.name} COPY`.slice(0, 40), collapsed: group.collapsed });
    });

    // 복제본은 원본 바로 위 레이어에
    [...list].reverse().forEach((item) => {
      const copy = {
        ...JSON.parse(JSON.stringify(item)),
        uid: nextUid++,
        locked: false,
        group: newGroups.get(item.group) ?? item.group ?? null,
        x: item.x + (offset ? 28 : 0),
        y: item.y + (offset ? 28 : 0)
      };
      items.splice(items.indexOf(item) + 1, 0, copy);
      copies.push(copy.uid);
    });

    setSelection(copies);
    renderItems();
    if (offset) commit();
    return true;
  }

  function moveLayer(direction) {
    const list = selectedItems();
    if (!list.length) return;

    // 앞으로: 위쪽부터 / 뒤로: 아래쪽부터 한 칸씩
    const ordered = direction > 0 ? [...list].reverse() : list;
    let moved = false;

    ordered.forEach((item) => {
      const index = items.indexOf(item);
      const next = index + direction;
      if (next < 0 || next >= items.length || selection.has(items[next].uid)) return;
      [items[index], items[next]] = [items[next], items[index]];
      moved = true;
    });

    if (!moved) return;
    renderItems();
    commit();
  }

  const centerOf = (list) => {
    const box = boundsOf(list);
    return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
  };

  // 여러 개면 전체 가운데를 기준으로 함께 돌림
  function rotateSelected(degrees) {
    const list = editableSelection();
    if (!list.length) return;
    exitModes();

    if (list.length === 1) {
      list[0].rotation = normalizeAngle(Math.round((list[0].rotation + degrees) / 90) * 90);
    } else {
      const center = centerOf(list);
      list.forEach((item) => {
        const offset = rotate({ x: item.x - center.x, y: item.y - center.y }, degrees);
        item.x = center.x + offset.x;
        item.y = center.y + offset.y;
        item.rotation = normalizeAngle(item.rotation + degrees);
      });
    }
    renderItems();
    commit();
  }

  // 여러 개면 전체를 거울처럼 좌우로 뒤집음
  function flipSelected() {
    const list = editableSelection();
    if (!list.length) return;
    exitModes();

    const center = centerOf(list);
    list.forEach((item) => {
      item.flip = !item.flip;
      if (list.length > 1) {
        item.x = 2 * center.x - item.x;
        item.rotation = normalizeAngle(-item.rotation);
      }
    });
    renderItems();
    commit();
  }

  function removeSelected() {
    const list = selectedItems();
    if (!list.length) return;

    exitModes();
    list.forEach((item) => items.splice(items.indexOf(item), 1));
    selection.clear();
    renderItems();
    commit();
  }

  function setBackground(color) {
    background = color.toLowerCase();
    canvas.style.backgroundColor = background;
    toolbar.style.setProperty("--canvas-color", background);
    colorInput.value = background;
    currentColor.textContent = background.toUpperCase();
    swatchBox.querySelectorAll(".swatch").forEach((swatch) => {
      swatch.classList.toggle("is-current", swatch.dataset.color === background);
    });
  }

  /* ---------- 팝오버 (툴바 오른쪽에 열림) ---------- */

  function openPopover(popover, button) {
    const wasOpen = !popover.hidden;
    closePopovers();
    if (wasOpen) return;

    popover.hidden = false;
    button.classList.add("is-open");

    const buttonRect = button.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    let left = buttonRect.right + 12;
    if (left + popoverRect.width > window.innerWidth - 8) left = buttonRect.left - popoverRect.width - 12;

    popover.style.left = `${left}px`;
    popover.style.top = `${clamp(
      buttonRect.top + buttonRect.height / 2 - popoverRect.height / 2,
      8,
      window.innerHeight - popoverRect.height - 8
    )}px`;
  }

  function closePopovers() {
    colorPopover.hidden = true;
    toolbar.querySelector('[data-tool="color"]').classList.remove("is-open");
  }

  SWATCHES.forEach((color) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "swatch";
    swatch.dataset.color = color;
    swatch.style.background = color;
    swatch.setAttribute("aria-label", color);
    swatchBox.appendChild(swatch);
  });

  swatchBox.addEventListener("click", (event) => {
    const swatch = event.target.closest(".swatch");
    if (!swatch) return;
    setBackground(swatch.dataset.color);
    commit();
  });

  colorInput.addEventListener("input", () => setBackground(colorInput.value));
  colorInput.addEventListener("change", () => commit());

  toolbar.addEventListener("click", (event) => {
    const button = event.target.closest(".tool");
    if (!button || button.disabled) return;

    switch (button.dataset.tool) {
      case "color": openPopover(colorPopover, button); break;
      case "duplicate": exitModes(); duplicateSelection(); break;
      case "rotate": rotateSelected(event.shiftKey ? -90 : 90); break;
      case "flip": flipSelected(); break;
      case "crop": cropping ? exitCrop() : enterCrop(); break;
      case "cut": cutting ? applyCut() : enterCut(); break;
      case "forward": moveLayer(1); break;
      case "backward": moveLayer(-1); break;
    }
  });

  // 단축키를 툴 이름표에 표시
  toolbar.querySelectorAll(".tool").forEach((button) => {
    if (button.dataset.key) button.dataset.tip += `  ${MOD_LABEL}${button.dataset.key}`;
    else if (button.dataset.shortcut) button.dataset.tip += `  ${button.dataset.shortcut}`;
  });

  /* =========================================
     EYEDROPPER (스포이드)
     클릭하기 전에 커서 아래 색상과 코드를 미리 보여줌
  ========================================= */

  const pixelCache = new Map();

  function pixelsOf(image) {
    const src = image.currentSrc || image.src;
    if (pixelCache.has(src)) return pixelCache.get(src);
    if (!image.complete || !image.naturalWidth) return null;

    let result = null;
    try {
      const board = document.createElement("canvas");
      board.width = image.naturalWidth;
      board.height = image.naturalHeight;
      const context = board.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      result = { data: context.getImageData(0, 0, board.width, board.height).data, w: board.width, h: board.height };
    } catch {
      result = null; // file:// 로 열면 브라우저가 픽셀 읽기를 막음
    }

    pixelCache.set(src, result);
    return result;
  }

  // fx, fy: 이미지 안의 위치 (0 ~ 1)
  function pixelAt(image, fx, fy) {
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;
    const pixels = pixelsOf(image);
    if (!pixels) return null;
    const x = Math.min(pixels.w - 1, Math.floor(fx * pixels.w));
    const y = Math.min(pixels.h - 1, Math.floor(fy * pixels.h));
    const i = (y * pixels.w + x) * 4;
    return [pixels.data[i], pixels.data[i + 1], pixels.data[i + 2], pixels.data[i + 3] / 255];
  }

  // object-fit: contain 으로 그려진 이미지의 픽셀
  function containedPixel(image, x, y) {
    const rect = image.getBoundingClientRect();
    const aspect = image.naturalWidth / image.naturalHeight || 1;
    const { w, h } = fit(aspect, Math.min(rect.width, rect.height));
    return pixelAt(
      image,
      (x - (rect.left + rect.width / 2)) / w + 0.5,
      (y - (rect.top + rect.height / 2)) / h + 0.5
    );
  }

  function parseColor(value) {
    const match = value.match(/rgba?\(([^)]+)\)/);
    if (match) {
      const [r, g, b, a = 1] = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return [r, g, b, a];
    }
    const hex = value.replace("#", "");
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(1);
  }

  // 배경 그라데이션 (builder.css의 .builder-bg와 같은 값)
  function backgroundAt(y) {
    const t = y / window.innerHeight;
    const stops = [[0, 255], [0.45, 241], [1, 232]];
    const [a, b] = t < 0.45 ? [stops[0], stops[1]] : [stops[1], stops[2]];
    const v = lerp(a[1], b[1], (t - a[0]) / (b[0] - a[0]));
    return [v, v, v, 1];
  }

  function sampleElement(element, x, y) {
    if (element.classList.contains("canvas-item")) {
      const item = itemByUid(Number(element.dataset.uid));
      if (!item) return null;
      const { fx, fy } = imagePoint(item, x, y);
      if (item.mask && !insidePolygon(fx, fy, item.mask)) return null;
      return pixelAt(element.firstChild, fx, fy);
    }

    if (element.classList.contains("library-cell")) {
      const picked = containedPixel(element.querySelector("img"), x, y);
      if (picked && picked[3] > 0) return picked;
    }

    if (element === preview && !previewImage.hidden) {
      const picked = containedPixel(previewImage, x, y);
      if (picked && picked[3] > 0) return picked;
    }

    if (element === canvas) return parseColor(background);
    if (element === builderBg || element === builder) return backgroundAt(y);

    const color = getComputedStyle(element).backgroundColor;
    return color && color !== "transparent" ? parseColor(color) : null;
  }

  function sampleAt(x, y) {
    const layers = [];

    for (const element of document.elementsFromPoint(x, y)) {
      if (!builder.contains(element)) break;
      const color = sampleElement(element, x, y);
      if (!color || color[3] <= 0) continue;
      layers.push(color);
      if (color[3] >= 0.999) break;
    }

    // 아래부터 겹쳐서 실제 보이는 색 계산
    let [r, g, b] = backgroundAt(y);
    for (let i = layers.length - 1; i >= 0; i--) {
      const [lr, lg, lb, la] = layers[i];
      r = lr * la + r * (1 - la);
      g = lg * la + g * (1 - la);
      b = lb * la + b * (1 - la);
    }

    return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  }

  function startSampling() {
    closePopovers();
    exitModes();
    sampling = true;
    builder.classList.add("is-sampling");
  }

  function stopSampling() {
    sampling = false;
    builder.classList.remove("is-sampling");
    loupe.hidden = true;
  }

  function moveLoupe(event) {
    const color = sampleAt(event.clientX, event.clientY);
    loupe.hidden = false;
    loupe.style.transform = `translate(${event.clientX + 18}px, ${event.clientY + 18}px)`;
    loupeSwatch.style.background = color;
    loupeHex.textContent = color.toUpperCase();
  }

  eyedropperButton.addEventListener("click", startSampling);

  // 스포이드 중에는 다른 동작보다 먼저 가로챔
  window.addEventListener("pointerdown", (event) => {
    if (!sampling) return;
    event.preventDefault();
    event.stopPropagation();

    if (event.button === 0) {
      setBackground(sampleAt(event.clientX, event.clientY));
      commit();
    }
    stopSampling();
  }, true);

  /* =========================================
     HISTORY (되돌리기 / 다시 하기)
  ========================================= */

  const snapshot = () => JSON.stringify({ items, background, groups });

  function commit() {
    const state = snapshot();
    if (history[historyIndex] === state) return;

    history.splice(historyIndex + 1);
    history.push(state);
    if (history.length > 200) history.shift();
    historyIndex = history.length - 1;
    updateUI();
  }

  function restore(state) {
    exitModes();
    const data = JSON.parse(state);
    items.splice(0, items.length, ...data.items);
    groups.splice(0, groups.length, ...(data.groups ?? []));
    nextUid = Math.max(nextUid, ...items.map((item) => item.uid + 1));
    nextGid = Math.max(nextGid, ...groups.map((group) => group.gid + 1));
    setBackground(data.background);
    renderItems();
  }

  function undo() {
    if (historyIndex <= 0) return;
    historyIndex--;
    restore(history[historyIndex]);
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    historyIndex++;
    restore(history[historyIndex]);
  }

  /* =========================================
     KEYBOARD
     ⌘ 또는 Ctrl 모두 사용 가능 (맥에서도 Ctrl 동작)
     ⌘/Ctrl + Z        되돌리기
     ⌘/Ctrl + ⇧ + Z    다시 하기 (Ctrl + Y도 가능)
     ⌘/Ctrl + ]        레이어 위로
     ⌘/Ctrl + [        레이어 아래로
     ⌘/Ctrl + D        복제
     ⌘/Ctrl + A        전체 선택
     ⌘/Ctrl + G        그룹 (⇧: 그룹 풀기)
     ⌥/Alt + 드래그    복제하면서 이동
     ⇧ + 드래그        가로나 세로로만 이동 · 크기는 비율 유지
     Enter             네모 자르기 시작 / 끝내기 (레이어를 누른 뒤엔 이름 바꾸기)
     L                 모양 자르기 (펜)
     Delete            삭제
     방향키            조금씩 이동 (⇧: 크게)
  ========================================= */

  window.addEventListener("keydown", (event) => {
    if (!active) return;
    if (event.target.closest?.("input, textarea")) return;

    const mod = event.metaKey || event.ctrlKey;
    // 한글 입력 상태에서도 동작하도록 event.code 사용
    const code = event.code;
    const idle = !drag && !action && !layerDrag && !press;

    if (sampling && code === "Escape") {
      stopSampling();
      return;
    }

    if (mod && code === "KeyZ") {
      event.preventDefault();
      if (!idle) return;
      if (event.shiftKey) redo();
      else undo();
      return;
    }

    if (mod && code === "KeyY") {
      event.preventDefault();
      if (idle) redo();
      return;
    }

    if (mod && code === "BracketRight") {
      event.preventDefault();
      if (idle) moveLayer(1);
      return;
    }

    if (mod && code === "BracketLeft") {
      event.preventDefault();
      if (idle) moveLayer(-1);
      return;
    }

    if (mod && code === "KeyD") {
      event.preventDefault();
      if (idle) {
        exitModes();
        duplicateSelection();
      }
      return;
    }

    if (mod && code === "KeyG") {
      event.preventDefault();
      if (idle) {
        if (event.shiftKey) ungroupSelection();
        else groupSelection();
      }
      return;
    }

    if (mod && code === "KeyA") {
      event.preventDefault();
      if (idle) {
        exitModes();
        setSelection(items.filter((item) => !item.locked && !item.hidden).map((item) => item.uid));
      }
      return;
    }

    if (cutting && (code === "Enter" || code === "NumpadEnter")) {
      event.preventDefault();
      if (!action) applyCut();
      return;
    }

    if (cutting && (code === "Backspace" || code === "Delete")) {
      event.preventDefault();
      if (!action) {
        cutting.points.pop();
        cutting.closable = false;
        builder.classList.remove("is-pen-closing");
      }
      return;
    }

    if (!mod && code === "KeyL") {
      if (!idle) return;
      event.preventDefault();
      if (cutting) applyCut();
      else enterCut();
      return;
    }

    if (code === "Enter" || code === "NumpadEnter") {
      if (!idle || event.isComposing) return;
      event.preventDefault();
      // 레이어 패널에서 줄을 누른 뒤: 그 줄 이름 바꾸기
      if (layersFocused && !cropping && rowByKey(layerAnchor)) startRename(layerAnchor);
      else if (cropping) exitCrop();
      else enterCrop();
      return;
    }

    if ((code === "Delete" || code === "Backspace") && selection.size && idle) {
      event.preventDefault();
      removeSelected();
      return;
    }

    if (code === "Escape") {
      closePopovers();
      if (cropping || cutting) exitModes();
      else setSelection([]);
      return;
    }

    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const list = editableSelection();
    if (arrows[code] && list.length && idle && !cropping) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      list.forEach((item) => {
        item.x += arrows[code][0] * step;
        item.y += arrows[code][1] * step;
      });
      renderItems();
      nudged = true;
    }
  });

  // 방향키는 뗄 때 한 번만 기록
  let nudged = false;
  window.addEventListener("keyup", (event) => {
    if (nudged && event.code.startsWith("Arrow")) {
      nudged = false;
      commit();
    }
  });

  /* =========================================
     POINTER (전역)
  ========================================= */

  window.addEventListener("pointermove", (event) => {
    if (sampling) moveLoupe(event);
    else if (press) movePress(event);
    else if (drag) moveDrag(event);
    else if (action) moveAction(event);
    else if (layerDrag) moveLayerDrag(event);
    else if (cutting && canvasRect) updatePenHover(event);
  });

  function pointerEnd() {
    if (press) endPress();
    else if (drag) endDrag();
    else if (action) endAction();
    else if (layerDrag) endLayerDrag();
  }

  window.addEventListener("pointerup", pointerEnd);
  window.addEventListener("pointercancel", pointerEnd);

  // 마지막으로 누른 곳이 레이어 패널인지 기억 (Enter = 이름 바꾸기)
  window.addEventListener("pointerdown", (event) => {
    layersFocused = Boolean(event.target.closest?.(".layers"));
  }, true);

  // 빈 곳을 누르면 선택 해제 / 팝오버 닫기
  builder.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".popover, .toolbar")) return;
    closePopovers();
    if (event.target.closest(".sel-frame, .library-cell, .preview, .info, .layers")) return;
    exitModes();
    setSelection([]);
  });

  /* =========================================
     INFO · TIMER · FINISH
  ========================================= */

  // 조각을 가져올 때 시작 (캔버스로 돌아와 수정할 때는 멈춘 시간에서 이어서)
  function startTimer() {
    if (timerRunningSince === null) timerRunningSince = now();
  }

  function stopTimer() {
    if (timerRunningSince === null) return;
    timerElapsed += now() - timerRunningSince;
    timerRunningSince = null;
  }

  const elapsedMs = (time) => timerElapsed + (timerRunningSince === null ? 0 : time - timerRunningSince);

  function updateTimer(time) {
    if (timerRunningSince === null && timerElapsed === 0) return;

    const seconds = Math.floor(elapsedMs(time) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    const rest = String(seconds % 60).padStart(2, "0");
    const text = hours ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`;

    if (text !== lastTimerText) {
      timerText.textContent = text;
      lastTimerText = text;
    }
  }

  function updateUI() {
    selectedCount.textContent = String(usedIds().size).padStart(2, "0");

    const list = selectedItems();
    const editable = list.filter((item) => !item.locked);
    const single = list.length === 1 && !list[0].locked;
    const tool = (name) => toolbar.querySelector(`[data-tool="${name}"]`);

    toolbar.querySelectorAll("[data-needs-selection]").forEach((button) => {
      button.disabled = !list.length;
    });

    tool("rotate").disabled = !editable.length;
    tool("flip").disabled = !editable.length;
    tool("crop").disabled = !single;
    tool("cut").disabled = !single;
    tool("crop").classList.toggle("is-open", Boolean(cropping));
    tool("cut").classList.toggle("is-open", Boolean(cutting));

    if (list.length) {
      const indexes = list.map((item) => items.indexOf(item));
      tool("forward").disabled = indexes.every((index) => index >= items.length - list.length);
      tool("backward").disabled = indexes.every((index) => index < list.length);
    }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  // 완성된 캔버스를 한 장의 이미지로 (저장 · 다운로드용)
  async function renderGarden(size = 1600) {
    const board = document.createElement("canvas");
    board.width = size;
    board.height = size;

    const context = board.getContext("2d");
    context.fillStyle = background;
    context.fillRect(0, 0, size, size);

    const visible = items.filter((item) => !item.hidden);
    const images = await Promise.all(visible.map((item) => loadImage(largeSrc(item.id))));
    const k = size / UNITS;

    visible.forEach((item, index) => {
      const crop = displayCrop(item);
      const fw = item.w / (1 - crop.l - crop.r);
      const fh = item.h / (1 - crop.t - crop.b);

      context.save();
      context.scale(k, k);
      context.translate(item.x, item.y);
      context.rotate((item.rotation * Math.PI) / 180);

      // 네모 자르기
      context.beginPath();
      context.rect(-item.w / 2, -item.h / 2, item.w, item.h);
      context.clip();

      // 전체 이미지의 중심으로 옮긴 뒤 (뒤집기 → 이미지 기준 좌표)
      context.translate(((crop.r - crop.l) * fw) / 2, ((crop.b - crop.t) * fh) / 2);
      if (item.flip) context.scale(-1, 1);

      // 모양 자르기
      if (item.mask) {
        context.beginPath();
        item.mask.forEach(([x, y], i) => {
          const px = (x - 0.5) * fw;
          const py = (y - 0.5) * fh;
          if (i) context.lineTo(px, py);
          else context.moveTo(px, py);
        });
        context.closePath();
        context.clip();
      }

      context.drawImage(images[index], -fw / 2, -fh / 2, fw, fh);
      context.restore();
    });

    return board;
  }

  finishButton.addEventListener("click", () => {
    if (builder.classList.contains("is-finished")) return;

    // 타이머와 숫자 세기를 멈춤
    stopTimer();
    updateTimer(now());
    closePopovers();
    stopSampling();
    exitModes();
    setSelection([]);
    active = false;
    builder.classList.add("is-finished");

    const seconds = Math.floor(timerElapsed / 1000);

    // 결과 화면(result.js)이 이어받음
    document.dispatchEvent(new CustomEvent("garden:finished", {
      detail: {
        builder,
        canvas,
        background,
        seconds,
        time: lastTimerText || "00:00",
        fragments: usedIds().size,
        total: FRAGMENT_COUNT,
        render: renderGarden
      }
    }));
  });

  // 결과 화면에서 [ BACK TO CANVAS ] → 하던 작업 그대로 다시 편집
  // 타이머는 멈춘 채로 있다가 새 조각을 가져오면 이어서 흐름
  document.addEventListener("garden:resume", () => {
    builder.classList.remove("is-finished");
    active = true;
    readCanvasRect();
    updateUI();
  });

  /* =========================================
     LOOP
  ========================================= */

  let lastTime = 0;

  function frame(time) {
    const dt = Math.min((time - lastTime) / 1000, 1 / 30);
    lastTime = time;

    readCanvasRect();
    stepDrag(dt);
    drawSelection();
    drawCutPath();
    updateTimer(time);

    requestAnimationFrame(frame);
  }

  /* =========================================
     RESIZE
  ========================================= */

  let resizeTimer = null;

  window.addEventListener("resize", () => {
    if (!active) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      computeLayout();
      applyLayout(true);
      readCanvasRect();
    }, 150);
  });

  /* =========================================
     ENTER: 떨어진 조각을 이어받아 → 캔버스 등장 → 라이브러리로 정리
  ========================================= */

  document.addEventListener("garden:landed", (event) => {
    const handoff = event.detail?.pieces ?? [];

    builder.hidden = false;
    buildLibrary();

    // 조각을 지금 보이는 자리 그대로 옮김 (위치를 먼저 전부 읽고 나서 옮김)
    const handoffRects = handoff.map((entry) => entry.element.getBoundingClientRect());

    handoff.forEach((entry, index) => {
      const element = entry.element;
      const image = element.querySelector("img");
      const rect = handoffRects[index];
      const aspect = image.naturalWidth && image.naturalHeight
        ? image.naturalWidth / image.naturalHeight
        : 1;

      // 원래는 정사각형 상자 안에 contain으로 그려져 있었음
      const { w, h } = fit(aspect, Math.min(entry.width, entry.height));

      element.className = "pile-piece";
      element.removeAttribute("style");
      pileLayer.appendChild(element);

      const piece = {
        id: index + 1,
        element,
        aspect,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        w, h,
        rotation: normalizeAngle(entry.rotation)
      };

      pieces.push(piece);
      drawBox(element, piece.x, piece.y, w, h, piece.rotation);
    });

    computeLayout();
    applyLayout(true);
    readCanvasRect();
    setBackground(background);
    renderLayers();
    commit();
    updateUI();

    requestAnimationFrame(() => {
      builder.classList.add("is-ready");
      active = true;
      flyToLibrary();
      lastTime = now();
      requestAnimationFrame(frame);
    });
  });
})();
