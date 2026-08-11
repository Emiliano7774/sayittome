"use client";

import { useEffect, useState } from "react";

import {
  exportAuthorshipCorrections,
  listAuthorshipCorrections,
  setAuthorshipCorrection,
} from "@/lib/chat/authorshipCorrections";
import { readAuthorshipIncidentReports } from "@/lib/chat/authorshipIncident";

export default function AuthorshipCorrectionPanel() {
  const [marks, setMarks] = useState(listAuthorshipCorrections());
  const [copied, setCopied] = useState(false);
  const reports = readAuthorshipIncidentReports();
  const latest = reports[0];
  const rows = latest?.rows || [];

  useEffect(() => {
    setMarks(listAuthorshipCorrections());
  }, [latest?.t]);

  return (
    <div style={{ marginTop: 8, borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: 8 }}>
      <div style={{ fontWeight: 700 }}>authorship marks</div>
      <div style={{ opacity: 0.75 }}>
        Históricos ambiguos: marcá mío/suyo. No escribe Firestore.
      </div>
      {rows.slice(0, 8).map((row) => {
        const mark = marks.find((item) => item.messageId === row.messageId);
        return (
          <div key={row.messageId} style={{ marginTop: 6 }}>
            <div>
              {row.messageId.slice(-8)} {row.fromShape} mine={String(row.isMine)}
            </div>
            <button
              type="button"
              onClick={() => {
                setAuthorshipCorrection(row.messageId, true);
                setMarks(listAuthorshipCorrections());
              }}
              style={{ marginRight: 4 }}
            >
              mío{mark?.mine === true ? "*" : ""}
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthorshipCorrection(row.messageId, false);
                setMarks(listAuthorshipCorrections());
              }}
            >
              suyo{mark?.mine === false ? "*" : ""}
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard
            .writeText(JSON.stringify(exportAuthorshipCorrections()))
            .then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            });
        }}
        style={{ marginTop: 6, width: "100%" }}
      >
        {copied ? "Marcas copiadas" : "Exportar marcas (sin PII)"}
      </button>
    </div>
  );
}
