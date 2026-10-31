// Help dialog (Views/Shared/_HelpDialog.cshtml) of the "?" buttons: the client ID to provision in ACC, and links
(() => {
    const dialog = document.getElementById('help-dialog');
    const input = document.getElementById('help-client-id');
    const copy = document.getElementById('help-copy');

    document.querySelectorAll('[data-help-open]').forEach((button) => {
        button.addEventListener('click', () => dialog.showModal());
    });
    dialog.querySelector('.help-close').addEventListener('click', () => dialog.close());
    // A click on the backdrop lands on the dialog itself, outside its box
    dialog.addEventListener('click', (ev) => {
        const box = dialog.getBoundingClientRect();
        const inside = ev.clientX >= box.left && ev.clientX <= box.right && ev.clientY >= box.top && ev.clientY <= box.bottom;
        if (ev.target === dialog && !inside) {
            dialog.close();
        }
    });
    copy.addEventListener('click', async () => {
        await navigator.clipboard.writeText(input.value);
        copy.textContent = 'Copied';
        setTimeout(() => copy.textContent = 'Copy', 1500);
    });
})();
