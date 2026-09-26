# Research: asset sources for facemaker (stickers, props, particles, 3D, sound, video, fonts)

Date: 2026-09-27. Method: /deepresearch, 5 angle agents + 1 claim verifier, web-research skill routing. All six agents ran on Fable (a project rule that has since changed). The operator's rule for later runs: research agents run on Opus 5.5 high.

Question: which free and paid asset sources can facemaker use? Facemaker is free, non-commercial and open source, in a public GitHub repo, and served raw from GitHub Pages. Paid budget: under $30 (Etsy). Allowed licences: MIT, Apache-2.0, BSD, MPL-2.0, Unlicense, CC0, CC-BY.

## TL;DR

The operator's belief is false: the Etsy clipart licences tested do not restrict only selling. Every licence tested (three Etsy shops, Lusi Art, Creative Market, Envato Elements, Creative Fabrica) also forbids free redistribution or extractable embedding. A public repo that serves raw SVG/PNG fails all of them. Nothing under $30 fixes this. Use Kenney.nl (CC0: particles, UI sounds, 2D, 3D, fonts), FreeSVG.org (CC0, check each file), Quaternius (CC0 animated 3D, needs a glTF export) and Freesound with the CC0/CC-BY filter. Generate the missing face props on Piranesi and release them CC0 (list in `docs/piranesi-props.json`). No Apache-2.0 kid display font covers Serbian đ. The operator must decide whether to allow SIL OFL.

## Key findings

- **[high]** Etsy clipart licences forbid free sharing. The Clip Atelier: "This includes sharing them for free" [1]. Lusi Art, every paid tier: "(both free of charge and for cash)" [2]. MyClipArtStore: apps only if "uneditable and unextractable", and "Post the digital files for free to download online" is forbidden [3]. Per-pack prices are USD 9 to 35. [1, 2, 3, V1 to V3]
- **[high]** Creative Market forbids sharing "as a standalone file" [5]. Envato Elements forbids redistribution "with source files ... even if the redistribution is for free" [6] (end-user extraction clause seen by the angle agent only). Creative Fabrica forbids embedding into software, apps or websites, and forbids use "as a library inside another tool, platform or application" [7]. [5, 6, 7, V4 to V6]
- **[medium]** WondersArtist (Etsy) forbids "Embedding our graphics as a stock library inside an app" and states that its art is generated with Midjourney and DALL-E. [4]
- **[high]** Kenney.nl: "all game assets on the asset pages are public domain licensed (CC0)", no attribution needed. The Particle Pack has 80 textures at 512 px. Interface Sounds has 100 files. The itch.io All-in-1 bundle has 60,000+ assets. [8, 9, 10, V7]
- **[medium]** FreeSVG.org releases the whole site as CC0, attribution optional. It has pirate and eyepatch art. Users upload the files, so check each file's provenance. [11, V8]
- **[medium]** SVG Repo's default licence forbids redistribution "in a similar way to SVG Repo". The per-icon licence overrides it and can be GPL or BY-SA. Use only icons whose own page shows an allowed licence. [12, V9]
- **[medium]** Quaternius Easy Enemy Pack is CC0 and animated, in FBX/OBJ/Blend only (no glTF). The bee and spider come from page tags and are not confirmed in the text. Other Quaternius packs have a bee (Cute/Ultimate Monsters) and crowns and helmets (Ultimate RPG). [13, 14, V10]
- **[low]** Poly Pizza has Fly, Bee, Spider, Wasp and Butterfly models with a per-model licence filter. "Fly" by Poly by Google shows CC-BY, OBJ/GLTF. The verifier ran out of budget before it checked this claim. No mosquito with an allowed licence exists in any source checked. [15, 16]
- **[medium]** BlendSwap: "swarming flies" and a black widow spider are CC0. A rigged low-poly butterfly and a bee are CC-BY. Files are .blend only. The Honey Bee and Roach models are BY-SA (excluded). [17]
- **[high]** Sonniss GDC bundle v2.0 (effective 2026-08-27) forbids supplying the sounds "as files" or in an "asset pack ... or anything similar". Excluded. [22, V12]
- **[high]** Freesound licences are CC0, CC-BY 4.0 or CC-BY-NC 4.0 (legacy Sampling+ on old uploads). The search has a filter for CC0 and CC-BY only. [23]
- **[high]** Pixabay forbids distribution "on a Standalone basis". The Pexels licence page restricts only stock and wallpaper platforms, but the Pexels Terms of Service carry the same standalone clause (both are Canva). Raw loops in a repo are a grey area. Neither licence is on the allowed list. [19, 20, V13]
- **[high]** Google Fonts adds only OFL fonts now. The Apache-2.0 display fonts Chewy and Luckiest Guy declare only the `latin` subset in METADATA.pb, and Fontdiner Swanky is latin-only per Fontsource. Playful fonts with latin-ext exist only under OFL: Lilita One, Titan One, Bangers, Bubblegum Sans, Sniglet, Chango, Baloo 2, Fredoka. [24, 25, V14]

