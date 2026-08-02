import QRCode from "qrcode";

export async function qrDataUrl(token: string, size = 280) {
  if (!token) return null;
  return QRCode.toDataURL(token, {
    width: size,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#111111", light: "#ffffff" },
  });
}
