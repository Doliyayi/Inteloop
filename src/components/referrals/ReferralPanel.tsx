"use client";

import { useState } from "react";

type Props = {
  link: string;
  signups: number;
  conversions: number;
};

export function ReferralPanel({ link, signups, conversions }: Props) {
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-base font-semibold text-neutral-950">Refer a friend</h2>
        <p className="mt-0.5 text-sm text-neutral-500">
          Share your link — every person you refer helps support the product.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          readOnly
          value={link}
          className="field-input flex-1 font-mono text-xs"
          onFocus={(e) => e.target.select()}
        />
        <button type="button" onClick={copyLink} className="btn-secondary shrink-0 px-4 py-2">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      <div className="flex gap-6 text-sm text-neutral-600">
        <span>
          <span className="font-semibold text-neutral-950">{signups}</span> signed up
        </span>
        <span>
          <span className="font-semibold text-neutral-950">{conversions}</span> converted
        </span>
      </div>
    </section>
  );
}
