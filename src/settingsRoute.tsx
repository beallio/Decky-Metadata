import { DialogButton, Focusable, Navigation, staticClasses } from "@decky/ui";
import { FaGear } from "react-icons/fa6";
import { useT } from "./i18n";

// Not "/decky-metadata/settings": that matches the editor route "/decky-metadata/:appid".
export const SETTINGS_ROUTE = "/decky-metadata-settings";

export const openSettings = () => {
  Navigation.CloseSideMenus();
  Navigation.Navigate(SETTINGS_ROUTE);
};

// QAM header: the Decky display name plus a gear that opens Settings.
export function SettingsTitleView() {
  const t = useT();
  return (
    <Focusable
      className={staticClasses.Title}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: 0,
        boxShadow: "none",
        ...(staticClasses.Title
          ? {}
          : { fontSize: "22px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }),
      }}
    >
      <div>{"Decky Metadata"}</div>
      <DialogButton
        aria-label={t("settings.open")}
        style={{ height: "28px", width: "40px", minWidth: 0, padding: "10px 12px" }}
        onClick={openSettings}
      >
        <FaGear />
      </DialogButton>
    </Focusable>
  );
}
