# Teaching preparation cards: canonical TEACHING_DASHBOARD_V1 contract

Use this contract for the Teaching Planner board's preparation cards and
ChatGPT's Daily Teaching Planner automation. It describes the existing parser;
it does not change the parser, Planner Notes, confirmed progress or Trello
automations.

## Diagnosis of the live Friday cards

The three CURRENT TEACHING DAY cards were read directly from Trello on
27 November 2026 (Pacific/Auckland). Their first slot headings are:

| Card | Exact invalid heading |
| --- | --- |
| [9WHAU / Whanau](https://trello.com/c/Aslc6mxX) | `### SLOT 1 \| Preparation \| Whānau check-in` |
| [JPI / JuniorDTECH](https://trello.com/c/T7jZWAd4) | `### SLOT 1 \| Preparation \| JuniorDTECH preparation` |
| [JSR / JuniorDTECH](https://trello.com/c/sbBYXkEe) | `### SLOT 1 \| Preparation \| JuniorDTECH preparation` |

All three pass the feed's metadata validation, then the slot parser rejects
`Preparation` with **Invalid slot type or duplicate slot number.** These cards
each have only one slot, so the invalid type, not a duplicate number, causes
the failure. No room or end-time field is required. The trailing sentence
`Draft preparation; lesson progress and room not confirmed.` is currently a
continuation of `Details:` and is not itself a parsing error.

For the Whanau card, an appropriate existing type is `Whānau`. For a Typing Kit
routine, use `Routine` or `Kit`; put a separate lesson activity in an `Activity`
or `Unit Library` slot. Session-wide draft/preparation warnings belong under
`## Preparation & reminders`. Do not invent a new type named `Preparation`.

## Copyable master template

Copy **only the contents** of the following block into the Trello description,
not its outer Markdown code fences. Replace every `{PLACEHOLDER}` before use.
Remove optional fields or sections that do not apply. The three filled examples
below can also be copied and adapted.

```text
[TEACHING_DASHBOARD_V1]
teaching_date: {YYYY-MM-DD}
session_slot: {whanau-or-p1-to-p5}
class_key: {EXACT_TIMETABLE_CLASS_KEY}
session_type: {whanau-or-teaching}
start_time: {HH:mm}
display_title: {TEACHER_FACING_SESSION_TITLE}
room: {VERIFIED_ROOM}
home_list: {VERIFIED_CLASS_HOME_LIST_NAME}
course: {COURSE_NAME}
unit: {UNIT_NAME}
[/TEACHING_DASHBOARD_V1]

## Teaching slots

### SLOT 1 | Routine | {ACTIVITY_TITLE}
Reminder: {SHORT_REMINDER}
Unit: {UNIT_NAME}
Lesson: {LESSON_NAME}
Details: {FIRST_INSTRUCTION}
- {ANOTHER_INSTRUCTION}
Resources:
- Unit Plan | {UNIT_PLAN_LINK_TITLE} | {HTTPS_UNIT_PLAN_URL}
- Lesson Plan | {LESSON_PLAN_LINK_TITLE} | {HTTPS_LESSON_PLAN_URL}
- Print Resources | {PRINT_RESOURCE_TITLE} | {HTTPS_PRINT_RESOURCE_URL}
- Web Links | {WEB_RESOURCE_TITLE} | {HTTPS_WEB_RESOURCE_URL}

## Preparation & reminders
{SESSION_WIDE_PREPARATION_AND_REMINDERS}

## Continuation
{CONDITIONAL_NEXT_SESSION_INSTRUCTIONS_WITHOUT_CLAIMING_COMPLETION}
```

Repeat the `### SLOT ...` section for additional routines, kits, activities or
unit-library lessons. Change the type to one of the valid values below. The
master's resource categories demonstrate syntax; do not add irrelevant links
to every routine.

## Metadata: required and optional fields

Use one metadata block at the beginning. No title, introduction or code fence
may precede it; blank whitespace is permitted. Delimiters must be on separate
lines, exactly as shown. Canonically, do not indent them or add trailing spaces.
LF and CRLF line endings are supported.

Every field uses `lowercase_key: value` on one line. Values are trimmed, must
not exceed 200 characters, and cannot contain newlines. A key may occur only
once. The following is the complete server-approved field list:

| Field | Required | Valid value and meaning |
| --- | --- | --- |
| `teaching_date` | Yes | Real date `YYYY-MM-DD`, between 2000-01-01 and 2100-12-31. The teaching date in Pacific/Auckland, not a UTC timestamp. |
| `session_slot` | Yes | Exactly `whanau`, `p1`, `p2`, `p3`, `p4` or `p5`. |
| `class_key` | Yes | Exact uppercase timetable reference; regex `^[A-Z0-9][A-Z0-9_-]{0,39}$`. Examples: `9WHAU`, `JPI`, `JSR`, `81D`. For `PIDTECH (JPI)` use `JPI`, not `PIDTECH`. For `SRDTECH (JSR)` use `JSR`. |
| `session_type` | Yes | `whanau` for `session_slot: whanau`; `teaching` for `p1`-`p5`. Other session types are not supported by this Trello preparation feed. |
| `start_time` | Yes | Pacific/Auckland local 24-hour `HH:mm`, from `00:00` to `23:59`. Use the verified timetable start, not an invented time. |
| `display_title` | Yes | Non-empty teacher-facing session title. |
| `room` | No | Verified room label; omit when unknown. |
| `home_list` | No | Verified class home-list name, e.g. `JPI` or `MDTECH`; not a Trello list ID in this format. When read from a class home list, it must agree with that list's name or the matched class key. The server separately verifies board membership. |
| `course` | No | Informational course name. Not used to override class matching or shown as a raw metadata field. |
| `unit` | No | Informational session unit name. To display unit information in a selected activity, also use the slot's `Unit:` field. |

Do not add `end_time`, `timezone`, `schema_version`, `preparation_status` or
other keys to this block. The server rejects unknown fields. The timezone is
already Pacific/Auckland; the feed obtains the end time from the existing slot
definition:

| Slot | Local start | Local end |
| --- | --- | --- |
| `whanau` | 08:45 | 09:00 |
| `p1` | 09:00 | 10:00 |
| `p2` | 10:00 | 11:00 |
| `p3` | 11:20 | 12:20 |
| `p4` | 12:20 | 13:20 |
| `p5` | 14:00 | 15:00 |

The server also supports a different fenced JSON source-reference format for
older read-only cards. Do **not** mix that block with TEACHING_DASHBOARD_V1.
Use TEACHING_DASHBOARD_V1 for the colour-coded slot interface.

## Headings, slots and fields

The first section after the metadata must be exactly:

```text
## Teaching slots
```

It must be followed by a newline. There must be between **1 and 50 slots**.
Each slot starts with:

```text
### SLOT 1 | Routine | Activity title
```

- `SLOT` is uppercase. The number is a unique positive integer, without leading
  zeroes. It is an activity sequence number, not the timetable period.
- Use the exact spaces around the two `|` delimiters shown above.
- The title must be non-empty. Avoid `|` inside names or titles.
- Slot order is document order; numbers do not cause sorting.
- Types are case-sensitive and must be exactly one of:

| Type | Display colour | Use |
| --- | --- | --- |
| `Routine` | Green | Established recurring routine, such as Typing Kit. |
| `Kit` | Teal | Practical kit work. |
| `Activity` | Purple | Lesson activity, review, explanation or application. |
| `Unit Library` | Orange | Unit/lesson-library activity with its named resources. |
| `Whānau` | Blue | Whanau activity; the type requires the macron. Metadata uses ASCII `whanau`. |

The complete slot-field list is below. Each field is optional, but a useful
canonical card includes `Details:`. Use each field at most once per slot.
Field names and capitalisation must match exactly.

| Field | Format / effect |
| --- | --- |
| `Details:` | Activity instructions. May continue over multiple lines, including blank lines and `-` bullet lines, until another recognised field or heading. |
| `Reminder:` | One-line reminder badge. |
| `Unit:` | One-line unit name displayed in the selected activity. Not a link field. |
| `Lesson:` | One-line lesson name displayed in the selected activity. Not a link field. |
| `Resources:` | Must have **no value on its own line**. Follow with named resource entries, one per line. |
| `Resource:` | Optional legacy single-resource display name. May coexist with `Resources:`. Prefer the categorised list for new cards. |
| `Resource URL:` | Optional legacy single-resource URL. Use with `Resource:`; blank or `unresolved` leaves the link unavailable unless a unique existing programme resource can resolve it. |

Put multiline instructions under `Details:`, not under `Reminder:`, `Unit:`
or `Lesson:`. Plain text before the first slot is invalid. Extra `## ...`
sections or unrecognised `### ...` headings are invalid, even inside details.
Do not use field-like lines such as `Lesson:` as ordinary prose unless you
intend to start that field.

After the final slot, these two session-wide sections are optional. Each may
appear only once; names are case-sensitive:

```text
## Preparation & reminders
Plain text and bullet lines for session-wide preparation.

## Continuation
Plain text and bullet lines for conditional continuation.
```

Keep all slots before these sections. Do not put additional SLOT headings in
either panel. These panels render as preserved text, not as Markdown resource
links; put clickable resources in a slot's `Resources:` list.

## Resource links

The preferred syntax is:

```text
Resources:
- Unit Plan | Unit overview | https://example.invalid/unit-plan
- Lesson Plan | Lesson instructions | https://example.invalid/lesson-plan
- Print Resources | Printable worksheet | https://example.invalid/worksheet.pdf
- Web Links | Online activity | https://example.invalid/activity
```

The **four exact category names** are `Unit Plan`, `Lesson Plan`,
`Print Resources` and `Web Links`. "Web Resources" is a description, **not a
valid category name**. Use `Web Links` for those resources.

An uncategorised entry is also accepted:

```text
Resources:
- Resource name | https://example.invalid/resource
```

It appears under Web Links. A URL may be omitted, left blank or set to
`unresolved`; the teacher sees **Link unavailable**, not an invented URL.
Supply verified absolute HTTPS URLs for new cards. The renderer also accepts
HTTP URLs but rejects credentials in URLs and unsafe schemes. Never include
API tokens or secrets. Use `Name | URL`, **not** `[Name](URL)` in this list.
Names must not contain `|`; encode literal pipes in URLs as `%7C`.

Google Drive documents, printable PDFs and normal website URLs use the same
syntax. Keep their existing sharing permissions; a link does not grant access.
For example:

```text
Resources:
- Unit Plan | Approved unit plan | https://docs.google.com/document/d/REPLACE_WITH_UNIT_DOCUMENT_ID/edit
- Lesson Plan | Approved lesson plan | https://docs.google.com/document/d/REPLACE_WITH_LESSON_DOCUMENT_ID/edit
- Print Resources | Worksheet PDF | https://drive.google.com/file/d/REPLACE_WITH_WORKSHEET_FILE_ID/view
- Web Links | Typing practice | https://www.typingtest.com/
```

Replace the document/file IDs with verified IDs. Do not publish the example
links as if they were real resources.

## Example 1: Whanau routine

This example uses the verified Friday Whanau date/class/slot. The instructions
are illustrative intentions, not confirmed attendance or progress.

```trello
[TEACHING_DASHBOARD_V1]
teaching_date: 2026-11-27
session_slot: whanau
class_key: 9WHAU
session_type: whanau
start_time: 08:45
home_list: 9WHAU
display_title: Whānau check-in
[/TEACHING_DASHBOARD_V1]

## Teaching slots

### SLOT 1 | Whānau | Roll and welcome
Details: Take the roll in KAMAR and welcome the class.
- Follow up any matters through the existing authorised school systems.

### SLOT 2 | Whānau | Notices and check-in
Details: Review the current school notices and identify any preparation needed.
- Do not copy individual student details into this card.

## Preparation & reminders
Check the current notices before the session. Room is not confirmed.

## Continuation
Carry forward only unresolved general reminders. Do not infer attendance or completion.
```

## Example 2: JuniorDTECH with multiple routines and activities

The date/class/slot below match the verified Friday JPI session. The sequence
is an illustrative plan: confirm the intended lesson against existing progress.
The example.invalid resource URLs are placeholders, not verified school links.
Replace them or omit those entries before publishing.

```trello
[TEACHING_DASHBOARD_V1]
teaching_date: 2026-11-27
session_slot: p2
class_key: JPI
session_type: teaching
start_time: 10:00
home_list: JPI
display_title: Binary review and encoding practice
course: JuniorDTECH
unit: Binary & Data
[/TEACHING_DASHBOARD_V1]

## Teaching slots

### SLOT 1 | Routine | Typing Kit
Details: Complete the established keyboarding routine and record results in the existing learning resource.
Resources:
- Web Links | Typing practice | https://www.typingtest.com/

### SLOT 2 | Kit | Minecraft routine
Details: Use the appropriate existing Minecraft kit for the current stage.
- Keep work separate from confirmed lesson progress.
Resources:
- Web Links | Minecraft Player Kit | https://dtech-hub2.onrender.com/practical-skills/kit-worksheet.html?kit=kit-minecraft
- Web Links | Minecraft Builder Kit | https://dtech-hub2.onrender.com/practical-skills/kit-worksheet.html?kit=kit-minecraft-builder-kit

### SLOT 3 | Activity | Review binary representations
Reminder: Confirm the previous lesson before advancing
Unit: Binary & Data
Lesson: Binary review
Details: Review the previous lesson and use a short explanation or example to check understanding.
Resources:
- Print Resources | Binary review worksheet | https://example.invalid/junior/binary-review.pdf

### SLOT 4 | Unit Library | Encoding binary
Unit: Binary & Data
Lesson: Encoding Binary
Details: If the review supports continuing, model the encoding task and allow guided practice.
- If not, retain the review activity and adjust the proposed continuation.
Resources:
- Unit Plan | Binary & Data unit plan | https://example.invalid/junior/binary-unit-plan
- Lesson Plan | Encoding Binary lesson plan | https://example.invalid/junior/encoding-lesson-plan
- Web Links | Encoding practice | https://example.invalid/junior/encoding-practice

## Preparation & reminders
Verify the unit and lesson links. Prepare any approved worksheet.
Room and lesson progress must be checked independently.

## Continuation
After teaching, check confirmed class progress before planning the next lesson.
Do not mark progress complete from this proposed sequence.
```

For the verified Friday JSR preparation, adapt the class-specific plan and
change metadata to `session_slot: p3`, `class_key: JSR`, `start_time: 11:20`,
`home_list: JSR`. Do not assume that JSR follows JPI's unit or activities.

## Example 3: MiddleDTECH with unit, lesson, resources and continuation

This example uses an illustrative `81D` / `p5` / `14:00` session.
Replace the date, class and slot with the verified timetable before publishing.
`MDTECH` is the class-home-list label, not the timetable class key. All
example.invalid links below must be replaced with verified resource URLs.

```trello
[TEACHING_DASHBOARD_V1]
teaching_date: 2026-11-27
session_slot: p5
class_key: 81D
session_type: teaching
start_time: 14:00
home_list: MDTECH
display_title: Design brief and prototype planning
course: MiddleDTECH
unit: Design and prototyping
[/TEACHING_DASHBOARD_V1]

## Teaching slots

### SLOT 1 | Routine | Prepare the workspace
Details: Open the existing project resource and organise the materials needed for this lesson.

### SLOT 2 | Unit Library | Develop the design brief
Unit: Design and prototyping
Lesson: Brief development
Details: Review the intended outcome, users and constraints.
- Model the brief-development process using the approved example.
Resources:
- Unit Plan | Design and prototyping unit plan | https://example.invalid/middle/unit-plan
- Lesson Plan | Brief development lesson plan | https://example.invalid/middle/brief-lesson-plan
- Print Resources | Design brief worksheet | https://example.invalid/middle/design-brief.pdf
- Web Links | Design examples | https://example.invalid/middle/design-examples

### SLOT 3 | Activity | Plan and evaluate a prototype
Reminder: Retain evidence in the existing project system
Unit: Design and prototyping
Lesson: Prototype planning
Details: Sketch a proposed solution and explain how it addresses the brief.
- Identify one improvement and the evidence needed to evaluate it.
Resources:
- Print Resources | Prototype planning sheet | https://example.invalid/middle/prototype-sheet.pdf

## Preparation & reminders
Verify the approved unit, lesson and worksheet links.
Prepare materials without copying private student information into Trello.

## Continuation
If the brief and design are ready, propose prototype construction next.
Otherwise continue brief development. Confirm outcomes in Planner before advancing.
```

## Automation checklist and rendering safeguards

1. Use the verified date, timetable class key and session slot. Do not guess a
   room, unit, resource URL or completed outcome.
2. Write one metadata block and one `## Teaching slots` section.
3. Use only the five valid slot types and unique positive slot numbers.
4. Keep field names, resource category names, delimiters and heading case exact.
5. Put resources under an empty `Resources:` line. Put session-wide preparation
   and conditional next steps in their named panels.
6. Do not wrap the entire Trello description in a code fence. Code fences here
   are only for copying the examples.
7. Maintain the original stable card ID when updating an existing card. Do not
   duplicate an existing date/class/slot preparation reference.
8. Future cards may remain in their verified class home lists; selecting a
   future date in Planner does not move cards or change automation's actual date.
9. Never include student records, credentials or API tokens.

When parsing succeeds, the teacher sees the friendly class/title/date/time
header, activity sequence, selected activity, named resource links and support
panels. The raw `[TEACHING_DASHBOARD_V1]` block and internal keys such as
`home_list` are **not** rendered. Normal teacher-facing values such as class,
date, start time and an optional verified room are intentionally displayed.

Genuinely malformed slot descriptions continue to show the explicit warning
and the original read-only card. Invalid or ambiguous matching metadata remains
unassigned by the server. The raw fallback is intentional; this contract does
not suppress failures or reinterpret malformed content.

## Verification

- All three live descriptions passed server metadata validation and reproduced
  the exact invalid-slot-type error locally. A type-only correction passed
  locally; no live card was modified.
- All three filled examples passed server metadata validation, slot parsing,
  every activity's rendering, supplied resource-link rendering and checks that
  internal metadata keys/markers were absent from teacher-facing output.
- The existing Period Planner and Teaching Day Trello suites passed:
  **54 passed, 0 failed, 0 skipped**, using project Node **22.23.4**.
  These include malformed-card fallback and Notes independence checks.
- Live display after ChatGPT updates the cards has not yet been tested.
