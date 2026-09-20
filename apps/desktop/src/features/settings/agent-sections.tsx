import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentInstructionFile } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Button } from "../../components/ui";
import { SettingsCard } from "./primitives";

export function AgentInstructionsSection() {
  const { t } = useTranslation();
  const [global, setGlobal] = useState<AgentInstructionFile | null>(null);
  const [globalDraft, setGlobalDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api.getAgentInstructions().then((result) => {
      if (cancelled) return;
      setGlobal(result.global);
      setGlobalDraft(result.global.content);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const result = await api.saveAgentInstructions("global", globalDraft);
      setGlobal(result.file);
    } finally {
      setSaving(false);
    }
  };

  const globalDirty = global !== null && globalDraft !== global.content;
  return (
    <div className="settings-stack">
      <SettingsCard title={t("settings.instructionsGlobal")}>
        <div className="settings-form-grid">
          <div className="settings-row-copy">
            <div className="settings-row-desc">{t("settings.instructionsGlobalDesc")}</div>
            <div className="settings-instruction-path">{global?.path ?? ""}</div>
          </div>
          <textarea
            className="field-textarea settings-instruction-editor"
            value={globalDraft}
            onChange={(event) => setGlobalDraft(event.target.value)}
            aria-label={t("settings.instructionsGlobal")}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
        </div>
        <div className="settings-panel-actions">
          <Button
            variant="primary"
            disabled={!globalDirty || saving}
            onClick={() => void save()}
          >
            {saving ? t("settings.saving") : t("settings.instructionsSave")}
          </Button>
        </div>
      </SettingsCard>
    </div>
  );
}
