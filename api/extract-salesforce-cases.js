export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not configured in Vercel." });
    }

    const { imageBase64, mimeType = "image/png" } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64." });
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
This usually has columns like:
- Surgeon
- Procedure Date
- Product Family Type
- Business Category
- Procedure Name
- Scheduled
- Status

For Account Procedure History screenshots:
- Use the account name from the breadcrumb/header as hospital when visible.
- Extract Procedure Date into "date".
- Extract Business Category into "category".
- Extract Procedure Name into "procedure".
- Extract Surgeon into "surgeon".
- Extract Scheduled column into "scheduledDate".
- Extract Status column into "salesforceStatus".
- Time may be blank if no time column is visible.
- screenshotType should be "account_procedure_history".

Account Procedure History business rules:
- The Scheduled column controls OR Planner fastTracking. A date in the Scheduled column means fastTracking true/already scheduled in OR Planner. A blank Scheduled column means fastTracking false/not fast tracked.
- The Status column controls OR Planner reconciled. Status "Completed" means reconciled true. Status "OnSite" means reconciled false.

Recommended action rules for Account Procedure History:
- If scheduledDate has a visible date AND salesforceStatus is "Completed", set recommendedAction to "reconcile_existing_fast_tracked_case".
  Notes should say: "Scheduled column has a date and status is Completed. Match existing fast tracked OR Planner case and mark reconciled. Do not create duplicate."
- If scheduledDate has a visible date AND salesforceStatus is "OnSite", set recommendedAction to "already_fast_tracked_do_not_duplicate".
  Notes should say: "Scheduled column has a date. Already fast tracked but not reconciled. Do not import duplicate."
- If scheduledDate is blank AND salesforceStatus is "Completed", set recommendedAction to "import_new_not_fast_tracked_reconciled".
  Notes should say: "No Scheduled date means this was not fast tracked. Completed in Salesforce means reconciled true. If added to OR Planner, set fastTracking false and reconciled true."
- If scheduledDate is blank AND salesforceStatus is "OnSite", set recommendedAction to "import_new_not_fast_tracked_unreconciled".
  Notes should say: "No Scheduled date means this was not fast tracked. OnSite in Salesforce means reconciled false. If added to OR Planner, set fastTracking false and reconciled false."
- If status is unclear and scheduledDate is blank, set recommendedAction to "needs_review".

General extraction rules:
- Extract every visible table row from Salesforce desktop/table screenshots.
- Extract every visible case card/list item from Salesforce mobile/card screenshots.
- Read rows from top to bottom.
- Do not merge two rows together.
- Do not invent missing information.
- If a cell is unclear, leave it blank and set confidence to "Low".
- If most of the row is readable but one cell is uncertain, set confidence to "Medium".
- If the full row is clear, set confidence to "High".
- Preserve hospital/account names exactly as shown.
- Preserve procedure names exactly as shown.
- Preserve surgeon names exactly as shown.
- Ignore Salesforce navigation, sidebars, browser UI, bottom mobile navigation, filters, sort controls, and non-case text.
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
