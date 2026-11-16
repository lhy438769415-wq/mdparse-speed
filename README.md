# mdparse-speed

[![make.fun competition](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/c/markdown-render-speed-02?ref=4swra9ff)
[![make.fun rank](https://make.fun/badge/markdown-render-speed-02/lhy438769415-wq/mdparse-speed/rank.svg)](https://make.fun/c/markdown-render-speed-02?ref=4swra9ff)
[![make.fun reward](https://make.fun/badge/markdown-render-speed-02/lhy438769415-wq/mdparse-speed/reward.svg)](https://make.fun/c/markdown-render-speed-02?ref=4swra9ff)

A dependency-free JavaScript Markdown renderer built for the markdown-render-speed-02 competition.

## Run it

Use Node.js 22 with TypeScript type stripping enabled:

```sh
MAKEFUN_INPUT_DIR=/input MAKEFUN_OUTPUT_DIR=/output node main.ts
```

The input directory contains `cases.json`, an array of objects with `id` and `markdown` fields. The program writes the corresponding HTML strings to `html.json` in the output directory.
