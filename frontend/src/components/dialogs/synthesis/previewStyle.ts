export function hexWithOpacity(hexColor: string, opacity: number): string {
  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hexColor}${alpha}`;
}

export function buildAssLikeTextShadow(params: {
  outlineSize: number;
  outlineColor: string;
  shadowSize: number;
  backgroundEnabled: boolean;
}): string | undefined {
  const { outlineSize, outlineColor, shadowSize, backgroundEnabled } = params;
  const shadows: string[] = [];

  if (!backgroundEnabled && outlineSize > 0) {
    const radius = Math.max(1, outlineSize);
    for (let y = -radius; y <= radius; y += 1) {
      for (let x = -radius; x <= radius; x += 1) {
        if (x === 0 && y === 0) continue;
        if (Math.max(Math.abs(x), Math.abs(y)) > radius) continue;
        shadows.push(`${x}px ${y}px 0 ${outlineColor}`);
      }
    }
  }

  if (shadowSize > 0) {
    const offset = Math.max(1, Math.round(shadowSize));
    const blur = Math.max(1, Math.round(shadowSize));
    shadows.push(`${offset}px ${offset}px 0 rgba(0,0,0,0.88)`);
    shadows.push(`${offset}px ${offset}px ${blur}px rgba(0,0,0,0.35)`);
  }

  return shadows.length > 0 ? shadows.join(", ") : undefined;
}

export function getSubtitlePadding(
  backgroundEnabled: boolean,
  backgroundPadding: number,
): string {
  if (backgroundEnabled) {
    const padding = Math.max(0, Math.round(backgroundPadding));
    return `${padding}px`;
  }
  return "8px 16px";
}
