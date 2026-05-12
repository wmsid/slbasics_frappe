
frappe.ui.keys.add_shortcut({
    shortcut: "ctrl+q",
    action: () => {
        $("#navbar-modal-search").click();
        e.preventDefault();
        return false;
    },
    description: "Open Search",
    ignore_inputs: true,
    page: null
});