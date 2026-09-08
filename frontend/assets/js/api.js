/**
 * Central REST API Client & Utilities
 * Connects decoupled frontend to PHP Backend APIs
 */

const API_BASE = 'http://localhost/Nepse-virtual-trading/backend/api';

const API = {
    async get(endpoint, params = {}) {
        let url = API_BASE + endpoint;
        const query = new URLSearchParams(params).toString();
        if (query) url += '?' + query;

        try {
            const res = await fetch(url, {
                method: 'GET',
                credentials: 'include' // Sends session cookies
            });
            return await res.json();
        } catch (err) {
            console.error('API GET Error:', err);
            return { success: false, message: 'Network error connecting to backend API.' };
        }
    },

    async post(endpoint, data = {}) {
        const url = API_BASE + endpoint;

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(data)
            });
            return await res.json();
        } catch (err) {
            console.error('API POST Error:', err);
            return { success: false, message: 'Network error connecting to backend API.' };
        }
    }
};

// Nepalese Currency Formatter
function formatNPR(num) {
    if (isNaN(num)) return 'Rs. 0.00';
    const isNeg = num < 0;
    num = Math.abs(num).toFixed(2);

    let parts = num.split('.');
    let integerPart = parts[0];
    let decimalPart = '.' + parts[1];

    if (integerPart.length > 3) {
        let lastThree = integerPart.substring(integerPart.length - 3);
        let others = integerPart.substring(0, integerPart.length - 3);
        others = others.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
        integerPart = others + ',' + lastThree;
    }

    return (isNeg ? '-Rs. ' : 'Rs. ') + integerPart + decimalPart;
}

// Toast Notifications
function showToast(message, type = 'success') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.style.position = 'fixed';
        container.style.bottom = '24px';
        container.style.right = '24px';
        container.style.zIndex = '99999';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '8px';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.padding = '12px 18px';
    toast.style.borderRadius = '8px';
    toast.style.fontSize = '0.9rem';
    toast.style.fontWeight = '600';
    toast.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
    toast.style.transition = 'all 0.3s ease';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '8px';

    if (type === 'success') {
        toast.style.background = '#10b981';
        toast.style.color = '#052e16';
        toast.innerHTML = '✓ ' + message;
    } else {
        toast.style.background = '#ef4444';
        toast.style.color = '#ffffff';
        toast.innerHTML = '⚠️ ' + message;
    }

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}
