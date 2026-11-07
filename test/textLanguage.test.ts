// The classifier on hand-picked text: Japanese, Chinese (simplified and traditional), mixed, and
// what only shares characters. (In development it was also run on Japanese and Chinese Wikipedia:
// no Japanese paragraph called Chinese, nor the other way around.)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyText, sentenceKept, sentenceRanges, textByLanguage, type LanguageRules } from '../src/textLanguage';

// Jōyō and Jinmeiyō
const japaneseKanji = new Set<string>(readFileSync(new URL('./fixtures/japanese-kanji.txt', import.meta.url), 'utf8').trim());

const cases: Array<[string, ReturnType<typeof classifyText>]> = [
	['今日は天気がいいですね。', 'japanese'],
	['首相、衆院解散を表明', 'japanese'],
	['行く', 'japanese'],
	['具体的にはどういうことですか', 'japanese'],
	// rare kanji in Japanese prose
	['薔薇の花が咲いている。', 'japanese'],
	['我の日記', 'japanese'],
	// only characters both use: its page decides
	['販売終了', 'unclear'],
	['経済的支援', 'unclear'],
	['東京大学', 'unclear'],
	['日本語能力試験', 'unclear'],
	['北京大学', 'unclear'],
	['你好', 'unclear'],
	['「進撃の巨人」是一部日本漫画作品，由諫山創創作。', 'unclear'],
	['我是学生。', 'chinese'],
	['这是一个很好的问题。', 'chinese'],
	['他们说明天会下雨。', 'chinese'],
	['中国经济增长放缓', 'chinese'],
	['這是一個很好的問題。', 'chinese'],
	['他們說明天會下雨。', 'chinese'],
	['台灣的天氣很好', 'chinese'],
	// a Japanese quote in Chinese
	['他说：「ありがとうございます」。这是日语，意思是谢谢。', 'mixed'],
	['Hello, world', null],
];

describe('classifyText', () => {
	it.each(cases)('%s → %s', (text, expected) => {
		expect(classifyText(text, japaneseKanji)).toBe(expected);
	});
});

describe('sentenceRanges', () => {
	it('splits after 。！？ and line breaks', () => {
		const text = '一つ目。二つ目！三つ目';
		expect(sentenceRanges(text).map(([start, end]) => text.slice(start, end))).toEqual(['一つ目。', '二つ目！', '三つ目']);
	});
});

describe('textByLanguage', () => {
	const rules: LanguageRules = { japaneseKanji, chinese: 'skip', unclear: 'highlight' };

	it('leaves Chinese paragraphs out, and the Chinese sentences of a mixed one', () => {
		const text = ['今日は天気がいいので、公園へ行きました。', '这是一个很好的问题。', '他说：「ありがとうございます」。这是日语，意思是谢谢。'].join('\n');
		expect(textByLanguage(text, rules, null).text).toBe('今日は天気がいいので、公園へ行きました。\n他说：「ありがとうございます」。');
	});

	it('unclear text follows the page: kept on a Japanese one, left out on a Chinese one', () => {
		const japanesePage = ['東京大学', '今日は天気がいいので、友達と一緒に公園へ行きました。'].join('\n');
		const chinesePage = ['東京大学', '这是一个很好的问题。他们说明天会下雨，所以我们不去公园了。'].join('\n');
		expect(textByLanguage(japanesePage, rules, null)).toMatchObject({ page: 'japanese', text: japanesePage });
		expect(textByLanguage(chinesePage, rules, null)).toMatchObject({ page: 'chinese', text: '' });
	});

	it('a page that says its language (lang) decides unclear text', () => {
		expect(textByLanguage('東京大学', rules, 'chinese').text).toBe('');
		expect(textByLanguage('東京大学', rules, 'japanese').text).toBe('東京大学');
	});

	it('unclear text on a page that does not tell: the choice', () => {
		expect(textByLanguage('東京大学', rules, null).text).toBe('東京大学');
		expect(textByLanguage('東京大学', { ...rules, unclear: 'skip' }, null).text).toBe('');
	});
});

describe('sentenceKept', () => {
	const rules: LanguageRules = { japaneseKanji, chinese: 'skip', unclear: 'skip' };
	it('as the highlight would', () => {
		expect(sentenceKept('日本語の勉強は楽しいです。', rules, null)).toBe(true);
		expect(sentenceKept('这是一个很好的问题。', rules, null)).toBe(false);
		expect(sentenceKept('東京大学', rules, 'japanese')).toBe(true);
		expect(sentenceKept('東京大学', rules, null)).toBe(false);
	});
});
