import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY;
export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const sortStringArray = (values = []) => Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));

const normalizeSurgeonRostersForCloudCompare = (rosters = {}) => {
  const normalized = {};
  Object.keys(rosters || {}).sort((a, b) => a.localeCompare(b)).forEach((facility) => {
    normalized[facility] = (Array.isArray(rosters[facility]) ? rosters[facility] : [])
      .map((surgeon) => ({
        name: surgeon?.name || "",
        subspecialty: surgeon?.subspecialty || "",
      }))
      .filter((surgeon) => surgeon.name)
      .sort((a, b) => `${a.name}|${a.subspecialty}`.localeCompare(`${b.name}|${b.subspecialty}`));
  });
  return normalized;
};

const normalizeAliasMapForCloudCompare = (aliases = {}) => {
  const normalized = {};
  Object.keys(aliases || {}).sort((a, b) => String(a).localeCompare(String(b))).forEach((scopeKey) => {
    const value = aliases[scopeKey];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      normalized[scopeKey] = {};
      Object.keys(value).sort((a, b) => String(a).localeCompare(String(b))).forEach((aliasKey) => {
        if (value[aliasKey]) normalized[scopeKey][aliasKey] = value[aliasKey];
      });
    } else if (value) {
      normalized[scopeKey] = value;
    }
  });
  return normalized;
};

const normalizeCasesByDateForCloudCompare = (cases = {}) => {
  const normalized = {};
  Object.keys(cases || {}).sort((a, b) => a.localeCompare(b)).forEach((dateKey) => {
    normalized[dateKey] = (Array.isArray(cases[dateKey]) ? cases[dateKey] : [])
      .map((item) => ({
        id: item?.id || "",
        date: item?.date || dateKey,
        facility: item?.facility || "",
        surgeon: item?.surgeon || "",
        procedure: item?.procedure || "",
        notes: item?.notes || "",
        fastTracking: Boolean(item?.fastTracking),
        reconciled: Boolean(item?.reconciled),
        growth: Boolean(item?.growth),
      }))
      .sort((a, b) => `${a.date}|${a.facility}|${a.surgeon}|${a.procedure}|${a.id}`.localeCompare(`${b.date}|${b.facility}|${b.surgeon}|${b.procedure}|${b.id}`));
  });
  return normalized;
};

const normalizeCancelledFuCasesForCloudCompare = (items = []) => (Array.isArray(items) ? items : [])
  .map((item) => ({
    id: item?.id || "",
    cancelledFuId: item?.cancelledFuId || "",
    originalDateKey: item?.originalDateKey || item?.date || "",
    movedAt: item?.movedAt || "",
    facility: item?.facility || "",
    surgeon: item?.surgeon || "",
    procedure: item?.procedure || "",
    notes: item?.notes || "",
    time: item?.time || "",
    fastTracking: Boolean(item?.fastTracking),
    reconciled: Boolean(item?.reconciled),
    growth: Boolean(item?.growth),
  }))
  .sort((a, b) => `${a.originalDateKey}|${a.facility}|${a.surgeon}|${a.procedure}|${a.cancelledFuId}|${a.id}`.localeCompare(`${b.originalDateKey}|${b.facility}|${b.surgeon}|${b.procedure}|${b.cancelledFuId}|${b.id}`));

