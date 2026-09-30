/* =========================================
   BUILD YOUR OWN GARDEN
   INTRO INTERACTION
========================================= */

const grid = document.querySelector("#gardenGrid");
const mosaic = document.querySelector("#mosaicWindow");
const scene = document.querySelector("#mosaicScene");
const world = document.querySelector("#world");
const abyss = document.querySelector("#abyss");
const portalLine = document.querySelector("#portalLine");
const portalFlashes = document.querySelector("#portalFlashes");
const fragmentLayer = document.querySelector("#fragmentLayer");
const startButton = document.querySelector("#startButton");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* =========================================
   OPENING
   영상이 끝나면(흰 화면) 같은 흰 배경 위로 첫 페이지가 페이드인
   소리 있는 자동 재생이 막히면 소리 없이 재생 + [ SOUND ON ]
========================================= */

const opening = document.querySelector("#opening");
const openingVideo = document.querySelector("#openingVideo");
const openingSound = document.querySelector("#openingSound");
const openingPlay = document.querySelector("#openingPlay");

function endOpening() {
  if (!document.body.classList.contains("is-opening")) return;

  openingVideo?.pause();
  if (opening) opening.hidden = true;

  // 한 프레임 뒤에 풀어야 페이드인이 보임
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.remove("is-opening");
      opening?.remove();
    });
  });
}

function unmuteOpening() {
  if (!openingVideo) return;
  openingVideo.muted = false;
  openingSound.hidden = true;
  // 멈춰 있었으면(자동 재생이 막혔으면) 클릭한 김에 소리와 함께 재생
  if (openingVideo.paused) {
    openingPlay.hidden = true;
    openingVideo.play().catch(() => { openingPlay.hidden = false; });
  }
}

// 사파리는 소리 있는 자동 재생을 절대 허용하지 않으므로 처음부터 소리 없이 시작
const isSafariBrowser = /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);

async function playMuted() {
  openingVideo.muted = true;
  openingVideo.setAttribute("muted", "");
  if (openingVideo.paused) await openingVideo.play();
}

// 재생 여부는 play()의 답이 아니라 실제 상태로 판단
// (사파리는 autoplay로 이미 재생 중일 때 play() 요청을 "취소됨"으로 거절하기도 함)
function showPlayIfStopped() {
  if (!document.body.classList.contains("is-opening")) return;
  if (!openingVideo.paused) return;
  openingSound.hidden = true;
  openingPlay.hidden = false;
}

async function playOpening() {
  if (!opening || !openingVideo) {
    endOpening();
    return;
  }

  // 파일을 아예 불러올 수 없을 때만 건너뜀 (느리게 받아지는 중이면 기다림)
  openingVideo.addEventListener("ended", endOpening);
  openingVideo.addEventListener("error", endOpening);
  opening.addEventListener("click", unmuteOpening);

  // 실제로 재생되기 시작하면: PLAY는 숨기고, 소리가 꺼져 있으면 SOUND ON
  openingVideo.addEventListener("playing", () => {
    openingPlay.hidden = true;
    openingSound.hidden = !openingVideo.muted;
  });

  try {
    if (isSafariBrowser) {
      await playMuted();
    } else {
      try {
        openingVideo.muted = false;
        await openingVideo.play();
      } catch {
        await playMuted();
      }
    }
  } catch {
    // 아직 준비가 덜 됐을 수 있으니, 재생할 수 있게 되면 한 번 더 시도
    try {
      if (openingVideo.readyState < 3) {
        await new Promise((resolve) => openingVideo.addEventListener("canplay", resolve, { once: true }));
      }
      await playMuted();
    } catch {
      // 거절돼도 곧바로 PLAY를 띄우지 않고, 잠시 뒤에도 멈춰 있을 때만 띄움
    }
  }

  setTimeout(showPlayIfStopped, 1500);
}

playOpening();

