import { clamp, formatTime, hashSeed, mulberry32 } from "../../engine/core.js";
import { Scene } from "../../engine/scene.js";
import { Storage } from "../../engine/storage.js";
import { UIButton, UIManager } from "../../engine/ui.js";

const CAPACITY = 4;
const STORAGE_KEY = "progress";
const MAX_CAMPAIGN_LEVEL = 200;

const COLOR_PALETTE = [
  "#d7263d",
  "#ff8c00",
  "#f2b705",
  "#2a9d8f",
  "#0077b6",
  "#6a4c93",
  "#588157",
  "#ef476f",
  "#3a86ff",
  "#0a9396",
  "#8338ec",
  "#2b2d42"
];

const TEXT = {
  ko: {
    title: "볼트 너트 정렬",
    statusReady: "같은 색끼리 모으세요. (키보드: U R H A N X)",
    statusInvalid: "이동할 수 없는 위치입니다.",
    statusSolved: "클리어! 다음 레벨 버튼을 누르세요.",
    statusThinking: "해결 경로 계산 중...",
    statusNoHint: "힌트를 찾지 못했습니다.",
    statusMaxLevel: "최종 레벨입니다. 기록을 갱신해보세요.",
    statusWipeArmed: "한 번 더 누르면 저장 데이터가 완전히 삭제됩니다.",
    statusWipeDone: "저장 데이터 삭제 완료. 레벨 1로 초기화되었습니다.",
    level: "레벨",
    colors: "색",
    bolts: "볼트",
    difficulty: "난이도",
    diffEasy: "쉬움",
    diffNormal: "보통",
    diffHard: "어려움",
    diffExpert: "전문가",
    diffMaster: "마스터",
    moves: "이동",
    time: "시간",
    best: "최고",
    undo: "되돌리기",
    reset: "초기화",
    hint: "힌트",
    auto: "자동해결",
    stop: "중지",
    next: "다음",
    lang: "EN",
    wipe: "저장삭제",
    wipeConfirm: "삭제확인"
  },
  en: {
    title: "Bolt Nut Sort",
    statusReady: "Sort by color. Keyboard: U R H A N X",
    statusInvalid: "This move is not allowed.",
    statusSolved: "Cleared. Tap Next to continue.",
    statusThinking: "Calculating path...",
    statusNoHint: "No hint was found.",
    statusMaxLevel: "Final level reached. Try improving your record.",
    statusWipeArmed: "Press once more to permanently erase local save data.",
    statusWipeDone: "Save data erased. Reset to level 1.",
    level: "Level",
    colors: "Colors",
    bolts: "Bolts",
    difficulty: "Difficulty",
    diffEasy: "Easy",
    diffNormal: "Normal",
    diffHard: "Hard",
    diffExpert: "Expert",
    diffMaster: "Master",
    moves: "Moves",
    time: "Time",
    best: "Best",
    undo: "Undo",
    reset: "Reset",
    hint: "Hint",
    auto: "Auto",
    stop: "Stop",
    next: "Next",
    lang: "한",
    wipe: "Wipe Save",
    wipeConfirm: "Confirm"
  }
};

function cloneBoard(board) {
  return board.map((bolt) => bolt.slice());
}

function serialize(board) {
  return board.map((bolt) => bolt.join(",")).join("|");
}

function canonicalStateKey(board) {
  const keys = board
    .map((bolt) => `${bolt.length}:${bolt.join(",")}`)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return keys.join("|");
}

function createEntropySeed() {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] >>> 0;
  }
  return ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
}

function topColor(bolt) {
  return bolt[bolt.length - 1];
}

function canMove(board, from, to) {
  if (from === to) return false;
  const source = board[from];
  const target = board[to];
  if (!source || !target || source.length === 0 || target.length >= CAPACITY) return false;
  if (target.length === 0) return true;
  return topColor(source) === topColor(target);
}

function move(board, from, to) {
  const next = cloneBoard(board);
  const value = next[from].pop();
  next[to].push(value);
  return next;
}

function isMonoColor(bolt) {
  if (bolt.length === 0) return true;
  const base = bolt[0];
  for (let i = 1; i < bolt.length; i += 1) {
    if (bolt[i] !== base) return false;
  }
  return true;
}

function isBoltComplete(bolt) {
  return bolt.length === CAPACITY && isMonoColor(bolt);
}

function isSolved(board) {
  let seen = 0;
  for (const bolt of board) {
    if (bolt.length === 0) continue;
    seen += 1;
    if (!isBoltComplete(bolt)) return false;
  }
  return seen > 0;
}

function sourceSupportsReverseStep(source) {
  if (source.length === 0) return false;
  if (source.length === 1) return true;
  return source[source.length - 1] === source[source.length - 2];
}

function disorderScore(board) {
  let score = 0;
  for (const bolt of board) {
    if (bolt.length === 0) continue;
    for (let i = 1; i < bolt.length; i += 1) {
      if (bolt[i] !== bolt[i - 1]) score += 2;
    }
    if (bolt.length > 0 && bolt.length < CAPACITY) score += 1;
    if (!isMonoColor(bolt)) score += 1.5;
  }
  return score;
}

function getLevelConfig(level) {
  const lv = clamp(level, 1, MAX_CAMPAIGN_LEVEL);
  const boltTarget = Math.min(17, 5 + Math.floor((lv - 1) / 3));
  const rawColors = 3 + Math.floor((lv - 1) / 3);
  let colors = clamp(rawColors, 3, Math.min(12, boltTarget - 2));
  let empties = clamp(boltTarget - colors, 2, 5);

  // Keep bolt growth visible while respecting upper bounds.
  if (colors + empties < boltTarget) {
    const need = boltTarget - (colors + empties);
    colors = Math.min(Math.min(12, boltTarget - 2), colors + need);
  }
  empties = clamp(boltTarget - colors, 2, 5);

  const bolts = colors + empties;
  const shuffleSteps = 16 + lv * 2 + bolts * 2;
  const targetMinPath = 8 + Math.floor(lv * 1.08) + Math.floor(bolts * 1.4);
  const targetMaxPath = targetMinPath + 14 + Math.floor(lv * 0.08);
  const generationAttempts = 26 + Math.floor(lv * 0.24);
  const quickNodeLimit = Math.min(120000, 24000 + lv * 1500);

  return {
    colors,
    empties,
    bolts,
    shuffleSteps,
    targetMinPath,
    targetMaxPath,
    generationAttempts,
    quickNodeLimit
  };
}

