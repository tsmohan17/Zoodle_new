// Canvas Drawing Engine with Flood Fill, Bezier Smoothing, and Undo Support
class CanvasEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    this.isDrawing = false;
    this.isDrawerActive = false; // Only active when user's turn
    this.currentTool = 'brush'; // 'brush' | 'fill' | 'eraser'
    this.currentColor = '#000000';
    this.currentSize = 3;

    this.lastX = 0;
    this.lastY = 0;
    this.currentStrokePoints = [];

    this.history = []; // for local replay
    this.onStrokeEmit = null;
    this.onClearEmit = null;
    this.onFillEmit = null;

    this.initCanvas();
    this.bindEvents();
  }

  initCanvas() {
    // Fill with solid white initially
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  setDrawerActive(active) {
    this.isDrawerActive = active;
    const toolbar = document.getElementById('canvas-toolbar');
    if (toolbar) {
      if (active) {
        toolbar.classList.remove('disabled');
      } else {
        toolbar.classList.add('disabled');
      }
    }
  }

  bindEvents() {
    const getPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;

      let clientX = e.clientX;
      let clientY = e.clientY;

      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      }

      return {
        x: Math.round((clientX - rect.left) * scaleX),
        y: Math.round((clientY - rect.top) * scaleY)
      };
    };

    const startDraw = (e) => {
      if (!this.isDrawerActive) return;
      e.preventDefault();
      const { x, y } = getPos(e);

      if (this.currentTool === 'fill') {
        this.floodFill(x, y, this.currentColor);
        if (this.onFillEmit) {
          this.onFillEmit({ x, y, color: this.currentColor });
        }
        return;
      }

      this.isDrawing = true;
      this.lastX = x;
      this.lastY = y;
      this.currentStrokePoints = [{ x, y }];

      // Draw initial dot
      this.ctx.beginPath();
      this.ctx.arc(x, y, (this.currentTool === 'eraser' ? this.currentSize * 2 : this.currentSize) / 2, 0, Math.PI * 2);
      this.ctx.fillStyle = this.currentTool === 'eraser' ? '#ffffff' : this.currentColor;
      this.ctx.fill();
    };

    const moveDraw = (e) => {
      if (!this.isDrawerActive || !this.isDrawing) return;
      e.preventDefault();
      const { x, y } = getPos(e);

      const color = this.currentTool === 'eraser' ? '#ffffff' : this.currentColor;
      const size = this.currentTool === 'eraser' ? this.currentSize * 2.5 : this.currentSize;

      this.drawSmoothSegment(this.lastX, this.lastY, x, y, color, size);
      this.currentStrokePoints.push({ x, y });

      if (this.onStrokeEmit) {
        this.onStrokeEmit({
          fromX: this.lastX,
          fromY: this.lastY,
          toX: x,
          toY: y,
          color,
          size
        });
      }

      this.lastX = x;
      this.lastY = y;
    };

    const stopDraw = (e) => {
      if (!this.isDrawing) return;
      this.isDrawing = false;
      this.currentStrokePoints = [];
    };

    // Mouse events
    this.canvas.addEventListener('mousedown', startDraw);
    window.addEventListener('mousemove', moveDraw);
    window.addEventListener('mouseup', stopDraw);

    // Touch events for tablets / mobiles
    this.canvas.addEventListener('touchstart', startDraw, { passive: false });
    window.addEventListener('touchmove', moveDraw, { passive: false });
    window.addEventListener('touchend', stopDraw);
  }

  drawSmoothSegment(fromX, fromY, toX, toY, color, size) {
    this.ctx.beginPath();
    this.ctx.moveTo(fromX, fromY);
    this.ctx.lineTo(toX, toY);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = size;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.stroke();
  }

  // Breadth-First Flood Fill algorithm
  floodFill(startX, startY, fillColor) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (startX < 0 || startX >= w || startY < 0 || startY >= h) return;

    const imgData = this.ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    const targetColor = this.getPixelColor(data, startX, startY, w);
    const fillRgb = this.hexToRgb(fillColor);

    // If colors match, avoid infinite loop
    if (
      targetColor.r === fillRgb.r &&
      targetColor.g === fillRgb.g &&
      targetColor.b === fillRgb.b
    ) {
      return;
    }

    const queue = [[startX, startY]];
    const visited = new Uint8Array(w * h);

    const matchesTarget = (x, y) => {
      const idx = (y * w + x) * 4;
      return (
        Math.abs(data[idx] - targetColor.r) < 32 &&
        Math.abs(data[idx + 1] - targetColor.g) < 32 &&
        Math.abs(data[idx + 2] - targetColor.b) < 32
      );
    };

    while (queue.length > 0) {
      const [curX, curY] = queue.pop();
      const posIdx = curY * w + curX;

      if (visited[posIdx]) continue;
      visited[posIdx] = 1;

      const pIdx = posIdx * 4;
      data[pIdx] = fillRgb.r;
      data[pIdx + 1] = fillRgb.g;
      data[pIdx + 2] = fillRgb.b;
      data[pIdx + 3] = 255;

      // 4-way neighbors
      if (curX > 0 && !visited[posIdx - 1] && matchesTarget(curX - 1, curY)) {
        queue.push([curX - 1, curY]);
      }
      if (curX < w - 1 && !visited[posIdx + 1] && matchesTarget(curX + 1, curY)) {
        queue.push([curX + 1, curY]);
      }
      if (curY > 0 && !visited[posIdx - w] && matchesTarget(curX, curY - 1)) {
        queue.push([curX, curY - 1]);
      }
      if (curY < h - 1 && !visited[posIdx + w] && matchesTarget(curX, curY + 1)) {
        queue.push([curX, curY + 1]);
      }
    }

    this.ctx.putImageData(imgData, 0, 0);
  }

  getPixelColor(data, x, y, width) {
    const idx = (y * width + x) * 4;
    return {
      r: data[idx],
      g: data[idx + 1],
      b: data[idx + 2],
      a: data[idx + 3]
    };
  }

  hexToRgb(hex) {
    let clean = hex.replace('#', '');
    if (clean.length === 3) {
      clean = clean.split('').map(c => c + c).join('');
    }
    const num = parseInt(clean, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  clear() {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  restoreHistory(history) {
    this.clear();
    if (!Array.isArray(history)) return;
    history.forEach(item => {
      if (item.fromX !== undefined) {
        this.drawSmoothSegment(item.fromX, item.fromY, item.toX, item.toY, item.color, item.size);
      } else if (item.x !== undefined && item.color) {
        this.floodFill(item.x, item.y, item.color);
      }
    });
  }
}
