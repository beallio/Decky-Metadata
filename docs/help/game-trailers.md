# Watch game trailers

Decky Metadata can show trailers over a game's Library artwork or the Home background behind the carousel. It does not change your saved artwork. The original artwork stays visible when no suitable trailer is available.

## Turn on trailers

Open the Quick Access Menu, open Decky Metadata, and select **Game trailers**. Turn on **Enable trailers**, the main switch for both views. It is off by default.

- **Detail view trailers** shows trailers on a game's main Library page. This view is on by default when the main switch is enabled.
- **Home view trailers** shows muted trailers in the Home background. It is off by default; turn it on, return Home, then select a game with your controller or hover over its card.

Turning the main switch off keeps your choices for both views. Existing users keep their previous Detail preferences and delay after updating; Home does not turn on automatically.

Decky Metadata checks for a playable Steam trailer first. If Steam has none, it looks for a suitable IGN game trailer. If neither source has a suitable video, the game artwork stays visible.

Turning **Enable trailers** off stops trailer checks, timers, and artwork tracking and restores the original artwork and game-page logo. Turning it on resumes the views you selected. This stops unused trailer work while off; other causes of scrolling lag can remain.

For a non-Steam shortcut, a saved Steam match in **Decky metadata...** supplies the Steam App ID to check first. If that Steam trailer is not playable, Decky Metadata can fall back to IGN. Without a Steam match, it looks for an IGN trailer using the shortcut's name or a saved IGN game match. If it cannot find a suitable match and video, the shortcut's artwork stays visible.

### Home previews

The preview follows the last mouse or controller input used on the Home carousel. It plays over the background hero artwork, not inside the card. Moving to another game stops the previous trailer and restarts the Home delay. Leaving the carousel, opening a menu, or leaving Home stops the preview.

Home previews always stay muted and keep Steam's native controls. They do not move controller focus or change your saved artwork.


## Choose trailer settings

The main **Enable trailers** switch stays at the top. **Detail view** and **Home view** are separate collapsible subsections. Select a heading or press **A** to show or hide its controls. Closing a subsection does not turn its trailers off.

### Detail view

- **Detail view trailers** turns trailers on or off for game pages.
- **Detail fade-in delay** controls the wait from opening a game page until a ready trailer appears.
- **Detail trailer audio** controls sound on game pages; it is off by default. Sound fades in when a Detail trailer appears.
- **Hide game logo during Detail trailers** hides the game-page logo while a trailer is visible. The logo returns when playback stops or fails, or when you leave the page. Logos inside the video are not changed.

### Home view

- **Home view trailers** turns muted Home previews on or off.
- **Home fade-in delay** controls the wait from selecting or hovering over a game before trailer lookup starts. Moving to another game restarts this wait.

### Shared settings

**Video quality** stays outside both subsections. It applies to both views and offers **Auto — match display**, **720p**, **1080p**, **1440p**, and **2160p**.

Both delay sliders default to three seconds and can be set independently from 0 to 10 seconds. At 0, a trailer appears as soon as it is ready. The delay is separate from the fade animation.

If Steam or SDH-Ludusavi shows a save-status bar below the game artwork, the trailer can show through its transparent background without moving the bar. It follows the bar's actual height, including when a theme makes the bar taller. A hidden, compact, or moved indicator does not add full-width trailer space. When you leave the game page, the artwork returns to its usual size. This does not change the trailer's fit, position, or playback.

The artwork and trailer keep the same height as Steam opens or closes the page, including when you turn the status theme off and on before opening it. Steam's normal page animation still plays; switching to the trailer does not add another size change.

## Use the controller buttons

While a Detail trailer is visible on a game page:

- Press **X** on a Steam Deck or Xbox controller (**Square** on PlayStation) to mute or unmute it.
- Press **Y** (**Triangle** on PlayStation) to enlarge the trailer and hide the game page controls. Press **Y** again or **B** (**Circle** on PlayStation) to return. The video keeps playing.

When the game page is visible, Steam's footer shows the **X** and **Y** actions. Menus and text fields keep their normal button behavior.

## Streaming and TrailerHero

Trailers stream from Steam or IGN. Decky Metadata does not download them for offline playback.

If **TrailerHero** is enabled in Decky Loader, Decky Metadata pauses its trailers
and prevents turning them on. The **Game trailers** section tells you to disable
TrailerHero. Disable it in Decky Loader; hiding it from the menu is not enough.

Your view preferences stay saved. If **Enable trailers** was on, the selected views resume when TrailerHero is disabled or removed. You can turn the main switch off while paused to keep Metadata's trailers off.

TrailerHero 1.7.1 can leave its player running after you disable it. If **Big
Picture display** says another trailer plugin is still active, finish any
running game and restart Steam after disabling or removing TrailerHero.
Metadata waits until the old player is gone instead of starting a second one.

If Metadata cannot check other plugins, it shows a warning instead of blocking
trailers. Check manually that TrailerHero is disabled before enabling ours.

[Help home](README.md)
