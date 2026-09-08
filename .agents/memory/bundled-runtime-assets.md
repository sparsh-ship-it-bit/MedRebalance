---
name: Bundled runtime assets
description: Preserve non-code files required by bundled Node.js dependencies.
---

Bundling a Node.js dependency can change the runtime directory used by code that loads adjacent assets, such as SQL migrations. The build must preserve those assets beside the bundled entrypoint.

**Why:** A bundled Stripe sync server started successfully but silently skipped migrations because its SQL files were not present under the output directory, causing missing-table failures later.

**How to apply:** When a dependency uses filesystem-relative assets, inspect its runtime path after bundling and copy or otherwise package the required assets into the same relative location.