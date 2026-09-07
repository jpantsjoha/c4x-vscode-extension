// C4X Markdown Preview Script
// Enables click-to-zoom functionality for diagrams in VS Code's Markdown preview.
// Injected via the markdown.previewScripts contribution point.

(function () {
    // Note: acquireVsCodeApi() is available in the Markdown preview webview
    // but we don't currently need it for lightbox functionality.
    // Avoid calling it eagerly to prevent conflicts with other extensions
    // that also contribute preview scripts (acquireVsCodeApi can only be called once).

    // Delegate click events on the document
    document.addEventListener('click', (event) => {
        const target = event.target;

        // Check if we clicked inside a zoomable C4X diagram
        const diagram = target.closest('.c4x-diagram.zoomable');
        if (!diagram) return;

        // Toggle lightbox mode
        if (diagram.classList.contains('lightbox')) {
            diagram.classList.remove('lightbox');
            // Remove backdrop if it exists
            const backdrop = document.querySelector('.c4x-lightbox-backdrop');
            if (backdrop) backdrop.remove();
        } else {
            // Close any other open lightboxes first
            document.querySelectorAll('.c4x-diagram.lightbox').forEach(el => {
                el.classList.remove('lightbox');
            });
            const existingBackdrop = document.querySelector('.c4x-lightbox-backdrop');
            if (existingBackdrop) existingBackdrop.remove();

            // Open this one
            diagram.classList.add('lightbox');

            // Create backdrop
            const backdrop = document.createElement('div');
            backdrop.className = 'c4x-lightbox-backdrop';
            backdrop.addEventListener('click', () => {
                diagram.classList.remove('lightbox');
                backdrop.remove();
            });
            document.body.appendChild(backdrop);
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            document.querySelectorAll('.c4x-diagram.lightbox').forEach(el => {
                el.classList.remove('lightbox');
            });
            const backdrop = document.querySelector('.c4x-lightbox-backdrop');
            if (backdrop) backdrop.remove();
        }
    });
}());
