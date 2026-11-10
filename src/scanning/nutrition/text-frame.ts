import type { TextFrame } from "../types";
type Rect = { left: number; top: number; right: number; bottom: number };
type RecognizedText = { blocks: { lines: { elements: { text: string; frame: Rect }[] }[] }[] };

// ML Kit supplies positions but no confidence scores. These provisional results
// always need review; the score is not a calibrated measure of OCR accuracy.
export function recognizedTextFrame(result: RecognizedText, width: number, height: number): TextFrame {
  return { id: `label-${Date.now()}`, capturedAt: Date.now(), width, height,
    observations: result.blocks.flatMap(block => block.lines.flatMap(line => line.elements)).map((element, index) => ({ id: `word-${index}`, text: element.text, confidence: 0.5, bounds: { x: element.frame.left / width, y: element.frame.top / height, width: (element.frame.right - element.frame.left) / width, height: (element.frame.bottom - element.frame.top) / height } })) };
}
