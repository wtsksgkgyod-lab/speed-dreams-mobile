// Unit-testable input model; DOM/physics engine are intentionally outside.
export const clamp = (n, lo, hi) => Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 0;

export class MobileControls {
  constructor() {
    this.steering = 0;
    this.throttle = 0;
    this.brake = 0;
    this.automatic = true;
    this.upSeq = 0;
    this.downSeq = 0;
    this.enabled = false;
  }
  setAxis(name, value) {
    if (!['steering','throttle','brake'].includes(name)) throw new Error('Invalid axis');
    this[name] = clamp(value, name === 'steering' ? -1 : 0, 1);
  }
  shift(direction) {
    if (this.automatic || !this.enabled) return;
    if (direction === 'up') this.upSeq = (this.upSeq + 1) >>> 0;
    else if (direction === 'down') this.downSeq = (this.downSeq + 1) >>> 0;
    else throw new Error('Invalid shift');
  }
  releaseAll() { this.steering = this.throttle = this.brake = 0; }
  snapshot() { return [this.steering, this.throttle, this.brake, this.automatic ? 1 : 0, this.upSeq | 0, this.downSeq | 0]; }
}

export class PointerOwnership {
  constructor(controls) { this.controls = controls; this.owner = new Map(); }
  acquire(axis, id) {
    if (this.owner.has(axis) || [...this.owner.values()].includes(id)) return false;
    this.owner.set(axis, id); return true;
  }
  owns(axis, id) { return this.owner.get(axis) === id; }
  release(axis, id) {
    if (!this.owns(axis,id)) return false;
    this.owner.delete(axis); this.controls.setAxis(axis,0); return true;
  }
  releaseAll() { this.owner.clear(); this.controls.releaseAll(); }
}
