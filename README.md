# Mise

A calm, plain-language skin for Decent espresso machines. It runs inside
Decaid (Decent's newer app) and talks to the machine through Decaid's REST
and WebSocket API on port 8080. It does not work with the older de1app.

## Install

1. In the Decaid app, open **Launcher → Skins**, open the cogwheel menu, then
   **Install skin → ZIP file** and pick `mise-0.2.0.zip`.
2. Select **Mise** in that same skin list.

Switch skins only from this screen in the app. The web settings page (the one
the Settings button in a skin opens) is refused with a 401 error when it tries
to switch or install skins.

## Set Decaid's gateway mode to Tracking

Mise expects Decaid's gateway mode to be **Tracking**: Decaid then weighs the
shot, stops it at the target and saves it, while Mise shows it. You can set it
in Mise under Settings > Shots. In **Disabled** mode Decaid shows its own shot
screen in place of Mise's; in **Full** mode nothing stops the shot at the
target weight, because Mise does not do that itself.

## Settings and recipe names

Settings has Mise's own page for the everyday choices (gateway mode, scale
rules, steam, auto-sleep, brightness). "All Decaid settings" opens Decaid's
complete settings page for the rest.

The pencil on a recipe renames it. Recipes you made are renamed in Decaid
itself. Decaid's built-in recipes cannot be changed, so for those the new name
is kept by Mise (key-value store, `mise/names`) and shown only in Mise.

## Leaving the skin

Tap **Exit** at the bottom of the left rail to return to Decaid's dashboard.
Android's Back action does the same: swipe inward from a screen edge, or, with
button navigation, reveal the navigation bar and tap Back.

## Try it without a machine

Open `index.html` through any local web server and add `?demo` to the
address, for example `http://localhost:8000/?demo`. Demo mode uses a pretend
machine and scale. The pretend machine has no group-head buttons, like
Decaid's own simulator, so Home shows a Start button. Add `&ghc=1` to see the
layout for machines that have them.

To point the skin at Decaid on another device while developing, add
`?gateway=<tablet-ip>` once; the address is remembered.

## What it stores

- Starred recipes and the cleaning reminder are kept in Decaid's key-value
  store under the `mise` namespace, so they survive a reinstall of the skin.
- After each shot it adds the shot time, the weight and your taste tag to the
  shot's annotations (`extras.mise`), and your notes to `espressoNotes`.

## Things to know

- On machines with group-head buttons the firmware only starts espresso,
  steam, hot water and flush from the machine itself. The skin shows a Start
  button only when Decaid reports no group-head controller. Stop works from
  the tablet on every machine.
- Stopping by weight and saving shots are done by Decaid, not by the skin.
  If shots do not stop at the target weight, check the scale connection and
  the gateway mode in Decaid's settings.
- The water tank reading is shown as OK, Low or Empty, from the level and
  refill threshold the machine reports.

## Layout

    index.html           entry point
    skin-manifest.json   id, name and version, read by Decaid
    styles.css           all styling; sizes follow the screen
    src/main.js          start-up and screen switching
    src/store.js         state and every action
    src/api.js           REST and WebSocket transport
    src/sim.js           the pretend machine behind demo mode
    src/chart.js         shot chart and recipe-shape preview
    src/views/           one file per screen
    fonts/               Inter and Space Grotesk (SIL Open Font License)

There is no build step: the files in this folder are what runs.
