<?php
// filepath: c:\Users\IMPARTIAL\Desktop\open-pos impartial\Open-source-POS\public\index.php
session_start();
require_once(__DIR__ . '/../config/database.php');

// Set error reporting
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Simple routing
$page = $_GET['page'] ?? 'pos';
$validPages = ['pos', 'products', 'settings', 'admin', 'sales-history', 'login', 'logout'];

// Check if user is logged in (except for login and logout pages)
if (!in_array($page, ['login', 'logout']) && !isset($_SESSION['user_id'])) {
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
        $pageFilePhp = __DIR__ . "/pages/{$page}.php";
        $pageFileHtml = __DIR__ . "/pages/{$page}.html";
        if (file_exists($pageFilePhp)) {
            include $pageFilePhp;
        } elseif (file_exists($pageFileHtml)) {
            include $pageFileHtml;
        } else {
            echo "<h1>Page not found</h1>";
        }
        ?>
    </div>
    <script src="/js/app.js"></script>
</body>
</html>