export const snapshotToCloudComparableString = (snapshot = {}) => JSON.stringify({
  plannerTitle: snapshot.plannerTitle || snapshot.weekTitle || "OR Calendar Planner",
  casesByDate: normalizeCasesByDateForCloudCompare(snapshot.casesByDate || {}),
  cancelledFuCases: normalizeCancelledFuCasesForCloudCompare(snapshot.cancelledFuCases || []),
  facilities: sortStringArray(snapshot.facilities),
  surgeonRosters: normalizeSurgeonRostersForCloudCompare(snapshot.surgeonRosters || {}),
  procedureExclusions: sortStringArray(snapshot.procedureExclusions),
  manualProcedureRosterItems: (Array.isArray(snapshot.manualProcedureRosterItems) ? snapshot.manualProcedureRosterItems : [])
    .map((item) => ({ procedure: item?.procedure || "", specialty: item?.specialty || "Unassigned" }))
    .sort((a, b) => `${a.specialty}|${a.procedure}`.localeCompare(`${b.specialty}|${b.procedure}`)),
  sfSurgeonAliases: normalizeAliasMapForCloudCompare(snapshot.sfSurgeonAliases || {}),
  sfProcedureAliases: normalizeAliasMapForCloudCompare(snapshot.sfProcedureAliases || {}),
  growthSurgeons: sortStringArray(snapshot.growthSurgeons),
  weekStartDay: snapshot.weekStartDay || "Sunday",
});

