"use client";

// §14.3: export as PDF on demand — uses the browser's print-to-PDF.
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-secondary">
      Export PDF
    </button>
  );
}