## Recommendation

1. Kenney first: particles (rain, snow, sparkles, hearts), UI and trigger sounds, and optional 3D hats from the All-in-1 bundle. Commit the files under the same `LICENSE-ASSETS.md` pattern as the current packs.
2. For the face props with no emoji, generate a set on Piranesi and release it CC0. The spec and prompt list are in `docs/piranesi-props.json`. Use FreeSVG only as a fallback, one checked file at a time.
3. AR pests: Quaternius CC0 bee and spider, exported to glTF in Blender. There is no licensed mosquito, so model one or generate it as a 2D sprite.
4. Fonts: decide on OFL. If you allow it, bundle Fredoka or Baloo 2 (the verifier confirmed latin-ext) with its `OFL.txt`. If you do not, keep the fallback font.
5. Paid art: skip Etsy packs. A commission with a written CC0 release or full rights transfer is the only paid route. Not researched.

## Sources

| # | URL | Type | Quality | Angle | Tier |
|---|-----|------|---------|-------|------|
| 1 | https://www.etsy.com/listing/1179302095/extended-commercial-license-unlimited | Etsy licence (The Clip Atelier) | primary | etsy | t3 |
| 2 | https://www.lusiart.com/licence-terms/ | seller licence | primary | etsy | t1 |
| 3 | https://www.etsy.com/listing/93931373/commercial-use-extended-license-no | Etsy licence (MyClipArtStore) | primary | etsy | t3 |
| 4 | https://wondersartist.com/blogs/dearwonders/clipart-commercial-use-guide-for-crafters-small-shops | seller licence guide | primary | etsy | t1 |
| 4a | https://www.etsy.com/listing/967157327/2-basic-commercial-license-for-clip-art | Etsy licence (TanyaartsDesign): forbids freebies and sharing | primary | etsy | firecrawl |
| 4b | https://www.etsy.com/listing/1068336462/limited-commercial-use-license-for-one | Etsy licence | n/a | etsy | fail |
| 4c | https://www.theplrstore.com/what-etsys-2025-policy-changes-mean-for-plr-and-digital-sellers.html | blog on Etsy 2025 originality rules | blog | etsy | t1 |
| 4d | https://www.etsy.com/legal/creativity-standards | Etsy policy | n/a | etsy | fail |
| 5 | https://support.creativemarket.com/hc/en-us/articles/5921351849883-Which-license-should-I-choose-Commercial-or-Extended-Commercial | official licence | primary | paid | t3 |
| 5a | https://creativemarket.com/licenses/terms/general | official licence | n/a | paid | fail |
| 5b | https://support.creativemarket.com/hc/en-us/articles/360021205213-General-Overview-for-Licensing | official licence | primary | paid | snippet |
| 6 | https://help.elements.envato.com/hc/en-us/articles/360000628966-Envato-Elements-License | official licence | primary | paid | t3 |
| 7 | https://www.creativefabrica.com/subscription-license/ | official licence | primary | paid | t3 |
| 8 | https://kenney.nl/support | official FAQ | primary | paid | t1 |
| 9 | https://kenney.nl/assets/particle-pack | asset page | primary | free-2d | t1 |
| 10 | https://kenney.nl/assets/interface-sounds | asset page | primary | audio | t1 |
| 10a | https://kenney.itch.io/kenney-game-assets | store page | primary | paid | snippet |
| 10b | https://itch.io/game-assets/assets-cc0 | store listing | primary | paid | snippet |
| 11 | https://freesvg.org/pirate-and-eyepatch | asset page + site licence | primary | free-2d | t1 |
| 12 | https://www.svgrepo.com/page/licensing/ | official licence | primary | free-2d | firecrawl |
| 12a | https://opengameart.org/content/cc0-resources | user collection | secondary | free-2d | t1 |
| 12b | https://svgsilh.com/tag/mustache-1.html | asset site | n/a | free-2d | fail |
| 12c | https://publicdomainvectors.org/en/terms | wrong page (search) | unreliable | free-2d | t1 |
| 13 | https://quaternius.com/ | asset site | primary | 3d | t1 |
| 14 | https://quaternius.com/packs/easyenemy.html | asset page | primary | 3d | t1 |
| 15 | https://poly.pizza/search/insect | asset index | primary | 3d | t1 |
| 16 | https://poly.pizza/m/c7w1u4mSnXZ | asset page | primary | 3d | t1 |
| 17 | https://blendswap.com/3d/insects | asset index | primary | 3d | t1 |
| 18 | https://sketchfab.com/3d-models/animated-low-poly-spider-game-ready-2d79c585b5404a23b7bcc0be06068283 | asset page (CC BY-NC-ND, excluded) | primary | 3d | t1 |
| 18a | https://github.com/suchipi/arkit-face-blendshapes | repo README | secondary | 3d | t1 |
| 18b | https://www.opensourceavatars.com/ | avatar site | primary | 3d | t1 |
| 18c | https://raw.githubusercontent.com/ToxSam/open-source-avatars/main/README.md | repo README | primary | verify | t1 |
| 19 | https://pixabay.com/service/license-summary/ | official licence | primary | audio | t3 |
| 20 | https://www.pexels.com/license/ | official licence | primary | audio | t3 |
| 20a | https://www.pexels.com/terms-of-service/ | official terms | primary | verify | snippet |
| 21 | https://mixkit.co/license/ | licence index (terms not rendered) | primary | audio | firecrawl |
| 22 | https://sonniss.com/gdc-bundle-license/ | official licence v2.0 | primary | audio | t3 |
| 23 | https://freesound.org/help/faq/ | official FAQ | primary | audio | t1 |
| 24 | https://fonts.google.com/faq | official FAQ | primary | audio | t2 |
| 25 | https://raw.githubusercontent.com/google/fonts/main/apache/chewy/METADATA.pb | font metadata | primary | audio | t1 |
| 25a | https://raw.githubusercontent.com/google/fonts/main/apache/luckiestguy/METADATA.pb | font metadata | primary | verify | t1 |
| 25b | https://api.fontsource.org/v1/fonts | font index | secondary | verify | t1 |
| 25c | https://googlefonts.github.io/gf-guide/metadata.html | official guide | primary | verify | snippet |
| 26 | https://polikarpovaart.com/license_terms | seller licence (same template as Lusi Art) | primary | verify | snippet |
| 27 | https://github.com/Calinou/kenney-interface-sounds | CC0 repack | secondary | verify | snippet |
| 28 | https://pixabay.com/blog/posts/intellectual-property-explained-441/ | official blog | primary | verify | snippet |

