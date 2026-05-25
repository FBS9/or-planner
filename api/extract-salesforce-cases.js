import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", (chunk) => {
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    req.on("error", reject);
  });
}

function extractMultipartFile(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2];

  if (!boundary) {
    throw new Error("Missing multipart boundary.");
  }

  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(boundaryBuffer);

  while (start !== -1) {
    const next = buffer.indexOf(boundaryBuffer, start + boundaryBuffer.length);
    if (next === -1) break;

    const part = buffer.slice(start + boundaryBuffer.length, next);
    parts.push(part);
    start = next;
  }

  const filePart = parts.find((part) =>
    part.toString("latin1", 0, Math.min(part.length, 1000)).includes('name="image"')
  );

  if (!filePart) {
    throw new Error("No uploaded image found.");
  }

  const headerEnd = filePart.indexOf(Buffer.from("\r\n\r\n"));
  if (headerEnd === -1) {
    throw new Error("Invalid multipart image upload.");
  }

  const headersText = filePart.toString("latin1", 0, headerEnd);
  let fileBuffer = filePart.slice(headerEnd + 4);

  if (fileBuffer.slice(0, 2).toString("latin1") === "\r\n") {
    fileBuffer = fileBuffer.slice(2);
  }

  if (fileBuffer.slice(-2).toString("latin1") === "\r\n") {
    fileBuffer = fileBuffer.slice(0, -2);
  }

  const mimeMatch = headersText.match(/Content-Type:\s*([^\r\n]+)/i);
  const mimeType = mimeMatch?.[1]?.trim() || "image/png";

  return {
    buffer: fileBuffer,
    mimeType,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed." });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "Missing OPENAI_API_KEY environment variable.",
      });
    }

    const contentType = req.headers["content-type"] || "";

    let imageBuffer;
    let mimeType;

    if (contentType.includes("multipart/form-data")) {
      const rawBody = await readRawBody(req);
      const extracted = extractMultipartFile(rawBody, contentType);
      imageBuffer = extracted.buffer;
      mimeType = extracted.mimeType;
    } else {
      return res.status(400).json({
        error: "Expected multipart/form-data with an image field.",
      });
    }

    const base64 = imageBuffer.toString("base64");

    const response = await openai.responses.create({
      model: "gpt-5.4-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
You are extracting surgical procedure/case rows from a Salesforce screenshot.

Return ONLY valid JSON. Do not include markdown. Do not include commentary.

Use this exact JSON shape:

{
  "screenshotType": "scheduled_procedures_or_account_procedure_history",
  "accountName": "",
  "cases": [
    {
      "date": "YYYY-MM-DD",
      "time": "HH:MM AM/PM",
      "hospital": "",
      "category": "",
      "procedure": "",
      "surgeon": "",
      "scheduledDate": "",
      "salesforceStatus": "",
      "recommendedAction": "",
      "confidence": "High",
      "notes": ""
    }
  ]
}

Recognize two screenshot types.

TYPE 1: Scheduled Procedures screen
Usually has header "Scheduled Procedures" and columns:
- Scheduled Date
- Scheduled Time
- Hospital Name
- Category
- Procedure Name
- Surgeon Name

For this type:
- screenshotType should be "scheduled_procedures".
- Extract every visible row.
- date should come from Scheduled Date.
- time should come from Scheduled Time.
- hospital should come from Hospital Name.
- category should come from Category.
- procedure should come from Procedure Name.
- surgeon should come from Surgeon Name.
- scheduledDate should be blank.
- salesforceStatus should be blank.
- recommendedAction should be "import_new_fast_tracking".
- notes should say "Scheduled Procedures screen. Treat as new fast tracked OR Planner case unless a duplicate already exists."

TYPE 2: Account Procedure History screen
Usually has columns like:
- Surgeon
- Procedure Date
- Product Family Type
- Business Category
- Procedure Name
- Scheduled
- Status

For this type:
- screenshotType should be "account_procedure_history".
- Use the account name from the page/header/breadcrumb as hospital when visible.
- date should come from Procedure Date.
- time can be blank if no time is visible.
- category should come from Business Category or Product Family Type.
- procedure should come from Procedure Name.
- surgeon should come from Surgeon.
- scheduledDate should come from Scheduled.
- salesforceStatus should come from Status.

Business rules for Account Procedure History:
- Scheduled date present + Status Completed:
  recommendedAction = "mark_existing_fast_tracked_case_reconciled"
  notes = "Scheduled column has a date and status is Completed. Match to existing fast tracked OR Planner case and mark reconciled. Do not create duplicate."

- Scheduled date present + Status OnSite:
  recommendedAction = "already_fast_tracked_do_not_duplicate"
  notes = "Scheduled column has a date and status is OnSite. Already fast tracked; do not create duplicate."

- Scheduled date blank + Status Completed:
  recommendedAction = "import_new_fast_tracking_reconciled"
  notes = "Completed in Salesforce. If imported, mark fastTracking true and reconciled true."

- Scheduled date blank + Status OnSite:
  recommendedAction = "import_new_fast_tracking_unreconciled"
  notes = "OnSite in Salesforce. If imported, mark fastTracking true and reconciled false."

General rules:
- Extract every visible table row.
- Do not invent missing values.
- If a cell is unclear, leave it blank and set confidence to "Low".
- If the full row is clear, set confidence to "High".
- Dates should be returned as YYYY-MM-DD when possible.
- Preserve hospital, procedure, and surgeon names exactly as shown.
- Ignore browser UI, menus, sidebars, and non-table text.
- If no rows are visible, return { "screenshotType": "unknown", "accountName": "", "cases": [] }.
              `.trim(),
            },
            {
              type: "input_image",
              image_url: `data:${mimeType};base64,${base64}`,
            },
          ],
        },
      ],
    });

    const text = response.output_text || "";

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      return res.status(500).json({
        error: "AI returned non-JSON output.",
        raw: text,
      });
    }

    return res.status(200).json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Extraction failed.";
    return res.status(500).json({ error: message });
  }
}
