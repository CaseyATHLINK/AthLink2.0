/* AthLink neon loader — a light chases around the outline of the AthLink "A",
   drawing a neon trace as it goes (anime.js v4: svg.createMotionPath +
   svg.createDrawable). Replaces the old spinner. Respects prefers-reduced-motion
   (renders a static glowing logo instead of animating). */
import React, { useEffect, useRef } from "react";
import { animate, svg } from "animejs";

// AthLink "A" mark, hand-traced in a 220×210 viewBox.
//  · A_OUTER   — the bold outer silhouette (flat-top apex, splayed legs, two feet
//                with a notch between them). This is the loop the light chases.
//  · A_COUNTER — the triangular counter (the hole in the top of the A).
//  · A_LINK    — the interlocking chain-link crossbar (two rounded links).
const A_OUTER =
  "M96 16 L124 16 L202 194 L150 194 L132 150 L88 150 L70 194 L18 194 Z";
const A_COUNTER = "M110 68 L129 122 L91 122 Z";
const A_LINK =
  "M84 138 a14 14 0 0 1 0 -28 h20 a14 14 0 0 1 0 28 Z M116 138 a14 14 0 0 1 0 -28 h20 a14 14 0 0 1 0 28 Z";

const DURATION = 2600; // one full lap of the outline

export default function NeonLogoLoader({ label = "Loading" }) {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return; // static glow only — no motion

    const anims = [];
    try {
      // 1) Neon trace: draw the outline on, lap after lap.
      anims.push(
        animate(svg.createDrawable(root.querySelectorAll(".neon-trace")), {
          draw: "0 1",
          ease: "linear",
          duration: DURATION,
          loop: true,
        })
      );
      // 2) The chasing light: a comet head rides the same outline, staying at the
      //    head of the growing trace (same duration + linear ease → in lock-step).
      const outer = root.querySelector("#a-outer");
      if (outer) {
        anims.push(
          animate(root.querySelector(".comet"), {
            ease: "linear",
            duration: DURATION,
            loop: true,
            ...svg.createMotionPath(outer),
          })
        );
      }
      // 3) Gentle breathing pulse on the whole mark so it feels alive.
      anims.push(
        animate(root.querySelector(".neon-layer"), {
          opacity: [0.85, 1],
          ease: "inOutSine",
          duration: 1400,
          alternate: true,
          loop: true,
        })
      );
    } catch (err) {
      console.error("NeonLogoLoader anime error:", err && err.message, err);
    }

    return () => anims.forEach((a) => a && a.pause && a.pause());
  }, []);

  return (
    <div
      ref={rootRef}
      role="status"
      aria-label={label}
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "60vh",
        width: "100%",
        background:
          "radial-gradient(120% 90% at 50% 40%, #14315a 0%, #0e2445 55%, #091a34 100%)",
        borderRadius: "inherit",
      }}
    >
      <svg
        width="168"
        height="160"
        viewBox="0 0 220 210"
        fill="none"
        aria-hidden="true"
        style={{ overflow: "visible" }}
      >
        <defs>
          <linearGradient id="al-neon" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0d8ecf" />
            <stop offset="0.55" stopColor="#38a9e0" />
            <stop offset="1" stopColor="#9becff" />
          </linearGradient>
          {/* Soft neon-tube bloom (blur the stroke, stack it under the sharp one). */}
          <filter id="al-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="al-comet" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.35" stopColor="#d6f6ff" />
            <stop offset="1" stopColor="rgba(56,169,224,0)" />
          </radialGradient>
        </defs>

        {/* Faint always-on base outline so the logo is legible even between laps. */}
        <g
          fill="none"
          stroke="#3f7fb5"
          strokeOpacity="0.22"
          strokeWidth="7"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          <path d={A_OUTER} />
          <path d={A_COUNTER} />
          <path d={A_LINK} />
        </g>

        {/* Bright neon layer (glowing) — the trace paths are drawn on each lap. */}
        <g
          className="neon-layer"
          fill="none"
          stroke="url(#al-neon)"
          strokeWidth="7"
          strokeLinejoin="round"
          strokeLinecap="round"
          filter="url(#al-glow)"
        >
          <path id="a-outer" className="neon-trace" d={A_OUTER} />
          <path className="neon-trace" d={A_COUNTER} />
          <path className="neon-trace" d={A_LINK} />
        </g>

        {/* The chasing light: a bright core with a soft bloom, tangent to the path. */}
        <g className="comet">
          <circle r="15" fill="url(#al-comet)" opacity="0.9" />
          <circle r="4.5" fill="#ffffff" />
          <circle r="4.5" fill="#eaffff" style={{ filter: "blur(1px)" }} />
        </g>
      </svg>
    </div>
  );
}