function mixedBoltCount(board) {
  let count = 0;
  for (const bolt of board) {
    if (bolt.length >= 2 && !isMonoColor(bolt)) count += 1;
  }
  return count;
}

function complexityScore(board, solutionLength) {
  let topColorVariety = 0;
  let openStacks = 0;
  const seenTop = new Set();

  for (const bolt of board) {
    if (bolt.length === 0) continue;
    openStacks += bolt.length < CAPACITY ? 1 : 0;
    seenTop.add(topColor(bolt));
  }

  topColorVariety = seenTop.size;

  return (
    disorderScore(board) * 1.35 +
    topColorVariety * 1.2 +
    openStacks * 0.6 +
    solutionLength * 1.8 +
    mixedBoltCount(board) * 1.6
  );
}

function getDifficultyTier(config) {
  if (config.targetMinPath < 18) return "diffEasy";
  if (config.targetMinPath < 30) return "diffNormal";
  if (config.targetMinPath < 42) return "diffHard";
  if (config.targetMinPath < 56) return "diffExpert";
  return "diffMaster";
}

function buildSolvedBoard(colors, empties) {
  const board = [];
  for (let i = 0; i < colors; i += 1) {
    board.push(Array(CAPACITY).fill(i));
  }
  for (let j = 0; j < empties; j += 1) {
    board.push([]);
  }
  return board;
}

function getReverseShuffleMoves(board, lastMove, recentStates, strictRecentCheck) {
  const moves = [];

  for (let from = 0; from < board.length; from += 1) {
    const source = board[from];
    if (!sourceSupportsReverseStep(source)) continue;

    for (let to = 0; to < board.length; to += 1) {
      if (from === to) continue;
      const target = board[to];
      if (target.length >= CAPACITY) continue;
      if (lastMove && lastMove.from === to && lastMove.to === from) continue;

      const next = move(board, from, to);
      const key = serialize(next);
      if (strictRecentCheck && recentStates.includes(key)) continue;

      let score = disorderScore(next);
      if (target.length > 0 && topColor(target) !== topColor(source)) {
        score += 1;
      }
      if (source.length === 1) score -= 0.25;

      moves.push({ from, to, next, key, score });
    }
  }

  return moves;
}

class BinaryHeap {
  constructor() {
    this.nodes = [];
  }

  get size() {
    return this.nodes.length;
  }

  push(node) {
    this.nodes.push(node);
    this.bubble(this.nodes.length - 1);
  }

  pop() {
    if (this.nodes.length === 0) return null;
    const top = this.nodes[0];
    const tail = this.nodes.pop();
    if (this.nodes.length > 0 && tail) {
      this.nodes[0] = tail;
      this.sink(0);
    }
    return top;
  }

  bubble(index) {
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.nodes[parent].f <= this.nodes[i].f) break;
      [this.nodes[parent], this.nodes[i]] = [this.nodes[i], this.nodes[parent]];
      i = parent;
    }
  }

  sink(index) {
    let i = index;
    while (true) {
      const left = i * 2 + 1;
      const right = i * 2 + 2;
      let best = i;

      if (left < this.nodes.length && this.nodes[left].f < this.nodes[best].f) {
        best = left;
      }
      if (right < this.nodes.length && this.nodes[right].f < this.nodes[best].f) {
        best = right;
      }
      if (best === i) break;
      [this.nodes[i], this.nodes[best]] = [this.nodes[best], this.nodes[i]];
      i = best;
    }
  }
}

function heuristic(board) {
  let transitions = 0;
  let incomplete = 0;

  for (const bolt of board) {
    if (bolt.length === 0) continue;
    if (!isBoltComplete(bolt)) incomplete += 1;
    for (let i = 1; i < bolt.length; i += 1) {
      if (bolt[i] !== bolt[i - 1]) transitions += 1;
    }
  }

  return transitions + incomplete;
}

function movePriority(board, mv) {
  const source = board[mv.from];
  const target = board[mv.to];
  const srcTop = topColor(source);
  let score = 0;

  if (target.length === 0) score -= 0.9;
  if (target.length > 0 && topColor(target) === srcTop) score += 2.6;
  if (target.length + 1 === CAPACITY) score += 2.8;
  if (source.length === 1) score += 0.8;
  if (isBoltComplete(source)) score -= 2.4;

  return score;
}

function getSearchMoves(board, lastMove) {
  const moves = [];

  for (let from = 0; from < board.length; from += 1) {
    const source = board[from];
    if (source.length === 0) continue;

    const sourceComplete = isBoltComplete(source);
    let emptyUsed = false;

    for (let to = 0; to < board.length; to += 1) {
      if (!canMove(board, from, to)) continue;
      if (lastMove && from === lastMove.to && to === lastMove.from) continue;

      const target = board[to];
      if (target.length === 0) {
        if (sourceComplete || emptyUsed) continue;
        emptyUsed = true;
      }

      moves.push({ from, to });
    }
  }

  moves.sort((a, b) => movePriority(board, b) - movePriority(board, a));
  return moves;
}

function reconstructPath(node) {
  const path = [];
  let cursor = node;
  while (cursor && cursor.move) {
    path.push(cursor.move);
    cursor = cursor.parent;
  }
  path.reverse();
  return path;
}

