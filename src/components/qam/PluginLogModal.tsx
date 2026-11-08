import { ConfirmModal } from "@decky/ui";
import { t } from "../../i18n";

type PluginLogModalProps = {
  logs: string;
  closeModal: () => void;
};

export function PluginLogModal({ logs, closeModal }: PluginLogModalProps) {
  return (
    <ConfirmModal
      bAlertDialog={true}
      strTitle={t("qam.logs.modalTitle")}
      strOKButtonText={t("common.ok")}
      onOK={closeModal}
      onCancel={closeModal}
      onEscKeypress={closeModal}
      closeModal={closeModal}
    >
      <div
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
        {logs || t("qam.logs.empty")}
      </div>
    </ConfirmModal>
  );
}
