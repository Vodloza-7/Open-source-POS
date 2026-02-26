<?php
// filepath: c:\Users\IMPARTIAL\Desktop\open-pos impartial\Open-source-POS\public\pages\login.php
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_once(__DIR__ . '/../../config/database.php');
    $username = trim($_POST['username'] ?? '');
    $password = $_POST['password'] ?? '';

    $stmt = $pdo->prepare('SELECT id, username, password_hash FROM users WHERE username = ? LIMIT 1');
    $stmt->execute([$username]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user && password_verify($password, $user['password_hash'])) {
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['user_name'] = $user['username'];
        header('Location: /');
        exit;
    } else {
        $error = "Invalid username or password.";
    }
}
?>
<h2>Login</h2>
<form method="post">
    <input name="username" placeholder="Username" required>
    <input name="password" type="password" placeholder="Password" required>
    <button type="submit">Login</button>
    <?php if (!empty($error)) echo "<p style='color:red;'>$error</p>"; ?>
</form>