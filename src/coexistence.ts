/**
 * Two highlighters: one for Japanese (WaniKani), one for Chinese (HanziHero).
 *
 * Their settings say who highlights each kind of text (Japanese, Chinese, could be either), kept
 * opposite between the two extensions: one highlights it, the other leaves it to it. The
 * extensions keep them so themselves (runtime messages between them: PARTNER_MESSAGE); to
 * message, they learn each other's id from the pages they're both on (announcePresence).
 *
 * On a page, each tells the other it's highlighting (PagePeers), with its choices: if both still
 * say they highlight the same text (the settings out of step), that text goes to its natural
 * owner (TEXT_OWNER) there.
 *
 * Extensions can't call each other's content scripts, but they share the page: they talk with
 * CustomEvents on `document`, a JSON string as their detail (strings cross the content scripts'
 * isolated worlds as they are). The page can see these events too: nothing private goes in them.
 */

import type { LanguageChoice } from './textLanguage';

/** Raised when the messages change: highlighters on another version don't share. */
export const PROTOCOL_VERSION = 1;
/** Raised when the classifier's rules change (textLanguage.ts): a peer on another one may split differently. */
export const CLASSIFIER_VERSION = 1;

const EVENT = 'cjk-highlighter';

export type PeerRole = 'japanese' | 'chinese';

export type TextKind = 'japanese' | 'chinese' | 'unclear';
export type LanguageChoices = Record<TextKind, LanguageChoice>;

/** Who highlights each kind of text, when both extensions want it (and by default, once both are installed). */
export const TEXT_OWNER: Record<TextKind, PeerRole> = { japanese: 'japanese', chinese: 'chinese', unclear: 'japanese' };

/** A highlighter's choices with the other installed, before anyone changes them: each text to its owner. */
export function defaultChoices(role: PeerRole): LanguageChoices {
	const choose = (text: TextKind): LanguageChoice => (TEXT_OWNER[text] === role ? 'highlight' : 'skip');
	return { japanese: choose('japanese'), chinese: choose('chinese'), unclear: choose('unclear') };
}

/** The other extension's choice, kept opposite to this one's. */
export function oppositeChoice(choice: LanguageChoice): LanguageChoice {
	return choice === 'highlight' ? 'skip' : 'highlight';
}

/** What a highlighter says about itself. */
export type PeerInfo = {
	/** short and unique: 'wkh', 'hh' */
	id: string;
	/** for people: 'WaniKani Kanji Highlighter' */
	name: string;
	role: PeerRole;
	/** whether it shares the page with a highlighter of the other language */
	share: boolean;
	/** what it highlights (its settings, on this site): 'skip' leaves it to the other */
	choices: LanguageChoices;
	protocol: number;
	classifier: number;
};

type Message = { type: 'hello' | 'reply' | 'bye'; from: PeerInfo };

function parse(detail: unknown): Message | null {
	if (typeof detail !== 'string') return null;
	try {
		const message = JSON.parse(detail);
		const from = message?.from;
		if (!['hello', 'reply', 'bye'].includes(message?.type)) return null;
		if (typeof from?.id !== 'string' || typeof from.name !== 'string') return null;
		if (from.role !== 'japanese' && from.role !== 'chinese') return null;
		return {
			type: message.type,
			from: {
				id: from.id.slice(0, 40),
				name: from.name.slice(0, 80),
				role: from.role,
				share: from.share === true,
				choices: {
					japanese: from.choices?.japanese === 'skip' ? 'skip' : 'highlight',
					chinese: from.choices?.chinese === 'skip' ? 'skip' : 'highlight',
					unclear: from.choices?.unclear === 'skip' ? 'skip' : 'highlight',
				},
				protocol: Number(from.protocol) || 0,
				classifier: Number(from.classifier) || 0,
			},
		};
	} catch {
		return null;
	}
}

/**
 * This highlighter on the page, and the others it meets. `start()` says hello (those already
 * there answer), `update()` says it again with new settings, `stop()` says goodbye.
 */
export class PagePeers {
	private self: PeerInfo;
	private readonly others = new Map<string, PeerInfo>();
	private readonly listeners = new Set<() => void>();
	private started = false;

	constructor(self: Omit<PeerInfo, 'protocol' | 'classifier'>) {
		this.self = { ...self, protocol: PROTOCOL_VERSION, classifier: CLASSIFIER_VERSION };
	}

	private readonly onEvent = (event: Event) => {
		const message = parse((event as CustomEvent).detail);
		if (!message || message.from.id === this.self.id) return;
		const before = JSON.stringify(this.others.get(message.from.id) ?? null);
		if (message.type === 'bye') this.others.delete(message.from.id);
		else this.others.set(message.from.id, message.from);
		// a newcomer: it hasn't heard of this one yet
		if (message.type === 'hello') this.send('reply');
		if (JSON.stringify(this.others.get(message.from.id) ?? null) !== before) this.notify();
	};

	start(): void {
		if (this.started) return;
		this.started = true;
		document.addEventListener(EVENT, this.onEvent);
		this.send('hello');
	}

	/** New settings (sharing, choices): said again. */
	update(changes: Partial<Pick<PeerInfo, 'share' | 'choices'>>): void {
		const next = { ...this.self, ...changes };
		if (JSON.stringify(next) === JSON.stringify(this.self)) return;
		this.self = next;
		if (this.started) this.send('hello');
	}

