<?php
// filepath: c:\Users\IMPARTIAL\Desktop\open-pos impartial\Open-source-POS\public\pages\logout.php
session_unset();
session_destroy();
header('Location: /?page=login');
exit;