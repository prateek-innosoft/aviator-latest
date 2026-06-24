import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGame } from "../store/gameStore";
import { useAuth } from "../lib/authContext";
import { Plane } from "../assets/plane";
import { Avatar } from "./Avatar";

interface Pt {
  x: number;
  y: number;
}

/** Curve anchor points, hugging the bottom-left corner of the canvas. */
function anchors(W: number, H: number) {
  return {
    originX: W * 0.012,
    originY: H * 0.985,
    maxX: W * 0.82,
    maxY: H * 0.2,
  };
}

/**
 * Clean, smooth point on the flight curve.
 * `u` is the fraction along the curve (0 at corner, 1 at top-right).
 * No oscillation/noise — pure monotonic easing so the trail stays sleek.
 */
function pathPoint(u: number, W: number, H: number): Pt {
  const { originX, originY, maxX, maxY } = anchors(W, H);
  const c = Math.max(0, Math.min(1, u));
  const x = originX + (maxX - originX) * c;
  // ease-in rise => flat near the corner, steeper toward the top-right
  const ny = Math.pow(c, 1.5);
  const y = originY - (originY - maxY) * ny;
  return { x, y };
}

/** Map the live multiplier to curve progress (0..1), smooth + saturating. */
function progressFromMultiplier(m: number): number {
  return 1 - Math.exp(-(Math.max(1, m) - 1) * 0.4);
}

/** Central glow colour, interpolated across multiplier tiers. */
function glowColor(m: number): [number, number, number] {
  const stops: { m: number; c: [number, number, number] }[] = [
    { m: 1, c: [38, 122, 210] }, // blue / teal
    { m: 2, c: [92, 80, 205] }, // indigo
    { m: 5, c: [150, 52, 206] }, // purple
    { m: 12, c: [198, 36, 150] }, // magenta
  ];
  if (m <= stops[0].m) return stops[0].c;
  if (m >= stops[stops.length - 1].m) return stops[stops.length - 1].c;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (m >= a.m && m <= b.m) {
      const t = (m - a.m) / (b.m - a.m);
      return [
        Math.round(a.c[0] + (b.c[0] - a.c[0]) * t),
        Math.round(a.c[1] + (b.c[1] - a.c[1]) * t),
        Math.round(a.c[2] + (b.c[2] - a.c[2]) * t),
      ];
    }
  }
  return stops[stops.length - 1].c;
}

