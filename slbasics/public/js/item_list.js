frappe.listview_settings["Item"] = frappe.listview_settings["Item"] || {};

frappe.listview_settings["Item"].onload = function (listview) {
	listview.page.add_inner_button(__("UOM Calculator"), function () {
		frappe.slbasics.open_uom_calculator();
	});
};