/* =========================================
   PIXEL LETTERS
   "BUILD. / YOUR OWN / GARDEN"을 칸으로 그림 → 칸 하나 = 이미지 한 장 (정확히 200칸)
   1·3줄은 오른쪽, 2줄은 왼쪽에 맞춤
========================================= */

const GLYPHS = {
  B: ["###.", "#..#", "###.", "#..#", "###."],
  U: ["#..#", "#..#", "#..#", "#..#", ".##."],
  I: ["###", ".#.", ".#.", ".#.", "###"],
  L: ["#..", "#..", "#..", "#..", "###"],
  D: ["###.", "#..#", "#..#", "#..#", "###."],
  ".": [".", ".", ".", ".", "#"],
  Y: ["#...#", ".#.#.", "..#..", "..#..", "..#.."],
  O: [".##.", "#..#", "#..#", "#..#", ".##."],
  R: ["###.", "#..#", "###.", "#.#.", "#..#"],
  W: ["#...#", "#...#", "#.#.#", "#.#.#", ".#.#."],
  N: ["#..#", "##.#", "#.##", "#..#", "#..#"],
  G: ["####", "#...", "#.##", "#..#", "####"],
  A: [".##.", "#..#", "####", "#..#", "#..#"],
  E: ["####", "#...", "###.", "#...", "####"]
};

const LINES = [
  { text: "BUILD.", align: "right" },
  { text: "YOUR OWN", align: "left" },
  { text: "GARDEN", align: "right" }
];

const GLYPH_H = 5;
const LETTER_GAP = 0.5;     // 글자 사이 (칸 단위)
const WORD_GAP = 1.5;       // 단어 사이
const LINE_GAP = 0.6;       // 줄 사이
const RIGHT_OVERHANG = 1;   // 1·3줄이 2줄보다 오른쪽으로 더 나감

function layoutLetters() {
  const measured = LINES.map((line) => {
    const cells = [];
    let x = 0;
    [...line.text].forEach((char, index) => {
      if (char === " ") {
        x += WORD_GAP - LETTER_GAP;
        return;
      }
      if (index > 0 && line.text[index - 1] !== " ") x += LETTER_GAP;
      const glyph = GLYPHS[char];
      glyph.forEach((row, r) => {
        [...row].forEach((mark, c) => {
          if (mark === "#") cells.push({ col: x + c, row: r });
        });
      });
      x += glyph[0].length;
    });
    return { ...line, cells, width: x };
  });

  const columns = Math.max(...measured.map((line) => line.width + (line.align === "left" ? RIGHT_OVERHANG : 0)));
  const cells = [];

  measured.forEach((line, index) => {
    const offset = line.align === "right" ? columns - line.width : 0;
    const top = index * (GLYPH_H + LINE_GAP);
    line.cells.forEach((cell) => cells.push({ col: cell.col + offset, row: cell.row + top }));
  });

  // 위 → 아래, 왼쪽 → 오른쪽 순서로 이미지 번호를 붙임
  cells.sort((a, b) => a.row - b.row || a.col - b.col);
  return { cells, columns, rows: LINES.length * GLYPH_H + (LINES.length - 1) * LINE_GAP };
}

const letters = layoutLetters();
const COLUMNS = letters.columns;
const ROWS = letters.rows;

if (letters.cells.length !== 200) console.warn("Pixel letters need 200 cells:", letters.cells.length);

grid.style.setProperty("--cols", COLUMNS);
grid.style.setProperty("--rows", ROWS);

/* =========================================
   50 GARDEN TYPES
   4 images per type = 200 images
========================================= */

