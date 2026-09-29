export type ScanBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ScanCandidate = {
  id: string;
  name: string;
  image: string | null;
  localId: string;
  rarity: string;
  set: { id: string; name: string } | null;
  confidence: number;
  exactNumber: boolean;
};

export type ScanDetection = {
  box: ScanBox;
  reading: {
    name: string;
    printedName: string;
    setNumber: string;
    setSymbol: string;
    confidence: number;
  };
  candidates: ScanCandidate[];
};

export type ScanResult = {
  detections: ScanDetection[];
};
