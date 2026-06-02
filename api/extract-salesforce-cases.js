const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const getHeader = (req, name) => {
  const value = req.headers?.[name.toLowerCase()] || req.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
};

const getBearerToken = (req) => {
  const authorization = getHeader(req, "authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
};

const normalizeImageInput = (imageBase64, requestedMimeType = "image/png") => {
  if (typeof imageBase64 !== "string" || !imageBase64.trim()) {
    return { error: "Missing imageBase64." };
  }

  let mimeType = typeof requestedMimeType === "string" && requestedMimeType.trim()
    ? requestedMimeType.trim().toLowerCase()
    : "image/png";
  let base64 = imageBase64.trim();

  const dataUrlMatch = base64.match(/^data:([^;,]+);base64,(.*)$/is);
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1].trim().toLowerCase();
    base64 = dataUrlMatch[2].trim();
  }

  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    return { error: "Invalid image type" };
  }

  const compactBase64 = base64.replace(/\s/g, "");
  const padding = compactBase64.endsWith("==") ? 2 : compactBase64.endsWith("=") ? 1 : 0;
  const estimatedBytes = Math.floor((compactBase64.length * 3) / 4) - padding;

  if (estimatedBytes > MAX_IMAGE_BYTES) {
    return { error: "Image too large" };
  }

  if (!compactBase64 || estimatedBytes <= 0) {
    return { error: "Missing imageBase64." };
  }

  return { imageBase64: compactBase64, mimeType };
};

