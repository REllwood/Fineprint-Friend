<div align="center">

# Fineprint Friend

**Turn a long policy into an evidence-linked reading guide and a list of questions worth asking.**

[![License: MIT](https://img.shields.io/badge/license-MIT-2f6f4e?style=flat-square)](LICENSE)
![Node 22+](https://img.shields.io/badge/node-%3E%3D22-43853d?style=flat-square&logo=node.js&logoColor=white)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-555?style=flat-square)

</div>

Terms of service and privacy policies are long, and the parts that matter are spread through them. Fineprint Friend reads one with you. It numbers every paragraph, points out the clauses worth a closer look (renewal, cancellation, data sharing), links each prompt to the exact text, and helps you write down the questions you'd want answered. It runs offline and doesn't give legal advice.

## What it does

- Paste text in, or open a local text or HTML file
- Numbers and keeps every source paragraph intact
- Spots a focused set of clause types using plain, readable rules
- Links every reading prompt to its evidence, and says when the evidence is thin
- Compares two versions of the same policy
- Exports an annotated Markdown or print-ready pack with your questions
- Handles documents up to 400,000 characters and 2,000 paragraphs (files up to 5 MB)

## Quick start

Requires Node.js 22 or newer. No `npm install` needed.

```sh
git clone https://github.com/REllwood/Fineprint-Friend.git
cd Fineprint-Friend
npm start
```

Open http://127.0.0.1:4175. The `fixtures` folder has two versions of a sample streaming-service agreement to try the comparison on.

If port 4175 is taken, pick another with `npm start -- --port 4176` (or set `PORT`).

## Status

v0.1 uses local rules only. Next up are an optional on-device language model, question packs for specific countries, and a way to watch a policy for changes.

## Development

```sh
npm test        # clause detection, comparison and server tests
npm run check   # tests plus syntax checks
```

## License

[MIT](LICENSE)
