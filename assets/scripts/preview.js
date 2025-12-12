// C4X Markdown Preview Script
// Enables click-to-zoom functionality for diagrams

(function () {
    const vscode = acquireVsCodeApi();

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
