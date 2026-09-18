<?php
/**
 * Current Authenticated User Endpoint
 */

require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/db.php';

$userId = getAuthUserId();
$firebaseUid = trim($_GET['firebase_uid'] ?? '');
$paramUserId = (int)($_GET['user_id'] ?? 0);
$paramEmail = trim($_GET['email'] ?? '');

$user = null;

try {
    // 1. If explicit firebase_uid provided from client, resolve by UID
    if (!empty($firebaseUid)) {
        $stmt = $pdo->prepare("SELECT id, firebase_uid, full_name, email, role, virtual_balance, bio, avatar, created_at FROM users WHERE firebase_uid = :uid LIMIT 1");
        $stmt->execute([':uid' => $firebaseUid]);
        $user = $stmt->fetch();
    }

    // 2. If explicit email provided from client, resolve by email
    if (!$user && !empty($paramEmail)) {
        $stmt = $pdo->prepare("SELECT id, firebase_uid, full_name, email, role, virtual_balance, bio, avatar, created_at FROM users WHERE email = :email LIMIT 1");
        $stmt->execute([':email' => $paramEmail]);
        $user = $stmt->fetch();
    }

    // 3. Fallback to active session user_id
    if (!$user && $userId) {
        $stmt = $pdo->prepare("SELECT id, firebase_uid, full_name, email, role, virtual_balance, bio, avatar, created_at FROM users WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $userId]);
        $user = $stmt->fetch();
    }

    // 4. Fallback to param user_id
    if (!$user && $paramUserId > 0) {
        $stmt = $pdo->prepare("SELECT id, firebase_uid, full_name, email, role, virtual_balance, bio, avatar, created_at FROM users WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $paramUserId]);
        $user = $stmt->fetch();
    }

    if ($user) {
        // Re-establish session
        $_SESSION['user_id'] = (int)$user['id'];
        $_SESSION['user_email'] = $user['email'];
        $_SESSION['user_name'] = $user['full_name'];

        jsonResponse([
            'authenticated' => true,
            'user' => [
                'id' => (int)$user['id'],
                'firebase_uid' => $user['firebase_uid'],
                'full_name' => $user['full_name'],
                'email' => $user['email'],
                'role' => $user['role'],
                'virtual_balance' => (float)$user['virtual_balance'],
                'avatar' => $user['avatar'] ?? 'default_avatar.png',
                'created_at' => $user['created_at']
            ]
        ]);
    } else {
        jsonResponse([
            'authenticated' => false,
            'user' => null
        ], 200);
    }

} catch (PDOException $e) {
    jsonResponse(['authenticated' => false, 'error' => $e->getMessage()], 500);
}
