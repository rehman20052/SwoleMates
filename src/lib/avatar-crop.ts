export function avatarCrop(width: number, height: number, zoom: number, x: number, y: number) {
  const side = Math.max(1, Math.floor(Math.min(width, height) / Math.max(1, zoom)));
  return {
    originX: Math.round(Math.max(0, Math.min(width - side, (width - side) / 2 + x))),
    originY: Math.round(Math.max(0, Math.min(height - side, (height - side) / 2 + y))),
    width: side,
    height: side,
  };
}
