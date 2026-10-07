# SchemeGuard AI UI guide

This file describes the frontend's current visual direction and gives contributors a shared baseline for UI improvements. It is guidance for the application UI in `frontend/`.

## Product and visual theme

SchemeGuard AI is a financial operations workspace for reviewing card-scheme rules, imported transactions, interchange fees, and analytics. The interface should feel **trustworthy, precise, calm, and approachable**. Favor clear information hierarchy and scannable operational data over decoration. The coral brand accent gives the otherwise restrained blue-gray interface energy and helps users find the main action.

The visual language combines:

- A blue-gray foundation, white or softly tinted content surfaces, and readable dark-blue text.
- Coral for primary actions, selected navigation, and brand emphasis.
- Compact, structured tables and forms for data-heavy tasks, balanced by generous page and card spacing.
- Softly rounded cards, panels, inputs, and buttons, with consistent corner radii and subtle borders or shadows to make the interface feel welcoming.
- Small, purposeful state colors for evaluated, pending, processing, warning, and error conditions.

The auth screens use a focused centered card and light brand decoration; authenticated screens use a persistent side navigation and page content cards. Keep both parts recognizably within the same product.

## Approachable interaction style

Use familiar, polished patterns from conversational productivity tools as design inspiration. Carry over the qualities that make them comfortable to use while keeping SchemeGuard's financial-operations identity, coral accent, and transaction-focused workflows.

- **Rounded geometry:** Use a consistent, moderate radius on cards, side panels, text fields, menus, and buttons. Larger content panels may use a little more rounding than compact controls. Keep pills for compact tags, filters, and status chips rather than making every control pill-shaped.
- **Persistent sidebar:** Keep primary destinations in a stable side menu so users can move between uploads, analytics, card schemes, rules, and the investigation desk. Use clear labels, active-state styling, and sensible grouping. On narrow screens, make navigation compact and easy to reach.
- **Purposeful icons:** Use familiar, consistent icons to help users recognize navigation, account actions, theme switching, search, sending, adding, deleting, and status at a glance. Pair less-obvious icons with text or tooltips, keep icon-button hit areas comfortable, and provide accessible names.
- **Quiet surfaces:** Use layered page and card backgrounds with restrained borders and soft shadows. Keep the canvas calm so tables, transaction details, and alerts remain the visual focus.
- **Comfortable spacing and readable type:** Give content room to breathe, keep headings and labels distinct, and use a readable line length for descriptions and assistant analysis. Avoid crowding controls together.
- **Friendly control feedback:** Use clear hover, focus, pressed, selected, loading, and disabled states. Keep transitions quick and subtle, and respect reduced-motion preferences.
- **Conversation and investigation views:** Keep the prompt composer easy to find, messages readable, and selected transaction context visible. Use distinct but restrained treatments for analyst questions and generated analysis; preserve a clear path back to uploads and transaction data.

Use these patterns because they improve comfort and discoverability, not as a pixel-for-pixel copy of another product. Preserve the SchemeGuard name, logo, coral-and-blue-gray palette, domain language, and data-dense workflows.

## Typography

Use **Dava Sans** as the application typeface to match Endava's visual style. The supplied `DavaSans_v1-1.zip` includes these font files and styles:

- `DavaSans-Light.ttf` and `DavaSans-LightItalic.ttf` for light emphasis (300).
- `DavaSans-Regular.ttf` and `DavaSans-Italic.ttf` for normal UI text (400).
- `DavaSans-Medium.ttf` and `DavaSans-MediumItalic.ttf` for labels and moderate emphasis (500).
- `DavaSans-Bold.ttf` and `DavaSans-BoldItalic.ttf` for strong emphasis (700).
- `DavaSans-MediumBold.ttf` is also included; check its internal font metadata before assigning it a CSS weight.

