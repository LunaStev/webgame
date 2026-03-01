import { Engine } from "../../engine/engine.js";
import { PuzzleScene } from "./puzzleScene.js";

const root = document.getElementById("app");

const engine = new Engine({
  width: 420,
  height: 860,
  background: "#ece9e2",
  parent: root,
  adaptiveLayout: true
});

engine.start(PuzzleScene);
