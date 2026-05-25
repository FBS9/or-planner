import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { motion } from "framer-motion";
import { Plus, Trash2, CalendarDays, Download, Upload, RotateCcw, CheckCircle2, ClipboardList, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEK_START_OPTIONS = DAYS;
const ALL_FACILITIES = "All Facilities";
const ALL_SURGEONS = "All Surgeons";
const ALL_PROCEDURE_SPECIALTIES = "All Specialties";

const getOrderedDays = (weekStartDay) => {
  const startIndex = DAYS.indexOf(weekStartDay);
  if (startIndex < 0) return DAYS;
  return [...DAYS.slice(startIndex), ...DAYS.slice(0, startIndex)];
};
const DEFAULT_FACILITIES = [];

const getFacilitiesFromPlanner = (snapshot = {}) => {
  const saved = Array.isArray(snapshot.facilities) ? snapshot.facilities : [];
  const rosterFacilities = Object.keys(snapshot.surgeonRosters || {});
  const caseFacilities = Object.values(snapshot.casesByDate || snapshot.data || {})
    .flat()
    .map((c) => c?.facility)
    .filter(Boolean);
  return Array.from(new Set([...saved, ...rosterFacilities, ...caseFacilities]));
};

const buildEmptyRosters = (facilities = []) =>
  facilities.reduce((acc, facility) => {
    acc[facility] = [];
    return acc;
  }, {});

const STORAGE_KEY = "or-planner-ipad-calendar-v2";
const OLD_STORAGE_KEY = "or-planner-ipad-v1";

const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY;
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const toDateKey = (date) => {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

const fromDateKey = (dateKey) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const startOfWeek = (date, weekStartDay = "Sunday") => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const startIndex = DAYS.indexOf(weekStartDay);
  const safeStartIndex = startIndex >= 0 ? startIndex : 0;
  const diff = (d.getDay() - safeStartIndex + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
};

const formatShortDate = (dateKey) => {
  const d = fromDateKey(dateKey);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const formatLongDate = (dateKey) => {
  const d = fromDateKey(dateKey);
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
};

const normalizeSurgeon = (surgeon) => {
  if (typeof surgeon === "string") return { name: surgeon, subspecialty: "" };
  return {
    name: surgeon?.name || "",
    subspecialty: surgeon?.subspecialty || "",
  };
};

const ensureRosterShape = (rosters = {}, facilities = []) => {
  const keys = Array.from(new Set([...facilities, ...Object.keys(rosters || {})]));
  return keys.reduce((acc, facility) => {
    acc[facility] = Array.isArray(rosters[facility]) ? rosters[facility].map(normalizeSurgeon).filter((s) => s.name) : [];
    return acc;
  }, {});
};

const getSurgeonNames = (surgeonRosters, facility) => (surgeonRosters[facility] || []).map((s) => s.name);

const normalizeSurgeonSearch = (value = "") =>
  value
    .toLowerCase()
    .replace(/^dr[.]? */, "")
    .replace(/[^a-z0-9]/g, "");

const surgeonSearchRank = (surgeonName = "", query = "") => {
  const normalizedName = normalizeSurgeonSearch(surgeonName);
  const normalizedQuery = normalizeSurgeonSearch(query);
  if (!normalizedQuery) return 0;
  if (normalizedName === normalizedQuery) return 0;
  if (normalizedName.startsWith(normalizedQuery)) return 1;
  if (normalizedName.includes(normalizedQuery)) return 2;
  return 99;
};

const normalizeProcedureSearch = (value = "") => value.trim().toLowerCase();

const getSurgeonSpecialty = (surgeonRosters, facility, surgeonName) => {
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

const isGrowthSpecialty = (specialty = "") => {
  const normalized = specialty.trim().toLowerCase();
  return normalized === "general surgeon" || normalized === "general surgery";
};

const getSubspecialty = (surgeonRosters, facility, surgeonName) =>
  (surgeonRosters[facility] || []).find((s) => s.name === surgeonName)?.subspecialty || "";

const blankCase = (dateKey, facility = "") => ({
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

const caseSurgeonName = (c) => c.surgeon || "";

const parseTimeToMinutes = (value = "") => {
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

const compareCasesByTime = (a, b) => {
  const aTime = parseTimeToMinutes(a.time);
  const bTime = parseTimeToMinutes(b.time);
  const aHasTime = aTime !== null;
  const bHasTime = bTime !== null;
  if (aHasTime !== bHasTime) return aHasTime ? 1 : -1;
  if (!aHasTime && !bHasTime) return 0;
  return aTime - bTime;
};

function exportToCsv(casesByDate, surgeonRosters = {}) {
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

export default function ORPlannerApp() {
  useEffect(() => {
    let viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) {
      viewport = document.createElement("meta");
      viewport.setAttribute("name", "viewport");
      document.head.appendChild(viewport);
    }
    viewport.setAttribute(
      "content",
      "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
    );
  }, []);

  const todayKey = toDateKey(new Date());
  const [plannerTitle, setPlannerTitle] = useState("OR Calendar Planner");
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [selectedFacility, setSelectedFacility] = useState(ALL_FACILITIES);
  const [search, setSearch] = useState("");
  const [caseTemplateProcedure, setCaseTemplateProcedure] = useState("");
  const [caseTemplateSurgeon, setCaseTemplateSurgeon] = useState("");
  const [caseTemplateTime, setCaseTemplateTime] = useState("");
  const [caseQuantity, setCaseQuantity] = useState(1);
  const [showMobileAddCase, setShowMobileAddCase] = useState(false);
  const [showSalesforceImport, setShowSalesforceImport] = useState(false);
  const [showSfMobileReference, setShowSfMobileReference] = useState(false);
  const [showSfDesktopReference, setShowSfDesktopReference] = useState(false);
  const [sfFile, setSfFile] = useState(null);
  const [sfPreviewUrl, setSfPreviewUrl] = useState("");
  const [sfLoading, setSfLoading] = useState(false);
  const [sfError, setSfError] = useState("");
  const [sfScreenshotType, setSfScreenshotType] = useState("");
  const [sfAccountName, setSfAccountName] = useState("");
  const [sfExtractedCases, setSfExtractedCases] = useState([]);
  const [sfApplySummary, setSfApplySummary] = useState("");
  const [showUnreconciledOnly, setShowUnreconciledOnly] = useState(false);
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [deletingCaseIds, setDeletingCaseIds] = useState([]);
  const [selectedReviewCase, setSelectedReviewCase] = useState(null);
  const [reviewDraft, setReviewDraft] = useState(null);
  const [pendingReconcileCase, setPendingReconcileCase] = useState(null);
  const [showFastTrackedReport, setShowFastTrackedReport] = useState(false);
  const [statReportType, setStatReportType] = useState(null);
  const [layoutMode, setLayoutMode] = useState(() => localStorage.getItem("or-planner-layout-mode") || "auto");
  const [casesByDate, setCasesByDate] = useState({});
  const [facilities, setFacilities] = useState(DEFAULT_FACILITIES);
  const sortedFacilities = useMemo(() => [...facilities].sort((a, b) => a.localeCompare(b)), [facilities]);
  const [newFacilityName, setNewFacilityName] = useState("");
  const [showFacilitiesPanel, setShowFacilitiesPanel] = useState(false);
  const [surgeonRosters, setSurgeonRosters] = useState(() => ensureRosterShape(buildEmptyRosters(DEFAULT_FACILITIES), DEFAULT_FACILITIES));
  const [rosterFacility, setRosterFacility] = useState(ALL_SURGEONS);
  const [newSurgeonName, setNewSurgeonName] = useState("");
  const [newSurgeonSubspecialty, setNewSurgeonSubspecialty] = useState("");
  const [showSurgeonRosterPanel, setShowSurgeonRosterPanel] = useState(false);
  const [showRosterList, setShowRosterList] = useState(false);
  const [showProcedureRosterPanel, setShowProcedureRosterPanel] = useState(false);
  const [showProcedureList, setShowProcedureList] = useState(false);
  const [procedureRosterSpecialty, setProcedureRosterSpecialty] = useState(ALL_PROCEDURE_SPECIALTIES);
  const [procedureExclusions, setProcedureExclusions] = useState([]);
  const [editingProcedureRosterKey, setEditingProcedureRosterKey] = useState("");
  const [editingProcedureName, setEditingProcedureName] = useState("");
  const [growthSurgeons, setGrowthSurgeons] = useState([]);
  const [weekStartDay, setWeekStartDay] = useState("Sunday");
  const [showWeekSettings, setShowWeekSettings] = useState(false);
  const [plannerLoaded, setPlannerLoaded] = useState(false);
  const [cloudSession, setCloudSession] = useState(null);
  const [cloudEmail, setCloudEmail] = useState("");
  const [cloudPassword, setCloudPassword] = useState("");
  const [cloudStatus, setCloudStatus] = useState(supabase ? "Cloud sync ready. Sign in to sync." : "Cloud sync not configured yet.");
  const [cloudBusy, setCloudBusy] = useState(false);
  const [showCloudPanel, setShowCloudPanel] = useState(false);
  const [autoCloudReady, setAutoCloudReady] = useState(false);
  const [cloudSyncActivity, setCloudSyncActivity] = useState("Idle");
  const lastSavedSnapshotRef = useRef("");
  const isApplyingCloudRef = useRef(false);
  const procedureInputRef = useRef(null);
  const mobileSurgeonInputRef = useRef(null);
  const desktopSurgeonInputRef = useRef(null);

  const orderedDays = useMemo(() => getOrderedDays(weekStartDay), [weekStartDay]);
  const weekStart = useMemo(() => startOfWeek(fromDateKey(selectedDate), weekStartDay), [selectedDate, weekStartDay]);
  const weekDates = useMemo(() => orderedDays.map((_, index) => toDateKey(addDays(weekStart, index))), [weekStart, orderedDays]);
  const selectedDayName = fromDateKey(selectedDate).toLocaleDateString(undefined, { weekday: "long" });
  const unreconciledWeekCases = weekDates.flatMap((dateKey) =>
    (casesByDate[dateKey] || [])
      .filter((item) => !item.reconciled)
      .map((item) => ({ ...item, displayDateKey: dateKey }))
  );

  const fastTrackedWeekCases = weekDates.flatMap((dateKey) =>
    (casesByDate[dateKey] || [])
      .filter((item) => item.fastTracking)
      .map((item) => ({ ...item, displayDateKey: dateKey }))
  );

  const fastTrackedReportGroups = weekDates.map((dateKey) => {
    const dayCases = fastTrackedWeekCases.filter((item) => item.displayDateKey === dateKey);
    const facilitiesForDay = Array.from(new Set(dayCases.map((item) => item.facility || "No Facility"))).sort((a, b) => a.localeCompare(b));
    return {
      dateKey,
      facilities: facilitiesForDay.map((facility) => {
        const facilityCases = dayCases.filter((item) => (item.facility || "No Facility") === facility).sort(compareCasesByTime);
        const surgeonsForFacility = Array.from(new Set(facilityCases.map((item) => item.surgeon || "No Surgeon"))).sort((a, b) => a.localeCompare(b));
        return {
          facility,
          surgeons: surgeonsForFacility.map((surgeon) => ({
            surgeon,
            procedures: facilityCases
              .filter((item) => (item.surgeon || "No Surgeon") === surgeon)
              .sort(compareCasesByTime)
              .map((item) => ({ procedure: item.procedure || "No Procedure", time: item.time || "" })),
          })),
        };
      }),
    };
  }).filter((day) => day.facilities.length > 0);


  const procedureExclusionKeys = useMemo(() => new Set((procedureExclusions || []).map((item) => normalizeProcedureSearch(typeof item === "string" ? item : item?.procedure)).filter(Boolean)), [procedureExclusions]);

  const isProcedureHiddenFromRoster = (procedure = "") => procedureExclusionKeys.has(normalizeProcedureSearch(procedure));

  const procedureRosterItems = useMemo(() => {
    const counts = new Map();
    Object.entries(casesByDate || {}).forEach(([dateKey, cases]) => {
      (cases || []).forEach((item) => {
        const procedure = (item.procedure || "").trim();
        if (!procedure || procedure.length < 2 || procedure.toLowerCase() === "hysterectomy b") return;
        if (procedureExclusionKeys.has(normalizeProcedureSearch(procedure))) return;
        const specialty = getSurgeonSpecialty(surgeonRosters, item.facility, item.surgeon) || "Unassigned";
        const key = `${normalizeProcedureSearch(specialty)}::${normalizeProcedureSearch(procedure)}`;
        const existing = counts.get(key) || { procedure, specialty, count: 0, lastUsed: "" };
        existing.count += 1;
        if (!existing.lastUsed || dateKey > existing.lastUsed) existing.lastUsed = dateKey;
        counts.set(key, existing);
      });
    });
    return Array.from(counts.values()).sort((a, b) => a.specialty.localeCompare(b.specialty) || a.procedure.localeCompare(b.procedure));
  }, [casesByDate, surgeonRosters, procedureExclusionKeys]);

  const procedureRosterSpecialties = useMemo(() => {
    const specialties = Array.from(new Set(procedureRosterItems.map((item) => item.specialty || "Unassigned"))).sort((a, b) => a.localeCompare(b));
    return [ALL_PROCEDURE_SPECIALTIES, ...specialties];
  }, [procedureRosterItems]);

  const selectedProcedureRosterItems = useMemo(() => {
    if (procedureRosterSpecialty === ALL_PROCEDURE_SPECIALTIES) return procedureRosterItems;
    return procedureRosterItems.filter((item) => item.specialty === procedureRosterSpecialty);
  }, [procedureRosterItems, procedureRosterSpecialty]);

  const selectedYear = fromDateKey(selectedDate).getFullYear();
  const selectedWeekEnd = weekDates[weekDates.length - 1];

  const activeStatReportType = statReportType || (showFastTrackedReport ? "fastTracking" : null);
  const statReportLabels = {
    total: "Week Total Cases",
    growth: "Week Growth Cases",
    fastTracking: "Fast Tracked Cases",
    reconciled: "Reconciled Cases",
    yearTotal: "Year Total Cases",
    yearGrowth: "Year Growth Cases",
  };
  const statReportDateKeys = activeStatReportType === "yearTotal" || activeStatReportType === "yearGrowth"
    ? Object.keys(casesByDate).filter((dateKey) => dateKey.startsWith(`${selectedYear}-`) && dateKey <= selectedWeekEnd).sort()
    : weekDates;

  const statReportCases = activeStatReportType ? statReportDateKeys.flatMap((dateKey) =>
    (casesByDate[dateKey] || [])
      .filter((item) => {
        if (activeStatReportType === "total" || activeStatReportType === "yearTotal") return true;
        if (activeStatReportType === "growth" || activeStatReportType === "yearGrowth") return item.growth;
        if (activeStatReportType === "fastTracking") return item.fastTracking;
        if (activeStatReportType === "reconciled") return item.reconciled;
        return false;
      })
      .map((item) => ({ ...item, displayDateKey: dateKey }))
  ) : [];
  const statReportGroups = statReportDateKeys.map((dateKey) => {
    const dayCases = statReportCases.filter((item) => item.displayDateKey === dateKey);
    const facilitiesForDay = Array.from(new Set(dayCases.map((item) => item.facility || "No Facility"))).sort((a, b) => a.localeCompare(b));
    return {
      dateKey,
      facilities: facilitiesForDay.map((facility) => {
        const facilityCases = dayCases.filter((item) => (item.facility || "No Facility") === facility).sort(compareCasesByTime);
        const surgeonsForFacility = Array.from(new Set(facilityCases.map((item) => item.surgeon || "No Surgeon"))).sort((a, b) => a.localeCompare(b));
        return {
          facility,
          surgeons: surgeonsForFacility.map((surgeon) => ({
            surgeon,
            procedures: facilityCases
              .filter((item) => (item.surgeon || "No Surgeon") === surgeon)
              .map((item) => ({ procedure: item.procedure || "No Procedure", time: item.time || "" })),
          })),
        };
      }),
    };
  }).filter((day) => day.facilities.length > 0);
  const isDesktopLayout = layoutMode === "desktop";
  const isMobileLayout = layoutMode === "mobile";
  const mobileOnlyClass = isDesktopLayout ? "hidden" : isMobileLayout ? "block" : "md:hidden";
  const desktopOnlyClass = isDesktopLayout ? "block" : isMobileLayout ? "hidden" : "hidden md:block";
  const addCasePanelClass = isDesktopLayout
    ? "block"
    : isMobileLayout
      ? showMobileAddCase ? "block" : "hidden"
      : `${showMobileAddCase ? "block" : "hidden"} md:block`; 

  useEffect(() => {
    localStorage.setItem("or-planner-layout-mode", layoutMode);
  }, [layoutMode]);

  const getPlannerSnapshot = () => ({
    plannerTitle,
    selectedDate,
    casesByDate,
    facilities: sortedFacilities,
    surgeonRosters,
    procedureExclusions,
    growthSurgeons,
    weekStartDay,
  });

  const applyPlannerSnapshot = (snapshot = {}) => {
    setPlannerTitle(snapshot.plannerTitle || snapshot.weekTitle || "OR Calendar Planner");
    setSelectedDate(todayKey);
    setCasesByDate(snapshot.casesByDate || {});
    const nextFacilities = (Array.isArray(snapshot.facilities) ? snapshot.facilities : Object.keys(snapshot.surgeonRosters || {})).sort((a, b) => a.localeCompare(b));
    setFacilities(nextFacilities);
    setSurgeonRosters(ensureRosterShape(snapshot.surgeonRosters || buildEmptyRosters(nextFacilities), nextFacilities));
    setRosterFacility((prev) => prev === ALL_SURGEONS || nextFacilities.includes(prev) ? prev : ALL_SURGEONS);
    setGrowthSurgeons(Array.isArray(snapshot.growthSurgeons) ? snapshot.growthSurgeons : []);
    setProcedureExclusions(Array.isArray(snapshot.procedureExclusions) ? snapshot.procedureExclusions : []);
    setWeekStartDay(WEEK_START_OPTIONS.includes(snapshot.weekStartDay) ? snapshot.weekStartDay : "Sunday");
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setPlannerTitle(parsed.plannerTitle || parsed.weekTitle || "OR Calendar Planner");
        setSelectedDate(todayKey);
        setCasesByDate(parsed.casesByDate || {});
        const parsedFacilities = getFacilitiesFromPlanner(parsed).sort((a, b) => a.localeCompare(b));
        setFacilities(parsedFacilities);
        setRosterFacility((prev) => prev === ALL_SURGEONS || parsedFacilities.includes(prev) ? prev : ALL_SURGEONS);
        setSurgeonRosters(ensureRosterShape(parsed.surgeonRosters || buildEmptyRosters(parsedFacilities), parsedFacilities));
        setGrowthSurgeons(Array.isArray(parsed.growthSurgeons) ? parsed.growthSurgeons : []);
        setProcedureExclusions(Array.isArray(parsed.procedureExclusions) ? parsed.procedureExclusions : []);
        setWeekStartDay(WEEK_START_OPTIONS.includes(parsed.weekStartDay) ? parsed.weekStartDay : "Sunday");
      } else {
        const oldSaved = localStorage.getItem(OLD_STORAGE_KEY);
        if (oldSaved) {
          const old = JSON.parse(oldSaved);
          const migrated = {};
          const migratedWeekStartDay = WEEK_START_OPTIONS.includes(old.weekStartDay) ? old.weekStartDay : "Sunday";
          const currentWeekStart = startOfWeek(new Date(), migratedWeekStartDay);
          getOrderedDays(migratedWeekStartDay).forEach((day, index) => {
            const dateKey = toDateKey(addDays(currentWeekStart, index));
            migrated[dateKey] = (old.data?.[day] || []).map((c) => ({ ...c, id: c.id || crypto.randomUUID(), date: dateKey }));
          });
          setPlannerTitle(old.weekTitle || "OR Calendar Planner");
          setCasesByDate(migrated);
          const oldFacilities = getFacilitiesFromPlanner({ ...old, casesByDate: migrated }).sort((a, b) => a.localeCompare(b));
          setFacilities(oldFacilities);
          setRosterFacility((prev) => prev === ALL_SURGEONS || oldFacilities.includes(prev) ? prev : ALL_SURGEONS);
          setSurgeonRosters(ensureRosterShape(old.surgeonRosters || buildEmptyRosters(oldFacilities), oldFacilities));
          setGrowthSurgeons(Array.isArray(old.growthSurgeons) ? old.growthSurgeons : []);
          setProcedureExclusions(Array.isArray(old.procedureExclusions) ? old.procedureExclusions : []);
          setWeekStartDay(migratedWeekStartDay);
        }
      }
    } catch (e) {
      console.warn("Could not load saved planner", e);
    } finally {
      setPlannerLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!plannerLoaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getPlannerSnapshot()));
  }, [plannerTitle, selectedDate, casesByDate, facilities, surgeonRosters, procedureExclusions, growthSurgeons, weekStartDay, plannerLoaded]);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setCloudSession(data.session || null);
      if (data.session?.user?.email) setCloudEmail(data.session.user.email);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setCloudSession(session || null);
      if (session?.user?.email) setCloudEmail(session.user.email);
    });
    return () => {
      mounted = false;
      subscription?.subscription?.unsubscribe?.();
    };
  }, []);

  const signUpForCloud = async () => {
    if (!supabase) return setCloudStatus("Cloud sync is missing Supabase environment variables.");
    if (!cloudEmail || !cloudPassword) return setCloudStatus("Enter an email and password first.");
    setCloudBusy(true);
    const { error } = await supabase.auth.signUp({ email: cloudEmail, password: cloudPassword });
    setCloudBusy(false);
    setCloudStatus(error ? error.message : "Account created. Check your email if confirmation is required, then sign in.");
  };

  const signInToCloud = async () => {
    if (!supabase) return setCloudStatus("Cloud sync is missing Supabase environment variables.");
    if (!cloudEmail || !cloudPassword) return setCloudStatus("Enter an email and password first.");
    setCloudBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: cloudEmail, password: cloudPassword });
    setCloudBusy(false);
    if (error) return setCloudStatus(error.message);
    setCloudSession(data.session || null);
    setCloudStatus("Signed in. Pulling your latest cloud data...");
  };

  const signOutOfCloud = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setCloudSession(null);
    setAutoCloudReady(false);
    lastSavedSnapshotRef.current = "";
    setCloudStatus("Signed out of cloud sync.");
  };

  const snapshotToString = (snapshot) => JSON.stringify(snapshot);

  const performCloudSave = async ({ silent = false } = {}) => {
    if (!supabase) {
      if (!silent) setCloudStatus("Cloud sync is missing Supabase environment variables.");
      return;
    }
    if (!cloudSession?.user?.id) {
      if (!silent) setCloudStatus("Sign in before saving to cloud.");
      return;
    }

    const snapshot = getPlannerSnapshot();
    const snapshotString = snapshotToString(snapshot);
    if (silent && snapshotString === lastSavedSnapshotRef.current) return;

    if (!silent) setCloudBusy(true);
    setCloudSyncActivity("Saving...");
    const { error } = await supabase.from("or_planner_sync").upsert({
      user_id: cloudSession.user.id,
      planner_data: snapshot,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (!silent) setCloudBusy(false);

    if (error) {
      setCloudSyncActivity("Save failed");
      setCloudStatus(error.message);
      return;
    }

    lastSavedSnapshotRef.current = snapshotString;
    const message = `Saved to cloud at ${new Date().toLocaleTimeString()}.`;
    setCloudSyncActivity("Saved");
    setCloudStatus(silent ? `Auto-${message.charAt(0).toLowerCase()}${message.slice(1)}` : message);
  };

  const performCloudPull = async ({ silent = false } = {}) => {
    if (!supabase) {
      if (!silent) setCloudStatus("Cloud sync is missing Supabase environment variables.");
      return;
    }
    if (!cloudSession?.user?.id) {
      if (!silent) setCloudStatus("Sign in before pulling from cloud.");
      return;
    }

    if (!silent) setCloudBusy(true);
    setCloudSyncActivity("Pulling...");
    const { data, error } = await supabase
      .from("or_planner_sync")
      .select("planner_data, updated_at")
      .eq("user_id", cloudSession.user.id)
      .maybeSingle();
    if (!silent) setCloudBusy(false);

    if (error) {
      setCloudSyncActivity("Pull failed");
      setCloudStatus(error.message);
      setAutoCloudReady(true);
      return;
    }

    if (!data?.planner_data) {
      setCloudSyncActivity("Ready");
      setCloudStatus("No cloud data found yet. Your next change will auto-save to cloud.");
      setAutoCloudReady(true);
      return;
    }

    isApplyingCloudRef.current = true;
    applyPlannerSnapshot(data.planner_data);
    lastSavedSnapshotRef.current = snapshotToString(data.planner_data);
    window.setTimeout(() => {
      isApplyingCloudRef.current = false;
      setAutoCloudReady(true);
    }, 0);

    setCloudSyncActivity("Synced");
    setCloudStatus(`Auto-pulled cloud data from ${data.updated_at ? new Date(data.updated_at).toLocaleString() : "cloud"}.`);
  };

  const saveToCloud = async () => performCloudSave({ silent: false });

  const pullFromCloud = async () => performCloudPull({ silent: false });

  useEffect(() => {
    if (!plannerLoaded || !cloudSession?.user?.id) {
      setAutoCloudReady(false);
      return;
    }
    setAutoCloudReady(false);
    performCloudPull({ silent: true });
  }, [plannerLoaded, cloudSession?.user?.id]);

  useEffect(() => {
    if (!plannerLoaded || !autoCloudReady || !cloudSession?.user?.id) return;
    if (isApplyingCloudRef.current) return;

    const snapshot = getPlannerSnapshot();
    const snapshotString = snapshotToString(snapshot);
    if (snapshotString === lastSavedSnapshotRef.current) return;

    setCloudSyncActivity("Waiting 2s to save...");
    const timeout = window.setTimeout(() => {
      performCloudSave({ silent: true });
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [plannerTitle, selectedDate, casesByDate, facilities, surgeonRosters, procedureExclusions, growthSurgeons, weekStartDay, plannerLoaded, autoCloudReady, cloudSession?.user?.id]);

  const selectedDateCases = casesByDate[selectedDate] || [];
  const matchesSelectedFacility = (c) => selectedFacility === ALL_FACILITIES || c.facility === selectedFacility;
  const selectedDateFacilityCases = selectedDateCases.filter(matchesSelectedFacility);
  const getCasesForDate = (dateKey) => (casesByDate[dateKey] || []).filter(matchesSelectedFacility);
  const weekCases = weekDates.flatMap((dateKey) => getCasesForDate(dateKey));
  const yearCases = Object.entries(casesByDate)
    .filter(([dateKey]) => dateKey.startsWith(`${selectedYear}-`) && dateKey <= selectedWeekEnd)
    .flatMap(([, cases]) => cases.filter(matchesSelectedFacility));

  const weeklyStats = useMemo(
    () => ({
      total: weekCases.length,
      growth: weekCases.filter((c) => c.growth).length,
      fastTracking: weekCases.filter((c) => c.fastTracking).length,
      reconciled: weekCases.filter((c) => c.reconciled).length,
      unreconciled: weekCases.filter((c) => !c.reconciled).length,
    }),
    [weekCases]
  );

  const yearlyStats = useMemo(
    () => ({
      total: yearCases.length,
      growth: yearCases.filter((c) => c.growth).length,
    }),
    [yearCases]
  );

  const dayStats = useMemo(
    () => ({
      total: selectedDateFacilityCases.length,
      growth: selectedDateFacilityCases.filter((c) => c.growth).length,
      fastTracking: selectedDateFacilityCases.filter((c) => c.fastTracking).length,
      reconciled: selectedDateFacilityCases.filter((c) => c.reconciled).length,
    }),
    [selectedDateFacilityCases]
  );

  const visibleCases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return selectedDateCases
      .filter((c) => {
        const facilityMatch = selectedFacility === ALL_FACILITIES || c.facility === selectedFacility;
        const searchFields = [
          c.facility,
          c.time,
          c.surgeon,
          getSubspecialty(surgeonRosters, c.facility, c.surgeon),
          c.procedure,
          c.notes,
        ];
        const searchMatch = !q || searchFields.some((field) => String(field || "").toLowerCase().includes(q));
        return facilityMatch && searchMatch;
      })
      .sort(compareCasesByTime);
  }, [selectedDateCases, selectedFacility, search, surgeonRosters]);

  const isAutoGrowthSurgeon = (surgeonName) => {
    if (!surgeonName) return false;
    if (growthSurgeons.includes(surgeonName)) return true;
    return Object.values(surgeonRosters).some((roster) =>
      (roster || []).some((surgeon) => surgeon.name === surgeonName && isGrowthSpecialty(surgeon.subspecialty))
    );
  };

  const addSurgeryFacility = selectedFacility === ALL_FACILITIES ? sortedFacilities[0] || "" : selectedFacility;
  const addSurgerySurgeonOptions = useMemo(() => {
    const query = caseTemplateSurgeon.trim();
    return getSurgeonNames(surgeonRosters, addSurgeryFacility)
      .map((surgeon) => ({ surgeon, rank: surgeonSearchRank(surgeon, query) }))
      .filter((item) => item.rank < 99)
      .sort((a, b) => a.rank - b.rank || a.surgeon.localeCompare(b.surgeon))
      .map((item) => item.surgeon);
  }, [surgeonRosters, addSurgeryFacility, caseTemplateSurgeon]);

  const resolveCaseTemplateSurgeon = () => {
    const typed = caseTemplateSurgeon.trim();
    if (!typed) return "";
    const allSurgeons = getSurgeonNames(surgeonRosters, addSurgeryFacility);
    const exact = allSurgeons.find((surgeon) => normalizeSurgeonSearch(surgeon) === normalizeSurgeonSearch(typed));
    if (exact) return exact;
    if (addSurgerySurgeonOptions.length === 1) return addSurgerySurgeonOptions[0];
    return typed;
  };

  const addSurgerySpecialty = getSurgeonSpecialty(surgeonRosters, addSurgeryFacility, resolveCaseTemplateSurgeon());
  const procedureOptionsForSpecialty = useMemo(() => {
    const specialty = normalizeProcedureSearch(addSurgerySpecialty);
    if (!specialty) return [];
    const procedures = new Set();
    Object.entries(casesByDate).forEach(([, cases]) => {
      (cases || []).forEach((item) => {
        const procedure = (item.procedure || "").trim();
        if (!procedure || procedure.length < 4 || procedure.toLowerCase() === "hysterectomy b" || isProcedureHiddenFromRoster(procedure)) return;
        const itemSpecialty = getSurgeonSpecialty(surgeonRosters, item.facility, item.surgeon);
        if (normalizeProcedureSearch(itemSpecialty) === specialty) procedures.add(procedure);
      });
    });
    return Array.from(procedures).sort((a, b) => a.localeCompare(b));
  }, [casesByDate, surgeonRosters, addSurgerySpecialty, procedureExclusionKeys]);

  const filteredProcedureOptions = useMemo(() => {
    const query = normalizeProcedureSearch(caseTemplateProcedure);
    return procedureOptionsForSpecialty
      .filter((procedure) => !query || normalizeProcedureSearch(procedure).includes(query))
      .sort((a, b) => {
        const aName = normalizeProcedureSearch(a);
        const bName = normalizeProcedureSearch(b);
        const aStarts = query && aName.startsWith(query) ? 0 : 1;
        const bStarts = query && bName.startsWith(query) ? 0 : 1;
        return aStarts - bStarts || a.localeCompare(b);
      });
  }, [procedureOptionsForSpecialty, caseTemplateProcedure]);

  const resolveCaseTemplateProcedure = () => {
    const typed = caseTemplateProcedure.trim();
    if (!typed) return "";
    const exact = procedureOptionsForSpecialty.find((procedure) => normalizeProcedureSearch(procedure) === normalizeProcedureSearch(typed));
    if (exact) return exact;
    if (filteredProcedureOptions.length === 1) return filteredProcedureOptions[0];
    return typed;
  };

  const selectFacilityAndMoveToSurgeon = (facility) => {
    syncActiveFacility(facility);
    window.setTimeout(() => {
      const isDesktop = isDesktopLayout ? true : isMobileLayout ? false : window.matchMedia?.("(min-width: 768px)")?.matches;
      const target = isDesktop ? desktopSurgeonInputRef.current : mobileSurgeonInputRef.current;
      target?.focus?.();
      if (isDesktop && desktopSurgeonInputRef.current) desktopSurgeonInputRef.current.select?.();
    }, 75);
  };

  const selectSurgeonAndMoveToProcedure = () => {
    const resolvedSurgeon = resolveCaseTemplateSurgeon();
    if (resolvedSurgeon) setCaseTemplateSurgeon(resolvedSurgeon);
    window.setTimeout(() => procedureInputRef.current?.focus?.(), 0);
  };

  const addCase = () => {
    const facility = addSurgeryFacility;
    const quantity = Math.max(1, Number.parseInt(caseQuantity, 10) || 1);
    const selectedSurgeon = resolveCaseTemplateSurgeon();

    if (quantity > 1 && !selectedSurgeon) {
      alert("Please select a surgeon before adding multiple cases.");
      return;
    }

    const casesToAdd = Array.from({ length: quantity }, () => ({
      ...blankCase(selectedDate, facility),
      time: caseTemplateTime.trim(),
      surgeon: selectedSurgeon,
      procedure: resolveCaseTemplateProcedure(),
      growth: isAutoGrowthSurgeon(selectedSurgeon),
    }));
    setCasesByDate((prev) => ({ ...prev, [selectedDate]: [...(prev[selectedDate] || []), ...casesToAdd] }));
    setCaseTemplateProcedure("");
    setCaseTemplateTime("");
    setCaseQuantity(1);
  };

  const updateCase = (id, patch) => {
    setCasesByDate((prev) => ({
      ...prev,
      [selectedDate]: (prev[selectedDate] || []).map((c) => {
        if (c.id !== id) return c;
        const next = { ...c, ...patch };
        if (patch.facility && patch.facility !== c.facility) {
          const surgeons = getSurgeonNames(surgeonRosters, patch.facility);
          next.surgeon = surgeons[0] || "";
          next.growth = isAutoGrowthSurgeon(next.surgeon);
        }
        if (patch.surgeon) {
          next.growth = isAutoGrowthSurgeon(patch.surgeon);
        }
        return next;
      }),
    }));
  };

  const deleteCase = (id) => {
    setDeletingCaseIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    window.setTimeout(() => {
      setCasesByDate((prev) => ({ ...prev, [selectedDate]: (prev[selectedDate] || []).filter((c) => c.id !== id) }));
      setDeletingCaseIds((prev) => prev.filter((caseId) => caseId !== id));
    }, 220);
  };

  const openCaseEditor = (dateKey, item, source = "normal") => {
    setSelectedReviewCase({ dateKey, id: item.id, source });
    setReviewDraft({
      facility: item.facility || "",
      time: item.time || "",
      surgeon: item.surgeon || "",
      procedure: item.procedure || "",
      fastTracking: Boolean(item.fastTracking),
      reconciled: Boolean(item.reconciled),
      growth: Boolean(item.growth),
      notes: item.notes || "",
    });
  };

  const openUnreconciledCaseEditor = (item) => openCaseEditor(item.displayDateKey, item, "unreconciled");

  const closeUnreconciledCaseEditor = () => {
    setSelectedReviewCase(null);
    setReviewDraft(null);
  };

  const updateReviewDraft = (patch) => {
    setReviewDraft((prev) => prev ? { ...prev, ...patch } : prev);
  };

  const saveReviewCase = (overrides = {}) => {
    if (!selectedReviewCase || !reviewDraft) return;
    const nextDraft = { ...reviewDraft, ...overrides };
    setCasesByDate((prev) => ({
      ...prev,
      [selectedReviewCase.dateKey]: (prev[selectedReviewCase.dateKey] || []).map((c) =>
        c.id === selectedReviewCase.id ? { ...c, ...nextDraft, date: selectedReviewCase.dateKey } : c
      ),
    }));
    closeUnreconciledCaseEditor();
  };

  const requestReconcileCase = (dateKey, item) => {
    if (dateKey <= todayKey) {
      setCasesByDate((prev) => ({
        ...prev,
        [dateKey]: (prev[dateKey] || []).map((c) =>
          c.id === item.id ? { ...c, reconciled: true } : c
        ),
      }));
      return;
    }
    setPendingReconcileCase({ dateKey, item });
  };

  const confirmReconcileCase = () => {
    if (!pendingReconcileCase) return;
    setCasesByDate((prev) => ({
      ...prev,
      [pendingReconcileCase.dateKey]: (prev[pendingReconcileCase.dateKey] || []).map((c) =>
        c.id === pendingReconcileCase.item.id ? { ...c, reconciled: true } : c
      ),
    }));
    setPendingReconcileCase(null);
  };

  const cancelReconcileCase = () => {
    setPendingReconcileCase(null);
  };

  const resetSelectedDay = () => {
    const confirmed = window.confirm(`Clear all cases for ${formatLongDate(selectedDate)}? Surgeon rosters will stay.`);
    if (!confirmed) return;
    setCasesByDate((prev) => ({ ...prev, [selectedDate]: [] }));
    setSearch("");
    setSelectedFacility(ALL_FACILITIES);
  };

  const addSurgeonToRoster = () => {
    const name = newSurgeonName.trim();
    const specialty = newSurgeonSubspecialty.trim();
    if (!name) return;
    setSurgeonRosters((prev) => {
      const current = prev[rosterFacility] || [];
      if (current.some((s) => s.name.toLowerCase() === name.toLowerCase())) return prev;
      return {
        ...prev,
        [rosterFacility]: [...current, { name, subspecialty: specialty }].sort((a, b) => a.name.localeCompare(b.name)),
      };
    });
    if (isGrowthSpecialty(specialty)) {
      setGrowthSurgeons((prev) => prev.includes(name) ? prev : [...prev, name]);
    }
    setNewSurgeonName("");
    setNewSurgeonSubspecialty("");
  };

  const removeSurgeonFromRoster = (facility, surgeon) => {
    setSurgeonRosters((prev) => ({
      ...prev,
      [facility]: (prev[facility] || []).filter((s) => s.name !== surgeon),
    }));
    setGrowthSurgeons((prev) => prev.filter((s) => s !== surgeon));
  };

  const removeProcedureFromRoster = (procedure) => {
    const cleanProcedure = (procedure || "").trim();
    if (!cleanProcedure) return;
    const confirmed = window.confirm(`Hide "${cleanProcedure}" from saved procedure suggestions and Salesforce matching? Existing cases will not be deleted.`);
    if (!confirmed) return;
    setProcedureExclusions((prev) => {
      const existing = new Set((prev || []).map((item) => normalizeProcedureSearch(typeof item === "string" ? item : item?.procedure)).filter(Boolean));
      const key = normalizeProcedureSearch(cleanProcedure);
      if (existing.has(key)) return prev;
      return [...(prev || []), cleanProcedure];
    });
  };

  const procedureRosterItemKey = (item) => `${normalizeProcedureSearch(item?.specialty || "Unassigned")}::${normalizeProcedureSearch(item?.procedure || "")}`;

  const startEditingProcedureFromRoster = (item) => {
    setEditingProcedureRosterKey(procedureRosterItemKey(item));
    setEditingProcedureName(item?.procedure || "");
  };

  const cancelEditingProcedureFromRoster = () => {
    setEditingProcedureRosterKey("");
    setEditingProcedureName("");
  };

  const saveProcedureRosterRename = (item) => {
    const oldProcedure = (item?.procedure || "").trim();
    const newProcedure = editingProcedureName.trim();
    const specialty = item?.specialty || "Unassigned";
    if (!oldProcedure || !newProcedure) return;
    if (normalizeProcedureSearch(oldProcedure) === normalizeProcedureSearch(newProcedure)) {
      cancelEditingProcedureFromRoster();
      return;
    }

    const confirmed = window.confirm(`Rename procedure "${oldProcedure}" to "${newProcedure}" for ${specialty}? Existing cases using this saved procedure will be updated. Nothing will be deleted.`);
    if (!confirmed) return;

    setCasesByDate((prev) => {
      const next = {};
      Object.entries(prev || {}).forEach(([dateKey, cases]) => {
        next[dateKey] = (cases || []).map((caseItem) => {
          const caseProcedure = (caseItem.procedure || "").trim();
          if (normalizeProcedureSearch(caseProcedure) !== normalizeProcedureSearch(oldProcedure)) return caseItem;
          const caseSpecialty = getSurgeonSpecialty(surgeonRosters, caseItem.facility, caseItem.surgeon) || "Unassigned";
          if (specialty !== ALL_PROCEDURE_SPECIALTIES && normalizeProcedureSearch(caseSpecialty) !== normalizeProcedureSearch(specialty)) return caseItem;
          return { ...caseItem, procedure: newProcedure };
        });
      });
      return next;
    });

    setProcedureExclusions((prev) => (prev || []).filter((entry) => normalizeProcedureSearch(typeof entry === "string" ? entry : entry?.procedure) !== normalizeProcedureSearch(newProcedure)));
    cancelEditingProcedureFromRoster();
  };

  const toggleGrowthSurgeon = (surgeon) => {
    setGrowthSurgeons((prev) => (prev.includes(surgeon) ? prev.filter((s) => s !== surgeon) : [...prev, surgeon]));
  };

  const syncActiveFacility = (facility) => {
    if (!facility) return;
    if (facility === ALL_FACILITIES || facility === ALL_SURGEONS) {
      setRosterFacility(ALL_SURGEONS);
      setSelectedFacility(ALL_FACILITIES);
      return;
    }
    setRosterFacility(facility);
    setSelectedFacility(facility);
  };

  const addFacility = () => {
    const name = newFacilityName.trim();
    if (!name) return;
    setFacilities((prev) => {
      if (prev.some((f) => f.toLowerCase() === name.toLowerCase())) return prev;
      return [...prev, name].sort((a, b) => a.localeCompare(b));
    });
    setSurgeonRosters((prev) => ({ ...prev, [name]: prev[name] || [] }));
    syncActiveFacility(name);
    setNewFacilityName("");
  };

  const removeFacility = (facility) => {
    const hasCases = Object.values(casesByDate).flat().some((c) => c.facility === facility);
    const confirmed = window.confirm(
      hasCases
        ? `${facility} has saved cases. Remove it from the facility list anyway? Existing cases will remain in your history.`
        : `Remove ${facility} from your facility list?`
    );
    if (!confirmed) return;
    setFacilities((prev) => prev.filter((f) => f !== facility));
    setSurgeonRosters((prev) => {
      const next = { ...prev };
      delete next[facility];
      return next;
    });
    setSelectedFacility((prev) => prev === facility ? ALL_FACILITIES : prev);
    setRosterFacility((prev) => {
      if (prev !== facility) return prev;
      const remaining = sortedFacilities.filter((f) => f !== facility);
      return remaining.length ? remaining[0] : ALL_SURGEONS;
    });
  };

  const selectedRoster = rosterFacility === ALL_SURGEONS
    ? sortedFacilities.flatMap((facility) => (surgeonRosters[facility] || []).map((surgeon) => ({ ...surgeon, facility })))
    : surgeonRosters[rosterFacility] || [];

  const importJson = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        setPlannerTitle(parsed.plannerTitle || parsed.weekTitle || "OR Calendar Planner");
        setSelectedDate(todayKey);
        setCasesByDate(parsed.casesByDate || {});
        const importedFacilities = getFacilitiesFromPlanner(parsed).sort((a, b) => a.localeCompare(b));
        setFacilities(importedFacilities);
        setRosterFacility((prev) => prev === ALL_SURGEONS || importedFacilities.includes(prev) ? prev : ALL_SURGEONS);
        setSurgeonRosters(ensureRosterShape(parsed.surgeonRosters || buildEmptyRosters(importedFacilities), importedFacilities));
        setGrowthSurgeons(Array.isArray(parsed.growthSurgeons) ? parsed.growthSurgeons : []);
        setProcedureExclusions(Array.isArray(parsed.procedureExclusions) ? parsed.procedureExclusions : []);
        setWeekStartDay(WEEK_START_OPTIONS.includes(parsed.weekStartDay) ? parsed.weekStartDay : "Sunday");
      } catch {
        alert("Could not import that file. Please use an exported OR Planner JSON backup.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ plannerTitle, selectedDate, casesByDate, facilities: sortedFacilities, surgeonRosters, procedureExclusions, growthSurgeons, weekStartDay }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `OR-Calendar-Planner-Backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const normalizeSfText = (value = "") =>
    String(value || "").replace(/\s+/g, " ").trim();

  const sfDateToDateKey = (value = "") => {
    const text = normalizeSfText(value);
    const match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if (!match) return text;
    const [, month, day, year] = match;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  };


  const normalizeSfKey = (value = "") =>
    normalizeSfText(value)
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/[^a-z0-9\s/]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const sfTokens = (value = "") =>
    normalizeSfKey(value)
      .split(" ")
      .filter((token) => token.length > 1);

  const sfLastName = (value = "") => {
    const tokens = sfTokens(value);
    return tokens[tokens.length - 1] || "";
  };

  const sfSimilarityScore = (leftValue = "", rightValue = "") => {
    const left = normalizeSfKey(leftValue);
    const right = normalizeSfKey(rightValue);

    if (!left || !right) return 0;
    if (left === right) return 1;
    if (left.includes(right) || right.includes(left)) return 0.85;

    const leftTokens = new Set(sfTokens(left));
    const rightTokens = new Set(sfTokens(right));
    if (!leftTokens.size || !rightTokens.size) return 0;

    const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
    const union = new Set([...leftTokens, ...rightTokens]).size;
    return intersection / union;
  };

  const sfSurgeonScore = (left = "", right = "") => {
    const similarity = sfSimilarityScore(left, right);
    const leftTokens = sfTokens(left).filter((token) => token !== "dr");
    const rightTokens = sfTokens(right).filter((token) => token !== "dr");
    const leftLast = leftTokens[leftTokens.length - 1] || "";
    const rightLast = rightTokens[rightTokens.length - 1] || "";
    const leftFirst = leftTokens[0] || "";
    const rightFirst = rightTokens[0] || "";
    const sameLast = leftLast && rightLast && leftLast === rightLast;
    const firstCompatible =
      !leftFirst ||
      !rightFirst ||
      leftFirst === rightFirst ||
      leftFirst[0] === rightFirst[0];

    let nameStructureScore = 0;
    if (sameLast && firstCompatible) nameStructureScore = 0.97;
    else if (sameLast) nameStructureScore = 0.88;

    return Math.max(similarity, nameStructureScore);
  };

  const sfPreferredSurgeonRosterEntry = (left, right) => {
    const leftName = normalizeSfText(left?.name || "");
    const rightName = normalizeSfText(right?.name || "");
    const leftStartsDr = /^dr\.?\s+/i.test(leftName);
    const rightStartsDr = /^dr\.?\s+/i.test(rightName);
    if (leftStartsDr !== rightStartsDr) return leftStartsDr ? left : right;

    const leftTokenCount = sfTokens(leftName).filter((token) => token !== "dr").length;
    const rightTokenCount = sfTokens(rightName).filter((token) => token !== "dr").length;
    if (leftTokenCount !== rightTokenCount) return leftTokenCount > rightTokenCount ? left : right;

    return leftName.length >= rightName.length ? left : right;
  };

  const sfBestRosterSurgeonMatch = (facility = "", surgeonName = "") => {
    const normalizedFacility = normalizeSfText(facility);
    const normalizedSurgeon = normalizeSfText(surgeonName);
    if (!normalizedFacility || !normalizedSurgeon) return null;

    const candidates = surgeonRosters[normalizedFacility] || [];
    const ranked = candidates
      .map((surgeon) => ({ surgeon, score: sfSurgeonScore(surgeon?.name || "", normalizedSurgeon) }))
      .filter((candidate) => candidate.score >= 0.9)
      .sort((a, b) => b.score - a.score || (b.surgeon?.name || "").length - (a.surgeon?.name || "").length);

    return ranked[0] || null;
  };

  const sfCanonicalSurgeonNameForFacility = (facility = "", surgeonName = "") => {
    const match = sfBestRosterSurgeonMatch(facility, surgeonName);
    return match?.surgeon?.name || normalizeSfText(surgeonName);
  };

  const sfCanonicalizeSurgeonForRow = (row) => {
    const facility = normalizeSfText(row?.facility);
    const surgeon = normalizeSfText(row?.surgeon);
    if (!facility || !surgeon) return row;

    const canonicalName = sfCanonicalSurgeonNameForFacility(facility, surgeon);
    if (!canonicalName || canonicalName === surgeon) return row;

    return {
      ...row,
      surgeon: canonicalName,
      rosterSurgeonName: canonicalName,
      rosterSurgeonSubspecialty: getSubspecialty(surgeonRosters, facility, canonicalName) || row.rosterSurgeonSubspecialty || row.category || "",
      surgeonCanonicalizedFrom: surgeon,
    };
  };

  const sfProcedureTokens = (value = "") =>
    sfTokens(value).filter((token) => !["the", "and", "with", "without", "case", "procedure"].includes(token));

  const sfProcedureScore = (leftValue = "", rightValue = "") => {
    const left = normalizeSfKey(leftValue);
    const right = normalizeSfKey(rightValue);
    if (!left || !right) return 0;
    if (left === right) return 1;

    const leftTokens = sfProcedureTokens(left);
    const rightTokens = sfProcedureTokens(right);
    if (!leftTokens.length || !rightTokens.length) return 0;

    const leftSet = new Set(leftTokens);
    const rightSet = new Set(rightTokens);
    const intersection = leftTokens.filter((token) => rightSet.has(token)).length;
    const smaller = Math.min(leftSet.size, rightSet.size);
    const larger = Math.max(leftSet.size, rightSet.size);
    const containment = smaller ? intersection / smaller : 0;
    const jaccard = larger ? intersection / new Set([...leftTokens, ...rightTokens]).size : 0;

    // If one saved procedure is a clean shorter version of the Salesforce phrase
    // (ex: "Ventral" vs "Ventral Hernia IPOM"), treat it as a strong match so
    // imports use the existing procedure label instead of creating a duplicate.
    if (left.includes(right) || right.includes(left)) {
      if (containment >= 1 && smaller >= 1) return 0.95;
      return Math.max(0.88, jaccard);
    }

    // Shared specific words are useful, but do not let one generic word create a match.
    if (containment >= 1 && smaller >= 2) return 0.9;
    if (containment >= 0.75 && intersection >= 2) return 0.82;

    return jaccard;
  };

  const sfPreferredProcedureName = (left = "", right = "") => {
    const leftName = normalizeSfText(left);
    const rightName = normalizeSfText(right);
    if (!leftName) return rightName;
    if (!rightName) return leftName;

    const leftKey = normalizeSfKey(leftName);
    const rightKey = normalizeSfKey(rightName);
    if (leftKey === rightKey) return leftName.length <= rightName.length ? leftName : rightName;

    // Prefer the existing clean/shorter procedure label when one contains the other.
    if (leftKey.includes(rightKey) || rightKey.includes(leftKey)) {
      return leftName.length <= rightName.length ? leftName : rightName;
    }

    return leftName;
  };

  const sfExistingProcedureCandidates = (facility = "", surgeon = "", specialty = "", sourceCasesByDate = casesByDate) => {
    const normalizedFacility = normalizeSfText(facility);
    const normalizedSurgeon = normalizeSfText(surgeon);
    const normalizedSpecialty = normalizeProcedureSearch(specialty || getSurgeonSpecialty(surgeonRosters, normalizedFacility, normalizedSurgeon));

    const counts = new Map();

    Object.entries(sourceCasesByDate || {}).forEach(([, dateCases]) => {
      (dateCases || []).forEach((item) => {
        const procedure = normalizeSfText(item?.procedure);
        if (!procedure || procedure.length < 4 || procedure.toLowerCase() === "hysterectomy b" || isProcedureHiddenFromRoster(procedure)) return;

        const itemSpecialty = normalizeProcedureSearch(getSurgeonSpecialty(surgeonRosters, item.facility, item.surgeon));
        const sameSpecialty = normalizedSpecialty && itemSpecialty && normalizedSpecialty === itemSpecialty;
        const sameFacilitySurgeon =
          normalizedFacility &&
          normalizedSurgeon &&
          normalizeSfText(item.facility) === normalizedFacility &&
          sfSurgeonScore(item.surgeon, normalizedSurgeon) >= 0.9;

        // Prefer procedures from the same specialty. If specialty is missing, fall back
        // to same facility/surgeon so incomplete Salesforce snippets still canonicalize.
        if (!sameSpecialty && !sameFacilitySurgeon) return;

        const current = counts.get(procedure) || 0;
        counts.set(procedure, current + 1);
      });
    });

    return Array.from(counts.entries()).map(([procedure, count]) => ({ procedure, count }));
  };

  const sfBestExistingProcedureMatch = (procedure = "", facility = "", surgeon = "", specialty = "", sourceCasesByDate = casesByDate) => {
    const normalizedProcedure = normalizeSfText(procedure);
    if (!normalizedProcedure) return null;

    const normalizedProcedureKey = normalizeSfKey(normalizedProcedure);

    const candidates = sfExistingProcedureCandidates(facility, surgeon, specialty, sourceCasesByDate)
      .map((candidate) => {
        const candidateKey = normalizeSfKey(candidate.procedure);
        return {
          ...candidate,
          candidateKey,
          score: sfProcedureScore(candidate.procedure, normalizedProcedure),
          isShorterContainedLabel:
            candidateKey &&
            candidateKey !== normalizedProcedureKey &&
            candidateKey.length >= 4 &&
            normalizedProcedureKey.includes(candidateKey),
        };
      })
      .filter((candidate) => candidate.score >= 0.88)
      .sort((a, b) => {
        // Prefer the already-saved shorter label when Salesforce gives a longer
        // variant of it, ex: saved "Ventral" vs SF "Ventral Hernia IPOM".
        if (a.isShorterContainedLabel !== b.isShorterContainedLabel) return a.isShorterContainedLabel ? -1 : 1;
        if (b.score !== a.score) return b.score - a.score;
        if (b.count !== a.count) return b.count - a.count;
        return a.procedure.length - b.procedure.length;
      });

    return candidates[0] || null;
  };

  const sfCanonicalProcedureNameForRow = (row, sourceCasesByDate = casesByDate) => {
    const procedure = normalizeSfText(row?.procedure);
    if (!procedure) return "";

    const facility = normalizeSfText(row?.facility);
    const surgeon = normalizeSfText(row?.surgeon);
    const specialty = normalizeSfText(row?.rosterSurgeonSubspecialty || row?.category || getSurgeonSpecialty(surgeonRosters, facility, surgeon));
    const match = sfBestExistingProcedureMatch(procedure, facility, surgeon, specialty, sourceCasesByDate);

    return match?.procedure || procedure;
  };

  const sfCanonicalizeProcedureForRow = (row, sourceCasesByDate = casesByDate) => {
    const procedure = normalizeSfText(row?.procedure);
    if (!procedure) return row;

    const canonicalProcedure = sfCanonicalProcedureNameForRow(row, sourceCasesByDate);
    if (!canonicalProcedure || canonicalProcedure === procedure) return row;

    return {
      ...row,
      procedure: canonicalProcedure,
      procedureCanonicalizedFrom: procedure,
    };
  };

  const sfTimeDifferenceMinutes = (left = "", right = "") => {
    const leftMinutes = parseTimeToMinutes(left);
    const rightMinutes = parseTimeToMinutes(right);
    if (leftMinutes === null || rightMinutes === null) return null;
    return Math.abs(leftMinutes - rightMinutes);
  };

  const sfIsCompleted = (item) => normalizeSfKey(item.salesforceStatus) === "completed";
  const sfIsOnSite = (item) => normalizeSfKey(item.salesforceStatus) === "onsite";

  const sfSurgeonFacilityOptions = (surgeonName = "") => {
    const normalizedSurgeon = normalizeSurgeonSearch(surgeonName);
    if (!normalizedSurgeon) return [];

    return sortedFacilities.filter((facility) =>
      (surgeonRosters[facility] || []).some((surgeon) => {
        const rosterName = surgeon?.name || "";
        const normalizedRosterName = normalizeSurgeonSearch(rosterName);
        return (
          normalizedRosterName === normalizedSurgeon ||
          sfSurgeonScore(rosterName, surgeonName) >= 0.9
        );
      })
    );
  };

  const sfFacilityFromRowOrSurgeon = (hospital = "", surgeonName = "") => {
    const visibleFacility = normalizeSfText(hospital);
    if (visibleFacility) {
      return { facility: visibleFacility, facilityOptions: [], facilitySource: "salesforce" };
    }

    const options = sfSurgeonFacilityOptions(surgeonName);
    if (options.length === 1) {
      return { facility: options[0], facilityOptions: options, facilitySource: "surgeon_roster" };
    }

    if (options.length > 1) {
      return { facility: "", facilityOptions: options, facilitySource: "surgeon_roster_multiple" };
    }

    return { facility: "", facilityOptions: [], facilitySource: "unknown" };
  };

  const sfSurgeonExistsInFacility = (facility = "", surgeonName = "") => {
    return Boolean(sfBestRosterSurgeonMatch(facility, surgeonName));
  };

  const sfAddSurgeonToRosterFromRow = (row) => {
    const facility = normalizeSfText(row?.facility);
    const typedSurgeonName = normalizeSfText(row?.rosterSurgeonName || row?.surgeon);
    if (!facility || !typedSurgeonName) return;

    const existingMatch = sfBestRosterSurgeonMatch(facility, typedSurgeonName);
    if (existingMatch?.surgeon?.name) {
      const canonicalName = existingMatch.surgeon.name;
      updateSalesforceRow(row.id, {
        surgeon: canonicalName,
        rosterSurgeonName: canonicalName,
        rosterSurgeonSubspecialty: existingMatch.surgeon.subspecialty || row?.rosterSurgeonSubspecialty || row?.category || "",
        surgeonCanonicalizedFrom: normalizeSfText(row?.surgeon),
      });
      setSfApplySummary(`Matched ${typedSurgeonName} to existing roster surgeon ${canonicalName}. No duplicate surgeon was added.`);
      return;
    }

    const surgeonName = typedSurgeonName;
    const subspecialty = normalizeSfText(row?.rosterSurgeonSubspecialty || row?.category);

    setFacilities((prev) =>
      prev.some((existing) => existing.toLowerCase() === facility.toLowerCase())
        ? prev
        : [...prev, facility].sort((a, b) => a.localeCompare(b))
    );

    setSurgeonRosters((prev) => {
      const current = prev[facility] || [];
      const existingIndex = current.findIndex((surgeon) => normalizeSurgeonSearch(surgeon?.name || "") === normalizeSurgeonSearch(surgeonName));

      if (existingIndex >= 0) {
        const updatedRoster = current.map((surgeon, index) =>
          index === existingIndex ? { ...surgeon, name: surgeonName, subspecialty } : surgeon
        );

        return {
          ...prev,
          [facility]: updatedRoster.sort((a, b) => a.name.localeCompare(b.name)),
        };
      }

      return {
        ...prev,
        [facility]: [...current, { name: surgeonName, subspecialty }].sort((a, b) => a.name.localeCompare(b.name)),
      };
    });

    if (isGrowthSpecialty(subspecialty)) {
      setGrowthSurgeons((prev) => (prev.includes(surgeonName) ? prev : [...prev, surgeonName]));
    }

    updateSalesforceRow(row.id, {
      surgeon: surgeonName,
      rosterSurgeonName: surgeonName,
      rosterSurgeonSubspecialty: subspecialty,
    });

    setSfApplySummary(`Added ${surgeonName} to the ${facility} surgeon roster.`);
  };

  const sfFlattenPlannerCases = () =>
    Object.entries(casesByDate).flatMap(([dateKey, dateCases]) =>
      (dateCases || []).map((item) => ({ ...item, displayDateKey: dateKey }))
    );

  const sfScorePlannerMatch = (sfCase, plannerCase, mode = "normal") => {
    const dateMatches = sfCase.dateKey && sfCase.dateKey === plannerCase.displayDateKey;
    if (!dateMatches) {
      return { plannerCase, score: 0, status: "No Match", reasons: ["date mismatch"] };
    }

    const facilityScore = sfSimilarityScore(sfCase.facility, plannerCase.facility);
    const surgeonScore = sfSurgeonScore(sfCase.surgeon, plannerCase.surgeon);
    const procedureScore = sfSimilarityScore(sfCase.procedure, plannerCase.procedure);
    const timeDiff = sfTimeDifferenceMinutes(sfCase.time, plannerCase.time);
    const hasBothTimes = parseTimeToMinutes(sfCase.time) !== null && parseTimeToMinutes(plannerCase.time) !== null;
    const identityMatches = facilityScore >= 0.7 && surgeonScore >= 0.7 && procedureScore >= 0.5;
    const timeIsTight = hasBothTimes && timeDiff !== null && timeDiff <= 15;
    const timeIsReasonable = hasBothTimes && timeDiff !== null && timeDiff <= 30;

    let score = 25;
    const reasons = ["date"];

    if (mode === "reconcile") {
      if (!plannerCase.fastTracking) return { plannerCase, score: 0, status: "No Match", reasons: ["not fast tracked"] };
      score += 20;
      reasons.push("fast tracked");
    }

    if (timeIsTight) {
      score += 25;
      reasons.push(timeDiff === 0 ? "exact time" : `time within ${timeDiff} min`);
    } else if (timeIsReasonable) {
      score += 12;
      reasons.push(`time within ${timeDiff} min`);
    } else if (!hasBothTimes) {
      score += mode === "reconcile" ? 0 : 5;
      reasons.push("time missing");
    }

    if (facilityScore >= 0.7) reasons.push("facility");
    if (surgeonScore >= 0.7) reasons.push("surgeon");
    if (procedureScore >= 0.5) reasons.push("procedure");

    score += facilityScore * 20;
    score += surgeonScore * 20;
    score += procedureScore * 15;

    let status = "No Match";

    // For Salesforce Account Procedure History snippets, time is often not visible.
    // Date + facility + surgeon alone is not enough because one surgeon can have
    // several procedures on the same day. Require procedure similarity for any
    // possible/exact match. If procedure does not match, treat it as no match so
    // the AI's suggested import/reconciliation action can be selected automatically.
    if (mode === "reconcile") {
      if (plannerCase.fastTracking && identityMatches && score >= 80) status = "Match";
      else if (plannerCase.fastTracking && identityMatches && score >= 65) status = "Possible Match";
    } else {
      if (identityMatches && (timeIsTight || !hasBothTimes) && score >= 80) status = "Match";
      else if (identityMatches && score >= 65) status = "Possible Match";
    }

    return { plannerCase, score: Math.round(score), status, reasons };
  };

  const sfGetPlannerMatches = (sfCase, mode = "normal") =>
    sfFlattenPlannerCases()
      .map((plannerCase) => sfScorePlannerMatch(sfCase, plannerCase, mode))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score);

  const sfSuggestedAction = (item, screenshotType = "") => {
    const recommended = normalizeSfKey(item.recommendedAction);
    const type = normalizeSfKey(screenshotType);
    const hasScheduledDate = Boolean(normalizeSfText(item.scheduledDate));

    // Scheduled Procedures screen is different from Account Procedure History.
    // These are newly scheduled rows and should become fastTracking cases.
    if (type.includes("scheduled procedures") || recommended.includes("import new fast tracking")) return "importNew";

    // Account Procedure History rule:
    // Scheduled column controls fastTracking. Status controls reconciled.
    if (hasScheduledDate && sfIsCompleted(item)) return "markReconciled";
    if (hasScheduledDate) return "ignore";

    // No Scheduled date means this case was NOT fast tracked.
    // Completed means reconciled true, but fastTracking must stay false.
    if (sfIsCompleted(item)) return "importNewNormalReconciled";
    if (sfIsOnSite(item)) return "importNewNormal";

    // Fallback to AI recommendation only when status/scheduled fields do not make it obvious.
    if (recommended.includes("mark existing")) return "markReconciled";
    if (recommended.includes("already fast tracked")) return "ignore";
    if (recommended.includes("not fast tracked") && recommended.includes("reconciled")) return "importNewNormalReconciled";
    if (recommended.includes("not fast tracked")) return "importNewNormal";
    if (recommended.includes("import new") && recommended.includes("reconciled")) return "importNewNormalReconciled";
    if (recommended.includes("import new")) return "importNewNormal";

    return "review";
  };

  const sfHasRequiredNewCaseFields = (item, screenshotType = "") => {
    const type = normalizeSfKey(screenshotType);
    const requiresTime = type.includes("scheduled procedures");

    if (!item.dateKey || !item.facility || !item.surgeon || !item.procedure) return false;
    if (requiresTime && !item.time) return false;

    return true;
  };

  const sfActionLabel = (action) => {
    if (action === "importNew") return "Import New Fast Tracked";
    if (action === "importNewReconciled") return "Import New FT + Reconciled";
    if (action === "importNewNormal") return "Import New Non-FT Case";
    if (action === "importNewNormalReconciled") return "Import New Non-FT + Reconciled";
    if (action === "markFastTracking") return "Mark Existing Fast Tracked";
    if (action === "markReconciled") return "Mark Existing FT Case Reconciled";
    if (action === "markReconciledOnly") return "Mark Existing Case Reconciled";
    if (action === "ignore") return "Ignore / No Duplicate";
    return "Needs Review";
  };

  const sfActionBadgeClass = (action) => {
    if (action === "markReconciled" || action === "markReconciledOnly" || action === "importNewReconciled" || action === "importNewNormalReconciled") return "bg-green-100 text-green-700";
    if (action === "importNew" || action === "markFastTracking") return "bg-blue-100 text-blue-700";
    if (action === "importNewNormal") return "bg-slate-100 text-slate-700";
    if (action === "ignore") return "bg-slate-100 text-slate-600";
    return "bg-yellow-100 text-yellow-800";
  };

  const sfMatchLabel = (status) => {
    if (status === "Match") return "Exact Match";
    if (status === "Possible Match") return "Possible Match";
    return "No Match";
  };

  const sfMatchBadgeClass = (status) => {
    if (status === "Match") return "bg-green-100 text-green-700";
    if (status === "Possible Match") return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-700";
  };

  const sfResolveRowReviewState = (baseRow, screenshotType) => {
    const suggestedAction = sfSuggestedAction(baseRow, screenshotType);
    const screenshotKey = normalizeSfKey(screenshotType);
    const recommendedKey = normalizeSfKey(baseRow.recommendedAction);
    const isScheduledProceduresRow = screenshotKey.includes("scheduled procedures") || recommendedKey.includes("import new fast tracking");
    const matchMode = suggestedAction === "markReconciled" ? "reconcile" : "normal";
    const matches = sfGetPlannerMatches(baseRow, matchMode);
    const bestMatch = matches[0];

    let action = "review";
    let selectedPlannerCaseId = "";

    // Scheduled Procedures rows are clean scheduled-case imports.
    // If an exact duplicate already exists and is already fast tracked, ignore it.
    // If an exact duplicate exists but is not fast tracked, mark that existing case fast tracked.
    // If no match exists and required fields are present, import a new fast tracked case.
    if (isScheduledProceduresRow) {
      if (!sfHasRequiredNewCaseFields(baseRow, screenshotType)) {
        action = "review";
      } else if (bestMatch?.status === "Match") {
        if (bestMatch.plannerCase.fastTracking) {
          action = "ignore";
        } else {
          action = "markFastTracking";
          selectedPlannerCaseId = bestMatch.plannerCase.id;
        }
      } else if (bestMatch?.status === "Possible Match") {
        action = "review";
        selectedPlannerCaseId = bestMatch.plannerCase.id;
      } else {
        action = "importNew";
      }
    } else if (suggestedAction === "ignore") {
      action = "ignore";
    } else if (suggestedAction === "markReconciled") {
      // Account History: Scheduled + Completed. Only auto-select reconciliation when
      // there is a confident existing fast-tracked match.
      if (bestMatch?.status === "Match") {
        action = "markReconciled";
        selectedPlannerCaseId = bestMatch.plannerCase.id;
      } else {
        action = "review";
        selectedPlannerCaseId = bestMatch?.status === "Possible Match" ? bestMatch.plannerCase.id : "";
      }
    } else if (["importNew", "importNewReconciled", "importNewNormal", "importNewNormalReconciled"].includes(suggestedAction)) {
      // Account History rows without Scheduled date are not fast tracked.
      // If an exact duplicate already exists, update only reconciliation when needed,
      // otherwise ignore duplicate normal rows.
      if (!sfHasRequiredNewCaseFields(baseRow, screenshotType)) {
        action = "review";
      } else if (bestMatch?.status === "Match") {
        if (suggestedAction === "importNewNormalReconciled") {
          action = bestMatch.plannerCase.reconciled ? "ignore" : "markReconciledOnly";
          selectedPlannerCaseId = action === "ignore" ? "" : bestMatch.plannerCase.id;
        } else if (suggestedAction === "importNewReconciled") {
          action = bestMatch.plannerCase.reconciled ? "ignore" : "markReconciled";
          selectedPlannerCaseId = action === "ignore" ? "" : bestMatch.plannerCase.id;
        } else if (suggestedAction === "importNew") {
          action = bestMatch.plannerCase.fastTracking ? "ignore" : "markFastTracking";
          selectedPlannerCaseId = action === "ignore" ? "" : bestMatch.plannerCase.id;
        } else {
          action = "ignore";
        }
      } else if (bestMatch?.status === "Possible Match") {
        action = "review";
        selectedPlannerCaseId = bestMatch.plannerCase.id;
      } else {
        action = suggestedAction;
      }
    }

    return {
      suggestedAction,
      action,
      selectedPlannerCaseId,
      matchStatus: bestMatch?.status || "No Match",
      matchScore: bestMatch?.score || 0,
      matchReasons: bestMatch?.reasons || [],
    };
  };

  const sfPrepareRows = (rows, screenshotType) =>
    rows.map((item, index) => {
      const surgeon = normalizeSfText(item.surgeon);
      const facilityResolution = sfFacilityFromRowOrSurgeon(item.hospital, surgeon);

      const rawBaseRow = {
        id: `sf-row-${Date.now()}-${index}`,
        date: normalizeSfText(item.date),
        dateKey: sfDateToDateKey(item.date),
        time: normalizeSfText(item.time),
        facility: facilityResolution.facility,
        facilityOptions: facilityResolution.facilityOptions,
        facilitySource: facilityResolution.facilitySource,
        category: normalizeSfText(item.category),
        procedure: normalizeSfText(item.procedure),
        surgeon,
        rosterSurgeonName: surgeon,
        rosterSurgeonSubspecialty: normalizeSfText(item.category),
        scheduledDate: normalizeSfText(item.scheduledDate),
        salesforceStatus: normalizeSfText(item.salesforceStatus),
        recommendedAction: normalizeSfText(item.recommendedAction),
        confidence: normalizeSfText(item.confidence || "Medium"),
        notes: normalizeSfText(item.notes),
        actionManuallyEdited: false,
      };

      const baseRow = sfCanonicalizeProcedureForRow(sfCanonicalizeSurgeonForRow(rawBaseRow));

      return {
        ...baseRow,
        ...sfResolveRowReviewState(baseRow, screenshotType),
      };
    });

  useEffect(() => {
    if (!sfExtractedCases.length || !sfScreenshotType) return;

    setSfExtractedCases((prev) => {
      let changed = false;

      const next = prev.map((item) => {
        if (item.actionManuallyEdited) return item;

        const resolved = sfResolveRowReviewState(item, sfScreenshotType);
        const updated = { ...item, ...resolved };

        if (
          updated.action !== item.action ||
          updated.selectedPlannerCaseId !== item.selectedPlannerCaseId ||
          updated.matchStatus !== item.matchStatus ||
          updated.matchScore !== item.matchScore ||
          JSON.stringify(updated.matchReasons || []) !== JSON.stringify(item.matchReasons || [])
        ) {
          changed = true;
        }

        return updated;
      });

      return changed ? next : prev;
    });
  }, [casesByDate, sfScreenshotType, sfExtractedCases.length]);

  const sfEffectiveRow = (item) => {
    if (item.actionManuallyEdited) return item;
    const resolved = sfResolveRowReviewState(item, sfScreenshotType);
    return { ...item, ...resolved };
  };

  const updateSalesforceRow = (id, patch) => {
    const manuallyEdited = Object.prototype.hasOwnProperty.call(patch, "action");
    setSfExtractedCases((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        const rawPatched = {
          ...item,
          ...patch,
          actionManuallyEdited: manuallyEdited ? true : item.actionManuallyEdited,
        };

        const patched = sfCanonicalizeProcedureForRow(sfCanonicalizeSurgeonForRow(rawPatched));

        if (!patched.actionManuallyEdited) {
          return {
            ...patched,
            ...sfResolveRowReviewState(patched, sfScreenshotType),
          };
        }

        return patched;
      })
    );
    setSfApplySummary("");
  };

  const getSfPlannerCaseOptions = (sfCase) => {
    const mode = sfCase.action === "markReconciled" ? "reconcile" : "normal";
    const matches = sfGetPlannerMatches(sfCase, mode);

    if (sfCase.action === "markReconciled") {
      const filtered = matches.filter((match) =>
        match.plannerCase.fastTracking &&
        match.plannerCase.displayDateKey === sfCase.dateKey &&
        sfSimilarityScore(sfCase.facility, match.plannerCase.facility) >= 0.7
      );
      return filtered.length ? filtered : matches.slice(0, 10);
    }

    if (sfCase.action === "markReconciledOnly") {
      const filtered = matches.filter((match) =>
        match.plannerCase.displayDateKey === sfCase.dateKey &&
        sfSimilarityScore(sfCase.facility, match.plannerCase.facility) >= 0.7
      );
      return filtered.length ? filtered : matches.slice(0, 10);
    }

    return matches.slice(0, 10);
  };

  const applySalesforceRowsToPlanner = () => {
    const now = new Date().toISOString();
    const rowsToApply = sfExtractedCases.filter((item) => item.action !== "review");
    const reviewCount = sfExtractedCases.length - rowsToApply.length;
    let importedCount = 0;
    let reconciledCount = 0;
    let fastTrackedCount = 0;
    let ignoredCount = 0;
    let skippedCount = reviewCount;
    const newFacilities = new Set();
    const firstAppliedDate = rowsToApply.find((item) => item.dateKey)?.dateKey;

    setCasesByDate((prev) => {
      const next = { ...prev };

      rowsToApply.forEach((item) => {
        const dateKey = item.dateKey;

        if (item.action === "ignore") {
          ignoredCount += 1;
          return;
        }

        if (!dateKey) {
          skippedCount += 1;
          return;
        }

        const existingCases = next[dateKey] || [];

        if (item.action === "markReconciled" || item.action === "markReconciledOnly" || item.action === "markFastTracking") {
          const matchedId = item.selectedPlannerCaseId;
          if (!matchedId) {
            skippedCount += 1;
            return;
          }

          let didUpdate = false;
          next[dateKey] = existingCases.map((existingCase) => {
            if (existingCase.id !== matchedId) return existingCase;
            didUpdate = true;
            if (item.action === "markReconciled" || item.action === "markReconciledOnly") reconciledCount += 1;
            if (item.action === "markFastTracking") fastTrackedCount += 1;
            return {
              ...existingCase,
              fastTracking: item.action === "markReconciledOnly" ? Boolean(existingCase.fastTracking) : true,
              reconciled: item.action === "markReconciled" || item.action === "markReconciledOnly" ? true : Boolean(existingCase.reconciled || sfIsCompleted(item)),
              notes: existingCase.notes,
              salesforceImportedAt: now,
              salesforceStatus: item.salesforceStatus,
              salesforceScheduledDate: item.scheduledDate,
            };
          });

          if (!didUpdate) skippedCount += 1;
          return;
        }

        if (["importNew", "importNewReconciled", "importNewNormal", "importNewNormalReconciled"].includes(item.action)) {
          const facility = item.facility || sfAccountName || "";
          const canonicalSurgeon = sfCanonicalSurgeonNameForFacility(facility, item.surgeon || "");
          const newCase = {
            ...blankCase(dateKey, facility),
            time: item.time || "",
            surgeon: canonicalSurgeon || item.surgeon || "",
            procedure: sfCanonicalProcedureNameForRow(item, next) || item.procedure || "",
            fastTracking: item.action === "importNew" || item.action === "importNewReconciled",
            reconciled: item.action === "importNewReconciled" || item.action === "importNewNormalReconciled" || sfIsCompleted(item),
            growth: isAutoGrowthSurgeon(canonicalSurgeon || item.surgeon || ""),
            notes: "",
            salesforceImportedAt: now,
            salesforceStatus: item.salesforceStatus,
            salesforceScheduledDate: item.scheduledDate,
          };

          next[dateKey] = [...existingCases, newCase].sort(compareCasesByTime);
          if (facility) newFacilities.add(facility);
          importedCount += 1;
        }
      });

      return next;
    });

    if (newFacilities.size) {
      setFacilities((prev) => Array.from(new Set([...prev, ...newFacilities])).sort((a, b) => a.localeCompare(b)));
      setSurgeonRosters((prev) => {
        const next = { ...prev };
        newFacilities.forEach((facility) => {
          if (!next[facility]) next[facility] = [];
        });
        return next;
      });
    }

    if (firstAppliedDate) setSelectedDate(firstAppliedDate);

    setSfExtractedCases((prev) => prev.filter((item) => item.action === "review"));
    setSfApplySummary(`Applied ${importedCount + reconciledCount + fastTrackedCount + ignoredCount} row(s): ${importedCount} imported, ${reconciledCount} reconciled, ${fastTrackedCount} marked fast tracked, ${ignoredCount} ignored. ${skippedCount ? `${skippedCount} row(s) still need review or were skipped.` : ""}`.trim());
  };

  useEffect(() => {
    // Keep Salesforce imports from creating near-duplicate surgeon names like
    // Avoid creating duplicate roster names when Salesforce omits Dr., uses initials, or varies first-name formatting.
    // This also cleans up existing imported cases after the roster matching fix is installed.
    setSurgeonRosters((prev) => {
      let changed = false;
      const next = { ...prev };

      Object.entries(prev || {}).forEach(([facility, roster]) => {
        const deduped = [];

        (roster || []).forEach((surgeon) => {
          const existingIndex = deduped.findIndex((candidate) => sfSurgeonScore(candidate?.name || "", surgeon?.name || "") >= 0.9);

          if (existingIndex < 0) {
            deduped.push(surgeon);
            return;
          }

          changed = true;
          const preferred = sfPreferredSurgeonRosterEntry(deduped[existingIndex], surgeon);
          const other = preferred === deduped[existingIndex] ? surgeon : deduped[existingIndex];
          deduped[existingIndex] = {
            ...preferred,
            subspecialty: preferred.subspecialty || other.subspecialty || "",
          };
        });

        const sorted = deduped.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        if (sorted.length !== (roster || []).length || JSON.stringify(sorted) !== JSON.stringify(roster || [])) {
          changed = true;
          next[facility] = sorted;
        }
      });

      return changed ? next : prev;
    });

    setCasesByDate((prev) => {
      let changed = false;
      const next = {};

      Object.entries(prev || {}).forEach(([dateKey, dateCases]) => {
        next[dateKey] = (dateCases || []).map((item) => {
          const canonicalSurgeon = sfCanonicalSurgeonNameForFacility(item.facility, item.surgeon);
          const surgeonUpdatedItem = canonicalSurgeon && canonicalSurgeon !== item.surgeon
            ? {
                ...item,
                surgeon: canonicalSurgeon,
                growth: item.growth || isAutoGrowthSurgeon(canonicalSurgeon),
              }
            : item;

          const procedureUpdatedItem = sfCanonicalizeProcedureForRow(surgeonUpdatedItem, prev);

          if (procedureUpdatedItem !== item) {
            changed = true;
            return procedureUpdatedItem;
          }

          return item;
        });
      });

      return changed ? next : prev;
    });

    setGrowthSurgeons((prev) => {
      const canonical = prev.map((name) => {
        for (const facility of sortedFacilities) {
          const match = sfCanonicalSurgeonNameForFacility(facility, name);
          if (match && match !== name) return match;
        }
        return name;
      });
      const unique = Array.from(new Set(canonical));
      return JSON.stringify(unique) === JSON.stringify(prev) ? prev : unique;
    });
  }, [surgeonRosters]);

  const resetSalesforceImport = () => {
    setSfFile(null);
    setSfPreviewUrl("");
    setSfLoading(false);
    setSfError("");
    setSfScreenshotType("");
    setSfAccountName("");
    setSfExtractedCases([]);
    setSfApplySummary("");
    setShowSfMobileReference(false);
  };

  const handleSalesforceFileChange = (event) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setSfFile(selectedFile);
    setSfPreviewUrl(URL.createObjectURL(selectedFile));
    setSfError("");
    setSfScreenshotType("");
    setSfAccountName("");
    setSfExtractedCases([]);
    setSfApplySummary("");
    setShowSfMobileReference(false);
  };

  const extractSalesforceCases = async () => {
    if (!sfFile) {
      setSfError("Upload a Salesforce screenshot first.");
      return;
    }

    setSfLoading(true);
    setSfError("");
    setSfScreenshotType("");
    setSfAccountName("");
    setSfExtractedCases([]);

    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read the screenshot file."));
        reader.readAsDataURL(sfFile);
      });

      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;

      const response = await fetch("/api/extract-salesforce-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: sfFile.type || "image/png",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "AI extraction failed.");
      }

      const rows = Array.isArray(data.cases) ? data.cases : [];

      setSfScreenshotType(data.screenshotType || "unknown");
      setSfAccountName(data.accountName || "");
      setSfExtractedCases(sfPrepareRows(rows, data.screenshotType || "unknown"));
      setSfApplySummary("");
    } catch (error) {
      setSfError(error instanceof Error ? error.message : "Something went wrong extracting Salesforce cases.");
    } finally {
      setSfLoading(false);
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-900 p-3 md:p-6" style={{ overflowAnchor: "none", WebkitTapHighlightColor: "transparent" }}>
      <div className="mx-auto max-w-7xl space-y-4">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
              <CalendarDays className="h-4 w-4" /> Calendar-Year OR Planner
            </div>
            <input value={plannerTitle} onChange={(e) => setPlannerTitle(e.target.value)} className="mt-1 w-full bg-transparent text-3xl md:text-4xl font-bold outline-none" aria-label="Planner title" />
          </div>
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 md:flex md:flex-wrap md:justify-end">
            <select
              value={layoutMode}
              onChange={(e) => setLayoutMode(e.target.value)}
              className="h-11 min-w-0 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm outline-none focus:ring-2 focus:ring-slate-300 md:w-[140px]"
              aria-label="Layout mode"
            >
              <option value="auto">Auto</option>
              <option value="mobile">Mobile</option>
              <option value="desktop">Desktop</option>
            </select>

            <div className="relative">
              <button
                onClick={() => setShowMobileActions((prev) => !prev)}
                className="h-11 rounded-2xl bg-white px-3 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 md:px-4"
              >
                More ▾
              </button>

              {showMobileActions && (
                <div className="absolute right-0 z-30 mt-2 grid w-48 gap-1 rounded-2xl bg-white p-2 shadow-lg ring-1 ring-slate-200">
                  <button onClick={() => { setShowMobileActions(false); exportToCsv(casesByDate, surgeonRosters); }} className="flex items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download className="mr-2 h-4 w-4" /> CSV</button>
                  <button onClick={() => { setShowMobileActions(false); exportJson(); }} className="flex items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download className="mr-2 h-4 w-4" /> Backup</button>
                  <label className="flex cursor-pointer items-center rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    <Upload className="mr-2 h-4 w-4" /> Import
                    <input type="file" accept="application/json" onChange={(e) => { setShowMobileActions(false); importJson(e); }} className="hidden" />
                  </label>
                  <button onClick={() => { setShowMobileActions(false); resetSelectedDay(); }} className="flex items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"><RotateCcw className="mr-2 h-4 w-4" /> Clear Day</button>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowCloudPanel((prev) => !prev)}
              className="h-11 rounded-2xl bg-white px-3 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 md:px-4"
            >
              {cloudSession ? (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0">Cloud Sync</span>
                  <span className="w-[92px] shrink-0 rounded-full bg-slate-100 px-2 py-1 text-center text-slate-600 whitespace-nowrap">{cloudSyncActivity}</span>
                </span>
              ) : (
                <span>Cloud Sync</span>
              )}
            </button>
          </div>
        </motion.div>

        {showCloudPanel && (
          <Card className="rounded-3xl shadow-sm">
            <CardContent className="p-4">
              <div className="grid gap-3 lg:grid-cols-[260px_1fr_auto] lg:items-center">
                <div>
                  <h2 className="text-xl font-bold">Cloud Sync</h2>
                  <p className="text-sm text-slate-500">Sync this planner across iPhone, iPad, and desktop.</p>
                </div>
                {cloudSession ? (
                  <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
                    Signed in as <span className="font-semibold text-slate-900">{cloudSession.user.email}</span>
                    <div className="mt-1 text-xs text-slate-500">{cloudStatus}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-600">Auto sync: {cloudSyncActivity}</div>
                  </div>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    <input value={cloudEmail} onChange={(e) => setCloudEmail(e.target.value)} placeholder="Email" className="input" type="email" />
                    <input value={cloudPassword} onChange={(e) => setCloudPassword(e.target.value)} placeholder="Password" className="input" type="password" />
                    <div className="md:col-span-2 text-xs text-slate-500">{cloudStatus}</div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {cloudSession ? (
                    <>
                      <Button onClick={pullFromCloud} disabled={cloudBusy} variant="secondary" className="rounded-2xl">Sync Now</Button>
                      <Button onClick={saveToCloud} disabled={cloudBusy} className="rounded-2xl">Save Now</Button>
                      <Button onClick={signOutOfCloud} disabled={cloudBusy} variant="outline" className="rounded-2xl">Sign Out</Button>
                      <Button onClick={() => setShowCloudPanel(false)} disabled={cloudBusy} variant="outline" className="rounded-2xl">Collapse</Button>
                    </>
                  ) : (
                    <>
                      <Button onClick={signInToCloud} disabled={cloudBusy || !supabase} className="rounded-2xl">Sign In</Button>
                      <Button onClick={signUpForCloud} disabled={cloudBusy || !supabase} variant="secondary" className="rounded-2xl">Create Account</Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="rounded-3xl shadow-sm">
          <CardContent className="px-3 py-2 md:px-4 md:py-2.5">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 md:flex md:flex-wrap md:justify-between">
              <Button onClick={() => setSelectedDate(toDateKey(addDays(weekStart, -7)))} variant="outline" className="h-10 rounded-2xl px-2 text-xs md:px-4 md:text-sm">
                <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">Previous </span>Week
              </Button>
              <Button onClick={() => setSelectedDate(todayKey)} variant="secondary" className="h-10 rounded-2xl px-4 text-xs md:text-sm">Today</Button>
              <Button onClick={() => setSelectedDate(toDateKey(addDays(weekStart, 7)))} variant="outline" className="h-10 rounded-2xl px-2 text-xs md:px-4 md:text-sm">
                <span className="hidden sm:inline">Next </span>Week <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-2 flex justify-center md:justify-end">
              <button
                onClick={() => setShowWeekSettings((prev) => !prev)}
                className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200"
              >
                Date / Week Settings {showWeekSettings ? "▲" : "▼"}
              </button>
            </div>

            {showWeekSettings && (
              <div className="mt-2 grid gap-2 rounded-2xl bg-slate-100 p-2 md:grid-cols-2 md:p-3">
                <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
                  <span className="whitespace-nowrap text-sm font-semibold text-slate-500">Jump to date</span>
                  <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="compact-control w-[160px]" />
                </div>

                <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
                  <span className="whitespace-nowrap text-sm font-semibold text-slate-500">Week starts on</span>
                  <select value={weekStartDay} onChange={(e) => setWeekStartDay(e.target.value)} className="compact-control w-[150px] pr-8">
                    {WEEK_START_OPTIONS.map((day) => <option key={day}>{day}</option>)}
                  </select>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <StatCard title="Week Total" value={weeklyStats.total} icon={<ClipboardList className="h-5 w-5" />} onClick={() => setStatReportType("total")} />
          <StatCard title="Week Growth" value={weeklyStats.growth} icon={<Plus className="h-5 w-5" />} onClick={() => setStatReportType("growth")} />
          <StatCard title="Fast Tracking" value={weeklyStats.fastTracking} icon={<CheckCircle2 className="h-5 w-5" />} onClick={() => setStatReportType("fastTracking")} />
          <StatCard title="Reconciled" value={weeklyStats.reconciled} icon={<CheckCircle2 className="h-5 w-5" />} onClick={() => setStatReportType("reconciled")} />
          <StatCard title="Year Total" value={yearlyStats.total} icon={<ClipboardList className="h-5 w-5" />} onClick={() => setStatReportType("yearTotal")} />
          <StatCard title="Year Growth" value={yearlyStats.growth} icon={<Plus className="h-5 w-5" />} onClick={() => setStatReportType("yearGrowth")} />
        </div>

        <Card className="rounded-3xl shadow-sm">
          <CardContent className="p-3 md:p-4">
            <div className="mb-3">
              <select
                value={selectedFacility}
                onChange={(e) => syncActiveFacility(e.target.value)}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
                aria-label="Viewing facility"
              >
                <option value={ALL_FACILITIES}>{ALL_FACILITIES}</option>
                {sortedFacilities.map((facility) => <option key={facility}>{facility}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-7">
              {weekDates.map((dateKey, index) => {
                const cases = getCasesForDate(dateKey);
                const active = selectedDate === dateKey;
                return (
                  <button key={dateKey} onClick={() => setSelectedDate(dateKey)} className={`rounded-2xl p-3 text-left transition ${active ? "bg-slate-900 text-white shadow-md" : "bg-white ring-1 ring-slate-200 hover:bg-slate-100"}`}>
                    <div className="font-bold">{orderedDays[index]}</div>
                    <div className={`mt-1 text-xs ${active ? "text-slate-200" : "text-slate-500"}`}>{formatShortDate(dateKey)}</div>
                    <div className={`mt-1 text-xs ${active ? "text-slate-200" : "text-slate-500"}`}>{cases.length} total • {cases.filter((c) => c.growth).length} growth</div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl shadow-sm">
          <CardContent className={showFacilitiesPanel ? "p-4" : "px-4 py-2"}>
            {!showFacilitiesPanel ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">Facilities</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{facilities.length} saved</span>
                </div>
                <button onClick={() => setShowFacilitiesPanel(true)} className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200">
                  Manage Facilities ▼
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xl font-bold">Facilities</h2>
                    <p className="mt-1 text-sm text-slate-500">Add your own facilities. New users start blank; your saved setup stays with your account.</p>
                  </div>
                  <button onClick={() => setShowFacilitiesPanel(false)} className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200">Collapse ▲</button>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
                  <input
                    value={newFacilityName}
                    onChange={(e) => setNewFacilityName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addFacility(); }}
                    placeholder="Add facility"
                    className="input"
                  />
                  <Button onClick={addFacility} className="rounded-2xl whitespace-nowrap"><Plus className="mr-2 h-4 w-4" /> Add Facility</Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {facilities.length === 0 ? (
                    <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-500">No facilities saved yet.</div>
                  ) : (
                    facilities.map((facility) => (
                      <span key={facility} className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                        {facility}
                        <button onClick={() => syncActiveFacility(facility)} className="rounded-lg px-1 py-0.5 text-left hover:bg-white" title={`Use ${facility} everywhere`}>
                          {facility}
                        </button>
                        <button onClick={() => removeFacility(facility)} className="rounded-full p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${facility}`}>
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-3xl shadow-sm">
          <CardContent className={showSurgeonRosterPanel ? "p-4" : "px-4 py-3"}>
            {!showSurgeonRosterPanel ? (
              <div className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <div className="font-bold leading-tight">Surgeon Rosters</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">{Object.values(surgeonRosters).flat().length} surgeons saved</div>
                </div>
                <button
                  onClick={() => setShowSurgeonRosterPanel(true)}
                  className="shrink-0 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200"
                >
                  Manage Surgeons ▼
                </button>
              </div>
            ) : (
              <>
            <div className="grid gap-4 lg:grid-cols-[300px_1fr] lg:items-start">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xl font-bold">Surgeon Rosters</h2>
                  <button onClick={() => setShowSurgeonRosterPanel(false)} className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200">Collapse ▲</button>
                </div>
                <p className="mt-1 text-sm text-slate-500">Add doctors under each saved facility. Surgery rows will then show those names in the surgeon dropdown for that facility.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-[240px_1fr_1fr_auto] md:items-start">
                <div className="space-y-2">
                  <select value={rosterFacility} onChange={(e) => syncActiveFacility(e.target.value)} className="input" disabled={facilities.length === 0}>
                    {facilities.length === 0 ? (
                      <option value="">Add a facility first</option>
                    ) : (
                      <>
                        <option value={ALL_SURGEONS}>{ALL_SURGEONS}</option>
                        {sortedFacilities.map((facility) => <option key={facility}>{facility}</option>)}
                      </>
                    )}
                  </select>
                  <button
                    onClick={() => setShowRosterList((prev) => !prev)}
                    className="flex w-full items-center justify-between rounded-2xl bg-slate-100 px-3 py-2 text-left text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
                  >
                    <span>Surgeons</span>
                    <span className="text-slate-500">{selectedRoster.length} saved {showRosterList ? "▲" : "▼"}</span>
                  </button>
                </div>
                <input value={newSurgeonName} onChange={(e) => setNewSurgeonName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addSurgeonToRoster(); }} placeholder="Type surgeon name, ex: Dr. Smith" className="input" />
                <input value={newSurgeonSubspecialty} onChange={(e) => setNewSurgeonSubspecialty(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addSurgeonToRoster(); }} placeholder="Subspecialty, ex: Gynecology" className="input" />
                <Button onClick={addSurgeonToRoster} disabled={!rosterFacility || rosterFacility === ALL_SURGEONS} className="rounded-2xl"><Plus className="mr-2 h-4 w-4" /> Add Doctor</Button>
              </div>
            </div>
            {showRosterList && (
              <div className="mt-3 w-full min-w-0 overflow-hidden rounded-2xl bg-slate-100 p-2">
                {selectedRoster.length === 0 ? (
                  <div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-500 ring-1 ring-slate-200">No doctors saved for {rosterFacility} yet.</div>
                ) : (
                  <div className="grid w-full min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {selectedRoster.map((surgeon) => (
                      <div key={surgeon.name} className="flex w-full min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-xl bg-white px-3 py-2 text-sm font-medium ring-1 ring-slate-200">
                        <button onClick={() => toggleGrowthSurgeon(surgeon.name)} className={`shrink-0 rounded-xl px-2 py-1 text-xs font-bold ${growthSurgeons.includes(surgeon.name) ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-500 ring-1 ring-slate-200"}`} title="Toggle automatic Growth">Growth</button>
                        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                          <span className="min-w-0 truncate whitespace-nowrap" title={surgeon.name}>{surgeon.name}</span>
                          {rosterFacility === ALL_SURGEONS && surgeon.facility && <span className="hidden max-w-[35%] shrink truncate rounded-xl bg-slate-50 px-2 py-1 text-xs text-slate-500 ring-1 ring-slate-200 sm:inline-block" title={surgeon.facility}>{surgeon.facility}</span>}
                          {surgeon.subspecialty && <span className="max-w-[42%] shrink-0 truncate rounded-xl bg-slate-50 px-2 py-1 text-xs text-slate-500 ring-1 ring-slate-200" title={surgeon.subspecialty}>{surgeon.subspecialty}</span>}
                        </div>
                        <button onClick={() => removeSurgeonFromRoster(surgeon.facility || rosterFacility, surgeon.name)} className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${surgeon.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
              </>
            )}
          </CardContent>
        </Card>


        <Card className="rounded-3xl shadow-sm">
          <CardContent className={showProcedureRosterPanel ? "p-4" : "px-4 py-3"}>
            {!showProcedureRosterPanel ? (
              <div className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <div className="font-bold leading-tight">Procedure Roster</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">{procedureRosterItems.length} saved procedures</div>
                </div>
                <button
                  onClick={() => setShowProcedureRosterPanel(true)}
                  className="shrink-0 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200"
                >
                  Manage Procedures ▼
                </button>
              </div>
            ) : (
              <>
                <div className="grid gap-4 lg:grid-cols-[300px_1fr] lg:items-start">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-xl font-bold">Procedure Roster</h2>
                      <button onClick={() => setShowProcedureRosterPanel(false)} className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200">Collapse ▲</button>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">Manage saved procedure names used for procedure search and Salesforce matching. Edit a name to rename matching existing cases; remove/hide one to keep it out of suggestions without deleting cases.</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-[260px_1fr] md:items-start">
                    <div className="space-y-2">
                      <select value={procedureRosterSpecialty} onChange={(e) => setProcedureRosterSpecialty(e.target.value)} className="input">
                        {procedureRosterSpecialties.map((specialty) => <option key={specialty}>{specialty}</option>)}
                      </select>
                      <button
                        onClick={() => setShowProcedureList((prev) => !prev)}
                        className="flex w-full items-center justify-between rounded-2xl bg-slate-100 px-3 py-2 text-left text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
                      >
                        <span>Procedures</span>
                        <span className="text-slate-500">{selectedProcedureRosterItems.length} saved {showProcedureList ? "▲" : "▼"}</span>
                      </button>
                    </div>
                    <div className="rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-800 ring-1 ring-blue-100">
                      Use this to rename duplicates like “Ventral Hernia IPOM” to “Ventral,” or hide procedure names you do not want used for suggestions or Salesforce matching.
                    </div>
                  </div>
                </div>
                {showProcedureList && (
                  <div className="mt-3 w-full min-w-0 overflow-hidden rounded-2xl bg-slate-100 p-2">
                    {selectedProcedureRosterItems.length === 0 ? (
                      <div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-500 ring-1 ring-slate-200">No saved procedures found for this filter.</div>
                    ) : (
                      <div className="grid w-full min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {selectedProcedureRosterItems.map((item) => {
                          const itemKey = procedureRosterItemKey(item);
                          const isEditing = editingProcedureRosterKey === itemKey;
                          return (
                            <div key={`${item.specialty}-${item.procedure}`} className="flex w-full min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-xl bg-white px-3 py-2 text-sm font-medium ring-1 ring-slate-200">
                              {isEditing ? (
                                <>
                                  <input
                                    value={editingProcedureName}
                                    onChange={(e) => setEditingProcedureName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") saveProcedureRosterRename(item);
                                      if (e.key === "Escape") cancelEditingProcedureFromRoster();
                                    }}
                                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-200"
                                    autoFocus
                                  />
                                  <button onClick={() => saveProcedureRosterRename(item)} className="shrink-0 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">Save</button>
                                  <button onClick={cancelEditingProcedureFromRoster} className="shrink-0 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200">Cancel</button>
                                </>
                              ) : (
                                <>
                                  <span className="min-w-0 flex-1 truncate whitespace-nowrap" title={item.procedure}>{item.procedure}</span>
                                  <span className="hidden max-w-[35%] shrink-0 truncate rounded-xl bg-slate-50 px-2 py-1 text-xs text-slate-500 ring-1 ring-slate-200 sm:inline-block" title={item.specialty}>{item.specialty}</span>
                                  <span className="shrink-0 rounded-xl bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">{item.count}x</span>
                                  <button onClick={() => startEditingProcedureFromRoster(item)} className="shrink-0 rounded-xl bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 ring-1 ring-blue-100 hover:bg-blue-100">Edit</button>
                                  <button onClick={() => removeProcedureFromRoster(item.procedure)} className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${item.procedure}`}><Trash2 className="h-3.5 w-3.5" /></button>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="rounded-3xl shadow-sm">
            <CardContent className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold">{selectedDayName}</h2>
                  <p className="text-sm text-slate-500">{formatLongDate(selectedDate)}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => setSelectedDate(toDateKey(addDays(fromDateKey(selectedDate), -1)))}
                      className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
                    >
                      Prev
                    </button>
                    <select
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-slate-300"
                    >
                      {weekDates.map((dateKey) => (
                        <option key={dateKey} value={dateKey}>
                          {fromDateKey(dateKey).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setSelectedDate(toDateKey(addDays(fromDateKey(selectedDate), 1)))}
                      className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
                    >
                      Next
                    </button>
                  </div>
                </div>
                <div className="ml-auto grid w-full grid-cols-2 gap-2 sm:w-[210px]">
                  <button
                    onClick={() => {
                      setShowSalesforceImport((prev) => !prev);
                      setShowMobileAddCase(false);
                    }}
                    className={`h-9 min-w-0 rounded-xl px-2 text-xs font-semibold shadow-sm ${showSalesforceImport ? "bg-blue-700 text-white" : "bg-blue-50 text-blue-700 ring-1 ring-blue-200"}`}
                  >
                    {showSalesforceImport ? "Close SF" : "SF Import"}
                  </button>
                  <button
                    onClick={() => {
                      setShowMobileAddCase((prev) => !prev);
                      setShowSalesforceImport(false);
                    }}
                    className={`h-9 min-w-0 rounded-xl bg-slate-900 px-2 text-xs font-semibold text-white shadow-sm ${isDesktopLayout ? "hidden" : isMobileLayout ? "block" : "md:hidden"}`}
                  >
                    {showMobileAddCase ? "Close" : "Add Case"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <MiniStat label="Total" value={dayStats.total} onClick={() => setStatReportType("total")} />
                <MiniStat label="Growth" value={dayStats.growth} onClick={() => setStatReportType("growth")} />
                <MiniStat label="FT" value={dayStats.fastTracking} onClick={() => setStatReportType("fastTracking")} />
                <MiniStat label="Rec" value={dayStats.reconciled} onClick={() => setStatReportType("reconciled")} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-600">Facility</label>
                <select
                  value={selectedFacility}
                  onChange={(e) => syncActiveFacility(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      selectFacilityAndMoveToSurgeon(e.currentTarget.value);
                    }
                  }}
                  onKeyUp={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      selectFacilityAndMoveToSurgeon(e.currentTarget.value);
                    }
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                >
                  <option value={ALL_FACILITIES}>{ALL_FACILITIES}</option>
                  {sortedFacilities.map((facility) => <option key={facility}>{facility}</option>)}
                </select>

                <label className="mt-2 flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 ring-1 ring-amber-100">
                  <input
                    type="checkbox"
                    checked={showUnreconciledOnly}
                    onChange={(e) => setShowUnreconciledOnly(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Show unreconciled cases this week
                  <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs text-amber-700 ring-1 ring-amber-100">{unreconciledWeekCases.length}</span>
                </label>
                {facilities.length === 0 && <p className="text-xs text-slate-500">Add facilities in Surgeon Rosters before logging cases.</p>}
              </div>

              <div className={`${addCasePanelClass} space-y-3 md:space-y-4`}>
                <div className="space-y-1.5 md:space-y-2">
                  <label className="text-sm font-semibold text-slate-600">Search</label>
                  <div className="flex items-center rounded-xl border border-slate-200 bg-white px-3 md:rounded-2xl">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Surgeon, procedure, note..." className="w-full bg-transparent px-2 py-2 text-sm outline-none md:py-3" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600">Surgeon</label>
                  <select
                    id="add-surgery-surgeon-mobile"
                    ref={mobileSurgeonInputRef}
                    value={caseTemplateSurgeon}
                    onChange={(e) => setCaseTemplateSurgeon(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); selectSurgeonAndMoveToProcedure(); } }}
                    className={`input ${mobileOnlyClass}`}
                    disabled={facilities.length === 0}
                  >
                    <option value="">Select surgeon</option>
                    {getSurgeonNames(surgeonRosters, addSurgeryFacility).map((surgeon) => (
                      <option key={surgeon} value={surgeon}>{surgeon}</option>
                    ))}
                  </select>

                  <input
                    id="add-surgery-surgeon-desktop"
                    ref={desktopSurgeonInputRef}
                    value={caseTemplateSurgeon}
                    onChange={(e) => setCaseTemplateSurgeon(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        selectSurgeonAndMoveToProcedure();
                      }
                    }}
                    list="add-surgery-surgeon-list"
                    placeholder="Search surgeon"
                    className={`input ${desktopOnlyClass}`}
                    disabled={facilities.length === 0}
                  />
                  <datalist id="add-surgery-surgeon-list">
                    {addSurgerySurgeonOptions.map((surgeon) => (
                      <option key={surgeon} value={surgeon} />
                    ))}
                  </datalist>
                  <p className="text-xs text-slate-500">Required when quantity is more than 1.</p>
                </div>

                <div className="grid grid-cols-2 gap-2 md:block md:space-y-2">
                  <div className="space-y-1.5 md:space-y-2">
                    <label className="text-sm font-semibold text-slate-600">Time</label>
                    <input
                      value={caseTemplateTime}
                      onChange={(e) => setCaseTemplateTime(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") procedureInputRef.current?.focus?.(); }}
                      placeholder="7:30"
                      className="input"
                    />
                  </div>
                  <div className="space-y-1.5 md:mt-4 md:space-y-2">
                    <label className="text-sm font-semibold text-slate-600">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={caseQuantity}
                      onChange={(e) => setCaseQuantity(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") addCase(); }}
                      placeholder="1"
                      className="input"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 md:space-y-2">
                  <label className="text-sm font-semibold text-slate-600">Procedure</label>
                  <input
                    ref={procedureInputRef}
                    value={caseTemplateProcedure}
                    onChange={(e) => setCaseTemplateProcedure(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addCase(); }}
                    placeholder="Type procedure"
                    className={`input ${mobileOnlyClass}`}
                  />
                  <select
                    value={procedureOptionsForSpecialty.includes(caseTemplateProcedure) ? caseTemplateProcedure : ""}
                    onChange={(e) => setCaseTemplateProcedure(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addCase(); }}
                    className={`input ${mobileOnlyClass}`}
                  >
                    <option value="">{filteredProcedureOptions.length ? "Matching saved procedures" : procedureOptionsForSpecialty.length ? "No matching saved procedures" : "No saved procedures yet"}</option>
                    {filteredProcedureOptions.map((procedure) => (
                      <option key={procedure} value={procedure}>{procedure}</option>
                    ))}
                  </select>
                  <input
                    ref={procedureInputRef}
                    value={caseTemplateProcedure}
                    onChange={(e) => setCaseTemplateProcedure(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addCase(); }}
                    list="add-surgery-procedure-list"
                    placeholder={addSurgerySpecialty ? `Search ${addSurgerySpecialty} procedures` : "Procedure"}
                    className={`input ${desktopOnlyClass}`}
                  />
                  <datalist id="add-surgery-procedure-list">
                    {filteredProcedureOptions.map((procedure) => (
                      <option key={procedure} value={procedure} />
                    ))}
                  </datalist>
                </div>


                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl bg-slate-50 p-2 ring-1 ring-slate-100 md:hidden">
                  <button
                    onClick={() => setSelectedDate(toDateKey(addDays(fromDateKey(selectedDate), -1)))}
                    className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
                  >
                    ← Prev Day
                  </button>
                  <div className="text-center text-xs font-bold text-slate-600">
                    {fromDateKey(selectedDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  </div>
                  <button
                    onClick={() => setSelectedDate(toDateKey(addDays(fromDateKey(selectedDate), 1)))}
                    className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
                  >
                    Next Day →
                  </button>
                </div>

                <Button onClick={addCase} disabled={facilities.length === 0} className="w-full rounded-2xl py-6 text-base shadow-sm"><Plus className="mr-2 h-4 w-4" /> Add Surgery</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl shadow-sm">
            <CardContent className="p-3 md:p-4">
              <div className="space-y-3">
                {activeStatReportType && (
                <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
                  <div className="mt-8 w-full max-w-2xl rounded-3xl bg-white p-4 shadow-xl ring-1 ring-slate-200">
                    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <h2 className="text-xl font-bold">{statReportLabels[activeStatReportType]}</h2>
                        <p className="text-sm text-slate-500">{activeStatReportType === "yearTotal" || activeStatReportType === "yearGrowth" ? `Year-to-date through ${formatLongDate(selectedWeekEnd)}` : `Week of ${formatLongDate(weekDates[0])}`}</p>
                      </div>
                      <button onClick={() => { setShowFastTrackedReport(false); setStatReportType(null); }} className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200">Close</button>
                    </div>

                    {statReportGroups.length === 0 ? (
                      <div className="mt-4 rounded-2xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">No cases found for this selected report.</div>
                    ) : (
                      <div className="mt-4 space-y-5">
                        {statReportGroups.map((day) => (
                          <div key={day.dateKey}>
                            <div className="mb-2 text-base font-bold text-slate-900">{fromDateKey(day.dateKey).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</div>
                            <div className="space-y-3">
                              {day.facilities.map((facilityGroup) => (
                                <div key={facilityGroup.facility} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
                                  <div className="font-bold text-slate-800">{facilityGroup.facility}</div>
                                  <div className="mt-2 space-y-2">
                                    {facilityGroup.surgeons.map((surgeonGroup) => (
                                      <div key={surgeonGroup.surgeon} className="pl-2">
                                        <div className="font-semibold text-slate-700">- {surgeonGroup.surgeon}</div>
                                        <div className="ml-5 mt-1 space-y-1 text-sm text-slate-600">
                                          {surgeonGroup.procedures.map((caseItem, index) => (
                                            <div key={`${caseItem.procedure}-${caseItem.time}-${index}`}>- {caseItem.time ? `${caseItem.time} — ` : ""}{caseItem.procedure}</div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {showUnreconciledOnly ? (
                unreconciledWeekCases.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-5 text-center text-sm text-slate-500">
                    No unreconciled cases for this selected week.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {unreconciledWeekCases.map((item) => (
                      <button
                        key={`${item.displayDateKey}-${item.id}`}
                        type="button"
                        onClick={() => openUnreconciledCaseEditor(item)}
                        className="w-full rounded-2xl border border-amber-100 bg-amber-50 p-3 text-left text-sm transition hover:bg-amber-100 active:scale-[0.99]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-bold text-slate-900">{fromDateKey(item.displayDateKey).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</div>
                        </div>
                        <div className="mt-2 grid gap-1 text-slate-700">
                          <div><span className="font-semibold">Facility:</span> {item.facility || "—"}</div>
                          <div><span className="font-semibold">Surgeon:</span> {item.surgeon || "—"}</div>
                          <div><span className="font-semibold">Procedure:</span> {item.procedure || "—"}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              ) : visibleCases.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100"><ClipboardList className="h-6 w-6 text-slate-500" /></div>
                    <h3 className="font-bold">No surgeries shown</h3>
                    <p className="mt-1 text-sm text-slate-500">Add a surgery or change the facility/search filter.</p>
                  </div>
                ) : (
                  visibleCases.map((c, index) => (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={deletingCaseIds.includes(c.id) ? { opacity: 0, scale: [1, 1.06, 0.72], borderRadius: ["1rem", "999px", "999px"] } : { opacity: 1, scale: 1 }}
                      transition={deletingCaseIds.includes(c.id) ? { duration: 0.22, ease: "easeOut" } : { duration: 0.12 }}
                      className="rounded-2xl border border-slate-200 bg-white p-3 text-sm ring-1 ring-slate-100"
                    >
                      <button
                        type="button"
                        onClick={() => openCaseEditor(selectedDate, c)}
                        className="w-full text-left transition active:scale-[0.99]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-bold text-slate-900">Case {index + 1}</div>
                          {c.time && <div className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{c.time}</div>}
                        </div>
                        <div className="mt-2 grid gap-1 text-slate-700">
                          <div><span className="font-semibold">Facility:</span> {c.facility || "—"}</div>
                          <div><span className="font-semibold">Surgeon:</span> {c.surgeon || "—"}</div>
                          <div><span className="font-semibold">Procedure:</span> {c.procedure || "—"}</div>
                        </div>
                      </button>

                      <div className="mt-3 grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
                        <CompactCheck label="FT" checked={c.fastTracking} onChange={(value) => updateCase(c.id, { fastTracking: value })} />
                        <CompactCheck label="Rec" checked={c.reconciled} onChange={(value) => value ? requestReconcileCase(selectedDate, c) : updateCase(c.id, { reconciled: value })} />
                        <CompactCheck label="Growth" checked={c.growth} onChange={(value) => updateCase(c.id, { growth: value })} />
                        <button onClick={() => deleteCase(c.id)} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete case"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {pendingReconcileCase && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 backdrop-blur-sm md:items-center">
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-lg rounded-3xl bg-white p-4 shadow-2xl ring-1 ring-slate-200"
          >
            <div className="text-xs font-bold uppercase tracking-wide text-amber-700">Confirm Reconcile</div>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Are you sure?</h2>
            <p className="mt-1 text-sm text-slate-500">This will mark this case as reconciled.</p>

            <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-sm text-slate-700">
              <div className="font-bold text-slate-900">{formatLongDate(pendingReconcileCase.dateKey)}</div>
              <div className="mt-2 grid gap-1">
                <div><span className="font-semibold">Facility:</span> {pendingReconcileCase.item.facility || "—"}</div>
                <div><span className="font-semibold">Time:</span> {pendingReconcileCase.item.time || "—"}</div>
                <div><span className="font-semibold">Surgeon:</span> {pendingReconcileCase.item.surgeon || "—"}</div>
                <div><span className="font-semibold">Procedure:</span> {pendingReconcileCase.item.procedure || "—"}</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button onClick={cancelReconcileCase} variant="secondary" className="rounded-2xl py-5">No, Cancel</Button>
              <Button onClick={confirmReconcileCase} className="rounded-2xl py-5">Yes, Reconcile</Button>
            </div>
          </motion.div>
        </div>
      )}

      {selectedReviewCase && reviewDraft && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 backdrop-blur-sm md:items-center">
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl ring-1 ring-slate-200"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-amber-700">{reviewDraft.reconciled ? "Case" : "Unreconciled Case"}</div>
                <h2 className="text-xl font-bold text-slate-900">Review Case</h2>
                <p className="text-sm text-slate-500">{formatLongDate(selectedReviewCase.dateKey)}</p>
              </div>
              <button onClick={closeUnreconciledCaseEditor} className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200">Close</button>
            </div>

            <div className="mt-4 grid gap-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Time</span>
                  <input value={reviewDraft.time} onChange={(e) => updateReviewDraft({ time: e.target.value })} placeholder="7:30" className="input" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Facility</span>
                  <select value={reviewDraft.facility} onChange={(e) => updateReviewDraft({ facility: e.target.value })} className="input">
                    <option value="">No Facility</option>
                    {sortedFacilities.map((facility) => <option key={facility} value={facility}>{facility}</option>)}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Surgeon</span>
                <select value={reviewDraft.surgeon} onChange={(e) => updateReviewDraft({ surgeon: e.target.value, growth: isAutoGrowthSurgeon(e.target.value) })} className="input">
                  <option value="">No Surgeon</option>
                  {getSurgeonNames(surgeonRosters, reviewDraft.facility).map((surgeon) => <option key={surgeon} value={surgeon}>{surgeon}</option>)}
                  {reviewDraft.surgeon && !getSurgeonNames(surgeonRosters, reviewDraft.facility).includes(reviewDraft.surgeon) && <option value={reviewDraft.surgeon}>{reviewDraft.surgeon}</option>}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Procedure</span>
                <input value={reviewDraft.procedure} onChange={(e) => updateReviewDraft({ procedure: e.target.value })} placeholder="Procedure" className="input" />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Notes</span>
                <textarea value={reviewDraft.notes} onChange={(e) => updateReviewDraft({ notes: e.target.value })} placeholder="Add notes" className="input min-h-[90px] resize-none" />
              </label>

              <div className={selectedReviewCase.source === "unreconciled" ? "grid grid-cols-2 gap-2" : "grid grid-cols-3 gap-2"}>
                <CompactCheck label="FT" checked={reviewDraft.fastTracking} onChange={(value) => updateReviewDraft({ fastTracking: value })} />
                {selectedReviewCase.source !== "unreconciled" && (
                  <CompactCheck label="Rec" checked={reviewDraft.reconciled} onChange={(value) => updateReviewDraft({ reconciled: value })} />
                )}
                <CompactCheck label="Growth" checked={reviewDraft.growth} onChange={(value) => updateReviewDraft({ growth: value })} />
              </div>

              {selectedReviewCase.source === "unreconciled" ? (
                <>
                  <Button onClick={() => saveReviewCase({ reconciled: true })} className="rounded-2xl py-6 text-base shadow-sm">
                    Mark Reconciled & Save
                  </Button>
                  <Button onClick={() => saveReviewCase()} variant="secondary" className="rounded-2xl">Save Changes</Button>
                </>
              ) : (
                <Button onClick={() => saveReviewCase()} className="rounded-2xl py-6 text-base shadow-sm">
                  Save
                </Button>
              )}
            </div>
          </motion.div>
        </div>
      )}


      {showSalesforceImport && (
        <div className="fixed inset-0 z-50 flex bg-slate-950/50 p-0 backdrop-blur-sm md:items-center md:justify-center md:p-6">
          <div className="flex h-full w-full flex-col overflow-hidden bg-slate-50 shadow-2xl md:h-[88vh] md:max-w-5xl md:rounded-3xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 md:px-6">
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-wide text-blue-600">Salesforce Import</div>
                <h2 className="mt-1 text-xl font-bold text-slate-900 md:text-2xl">AI screenshot extraction</h2>
                <div className="mt-1 text-xs font-bold text-slate-400">SF Import logic v3a · matched procedure roster badge</div>
                <p className="mt-1 max-w-2xl text-sm text-slate-600">
                  Upload a Salesforce screenshot, review the suggested actions, then apply approved rows to your OR Planner. The compact screenshot reference stays visible while you review. Click the image on desktop to enlarge it; on mobile, use the floating image button while scrolling.
                </p>
              </div>

              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={resetSalesforceImport}
                  className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setShowSalesforceImport(false)}
                  className="rounded-2xl bg-slate-900 px-3 py-2 text-xs font-bold text-white shadow-sm"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
              <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
                <div className="space-y-3 lg:sticky lg:top-3 lg:max-h-[calc(88vh-120px)] lg:self-start lg:overflow-y-auto lg:pr-1">
                  <div className="rounded-3xl bg-blue-50 p-3 ring-1 ring-blue-100">
                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-200 bg-white p-3 text-center text-sm font-bold text-blue-800 transition hover:bg-blue-50">
                      <Upload className="mb-1 h-5 w-5" />
                      <span className="max-w-full break-words">{sfFile ? sfFile.name : "Upload Salesforce screenshot"}</span>
                      <span className="mt-1 text-xs font-medium text-blue-500">PNG, JPG, JPEG, or WEBP</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp"
                        onChange={handleSalesforceFileChange}
                        className="hidden"
                      />
                    </label>

                    {sfPreviewUrl && (
                      <div className="mt-4 rounded-2xl border border-blue-100 bg-white p-2">
                        <button
                          type="button"
                          onClick={() => setShowSfDesktopReference(true)}
                          className="hidden w-full cursor-zoom-in rounded-xl bg-white p-0 text-left lg:block"
                          title="Click to enlarge screenshot"
                        >
                          <img
                            src={sfPreviewUrl}
                            alt="Salesforce screenshot preview"
                            className="max-h-44 w-full rounded-xl object-contain lg:max-h-[34vh]"
                          />
                        </button>
                        <img
                          src={sfPreviewUrl}
                          alt="Salesforce screenshot preview"
                          className="max-h-44 w-full rounded-xl object-contain lg:hidden"
                        />
                        <div className="mt-2 text-center text-[11px] font-semibold text-slate-400">
                          Desktop: click image to enlarge · Mobile: use floating viewer
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={extractSalesforceCases}
                      disabled={!sfFile || sfLoading}
                      className="mt-3 w-full rounded-2xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-50"
                    >
                      {sfLoading ? "Extracting with AI..." : "Extract Cases with AI"}
                    </button>

                    {sfError && (
                      <div className="mt-4 rounded-2xl bg-red-50 p-3 text-xs font-semibold text-red-700 ring-1 ring-red-100">
                        {sfError}
                      </div>
                    )}
                  </div>

                  {(sfScreenshotType || sfExtractedCases.length > 0) && (
                    <div className="rounded-3xl bg-white p-3 text-sm text-slate-600 ring-1 ring-slate-200">
                      <div className="font-bold text-slate-900">Extraction Result</div>
                      <div className="mt-2">Type: <span className="font-semibold">{sfScreenshotType || "unknown"}</span></div>
                      {sfAccountName && <div>Account: <span className="font-semibold">{sfAccountName}</span></div>}
                      <div>Rows found: <span className="font-semibold">{sfExtractedCases.length}</span></div>
                    </div>
                  )}

                  {sfExtractedCases.length > 0 && (
                    <button
                      type="button"
                      onClick={applySalesforceRowsToPlanner}
                      className="w-full rounded-2xl bg-green-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-green-800"
                    >
                      Apply Reviewed Rows to OR Planner
                    </button>
                  )}

                  {sfApplySummary && (
                    <div className="rounded-3xl bg-green-50 p-3 text-sm font-semibold text-green-800 ring-1 ring-green-100">
                      {sfApplySummary}
                    </div>
                  )}
                </div>

                <div className="min-w-0 pb-8">
                  {sfExtractedCases.length > 0 ? (
                    <div className="space-y-3">
                      {sfExtractedCases.map((item, index) => {
                        return (
                        <div key={item.id} className="rounded-3xl bg-white p-4 text-sm text-slate-700 ring-1 ring-slate-200">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-bold text-slate-900">Row {index + 1}</div>
                            <div className="flex flex-wrap items-center gap-2">
                              {item.suggestedAction && item.suggestedAction !== item.action && (
                                <div className={`rounded-full px-3 py-1 text-xs font-bold ${sfActionBadgeClass(item.suggestedAction)}`}>Suggested: {sfActionLabel(item.suggestedAction)}</div>
                              )}
                              <div className={`rounded-full px-3 py-1 text-xs font-bold ${sfActionBadgeClass(item.action)}`}>Selected: {sfActionLabel(item.action)}</div>
                              <div className={`rounded-full px-3 py-1 text-xs font-bold ${sfMatchBadgeClass(item.matchStatus)}`}>Match: {sfMatchLabel(item.matchStatus)}</div>
                              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{item.confidence}</div>
                            </div>
                          </div>

                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            <div><span className="font-bold">Date:</span> {item.date || "—"}</div>
                            <div><span className="font-bold">Time:</span> {item.time || "—"}</div>
                            <div>
                              <span className="font-bold">Facility:</span> {item.facility || (item.facilityOptions?.length > 1 ? "Select below" : "—")}
                              {item.facilitySource === "surgeon_roster" && <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">from surgeon roster</span>}
                              {item.facilityOptions?.length > 1 && <span className="ml-2 rounded-full bg-yellow-50 px-2 py-0.5 text-[11px] font-bold text-yellow-800">multiple affiliations</span>}
                            </div>
                            <div>
                              <span className="font-bold">Surgeon:</span> {item.surgeon || "—"}
                              {item.surgeonCanonicalizedFrom && item.surgeonCanonicalizedFrom !== item.surgeon && (
                                <span className="ml-2 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-bold text-green-700">matched roster: {item.surgeonCanonicalizedFrom}</span>
                              )}
                            </div>
                            <div className="md:col-span-2">
                              <span className="font-bold">Procedure:</span> {item.procedure || "—"}
                              {item.procedureCanonicalizedFrom && item.procedureCanonicalizedFrom !== item.procedure && (
                                <span className="ml-2 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-bold text-green-700">matched procedure roster: {item.procedureCanonicalizedFrom}</span>
                              )}
                            </div>
                            {(item.scheduledDate || item.salesforceStatus) && (
                              <div className="md:col-span-2">
                                <span className="font-bold">Salesforce:</span> Scheduled {item.scheduledDate || "—"} · Status {item.salesforceStatus || "—"}
                              </div>
                            )}
                          </div>

                          <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100 md:grid-cols-2">
                            {(item.facilityOptions?.length > 1 || !item.facility) && (
                              <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-500">Facility</span>
                                <select
                                  value={item.facility || ""}
                                  onChange={(event) => updateSalesforceRow(item.id, { facility: event.target.value })}
                                  className="input bg-white"
                                >
                                  <option value="">Select facility</option>
                                  {(item.facilityOptions?.length ? item.facilityOptions : sortedFacilities).map((facility) => (
                                    <option key={`${item.id}-${facility}`} value={facility}>{facility}</option>
                                  ))}
                                </select>
                              </label>
                            )}

                            {(!item.surgeon || !item.procedure) && item.dateKey && (
                              <div className="rounded-2xl bg-blue-50 p-3 text-xs text-blue-900 ring-1 ring-blue-100 md:col-span-2">
                                <div className="font-bold">Incomplete Salesforce row</div>
                                <div className="mt-1">
                                  This row is missing {[
                                    !item.surgeon ? "surgeon" : "",
                                    !item.procedure ? "procedure" : "",
                                  ].filter(Boolean).join(" and ")}. Select the facility and keep an import action selected if you want to add it as a placeholder case to investigate later.
                                </div>
                              </div>
                            )}

                            {item.surgeon && item.facility && !sfSurgeonExistsInFacility(item.facility, item.surgeon) && (
                              <div className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-100 md:col-span-2">
                                <div className="font-bold">Surgeon not in this facility roster</div>
                                <div className="mt-1">
                                  {item.surgeon} is not currently saved under {item.facility}. Confirm how you want the surgeon saved before applying.
                                </div>

                                <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
                                  <label className="block">
                                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-amber-800">Save surgeon as</span>
                                    <input
                                      value={item.rosterSurgeonName || item.surgeon || ""}
                                      onChange={(event) => updateSalesforceRow(item.id, { rosterSurgeonName: event.target.value })}
                                      className="input bg-white text-sm"
                                      placeholder="Surgeon name for roster"
                                    />
                                  </label>

                                  <label className="block">
                                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-amber-800">Subspecialty</span>
                                    <input
                                      value={item.rosterSurgeonSubspecialty || ""}
                                      onChange={(event) => updateSalesforceRow(item.id, { rosterSurgeonSubspecialty: event.target.value })}
                                      className="input bg-white text-sm"
                                      placeholder="Ex: General Surgery"
                                    />
                                  </label>

                                  <button
                                    type="button"
                                    onClick={() => sfAddSurgeonToRosterFromRow(item)}
                                    disabled={!normalizeSfText(item.rosterSurgeonName || item.surgeon)}
                                    className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Add to roster
                                  </button>
                                </div>
                              </div>
                            )}

                            {item.surgeon && !item.facility && (
                              <div className="rounded-2xl bg-yellow-50 p-3 text-xs font-semibold text-yellow-900 ring-1 ring-yellow-100 md:col-span-2">
                                Select a facility first, then you can add {item.surgeon} to that facility's surgeon roster.
                              </div>
                            )}

                            <label className="block">
                              <span className="mb-1 block text-xs font-bold text-slate-500">Review Action</span>
                              <select
                                value={item.action}
                                onChange={(event) => updateSalesforceRow(item.id, { action: event.target.value, selectedPlannerCaseId: ["importNew", "importNewReconciled", "importNewNormal", "importNewNormalReconciled", "ignore", "review"].includes(event.target.value) ? "" : item.selectedPlannerCaseId })}
                                className="input bg-white"
                              >
                                <option value="review">Needs Review</option>
                                <option value="importNew">Import New Fast Tracked</option>
                                <option value="importNewReconciled">Import New FT + Reconciled</option>
                                <option value="importNewNormal">Import New Non-FT Case</option>
                                <option value="importNewNormalReconciled">Import New Non-FT + Reconciled</option>
                                <option value="markFastTracking">Mark Existing Fast Tracked</option>
                                <option value="markReconciled">Mark Existing FT Case Reconciled</option>
                                <option value="markReconciledOnly">Mark Existing Case Reconciled</option>
                                <option value="ignore">Ignore / No Duplicate</option>
                              </select>
                            </label>

                            {(item.action === "markReconciled" || item.action === "markReconciledOnly" || item.action === "markFastTracking") && (
                              <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-500">Matching OR Planner Case</span>
                                <select
                                  value={item.selectedPlannerCaseId || ""}
                                  onChange={(event) => updateSalesforceRow(item.id, { selectedPlannerCaseId: event.target.value })}
                                  className="input bg-white"
                                >
                                  <option value="">Select matching case</option>
                                  {getSfPlannerCaseOptions(item).map((match) => (
                                    <option key={`${item.id}-${match.plannerCase.id}`} value={match.plannerCase.id}>
                                      {formatShortDate(match.plannerCase.displayDateKey)} · {match.plannerCase.time || "No time"} · {match.plannerCase.facility || "No Facility"} · {match.plannerCase.surgeon || "No Surgeon"} · {match.plannerCase.procedure || "No Procedure"} · FT {match.plannerCase.fastTracking ? "Yes" : "No"} · REC {match.plannerCase.reconciled ? "Yes" : "No"}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}

                            <div className="text-xs text-slate-500 md:col-span-2">
                              <span className="font-bold text-slate-700">Best match:</span> {sfMatchLabel(item.matchStatus)} {item.matchReasons?.length ? `· ${item.matchReasons.join(", ")}` : ""}
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex min-h-[320px] items-center justify-center rounded-3xl bg-white p-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">
                      Upload a screenshot and click Extract Cases with AI. Results will appear here in this window.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {sfPreviewUrl && (
            <button
              type="button"
              onClick={() => setShowSfMobileReference(true)}
              className="fixed bottom-4 left-4 z-[60] rounded-full bg-blue-700 px-4 py-3 text-xs font-bold text-white shadow-2xl ring-1 ring-blue-200 lg:hidden"
            >
              View Screenshot
            </button>
          )}

          {sfPreviewUrl && showSfMobileReference && (
            <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950/90 p-3 lg:hidden">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-bold uppercase tracking-wide text-blue-200">Salesforce Screenshot</div>
                  <div className="truncate text-sm font-semibold text-white">{sfFile?.name || "Uploaded image"}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSfMobileReference(false)}
                  className="rounded-2xl bg-white px-4 py-2 text-sm font-bold text-slate-900 shadow-sm"
                >
                  Done
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded-3xl bg-white p-2">
                <img
                  src={sfPreviewUrl}
                  alt="Salesforce screenshot full reference"
                  className="min-h-full w-full rounded-2xl object-contain"
                />
              </div>
            </div>
          )}

          {sfPreviewUrl && showSfDesktopReference && (
            <div className="fixed inset-0 z-[70] hidden flex-col bg-slate-950/90 p-6 lg:flex">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-bold uppercase tracking-wide text-blue-200">Salesforce Screenshot</div>
                  <div className="truncate text-sm font-semibold text-white">{sfFile?.name || "Uploaded image"}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSfDesktopReference(false)}
                  className="rounded-2xl bg-white px-5 py-2.5 text-sm font-bold text-slate-900 shadow-sm"
                >
                  Done
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded-3xl bg-white p-3">
                <img
                  src={sfPreviewUrl}
                  alt="Salesforce screenshot enlarged desktop reference"
                  className="mx-auto min-h-full max-w-none rounded-2xl object-contain"
                />
              </div>
            </div>
          )}

        </div>
      )}

      <style>{`
        .input { width: 100%; border-radius: 1rem; border: 1px solid rgb(226 232 240); background: rgb(248 250 252); padding: .75rem .8rem; font-size: 16px; outline: none; }
        .input:focus { box-shadow: 0 0 0 2px rgb(203 213 225); background: white; }
        .compact-control {
          height: 38px;
          border-radius: 1rem;
          border: 1px solid rgb(226 232 240);
          background: white;
          padding: 0 .8rem;
          font-size: 16px;
          line-height: 38px;
          outline: none;
          box-sizing: border-box;
        }
        .compact-control:focus { box-shadow: 0 0 0 2px rgb(203 213 225); }
        .mobile-input { width: 100%; height: 38px; border-radius: .85rem; border: 1px solid rgb(226 232 240); background: rgb(248 250 252); padding: 0 .65rem; font-size: 16px; line-height: 38px; outline: none; }
        .mobile-input:focus { box-shadow: 0 0 0 2px rgb(203 213 225); background: white; }
      `}</style>
    </div>
  );
}

function StatCard({ title, value, icon, onClick }) {
  const content = (
    <CardContent className="flex items-center justify-between px-3 py-2.5">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
        <div className="mt-0.5 text-2xl font-bold leading-none">{value}</div>
      </div>
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600 [&_svg]:h-4 [&_svg]:w-4">{icon}</div>
    </CardContent>
  );

  if (onClick) {
    return (
      <button onClick={onClick} className="w-full text-left">
        <Card className="rounded-2xl shadow-sm transition hover:bg-slate-100 active:scale-[0.99]">
          {content}
        </Card>
      </button>
    );
  }

  return (
    <Card className="rounded-2xl shadow-sm">
      {content}
    </Card>
  );
}

function MiniStat({ label, value, onClick }) {
  const content = (
    <>
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </>
  );

  if (onClick) {
    return (
      <button onClick={onClick} className="rounded-2xl bg-slate-100 p-3 text-center transition hover:bg-slate-200 active:scale-[0.99]">
        {content}
      </button>
    );
  }

  return (
    <div className="rounded-2xl bg-slate-100 p-3 text-center">
      {content}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500 xl:hidden">{label}</span>
      {children}
    </label>
  );
}

function Check({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 xl:justify-center xl:bg-transparent xl:border-0 xl:p-0">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500 xl:hidden">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-6 w-6 accent-slate-900" />
    </label>
  );
}

function CompactCheck({ label, checked, onChange }) {
  return (
    <label className="flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-600">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-slate-900" />
      {label}
    </label>
  );
}
