import { Input } from "./input.js";
import { Renderer } from "./renderer.js";
import { TweenManager } from "./tween.js";

export class Engine {
  constructor(config = {}) {
    this.width = config.width || 420;
    this.height = config.height || 860;
    this.background = config.background || "#ece9e2";
    this.parent = config.parent || document.body;
    this.adaptiveLayout = config.adaptiveLayout !== false;

    this.renderer = new Renderer({
      width: this.width,
      height: this.height,
      background: this.background
    });
    this.renderer.mount(this.parent);

    this.input = new Input(this.renderer);
    this.input.attach(this.renderer.canvas);

    this.tween = new TweenManager();

    this.scene = null;
    this.lastTime = 0;
    this.running = false;
    this.resizeRafId = 0;
    this.resizeObserver = null;

    this.loop = this.loop.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onViewportResize = this.onViewportResize.bind(this);
    this.requestResize = this.requestResize.bind(this);

    window.addEventListener("resize", this.requestResize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", this.requestResize);
      window.visualViewport.addEventListener("scroll", this.requestResize);
    }
    this.updateLogicalSize();
    this.initResizeObserver();
    this.onResize();
  }

  start(SceneClass) {
    this.setScene(SceneClass);
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  setScene(SceneClass) {
    if (this.scene && typeof this.scene.destroy === "function") {
      this.scene.destroy();
    }

    this.scene = new SceneClass(this);

    this.input.setHandlers({
      down: (x, y) => {
        if (this.scene && this.scene.onPointerDown) this.scene.onPointerDown(x, y);
      },
      up: (x, y) => {
        if (this.scene && this.scene.onPointerUp) this.scene.onPointerUp(x, y);
      },
      move: (x, y) => {
        if (this.scene && this.scene.onPointerMove) this.scene.onPointerMove(x, y);
      }
    });

    if (typeof this.scene.init === "function") {
      this.scene.init();
    }
    if (typeof this.scene.onResize === "function") {
      this.scene.onResize(this.width, this.height);
    }
  }

  loop(timestamp) {
    if (!this.running) return;

    const dt = Math.min(0.05, (timestamp - this.lastTime) / 1000);
    this.lastTime = timestamp;

    this.tween.update(dt);

    if (this.scene && typeof this.scene.update === "function") {
      this.scene.update(dt);
    }

    this.renderer.beginFrame();
    if (this.scene && typeof this.scene.render === "function") {
      this.scene.render(this.renderer);
    }
    this.renderer.endFrame();

    requestAnimationFrame(this.loop);
  }

  onResize() {
    this.updateLogicalSize();
    this.renderer.resize();
    if (this.scene && typeof this.scene.onResize === "function") {
      this.scene.onResize(this.width, this.height);
    }
  }

  onViewportResize() {
    this.requestResize();
  }

  requestResize() {
    if (this.resizeRafId) return;
    this.resizeRafId = requestAnimationFrame(() => {
      this.resizeRafId = 0;
      this.onResize();
    });
  }

  initResizeObserver() {
    if (typeof ResizeObserver !== "function") return;
    const target = this.parent;
    if (!target) return;

    this.resizeObserver = new ResizeObserver(() => {
      this.requestResize();
    });
    this.resizeObserver.observe(target);
  }

  updateLogicalSize() {
    if (!this.adaptiveLayout) return;

    const viewportW = window.innerWidth || this.width;
    const viewportH = window.innerHeight || this.height;
    const landscape = viewportW >= viewportH;

    const nextW = landscape ? 1120 : 420;
    const nextH = landscape ? 700 : 860;

    this.width = nextW;
    this.height = nextH;
    this.renderer.setLogicalSize(nextW, nextH);
  }

  stop() {
    this.running = false;
    this.input.detach(this.renderer.canvas);
    window.removeEventListener("resize", this.requestResize);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener("resize", this.requestResize);
      window.visualViewport.removeEventListener("scroll", this.requestResize);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.resizeRafId) {
      cancelAnimationFrame(this.resizeRafId);
      this.resizeRafId = 0;
    }
  }
}
