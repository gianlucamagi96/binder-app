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
  // Lingua dell'immagine di riferimento più simile alla foto ("en", "it").
  lang: string;
  confidence: number;
};

export type ScanDetection = {
  box: ScanBox;
  // Candidati quasi indistinguibili, di solito ristampe: va scelta a mano.
  ambiguous: boolean;
  candidates: ScanCandidate[];
};

export type ScanResult = {
  detections: ScanDetection[];
};

export class ScanRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ScanRequestError";
  }
}

function messageFrom(data: { message?: string | string[] } | null, fallback: string) {
  if (!data?.message) return fallback;
  return Array.isArray(data.message) ? data.message.join(", ") : data.message;
}

export async function submitScan(photo: Blob): Promise<ScanResult> {
  const body = new FormData();
  body.append("photo", photo, "scan.jpg");
  const res = await fetch("/api/scans", { method: "POST", body });
  const data = (await res.json().catch(() => null)) as
    | (ScanResult & { message?: string | string[] })
    | null;
  if (!res.ok) {
    throw new ScanRequestError(messageFrom(data, "Identificazione non riuscita"), res.status);
  }
  if (!data || !Array.isArray(data.detections)) {
    throw new ScanRequestError("Risposta inattesa dal servizio di identificazione. Riprova.", 422);
  }
  return { detections: data.detections };
}
