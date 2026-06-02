export function SalesforceScreenshotReference(props) {
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
