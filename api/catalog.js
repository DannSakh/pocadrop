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
  const sheetId = extractDriveId(process.env.SHEET_ID);
  if (!sheetId) {
    return res.status(500).json({ error: "Missing SHEET_ID configuration" });
  }

  const endpoints = [
    `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`,
    `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`
  ];

  for (const url of endpoints) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) continue;
      const csvText = await response.text();
      if (!csvText || csvText.trim().startsWith("<!DOCTYPE") || csvText.trim().startsWith("<html")) continue;

      const rows = parseCSVRows(csvText);
      if (rows.length < 2) continue;

      const sanitizedItems = rows.slice(1).map(cols => {
        const [id, member, group, priceRaw, releaseRaw, albumRaw, conditionRaw, conditionNoteRaw, statusRaw] = cols;
        if (!id || !member) return null;

        const sLow = (statusRaw || "").trim().toLowerCase();
        if (sLow.includes("черновик") || sLow.includes("draft") || sLow.includes("скрыт")) {
          return null;
        }

        return {
          id: id.trim(),
          member: (member || "").trim(),
          group: (group || "").trim(),
          priceRaw: (priceRaw || "").trim(),
          releaseRaw: (releaseRaw || "").trim(),
          albumRaw: (albumRaw || "").trim(),
          conditionRaw: (conditionRaw || "").trim(),
          conditionNoteRaw: (conditionNoteRaw || "").trim(),
          statusRaw: (statusRaw || "").trim()
        };
      }).filter(Boolean);

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, max-age=0");
      return res.status(200).json({ items: sanitizedItems });
    } catch (e) {}
  }

  return res.status(500).json({ error: "Failed to load catalog data" });
}
