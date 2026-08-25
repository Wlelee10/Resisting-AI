// =========================================
// BASIC SCREEN CONTROL
// =========================================

const loadingScreen = document.querySelector("#loading-screen");
const galleryScreen = document.querySelector("#gallery-screen");
const builderScreen = document.querySelector("#builder-screen");
const resultScreen = document.querySelector("#result-screen");

const screens = [
  loadingScreen,
  galleryScreen,
  builderScreen,
  resultScreen
];

function showScreen(screen) {

  screens.forEach((item) => {
    item.classList.remove("active");
  });

  screen.classList.add("active");
}


// =========================================
// LOADING SCREEN
// =========================================

const loadingNumber = document.querySelector("#loading-number");

let loadingProgress = 0;


// fake AI generation loading
const loadingInterval = setInterval(() => {

  loadingProgress++;

  loadingNumber.textContent = `${loadingProgress} / 50`;

  if (loadingProgress >= 50) {

    clearInterval(loadingInterval);

    setTimeout(() => {

      showScreen(galleryScreen);

    }, 500);

  }

}, 45);


// =========================================
// CREATE 50 FAKE AI GARDENS
// =========================================

const gardenGallery = document.querySelector("#garden-gallery");

for (let i = 1; i <= 50; i++) {

  const garden = document.createElement("div");

  garden.classList.add("garden-box");


  // random visual differences

  garden.style.setProperty(
    "--x",
    Math.floor(Math.random() * 60) + "%"
  );

  garden.style.setProperty(
    "--y",
    Math.floor(Math.random() * 60) + "%"
  );

  garden.style.setProperty(
    "--radius",
    Math.random() > 0.5 ? "50%" : "0%"
  );

  garden.style.setProperty(
    "--rotation",
    Math.floor(Math.random() * 180) + "deg"
  );


  const number = document.createElement("span");

  number.classList.add("garden-number");

  number.textContent = i;


  garden.appendChild(number);

  gardenGallery.appendChild(garden);
}


// =========================================
// START BUTTON
// =========================================

const startButton = document.querySelector("#start-button");

startButton.addEventListener("click", () => {

  showScreen(builderScreen);

});


// =========================================
// CREATE 100 FRAGMENTS
// =========================================

const fragmentPile = document.querySelector("#fragment-pile");

const shapeTypes = [
  "circle",
  "rectangle",
  "oval",
  "triangle",
  "blob"
];

let selectedFragment = null;

let highestZ = 10;

let selectedTotal = 0;

let deletedTotal = 0;


for (let i = 0; i < 100; i++) {

  const fragment = document.createElement("div");

  const randomShape =
    shapeTypes[
      Math.floor(
        Math.random() * shapeTypes.length
      )
    ];

  fragment.classList.add(
    "fragment",
    randomShape
  );

  fragment.dataset.used = "false";

  fragment.dataset.rotation = "0";

  fragment.dataset.scale = "1";


  // pile them near the bottom

  const x =
    Math.random() *
    (window.innerWidth - 80);

  const y =
    45 +
    Math.random() * 75;


  fragment.style.left = `${x}px`;

  fragment.style.top = `${y}px`;


  fragmentPile.appendChild(fragment);


  makeDraggable(fragment);
}


// =========================================
// SELECT FRAGMENT
// =========================================

function selectFragment(fragment) {

  if (selectedFragment) {

    selectedFragment.classList.remove(
      "selected"
    );

  }

  selectedFragment = fragment;

  selectedFragment.classList.add(
    "selected"
  );


  highestZ++;

  selectedFragment.style.zIndex =
    highestZ;

}


// =========================================
// DRAGGING
// =========================================

function makeDraggable(fragment) {

  fragment.addEventListener(
    "pointerdown",
    function (event) {

      event.preventDefault();

      selectFragment(fragment);


      const startX = event.clientX;

      const startY = event.clientY;


      const rect =
        fragment.getBoundingClientRect();


      const originalLeft = rect.left;

      const originalTop = rect.top;


      fragment.setPointerCapture(
        event.pointerId
      );


      function move(event) {

        const dx =
          event.clientX - startX;

        const dy =
          event.clientY - startY;


        const newX =
          originalLeft + dx;

        const newY =
          originalTop + dy;


        fragment.style.position =
          "fixed";

        fragment.style.left =
          `${newX}px`;

        fragment.style.top =
          `${newY}px`;

      }


      function end(event) {

        fragment.releasePointerCapture(
          event.pointerId
        );


        document.removeEventListener(
          "pointermove",
          move
        );

        document.removeEventListener(
          "pointerup",
          end
        );


        checkIfInsideCanvas(fragment);

      }


      document.addEventListener(
        "pointermove",
        move
      );

      document.addEventListener(
        "pointerup",
        end
      );

    }
  );

}


// =========================================
// CHECK IF FRAGMENT IS INSIDE CANVAS
// =========================================

