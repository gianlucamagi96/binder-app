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
  // Lingua dell'immagine di riferimento più simile alla foto.
  lang: string;
  confidence: number;
};

export type ScanDetection = {
  box: ScanBox;
  // Candidati quasi indistinguibili (di solito ristampe): l'utente deve scegliere.
  ambiguous: boolean;
  candidates: ScanCandidate[];
};

export type ScanResult = {
  detections: ScanDetection[];
};
