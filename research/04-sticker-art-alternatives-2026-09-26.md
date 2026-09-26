# Research: alternatives to Twemoji for sticker and emoji artwork

Date: 2026-09-26. Method: /deepresearch, 4 angle agents + 1 claim verifier (all Fable), web-research skill routing.

## TL;DR

Twemoji (jdecked fork, CC-BY 4.0 graphics, Emoji 17.0, About-screen attribution explicitly accepted) remains a valid choice, but **Microsoft Fluent Emoji is the better fit**: MIT licence (no attribution clause), 1595 emoji as Color and Flat SVG (3D as PNG), every animal face and prop the app uses today plus many more, one consistent modern style. Noto Emoji SVGs (Apache-2.0) and Blobmoji (Apache-2.0) are the other allowed sets. OpenMoji (CC BY-SA) and JoyPixels (personal use) are out. No emoji set has an eyepatch, pirate hat, moustache, googly eyes or pimples. For those, either game-icons.net (CC BY 3.0, monochrome silhouettes that need recolouring) or a custom set generated on the operator's own image generator: purely prompt-generated output carries no US copyright (Copyright Office, 2025), FLUX.1 schnell is Apache-2.0 and Stable Diffusion's OpenRAIL-M claims no rights in output, so such a set can be released CC0 inside the repo. Prop PNGs found in open-source face-filter repos are unlicensed or from Freepik and must not be reused.

## Key findings

- **[high]** Fluent Emoji (github.com/microsoft/fluentui-emoji) is MIT; layout `assets/<Name>/{3D,Color,Flat,High Contrast}/`, 3D is PNG only, the other three are SVG; 1595 emoji; skin-tone emoji add a `<Tone>/` level. Color SVGs exist for cat, dog, lion, tiger, rabbit, bear, panda, fox, monkey, pig, cow, frog, koala faces and for sunglasses, glasses, crown, top hat, billed cap, woman's hat, graduation cap, party popper, eyes, red heart, pirate flag, clown face, cowboy hat face, nerd face, monocle face. [1, 2, V1 to V3]
- **[high]** Noto Emoji: fonts OFL 1.1, tools and most image resources (SVG, PNG) Apache-2.0; flags exist only as PNG. Blobmoji inherits the same split with its own Apache-2.0 LICENSE file (one-person fork, blob style). [3, 7, V4, V7]
- **[high]** Twemoji (jdecked) v17.0 tracks Unicode 17.0 (release 2025-11-05); code MIT, graphics CC-BY 4.0; the README names a mobile Settings/About section as an accepted attribution place. Files are `assets/svg/<codepoint>.svg`. [5, V6]
- **[high]** OpenMoji graphics are CC BY-SA 4.0 (code LGPL-3.0): excluded by the project licence list. JoyPixels free tier is personal use only: excluded. Tossface ships fonts only. [4, 6, 8, V5]
- **[high]** game-icons.net icons are CC BY 3.0 (attribution via a credits page or in-app menu explicitly allowed, stickers explicitly allowed); the Pirate tag has `eyepatch.svg` and `pirate-hat.svg`, the Hat tag has `mustache.svg`, `party-hat.svg`, `billed-cap.svg`, `top-hat.svg`. Downloads are two-colour silhouettes (white/black or transparent), so they need recolouring to look like kid stickers. [9, 10, 11, V8]
- **[high]** Kenney Emotes Pack: 480 files, CC0, but emotes and speech balloons only, no hats or accessories. [12, V9]
- **[medium]** Openclipart declares its catalogue public domain (CC0) and hosts a moustache pack, pirate hat and eyepatch pages, but the style is mixed and provenance is per upload; check each file before bundling. [13, 14, 15, V10]
- **[high]** Open-source face-filter repos are not an asset source: jeeliz demos are Apache-2.0 but 3D scenes; the 2D prop PNGs in the other repos (sunglasses, moustache, hats) have no stated origin or come from Freepik, and one repo has no licence at all. [16 to 21, V11]
- **[high]** CC 4.0 attribution can be met "in any reasonable manner": an About screen plus a NOTICE file in the repo, keeping creator, copyright and licence notices and a link, and a note for modified files. Format conversion (SVG to PNG) never creates Adapted Material. Share-alike (BY-SA) would bind any adaptation to BY-SA, which MIT is not compatible with. [22, 23, 24, V12]
- **[high]** US Copyright Office report Part 2 (2025-01-29): AI output is copyrightable only where a human determined sufficient expressive elements; prompts alone do not qualify; including AI material in a larger human work does not bar copyright in that work. So prompt-generated stickers can be dedicated CC0; the operator's edits and arrangement can carry MIT. [25, V13]
- **[high]** Model licences: FLUX.1 [schnell] Apache-2.0; FLUX.1 [dev] and its tools non-commercial (FLUX.2 Klein, 2025-11, is Apache-2.0 too). Stable Diffusion 1.x OpenRAIL-M claims no rights in output, with use restrictions (no harm to minors, no false information). [26, 27, V14, V15]

