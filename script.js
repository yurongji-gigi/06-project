const GAME_SECONDS = 30;
const TARGET_SCORE = 100;
const DROP_INTERVAL = 650;
const DROP_SPEED = 150;

let gameRunning = false;
let score = 0;
let timeLeft = GAME_SECONDS;
let dropMaker;
let countdown;
let animationFrame;
let endTime;
let lastFrameTime = 0;
let playerX = 0;
let pointerActive = false;

const gameContainer = document.getElementById("game-container");
const dropLayer = document.getElementById("drop-layer");
const player = document.getElementById("player");
const startScreen = document.getElementById("start-screen");
const gameScreen = document.getElementById("game-screen");
const resultScreen = document.getElementById("result-screen");
const scoreDisplay = document.getElementById("score");
const timeDisplay = document.getElementById("time");
const progressLabel = document.getElementById("progress-label");
const progressRemaining = document.getElementById("progress-remaining");
const progress = document.getElementById("progress");
const startButton = document.getElementById("start-btn");
const resetButton = document.getElementById("reset-btn");
const replayButton = document.getElementById("replay-btn");
const resultTitle = document.getElementById("result-title");
const resultText = document.getElementById("result-text");
const finalScore = document.getElementById("final-score");
const resultBadge = document.getElementById("result-badge");
const status = document.getElementById("status");
const confettiLayer = document.getElementById("confetti-layer");

startButton.addEventListener("click", startGame);
resetButton.addEventListener("click", resetGame);
replayButton.addEventListener("click", startGame);
gameContainer.addEventListener("pointerdown", handlePointerStart);
gameContainer.addEventListener("pointermove", handlePointerMove);
gameContainer.addEventListener("pointerup", releasePointer);
gameContainer.addEventListener("pointercancel", releasePointer);
document.addEventListener("keydown", handleKeydown);

function updateDisplay() {
  scoreDisplay.textContent = score;
  timeDisplay.textContent = timeLeft;
  progress.value = Math.min(score, TARGET_SCORE);
  progressLabel.textContent = `${score} / ${TARGET_SCORE}`;
  progressRemaining.textContent = `${Math.max(0, TARGET_SCORE - score)} pts to go`;
}

function stopGameLoops() {
  clearInterval(dropMaker);
  clearInterval(countdown);
  cancelAnimationFrame(animationFrame);
  dropMaker = null;
  countdown = null;
  animationFrame = null;
}

function startGame() {
  if (gameRunning) return;

  stopGameLoops();
  dropLayer.replaceChildren();
  confettiLayer.replaceChildren();
  score = 0;
  timeLeft = GAME_SECONDS;
  gameRunning = true;
  endTime = Date.now() + GAME_SECONDS * 1000;
  lastFrameTime = performance.now();
  startScreen.hidden = true;
  resultScreen.hidden = true;
  gameScreen.hidden = false;
  playerX = (gameContainer.clientWidth - player.offsetWidth) / 2;
  updatePlayerPosition();
  updateDisplay();
  status.textContent = "Move your can and catch the clean drops.";

  createDrop();
  dropMaker = setInterval(createDrop, DROP_INTERVAL);
  countdown = setInterval(updateClock, 100);
  animationFrame = requestAnimationFrame(updateDrops);
}

function updateClock() {
  if (!gameRunning) return;
  timeLeft = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
  updateDisplay();
  if (timeLeft === 0) endGame();
}

function createDrop() {
  if (!gameRunning || Date.now() >= endTime) return;

  const drop = document.createElement("span");
  const isBad = Math.random() < 0.25;
  const size = 48 + Math.random() * 16;
  const dropData = { element: drop, isBad, x: 0, y: -size, size, settled: false };

  drop.className = isBad ? "water-drop bad-drop" : "water-drop";
  drop.setAttribute("aria-label", isBad ? "Polluted water" : "Clean water");
  drop.style.width = `${size}px`;
  drop.style.height = `${size}px`;
  dropData.x = Math.random() * Math.max(0, dropLayer.clientWidth - size);
  drop.style.left = `${dropData.x}px`;
  dropLayer.appendChild(drop);
  drop.dataset.dropId = String(dropData.x + dropData.y + performance.now());
  drops.push(dropData);
}

const drops = [];

function updateDrops(now) {
  if (!gameRunning) return;
  const elapsed = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  const catchZone = getCatchZone();

  for (let index = drops.length - 1; index >= 0; index -= 1) {
    const drop = drops[index];
    if (drop.settled) continue;
    drop.y += DROP_SPEED * elapsed;
    drop.element.style.transform = `translateY(${drop.y}px)`;

    const dropBottom = drop.y + drop.size;
    if (dropBottom >= catchZone.top && drop.y <= catchZone.bottom && overlaps(drop, catchZone)) {
      settleDrop(drop, catchZone);
      drops.splice(index, 1);
    } else if (drop.y > gameContainer.clientHeight) {
      drop.element.remove();
      drops.splice(index, 1);
    }
  }

  animationFrame = requestAnimationFrame(updateDrops);
}

