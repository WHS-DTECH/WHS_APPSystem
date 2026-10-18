# Screenshot Development Library TODO

Status: proposed future project, to follow Teacher Planner. No implementation yet.

## Goal

Provide a quick visual browser for locally stored Windows screenshots, organised
by development project, without uploading images to Global Control, Render,
GitHub or another service.

## Architecture decision

- [ ] Confirm the preferred implementation before building.
  - Recommended long-term option: a small Windows companion application for
    folder watching, clipboard support and opening files in Explorer.
  - Alternative prototype: a browser-only library using explicitly granted local
    folder access in supported desktop Chrome/Edge browsers. Permissions may need
    renewing, and background watching and Windows integration are limited.
- [ ] Keep image processing and storage local. A Render-hosted application cannot
  freely browse Windows folders.
- [ ] Add a Global Control / Module Builder dashboard entry with instructions or
  a supported launch mechanism for the local library. Do not assume a web link
  can launch a desktop application without registration and user consent.
- [ ] For a desktop implementation, agree packaging, installation and updates.

## First release

- [ ] Let the user explicitly select the screenshot folder.
- [ ] Display a newest-first thumbnail grid.
- [ ] Provide a large preview, zoom and next/previous navigation.
- [ ] Support single and multiple selection.
- [ ] Filter by date, filename and project.
- [ ] Copy a selected image to the clipboard.
- [ ] Copy filenames; support opening files or their containing folder where the
  chosen platform permits it.
- [ ] Assign local project labels/collections, such as Teacher Planner, DTECH Hub
  and Bugs to Fix.
- [ ] Store collection membership as references to original files; do not move
  screenshots merely to organise them.
- [ ] Store optional notes, labels, thumbnails and indexes locally.
- [ ] Provide refresh and, where supported, automatic detection of new screenshots.
- [ ] Display permission, missing-file, unreadable-image and clipboard errors
  clearly, with appropriate recovery actions.

## Privacy and file safety

- [ ] No image uploads, cloud sync, analytics or remote image processing.
- [ ] Access only folders deliberately selected by the user.
- [ ] Default to read-only browsing.
- [ ] Keep local metadata out of the Global Control production database.
- [ ] Check whether the screenshot folder is already synced by OneDrive or
  another service. Recommend a folder outside synced locations when genuinely
  local-only storage is required.
- [ ] If file renaming, moving or deletion is introduced, require deliberate user
  actions and use the Windows Recycle Bin where supported.
- [ ] Treat attaching/exporting an image to a conversation or external service as
  a separate explicit action; explain that it transfers the selected image.
- [ ] Avoid embedding remote assets or telemetry in the local library.

## Later enhancements

- [ ] Side-by-side before/after comparisons.
- [ ] Optional rename/move/Recycle Bin actions after the browsing workflow is
  proven useful.
- [ ] Local metadata backup/export and recovery.

## Acceptance checks

- [ ] Browsing, previewing, organising and copying work without uploading images
  or metadata; verify network behaviour.
- [ ] A fresh screenshot appears after refresh or the supported folder watcher.
- [ ] Original files remain unchanged during ordinary browsing and labelling.
- [ ] Folder permissions can be denied or revoked without silent failure.
- [ ] Handle moved/deleted files, duplicate filenames and large screenshot folders.
- [ ] Check keyboard navigation, readable previews and clipboard compatibility on
  the actual Windows/browser setup.
- [ ] If using a desktop companion, verify Global Control stays responsive when
  the companion is absent or stopped.

## Out of scope for now

- Building the screenshot library before Teacher Planner.
- Hosting or storing screenshots on Render, GitHub or Global Control.
- Automatically attaching images to chats or documentation.
- Replacing the wider Module Builder project.
