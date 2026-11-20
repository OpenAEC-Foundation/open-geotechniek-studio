// De boorstaat op het scherm: dezelfde tekenopdrachten als in het rapport, als SVG.
import { memo } from "react";
import type { Scene } from "./scene";

const PT = 25.4 / 72;

function BoorstaatSvg({ scene, width, label }: { scene: Scene; width?: number | string; label?: string }) {
  return (
    <svg className="boorstaat-svg" role="img" aria-label={label} viewBox={`0 0 ${scene.width} ${scene.height}`}
      width={width} style={{ background: "#fff", fontFamily: "Helvetica, Arial, sans-serif", display: "block" }}>
      {scene.items.map((p, i) => {
        if (p.t === "rect") return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill ?? "none"} stroke={p.stroke} strokeWidth={p.stroke ? p.lw ?? 0.2 : undefined} />;
        if (p.t === "line") return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={p.stroke} strokeWidth={p.lw} />;
        if (p.t === "circle") return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={p.fill ?? "none"} stroke={p.stroke} strokeWidth={p.stroke ? p.lw ?? 0.15 : undefined} />;
        if (p.t === "poly") return <polygon key={i} points={p.points.map((q) => q.join(",")).join(" ")} fill={p.fill} />;
        return (
          <text key={i} x={p.x} y={p.y} fontSize={p.size * PT} fontWeight={p.bold ? 700 : 400} fontStyle={p.italic ? "italic" : undefined}
            textAnchor={p.align === "right" ? "end" : p.align === "center" ? "middle" : "start"} fill={p.color ?? "#191919"} style={{ whiteSpace: "pre" }}>{p.text}</text>
        );
      })}
    </svg>
  );
}

export default memo(BoorstaatSvg);
