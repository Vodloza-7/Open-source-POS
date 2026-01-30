<?php
session_start();
require_once(__DIR__ . '/../config/database.php');

// Set user info in session for demo
if (!isset($_SESSION['user_id'])) {
    $_SESSION['user_id'] = 1;
    $_SESSION['user_name'] = 'Admin User';
    $_SESSION['user_role'] = 'admin';
}

// Set error reporting
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Simple routing
$page = $_GET['page'] ?? 'pos';
$validPages = ['pos', 'products', 'settings', 'admin', 'sales-history', 'login'];

// Check if user is logged in (except for login page)
if ($page !== 'login' && !isset($_SESSION['user_id'])) {
    header('Location: /?page=login');
    exit;
}

?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Impartial Enterprises POS</title>
    <link rel="stylesheet" href="/css/style.css">
    <link rel="stylesheet" href="/css/pos.css">
</head>
<body>
    <div id="app">
        <?php
        $pageFile = __DIR__ . "/pages/{$page}.html";
        if (file_exists($pageFile)) {
            include $pageFile;
        } else {
            echo "<h1>Page not found</h1>";
        }
        ?>
    </div>

    <script src="/js/app.js"></script>
</body>
</html>
