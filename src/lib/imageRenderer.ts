/**
 * Canvas Image Renderer - Floyd-Steinberg Dithering & Progressive Drawing
 * 2000年代初頭の写メール画像描画を再現
 */

// 256色 Web Safe-ish パレット
function generate256Palette(): [number, number, number][] {
  const palette: [number, number, number][] = [];
  // 6x6x6 color cube
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        palette.push([Math.round(r * 51), Math.round(g * 51), Math.round(b * 51)]);
      }
    }
  }
  // Fill remaining with grays
  for (let i = palette.length; i < 256; i++) {
    const v = Math.round((i - 216) * (255 / 40));
    palette.push([v, v, v]);
  }
  return palette;
}

const PALETTE_256 = generate256Palette();

function findClosestColor(
  r: number,
  g: number,
  b: number,
  palette: [number, number, number][]
): [number, number, number] {
  let minDist = Infinity;
  let closest: [number, number, number] = [0, 0, 0];

  for (const [pr, pg, pb] of palette) {
    const dr = r - pr;
    const dg = g - pg;
    const db = b - pb;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < minDist) {
      minDist = dist;
      closest = [pr, pg, pb];
    }
  }
  return closest;
}

/**
 * Floyd-Steinberg ディザリング
 */
function floydSteinbergDither(
  imageData: ImageData,
  palette: [number, number, number][]
): ImageData {
  const { width, height, data } = imageData;
  const out = new Uint8ClampedArray(data);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      const oldR = out[idx];
      const oldG = out[idx + 1];
      const oldB = out[idx + 2];

      const [newR, newG, newB] = findClosestColor(oldR, oldG, oldB, palette);

      out[idx] = newR;
      out[idx + 1] = newG;
      out[idx + 2] = newB;

      const errR = oldR - newR;
      const errG = oldG - newG;
      const errB = oldB - newB;

      // Distribute error to neighbors
      const distribute = (dx: number, dy: number, factor: number) => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = (ny * width + nx) * 4;
          out[nIdx] += errR * factor;
          out[nIdx + 1] += errG * factor;
          out[nIdx + 2] += errB * factor;
        }
      };

      distribute(1, 0, 7 / 16);
      distribute(-1, 1, 3 / 16);
      distribute(0, 1, 5 / 16);
      distribute(1, 1, 1 / 16);
    }
  }

  return new ImageData(out, width, height);
}

/**
 * 画像を低解像度にリサイズ
 */
function resizeImage(
  img: HTMLImageElement,
  maxWidth: number,
  maxHeight: number
): { canvas: HTMLCanvasElement; width: number; height: number } {
  const aspectRatio = img.width / img.height;
  let newWidth = maxWidth;
  let newHeight = maxHeight;

  if (aspectRatio > maxWidth / maxHeight) {
    newHeight = Math.round(maxWidth / aspectRatio);
  } else {
    newWidth = Math.round(maxHeight * aspectRatio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = newWidth;
  canvas.height = newHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, newWidth, newHeight);

  return { canvas, width: newWidth, height: newHeight };
}

export interface RenderOptions {
  maxWidth?: number;
  maxHeight?: number;
  sliceHeight?: number;
  delayMs?: number;
  use256Color?: boolean;
  onProgress?: (progress: number) => void;
  onComplete?: () => void;
}

/**
 * プログレッシブ描画エンジン
 * 画像を上から下にスライスごとに描画する
 */
export function renderProgressiveImage(
  targetCanvas: HTMLCanvasElement,
  imageUrl: string,
  options: RenderOptions = {}
): () => void {
  const {
    maxWidth = 120,
    maxHeight = 90,
    sliceHeight = 2,
    delayMs = 50,
    use256Color = true,
    onProgress,
    onComplete,
  } = options;

  let cancelled = false;

  const img = new Image();
  img.crossOrigin = "anonymous";

  img.onload = () => {
    if (cancelled) return;

    // 1. Resize to low resolution
    const { canvas: resized, width, height } = resizeImage(
      img,
      maxWidth,
      maxHeight
    );

    // Set target canvas size
    targetCanvas.width = width;
    targetCanvas.height = height;
    const targetCtx = targetCanvas.getContext("2d")!;
    targetCtx.imageSmoothingEnabled = false;

    // 2. Get pixel data and apply dithering
    const resizedCtx = resized.getContext("2d")!;
    const originalData = resizedCtx.getImageData(0, 0, width, height);

    let processedData: ImageData;
    if (use256Color) {
      processedData = floydSteinbergDither(originalData, PALETTE_256);
    } else {
      processedData = originalData;
    }

    // 3. Progressive slice drawing
    let currentY = 0;
    const totalSlices = Math.ceil(height / sliceHeight);
    let sliceIndex = 0;

    const drawNextSlice = () => {
      if (cancelled || currentY >= height) {
        if (!cancelled) {
          onProgress?.(1);
          onComplete?.();
        }
        return;
      }

      const endY = Math.min(currentY + sliceHeight, height);
      const sliceData = targetCtx.createImageData(width, endY - currentY);

      for (let y = currentY; y < endY; y++) {
        for (let x = 0; x < width; x++) {
          const srcIdx = (y * width + x) * 4;
          const dstIdx = ((y - currentY) * width + x) * 4;
          sliceData.data[dstIdx] = processedData.data[srcIdx];
          sliceData.data[dstIdx + 1] = processedData.data[srcIdx + 1];
          sliceData.data[dstIdx + 2] = processedData.data[srcIdx + 2];
          sliceData.data[dstIdx + 3] = processedData.data[srcIdx + 3];
        }
      }

      targetCtx.putImageData(sliceData, 0, currentY);
      currentY = endY;
      sliceIndex++;

      onProgress?.(sliceIndex / totalSlices);

      setTimeout(drawNextSlice, delayMs);
    };

    // Small initial delay for dramatic effect
    setTimeout(drawNextSlice, 200);
  };

  img.onerror = () => {
    if (!cancelled) {
      // Draw error placeholder
      targetCanvas.width = maxWidth;
      targetCanvas.height = 30;
      const ctx = targetCanvas.getContext("2d")!;
      ctx.fillStyle = "#ddd";
      ctx.fillRect(0, 0, maxWidth, 30);
      ctx.fillStyle = "#888";
      ctx.font = "8px monospace";
      ctx.fillText("画像ﾛｰﾄﾞｴﾗｰ", 4, 18);
      onComplete?.();
    }
  };

  img.src = imageUrl;

  // Return cancel function
  return () => {
    cancelled = true;
  };
}

/**
 * 画像ファイルサイズを人間に読みやすい形式で返す (KB表示)
 */
export function formatFileSize(bytes: number): string {
  return `${Math.round(bytes / 1024)}KB`;
}
