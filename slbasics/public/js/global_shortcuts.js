
frappe.ui.keys.add_shortcut({
    shortcut: "ctrl+0",
    action: (e) => {
        $("#navbar-modal-search").click();
        e.preventDefault();
        return false;
    },
    description: "Open Search",
    ignore_inputs: true,
    page: null
});