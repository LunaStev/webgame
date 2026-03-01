import { roundedRectPath } from "./core.js";

export class Renderer {
  constructor(config = {}) {
    this.width = config.width || 420;
    this.height = config.height || 860;
    this.background = config.background || "#ece9e2";

    this.canvas = document.createElement("canvas");
    this.canvas.className = "game-canvas";
    this.ctx = this.canvas.getContext("2d", { alpha: false });

    this.cssWidth = 0;
    this.cssHeight = 0;
    this.dpr = 1;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
  }

  setLogicalSize(width, height) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
  }

  mount(parent) {
    parent.appendChild(this.canvas);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const parent = this.canvas.parentElement;
    const cssWidth = Math.max(1, (parent && parent.clientWidth) || rect.width || window.innerWidth);
    const cssHeight = Math.max(1, (parent && parent.clientHeight) || rect.height || window.innerHeight);

    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.dpr = window.devicePixelRatio || 1;

    this.canvas.width = Math.round(cssWidth * this.dpr);
    this.canvas.height = Math.round(cssHeight * this.dpr);

    this.scale = Math.min(cssWidth / this.width, cssHeight / this.height);
    this.offsetX = (cssWidth - this.width * this.scale) * 0.5;
    this.offsetY = (cssHeight - this.height * this.scale) * 0.5;
  }

  beginFrame() {
    const ctx = this.ctx;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);
  }

  endFrame() {
    // Intentionally empty for future post effects.
  }

  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left - this.offsetX) / this.scale;
    const y = (clientY - rect.top - this.offsetY) / this.scale;
    return { x, y };
  }

  clearWorld(color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  fillRoundedRect(x, y, width, height, radius, color) {
    const ctx = this.ctx;
    roundedRectPath(ctx, x, y, width, height, radius);
    ctx.fillStyle = color;
    ctx.fill();
  }

  strokeRoundedRect(x, y, width, height, radius, color, lineWidth = 1) {
    const ctx = this.ctx;
    roundedRectPath(ctx, x, y, width, height, radius);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  drawText(text, x, y, options = {}) {
    const ctx = this.ctx;
    const fontSize = options.size || 20;
    const fontWeight = options.weight || 700;
    const fontFamily = options.family || "Trebuchet MS, Verdana, Tahoma, sans-serif";

    ctx.fillStyle = options.color || "#111";
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textAlign = options.align || "left";
    ctx.textBaseline = options.baseline || "middle";
    ctx.fillText(text, x, y);
  }
}
