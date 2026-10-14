# Mock Algorithm

An interactive web app about how short-form video algorithms and endless scrolling
affect the people using them. Built with React, TypeScript and Vite by a team of 4 students.

**Live site:** https://xvxsamuel.github.io/mock-algorithm/

## Setup

You need [Git](https://git-scm.com/) and [Node.js](https://nodejs.org/) 24 LTS.

```bash
git clone https://github.com/xvxsamuel/mock-algorithm.git
cd mock-algorithm
npm install
npm run dev
```

Then open http://localhost:5173/mock-algorithm/ in your browser.

## Workflow

Never work directly on `main` or `dev`. For every task:

1. `git switch dev`
2. `git pull`
3. `git switch -c feature/short-name` (use `fix/short-name` for bug fixes)
4. Make your changes and check them in the browser with `npm run dev`.
5. Run `npm run lint`, `npm run format` and `npm run build`, and fix any errors.
6. `git add .` then `git commit -m "Describe what you changed"`
7. `git push -u origin feature/short-name`
8. On GitHub, open a pull request into **`dev`** and fill in the template, including the Scrumwise user story.
9. Wait for the green `ci` check. Reviews from teammates are welcome but not required. To fix something, just commit and push again.
10. Click **Squash and merge**, then go back to step 1 for your next task.

Releasing: open a pull request from `dev` into `main`. Merging it updates the live site automatically.

## More

- [AGENTS.md](AGENTS.md): the full project rules. AI coding assistants read this file too.
- All commands: `npm run dev`, `build`, `preview`, `lint`, `lint:fix`, `format`, `format:check`.
