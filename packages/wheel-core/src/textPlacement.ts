export interface ArcTextInput {
  text: string;
  radius: number;
  startAngle: number;
  endAngle: number;
  minVisibleAngle?: number;
  avgCharWidth?: number;
}

export interface ArcTextResult {
  visible: boolean;
  text: string;
  arcLength: number;
}

function ellipsize(text: string, maxChars: number): string {
  if (maxChars <= 0) {
    return "";
  }
  if (text.length <= maxChars) {
    return text;
  }
  if (maxChars <= 3) {
    return ".".repeat(maxChars);
  }
  return `${text.slice(0, maxChars - 3)}...`;
}

export function placeArcText(input: ArcTextInput): ArcTextResult {
  const minVisibleAngle = input.minVisibleAngle ?? 0.08;
  const avgCharWidth = input.avgCharWidth ?? 7;
  const span = Math.max(0, input.endAngle - input.startAngle);
  const arcLength = Math.max(0, span * input.radius);

  if (span < minVisibleAngle || arcLength <= avgCharWidth) {
    return {
      visible: false,
      text: "",
      arcLength
    };
  }

  const maxChars = Math.floor(arcLength / avgCharWidth);

  return {
    visible: true,
    text: ellipsize(input.text, maxChars),
    arcLength
  };
}
