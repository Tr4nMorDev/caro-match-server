import { RequestHandler } from "express";
import { sendGoogleLoginTrackingToSheet } from "../services/google-sheet-tracking.service";
import { AuthenticatedRequest } from "../types/express";

const getClientIp = (req: AuthenticatedRequest) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (Array.isArray(forwardedFor)) {
    return forwardedFor[0];
  }

  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.socket.remoteAddress || "";
};

export const trackGoogleLogin: RequestHandler = async (req, res) => {
  const authenticatedReq = req as AuthenticatedRequest;
  const { email } = authenticatedReq.user;
  const { location, utm_source, utm_campaign } = req.body as {
    location?: string;
    utm_source?: string;
    utm_campaign?: string;
  };

  try {
    const result = await sendGoogleLoginTrackingToSheet({
      email,
      location,
      ip: getClientIp(authenticatedReq),
      utm_source,
      utm_campaign,
    });

    res.status(200).json({
      message: "Google login tracking received",
      ...result,
    });
  } catch (err: any) {
    console.error("Google login tracking error:", err.message, {
      status: err.response?.status,
      data: err.response?.data,
    });
    res.status(502).json({
      message: "Google Sheet tracking failed",
    });
  }
};

export default { trackGoogleLogin };