const isAuthorized = async (req) => {
  const configuredSecret = process.env.SALESFORCE_EXTRACT_API_SECRET;
  const providedSecret = getHeader(req, "x-api-secret") || getHeader(req, "x-api-key");
  const bearerToken = getBearerToken(req);

  if (configuredSecret && (providedSecret === configuredSecret || bearerToken === configuredSecret)) {
    return true;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !bearerToken || (configuredSecret && bearerToken === configuredSecret)) {
    return false;
  }

  const authResponse = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${bearerToken}`,
    },
  });

  return authResponse.ok;
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const authorized = await isAuthorized(req);
    if (!authorized) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const normalizedImage = normalizeImageInput(req.body?.imageBase64, req.body?.mimeType || "image/png");
    if (normalizedImage.error) {
      return res.status(400).json({ error: normalizedImage.error });
    }

    const { imageBase64, mimeType } = normalizedImage;

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not configured in Vercel." });
    }

    const prompt = `
You are extracting surgical procedure/case rows from a Salesforce screenshot.

Return ONLY valid JSON. Do not include markdown. Do not include commentary.

Use this exact JSON shape:

{
  "screenshotType": "scheduled_procedures_or_account_procedure_history",
  "accountName": "",
  "cases": [
    {
      "date": "MM/DD/YYYY",
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

Screenshot type 1: Scheduled Procedures
This may appear in either Salesforce desktop/table layout OR Salesforce mobile/card layout.

Desktop/table layout usually has a title/header saying "Scheduled Procedures" and columns like:
- Scheduled Date
- Scheduled Time
- Hospital Name
- Category
- Procedure Name
- Surgeon Name

Mobile/card layout may have:
- Top header such as "Reconcile Procedures"
- A tab bar where "Scheduled Procedures" is highlighted/selected, often blue
- A neighboring tab such as "Onsite Procedures" that is not selected
- Each visible case appears as a card/list item, not a table row
- Hospital/account name appears large on the left
- Category appears below the hospital
- Procedure appears below category
- Surgeon appears below procedure
- Date and time appear as gray pills/badges on the right

If the mobile screenshot has the "Scheduled Procedures" tab selected/highlighted, classify it as "scheduled_procedures" even if the page header says "Reconcile Procedures".

For Scheduled Procedures screenshots:
- Every visible row is a new fast tracked case candidate.
- Extract Scheduled Date into "date".
- Extract Scheduled Time into "time".
- Extract Hospital Name into "hospital".
- Extract Category into "category".
- Extract Procedure Name into "procedure".
- Extract Surgeon Name into "surgeon".
- scheduledDate should be blank unless there is a separate visible Scheduled column.
- salesforceStatus should be blank unless visible.
- recommendedAction should be "import_new_fast_tracked_unreconciled".
- notes should say "Scheduled Procedures row. Import as fast tracked and unreconciled unless duplicate exists."
- screenshotType should be "scheduled_procedures".

Screenshot type 2: Account Procedure History List
This may appear as a full Salesforce Account Procedure History page OR as a cropped/snipped portion of the Account Procedure History table.

Full Account Procedure History screenshots usually have columns like:
- Surgeon
- Procedure Date
- Product Family Type
- Business Category
- Procedure Name
- Scheduled
- Status

Cropped/snipped Account Procedure History screenshots may not show the Salesforce page title, account name, or every column. They may only show rows with:
- row number
- checkbox
- surgeon name
- procedure date
- product family type, often "da Vinci"
- business category
- procedure name
- status

If the screenshot looks like a cropped Salesforce table/list of procedure history rows, classify it as "account_procedure_history" even if the page title/header is not visible.

For Account Procedure History screenshots and snippets:
- Extract Surgeon into "surgeon".
- Extract Procedure Date into "date".
- Extract Business Category into "category".
- Extract Procedure Name into "procedure".
- Extract Status column into "salesforceStatus".
- Extract Scheduled column into "scheduledDate" ONLY if a distinct Scheduled column is visible.
- If the Scheduled column is not visible in a crop/snippet, leave "scheduledDate" blank. Do not invent it.
- If an account name/hospital/facility is visible in the screenshot header or breadcrumb, put it in "hospital" and "accountName".
- If no account name/hospital/facility is visible, leave "hospital" blank and leave "accountName" blank. The OR Planner app will infer facility from the surgeon roster.
- Time may be blank if no time column is visible.
- screenshotType should be "account_procedure_history".

Very important column rule:
- Product Family Type values like "da Vinci" are NOT the hospital/facility.
- Product Family Type values like "da Vinci" are NOT the category.
- Product Family Type values like "da Vinci" are NOT the Scheduled date.
- Ignore the Product Family Type column completely.

Account Procedure History business rules:
- The Scheduled column controls OR Planner fastTracking. A date in the Scheduled column means fastTracking true/already scheduled in OR Planner. A blank Scheduled column means fastTracking false/not fast tracked.
- The Status column controls OR Planner reconciled. Status "Completed" means reconciled true. Status "OnSite" means reconciled false.

Recommended action rules for Account Procedure History:
- If scheduledDate has a visible date AND salesforceStatus is "Completed", set recommendedAction to "reconcile_existing_fast_tracked_case".
  Notes should say: "Scheduled column has a date and status is Completed. Match existing fast tracked OR Planner case and mark reconciled. Do not create duplicate."
- If scheduledDate has a visible date AND salesforceStatus is "OnSite", set recommendedAction to "already_fast_tracked_do_not_duplicate".
  Notes should say: "Scheduled column has a date. Already fast tracked but not reconciled. Do not import duplicate."
- If scheduledDate is blank AND salesforceStatus is "Completed", set recommendedAction to "import_new_not_fast_tracked_reconciled".
  Notes should say: "No visible Scheduled date means this was not confirmed as fast tracked. Completed in Salesforce means reconciled true. If added to OR Planner, set fastTracking false and reconciled true."
- If scheduledDate is blank AND salesforceStatus is "OnSite", set recommendedAction to "import_new_not_fast_tracked_unreconciled".
  Notes should say: "No visible Scheduled date means this was not confirmed as fast tracked. OnSite in Salesforce means reconciled false. If added to OR Planner, set fastTracking false and reconciled false."
- If status is unclear and scheduledDate is blank, set recommendedAction to "needs_review".

General extraction rules:
- Extract every visible case row from Salesforce desktop/table screenshots.
- Extract every visible case card/list item from Salesforce mobile/card screenshots.
- Read rows from top to bottom.
- Do not merge two rows together.
- Do not invent missing information.
- If a row is mostly blank or lacks both surgeon and procedure, skip that row.
- If a visible row has date, surgeon, procedure, and status, extract it even if facility/hospital is blank.
- If a cell is unclear, leave it blank and set confidence to "Low".
- If most of the row is readable but one cell is uncertain, set confidence to "Medium".
- If the full row is clear, set confidence to "High".
- Preserve hospital/account names exactly as shown.
- Preserve procedure names exactly as shown.
- Preserve surgeon names exactly as shown.
- Ignore Salesforce navigation, sidebars, browser UI, bottom mobile navigation, filters, sort controls, row numbers, checkboxes, and non-case text.
- If no rows are visible, return { "screenshotType": "unknown", "accountName": "", "cases": [] }.
`.trim();

    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: `data:${mimeType};base64,${imageBase64}` },
            ],
          },
        ],
      }),
    });

    const responseJson = await openAIResponse.json();

    if (!openAIResponse.ok) {
      return res.status(openAIResponse.status).json({
        error: responseJson?.error?.message || "OpenAI extraction failed.",
        details: responseJson,
      });
    }

    const outputText =
      responseJson.output_text ||
      responseJson.output?.flatMap((item) => item.content || [])
        ?.map((content) => content.text || "")
        ?.join("") ||
      "";

    try {
      const parsed = JSON.parse(outputText);
      return res.status(200).json(parsed);
    } catch {
      return res.status(500).json({
        error: "AI returned non-JSON output.",
        raw: outputText,
      });
    }
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Salesforce extraction failed.",
    });
  }
}
