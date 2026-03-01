import { clamp, easeOutCubic, lerp } from "./core.js";

export class TweenManager {
  constructor() {
    this.tweens = [];
  }

  to(target, property, toValue, duration, options = {}) {
    const fromValue = Number(target[property]) || 0;
    const tween = {
      target,
      property,
      fromValue,
      toValue,
      duration: Math.max(0.001, duration),
      elapsed: 0,
      easing: options.easing || easeOutCubic,
      onComplete: options.onComplete || null
    };
    this.tweens.push(tween);
    return tween;
  }

  clear() {
    this.tweens.length = 0;
  }

  update(dt) {
    for (let i = this.tweens.length - 1; i >= 0; i -= 1) {
      const tween = this.tweens[i];
      tween.elapsed += dt;
      const t = clamp(tween.elapsed / tween.duration, 0, 1);
      const eased = tween.easing(t);
      tween.target[tween.property] = lerp(tween.fromValue, tween.toValue, eased);

      if (t >= 1) {
        if (typeof tween.onComplete === "function") {
          tween.onComplete();
        }
        this.tweens.splice(i, 1);
      }
    }
  }
}
