type Rgba = readonly [number, number, number, number];

function color(value: string): Rgba {
  const input = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/u.test(input)) return [Number.parseInt(input.slice(1, 3), 16), Number.parseInt(input.slice(3, 5), 16), Number.parseInt(input.slice(5, 7), 16), 1];
  if (/^#[0-9a-f]{3}$/u.test(input)) return [...input.slice(1).split("").map((digit) => Number.parseInt(digit + digit, 16)), 1] as unknown as Rgba;
  const match = input.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/u);
  if (match) return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])];
  throw new Error(`Unsupported pixel-canvas color: ${value}`);
}

export class PixelCanvasContext {
  fillStyle = "#000000";
  strokeStyle = "#000000";
  globalAlpha = 1;
  imageSmoothingEnabled = false;

  constructor(readonly canvas: PixelCanvas) {}

  clearRect(x: number, y: number, width: number, height: number) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.canvas.width, Math.ceil(x + width));
    const y1 = Math.min(this.canvas.height, Math.ceil(y + height));
    for (let py = y0; py < y1; py += 1) for (let px = x0; px < x1; px += 1) {
      const offset = (py * this.canvas.width + px) * 4;
      this.canvas.pixels.fill(0, offset, offset + 4);
    }
  }

  fillRect(x: number, y: number, width: number, height: number) {
    const [red, green, blue, parsedAlpha] = color(this.fillStyle);
    const alpha = Math.max(0, Math.min(1, parsedAlpha * this.globalAlpha));
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.canvas.width, Math.ceil(x + width));
    const y1 = Math.min(this.canvas.height, Math.ceil(y + height));
    for (let py = y0; py < y1; py += 1) for (let px = x0; px < x1; px += 1) {
      const offset = (py * this.canvas.width + px) * 4;
      const destinationAlpha = this.canvas.pixels[offset + 3] / 255;
      const outputAlpha = alpha + destinationAlpha * (1 - alpha);
      if (outputAlpha <= 0) {
        this.canvas.pixels.fill(0, offset, offset + 4);
        continue;
      }
      this.canvas.pixels[offset] = Math.round((red * alpha + this.canvas.pixels[offset] * destinationAlpha * (1 - alpha)) / outputAlpha);
      this.canvas.pixels[offset + 1] = Math.round((green * alpha + this.canvas.pixels[offset + 1] * destinationAlpha * (1 - alpha)) / outputAlpha);
      this.canvas.pixels[offset + 2] = Math.round((blue * alpha + this.canvas.pixels[offset + 2] * destinationAlpha * (1 - alpha)) / outputAlpha);
      this.canvas.pixels[offset + 3] = Math.round(outputAlpha * 255);
    }
  }

  strokeRect(x: number, y: number, width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    const previousFill = this.fillStyle;
    this.fillStyle = this.strokeStyle;
    this.fillRect(x - 0.5, y - 0.5, width + 1, 1);
    this.fillRect(x - 0.5, y + height - 0.5, width + 1, 1);
    this.fillRect(x - 0.5, y + 0.5, 1, Math.max(0, height - 1));
    this.fillRect(x + width - 0.5, y + 0.5, 1, Math.max(0, height - 1));
    this.fillStyle = previousFill;
  }
}

export class PixelCanvas {
  private pixelWidth = 0;
  private pixelHeight = 0;
  pixels = new Uint8ClampedArray();
  readonly context = new PixelCanvasContext(this);

  get width() { return this.pixelWidth; }
  set width(value: number) { this.pixelWidth = Math.max(0, Math.trunc(value)); this.resize(); }
  get height() { return this.pixelHeight; }
  set height(value: number) { this.pixelHeight = Math.max(0, Math.trunc(value)); this.resize(); }

  private resize() {
    this.pixels = new Uint8ClampedArray(this.pixelWidth * this.pixelHeight * 4);
  }

  getContext(kind: string) {
    return kind === "2d" ? this.context : null;
  }
}

export function installPixelCanvasDocument() {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  const canvases: PixelCanvas[] = [];
  const documentShim = {
    createElement(tagName: string) {
      if (tagName.toLowerCase() !== "canvas") throw new Error(`Pixel document only supports canvas, received ${tagName}.`);
      const canvas = new PixelCanvas();
      canvases.push(canvas);
      return canvas;
    },
  };
  Object.defineProperty(globalThis, "document", { configurable: true, value: documentShim });
  return {
    canvases,
    restore() {
      if (previous) Object.defineProperty(globalThis, "document", previous);
      else Reflect.deleteProperty(globalThis, "document");
    },
  };
}
