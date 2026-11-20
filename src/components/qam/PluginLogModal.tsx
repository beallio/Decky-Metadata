import { ConfirmModal, Focusable, ScrollPanelGroup } from "@decky/ui";

import { useT } from "../../i18n";

type PluginLogModalProps = {
  logs: string;
  closeModal: () => void;
};

export function PluginLogModal({ logs, closeModal }: PluginLogModalProps) {
  const t = useT();

  return (
    <ConfirmModal
      bAlertDialog={true}
      strTitle={t("qam.logs.modalTitle")}
      strOKButtonText={t("qam.logs.ok")}
      onOK={closeModal}
      onCancel={closeModal}
      onEscKeypress={closeModal}
      closeModal={closeModal}
    >
      <ScrollPanelGroup>
        <Focusable
          noFocusRing
          style={{
            maxHeight: "60vh",
            overflowY: "auto",
            fontFamily: "monospace",
            fontSize: "12px",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            padding: "10px",
            borderRadius: "4px",
            userSelect: "text",
          }}
        >
          {logs || t("qam.logs.modalEmpty")}
        </Focusable>
      </ScrollPanelGroup>
    </ConfirmModal>
  );
}
