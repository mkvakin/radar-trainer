# Radar Trainer

Radar Trainer teaches you to use the radar on a small sailboat. You start with a radar you have never switched on. You finish by crossing shipping lanes at night with nothing but the radar screen to guide you.

**Play it now:** https://mkvakin.github.io/radar-trainer/

The trainer runs in your web browser. It needs no installation, no account and no internet connection beyond loading two fonts.

## Why a radar is hard to learn

A radar screen does not show pictures of boats. It shows blobs of light. A blob can be a ship, a buoy, a rain shower, a wave or a reflection that is not there at all. Sailors learn to tell these apart by watching how each blob looks and moves. Most people learn this at sea, often in fog, which is a bad time to learn anything.

Radar Trainer lets you practise on dry land. The simulated radar behaves like a real one. Rain hides small boats. Waves fill the centre of the screen with clutter. A yacht with no radar reflector flickers in and out of view. Distant land sometimes appears in the wrong place.

## What you learn

The course has 12 short chapters, numbered 0 to 11, and a final exam. Each chapter has two parts. First, a tutor walks you through the lessons step by step. Then a check asks you to do the job on your own.

0. **Meet the radar.** You find your way around the screen and the controls.
1. **Power up.** You switch the radar on safely and get a first picture.
2. **Range and scale.** You zoom in and out and read distances from the rings.
3. **Tune the picture.** You adjust gain, sea clutter, rain clutter and tuning, in the right order.
4. **Which way is up.** You learn the three ways a radar can turn its picture, and when each one helps.
5. **Bearing and range.** You measure exactly where a target is, and you fix your own position from a lighthouse.
6. **Recognition gallery.** You learn to recognise 22 kinds of echo, from cargo ships to kayaks.
7. **False echoes.** You learn to spot echoes that lie: side lobes, double echoes, shadows and interference.
8. **Avoid collisions.** You work out whether another boat will hit you, and you steer clear of it.
9. **Pilotage.** You follow a narrow channel into harbour by radar alone.
10. **Modern sets.** You try automatic modes, Doppler colours, ship tracking (MARPA), AIS and the chart overlay.
11. **Emergencies.** You find a life raft from its rescue beacon and learn what radar cannot see.

The final exam is a night passage of 12 nautical miles. The trainer picks a radar at random, and you start with it switched off.

## Three radars

Real boats carry different kinds of radar, and each kind behaves differently. The trainer includes three invented models:

- **Mariner 24** is a classic radar. It has knobs, a manual tuning control and a glowing trace that fades between sweeps.
- **Clearview BB** is a modern broadband radar. It warms up in seconds and has automatic modes, AIS and a chart overlay.
- **Sentinel DX** is a modern radar with Doppler. It colours echoes by whether they come towards you or move away, and it can track ships for you.

You can switch between the three at any time with the buttons at the top of the screen.

## Seeing the answer

Every exercise ends with a reveal. After you decide what a blob is, the trainer shows you the real scene: the ship, the rain or the empty sea. The **Look out** button shows what you would see from the deck at any moment. The **Catalog** lists every kind of echo, with its look, its clues and the things people mistake it for.

The trainer scores you on three things: safety, accuracy and fluency. It remembers your progress in your browser.

## How to run it

The easiest way is to open https://mkvakin.github.io/radar-trainer/ in your browser. To run it from your own computer instead:

1. Download this repository. Use the green **Code** button, then **Download ZIP**, and unzip the file.
2. Open `index.html` in a web browser such as Chrome, Firefox, Safari or Edge.

A laptop or desktop screen works best. You turn the knobs by dragging them in a circle with the mouse.

## Please read

The coastline, the harbours and the radar models are all invented. The simulation is simplified. Radar Trainer helps you understand radar before you go to sea, but it does not replace a proper radar course or practice on a real boat. Always keep a lookout by sight and by sound, as the collision regulations require.

## Code

The trainer is plain HTML and JavaScript with no build step:

- `js/world.js` builds the coastline, the boats and their movement.
- `js/radar.js` simulates the radar signal and draws the screen.
- `js/lookout.js` draws the view from the deck.
- `js/catalog.js` describes each kind of echo.
- `js/chapters.js` holds the lessons and checks.
- `js/app.js` runs the tutor, the controls and the scoring.

## License

Radar Trainer is free software under the MIT License. You may use, copy, change and share it. See the `LICENSE` file.

## Support

Radar Trainer is free. If it helped you, you can [buy me a coffee](https://buymeacoffee.com/mkvakin). The **Sponsor** button at the top of this page offers the same link.
