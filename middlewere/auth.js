const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.NEXT_APP_URL}/api/auth/jwks`),
);

async function verifyJWT(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: process.env.NEXT_APP_URL,
      audience: process.env.NEXT_APP_URL,
    });

    if (payload.accountStatus === "blocked") {
      return res
        .status(403)
        .json({ success: false, message: "Your account has been blocked" });
    }

    req.user = payload; // { id, email, name, role, accountStatus }
    next();
  } catch (err) {
    console.error("JWT verification failed:", err.message);
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized for this action" });
    }
    next();
  };
}

module.exports = { verifyJWT, requireRole };
