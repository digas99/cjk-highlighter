# cjk-highlighter

Highlighting Japanese and Chinese on web pages, for browser extensions. It's shared by the
[WaniKani Kanji Highlighter](https://github.com/digas99/wanikani-kanji-highlighter) and the HanziHero Companion.

An extension brings **what** to highlight (a `Matcher`) and **how it looks** (its highlight names and
styles). This library does the page side:

- **Which text to read:** not scripts, inputs, code or furigana, and not the extension's own popups.
- **Words over furigana or pinyin:** 話<rt>はな</rt>していました is matched as one word.
- **Painted highlights** (the CSS Custom Highlight API): the page's text is never split up, so
  sites that update their own text, and the browser's translation, keep working. Hovering and
  clicking are found by hit-testing. Where painting isn't available, spans are the fallback.
- **Following the page:** the whole page at once, or elements as they scroll into view, then
  what's added or edited.
- **Japanese or Chinese, by paragraph** (`textLanguage.ts`):
  - Japanese has kana.
  - Chinese has hanzi Japanese doesn't use (这, 們, 說…) or its function words (的, 是, 很…).
  - Mixed paragraphs are decided sentence by sentence.
  - Text with only shared characters (東京大学) follows its page: its `lang`, or its other paragraphs.

  It's what lets two extensions share a page without highlighting the same text.

It's plain DOM and TypeScript, with no extension APIs and no framework. It ships as TypeScript source
(no build step): the extensions' bundler (Vite / WXT) compiles it.

## Use

```ts
import {
  HighlightSession,
  LanguageGate,
  PageHighlighter,
  RangeHighlights,
  SpanRenderer,
  supportsRangeHighlights,
  type Match,
  type Matcher,
} from 'cjk-highlighter';

const matcher: Matcher<MyData> = {
  isActive: () => true,
  hasMatch: text => /[一-鿿]/.test(text),
  findMatches: text => [/* { start, end, value, type, name: 'my-known', data } */],
  matchesRuns: true,
};

// `name` on each match: the ::highlight(name) the extension styles
const renderer = supportsRangeHighlights()
  ? new RangeHighlights({ hoverName: 'my-hover' })
  : new SpanRenderer(makeSpan, 'my-highlight');

// optional: leave Chinese (or Japanese) text alone
const gate = new LanguageGate({ japaneseKanji, chinese: 'skip', unclear: 'highlight' });
gate.seed(document.body);

const page = new PageHighlighter(matcher, renderer, { gate, onMatch: match => remember(match) });
new HighlightSession({ highlighter: page, ranges: renderer instanceof RangeHighlights ? renderer : null, gate, mode: 'viewport' }).start();
```

Two extensions on one page each register their own highlight names. Prefix them (`wkh-…`, `hh-…`)
so they don't collide.

## Develop

The extensions install it from this folder (`"cjk-highlighter": "file:../../cjk-highlighter"`), so
changes here show up in their next build.

```sh
npm install
npm run check   # types
npm test        # the classifier
```