function checkIfInsideCanvas(fragment) {

  const canvas =
    document.querySelector("#canvas");


  const fragmentRect =
    fragment.getBoundingClientRect();

  const canvasRect =
    canvas.getBoundingClientRect();


  const centerX =
    fragmentRect.left +
    fragmentRect.width / 2;

  const centerY =
    fragmentRect.top +
    fragmentRect.height / 2;


  const inside =
    centerX > canvasRect.left &&
    centerX < canvasRect.right &&
    centerY > canvasRect.top &&
    centerY < canvasRect.bottom;


  if (
    inside &&
    fragment.dataset.used === "false"
  ) {

    fragment.dataset.used = "true";

    selectedTotal++;

    updateStatistics();

  }

}


// =========================================
// TOOL BUTTONS
// =========================================

const rotateLeft =
  document.querySelector("#rotate-left");

const rotateRight =
  document.querySelector("#rotate-right");

const smaller =
  document.querySelector("#smaller");

const bigger =
  document.querySelector("#bigger");

const front =
  document.querySelector("#front");

const deleteButton =
  document.querySelector("#delete");


// ROTATE LEFT

rotateLeft.addEventListener("click", () => {

  if (!selectedFragment) return;


  let rotation =
    Number(
      selectedFragment.dataset.rotation
    );

  rotation -= 15;


  selectedFragment.dataset.rotation =
    rotation;

  updateTransform();

});


// ROTATE RIGHT

rotateRight.addEventListener("click", () => {

  if (!selectedFragment) return;


  let rotation =
    Number(
      selectedFragment.dataset.rotation
    );

  rotation += 15;


  selectedFragment.dataset.rotation =
    rotation;

  updateTransform();

});


// SMALLER

smaller.addEventListener("click", () => {

  if (!selectedFragment) return;


  let scale =
    Number(
      selectedFragment.dataset.scale
    );

  scale -= 0.1;

  scale = Math.max(0.3, scale);


  selectedFragment.dataset.scale =
    scale;

  updateTransform();

});


// BIGGER

bigger.addEventListener("click", () => {

  if (!selectedFragment) return;


  let scale =
    Number(
      selectedFragment.dataset.scale
    );

  scale += 0.1;

  scale = Math.min(4, scale);


  selectedFragment.dataset.scale =
    scale;

  updateTransform();

});


// BRING TO FRONT

front.addEventListener("click", () => {

  if (!selectedFragment) return;


  highestZ++;

  selectedFragment.style.zIndex =
    highestZ;

});


// DELETE

deleteButton.addEventListener("click", () => {

  if (!selectedFragment) return;


  if (
    selectedFragment.dataset.used === "true"
  ) {

    deletedTotal++;

  }


  selectedFragment.remove();

  selectedFragment = null;

  updateStatistics();

});


// =========================================
// UPDATE TRANSFORM
// =========================================

function updateTransform() {

  if (!selectedFragment) return;


  const rotation =
    selectedFragment.dataset.rotation;

  const scale =
    selectedFragment.dataset.scale;


  selectedFragment.style.transform =
    `rotate(${rotation}deg) scale(${scale})`;

}


// =========================================
// STATISTICS
// =========================================

const selectedCount =
  document.querySelector("#selected-count");

const deletedCount =
  document.querySelector("#deleted-count");


function updateStatistics() {

  selectedCount.textContent =
    `${selectedTotal} SELECTED`;

  deletedCount.textContent =
    `${deletedTotal} DELETED`;

}


// =========================================
// FINISH
// =========================================

const finishButton =
  document.querySelector("#finish-button");

const finalGarden =
  document.querySelector("#final-garden");

const finalSelected =
  document.querySelector("#final-selected");

const finalDeleted =
  document.querySelector("#final-deleted");


finishButton.addEventListener("click", () => {

  buildFinalGarden();

  finalSelected.textContent =
    selectedTotal;

  finalDeleted.textContent =
    deletedTotal;


  showScreen(resultScreen);

});


// =========================================
// COPY GARDEN INTO RESULT
// =========================================

function buildFinalGarden() {

  finalGarden.innerHTML = "";


  const canvas =
    document.querySelector("#canvas");

  const canvasRect =
    canvas.getBoundingClientRect();


  const usedFragments =
    document.querySelectorAll(
      '.fragment[data-used="true"]'
    );


  usedFragments.forEach((fragment) => {

    const rect =
      fragment.getBoundingClientRect();


    const clone =
      fragment.cloneNode(true);


    clone.classList.remove(
      "selected"
    );


    clone.style.position =
      "absolute";


    // convert screen position into
    // percentage position

    const x =
      (
        (rect.left - canvasRect.left) /
        canvasRect.width
      ) * 100;

    const y =
      (
        (rect.top - canvasRect.top) /
        canvasRect.height
      ) * 100;


    clone.style.left =
      `${x}%`;

    clone.style.top =
      `${y}%`;


    clone.style.pointerEvents =
      "none";


    finalGarden.appendChild(clone);

  });

}


// =========================================
// RESTART
// =========================================

const restartButton =
  document.querySelector("#restart-button");


restartButton.addEventListener("click", () => {

  location.reload();

});