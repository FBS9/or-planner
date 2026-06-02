import { useEffect, useState } from "react";
import { ALL_FACILITIES, buildEmptyRosters, compareCasesByTime, ensureRosterShape, getSurgeonSpecialty, isGrowthSpecialty, normalizeProcedureSearch, normalizeSurgeonSearch } from "@/lib/plannerData";
import { toDateKey } from "@/lib/plannerDates";

export function useSalesforceImport({
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
}) {
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
  const [sfRosterEditRowIds, setSfRosterEditRowIds] = useState([]);

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

  const sfFacilityTokens = (value = "") =>
    sfTokens(value).filter((token) => !["hospital", "medical", "center", "regional", "general", "the", "of", "and"].includes(token));

  const sfFacilityScore = (leftValue = "", rightValue = "") => {
    const left = normalizeSfKey(leftValue);
    const right = normalizeSfKey(rightValue);
    if (!left || !right) return 0;
    if (left === right) return 1;

    const leftCompact = left.replace(/\s+/g, "");
    const rightCompact = right.replace(/\s+/g, "");
    if (leftCompact === rightCompact) return 1;
    if (leftCompact.includes(rightCompact) || rightCompact.includes(leftCompact)) return 0.96;

    const leftTokens = new Set(sfFacilityTokens(left));
    const rightTokens = new Set(sfFacilityTokens(right));
    if (!leftTokens.size || !rightTokens.size) return sfSimilarityScore(left, right);

    const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
    const coverage = intersection / Math.min(leftTokens.size, rightTokens.size);
    const jaccard = intersection / new Set([...leftTokens, ...rightTokens]).size;

    return Math.max(sfSimilarityScore(left, right), coverage >= 1 ? 0.97 : jaccard);
  };

  const sfBestFacilityMatch = (facilityName = "") => {
    const visibleFacility = normalizeSfText(facilityName);
    if (!visibleFacility) return null;

    const ranked = sortedFacilities
      .map((facility) => ({ facility, score: sfFacilityScore(facility, visibleFacility) }))
      .filter((candidate) => candidate.score >= 0.86)
      .sort((a, b) => b.score - a.score || b.facility.length - a.facility.length);

    return ranked[0] || null;
  };

  const sfCanonicalFacilityName = (facilityName = "") => {
    const visibleFacility = normalizeSfText(facilityName);
    const match = sfBestFacilityMatch(visibleFacility);
    return match?.facility || visibleFacility;
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
    const rosterUsesLastNameOnly = leftTokens.length === 1 || rightTokens.length === 1;
    const firstCompatible =
      !leftFirst ||
      !rightFirst ||
      leftFirst === rightFirst ||
      leftFirst[0] === rightFirst[0];

    let nameStructureScore = 0;
    if (sameLast && firstCompatible) nameStructureScore = 0.97;
    else if (sameLast && rosterUsesLastNameOnly) nameStructureScore = 0.94;
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


  const sfAliasKey = (value = "") => normalizeSfKey(value || "");

  const sfGetSurgeonAlias = (facility = "", sourceSurgeonName = "") => {
    const facilityKey = sfAliasKey(facility);
    const sourceKey = sfAliasKey(sourceSurgeonName);
    if (!facilityKey || !sourceKey) return "";
    return sfSurgeonAliases?.[facilityKey]?.[sourceKey] || "";
  };

  const sfRememberSurgeonAlias = (facility = "", sourceSurgeonName = "", rosterSurgeonName = "") => {
    const facilityKey = sfAliasKey(facility);
    const sourceKey = sfAliasKey(sourceSurgeonName);
    const rosterName = normalizeSfText(rosterSurgeonName);
    if (!facilityKey || !sourceKey || !rosterName) return;

    setSfSurgeonAliases((prev) => ({
      ...(prev || {}),
      [facilityKey]: {
        ...((prev || {})[facilityKey] || {}),
        [sourceKey]: rosterName,
      },
    }));
  };

  const sfGetProcedureAlias = (sourceProcedure = "") => {
    const sourceKey = sfAliasKey(sourceProcedure);
    if (!sourceKey) return "";
    return sfProcedureAliases?.[sourceKey] || "";
  };

  const sfRememberProcedureAlias = (sourceProcedure = "", rosterProcedureName = "") => {
    const sourceKey = sfAliasKey(sourceProcedure);
    const procedureName = normalizeSfText(rosterProcedureName);
    if (!sourceKey || !procedureName) return;

    setSfProcedureAliases((prev) => ({
      ...(prev || {}),
      [sourceKey]: procedureName,
    }));
  };

  const sfBestRosterSurgeonMatch = (facility = "", surgeonName = "") => {
    const normalizedFacility = normalizeSfText(facility);
    const normalizedSurgeon = normalizeSfText(surgeonName);
    if (!normalizedFacility || !normalizedSurgeon) return null;

    const candidates = surgeonRosters[normalizedFacility] || [];
    const rememberedAlias = sfGetSurgeonAlias(normalizedFacility, normalizedSurgeon);
    if (rememberedAlias) {
      const aliasMatch = candidates.find((surgeon) => normalizeSurgeonSearch(surgeon?.name || "") === normalizeSurgeonSearch(rememberedAlias));
      if (aliasMatch) return { surgeon: aliasMatch, score: 1, alias: true };
    }

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
    const sourceSurgeon = normalizeSfText(row?.sourceSurgeonName || row?.surgeonCanonicalizedFrom || row?.surgeon);
    if (!facility || !surgeon) return row;

    const canonicalName = sfCanonicalSurgeonNameForFacility(facility, sourceSurgeon || surgeon);
    if (!canonicalName || canonicalName === surgeon) {
      return sourceSurgeon && !row?.sourceSurgeonName ? { ...row, sourceSurgeonName: sourceSurgeon } : row;
    }

    return {
      ...row,
      surgeon: canonicalName,
      rosterSurgeonName: canonicalName,
      rosterSurgeonSubspecialty: getSubspecialty(surgeonRosters, facility, canonicalName) || row.rosterSurgeonSubspecialty || row.category || "",
      surgeonCanonicalizedFrom: sourceSurgeon || surgeon,
      sourceSurgeonName: sourceSurgeon || surgeon,
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

    const rememberedAlias = sfGetProcedureAlias(normalizedProcedure);
    if (rememberedAlias && !isProcedureHiddenFromRoster(rememberedAlias)) {
      return { procedure: rememberedAlias, count: 999, score: 1, alias: true };
    }

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

  const sfProcedureRosterMatchForRow = (row, sourceCasesByDate = casesByDate) => {
    const procedure = normalizeSfText(row?.procedure);
    if (!procedure) return null;

    const facility = normalizeSfText(row?.facility);
    const surgeon = normalizeSfText(row?.surgeon);
    const specialty = normalizeSfText(row?.rosterSurgeonSubspecialty || row?.category || getSurgeonSpecialty(surgeonRosters, facility, surgeon));
    return sfBestExistingProcedureMatch(procedure, facility, surgeon, specialty, sourceCasesByDate);
  };

  const sfCanonicalProcedureNameForRow = (row, sourceCasesByDate = casesByDate) => {
    const procedure = normalizeSfText(row?.procedure);
    if (!procedure) return "";
    const match = sfProcedureRosterMatchForRow(row, sourceCasesByDate);
    return match?.procedure || procedure;
  };

  const sfCanonicalizeProcedureForRow = (row, sourceCasesByDate = casesByDate) => {
    const procedure = normalizeSfText(row?.procedure);
    if (!procedure) {
      if (!row?.procedureRosterMatchedName && !row?.procedureCanonicalizedFrom) return row;
      return { ...row, procedureRosterMatchedName: "", procedureCanonicalizedFrom: "" };
    }

    const match = sfProcedureRosterMatchForRow(row, sourceCasesByDate);
    if (!match?.procedure) {
      if (!row?.procedureRosterMatchedName && !row?.procedureCanonicalizedFrom) return row;
      return { ...row, procedureRosterMatchedName: "", procedureCanonicalizedFrom: "" };
    }

    const canonicalProcedure = match.procedure;
    const sameProcedure = normalizeProcedureSearch(canonicalProcedure) === normalizeProcedureSearch(procedure);

    return {
      ...row,
      procedure: canonicalProcedure,
      sourceProcedureName: row?.sourceProcedureName || procedure,
      procedureRosterMatchedName: canonicalProcedure,
      procedureCanonicalizedFrom: sameProcedure ? "" : (row?.sourceProcedureName || procedure),
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
      const canonicalFacility = sfCanonicalFacilityName(visibleFacility);
      return {
        facility: canonicalFacility,
        facilityOptions: [],
        facilitySource: canonicalFacility !== visibleFacility ? "matched_facility_roster" : "salesforce",
        facilityCanonicalizedFrom: canonicalFacility !== visibleFacility ? visibleFacility : "",
      };
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


  const sfSelectExistingSurgeonForRow = (row, rosterSurgeonName) => {
    const facility = normalizeSfText(row?.facility);
    const canonicalName = normalizeSfText(rosterSurgeonName);
    const sourceSurgeon = normalizeSfText(row?.sourceSurgeonName || row?.surgeonCanonicalizedFrom || row?.surgeon);
    if (!facility || !canonicalName || !sourceSurgeon) return;

    const rosterEntry = (surgeonRosters[facility] || []).find((surgeon) => normalizeSurgeonSearch(surgeon?.name || "") === normalizeSurgeonSearch(canonicalName));
    if (!rosterEntry) return;

    sfRememberSurgeonAlias(facility, sourceSurgeon, rosterEntry.name);
    updateSalesforceRow(row.id, {
      surgeon: rosterEntry.name,
      rosterSurgeonName: rosterEntry.name,
      rosterSurgeonSubspecialty: rosterEntry.subspecialty || row?.rosterSurgeonSubspecialty || row?.category || "",
      surgeonCanonicalizedFrom: sourceSurgeon,
      sourceSurgeonName: sourceSurgeon,
      actionManuallyEdited: false,
    });
    setSfApplySummary(`Remembered ${sourceSurgeon} as ${rosterEntry.name} for ${facility}. Future Salesforce imports will use that roster name.`);
  };

  const sfProcedureRosterOptionsForRow = (row) => {
    const facility = normalizeSfText(row?.facility);
    const surgeon = normalizeSfText(row?.surgeon);
    const specialty = normalizeProcedureSearch(row?.rosterSurgeonSubspecialty || row?.category || getSurgeonSpecialty(surgeonRosters, facility, surgeon));

    const scored = procedureRosterItems
      .map((item) => {
        const itemSpecialty = normalizeProcedureSearch(item.specialty || "");
        const sameSpecialty = specialty && itemSpecialty && specialty === itemSpecialty;
        const score = sfProcedureScore(item.procedure, row?.sourceProcedureName || row?.procedure || "");
        return { ...item, sameSpecialty, score };
      })
      .filter((item) => item.procedure && !isProcedureHiddenFromRoster(item.procedure))
      .sort((a, b) => {
        if (a.sameSpecialty !== b.sameSpecialty) return a.sameSpecialty ? -1 : 1;
        if (b.score !== a.score) return b.score - a.score;
        if (b.count !== a.count) return b.count - a.count;
        return a.procedure.localeCompare(b.procedure);
      });

    const seen = new Set();
    return scored.filter((item) => {
      const key = normalizeProcedureSearch(item.procedure);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 60);
  };

  const sfSelectExistingProcedureForRow = (row, rosterProcedureName) => {
    const canonicalProcedure = normalizeSfText(rosterProcedureName);
    const sourceProcedure = normalizeSfText(row?.sourceProcedureName || row?.procedureCanonicalizedFrom || row?.procedure);
    if (!canonicalProcedure || !sourceProcedure) return;

    sfRememberProcedureAlias(sourceProcedure, canonicalProcedure);
    updateSalesforceRow(row.id, {
      procedure: canonicalProcedure,
      sourceProcedureName: sourceProcedure,
      procedureRosterMatchedName: canonicalProcedure,
      procedureCanonicalizedFrom: normalizeProcedureSearch(canonicalProcedure) === normalizeProcedureSearch(sourceProcedure) ? "" : sourceProcedure,
      actionManuallyEdited: false,
    });
    setSfApplySummary(`Remembered ${sourceProcedure} as procedure roster item ${canonicalProcedure}. Future Salesforce imports will use that procedure name.`);
  };

  const sfSelectOneTimeProcedureForRow = (row, rosterProcedureName) => {
    const canonicalProcedure = normalizeSfText(rosterProcedureName);
    if (!row?.id || !canonicalProcedure) return;

    updateSalesforceRow(row.id, {
      procedure: canonicalProcedure,
      procedureRosterMatchedName: canonicalProcedure,
      procedureCanonicalizedFrom: "",
      actionManuallyEdited: false,
    });
    setSfApplySummary(`Selected ${canonicalProcedure} for this Salesforce row only. Blank Salesforce procedure rows will not learn an automatic procedure alias.`);
  };

  const sfAddOneTimeProcedureForRow = (row) => {
    const procedure = normalizeSfText(row?.newProcedureRosterName);
    if (!row?.id || !procedure) return;

    const specialty = normalizeSfText(
      row?.newProcedureRosterSpecialty ||
      row?.rosterSurgeonSubspecialty ||
      row?.category ||
      getSurgeonSpecialty(surgeonRosters, row?.facility, row?.surgeon) ||
      "Unassigned"
    ) || "Unassigned";

    const key = `${normalizeProcedureSearch(specialty)}::${normalizeProcedureSearch(procedure)}`;
    setManualProcedureRosterItems((prev) => {
      const existing = new Set((prev || []).map((item) => `${normalizeProcedureSearch(item?.specialty || "Unassigned")}::${normalizeProcedureSearch(item?.procedure || "")}`));
      if (existing.has(key)) return prev;
      return [...(prev || []), { procedure, specialty }];
    });
    setProcedureExclusions((prev) => (prev || []).filter((entry) => normalizeProcedureSearch(typeof entry === "string" ? entry : entry?.procedure) !== normalizeProcedureSearch(procedure)));

    updateSalesforceRow(row.id, {
      procedure,
      procedureRosterMatchedName: procedure,
      procedureCanonicalizedFrom: "",
      newProcedureRosterName: "",
      newProcedureRosterSpecialty: specialty,
      actionManuallyEdited: false,
    });
    setSfApplySummary(`Added ${procedure} to the ${specialty} procedure roster and selected it for this row only.`);
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
    } else if (mode === "scheduled") {
      // Scheduled Procedures screenshots are future schedule imports.
      // A duplicate requires an exact time match. Same date/facility/surgeon/procedure
      // at a different time is a different scheduled case and should import as new FT.
      if (identityMatches && hasBothTimes && timeDiff === 0 && score >= 80) {
        status = "Match";
      } else if (identityMatches && !hasBothTimes && score >= 65) {
        status = "Possible Match";
      } else {
        status = "No Match";
      }
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

  const sfResolveRowReviewState = (baseRow, screenshotType, reservedPlannerCaseIds = new Set()) => {
    const suggestedAction = sfSuggestedAction(baseRow, screenshotType);
    const screenshotKey = normalizeSfKey(screenshotType);
    const recommendedKey = normalizeSfKey(baseRow.recommendedAction);
    const isScheduledProceduresRow = screenshotKey.includes("scheduled procedures") || recommendedKey.includes("import new fast tracking");
    const matchMode = isScheduledProceduresRow ? "scheduled" : suggestedAction === "markReconciled" ? "reconcile" : "normal";
    const matches = sfGetPlannerMatches(baseRow, matchMode).filter((match) => !reservedPlannerCaseIds.has(match.plannerCase.id));
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
      matchedPlannerCaseId: bestMatch?.status === "Match" ? bestMatch.plannerCase.id : "",
    };
  };

  const sfPlannerCaseIdUsedByRow = (row) => {
    if (!row) return "";
    if (row.selectedPlannerCaseId) return row.selectedPlannerCaseId;
    if (row.matchedPlannerCaseId) return row.matchedPlannerCaseId;
    return "";
  };

  const sfGetReservedPlannerCaseIds = (exceptRowId = "") => {
    const reserved = new Set();

    (sfExtractedCases || []).forEach((row) => {
      if (!row || row.id === exceptRowId) return;
      const plannerCaseId = sfPlannerCaseIdUsedByRow(row);
      if (plannerCaseId) reserved.add(plannerCaseId);
    });

    return reserved;
  };

  const sfResolveRowsWithUniquePlannerMatches = (rows, screenshotType) => {
    // Manual choices should win. Reserve them before auto-matching the rest of
    // the Salesforce rows so one OR Planner case cannot be reused elsewhere.
    const reservedPlannerCaseIds = new Set(
      (rows || [])
        .filter((row) => row?.actionManuallyEdited && row?.selectedPlannerCaseId)
        .map((row) => row.selectedPlannerCaseId)
    );

    return rows.map((row) => {
      if (row.actionManuallyEdited) {
        const plannerCaseId = sfPlannerCaseIdUsedByRow(row);
        if (plannerCaseId) reservedPlannerCaseIds.add(plannerCaseId);
        return row;
      }

      const resolved = sfResolveRowReviewState(row, screenshotType, reservedPlannerCaseIds);
      const updated = { ...row, ...resolved };

      // One existing OR Planner case can only satisfy one Salesforce row.
      // This prevents two Salesforce rows from sharing the same matched case
      // in badges, actions, or manual matching dropdowns during this review.
      const plannerCaseId = sfPlannerCaseIdUsedByRow(updated);
      if (plannerCaseId) {
        reservedPlannerCaseIds.add(plannerCaseId);
      }

      return updated;
    });
  };

  const sfInferFacilityForAccountSnippetRows = (rows, screenshotType) => {
    const screenshotKey = normalizeSfKey(screenshotType);
    if (!screenshotKey.includes("account procedure history")) return rows;

    const fixedFacilities = Array.from(new Set((rows || [])
      .filter((row) => row.facility && row.facilitySource !== "surgeon_roster_multiple")
      .map((row) => row.facility)
      .filter(Boolean)));

    if (fixedFacilities.length !== 1) return rows;

    const inferredFacility = fixedFacilities[0];

    return rows.map((row) => {
      if (row.facility) return row;
      const options = Array.isArray(row.facilityOptions) ? row.facilityOptions : [];
      if (!options.includes(inferredFacility)) return row;
      return {
        ...row,
        facility: inferredFacility,
        facilitySource: "batch_inferred_account",
        facilityCanonicalizedFrom: "",
      };
    });
  };

  const sfPrepareRows = (rows, screenshotType) => {
    const baseRows = rows.map((item, index) => {
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
        facilityCanonicalizedFrom: facilityResolution.facilityCanonicalizedFrom || "",
        category: normalizeSfText(item.category),
        procedure: normalizeSfText(item.procedure),
        sourceProcedureName: normalizeSfText(item.procedure),
        procedureWasBlankInSalesforce: !normalizeSfText(item.procedure),
        surgeon,
        sourceSurgeonName: surgeon,
        rosterSurgeonName: surgeon,
        rosterSurgeonSubspecialty: normalizeSfText(item.category),
        scheduledDate: normalizeSfText(item.scheduledDate),
        salesforceStatus: normalizeSfText(item.salesforceStatus),
        recommendedAction: normalizeSfText(item.recommendedAction),
        confidence: normalizeSfText(item.confidence || "Medium"),
        notes: normalizeSfText(item.notes),
        actionManuallyEdited: false,
      };

      return sfCanonicalizeProcedureForRow(sfCanonicalizeSurgeonForRow(rawBaseRow));
    });

    const facilityResolvedRows = sfInferFacilityForAccountSnippetRows(baseRows, screenshotType);
    return sfResolveRowsWithUniquePlannerMatches(facilityResolvedRows, screenshotType);
  };

  useEffect(() => {
    if (!sfExtractedCases.length || !sfScreenshotType) return;

    setSfExtractedCases((prev) => {
      let changed = false;

      const next = sfResolveRowsWithUniquePlannerMatches(prev, sfScreenshotType).map((updated, index) => {
        const item = prev[index];

        if (
          updated.action !== item.action ||
          updated.selectedPlannerCaseId !== item.selectedPlannerCaseId ||
          updated.matchStatus !== item.matchStatus ||
          updated.matchScore !== item.matchScore ||
          updated.matchedPlannerCaseId !== item.matchedPlannerCaseId ||
          JSON.stringify(updated.matchReasons || []) !== JSON.stringify(item.matchReasons || [])
        ) {
          changed = true;
        }

        return updated;
      });

      return changed ? next : prev;
    });
  }, [casesByDate, sfScreenshotType, sfExtractedCases.length]);

  const sfEffectiveRow = (item) => item;

  const updateSalesforceRow = (id, patch) => {
    const manuallyEdited = Object.prototype.hasOwnProperty.call(patch, "action");
    const selectedFacility = Object.prototype.hasOwnProperty.call(patch, "facility") ? normalizeSfText(patch.facility) : "";
    const isAccountHistoryImport = normalizeSfKey(sfScreenshotType).includes("account procedure history");

    setSfExtractedCases((prev) => {
      const patchedRows = prev.map((item) => {
        const shouldPatchThisRow = item.id === id;
        const options = Array.isArray(item.facilityOptions) ? item.facilityOptions : [];
        const shouldBatchPatchFacility = Boolean(
          !shouldPatchThisRow &&
          isAccountHistoryImport &&
          selectedFacility &&
          options.includes(selectedFacility) &&
          (!item.facility || item.facilitySource === "surgeon_roster_multiple")
        );

        if (!shouldPatchThisRow && !shouldBatchPatchFacility) return item;

        const rowPatch = shouldBatchPatchFacility
          ? { facility: selectedFacility, facilitySource: "batch_selected_account", facilityCanonicalizedFrom: "" }
          : patch;

        const rawPatched = {
          ...item,
          ...rowPatch,
          actionManuallyEdited: shouldPatchThisRow && manuallyEdited ? true : item.actionManuallyEdited,
        };

        return sfCanonicalizeProcedureForRow(sfCanonicalizeSurgeonForRow(rawPatched));
      });

      return sfResolveRowsWithUniquePlannerMatches(patchedRows, sfScreenshotType);
    });
    setSfApplySummary("");
  };

  const toggleSfRosterEditRow = (rowId) => {
    setSfRosterEditRowIds((prev) => prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]);
  };

  const getSfPlannerCaseOptions = (sfCase) => {
    const mode = sfCase.action === "markReconciled" ? "reconcile" : "normal";
    const reservedByOtherRows = sfGetReservedPlannerCaseIds(sfCase.id);
    const currentSelectedId = sfCase.selectedPlannerCaseId || "";
    const removeUsedByOtherRows = (matches) =>
      matches.filter((match) => !reservedByOtherRows.has(match.plannerCase.id) || match.plannerCase.id === currentSelectedId);

    const matches = removeUsedByOtherRows(sfGetPlannerMatches(sfCase, mode));

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


  return {
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
  };
}
