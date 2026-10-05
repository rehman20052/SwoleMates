// The largest crop of the given shape (width / height) that fits the photo, shrunk by zoom
// and moved by x/y pixels from the photo's center, kept inside the photo.
export function photoCrop(width: number, height: number, aspect: number, zoom: number, x: number, y: number) {
  const fitsWidth = width / height <= aspect;
  const baseWidth = fitsWidth ? width : height * aspect;
  const baseHeight = fitsWidth ? width / aspect : height;
  const cropWidth = Math.max(1, Math.min(width, Math.floor(baseWidth / Math.max(1, zoom))));
  const cropHeight = Math.max(1, Math.min(height, Math.floor(baseHeight / Math.max(1, zoom))));
  return {
    originX: Math.round(Math.max(0, Math.min(width - cropWidth, (width - cropWidth) / 2 + x))),
    originY: Math.round(Math.max(0, Math.min(height - cropHeight, (height - cropHeight) / 2 + y))),
    width: cropWidth,
    height: cropHeight,
  };
}

export function avatarCrop(width: number, height: number, zoom: number, x: number, y: number) {
  const side = Math.max(1, Math.floor(Math.min(width, height) / Math.max(1, zoom)));
  return {
    originX: Math.round(Math.max(0, Math.min(width - side, (width - side) / 2 + x))),
    originY: Math.round(Math.max(0, Math.min(height - side, (height - side) / 2 + y))),
    width: side,
    height: side,
  };
}
