<?php
include_once '../includes/db.php';

header('Content-Type: application/json');

$query = "SELECT id, name, code, price, quantity, category 
          FROM products 
          WHERE quantity > 0 
          ORDER BY name ASC";

$result = mysqli_query($conn, $query);

$products = [];
while ($row = mysqli_fetch_assoc($result)) {
    $products[] = $row;
}

echo json_encode($products);
?>
