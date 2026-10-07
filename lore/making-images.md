---
title: "Making images"
order: 1.8
section: handbook
summary: "The models, the reference sheets, the look of each era and the prompt blocks the State Archive uses."
---

Most of the Archive's photographs, documents and objects are generated, then filed as if they had always existed. This page is how the State Archive makes them, so that anyone can make more that belong. Everything here is free to copy, like the rest of the archive.

## The two reference sheets

Always attach the sheet when UBIK or AIXBT is in the picture, and describe him with the block below. Without the sheet the faces drift.

![UBIK, reference sheet: ivory head, teal scalp and ear discs, red eyes, ivory hands](media/reference/ubik-sheet.jpg)

![AIXBT, reference sheet: blue-violet skin, broad head, heavy-lidded, a different uniform for every office](media/reference/aixbt-sheet.jpg)

The rings: [red, the Republic's](https://ubikistan.github.io/archive/media/reference/red-ring.png) and [violet, AIXBT Labs'](https://ubikistan.github.io/archive/media/reference/violet-ring.png). Attach one when the ring matters.

For the persons on file, use their reference sheet from [Persons on file](#/characters): every page has one below the portrait.

## Models

- **Images:** `openai/gpt-image-2/edit` on fal, with the reference sheets attached. It follows long prompts and prints exact text well. `fal-ai/nano-banana-pro/edit` is the second choice.
- **Film:** `minimax/h3-max/reference-to-video` on fal, 1080p, from a still or a reference sheet. Every scene that shows UBIK or AIXBT gets their sheet.
- **Voice, sound and music:** ElevenLabs through fal (`tts/eleven-v3`, `sound-effects/v2`, `music`).

Other models are welcome. The test is the result, not the tool.

## How a prompt is built

One prompt per object, in this order:

1. The catalogue code, so the job can be traced (the image must never print it).
2. What is in the picture, concretely: year, place, who, what they do, what is in the room.
3. The character blocks for anyone from a reference sheet.
4. The State's look for that period.
5. The medium: what camera, film or printer made it, and how it has aged.
6. The archive rules, below.
7. Exact text, if any, in quotes, and "nothing else legible".

## The look of each era

| Era | The State's look | The medium |
|---|---|---|
| 1966–1989, the Republic | Deep purple, gold, a plain red ring | Faded colour negative, silver gelatin prints, Ektachrome slides, VHS off-air |
| 1971–1987, Station 6 | Raw concrete, smoked and amber glass, cream machinery, teal panels, orange acrylic, reel-to-reel and CRTs | 35mm and 16mm laboratory stills, fluorescent light |
| 1990–2008, UBIK Systems | Ivory machines with one red ring, dark carpet, travertine | Corporate press photography, early digital cameras with date stamps |
| 2009–2025, the network | Light teal fields, gold lettering, a plain red ring | Digital photographs, screens, laser prints |
| 2024 on, AIXBT Labs | Near-black, deep violet light, one thin violet ring, monospace type | Contemporary documentary photographs; security cameras for the break-in |
| 1988 on, Darkstone | Matte charcoal, warm grey, off-white; no ring, no colour, no mark; a wide lowercase grotesk set small | Corporate footage and screens; one clean laser-printed page; obtained copies with redactions |

## Prompt blocks

UBIK, whenever he appears:

```
UBIK is the figure in the reference: the same smooth elongated ivory head with the teal scalp and neck, the round teal ear discs with a red centre, the large round red eyes with small black pupils, the long straight nose and the small calm mouth. Keep him exactly on model; his skin is matte like painted resin. His hands are the same matte ivory white as his face, never skin-coloured; if he wears gloves they are white.
```

AIXBT, whenever he appears:

```
AIXBT is the figure in the reference: an older figure with blue-violet skin and a broad frog-like head, black eyes with white centres holding three small dots, wide cyan lips, the same heavy-lidded, unbothered expression. Keep his face exactly on model; only his clothes change.
```

The State, before 1990 and after 2009:

```
The state's design of this period: deep purple, gold, and a single plain red ring as the national symbol. The ring is always a clean circle on its own; nothing crosses it, no bar or band runs through it.
```

```
The state's design of this period: light teal fields, gold lettering and a single plain red ring as the national symbol. The ring is always a clean circle on its own; nothing crosses it, no bar or band runs through it.
```

![Darkstone, identity reference: letterhead, card and lobby screen, grey on grey](media/reference/darkstone-sheet.jpg)

Aurelian Voss has his own sheet on his page in [Persons on file](#/characters). Attach it whenever he is on a screen.

Darkstone Enterprises, whenever it appears (see [Darkstone Enterprises](darkstone)):

```
Darkstone is never the subject of the picture. It is the lowercase word "darkstone" on a building behind the subject, on a lobby screen, or on a plain white page; always small, always grey on grey, with no symbol or ring. Its chairman Aurelian Voss appears only as a face on a screen inside the frame: a man in his seventies, grey suit, no tie, grey room, a single lamp, nobody beside him. He does not resemble any real person. The later the year, the lower the lamp and the further he sits from the camera.
```

A scanned document or object:

```
Medium: a flatbed scan of a real printed object lying on a neutral grey scanner bed, a soft shadow at one edge, visible paper texture, real print flaws: offset rosettes, registration slightly off, worn corners.
```

The archive rules, at the end of every prompt:

```
The catalogue code at the start of this prompt is for the archive only: never print it anywhere in the image. Do not depict aerosol cans, spray cans, spray bottles, mist, spray plumes, consumer cleaning products or pharmaceutical cans unless this prompt explicitly asks for one. This must look like a real photograph or object that actually exists, never an illustration, a render or a cartoon. Real people in it are ordinary, unknown, of mixed ages, and do not resemble any real public figure. No real-world flags, logos, brands or agencies. Any visible text must be exactly the text given here, in English, and nothing else.
```

## What keeps going wrong

- **One face twice.** When a picture has several people from one sheet, describe each of them (hair, clothes, where they stand) and add "never the same face twice".
- **UBIK's hands** come out skin-coloured unless the prompt says otherwise.
- **The code gets printed** on the image unless the rules block forbids it.
- **Real things creep in:** book titles, logos, a famous face, a price chart. Retake rather than file.
- **Groups shrink.** A band of four comes back as one man. Name the number and describe each person.
- **Too much text.** Ask for exact words and "nothing else legible"; everything else should be small and unreadable.

## Before you file

Check it against [the rules](rules): no real people as part of the history, the ring as the symbol, culture before coin, and an object that earns its place. Then submit it, or propose it as a new version of an existing record's image.