const gardenTypes = [
  "Absurd_fantasy", "Alien", "Aquarium_tunnel", "Balloon", "Burning_ice",
  "Cake", "Ceramic", "Cheese", "Construction_site", "Crystal",
  "Dinosaur", "Dreamcore", "Dragon", "Eyeball", "Faceless_statue",
  "Floating_island", "Food_market", "Future", "Galaxy", "Ghost",
  "Glass", "Glitch", "Giant_hand", "Inflatable", "Invisible",
  "Laundry", "Liquid_sky", "Mechanical_flower", "Melting", "Missile",
  "Mosaic", "Moon", "Mushroom", "Mutant_flower", "Nightmare",
  "Paper_cut", "Poison_flower", "Rainbow", "Robot", "Shadow",
  "Skeleton", "Snow_mountain", "space", "Surreal", "Tiny_world",
  "Toy", "Treasure", "Underwater", "Volcano", "Weird_wonderland"
];

/* =========================================
   CREATE 200 TILES
========================================= */

let imageNumber = 1;
const fragment = document.createDocumentFragment();

gardenTypes.forEach((type) => {
  for (let i = 0; i < 4; i++) {
    const formattedNumber =
      imageNumber < 100
        ? String(imageNumber).padStart(2, "0")
        : String(imageNumber);

    const fileName = `#${formattedNumber} ${type}_garden.png`;
    const imagePath = `images-small/${encodeURIComponent(fileName)}`;

    const cell = letters.cells[imageNumber - 1];
    const tile = document.createElement("div");
    tile.className = "garden-tile";
    tile.dataset.number = imageNumber;
    tile.dataset.col = cell.col;
    tile.dataset.row = cell.row;
    tile.style.setProperty("--col", cell.col);
    tile.style.setProperty("--row", cell.row);

    const imageWrapper = document.createElement("div");
    imageWrapper.className = "tile-image";

    const image = document.createElement("img");
    image.src = imagePath;
    image.alt = `${type.replaceAll("_", " ")} garden`;
    image.draggable = false;
    image.decoding = "async";

    image.addEventListener("error", () => {
      console.warn("Image could not be loaded:", fileName);
    });

    imageWrapper.appendChild(image);
    tile.appendChild(imageWrapper);
    fragment.appendChild(tile);

    imageNumber++;
  }
});

grid.appendChild(fragment);

/* =========================================
   CREATE 200 FRAGMENTS
   fragments/#01.png ~ #200.png (타일과 1:1)
========================================= */

const fragmentElements = [];
const fragmentFragment = document.createDocumentFragment();

for (let number = 1; number <= gardenTypes.length * 4; number++) {
  const formattedNumber =
    number < 100 ? String(number).padStart(2, "0") : String(number);

  const fileName = `#${formattedNumber}.png`;

  const piece = document.createElement("div");
  piece.className = "fragment";

  const image = document.createElement("img");
  image.src = `fragments-small/${encodeURIComponent(fileName)}`;
  image.alt = "";
  image.draggable = false;
  image.decoding = "async";

  image.addEventListener("error", () => {
    console.warn("Fragment could not be loaded:", fileName);
  });

  piece.appendChild(image);
  fragmentFragment.appendChild(piece);
  fragmentElements.push(piece);
}

fragmentLayer.appendChild(fragmentFragment);

/* =========================================
   SIZE
   글자 전체가 창 안에 들어가도록 한 칸 크기를 정함
========================================= */

let isFalling = false;
const tiles = [...grid.children];

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function fitGrid() {
  if (isFalling) return;
  const cell = Math.floor(Math.min(mosaic.clientWidth / COLUMNS, mosaic.clientHeight / ROWS) * 10) / 10;
  scene.style.setProperty("--cell", `${Math.max(cell, 4)}px`);
}

fitGrid();
window.addEventListener("resize", fitGrid);

/* =========================================
   GLASS HOVER
   이미지 위에 있을 때만: 그 이미지가 살짝 커지고
   유리에 그 이미지보다 살짝 큰 동그란 구멍이 열림 (구멍은 부드럽게 따라감)
========================================= */

const glass = document.querySelector("#glass");
const panel = document.querySelector(".garden-panel");

const ACTIVE_SCALE = 1.6;   // .garden-tile.is-active 크기와 같게
const HOLE_MARGIN = 1.2;    // 커진 이미지보다 이만큼 더 큰 구멍

