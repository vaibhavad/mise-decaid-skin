# Mise

A calm, plain-language skin for Decent espresso machines. It runs inside
Decaid (Decent's newer app) and talks to the machine through Decaid's REST
and WebSocket API on port 8080. It does not work with the older de1app.

## Install

1. In the Decaid app, open **Launcher → Skins**, open the cogwheel menu, then
   **Install skin → ZIP file** and pick `mise-0.8.0.zip`.
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

## How it works

Mise is one screen, **Brew**, with everything you need on it:

- **Status** at the top: Ready, Heating (with the temperature), Steaming and so
  on. History, Settings and Sleep sit at the top right.
- **Water tank** on the left: a bar that fills with the level and turns green
  (over about 1.1 L), amber, or red (under about 500 ml), and blinks when it
  needs refilling. The machine reports millimetres; Mise converts them with the
  same table as the original Decent app, so a full tank reads about 2 L.
- **Hot water, Steam, Flush and Scale** cards. Tap any number to change it.
  Steam has an on/off switch for the heater. Flush shows the cleaning reminder
  and a "Cleaned" button when cleaning is due. Tap the scale reading to zero it.
- **Your recipes** on a carousel in the middle: your five starred recipes, plus
  the one in use if it is not starred. **Swipe (or use the arrows) to load the
  next recipe.** Tap the recipe in the middle to open its page.
- **Temperature, Grind, Coffee in and Espresso out** under the carousel. Tap one
  to open the ruler: drag the scale, tap a preset or nudge with − and +, then
  Save. Nothing reaches the machine until you save.
- **Last shot** at the bottom. Tap it to open History.

Whatever the machine is doing takes over the screen by itself:

- **A shot** fills the screen with a live chart (dashed lines are what the
  recipe asks for), the time, the weight against the target, and a card for
  each step with its time, weight, water temperature and pressure. When the
  shot ends it stays up: tap a taste, write a note, then Close.
- **Steam, hot water and flush** show a panel with the time, the temperature
  and a Stop button, and close by themselves when done.

**Coffees** (the coffee line under the carousel), **Recipes** (from "All
recipes"), **History** and **Settings** open as sheets over Brew; the cross
closes them.

- Recipes: search, filter (Starred, Your copies, Espresso, Filter and tea,
  Cleaning) and sort A–Z or by when you last brewed it. In Starred, the arrows
  set the order of the carousel. Each recipe's page shows its shape, every step
  in plain words, its numbers, description and recent shots, with **Load this
  recipe**, Star, Rename and Duplicate.
- History: each shot with its chart and steps. **Compare** lays a second shot
  underneath in faint lines. **Brew this again** loads that shot's recipe and
  numbers.
- Settings > **Brew screen**: show, hide and reorder the cards, hide the tank
  gauge or the last shot, and choose °C or °F.

## Coffees

Your coffees and their bags are kept in Decaid's own library (`/beans` and
`/bean-batches`), so other skins and Visualizer uploads see them too.

- Add a coffee (name, roaster, country, process, tasting notes), then a bag
  (roast date, roast level, bag size). **Use** a bag and every shot records it.
- The Brew screen shows the coffee in use, its day off roast and what is left
  in the bag. Time in the freezer is not counted as ageing. **Freeze** and
  **Thaw** on a bag record when.
- After each shot Mise takes the dose off the bag (Decaid keeps the amount
  but does not count it down). Turn this off under Settings > Shots.
- History can be filtered to one coffee, and each shot shows the coffee and
  how many days off roast it was.
- Finished bags and coffees move to **Finished** rather than being deleted.

## Managing recipes

Every recipe is yours to change.

- **Change a number on the Brew screen and it is saved into the recipe in
  use.** A toast confirms it, with **Undo**. The recipe gets an **Edited** tag.
- A recipe's page lists **Your changes** (the old and new temperature and
  espresso out) with **Reset to original**. Reset can be undone too.
- **Duplicate** makes a new recipe from the current one, tagged **Yours**, and
  leaves the first as it is.
- In Recipes, **press and hold** a recipe for its menu: Open, Rename,
  Duplicate, Reset to original, Keep on the Brew screen, Export, and Archive
  (or Delete for a recipe of your own). Archive and Delete can be undone.
  Archived recipes are under the **Archived** filter.
- Recipes also has **Import** (a Decaid or Mise export, or one recipe from
  de1app or Visualizer, from a file or pasted) and **Export**.

How it is stored: Decaid's built-in recipes cannot be changed, so Mise keeps
your changes beside them (`mise/edits`) and applies them when the recipe is
loaded. Recipes you duplicate are kept by Mise (`mise/recipes`). Other skins
show the originals.

## Settings and recipe names

Settings has Mise's own pages: Brew screen, Shots (gateway mode, scale rules,
scale timer, stop-by-weight timing), Steam and water (steam, purge mode, hot
water and flush flow and temperature), Machine (fan, tank warming, refill kit,
heater), Tablet (keep the screen on, brightness, charging, night mode) and
Sleep. "All Decaid settings" opens Decaid's complete page for calibration,
cleaning and descaling programs, firmware and connections.

