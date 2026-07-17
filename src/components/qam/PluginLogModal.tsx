import { ConfirmModal } from "@decky/ui";

type PluginLogModalProps = {
  logs: string;
  closeModal: () => void;
};

export function PluginLogModal({ logs, closeModal }: PluginLogModalProps) {
  return (
    <ConfirmModal
      bAlertDialog={true}
      strTitle="Plugin Logs"
      strOKButtonText="OK"
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
        {logs || "No recent logs"}
      </div>
    </ConfirmModal>
  );
}