export function GameCanvas() {
  const phase = useGame((s) => s.phase);
  const multiplier = useGame((s) => s.multiplier);
  const countdown = useGame((s) => s.countdown);
  const flyingStartedAt = useGame((s) => s.flyingStartedAt);
  const crashFlash = useGame((s) => s.crashFlash);
  const bets = useGame((s) => s.bets);
  const lastWinToast = useGame((s) => s.lastWinToast);
  const { profile } = useAuth();
  const isFunMode = !profile;

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const raysRef = useRef<HTMLDivElement>(null);
  const multRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const countValRef = useRef(0);

  const sizeRef = useRef({ w: 0, h: 0 });
  const planePos = useRef<Pt>({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);
  const crashAnimRef = useRef<gsap.core.Tween | null>(null);

  const [showToast, setShowToast] = useState(false);

  // Resize handling with DPR support.
  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ro = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect();
      sizeRef.current = { w: rect.width, h: rect.height };
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // Slowly rotate the sunburst rays.
  useEffect(() => {
    if (!raysRef.current) return;
    gsap.set(raysRef.current, {
      xPercent: -50,
      yPercent: -50,
      transformOrigin: "50% 50%",
    });
    const tw = gsap.to(raysRef.current, {
      rotate: 360,
      duration: 130,
      repeat: -1,
      ease: "none",
    });
    return () => {
      tw.kill();
    };
  }, []);

  // Crash → the trace freezes (drawn in the render loop) while the plane keeps
  // flying out past the boundary, then disappears once it is off-canvas.
  useEffect(() => {
    if (phase === "crashed" && planeRef.current) {
      crashAnimRef.current?.kill();
      const { w } = sizeRef.current;
      crashAnimRef.current = gsap.to(planeRef.current, {
        x: `+=${Math.max(460, w * 0.55)}`,
        y: "-=240",
        duration: 0.9,
        ease: "power2.in",
        onComplete: () => {
          if (planeRef.current) gsap.set(planeRef.current, { opacity: 0 });
        },
      });
    }
  }, [phase]);

  // Win toast lifecycle.
  useEffect(() => {
    if (!lastWinToast) return;
    setShowToast(true);
    const id = setTimeout(() => setShowToast(false), 2600);
    return () => clearTimeout(id);
  }, [lastWinToast]);

  // Main render loop.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const draw = () => {
      const { w, h } = sizeRef.current;
      ctx.clearRect(0, 0, w, h);

      const st = useGame.getState();
      const ph = st.phase;

      // Draw the curve only while flying. On crash the whole trace (line + fill)
      // disappears and the plane flies off on its own.
      if (ph === "flying") {
        const m = st.multiplier;
        const prog = progressFromMultiplier(m);
        const { originX } = anchors(w, h);
        const p = pathPoint(prog, w, h);
        planePos.current = p;

        // Dynamic central glow (drawn behind the curve, ahead of the rays).
        const [gr, gg, gb] = glowColor(m);
        const cx = w * 0.46;
        const cy = h * 0.52;
        const radius = Math.max(w, h) * 0.62;
        const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        glowGrad.addColorStop(0, `rgba(${gr},${gg},${gb},0.55)`);
        glowGrad.addColorStop(0.38, `rgba(${gr},${gg},${gb},0.22)`);
        glowGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glowGrad;
        ctx.fillRect(0, 0, w, h);

        // Sample the clean curve from corner to current progress.
        const steps = 64;
        const pts: Pt[] = [];
        for (let i = 0; i <= steps; i++) {
          pts.push(pathPoint((prog * i) / steps, w, h));
        }

        // Filled crimson area under the curve. Baseline is the canvas bottom
        // (`h`) so there is no gap between the fill and the background edge.
        ctx.beginPath();
        ctx.moveTo(originX, h);
        for (const pt of pts) ctx.lineTo(pt.x, pt.y);
        ctx.lineTo(p.x, h);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, h * 0.2, 0, h);
        grad.addColorStop(0, "rgba(233,38,74,0.55)");
        grad.addColorStop(0.6, "rgba(202,10,46,0.42)");
        grad.addColorStop(1, "rgba(150,4,36,0.2)");
        ctx.fillStyle = grad;
        ctx.fill();

        // Curve stroke with soft glow.
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (const pt of pts) ctx.lineTo(pt.x, pt.y);
        ctx.strokeStyle = "#fb314f";
        ctx.lineWidth = 5;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.shadowColor = "rgba(251,49,79,0.7)";
        ctx.shadowBlur = 18;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // While flying, the plane rides the curve tip (no rotation, translate
        // only). After the crash we leave it to the fly-out animation.
        if (ph === "flying" && planeRef.current) {
          const planeW = planeRef.current.offsetWidth || 200;
          const planeH = planeRef.current.offsetHeight || 116;
          gsap.set(planeRef.current, {
            x: p.x - planeW * 0.08,
            y: p.y - planeH * 0.62,
            rotate: 0,
            opacity: 1,
          });
        }
      } else if (ph === "betting") {
        if (planeRef.current) {
          const { originX, originY } = anchors(w, h);
          const planeH = planeRef.current.offsetHeight || 116;
          gsap.set(planeRef.current, {
            x: originX,
            y: originY - planeH * 0.62,
            rotate: 0,
            opacity: 0,
          });
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, flyingStartedAt]);

  const countdownPct = Math.max(0, Math.min(1, countdown / 5000));
  const playerCount = 180 + (bets.length % 80);

  // Animate the player counter (counts up/down toward the new value).
  useEffect(() => {
    const obj = { v: countValRef.current };
    const tw = gsap.to(obj, {
      v: playerCount,
      duration: 0.6,
      ease: "power1.out",
      onUpdate: () => {
        countValRef.current = obj.v;
        if (countRef.current)
          countRef.current.textContent = String(Math.round(obj.v));
      },
    });
    return () => {
      tw.kill();
    };
  }, [playerCount]);

  return (
    <div
      ref={wrapRef}
      data-phase={phase}
      data-countdown={countdown}
      className="relative aspect-[1.78/1] w-full overflow-hidden rounded-[22px] border border-[#2a2b2f] bg-[#050606] md:aspect-auto md:min-h-0 md:flex-1"
      style={{
        background: "#050606",
      }}
    >
      {/* Bold black-ray sunburst converging at the bottom-left corner */}
      <div
        ref={raysRef}
        data-testid="sunburst-rays"
        data-opacity={phase === "betting" ? "0" : "0.78"}
        className="pointer-events-none absolute transition-opacity duration-500"
        style={{
          width: "300%",
          height: "300%",
          left: "-10%",
          top: "112%",
          opacity: phase === "betting" ? 0 : 0.78,
          background:
            "repeating-conic-gradient(from 0deg at 50% 50%, rgba(0,0,0,0.86) 0deg 4deg, rgba(255,255,255,0.045) 4deg 9deg, rgba(0,0,0,0.86) 9deg 13deg)",
          maskImage:
            "radial-gradient(closest-side, #000 64%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(closest-side, #000 64%, transparent 100%)",
        }}
      />
      {/* Soft vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(130% 125% at -10% 112%, transparent 48%, rgba(0,0,0,0.72) 100%)",
        }}
      />

      {/* FUN MODE banner — only shown for unauthenticated/demo users */}
      {isFunMode && (
        <div className="absolute left-0 right-0 top-0 z-20">
          <div className="mx-auto w-full bg-gradient-to-b from-[#d99719] to-[#c37a02] py-[3px] text-center text-[10px] font-semibold tracking-[0.16em] text-white/95 shadow-sm sm:text-[11px]">
            FUN MODE
          </div>
        </div>
      )}

      {/* Curve canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 z-10" />

      {/* Plane */}
      <div
        ref={planeRef}
        className="pointer-events-none absolute left-0 top-0 z-20 h-[clamp(74px,13vw,150px)] w-[clamp(124px,22vw,260px)] will-change-transform"
        style={{ opacity: 0 }}
      >
        <Plane className="h-full w-full" />
      </div>

      {/* Multiplier / state text */}
      <div className="absolute inset-0 z-30 flex flex-col items-center justify-center">
        {phase === "betting" ? (
          <div className="flex w-full flex-col items-center gap-3 px-8 pt-5 sm:gap-4">
            <img
              src="/loading-logo.png"
              alt="Aviator"
              className="w-[min(54vw,340px)] max-w-[74%] select-none object-contain"
              draggable={false}
            />
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55 sm:text-[12px]">
              Loading next round
            </div>
            <div className="h-1 w-[min(54%,280px)] overflow-hidden rounded-full bg-white/12">
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-100 ease-linear"
                style={{ width: `${countdownPct * 100}%` }}
              />
            </div>
          </div>
        ) : (
          <div ref={multRef} className="flex flex-col items-center">
            {phase === "crashed" && (
              <div className="mb-1 text-[18px] font-bold uppercase tracking-[0.12em] text-white/90 sm:text-[26px]">
                Flew Away!
              </div>
            )}
            <div
              className={`text-stroke-dark font-extrabold tabular-nums leading-none ${
                phase === "crashed" ? "text-brand" : "text-white"
              }`}
              style={{ fontSize: "clamp(46px, 11vw, 96px)" }}
            >
              {multiplier.toFixed(2)}x
            </div>
          </div>
        )}
      </div>

      {/* Win toast */}
      {showToast && lastWinToast && (
        <div className="absolute left-1/2 top-3 z-40 -translate-x-1/2">
          <div className="flex flex-col items-center rounded-xl border border-[#3fd13f]/60 bg-[#123018]/95 px-5 py-2 text-center shadow-xl">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-white/80">
              You have cashed out
            </span>
            <span className="text-[15px] font-extrabold text-green-2">
              {lastWinToast.mult.toFixed(2)}x
            </span>
            <span className="text-[13px] font-bold text-white">
              +{lastWinToast.win.toFixed(2)} ZAR
            </span>
          </div>
        </div>
      )}

      {/* Player count bubble */}
      <div className="absolute bottom-2 right-2 z-30 flex items-center gap-1.5 rounded-full bg-black/50 px-2 py-1 backdrop-blur-sm">
        <div className="flex -space-x-2">
          {bets.slice(0, 3).map((b) => (
            <Avatar key={`pc-${b.id}`} id={b.avatar} size={18} />
          ))}
        </div>
        <span
          ref={countRef}
          className="min-w-[26px] text-center text-[11px] font-semibold tabular-nums text-white/85"
        >
          {playerCount}
        </span>
      </div>

      {/* Crash flash glow */}
      {crashFlash && phase === "crashed" && (
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 50%, rgba(229,5,57,0.16), transparent 70%)",
            animation: "pulse-soft 0.6s ease-out",
          }}
        />
      )}
    </div>
  );
}