## Recommendation

1. Switch the emoji-based stickers (live packs and editor palette) from Twemoji to **Fluent Emoji Color SVG** (MIT). Same codepoint coverage, more animal faces and props, one style, no attribution clause. Copy at install time like today (`scripts/copy-emoji.mjs` from the repo tarball or a pinned commit, since there is no npm package).
2. For props with no emoji (eyepatch, pirate hat, moustache, googly eyes, pimples, clown nose, braces, freckles): generate one consistent set on wintermute (FLUX.1 schnell or SD, transparent PNG, optional SVG trace with vtracer), commit under `public/editor/` with a CC0 note in `LICENSE-ASSETS.md`. game-icons silhouettes are the fallback (recolour to flat colours).
3. Add a `LICENSE-ASSETS.md` at the repo root that lists every asset source with licence and link; the About screen already lists them.

## Sources

| # | URL | Type | Quality | Angle | Tier |
|---|-----|------|---------|-------|------|
| 1 | https://github.com/microsoft/fluentui-emoji | official repo | primary | emoji-sets | t1 |
| 2 | https://api.github.com/repos/microsoft/fluentui-emoji/git/trees/main?recursive=1 | GitHub API tree | primary | emoji-sets | curl |
| 3 | https://github.com/googlefonts/noto-emoji | official repo | primary | emoji-sets | t1 |
| 4 | https://github.com/hfg-gmuend/openmoji | official repo | primary | emoji-sets | t1 |
| 5 | https://github.com/jdecked/twemoji | official repo | primary | emoji-sets | t1 |
| 6 | https://github.com/luizbizzio/emojis | licensing guide | secondary | emoji-sets | t1 |
| 7 | https://github.com/C1710/blobmoji | official repo | primary | emoji-sets | t1 |
| 8 | https://github.com/toss/tossface | official repo | primary | emoji-sets | t1 |
| 9 | https://game-icons.net/faq.html | official docs | primary | props | t1 |
| 10 | https://game-icons.net/tags/pirate.html | official catalogue | primary | props | t1 |
| 11 | https://github.com/game-icons/icons | maintained repo | primary | props | t1 |
| 12 | https://kenney.nl/assets/emotes-pack | official asset page | primary | props | t1 |
| 13 | https://freesvg.org/1527822684 | aggregator | secondary | props | t1 |
| 14 | https://openclipart.org/detail/354566/kenney-generic-items | aggregator | secondary | props | t1 |
| 15 | https://openclipart.org/search/?query=animal+mask | aggregator search | primary | face-filter-repos | t1 |
| 16 | https://github.com/jeeliz/jeelizFaceFilter | maintained repo | primary | face-filter-repos | t1 |
| 17 | https://github.com/pranav691/OpenCV-Face-AR-Filters | repo | primary | face-filter-repos | t1 |
| 18 | https://github.com/Roodaki/RealTime-Webcam-Face-Filters | repo | primary | face-filter-repos | t1 |
| 19 | https://github.com/charlielito/snapchat-filters-opencv | repo | primary | face-filter-repos | t1 |
| 20 | https://github.com/Barqawiz/Snnapy2-Filters | repo | primary | face-filter-repos | t1 |
| 21 | https://github.com/OlaPietka/Snapchat-Filters | repo | primary | face-filter-repos | t1 |
| 22 | https://creativecommons.org/licenses/by-sa/4.0/legalcode.en | licence text | primary | licensing | t1 |
| 23 | https://wiki.creativecommons.org/wiki/4.0/Treatment_of_adaptations | official wiki | primary | licensing | t1 |
| 24 | https://opensource.stackexchange.com/questions/7435/mit-licensed-project-with-cc-by-sa-dependency | forum | forum | licensing | firecrawl |
| 25 | https://blogs.loc.gov/copyright/2025/02/inside-the-copyright-offices-report-copyright-and-artificial-intelligence-part-2-copyrightability/ | official blog | primary | licensing | t3 (+solve-cloudflare) |
| 26 | https://raw.githubusercontent.com/CompVis/stable-diffusion/main/LICENSE | licence text | primary | licensing | t1 |
| 27 | https://raw.githubusercontent.com/black-forest-labs/flux/main/README.md | official README | primary | licensing | t1 |
| 28 | https://www.svgrepo.com/svg/322993/pirate-hat | aggregator | unreliable | props | fail (Vercel checkpoint) |
| 29 | https://kenney.nl/assets/animal-pack-redux | asset site | unreliable | face-filter-repos | fail (404) |
| 30 | https://opensource.stackexchange.com/questions/173/what-do-i-need-to-share-if-i-include-cc-by-sa-artwork-in-my-software | forum | unreliable | licensing | fail (block page) |
| 31 | https://huggingface.co/black-forest-labs/FLUX.1-dev/raw/main/LICENSE.md | licence text (gated) | unreliable | licensing | fail (login) |
| V | Verifier extras: raw LICENSE files of fluentui-emoji and blobmoji, game-icons hat tag, jdecked/twemoji releases, copyright.gov NewsNet 1060, black-forest-labs README, OpenRAIL-M mirrors | primary | verify | curl/t1 |

