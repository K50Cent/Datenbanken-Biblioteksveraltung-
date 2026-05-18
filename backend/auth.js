import crypto from "node:crypto";

export function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Nicht angemeldet. Bitte zuerst einloggen." });
  }

  const token = authHeader.slice(7);
  const dotIndex = token.lastIndexOf(".");

  if (dotIndex === -1) {
    return res.status(401).json({ message: "Ungültiger Token." });
  }

  const encodedPayload = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  const expectedSignature = crypto
    .createHmac("sha256", process.env.AUTH_SECRET || "local-library-secret")
    .update(encodedPayload)
    .digest("base64url");

  if (signature !== expectedSignature) {
    return res.status(401).json({ message: "Ungültiger Token." });
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString());
  } catch {
    return res.status(401).json({ message: "Ungültiger Token." });
  }

  if (payload.exp < Date.now()) {
    return res.status(401).json({ message: "Sitzung abgelaufen. Bitte erneut anmelden." });
  }

  req.user = payload;
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Zugriff verweigert. Administratorrechte erforderlich." });
  }
  next();
}
