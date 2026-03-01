import { clamp } from "./core.js";

function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export class UIButton {
  constructor(config = {}) {
    this.x = config.x || 0;
    this.y = config.y || 0;
    this.w = config.w || 100;
    this.h = config.h || 44;
    this.label = config.label || "Button";
    this.onClick = config.onClick || (() => {});
    this.enabled = config.enabled !== false;
    this.visible = config.visible !== false;
    this.style = {
      bg: config.bg || "#ffffff",
      text: config.text || "#1b1f23",
      border: config.border || "#b7c0cb",
      radius: config.radius || 12,
      fontSize: config.fontSize || 22
    };
  }

  setRect(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }

  contains(x, y) {
    return this.visible && this.enabled && pointInRect(x, y, this);
  }

  trigger() {
    if (this.enabled && this.visible) {
      this.onClick();
      return true;
    }
    return false;
  }

  draw(renderer) {
    if (!this.visible) return;

    const alpha = this.enabled ? 1 : 0.45;
    const ctx = renderer.ctx;

    renderer.fillRoundedRect(this.x, this.y, this.w, this.h, this.style.radius, this.style.bg);
    renderer.strokeRoundedRect(this.x, this.y, this.w, this.h, this.style.radius, this.style.border, 2);

    ctx.save();
    ctx.globalAlpha = alpha;
    renderer.drawText(
      typeof this.label === "function" ? this.label() : this.label,
      this.x + this.w * 0.5,
      this.y + this.h * 0.53,
      {
        align: "center",
        baseline: "middle",
        size: clamp(this.style.fontSize, 12, 28),
        color: this.style.text,
        weight: 700
      }
    );
    ctx.restore();
  }
}

export class UIManager {
  constructor() {
    this.controls = [];
  }

  clear() {
    this.controls.length = 0;
  }

  add(control) {
    this.controls.push(control);
    return control;
  }

  handlePointerDown(x, y) {
    for (let i = this.controls.length - 1; i >= 0; i -= 1) {
      const control = this.controls[i];
      if (control.contains(x, y)) {
        return control.trigger();
      }
    }
    return false;
  }

  draw(renderer) {
    for (let i = 0; i < this.controls.length; i += 1) {
      this.controls[i].draw(renderer);
    }
  }
}
