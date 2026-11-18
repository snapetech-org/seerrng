interface BarcodeDetectorLike {
  detect: (source: ImageBitmap) => Promise<{ rawValue: string }[]>;
}

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

const barcodeDetector = () =>
  (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorConstructor })
    .BarcodeDetector;

export const canDetectBarcodes = () =>
  typeof barcodeDetector() === 'function' &&
  typeof createImageBitmap === 'function';

/**
 * Reads EAN-13 / EAN-8 / UPC barcodes on the device, when the browser has the
 * Barcode Detection API. The image never leaves the device for this step.
 */
export const detectBarcodes = async (file: Blob): Promise<string[]> => {
  const Detector = barcodeDetector();
  if (!Detector || !canDetectBarcodes()) return [];
  let bitmap: ImageBitmap | undefined;
  try {
    const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a'] });
    bitmap = await createImageBitmap(file);
    const codes = await detector.detect(bitmap);
    return [...new Set(codes.map((code) => code.rawValue))];
  } catch {
    return [];
  } finally {
    bitmap?.close();
  }
};
