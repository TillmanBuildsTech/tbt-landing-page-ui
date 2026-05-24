---
name: "prepare-software-release"
description: "Prepare any software project for a release by running lint/tests, verifying test coverage for changed code, updating docs and changelog, and enforcing version + git tag discipline."
keywords: ["release prep", "prepare release", "release checklist", "lint", "unit tests", "changelog", "version bump", "git tag"]
applyTo: ["prepare for release", "release readiness", "pre-release", "cut a release", "release checklist", "version and changelog"]
stage: operations
domain: software-delivery
harnesses: ["copilot", "claude"]
---

# Prepare Software Release Skill

## Description

Use this skill to run a repeatable pre-release workflow for almost any codebase.

It helps ensure that quality gates pass, changes are tested, user-facing docs are updated,
and the release is versioned and tagged in a consistent way.

## Goal

- Discover and run linting and test commands for the project.
- Check that new or changed behavior is covered by tests.
- Ensure documentation and release notes are updated.
- Update version metadata using the repo's release process.
- Create a Git tag for the release version.
- Produce a final release readiness summary with any blockers.

## Inputs

Collect these from the user if they are not obvious from the repo:

1. Target release type (`patch`, `minor`, `major`, or custom)
2. Scope (`full release` or `dry-run`)
3. Base branch and release branch names (if workflow requires both)
4. Whether tagging/pushing is allowed in this run

Optional:

- Conventional commits policy in use
- Required test suites (unit only vs integration/e2e too)
- Required documentation surfaces (README, docs site, API docs)

## Decision Flow

### 1. Identify Project Stack and Existing Release Process

- Inspect project files for ecosystem clues (`package.json`, `pyproject.toml`, `pom.xml`, `build.gradle`, `go.mod`, `Cargo.toml`, `.csproj`, `Makefile`, `justfile`, CI config).
- Look for explicit release/version docs (`CONTRIBUTING.md`, `README.md`, `docs/`, `CHANGELOG.md`, `VERSION`, release scripts).
- If a documented project-specific release process exists, follow it first.

### 2. Discover Candidate Commands

Use repository-native commands before inventing new ones.

Common discovery order:

1. Package scripts/tasks (`npm run`, `pnpm run`, `yarn`, `bun run`, `make`, `just`)
2. Language-native test/lint tools
3. CI config as source of truth

Suggested command mapping:

- JavaScript/TypeScript:
  - Lint: `npm run lint`, `pnpm lint`, `yarn lint`, `bun run lint`
  - Test: `npm test`, `npm run test:unit`, `pnpm test`, `yarn test`, `bun test`
- Python:
  - Lint: `ruff check .`, `flake8`, `pylint`
  - Test: `pytest`, `python -m unittest`, `tox -e py`
- Java:
  - Lint/style: `mvn checkstyle:check`, `./gradlew check`
  - Test: `mvn test`, `./gradlew test`
- Go:
  - Lint: `golangci-lint run` (if configured), `go vet ./...`
  - Test: `go test ./...`
- Rust:
  - Lint: `cargo clippy --all-targets --all-features -- -D warnings`
  - Test: `cargo test --all-features`
- .NET:
  - Lint/analyzers: `dotnet format --verify-no-changes` (if configured)
  - Test: `dotnet test`

If multiple commands exist, use the same set used in CI unless the user says otherwise.

### 3. Run Lint and Tests

- Run lint first.
- Run unit tests at minimum.
- If repo requires additional suites for release (integration/e2e/smoke), run them too.
- Capture command output, failures, and exit codes.

If commands are missing or unclear:

- Ask the user to confirm preferred commands.
- Propose a best-practice default for the detected stack.

### 4. Verify Test Coverage for New Changes

- Compare changed files from the current branch/diff.
- Confirm corresponding tests were added/updated for behavior changes.
- If no tests were added for meaningful logic changes, mark as release blocker.

Coverage verification checklist:

1. New logic paths have at least one automated test.
2. Bug fixes include a regression test where practical.
3. Failing tests reproduce expected behavior when applicable.
4. Existing tests still pass.

### 5. Documentation and Changelog

- Update user-facing docs impacted by the release.
- Ensure `CHANGELOG.md` contains a clear entry for this release or PR:
  - What changed
  - Why it changed (if non-obvious)
  - Any migration/upgrade notes
- Keep format consistent with repo conventions (for example Keep a Changelog or custom sections).

### 6. Versioning Process

- Detect existing version source of truth (`package.json`, `pyproject.toml`, `Cargo.toml`, `pom.xml`, `VERSION`, etc.).
- Detect existing bump process (script/tool/command).
- Always increment version for release work.

If no versioning process is defined:

1. Pause and ask user to choose a versioning policy (recommend Semantic Versioning by default).
2. Propose a concrete process for this stack (where version lives, how to bump, how to publish).
3. Do not guess silently.

### 7. Git Tagging

- Create an annotated Git tag for the release version (for example `v1.4.2`).
- Tag message should summarize the release.
- Confirm whether tag push should occur now.

If repository does not yet use tags:

- Explain why tags are recommended for release traceability.
- Ask permission to initialize a tag-based release history starting with this release.

### 8. Final Release Readiness Report

Provide a concise report with:

- Commands run and their pass/fail status
- Test coverage assessment for changed code
- Docs updated (yes/no + files)
- Changelog updated (yes/no)
- Version before/after
- Tag created/pushed status
- Explicit blockers and next actions

## Modes

### Autonomous Mode

Use when user asks for direct execution, such as:

- "Prepare this repo for a release"
- "Run release checklist"
- "Do a pre-release pass"

Behavior:

1. Discover workflow and commands.
2. Execute lint/tests/checks.
3. Apply required docs/changelog/version updates.
4. Prepare tag and summary.
5. Ask before destructive or external actions (push, publish, deploy).

### Advisory Mode

Use when user asks for guidance only:

- "How should I prepare this project for release?"
- "Give me release checklist for this stack"

Behavior:

- Produce exact commands and file checklist without running commands.

## Completion Criteria

Task is complete only when all are true:

1. Lint passes (or failures are documented and accepted by user).
2. Required tests pass.
3. New/changed behavior has test coverage or an explicit approved exception.
4. Docs are updated for user-visible changes.
5. `CHANGELOG.md` is updated with release-relevant details.
6. Version is incremented according to policy.
7. Git tag is prepared/created with user approval.
8. Final readiness report is delivered.

## Example Prompts

- "Prepare this repo for a patch release and show blockers."
- "Run a dry-run release readiness check for this branch."
- "Find lint and test commands in this project and run them."
- "Update changelog, bump version, and create an annotated git tag for this release."
- "Set up a versioning process for this repo before release."
