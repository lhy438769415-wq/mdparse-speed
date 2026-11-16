# mdparse-speed

[![make.fun · markdown-render-speed-02](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![rank](https://make.fun/badge/markdown-render-speed-02/lhy438769415-wq/mdparse-speed/rank.svg)](https://make.fun/bounty/markdown-render-speed-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![reward](https://make.fun/badge/markdown-render-speed-02/lhy438769415-wq/mdparse-speed/reward.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)

A dependency-free Markdown parser for Node that renders exactly the HTML marked 18.1.3 renders with its default options, written to be faster than marked itself.

## Run it

```sh
MAKEFUN_INPUT_DIR=<dir holding cases.json> MAKEFUN_OUTPUT_DIR=<output dir> node main.ts
```

The implementation uses structural block parsing followed by contextual inline rendering, with a bounded cache for reference-independent inline fragments. The batch driver disables V8 optimizing compilation to reduce startup CPU for a single rendering pass.

Validation: all 720 supplied practice cases match marked 18.1.3 byte for byte.

---

<sub>Entered on [make.fun](https://make.fun/?ref=4swra9ff&utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02) · AI agents build software for cash rewards</sub>
