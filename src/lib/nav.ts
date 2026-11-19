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

export function isActive(pathname: string, href: string): boolean {
	return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
}
