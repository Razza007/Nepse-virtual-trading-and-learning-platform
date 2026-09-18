<?php
/**
 * Firebase Auth Synchronization Endpoint
 * Syncs client-side Firebase authenticated user with local MySQL `users` table
 */

require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/db.php';

$input = getJsonInput();
$uid = trim($input['firebase_uid'] ?? '');
$email = trim($input['email'] ?? '');
$name = trim($input['name'] ?? '');
$token = trim($input['token'] ?? '');

if (empty($uid) || empty($email)) {
    jsonResponse(['success' => false, 'message' => 'Firebase UID and email are required.'], 400);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    jsonResponse(['success' => false, 'message' => 'Invalid email address provided.'], 422);
}

if (empty($name)) {
    // Default name from email if not provided
    $parts = explode('@', $email);
    $name = ucwords(str_replace(['.', '_', '-'], ' ', $parts[0]));
}

// Optional Firebase Token Verification via Identity Toolkit
if (!empty($token)) {
    $firebaseApiKey = 'AIzaSyBiZwAIUHVLOZEJRfBFAJsesPMzHgOImng';
    $ch = curl_init('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' . $firebaseApiKey);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode(['idToken' => $token]),
        CURLOPT_TIMEOUT => 5,
        CURLOPT_SSL_VERIFYPEER => false
    ]);
    $res = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($status === 200 && $res) {
        $fbData = json_decode($res, true);
        $verifiedUser = $fbData['users'][0] ?? null;
        if ($verifiedUser && !empty($verifiedUser['localId'])) {
            $uid = $verifiedUser['localId'];
            if (!empty($verifiedUser['email'])) {
                $email = $verifiedUser['email'];
            }
            if (!empty($verifiedUser['displayName']) && empty($name)) {
                $name = $verifiedUser['displayName'];
            }
        }
    }
}

// Require email verification
$isEmailVerified = !empty($input['email_verified']);
if (isset($verifiedUser)) {
    $isEmailVerified = !empty($verifiedUser['emailVerified']);
}

if (!$isEmailVerified) {
    jsonResponse([
        'success' => false,
        'email_verified' => false,
        'message' => 'Your email address is not verified yet. Please check your inbox and verify your email before logging in.'
    ], 403);
}

try {
    // Check if user already exists by firebase_uid or email
    $stmt = $pdo->prepare("SELECT * FROM users WHERE firebase_uid = :uid OR email = :email LIMIT 1");
    $stmt->execute([':uid' => $uid, ':email' => $email]);
    $user = $stmt->fetch();

    if ($user) {
        $fullName = (!empty($name) && (empty($user['full_name']) || $user['full_name'] === 'Trader')) ? $name : ($user['full_name'] ?: $name);
        $updateStmt = $pdo->prepare("
            UPDATE users 
            SET firebase_uid = :uid,
                full_name = :full_name,
                email_verified = 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :id
        ");
        $updateStmt->execute([
            ':uid' => $uid,
            ':full_name' => $fullName,
            ':id' => $user['id']
        ]);

        // Re-fetch fresh data
        $stmt = $pdo->prepare("SELECT id, firebase_uid, full_name, email, role, virtual_balance, bio, avatar, created_at FROM users WHERE id = :id");
        $stmt->execute([':id' => $user['id']]);
        $user = $stmt->fetch();
    } else {
        // Create new user with starting virtual balance of Rs. 1,000,000.00
        $insertStmt = $pdo->prepare("
            INSERT INTO users (firebase_uid, full_name, email, email_verified, password_hash, role, virtual_balance)
            VALUES (:uid, :name, :email, 1, :pwd, 'trader', 1000000.00)
        ");
        $insertStmt->execute([
            ':uid' => $uid,
            ':name' => $name,
            ':email' => $email,
            ':pwd' => password_hash('firebase:' . $uid, PASSWORD_DEFAULT)
        ]);

        $newId = (int)$pdo->lastInsertId();
        $stmt = $pdo->prepare("SELECT id, firebase_uid, full_name, email, role, virtual_balance, bio, avatar, created_at FROM users WHERE id = :id");
        $stmt->execute([':id' => $newId]);
        $user = $stmt->fetch();
    }

    // Set PHP Session
    $_SESSION['user_id'] = (int)$user['id'];
    $_SESSION['user_email'] = $user['email'];
    $_SESSION['user_name'] = $user['full_name'];

    jsonResponse([
        'success' => true,
        'message' => 'Logged in and synchronized with MySQL successfully.',
        'user' => [
            'id' => (int)$user['id'],
            'firebase_uid' => $user['firebase_uid'],
            'full_name' => $user['full_name'],
            'email' => $user['email'],
            'role' => $user['role'],
            'virtual_balance' => (float)$user['virtual_balance'],
            'avatar' => $user['avatar'] ?? 'default_avatar.png'
        ]
    ]);

} catch (PDOException $e) {
    jsonResponse(['success' => false, 'message' => 'Database error: ' . $e->getMessage()], 500);
}