const hole = { x: -999, y: -999, r: 0, tx: -999, ty: -999, tr: 0 };
const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
let activeTile = null;

function setActiveTile(tile) {
  if (tile === activeTile) return;
  activeTile?.classList.remove("is-active");
  activeTile = tile;
  activeTile?.classList.add("is-active");
}

panel.addEventListener("pointermove", (event) => {
  if (isFalling) return;

  const panelRect = panel.getBoundingClientRect();
  parallax.tx = clamp(((event.clientX - panelRect.left) / panelRect.width - 0.5) * 2, -1, 1);
  parallax.ty = clamp(((event.clientY - panelRect.top) / panelRect.height - 0.5) * 2, -1, 1);

  const tile = document.elementFromPoint(event.clientX, event.clientY)?.closest(".garden-tile") ?? null;
  setActiveTile(tile && grid.contains(tile) ? tile : null);
});

// 구멍: 이미지 한가운데, 완전히 맑은 부분이 커진 이미지보다 살짝 크게
// (마스크는 반지름의 62%까지 완전히 투명 → 그 바깥으로 서서히 서리)
// 이미지가 패럴랙스로 움직이므로 매 프레임 다시 잼
function aimHole() {
  if (!activeTile) {
    hole.tr = 0;
    return;
  }
  const panelRect = panel.getBoundingClientRect();
  const rect = activeTile.getBoundingClientRect();
  hole.tx = rect.left + rect.width / 2 - panelRect.left;
  hole.ty = rect.top + rect.height / 2 - panelRect.top;
  hole.tr = ((rect.width * ACTIVE_SCALE) / 2) * HOLE_MARGIN / 0.62;
  if (hole.r < 1) {
    hole.x = hole.tx;
    hole.y = hole.ty;
  }
}

panel.addEventListener("pointerleave", () => {
  setActiveTile(null);
  hole.tr = 0;
  parallax.tx = parallax.ty = 0;
});

function animateGlass() {
  if (isFalling) return;

  aimHole();

  const instant = reduceMotion.matches;
  const follow = instant ? 1 : 0.24;
  hole.x += (hole.tx - hole.x) * follow;
  hole.y += (hole.ty - hole.y) * follow;
  hole.r += (hole.tr - hole.r) * (instant ? 1 : 0.2);
  if (hole.tr === 0 && hole.r < 0.5) hole.r = 0;

  parallax.x += (parallax.tx - parallax.x) * (instant ? 0 : 0.06);
  parallax.y += (parallax.ty - parallax.y) * (instant ? 0 : 0.06);

  glass.style.setProperty("--hx", `${hole.x.toFixed(1)}px`);
  glass.style.setProperty("--hy", `${hole.y.toFixed(1)}px`);
  // 반지름 0인 그라디언트는 사파리에서 유리 전체를 지워 버리므로 최소 1px
  glass.style.setProperty("--hr", `${Math.max(hole.r, 1).toFixed(1)}px`);
  glass.classList.toggle("has-hole", hole.r > 2);
  glass.style.setProperty("--par-x", parallax.x.toFixed(4));
  glass.style.setProperty("--par-y", parallax.y.toFixed(4));
  glass.style.setProperty("--light-x", `${(30 - parallax.x * 26).toFixed(2)}%`);
  glass.style.setProperty("--light-y", `${(22 - parallax.y * 20).toFixed(2)}%`);
  scene.style.setProperty("--par-x", parallax.x.toFixed(4));
  scene.style.setProperty("--par-y", parallax.y.toFixed(4));

  requestAnimationFrame(animateGlass);
}

animateGlass();


/* =========================================
   COLLAPSE
   [ START ] → 이미지가 무너져 떨어지고 카메라가 따라 내려감
   → 투명한 선을 통과할 때마다 번쩍
   → 선 아래로 같은 번호의 fragment가 나와 바닥에 쌓임
========================================= */

