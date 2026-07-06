import { Image } from "antd";
import { useMemo, useState } from "react";

const fallbackColors = [
    ["#17231f", "#28705c", "#5fd2aa"],
    ["#1c1917", "#92400e", "#f59e0b"],
    ["#1e293b", "#475569", "#cbd5e1"],
    ["#111827", "#1d4ed8", "#67e8f9"],
    ["#1f1a2e", "#9f1239", "#fb7185"],
    ["#0f172a", "#581c87", "#22d3ee"],
];

export function PromptImage({ src, title, seed = 0, className = "aspect-[4/3] w-full object-cover" }: { src?: string; title: string; seed?: number; className?: string }) {
    const [failed, setFailed] = useState(false);
    const fallback = useMemo(() => promptImageFallback(title, seed), [seed, title]);
    const imageSrc = src && !failed ? src : fallback;

    return (
        <Image
            src={imageSrc}
            fallback={fallback}
            alt={title}
            width="100%"
            className={className}
            preview={{ src: imageSrc }}
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
        />
    );
}

export function extractPromptPreviewImages(value: string) {
    return Array.from(value.matchAll(/!\[[^\]]*]\(([^)]+)\)/g), (match) => match[1]).filter(Boolean);
}

export function promptImageFallback(title: string, seed = 0) {
    const colors = fallbackColors[Math.abs(seed) % fallbackColors.length];
    const label = escapeSvgText(title.slice(0, 18) || "Prompt");
    const index = String((Math.abs(seed) % 99) + 1).padStart(2, "0");
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${colors[0]}"/>
      <stop offset=".58" stop-color="${colors[1]}"/>
      <stop offset="1" stop-color="${colors[2]}"/>
    </linearGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M48 0H0v48" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="960" height="720" fill="url(#g)"/>
  <rect width="960" height="720" fill="url(#grid)" opacity=".5"/>
  <circle cx="790" cy="110" r="150" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="2"/>
  <rect x="96" y="430" width="260" height="132" rx="22" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.24)" transform="rotate(-9 226 496)"/>
  <rect x="690" y="110" width="124" height="124" rx="22" fill="rgba(0,0,0,.14)" stroke="rgba(255,255,255,.25)"/>
  <text x="752" y="183" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="34" font-weight="700" fill="rgba(255,255,255,.88)">${index}</text>
  <text x="82" y="126" font-family="ui-sans-serif, system-ui, sans-serif" font-size="42" font-weight="700" fill="rgba(255,255,255,.92)">${label}</text>
  <text x="82" y="178" font-family="ui-sans-serif, system-ui, sans-serif" font-size="20" fill="rgba(255,255,255,.7)">提示词预览</text>
</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeSvgText(value: string) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
