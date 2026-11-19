import type { BarcodeObservation, TextFrame } from "./types";

export type ScannerMode = "barcode" | "nutrition";
export type ScannerFailureCode = "permission_denied" | "camera_unavailable" | "recognition_failed" | "unsupported";
export type ScannerFailure = { code: ScannerFailureCode; message: string };

export interface LiveScannerAdapter {
  start(mode: ScannerMode): Promise<void>;
  stop(): Promise<void>;
  setTorch(enabled: boolean): Promise<boolean>;
  onBarcode(listener: (observation: BarcodeObservation) => void): () => void;
  onTextFrame(listener: (frame: TextFrame) => void): () => void;
  onError(listener: (failure: ScannerFailure) => void): () => void;
}