function solveAStar(startBoard, nodeLimit = 100000) {
  const startKey = serialize(startBoard);
  const startCanonical = canonicalStateKey(startBoard);
  const open = new BinaryHeap();
  const bestG = new Map();

  const start = {
    key: startKey,
    cKey: startCanonical,
    board: cloneBoard(startBoard),
    g: 0,
    h: heuristic(startBoard),
    f: heuristic(startBoard),
    parent: null,
    move: null,
    lastMove: null
  };

  open.push(start);
  bestG.set(start.cKey, 0);

  let expanded = 0;

  while (open.size > 0 && expanded < nodeLimit) {
    const current = open.pop();
    if (!current) break;

    if (bestG.get(current.cKey) < current.g) continue;

    if (isSolved(current.board)) {
      return reconstructPath(current);
    }

    expanded += 1;

    const moves = getSearchMoves(current.board, current.lastMove);
    for (const mv of moves) {
      const nextBoard = move(current.board, mv.from, mv.to);
      const nextKey = serialize(nextBoard);
      const nextCanonical = canonicalStateKey(nextBoard);
      const nextG = current.g + 1;

      if (bestG.has(nextCanonical) && bestG.get(nextCanonical) <= nextG) continue;

      const nextH = heuristic(nextBoard);
      bestG.set(nextCanonical, nextG);
      open.push({
        key: nextKey,
        cKey: nextCanonical,
        board: nextBoard,
        g: nextG,
        h: nextH,
        f: nextG + nextH + nextH * 0.03,
        parent: current,
        move: mv,
        lastMove: mv
      });
    }
  }

  return null;
}

function generateLevel(level, entropySeed) {
  const config = getLevelConfig(level);
  const solved = buildSolvedBoard(config.colors, config.empties);
  const entropy = (typeof entropySeed === "number" ? entropySeed : createEntropySeed()) >>> 0;

  let bestCandidate = null;
  let bestCandidateScore = -Infinity;

  for (let attempt = 0; attempt < config.generationAttempts; attempt += 1) {
    const attemptSeed = hashSeed(level ^ entropy, attempt * 977 + entropy);
    const random = mulberry32(attemptSeed);
    let board = cloneBoard(solved);
    let lastMove = null;
    const recentStates = [serialize(board)];

    const totalSteps = config.shuffleSteps + attempt * 2;

    for (let step = 0; step < totalSteps; step += 1) {
      let candidates = getReverseShuffleMoves(board, lastMove, recentStates, true);
      if (candidates.length === 0) {
        candidates = getReverseShuffleMoves(board, lastMove, recentStates, false);
      }
      if (candidates.length === 0) break;

      candidates.sort((a, b) => b.score - a.score);
      const pool = Math.min(4, candidates.length);
      const chosen = candidates[Math.floor(random() * pool)];

      board = chosen.next;
      lastMove = { from: chosen.from, to: chosen.to };

      recentStates.push(chosen.key);
      if (recentStates.length > 14) recentStates.shift();
    }

    if (isSolved(board)) continue;

    const quickSolution = solveAStar(board, config.quickNodeLimit);
    const pathLength = quickSolution ? quickSolution.length : 0;
    const mixedCount = mixedBoltCount(board);

    if (
      quickSolution &&
      pathLength >= config.targetMinPath &&
      pathLength <= config.targetMaxPath &&
      mixedCount >= Math.max(2, Math.floor(config.colors * 0.45))
    ) {
      return board;
    }

    const deficit = pathLength > 0
      ? Math.max(0, config.targetMinPath - pathLength) + Math.max(0, pathLength - config.targetMaxPath)
      : config.targetMinPath;
    const baseComplexity = complexityScore(board, pathLength || Math.floor(disorderScore(board) * 0.7));
    const score = baseComplexity - deficit * 2.6 + mixedCount * 1.5;

    if (score > bestCandidateScore) {
      bestCandidateScore = score;
      bestCandidate = board;
    }
  }

  if (bestCandidate) return bestCandidate;

  const fallback = cloneBoard(solved);
  const emptyStart = config.colors;
  if (emptyStart < fallback.length) {
    fallback[emptyStart].push(fallback[0].pop());
    if (emptyStart + 1 < fallback.length) {
      fallback[emptyStart + 1].push(fallback[1].pop());
    }
  }
  return fallback;
}

function validateBoard(board, config) {
  if (!Array.isArray(board) || board.length !== config.colors + config.empties) return false;

  const counts = Array(config.colors).fill(0);

  for (const bolt of board) {
    if (!Array.isArray(bolt) || bolt.length > CAPACITY) return false;
    for (const item of bolt) {
      if (!Number.isInteger(item) || item < 0 || item >= config.colors) return false;
      counts[item] += 1;
    }
  }

  for (const count of counts) {
    if (count !== CAPACITY) return false;
  }

  return true;
}

export class PuzzleScene extends Scene {
  constructor(engine) {
    super(engine);

    this.storage = new Storage("bolt-sort-engine");
    this.ui = new UIManager();

    this.lang = "ko";
    this.level = 1;
    this.board = [];
    this.initialBoard = [];
    this.history = [];
    this.selected = null;
    this.hintMove = null;
    this.solutionCache = new Map();

    this.moves = 0;
    this.seconds = 0;
    this.timeAccumulator = 0;

    this.solvedLevels = new Set();
    this.records = {};

    this.isSolved = false;
    this.autoMode = false;
    this.autoQueue = [];
    this.autoStepCooldown = 0;

    this.statusText = "";
    this.statusTimer = 0;

    this.headerRect = { x: 12, y: 12, w: 396, h: 134 };
    this.boardRect = { x: 12, y: 154, w: 396, h: 540 };
    this.controlsRect = { x: 12, y: 704, w: 396, h: 144 };
    this.sidebarRect = { x: 12, y: 12, w: 396, h: 134 };
    this.isWideLayout = false;
    this.boltRects = [];

    this.invalidBoltIndex = -1;
    this.invalidShakeTimer = 0;

    this.boardPulse = { value: 0 };

    this.buttons = {};
    this.keyHandler = null;
    this.runtimeSeed = createEntropySeed();
    this.generationCounter = 0;
    this.wipeArmUntil = 0;
  }

