export type NavItem = { href: string; label: string };

/** Primary sections, in top-bar order. */
export const NAV_ITEMS: NavItem[] = [
	{ href: '/', label: 'Home' },
	{ href: '/plan', label: 'Plan' },
	{ href: '/calendar', label: 'Calendar' },
	{ href: '/focus', label: 'Focus' },
	{ href: '/quests', label: 'Quests' },
	{ href: '/review', label: 'Review' }
];

export function isActive(pathname: string, href: string): boolean {
	return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
}
