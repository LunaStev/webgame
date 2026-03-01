export class Input {
  constructor(renderer) {
    this.renderer = renderer;
    this.queue = [];
    this.handlers = {
      down: null,
      up: null,
      move: null
    };

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
  }

  attach(canvas) {
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.style.touchAction = "none";
  }

  detach(canvas) {
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointercancel", this.onPointerUp);
  }

  setHandlers(handlers = {}) {
    this.handlers.down = handlers.down || null;
    this.handlers.up = handlers.up || null;
    this.handlers.move = handlers.move || null;
  }

  consumeQueue() {
    const batch = this.queue;
    this.queue = [];
    return batch;
  }

  onPointerDown(event) {
    const point = this.renderer.screenToWorld(event.clientX, event.clientY);
    this.queue.push({ type: "down", x: point.x, y: point.y });
    if (this.handlers.down) {
      this.handlers.down(point.x, point.y);
    }
  }

  onPointerUp(event) {
    const point = this.renderer.screenToWorld(event.clientX, event.clientY);
    this.queue.push({ type: "up", x: point.x, y: point.y });
    if (this.handlers.up) {
      this.handlers.up(point.x, point.y);
    }
  }

  onPointerMove(event) {
    const point = this.renderer.screenToWorld(event.clientX, event.clientY);
    this.queue.push({ type: "move", x: point.x, y: point.y });
    if (this.handlers.move) {
      this.handlers.move(point.x, point.y);
    }
  }
}
