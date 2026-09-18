import { auth } from "./firebase-config.js";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendEmailVerification,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

function getSyncApiUrl() {
    const origin = window.location.origin;
    const path = window.location.pathname;
    const frontendIndex = path.indexOf('/frontend');
    if (frontendIndex !== -1) {
        return `${origin}${path.substring(0, frontendIndex)}/backend/api/auth/sync.php`;
    }
    return '../backend/api/auth/sync.php';
}

const SYNC_API_URL = getSyncApiUrl();

let lastRegisteredEmail = "";
let lastRegisteredPassword = "";
let pendingUnverifiedEmail = "";
let pendingUnverifiedPassword = "";

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[m]));
}

function message(elementId, text, type = "error") {
    const element = document.getElementById(elementId);
    if (!element) return;
    element.textContent = text;
    element.className = `auth-message ${type}`;
}

function firebaseError(error) {
    const errors = {
        "auth/email-already-in-use": "This email is already registered. Please sign in instead.",
        "auth/invalid-email": "Please enter a valid email address.",
        "auth/invalid-credential": "Incorrect email or password.",
        "auth/wrong-password": "Incorrect password.",
        "auth/user-not-found": "No account found with this email.",
        "auth/weak-password": "Password must be at least 6 characters.",
        "auth/operation-not-allowed": "Email/Password sign-in is not enabled in Firebase.",
        "auth/unauthorized-domain": "Add localhost under Firebase Authentication authorized domains.",
        "auth/popup-blocked": "Popup was blocked by your browser. Please allow popups for localhost.",
        "auth/popup-closed-by-user": "Google sign-in was cancelled.",
        "auth/too-many-requests": "Too many requests. Please wait a moment and try again."
    };
    return errors[error.code] || error.message || "Authentication error. Please try again.";
}

/**
 * Synchronize Firebase Authenticated User into Local MySQL Database
 * Only called after user.emailVerified === true!
 */
async function syncUserWithMySQL(user, name) {
    const token = await user.getIdToken();
    const response = await fetch(SYNC_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
            firebase_uid: user.uid,
            email: user.email,
            email_verified: user.emailVerified ? 1 : 0,
            name: name || user.displayName || "",
            token: token
        })
    });

    const body = await response.text();
    let result;
    try {
        result = JSON.parse(body);
    } catch (e) {
        throw new Error(`MySQL Sync failed (HTTP ${response.status}). Ensure Apache and MySQL (port 3307) are running.`);
    }

    if (!response.ok || !result.success) {
        throw new Error(result.message || "Could not sync user with MySQL database.");
    }

    // Persist authenticated state in localStorage
    if (result.user) {
        localStorage.setItem('nepse_user', JSON.stringify(result.user));
    }
    return result;
}

// ----------------------------------------------------
// Registration Form Handler (Sends Verification Link & Blocks Direct Login)
// ----------------------------------------------------
const registerForm = document.getElementById("registerForm");
registerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = registerForm.querySelector("button[type='submit']");
    const name = document.getElementById("registerName").value.trim();
    const email = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value;

    if (!name || password.length < 6) {
        message("registerMessage", "Enter your name and a password of at least 6 characters.");
        return;
    }

    button.disabled = true;
    message("registerMessage", "Creating your account and sending verification email...", "success");

    try {
        // 1. Create account in Firebase
        const credentials = await createUserWithEmailAndPassword(auth, email, password);

        // 2. Send real verification email via Firebase
        await sendEmailVerification(credentials.user);

        // 3. Immediately sign out so user cannot browse unverified
        await signOut(auth);
        localStorage.removeItem('nepse_user');

        // Save for resend button
        lastRegisteredEmail = email;
        lastRegisteredPassword = password;

        // 4. Switch UI to the "Check Your Gmail" card
        const verificationCard = document.getElementById("verificationSentCard");
        const registerFormSection = document.getElementById("registerFormSection");
        const sentEmailSpan = document.getElementById("sentEmailAddress");

        if (verificationCard && registerFormSection) {
            if (sentEmailSpan) sentEmailSpan.textContent = email;
            registerFormSection.style.display = "none";
            verificationCard.style.display = "block";
        } else {
            message("registerMessage", `Verification email sent to ${email}! Please check your Gmail and verify before logging in.`, "success");
            setTimeout(() => {
                window.location.href = `login.html?verify_sent=1&email=${encodeURIComponent(email)}`;
            }, 3000);
        }
    } catch (error) {
        message("registerMessage", error.message.startsWith("MySQL") ? error.message : firebaseError(error));
        button.disabled = false;
    }
});

