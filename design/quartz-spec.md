# Quartz

> Black and white chassis with five muted kind hues and warm trouble colors, for AI support products and agent consoles.

kind: system-index
version: 1
install-base: `npx shadcn@latest add https://design.how/r/quartz/<name>.json`
human: https://design.how/systems/quartz

## How to use this system
1. Read this page. Follow the global rules and the priority order.
2. Before building a component, fetch its page from the list below.
3. Use only the tokens in the foundations' token tables. If a component is missing, build the stand-in under Coverage gaps; if none is listed, compose it from existing components and tokens and say what you built. Never invent a token.

## Priority order
When rules conflict, the earlier item wins.
1. Accessibility and keyboard behavior
2. Tokens, never raw values
3. Existing components, never rebuilt
4. Layout and spacing scale
5. Polish: motion, radius, details

## Global rules
1. quartz-components-first MUST Use a component from this system before writing custom markup. Because hand-built markup skips the component's focus ring, keyboard handling and states, which people notice one at a time.
   - Correct: `<Button onClick={open}>Open run</Button>`
   - Wrong: `<div onClick={open} className="cursor-pointer">Open run</div>`
2. quartz-scope MUST Put className="quartz" on `<body>`, once, in the root layout, with QuartzPortalProvider inside it. Because the class carries every token and the font, and the provider gives menus, dialogs and toasts a home beside the page so a modal can make the page behind inert.
   - Correct: `<body className="quartz"><QuartzPortalProvider>{children}</QuartzPortalProvider></body>`
   - Wrong: `<div className="quartz"><QuartzPortalProvider>{children}</QuartzPortalProvider></div>`
3. quartz-tokens-only MUST Reference tokens by role; never hex, rgb or arbitrary px. Because a raw value keeps its light-theme color in the dark theme and drifts off the spacing scale.
   - Correct: `<div className="bg-surface p-4">`
   - Wrong: `<div className="bg-[#f4f4f5] p-[13px]">`
4. quartz-kind-is-a-word MUST Name a kind with <Badge kind/> or data-kind; hue never fills a region. Because the word reads in grayscale and aloud, and a filled region makes everything inside look like that kind.
   - Correct: `<Badge kind="agent"/>`
   - Wrong: `<Card className="bg-accent-field">Agent</Card>`
5. quartz-warm-is-trouble NEVER Use amber or red for anything but warn and fail. Because an operator scanning for trouble stops on every warm mark, so a warm Beta tag reads as a failing run.
   - Correct: `<Badge>Beta</Badge>`
   - Wrong: `<Badge className="bg-amber-200">Beta</Badge>`
6. quartz-prop-names SHOULD Name a prop by the question it answers: status for warn and fail, orientation for the direction a row or column runs, layout for which arrangement of the same parts, placement for where it sits on the page; variant only for a Button and a menu item's intent. Because one word for one question lets a person guess the prop on a component they have not used, and tone, kind or variant for a state sends them to the docs.
7. quartz-fields-not-lines SHOULD Separate containers with a grey field; use a hairline only where a field cannot. Because boxes inside bordered boxes stack lines until the groups blur.
8. quartz-keyboard MUST Keep every control keyboard-operable with a visible focus ring and an accessible name. Because a keyboard user loses their place without the ring, and a screen reader announces an unnamed icon button as "button".
   - Correct: `<Button size="icon-sm" aria-label="Close"><Icon icon={Close}/></Button>`
   - Wrong: `<Button size="icon-sm" className="outline-none"><Icon icon={Close}/></Button>`
9. quartz-ask-before-destructive MUST Stop an agent before a destructive or irreversible action with a ToolCall awaiting permission and Deny and Allow; save typed confirmation for deleting for good a thing that holds others, such as a project (dialog-typed-confirm-irreversible). Because a prompt release, a deleted key or a sent reply cannot be taken back, and a typed name on every action trains people to type through the real one.
   - Correct: `<ToolCall call={call} actions={<><Button variant="secondary">Deny</Button><Button>Allow</Button></>}/>`
10. quartz-ai-turn MUST Build a turn inside Conversation from AgentTurn, ToolCallList, Response and ConversationTail, with PromptQueue above PromptInput; only the running tool row shows the arc. Because each part owns one job, and a second spinner or phrase in the turn makes the thread say two things at once.
   - Correct:
     ```tsx
     <AgentTurn name="planner">
       <ToolCallList calls={calls}/>
       <Response>{text}</Response>{done && <MessageFooter>{actions}</MessageFooter>}</AgentTurn>
     <ConversationTail>{waiting && <Activity waiting announce={false}/>}</ConversationTail>
     ```
