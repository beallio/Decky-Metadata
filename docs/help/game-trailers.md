# Watch game trailers

Decky Metadata can show a game trailer over its Library hero artwork. It leaves your artwork unchanged and keeps it visible when no suitable trailer is available.

## Turn on trailers

Open the Quick Access Menu, open Decky Metadata, and select **Game trailers** to open that section. Turn on **Enabled**; trailers are off by default. Then open a game's main Library page to watch its trailer when one is available.

Decky Metadata checks for a playable Steam trailer first. If Steam has none, it looks for a suitable IGN game trailer. If neither source has a suitable video, the game artwork stays visible.

For a non-Steam shortcut, a saved Steam match in **Decky metadata...** supplies the Steam App ID to check first. If that Steam trailer is not playable, Decky Metadata can fall back to IGN. Without a Steam match, it looks for an IGN trailer using the shortcut's name or a saved IGN game match. If it cannot find a suitable match and video, the shortcut's artwork stays visible.

## Choose trailer settings

Find these settings in the **Game trailers** section:

- **Trailer audio** lets you choose whether trailers play with sound; it is off by default. When enabled, a new trailer stays muted behind the artwork, then its sound fades in as the trailer appears. You can also mute or unmute a visible trailer with your controller.
- **Video quality** offers **Auto — match display**, **720p**, **1080p**, **1440p**, and **2160p**. Auto uses the Big Picture display size to choose an available video size when possible.
- **Trailer fade-in delay** controls how long the artwork remains before a ready trailer appears. The default is three seconds. Choose from 0 to 10 seconds; at 0, the trailer appears as soon as it is ready.
- **Hide game logo during trailers** hides Steam's game logo while the trailer is visible. The logo returns when playback stops or fails, or when you leave the game page. This does not hide a logo shown inside the video.

If Steam or SDH-Ludusavi shows a save-status bar below the game artwork, the trailer can show through its transparent background without moving the bar. It follows the bar's actual height, including when a theme makes the bar taller. A hidden, compact, or moved indicator does not add full-width trailer space. When you leave the game page, the artwork returns to its usual size. This does not change the trailer's fit, position, or playback.

The artwork and trailer keep the same height as Steam opens or closes the page, including when you turn the status theme off and on before opening it. Steam's normal page animation still plays; switching to the trailer does not add another size change.

## Use the controller buttons

While a trailer is visible:

- Press **X** on a Steam Deck or Xbox controller (**Square** on PlayStation) to mute or unmute it.
- Press **Y** (**Triangle** on PlayStation) to enlarge the trailer and hide the game page controls. Press **Y** again or **B** (**Circle** on PlayStation) to return. The video keeps playing.

When the game page is visible, Steam's footer shows the **X** and **Y** actions. Menus and text fields keep their normal button behavior.

## Streaming and TrailerHero

Trailers stream from Steam or IGN. Decky Metadata does not download them for offline playback.

If **TrailerHero** is enabled in Decky Loader, Decky Metadata pauses its trailers
and prevents turning them on. The **Game trailers** section tells you to disable
TrailerHero. Disable it in Decky Loader; hiding it from the menu is not enough.

Your trailer settings stay saved. If **Enabled** was on, trailers resume when
TrailerHero is disabled or removed. You can turn **Enabled** off while paused
to keep Metadata's trailers off.

TrailerHero 1.7.1 can leave its player running after you disable it. If **Big
Picture display** says another trailer plugin is still active, finish any
running game and restart Steam after disabling or removing TrailerHero.
Metadata waits until the old player is gone instead of starting a second one.

If Metadata cannot check other plugins, it shows a warning instead of blocking
trailers. Check manually that TrailerHero is disabled before enabling ours.

[Help home](README.md)