  t(key) {
    return (TEXT[this.lang] || TEXT.ko)[key] || key;
  }

  init() {
    this.loadProgress();
    this.layout(this.engine.width, this.engine.height);
    this.setupButtons();
    this.rebuildBoardLayout();
    this.bindKeyboard();

    if (this.board.length === 0) {
      this.startLevel(this.level);
    }

    this.setStatus(this.isSolved ? this.t("statusSolved") : this.t("statusReady"));
  }

  onResize(width, height) {
    this.layout(width, height);
    this.setupButtons();
    this.rebuildBoardLayout();
  }

  layout(width, height) {
    const margin = 12;
    this.isWideLayout = width >= 760;

    if (this.isWideLayout) {
      const sidebarW = Math.min(332, Math.max(286, width * 0.32));
      this.sidebarRect = { x: margin, y: margin, w: sidebarW, h: height - margin * 2 };
      this.headerRect = {
        x: this.sidebarRect.x,
        y: this.sidebarRect.y,
        w: this.sidebarRect.w,
        h: 176
      };
      this.controlsRect = {
        x: this.sidebarRect.x,
        y: this.headerRect.y + this.headerRect.h + 10,
        w: this.sidebarRect.w,
        h: height - margin - (this.headerRect.y + this.headerRect.h + 10)
      };
      this.boardRect = {
        x: this.sidebarRect.x + this.sidebarRect.w + 12,
        y: margin,
        w: width - (this.sidebarRect.x + this.sidebarRect.w + 12) - margin,
        h: height - margin * 2
      };
    } else {
      this.headerRect = { x: margin, y: margin, w: width - margin * 2, h: 134 };
      this.controlsRect = {
        x: margin,
        y: height - 150,
        w: width - margin * 2,
        h: 138
      };
      const boardTop = this.headerRect.y + this.headerRect.h + 8;
      const boardBottom = this.controlsRect.y - 8;
      this.boardRect = {
        x: margin,
        y: boardTop,
        w: width - margin * 2,
        h: Math.max(180, boardBottom - boardTop)
      };
    }
  }

  setupButtons() {
    this.ui.clear();

    const cols = this.isWideLayout ? 2 : 3;
    const rows = this.isWideLayout ? 3 : 2;
    const gap = 8;
    const w = (this.controlsRect.w - gap * (cols - 1)) / cols;
    const h = (this.controlsRect.h - gap * (rows - 1)) / rows;

    const create = (col, row, labelKey, onClick, style = {}) => {
      const x = this.controlsRect.x + col * (w + gap);
      const y = this.controlsRect.y + row * (h + gap);
      return this.ui.add(
        new UIButton({
          x,
          y,
          w,
          h,
          label: () => this.t(labelKey),
          onClick,
          bg: style.bg || "#ffffff",
          border: style.border || "#b8c3d0",
          text: style.text || "#16212a",
          fontSize: 20,
          radius: 14
        })
      );
    };

    const tone = {
      neutral: { bg: "#ffffff", border: "#b8c3d0", text: "#1c2a34" },
      warm: { bg: "#fff6ea", border: "#d9b68e", text: "#5d3d1f" },
      blue: { bg: "#eaf3ff", border: "#8ca9cc", text: "#1f3d62" },
      green: { bg: "#e9f6ef", border: "#86b59c", text: "#1e4a35" },
      violet: { bg: "#f3eefc", border: "#ad9acb", text: "#3b2a5d" }
    };

    if (this.isWideLayout) {
      this.buttons.undo = create(0, 0, "undo", () => this.onUndo(), tone.neutral);
      this.buttons.reset = create(1, 0, "reset", () => this.onReset(), tone.warm);
      this.buttons.hint = create(0, 1, "hint", () => this.onHint(), tone.blue);
      this.buttons.auto = create(1, 1, "auto", () => this.onAutoToggle(), tone.blue);
      this.buttons.next = create(0, 2, "next", () => this.onNextLevel(), tone.green);
      this.buttons.wipe = create(1, 2, "wipe", () => this.onWipeSave(), tone.violet);
    } else {
      this.buttons.undo = create(0, 0, "undo", () => this.onUndo(), tone.neutral);
      this.buttons.reset = create(1, 0, "reset", () => this.onReset(), tone.warm);
      this.buttons.hint = create(2, 0, "hint", () => this.onHint(), tone.blue);
      this.buttons.auto = create(0, 1, "auto", () => this.onAutoToggle(), tone.blue);
      this.buttons.next = create(1, 1, "next", () => this.onNextLevel(), tone.green);
      this.buttons.wipe = create(2, 1, "wipe", () => this.onWipeSave(), tone.violet);
    }
  }

