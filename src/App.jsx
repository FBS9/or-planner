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
  const [showUnreconciledOnly, setShowUnreconciledOnly] = useState(false);
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
        const facilityCases = dayCases.filter((item) => (item.facility || "No Facility") === facility);
        const surgeonsForFacility = Array.from(new Set(facilityCases.map((item) => item.surgeon || "No Surgeon"))).sort((a, b) => a.localeCompare(b));
        return {
          facility,
          surgeons: surgeonsForFacility.map((surgeon) => ({
            surgeon,
            procedures: facilityCases
              .filter((item) => (item.surgeon || "No Surgeon") === surgeon)
              .map((item) => item.procedure || "No Procedure"),
          })),
        };
      }),
    };
  }).filter((day) => day.facilities.length > 0);

  const activeStatReportType = statReportType || (showFastTrackedReport ? "fastTracking" : null);
  const statReportLabels = {
    total: "Total Cases",
    growth: "Growth Cases",
    fastTracking: "Fast Tracked Cases",
    reconciled: "Reconciled Cases",
  };
  const statReportCases = activeStatReportType ? weekDates.flatMap((dateKey) =>
    (casesByDate[dateKey] || [])
      .filter((item) => {
        if (activeStatReportType === "total") return true;
        if (activeStatReportType === "growth") return item.growth;
        if (activeStatReportType === "fastTracking") return item.fastTracking;
        if (activeStatReportType === "reconciled") return item.reconciled;
        return false;
      })
      .map((item) => ({ ...item, displayDateKey: dateKey }))
  ) : [];
  const statReportGroups = weekDates.map((dateKey) => {
    const dayCases = statReportCases.filter((item) => item.displayDateKey === dateKey);
    const facilitiesForDay = Array.from(new Set(dayCases.map((item) => item.facility || "No Facility"))).sort((a, b) => a.localeCompare(b));
    return {
      dateKey,
      facilities: facilitiesForDay.map((facility) => {
        const facilityCases = dayCases.filter((item) => (item.facility || "No Facility") === facility);
        const surgeonsForFacility = Array.from(new Set(facilityCases.map((item) => item.surgeon || "No Surgeon"))).sort((a, b) => a.localeCompare(b));
        return {
          facility,
          surgeons: surgeonsForFacility.map((surgeon) => ({
            surgeon,
            procedures: facilityCases
              .filter((item) => (item.surgeon || "No Surgeon") === surgeon)
              .map((item) => item.procedure || "No Procedure"),
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
    growthSurgeons,
    weekStartDay,
  });

  const applyPlannerSnapshot = (snapshot = {}) => {
    setPlannerTitle(snapshot.plannerTitle || snapshot.weekTitle || "OR Calendar Planner");
    setSelectedDate(snapshot.selectedDate || todayKey);
    setCasesByDate(snapshot.casesByDate || {});
    const nextFacilities = (Array.isArray(snapshot.facilities) ? snapshot.facilities : Object.keys(snapshot.surgeonRosters || {})).sort((a, b) => a.localeCompare(b));
    setFacilities(nextFacilities);
    setSurgeonRosters(ensureRosterShape(snapshot.surgeonRosters || buildEmptyRosters(nextFacilities), nextFacilities));
    setRosterFacility((prev) => prev === ALL_SURGEONS || nextFacilities.includes(prev) ? prev : ALL_SURGEONS);
    setGrowthSurgeons(Array.isArray(snapshot.growthSurgeons) ? snapshot.growthSurgeons : []);
    setWeekStartDay(WEEK_START_OPTIONS.includes(snapshot.weekStartDay) ? snapshot.weekStartDay : "Sunday");
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setPlannerTitle(parsed.plannerTitle || parsed.weekTitle || "OR Calendar Planner");
        setSelectedDate(parsed.selectedDate || todayKey);
        setCasesByDate(parsed.casesByDate || {});
        const parsedFacilities = getFacilitiesFromPlanner(parsed).sort((a, b) => a.localeCompare(b));
        setFacilities(parsedFacilities);
        setRosterFacility((prev) => prev === ALL_SURGEONS || parsedFacilities.includes(prev) ? prev : ALL_SURGEONS);
        setSurgeonRosters(ensureRosterShape(parsed.surgeonRosters || buildEmptyRosters(parsedFacilities), parsedFacilities));
        setGrowthSurgeons(Array.isArray(parsed.growthSurgeons) ? parsed.growthSurgeons : []);
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
  }, [plannerTitle, selectedDate, casesByDate, facilities, surgeonRosters, growthSurgeons, weekStartDay, plannerLoaded]);

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
  }, [plannerTitle, selectedDate, casesByDate, facilities, surgeonRosters, growthSurgeons, weekStartDay, plannerLoaded, autoCloudReady, cloudSession?.user?.id]);

  const selectedDateCases = casesByDate[selectedDate] || [];
  const matchesSelectedFacility = (c) => selectedFacility === ALL_FACILITIES || c.facility === selectedFacility;
  const selectedDateFacilityCases = selectedDateCases.filter(matchesSelectedFacility);
  const getCasesForDate = (dateKey) => (casesByDate[dateKey] || []).filter(matchesSelectedFacility);
  const weekCases = weekDates.flatMap((dateKey) => getCasesForDate(dateKey));
  const selectedYear = fromDateKey(selectedDate).getFullYear();
  const selectedWeekEnd = weekDates[weekDates.length - 1];
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
      .sort((a, b) => {
        const aHasTime = Boolean((a.time || "").trim());
        const bHasTime = Boolean((b.time || "").trim());
        if (aHasTime !== bHasTime) return aHasTime ? 1 : -1;
        return String(a.time || "").localeCompare(String(b.time || ""));
      });
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
        if (!procedure || procedure.length < 4 || procedure.toLowerCase() === "hysterectomy b") return;
        const itemSpecialty = getSurgeonSpecialty(surgeonRosters, item.facility, item.surgeon);
        if (normalizeProcedureSearch(itemSpecialty) === specialty) procedures.add(procedure);
      });
    });
    return Array.from(procedures).sort((a, b) => a.localeCompare(b));
  }, [casesByDate, surgeonRosters, addSurgerySpecialty]);

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
    setCasesByDate((prev) => ({ ...prev, [selectedDate]: (prev[selectedDate] || []).filter((c) => c.id !== id) }));
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
        setSelectedDate(parsed.selectedDate || todayKey);
        setCasesByDate(parsed.casesByDate || {});
        const importedFacilities = getFacilitiesFromPlanner(parsed).sort((a, b) => a.localeCompare(b));
        setFacilities(importedFacilities);
        setRosterFacility((prev) => prev === ALL_SURGEONS || importedFacilities.includes(prev) ? prev : ALL_SURGEONS);
        setSurgeonRosters(ensureRosterShape(parsed.surgeonRosters || buildEmptyRosters(importedFacilities), importedFacilities));
        setGrowthSurgeons(Array.isArray(parsed.growthSurgeons) ? parsed.growthSurgeons : []);
        setWeekStartDay(WEEK_START_OPTIONS.includes(parsed.weekStartDay) ? parsed.weekStartDay : "Sunday");
      } catch {
        alert("Could not import that file. Please use an exported OR Planner JSON backup.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ plannerTitle, selectedDate, casesByDate, facilities: sortedFacilities, surgeonRosters, growthSurgeons, weekStartDay }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `OR-Calendar-Planner-Backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-3 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
              <CalendarDays className="h-4 w-4" /> Calendar-Year OR Planner
            </div>
            <input value={plannerTitle} onChange={(e) => setPlannerTitle(e.target.value)} className="mt-1 w-full bg-transparent text-3xl md:text-4xl font-bold outline-none" aria-label="Planner title" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-2xl bg-white p-1 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200">
              {[["auto", "Auto"], ["mobile", "Mobile"], ["desktop", "Desktop"]].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setLayoutMode(value)}
                  className={`rounded-xl px-3 py-1.5 ${layoutMode === value ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button onClick={() => exportToCsv(casesByDate, surgeonRosters)} className="rounded-2xl shadow-sm"><Download className="mr-2 h-4 w-4" /> CSV</Button>
            <Button onClick={exportJson} variant="secondary" className="rounded-2xl shadow-sm"><Download className="mr-2 h-4 w-4" /> Backup</Button>
            <label className="inline-flex cursor-pointer items-center rounded-2xl bg-white px-4 py-2 text-sm font-medium shadow-sm ring-1 ring-slate-200">
              <Upload className="mr-2 h-4 w-4" /> Import
              <input type="file" accept="application/json" onChange={importJson} className="hidden" />
            </label>
            <Button onClick={resetSelectedDay} variant="outline" className="rounded-2xl shadow-sm"><RotateCcw className="mr-2 h-4 w-4" /> Clear Day</Button>
          </div>
        </motion.div>

        <Card className="rounded-3xl shadow-sm">
          <CardContent className={cloudSession && !showCloudPanel ? "px-4 py-2" : "p-4"}>
            {cloudSession && !showCloudPanel ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">Cloud Sync</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{cloudSyncActivity}</span>
                  <span className="text-xs text-slate-500">{cloudSession.user.email}</span>
                </div>
                <button
                  onClick={() => setShowCloudPanel(true)}
                  className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200"
                >
                  Sync Settings ▼
                </button>
              </div>
            ) : (
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
            )}
          </CardContent>
        </Card>

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
          <StatCard title="Week Total" value={weeklyStats.total} icon={<ClipboardList className="h-5 w-5" />} />
          <StatCard title="Week Growth" value={weeklyStats.growth} icon={<Plus className="h-5 w-5" />} />
          <StatCard title="Fast Tracking" value={weeklyStats.fastTracking} icon={<CheckCircle2 className="h-5 w-5" />} />
          <StatCard title="Reconciled" value={weeklyStats.reconciled} icon={<CheckCircle2 className="h-5 w-5" />} />
          <StatCard title="Year Total" value={yearlyStats.total} icon={<ClipboardList className="h-5 w-5" />} />
          <StatCard title="Year Growth" value={yearlyStats.growth} icon={<Plus className="h-5 w-5" />} />
        </div>

        <Card className="rounded-3xl shadow-sm">
          <CardContent className="p-3 md:p-4">
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
              <div className="mt-3 rounded-2xl bg-slate-100 p-2">
                {selectedRoster.length === 0 ? (
                  <div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-500 ring-1 ring-slate-200">No doctors saved for {rosterFacility} yet.</div>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {selectedRoster.map((surgeon) => (
                      <div key={surgeon.name} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-medium ring-1 ring-slate-200">
                        <button onClick={() => toggleGrowthSurgeon(surgeon.name)} className={`rounded-xl px-2 py-1 text-xs font-bold ${growthSurgeons.includes(surgeon.name) ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-500 ring-1 ring-slate-200"}`} title="Toggle automatic Growth">Growth</button>
                        <span className="truncate">{surgeon.name}</span>
                        {rosterFacility === ALL_SURGEONS && surgeon.facility && <span className="truncate rounded-xl bg-slate-50 px-2 py-1 text-xs text-slate-500 ring-1 ring-slate-200">{surgeon.facility}</span>}
                        {surgeon.subspecialty && <span className="truncate rounded-xl bg-slate-50 px-2 py-1 text-xs text-slate-500 ring-1 ring-slate-200">{surgeon.subspecialty}</span>}
                        <button onClick={() => removeSurgeonFromRoster(surgeon.facility || rosterFacility, surgeon.name)} className="ml-auto rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${surgeon.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
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

        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="rounded-3xl shadow-sm">
            <CardContent className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
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
                <button
                  onClick={() => setShowMobileAddCase((prev) => !prev)}
                  className={`rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm ${isDesktopLayout ? "hidden" : isMobileLayout ? "inline-flex" : "md:hidden"}`}
                >
                  {showMobileAddCase ? "Close" : "Add Case"}
                </button>
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

              <div className={`${addCasePanelClass} space-y-4`}>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600">Time</label>
                  <input
                    value={caseTemplateTime}
                    onChange={(e) => setCaseTemplateTime(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") selectFacilityAndMoveToSurgeon(selectedFacility); }}
                    placeholder="Time, ex: 7:30"
                    className="input"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600">Search</label>
                  <div className="flex items-center rounded-2xl border border-slate-200 bg-white px-3">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Surgeon, procedure, note..." className="w-full bg-transparent px-2 py-3 text-sm outline-none" />
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

                <div className="space-y-2">
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

                <div className="space-y-2">
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

                <Button onClick={addCase} disabled={facilities.length === 0} className="w-full rounded-2xl py-6 text-base shadow-sm"><Plus className="mr-2 h-4 w-4" /> Add Surgery</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl shadow-sm">
            <CardContent className="p-3 md:p-4">
              <div className="hidden grid-cols-[85px_1.1fr_1.15fr_1fr_1.5fr_60px_60px_70px_1.2fr_44px] gap-2 px-2 pb-2 text-xs font-bold uppercase tracking-wide text-slate-500 xl:grid">
                <div>Time</div><div>Facility</div><div>Surgeon</div><div>Specialty</div><div>Procedure</div><div>FT</div><div>Rec</div><div>Growth</div><div>Notes</div><div></div>
              </div>

              <div className="space-y-3">
                {activeStatReportType && (
                <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
                  <div className="mt-8 w-full max-w-2xl rounded-3xl bg-white p-4 shadow-xl ring-1 ring-slate-200">
                    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <h2 className="text-xl font-bold">{statReportLabels[activeStatReportType]}</h2>
                        <p className="text-sm text-slate-500">Week of {formatLongDate(weekDates[0])}</p>
                      </div>
                      <button onClick={() => { setShowFastTrackedReport(false); setStatReportType(null); }} className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200">Close</button>
                    </div>

                    {statReportGroups.length === 0 ? (
                      <div className="mt-4 rounded-2xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">No cases found for this selected report.</div>
                    ) : (
                      <div className="mt-4 space-y-5">
                        {statReportGroups.map((day) => (
                          <div key={day.dateKey}>
                            <div className="mb-2 text-base font-bold text-slate-900">{fromDateKey(day.dateKey).toLocaleDateString(undefined, { weekday: "long" })}</div>
                            <div className="space-y-3">
                              {day.facilities.map((facilityGroup) => (
                                <div key={facilityGroup.facility} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
                                  <div className="font-bold text-slate-800">{facilityGroup.facility}</div>
                                  <div className="mt-2 space-y-2">
                                    {facilityGroup.surgeons.map((surgeonGroup) => (
                                      <div key={surgeonGroup.surgeon} className="pl-2">
                                        <div className="font-semibold text-slate-700">- {surgeonGroup.surgeon}</div>
                                        <div className="ml-5 mt-1 space-y-1 text-sm text-slate-600">
                                          {surgeonGroup.procedures.map((procedure, index) => (
                                            <div key={`${procedure}-${index}`}>- {procedure}</div>
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
                      <div key={`${item.displayDateKey}-${item.id}`} className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-bold text-slate-900">{fromDateKey(item.displayDateKey).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</div>
                          <div className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">Unreconciled</div>
                        </div>
                        <div className="mt-2 grid gap-1 text-slate-700">
                          <div><span className="font-semibold">Facility:</span> {item.facility || "—"}</div>
                          <div><span className="font-semibold">Surgeon:</span> {item.surgeon || "—"}</div>
                          <div><span className="font-semibold">Procedure:</span> {item.procedure || "—"}</div>
                        </div>
                      </div>
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
                    <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid gap-2 rounded-2xl bg-white p-2.5 ring-1 ring-slate-200 xl:rounded-3xl xl:p-3 xl:grid-cols-[85px_1.1fr_1.15fr_1fr_1.5fr_60px_60px_70px_1.2fr_44px] xl:items-center">
                      <div className="xl:hidden space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">Case {index + 1}</span>
                          <button onClick={() => deleteCase(c.id)} className="rounded-xl p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                        </div>

                        <div className="grid grid-cols-[85px_1fr] gap-2">
                          <input value={c.time} onChange={(e) => updateCase(c.id, { time: e.target.value })} placeholder="Time" className="mobile-input" />
                          <select value={c.surgeon || ""} onChange={(e) => updateCase(c.id, { surgeon: e.target.value })} className="mobile-input" disabled={getSurgeonNames(surgeonRosters, c.facility).length === 0}>
                            {getSurgeonNames(surgeonRosters, c.facility).length === 0 ? (
                              <option value="">Add surgeon to roster first</option>
                            ) : (
                              getSurgeonNames(surgeonRosters, c.facility).map((surgeon) => <option key={surgeon}>{surgeon}</option>)
                            )}
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <select value={c.facility} onChange={(e) => updateCase(c.id, { facility: e.target.value })} className="mobile-input">{sortedFacilities.map((f) => <option key={f}>{f}</option>)}</select>
                          <input value={getSubspecialty(surgeonRosters, c.facility, c.surgeon)} placeholder="Specialty" className="mobile-input" readOnly />
                        </div>

                        <input value={c.procedure} onChange={(e) => updateCase(c.id, { procedure: e.target.value })} placeholder="Procedure" className="mobile-input" />

                        <div className="grid grid-cols-3 gap-2">
                          <CompactCheck label="FT" checked={c.fastTracking} onChange={(value) => updateCase(c.id, { fastTracking: value })} />
                          <CompactCheck label="Rec" checked={c.reconciled} onChange={(value) => updateCase(c.id, { reconciled: value })} />
                          <CompactCheck label="Growth" checked={c.growth} onChange={(value) => updateCase(c.id, { growth: value })} />
                        </div>

                        <input value={c.notes} onChange={(e) => updateCase(c.id, { notes: e.target.value })} placeholder="Notes / add ons" className="mobile-input" />
                      </div>

                      <div className="hidden xl:contents">
                        <Field label="Time"><input value={c.time} onChange={(e) => updateCase(c.id, { time: e.target.value })} placeholder="7:30" className="input" /></Field>
                        <Field label="Facility"><select value={c.facility} onChange={(e) => updateCase(c.id, { facility: e.target.value })} className="input">{sortedFacilities.map((f) => <option key={f}>{f}</option>)}</select></Field>
                        <Field label="Surgeon">
                          <select value={c.surgeon || ""} onChange={(e) => updateCase(c.id, { surgeon: e.target.value })} className="input" disabled={getSurgeonNames(surgeonRosters, c.facility).length === 0}>
                            {getSurgeonNames(surgeonRosters, c.facility).length === 0 ? (
                              <option value="">Add surgeon to roster first</option>
                            ) : (
                              getSurgeonNames(surgeonRosters, c.facility).map((surgeon) => <option key={surgeon}>{surgeon}</option>)
                            )}
                          </select>
                        </Field>
                        <Field label="Subspecialty"><input value={getSubspecialty(surgeonRosters, c.facility, c.surgeon)} placeholder="Subspecialty" className="input" readOnly /></Field>
                        <Field label="Procedure"><input value={c.procedure} onChange={(e) => updateCase(c.id, { procedure: e.target.value })} placeholder="Procedure" className="input" /></Field>
                        <Check label="FT" checked={c.fastTracking} onChange={(value) => updateCase(c.id, { fastTracking: value })} />
                        <Check label="Rec" checked={c.reconciled} onChange={(value) => updateCase(c.id, { reconciled: value })} />
                        <Check label="Growth" checked={c.growth} onChange={(value) => updateCase(c.id, { growth: value })} />
                        <Field label="Notes"><input value={c.notes} onChange={(e) => updateCase(c.id, { notes: e.target.value })} placeholder="Add ons / follow-up" className="input" /></Field>
                      </div>
                      <button onClick={() => deleteCase(c.id)} className="hidden rounded-xl p-3 text-slate-400 hover:bg-red-50 hover:text-red-600 xl:block"><Trash2 className="h-4 w-4" /></button>
                    </motion.div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
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

function StatCard({ title, value, icon }) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="flex items-center justify-between px-3 py-2.5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
          <div className="mt-0.5 text-2xl font-bold leading-none">{value}</div>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600 [&_svg]:h-4 [&_svg]:w-4">{icon}</div>
      </CardContent>
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
