# TaskManager Figma + Material 3 UI Skill

Use this guide when improving the TaskManager interface with Figma Pro, Figma MCP, or design-to-code work that references Material 3 / Android UX guidance. This project is an offline-first RPG-flavored task manager, not a generic Material app. Material guidance is a quality checklist for interaction, accessibility, layout, and state behavior; the visual identity remains TaskManager's game UI.

## Project Identity

TaskManager is a Vite + React + TypeScript PWA with local IndexedDB data, XP, rewards, projects, progress views, task queues, custom themes, and game-like navigation. Preserve the feeling that tasks are quests, progress is earned, and the app is a game menu for daily execution.

Protect these identity anchors:

- Quest/task feeling in Today, queues, task cards, checklists, due states, and completion feedback.
- XP and reward loop, including reward progress, rarity, progress bars, completion moments, and earned feedback.
- Project progress and skills/shop/analytics framing.
- Custom themes: `classic`, `vault`, `handwritten`, and `hud`.
- Game menu surfaces such as `tm-frame`, `tm-panel`, `tm-card`, `tm-button`, `tm-tab`, `tm-progress`, rarity accents, and theme-specific CSS.

Do not replace these with stock Material components, neutral SaaS styling, generic cards, or plain Android visual treatment.

## Hard Boundaries

During UI/design passes:

- Do not change business logic.
- Do not change the data schema.
- Do not change task/project/XP/reward/import/export behavior unless explicitly requested.
- Do not add backend, auth, sync, provider calls, or unrelated features.
- Do not normalize or rewrite unrelated files.
- Do not redesign multiple themes in one pass unless the user explicitly asks for a cross-theme system change.

If a UI improvement needs behavior or schema changes, stop and call that out before editing.

## Default Workflow

1. Audit first.
   Inspect the current route, component, CSS classes, theme scope, data flow, and existing interaction states. For this app, start with `src/App.tsx`, `src/pages/TodayPage.tsx`, shared components in `src/components`, theme CSS in `src/index.css`, `src/styles/hud-theme.css`, `src/styles/handwritten-theme.css`, and `src/styles/handdrawn.css`.

2. Design in Figma second.
   Use the Figma file/frame as design context before changing code. Prefer Today plus a component board as the first target because Today contains the core loop: queue navigation, task cards, completion, XP, rewards, filters, and progress.

3. Implement third.
   Make small scoped edits. Keep changes inside the target component/theme unless a shared token or component is clearly required.

4. Verify.
   Check mobile and desktop, keyboard/focus states, disabled and pressed states, reduced motion, and theme isolation. Run the project checks appropriate to the change: `npm run typecheck`, `npm run test:run`, and `npm run build` for code changes. For documentation-only changes, state that build checks were not needed.

5. Report clearly.
   Summarize the Figma context, Material/Android principles applied, TaskManager identity preserved, files changed, checks run, and what was intentionally left unchanged.

## Figma Workflow

Use Figma as the design source of truth for visual exploration, not as permission to rewrite product logic.

When a Figma file or frame is provided:

- Inspect the target frame, nearby frames, component sets, variables, styles, spacing, typography, elevation, state variants, and annotations.
- Identify the app route and theme represented by the frame.
- Compare Figma against the live code structure before editing.
- Preserve component naming and design intent when mapping to code.
- Ask Figma MCP for screenshots or design context when needed.

When a Figma file does not yet have reusable structure:

- Create or update a component board before broad screen work.
- Include TaskManager-specific components: app nav tabs, queue tabs, task card, rarity badges, XP/reward strip, progress meter, project chip, dialog, menu, form fields, empty states, and completion feedback.
- Include variants for default, hover, pressed, focus-visible, disabled, selected, busy/loading, overdue, completed, rarity, and theme-specific treatment.
- Keep component examples dense enough to reveal long labels, Russian and English text, wrapping, and narrow mobile behavior.

Preferred first design target:

- Today screen at mobile and desktop sizes.
- Today component board for task cards, filters, queue tabs, reward strip, progress panels, dialogs, and overflow menus.

## Material 3 / Android Checklist

Use Material 3 and Android guidance as UX quality checks underneath the game skin.

Interaction and touch:

- Use practical touch targets around 48 px / 2.75 rem where space allows.
- Keep controls reachable and stable on mobile.
- Ensure buttons, tabs, chips, segmented controls, menus, and cards have clear hover, pressed, selected, focus-visible, disabled, and busy states.
- Preserve `aria-current`, `aria-pressed`, labels, dialog semantics, and keyboard access.

Layout and adaptation:

- Test narrow mobile, typical phone, tablet-ish, and desktop widths.
- Avoid text overflow in navigation, task cards, badges, chips, dialogs, and buttons.
- Prefer responsive constraints, wrapping, scroll affordances, and semantic layout over fixed pixel guesses.
- Maintain dense game-menu ergonomics; do not turn the app into a spacious marketing layout.

Dialogs and menus:

- Keep dialogs modal, labeled, keyboard usable, and dismissible through existing app patterns.
- Keep menus anchored, viewport-safe, and usable by keyboard and touch.
- Use disabled and destructive states clearly, especially delete, skip, import/export, and undo actions.

Accessibility:

- Preserve contrast across all themes.
- Make focus rings visible and theme-appropriate.
- Respect reduced-motion expectations for reveal, completion, hover, and pet-adjacent motion.
- Keep typography hierarchy readable for Russian and English strings.
- Use semantic labels for icon-only or compact controls.

Motion:

- Use motion to reinforce reward, completion, progress, and navigation.
- Keep motion short and optional; avoid blocking task execution.
- Provide reduced-motion-safe behavior for new animations.

## Custom Identity Rules

The design goal is "game skin on top, Android-quality UX underneath."

Do:

- Strengthen quest, rarity, XP, reward, project, and progress signals.
- Use semantic tokens and theme variables for color, border, glow, elevation, motion, and state.
- Keep custom surfaces, parchment/stone/HUD/handwritten feel, rarity accents, and progress styling.
- Improve clarity of states and layout without flattening the app's personality.

Do not:

- Replace `tm-*` game UI with generic Material components.
- Remove XP, reward, rarity, streak, project, progress, or completion flavor.
- Convert the interface into neutral enterprise Material UI.
- Use Material color roles as the visible brand unless they are mapped into TaskManager tokens.
- Remove custom theme differences to simplify implementation.

## Theme-Specific Workflow

Work one theme/style at a time unless asked otherwise.

For a theme pass:

- Name the target theme explicitly: `classic`, `vault`, `handwritten`, or `hud`.
- Use the theme namespace, such as `.tm-app.tm-theme-hud`, rather than broad unscoped overrides.
- Prefer existing semantic tokens and add new semantic tokens only when they represent reusable meaning.
- Avoid hardcoded colors in components. Put visual values in CSS variables or theme-scoped CSS.
- Verify that other themes still render correctly.
- Screenshot/check both mobile and desktop for the edited theme and at least one unaffected theme.
- Preserve existing behavior, route state, saved preferences, and local data.

When a shared component needs theme support, define the behavior once and skin it through theme variables.

## Implementation Guardrails

Before editing:

- Confirm the user asked for implementation, not just design/audit.
- Check the worktree and avoid overwriting unrelated changes.
- Identify the target route, theme, and Figma frame.
- State whether the pass is design-only, code-only, or Figma-to-code.

During editing:

- Keep changes scoped to UI files, CSS, or component markup required by the target.
- Preserve service, logic, repository, entity, schema, XP, reward, import/export, notification, and reminder behavior.
- Keep text and locale behavior intact unless copy changes were requested.
- Reuse existing components and `tm-*` classes before adding new abstractions.

After editing:

- Run typecheck/test/build for code changes.
- Use browser/Figma screenshots when visual verification matters.
- Report any checks not run and why.

## Required Report Format

For every Figma/UI task, report:

- Figma file/frame used.
- Material 3 / Android principles applied.
- TaskManager identity preserved or strengthened.
- Files changed.
- Tests/build results.
- What was intentionally not changed.

If no Figma context was available, say so and describe the local source used instead.

## Acceptance Standard

A UI pass is acceptable when:

- The app still feels like TaskManager: RPG tasks, XP, rewards, projects, progress, custom themes, and game-menu surfaces remain visible.
- Material/Android guidance improved usability, state clarity, accessibility, or adaptive layout without replacing the visual identity.
- The work is scoped to the requested theme/style/screen.
- Existing task, project, XP, reward, import/export, and storage behavior is unchanged.
- Checks and visual review match the risk of the change.