11. quartz-sentence-case MUST Write sentence case, plain labels, verb plus object on actions. Because title case reads as proper nouns, and a bare OK or Submit does not say what the press will do.
   - Correct: `<Button>Create key</Button>`
   - Wrong: `<Button>Submit</Button>`
12. quartz-no-decoration NEVER Add shadows on flat things, gradients, glass, pills, side bars or looping motion. Because each one competes with the status words and kind labels that carry meaning, and glass drops text contrast.
   - Correct: `<Card>`
   - Wrong: `<Card className="shadow-md bg-gradient-to-br from-accent-wash backdrop-blur">`
13. quartz-smallest-change SHOULD Make the smallest change; do not add files or abstractions that were not requested. Because every extra file is code the person has to review and keep.
14. quartz-stop-when-missing MUST Stop and say so when a component or token is missing; do not invent one. Because an invented token resolves to nothing and renders unstyled, and an invented component never gets the system's fixes.

## Page shell
Every screen sits in this frame.
- Root: the `<body className="quartz">` from quartz-scope, which sets the page color, text and font; in its QuartzPortalProvider, `<SidebarProvider className="min-h-dvh">` holding `Sidebar` (`--sidebar` wide, a sheet under 768px) and `SidebarInset`, the page's `main`
- Top bar, first in SidebarInset: `<header className="sticky top-0 z-10 flex h-(--topbar) shrink-0 items-center gap-2 bg-page px-(--gutter-sm) sm:px-(--gutter)">` with `SidebarTrigger` and a Breadcrumb; the h1 is never here
- List page: runs, keys, agents: `<div className="mx-auto flex w-full max-w-(--container) flex-col gap-6 px-(--gutter-sm) py-6 sm:px-(--gutter)">` holding PageHeader (the one h1), FilterBar, then the Table
- List and detail: the list page, with the selection in a docked `<Sheet modal={false}>` whose SheetContent has `stackBelow="3xl"`, so it takes the full width under the list in a narrow container; a trace beside its timeline is two panels side by side filling `SidebarInset`, each scrolling inside itself
- Chat or agent run, full height: `h-dvh` on SidebarProvider; in `SidebarInset` a `flex min-h-0 flex-1 flex-col` holding `<PageHeader size="sm">` with the run's title (the h1) and its Status in PageHeaderDescription, Conversation (`min-h-0 flex-1`), then PromptQueue and PromptInput in `mx-auto w-full max-w-3xl px-(--gutter-sm) pb-4 sm:px-(--gutter)`, so the composer stays pinned

## When to ask
Ask the person when the screen needs a credential, an environment, the object of a destructive action or an approval policy you were not given; never invent a key, an endpoint or which tools need approval. Decide layout, copy and components from these rules and say what you chose.

## Reject list
- Grey cards for list entries, icons on every label, kind icons and icon tiles; use rows in one frame and the kind word. Status dots, transition: all, and outline: none without a replacement; write the status word.

## Coverage gaps
Not in the system yet, and what to build meanwhile.
- Attachments on a sent message: a `<AttachmentGroup aria-label="Attached files">` of done Attachment chips in MessageContent above the MessageBubble, never inside it.
- Retry for a failed run or job row: a `variant="secondary" size="sm"` Button that names the run (Rerun refund-eval) in the row's last cell; a failed load uses EmptyRetry and a failed turn ConversationError.
- One duration on its own: `formatDuration(ms)` from the tool-call item; a column uses `formatDurations` from the format item. Reasoning takes seconds; ToolCall and the formatters take ms.

## Foundations
- [Color](/systems/quartz/foundations/color.md): Five hues name the kind of thing, and amber and red mean trouble.
- [Typography](/systems/quartz/foundations/typography.md): One sans for every word, mono for what a person copies.
- [Space](/systems/quartz/foundations/space.md): How much room goes between things, in steps of 4px.
- [Radius](/systems/quartz/foundations/radius.md): How round each corner is, from square marks to 10px frames, with 6px controls.
- [Borders and lines](/systems/quartz/foundations/borders-and-lines.md): Grey fields keep things apart, and hairlines go only where a field cannot.
- [Elevation](/systems/quartz/foundations/elevation.md): Everything is flat, and only overlays get a shadow.
- [Motion](/systems/quartz/foundations/motion.md): How things move, fast and only when something changes.
- [Iconography](/systems/quartz/foundations/iconography.md): A few solid icons, only for actions you find by their shape.
- [Grid](/systems/quartz/foundations/grid.md): The columns and gutters a page sits on, at every width.
- [Anti-slop](/systems/quartz/foundations/anti-slop.md): The habits of generated UI to avoid, and what to do instead.

