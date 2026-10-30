const GAME_SECONDS = 30;
const DROP_INTERVAL = 650;
const POLLUTED_CHANCE = 0.25;
const DIFFICULTIES = {
  easy: { label: "Easy", target: 80, dropDuration: 5 },
  normal: { label: "Normal", target: 100, dropDuration: 4 },
  hard: {
    label: "Hard",
    target: 150,
    dropDuration: 3,
    spawnInterval: 400,
    pollutedChance: 0.4,
    speedMultiplier: 1.15
  }
};
const MILESTONES = [
  { percent: 25, message: "Great start!" },
  { percent: 50, message: "Halfway there!" },
  { percent: 75, message: "Almost there!" },
  { percent: 100, message: "Goal reached! Keep it up!" }
];
const CLEAN_DROP_SOUND_SRC = "img/audio/water%20drop.wav";
const SOUND_POOL_SIZE = 4;

let gameRunning = false;
let score = 0;
let timeLeft = GAME_SECONDS;
let selectedDifficulty = "normal";
let dropMaker;
let countdown;
let animationFrame;
let endTime;
let lastFrameTime = 0;
let playerX = 0;
let pointerActive = false;
let dropSpeed = 0;
let milestoneTimers = [];
let feedbackTimers = [];
let triggeredMilestones = new Set();
let soundEnabled = true;
let soundPool = [];
let soundPoolIndex = 0;
let hardSpawnCount = 0;
let hardPollutedStreak = 0;
let explosionActive = false;
let explosionTimers = [];
const drops = [];

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
const startGoal = document.getElementById("start-goal");
const difficultySummary = document.getElementById("difficulty-summary");
const gameGoal = document.getElementById("game-goal");
const gameDifficulty = document.getElementById("game-difficulty");
const difficultyInputs = document.querySelectorAll('input[name="difficulty"]');
const startButton = document.getElementById("start-btn");
const soundButton = document.getElementById("sound-btn");
const resetButton = document.getElementById("reset-btn");
const replayButton = document.getElementById("replay-btn");
const resultTitle = document.getElementById("result-title");
const resultText = document.getElementById("result-text");
const finalScore = document.getElementById("final-score");
const resultBadge = document.getElementById("result-badge");
const status = document.getElementById("status");
const confettiLayer = document.getElementById("confetti-layer");
const explosionLayer = document.getElementById("explosion-layer");

startButton.addEventListener("click", startGame);
soundButton.addEventListener("click", toggleSound);
resetButton.addEventListener("click", resetGame);
replayButton.addEventListener("click", startGame);
difficultyInputs.forEach((input) => input.addEventListener("change", handleDifficultyChange));
gameContainer.addEventListener("pointerdown", handlePointerStart);
gameContainer.addEventListener("pointermove", handlePointerMove);
gameContainer.addEventListener("pointerup", releasePointer);
gameContainer.addEventListener("pointercancel", releasePointer);
document.addEventListener("keydown", handleKeydown);

function getDifficulty() {
  return DIFFICULTIES[selectedDifficulty];
}

function updateDifficultySummary() {
  const difficulty = getDifficulty();
  startGoal.textContent = `${difficulty.target} points`;
  const hardDetails = selectedDifficulty === "hard"
    ? " Polluted drops are more common (40%), with denser drops every 0.4 seconds."
    : "";
  difficultySummary.textContent = `${difficulty.label}: reach ${difficulty.target} points. Drops take about ${difficulty.dropDuration} seconds to fall.${hardDetails}`;
}

function handleDifficultyChange(event) {
  if (gameRunning) return;
  selectedDifficulty = event.target.value;
  updateDifficultySummary();
}

function initializeAudio() {
  if (soundPool.length) return;
  soundPool = Array.from({ length: SOUND_POOL_SIZE }, () => {
    const audio = new Audio(CLEAN_DROP_SOUND_SRC);
    audio.preload = "auto";
    audio.volume = 0.35;
    audio.addEventListener("error", () => { audio.dataset.failed = "true"; });
    return audio;
  });
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  soundButton.textContent = soundEnabled ? "Sound On" : "Sound Off";
  soundButton.setAttribute("aria-pressed", String(soundEnabled));
}

function playCleanDropSound() {
  if (!soundEnabled || !soundPool.length) return;
  const audio = soundPool[soundPoolIndex];
  soundPoolIndex = (soundPoolIndex + 1) % soundPool.length;
  if (audio.dataset.failed === "true") return;
  try {
    audio.currentTime = 0;
    const playback = audio.play();
    if (playback && typeof playback.catch === "function") playback.catch(() => {});
  } catch (error) {
    audio.dataset.failed = "true";
  }
}

function updateDisplay() {
  const difficulty = getDifficulty();
  scoreDisplay.textContent = score;
  timeDisplay.textContent = timeLeft;
  gameGoal.textContent = difficulty.target;
  gameDifficulty.textContent = difficulty.label;
  progress.max = difficulty.target;
  progress.value = Math.min(score, difficulty.target);
  progressLabel.textContent = `${score} / ${difficulty.target}`;
  progressRemaining.textContent = `${Math.max(0, difficulty.target - score)} pts to go`;
}

