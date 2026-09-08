/**
 * Dynamic Component Loader & Theme Manager
 * Injects shared header, footer, and trading modal into pure HTML pages
 * Supports Light & Dark Theme Toggle with persistent LocalStorage
 */

// Initialize Theme immediately to Light by default
(function() {
    const savedTheme = localStorage.getItem('nepse_theme_v2') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
})();

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('nepse_theme_v2', newTheme);
    updateThemeIcon(newTheme);
    if (typeof showToast === 'function') {
        showToast(`Switched to ${newTheme === 'light' ? 'Light' : 'Dark'} Mode`, 'success');
    }
}

function updateThemeIcon(theme) {
    const btn = document.getElementById('themeToggleBtn');
    const icon = document.getElementById('themeToggleIcon');
    const label = document.getElementById('themeToggleLabel');
    if (theme === 'dark') {
        if (icon) icon.innerText = '☀️';
        if (label) label.innerText = 'Light Mode';
        if (btn) btn.title = 'Switch to Light Mode';
    } else {
        if (icon) icon.innerText = '🌙';
        if (label) label.innerText = 'Dark Mode';
        if (btn) btn.title = 'Switch to Dark Mode';
    }
}

async function injectComponent(targetSelector, componentPath) {
    const el = document.querySelector(targetSelector);
    if (!el) return;

    try {
        const res = await fetch(componentPath);
        if (res.ok) {
            el.innerHTML = await res.text();
        }
    } catch (err) {
        console.error('Failed to load component:', componentPath, err);
    }
}

async function initializeLayout() {
    const v = Date.now();
    // 1. Inject Header
    await injectComponent('#site-header', 'components/header.html?v=' + v);

    // 2. Inject Footer
    await injectComponent('#site-footer', 'components/footer.html?v=' + v);

    // 3. Inject Trading Modal if container exists
    await injectComponent('#site-trading-modal', 'components/trading_modal.html?v=' + v);

    // 4. Update Theme Button Icon
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    updateThemeIcon(currentTheme);

    // 5. Highlight active navigation link
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-link').forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPath) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    // 6. Initialize Auth state & Ticker from auth.js
    if (typeof checkAuthState === 'function') {
        checkAuthState();
    }
    if (typeof loadTicker === 'function') {
        loadTicker();
    }
}

// Auto-run once DOM is ready
document.addEventListener('DOMContentLoaded', initializeLayout);
