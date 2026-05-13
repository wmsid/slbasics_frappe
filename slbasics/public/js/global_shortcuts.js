// ── SLBasics namespace ─────────────────────────────────────────────────────────
frappe.slbasics = frappe.slbasics || {};

// ── UOM Calculator Dialog ──────────────────────────────────────────────────────
frappe.slbasics.open_uom_calculator = function () {
	let conversion_cache = {};
	let current_factor = null;

	const dialog = new frappe.ui.Dialog({
		title: __("UOM Calculator"),
		fields: [
			{
				fieldtype: "Link",
				fieldname: "source_uom",
				label: __("Source UOM"),
				options: "UOM",
				reqd: 1,
				onchange: function () {
					refresh_conversion();
				},
			},
			{
				fieldtype: "Link",
				fieldname: "target_uom",
				label: __("Target UOM"),
				options: "UOM",
				reqd: 1,
				onchange: function () {
					refresh_conversion();
				},
			},
			{
				fieldtype: "Section Break",
			},
			// No onchange on Float fields — native input listeners attached after
			// dialog.show() to avoid Frappe's async set_value infinite loop.
			{
				fieldtype: "Float",
				fieldname: "source_qty",
				label: __("Source Quantity"),
				description: __("Enter a value to convert → Target"),
			},
			{
				fieldtype: "Column Break",
			},
			{
				fieldtype: "Float",
				fieldname: "target_qty",
				label: __("Target Quantity"),
				description: __("Enter a value to convert → Source"),
			},
			{
				fieldtype: "Section Break",
			},
			{
				fieldtype: "HTML",
				fieldname: "conversion_info",
				options: `<div id="uom-conversion-info" style="
					padding: 8px 12px;
					border-radius: 4px;
					font-size: 13px;
					color: var(--text-muted);
					text-align: center;
				">Select Source and Target UOM to begin.</div>`,
			},
		],
		primary_action_label: __("Close"),
		primary_action() {
			dialog.hide();
		},
	});

	dialog.show();

	// Attach native input listeners after dialog DOM is ready.
	// Using $input.val() is synchronous and won't trigger Frappe's onchange,
	// so the guard flag works reliably without any async race conditions.
	setTimeout(function () {
		const source_field = dialog.get_field("source_qty");
		const target_field = dialog.get_field("target_qty");
		if (!source_field || !target_field) return;

		const $source = source_field.$input;
		const $target = target_field.$input;
		let guard = false;

		$source.on("input", function () {
			if (guard || current_factor === null) return;
			guard = true;
			$target.val(precision_format(flt(this.value) * current_factor));
			guard = false;
		});

		$target.on("input", function () {
			if (guard || current_factor === null || current_factor === 0) return;
			guard = true;
			$source.val(precision_format(flt(this.value) / current_factor));
			guard = false;
		});
	}, 200);

	// ── Helpers ────────────────────────────────────────────────────────────────

	function precision_format(num) {
		if (!num && num !== 0) return "";
		return parseFloat(num.toFixed(9)).toString();
	}

	function set_info(html) {
		dialog.$wrapper.find("#uom-conversion-info").html(html);
	}

	function set_info_loading() {
		set_info(`<span class="text-muted"><i class="fa fa-spinner fa-spin"></i> Fetching conversion factor…</span>`);
	}

	function set_info_factor(source_uom, target_uom, factor) {
		set_info(`
			<strong>1 ${frappe.utils.escape_html(source_uom)}</strong>
			= <strong>${precision_format(factor)} ${frappe.utils.escape_html(target_uom)}</strong>
		`);
	}

	function set_info_not_found(source_uom, target_uom) {
		set_info(`
			<span class="text-danger">
				<i class="fa fa-exclamation-triangle"></i>
				No conversion factor found between
				<strong>${frappe.utils.escape_html(source_uom)}</strong> and
				<strong>${frappe.utils.escape_html(target_uom)}</strong>.
				Please set it up in <em>UOM Conversion Factor</em>.
			</span>
		`);
	}

	// ── Conversion factor fetching ─────────────────────────────────────────────

	function get_conversion_factor(source_uom, target_uom) {
		const cache_key = `${source_uom}::${target_uom}`;
		if (conversion_cache[cache_key] !== undefined) {
			return Promise.resolve(conversion_cache[cache_key]);
		}
		if (source_uom === target_uom) {
			conversion_cache[cache_key] = 1;
			return Promise.resolve(1);
		}
		return new Promise(function (resolve) {
			frappe.call({
				method: "frappe.client.get_value",
				args: {
					doctype: "UOM Conversion Factor",
					filters: { from_uom: source_uom, to_uom: target_uom },
					fieldname: "value",
				},
				callback: function (r) {
					if (r.message && r.message.value) {
						const factor = flt(r.message.value);
						conversion_cache[cache_key] = factor;
						resolve(factor);
					} else {
						// Try reverse direction and invert
						frappe.call({
							method: "frappe.client.get_value",
							args: {
								doctype: "UOM Conversion Factor",
								filters: { from_uom: target_uom, to_uom: source_uom },
								fieldname: "value",
							},
							callback: function (r2) {
								if (r2.message && r2.message.value) {
									const rev = flt(r2.message.value);
									const factor = rev !== 0 ? 1 / rev : null;
									conversion_cache[cache_key] = factor;
									resolve(factor);
								} else {
									conversion_cache[cache_key] = null;
									resolve(null);
								}
							},
						});
					}
				},
			});
		});
	}

	// ── Reactive logic ─────────────────────────────────────────────────────────

	function refresh_conversion() {
		const source_uom = dialog.get_value("source_uom");
		const target_uom = dialog.get_value("target_uom");

		if (!source_uom || !target_uom) {
			set_info("Select Source and Target UOM to begin.");
			current_factor = null;
			return;
		}

		set_info_loading();

		get_conversion_factor(source_uom, target_uom).then(function (factor) {
			current_factor = factor;
			if (factor === null) {
				set_info_not_found(source_uom, target_uom);
				return;
			}
			set_info_factor(source_uom, target_uom, factor);

			// Re-calculate if qty is already present
			const source_field = dialog.get_field("source_qty");
			const target_field = dialog.get_field("target_qty");
			if (!source_field || !target_field) return;

			const src_val = flt(source_field.$input.val());
			if (src_val) {
				target_field.$input.val(precision_format(src_val * factor));
			} else {
				const tgt_val = flt(target_field.$input.val());
				if (tgt_val && factor !== 0) {
					source_field.$input.val(precision_format(tgt_val / factor));
				}
			}
		});
	}
};

// ── Shortcuts ──────────────────────────────────────────────────────────────────

frappe.ui.keys.add_shortcut({
	shortcut: "ctrl+0",
	action: function (e) {
		$("#navbar-modal-search").click();
		e.preventDefault();
		return false;
	},
	description: "Open Search",
	ignore_inputs: true,
	page: null,
});

frappe.ui.keys.add_shortcut({
	shortcut: "alt+c",
	action: function (e) {
		e.preventDefault();
		frappe.slbasics.open_uom_calculator();
	},
	description: "Open UOM Calculator",
	ignore_inputs: false, // works even when user is inside an input/form
	page: null,
});