## Components
- Actions: [Button](/systems/quartz/components/button.md), [Button group](/systems/quartz/components/button-group.md), [Copy button](/systems/quartz/components/copy-button.md)
- Inputs: [Input](/systems/quartz/components/input.md), [Textarea](/systems/quartz/components/textarea.md), [Field](/systems/quartz/components/field.md), [Date picker](/systems/quartz/components/date-picker.md), [Combobox](/systems/quartz/components/combobox.md)
- Selection: [Checkbox](/systems/quartz/components/checkbox.md), [Radio group](/systems/quartz/components/radio-group.md), [Switch](/systems/quartz/components/switch.md), [Slider](/systems/quartz/components/slider.md), [Select](/systems/quartz/components/select.md), [Segmented control](/systems/quartz/components/segmented-control.md)
- Display: [Badge](/systems/quartz/components/badge.md), [Chip](/systems/quartz/components/chip.md), [Status](/systems/quartz/components/status.md), [Stat](/systems/quartz/components/stat.md), [Avatar](/systems/quartz/components/avatar.md), [Kbd](/systems/quartz/components/kbd.md), [Relative time](/systems/quartz/components/relative-time.md), [Truncate](/systems/quartz/components/truncate.md), [Item](/systems/quartz/components/item.md), [Card](/systems/quartz/components/card.md), [Panel](/systems/quartz/components/panel.md), [Data list](/systems/quartz/components/data-list.md)
- Feedback: [Alert](/systems/quartz/components/alert.md), [Toast](/systems/quartz/components/toast.md), [Empty state](/systems/quartz/components/empty-state.md), [Skeleton](/systems/quartz/components/skeleton.md), [Progress](/systems/quartz/components/progress.md)
- Overlays: [Dialog](/systems/quartz/components/dialog.md), [Sheet](/systems/quartz/components/sheet.md), [Popover](/systems/quartz/components/popover.md), [Tooltip](/systems/quartz/components/tooltip.md), [Dropdown menu](/systems/quartz/components/dropdown-menu.md), [Command](/systems/quartz/components/command.md)
- Navigation: [Tabs](/systems/quartz/components/tabs.md), [Breadcrumb](/systems/quartz/components/breadcrumb.md), [Pagination](/systems/quartz/components/pagination.md)
- Layout: [Collapsible](/systems/quartz/components/collapsible.md)
- Data: [Table](/systems/quartz/components/table.md), [Filter bar](/systems/quartz/components/filter-bar.md), [Timeline](/systems/quartz/components/timeline.md), [Data grid](/systems/quartz/components/data-grid.md)
- Code: [Code block](/systems/quartz/components/code-block.md), [JSON view](/systems/quartz/components/json-view.md), [Log viewer](/systems/quartz/components/log-viewer.md)
- Media and charts: [Attachment](/systems/quartz/components/attachment.md), [Chart](/systems/quartz/components/chart.md)
- AI: [Message](/systems/quartz/components/message.md), [Conversation](/systems/quartz/components/conversation.md), [Response](/systems/quartz/components/response.md), [Reasoning](/systems/quartz/components/reasoning.md), [Tool call](/systems/quartz/components/tool-call.md), [Activity](/systems/quartz/components/activity.md), [Prompt input](/systems/quartz/components/prompt-input.md)

## Blocks
Whole screens built only from the components above. For a whole screen, start from one.
- Workspace home: A workspace home for a team of agents: the workspace and New agent, a strip of four numbers, the Conversations chart, what needs a look, the conversations table and the last prompt releases. `npx shadcn@latest add https://design.how/r/quartz/project-home.json`
- Agent session: One agent turn in a thread: tool calls under one live Activity header, the answer, a queued follow-up and the composer with Stop. `npx shadcn@latest add https://design.how/r/quartz/agent-session.json`
- Tool approval: An agent asks before it sends a refund, with Allow and Deny; the outcome takes focus after a choice. `npx shadcn@latest add https://design.how/r/quartz/tool-approval.json`
- API keys: Create a key and see it once at its full length, masked with reveal and copy; then the keys by their last four characters with Revoke. `npx shadcn@latest add https://design.how/r/quartz/api-keys.json`
- Prompt release: A prompt release paused on a failed eval: the release card with the decision and Roll back, the rollout on one clock, the evals with the failure first, the log and the releases before it. `npx shadcn@latest add https://design.how/r/quartz/deploy-detail.json`
- Run trace: One agent run as a waterfall of its steps and model calls, with the live step growing and the open step's details beside it. `npx shadcn@latest add https://design.how/r/quartz/run-trace.json`
- Live activity: An agent's tool calls as they happen: result, tool and agent, trouble marked, with filters, Pause and the call docked beside the list. `npx shadcn@latest add https://design.how/r/quartz/live-requests.json`

## Optional
- [Human docs](https://design.how/systems/quartz): visual reference