Use Dava Sans consistently across navigation, headings, tables, forms, buttons, and dialogs. Establish hierarchy mainly with size, weight, and spacing: keep body and dense data text comfortable to read, use medium weight for labels, and reserve bold for headings or high-priority values. Use the italic files only for occasional emphasis, not long passages. Keep numerals and currency amounts easy to scan and aligned in data-heavy views.

When the font assets are added to the frontend, declare each available style with `@font-face` and the correct weight/style, then set the shared font family in the global CSS and Ant Design theme configuration. Keep a sensible sans-serif fallback. The supplied ZIP contains font binaries only and no accompanying readme or license document; do not infer additional font instructions from the package.

## Theme and color usage

The app supports light and dark modes. The choice is persisted under `schemeguard-theme` and exposed through `ThemeProvider` in `frontend/src/app/ThemeProvider.tsx`. The root element receives `data-theme="light"` or `data-theme="dark"`.

Use the palette below as the **authoritative default-theme brand palette**. The current default mode is light. Map these values to semantic CSS variables in `frontend/src/styles/theme.css` when implementing or updating styles; avoid one-off colors when an existing token fits. The dark theme should use the paired dark-background signal colors and maintain the same brand identity.

### Primary colours

These are the main layout and interface colors.

| Name | HEX | RGB | CMYK U | CMYK C | Pantone U | Pantone C | RAL |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Brand coral | `#FF5640` | `rgb(255, 86, 64)` | `0 / 80 / 86 / 0` | `0 / 80 / 86 / 0` | 3556 U | 2027 C | 040 50 70 |
| Solid blue | `#192B37` | `rgb(25, 43, 55)` | `100 / 40 / 13 / 70` | `100 / 30 / 15 / 90` | 303 U | 303 C | 240 20 15 |
| White | `#FFFFFF` | `rgb(255, 255, 255)` | `0 / 0 / 06 / 0` | `0 / 0 / 0 / 0` | — | — | 9003 Signal White |

Use brand coral for primary actions and selected/active emphasis; use Solid Blue for the main dark brand surface and strong text; use white for clean content surfaces and reversed text where contrast permits. In CSS, keep token values in the provided HEX form. CMYK, Pantone, and RAL values are reference specifications for brand/print consistency.

### Solid Blue shades

Use this neutral scale to build hierarchy and distinguish surfaces, borders, and secondary text without adding visual noise.

| Shade | HEX | RGB |
| --- | --- | --- |
| Solid Blue 90% | `#30404B` | `rgb(48, 64, 75)` |
| Solid Blue 80% | `#47555F` | `rgb(71, 85, 95)` |
| Solid Blue 70% | `#5E6A73` | `rgb(94, 106, 115)` |
| Solid Blue 60% | `#758087` | `rgb(117, 128, 135)` |
| Solid Blue 50% | `#8C959B` | `rgb(140, 149, 155)` |
| Solid Blue 40% | `#A3AAAF` | `rgb(163, 170, 175)` |
| Solid Blue 30% | `#BABFC3` | `rgb(186, 191, 195)` |
| Solid Blue 20% | `#D1D5D7` | `rgb(209, 213, 215)` |
| Solid Blue 10% | `#E8EAEB` | `rgb(232, 234, 235)` |

### Signal colours

Signal colours communicate immediate feedback. Use only for their semantic status: positive for success/confirmation, warning for caution, and negative for errors. Select the light-background or dark-background set to match the surface; do not interchange them or use them as decorative accents.

| Status | Light background HEX | Light background RGB | Dark background HEX | Dark background RGB |
| --- | --- | --- | --- | --- |
| Positive | `#2D9C5B` | `rgb(45, 156, 91)` | `#3DD17B` | `rgb(61, 209, 123)` |
| Warning | `#EB9410` | `rgb(235, 148, 16)` | `#F99C11` | `rgb(249, 156, 17)` |
| Negative | `#D4403B` | `rgb(212, 64, 59)` | `#E84641` | `rgb(232, 70, 65)` |

### Data visualisation colours

These colors are reserved for charts, graphs, and other data visualizations. Do not use them for general UI controls, decoration, or status indicators.