// Resend button on Registration page
document.getElementById("btnResendFromRegister")?.addEventListener("click", async () => {
    const btn = document.getElementById("btnResendFromRegister");
    const msgEl = document.getElementById("resendMessage");
    if (!lastRegisteredEmail || !lastRegisteredPassword) {
        if (msgEl) {
            msgEl.textContent = "Please go to the Sign In page to request a new link.";
            msgEl.className = "auth-message error";
        }
        return;
    }

    btn.disabled = true;
    btn.textContent = "Resending link...";
    try {
        const creds = await signInWithEmailAndPassword(auth, lastRegisteredEmail, lastRegisteredPassword);
        await sendEmailVerification(creds.user);
        await signOut(auth);
        if (msgEl) {
            msgEl.textContent = "✅ Verification link resent! Please check your Gmail inbox and spam folder.";
            msgEl.className = "auth-message success";
        }
        btn.textContent = "Link Resent!";
        setTimeout(() => {
            btn.disabled = false;
            btn.textContent = "Didn't get the email? Resend link";
        }, 12000);
    } catch (e) {
        if (msgEl) {
            msgEl.textContent = "Error resending link: " + firebaseError(e);
            msgEl.className = "auth-message error";
        }
        btn.disabled = false;
        btn.textContent = "Didn't get the email? Resend link";
    }
});

// ----------------------------------------------------
// Login Form Handler (Enforces emailVerified === true)
// ----------------------------------------------------
const loginForm = document.getElementById("loginForm");
loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = loginForm.querySelector("button[type='submit']");
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) {
        message("loginMessage", "Please enter both email and password.");
        return;
    }

    button.disabled = true;
    message("loginMessage", "Verifying credentials...", "success");

    try {
        const credentials = await signInWithEmailAndPassword(auth, email, password);

        // STRICT VERIFICATION CHECK: Disallow login if email is not verified!
        if (!credentials.user.emailVerified) {
            pendingUnverifiedEmail = email;
            pendingUnverifiedPassword = password;

            // Automatically send the verification email right now!
            let sendStatusMessage = "A verification email has just been sent to your Gmail.";
            try {
                await sendEmailVerification(credentials.user);
                sendStatusMessage = `A verification link has just been sent to <strong>${escapeHtml(email)}</strong>.`;
            } catch (err) {
                if (err.code === "auth/too-many-requests") {
                    sendStatusMessage = "A verification link was already sent recently. Please check your inbox or wait a moment.";
                } else {
                    console.warn("Verification email send error:", err);
                    sendStatusMessage = `Please check your Gmail inbox for the verification email. (${firebaseError(err)})`;
                }
            }

            // Immediately sign out to reject unverified session
            await signOut(auth);
            localStorage.removeItem('nepse_user');

            const msgEl = document.getElementById("loginMessage");
            if (msgEl) {
                msgEl.className = "auth-message error";
                msgEl.innerHTML = `
                    <div style="font-weight: 800; font-size: 0.95rem; margin-bottom: 6px;">⚠️ Email Not Verified</div>
                    <div style="font-size: 0.86rem; line-height: 1.5; margin-bottom: 10px; color: var(--text-secondary);">
                        ${sendStatusMessage}
                    </div>
                    <div style="background: var(--bg-surface); padding: 10px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); font-size: 0.8rem; color: var(--text-primary); margin-bottom: 12px; text-align: left;">
                        <strong>📁 Can't find the email?</strong><br>
                        1. Open Gmail and search for <em>nepse-virtual-trading</em>.<br>
                        2. Check your <strong>Spam / Junk</strong> folder or <strong>Promotions</strong> tab.<br>
                        3. Click the link to verify, then come back here to sign in!
                    </div>
                    <button type="button" class="btn btn-outline btn-sm" id="btnLoginResendVerification" style="width: 100%; font-size: 0.8rem; padding: 8px 12px;">
                        📩 Click to Resend Verification Email
                    </button>
                    <div id="loginResendNotice" style="margin-top: 8px; font-size: 0.8rem;"></div>
                `;

                document.getElementById("btnLoginResendVerification")?.addEventListener("click", async () => {
                    const resendBtn = document.getElementById("btnLoginResendVerification");
                    const notice = document.getElementById("loginResendNotice");
                    if (!pendingUnverifiedEmail || !pendingUnverifiedPassword) return;

                    resendBtn.disabled = true;
                    resendBtn.textContent = "Sending verification email...";
                    try {
                        const tempCreds = await signInWithEmailAndPassword(auth, pendingUnverifiedEmail, pendingUnverifiedPassword);
                        await sendEmailVerification(tempCreds.user);
                        await signOut(auth);
                        if (notice) {
                            notice.style.color = "var(--profit-green)";
                            notice.textContent = "✅ Verification email resent! Please check your Gmail (and spam folder).";
                        }
                        resendBtn.textContent = "Email Sent!";
                        setTimeout(() => {
                            resendBtn.disabled = false;
                            resendBtn.textContent = "Resend Verification Link";
                        }, 12000);
                    } catch (err) {
                        if (notice) {
                            notice.style.color = "var(--loss-red)";
                            notice.textContent = "Failed to resend: " + firebaseError(err);
                        }
                        resendBtn.disabled = false;
                        resendBtn.textContent = "Retry Resend";
                    }
                });
            }

            button.disabled = false;
            return;
        }

        // Email IS verified! Proceed to sync with local MySQL
        message("loginMessage", "Email verified! Initializing your trading session...", "success");
        await syncUserWithMySQL(credentials.user, credentials.user.displayName || "");
        message("loginMessage", "Signed in successfully! Redirecting...", "success");
        setTimeout(() => {
            window.location.href = "market.html";
        }, 800);

    } catch (error) {
        message("loginMessage", error.message.startsWith("MySQL") ? error.message : firebaseError(error));
        button.disabled = false;
    }
});

