// SRC-01 source-scene rig (receiver-ux-v2 T13/T19/T35).
//
// Changes ONLY the real pixels of the ORIGINAL sender window through a visual
// overlay: a real code frame captured from the live sender is re-displayed
// as an opaque <img> over the exact canvas rect, or a full-window opaque
// blank layer hides every code pixel. Nothing here injects frames,
// ArrayBuffers, Worker messages or reports into the receiver; the receiver
// always sees genuine getDisplayMedia pixels.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const OVERLAY_ID = 'src01-scene-overlay';
export const SENDER_TITLE = 'CIMBAR-SENDER-WINDOW';
export const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

export function sha256FileBytes(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export class SourceScene {
  constructor(page, { proofDir }) {
    this.page = page;
    this.proofDir = proofDir;
  }

  // Load the locked real input into the original sender and pin its window
  // title (the capture picker selects the window by this title).
  async loadInput(filePath) {
    await this.page.setInputFiles('#file_input', filePath);
    await sleep(1200);
    await this.page.evaluate((title) => {
      document.documentElement.setAttribute('translate', 'no');
      document.documentElement.lang = 'en';
      document.title = title;
      setInterval(() => { if (document.title !== title) document.title = title; }, 250);
    }, SENDER_TITLE);
    await sleep(400);
  }

  async canvasRect() {
    return this.page.evaluate(() => {
      const canvas = document.getElementById('canvas');
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        left: rect.left, top: rect.top, width: rect.width, height: rect.height,
        naturalWidth: canvas.width, naturalHeight: canvas.height,
      };
    });
  }

  // Wait until the sender canvas is genuinely animating (two clipped frames
  // differ). A paused/still window is not "playing the real code".
  async waitAnimating(timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    let previous = null;
    while (Date.now() < deadline) {
      const rect = await this.canvasRect();
      if (!rect) { await sleep(200); continue; }
      const shot = await this.page.screenshot({
        clip: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      });
      const digest = sha256FileBytes(shot);
      if (previous !== null && digest !== previous) {
        return { at: Date.now(), changed: true, digest };
      }
      previous = digest;
      await sleep(350);
    }
    return { at: Date.now(), changed: false, digest: previous };
  }

  // Capture one REAL frame of the playing sender as a PNG inside the proof
  // attempt directory. Returns the proof file, its SHA-256 and natural size.
  async captureCodeFrame(name = 'src01-code-frame.png') {
    mkdirSync(this.proofDir, { recursive: true });
    const rect = await this.canvasRect();
    if (!rect) throw new Error('sender canvas not found');
    const target = join(this.proofDir, name);
    await this.page.screenshot({
      path: target,
      clip: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    });
    const bytes = readFileSync(target);
    return {
      path: target,
      file: name,
      sha256: sha256FileBytes(bytes),
      bytes: bytes.length,
      rect,
    };
  }

  // Opaque still layer over the exact canvas rect: the source window keeps
  // showing ONE real code frame (real repeated-data pixels).
  //
  // A fully static window can starve the OS/WebRTC capture pipeline (no new
  // frames -> no decodes at all), which would make "repeated valid codes"
  // untestable. A 10px liveness ticker OUTSIDE the code rect keeps the window
  // changing without touching a single code pixel; its placement is recorded
  // in __sourceScene so the evidence says exactly where it was.
  async showStill(framePath) {
    const base64 = readFileSync(framePath).toString('base64');
    return this.page.evaluate(({ data, id }) => {
      document.getElementById(id)?.remove();
      document.getElementById(`${id}-tick`)?.remove();
      const canvas = document.getElementById('canvas');
      if (!canvas) throw new Error('sender canvas not found');
      const rect = canvas.getBoundingClientRect();
      const image = document.createElement('img');
      image.id = id;
      image.src = `data:image/png;base64,${data}`;
      Object.assign(image.style, {
        position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`,
        width: `${rect.width}px`, height: `${rect.height}px`,
        background: '#000', zIndex: '2147483647', pointerEvents: 'none',
      });
      document.body.appendChild(image);
      const margin = 4;
      const right = rect.left + rect.width;
      const bottom = rect.top + rect.height;
      const candidates = [
        { x: margin, y: margin },
        { x: Math.max(margin, window.innerWidth - 14), y: margin },
        { x: margin, y: Math.max(margin, window.innerHeight - 14) },
        { x: Math.max(margin, window.innerWidth - 14), y: Math.max(margin, window.innerHeight - 14) },
      ];
      const overlaps = (p) => p.x + 10 > rect.left && p.x < right && p.y + 10 > rect.top && p.y < bottom;
      const spot = candidates.find((p) => !overlaps(p)) || { x: margin, y: margin };
      const style = document.createElement('style');
      style.id = `${id}-tick-style`;
      style.textContent = '@keyframes src01tick { 0% { opacity: 1 } 50% { opacity: 0.05 } 100% { opacity: 1 } }';
      document.head.appendChild(style);
      const tick = document.createElement('div');
      tick.id = `${id}-tick`;
      Object.assign(tick.style, {
        position: 'fixed', left: `${spot.x}px`, top: `${spot.y}px`,
        width: '10px', height: '10px', background: '#fff',
        zIndex: '2147483647', pointerEvents: 'none',
        animation: 'src01tick 0.5s steps(2, end) infinite',
      });
      document.body.appendChild(tick);
      window.__sourceScene = {
        mode: 'still', at: Date.now(),
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        liveness: { x: spot.x, y: spot.y, size: 10, outsideCodeRect: !overlaps(spot) },
      };
      return window.__sourceScene;
    }, { data: base64, id: OVERLAY_ID });
  }

  // Full-window opaque blank: every code pixel is hidden.
  async showBlank() {
    return this.page.evaluate((id) => {
      document.getElementById(id)?.remove();
      document.getElementById(`${id}-tick`)?.remove();
      const div = document.createElement('div');
      div.id = id;
      Object.assign(div.style, {
        position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh',
        background: '#000', zIndex: '2147483647', pointerEvents: 'none',
      });
      document.body.appendChild(div);
      window.__sourceScene = { mode: 'blank', at: Date.now() };
      return window.__sourceScene;
    }, OVERLAY_ID);
  }

  // Remove the test layer: the real sender animation is visible again.
  async restore() {
    return this.page.evaluate((id) => {
      document.getElementById(id)?.remove();
      document.getElementById(`${id}-tick`)?.remove();
      window.__sourceScene = { mode: 'live', at: Date.now() };
      return window.__sourceScene;
    }, OVERLAY_ID);
  }

  async sceneState() {
    return this.page.evaluate(() => window.__sourceScene || null);
  }

  // After Ready the journey stops the sending input; the original sender's
  // pause is a bounded cooldown (send.js togglePause), recorded as such - it
  // is never used as a stand-in for a sustained 8 s control.
  async pauseSending() {
    return this.page.evaluate(() => {
      const api = window.Send;
      if (!api || typeof api.togglePause !== 'function') return { paused: false, reason: 'Send.togglePause unavailable' };
      api.togglePause(true);
      return { paused: api.isPaused ? api.isPaused() : true, kind: 'bounded-cooldown' };
    });
  }
}