  rebuildBoardLayout() {
    const count = this.board.length;
    if (count === 0) {
      this.boltRects = [];
      return;
    }

    let cols;
    if (this.isWideLayout) {
      cols = count <= 8 ? 4 : count <= 12 ? 5 : 6;
    } else {
      cols = count <= 6 ? 3 : count <= 10 ? 4 : 5;
    }
    const rows = Math.ceil(count / cols);

    const gap = this.isWideLayout ? 10 : 8;
    const maxBoltW = this.isWideLayout ? 94 : 84;
    const availableW = this.boardRect.w - gap * (cols - 1);
    const boltW = Math.min(maxBoltW, availableW / cols);

    const availableH = this.boardRect.h - gap * (rows - 1);
    const boltH = clamp(availableH / rows, this.isWideLayout ? 132 : 118, this.isWideLayout ? 236 : 214);

    const totalW = cols * boltW + gap * (cols - 1);
    const startX = this.boardRect.x + (this.boardRect.w - totalW) * 0.5;
    const startY = this.boardRect.y + 8;

    this.boltRects = [];
    for (let i = 0; i < count; i += 1) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      this.boltRects.push({
        x: startX + col * (boltW + gap),
        y: startY + row * (boltH + gap),
        w: boltW,
        h: boltH
      });
    }
  }

  update(dt) {
    if (!this.isSolved) {
      this.timeAccumulator += dt;
      while (this.timeAccumulator >= 1) {
        this.timeAccumulator -= 1;
        this.seconds += 1;
      }
    }

    if (this.statusTimer > 0) {
      this.statusTimer -= dt;
      if (this.statusTimer <= 0) {
        this.statusTimer = 0;
        this.setStatus(this.isSolved ? this.t("statusSolved") : this.t("statusReady"));
      }
    }

    if (this.invalidShakeTimer > 0) {
      this.invalidShakeTimer = Math.max(0, this.invalidShakeTimer - dt);
      if (this.invalidShakeTimer === 0) {
        this.invalidBoltIndex = -1;
      }
    }

    if (this.autoMode && this.autoQueue.length > 0 && !this.isSolved) {
      this.autoStepCooldown -= dt;
      if (this.autoStepCooldown <= 0) {
        this.autoStepCooldown = 0.18;
        const mv = this.autoQueue.shift();
        if (mv) this.tryMove(mv.from, mv.to);
      }
    }

    if (this.autoMode && (this.autoQueue.length === 0 || this.isSolved)) {
      this.autoMode = false;
    }

    this.buttons.undo.enabled = this.history.length > 0 && !this.autoMode;
    this.buttons.reset.enabled = !this.autoMode;
    this.buttons.hint.enabled = !this.autoMode && !this.isSolved;
    this.buttons.next.enabled = this.isSolved && !this.autoMode;
    this.buttons.auto.enabled = !this.isSolved;
    this.buttons.wipe.enabled = !this.autoMode;

    this.buttons.auto.label = () => (this.autoMode ? this.t("stop") : this.t("auto"));
    this.buttons.wipe.label = () => (this.isWipeArmed() ? this.t("wipeConfirm") : this.t("wipe"));
    if (this.autoMode) {
      this.buttons.auto.style.bg = "#dff0ff";
      this.buttons.auto.style.border = "#6d99c7";
    } else {
      this.buttons.auto.style.bg = "#eaf3ff";
      this.buttons.auto.style.border = "#8ca9cc";
    }

    if (this.isWipeArmed()) {
      this.buttons.wipe.style.bg = "#ffe8ef";
      this.buttons.wipe.style.border = "#cd8da0";
    } else {
      this.buttons.wipe.style.bg = "#f3eefc";
      this.buttons.wipe.style.border = "#ad9acb";
    }
  }

  render(renderer) {
    const ctx = renderer.ctx;

    const bgGrad = ctx.createLinearGradient(0, 0, this.engine.width, this.engine.height);
    bgGrad.addColorStop(0, "#f6f2ea");
    bgGrad.addColorStop(1, "#ebe5d8");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, this.engine.width, this.engine.height);

    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#cfd8e3";
    ctx.beginPath();
    ctx.arc(this.engine.width * 0.18, this.engine.height * 0.16, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(this.engine.width * 0.86, this.engine.height * 0.84, 150, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    renderer.fillRoundedRect(
      this.headerRect.x,
      this.headerRect.y,
      this.headerRect.w,
      this.headerRect.h,
      18,
      "#fbfaf6"
    );
    renderer.strokeRoundedRect(
      this.headerRect.x,
      this.headerRect.y,
      this.headerRect.w,
      this.headerRect.h,
      18,
      "#d8d2c4",
      1
    );

    renderer.drawText(this.t("title"), this.headerRect.x + 14, this.headerRect.y + 24, {
      size: this.isWideLayout ? 28 : 30,
      weight: 800,
      color: "#17202a"
    });

    renderer.drawText(this.statusText, this.headerRect.x + 14, this.headerRect.y + 55, {
      size: 16,
      weight: 700,
      color: "#4e5a66"
    });

    const best = this.getBestRecord(this.level);
    const cfg = getLevelConfig(this.level);
    const infoText = `${this.t("colors")} ${cfg.colors}   ${this.t("bolts")} ${cfg.bolts}   ${this.t("difficulty")} ${this.t(getDifficultyTier(cfg))}`;

    const levelText = `${this.t("level")} ${this.level}/${MAX_CAMPAIGN_LEVEL}`;
    const statsY = this.isWideLayout ? this.headerRect.y + 120 : this.headerRect.y + 90;
    const colA = this.headerRect.x + 14;
    const colB = this.headerRect.x + this.headerRect.w * 0.46;

    renderer.drawText(infoText, this.headerRect.x + 14, this.headerRect.y + 76, {
      size: 15,
      color: "#3f4f5c",
      weight: 700
    });

    renderer.drawText(levelText, colA, statsY, {
      size: 18,
      color: "#27323c"
    });

    renderer.drawText(`${this.t("moves")} ${this.moves}`, colB, statsY, {
      size: 18,
      color: "#27323c"
    });

    renderer.drawText(`${this.t("time")} ${formatTime(this.seconds)}`, colA, statsY + 24, {
      size: 18,
      color: "#27323c"
    });

    renderer.drawText(
      `${this.t("best")} ${best ? `${best.moves}/${formatTime(best.seconds)}` : "-"}`,
      colB,
      statsY + 24,
      {
        size: 16,
        color: "#5a6772"
      }
    );

    const pulseScale = 1 + this.boardPulse.value * 0.025;
    ctx.save();
    ctx.translate(
      this.boardRect.x + this.boardRect.w * 0.5,
      this.boardRect.y + this.boardRect.h * 0.5
    );
    ctx.scale(pulseScale, pulseScale);
    ctx.translate(
      -(this.boardRect.x + this.boardRect.w * 0.5),
      -(this.boardRect.y + this.boardRect.h * 0.5)
    );

    renderer.fillRoundedRect(
      this.boardRect.x,
      this.boardRect.y,
      this.boardRect.w,
      this.boardRect.h,
      20,
      "#f9f6ef"
    );
    renderer.strokeRoundedRect(
      this.boardRect.x,
      this.boardRect.y,
      this.boardRect.w,
      this.boardRect.h,
      20,
      "#d9d3c5",
      1
    );

    for (let i = 0; i < this.boltRects.length; i += 1) {
      this.drawBolt(renderer, i, this.boltRects[i]);
    }

    ctx.restore();

    renderer.fillRoundedRect(
      this.controlsRect.x,
      this.controlsRect.y,
      this.controlsRect.w,
      this.controlsRect.h,
      18,
      "#fbfaf6"
    );
    renderer.strokeRoundedRect(
      this.controlsRect.x,
      this.controlsRect.y,
      this.controlsRect.w,
      this.controlsRect.h,
      18,
      "#d8d2c4",
      1
    );

    this.ui.draw(renderer);
  }

  drawBolt(renderer, index, rect) {
    const ctx = renderer.ctx;
    const bolt = this.board[index];

    const selected = this.selected === index;
    const hintFrom = this.hintMove && this.hintMove.from === index;
    const hintTo = this.hintMove && this.hintMove.to === index;
    const complete = isBoltComplete(bolt);

    let offsetX = 0;
    if (this.invalidBoltIndex === index && this.invalidShakeTimer > 0) {
      const power = this.invalidShakeTimer / 0.28;
      offsetX = Math.sin(performance.now() * 0.05) * 7 * power;
    }

    const x = rect.x + offsetX;
    const y = rect.y;

    const border = complete ? "#4c8b69" : "#b8c1cb";
    renderer.fillRoundedRect(x, y, rect.w, rect.h, 20, "#eef2f6");
    renderer.strokeRoundedRect(x, y, rect.w, rect.h, 20, border, 2);
    if (hintTo) {
      renderer.strokeRoundedRect(x + 3, y + 3, rect.w - 6, rect.h - 6, 17, "#d58f3f", 2);
    }

    const rodW = Math.max(10, rect.w * 0.18);
    const rodX = x + (rect.w - rodW) * 0.5;
    const rodY = y + 14;
    const rodH = rect.h - 28;
    renderer.fillRoundedRect(rodX, rodY, rodW, rodH, rodW * 0.5, "#c7d0da");
    renderer.strokeRoundedRect(rodX, rodY, rodW, rodH, rodW * 0.5, "#aeb8c2", 1);

    const baseW = rect.w * 0.72;
    const baseH = 10;
    renderer.fillRoundedRect(
      x + (rect.w - baseW) * 0.5,
      y + rect.h - baseH - 3,
      baseW,
      baseH,
      5,
      "#b2bcc6"
    );

    const slotGap = 7;
    const topPadding = 12;
    const bottomPadding = 12;
    const slotH = (rect.h - topPadding - bottomPadding - slotGap * (CAPACITY - 1)) / CAPACITY;

    for (let level = 0; level < CAPACITY; level += 1) {
      const slotY = y + rect.h - bottomPadding - (level + 1) * slotH - level * slotGap;
      const nutValue = bolt[level];

      if (nutValue !== undefined) {
        const isTopNut = level === bolt.length - 1;
        const nutW = rect.w - 18;
        const nutH = slotH - 7;
        const nx = x + (rect.w - nutW) * 0.5;
        const ny = slotY + (selected && isTopNut ? -8 : 2);

        this.drawHexNut(
          renderer,
          nx,
          ny,
          nutW,
          nutH,
          COLOR_PALETTE[nutValue % COLOR_PALETTE.length],
          isTopNut && selected,
          hintFrom && isTopNut,
          hintTo && isTopNut
        );
      }
    }
  }

  drawHexNut(renderer, x, y, width, height, color, selected, hintFrom, hintTo) {
    const ctx = renderer.ctx;
    const p = [
      [x + width * 0.18, y],
      [x + width * 0.82, y],
      [x + width, y + height * 0.5],
      [x + width * 0.82, y + height],
      [x + width * 0.18, y + height],
      [x, y + height * 0.5]
    ];

    const stroke = selected ? "#245f8b" : hintFrom || hintTo ? "#b76e1a" : "#2d3a45";
    const line = selected ? 3 : hintFrom || hintTo ? 2.5 : 1.5;

    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i += 1) {
      ctx.lineTo(p[i][0], p[i][1]);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = line;
    ctx.stroke();

    const iw = width * 0.36;
    const ih = height * 0.42;
    renderer.fillRoundedRect(
      x + (width - iw) * 0.5,
      y + (height - ih) * 0.5,
      iw,
      ih,
      Math.min(iw, ih) * 0.22,
      "#ecf1f6"
    );
  }

  bindKeyboard() {
    if (this.keyHandler) return;
    this.keyHandler = (event) => this.onKeyDown(event);
    window.addEventListener("keydown", this.keyHandler);
  }

  unbindKeyboard() {
    if (!this.keyHandler) return;
    window.removeEventListener("keydown", this.keyHandler);
    this.keyHandler = null;
  }

  onKeyDown(event) {
    if (event.repeat) return;
    const key = event.key.toLowerCase();

    if (key === "u") {
      this.onUndo();
      return;
    }
    if (key === "r") {
      this.onReset();
      return;
    }
    if (key === "h") {
      this.onHint();
      return;
    }
    if (key === "a") {
      this.onAutoToggle();
      return;
    }
    if (key === "n") {
      this.onNextLevel();
      return;
    }
    if (key === "x") {
      this.onWipeSave();
      return;
    }
    if (key === "l") {
      this.onLanguageToggle();
      return;
    }
    if (key === "escape") {
      this.selected = null;
      return;
    }

    const parsed = Number.parseInt(key, 10);
    if (!Number.isNaN(parsed)) {
      let index = parsed - 1;
      if (parsed === 0) index = 9;
      if (index < 0 || index >= this.board.length) return;

      if (this.selected === null) {
        if (this.board[index].length > 0) {
          this.selected = index;
        } else {
          this.flashInvalid(index);
        }
        return;
      }

      if (index === this.selected) {
        this.selected = null;
        return;
      }

      if (!this.tryMove(this.selected, index)) {
        this.flashInvalid(index);
      }
    }
  }

  isWipeArmed() {
    return performance.now() < this.wipeArmUntil;
  }

  onPointerDown(x, y) {
    if (this.ui.handlePointerDown(x, y)) {
      this.saveProgress();
      return;
    }

    if (this.autoMode) return;

    this.hintMove = null;

    if (this.selected === null) {
      const sourceIndex = this.getSourceIndexAt(x, y);
      if (sourceIndex < 0) {
        const target = this.getBoltTargetIndexAt(x, y);
        this.flashInvalid(target >= 0 ? target : 0);
        return;
      }
      this.selected = sourceIndex;
      return;
    }

    const targetIndex = this.getBoltTargetIndexAt(x, y);
    if (targetIndex < 0) {
      this.selected = null;
      return;
    }

    if (targetIndex === this.selected) {
      const sameTopNut = this.getSourceIndexAt(x, y) === this.selected;
      if (sameTopNut) this.selected = null;
      return;
    }

    if (!this.tryMove(this.selected, targetIndex)) {
      this.flashInvalid(targetIndex);
    }
  }

  getBoltTargetIndexAt(x, y) {
    for (let i = 0; i < this.boltRects.length; i += 1) {
      const rect = this.boltRects[i];
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
        return i;
      }
    }
    return -1;
  }

  getTopNutRect(index) {
    const rect = this.boltRects[index];
    const bolt = this.board[index];
    if (!rect || !bolt || bolt.length === 0) return null;

    const slotGap = 7;
    const topPadding = 12;
    const bottomPadding = 12;
    const slotH = (rect.h - topPadding - bottomPadding - slotGap * (CAPACITY - 1)) / CAPACITY;
    const level = bolt.length - 1;
    const slotY = rect.y + rect.h - bottomPadding - (level + 1) * slotH - level * slotGap;

    const nutW = rect.w - 18;
    const nutH = slotH - 7;
    const nx = rect.x + (rect.w - nutW) * 0.5;
    const ny = slotY + 2;

    return { x: nx, y: ny, w: nutW, h: nutH };
  }

  getSourceIndexAt(x, y) {
    for (let i = 0; i < this.board.length; i += 1) {
      const topNut = this.getTopNutRect(i);
      if (!topNut) continue;
      if (x >= topNut.x && x <= topNut.x + topNut.w && y >= topNut.y && y <= topNut.y + topNut.h) {
        return i;
      }
    }
    return -1;
  }

  flashInvalid(index) {
    this.invalidBoltIndex = index;
    this.invalidShakeTimer = 0.28;
    this.setStatus(this.t("statusInvalid"), 1.0);
  }

  tryMove(from, to) {
    if (!canMove(this.board, from, to)) return false;

    this.history.push({
      board: cloneBoard(this.board),
      moves: this.moves,
      seconds: this.seconds
    });

    this.board = move(this.board, from, to);
    this.moves += 1;
    this.selected = null;
    this.hintMove = null;
    this.solutionCache.clear();

    if (isSolved(this.board)) {
      this.isSolved = true;
      this.solvedLevels.add(this.level);
      this.updateBestRecord();
      this.setStatus(this.t("statusSolved"));
      this.boardPulse.value = 1;
      this.engine.tween.to(this.boardPulse, "value", 0, 0.65);
    } else {
      this.isSolved = false;
      this.setStatus(this.t("statusReady"));
    }

    this.saveProgress();
    return true;
  }

  onUndo() {
    if (this.autoMode) return;
    const prev = this.history.pop();
    if (!prev) {
      this.flashInvalid(this.selected ?? 0);
      return;
    }

    this.board = prev.board;
    this.moves = prev.moves;
    this.seconds = prev.seconds;
    this.selected = null;
    this.hintMove = null;
    this.isSolved = isSolved(this.board);
    this.autoMode = false;
    this.autoQueue = [];
    this.solutionCache.clear();

    this.setStatus(this.isSolved ? this.t("statusSolved") : this.t("statusReady"));
    this.saveProgress();
  }

  onReset() {
    if (this.autoMode) return;

    this.board = cloneBoard(this.initialBoard);
    this.history = [];
    this.selected = null;
    this.hintMove = null;
    this.moves = 0;
    this.seconds = 0;
    this.timeAccumulator = 0;
    this.isSolved = isSolved(this.board);
    this.autoMode = false;
    this.autoQueue = [];
    this.solutionCache.clear();

    this.setStatus(this.isSolved ? this.t("statusSolved") : this.t("statusReady"));
    this.saveProgress();
  }

  onHint() {
    if (this.autoMode || this.isSolved) return;

    this.setStatus(this.t("statusThinking"));
    const solution = this.getSolution();

    if (!solution || solution.length === 0) {
      this.setStatus(this.t("statusNoHint"), 1.1);
      return;
    }

    this.hintMove = solution[0];
    this.selected = solution[0].from;
    this.setStatus(this.t("statusReady"));
  }

  onAutoToggle() {
    if (this.isSolved) return;

    if (this.autoMode) {
      this.autoMode = false;
      this.autoQueue = [];
      this.setStatus(this.t("statusReady"));
      return;
    }

    this.setStatus(this.t("statusThinking"));
    const solution = this.getSolution();

    if (!solution || solution.length === 0) {
      this.setStatus(this.t("statusNoHint"), 1.1);
      return;
    }

    this.autoMode = true;
    this.autoQueue = solution.slice();
    this.autoStepCooldown = 0.12;
    this.selected = null;
    this.hintMove = null;
  }

  onNextLevel() {
    if (!this.isSolved || this.autoMode) {
      this.flashInvalid(this.selected ?? 0);
      return;
    }

    if (this.level >= MAX_CAMPAIGN_LEVEL) {
      this.setStatus(this.t("statusMaxLevel"), 1.4);
      return;
    }

    this.startLevel(Math.min(MAX_CAMPAIGN_LEVEL, this.level + 1));
    this.setStatus(this.t("statusReady"));
    this.saveProgress();
  }

  onLanguageToggle() {
    this.lang = this.lang === "ko" ? "en" : "ko";
    this.setStatus(this.isSolved ? this.t("statusSolved") : this.t("statusReady"));
    this.saveProgress();
  }

  onWipeSave() {
    if (this.autoMode) return;

    if (!this.isWipeArmed()) {
      this.wipeArmUntil = performance.now() + 2200;
      this.setStatus(this.t("statusWipeArmed"), 1.6);
      return;
    }

    this.wipeArmUntil = 0;
    this.storage.remove(STORAGE_KEY);
    this.solvedLevels = new Set();
    this.records = {};
    this.history = [];
    this.selected = null;
    this.hintMove = null;
    this.solutionCache.clear();
    this.runtimeSeed = createEntropySeed();
    this.generationCounter = 0;
    this.startLevel(1);
    this.setStatus(this.t("statusWipeDone"), 1.8);
  }

  startLevel(level, persistedBoard, persistedInitial, persistedMoves, persistedSeconds) {
    this.level = clamp(level, 1, MAX_CAMPAIGN_LEVEL);
    this.history = [];
    this.selected = null;
    this.hintMove = null;
    this.solutionCache.clear();
    this.autoMode = false;
    this.autoQueue = [];
    this.wipeArmUntil = 0;

    const config = getLevelConfig(this.level);

    if (
      persistedBoard &&
      persistedInitial &&
      validateBoard(persistedBoard, config) &&
      validateBoard(persistedInitial, config)
    ) {
      this.board = cloneBoard(persistedBoard);
      this.initialBoard = cloneBoard(persistedInitial);
      this.moves = Number.isInteger(persistedMoves) && persistedMoves >= 0 ? persistedMoves : 0;
      this.seconds = Number.isInteger(persistedSeconds) && persistedSeconds >= 0 ? persistedSeconds : 0;
    } else {
      const seed = (this.runtimeSeed ^ ((this.generationCounter + 1) * 2654435761)) >>> 0;
      this.generationCounter += 1;
      const generated = generateLevel(this.level, seed);
      this.board = cloneBoard(generated);
      this.initialBoard = cloneBoard(generated);
      this.moves = 0;
      this.seconds = 0;
      this.timeAccumulator = 0;
    }

    this.isSolved = isSolved(this.board);
    if (this.isSolved) this.solvedLevels.add(this.level);

    this.rebuildBoardLayout();
  }

  getSolution() {
    const key = serialize(this.board);
    if (this.solutionCache.has(key)) {
      return this.solutionCache.get(key);
    }

    const cfg = getLevelConfig(this.level);
    const nodeLimit = Math.min(220000, Math.max(70000, cfg.quickNodeLimit * 3));
    const path = solveAStar(this.board, nodeLimit);
    this.solutionCache.set(key, path);
    return path;
  }

  setStatus(text, ttlSeconds = 0) {
    this.statusText = text;
    this.statusTimer = ttlSeconds;
  }

  getBestRecord(level) {
    const record = this.records[String(level)];
    if (!record) return null;
    if (!Number.isInteger(record.moves) || !Number.isInteger(record.seconds)) return null;
    return record;
  }

  updateBestRecord() {
    const key = String(this.level);
    const candidate = { moves: this.moves, seconds: this.seconds };
    const existing = this.records[key];

    if (!existing) {
      this.records[key] = candidate;
      return;
    }

    const betterMoves = candidate.moves < existing.moves;
    const betterTimeAtSameMoves = candidate.moves === existing.moves && candidate.seconds < existing.seconds;

    if (betterMoves || betterTimeAtSameMoves) {
      this.records[key] = candidate;
    }
  }

  loadProgress() {
    const progress = this.storage.get(STORAGE_KEY, null);
    if (!progress || typeof progress !== "object") {
      this.startLevel(1);
      return;
    }

    this.lang = progress.lang === "en" ? "en" : "ko";
    this.solvedLevels = new Set(
      Array.isArray(progress.solvedLevels)
        ? progress.solvedLevels.filter((x) => Number.isInteger(x) && x > 0)
        : []
    );
    this.records = progress.records && typeof progress.records === "object" ? progress.records : {};

    const level = Number.isInteger(progress.level) && progress.level > 0 ? progress.level : 1;
    this.startLevel(
      level,
      progress.board,
      progress.initialBoard,
      progress.moves,
      progress.seconds
    );
  }

  saveProgress() {
    this.storage.set(STORAGE_KEY, {
      lang: this.lang,
      level: this.level,
      board: this.board,
      initialBoard: this.initialBoard,
      moves: this.moves,
      seconds: this.seconds,
      solvedLevels: Array.from(this.solvedLevels).sort((a, b) => a - b),
      records: this.records
    });
  }

  destroy() {
    this.unbindKeyboard();
    this.saveProgress();
  }
}