## Contradictions / open questions

- A search snippet (neoteo) claimed OpenMoji only needs attribution; the repo says CC BY-SA 4.0. The repo is authoritative.
- Whether bundling an unmodified CC BY-SA SVG in an MIT app is a "collection" or an "adaptation" is not settled by the fetched sources; moot because BY-SA is excluded.
- Fluent Emoji has no npm package; assets must be copied from the repo tree (pin a commit).
- Unanswered: Noto's exact licence file path inside the new `2D/` layout; Sensa Emoji and Animated Fluent Emoji terms; vtracer and potrace licences; EU position on AI output.

## Refuted claims

None found.

## Gotchas

- Fluent 3D style is PNG only (raster, larger files); Color and Flat are SVG.
- game-icons assets are monochrome silhouettes, not finished colour stickers.
- Openclipart provenance is per upload; a CC0 label on the site does not prove the uploader's rights.
- Face-filter GitHub repos: MIT LICENSE files cover code, not the bundled prop images.
- FLUX.1 [dev] output for a public repo needs a paid licence; use schnell or FLUX.2 Klein (Apache-2.0) or SD 1.x/OpenRAIL-M.
- Fetch failures: SVG Repo (Vercel checkpoint), Kenney animal pack (404), one Stack Exchange page (block page), Hugging Face gated licence.
- Prompt-injection hook false positives on MIT licence text and JavaScript escape sequences; treated as data.

## Stats

angles 4, sources fetched 31 (4 failed) plus 10 verifier fetches, claims extracted 72, verified 15 (confirmed 15, refuted 0, unverified 57), Firecrawl scrapes 1, SearXNG skipped in 1 of 4 angles, agents 5.
