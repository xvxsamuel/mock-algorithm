# AGENTS.md

Instructions for AI coding assistants (and humans) working in this repo.
The team is 4 students, several new to Git. Follow these rules exactly.
If a rule gets in the way of the task, **stop and ask the human** instead of working around it.

## Project

**Mock Algorithm**: a React web app that shows how short-form video algorithms
and endless scrolling affect users.

- Live site: https://xvxsamuel.github.io/mock-algorithm/
- Repo: https://github.com/xvxsamuel/mock-algorithm

## Stack

- React 19 + TypeScript (strict mode)
- Vite 8
- ESLint (typescript-eslint, react-hooks, react-refresh) + Prettier
- GitHub Actions: `ci` check on every pull request, automatic deploy to GitHub Pages from `main`
- Node 24 LTS (see `.nvmrc`)

## Commands

| Command                | What it does                                                         |
| ---------------------- | -------------------------------------------------------------------- |
| `npm install`          | Install dependencies (after cloning, or when `package.json` changes) |
| `npm run dev`          | Start the dev server at http://localhost:5173/mock-algorithm/        |
| `npm run build`        | Type-check and build the production site into `dist/`                |
| `npm run preview`      | Serve the built `dist/` locally                                      |
| `npm run lint`         | Check code with ESLint                                               |
| `npm run lint:fix`     | Auto-fix ESLint problems where possible                              |
| `npm run format`       | Format all files with Prettier                                       |
| `npm run format:check` | Check formatting without changing files (CI runs this)               |

## Git workflow

Branches:

- `main`: the live website. Protected. Only updated by a release PR from `dev`.
- `dev`: where finished work is collected. Default branch. Protected.
- `feature/<short-name>` or `fix/<short-name>`: your work, always branched from `dev`.

Steps for every task:

1. `git switch dev` then `git pull`
2. `git switch -c feature/short-name` (or `fix/short-name`), lowercase with dashes
3. Make the change. Commit in small steps with clear messages.
4. Run the checks in [Before pushing](#before-pushing).
5. `git push -u origin feature/short-name`
6. Open a pull request **into `dev`** and fill in the template (see [Pull requests](#pull-requests)).
7. When `ci` is green and one teammate has approved, **Squash and merge**. The branch is deleted automatically.

To bring the latest `dev` into your branch: `git switch dev`, `git pull`,
`git switch <your-branch>`, `git merge dev` (or click **Update branch** on the PR).

Releasing: open a PR from `dev` into `main` and merge it with a merge commit.
Merging into `main` deploys the site automatically.

**Never:**

- commit or push directly to `main` or `dev`
- `git push --force` or `--force-with-lease`
- `git reset --hard`
- `git rebase` or `git pull --rebase`
- run commands that throw away uncommitted work (`git clean`, `git checkout -- .`, `git restore .`) unless the human asks for exactly that
- resolve a merge conflict by deleting someone else's code. If there is a conflict you don't fully understand, stop and ask.

## Scope

- Only touch files the task needs. No unrelated refactors, renames, or reformatting.
- Don't change config files (`package.json`, `vite.config.ts`, `tsconfig*.json`,
  `eslint.config.js`, `.prettierrc`, `.github/**`) unless that is the task.
- **Ask before adding packages.** Say which package and why, and wait for a yes.
  Never run `npm install <package>` on your own.

## Folder structure

```
src/
  algorithm/   Pure TypeScript logic for the mock recommendation algorithm.
               No React, no DOM, no imports from components/ or hooks/.
  components/  React components. PascalCase file names, one component per file (VideoCard.tsx).
  hooks/       Custom React hooks (useFeed.ts).
  data/        Static typed data: mock videos, categories, texts.
  App.tsx      Top-level layout.
  main.tsx     Entry point. Don't change.
  index.css    Global styles.
public/        Files served as-is (favicon, etc.).
.github/       CI/deploy workflows and PR template. Don't change.
```

Imports flow one way: `components` -> `hooks` -> `algorithm` / `data`.

## TypeScript

- Strict mode is on. Give everything proper types; define and export types
  for your data (e.g. `export type Video = { id: string; ... }`).
- No `any`. Use a real type, or `unknown` and narrow it.
- No `@ts-ignore`, `@ts-nocheck`, or `@ts-expect-error`, and no `eslint-disable` comments.
  Fix the error instead of hiding it.
- Avoid casts like `as unknown as X` and the non-null `!` operator; check for `null`/`undefined` instead.

## GitHub Pages rules

The site lives at `/mock-algorithm/`, not at `/`. So:

- Never hardcode root paths like `"/images/cat.png"` or `href="/about"` in code.
- Images and assets in `src/`: import them (`import cat from './cat.png'`) and use the variable.
- Files in `public/`: build the URL with `import.meta.env.BASE_URL`,
  e.g. `` `${import.meta.env.BASE_URL}videos/clip.mp4` `` (BASE_URL already ends with `/`).
- If the app needs multiple pages, use `HashRouter` from React Router (ask before adding the package).
  Never `BrowserRouter`: it breaks on GitHub Pages when a page is refreshed.

## Secrets and large files

- No secrets: no API keys, tokens or passwords in code or commits. The repo and the site are public,
  and anything bundled into the app (including `VITE_*` env variables) is visible to everyone.
- `.env` files are git-ignored. Never commit them.
- No files over 50 MB. Keep images and videos small and compressed.

## Before pushing

Run these and fix every error before you push:

```
npm run lint
npm run format
npm run build
```

CI runs `lint`, `format:check` and `build` on every pull request.
A PR cannot be merged until the `ci` check is green.

## Pull requests

- Target branch: `dev` (only release PRs go from `dev` into `main`).
- Fill in every section of the PR template. The description **must name the
  Scrumwise user story** this PR belongs to.
- One user story/task per PR. Keep PRs small.
- Needs 1 approval from a teammate and a green `ci` check.

## When unsure

Stop and ask the human. This is especially important for anything involving Git history,
deleting files, adding packages, or changing config.
