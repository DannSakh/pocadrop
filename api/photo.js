function extractDriveId(rawValue) {
  if (!rawValue) return "";
  const trimmed = String(rawValue).trim();
  const match = trimmed.match(/[-\w]{25,}/);
  return match ? match[0] : trimmed;
}

function parseCSVRows(csvText) {
  const rows = [];
  let row = [], cur = "", inQuotes = false;
  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i], next = csvText[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(cur.trim()); cur = ""; }
      else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        if (ch === '\r') i++;
        row.push(cur.trim()); rows.push(row); row = []; cur = "";
      } else cur += ch;
    }
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur.trim()); rows.push(row); }
  return rows;
}

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).send("Missing id");

  let targetFileId = null;

  if (id === "logo") {
    targetFileId = extractDriveId(process.env.LOGO_ID);
  } else {
    const sheetId = extractDriveId(process.env.SHEET_ID);
    if (!sheetId) return res.status(500).send("Missing configuration");

    const endpoints = [
      `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`,
      `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`
    ];

    for (const sheetUrl of endpoints) {
      try {
        const csvRes = await fetch(sheetUrl);
        if (!csvRes.ok) continue;
        const csvText = await csvRes.text();
        if (!csvText || csvText.trim().startsWith("<!DOCTYPE") || csvText.trim().startsWith("<html")) continue;

        const rows = parseCSVRows(csvText);
        const foundRow = rows.slice(1).find(r => (r[0] || "").trim().toLowerCase() === String(id).trim().toLowerCase());
        if (foundRow && foundRow[9]) {
          const extracted = extractDriveId(foundRow[9]);
          if (extracted) {
            targetFileId = extracted;
            break;
          }
        }
      } catch (e) {}
    }
  }

  if (!targetFileId) {
    return res.status(404).send("Image not found");
  }

  const size = id === "logo" ? "w400" : "w800";
  const driveUrl = `https://drive.google.com/thumbnail?id=${targetFileId}&sz=${size}`;

  try {
    const imgRes = await fetch(driveUrl);
    if (!imgRes.ok) return res.status(404).send("Image fetch failed");

    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
    return res.status(200).send(buffer);
  } catch (err) {
    return res.status(500).send("Error fetching image");
  }
}
