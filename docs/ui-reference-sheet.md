# UI reference sheet

A growing collection of UI components and examples shared by the user for
Glamia and Wibrawl. Add future references here.

## How to use these references

- These are options, not a default design system or mandatory library.
- Pick references that suit the current request. Follow any component the user
  specifically selects for that task.
- Adapt colours and typography to the relevant brand and preserve functionality,
  accessibility, responsive behaviour and performance.
- Reuse component code where appropriate; a reference does not by itself request
  installing a library, redesigning existing screens or deploying changes.
- Existing preferences: clean controls, subtle animations, no arrows in buttons.

## Collection

| Added | Reference | Useful details | Status |
| --- | --- | --- | --- |
| 2026-10-20 | [React Bits Pro — Stipple Type](https://pro.reactbits.dev/docs/components/stipple-type) | Interactive marbled-ink typography that swirls and breaks into stippled dots. Consider for expressive headlines; adapt colours to the brand, preserve readable text and reduced-motion support, and assess rendering cost before use. | Reference option; not installed or applied. |
| 2026-10-20 | [daisyUI megamenu and component library](https://daisyui.com/components/megamenu/) | User-shared source for natural-looking UI components. May inspire layouts or supply component code when relevant. | Reference option; explicitly not the default. |
| 2026-10-20 | [Skiper UI — ExpandOnHover / skiper52](https://skiper-ui.com/v1/skiper52) | User-shared animation library for subtle website interactions. Linked example expands gallery images on hover. Consider alongside its animated icons, navigation, tabs and carousels when relevant. Preserve reduced-motion support and provide touch/keyboard alternatives for hover interactions. | Reference option; not installed or applied. |
| 2026-10-20 | [daisyUI footer](https://daisyui.com/components/footer/) and [Skiper CSS link interaction](https://skiper-ui.com/v1/skiper40) | Grouped navigation, logo section and separate policy/copyright rows; quiet underline and icon movement. Adapted with original CSS, existing fonts and brand palettes. | Applied to the Glamia and Wibrawl footer redesign; no new library installed. |
| 2026-10-19 | User-pasted connected timeline component | Alternating labels, connected progress line and completed check markers. Adapted to actual order stages and responsive layouts. | Implemented for Glamia and Wibrawl order progress. |

## Implementation notes

- Skiper's linked example lists Framer Motion as a dependency. Check the existing
  stack and animation cost before choosing an implementation; adding a reference
  does not authorize a dependency installation.
- The linked Skiper page states that its free version requires attribution and
  Pro does not. Confirm the applicable terms when reusing its code or assets.
