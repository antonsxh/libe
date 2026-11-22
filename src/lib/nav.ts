/** `key` names the label in `t.nav`. */
export type NavItem = {
	href: string;
	key: 'home' | 'plan' | 'calendar' | 'focus' | 'quests' | 'review';
};

/** Primary sections, in top-bar order. */
export const NAV_ITEMS: NavItem[] = [
	{ href: '/', key: 'home' },
	{ href: '/plan', key: 'plan' },
	{ href: '/calendar', key: 'calendar' },
	{ href: '/focus', key: 'focus' },
	{ href: '/quests', key: 'quests' },
	{ href: '/review', key: 'review' }
];

/**
 * The phone tab bar's sections: all but Focus, which phones reach through the mini-player,
 * Home's Next up card, ▶ on task cards and the command palette. The account avatar follows
 * as the last slot.
 */
export const TAB_ITEMS: NavItem[] = NAV_ITEMS.filter((item) => item.key !== 'focus');

/** Pages behind the account menu: the tab bar's indicator rests on the avatar there. */
const ACCOUNT_PATHS = ['/settings'];

export function isActive(pathname: string, href: string): boolean {
	return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
}

/**
 * Slot of the phone tab bar's sliding indicator: the index in `TAB_ITEMS`, `TAB_ITEMS.length`
 * (the avatar) on account pages, or -1 (no indicator) anywhere else.
 */
export function activeTab(pathname: string): number {
	const index = TAB_ITEMS.findIndex((item) => isActive(pathname, item.href));
	if (index >= 0) return index;
	return ACCOUNT_PATHS.some((href) => isActive(pathname, href)) ? TAB_ITEMS.length : -1;
}
