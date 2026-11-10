export interface WordLayoutInput {
  text: string;
  weight: number;
}

export interface WordPosition {
  x: number;
  y: number;
  fontSize: number;
  rotate: boolean;
  width: number;
  height: number;
}

/** Conservative text bounds avoid collisions without requiring a browser canvas. */
function textWidth(text: string, fontSize: number): number {
  return [...text].reduce((width, char) => width + (char.codePointAt(0)! > 255 ? 1.15 : 0.8) * fontSize, 0);
}

export function layoutWords(words: WordLayoutInput[], width: number, height: number): (WordPosition | undefined)[] {
  if (!words.length || width <= 0 || height <= 0) return words.map(() => undefined);
  const maxWeight = Math.max(...words.map(word => word.weight));
  const sorted = words.map((word, index) => ({ ...word, index }))
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  const padding = 3;
  for (let attempt = 0; attempt < 18; attempt++) {
    const scale = 0.9 ** attempt;
    const positions: (WordPosition | undefined)[] = new Array(words.length);
    const boxes: { left: number; top: number; right: number; bottom: number }[] = [];
    let complete = true;
    for (const [rank, word] of sorted.entries()) {
      const fontSize = (12 + 30 * Math.sqrt(word.weight / maxWeight)) * scale;
      const rotate = rank % 5 === 3;
      const textW = textWidth(word.text, fontSize);
      const textH = fontSize * 1.3;
      const w = (rotate ? textH : textW) + padding * 2;
      const h = (rotate ? textW : textH) + padding * 2;
      let found = false;
      for (let n = 0; n < 1800; n++) {
        const angle = n * 0.37;
        const distance = Math.sqrt(n / 1800);
        const x = width / 2 + Math.cos(angle) * distance * width / 2;
        const y = height / 2 + Math.sin(angle) * distance * height / 2;
        const box = { left: x - w / 2, right: x + w / 2, top: y - h / 2, bottom: y + h / 2 };
        if (box.left < 0 || box.top < 0 || box.right > width || box.bottom > height) continue;
        if (boxes.some(b => box.left < b.right && box.right > b.left && box.top < b.bottom && box.bottom > b.top)) continue;
        boxes.push(box);
        positions[word.index] = { x, y, fontSize, rotate, width: w, height: h };
        found = true;
        break;
      }
      if (!found) { complete = false; break; }
    }
    if (complete) return positions;
  }
  console.warn('워드 클라우드의 표시 공간이 부족합니다. 차트 크기를 늘리거나 단어 수를 줄이세요.');
  return words.map(() => undefined);
}
