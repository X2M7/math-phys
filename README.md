# Quartz v4

## Math-Phys development

Use Node.js **26.13.0** (the version in `.node-version` and Docker) and npm >=10.9.2.
The supported Node.js minimum is 22.12.0; Node typings stay on the 22.x line.

```sh
npm ci
npm run check
npm test
npx quartz build
# Preview locally:
npx quartz build --serve
```

### Dependency maintenance — 2026-11-10

Dependencies and the lockfile have been refreshed, including Sharp 0.35.5,
Satori 0.63.2, TOML 5.0.1, minimatch 11.0.5, Shiki 4.6.0, esbuild 0.28.2,
and TypeScript 6.0.3. TypeScript now uses bundler module resolution to match
Quartz's esbuild pipeline. CI checks both the site and documentation on `main`.

Two overrides remain necessary until upstream dependency ranges catch up:

- `katex: "$katex"` keeps remark/rehype on the same patched KaTeX version as
  the explicitly declared dependency and generated CDN URLs. The old 0.16.x
  range is affected by [GHSA-238p-pmpm-9mq7](https://github.com/KaTeX/KaTeX/security/advisories/GHSA-238p-pmpm-9mq7).
- `satori > fflate: ^0.8.2` replaces Satori's vulnerable 0.7.x dependency,
  including its font parser dependency, with the patched compatible API.

Preact 11, TypeScript 7, js-yaml 5, chokidar 6, simple-git 1, and Typst 0.7
are deferred to separate migrations. This update retains their existing
release lines (TypeScript moves to 6) while applying available security fixes.
Mermaid's browser CDN dependency is updated separately to 11.17.2.

Validation completed with Node 26.13.0 and 22.23.4: type/style checks, all 86
tests, and the content build pass. The 76-file documentation build also passes
on Node 26. A clean `npm ci` and `npm audit` report zero known vulnerabilities.
Chromium checks pass for both language switches, bilingual search, local/global
graphs, Mermaid, and all six sample Upmath images, with no browser or network
errors.

Docker was also validated on Linux amd64 using an isolated rootless Docker
29.8.2 daemon. The image builds from `node:26.13.0-slim`, installs from the lockfile,
and passes type/style checks, all 86 tests, both content/documentation builds,
and `npm audit` (zero known vulnerabilities) inside the container. The image
excludes nested `.quartz-cache` directories and generated `public` files.
The default preview command serves `/`, `/en/`, and `/zh/`; WebSocket reload
notifications and adding/editing notes work.

The deletion check exposed an existing preview limitation: deleting a Markdown
file removes it from the content index and sends a reload notification, but the
previously generated HTML remains accessible. The affected incremental emitter
was unchanged by this dependency update. A full build clears stale output.

```sh
docker build -t math-phys:deps-20261110 .
docker run --rm math-phys:deps-20261110 sh -c \
  'npm run check && npm test && npx quartz build && npx quartz build -d docs -o public/docs && npm audit'
docker run --rm -p 127.0.0.1:8080:8080 -p 127.0.0.1:3001:3001 math-phys:deps-20261110
```

> “[One] who works with the door open gets all kinds of interruptions, but [they] also occasionally gets clues as to what the world is and what might be important.” — Richard Hamming

Quartz is a set of tools that helps you publish your [digital garden](https://jzhao.xyz/posts/networked-thought) and notes as a website for free.
Quartz v4 features a from-the-ground rewrite focusing on end-user extensibility and ease-of-use.

🔗 Read the documentation and get started: https://quartz.jzhao.xyz/

[Join the Discord Community](https://discord.gg/cRFFHYye7t)

## Sponsors

<p align="center">
  <a href="https://github.com/sponsors/jackyzha0">
    <img src="https://cdn.jsdelivr.net/gh/jackyzha0/jackyzha0/sponsorkit/sponsors.svg" />
  </a>
</p>
