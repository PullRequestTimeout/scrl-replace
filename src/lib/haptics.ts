import type { Attachment } from 'svelte/attachments';

/**
 * A light haptic tick when a control is tapped, on iPhone.
 *
 * iOS Safari has no Vibration API. Since iOS 18 it ticks the Taptic Engine when a
 * `<input type="checkbox" switch>` is toggled, and since iOS 26.5 only when a real tap does
 * it (a scripted `label.click()` no longer counts). So this lays an invisible label wired to a
 * hidden switch over the control: a tap lands on the label, which toggles the switch (the
 * tick), then the label hands the click on to the control so it behaves exactly as before.
 * Elsewhere the switch does nothing and the control works as normal.
 *
 * Only for taps on plain buttons and labels: drags and scripted events can't tick, and the
 * control's own click must not need to be trusted (e.g. one that opens a picker).
 *
 * Usage: `<button {@attach haptic}>`; components that spread props (Button) pass it through.
 */
export const haptic: Attachment<HTMLElement> = (host) => {
	const label = document.createElement('label');
	label.setAttribute('aria-hidden', 'true');
	label.style.cssText = 'position:absolute;inset:0;border-radius:inherit;cursor:inherit';
	const input = document.createElement('input');
	input.type = 'checkbox';
	input.setAttribute('switch', '');
	input.tabIndex = -1;
	input.style.display = 'none';
	label.append(input);

	const restorePosition = getComputedStyle(host).position === 'static';
	if (restorePosition) host.style.position = 'relative';
	host.append(label);

	// The tap itself: let the label toggle the switch, but keep the event to ourselves and
	// replay it on the control, so its handlers and default action (checking a radio,
	// following a link) run once, as if it had been tapped directly.
	const onLabelClick = (e: MouseEvent) => {
		e.stopPropagation();
		if (host.matches(':disabled, [aria-disabled="true"]')) {
			e.preventDefault();
			return;
		}
		host.click();
	};
	// The label forwards a click to the switch; that one isn't the user's.
	const onInputClick = (e: MouseEvent) => e.stopPropagation();
	label.addEventListener('click', onLabelClick);
	input.addEventListener('click', onInputClick);

	return () => {
		label.removeEventListener('click', onLabelClick);
		input.removeEventListener('click', onInputClick);
		label.remove();
		if (restorePosition) host.style.position = '';
	};
};
