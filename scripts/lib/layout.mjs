// Shared geometry. The portrait (370px) and card (490px) sit side by side under
// the 860px heatmap, so all three share edges; portrait and card share a height.
import { CHAR } from './svg.mjs';

export const HEATMAP_W = 860;
export const PORTRAIT_W = 370;
export const CARD_W = 490;
export const ROW_H = 420;
export const TITLE_BAR = 28;
export const PAD = 14;

// ASCII grid for the portrait: `columns` glyphs across, as many rows as fit.
export function portraitGrid(columns) {
  const width = PORTRAIT_W - PAD * 2;
  const height = ROW_H - TITLE_BAR - PAD * 2;
  const fontSize = width / (columns * CHAR);
  const lineHeight = fontSize * 1.12;
  const rows = Math.floor(height / lineHeight);
  return { columns, rows, fontSize, lineHeight, width, height, cellAspect: lineHeight / (fontSize * CHAR) };
}