## Contradictions / open questions

- Fontsource lists Luckiest Guy with latin-ext, but google/fonts METADATA.pb lists `latin` only. Check the TTF cmap for U+0111 before you rule it out.
- The Sonniss licence says "finished projects ... may be shared" but forbids asset packs and files. An open-source repo sits between the two. Excluded to be safe.
- The Kenney footer "All rights reserved" is the site copyright. The asset table (CC0) is the asset licence.
- A listicle claims that Pexels videos are CC0. The Pexels licence does not say so. Treat the listicle as wrong.
- Unanswered: Mixkit terms (the modal did not render), Coverr, NASA and Wikimedia video loops, Design Bundles, commission terms, a licensed mosquito model, and ARKit 52 blendshape avatars with a clear licence.

## Refuted claims

- "All Open Source Avatars (ToxSam) are CC0" (opensourceavatars.com footer). The repo README lists community collections under various licences (VIPE Heroes is CC-BY). Only the 100Avatars originals are CC0. [18c]

## Gotchas

- An Etsy "commercial" or "extended" licence covers selling end products, never sharing the source files. A free app does not change this.
- "Unextractable" rules out any web app. Browser devtools can extract every served asset.
- Users upload the FreeSVG, Freesound and Poly Pizza files, and they choose each file's licence. Check each file and record it in `LICENSE-ASSETS.md`.
- Quaternius and BlendSwap need a Blender export to glTF. Keep the source licence note next to the converted file.
- Purely prompt-generated images have no US copyright (research/04, Copyright Office 2025). A CC0 release of the Piranesi set is consistent with that.

## Stats

angles 5, sources fetched 48 (8 failed or snippet-only), claims extracted 97, verified 15 (confirmed 13, refuted 1, unverified 1), Firecrawl scrapes 4, SearXNG skipped no, agents 6 (all Fable).