**Rename** on a recipe's page renames it. Recipes you made are renamed in Decaid
itself. Decaid's built-in recipes cannot be changed, so for those the new name
is kept by Mise (key-value store, `mise/names`) and shown only in Mise.

## Your own copies of recipes

**Duplicate** on a recipe's page makes your own copy of a recipe and switches
to it. While a copy is in use, the dose,
yield, temperature and grinder setting you change on the Brew screen are saved
to the copy; the original is never touched. Switching back to a copy restores
all four numbers.

Decaid identifies a recipe by its steps, so it cannot store two identical
recipes. Copies are therefore kept by Mise in Decaid's key-value store
(`mise/recipes`). Other skins do not list them, but shots pulled with a copy
are saved in Decaid's history under the copy's name.

## Sleep screen

Choose a style under Settings > Sleep > **Sleep screen style**, and use
**Preview** to see it without putting the machine to sleep (Previous and Next
step through the styles). Every style shows the time; hold anywhere for a
second, or tap Wake up, to wake the machine.

- **Weather sky**: the weather for the city you choose, with a sky to match.
- **Machine pet**: a little espresso machine asleep on the counter. It is
  thirsty when the tank is low, grumpy when the group needs cleaning, hungry
  when a bag is nearly empty and proud after a shot you rated just right.
  Tap it and it stirs.
- **Grounds hourglass**: grounds fall through the hour; the pile below is this
  week's shots, one layer each, coloured by how they tasted.
- **Shot fingerprints**: today's shots (or your latest) drawn as slowly turning
  patterns made from their pressure, flow and weight curves.
- **Crema lava lamp**: slow crema blobs, one colour for each bag you have open,
  from its roast level.
- **A year in coffee**: one dot for each day of the year around the clock,
  brighter on days you brewed more, with your total and longest streak.
- **Bean journey**: a turning globe with the coffee belt, and an arc from where
  each open bag was grown to your city, with the distance.
- **Departure board**: flipping letters with the next wake time (from Decaid's
  wake schedules), the recipe and dose, every open bag (day off roast, grams
  and shots left), cleaning, water and the last shot.
- **Moon and sunrise**: tonight's moon in its real phase, a countdown to
  sunrise (or sunset), and an aurora on clear nights below freezing.

"Open bags" are the bags in Coffees that are not finished, frozen or empty, so
several can show at once; the one in use comes first.

Two switches apply to every style: **Warm night mode** turns the screen dim and
amber from sunset to sunrise (9 pm to 6:30 am without a city), and **Gentle
drift** moves everything a few pixels every couple of minutes so nothing marks
the screen. **Screen off after** makes it go dark after a while; tap to bring
it back.

Weather, sunrise and sunset come from [Open-Meteo](https://open-meteo.com/)
(free for non-commercial use, data under CC BY 4.0). The only thing sent is the
latitude and longitude of the city you choose, straight from the tablet.

## Leaving the skin

Tap **Exit** at the top right to return to Decaid's dashboard.
Android's Back action does the same: swipe inward from a screen edge, or, with
button navigation, reveal the navigation bar and tap Back.

## Try it without a machine

Open `index.html` through any local web server and add `?demo` to the
address, for example `http://localhost:8000/?demo`. Demo mode uses a pretend
machine and scale. The pretend machine has no group-head buttons, like
Decaid's own simulator, so Brew shows Start buttons. Add `&ghc=1` to see the
layout for machines that have them.

To point the skin at Decaid on another device while developing, add
`?gateway=<tablet-ip>` once; the address is remembered.

## What it stores

- Coffees and bags are kept in Decaid's library. Starred recipes (and their
  order), your copies, display names, the cleaning reminder, the weather city
  and the Brew screen layout (`layout`) are kept in
  Decaid's key-value store under the `mise` namespace, so they survive a
  reinstall of the skin.
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
- The scale's timer: Decaid zeroes, starts and stops it with each shot by
  itself in Tracking mode. In Full mode Decaid leaves that to the skin, so
  Mise does it (Settings > Shots > Scale timer follows the shot).
- The screen: Decaid keeps it on while the machine is awake. "Keep the screen
  on" (Settings > Tablet) keeps it on while the machine sleeps too.
- Mise borrows ideas from Bestpresso (GPLv3); no Bestpresso code is used.

## Layout

    index.html           entry point
    skin-manifest.json   id, name and version, read by Decaid
    styles.css           all styling; sizes follow the screen
    src/main.js          start-up and screen switching
    src/viewport.js      keeps the layout full size when the keyboard opens
    src/store.js         state and every action
    src/api.js           REST and WebSocket transport
    src/sim.js           the pretend machine behind demo mode
    src/chart.js         shot chart and recipe-shape preview
    src/weather.js       weather lookup for the sleep screen
    src/views/           one file per screen
    src/views/sleep/     the sleep screen styles
    fonts/               Inter and Space Grotesk (SIL Open Font License)

There is no build step: the files in this folder are what runs.