export function useCloudSync({ plannerLoaded, snapshotDeps, getPlannerSnapshot, applyPlannerSnapshot }) {
  const [cloudSession, setCloudSession] = useState(null);
  const [cloudEmail, setCloudEmail] = useState("");
  const [cloudPassword, setCloudPassword] = useState("");
  const [cloudStatus, setCloudStatus] = useState(supabase ? "Cloud sync ready. Sign in to sync." : "Cloud sync not configured yet.");
  const [cloudBusy, setCloudBusy] = useState(false);
  const [showCloudPanel, setShowCloudPanel] = useState(false);
  const [autoCloudReady, setAutoCloudReady] = useState(false);
  const [cloudSyncActivity, setCloudSyncActivity] = useState("Idle");
  const [pullRefreshState, setPullRefreshState] = useState("idle");
  const [pullRefreshDistance, setPullRefreshDistance] = useState(0);

  const pullRefreshStartYRef = useRef(null);
  const pullRefreshArmedRef = useRef(false);
  const pullRefreshRunningRef = useRef(false);
  const lastSavedSnapshotRef = useRef("");
  const latestLocalCloudSnapshotRef = useRef("");
  const lastCloudUpdatedAtRef = useRef("");
  const isApplyingCloudRef = useRef(false);
  const lastAutoCloudPullAtRef = useRef(0);
  const autoCloudSyncInFlightRef = useRef(false);
  const lastLocalEditAtRef = useRef(0);
  const localEditGuardUntilRef = useRef(0);
  const localDirtyRef = useRef(false);
  const lastCloudCheckAtRef = useRef(0);
  const cloudAutoSaveTimerRef = useRef(null);

  useEffect(() => {
    if (!plannerLoaded) return;

    const markLocalEditGuard = (event) => {
      const target = event?.target;
      const tagName = String(target?.tagName || "").toLowerCase();
      const isEditable =
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        tagName === "button" ||
        Boolean(target?.closest?.("button,input,textarea,select,[role='button'],[role='checkbox']"));

      if (isEditable) {
        localEditGuardUntilRef.current = Date.now() + 3500;
      }
    };

    window.addEventListener("pointerdown", markLocalEditGuard, true);
    window.addEventListener("keydown", markLocalEditGuard, true);
    window.addEventListener("change", markLocalEditGuard, true);
    window.addEventListener("input", markLocalEditGuard, true);

    return () => {
      window.removeEventListener("pointerdown", markLocalEditGuard, true);
      window.removeEventListener("keydown", markLocalEditGuard, true);
      window.removeEventListener("change", markLocalEditGuard, true);
      window.removeEventListener("input", markLocalEditGuard, true);
    };
  }, [plannerLoaded]);

  useEffect(() => {
    if (!plannerLoaded) return;
    const nextSnapshotString = snapshotToCloudComparableString(getPlannerSnapshot());

    if (!latestLocalCloudSnapshotRef.current) {
      latestLocalCloudSnapshotRef.current = nextSnapshotString;
      return;
    }

    if (nextSnapshotString !== latestLocalCloudSnapshotRef.current) {
      latestLocalCloudSnapshotRef.current = nextSnapshotString;
      if (!isApplyingCloudRef.current && autoCloudReady && cloudSession?.user?.id) {
        localDirtyRef.current = true;
        lastLocalEditAtRef.current = Date.now();
        localEditGuardUntilRef.current = Math.max(localEditGuardUntilRef.current, Date.now() + 3500);
      }
    }
  }, [...snapshotDeps, plannerLoaded, autoCloudReady, cloudSession?.user?.id]);

  useEffect(() => {
    if (!plannerLoaded || !autoCloudReady || !cloudSession?.user?.id) return;
    if (pullRefreshRunningRef.current) return;
    if (!localDirtyRef.current || isApplyingCloudRef.current) return;

    if (cloudAutoSaveTimerRef.current) window.clearTimeout(cloudAutoSaveTimerRef.current);
    cloudAutoSaveTimerRef.current = window.setTimeout(async () => {
      if (pullRefreshRunningRef.current) return;
      if (!localDirtyRef.current || isApplyingCloudRef.current) return;
      const snapshotString = snapshotToCloudComparableString(getPlannerSnapshot());
      if (snapshotString === lastSavedSnapshotRef.current) {
        localDirtyRef.current = false;
        setCloudSyncActivity("Synced");
        return;
      }
      setCloudSyncActivity("Auto-saving...");
      await performCloudSave({ silent: true });
    }, 900);

    return () => {
      if (cloudAutoSaveTimerRef.current) window.clearTimeout(cloudAutoSaveTimerRef.current);
    };
  }, [...snapshotDeps, plannerLoaded, autoCloudReady, cloudSession?.user?.id]);

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
    latestLocalCloudSnapshotRef.current = "";
    lastCloudUpdatedAtRef.current = "";
    localDirtyRef.current = false;
    setCloudStatus("Signed out of cloud sync.");
  };

  const getCloudRecord = async () => {
    if (!supabase || !cloudSession?.user?.id) return { data: null, error: null };
    return supabase
      .from("or_planner_sync")
      .select("planner_data, updated_at")
      .eq("user_id", cloudSession.user.id)
      .maybeSingle();
  };

  const applyCloudPlannerData = (plannerData, updatedAt, activityLabel = "Synced") => {
    isApplyingCloudRef.current = true;
    applyPlannerSnapshot(plannerData);
    const pulledSnapshotString = snapshotToCloudComparableString(plannerData);
    lastSavedSnapshotRef.current = pulledSnapshotString;
    latestLocalCloudSnapshotRef.current = pulledSnapshotString;
    lastCloudUpdatedAtRef.current = updatedAt || new Date().toISOString();
    localDirtyRef.current = false;
    window.setTimeout(() => {
      isApplyingCloudRef.current = false;
      setAutoCloudReady(true);
    }, 400);
    setCloudSyncActivity(activityLabel);
  };

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
    const snapshotString = snapshotToCloudComparableString(snapshot);
    if (silent && snapshotString === lastSavedSnapshotRef.current) return;

    if (!silent) setCloudBusy(true);
    setCloudSyncActivity("Saving...");
    const savedAt = new Date().toISOString();
    const { error } = await supabase.from("or_planner_sync").upsert({
      user_id: cloudSession.user.id,
      planner_data: snapshot,
      updated_at: savedAt,
    }, { onConflict: "user_id" });
    if (!silent) setCloudBusy(false);

    if (error) {
      setCloudSyncActivity("Save failed");
      setCloudStatus(error.message);
      return;
    }

    lastSavedSnapshotRef.current = snapshotString;
    latestLocalCloudSnapshotRef.current = snapshotString;
    lastCloudUpdatedAtRef.current = savedAt;
    localDirtyRef.current = false;
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
    const { data, error } = await getCloudRecord();
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

    applyCloudPlannerData(data.planner_data, data.updated_at, "Synced");
    setCloudStatus(`Auto-pulled cloud data from ${data.updated_at ? new Date(data.updated_at).toLocaleString() : "cloud"}.`);
  };

  const saveToCloud = async () => performCloudSave({ silent: false });
  const pullFromCloud = async () => performCloudPull({ silent: false });

  const runPullToRefreshSync = async () => {
    if (pullRefreshRunningRef.current) return;
    if (!cloudSession?.user?.id) {
      setPullRefreshState("idle");
      setPullRefreshDistance(0);
      setCloudStatus("Sign in to Cloud Sync before pull-to-refresh can sync.");
      return;
    }

    pullRefreshRunningRef.current = true;
    setPullRefreshState("refreshing");
    setPullRefreshDistance(72);

    if (cloudAutoSaveTimerRef.current) {
      window.clearTimeout(cloudAutoSaveTimerRef.current);
      cloudAutoSaveTimerRef.current = null;
    }
    localDirtyRef.current = false;
    lastLocalEditAtRef.current = 0;
    localEditGuardUntilRef.current = 0;

    try {
      await performCloudPull({ silent: false });
    } finally {
      window.setTimeout(() => {
        pullRefreshRunningRef.current = false;
        setPullRefreshState("idle");
        setPullRefreshDistance(0);
      }, 450);
    }
  };

  const handlePullRefreshStart = (event) => {
    if (event.touches?.length !== 1) return;
    if (window.scrollY > 2) return;
    if (pullRefreshRunningRef.current) return;
    pullRefreshStartYRef.current = event.touches[0].clientY;
    pullRefreshArmedRef.current = true;
    setPullRefreshState("pulling");
  };

  const handlePullRefreshMove = (event) => {
    if (!pullRefreshArmedRef.current || pullRefreshStartYRef.current == null) return;
    if (window.scrollY > 2) {
      pullRefreshArmedRef.current = false;
      pullRefreshStartYRef.current = null;
      setPullRefreshState("idle");
      setPullRefreshDistance(0);
      return;
    }

    const distance = Math.max(0, event.touches[0].clientY - pullRefreshStartYRef.current);
    if (distance < 6) return;

    const dampedDistance = Math.min(96, Math.round(distance * 0.45));
    setPullRefreshDistance(dampedDistance);
    setPullRefreshState(distance >= 110 ? "ready" : "pulling");
  };

  const handlePullRefreshEnd = () => {
    if (!pullRefreshArmedRef.current) return;
    const shouldRefresh = pullRefreshState === "ready" || pullRefreshDistance >= 58;
    pullRefreshArmedRef.current = false;
    pullRefreshStartYRef.current = null;

    if (shouldRefresh) {
      runPullToRefreshSync();
    } else {
      setPullRefreshState("idle");
      setPullRefreshDistance(0);
    }
  };

  useEffect(() => {
    if (!plannerLoaded || !cloudSession?.user?.id) {
      setAutoCloudReady(false);
      return;
    }
    setAutoCloudReady(false);
    lastAutoCloudPullAtRef.current = Date.now();
    performCloudPull({ silent: true });
  }, [plannerLoaded, cloudSession?.user?.id]);

  useEffect(() => {
    if (!supabase || !plannerLoaded || !autoCloudReady || !cloudSession?.user?.id) return;

    const userId = cloudSession.user.id;
    const channel = supabase
      .channel(`or-planner-sync-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "or_planner_sync", filter: `user_id=eq.${userId}` },
        (payload) => {
          const incoming = payload?.new;
          if (!incoming?.planner_data) return;

          const localSnapshotString = snapshotToCloudComparableString(getPlannerSnapshot());
          const incomingSnapshotString = snapshotToCloudComparableString(incoming.planner_data);
          const localEditIsFresh = (localDirtyRef.current && Date.now() - lastLocalEditAtRef.current < 5000) || Date.now() < localEditGuardUntilRef.current;

          if (incomingSnapshotString === localSnapshotString) {
            lastSavedSnapshotRef.current = localSnapshotString;
            latestLocalCloudSnapshotRef.current = localSnapshotString;
            lastCloudUpdatedAtRef.current = incoming.updated_at || lastCloudUpdatedAtRef.current;
            setCloudSyncActivity("Synced");
            return;
          }

          if (localEditIsFresh) {
            setCloudSyncActivity("Local edit pending");
            return;
          }

          setCloudSyncActivity("Live sync...");
          applyCloudPlannerData(incoming.planner_data, incoming.updated_at, "Synced");
          setCloudStatus(`Live-synced cloud data at ${new Date().toLocaleTimeString()}.`);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [plannerLoaded, autoCloudReady, cloudSession?.user?.id]);

  useEffect(() => {
    if (!plannerLoaded || !autoCloudReady || !cloudSession?.user?.id) return;

    const runTwoSecondCloudSync = async () => {
      if (isApplyingCloudRef.current || autoCloudSyncInFlightRef.current) return;

      autoCloudSyncInFlightRef.current = true;
      try {
        const localSnapshotString = snapshotToCloudComparableString(getPlannerSnapshot());
        const localEditIsFresh = (localDirtyRef.current && Date.now() - lastLocalEditAtRef.current < 5000) || Date.now() < localEditGuardUntilRef.current;

        setCloudSyncActivity("Checking cloud...");
        const { data, error } = await getCloudRecord();
        lastCloudCheckAtRef.current = Date.now();

        if (error) {
          setCloudSyncActivity("Sync check failed");
          setCloudStatus(error.message);
          return;
        }

        if (data?.planner_data) {
          const cloudUpdatedAt = data.updated_at || "";
          const cloudSnapshotString = snapshotToCloudComparableString(data.planner_data);
          const cloudDiffersFromLocal = cloudSnapshotString !== localSnapshotString;

          if (cloudDiffersFromLocal) {
            if (localEditIsFresh) {
              setCloudSyncActivity("Local edit pending");
              return;
            }

            applyCloudPlannerData(data.planner_data, data.updated_at, "Synced");
            setCloudStatus(`Auto-pulled latest cloud data at ${new Date().toLocaleTimeString()}.`);
            return;
          }

          lastSavedSnapshotRef.current = localSnapshotString;
          latestLocalCloudSnapshotRef.current = localSnapshotString;
          lastCloudUpdatedAtRef.current = cloudUpdatedAt || lastCloudUpdatedAtRef.current;
          setCloudSyncActivity("Synced");
          return;
        }

        if (localEditIsFresh) {
          setCloudSyncActivity("Auto-saving...");
          await performCloudSave({ silent: true });
        } else {
          setCloudSyncActivity("Synced");
        }
      } finally {
        autoCloudSyncInFlightRef.current = false;
      }
    };

    const kickMobileCloudSync = () => runTwoSecondCloudSync();

    runTwoSecondCloudSync();
    const interval = window.setInterval(runTwoSecondCloudSync, 2000);
    const timeoutLoop = window.setTimeout(runTwoSecondCloudSync, 750);
    window.addEventListener("focus", kickMobileCloudSync);
    window.addEventListener("pageshow", kickMobileCloudSync);
    window.addEventListener("online", kickMobileCloudSync);
    window.addEventListener("touchstart", kickMobileCloudSync, { passive: true });
    window.addEventListener("pointerdown", kickMobileCloudSync, { passive: true });
    document.addEventListener("visibilitychange", kickMobileCloudSync);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeoutLoop);
      window.removeEventListener("focus", kickMobileCloudSync);
      window.removeEventListener("pageshow", kickMobileCloudSync);
      window.removeEventListener("online", kickMobileCloudSync);
      window.removeEventListener("touchstart", kickMobileCloudSync);
      window.removeEventListener("pointerdown", kickMobileCloudSync);
      document.removeEventListener("visibilitychange", kickMobileCloudSync);
    };
  }, [...snapshotDeps, plannerLoaded, autoCloudReady, cloudSession?.user?.id]);

  return {
    cloudSession,
    cloudEmail,
    setCloudEmail,
    cloudPassword,
    setCloudPassword,
    cloudStatus,
    cloudBusy,
    showCloudPanel,
    setShowCloudPanel,
    autoCloudReady,
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
  };
}