function clearTransientTimers() {
  feedbackTimers.forEach((timer) => clearTimeout(timer));
  milestoneTimers.forEach((timer) => clearTimeout(timer));
  feedbackTimers = [];
  milestoneTimers = [];
}

function clearExplosion() {
  explosionTimers.forEach((timer) => clearTimeout(timer));
  explosionTimers = [];
  explosionActive = false;
  explosionLayer.replaceChildren();
  explosionLayer.classList.remove("active");
  player.classList.remove("player-shake");
}

function stopGameLoops() {
  clearInterval(dropMaker);
  clearInterval(countdown);
  cancelAnimationFrame(animationFrame);
  dropMaker = null;
  countdown = null;
  animationFrame = null;
}

function clearGameObjects() {
  drops.splice(0, drops.length);
  dropLayer.replaceChildren();
  gameScreen.querySelectorAll(".milestone-notice").forEach((notice) => notice.remove());
  clearTransientTimers();
  clearExplosion();
}

function startGame() {
  if (gameRunning) return;
  initializeAudio();
  stopGameLoops();
  clearGameObjects();
  confettiLayer.replaceChildren();
  triggeredMilestones = new Set();
  hardSpawnCount = 0;
  hardPollutedStreak = 0;
  score = 0;
  timeLeft = GAME_SECONDS;
  gameRunning = true;
  endTime = Date.now() + GAME_SECONDS * 1000;
  lastFrameTime = performance.now();
  startScreen.hidden = true;
  resultScreen.hidden = true;
  gameScreen.hidden = false;
  const difficulty = getDifficulty();
  dropSpeed = gameContainer.clientHeight / difficulty.dropDuration * (difficulty.speedMultiplier || 1);
  playerX = (gameContainer.clientWidth - player.offsetWidth) / 2;
  updatePlayerPosition();
  updateDisplay();
  status.textContent = "Move your can and catch the clean drops.";
  createDrop();
  dropMaker = setInterval(createDrop, getDifficulty().spawnInterval || DROP_INTERVAL);
  countdown = setInterval(updateClock, 100);
  animationFrame = requestAnimationFrame(updateDrops);
  difficultyInputs.forEach((input) => { input.disabled = true; });
}

function updateClock() {
  if (!gameRunning) return;
  timeLeft = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
  updateDisplay();
  if (timeLeft === 0) endGame();
}

function createDrop() {
  if (!gameRunning || explosionActive || Date.now() >= endTime) return;
  const drop = document.createElement("span");
  const difficulty = getDifficulty();
  const isHard = selectedDifficulty === "hard";
  const isBad = isHard
    ? hardPollutedStreak < 2 && Math.random() < difficulty.pollutedChance
    : Math.random() < POLLUTED_CHANCE;
  const size = 48 + Math.random() * 16;
  const dropData = { element: drop, isBad, x: 0, y: -size, size, settled: false };
  drop.className = isBad ? "water-drop bad-drop" : "water-drop";
  drop.setAttribute("aria-label", isBad ? "Polluted water" : "Clean water");
  drop.style.width = `${size}px`;
  drop.style.height = `${size}px`;
  dropData.x = getDropX(size, isHard);
  drop.style.left = `${dropData.x}px`;
  dropLayer.appendChild(drop);
  drops.push(dropData);
  if (isHard) {
    hardPollutedStreak = isBad ? hardPollutedStreak + 1 : 0;
    hardSpawnCount += 1;
  }
}

function getDropX(size, isHard) {
  const availableWidth = Math.max(0, dropLayer.clientWidth - size);
  if (!isHard || availableWidth === 0) return Math.random() * availableWidth;
  const laneCount = Math.max(3, Math.min(6, Math.floor(availableWidth / 100) + 1));
  const laneWidth = (availableWidth + size) / laneCount;
  const lane = hardSpawnCount % laneCount;
  const jitter = Math.min(18, laneWidth * 0.15);
  const laneCenter = lane * laneWidth + laneWidth / 2 - size / 2;
  return Math.max(0, Math.min(availableWidth, laneCenter + (Math.random() * 2 - 1) * jitter));
}

