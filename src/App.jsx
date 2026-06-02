import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, CalendarDays, Download, Upload, RotateCcw, CheckCircle2, ClipboardList, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { addDays, formatLongDate, formatShortDate, fromDateKey, getOrderedDays, startOfWeek, toDateKey, WEEK_START_OPTIONS } from "@/lib/plannerDates";
import { ALL_FACILITIES, ALL_PROCEDURE_SPECIALTIES, ALL_SURGEONS, blankCase, buildEmptyRosters, compareCasesByTime, DEFAULT_FACILITIES, ensureRosterShape, exportToCsv, getFacilitiesFromPlanner, getSubspecialty, getSurgeonNames, getSurgeonSpecialty, isGrowthSpecialty, normalizeProcedureSearch, normalizeSurgeonSearch, OLD_STORAGE_KEY, STORAGE_KEY, surgeonSearchRank } from "@/lib/plannerData";
import { supabase, useCloudSync } from "@/hooks/useCloudSync";
import { useSalesforceImport } from "@/hooks/useSalesforceImport";
import { SalesforceImportPanel } from "@/components/salesforce/SalesforceImportPanel";
import { SalesforceScreenshotReference } from "@/components/salesforce/SalesforceScreenshotReference";

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
  const [showUnreconciledOnly, setShowUnreconciledOnly] = useState(false);
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [cancelledFuCases, setCancelledFuCases] = useState([]);
  const [showCancelledFuCasesModal, setShowCancelledFuCasesModal] = useState(false);
  const [pendingCancelledFuCase, setPendingCancelledFuCase] = useState(null);
  const [showBulkCancelledFuReview, setShowBulkCancelledFuReview] = useState(false);
  const [bulkCancelledFuReviewItems, setBulkCancelledFuReviewItems] = useState([]);
  const [bulkCancelledFuSelectedKeys, setBulkCancelledFuSelectedKeys] = useState([]);
  const [swipingCaseId, setSwipingCaseId] = useState(null);
  const [swipeCasePreview, setSwipeCasePreview] = useState(null);
  const [deletingCaseIds, setDeletingCaseIds] = useState([]);
  const [selectedReviewCase, setSelectedReviewCase] = useState(null);
  const [reviewDraft, setReviewDraft] = useState(null);
  const [pendingReconcileCase, setPendingReconcileCase] = useState(null);
  const [showFastTrackedReport, setShowFastTrackedReport] = useState(false);
  const [statReportType, setStatReportType] = useState(null);
  const [ftShareStatus, setFtShareStatus] = useState("");
  const [layoutMode, setLayoutMode] = useState(() => localStorage.getItem("or-planner-layout-mode") || "auto");
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("or-planner-theme") === "dark");

  useEffect(() => {
    const themeColor = darkMode ? "#0f172a" : "#f8fafc";
    const appleStatusStyle = darkMode ? "black-translucent" : "default";
    const ensureMeta = (name, attrName = "name") => {
      let tag = document.querySelector(`meta[${attrName}="${name}"]`);
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute(attrName, name);
        document.head.appendChild(tag);
      }
      return tag;
    };

    ensureMeta("theme-color").setAttribute("content", themeColor);
    ensureMeta("apple-mobile-web-app-status-bar-style").setAttribute("content", appleStatusStyle);
    ensureMeta("mobile-web-app-capable").setAttribute("content", "yes");
    ensureMeta("apple-mobile-web-app-capable").setAttribute("content", "yes");

    document.documentElement.style.backgroundColor = darkMode ? "#0f172a" : "#f8fafc";
    document.body.style.backgroundColor = darkMode ? "#0f172a" : "#f8fafc";
  }, [darkMode]);

  const [casesByDate, setCasesByDate] = useState({});
  const [facilities, setFacilities] = useState(DEFAULT_FACILITIES);
  const sortedFacilities = useMemo(() => [...facilities].sort((a, b) => a.localeCompare(b)), [facilities]);
  const [newFacilityName, setNewFacilityName] = useState("");
  const [editingFacilityName, setEditingFacilityName] = useState("");
  const [editingFacilityOriginal, setEditingFacilityOriginal] = useState("");
  const [showFacilitiesPanel, setShowFacilitiesPanel] = useState(false);
  const [surgeonRosters, setSurgeonRosters] = useState(() => ensureRosterShape(buildEmptyRosters(DEFAULT_FACILITIES), DEFAULT_FACILITIES));
  const [rosterFacility, setRosterFacility] = useState(ALL_SURGEONS);
  const [newSurgeonName, setNewSurgeonName] = useState("");
  const [newSurgeonSubspecialty, setNewSurgeonSubspecialty] = useState("");
  const [editingSurgeonKey, setEditingSurgeonKey] = useState("");
  const [editingSurgeonName, setEditingSurgeonName] = useState("");
  const [editingSurgeonSubspecialty, setEditingSurgeonSubspecialty] = useState("");
  const [showSurgeonRosterPanel, setShowSurgeonRosterPanel] = useState(false);
  const [showRosterList, setShowRosterList] = useState(false);
  const [showProcedureRosterPanel, setShowProcedureRosterPanel] = useState(false);
  const [showProcedureList, setShowProcedureList] = useState(false);
  const [procedureRosterSpecialty, setProcedureRosterSpecialty] = useState(ALL_PROCEDURE_SPECIALTIES);
  const [procedureExclusions, setProcedureExclusions] = useState([]);
  const [manualProcedureRosterItems, setManualProcedureRosterItems] = useState([]);
  const [showAddProcedureRosterModal, setShowAddProcedureRosterModal] = useState(false);
  const [newProcedureRosterName, setNewProcedureRosterName] = useState("");
  const [newProcedureRosterSpecialty, setNewProcedureRosterSpecialty] = useState("General Surgeon");
  const [sfSurgeonAliases, setSfSurgeonAliases] = useState({});
  const [sfProcedureAliases, setSfProcedureAliases] = useState({});
  const [editingProcedureRosterKey, setEditingProcedureRosterKey] = useState("");
  const [editingProcedureName, setEditingProcedureName] = useState("");
  const [growthSurgeons, setGrowthSurgeons] = useState([]);
  const [weekStartDay, setWeekStartDay] = useState("Sunday");
  const [showWeekSettings, setShowWeekSettings] = useState(false);
  const [plannerLoaded, setPlannerLoaded] = useState(false);
  const procedureInputRef = useRef(null);
  const mobileSurgeonInputRef = useRef(null);
  const desktopSurgeonInputRef = useRef(null);
  const swipeCaseStartRef = useRef(null);
  const swipeCaseClickBlockRef = useRef(null);

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
        const existing = counts.get(key) || { procedure, specialty, count: 0, lastUsed: "", manual: false };
        existing.count += 1;
        if (!existing.lastUsed || dateKey > existing.lastUsed) existing.lastUsed = dateKey;
        counts.set(key, existing);
      });
    });

    (manualProcedureRosterItems || []).forEach((item) => {
      const procedure = (item?.procedure || "").trim();
      const specialty = (item?.specialty || "Unassigned").trim() || "Unassigned";
      if (!procedure || procedure.length < 2) return;
      if (procedureExclusionKeys.has(normalizeProcedureSearch(procedure))) return;
      const key = `${normalizeProcedureSearch(specialty)}::${normalizeProcedureSearch(procedure)}`;
      const existing = counts.get(key) || { procedure, specialty, count: 0, lastUsed: "", manual: true };
      existing.manual = true;
      counts.set(key, existing);
    });

    return Array.from(counts.values()).sort((a, b) => a.specialty.localeCompare(b.specialty) || a.procedure.localeCompare(b.procedure));
  }, [casesByDate, surgeonRosters, manualProcedureRosterItems, procedureExclusionKeys]);

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

  const shareFastTrackedScreenshot = async () => {
    try {
      setFtShareStatus("Preparing...");
      const ftCases = weekDates.flatMap((dateKey) =>
        (casesByDate[dateKey] || [])
          .filter((item) => item.fastTracking)
          .filter((item) => selectedFacility === ALL_FACILITIES || item.facility === selectedFacility)
          .sort(compareCasesByTime)
          .map((item) => ({ ...item, displayDateKey: dateKey }))
      );

      if (ftCases.length === 0) {
        setFtShareStatus("No FT cases to share.");
        setTimeout(() => setFtShareStatus(""), 2500);
        return;
      }

      const title = `Fast Tracked Cases — Week of ${formatLongDate(weekDates[0])}`;
      const subtitle = selectedFacility === ALL_FACILITIES ? "All Facilities" : selectedFacility;
      const lines = [];
      weekDates.forEach((dateKey) => {
        const dayCases = ftCases.filter((item) => item.displayDateKey === dateKey);
        if (!dayCases.length) return;
        lines.push({ type: "day", text: fromDateKey(dateKey).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) });
        dayCases.forEach((item) => {
          const timePart = item.time ? `${item.time} · ` : "";
          lines.push({ type: "case", text: `${timePart}${item.facility || "No Facility"} · ${item.surgeon || "No Surgeon"} · ${item.procedure || "No Procedure"}` });
        });
      });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const scale = Math.max(2, Math.min(window.devicePixelRatio || 2, 3));
      const width = 1200;
      const margin = 64;
      const contentWidth = width - margin * 2;
      const lineHeight = 34;
      const dayHeight = 48;
      const wrappedLines = [];

      const wrapText = (text, font, maxWidth) => {
        ctx.font = font;
        const words = String(text || "").split(/\s+/).filter(Boolean);
        const output = [];
        let current = "";
        words.forEach((word) => {
          const next = current ? `${current} ${word}` : word;
          if (ctx.measureText(next).width <= maxWidth || !current) {
            current = next;
          } else {
            output.push(current);
            current = word;
          }
        });
        if (current) output.push(current);
        return output.length ? output : [""];
      };

      lines.forEach((line) => {
        if (line.type === "day") {
          wrappedLines.push({ ...line, height: dayHeight });
        } else {
          const font = "28px Arial";
          const wrapped = wrapText(line.text, font, contentWidth - 34);
          wrapped.forEach((text, index) => wrappedLines.push({ type: index === 0 ? "case" : "caseWrap", text, height: lineHeight }));
        }
      });

      const height = Math.max(640, 180 + wrappedLines.reduce((sum, line) => sum + line.height, 0) + 80);
      canvas.width = width * scale;
      canvas.height = height * scale;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(scale, scale);

      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 44px Arial";
      ctx.fillText(title, margin, 74);
      ctx.fillStyle = "#475569";
      ctx.font = "26px Arial";
      ctx.fillText(subtitle, margin, 114);
      ctx.fillStyle = "#2563eb";
      ctx.font = "bold 24px Arial";
      ctx.fillText(`${ftCases.length} fast tracked case${ftCases.length === 1 ? "" : "s"}`, margin, 150);

      let y = 205;
      wrappedLines.forEach((line) => {
        if (line.type === "day") {
          y += 18;
          ctx.fillStyle = "#dbeafe";
          ctx.fillRect(margin - 12, y - 30, contentWidth + 24, 44);
          ctx.fillStyle = "#1e3a8a";
          ctx.font = "bold 28px Arial";
          ctx.fillText(line.text, margin, y);
          y += 34;
        } else {
          ctx.fillStyle = "#334155";
          ctx.font = line.type === "case" ? "28px Arial" : "26px Arial";
          const prefix = line.type === "case" ? "• " : "  ";
          ctx.fillText(prefix + line.text, margin + 6, y);
          y += line.height;
        }
      });

      ctx.fillStyle = "#94a3b8";
      ctx.font = "20px Arial";
      ctx.fillText("Generated from OR Planner", margin, height - 36);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
      if (!blob) throw new Error("Could not create image.");

      const filename = `fast-tracked-cases-${weekDates[0]}.png`;
      const file = new File([blob], filename, { type: "image/png" });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title,
          text: `${title}\n${subtitle}\n${ftCases.length} fast tracked case${ftCases.length === 1 ? "" : "s"}`,
          files: [file],
        });
        setFtShareStatus("Shared.");
      } else if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setFtShareStatus("Copied image.");
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setFtShareStatus("Downloaded image.");
      }
      setTimeout(() => setFtShareStatus(""), 3000);
    } catch (error) {
      console.error(error);
      setFtShareStatus("Share failed.");
      setTimeout(() => setFtShareStatus(""), 3000);
    }
  };
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

  useEffect(() => {
    localStorage.setItem("or-planner-theme", darkMode ? "dark" : "light");
    document.documentElement.style.colorScheme = darkMode ? "dark" : "light";
  }, [darkMode]);

  const getPlannerSnapshot = () => ({
    plannerTitle,
    selectedDate,
    casesByDate,
    cancelledFuCases,
    facilities: sortedFacilities,
    surgeonRosters,
    procedureExclusions,
    manualProcedureRosterItems,
    sfSurgeonAliases,
    sfProcedureAliases,
    growthSurgeons,
    weekStartDay,
  });

  const applyPlannerSnapshot = (snapshot = {}) => {
    setPlannerTitle(snapshot.plannerTitle || snapshot.weekTitle || "OR Calendar Planner");
    // Cloud sync should update planner data without changing the day the user is currently viewing.
    // Otherwise every auto-pull kicks the app back to today.
    setCasesByDate(snapshot.casesByDate || {});
    setCancelledFuCases(Array.isArray(snapshot.cancelledFuCases) ? snapshot.cancelledFuCases : []);
    const nextFacilities = (Array.isArray(snapshot.facilities) ? snapshot.facilities : Object.keys(snapshot.surgeonRosters || {})).sort((a, b) => a.localeCompare(b));
    setFacilities(nextFacilities);
    setSurgeonRosters(ensureRosterShape(snapshot.surgeonRosters || buildEmptyRosters(nextFacilities), nextFacilities));
    setRosterFacility((prev) => prev === ALL_SURGEONS || nextFacilities.includes(prev) ? prev : ALL_SURGEONS);
    setGrowthSurgeons(Array.isArray(snapshot.growthSurgeons) ? snapshot.growthSurgeons : []);
    setProcedureExclusions(Array.isArray(snapshot.procedureExclusions) ? snapshot.procedureExclusions : []);
    setManualProcedureRosterItems(Array.isArray(snapshot.manualProcedureRosterItems) ? snapshot.manualProcedureRosterItems : []);
    setSfSurgeonAliases(snapshot.sfSurgeonAliases && typeof snapshot.sfSurgeonAliases === "object" ? snapshot.sfSurgeonAliases : {});
    setSfProcedureAliases(snapshot.sfProcedureAliases && typeof snapshot.sfProcedureAliases === "object" ? snapshot.sfProcedureAliases : {});
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
        setCancelledFuCases(Array.isArray(parsed.cancelledFuCases) ? parsed.cancelledFuCases : []);
        const parsedFacilities = getFacilitiesFromPlanner(parsed).sort((a, b) => a.localeCompare(b));
        setFacilities(parsedFacilities);
        setRosterFacility((prev) => prev === ALL_SURGEONS || parsedFacilities.includes(prev) ? prev : ALL_SURGEONS);
        setSurgeonRosters(ensureRosterShape(parsed.surgeonRosters || buildEmptyRosters(parsedFacilities), parsedFacilities));
        setGrowthSurgeons(Array.isArray(parsed.growthSurgeons) ? parsed.growthSurgeons : []);
        setProcedureExclusions(Array.isArray(parsed.procedureExclusions) ? parsed.procedureExclusions : []);
        setManualProcedureRosterItems(Array.isArray(parsed.manualProcedureRosterItems) ? parsed.manualProcedureRosterItems : []);
        setSfSurgeonAliases(parsed.sfSurgeonAliases && typeof parsed.sfSurgeonAliases === "object" ? parsed.sfSurgeonAliases : {});
        setSfProcedureAliases(parsed.sfProcedureAliases && typeof parsed.sfProcedureAliases === "object" ? parsed.sfProcedureAliases : {});
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
          setCancelledFuCases(Array.isArray(old.cancelledFuCases) ? old.cancelledFuCases : []);
          const oldFacilities = getFacilitiesFromPlanner({ ...old, casesByDate: migrated }).sort((a, b) => a.localeCompare(b));
          setFacilities(oldFacilities);
          setRosterFacility((prev) => prev === ALL_SURGEONS || oldFacilities.includes(prev) ? prev : ALL_SURGEONS);
          setSurgeonRosters(ensureRosterShape(old.surgeonRosters || buildEmptyRosters(oldFacilities), oldFacilities));
          setGrowthSurgeons(Array.isArray(old.growthSurgeons) ? old.growthSurgeons : []);
          setProcedureExclusions(Array.isArray(old.procedureExclusions) ? old.procedureExclusions : []);
          setManualProcedureRosterItems(Array.isArray(old.manualProcedureRosterItems) ? old.manualProcedureRosterItems : []);
          setSfSurgeonAliases(old.sfSurgeonAliases && typeof old.sfSurgeonAliases === "object" ? old.sfSurgeonAliases : {});
          setSfProcedureAliases(old.sfProcedureAliases && typeof old.sfProcedureAliases === "object" ? old.sfProcedureAliases : {});
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
  }, [plannerTitle, selectedDate, casesByDate, cancelledFuCases, facilities, surgeonRosters, procedureExclusions, manualProcedureRosterItems, sfSurgeonAliases, sfProcedureAliases, growthSurgeons, weekStartDay, plannerLoaded]);

  const {
    cloudSession,
    cloudEmail,
    setCloudEmail,
    cloudPassword,
    setCloudPassword,
    cloudStatus,
    cloudBusy,
    showCloudPanel,
    setShowCloudPanel,
    cloudSyncActivity,
    pullRefreshState,
    pullRefreshDistance,
    saveToCloud,
    pullFromCloud,
    signUpForCloud,
    signInToCloud,
    signOutOfCloud,
    handlePullRefreshStart,
    handlePullRefreshMove,
    handlePullRefreshEnd,
  } = useCloudSync({
    plannerLoaded,
    snapshotDeps: [plannerTitle, casesByDate, cancelledFuCases, facilities, surgeonRosters, procedureExclusions, manualProcedureRosterItems, sfSurgeonAliases, sfProcedureAliases, growthSurgeons, weekStartDay],
    getPlannerSnapshot,
    applyPlannerSnapshot,
  });

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

  const procedureDraftOptionScore = (leftValue = "", rightValue = "") => {
    const left = normalizeProcedureSearch(leftValue);
    const right = normalizeProcedureSearch(rightValue);
    if (!left || !right) return 0;
    if (left === right) return 1;
    if (left.includes(right) || right.includes(left)) return 0.92;
    const leftTokens = left.split(" ").filter(Boolean);
    const rightTokens = right.split(" ").filter(Boolean);
    if (!leftTokens.length || !rightTokens.length) return 0;
    const overlap = leftTokens.filter((token) => rightTokens.includes(token)).length;
    return overlap / Math.max(leftTokens.length, rightTokens.length);
  };

  const procedureOptionsForCaseDraft = (draft) => {
    if (!draft) return [];
    const specialty = normalizeProcedureSearch(getSurgeonSpecialty(surgeonRosters, draft.facility, draft.surgeon));
    const query = normalizeProcedureSearch(draft.procedure || "");

    const scored = procedureRosterItems
      .filter((item) => item?.procedure && !isProcedureHiddenFromRoster(item.procedure))
      .map((item) => {
        const itemSpecialty = normalizeProcedureSearch(item.specialty || "");
        const sameSpecialty = specialty && itemSpecialty && specialty === itemSpecialty;
        const procedureKey = normalizeProcedureSearch(item.procedure);
        const queryMatch = query && procedureKey.includes(query);
        const score = query ? Math.max(procedureDraftOptionScore(item.procedure, draft.procedure), queryMatch ? 0.92 : 0) : 0;
        return { ...item, sameSpecialty, score };
      })
      .filter((item) => !query || item.score >= 0.35 || normalizeProcedureSearch(item.procedure).includes(query))
      .sort((a, b) => {
        if (a.sameSpecialty !== b.sameSpecialty) return a.sameSpecialty ? -1 : 1;
        if (b.score !== a.score) return b.score - a.score;
        if ((b.count || 0) !== (a.count || 0)) return (b.count || 0) - (a.count || 0);
        return a.procedure.localeCompare(b.procedure);
      });

    const seen = new Set();
    return scored.filter((item) => {
      const key = normalizeProcedureSearch(item.procedure);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 50);
  };

  const filteredReviewProcedureOptions = useMemo(() => procedureOptionsForCaseDraft(reviewDraft), [reviewDraft, procedureRosterItems, surgeonRosters, procedureExclusionKeys]);

  const resolveReviewDraftProcedure = (draft) => {
    const typed = String(draft?.procedure || "").replace(/\s+/g, " ").trim();
    if (!typed) return "";
    const options = procedureOptionsForCaseDraft(draft);
    const exact = options.find((item) => normalizeProcedureSearch(item.procedure) === normalizeProcedureSearch(typed));
    if (exact) return exact.procedure;
    if (options.length === 1 && options[0].score >= 0.75) return options[0].procedure;
    if (options[0]?.score >= 0.92) return options[0].procedure;
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

  const buildCancelledFuCase = (dateKey, caseItem, source = "single") => ({
    ...caseItem,
    cancelledFuId: `cancelled-fu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    originalDateKey: dateKey,
    movedAt: new Date().toISOString(),
    cancelledFuSource: source,
  });

  const moveCaseToCancelledFu = (dateKey, caseItem, source = "single") => {
    if (!dateKey || !caseItem?.id) return;
    const archived = buildCancelledFuCase(dateKey, caseItem, source);
    setCasesByDate((prev) => ({
      ...prev,
      [dateKey]: (prev[dateKey] || []).filter((c) => c.id !== caseItem.id),
    }));
    setCancelledFuCases((prev) => [archived, ...prev]);
  };

  const confirmMoveCaseToCancelledFu = () => {
    if (!pendingCancelledFuCase?.caseItem) return;
    moveCaseToCancelledFu(pendingCancelledFuCase.dateKey, pendingCancelledFuCase.caseItem, "single");
    setPendingCancelledFuCase(null);
  };

  const isNoSwipeTarget = (target) => Boolean(target?.closest?.("input,textarea,select,label,[data-no-swipe='true']"));

  const handleCasePointerDown = (event, caseItem) => {
    if (isNoSwipeTarget(event.target)) return;
    swipeCaseStartRef.current = { id: caseItem.id, x: event.clientX, y: event.clientY, startedAt: Date.now() };
    setSwipeCasePreview(null);
  };

  const handleCasePointerMove = (event, caseItem) => {
    const start = swipeCaseStartRef.current;
    if (!start || start.id !== caseItem.id) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (dx < -8 && Math.abs(dx) > Math.abs(dy) * 1.15) {
      const x = Math.max(-96, Math.min(0, dx));
      setSwipeCasePreview({ id: caseItem.id, x });
    }
  };

  const handleCasePointerUp = (event, dateKey, caseItem) => {
    const start = swipeCaseStartRef.current;
    swipeCaseStartRef.current = null;
    const preview = swipeCasePreview;
    setSwipeCasePreview(null);
    if (!start || start.id !== caseItem.id) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const isLeftSwipe = dx < -64 && Math.abs(dx) > Math.abs(dy) * 1.15;
    if (isLeftSwipe) {
      event.preventDefault?.();
      event.stopPropagation?.();
      swipeCaseClickBlockRef.current = { id: caseItem.id, until: Date.now() + 450 };
      setSwipingCaseId(caseItem.id);
      window.setTimeout(() => {
        setPendingCancelledFuCase({ dateKey, caseItem });
        setSwipingCaseId(null);
      }, 120);
    } else if (preview?.id === caseItem.id) {
      swipeCaseClickBlockRef.current = { id: caseItem.id, until: Date.now() + 180 };
    }
  };

  const shouldBlockCaseClick = (caseId) => {
    const blocked = swipeCaseClickBlockRef.current;
    if (!blocked || blocked.id !== caseId) return false;
    if (Date.now() > blocked.until) {
      swipeCaseClickBlockRef.current = null;
      return false;
    }
    return true;
  };

  const ftUnreconciledWeekCases = weekDates.flatMap((dateKey) =>
    getCasesForDate(dateKey)
      .filter((caseItem) => caseItem.fastTracking && !caseItem.reconciled)
      .map((caseItem) => ({ ...caseItem, displayDateKey: dateKey }))
  );

  const bulkCancelledFuItemKey = (item) => `${item.displayDateKey || item.date || selectedDate}::${item.id}`;

  const openFtUnreconciledWeekReview = () => {
    const items = ftUnreconciledWeekCases;
    if (items.length === 0) {
      alert("No FT unreconciled cases found for this selected week/facility filter.");
      return;
    }
    setBulkCancelledFuReviewItems(items);
    setBulkCancelledFuSelectedKeys(items.map(bulkCancelledFuItemKey));
    setShowBulkCancelledFuReview(true);
  };

  const toggleBulkCancelledFuSelection = (key) => {
    setBulkCancelledFuSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((itemKey) => itemKey !== key) : [...prev, key]
    );
  };

  const setAllBulkCancelledFuSelection = (checked) => {
    setBulkCancelledFuSelectedKeys(checked ? bulkCancelledFuReviewItems.map(bulkCancelledFuItemKey) : []);
  };

  const closeBulkCancelledFuReview = () => {
    setShowBulkCancelledFuReview(false);
    setBulkCancelledFuReviewItems([]);
    setBulkCancelledFuSelectedKeys([]);
  };

  const confirmBulkCancelledFuMove = () => {
    const selectedSet = new Set(bulkCancelledFuSelectedKeys);
    const selectedItems = bulkCancelledFuReviewItems.filter((item) => selectedSet.has(bulkCancelledFuItemKey(item)));
    if (selectedItems.length === 0) {
      alert("Select at least one FT unreconciled case to move.");
      return;
    }
    const idsByDate = selectedItems.reduce((acc, item) => {
      acc[item.displayDateKey] = acc[item.displayDateKey] || new Set();
      acc[item.displayDateKey].add(item.id);
      return acc;
    }, {});
    const archived = selectedItems.map((item) => {
      const { displayDateKey, ...caseItem } = item;
      return buildCancelledFuCase(displayDateKey, caseItem, "bulk-ft-unreconciled");
    });
    setCasesByDate((prev) => {
      const next = { ...prev };
      Object.entries(idsByDate).forEach(([dateKey, ids]) => {
        next[dateKey] = (next[dateKey] || []).filter((caseItem) => !ids.has(caseItem.id));
      });
      return next;
    });
    setCancelledFuCases((prev) => [...archived, ...prev]);
    closeBulkCancelledFuReview();
  };

  const restoreCancelledFuCase = (cancelledFuId) => {
    const item = cancelledFuCases.find((caseItem) => caseItem.cancelledFuId === cancelledFuId);
    if (!item) return;
    const restoreDateKey = item.originalDateKey || item.date || selectedDate;
    const { cancelledFuId: _cancelledFuId, originalDateKey, movedAt, cancelledFuSource, displayDateKey, ...caseToRestore } = item;
    setCancelledFuCases((prev) => prev.filter((caseItem) => caseItem.cancelledFuId !== cancelledFuId));
    setCasesByDate((prev) => ({ ...prev, [restoreDateKey]: [...(prev[restoreDateKey] || []), { ...caseToRestore, date: restoreDateKey, id: caseToRestore.id || crypto.randomUUID() }] }));
  };

  const deleteCancelledFuCase = (cancelledFuId) => {
    const confirmed = window.confirm("Permanently delete this Cancelled F/U case? This cannot be undone.");
    if (!confirmed) return;
    setCancelledFuCases((prev) => prev.filter((caseItem) => caseItem.cancelledFuId !== cancelledFuId));
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
    const finalDraft = { ...nextDraft, procedure: resolveReviewDraftProcedure(nextDraft) };
    setCasesByDate((prev) => ({
      ...prev,
      [selectedReviewCase.dateKey]: (prev[selectedReviewCase.dateKey] || []).map((c) =>
        c.id === selectedReviewCase.id ? { ...c, ...finalDraft, date: selectedReviewCase.dateKey } : c
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

  const surgeonRosterEditKey = (facility, surgeonName) => `${facility || ""}::${surgeonName || ""}`;

  const startEditingSurgeonFromRoster = (facility, surgeon) => {
    if (!facility || !surgeon?.name) return;
    setEditingSurgeonKey(surgeonRosterEditKey(facility, surgeon.name));
    setEditingSurgeonName(surgeon.name || "");
    setEditingSurgeonSubspecialty(surgeon.subspecialty || "");
  };

  const cancelEditingSurgeonFromRoster = () => {
    setEditingSurgeonKey("");
    setEditingSurgeonName("");
    setEditingSurgeonSubspecialty("");
  };

  const saveSurgeonRosterEdit = (facility, oldSurgeonName) => {
    const oldName = (oldSurgeonName || "").trim();
    const newName = editingSurgeonName.trim();
    const newSpecialty = editingSurgeonSubspecialty.trim();
    if (!facility || !oldName || !newName) return;

    const sameName = oldName.toLowerCase() === newName.toLowerCase();
    const existingRoster = surgeonRosters[facility] || [];
    const nameConflict = existingRoster.some((s) => s.name.toLowerCase() === newName.toLowerCase() && s.name.toLowerCase() !== oldName.toLowerCase());
    if (nameConflict) {
      alert(`${newName} already exists in the ${facility} surgeon roster.`);
      return;
    }

    setSurgeonRosters((prev) => {
      const current = prev[facility] || [];
      return {
        ...prev,
        [facility]: current
          .map((surgeon) => surgeon.name === oldName ? { ...surgeon, name: newName, subspecialty: newSpecialty } : surgeon)
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    });

    if (!sameName) {
      setCasesByDate((prev) => {
        const next = {};
        Object.entries(prev || {}).forEach(([dateKey, cases]) => {
          next[dateKey] = (cases || []).map((caseItem) =>
            caseItem.facility === facility && caseItem.surgeon === oldName ? { ...caseItem, surgeon: newName } : caseItem
          );
        });
        return next;
      });
      setGrowthSurgeons((prev) => prev.map((name) => name === oldName ? newName : name).filter((name, index, arr) => arr.indexOf(name) === index));
      setCaseTemplateSurgeon((prev) => prev === oldName ? newName : prev);
      setSfExtractedCases((prev) => (prev || []).map((row) =>
        row.facility === facility && row.surgeon === oldName ? { ...row, surgeon: newName, rosterSurgeonName: newName } : row
      ));
    }

    cancelEditingSurgeonFromRoster();
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

  const openAddProcedureRosterModal = () => {
    setNewProcedureRosterName("");
    setNewProcedureRosterSpecialty(procedureRosterSpecialty === ALL_PROCEDURE_SPECIALTIES ? "General Surgeon" : procedureRosterSpecialty);
    setShowAddProcedureRosterModal(true);
  };

  const closeAddProcedureRosterModal = () => {
    setShowAddProcedureRosterModal(false);
    setNewProcedureRosterName("");
  };

  const addManualProcedureToRoster = () => {
    const procedure = newProcedureRosterName.trim();
    const specialty = (newProcedureRosterSpecialty || "Unassigned").trim() || "Unassigned";
    if (!procedure) return;
    const key = `${normalizeProcedureSearch(specialty)}::${normalizeProcedureSearch(procedure)}`;
    const existsInRoster = procedureRosterItems.some((item) => procedureRosterItemKey(item) === key);
    if (!existsInRoster) {
      setManualProcedureRosterItems((prev) => {
        const existing = new Set((prev || []).map((item) => `${normalizeProcedureSearch(item?.specialty || "Unassigned")}::${normalizeProcedureSearch(item?.procedure || "")}`));
        if (existing.has(key)) return prev;
        return [...(prev || []), { procedure, specialty }];
      });
    }
    setProcedureExclusions((prev) => (prev || []).filter((entry) => normalizeProcedureSearch(typeof entry === "string" ? entry : entry?.procedure) !== normalizeProcedureSearch(procedure)));
    closeAddProcedureRosterModal();
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

    setManualProcedureRosterItems((prev) => (prev || []).map((entry) => {
      const entryProcedure = (entry?.procedure || "").trim();
      const entrySpecialty = entry?.specialty || "Unassigned";
      if (normalizeProcedureSearch(entryProcedure) !== normalizeProcedureSearch(oldProcedure)) return entry;
      if (specialty !== ALL_PROCEDURE_SPECIALTIES && normalizeProcedureSearch(entrySpecialty) !== normalizeProcedureSearch(specialty)) return entry;
      return { ...entry, procedure: newProcedure };
    }));
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

  const startEditingFacility = (facility) => {
    setEditingFacilityOriginal(facility);
    setEditingFacilityName(facility);
  };

  const cancelEditingFacility = () => {
    setEditingFacilityOriginal("");
    setEditingFacilityName("");
  };

  const saveFacilityRename = () => {
    const oldName = editingFacilityOriginal.trim();
    const newName = editingFacilityName.trim();
    if (!oldName || !newName) return;
    if (oldName.toLowerCase() === newName.toLowerCase()) {
      cancelEditingFacility();
      return;
    }
    if (facilities.some((facility) => facility.toLowerCase() === newName.toLowerCase() && facility.toLowerCase() !== oldName.toLowerCase())) {
      alert(`${newName} already exists in your facility list.`);
      return;
    }

    const confirmed = window.confirm(`Rename facility "${oldName}" to "${newName}"? Existing cases and surgeon roster entries for this facility will be updated.`);
    if (!confirmed) return;

    setFacilities((prev) => prev.map((facility) => facility === oldName ? newName : facility).sort((a, b) => a.localeCompare(b)));
    setSurgeonRosters((prev) => {
      const next = { ...prev };
      next[newName] = next[oldName] || [];
      delete next[oldName];
      return next;
    });
    setCasesByDate((prev) => {
      const next = {};
      Object.entries(prev || {}).forEach(([dateKey, cases]) => {
        next[dateKey] = (cases || []).map((caseItem) => caseItem.facility === oldName ? { ...caseItem, facility: newName } : caseItem);
      });
      return next;
    });
    setSelectedFacility((prev) => prev === oldName ? newName : prev);
    setRosterFacility((prev) => prev === oldName ? newName : prev);
    setReviewDraft((prev) => prev?.facility === oldName ? { ...prev, facility: newName } : prev);
    setSfExtractedCases((prev) => (prev || []).map((row) => row.facility === oldName ? { ...row, facility: newName } : row));
    cancelEditingFacility();
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
        setManualProcedureRosterItems(Array.isArray(parsed.manualProcedureRosterItems) ? parsed.manualProcedureRosterItems : []);
        setSfSurgeonAliases(parsed.sfSurgeonAliases && typeof parsed.sfSurgeonAliases === "object" ? parsed.sfSurgeonAliases : {});
        setSfProcedureAliases(parsed.sfProcedureAliases && typeof parsed.sfProcedureAliases === "object" ? parsed.sfProcedureAliases : {});
        setWeekStartDay(WEEK_START_OPTIONS.includes(parsed.weekStartDay) ? parsed.weekStartDay : "Sunday");
      } catch {
        alert("Could not import that file. Please use an exported OR Planner JSON backup.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ plannerTitle, selectedDate, casesByDate, cancelledFuCases, facilities: sortedFacilities, surgeonRosters, procedureExclusions, manualProcedureRosterItems, sfSurgeonAliases, sfProcedureAliases, growthSurgeons, weekStartDay }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `OR-Calendar-Planner-Backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const {
    showSfMobileReference,
    setShowSfMobileReference,
    showSfDesktopReference,
    setShowSfDesktopReference,
    sfFile,
    sfPreviewUrl,
    sfLoading,
    sfError,
    sfScreenshotType,
    sfAccountName,
    sfExtractedCases,
    sfApplySummary,
    sfRosterEditRowIds,
    toggleSfRosterEditRow,
    resetSalesforceImport,
    handleSalesforceFileChange,
    extractSalesforceCases,
    applySalesforceRowsToPlanner,
    updateSalesforceRow,
    sfEffectiveRow,
    sfActionLabel,
    sfActionBadgeClass,
    sfMatchLabel,
    sfMatchBadgeClass,
    sfGetPlannerMatches,
    getSfPlannerCaseOptions,
    sfSurgeonExistsInFacility,
    sfSurgeonFacilityOptions,
    sfSelectExistingSurgeonForRow,
    sfProcedureRosterOptionsForRow,
    sfSelectExistingProcedureForRow,
    sfSelectOneTimeProcedureForRow,
    sfAddOneTimeProcedureForRow,
    sfAddSurgeonToRosterFromRow,
  } = useSalesforceImport({
    sortedFacilities,
    casesByDate,
    setCasesByDate,
    surgeonRosters,
    setSurgeonRosters,
    setFacilities,
    setSelectedDate,
    setProcedureExclusions,
    procedureRosterItems,
    manualProcedureRosterItems,
    setManualProcedureRosterItems,
    sfSurgeonAliases,
    setSfSurgeonAliases,
    sfProcedureAliases,
    setSfProcedureAliases,
    isAutoGrowthSurgeon,
    setGrowthSurgeons,
  });

  return (
    <div
      data-or-theme={darkMode ? "dark" : "light"}
      className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-900 p-3 md:p-6"
      style={{ overflowAnchor: "none", WebkitTapHighlightColor: "transparent", overscrollBehaviorY: "auto" }}
    >
      <style>{`
        [data-or-theme="dark"] {
          color-scheme: dark;
          color: #e2e8f0 !important;
        }
        [data-or-theme="dark"].text-slate-900,
        [data-or-theme="dark"].text-slate-800,
        [data-or-theme="dark"].text-slate-700 {
          color: #f8fafc !important;
        }
        [data-or-theme="dark"] button:not(.bg-slate-900):not(.bg-blue-600):not(.bg-green-700):not(.bg-red-600):not(.bg-slate-950) {
          color: #e2e8f0;
        }
        [data-or-theme="dark"] .bg-white:not(.bg-slate-900) {
          color: #e2e8f0;
        }
        [data-or-theme="dark"] .font-bold:not(.text-blue-700):not(.text-green-700):not(.text-red-700):not(.text-amber-800):not(.text-yellow-800) {
          color: #f8fafc;
        }
        [data-or-theme="dark"] .text-2xl,
        [data-or-theme="dark"] .text-3xl,
        [data-or-theme="dark"] .text-4xl {
          color: #f8fafc !important;
        }
        [data-or-theme="dark"].bg-slate-50,
        [data-or-theme="dark"] .bg-slate-50 {
          background-color: #0f172a !important;
        }
        [data-or-theme="dark"] .bg-white {
          background-color: #1e293b !important;
        }
        [data-or-theme="dark"] .bg-slate-100 {
          background-color: #334155 !important;
        }
        [data-or-theme="dark"] .bg-slate-50 {
          background-color: #273449 !important;
        }
        [data-or-theme="dark"] .bg-blue-50 {
          background-color: rgba(30, 64, 175, 0.28) !important;
        }
        [data-or-theme="dark"] .bg-green-50 {
          background-color: rgba(22, 101, 52, 0.28) !important;
        }
        [data-or-theme="dark"] .bg-amber-50,
        [data-or-theme="dark"] .bg-yellow-50 {
          background-color: rgba(146, 64, 14, 0.28) !important;
        }
        [data-or-theme="dark"] .bg-red-50 {
          background-color: rgba(127, 29, 29, 0.30) !important;
        }
        [data-or-theme="dark"] .text-slate-900,
        [data-or-theme="dark"] .text-slate-800,
        [data-or-theme="dark"] .text-slate-700 {
          color: #f8fafc !important;
        }
        [data-or-theme="dark"] .text-slate-600,
        [data-or-theme="dark"] .text-slate-500,
        [data-or-theme="dark"] .text-slate-400 {
          color: #cbd5e1 !important;
        }
        [data-or-theme="dark"] .text-blue-800,
        [data-or-theme="dark"] .text-blue-700 {
          color: #bfdbfe !important;
        }
        [data-or-theme="dark"] .text-green-800,
        [data-or-theme="dark"] .text-green-700 {
          color: #bbf7d0 !important;
        }
        [data-or-theme="dark"] .text-amber-800,
        [data-or-theme="dark"] .text-yellow-800 {
          color: #fde68a !important;
        }

        [data-or-theme="dark"] .text-amber-900,
        [data-or-theme="dark"] .text-yellow-900,
        [data-or-theme="dark"] .text-amber-700,
        [data-or-theme="dark"] .text-yellow-700,
        [data-or-theme="dark"] .text-amber-600,
        [data-or-theme="dark"] .text-yellow-600 {
          color: #fef3c7 !important;
        }
        [data-or-theme="dark"] .bg-amber-50.text-amber-900,
        [data-or-theme="dark"] .bg-yellow-50.text-yellow-900,
        [data-or-theme="dark"] .bg-amber-50 .text-amber-900,
        [data-or-theme="dark"] .bg-yellow-50 .text-yellow-900,
        [data-or-theme="dark"] .bg-amber-50 .text-amber-800,
        [data-or-theme="dark"] .bg-yellow-50 .text-yellow-800 {
          color: #fffbeb !important;
        }
        [data-or-theme="dark"] .bg-amber-50,
        [data-or-theme="dark"] .bg-yellow-50 {
          border-color: rgba(252, 211, 77, 0.70) !important;
        }
        [data-or-theme="dark"] .text-red-800,
        [data-or-theme="dark"] .text-red-700 {
          color: #fecaca !important;
        }
        [data-or-theme="dark"] .bg-green-100 {
          background-color: rgba(22, 101, 52, 0.72) !important;
        }
        [data-or-theme="dark"] .bg-green-100.text-green-700,
        [data-or-theme="dark"] .bg-green-100 .text-green-700 {
          color: #f0fdf4 !important;
        }
        [data-or-theme="dark"] .bg-red-100 {
          background-color: rgba(127, 29, 29, 0.78) !important;
        }
        [data-or-theme="dark"] .bg-red-100.text-red-700,
        [data-or-theme="dark"] .bg-red-100 .text-red-700 {
          color: #fff1f2 !important;
        }
        [data-or-theme="dark"] .bg-yellow-100 {
          background-color: rgba(133, 77, 14, 0.78) !important;
        }
        [data-or-theme="dark"] .bg-yellow-100.text-yellow-800,
        [data-or-theme="dark"] .bg-yellow-100 .text-yellow-800 {
          color: #fffbeb !important;
        }

        [data-or-theme="dark"] .bg-amber-100 {
          background-color: #fde68a !important;
        }
        [data-or-theme="dark"] .bg-amber-100.text-amber-900,
        [data-or-theme="dark"] .bg-amber-100 .text-amber-900,
        [data-or-theme="dark"] .bg-amber-100.text-amber-800,
        [data-or-theme="dark"] .bg-amber-100 .text-amber-800 {
          color: #78350f !important;
        }
        [data-or-theme="dark"] .ring-amber-200 {
          border-color: rgba(252, 211, 77, 0.75) !important;
          --tw-ring-color: rgba(252, 211, 77, 0.75) !important;
        }
        [data-or-theme="dark"] .bg-blue-100 {
          background-color: rgba(30, 64, 175, 0.72) !important;
        }
        [data-or-theme="dark"] .bg-blue-100.text-blue-700,
        [data-or-theme="dark"] .bg-blue-100 .text-blue-700 {
          color: #eff6ff !important;
        }
        [data-or-theme="dark"] .border-slate-200 {
          border-color: #475569 !important;
        }
        [data-or-theme="dark"] .ring-slate-200 {
          --tw-ring-color: #475569 !important;
        }
        [data-or-theme="dark"] input,
        [data-or-theme="dark"] select,
        [data-or-theme="dark"] textarea,
        [data-or-theme="dark"] .input {
          background-color: #1e293b !important;
          color: #f8fafc !important;
          border-color: #475569 !important;
        }
        [data-or-theme="dark"] input::placeholder,
        [data-or-theme="dark"] textarea::placeholder {
          color: #94a3b8 !important;
        }
        [data-or-theme="dark"] .shadow-sm,
        [data-or-theme="dark"] .shadow-lg,
        [data-or-theme="dark"] .shadow-xl {
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35) !important;
        }
      `}</style>
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
                  <button onClick={() => { setShowMobileActions(false); setShowCancelledFuCasesModal(true); }} className="flex items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"><ClipboardList className="mr-2 h-4 w-4" /> Cancelled F/U Cases</button>
                  <button onClick={() => { setDarkMode((prev) => !prev); setShowMobileActions(false); }} className="flex items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"><span className="mr-2 inline-flex h-4 w-4 items-center justify-center text-base leading-none">{darkMode ? "☀" : "☾"}</span> {darkMode ? "Light Mode" : "Dark Mode"}</button>
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
                      <div key={facility} className="flex min-w-0 flex-wrap items-center gap-1 rounded-xl bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                        {editingFacilityOriginal === facility ? (
                          <>
                            <input
                              value={editingFacilityName}
                              onChange={(e) => setEditingFacilityName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveFacilityRename();
                                if (e.key === "Escape") cancelEditingFacility();
                              }}
                              className="h-8 min-w-[180px] flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-300"
                              autoFocus
                            />
                            <button onClick={saveFacilityRename} className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-bold text-white">Save</button>
                            <button onClick={cancelEditingFacility} className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => syncActiveFacility(facility)} className="min-w-0 max-w-full truncate rounded-lg px-1 py-0.5 text-left hover:bg-white" title={`Use ${facility} everywhere`}>
                              {facility}
                            </button>
                            <button onClick={() => startEditingFacility(facility)} className="rounded-lg bg-white px-2 py-0.5 text-xs font-bold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50">Edit</button>
                            <button onClick={() => removeFacility(facility)} className="rounded-full p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${facility}`}>
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-3xl shadow-sm">
          <CardContent className={showSurgeonRosterPanel ? "relative p-4" : "px-4 py-2"}>
            {!showSurgeonRosterPanel ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">Surgeon Rosters</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{Object.values(surgeonRosters).flat().length} saved</span>
                </div>
                <button
                  onClick={() => setShowSurgeonRosterPanel(true)}
                  className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200"
                >
                  Manage Surgeons ▼
                </button>
              </div>
            ) : (
              <>
            <button onClick={() => setShowSurgeonRosterPanel(false)} className="absolute right-4 top-4 z-10 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200">Collapse ▲</button>
            <div className="grid gap-4 pr-28 lg:grid-cols-[300px_1fr] lg:items-start">
              <div>
                <h2 className="text-xl font-bold">Surgeon Rosters</h2>
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
                    {selectedRoster.map((surgeon) => {
                      const surgeonFacility = surgeon.facility || rosterFacility;
                      const editKey = surgeonRosterEditKey(surgeonFacility, surgeon.name);
                      const isEditingSurgeon = editingSurgeonKey === editKey;
                      return (
                      <div key={`${surgeonFacility}-${surgeon.name}`} className="flex w-full min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-xl bg-white px-3 py-2 text-sm font-medium ring-1 ring-slate-200">
                        {isEditingSurgeon ? (
                          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                            <input
                              value={editingSurgeonName}
                              onChange={(e) => setEditingSurgeonName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveSurgeonRosterEdit(surgeonFacility, surgeon.name);
                                if (e.key === "Escape") cancelEditingSurgeonFromRoster();
                              }}
                              className="h-9 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                              autoFocus
                            />
                            <input
                              value={editingSurgeonSubspecialty}
                              onChange={(e) => setEditingSurgeonSubspecialty(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveSurgeonRosterEdit(surgeonFacility, surgeon.name);
                                if (e.key === "Escape") cancelEditingSurgeonFromRoster();
                              }}
                              placeholder="Subspecialty"
                              className="h-9 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                            />
                            <button onClick={() => saveSurgeonRosterEdit(surgeonFacility, surgeon.name)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">Save</button>
                            <button onClick={cancelEditingSurgeonFromRoster} className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 ring-1 ring-slate-200">Cancel</button>
                          </div>
                        ) : (
                          <>
                            <button onClick={() => toggleGrowthSurgeon(surgeon.name)} className={`shrink-0 rounded-xl px-2 py-1 text-xs font-bold ${growthSurgeons.includes(surgeon.name) ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-500 ring-1 ring-slate-200"}`} title="Toggle automatic Growth">Growth</button>
                            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                              <span className="min-w-0 truncate whitespace-nowrap" title={surgeon.name}>{surgeon.name}</span>
                              {rosterFacility === ALL_SURGEONS && surgeon.facility && <span className="hidden max-w-[35%] shrink truncate rounded-xl bg-slate-50 px-2 py-1 text-xs text-slate-500 ring-1 ring-slate-200 sm:inline-block" title={surgeon.facility}>{surgeon.facility}</span>}
                              {surgeon.subspecialty && <span className="max-w-[42%] shrink-0 truncate rounded-xl bg-slate-50 px-2 py-1 text-xs text-slate-500 ring-1 ring-slate-200" title={surgeon.subspecialty}>{surgeon.subspecialty}</span>}
                            </div>
                            <button onClick={() => startEditingSurgeonFromRoster(surgeonFacility, surgeon)} className="shrink-0 rounded-xl bg-slate-50 px-2 py-1 text-xs font-bold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100">Edit</button>
                            <button onClick={() => removeSurgeonFromRoster(surgeonFacility, surgeon.name)} className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${surgeon.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                          </>
                        )}
                      </div>
                    )})}
                  </div>
                )}
              </div>
            )}
              </>
            )}
          </CardContent>
        </Card>


        <Card className="rounded-3xl shadow-sm">
          <CardContent className={showProcedureRosterPanel ? "relative p-4" : "px-4 py-2"}>
            {!showProcedureRosterPanel ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">Procedure Roster</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{procedureRosterItems.length} saved</span>
                </div>
                <button
                  onClick={() => setShowProcedureRosterPanel(true)}
                  className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200"
                >
                  Manage Procedures ▼
                </button>
              </div>
            ) : (
              <>
                <button onClick={() => setShowProcedureRosterPanel(false)} className="absolute right-4 top-4 z-10 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200">Collapse ▲</button>
                <div className="grid gap-4 pr-28 lg:grid-cols-[300px_1fr] lg:items-start">
                  <div>
                    <h2 className="text-xl font-bold">Procedure Roster</h2>
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
                      <div className="grid w-full min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        <div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-500 ring-1 ring-slate-200">No saved procedures found for this filter.</div>
                        <button
                          type="button"
                          onClick={openAddProcedureRosterModal}
                          className="flex w-full min-w-0 max-w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-white px-3 py-2 text-sm font-bold text-blue-700 ring-1 ring-blue-100 hover:bg-blue-50"
                          aria-label="Add procedure to procedure roster"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
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
                                  <span className="shrink-0 rounded-xl bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">{item.count ? `${item.count}x` : "Manual"}</span>
                                  <button onClick={() => startEditingProcedureFromRoster(item)} className="shrink-0 rounded-xl bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 ring-1 ring-blue-100 hover:bg-blue-100">Edit</button>
                                  <button onClick={() => removeProcedureFromRoster(item.procedure)} className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${item.procedure}`}><Trash2 className="h-3.5 w-3.5" /></button>
                                </>
                              )}
                            </div>
                          );
                        })}
                        <button
                          type="button"
                          onClick={openAddProcedureRosterModal}
                          className="flex w-full min-w-0 max-w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-white px-3 py-2 text-sm font-bold text-blue-700 ring-1 ring-blue-100 hover:bg-blue-50"
                          aria-label="Add procedure to procedure roster"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>



        {showAddProcedureRosterModal && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 p-4">
            <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl ring-1 ring-slate-200">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Add Procedure to Roster</h3>
                  <p className="mt-1 text-sm text-slate-500">Add a saved procedure name for search and Salesforce matching. This does not create a case.</p>
                </div>
                <button onClick={closeAddProcedureRosterModal} className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200">Close</button>
              </div>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Procedure name
                  <input
                    value={newProcedureRosterName}
                    onChange={(e) => setNewProcedureRosterName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addManualProcedureToRoster(); if (e.key === "Escape") closeAddProcedureRosterModal(); }}
                    placeholder="Example: Paraesophageal"
                    className="input normal-case tracking-normal"
                    autoFocus
                  />
                </label>
                <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Specialty
                  <select value={newProcedureRosterSpecialty} onChange={(e) => setNewProcedureRosterSpecialty(e.target.value)} className="input normal-case tracking-normal">
                    {Array.from(new Set(["General Surgeon", "Gynecology", "Urology", "Colorectal", "Bariatrics", procedureRosterSpecialty !== ALL_PROCEDURE_SPECIALTIES ? procedureRosterSpecialty : "", ...procedureRosterSpecialties.filter((item) => item !== ALL_PROCEDURE_SPECIALTIES)])).filter(Boolean).map((specialty) => <option key={specialty}>{specialty}</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button onClick={closeAddProcedureRosterModal} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200">Cancel</button>
                <button onClick={addManualProcedureToRoster} disabled={!newProcedureRosterName.trim()} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">Add Procedure</button>
              </div>
            </div>
          </div>
        )}

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
                <div className="flex flex-col gap-2 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-100 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-amber-900">Cancelled F/U cleanup</div>
                    <div className="text-xs text-amber-800">Review FT checked + Rec unchecked cases for this week.</div>
                  </div>
                  <button
                    onClick={openFtUnreconciledWeekReview}
                    disabled={ftUnreconciledWeekCases.length === 0}
                    className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-white px-4 py-2 text-sm font-bold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Review FT Unrec Week
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900 ring-1 ring-amber-200">{ftUnreconciledWeekCases.length}</span>
                  </button>
                </div>

                {activeStatReportType && (
                <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
                  <div className="mt-8 w-full max-w-2xl rounded-3xl bg-white p-4 shadow-xl ring-1 ring-slate-200">
                    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <h2 className="text-xl font-bold">{statReportLabels[activeStatReportType]}</h2>
                        <p className="text-sm text-slate-500">{activeStatReportType === "yearTotal" || activeStatReportType === "yearGrowth" ? `Year-to-date through ${formatLongDate(selectedWeekEnd)}` : `Week of ${formatLongDate(weekDates[0])}`}</p>
                        {ftShareStatus && <p className="mt-1 text-xs font-semibold text-blue-600">{ftShareStatus}</p>}
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        {activeStatReportType === "fastTracking" && (
                          <button
                            onClick={shareFastTrackedScreenshot}
                            disabled={statReportCases.length === 0 || ftShareStatus === "Preparing..."}
                            className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-blue-500 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Share Screenshot
                          </button>
                        )}
                        <button onClick={() => { setShowFastTrackedReport(false); setStatReportType(null); }} className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200">Close</button>
                      </div>
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
                      animate={deletingCaseIds.includes(c.id) ? { opacity: 0, scale: [1, 1.06, 0.72], borderRadius: ["1rem", "999px", "999px"] } : swipingCaseId === c.id ? { opacity: 1, scale: 1, x: -90 } : swipeCasePreview?.id === c.id ? { opacity: 1, scale: 1, x: swipeCasePreview.x } : { opacity: 1, scale: 1, x: 0 }}
                      transition={deletingCaseIds.includes(c.id) ? { duration: 0.22, ease: "easeOut" } : swipeCasePreview?.id === c.id ? { duration: 0.02 } : { duration: 0.12 }}
                      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 text-sm ring-1 ring-slate-100 touch-pan-y"
                      onPointerDown={(event) => handleCasePointerDown(event, c)}
                      onPointerMove={(event) => handleCasePointerMove(event, c)}
                      onPointerUp={(event) => handleCasePointerUp(event, selectedDate, c)}
                      onPointerCancel={() => { swipeCaseStartRef.current = null; setSwipeCasePreview(null); }}
                    >
                      <button
                        type="button"
                        onClick={(event) => {
                          if (shouldBlockCaseClick(c.id)) {
                            event.preventDefault();
                            event.stopPropagation();
                            return;
                          }
                          openCaseEditor(selectedDate, c);
                        }}
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

                      <div className="mt-3 grid grid-cols-[1fr_1fr_1fr_auto_auto] items-center gap-2">
                        <CompactCheck label="FT" checked={c.fastTracking} onChange={(value) => updateCase(c.id, { fastTracking: value })} />
                        <CompactCheck label="Rec" checked={c.reconciled} onChange={(value) => value ? requestReconcileCase(selectedDate, c) : updateCase(c.id, { reconciled: value })} />
                        <CompactCheck label="Growth" checked={c.growth} onChange={(value) => updateCase(c.id, { growth: value })} />
                        <button
                          data-no-swipe="true"
                          onClick={() => setPendingCancelledFuCase({ dateKey: selectedDate, caseItem: c })}
                          className="flex h-9 w-9 items-center justify-center rounded-xl text-amber-600 ring-1 ring-amber-100 hover:bg-amber-50"
                          aria-label="Move case to Cancelled F/U"
                          title="Move to Cancelled F/U"
                        >
                          <ClipboardList className="h-4 w-4" />
                        </button>
                        <button onClick={() => deleteCase(c.id)} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600" data-no-swipe="true" aria-label="Delete case"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {pendingCancelledFuCase && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 backdrop-blur-sm md:items-center">
          <motion.div initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
            <div className="text-xs font-bold uppercase tracking-wide text-amber-700">Move to Cancelled F/U?</div>
            <h3 className="mt-2 text-xl font-bold text-slate-900">Move this case out of the active planner?</h3>
            <div className="mt-3 rounded-2xl bg-slate-100 p-3 text-sm text-slate-700">
              <div><span className="font-semibold">Date:</span> {formatLongDate(pendingCancelledFuCase.dateKey)}</div>
              <div><span className="font-semibold">Facility:</span> {pendingCancelledFuCase.caseItem?.facility || "—"}</div>
              <div><span className="font-semibold">Surgeon:</span> {pendingCancelledFuCase.caseItem?.surgeon || "—"}</div>
              <div><span className="font-semibold">Procedure:</span> {pendingCancelledFuCase.caseItem?.procedure || "—"}</div>
            </div>
            <p className="mt-3 text-sm text-slate-500">This removes the case from active schedule counts but keeps it in More → Cancelled F/U Cases so you can restore or delete it later.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button onClick={() => setPendingCancelledFuCase(null)} variant="secondary" className="rounded-2xl py-5">Cancel</Button>
              <Button onClick={confirmMoveCaseToCancelledFu} className="rounded-2xl py-5">Move to Cancelled F/U</Button>
            </div>
          </motion.div>
        </div>
      )}

      {showBulkCancelledFuReview && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 backdrop-blur-sm md:items-center">
          <motion.div initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-amber-700">Review FT unreconciled cases</div>
                <h3 className="mt-1 text-2xl font-bold text-slate-900">Move selected cases to Cancelled F/U</h3>
                <p className="mt-1 text-sm text-slate-500">Only FT checked + Rec unchecked cases from the selected week/facility filter appear here. Uncheck any case you do not want to move yet.</p>
              </div>
              <Button onClick={closeBulkCancelledFuReview} variant="outline" className="rounded-2xl">Close</Button>
            </div>
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-800 ring-1 ring-slate-200">
                <span>Select all eligible cases</span>
                <span className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-500">{bulkCancelledFuSelectedKeys.length} of {bulkCancelledFuReviewItems.length} selected</span>
                  <input
                    type="checkbox"
                    checked={bulkCancelledFuReviewItems.length > 0 && bulkCancelledFuSelectedKeys.length === bulkCancelledFuReviewItems.length}
                    onChange={(e) => setAllBulkCancelledFuSelection(e.target.checked)}
                    className="h-5 w-5 rounded border-slate-300"
                  />
                </span>
              </label>
            </div>
            <div className="max-h-[55vh] overflow-auto p-5">
              <div className="space-y-3">
                {bulkCancelledFuReviewItems.map((caseItem) => {
                  const itemKey = bulkCancelledFuItemKey(caseItem);
                  const checked = bulkCancelledFuSelectedKeys.includes(itemKey);
                  return (
                    <label key={itemKey} className={`flex cursor-pointer items-start gap-3 rounded-2xl p-4 text-sm ring-1 transition ${checked ? "bg-amber-50 ring-amber-200" : "bg-white ring-slate-200 hover:bg-slate-50"}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleBulkCancelledFuSelection(itemKey)}
                        className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900">{formatLongDate(caseItem.displayDateKey)} {caseItem.time ? `· ${caseItem.time}` : ""}</div>
                        <div className="mt-2 grid gap-1 text-slate-700 md:grid-cols-3">
                          <div><span className="font-semibold">Facility:</span> {caseItem.facility || "—"}</div>
                          <div><span className="font-semibold">Surgeon:</span> {caseItem.surgeon || "—"}</div>
                          <div><span className="font-semibold">Procedure:</span> {caseItem.procedure || "—"}</div>
                        </div>
                        {caseItem.notes && <div className="mt-2 text-slate-500"><span className="font-semibold">Notes:</span> {caseItem.notes}</div>}
                        <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                          <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">FT Yes</span>
                          <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">REC No</span>
                          <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">Growth {caseItem.growth ? "Yes" : "No"}</span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-2 border-t border-slate-200 p-5 sm:grid-cols-2">
              <Button onClick={closeBulkCancelledFuReview} variant="secondary" className="rounded-2xl py-5">Cancel</Button>
              <Button onClick={confirmBulkCancelledFuMove} className="rounded-2xl py-5" disabled={bulkCancelledFuSelectedKeys.length === 0}>
                Move {bulkCancelledFuSelectedKeys.length} Selected
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {showCancelledFuCasesModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 backdrop-blur-sm md:items-center">
          <motion.div initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-blue-600">Cancelled F/U Cases</div>
                <h3 className="mt-1 text-2xl font-bold text-slate-900">Cancelled follow-up holding list</h3>
                <p className="mt-1 text-sm text-slate-500">These cases are removed from active schedule counts. Restore them to return them to the planner.</p>
              </div>
              <Button onClick={() => setShowCancelledFuCasesModal(false)} variant="outline" className="rounded-2xl">Close</Button>
            </div>
            <div className="max-h-[65vh] overflow-auto p-5">
              {cancelledFuCases.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">No Cancelled F/U cases yet.</div>
              ) : (
                <div className="space-y-3">
                  {cancelledFuCases.map((caseItem) => (
                    <div key={caseItem.cancelledFuId} className="rounded-2xl bg-slate-50 p-4 text-sm ring-1 ring-slate-200">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900">{formatLongDate(caseItem.originalDateKey || caseItem.date || selectedDate)} {caseItem.time ? `· ${caseItem.time}` : ""}</div>
                          <div className="mt-2 grid gap-1 text-slate-700">
                            <div><span className="font-semibold">Facility:</span> {caseItem.facility || "—"}</div>
                            <div><span className="font-semibold">Surgeon:</span> {caseItem.surgeon || "—"}</div>
                            <div><span className="font-semibold">Procedure:</span> {caseItem.procedure || "—"}</div>
                            {caseItem.notes && <div><span className="font-semibold">Notes:</span> {caseItem.notes}</div>}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                            <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">FT {caseItem.fastTracking ? "Yes" : "No"}</span>
                            <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">REC {caseItem.reconciled ? "Yes" : "No"}</span>
                            <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">Growth {caseItem.growth ? "Yes" : "No"}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button onClick={() => restoreCancelledFuCase(caseItem.cancelledFuId)} variant="secondary" className="rounded-2xl">Restore</Button>
                          <button onClick={() => deleteCancelledFuCase(caseItem.cancelledFuId)} className="flex h-10 w-10 items-center justify-center rounded-2xl text-slate-400 ring-1 ring-slate-200 hover:bg-red-50 hover:text-red-600" aria-label="Delete cancelled F/U case"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

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
                <input
                  value={reviewDraft.procedure}
                  onChange={(e) => updateReviewDraft({ procedure: e.target.value })}
                  onBlur={() => updateReviewDraft({ procedure: resolveReviewDraftProcedure(reviewDraft) })}
                  list="review-case-procedure-list"
                  placeholder="Type procedure"
                  className="input"
                />
                <datalist id="review-case-procedure-list">
                  {filteredReviewProcedureOptions.map((item) => (
                    <option key={`${item.specialty}-${item.procedure}`} value={item.procedure} />
                  ))}
                </datalist>
                {filteredReviewProcedureOptions.length > 0 && (
                  <select
                    value={filteredReviewProcedureOptions.some((item) => normalizeProcedureSearch(item.procedure) === normalizeProcedureSearch(reviewDraft.procedure)) ? reviewDraft.procedure : ""}
                    onChange={(e) => updateReviewDraft({ procedure: e.target.value })}
                    className="input mt-2 bg-white text-sm"
                  >
                    <option value="">Closest saved procedure matches</option>
                    {filteredReviewProcedureOptions.map((item) => (
                      <option key={`review-${item.specialty}-${item.procedure}`} value={item.procedure}>{item.procedure}{item.specialty ? ` · ${item.specialty}` : ""}</option>
                    ))}
                  </select>
                )}
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


      <SalesforceImportPanel
        showSalesforceImport={showSalesforceImport}
        resetSalesforceImport={resetSalesforceImport}
        setShowSalesforceImport={setShowSalesforceImport}
        sfFile={sfFile}
        handleSalesforceFileChange={handleSalesforceFileChange}
        sfPreviewUrl={sfPreviewUrl}
        sfScreenshotType={sfScreenshotType}
        sfAccountName={sfAccountName}
        extractSalesforceCases={extractSalesforceCases}
        sfLoading={sfLoading}
        sfError={sfError}
        sfApplySummary={sfApplySummary}
        sfExtractedCases={sfExtractedCases}
        applySalesforceRowsToPlanner={applySalesforceRowsToPlanner}
        sfEffectiveRow={sfEffectiveRow}
        sfActionBadgeClass={sfActionBadgeClass}
        sfActionLabel={sfActionLabel}
        sfMatchBadgeClass={sfMatchBadgeClass}
        sfMatchLabel={sfMatchLabel}
        sortedFacilities={sortedFacilities}
        updateSalesforceRow={updateSalesforceRow}
        sfSurgeonExistsInFacility={sfSurgeonExistsInFacility}
        sfSurgeonFacilityOptions={sfSurgeonFacilityOptions}
        sfSelectExistingSurgeonForRow={sfSelectExistingSurgeonForRow}
        sfProcedureRosterOptionsForRow={sfProcedureRosterOptionsForRow}
        sfSelectExistingProcedureForRow={sfSelectExistingProcedureForRow}
        sfSelectOneTimeProcedureForRow={sfSelectOneTimeProcedureForRow}
        sfAddOneTimeProcedureForRow={sfAddOneTimeProcedureForRow}
        sfAddSurgeonToRosterFromRow={sfAddSurgeonToRosterFromRow}
        sfGetPlannerMatches={sfGetPlannerMatches}
        getSfPlannerCaseOptions={getSfPlannerCaseOptions}
        sfRosterEditRowIds={sfRosterEditRowIds}
        toggleSfRosterEditRow={toggleSfRosterEditRow}
        setShowSfMobileReference={setShowSfMobileReference}
        setShowSfDesktopReference={setShowSfDesktopReference}
      />
      <SalesforceScreenshotReference
        sfPreviewUrl={sfPreviewUrl}
        showSfMobileReference={showSfMobileReference}
        showSfDesktopReference={showSfDesktopReference}
        sfFile={sfFile}
        setShowSfMobileReference={setShowSfMobileReference}
        setShowSfDesktopReference={setShowSfDesktopReference}
      />

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