| Name | HEX | RGB |
| --- | --- | --- |
| Data Blue | `#5899C4` | `rgb(88, 153, 196)` |
| Data Orange | `#FF5641` | `rgb(255, 86, 65)` |
| Data Yellow | `#CF820E` | `rgb(207, 130, 14)` |
| Data Green | `#30A661` | `rgb(48, 166, 97)` |
| Data Violet | `#8684BF` | `rgb(134, 132, 191)` |
| Data Grass Green | `#7B9922` | `rgb(123, 153, 34)` |
| Data Avocado | `#998F63` | `rgb(153, 143, 99)` |
| Data Jeans | `#7C94A6` | `rgb(124, 148, 166)` |
| Data Teal | `#3E9C8F` | `rgb(62, 156, 143)` |

### Illustration accents

Use these four colors exclusively within illustrations. They are not general interface or data-visualization colors.

| Name | HEX | RGB |
| --- | --- | --- |
| Dark Grey | `#3D4952` | `rgb(61, 73, 82)` |
| Medium Blue | `#417191` | `rgb(65, 113, 145)` |
| Bright Grey | `#8AA5B8` | `rgb(138, 165, 184)` |
| Bright Blue | `#68B5E8` | `rgb(104, 181, 232)` |

The existing semantic CSS variables live in `frontend/src/styles/theme.css`, and the Ant Design theme is configured in `frontend/src/main.tsx`. Keep both aligned with this guide when the actual theme implementation is updated. In particular, set the primary action token to the brand coral `#FF5640`.

When adding or changing UI:

- Check the result in **both light and dark themes**. Use semantic variables so surfaces, text, borders, and controls remain legible in both.
- Preserve clear contrast for text, focus indicators, disabled controls, and status labels. Do not communicate a status by color alone; include a label, icon, or other textual cue.
- Reserve coral for primary actions and meaningful emphasis. Use blue for informational accents and distinct status colors for success, warning, and danger.
- Keep neutral actions visually secondary to the main action. Destructive actions should use the established danger treatment and clear wording.

## Layout and interaction patterns

- Follow the approachable operations-console patterns: persistent left navigation, softly rounded work surfaces, clear page headings, purposeful icons, comfortable controls, and structured data views. Shared navigation and reusable UI live under `frontend/src/shared/`; feature screens live under `frontend/src/features/`.
- Keep data-heavy screens easy to scan: align related values, make column labels and row actions clear, and give search, filters, pagination, and empty/loading/error states consistent placement.
- Forms should have visible labels, sensible grouping, clear required/optional cues, and actionable validation feedback. Maintain a clear focus state for keyboard users.
- Buttons and controls should have clear hover, focus, active, loading, and disabled states. Keep labels specific to the outcome of the action.
- Preserve responsive behavior. The navigation, cards, tables, and forms should remain usable on narrow screens; allow dense layouts to adapt instead of simply shrinking text.
- Motion should be subtle and functional. Respect `prefers-reduced-motion` for nonessential animation.

## Frontend implementation notes

- The frontend is React 18, TypeScript, Vite, and Ant Design 6. The global Ant Design theme is configured in `frontend/src/main.tsx`.
- Global resets and base palette are in `frontend/src/styles/global.css`; theme overrides and semantic surface treatments are in `frontend/src/styles/theme.css`. Page and feature styles are split into CSS files under `frontend/src/styles/`.
- Reuse existing components and styles where practical. Keep feature-specific styling near its existing stylesheet and shared visual rules in the appropriate shared/theme layer.
- Avoid duplicating theme state or hard-coding light-only colors in new screens. If a new semantic color is needed, define a token for both themes and use it consistently.

## UI review checklist

Before considering a UI change complete, inspect the affected screen in both themes and at a narrow viewport. Confirm hierarchy, text contrast, keyboard focus, control states, and loading/empty/error feedback. Keep the result consistent with the product's calm, trustworthy financial-operations feel.