function getCatchZone() {
  const containerRect = gameContainer.getBoundingClientRect();
  const playerRect = player.getBoundingClientRect();
  const playerWidth = player.offsetWidth;
  const playerHeight = player.offsetHeight;
  const playerTop = playerRect.top - containerRect.top;
  const visibleLeft = playerX + playerWidth * 0.285;
  const visibleWidth = playerWidth * 0.43;
  const visibleTop = playerTop + playerHeight * 0.197;
  return { left: visibleLeft, right: visibleLeft + visibleWidth, top: visibleTop, bottom: playerTop + playerHeight * 0.8 };
}

function overlaps(drop, catchZone) {
  const dropLeft = drop.x;
  const dropRight = drop.x + drop.size;
  return dropRight >= catchZone.left && dropLeft <= catchZone.right;
}

function settleDrop(drop, catchZone) {
  drop.settled = true;
  drop.element.remove();
  score = Math.max(0, score + (drop.isBad ? -5 : 10));
  updateDisplay();
  showFeedback(drop.x, catchZone.top, drop.isBad);
  showSplash(drop.x + drop.size / 2, catchZone.top);
  status.textContent = drop.isBad ? "Polluted water! Keep it out of the can." : "Clean water collected! Keep going.";
}

function showFeedback(x, y, isBad) {
  const feedback = document.createElement("span");
  feedback.className = isBad ? "feedback negative" : "feedback";
  feedback.textContent = isBad ? "-5" : "+10";
  feedback.style.left = `${x}px`;
  feedback.style.top = `${Math.max(0, y)}px`;
  dropLayer.appendChild(feedback);
  setTimeout(() => feedback.remove(), 700);
}

function showSplash(x, y) {
  const splash = document.createElement("span");
  splash.className = "splash-effect";
  splash.style.left = `${x}px`;
  splash.style.top = `${y}px`;
  dropLayer.appendChild(splash);
  setTimeout(() => splash.remove(), 500);
}

function updatePlayerPosition() {
  const maxX = Math.max(0, gameContainer.clientWidth - player.offsetWidth);
  playerX = Math.max(0, Math.min(playerX, maxX));
  player.style.transform = `translateX(${playerX}px)`;
}

function movePlayerTo(clientX) {
  const bounds = gameContainer.getBoundingClientRect();
  playerX = clientX - bounds.left - player.offsetWidth / 2;
  updatePlayerPosition();
}

function handlePointerStart(event) {
  pointerActive = true;
  gameContainer.setPointerCapture(event.pointerId);
  movePlayerTo(event.clientX);
  event.preventDefault();
}

function handlePointerMove(event) {
  if (!pointerActive) return;
  movePlayerTo(event.clientX);
  event.preventDefault();
}

function releasePointer(event) {
  pointerActive = false;
  if (gameContainer.hasPointerCapture(event.pointerId)) gameContainer.releasePointerCapture(event.pointerId);
}

function handleKeydown(event) {
  if (!gameRunning || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  playerX += event.key === "ArrowLeft" ? -34 : 34;
  updatePlayerPosition();
}

function endGame() {
  if (!gameRunning) return;
  gameRunning = false;
  timeLeft = 0;
  stopGameLoops();
  drops.splice(0, drops.length);
  dropLayer.replaceChildren();
  updateDisplay();
  const won = score >= TARGET_SCORE;
  resultTitle.textContent = "You made a difference.";
  resultText.textContent = won ? "Clean water changes everything." : "Every drop counts. Keep going and try again.";
  finalScore.textContent = score;
  resultBadge.textContent = won ? "Goal Reached!" : "Keep Trying!";
  resultBadge.classList.toggle("missed", !won);
  gameScreen.hidden = true;
  resultScreen.hidden = false;
  if (won) celebrate();
}

function resetGame() {
  gameRunning = false;
  stopGameLoops();
  drops.splice(0, drops.length);
  dropLayer.replaceChildren();
  confettiLayer.replaceChildren();
  score = 0;
  timeLeft = GAME_SECONDS;
  updateDisplay();
  startScreen.hidden = false;
  gameScreen.hidden = true;
  resultScreen.hidden = true;
}

function celebrate() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#FFC907", "#2E9DF7", "#4FCB53", "#F16061"];
  for (let index = 0; index < 100; index += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.backgroundColor = colors[index % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.7}s`;
    piece.style.animationDuration = `${2 + Math.random()}s`;
    confettiLayer.appendChild(piece);
    setTimeout(() => piece.remove(), 4000);
  }
}