function updateDrops(now) {
  if (!gameRunning || explosionActive) return;
  const elapsed = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  const catchZone = getCatchZone();
  for (let index = drops.length - 1; index >= 0; index -= 1) {
    const drop = drops[index];
    if (drop.settled) continue;
    drop.y += dropSpeed * elapsed;
    drop.element.style.transform = `translateY(${drop.y}px)`;
    const dropBottom = drop.y + drop.size;
    if (dropBottom >= catchZone.top && drop.y <= catchZone.bottom && overlaps(drop, catchZone)) {
      const exploded = settleDrop(drop, catchZone);
      if (exploded) break;
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
  return drop.x + drop.size >= catchZone.left && drop.x <= catchZone.right;
}

function settleDrop(drop, catchZone) {
  drop.settled = true;
  drop.element.remove();
  if (drop.isBad && selectedDifficulty === "hard") {
    triggerExplosion(drop.x + drop.size / 2, catchZone.top);
    return true;
  }
  score = Math.max(0, score + (drop.isBad ? -5 : 10));
  if (!drop.isBad) playCleanDropSound();
  updateDisplay();
  showFeedback(drop.x, catchZone.top, drop.isBad);
  showSplash(drop.x + drop.size / 2, catchZone.top);
  checkMilestones();
  status.textContent = drop.isBad ? "Polluted water! Keep it out of the can." : "Clean water collected! Keep going.";
  return false;
}

function triggerExplosion(x, y) {
  score = 0;
  updateDisplay();
  status.textContent = "BOOM! Your clean water spilled. Start collecting again!";
  drops.splice(0, drops.length);
  dropLayer.replaceChildren();
  explosionActive = true;
  clearInterval(dropMaker);
  dropMaker = null;
  cancelAnimationFrame(animationFrame);
  animationFrame = null;
  const containerRect = gameContainer.getBoundingClientRect();
  const burst = document.createElement("div");
  burst.className = "explosion-burst";
  burst.style.setProperty("--explosion-x", `${containerRect.left + x}px`);
  burst.style.setProperty("--explosion-y", `${containerRect.top + y}px`);
  burst.innerHTML = '<span class="explosion-core"></span><span class="explosion-shockwave"></span><span class="explosion-particles"></span><span class="water-spray"></span><strong class="explosion-message">BOOM! Your clean water spilled. Start collecting again!</strong><span class="explosion-score">Score: 0</span>';
  for (let index = 0; index < 14; index += 1) {
    const particle = document.createElement("i");
    particle.style.setProperty("--particle-angle", `${index * (360 / 14)}deg`);
    burst.querySelector(".explosion-particles").appendChild(particle);
  }
  for (let index = 0; index < 8; index += 1) {
    const spray = document.createElement("i");
    spray.style.setProperty("--spray-angle", `${index * 45 - 20}deg`);
    burst.querySelector(".water-spray").appendChild(spray);
  }
  explosionLayer.replaceChildren(burst);
  explosionLayer.classList.add("active");
  player.classList.add("player-shake");
  explosionTimers.push(setTimeout(() => player.classList.remove("player-shake"), 500));
  explosionTimers.push(setTimeout(() => {
    explosionLayer.replaceChildren();
    explosionLayer.classList.remove("active");
    explosionActive = false;
    if (!gameRunning) return;
    dropMaker = setInterval(createDrop, getDifficulty().spawnInterval || DROP_INTERVAL);
    lastFrameTime = performance.now();
    animationFrame = requestAnimationFrame(updateDrops);
  }, 800));
}

function checkMilestones() {
  const target = getDifficulty().target;
  MILESTONES.forEach((milestone) => {
    if (triggeredMilestones.has(milestone.percent) || score < target * milestone.percent / 100) return;
    triggeredMilestones.add(milestone.percent);
    showMilestone(milestone.message);
  });
}

function showMilestone(message) {
  const notice = document.createElement("div");
  notice.className = "milestone-notice";
  notice.textContent = message;
  gameScreen.appendChild(notice);
  const timer = setTimeout(() => notice.remove(), 1800);
  milestoneTimers.push(timer);
}

function showFeedback(x, y, isBad) {
  const feedback = document.createElement("span");
  feedback.className = isBad ? "feedback negative" : "feedback";
  feedback.textContent = isBad ? "-5" : "+10";
  feedback.style.left = `${x}px`;
  feedback.style.top = `${Math.max(0, y)}px`;
  dropLayer.appendChild(feedback);
  const timer = setTimeout(() => feedback.remove(), 700);
  feedbackTimers.push(timer);
}

function showSplash(x, y) {
  const splash = document.createElement("span");
  splash.className = "splash-effect";
  splash.style.left = `${x}px`;
  splash.style.top = `${y}px`;
  dropLayer.appendChild(splash);
  const timer = setTimeout(() => splash.remove(), 500);
  feedbackTimers.push(timer);
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
  clearGameObjects();
  updateDisplay();
  const won = score >= getDifficulty().target;
  resultTitle.textContent = "You made a difference.";
  resultText.textContent = won ? "Clean water changes everything." : "Every drop counts. Keep going and try again.";
  finalScore.textContent = score;
  resultBadge.textContent = won ? "Goal Reached!" : "Keep Trying!";
  resultBadge.classList.toggle("missed", !won);
  gameScreen.hidden = true;
  resultScreen.hidden = false;
  difficultyInputs.forEach((input) => { input.disabled = false; });
  if (won) celebrate();
}

function resetGame() {
  gameRunning = false;
  stopGameLoops();
  clearGameObjects();
  confettiLayer.replaceChildren();
  triggeredMilestones = new Set();
  score = 0;
  timeLeft = GAME_SECONDS;
  difficultyInputs.forEach((input) => { input.disabled = false; });
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

updateDifficultySummary();
updateDisplay();
