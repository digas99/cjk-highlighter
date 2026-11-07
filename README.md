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
- **A report on a page** (`pageReport.ts`): how it was told apart, for an extension's popup. It
  covers the page's language and why, its paragraphs by class, what's highlighted and who it's
  shared with, in words both extensions use. It can also outline each paragraph on the page in
  its class's colour.

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

## Two extensions together

A Japanese highlighter and a Chinese one can work together (`coexistence.ts`).

**Who highlights what is one choice between them.** For each kind of text (Japanese, Chinese,
could be either), one extension highlights it and the other leaves it to it. Their settings show
the other extension by name and logo ("Highlight / HanziHero"), and changing it in one sets the
opposite in the other. That's done with runtime messages between the extensions
(`PARTNER_MESSAGE`: `about`, `choose`). When they first find each other, any text both would
highlight goes to its owner (`TEXT_OWNER`: Japanese and could-be-either to the Japanese one,
Chinese to the Chinese one).

**They find each other on pages.** Messaging another extension needs its id, which isn't fixed
for unpacked installs. So on every page each says it's installed, with its id
(`announcePresence`), and keeps the other's.

**On a page**, each says it's highlighting (`PagePeers`: `hello`, answered, and `bye` when it
stops), with its choices. A mixed paragraph is split by sentence, and text that could be either
follows its page first. If both still say they highlight the same text (their settings out of
step), it goes to its owner there (`shareChoices`).

```ts
announcePresence({ extensionId: browser.runtime.id, name: 'HanziHero Companion', role: 'chinese' }, other => remember(other));

const peers = new PagePeers({ id: 'hh', name: 'HanziHero Companion', role: 'chinese', share: true, choices });
peers.start();                       // only while highlighting: a page it doesn't run on isn't left to it
const onPage = shareChoices(choices, 'chinese', peers.partner());
peers.onChange(() => rehighlight()); // the other came, left or changed
```

The page can see these events. Nothing private goes in them, but a site could tell the
extensions are there, or fake a hello to turn some highlights off.

## Develop

The extensions install it from this folder (`"cjk-highlighter": "file:../../cjk-highlighter"`), so
changes here show up in their next build.

```sh
npm install
npm run check   # types
npm test        # the classifier
```