	stop(): void {
		if (!this.started) return;
		this.send('bye');
		document.removeEventListener(EVENT, this.onEvent);
		this.started = false;
		this.others.clear();
	}

	/** The other highlighters on the page. */
	peers(): PeerInfo[] {
		return [...this.others.values()];
	}

	/**
	 * The highlighter this one splits the page with: the other language's, both sharing, on the
	 * same protocol. Null: this one highlights as if alone.
	 */
	partner(): PeerInfo | null {
		if (!this.self.share) return null;
		for (const peer of this.others.values()) {
			if (peer.role !== this.self.role && peer.share && peer.protocol === PROTOCOL_VERSION) return peer;
		}
		return null;
	}

	/** Called when the peers (or what they say) change. */
	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) listener();
	}

	private send(type: Message['type']): void {
		document.dispatchEvent(new CustomEvent(EVENT, { detail: JSON.stringify({ type, from: this.self }) }));
	}
}

/**
 * A highlighter's choices on a page it shares with `partner`: what both would highlight goes to
 * its owner (TEXT_OWNER), so nothing is highlighted twice. Alone: its own choices.
 */
export function shareChoices(own: LanguageChoices, role: PeerRole, partner: PeerInfo | null): LanguageChoices {
	if (!partner) return own;
	const shared = { ...own };
	for (const text of Object.keys(TEXT_OWNER) as TextKind[]) {
		if (own[text] === 'highlight' && partner.choices[text] === 'highlight' && TEXT_OWNER[text] !== role) shared[text] = 'skip';
	}
	return shared;
}

/** For the classification panel: who this page is shared with. */
export function describePeers(peers: PagePeers): string {
	const partner = peers.partner();
	if (partner) {
		const names: Record<TextKind, string> = { japanese: 'Japanese', chinese: 'Chinese', unclear: 'could be either' };
		const takes = (Object.keys(TEXT_OWNER) as TextKind[]).filter(text => partner.choices[text] === 'highlight').map(text => names[text]);
		const versions = partner.classifier !== CLASSIFIER_VERSION ? ` · its classifier is v${partner.classifier}, this one's v${CLASSIFIER_VERSION}` : '';
		return `Sharing the page with ${partner.name} (it highlights: ${takes.join(', ') || 'nothing'})${versions}`;
	}
	const others = peers.peers();
	if (!others.length) return 'Alone on this page';
	return `Not sharing: ${others.map(peer => `${peer.name}${peer.share ? '' : ' (sharing off)'}${peer.protocol !== PROTOCOL_VERSION ? ` (protocol v${peer.protocol})` : ''}`).join(', ')}`;
}

/* ------------------------------------------------------------------ */
/* Finding the other extension (its id), and talking to it            */
/* ------------------------------------------------------------------ */

const PRESENCE_EVENT = 'cjk-highlighter:presence';

/** An extension, as the other knows it. */
export type PartnerIdentity = { extensionId: string; name: string; role: PeerRole };

/**
 * On every page, whether highlighting or not: says this extension is installed (its id), and
 * calls back with the other ones heard. The extensions keep each other's id, to message (PARTNER_MESSAGE).
 */
export function announcePresence(self: PartnerIdentity, onOther: (other: PartnerIdentity) => void): () => void {
	const send = (type: 'here' | 'here-too') => {
		document.dispatchEvent(new CustomEvent(PRESENCE_EVENT, { detail: JSON.stringify({ type, ...self }) }));
	};
	const listener = (event: Event) => {
		const detail = (event as CustomEvent).detail;
		if (typeof detail !== 'string') return;
		let message: any;
		try {
			message = JSON.parse(detail);
		} catch {
			return;
		}
		if (typeof message?.extensionId !== 'string' || message.extensionId === self.extensionId) return;
		if ((message.role !== 'japanese' && message.role !== 'chinese') || typeof message.name !== 'string') return;
		if (message.type === 'here') send('here-too');
		onOther({ extensionId: message.extensionId.slice(0, 80), name: message.name.slice(0, 80), role: message.role });
	};
	document.addEventListener(PRESENCE_EVENT, listener);
	send('here');
	return () => document.removeEventListener(PRESENCE_EVENT, listener);
}

/** The type of the runtime messages between the two extensions (runtime.sendMessage(id, …)). */
export const PARTNER_MESSAGE = 'cjk-highlighter:partner';

/** Between the extensions: what are your choices (`about`), or here's yours, opposite to mine (`choose`). */
export type PartnerRequest =
	| { type: typeof PARTNER_MESSAGE; action: 'about' }
	| { type: typeof PARTNER_MESSAGE; action: 'choose'; text: TextKind; choice: LanguageChoice };

/** The answer to `about`: who it is and what it highlights. */
export type PartnerAbout = { protocol: number; name: string; role: PeerRole; choices: LanguageChoices };

/** A request from the other extension, checked (null: not one). */
export function parsePartnerRequest(message: unknown): PartnerRequest | null {
	const value = message as any;
	if (value?.type !== PARTNER_MESSAGE) return null;
	if (value.action === 'about') return { type: PARTNER_MESSAGE, action: 'about' };
	if (value.action === 'choose' && ['japanese', 'chinese', 'unclear'].includes(value.text) && ['highlight', 'skip'].includes(value.choice)) {
		return { type: PARTNER_MESSAGE, action: 'choose', text: value.text, choice: value.choice };
	}
	return null;
}
