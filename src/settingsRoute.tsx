import { DialogButton, Focusable, Navigation, staticClasses } from "@decky/ui";
import { FaGear } from "react-icons/fa6";
import { useT } from "./i18n";

// Not "/decky-metadata/settings": that matches the editor route "/decky-metadata/:appid".
export const SETTINGS_ROUTE = "/decky-metadata-settings";

type WindowStore = { GamepadUIMainWindowInstance?: { m_history?: { location?: { pathname?: string } } } };

export const openSettings = () => {
  Navigation.CloseSideMenus();
  // A second Navigate to the open route pushes a duplicate history entry, and one B would not leave.
  // Current Steam has SteamUIStore and no Router global; older builds have Router.
  const host = globalThis as {
    SteamUIStore?: { WindowStore?: WindowStore; m_WindowStore?: WindowStore };
    Router?: { WindowStore?: WindowStore };
  };
  const windowStore = host.SteamUIStore?.WindowStore ?? host.SteamUIStore?.m_WindowStore ?? host.Router?.WindowStore;
  const path = windowStore?.GamepadUIMainWindowInstance?.m_history?.location?.pathname;
  // Some route contexts report Steam's "/routes" prefix; both forms are the open Settings page.
  if (path?.replace(/^\/routes(?=\/)/, "") !== SETTINGS_ROUTE) Navigation.Navigate(SETTINGS_ROUTE);
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
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "28px",
          width: "40px",
          minWidth: 0,
          padding: 0,
        }}
        onClick={openSettings}
      >
        <FaGear />
      </DialogButton>
    </Focusable>
  );
}
