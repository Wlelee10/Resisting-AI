/* =========================================
   BUILD YOUR OWN GARDEN
   RESULT
   FINISH → 완성한 정원 / AI LIBRARY / HUMAN GALLERY (파일 인덱스)
========================================= */

(() => {
  const result = document.querySelector("#result");
  if (!result) return;

  const $ = (selector) => result.querySelector(selector);

  const folders = [...result.querySelectorAll(".folder")];
  const resultCanvas = $("#resultCanvas");
  const titleInput = $("#gardenTitle");
  const resultTime = $("#resultTime");
  const resultTotal = $("#resultTotal");
  const resultSelected = $("#resultSelected");
  const resultRejected = $("#resultRejected");
  const saveButton = $("#saveButton");
  const saveNote = $("#saveNote");
  const aiLibraryGrid = $("#aiLibraryGrid");
  const galleryGrid = $("#galleryGrid");
  const galleryEmpty = $("#galleryEmpty");
  const saveDialog = $("#saveDialog");
  const dialogClose = $("#dialogClose");
  const downloadButton = $("#downloadButton");
  const viewGalleryButton = $("#viewGalleryButton");
  const backButton = $("#backButton");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
  const POLL_MS = 5000;           // 휴먼 갤러리 새로고침 간격 (다른 사람이 저장한 정원)
  const LOCAL_KEY = "byog-gardens";

  let finished = null;            // builder.js가 넘겨준 결과
  let stageClone = null;
  let activeTab = "build";
  let savedEntry = null;
  let savedBlob = null;
  let pollTimer = null;
  let hideBuilderTimer = null;
  let arriveTimer = null;

  const pad2 = (n) => String(n).padStart(2, "0");

  function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = pad2(Math.floor((seconds % 3600) / 60));
    const rest = pad2(seconds % 60);
    return hours ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`;
  }

  /* =========================================
     STORE
     config.js에 Supabase가 설정되어 있으면 → 모든 방문자가 같은 휴먼 갤러리 (GitHub Pages에서도)
     아니면 server.py로 열었을 때 → 그 서버를 함께 씀
     둘 다 아니면 → 이 브라우저 안에만 저장
  ========================================= */

  const cloud = window.GARDEN_CLOUD ?? {};
  const cloudBase = String(cloud.url ?? "").trim().replace(/\/+$/, "");
  const cloudKey = String(cloud.key ?? "").trim();
  const CLOUD_BUCKET = "gardens";

  const cloudHeaders = (extra = {}) => ({ apikey: cloudKey, Authorization: `Bearer ${cloudKey}`, ...extra });
  const cloudImage = (file) => `${cloudBase}/storage/v1/object/public/${CLOUD_BUCKET}/${encodeURIComponent(file)}`;
  const fromCloud = (row) => ({
    id: String(row.id),
    title: row.title,
    fragments: row.fragments,
    seconds: row.seconds,
    image: cloudImage(row.image),
    createdAt: Date.parse(row.created_at)
  });

  function newFileName() {
    const id = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return `${id}.jpg`;
  }

  // 제목 없이 저장된 정원을 한 번 정리 (이 브라우저에 저장된 것)
  try {
    const PURGED_KEY = "byog-untitled-purged";
    if (!localStorage.getItem(PURGED_KEY)) {
      const list = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]");
      const kept = list.filter((entry) => String(entry.title ?? "").trim() && entry.title !== "UNTITLED GARDEN");
      if (kept.length !== list.length) localStorage.setItem(LOCAL_KEY, JSON.stringify(kept));
      localStorage.setItem(PURGED_KEY, "1");
    }
  } catch {
    // 저장소를 쓸 수 없으면 건너뜀
  }

  const store = {
    mode: null,

    async detect() {
      if (this.mode) return this.mode;
      if (cloudBase && cloudKey) {
        this.mode = "cloud";
        return this.mode;
      }
      try {
        const response = await fetch("api/gardens", { cache: "no-store" });
        const type = response.headers.get("content-type") ?? "";
        this.mode = response.ok && type.includes("json") ? "server" : "local";
      } catch {
        this.mode = "local";
      }
      return this.mode;
    },

    async list() {
      if ((await this.detect()) === "cloud") {
        const response = await fetch(
          `${cloudBase}/rest/v1/gardens?select=id,title,fragments,seconds,image,created_at&order=created_at.asc`,
          { headers: cloudHeaders(), cache: "no-store" }
        );
        if (!response.ok) throw new Error("Could not load the gallery.");
        return (await response.json()).map(fromCloud);
      }
      if (this.mode === "server") {
        const response = await fetch("api/gardens", { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load the gallery.");
        return response.json();
      }
      try {
        return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]");
      } catch {
        return [];
      }
    },

    async save(entry, board) {
      if ((await this.detect()) === "cloud") {
        // 1. 이미지 올리기 (1600px JPEG — 화질은 유지하면서 가볍게)
        const blob = await new Promise((resolve) => board.toBlob(resolve, "image/jpeg", 0.92));
        const file = newFileName();
        const upload = await fetch(`${cloudBase}/storage/v1/object/${CLOUD_BUCKET}/${file}`, {
          method: "POST",
          headers: cloudHeaders({ "Content-Type": "image/jpeg", "x-upsert": "false" }),
          body: blob
        });
        if (!upload.ok) throw new Error("The garden image could not be uploaded.");

        // 2. 목록에 한 줄 추가
        const insert = await fetch(`${cloudBase}/rest/v1/gardens`, {
          method: "POST",
          headers: cloudHeaders({ "Content-Type": "application/json", Prefer: "return=representation" }),
          body: JSON.stringify({
            title: entry.title,
            fragments: entry.fragments,
            seconds: entry.seconds,
            image: file
          })
        });
        if (!insert.ok) throw new Error("The garden could not be saved.");
        const [row] = await insert.json();
        return fromCloud(row);
      }

      if (this.mode === "server") {
        const response = await fetch("api/gardens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...entry, image: board.toDataURL("image/png") })
        });
        if (!response.ok) throw new Error("The garden could not be saved.");
        return response.json();
      }

      // 이 브라우저에만: 용량을 줄인 JPEG로 저장
      const small = document.createElement("canvas");
      small.width = 720;
      small.height = 720;
      small.getContext("2d").drawImage(board, 0, 0, 720, 720);

      const saved = {
        ...entry,
        id: `local-${Date.now()}`,
        image: small.toDataURL("image/jpeg", 0.86),
        createdAt: Date.now()
      };

      const list = await this.list();
      list.push(saved);
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
      } catch {
        throw new Error("Browser storage is full.");
      }
      return saved;
    }
  };

  /* =========================================
     ENTER: 빌더의 캔버스가 폴더 속 자리로 날아감
  ========================================= */

  document.addEventListener("garden:finished", (event) => {
    finished = event.detail;

    const sourceRect = finished.canvas.getBoundingClientRect();

    // 캔버스 내용 그대로 복제 (자르기 중 흔적은 제외) — 다시 FINISH하면 새로 복제
    stageClone?.remove();
    stageClone = finished.canvas.querySelector(".canvas-stage").cloneNode(true);
    stageClone.removeAttribute("id");
    stageClone.querySelectorAll(".crop-ghost, .cut-ghost").forEach((ghost) => ghost.remove());
    stageClone.querySelectorAll(".canvas-item").forEach((item) => {
      item.classList.remove("is-lifted");
      item.removeAttribute("data-uid");
      item.style.clipPath = "";
    });
    resultCanvas.style.backgroundColor = finished.background;
    resultCanvas.appendChild(stageClone);

    // 숫자 (멈춘 값)
    resultTime.textContent = finished.time || formatTime(finished.seconds);
    resultTotal.textContent = finished.total;
    resultSelected.textContent = pad2(finished.fragments);
    resultRejected.textContent = pad2(finished.total - finished.fragments);

    // 항상 BUILD 폴더가 앞에서 시작
    activeTab = "build";
    folders.forEach((folder) => folder.classList.toggle("is-active", folder.dataset.folder === "build"));
    stopGallery();
    backButton.hidden = Boolean(savedEntry);

    result.hidden = false;
    result.classList.remove("is-returning");
    fitStage();
    buildLibrary();
    store.detect();

    const targetRect = resultCanvas.getBoundingClientRect();
    const quick = reduceMotion.matches;

    // 빌더는 사라지고, 폴더와 글자가 캔버스 주변으로 서서히 나타남
    // (캔버스는 날아가는 중에도 보여야 하므로 바탕과 글자만 흐리게 시작)
    // 앞 폴더가 다 채워질 때까지 뒤 폴더(AI LIBRARY 등)는 비치지 않게 숨김
    finished.builder.classList.remove("is-returning");
    finished.builder.classList.add("is-leaving");
    result.classList.add("is-entering", "is-arriving");
    result.offsetWidth;
    requestAnimationFrame(() => result.classList.remove("is-entering"));

    clearTimeout(arriveTimer);
    arriveTimer = setTimeout(() => result.classList.remove("is-arriving"), quick ? 0 : 1300);

    // 캔버스: 빌더 자리 → 폴더 속 자리 (FLIP)
    flyCanvas(sourceRect, targetRect, false);

    clearTimeout(hideBuilderTimer);
    hideBuilderTimer = setTimeout(() => {
      finished.builder.hidden = true;
    }, quick ? 0 : 900);
  });

  // from/to 화면 위치 사이를 캔버스가 날아감 (back = 빌더로 돌아가는 방향)
  function flyCanvas(sourceRect, targetRect, back) {
    const quick = reduceMotion.matches;
    const dx = sourceRect.left - targetRect.left;
    const dy = sourceRect.top - targetRect.top;
    const scale = sourceRect.width / targetRect.width;
    const away = `translate(${dx}px, ${dy}px) scale(${scale})`;
    const frames = [
      { transform: away, boxShadow: "0 0 0 rgba(0,0,0,0)" },
      { transform: "none", boxShadow: "0 30px 50px -40px rgba(0,0,0,0.35)" }
    ];

    return resultCanvas.animate(back ? frames.reverse() : frames, {
      duration: quick ? 1 : back ? 900 : 1100,
      easing: EASE,
      fill: back ? "forwards" : "none"
    });
  }

  /* =========================================
     BACK TO CANVAS
     저장하기 전까지는 캔버스로 돌아가 이어서 수정할 수 있음
  ========================================= */

  backButton.addEventListener("click", () => {
    if (!finished || savedEntry || result.classList.contains("is-returning")) return;

    const quick = reduceMotion.matches;
    const builder = finished.builder;
    const fromRect = resultCanvas.getBoundingClientRect();

    // BUILD 폴더를 앞으로 (다른 탭을 보고 있었다면)
    activeTab = "build";
    folders.forEach((folder) => folder.classList.toggle("is-active", folder.dataset.folder === "build"));
    stopGallery();
    closeDialog();

    // 빌더를 다시 보이게 하고 캔버스 자리를 잼
    clearTimeout(hideBuilderTimer);
    builder.hidden = false;
    builder.classList.add("is-returning");
    builder.offsetWidth;
    builder.classList.remove("is-leaving");
    const toRect = finished.canvas.getBoundingClientRect();

    result.classList.add("is-returning");
    const flight = flyCanvas(toRect, fromRect, true);

    // 애니메이션이 끝나면(또는 탭이 가려져 멈춰 있어도 시간이 지나면) 한 번만 마무리
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      result.hidden = true;
      result.classList.remove("is-returning");
      flight.cancel();
      builder.classList.remove("is-returning");
      document.dispatchEvent(new CustomEvent("garden:resume"));
    };

    flight.finished.then(finish, finish);
    setTimeout(finish, quick ? 0 : 1000);
  });

  // 복제한 1000×1000 캔버스를 자리 크기에 맞춤
  function fitStage() {
    if (!stageClone) return;
    const size = resultCanvas.clientWidth;
    stageClone.style.transform = `scale(${size / 1000})`;
  }

  new ResizeObserver(fitStage).observe(resultCanvas);

  /* =========================================
     FOLDER TABS
     마우스를 올리면 파일이 살짝 올라오고,
     누르면 위로 꺼냈다가 맨 앞에 꽂힘
  ========================================= */

  function showTab(name) {
    if (name === activeTab) return;

    const next = folders.find((folder) => folder.dataset.folder === name);
    const quick = reduceMotion.matches;
    activeTab = name;

    // 꺼내는 동안 뒤에 있다가 가장 높이 올라왔을 때 맨 앞으로
    next.classList.add("is-pulling");
    next.animate(
      [
        { transform: "translateY(-10px)" },
        { transform: "translateY(-46px)", offset: 0.42 },
        { transform: "translateY(0)" }
      ],
      { duration: quick ? 1 : 620, easing: "cubic-bezier(0.45, 0, 0.2, 1)" }
    );

    setTimeout(() => {
      folders.forEach((folder) => folder.classList.toggle("is-active", folder === next));
      next.classList.remove("is-pulling");
    }, quick ? 0 : 250);

    if (name === "gallery") startGallery();
    else stopGallery();
  }

  folders.forEach((folder) => {
    folder.querySelector(".folder-tab").addEventListener("click", () => showTab(folder.dataset.folder));
  });

  /* =========================================
     AI LIBRARY: #01 ~ #200 + 파일 이름
  ========================================= */

  let libraryBuilt = false;

  function buildLibrary() {
    if (libraryBuilt) return;
    libraryBuilt = true;

    const types = typeof gardenTypes !== "undefined" ? gardenTypes : [];
    const fragment = document.createDocumentFragment();
    let number = 1;

    types.forEach((type) => {
      for (let i = 0; i < 4; i++) {
        const label = number < 100 ? pad2(number) : String(number);
        const name = `${type}_garden`;
        fragment.appendChild(makeCard({
          src: `images-medium/${encodeURIComponent(`#${label} ${name}.jpg`)}`,
          alt: `${name.replaceAll("_", " ")} ${label}`,
          lines: [`#${label}`, name]
        }));
        number++;
      }
    });

    aiLibraryGrid.appendChild(fragment);
  }

  function makeCard({ src, alt, lines, id, lazy = true }) {
    const card = document.createElement("figure");
    card.className = "card";
    if (id) card.dataset.id = id;

    const frame = document.createElement("div");
    frame.className = "card-image";

    const image = document.createElement("img");
    image.src = src;
    image.alt = alt;
    image.loading = lazy ? "lazy" : "eager";
    image.decoding = "async";
    image.draggable = false;
    image.addEventListener("load", () => card.classList.add("is-loaded"), { once: true });
    if (image.complete && image.naturalWidth) card.classList.add("is-loaded");

    const caption = document.createElement("figcaption");
    lines.forEach((line) => {
      const row = document.createElement("span");
      row.textContent = line; // 제목은 사용자 입력 → 글자로만 넣음
      caption.appendChild(row);
    });

    frame.appendChild(image);
    card.append(frame, caption);
    return card;
  }

  /* =========================================
     HUMAN GALLERY
     저장된 순서대로. 다른 사람이 저장하면 몇 초 안에 나타남
  ========================================= */

  const shownGardens = new Set();

  async function refreshGallery() {
    let list;
    try {
      list = await store.list();
    } catch {
      return;
    }

    list.forEach((entry) => {
      if (shownGardens.has(entry.id)) return;
      shownGardens.add(entry.id);

      const card = makeCard({
        id: entry.id,
        src: entry.image,
        alt: entry.title,
        lazy: false,
        lines: [entry.title, `${entry.fragments} /200 fragments`, formatTime(entry.seconds)]
      });
      if (savedEntry && entry.id === savedEntry.id) card.classList.add("is-mine");
      galleryGrid.appendChild(card);
    });

    galleryEmpty.hidden = shownGardens.size > 0;
  }

  function startGallery() {
    refreshGallery();
    clearInterval(pollTimer);
    pollTimer = setInterval(refreshGallery, POLL_MS);
  }

  function stopGallery() {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  // 다른 탭을 보다가 돌아왔을 때 바로 새로고침
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && activeTab === "gallery") refreshGallery();
  });

  /* =========================================
     TITLE
  ========================================= */

  // 입력한 글자 길이에 맞춰 괄호가 따라오도록
  const measure = document.createElement("canvas").getContext("2d");

  function fitTitle() {
    const style = getComputedStyle(titleInput);
    measure.font = `${style.fontSize} ${style.fontFamily}`;
    const text = (titleInput.value || titleInput.placeholder).toUpperCase();
    const spacing = parseFloat(style.letterSpacing) || 0;
    const width = measure.measureText(text).width + spacing * text.length + 4;
    titleInput.style.width = `${Math.ceil(width)}px`;
  }

  titleInput.addEventListener("input", fitTitle);
  titleInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") titleInput.blur();
  });
  fitTitle();

  /* =========================================
     SAVE & SHARE
  ========================================= */

  const gardenTitle = () => titleInput.value.trim().toUpperCase() || "UNTITLED GARDEN";

  async function toBlob(board) {
    return new Promise((resolve, reject) => {
      try {
        board.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("empty"))), "image/png");
      } catch (error) {
        reject(error);
      }
    });
  }

  saveButton.addEventListener("click", async () => {
    if (!finished || savedEntry || saveButton.disabled) return;

    saveButton.disabled = true;
    backButton.disabled = true;
    saveButton.textContent = "SAVING…";
    saveNote.textContent = "";

    try {
      const board = await finished.render(1600);
      savedBlob = await toBlob(board); // file:// 로 열면 여기서 막힘

      savedEntry = await store.save({
        title: gardenTitle(),
        fragments: finished.fragments,
        seconds: finished.seconds
      }, board);

      titleInput.value = savedEntry.title;
      titleInput.readOnly = true;
      backButton.hidden = true;
      fitTitle();
      saveButton.textContent = "SAVED";
      saveButton.classList.add("is-saved");
      if (store.mode === "local") saveNote.textContent = "Saved in this browser only.";
      openDialog();
    } catch (error) {
      saveButton.disabled = false;
      backButton.disabled = false;
      saveButton.textContent = "SAVE & SHARE";
      saveNote.textContent = error?.name === "SecurityError"
        ? "Open the site through server.py to save."
        : error?.message || "The garden could not be saved.";
    }
  });

  /* ---------- 저장 완료 팝업 ---------- */

  function openDialog() {
    saveDialog.hidden = false;
    saveDialog.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "ease" });
    saveDialog.firstElementChild.animate(
      [{ opacity: 0, transform: "translateY(12px) scale(0.97)" }, { opacity: 1, transform: "none" }],
      { duration: 420, easing: EASE }
    );
    downloadButton.focus();
  }

  function closeDialog() {
    saveDialog.hidden = true;
  }

  dialogClose.addEventListener("click", closeDialog);
  saveDialog.addEventListener("click", (event) => {
    if (event.target === saveDialog) closeDialog();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !saveDialog.hidden) closeDialog();
  });

  downloadButton.addEventListener("click", () => {
    if (!savedBlob) return;
    const link = document.createElement("a");
    const name = gardenTitle().toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-|-$/g, "") || "garden";
    link.href = URL.createObjectURL(savedBlob);
    link.download = `${name}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });

  viewGalleryButton.addEventListener("click", async () => {
    closeDialog();
    showTab("gallery");
    await refreshGallery();

    // 내 정원으로 스크롤해서 표시
    const mine = galleryGrid.querySelector(`[data-id="${CSS.escape(savedEntry.id)}"]`);
    if (mine) {
      mine.classList.add("is-mine");
      setTimeout(() => mine.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "center" }), 450);
    }
  });
})();
