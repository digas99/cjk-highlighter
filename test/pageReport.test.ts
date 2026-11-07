// A page's report, in words: what the popups show.
import { describe, expect, it } from 'vitest';
import { describeReport, type PageLanguageReport } from '../src/pageReport';

const report = (changes: Partial<PageLanguageReport> = {}): PageLanguageReport => ({
	page: 'chinese',
	declared: null,
	tally: { japanese: 36, chinese: 99 },
	paragraphs: { japanese: 1, chinese: 3, mixed: 1, unclear: 1 },
	choices: { japanese: 'highlight', chinese: 'skip', unclear: 'highlight' },
	partner: null,
	...changes,
});

describe('describeReport', () => {
	it('a page by its text, alone', () => {
		const words = describeReport(report());
		expect(words.headline).toBe('Chinese');
		expect(words.page).toBe('Chinese: it has twice as much as the other language, or more (36 characters of Japanese, 99 of Chinese).');
		expect(words.paragraphs).toBe('Paragraphs: 1 Japanese, 3 Chinese, 1 mixed, 1 could be either.');
		expect(words.highlights).toBe('Highlighted here: Japanese and could be either. Left: Chinese.');
		expect(words.sharing).toBe('No other highlighter on this page.');
	});

	it('a page by its lang, shared', () => {
		const words = describeReport(report({ declared: 'chinese', partner: { name: 'HanziHero Companion', takes: ['chinese'] } }));
		expect(words.headline).toBe('Chinese · shared with HanziHero Companion');
		expect(words.page.startsWith('Chinese: the page says so (its lang).')).toBe(true);
		expect(words.sharing).toBe('Shared with HanziHero Companion, which highlights Chinese.');
	});

	it('unclear, or nothing to tell', () => {
		expect(describeReport(report({ page: null })).headline).toBe('Unclear');
		expect(describeReport(report({ page: null, paragraphs: { japanese: 0, chinese: 0, mixed: 0, unclear: 0 } })).headline).toBe('No Japanese or Chinese');
	});
});
