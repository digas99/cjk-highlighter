/**
 * How a page was told apart, for an extension's popup to show (its "Japanese or Chinese"
 * settings): the page's language and why, its paragraphs by class, what this extension highlights
 * there, and who it shares the page with. Worked out when asked, on a gate of its own (the
 * highlight's isn't touched), with the same rules. Plain data: it's sent from the page to the popup.
 *
 * `outlineParagraphs` marks each paragraph on the page in its class's colour, to check them.
 */

import { TEXT_OWNER, type LanguageChoices, type PeerInfo, type TextKind } from './coexistence';
import { LanguageGate, type LanguageRules, type TextLanguage } from './textLanguage';

/** a report reads this much of the page's text (more than before highlighting: it's asked for) */
const REPORT_TEXT = 400_000;

export type PageLanguageReport = {
	/** the page's language: by its lang (`declared`), else by its text; null: neither leads */
	page: 'japanese' | 'chinese' | null;
	declared: 'japanese' | 'chinese' | null;
	/** the decided text, by language (kana and hanzi) */
	tally: { japanese: number; chinese: number };
	/** paragraphs, by class */
	paragraphs: Record<TextLanguage, number>;
	/** what this extension highlights here (its choices on this site, shared with its partner) */
	choices: LanguageChoices;
	/** the other highlighter it shares the page with, and what that one highlights */
	partner: { name: string; takes: TextKind[] } | null;
};

/** The page, classified now with `rules` (this extension's, on this site, shared with `partner`). */
export function reportPageLanguage(root: Element, rules: LanguageRules, partner: PeerInfo | null): PageLanguageReport {
	const gate = new LanguageGate({ ...rules, track: true, register: false });
	gate.seed(root, REPORT_TEXT);
	const summary = gate.summary();
	gate.dispose();
	return {
		page: summary.declared ?? summary.page,
		declared: summary.declared,
		tally: summary.tally,
		paragraphs: summary.paragraphs,
		choices: { japanese: rules.japanese ?? 'highlight', chinese: rules.chinese, unclear: rules.unclear },
		partner: partner
			? { name: partner.name, takes: (Object.keys(TEXT_OWNER) as TextKind[]).filter(text => partner.choices[text] === 'highlight') }
			: null,
	};
}

const LANGUAGE: Record<'japanese' | 'chinese', string> = { japanese: 'Japanese', chinese: 'Chinese' };
const TEXT: Record<TextKind, string> = { japanese: 'Japanese', chinese: 'Chinese', unclear: 'could be either' };

const list = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0] ?? '');

/** The report in words: a line for the collapsed view, and the details. */
export function describeReport(report: PageLanguageReport): {
	headline: string;
	page: string;
	paragraphs: string;
	highlights: string;
	sharing: string;
} {
	const { page, declared, tally, paragraphs, choices, partner } = report;
	const total = paragraphs.japanese + paragraphs.chinese + paragraphs.mixed + paragraphs.unclear;
	const characters = `${tally.japanese} characters of Japanese, ${tally.chinese} of Chinese`;

	const language = !total ? 'No Japanese or Chinese' : page ? LANGUAGE[page] : 'Unclear';
	const highlighted = (Object.keys(choices) as TextKind[]).filter(text => choices[text] === 'highlight');
	const left = (Object.keys(choices) as TextKind[]).filter(text => choices[text] === 'skip');

	return {
		headline: `${language}${partner ? ` · shared with ${partner.name}` : ''}`,
		page: !total
			? 'Nothing here is Japanese or Chinese.'
			: declared
				? `${LANGUAGE[declared]}: the page says so (its lang). ${characters}.`
				: page
					? `${LANGUAGE[page]}: it has twice as much as the other language, or more (${characters}).`
					: `Unclear: neither language has twice as much as the other (${characters}).`,
		paragraphs: `Paragraphs: ${paragraphs.japanese} Japanese, ${paragraphs.chinese} Chinese, ${paragraphs.mixed} mixed, ${paragraphs.unclear} could be either.`,
		highlights: highlighted.length
			? `Highlighted here: ${list(highlighted.map(text => TEXT[text]))}${left.length ? `. Left: ${list(left.map(text => TEXT[text]))}` : ''}.`
			: 'Nothing highlighted here.',
		sharing: partner
			? `Shared with ${partner.name}, which highlights ${list(partner.takes.map(text => TEXT[text])) || 'nothing'}.`
			: 'No other highlighter on this page.',
	};
}

/** The colour each class is outlined in (the popups' dots too). */
export const LANGUAGE_COLORS: Record<TextLanguage, string> = {
	japanese: '#2fbf5b',
	chinese: '#e5484d',
	mixed: '#f5a623',
	unclear: '#8a8fa3',
};

/**
 * Each paragraph on the page outlined in its class's colour (`on`), or the outlines taken off.
 * `namespace`: the extension's prefix, for its style and attribute. Returns how many were outlined.
 */
export function outlineParagraphs(root: Element, rules: LanguageRules, on: boolean, namespace: string): number {
	const styleId = `${namespace}-language-outlines`;
	const attribute = `data-${namespace}-lang`;
	document.getElementById(styleId)?.remove();
	for (const element of document.querySelectorAll(`[${attribute}]`)) element.removeAttribute(attribute);
	if (!on) return 0;

	const style = document.createElement('style');
	style.id = styleId;
	style.textContent = (Object.keys(LANGUAGE_COLORS) as TextLanguage[])
		.map(language => `[${attribute}="${language}"] { outline: 2px dashed ${LANGUAGE_COLORS[language]} !important; outline-offset: 1px; }`)
		.join('\n');
	(document.head || document.documentElement).appendChild(style);

	const gate = new LanguageGate({ ...rules, track: true, register: false });
	gate.seed(root, REPORT_TEXT);
	let count = 0;
	for (const [paragraph, language] of gate.trackedParagraphs()) {
		if (!language) continue;
		paragraph.setAttribute(attribute, language);
		count += 1;
	}
	gate.dispose();
	return count;
}
