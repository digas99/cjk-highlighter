// Two highlighters: they find each other, keep their choices opposite, and split a page.
import { beforeEach, describe, expect, it } from 'vitest';
import {
	PagePeers,
	PARTNER_MESSAGE,
	PROTOCOL_VERSION,
	announcePresence,
	defaultChoices,
	oppositeChoice,
	parsePartnerRequest,
	shareChoices,
	type LanguageChoices,
	type PartnerIdentity,
	type PeerInfo,
} from '../src/coexistence';

// the page they share (only its events are used)
beforeEach(() => {
	(globalThis as any).document = new EventTarget();
});

const all: LanguageChoices = { japanese: 'highlight', chinese: 'highlight', unclear: 'highlight' };
const japanese = (share = true, choices = all) => new PagePeers({ id: 'wkh', name: 'WaniKani', role: 'japanese', share, choices });
const chinese = (share = true, choices = all) => new PagePeers({ id: 'hh', name: 'HanziHero', role: 'chinese', share, choices });

describe('PagePeers', () => {
	it('find each other, whichever starts first', () => {
		const a = japanese();
		const b = chinese();
		a.start();
		expect(a.partner()).toBeNull();
		b.start();
		expect(a.partner()?.id).toBe('hh');
		expect(b.partner()?.id).toBe('wkh');
	});

	it('tell each other when one changes or leaves', () => {
		const a = japanese();
		const b = chinese();
		let changes = 0;
		a.onChange(() => changes++);
		a.start();
		b.start();
		b.update({ choices: { ...all, unclear: 'skip' } });
		expect(a.partner()?.choices.unclear).toBe('skip');
		b.stop();
		expect(a.partner()).toBeNull();
		expect(changes).toBe(3);
	});

	it("don't share when either has it off, or both are for the same language", () => {
		const a = japanese(false);
		const b = chinese();
		a.start();
		b.start();
		expect(a.partner()).toBeNull();
		expect(b.partner()).toBeNull();
		expect(b.peers().map(peer => peer.id)).toEqual(['wkh']);

		(globalThis as any).document = new EventTarget();
		const c = japanese();
		const d = new PagePeers({ id: 'other', name: 'Other', role: 'japanese', share: true, choices: all });
		c.start();
		d.start();
		expect(c.partner()).toBeNull();
	});

	it("ignore what isn't a message (the page's own events)", () => {
		const a = japanese();
		a.start();
		document.dispatchEvent(new CustomEvent('cjk-highlighter', { detail: 'not json' }));
		document.dispatchEvent(new CustomEvent('cjk-highlighter', { detail: JSON.stringify({ type: 'hello', from: { id: 1 } }) }));
		expect(a.peers()).toEqual([]);
	});
});

describe('shareChoices', () => {
	const partner = (role: 'japanese' | 'chinese', choices: LanguageChoices = all): PeerInfo =>
		({ id: 'p', name: 'P', role, share: true, choices, protocol: PROTOCOL_VERSION, classifier: 1 });

	it('alone: its own choices', () => {
		expect(shareChoices(all, 'japanese', null)).toEqual(all);
	});

	it('what both would highlight goes to its owner: Japanese and unclear to the Japanese one, Chinese to the Chinese one', () => {
		expect(shareChoices(all, 'japanese', partner('chinese'))).toEqual({ japanese: 'highlight', chinese: 'skip', unclear: 'highlight' });
		expect(shareChoices(all, 'chinese', partner('japanese'))).toEqual({ japanese: 'skip', chinese: 'highlight', unclear: 'skip' });
	});

	it("what the partner leaves stays this one's", () => {
		const leaves = { japanese: 'highlight', chinese: 'highlight', unclear: 'skip' } as const;
		expect(shareChoices(all, 'chinese', partner('japanese', leaves))).toEqual({ japanese: 'skip', chinese: 'highlight', unclear: 'highlight' });
	});

	it('a choice to leave something is kept', () => {
		const own = { ...all, chinese: 'skip' } as const;
		expect(shareChoices(own, 'japanese', partner('chinese'))).toEqual(own);
	});
});

describe('choices between the two extensions', () => {
	it('by default, each text to its owner', () => {
		expect(defaultChoices('japanese')).toEqual({ japanese: 'highlight', chinese: 'skip', unclear: 'highlight' });
		expect(defaultChoices('chinese')).toEqual({ japanese: 'skip', chinese: 'highlight', unclear: 'skip' });
	});

	it('kept opposite', () => {
		expect(oppositeChoice('highlight')).toBe('skip');
		expect(oppositeChoice('skip')).toBe('highlight');
	});

	it('requests are checked', () => {
		expect(parsePartnerRequest({ type: PARTNER_MESSAGE, action: 'about' })).toEqual({ type: PARTNER_MESSAGE, action: 'about' });
		expect(parsePartnerRequest({ type: PARTNER_MESSAGE, action: 'choose', text: 'chinese', choice: 'skip' })?.action).toBe('choose');
		expect(parsePartnerRequest({ type: PARTNER_MESSAGE, action: 'choose', text: 'korean', choice: 'skip' })).toBeNull();
		expect(parsePartnerRequest({ type: 'other' })).toBeNull();
	});
});

describe('announcePresence', () => {
	it('each hears the other, whichever was first', () => {
		const heardByA: PartnerIdentity[] = [];
		const heardByB: PartnerIdentity[] = [];
		announcePresence({ extensionId: 'aaa', name: 'WaniKani', role: 'japanese' }, other => heardByA.push(other));
		announcePresence({ extensionId: 'bbb', name: 'HanziHero', role: 'chinese' }, other => heardByB.push(other));
		expect(heardByA.map(other => other.extensionId)).toEqual(['bbb']);
		expect(heardByB.map(other => other.extensionId)).toEqual(['aaa']);
	});
});
