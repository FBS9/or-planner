import { Button } from "@/components/ui/button";
import { formatShortDate } from "@/lib/plannerDates";

export function SalesforceImportPanel(props) {
  const {
    showSalesforceImport,
    resetSalesforceImport,
    setShowSalesforceImport,
    sfFile,
    handleSalesforceFileChange,
    sfPreviewUrl,
    sfScreenshotType,
    sfAccountName,
    extractSalesforceCases,
    sfLoading,
    sfError,
    sfApplySummary,
    sfExtractedCases,
    applySalesforceRowsToPlanner,
    sfEffectiveRow,
    sfActionBadgeClass,
    sfActionLabel,
    sfMatchBadgeClass,
    sfMatchLabel,
    sortedFacilities,
    updateSalesforceRow,
    sfSurgeonExistsInFacility,
    sfSurgeonFacilityOptions,
    sfSelectExistingSurgeonForRow,
    sfProcedureRosterOptionsForRow,
    sfSelectExistingProcedureForRow,
    sfSelectOneTimeProcedureForRow,
    sfAddOneTimeProcedureForRow,
    sfAddSurgeonToRosterFromRow,
    sfGetPlannerMatches,
    getSfPlannerCaseOptions,
    setShowSfMobileReference,
    setShowSfDesktopReference,
  } = props;

  return (
    <>
      {showSalesforceImport && (
        <div className="fixed inset-0 z-50 flex bg-slate-950/50 p-0 backdrop-blur-sm md:items-center md:justify-center md:p-6">
          <div className="flex h-full w-full flex-col overflow-hidden bg-slate-50 shadow-2xl md:h-[88vh] md:max-w-5xl md:rounded-3xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 md:px-6">
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-wide text-blue-600">Salesforce Import</div>
                <h2 className="mt-1 text-xl font-bold text-slate-900 md:text-2xl">AI screenshot extraction</h2>
                <div className="mt-1 text-xs font-bold text-slate-400">SF Import logic v5b · share FT screenshot</div>
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
                        const surgeonRosterOptions = item.facility ? (surgeonRosters[item.facility] || []) : [];
                        const procedureRosterOptions = sfProcedureRosterOptionsForRow(item);
                        const selectedSurgeonIsInRoster = surgeonRosterOptions.some((surgeon) => normalizeSurgeonSearch(surgeon?.name || "") === normalizeSurgeonSearch(item.surgeon || ""));
                        const selectedProcedureIsInRoster = procedureRosterOptions.some((procedureItem) => normalizeProcedureSearch(procedureItem.procedure) === normalizeProcedureSearch(item.procedure || ""));
                        const needsMissingSurgeonPrompt = Boolean(item.surgeon && item.facility && !sfSurgeonExistsInFacility(item.facility, item.surgeon));
                        const isScheduledProcedureRow = normalizeSfKey(sfScreenshotType).includes("scheduled procedures") || normalizeSfKey(item.recommendedAction).includes("import new fast tracking");
                        const needsBlankScheduledProcedurePicker = Boolean(isScheduledProcedureRow && item.procedureWasBlankInSalesforce);
                        const rosterEditOpen = needsMissingSurgeonPrompt || needsBlankScheduledProcedurePicker || sfRosterEditRowIds.includes(item.id);
                        const canEditRosterMapping = Boolean((item.facility && item.surgeon && surgeonRosterOptions.length > 0) || (item.procedure && procedureRosterOptions.length > 0) || needsBlankScheduledProcedurePicker);
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
                              {item.facilitySource === "matched_facility_roster" && item.facilityCanonicalizedFrom && <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">matched facility roster: {item.facilityCanonicalizedFrom}</span>}
                              {item.facilitySource === "batch_inferred_account" && <span className="ml-2 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-bold text-green-700">inferred from account list</span>}
                              {item.facilitySource === "batch_selected_account" && <span className="ml-2 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-bold text-green-700">applied to account list</span>}
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
                              {item.procedureRosterMatchedName && (
                                <span className="ml-2 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-bold text-green-700">matched procedure roster: {item.procedureRosterMatchedName}</span>
                              )}
                              {item.procedureCanonicalizedFrom && item.procedureCanonicalizedFrom !== item.procedure && (
                                <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">from Salesforce: {item.procedureCanonicalizedFrom}</span>
                              )}
                            </div>
                            {(item.scheduledDate || item.salesforceStatus) && (
                              <div className="md:col-span-2">
                                <span className="font-bold">Salesforce:</span> Scheduled {item.scheduledDate || "—"} · Status {item.salesforceStatus || "—"}
                              </div>
                            )}
                          </div>

                          {canEditRosterMapping && !needsMissingSurgeonPrompt && (
                            <div className="mt-3 flex justify-end">
                              <button
                                type="button"
                                onClick={() => toggleSfRosterEditRow(item.id)}
                                className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200"
                              >
                                {rosterEditOpen ? "Done editing surgeon/procedure" : "Edit surgeon/procedure match"}
                              </button>
                            </div>
                          )}

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

                            {rosterEditOpen && item.facility && item.surgeon && surgeonRosterOptions.length > 0 && (
                              <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-500">Use saved surgeon</span>
                                <select
                                  value={selectedSurgeonIsInRoster ? item.surgeon : ""}
                                  onChange={(event) => sfSelectExistingSurgeonForRow(item, event.target.value)}
                                  className="input bg-white"
                                >
                                  <option value="">Choose roster surgeon</option>
                                  {surgeonRosterOptions.map((surgeon) => (
                                    <option key={`${item.id}-surgeon-${surgeon.name}`} value={surgeon.name}>{surgeon.name}{surgeon.subspecialty ? ` · ${surgeon.subspecialty}` : ""}</option>
                                  ))}
                                </select>
                                {!selectedSurgeonIsInRoster && (
                                  <span className="mt-1 block text-[11px] font-semibold text-slate-500">Selecting one remembers this Salesforce name for future imports.</span>
                                )}
                              </label>
                            )}

                            {rosterEditOpen && (item.procedure || needsBlankScheduledProcedurePicker) && procedureRosterOptions.length > 0 && (
                              <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-500">Use saved procedure</span>
                                <select
                                  value={selectedProcedureIsInRoster ? item.procedure : ""}
                                  onChange={(event) => needsBlankScheduledProcedurePicker ? sfSelectOneTimeProcedureForRow(item, event.target.value) : sfSelectExistingProcedureForRow(item, event.target.value)}
                                  className="input bg-white"
                                >
                                  <option value="">Choose procedure roster item</option>
                                  {procedureRosterOptions.map((procedureItem) => (
                                    <option key={`${item.id}-procedure-${procedureItem.specialty}-${procedureItem.procedure}`} value={procedureItem.procedure}>{procedureItem.procedure}{procedureItem.specialty ? ` · ${procedureItem.specialty}` : ""}</option>
                                  ))}
                                </select>
                                {needsBlankScheduledProcedurePicker ? (
                                  <span className="mt-1 block text-[11px] font-semibold text-slate-500">Salesforce left this procedure blank. This selection is for this row only and will not be remembered as a blank-procedure alias.</span>
                                ) : !selectedProcedureIsInRoster && (
                                  <span className="mt-1 block text-[11px] font-semibold text-slate-500">Selecting one remembers this Salesforce procedure wording for future imports.</span>
                                )}
                              </label>
                            )}

                            {rosterEditOpen && needsBlankScheduledProcedurePicker && (
                              <div className="rounded-2xl bg-white p-3 text-xs ring-1 ring-slate-200 md:col-span-2">
                                <div className="font-bold text-slate-700">Add new procedure for this row</div>
                                <div className="mt-1 text-slate-500">Use this when the procedure was blank in Salesforce but you know what case it should be. It adds the procedure to your roster, but does not teach the app that blank means this procedure.</div>
                                <div className="mt-3 grid gap-2 md:grid-cols-[1fr_220px_auto] md:items-end">
                                  <label className="block">
                                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Procedure name</span>
                                    <input
                                      value={item.newProcedureRosterName || ""}
                                      onChange={(event) => updateSalesforceRow(item.id, { newProcedureRosterName: event.target.value })}
                                      placeholder="Example: Paraesophageal"
                                      className="input bg-white text-sm"
                                    />
                                  </label>
                                  <label className="block">
                                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Specialty</span>
                                    <input
                                      value={item.newProcedureRosterSpecialty || item.rosterSurgeonSubspecialty || item.category || getSurgeonSpecialty(surgeonRosters, item.facility, item.surgeon) || ""}
                                      onChange={(event) => updateSalesforceRow(item.id, { newProcedureRosterSpecialty: event.target.value })}
                                      placeholder="Ex: General Surgeon"
                                      className="input bg-white text-sm"
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => sfAddOneTimeProcedureForRow(item)}
                                    disabled={!normalizeSfText(item.newProcedureRosterName)}
                                    className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Add + Use
                                  </button>
                                </div>
                              </div>
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

                            {needsMissingSurgeonPrompt && (
                              <div className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-100 md:col-span-2">
                                <div className="font-bold">Surgeon not in this facility roster</div>
                                <div className="mt-1">
                                  {item.surgeon} is not currently saved under {item.facility}. Choose an existing roster surgeon above if this is a Salesforce naming variation, or confirm how you want the surgeon saved before applying.
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
        </div>
      )}
    </>
  );
}

export function SalesforceScreenshotModal(props) {
  const { sfPreviewUrl, showSfMobileReference, showSfDesktopReference, sfFile, setShowSfMobileReference, setShowSfDesktopReference } = props;
  return (
    <>
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

              <div className="min-h-0 flex-1 overflow-hidden rounded-3xl bg-white p-3">
                <img
                  src={sfPreviewUrl}
                  alt="Salesforce screenshot enlarged desktop reference"
                  className="h-full max-h-full w-full max-w-full rounded-2xl object-contain"
                />
              </div>
            </div>
          )}


    </>
  );
}
