"use client";

/**
 * Pháo giấy nhẹ bằng canvas (không thư viện): bắn từ 2 góc dưới + rơi từ trên, tự dọn sau ~3,5 giây.
 * Người dùng bật "Giảm chuyển động" → không bắn (chỉ hiện lời chúc mừng).
 */
const COLORS = ["#f59e0b", "#fbbf24", "#f43f5e", "#38bdf8", "#34d399", "#a78bfa", "#fb923c"];
const DURATION_MS = 3500;

type Piece = { x: number; y: number; vx: number; vy: number; size: number; color: string; rot: number; vr: number; shape: 0 | 1 | 2 };

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function fireConfetti(): () => void {
  if (typeof document === "undefined" || prefersReducedMotion()) return () => {};
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:95";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return () => {};
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  // Màn nhỏ → ít mảnh hơn (mượt trên máy yếu)
  const count = Math.round(Math.min(160, Math.max(80, w / 5)));
  const pieces: Piece[] = [];
  for (let i = 0; i < count; i++) {
    const from = i % 3; // 0: góc trái, 1: góc phải, 2: rơi từ trên
    const piece: Piece =
      from === 2
        ? { x: rand(0, w), y: rand(-h * 0.4, -10), vx: rand(-1, 1), vy: rand(1, 3), size: rand(6, 10), color: "", rot: 0, vr: 0, shape: 0 }
        : {
            x: from === 0 ? rand(-10, w * 0.1) : rand(w * 0.9, w + 10),
            y: h + 10,
            vx: (from === 0 ? 1 : -1) * rand(3, 8),
            vy: -rand(11, 17) * Math.min(1.2, h / 700),
            size: rand(6, 11),
            color: "",
            rot: 0,
            vr: 0,
            shape: 0,
          };
    piece.color = COLORS[i % COLORS.length]!;
    piece.rot = rand(0, Math.PI * 2);
    piece.vr = rand(-0.25, 0.25);
    piece.shape = (i % 3) as Piece["shape"];
    pieces.push(piece);
  }

  const start = performance.now();
  let raf = 0;
  const stop = () => {
    cancelAnimationFrame(raf);
    canvas.remove();
  };
  const frame = (now: number) => {
    const t = now - start;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = t > DURATION_MS - 700 ? Math.max(0, (DURATION_MS - t) / 700) : 1;
    for (const p of pieces) {
      p.vy += 0.28; // trọng lực
      p.vx *= 0.99; // cản gió
      p.vy = Math.min(p.vy, 6);
      p.x += p.vx + Math.sin((t + p.size * 40) / 260) * 0.6;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 0) ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      else if (p.shape === 1) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -p.size / 2);
        ctx.lineTo(p.size / 2, p.size / 2);
        ctx.lineTo(-p.size / 2, p.size / 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    if (t < DURATION_MS) raf = requestAnimationFrame(frame);
    else stop();
  };
  raf = requestAnimationFrame(frame);
  return stop;
}
