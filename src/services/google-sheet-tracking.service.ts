import axios from "axios";
import { JWT } from "google-auth-library";

type GoogleLoginTrackingPayload = {
  email: string;
  location?: string;
  ip?: string;
  utm_source?: string;
  utm_campaign?: string;
};

const getPrivateKey = () => {
  return process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
};

const normalizeSheetRange = (range: string) => {
  const [sheetName, cellRange] = range.split("!");

  if (!sheetName || !cellRange || sheetName.startsWith("'")) {
    return range;
  }

  return `'${sheetName.replace(/'/g, "''")}'!${cellRange}`;
};

const getSheetsAccessToken = async () => {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = getPrivateKey();

  if (!clientEmail || !privateKey) {
    throw new Error("Missing Google service account credentials");
  }

  const client = new JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const { token } = await client.getAccessToken();
  if (!token) {
    throw new Error("Cannot get Google Sheets access token");
  }

  return token;
};

export async function sendGoogleLoginTrackingToSheet(
  payload: GoogleLoginTrackingPayload
) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const range = normalizeSheetRange(process.env.GOOGLE_SHEET_RANGE || "Sheet1!A:E");

  if (!spreadsheetId) {
    console.log("[google-sheet-tracking] skipped: GOOGLE_SHEET_ID is not set", payload);
    return { skipped: true };
  }

  const accessToken = await getSheetsAccessToken();
  const encodedRange = encodeURIComponent(range);

  await axios.post(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}:append`,
    {
      values: [
        [
          payload.email,
          payload.location || "",
          payload.ip || "",
          payload.utm_source || "",
          payload.utm_campaign || "",
        ],
      ],
    },
    {
      params: {
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  return { skipped: false };
}
