import type { RefObject } from "react";

/** The SVG is visible before hydration, with reduced motion, or without WebGL. */
export function ContourSea({ canvasRef }: { canvasRef: RefObject<HTMLCanvasElement | null> }) {
  return (
    <div className="contour-sea" aria-hidden="true">
      <canvas ref={canvasRef} className="contour-sea__canvas" />
      <svg className="contour-sea__still" viewBox="0 0 1440 900" preserveAspectRatio="none" fill="none">
        {Array.from({ length: 18 }, (_, i) => (
          <g key={i} stroke="currentColor" strokeWidth="0.8">
            <path d={`M ${-100 + i * 20} -40 C ${220 + i * 17} 180, ${-200 + i * 18} 460, ${100 + i * 20} 940`} />
            <path d={`M ${1320 + i * 20} -40 C ${1040 + i * 17} 260, ${1400 + i * 18} 580, ${1120 + i * 20} 940`} />
          </g>
        ))}
      </svg>
    </div>
  );
}