const GRAVITY = 2400;           // px/s²
const CAMERA_DELAY = 0.1;       // 초. 이미지가 먼저 움직이고 카메라가 뒤따름
const CAMERA_DURATION = 1.2;    // 초. 인트로 → 선과 바닥이 보이는 곳까지
const MEMBRANE_DRAG = 0.4;      // 선을 통과하면서 느려지는 정도 (작을수록 많이 느려짐)
const FRAGMENT_SIZE = () => clamp(window.innerWidth * 0.0215, 18, 40); // fragment 최종 크기(px)
const PILE_OVERLAP = 0.7;       // 쌓일 때 겹치는 정도 (작을수록 촘촘하게 쌓임)
const BIN = 6;                  // 바닥 높이 계산 단위(px)
const REPOSE = 0.45;            // 더미가 버티는 경사 (클수록 뾰족하게, 작을수록 넓게 퍼짐)
const ROLL_SPEED = 260;         // 더미를 타고 굴러 내려가는 속도(px/s)

startButton.addEventListener("click", () => {
  if (isFalling) return;

  startCollapse();
});

// 뒤로 가기로 돌아왔을 때 무너진 상태로 남아 있지 않게
window.addEventListener("pageshow", (event) => {
  if (event.persisted) window.location.reload();
});

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function startCollapse() {
  isFalling = true;
  setActiveTile(null);

  const scrollStart = window.scrollY;
  document.body.classList.add("is-falling"); // 아래 공간(abyss)이 나타남

  /* ---------- 1. 세계 좌표 측정 ---------- */

  const lineY = portalLine.getBoundingClientRect().top + scrollStart;
  const layerWidth = fragmentLayer.clientWidth;
  const layerHeight = fragmentLayer.clientHeight;

  const cameraEnd = abyss.offsetTop + abyss.offsetHeight - window.innerHeight;

  // 타일은 선보다 위에서만 보이고, 선에 가까워질수록 막 속으로 스며들듯 흐려짐
  // (선 아래로는 fragment가 대신 번져 나옴)
  const sceneTop = scene.getBoundingClientRect().top + scrollStart;
  const clipY = lineY - sceneTop;
  const maskImage =
    `linear-gradient(to bottom, #000 calc(100vh + ${(clipY - 30).toFixed(1)}px), ` +
    `rgba(0, 0, 0, 0.4) calc(100vh + ${(clipY - 10).toFixed(1)}px), ` +
    `transparent calc(100vh + ${clipY.toFixed(1)}px))`;

  // 마스크를 창 밖까지 넓힐 수 없는 브라우저(사파리)는 선에서 곧게 자름
  // (선 위의 안개 막이 경계를 가려 줌)
  // (사파리는 no-clip을 지원한다고 답하지만 실제로는 창 밖을 잘라 버림)
  const isSafari = /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
  const softEdge = !isSafari && CSS.supports("mask-clip", "no-clip");
  if (!softEdge) {
    scene.style.clipPath =
      `polygon(-100vw -100vh, calc(100% + 100vw) -100vh, ` +
      `calc(100% + 100vw) ${clipY.toFixed(1)}px, -100vw ${clipY.toFixed(1)}px)`;
  }

  // 떨어지며 창 밖으로 벗어나는 타일도 보이도록 마스크를 넉넉하게
  if (softEdge) Object.assign(scene.style, {
    webkitMaskImage: maskImage,
    maskImage,
    webkitMaskSize: "calc(100% + 200vw) calc(100% + 200vh)",
    maskSize: "calc(100% + 200vw) calc(100% + 200vh)",
    webkitMaskPosition: "-100vw -100vh",
    maskPosition: "-100vw -100vh",
    webkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    webkitMaskClip: "no-clip",
    maskClip: "no-clip"
  });

  // 바닥의 높이 지도 (fragment가 쌓인 높이)
  const floor = new Float32Array(Math.ceil(layerWidth / BIN) + 1);

  /* ---------- 2. 타일마다 물리 정보 ---------- */

  const collapseCol = COLUMNS * (0.3 + Math.random() * 0.4);
  const spread = 20 / COLUMNS;          // 칸 수가 달라도 퍼지는 폭은 비슷하게
  const fragmentSize = FRAGMENT_SIZE();

  const bodies = [...grid.children].map((tile, index) => {
    const rect = tile.getBoundingClientRect();
    const col = Number(tile.dataset.col);
    const row = Number(tile.dataset.row);
    const side = (col - collapseCol) * spread;

    return {
      tile,
      piece: fragmentElements[index],
      state: "waiting", // waiting → falling → transit → fragment → (rolling) → resting

      w: rect.width,
      h: rect.height,
      baseX: rect.left + rect.width / 2,
      baseY: rect.top + scrollStart + rect.height / 2,

      x: 0,
      y: 0,
      rotation: 0,
      restRotation: 0,
      scale: 1,

      // 아래 줄부터, 무너진 지점에서 가까운 곳부터 차례로 떨어짐
      delay:
        ((ROWS - 1 - row) / (ROWS - 1)) * 0.68 +
        Math.abs(side) * 0.02 +
        Math.random() * 0.09,

      vx: side * 9 + (Math.random() - 0.5) * 120,
      vy: -Math.random() * 60,
      vr: side * 4 + (Math.random() - 0.5) * 320,

      wobble: (Math.random() - 0.5) * 5,
      fragmentScale: fragmentSize / rect.width
    };
  });

  /* ---------- 3. 도우미 ---------- */

  function halfExtents(body, rotation = body.rotation) {
    const angle = (rotation * Math.PI) / 180;
    const sin = Math.abs(Math.sin(angle));
    const cos = Math.abs(Math.cos(angle));
    const w = (body.w * body.scale) / 2;
    const h = (body.h * body.scale) / 2;

    return { hw: w * cos + h * sin, hh: w * sin + h * cos };
  }

  function binRange(centerX, halfWidth) {
    return [
      clamp(Math.floor((centerX - halfWidth) / BIN), 0, floor.length - 1),
      clamp(Math.floor((centerX + halfWidth) / BIN), 0, floor.length - 1)
    ];
  }

  // 가운데 60% 폭만 보고 높이를 정함 → 이웃 조각 사이로 살짝 파고들어 자연스럽게 겹침
  function surfaceUnder(centerX, halfWidth) {
    const [from, to] = binRange(centerX, halfWidth * 0.6);
    let top = 0;
    for (let k = from; k <= to; k++) top = Math.max(top, floor[k]);
    return top;
  }

  let energy = 0;

  function flashAt(x, width, silent) {
    energy = Math.min(energy + 0.3, 1.4);
    if (silent) return;

    const flash = document.createElement("span");
    flash.className = "portal-flash";
    flash.style.left = `${x.toFixed(1)}px`;
    flash.style.setProperty("--flash-w", `${Math.max(width * 1.6, 90).toFixed(0)}px`);
    flash.addEventListener("animationend", () => flash.remove());
    portalFlashes.appendChild(flash);
  }

  /* ---------- 4. 바닥에 닿았을 때 ---------- */

  function land(body) {
    const { hw, hh } = halfExtents(body);
    let centerX = body.baseX + body.x;

    // 좌우 벽
    if (centerX - hw < 0) {
      body.x += hw - centerX;
      body.vx = Math.abs(body.vx) * 0.4;
      centerX = hw;
    } else if (centerX + hw > layerWidth) {
      body.x -= centerX + hw - layerWidth;
      body.vx = -Math.abs(body.vx) * 0.4;
      centerX = layerWidth - hw;
    }

    const surface = surfaceUnder(centerX, hw);
    const restY = layerHeight - surface - hh; // fragment-layer 안에서의 중심 위치
    const localY = body.baseY + body.y - lineY;

    if (localY < restY || body.vy <= 0) return;

    body.y = restY + lineY - body.baseY;

    // 빠르게 떨어졌으면 한 번 튕김
    if (body.vy > 260) {
      body.vy *= -0.22;
      body.vx *= 0.6;
      body.vr *= -0.4;
      return;
    }

    // 경사가 가파르면 더미를 타고 아래로 굴러감
    const target = downhillFrom(centerX, hw);

    if (Math.abs(target - centerX) > BIN) {
      body.state = "rolling";
      body.targetX = target;
      body.vx = body.vy = body.vr = 0;
      return;
    }

    settle(body, centerX);
  }

  // 옆이 충분히 낮으면 그쪽으로 한 칸씩 내려감 (완만해지면 멈춤 → 둥근 더미)
  function downhillFrom(centerX, hw) {
    let x = centerX;
    let here = surfaceUnder(x, hw);

    for (let i = 0; i < 400; i++) {
      const leftX = clamp(x - BIN, hw, layerWidth - hw);
      const rightX = clamp(x + BIN, hw, layerWidth - hw);
      const left = surfaceUnder(leftX, hw);
      const right = surfaceUnder(rightX, hw);

      const goLeft = left < right || (left === right && Math.random() < 0.5);
      const nextX = goLeft ? leftX : rightX;
      const next = goLeft ? left : right;

      if (next > here - BIN * REPOSE) break;

      x = nextX;
      here = next;
    }

    return x;
  }

  function roll(body, dt) {
    const { hw, hh } = halfExtents(body);
    const centerX = body.baseX + body.x;
    const distance = body.targetX - centerX;
    const maxStep = ROLL_SPEED * dt;
    const step = Math.sign(distance) * Math.min(Math.abs(distance), maxStep);
    const newX = centerX + step;

    body.x += step;
    body.rotation += step * 1.4; // 구르면서 회전
    body.y = layerHeight - surfaceUnder(newX, hw) - hh + lineY - body.baseY;

    if (Math.abs(distance) <= maxStep) {
      // 도착하면 다시 확인 (그 사이 다른 조각이 쌓였을 수 있음)
      const next = downhillFrom(newX, hw);
      if (Math.abs(next - newX) > BIN) body.targetX = next;
      else settle(body, newX);
    }
  }

  // 자리 잡기: 비스듬히 기대어 멈춤
  function settle(body, centerX) {
    body.state = "resting";
    body.vx = body.vy = body.vr = 0;

    const nearest = Math.round(body.rotation / 90) * 90;
    body.restRotation = nearest + clamp(body.rotation - nearest, -14, 14);

    // 바닥 높이 갱신: 가운데가 높고 가장자리가 낮은 둥근 모양
    const rest = halfExtents(body, body.restRotation);
    const surface = surfaceUnder(centerX, rest.hw);
    const [from, to] = binRange(centerX, rest.hw);
    const peak = rest.hh * 2 * PILE_OVERLAP;

    for (let k = from; k <= to; k++) {
      const offset = ((k + 0.5) * BIN - centerX) / rest.hw;
      const height = surface + peak * (1 - 0.7 * offset * offset);
      floor[k] = Math.max(floor[k], height);
    }
  }

  /* ---------- 5. 물리 한 스텝 ---------- */

  let elapsed = 0;

  function simulate(dt, silent) {
    elapsed += dt;
    let active = 0;

    bodies.forEach((body) => {
      if (body.state === "resting") {
        // 멈춘 뒤 기울기만 부드럽게 정리
        body.rotation += (body.restRotation - body.rotation) * Math.min(1, dt * 10);
        return;
      }

      active++;

      if (body.state === "rolling") {
        roll(body, dt);
        return;
      }

      if (body.state === "waiting") {
        const untilFall = body.delay - elapsed;

        if (untilFall > 0) {
          // 떨어지기 직전: 블록이 불안하게 흔들림
          if (untilFall < 0.18) {
            body.rotation = Math.sin(elapsed * 55) * body.wobble * (1 - untilFall / 0.18);
          }
          return;
        }

        body.state = "falling";
      }

      body.vy += GRAVITY * dt;
      body.x += body.vx * dt;
      body.y += body.vy * dt;
      body.vr *= body.state === "fragment" ? 0.985 : 0.995;
      body.rotation += body.vr * dt;

      const centerY = body.baseY + body.y;
      const { hh } = halfExtents(body);

      // 선에 닿는 순간: 번쩍 + fragment 등장
      if (body.state === "falling" && centerY + hh >= lineY) {
        body.state = "transit";
        body.piece.classList.add("is-visible");
        flashAt(body.baseX + body.x, body.w, silent);
      }

      // 완전히 통과: 타일은 사라지고 fragment만 남아 느려짐
      if (body.state === "transit" && centerY - hh >= lineY) {
        body.state = "fragment";
        body.tile.style.visibility = "hidden";
        body.vy *= MEMBRANE_DRAG;
        body.vx *= 0.6;
        body.vr *= 0.5;
      }

      if (body.state === "fragment") {
        body.scale += (body.fragmentScale - body.scale) * Math.min(1, dt * 6);
        land(body);
      }
    });

    energy *= Math.pow(0.03, dt);
    return active;
  }

  /* ---------- 6. 그리기 ---------- */

  function render() {
    const progress = clamp((elapsed - CAMERA_DELAY) / CAMERA_DURATION, 0, 1);
    const cameraY = scrollStart + (cameraEnd - scrollStart) * easeInOutCubic(progress);
    world.style.transform = `translate3d(0, ${(scrollStart - cameraY).toFixed(1)}px, 0)`;

    portalLine.style.setProperty("--energy", energy.toFixed(3));

    bodies.forEach((body) => {
      const transform =
        `rotate(${body.rotation.toFixed(2)}deg)`;

      if (body.state === "waiting" || body.state === "falling" || body.state === "transit") {
        body.tile.style.transform =
          `translate3d(${body.x.toFixed(1)}px, ${body.y.toFixed(1)}px, 0) ${transform}`;
      }

      if (body.state !== "waiting" && body.state !== "falling") {
        const left = body.baseX + body.x - body.w / 2;
        const top = body.baseY + body.y - lineY - body.h / 2;

        body.piece.style.width = `${body.w}px`;
        body.piece.style.height = `${body.h}px`;
        body.piece.style.transform =
          `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0) ` +
          `${transform} scale(${body.scale.toFixed(3)})`;
      }
    });
  }

  function finish() {
    // 다음 단계(builder.js)가 쌓인 조각을 그대로 이어받을 수 있도록 알림
    document.dispatchEvent(new CustomEvent("garden:landed", {
      detail: {
        pieces: bodies.map((body) => ({
          element: body.piece,
          rotation: body.rotation,
          width: body.w * body.scale,
          height: body.h * body.scale
        }))
      }
    }));
  }

  /* ---------- 7. 실행 ---------- */

  // 동작 줄이기 설정: 애니메이션 없이 결과(쌓인 상태)만 바로 보여줌
  if (reduceMotion.matches) {
    for (let i = 0; i < 60 * 20 && simulate(1 / 60, true) > 0; i++);
    elapsed = CAMERA_DELAY + CAMERA_DURATION;
    energy = 0;
    bodies.forEach((body) => { body.rotation = body.restRotation; });
    render();
    finish();
    return;
  }

  let lastTime = performance.now();
  let settledAt = null;

  function frame(now) {
    const dt = Math.min((now - lastTime) / 1000, 1 / 30);
    lastTime = now;

    const active = simulate(dt, false);
    render();

    // 모두 자리 잡고 기울기 정리까지 끝나면 멈춤
    if (active === 0 && elapsed > CAMERA_DELAY + CAMERA_DURATION) {
      settledAt ??= elapsed;
      if (elapsed - settledAt > 0.6) {
        finish();
        return;
      }
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
