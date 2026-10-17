function parseFtImages(rawValue) {
  const images = JSON.parse(rawValue || 'null') || [null, null, null, null, null];
  while (images.length < 5) images.push(null);
  return images.slice(0, 5);
}

function normalizeFtPrimarySlot(slot, images) {
  const numericSlot = Number(slot);
  if (Number.isInteger(numericSlot) && numericSlot >= 1 && numericSlot <= 5 && images[numericSlot - 1]) {
    return numericSlot;
  }
  const firstFilledIndex = (images || []).findIndex(Boolean);
  return firstFilledIndex >= 0 ? firstFilledIndex + 1 : null;
}

function parseImageDataUrl(dataUrl) {
  const raw = String(dataUrl || '');
  const match = /^data:image\/(png|jpeg|jpg|webp|gif)(?:;charset=[^;,]+)?;base64,(.+)$/i.exec(raw);
  if (!match) return null;
  const type = String(match[1] || '').toLowerCase();
  const ext = type === 'jpeg' || type === 'jpg' ? 'jpg' : type;
  return { ext, buffer: Buffer.from(match[2], 'base64') };
}

module.exports = { parseFtImages, normalizeFtPrimarySlot, parseImageDataUrl };
