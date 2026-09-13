/*
 * Admin panel behaviour: delete confirmation, slug suggestions and
 * drag-and-drop reordering.
 *
 * Everything here is an enhancement. The up/down buttons, the visibility
 * toggle and every form work without JavaScript, so the admin stays usable if
 * this file fails to load.
 */
(function () {
    'use strict';

    // -- Confirm destructive submissions ------------------------------------
    document.addEventListener('submit', function (event) {
        var message = event.target.getAttribute('data-confirm');
        if (message && !window.confirm(message)) event.preventDefault();
    });

    // -- Suggest a slug from its source field -------------------------------
    // Only while creating, and only until the editor types their own slug:
    // silently rewriting a saved slug would break existing links.
    var slugInput = document.querySelector('[data-slug-from]');
    if (slugInput && !slugInput.value) {
        var source = document.getElementById('field-' + slugInput.getAttribute('data-slug-from'));
        var edited = false;

        slugInput.addEventListener('input', function () { edited = true; });

        if (source) {
            source.addEventListener('input', function () {
                if (edited) return;
                slugInput.value = source.value
                    .toLowerCase()
                    .normalize('NFKD')
                    .replace(/[̀-ͯ]/g, '')
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '');
            });
        }
    }

    // -- Drag-and-drop reordering -------------------------------------------
    var table = document.querySelector('.admin-table[data-reorder-url]');
    if (!table) return;

    var tbody = table.querySelector('tbody');
    var dragged = null;

    tbody.querySelectorAll('tr').forEach(function (row) {
        var handle = row.querySelector('.admin-table__handle');
        if (!handle) return;

        // Only the handle starts a drag, so text in the row stays selectable.
        handle.addEventListener('mousedown', function () { row.draggable = true; });
        row.addEventListener('dragend', function () { row.draggable = false; });

        row.addEventListener('dragstart', function (event) {
            dragged = row;
            row.classList.add('is-dragging');
            event.dataTransfer.effectAllowed = 'move';
            // Firefox needs data set for a drag to begin.
            event.dataTransfer.setData('text/plain', row.dataset.id);
        });

        row.addEventListener('dragover', function (event) {
            if (!dragged || dragged === row) return;
            event.preventDefault();

            var box = row.getBoundingClientRect();
            var below = event.clientY > box.top + box.height / 2;
            tbody.insertBefore(dragged, below ? row.nextSibling : row);
        });
    });

    tbody.addEventListener('drop', function (event) { event.preventDefault(); });

    tbody.addEventListener('dragend', function () {
        if (!dragged) return;
        dragged.classList.remove('is-dragging');
        dragged = null;
        persistOrder();
    });

    function persistOrder() {
        var ids = Array.prototype.map.call(tbody.querySelectorAll('tr'), function (row) {
            return Number(row.dataset.id);
        });

        fetch(table.dataset.reorderUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': table.dataset.csrf
            },
            body: JSON.stringify({ ids: ids })
        })
            .then(function (response) {
                if (!response.ok) throw new Error('Reorder failed');
                flash('Order saved.', 'success');
            })
            .catch(function () {
                flash('Could not save the new order. Reload and try again.', 'error');
            });
    }

    function flash(message, type) {
        var existing = document.querySelector('.admin-flash--transient');
        if (existing) existing.remove();

        var el = document.createElement('div');
        el.className = 'admin-flash admin-flash--' + type + ' admin-flash--transient';
        el.textContent = message;

        var main = document.querySelector('.admin-main');
        main.insertBefore(el, main.firstChild);
        window.setTimeout(function () { el.remove(); }, 2500);
    }
})();