// ----------------------------------------------------
// Google Sign-In Handler (Google accounts are automatically verified)
// ----------------------------------------------------
async function loginWithGoogle(messageId, buttonId) {
    const button = document.getElementById(buttonId);
    if (button) button.disabled = true;
    message(messageId, "Opening Google Sign-In...", "success");

    try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        const credentials = await signInWithPopup(auth, provider);

        message(messageId, "Syncing Google account with MySQL...", "success");
        await syncUserWithMySQL(credentials.user, credentials.user.displayName || "Google Trader");
        message(messageId, "Success! Redirecting to Terminal...", "success");
        setTimeout(() => {
            window.location.href = "market.html";
        }, 800);
    } catch (error) {
        if (error.code === "auth/popup-closed-by-user") {
            message(messageId, "Google sign-in was cancelled.");
        } else {
            message(messageId, firebaseError(error));
        }
        if (button) button.disabled = false;
    }
}

document.getElementById("googleLoginButton")?.addEventListener("click", () => {
    loginWithGoogle("loginMessage", "googleLoginButton");
});

document.getElementById("googleRegisterButton")?.addEventListener("click", () => {
    loginWithGoogle("registerMessage", "googleRegisterButton");
});

// Check URL search parameters on page load (e.g. redirected from register)
document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("verify_sent") === "1") {
        const email = urlParams.get("email") || "your email";
        message("loginMessage", `A verification link has been sent to ${email}. Please check your Gmail and verify before signing in.`, "success");
    } else if (urlParams.get("verified") === "1") {
        message("loginMessage", "Email verified successfully! Please sign in with your password.", "success");
    }
});

// Expose clean Firebase Sign Out globally
window.firebaseLogout = async () => {
    try {
        await signOut(auth);
    } catch (e) {
        console.warn('Firebase signOut error:', e);
    }
};

