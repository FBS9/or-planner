import { fromDateKey } from "./plannerDates";

export const ALL_FACILITIES = "All Facilities";
export const ALL_SURGEONS = "All Surgeons";
export const ALL_PROCEDURE_SPECIALTIES = "All Specialties";
export const DEFAULT_FACILITIES = [];
export const STORAGE_KEY = "or-planner-ipad-calendar-v2";
export const OLD_STORAGE_KEY = "or-planner-ipad-v1";

export const getFacilitiesFromPlanner = (snapshot = {}) => {
  const saved = Array.isArray(snapshot.facilities) ? snapshot.facilities : [];
  const rosterFacilities = Object.keys(snapshot.surgeonRosters || {});
  const caseFacilities = Object.values(snapshot.casesByDate || snapshot.data || {})
    .flat()
    .map((c) => c?.facility)
    .filter(Boolean);
  return Array.from(new Set([...saved, ...rosterFacilities, ...caseFacilities]));
};

export const buildEmptyRosters = (facilities = []) =>
  facilities.reduce((acc, facility) => {
    acc[facility] = [];
    return acc;
  }, {});

export const normalizeSurgeon = (surgeon) => {
  if (typeof surgeon === "string") return { name: surgeon, subspecialty: "" };
  return {
    name: surgeon?.name || "",
    subspecialty: surgeon?.subspecialty || "",
  };
};

export const ensureRosterShape = (rosters = {}, facilities = []) => {
  const keys = Array.from(new Set([...facilities, ...Object.keys(rosters || {})]));
  return keys.reduce((acc, facility) => {
    acc[facility] = Array.isArray(rosters[facility]) ? rosters[facility].map(normalizeSurgeon).filter((s) => s.name) : [];
    return acc;
  }, {});
};

export const getSurgeonNames = (surgeonRosters, facility) => (surgeonRosters[facility] || []).map((s) => s.name);

export const normalizeSurgeonSearch = (value = "") =>
  value
    .toLowerCase()
    .replace(/^dr[.]? */, "")
    .replace(/[^a-z0-9]/g, "");

export const surgeonSearchRank = (surgeonName = "", query = "") => {
  const normalizedName = normalizeSurgeonSearch(surgeonName);
  const normalizedQuery = normalizeSurgeonSearch(query);
  if (!normalizedQuery) return 0;
  if (normalizedName === normalizedQuery) return 0;
  if (normalizedName.startsWith(normalizedQuery)) return 1;
  if (normalizedName.includes(normalizedQuery)) return 2;
  return 99;
};

export const normalizeProcedureSearch = (value = "") => value.trim().toLowerCase();

export const getSurgeonSpecialty = (surgeonRosters, facility, surgeonName) => {
  if (!surgeonName) return "";
  const normalizedName = normalizeSurgeonSearch(surgeonName);
  const facilityRoster = surgeonRosters[facility] || [];
  const facilityMatch = facilityRoster.find((surgeon) => normalizeSurgeonSearch(surgeon.name) === normalizedName);
  if (facilityMatch) return facilityMatch.subspecialty || "";
  const allMatch = Object.values(surgeonRosters)
    .flatMap((roster) => roster || [])
    .find((surgeon) => normalizeSurgeonSearch(surgeon.name) === normalizedName);
  return allMatch?.subspecialty || "";
};

export const isGrowthSpecialty = (specialty = "") => {
  const normalized = specialty.trim().toLowerCase();
  return normalized === "general surgeon" || normalized === "general surgery";
};

export const getSubspecialty = (surgeonRosters, facility, surgeonName) =>
  (surgeonRosters[facility] || []).find((s) => s.name === surgeonName)?.subspecialty || "";

export const blankCase = (dateKey, facility = "") => ({
  id: crypto.randomUUID(),
  date: dateKey,
  facility,
  time: "",
  surgeon: "",
  procedure: "",
  fastTracking: false,
  reconciled: false,
  growth: false,
  notes: "",
});

export const caseSurgeonName = (c) => c.surgeon || "";

export const parseTimeToMinutes = (value = "") => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  const cleaned = raw
    .replaceAll(" ", "")
    .replaceAll(String.fromCharCode(9), "")
    .replaceAll(String.fromCharCode(10), "")
    .replaceAll(String.fromCharCode(13), "");
  const match = cleaned.match(/^([0-9]{1,2})(?::?([0-9]{2}))?([ap]m?|)?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const suffix = match[3] || "";
  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes > 59) return null;
  if (suffix.startsWith("p") && hours < 12) hours += 12;
  if (suffix.startsWith("a") && hours === 12) hours = 0;
  return hours * 60 + minutes;
};

export const compareCasesByTime = (a, b) => {
  const aTime = parseTimeToMinutes(a.time);
  const bTime = parseTimeToMinutes(b.time);
  const aHasTime = aTime !== null;
  const bHasTime = bTime !== null;
  if (aHasTime !== bHasTime) return aHasTime ? 1 : -1;
  if (!aHasTime && !bHasTime) return 0;
  return aTime - bTime;
};

export function exportToCsv(casesByDate, surgeonRosters = {}) {
  const headers = ["Date", "Day", "Facility", "Time", "Surgeon", "Subspecialty", "Procedure", "Fast Tracking", "Reconciled", "Growth", "Notes"];
  const rows = Object.entries(casesByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([dateKey, cases]) =>
      cases.map((c) => [
        dateKey,
        fromDateKey(dateKey).toLocaleDateString(undefined, { weekday: "long" }),
        c.facility,
        c.time,
        caseSurgeonName(c),
        getSubspecialty(surgeonRosters, c.facility, c.surgeon),
        c.procedure,
        c.fastTracking ? "Yes" : "No",
        c.reconciled ? "Yes" : "No",
        c.growth ? "Yes" : "No",
        c.notes,
      ])
    );

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `OR-Calendar-Case-Log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
