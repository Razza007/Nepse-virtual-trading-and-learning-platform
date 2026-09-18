/**
 * Global User Session & Navbar State Manager
 */

let currentUser = null;

function getStoredUser() {
    try {
        const raw = localStorage.getItem('nepse_user');
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function setStoredUser(user) {
    if (user) {
        localStorage.setItem('nepse_user', JSON.stringify(user));
    } else {
        localStorage.removeItem('nepse_user');
    }
}

function getLoggedInUser() {
    return currentUser || getStoredUser();
}

/**
 * Check authentication status with backend and update header UI
 */
async function checkAuthState() {
    const cached = getStoredUser();
    if (cached) {
        currentUser = cached;
        renderNavUser(cached);
    } else {
        renderNavGuest();
    }

    // Ping backend for fresh live balance and session sync
    const params = {};
    if (cached) {
        if (cached.id) params.user_id = cached.id;
        if (cached.firebase_uid) params.firebase_uid = cached.firebase_uid;
        if (cached.email) params.email = cached.email;
    }

    try {
        const res = await API.get('/auth/me.php', params);
        if (res && res.authenticated && res.user) {
            currentUser = res.user;
            setStoredUser(res.user);
            renderNavUser(res.user);
        } else if (res && !res.authenticated) {
            // Only force logout if we didn't have a valid cached user
            if (!cached) {
                currentUser = null;
                setStoredUser(null);
                renderNavGuest();
            } else {
                // Keep the cached user so user is not logged out randomly
                renderNavUser(cached);
            }
        }
    } catch (e) {
        console.warn('Auth ping warning:', e);
        if (cached) {
            renderNavUser(cached);
        }
    }
}

/**
 * Render Authenticated User Navigation Items
 */
function renderNavUser(user) {
    const authSection = document.getElementById('authNavSection');
    const dynamicLinks = document.getElementById('dynamicNavLinks');

    if (dynamicLinks) {
        dynamicLinks.innerHTML = `
            <li><a href="portfolio.html" class="nav-link" data-page="portfolio">My Portfolio</a></li>
            <li><a href="history.html" class="nav-link" data-page="history">Trade History</a></li>
            ${user.role === 'instructor' ? `<li><a href="trainer.html" class="nav-link" data-page="trainer" style="font-weight: 800;">👨‍🏫 Trainer Studio</a></li>` : ''}
            ${user.role === 'admin' ? `<li><a href="admin.html" class="nav-link" data-page="admin" style="font-weight: 800;">🛡️ Admin Portal</a></li>` : ''}
        `;
    }

    if (authSection) {
        const balance = formatNPR(user.virtual_balance || 0);
        authSection.innerHTML = `
            <div class="user-wallet-badge" title="Available Virtual Cash: ${balance}">
                <span>💰</span>
                <span class="user-cash" id="navUserBalance">${balance}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-weight: 700; font-size: 0.88rem; color: var(--text-primary);">👤 ${escapeHtml(user.full_name || 'Trader')}</span>
                <button type="button" onclick="handleLogout()" class="btn btn-outline btn-sm" style="padding: 6px 12px; font-size: 0.78rem;">
                    Sign Out
                </button>
            </div>
        `;
    }

    // Re-highlight active link smoothly
    if (typeof highlightActiveNav === 'function') {
        highlightActiveNav(window.location.href);
    } else {
        const currentPath = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
        document.querySelectorAll('.nav-link').forEach(link => {
            const href = (link.getAttribute('href') || '').toLowerCase();
            if (href === currentPath) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    // Update homepage hero buttons if on index.html
    updateHomeHero(user);
}

/**
 * Render Guest Navigation Items
 */
function renderNavGuest() {
    const authSection = document.getElementById('authNavSection');
    const dynamicLinks = document.getElementById('dynamicNavLinks');

    if (dynamicLinks) {
        dynamicLinks.innerHTML = '';
    }

    if (authSection) {
        authSection.innerHTML = `
            <a href="login.html" class="btn btn-outline btn-sm">Sign In</a>
            <a href="register.html" class="btn btn-primary btn-sm">Start with Rs. 10 Lakhs</a>
        `;
    }

    updateHomeHero(null);
}

/**
 * Update Home Page Hero Buttons dynamically
 */
function updateHomeHero(user) {
    const heroCta = document.getElementById('heroCtaContainer');
    if (!heroCta) return;

    if (user) {
        heroCta.innerHTML = `
            <a href="market.html" class="btn btn-primary" style="padding: 14px 28px; font-size: 0.95rem;">
                🚀 Trade in Market Terminal
            </a>
            <a href="portfolio.html" class="btn btn-outline" style="padding: 14px 28px; font-size: 0.95rem;">
                💼 View My Portfolio (${formatNPR(user.virtual_balance)})
            </a>
        `;
    } else {
        heroCta.innerHTML = `
            <a href="register.html" class="btn btn-primary" style="padding: 14px 28px; font-size: 0.95rem;">
                🚀 Claim Your Rs. 10 Lakhs Portfolio
            </a>
            <a href="market.html" class="btn btn-outline" style="padding: 14px 28px; font-size: 0.95rem;">
                Open Live Terminal
            </a>
        `;
    }
}

/**
 * Global Logout Action
 */
async function handleLogout() {
    try {
        if (typeof window.firebaseLogout === 'function') {
            await window.firebaseLogout();
        }
        await API.post('/auth/logout.php', {});
    } catch (e) {
        console.warn('Logout API error:', e);
    }
    currentUser = null;
    setStoredUser(null);
    localStorage.removeItem('nepse_user');
    sessionStorage.clear();

    if (typeof showToast === 'function') {
        showToast('You have signed out successfully.', 'success');
    }
    setTimeout(() => {
        window.location.href = 'login.html';
    }, 400);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// Check auth state when document is loaded
document.addEventListener('DOMContentLoaded', () => {
    checkAuthState();
});
