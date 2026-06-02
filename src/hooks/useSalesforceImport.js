import { useState } from "react";

export function useSalesforceImport() {
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

  return {
    showSfMobileReference,
    setShowSfMobileReference,
    showSfDesktopReference,
    setShowSfDesktopReference,
    sfFile,
    setSfFile,
    sfPreviewUrl,
    setSfPreviewUrl,
    sfLoading,
    setSfLoading,
    sfError,
    setSfError,
    sfScreenshotType,
    setSfScreenshotType,
    sfAccountName,
    setSfAccountName,
    sfExtractedCases,
    setSfExtractedCases,
    sfApplySummary,
    setSfApplySummary,
  };
}
